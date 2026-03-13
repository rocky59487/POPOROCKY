/**
 * HermiteData.ts - 體素 Occupancy → Signed Distance Field → Hermite 資料
 *
 * 本模組負責從體素佔據資訊產生 Dual Contouring 所需的 Hermite 資料：
 *   1. 建立 3D occupancy grid（boolean bitset）
 *   2. 計算近似 SDF（使用 BFS 距離傳播，避免 O(N_grid × N_voxels) 暴力法）
 *   3. 對每條 grid edge 偵測 sign change（表面穿越）
 *   4. 計算 edge intersection point（線性插值）與 surface normal（離散梯度）
 *   5. 輸出 HermiteGrid 結構供 DualContouring 使用
 *
 * 效能設計：
 *   - 使用 Uint8Array 作為 occupancy grid（記憶體高效）
 *   - BFS 距離傳播：O(N_grid) 而非 O(N_grid × N_voxels)
 *   - 支援可調解析度與 bounding box padding
 *
 * 參考文獻：
 *   - Ju, T. et al. "Dual Contouring of Hermite Data" (2002)
 *   - 經典 SDF 近似：Manhattan/Euclidean distance transform via BFS
 *
 * 單位系統：
 *   - 體素座標為整數格點
 *   - Grid 解析度 = 1.0（每個 grid cell 對應一個體素單位）
 */

// ═══════════════════════════════════════════════════════════════
//  型別定義
// ═══════════════════════════════════════════════════════════════

/** 三維向量 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Grid edge 上的 Hermite 資料點 */
export interface HermiteEdgeData {
  /** Edge 的軸向：0=X, 1=Y, 2=Z */
  axis: number;
  /** Edge 起點的 grid 座標 (i, j, k) */
  gridI: number;
  gridJ: number;
  gridK: number;
  /** Surface intersection point（世界座標） */
  intersection: Vec3;
  /** Surface normal（單位向量，指向 SDF 增加方向 = 指向外部） */
  normal: Vec3;
  /** Edge 起點的 SDF 值 */
  sdfA: number;
  /** Edge 終點的 SDF 值 */
  sdfB: number;
}

/** Hermite Grid 完整結構 */
export interface HermiteGrid {
  /** Grid 維度 (含 padding) */
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  /** Grid 原點（世界座標，左下角） */
  originX: number;
  originY: number;
  originZ: number;
  /** Grid 解析度（每個 cell 的世界大小） */
  cellSize: number;
  /** SDF 場（Float32Array, 大小 = sizeX * sizeY * sizeZ） */
  sdf: Float32Array;
  /** Occupancy grid（Uint8Array, 1=occupied, 0=empty） */
  occupancy: Uint8Array;
  /** 所有 sign-change edges 的 Hermite 資料 */
  hermiteEdges: HermiteEdgeData[];
  /** 統計資訊 */
  stats: {
    totalGridCells: number;
    occupiedCells: number;
    signChangeEdges: number;
    buildTimeMs: number;
  };
}

// ═══════════════════════════════════════════════════════════════
//  輔助函式
// ═══════════════════════════════════════════════════════════════

/** 3D 索引 → 1D 線性索引 */
function idx3(i: number, j: number, k: number, sx: number, sy: number): number {
  return i + j * sx + k * sx * sy;
}

/** 向量正規化 */
function normalize(v: Vec3): Vec3 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (len < 1e-12) return { x: 0, y: 1, z: 0 }; // 預設朝上
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

// ═══════════════════════════════════════════════════════════════
//  核心演算法
// ═══════════════════════════════════════════════════════════════

/**
 * 從體素位置集合建立 Hermite Grid
 *
 * 完整流程：
 *   1. 計算 bounding box + padding → grid 維度
 *   2. 填入 occupancy grid
 *   3. BFS 距離傳播計算近似 SDF
 *   4. 掃描所有 grid edges，找出 sign changes
 *   5. 對每個 sign-change edge 計算 intersection + normal
 *
 * @param voxelPositions - 體素位置陣列
 * @param padding - Bounding box 外擴格數（預設 2）
 * @param cellSize - Grid cell 大小（預設 1.0，對應體素單位）
 * @param maxBFSDistance - BFS 最大傳播距離（預設 3.0）
 * @returns HermiteGrid
 */
