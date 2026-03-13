/**
 * VoxelToNURBS Pipeline - 四階段管線
 *
 * v2.4: 使用 True Dual Contouring + Approximate NURBS Fitting
 *
 * Stage 1: 體素 → Hermite Data → Dual Contouring 等值面網格
 *          // === TRUE DUAL CONTOURING ===
 *          替換原有的 Marching Cubes，使用經典 DC 演算法：
 *          - buildHermiteGrid(): 體素 occupancy → BFS SDF → Hermite 資料
 *          - dualContouring(): QEF 求解 → cell 代表頂點 → quad → 三角形
 *
 * Stage 2: 網格簡化 (QEM)
 *          使用 DualContouring.ts 中的 simplifyDCMesh()
 *
 * Stage 3: NURBS 曲面擬合
 *          // === APPROXIMATE NURBS FITTING (Least Squares, not TRF) ===
 *          使用 NURBSFitter.ts 的 fitNURBSFromDCMesh()
 *          - Patch 分群（按法向方向）
 *          - Least Squares 控制點解算
 *          - Fallback: 加權平均高度法
 *
 * Stage 4: 匯出 (.obj / .3dm)
 */

import eventBus from '../engines/EventBus';
import { Vec3, Voxel, NURBSSurface, PipelineState } from '../store/useStore';
import { buildHermiteGrid, HermiteGrid } from '../engines/HermiteData';
import { dualContouring, simplifyDCMesh, DCMeshData } from '../engines/DualContouring';
import { fitNURBSFromDCMesh, NURBSFitResult, FittingStats } from '../engines/NURBSFitter';

/* ============================================================
   Types
   ============================================================ */
export interface MeshData {
  positions: Float32Array;  // [x,y,z, x,y,z, ...]
  normals: Float32Array;
  indices: Uint32Array;
  featureEdges: { a: number[]; b: number[] }[];
}

export interface PipelineResult {
  mesh?: MeshData;
  simplifiedMesh?: MeshData;
  surfaces: NURBSSurface[];
  verbSurfaces?: unknown[];
  hermiteGrid?: HermiteGrid;
  dcMesh?: DCMeshData;
  fittingStats?: FittingStats;
}

type StageCallback = (stage: number, status: 'running'|'done'|'error', progress: number) => void;
type LogCallback = (level: 'info'|'success'|'warning'|'error', src: string, msg: string) => void;

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

/* ============================================================
   Stage 1: Dual Contouring - Voxels to Isosurface Mesh
   // === TRUE DUAL CONTOURING ===
   ============================================================ */

/**
 * 從體素建立 DC 網格
 *
 * 流程：
 *   1. 提取體素位置
 *   2. buildHermiteGrid(): occupancy → BFS SDF → Hermite edges
 *   3. dualContouring(): QEF → cell vertices → quads → triangles
 *
 * @param voxels - 體素陣列
 * @param qefRegularization - QEF 正則化係數
 * @param onProgress - 進度回調
 * @returns { hermiteGrid, dcMesh, meshData }
 */
function buildDCMesh(
  voxels: Voxel[],
  qefRegularization: number,
  onProgress: (p: number) => void
): { hermiteGrid: HermiteGrid; dcMesh: DCMeshData; meshData: MeshData } {
  // Step 1: 提取體素位置
  const positions: Vec3[] = voxels.map(v => v.pos);
  onProgress(10);

  // Step 2: 建立 Hermite Grid
  // padding=2, cellSize=1.0, maxBFSDistance=3.0
  const hermiteGrid = buildHermiteGrid(positions, 2, 1.0, 3.0);
  onProgress(40);

  // Step 3: Dual Contouring
  const dcMesh = dualContouring(hermiteGrid, qefRegularization);
  onProgress(90);

  // 轉換為 MeshData 格式（向後相容）
  const meshData: MeshData = {
    positions: dcMesh.positions,
    normals: dcMesh.normals,
    indices: dcMesh.indices,
    featureEdges: [],
  };

  onProgress(100);
  return { hermiteGrid, dcMesh, meshData };
}

/* ============================================================
   Stage 2: Mesh Simplification (QEM)
   ============================================================ */

