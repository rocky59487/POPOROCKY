/**
 * FEA Worker - 在 Web Worker 中執行教科書級結構分析
 *
 * 接收體素資料（Typed Arrays），使用 FEASolver 執行完整的
 * 3D 桁架有限元素分析，並回傳結果。
 *
 * 使用 Comlink 進行主執行緒與 Worker 之間的通訊。
 */

import { expose } from 'comlink';
import {
  solveFEAFromArrays,
  Vec3,
  GlueJoint,
  FEASolverResult,
} from '../engines/FEASolver';

// ─── Worker 輸入介面 ───

interface FEAInput {
  positions: Float32Array;
  materials: Uint8Array;
  properties: Float32Array;
  flags: Uint8Array;
  loads: Float32Array;
  count: number;
  glueJoints: Array<{ voxelA: Vec3; voxelB: Vec3; strength: number }>;
  gravity: Vec3;
  gravityMagnitude: number;
}

// ─── Worker 輸出介面（向後相容） ───

interface FEAEdge {
  nodeA: Vec3;
  nodeB: Vec3;
  stressRatio: number;
  force: number;
  type: 'compression' | 'tension';
}

interface FEAResult {
  edges: FEAEdge[];
  maxStressRatio: number;
  dangerCount: number;
  overloadCount: number;
  totalForce: number;
  safetyLevel: 'safe' | 'warning' | 'danger';
  solverIterations: number;
  residualNorm: number;
  elapsedMs: number;
}

/**
 * 執行教科書級 FEA 分析
 *
 * 呼叫 FEASolver.solveFEAFromArrays()，
 * 然後將結果轉換為向後相容的 FEAResult 格式。
 */
function analyze(input: FEAInput): FEAResult {
  const {
    positions, materials, properties, flags, loads,
    count, glueJoints, gravity, gravityMagnitude,
  } = input;

  // 轉換 Glue Joints 格式
  const feaGlueJoints: GlueJoint[] = glueJoints.map(gj => ({
    voxelA: gj.voxelA,
    voxelB: gj.voxelB,
    strength: gj.strength,
  }));

  // 呼叫教科書級 FEA 求解器
  const solverResult: FEASolverResult = solveFEAFromArrays(
    positions,
    materials,
    properties,
    flags,
    loads,
    count,
    feaGlueJoints,
    gravity,
    gravityMagnitude
  );

  // 轉換為向後相容的 FEAResult 格式
  const edges: FEAEdge[] = solverResult.edges.map(e => ({
    nodeA: e.nodeA,
    nodeB: e.nodeB,
    stressRatio: e.stressRatio,
    force: e.axialForce,
    type: e.isTension ? 'tension' as const : 'compression' as const,
  }));

  // 計算總力
  let totalForce = 0;
  for (const e of solverResult.edges) {
    totalForce += Math.abs(e.axialForce);
  }

  // 計算超載數
  let overloadCount = 0;
  for (const e of solverResult.edges) {
    if (e.stressRatio > 1.0) overloadCount++;
  }

  // 安全等級
  const safetyLevel: 'safe' | 'warning' | 'danger' =
    overloadCount > 0 ? 'danger' :
    solverResult.dangerCount > 0 ? 'warning' : 'safe';

  return {
    edges,
    maxStressRatio: solverResult.maxStressRatio,
    dangerCount: solverResult.dangerCount,
    overloadCount,
    totalForce,
    safetyLevel,
    solverIterations: solverResult.solverIterations,
    residualNorm: solverResult.residualNorm,
    elapsedMs: solverResult.elapsedMs,
  };
}

const feaWorkerAPI = {
  analyze,
};

expose(feaWorkerAPI);

export type FEAWorkerAPI = typeof feaWorkerAPI;