export function buildHermiteGrid(
  voxelPositions: Vec3[],
  padding: number = 2,
  cellSize: number = 1.0,
  maxBFSDistance: number = 3.0
): HermiteGrid {
  const startTime = performance.now();

  if (voxelPositions.length === 0) {
    return {
      sizeX: 0, sizeY: 0, sizeZ: 0,
      originX: 0, originY: 0, originZ: 0,
      cellSize,
      sdf: new Float32Array(0),
      occupancy: new Uint8Array(0),
      hermiteEdges: [],
      stats: { totalGridCells: 0, occupiedCells: 0, signChangeEdges: 0, buildTimeMs: 0 },
    };
  }

  // ─── Step 1: Bounding box + padding ───
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const p of voxelPositions) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.z < minZ) minZ = p.z;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
    if (p.z > maxZ) maxZ = p.z;
  }

  // Grid 原點與維度
  // 體素中心在整數座標，grid 節點在半整數偏移
  // 例如體素 (0,0,0) 佔據 [-0.5, 0.5]³
  // Grid 節點 (i,j,k) 對應世界座標 (origin + i*cellSize, ...)
  const originX = minX - padding * cellSize - 0.5 * cellSize;
  const originY = minY - padding * cellSize - 0.5 * cellSize;
  const originZ = minZ - padding * cellSize - 0.5 * cellSize;

  // +1 是因為 grid 節點數 = cell 數 + 1
  const sizeX = Math.ceil((maxX - minX) / cellSize) + 1 + 2 * padding + 1;
  const sizeY = Math.ceil((maxY - minY) / cellSize) + 1 + 2 * padding + 1;
  const sizeZ = Math.ceil((maxZ - minZ) / cellSize) + 1 + 2 * padding + 1;

  const totalCells = sizeX * sizeY * sizeZ;

  // ─── Step 2: 建立 occupancy grid ───
  // 使用 Set 快速查詢體素是否存在
  const voxelSet = new Set<string>();
  for (const p of voxelPositions) {
    voxelSet.add(`${Math.round(p.x)},${Math.round(p.y)},${Math.round(p.z)}`);
  }

  const occupancy = new Uint8Array(totalCells);
  let occupiedCount = 0;

  // 對每個 grid 節點，檢查最近的體素中心是否在 0.5*cellSize 內
  // 等效於：grid 節點 (wx, wy, wz) 對應的體素座標 = round(wx)
  for (let k = 0; k < sizeZ; k++) {
    for (let j = 0; j < sizeY; j++) {
      for (let i = 0; i < sizeX; i++) {
        const wx = originX + i * cellSize;
        const wy = originY + j * cellSize;
        const wz = originZ + k * cellSize;

        // 找最近的體素整數座標
        const vx = Math.round(wx);
        const vy = Math.round(wy);
        const vz = Math.round(wz);

        if (voxelSet.has(`${vx},${vy},${vz}`)) {
          occupancy[idx3(i, j, k, sizeX, sizeY)] = 1;
          occupiedCount++;
        }
      }
    }
  }

  // ─── Step 3: BFS 距離傳播計算近似 SDF ───
  //
  // SDF 定義：
  //   - 正值 = 外部（距離表面的距離）
  //   - 負值 = 內部（距離表面的距離，取負）
  //   - 0 = 表面上
  //
  // 使用 multi-source BFS：
  //   1. 初始化所有 occupied 節點的 SDF = -maxBFSDistance
  //   2. 初始化所有 empty 節點的 SDF = +maxBFSDistance
  //   3. 找出所有表面節點（occupied 且有 empty 鄰居，或反之）
  //   4. 從表面節點開始 BFS，逐步更新距離

  const sdf = new Float32Array(totalCells);
  const visited = new Uint8Array(totalCells);

  // 初始化 SDF
  for (let idx = 0; idx < totalCells; idx++) {
    sdf[idx] = occupancy[idx] ? -maxBFSDistance : maxBFSDistance;
  }

  // 6-connected 鄰居偏移
  const DI = [1, -1, 0, 0, 0, 0];
  const DJ = [0, 0, 1, -1, 0, 0];
  const DK = [0, 0, 0, 0, 1, -1];

  // 找出表面節點（sign change 的鄰居對）
  // BFS queue: [i, j, k, distance]
  const queue: Array<[number, number, number, number]> = [];

  for (let k = 0; k < sizeZ; k++) {
    for (let j = 0; j < sizeY; j++) {
      for (let i = 0; i < sizeX; i++) {
        const myIdx = idx3(i, j, k, sizeX, sizeY);
        const myOcc = occupancy[myIdx];

        // 檢查是否為表面節點
        let isSurface = false;
        for (let d = 0; d < 6; d++) {
          const ni = i + DI[d], nj = j + DJ[d], nk = k + DK[d];
          if (ni < 0 || ni >= sizeX || nj < 0 || nj >= sizeY || nk < 0 || nk >= sizeZ) {
            // 邊界外視為 empty
            if (myOcc) { isSurface = true; break; }
            continue;
          }
          const nIdx = idx3(ni, nj, nk, sizeX, sizeY);
          if (occupancy[nIdx] !== myOcc) {
            isSurface = true;
            break;
          }
        }

        if (isSurface) {
          // 表面節點：SDF ≈ ±0.5（在表面附近）
          sdf[myIdx] = myOcc ? -0.5 * cellSize : 0.5 * cellSize;
          visited[myIdx] = 1;
          queue.push([i, j, k, 0.5 * cellSize]);
        }
      }
    }
  }

  // BFS 傳播
  let head = 0;
  while (head < queue.length) {
    const [ci, cj, ck, dist] = queue[head++];
    const cIdx = idx3(ci, cj, ck, sizeX, sizeY);
    const cOcc = occupancy[cIdx];

    for (let d = 0; d < 6; d++) {
      const ni = ci + DI[d], nj = cj + DJ[d], nk = ck + DK[d];
      if (ni < 0 || ni >= sizeX || nj < 0 || nj >= sizeY || nk < 0 || nk >= sizeZ) continue;

      const nIdx = idx3(ni, nj, nk, sizeX, sizeY);
      if (visited[nIdx]) continue;

      const newDist = dist + cellSize;
      if (newDist > maxBFSDistance) continue;

      const nOcc = occupancy[nIdx];
      // 只向同側傳播
      if (nOcc === cOcc) {
        sdf[nIdx] = nOcc ? -newDist : newDist;
        visited[nIdx] = 1;
        queue.push([ni, nj, nk, newDist]);
      }
    }
  }

  // ─── Step 4 & 5: 掃描 grid edges，找 sign changes，計算 Hermite 資料 ───
  //
  // 每個 grid cell (i,j,k) 有 3 條 edges：
  //   X-edge: (i,j,k) → (i+1,j,k)
  //   Y-edge: (i,j,k) → (i,j+1,k)
  //   Z-edge: (i,j,k) → (i,j,k+1)
  //
  // 對每條 edge，如果兩端 SDF 符號不同（sign change），
  // 則計算 intersection point 和 surface normal。

  const hermiteEdges: HermiteEdgeData[] = [];

  // 軸向偏移
  const AXIS_OFFSETS: [number, number, number][] = [
    [1, 0, 0], // X-edge
    [0, 1, 0], // Y-edge
    [0, 0, 1], // Z-edge
  ];

  for (let k = 0; k < sizeZ; k++) {
    for (let j = 0; j < sizeY; j++) {
      for (let i = 0; i < sizeX; i++) {
        const idxA = idx3(i, j, k, sizeX, sizeY);
        const sdfA = sdf[idxA];

        for (let axis = 0; axis < 3; axis++) {
          const [di, dj, dk] = AXIS_OFFSETS[axis];
          const ni = i + di, nj = j + dj, nk = k + dk;

          // 邊界檢查
          if (ni >= sizeX || nj >= sizeY || nk >= sizeZ) continue;

          const idxB = idx3(ni, nj, nk, sizeX, sizeY);
          const sdfB = sdf[idxB];

          // Sign change 檢查
          if ((sdfA > 0) === (sdfB > 0)) continue;
          if (sdfA === 0 && sdfB === 0) continue;

          // ─── 計算 intersection point（線性插值） ───
          // t = sdfA / (sdfA - sdfB)，t ∈ [0, 1]
          const t = sdfA / (sdfA - sdfB);
          const clampedT = Math.max(0.001, Math.min(0.999, t));

          const posA: Vec3 = {
            x: originX + i * cellSize,
            y: originY + j * cellSize,
            z: originZ + k * cellSize,
          };
          const posB: Vec3 = {
            x: originX + ni * cellSize,
            y: originY + nj * cellSize,
            z: originZ + nk * cellSize,
          };

          const intersection: Vec3 = {
            x: posA.x + clampedT * (posB.x - posA.x),
            y: posA.y + clampedT * (posB.y - posA.y),
            z: posA.z + clampedT * (posB.z - posA.z),
          };

          // ─── 計算 surface normal（SDF 離散梯度） ───
          // 在 intersection point 附近取 SDF 梯度
          // 使用中心差分：∂SDF/∂x ≈ (SDF(i+1) - SDF(i-1)) / 2
          // 取 intersection 最近的 grid 節點
          const ci = Math.round((intersection.x - originX) / cellSize);
          const cj = Math.round((intersection.y - originY) / cellSize);
          const ck = Math.round((intersection.z - originZ) / cellSize);

          const gradX = getSDF(ci + 1, cj, ck) - getSDF(ci - 1, cj, ck);
          const gradY = getSDF(ci, cj + 1, ck) - getSDF(ci, cj - 1, ck);
          const gradZ = getSDF(ci, cj, ck + 1) - getSDF(ci, cj, ck - 1);

          const normal = normalize({ x: gradX, y: gradY, z: gradZ });

          hermiteEdges.push({
            axis,
            gridI: i, gridJ: j, gridK: k,
            intersection,
            normal,
            sdfA,
            sdfB,
          });
        }
      }
    }
  }

  /** 安全取得 SDF 值（邊界外回傳 maxBFSDistance） */
  function getSDF(i: number, j: number, k: number): number {
    if (i < 0 || i >= sizeX || j < 0 || j >= sizeY || k < 0 || k >= sizeZ) {
      return maxBFSDistance;
    }
    return sdf[idx3(i, j, k, sizeX, sizeY)];
  }

  const buildTimeMs = performance.now() - startTime;

  console.log(
    `[HermiteData] Grid ${sizeX}×${sizeY}×${sizeZ} = ${totalCells} cells, ` +
    `${occupiedCount} occupied, ${hermiteEdges.length} sign-change edges, ` +
    `${buildTimeMs.toFixed(1)}ms`
  );

  return {
    sizeX, sizeY, sizeZ,
    originX, originY, originZ,
    cellSize,
    sdf,
    occupancy,
    hermiteEdges,
    stats: {
      totalGridCells: totalCells,
      occupiedCells: occupiedCount,
      signChangeEdges: hermiteEdges.length,
      buildTimeMs,
    },
  };
}

/**
 * 從 HermiteGrid 取得特定 grid 節點的 SDF 值
 */
export function getGridSDF(grid: HermiteGrid, i: number, j: number, k: number): number {
  if (i < 0 || i >= grid.sizeX || j < 0 || j >= grid.sizeY || k < 0 || k >= grid.sizeZ) {
    return 3.0; // 邊界外視為外部
  }
  return grid.sdf[idx3(i, j, k, grid.sizeX, grid.sizeY)];
}

/**
 * 從 HermiteGrid 取得特定 grid 節點的 occupancy
 */
export function getGridOccupancy(grid: HermiteGrid, i: number, j: number, k: number): boolean {
  if (i < 0 || i >= grid.sizeX || j < 0 || j >= grid.sizeY || k < 0 || k >= grid.sizeZ) {
    return false;
  }
  return grid.occupancy[idx3(i, j, k, grid.sizeX, grid.sizeY)] === 1;
}