/**
 * 簡化 DC 網格
 *
 * 使用 DualContouring.ts 中的 simplifyDCMesh()（QEM 邊坍縮）
 */
function simplifyMeshDC(
  dcMesh: DCMeshData,
  targetRatio: number,
  onProgress: (p: number) => void
): { simplified: DCMeshData; meshData: MeshData } {
  onProgress(10);

  const simplified = simplifyDCMesh(dcMesh, targetRatio, 30);

  onProgress(80);

  // 特徵邊偵測
  const featureEdges: { a: number[]; b: number[] }[] = [];
  const featureAngleRad = 30 * Math.PI / 180;
  const numTris = simplified.indices.length / 3;

  // 計算面法向
  const faceNormals: [number, number, number][] = [];
  for (let t = 0; t < numTris; t++) {
    const i0 = simplified.indices[t * 3];
    const i1 = simplified.indices[t * 3 + 1];
    const i2 = simplified.indices[t * 3 + 2];

    const v0x = simplified.positions[i0 * 3], v0y = simplified.positions[i0 * 3 + 1], v0z = simplified.positions[i0 * 3 + 2];
    const v1x = simplified.positions[i1 * 3], v1y = simplified.positions[i1 * 3 + 1], v1z = simplified.positions[i1 * 3 + 2];
    const v2x = simplified.positions[i2 * 3], v2y = simplified.positions[i2 * 3 + 1], v2z = simplified.positions[i2 * 3 + 2];

    const e1x = v1x - v0x, e1y = v1y - v0y, e1z = v1z - v0z;
    const e2x = v2x - v0x, e2y = v2y - v0y, e2z = v2z - v0z;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 1e-12) { nx /= len; ny /= len; nz /= len; }
    faceNormals.push([nx, ny, nz]);
  }

  // 建立邊→面映射
  const edgeFaces = new Map<string, number[]>();
  for (let t = 0; t < numTris; t++) {
    for (let e = 0; e < 3; e++) {
      const a = simplified.indices[t * 3 + e];
      const b = simplified.indices[t * 3 + ((e + 1) % 3)];
      const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
      if (!edgeFaces.has(key)) edgeFaces.set(key, []);
      edgeFaces.get(key)!.push(t);
    }
  }

  edgeFaces.forEach((faces, key) => {
    if (faces.length === 2) {
      const n1 = faceNormals[faces[0]], n2 = faceNormals[faces[1]];
      if (n1 && n2) {
        const dot = n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2];
        const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
        if (angle > featureAngleRad) {
          const [aIdx, bIdx] = key.split('-').map(Number);
          featureEdges.push({
            a: [simplified.positions[aIdx * 3], simplified.positions[aIdx * 3 + 1], simplified.positions[aIdx * 3 + 2]],
            b: [simplified.positions[bIdx * 3], simplified.positions[bIdx * 3 + 1], simplified.positions[bIdx * 3 + 2]],
          });
        }
      }
    }
  });

  onProgress(100);

  const meshData: MeshData = {
    positions: simplified.positions,
    normals: simplified.normals,
    indices: simplified.indices,
    featureEdges,
  };

  return { simplified, meshData };
}

/* ============================================================
   Stage 3: NURBS Surface Fitting
   // === APPROXIMATE NURBS FITTING (Least Squares, not TRF) ===
   ============================================================ */

// 直接使用 NURBSFitter.ts 的 fitNURBSFromDCMesh()

/* ============================================================
   Stage 4: Export
   ============================================================ */

