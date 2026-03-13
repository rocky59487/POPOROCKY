/**
 * Dual Contouring Worker - 在 Web Worker 中執行 DC 等值面提取
 *
 * // === TRUE DUAL CONTOURING ===
 *
 * v2.4: 替換原有的 Marching Cubes，使用 True Dual Contouring。
 *
 * 接收體素位置（Typed Arrays），使用 HermiteData + DualContouring
 * 執行完整的 DC 流程，並回傳網格結果。
 *
 * 使用 Comlink 進行主執行緒與 Worker 之間的通訊。
 *
 * 注意：此檔案保留原有的 API 名稱 (marchingCubes) 以維持向後相容，
 * 但內部實作已完全替換為 Dual Contouring。
 */

import { expose } from 'comlink';
import { buildHermiteGrid, Vec3 } from '../engines/HermiteData';
import { dualContouring } from '../engines/DualContouring';

interface MarchingCubesInput {
  positions: Float32Array;
  count: number;
  threshold: number;      // 用作 QEF regularization 係數
  gridResolution: number; // 用作 cellSize
}

interface MarchingCubesResult {
  vertices: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  vertexCount: number;
  triangleCount: number;
  // DC 統計資訊
  activeCells: number;
  regularizedCells: number;
  hermiteEdges: number;
}

/**
 * 執行 Dual Contouring（替代 Marching Cubes）
 *
 * // === TRUE DUAL CONTOURING ===
 *
 * 流程：
 *   1. 從 Float32Array 提取體素位置
 *   2. buildHermiteGrid(): occupancy → BFS SDF → Hermite edges
 *   3. dualContouring(): QEF → cell vertices → quads → triangles
 */
function marchingCubes(input: MarchingCubesInput): MarchingCubesResult {
  const { positions, count, threshold, gridResolution } = input;

  if (count === 0) {
    return {
      vertices: new Float32Array(0),
      normals: new Float32Array(0),
      indices: new Uint32Array(0),
      vertexCount: 0,
      triangleCount: 0,
      activeCells: 0,
      regularizedCells: 0,
      hermiteEdges: 0,
    };
  }

  // Step 1: 提取體素位置
  const voxelPositions: Vec3[] = [];
  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    voxelPositions.push({
      x: Math.round(positions[i3]),
      y: Math.round(positions[i3 + 1]),
      z: Math.round(positions[i3 + 2]),
    });
  }

  // Step 2: 建立 Hermite Grid
  const cellSize = gridResolution > 0 ? gridResolution : 1.0;
  const hermiteGrid = buildHermiteGrid(voxelPositions, 2, cellSize, 3.0);

  // Step 3: Dual Contouring
  const regularization = threshold > 0 ? threshold : 0.1;
  const dcMesh = dualContouring(hermiteGrid, regularization);

  return {
    vertices: dcMesh.positions,
    normals: dcMesh.normals,
    indices: dcMesh.indices,
    vertexCount: dcMesh.positions.length / 3,
    triangleCount: dcMesh.indices.length / 3,
    activeCells: dcMesh.stats.activeCells,
    regularizedCells: dcMesh.stats.regularizedCells,
    hermiteEdges: hermiteGrid.stats.signChangeEdges,
  };
}

const marchingCubesAPI = {
  marchingCubes,
};

expose(marchingCubesAPI);

export type MarchingCubesWorkerAPI = typeof marchingCubesAPI;
