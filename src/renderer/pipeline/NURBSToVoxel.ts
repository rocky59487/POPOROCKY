/**
 * NURBSToVoxel.ts - NURBS 曲面 → 體素化反向管線
 *
 * 將 NURBS 曲面反離散化為體素，用於 Minecraft 匯出。
 *
 * 策略：
 *   1. 對每個 NURBS 曲面在 UV 參數空間取樣
 *   2. 產生密集的 3D 表面點集
 *   3. 使用 3D 掃描線填充產生實心體素
 *   4. 輸出 Voxel 陣列供 MinecraftExporter 使用
 *
 * 曲面取樣使用 Cox-de Boor 基函數評估（與 NURBSFitter 一致）。
 * 體素化使用表面殼 + flood fill 策略：
 *   - 先將表面點四捨五入到整數格點作為殼體素
 *   - 再用 BFS flood fill 填充內部
 */

import { Vec3, NURBSSurface, Voxel, DEFAULT_MATERIALS, VoxelMaterial } from '../store/useStore';
import eventBus from '../engines/EventBus';

// ═══════════════════════════════════════════════════════════════
//  Cox-de Boor 基函數（與 NURBSFitter.ts 一致）
// ═══════════════════════════════════════════════════════════════

function basisFunction(i: number, p: number, t: number, knots: number[]): number {
  if (p === 0) {
    if (i === knots.length - p - 2 && t === knots[knots.length - 1]) return 1.0;
    return (t >= knots[i] && t < knots[i + 1]) ? 1.0 : 0.0;
  }
  let result = 0;
  const d1 = knots[i + p] - knots[i];
  if (Math.abs(d1) > 1e-12) {
    result += ((t - knots[i]) / d1) * basisFunction(i, p - 1, t, knots);
  }
  const d2 = knots[i + p + 1] - knots[i + 1];
  if (Math.abs(d2) > 1e-12) {
    result += ((knots[i + p + 1] - t) / d2) * basisFunction(i + 1, p - 1, t, knots);
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════
//  NURBS 曲面評估
// ═══════════════════════════════════════════════════════════════

/**
 * 評估 NURBS 曲面在 (u, v) 參數處的 3D 座標
 *
 * S(u,v) = Σᵢ Σⱼ Nᵢ,p(u) · Nⱼ,q(v) · wᵢⱼ · Pᵢⱼ
 *          / Σᵢ Σⱼ Nᵢ,p(u) · Nⱼ,q(v) · wᵢⱼ
 */
function evaluateNURBS(surface: NURBSSurface, u: number, v: number): Vec3 {
  const nU = surface.controlPoints.length;
  const nV = surface.controlPoints[0]?.length || 0;
  const p = surface.degree;

  // 計算 U 方向基函數
  const Nu = new Float64Array(nU);
  for (let i = 0; i < nU; i++) {
    Nu[i] = basisFunction(i, p, u, surface.knotsU);
  }

  // 計算 V 方向基函數
  const Nv = new Float64Array(nV);
  for (let j = 0; j < nV; j++) {
    Nv[j] = basisFunction(j, p, v, surface.knotsV);
  }

  // 加權和
  let sumX = 0, sumY = 0, sumZ = 0, sumW = 0;

  for (let i = 0; i < nU; i++) {
    if (Nu[i] === 0) continue;
    for (let j = 0; j < nV; j++) {
      if (Nv[j] === 0) continue;
      const w = (surface.weights[i] && surface.weights[i][j]) || 1.0;
      const basis = Nu[i] * Nv[j] * w;
      const cp = surface.controlPoints[i][j];
      sumX += basis * cp.x;
      sumY += basis * cp.y;
      sumZ += basis * cp.z;
      sumW += basis;
    }
  }

  if (Math.abs(sumW) < 1e-12) {
    // Fallback: 回傳控制點中心
    let cx = 0, cy = 0, cz = 0, cnt = 0;
    for (const row of surface.controlPoints) {
      for (const pt of row) {
        cx += pt.x; cy += pt.y; cz += pt.z; cnt++;
      }
    }
    return { x: cx / cnt, y: cy / cnt, z: cz / cnt };
  }

  return { x: sumX / sumW, y: sumY / sumW, z: sumZ / sumW };
}

// ═══════════════════════════════════════════════════════════════
//  體素化演算法
// ═══════════════════════════════════════════════════════════════

export interface VoxelizeOptions {
  /** UV 取樣解析度（每方向點數，預設 64） */
  sampleResolution?: number;
  /** 是否填充實心內部（預設 true） */
  fillInterior?: boolean;
  /** 體素材質 ID（預設 'concrete'） */
  materialId?: string;
  /** 體素顏色（預設 '#888888'） */
  color?: string;
  /** 圖層 ID（預設 'default'） */
  layerId?: string;
  /** 進度回調 */
  onProgress?: (progress: number) => void;
}

/**
 * 將 NURBS 曲面集合轉換為體素
 *
 * 演算法：
 *   1. 對每個曲面，在 UV 空間均勻取樣 → 3D 表面點
 *   2. 將表面點四捨五入到整數格點 → 殼體素 set
 *   3. 若 fillInterior=true，使用 BFS flood fill 從外部開始，
 *      bounding box 內未被觸及的格點即為內部體素
 *   4. 合併所有體素，去重，輸出
 */
export function nurbsToVoxels(
  surfaces: NURBSSurface[],
  options: VoxelizeOptions = {},
): Voxel[] {
  const resolution = options.sampleResolution || 64;
  const fillInterior = options.fillInterior !== false;
  const materialId = options.materialId || 'concrete';
  const color = options.color || '#888888';
  const layerId = options.layerId || 'default';
  const onProgress = options.onProgress || (() => {});

  const shellSet = new Set<string>();

  // Step 1 & 2: 取樣表面點並建立殼體素
  const totalSurfaces = surfaces.length;
  for (let si = 0; si < totalSurfaces; si++) {
    const surface = surfaces[si];
    const nU = surface.controlPoints.length;
    const nV = surface.controlPoints[0]?.length || 0;
    if (nU === 0 || nV === 0) continue;

    // 根據控制點數量自適應取樣密度
    const samplesU = Math.max(resolution, nU * 4);
    const samplesV = Math.max(resolution, nV * 4);

    for (let ui = 0; ui <= samplesU; ui++) {
      const u = ui / samplesU;
      for (let vi = 0; vi <= samplesV; vi++) {
        const v = vi / samplesV;
        const pt = evaluateNURBS(surface, u, v);
        const vx = Math.round(pt.x);
        const vy = Math.round(pt.y);
        const vz = Math.round(pt.z);
        shellSet.add(`${vx},${vy},${vz}`);
      }
    }

    onProgress((si + 1) / totalSurfaces * 60);
  }

  if (shellSet.size === 0) {
    return [];
  }

  // 建立完整的體素集合（殼 + 可能的內部填充）
  const allVoxelKeys = new Set<string>(shellSet);

  // Step 3: 內部填充
  if (fillInterior && shellSet.size > 8) {
    // 計算 bounding box
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (const key of shellSet) {
      const [x, y, z] = key.split(',').map(Number);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }

    // 擴展 bounding box 一格（flood fill 需要）
    minX -= 1; minY -= 1; minZ -= 1;
    maxX += 1; maxY += 1; maxZ += 1;

    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    const d = maxZ - minZ + 1;

    // Flood fill 從外部（角落開始）
    const visited = new Set<string>();
    const queue: [number, number, number][] = [];

    // 從所有邊界面的非殼格點開始
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (x === minX || x === maxX || y === minY || y === maxY || z === minZ || z === maxZ) {
            const key = `${x},${y},${z}`;
            if (!shellSet.has(key) && !visited.has(key)) {
              visited.add(key);
              queue.push([x, y, z]);
            }
          }
        }
      }
    }

    // BFS 擴展外部
    const DX = [1, -1, 0, 0, 0, 0];
    const DY = [0, 0, 1, -1, 0, 0];
    const DZ = [0, 0, 0, 0, 1, -1];
    let head = 0;
    while (head < queue.length) {
      const [cx, cy, cz] = queue[head++];
      for (let dir = 0; dir < 6; dir++) {
        const nx = cx + DX[dir], ny = cy + DY[dir], nz = cz + DZ[dir];
        if (nx < minX || nx > maxX || ny < minY || ny > maxY || nz < minZ || nz > maxZ) continue;
        const nKey = `${nx},${ny},${nz}`;
        if (visited.has(nKey) || shellSet.has(nKey)) continue;
        visited.add(nKey);
        queue.push([nx, ny, nz]);
      }
    }

    onProgress(80);

    // 內部格點 = bounding box 內既非殼也非外部
    for (let x = minX + 1; x < maxX; x++) {
      for (let y = minY + 1; y < maxY; y++) {
        for (let z = minZ + 1; z < maxZ; z++) {
          const key = `${x},${y},${z}`;
          if (!shellSet.has(key) && !visited.has(key)) {
            allVoxelKeys.add(key);
          }
        }
      }
    }
  }

  onProgress(90);

  // Step 4: 建立 Voxel 物件
  const material: VoxelMaterial = DEFAULT_MATERIALS[materialId] || DEFAULT_MATERIALS.concrete;
  const voxels: Voxel[] = [];
  let idCounter = 0;

  for (const key of allVoxelKeys) {
    const [x, y, z] = key.split(',').map(Number);
    voxels.push({
      id: `mc-voxel-${idCounter++}`,
      pos: { x, y, z },
      color,
      layerId,
      materialId,
      material,
      isSupport: false,
    });
  }

  onProgress(100);

  eventBus.emit('nurbs:voxelized', {
    surfaceCount: surfaces.length,
    shellVoxels: shellSet.size,
    totalVoxels: voxels.length,
    filledInterior: fillInterior,
  });

  return voxels;
}