export function exportToOBJ(mesh: MeshData | null, surfaces: NURBSSurface[]): string {
  let obj = '# FastDesign NURBS Export\n';
  obj += '# Generated by VoxelToNURBS Pipeline v2.4\n';
  obj += '# Stage 1: True Dual Contouring of Hermite Data\n';
  obj += '# Stage 3: Approximate NURBS Fitting (Least Squares)\n\n';

  if (mesh && mesh.positions.length > 0) {
    obj += '# Mesh vertices\n';
    for (let i = 0; i < mesh.positions.length; i += 3) {
      obj += `v ${mesh.positions[i].toFixed(6)} ${mesh.positions[i+1].toFixed(6)} ${mesh.positions[i+2].toFixed(6)}\n`;
    }
    for (let i = 0; i < mesh.normals.length; i += 3) {
      obj += `vn ${mesh.normals[i].toFixed(6)} ${mesh.normals[i+1].toFixed(6)} ${mesh.normals[i+2].toFixed(6)}\n`;
    }
    obj += '\n# Faces\n';
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const a = mesh.indices[i] + 1, b = mesh.indices[i+1] + 1, c = mesh.indices[i+2] + 1;
      obj += `f ${a}//${a} ${b}//${b} ${c}//${c}\n`;
    }
  }

  // Also export NURBS control points as a separate group
  surfaces.forEach((s, si) => {
    obj += `\n# NURBS Surface ${si} control points\ng nurbs_${si}\n`;
    s.controlPoints.forEach(row => row.forEach(p => {
      obj += `v ${p.x.toFixed(6)} ${p.y.toFixed(6)} ${p.z.toFixed(6)}\n`;
    }));
  });

  return obj;
}

export function exportTo3DM(surfaces: NURBSSurface[]): Promise<ArrayBuffer | null> {
  return new Promise(async (resolve) => {
    try {
      const rhino3dm = require('rhino3dm');
      const rhino = await rhino3dm();

      const file = new rhino.File3dm();

      surfaces.forEach(s => {
        const nurbsSurface = rhino.NurbsSurface.create(
          3, // dimension
          false, // isRational
          s.degree + 1, // orderU
          s.degree + 1, // orderV
          s.controlPoints.length, // countU
          s.controlPoints[0].length // countV
        );

        // Set knots
        for (let i = 0; i < s.knotsU.length - 2; i++) {
          nurbsSurface.knotsU().set(i, s.knotsU[i + 1]);
        }
        for (let i = 0; i < s.knotsV.length - 2; i++) {
          nurbsSurface.knotsV().set(i, s.knotsV[i + 1]);
        }

        // Set control points
        for (let i = 0; i < s.controlPoints.length; i++) {
          for (let j = 0; j < s.controlPoints[i].length; j++) {
            const p = s.controlPoints[i][j];
            nurbsSurface.pointAt(i, j).set(p.x, p.y, p.z);
          }
        }

        const brep = rhino.Brep.createFromSurface(nurbsSurface);
        if (brep) {
          file.objects().addBrep(brep, null);
        }
      });

      const buffer = file.toByteArray();
      resolve(buffer.buffer);
    } catch (e) {
      console.warn('rhino3dm export failed:', e);
      resolve(null);
    }
  });
}

/* ============================================================
   Main Pipeline Runner
   ============================================================ */

// Store latest pipeline result for rendering
let latestResult: PipelineResult | null = null;
export function getLatestPipelineResult(): PipelineResult | null { return latestResult; }