// ═══════════════════════════════════════════════════════════════
//  管線整合：完整的 NURBS → Minecraft 轉換流程
// ═══════════════════════════════════════════════════════════════

export interface NURBSToMinecraftOptions extends VoxelizeOptions {
  /** Minecraft 匯出格式 */
  mcFormat?: 'schematic' | 'litematic' | 'schem';
  /** 區域名稱（litematic 用） */
  regionName?: string;
  /** 作者名（litematic 用） */
  author?: string;
}

/**
 * 完整管線：NURBS 曲面 → 體素化 → Minecraft 匯出
 *
 * 結合 nurbsToVoxels() 和 MinecraftExporter 的完整工作流。
 */
export async function nurbsToMinecraft(
  surfaces: NURBSSurface[],
  options: NURBSToMinecraftOptions = {},
): Promise<{ voxels: Voxel[]; data: Uint8Array }> {
  const { exportMinecraft } = await import('../engines/MinecraftExporter');

  const voxels = nurbsToVoxels(surfaces, {
    sampleResolution: options.sampleResolution,
    fillInterior: options.fillInterior,
    materialId: options.materialId,
    color: options.color,
    layerId: options.layerId,
    onProgress: (p) => options.onProgress?.(p * 0.7), // 70% for voxelization
  });

  const format = options.mcFormat || 'schem';
  const data = await exportMinecraft(voxels, {
    format,
    regionName: options.regionName,
    author: options.author,
  });

  options.onProgress?.(100);

  return { voxels, data };
}