export async function runVoxelToNURBS(
  voxels: Voxel[],
  params: PipelineState['params'],
  onStage: StageCallback,
  addLog: LogCallback
): Promise<NURBSSurface[]> {
  if (!voxels.length) {
    addLog('warning', 'Pipeline', '沒有體素可轉換');
    return [];
  }

  const startTime = performance.now();
  addLog('info', 'Pipeline', `開始轉換 ${voxels.length} 個體素...`);
  eventBus.emit('pipeline:start', { count: voxels.length });

  latestResult = { surfaces: [] };

  // ──────────────────────────────────────────────────────────
  //  Stage 1: True Dual Contouring
  //  // === TRUE DUAL CONTOURING ===
  // ──────────────────────────────────────────────────────────
  onStage(0, 'running', 0);
  addLog('info', 'Stage1', 'Dual Contouring 等值面提取（Hermite Data → QEF → Mesh）...');
  await delay(50);

  const t1 = performance.now();
  const qefReg = params.qefThreshold > 0 ? params.qefThreshold : 0.1;
  const { hermiteGrid, dcMesh, meshData } = buildDCMesh(voxels, qefReg,
    p => onStage(0, 'running', p));
  const t1End = performance.now();

  latestResult.mesh = meshData;
  latestResult.hermiteGrid = hermiteGrid;
  latestResult.dcMesh = dcMesh;

  onStage(0, 'done', 100);
  addLog('success', 'Stage1',
    `完成: ${dcMesh.stats.activeCells} active cells, ` +
    `${meshData.positions.length / 3} 頂點, ${meshData.indices.length / 3} 三角面, ` +
    `${dcMesh.stats.regularizedCells} regularized ` +
    `(${(t1End - t1).toFixed(0)}ms)`
  );
  await delay(50);

  // ──────────────────────────────────────────────────────────
  //  Stage 2: QEM Mesh Simplification
  // ──────────────────────────────────────────────────────────
  onStage(1, 'running', 0);
  addLog('info', 'Stage2', 'QEM 網格簡化 + 特徵線辨識...');
  await delay(50);

  const t2 = performance.now();
  const targetRatio = Math.max(0.1, Math.min(1.0, params.pcaTolerance > 0 ? params.pcaTolerance : 0.5));
  const { simplified, meshData: simplifiedMeshData } = simplifyMeshDC(dcMesh, targetRatio,
    p => onStage(1, 'running', p));
  const t2End = performance.now();

  latestResult.simplifiedMesh = simplifiedMeshData;

  onStage(1, 'done', 100);
  addLog('success', 'Stage2',
    `完成: ${simplifiedMeshData.positions.length / 3} 頂點, ` +
    `${simplifiedMeshData.indices.length / 3} 面, ` +
    `${simplifiedMeshData.featureEdges.length} 特徵線 ` +
    `(${(t2End - t2).toFixed(0)}ms)`
  );
  await delay(50);

  // ──────────────────────────────────────────────────────────
  //  Stage 3: NURBS Surface Fitting
  //  // === APPROXIMATE NURBS FITTING (Least Squares, not TRF) ===
  // ──────────────────────────────────────────────────────────
  onStage(2, 'running', 0);
  addLog('info', 'Stage3', 'NURBS 曲面擬合（Least Squares，非 TRF）...');
  await delay(50);

  const t3 = performance.now();
  const degU = Math.max(2, Math.min(5, params.nurbsDegree));
  const degV = Math.max(2, Math.min(5, params.nurbsDegree));
  const cpCount = Math.max(degU + 1, Math.min(32, params.controlPointCount));

  const angleThreshold = params.angleThreshold > 0 ? params.angleThreshold : 30;

  const fitResult: NURBSFitResult = fitNURBSFromDCMesh(
    simplified, degU, degV, cpCount, cpCount, angleThreshold,
    p => onStage(2, 'running', p)
  );
  const t3End = performance.now();

  latestResult.surfaces = fitResult.surfaces;
  latestResult.verbSurfaces = fitResult.verbSurfaces;
  latestResult.fittingStats = fitResult.fittingStats;

  onStage(2, 'done', 100);

  const fs = fitResult.fittingStats;
  addLog('success', 'Stage3',
    `完成: ${fs.totalPatches} patches ` +
    `(${fs.exactPatches} exact, ${fs.approximatePatches} approx), ` +
    `${fitResult.stats.totalControlPoints} 控制點, ` +
    `degree ${degU}, avgErr=${fs.avgMaxError.toFixed(4)}, ` +
    `worstErr=${fs.worstPatchError.toFixed(4)} ` +
    `(${(t3End - t3).toFixed(0)}ms)`
  );

  if (fs.approximatePatches > 0) {
    addLog('warning', 'Stage3',
      `${fs.approximatePatches}/${fs.totalPatches} patches 使用近似模式`);
  }

  // ──────────────────────────────────────────────────────────
  //  Summary
  // ──────────────────────────────────────────────────────────
  const totalTime = performance.now() - startTime;
  eventBus.emit('pipeline:complete', { surfaceCount: fitResult.surfaces.length, totalTime });
  addLog('success', 'Pipeline',
    `體素→DC→NURBS 轉換完成！` +
    `${fitResult.surfaces.length} 個 NURBS 曲面，總耗時 ${totalTime.toFixed(0)}ms`
  );

  return fitResult.surfaces;
}
