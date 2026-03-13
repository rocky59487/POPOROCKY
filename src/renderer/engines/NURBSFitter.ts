/**
 * NURBSFitter.ts - DC 網格 → NURBS 曲面擬合（v2.6 四階段強化版）
 *
 * // === APPROXIMATE NURBS FITTING (Least Squares, not TRF) ===
 *
 * 本模組從 Dual Contouring 產生的三角網格擬合 NURBS 曲面。
 *
 * 重要聲明：
 *   這是一個「近似 NURBS 擬合」方案，使用 Least Squares 方法，
 *   並非 True Rational Fitting (TRF)。具體限制：
 *     - 參數化使用 PCA 主軸投影（v2.6 改進）
 *     - 控制點解算使用 Householder QR 分解（v2.6 改進）
 *     - 權重固定為 1.0（非有理 NURBS）
 *     - 對於複雜拓撲（環面、自交叉）效果有限
 *
 * v2.6 四階段強化：
 *   Stage 1: Householder QR 求解器 + 條件數檢查 + Tikhonov 正則化
 *   Stage 2: Region Growing patch 分群（取代 6 方向分群）
 *   Stage 3: PCA 主軸投影 UV 參數化 + 品質指標
 *   Stage 4: 三層重試機制 + FittingStats + fallback 追蹤
 *
 * 參考文獻：
 *   - Piegl, L., Tiller, W. "The NURBS Book" (1997), Chapter 9
 *   - Golub, Van Loan "Matrix Computations" (2013), Chapter 5 (Householder QR)
 *
 * @module NURBSFitter
 */

import { DCMeshData } from './DualContouring';

// ═══════════════════════════════════════════════════════════════
//  型別定義
// ═══════════════════════════════════════════════════════════════

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** NURBS 曲面結構（與 useStore 相容） */
export interface NURBSSurface {
  id: string;
  controlPoints: Vec3[][];
  degree: number;
  knotsU: number[];
  knotsV: number[];
  weights: number[][];
}

/** 擴展的 NURBS Patch（含 fitting 元資料） */
export interface NURBSPatch extends NURBSSurface {
  isApproximate: boolean;
  fallbackReason?: string;
  maxError: number;
  conditionNumber: number;
  tikhonovLambda: number;
}

/** Patch 分群結果 */
interface MeshPatch {
  /** Patch 中的三角形索引（在原始 mesh.indices 中的位置 / 3） */
  triangleFaceIndices: number[];
  /** Patch 中的頂點索引（去重） */
  vertexIndices: number[];
  /** 面積加權平均法向 */
  averageNormal: Vec3;
}

/** UV 參數化後的 Patch */
interface PatchWithUV {
  patch: MeshPatch;
  /** UV 座標 */
  uCoords: Float64Array;
  vCoords: Float64Array;
  /** 3D 頂點座標 */
  points: Vec3[];
  /** PCA 主軸 */
  e1: Vec3;
  e2: Vec3;
  /** 參數化品質 */
  paramQuality: 'good' | 'poor';
  /** PCA 特徵值比 */
  eigenRatio: number;
}

/** Fitting 統計 */
export interface FittingStats {
  totalPatches: number;
  exactPatches: number;
  approximatePatches: number;
  fallbackReasons: string[];
  avgMaxError: number;
  worstPatchError: number;
}

/** 擬合結果 */
export interface NURBSFitResult {
  surfaces: NURBSSurface[];
  verbSurfaces: unknown[];
  patches: NURBSPatch[];
  fittingStats: FittingStats;
  stats: {
    patchCount: number;
    totalControlPoints: number;
    fitTimeMs: number;
    method: 'least_squares' | 'weighted_average';
  };
}

/** 擬合報告（每個 patch） */
interface NURBSFittingReport {
  conditionNumber: number;
  tikhonovLambda: number;
  solverUsed: 'qr' | 'gauss_jordan_fallback';
  hasNaN: boolean;
  outOfBounds: boolean;
}

// ═══════════════════════════════════════════════════════════════
//  Stage 1: 數值求解器（Householder QR + 條件數檢查）
// ═══════════════════════════════════════════════════════════════

/**
 * Householder QR 分解
 *
 * 分解 A = Q R，其中 Q 為正交矩陣，R 為上三角矩陣。
 * 使用 Householder reflections 實作。
 *
 * 參考：Golub & Van Loan, "Matrix Computations", Chapter 5.2
 *
 * @param A - m×n 矩陣（row-major, 會被修改為 R 的上三角部分）
 * @param m - 行數
 * @param n - 列數
 * @returns { Q: Float64Array (m×m), R: Float64Array (m×n) }
 */
function householderQR(
  A: Float64Array,
  m: number,
  n: number
): { Q: Float64Array; R: Float64Array } {
  // 工作副本
  const R = new Float64Array(A);
  // Q 初始化為單位矩陣
  const Q = new Float64Array(m * m);
  for (let i = 0; i < m; i++) Q[i * m + i] = 1.0;

  const minMN = Math.min(m, n);

  for (let k = 0; k < minMN; k++) {
    // 提取 R[k:m, k] 列向量
    const vLen = m - k;
    const v = new Float64Array(vLen);
    for (let i = 0; i < vLen; i++) {
      v[i] = R[(k + i) * n + k];
    }

    // 計算 ||v||
    let norm = 0;
    for (let i = 0; i < vLen; i++) norm += v[i] * v[i];
    norm = Math.sqrt(norm);

    if (norm < 1e-15) continue;

    // Householder vector: v[0] += sign(v[0]) * ||v||
    const sign = v[0] >= 0 ? 1 : -1;
    v[0] += sign * norm;

    // 正規化 v
    let vNorm = 0;
    for (let i = 0; i < vLen; i++) vNorm += v[i] * v[i];
    vNorm = Math.sqrt(vNorm);
    if (vNorm < 1e-15) continue;
    for (let i = 0; i < vLen; i++) v[i] /= vNorm;

    // 更新 R: R[k:m, k:n] -= 2 * v * (v^T * R[k:m, k:n])
    for (let j = k; j < n; j++) {
      let dot = 0;
      for (let i = 0; i < vLen; i++) {
        dot += v[i] * R[(k + i) * n + j];
      }
      for (let i = 0; i < vLen; i++) {
        R[(k + i) * n + j] -= 2 * v[i] * dot;
      }
    }

    // 更新 Q: Q[:, k:m] -= 2 * (Q[:, k:m] * v) * v^T
    for (let i = 0; i < m; i++) {
      let dot = 0;
      for (let j = 0; j < vLen; j++) {
        dot += Q[i * m + (k + j)] * v[j];
      }
      for (let j = 0; j < vLen; j++) {
        Q[i * m + (k + j)] -= 2 * dot * v[j];
      }
    }
  }

  return { Q, R };
}

/**
 * 使用 QR 分解求解線性系統 Ax = b
 *
 * A = QR → Rx = Q^T b → back-substitution
 *
 * @param A_orig - n×n 係數矩陣
 * @param b_orig - 右側向量
 * @param n - 矩陣維度
 * @returns 解向量，或 null
 */
function solveQR(
  A_orig: Float64Array,
  b_orig: Float64Array,
  n: number
): Float64Array | null {
  const { Q, R } = householderQR(new Float64Array(A_orig), n, n);

  // Q^T b
  const Qtb = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) {
      sum += Q[j * n + i] * b_orig[j]; // Q^T[i][j] = Q[j][i]
    }
    Qtb[i] = sum;
  }

  // Back-substitution: Rx = Q^T b
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    const diag = R[i * n + i];
    if (Math.abs(diag) < 1e-14) return null; // 奇異
    let sum = Qtb[i];
    for (let j = i + 1; j < n; j++) {
      sum -= R[i * n + j] * x[j];
    }
    x[i] = sum / diag;
  }

  // 檢查 NaN
  for (let i = 0; i < n; i++) {
    if (!isFinite(x[i])) return null;
  }

  return x;
}

/**
 * Gauss-Jordan 消去法（fallback 求解器）
 *
 * 只在 QR 分解失敗時使用。
 */
function solveGaussJordan(
  A_orig: Float64Array,
  b_orig: Float64Array,
  n: number
): Float64Array | null {
  console.warn('[NURBSFitter] [WARNING] Using fallback Gauss-Jordan solver');

  const A = new Float64Array(A_orig);
  const b = new Float64Array(b_orig);

  for (let col = 0; col < n; col++) {
    let maxVal = Math.abs(A[col * n + col]);
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      const val = Math.abs(A[row * n + col]);
      if (val > maxVal) { maxVal = val; maxRow = row; }
    }
    if (maxVal < 1e-14) return null;

    if (maxRow !== col) {
      for (let j = 0; j < n; j++) {
        const tmp = A[col * n + j]; A[col * n + j] = A[maxRow * n + j]; A[maxRow * n + j] = tmp;
      }
      const tmpB = b[col]; b[col] = b[maxRow]; b[maxRow] = tmpB;
    }

    const pivot = A[col * n + col];
    for (let row = col + 1; row < n; row++) {
      const factor = A[row * n + col] / pivot;
      for (let j = col; j < n; j++) A[row * n + j] -= factor * A[col * n + j];
      b[row] -= factor * b[col];
    }
  }

  const x = new Float64Array(n);
  for (let row = n - 1; row >= 0; row--) {
    let sum = b[row];
    for (let j = row + 1; j < n; j++) sum -= A[row * n + j] * x[j];
    x[row] = sum / A[row * n + row];
  }

  for (let i = 0; i < n; i++) {
    if (!isFinite(x[i])) return null;
  }
  return x;
}

/**
 * 計算 N^T N 的條件數估計（對角元素最大/最小比值）
 */
function estimateConditionNumber(NtN: Float64Array, n: number): number {
  let maxDiag = 0;
  let minDiag = Infinity;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(NtN[i * n + i]);
    if (d > maxDiag) maxDiag = d;
    if (d < minDiag && d > 0) minDiag = d;
  }
  if (minDiag === 0 || minDiag === Infinity) return Infinity;
  return maxDiag / minDiag;
}

/**
 * 對 N^T N 加入 Tikhonov regularization
 */
function applyTikhonov(NtN: Float64Array, n: number, lambda: number): void {
  for (let i = 0; i < n; i++) {
    NtN[i * n + i] += lambda;
  }
}

/**
 * 求解線性系統，帶條件數檢查和多層 fallback
 *
 * @returns { solution, report }
 */
function solveWithReport(
  NtN: Float64Array,
  rhs: Float64Array,
  n: number
): { solution: Float64Array | null; report: NURBSFittingReport } {
  const report: NURBSFittingReport = {
    conditionNumber: 0,
    tikhonovLambda: 0,
    solverUsed: 'qr',
    hasNaN: false,
    outOfBounds: false,
  };

  // 條件數檢查
  const condNum = estimateConditionNumber(NtN, n);
  report.conditionNumber = condNum;

  // 若條件數過大，加入 Tikhonov regularization
  if (condNum > 1e8) {
    const lambda = 1e-6;
    report.tikhonovLambda = lambda;
    applyTikhonov(NtN, n, lambda);
    console.log(`[NURBSFitter] Condition number ${condNum.toExponential(2)} > 1e8, applying Tikhonov λ=${lambda}`);
  }

  // 嘗試 QR 求解
  let solution = solveQR(NtN, rhs, n);
  if (solution) {
    report.solverUsed = 'qr';
    return { solution, report };
  }

  // QR 失敗，嘗試 Gauss-Jordan fallback
  solution = solveGaussJordan(NtN, rhs, n);
  report.solverUsed = 'gauss_jordan_fallback';

  return { solution, report };
}

// ═══════════════════════════════════════════════════════════════
//  B-spline Basis Functions（Cox-de Boor 遞推）
// ═══════════════════════════════════════════════════════════════

/**
 * 計算 B-spline basis function Nᵢ,ₚ(t)
 */
function basisFunction(i: number, p: number, t: number, knots: number[]): number {
  if (p === 0) {
    if (i === knots.length - p - 2 && t === knots[knots.length - 1]) return 1.0;
    return (t >= knots[i] && t < knots[i + 1]) ? 1.0 : 0.0;
  }

  let result = 0;
  const denom1 = knots[i + p] - knots[i];
  if (Math.abs(denom1) > 1e-12) {
    result += ((t - knots[i]) / denom1) * basisFunction(i, p - 1, t, knots);
  }
  const denom2 = knots[i + p + 1] - knots[i + 1];
  if (Math.abs(denom2) > 1e-12) {
    result += ((knots[i + p + 1] - t) / denom2) * basisFunction(i + 1, p - 1, t, knots);
  }
  return result;
}

/**
 * 計算所有 basis functions 在參數 t 處的值
 */
function allBasisFunctions(n: number, p: number, t: number, knots: number[]): Float64Array {
  const N = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    N[i] = basisFunction(i, p, t, knots);
  }
  return N;
}

// ═══════════════════════════════════════════════════════════════
//  Knot Vector 生成
// ═══════════════════════════════════════════════════════════════

/**
 * 生成 clamped uniform knot vector
 */
function generateClampedKnots(n: number, p: number): number[] {
  const m = n + p + 1;
  const knots: number[] = [];
  for (let i = 0; i < m; i++) {
    if (i <= p) knots.push(0);
    else if (i >= m - p - 1) knots.push(1);
    else knots.push((i - p) / (n - p));
  }
  return knots;
}

// ═══════════════════════════════════════════════════════════════
//  Stage 2: Region Growing Patch 分群
// ═══════════════════════════════════════════════════════════════

/**
 * 計算三角形面法向和面積
 */
function computeTriangleNormalAndArea(
  mesh: DCMeshData,
  triIdx: number
): { normal: Vec3; area: number } {
  const i0 = mesh.indices[triIdx * 3];
  const i1 = mesh.indices[triIdx * 3 + 1];
  const i2 = mesh.indices[triIdx * 3 + 2];

  const v0x = mesh.positions[i0 * 3], v0y = mesh.positions[i0 * 3 + 1], v0z = mesh.positions[i0 * 3 + 2];
  const v1x = mesh.positions[i1 * 3], v1y = mesh.positions[i1 * 3 + 1], v1z = mesh.positions[i1 * 3 + 2];
  const v2x = mesh.positions[i2 * 3], v2y = mesh.positions[i2 * 3 + 1], v2z = mesh.positions[i2 * 3 + 2];

  const e1x = v1x - v0x, e1y = v1y - v0y, e1z = v1z - v0z;
  const e2x = v2x - v0x, e2y = v2y - v0y, e2z = v2z - v0z;

  let nx = e1y * e2z - e1z * e2y;
  let ny = e1z * e2x - e1x * e2z;
  let nz = e1x * e2y - e1y * e2x;
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz);

  if (len < 1e-12) {
    return { normal: { x: 0, y: 1, z: 0 }, area: 0 };
  }

  return {
    normal: { x: nx / len, y: ny / len, z: nz / len },
    area: len * 0.5,
  };
}

/**
 * 建立三角形鄰接表
 *
 * 兩個三角形共享一條邊（兩個頂點）則為鄰接。
 */
function buildTriangleAdjacency(mesh: DCMeshData): Map<number, number[]> {
  const numTris = mesh.indices.length / 3;
  const edgeToTris = new Map<string, number[]>();

  for (let t = 0; t < numTris; t++) {
    const verts = [
      mesh.indices[t * 3],
      mesh.indices[t * 3 + 1],
      mesh.indices[t * 3 + 2],
    ];
    // 3 條邊
    for (let e = 0; e < 3; e++) {
      const a = Math.min(verts[e], verts[(e + 1) % 3]);
      const b = Math.max(verts[e], verts[(e + 1) % 3]);
      const key = `${a}-${b}`;
      const list = edgeToTris.get(key);
      if (list) list.push(t);
      else edgeToTris.set(key, [t]);
    }
  }

  const adj = new Map<number, number[]>();
  for (let t = 0; t < numTris; t++) adj.set(t, []);

  edgeToTris.forEach(tris => {
    for (let i = 0; i < tris.length; i++) {
      for (let j = i + 1; j < tris.length; j++) {
        adj.get(tris[i])!.push(tris[j]);
        adj.get(tris[j])!.push(tris[i]);
      }
    }
  });

  return adj;
}

/**
 * Region Growing Patch 分群
 *
 * 演算法：
 *   1. 從未分群的面片中取一個 seed face
 *   2. BFS 擴展到相鄰面片，條件：法向夾角 < angleThreshold
 *   3. 連通區域算成一個 patch
 *   4. 面片數低於 minPatchSize 的 patch 合併到最近鄰 patch
 *   5. 相鄰 patch 主法向夾角 < 10° 時嘗試合併
 *
 * @param mesh - DC 網格
 * @param angleThreshold - 法向夾角閾值（度，預設 30）
 * @param minPatchSize - 最小 patch 面片數（預設 4）
 */
function segmentPatches(
  mesh: DCMeshData,
  angleThreshold: number = 30,
  minPatchSize: number = 4
): MeshPatch[] {
  const numTris = mesh.indices.length / 3;
  if (numTris === 0) return [];

  const cosThreshold = Math.cos(angleThreshold * Math.PI / 180);
  const cosMergeThreshold = Math.cos(10 * Math.PI / 180); // 10° 合併閾值

  // 預計算所有三角形法向和面積
  const triNormals: Vec3[] = [];
  const triAreas: number[] = [];
  for (let t = 0; t < numTris; t++) {
    const { normal, area } = computeTriangleNormalAndArea(mesh, t);
    triNormals.push(normal);
    triAreas.push(area);
  }

  // 建立鄰接表
  const adj = buildTriangleAdjacency(mesh);

  // Region Growing
  const assigned = new Int32Array(numTris).fill(-1);
  const rawPatches: { triIndices: number[] }[] = [];

  for (let seed = 0; seed < numTris; seed++) {
    if (assigned[seed] >= 0) continue;
    if (triAreas[seed] < 1e-12) continue; // 退化三角形

    const patchId = rawPatches.length;
    const patchTris: number[] = [seed];
    assigned[seed] = patchId;

    const seedNormal = triNormals[seed];
    const queue: number[] = [seed];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = adj.get(current) || [];

      for (const neighbor of neighbors) {
        if (assigned[neighbor] >= 0) continue;
        if (triAreas[neighbor] < 1e-12) continue;

        // 檢查法向夾角
        const nn = triNormals[neighbor];
        const dot = seedNormal.x * nn.x + seedNormal.y * nn.y + seedNormal.z * nn.z;

        if (dot >= cosThreshold) {
          assigned[neighbor] = patchId;
          patchTris.push(neighbor);
          queue.push(neighbor);
        }
      }
    }

    rawPatches.push({ triIndices: patchTris });
  }

  // 合併太小的 patch 到最近鄰
  const patchNormals: Vec3[] = rawPatches.map((p, idx) => {
    return computePatchAverageNormal(p.triIndices, triNormals, triAreas);
  });

  // 找太小的 patch 並合併
  const mergedTo = new Int32Array(rawPatches.length);
  for (let i = 0; i < mergedTo.length; i++) mergedTo[i] = i;

  for (let i = 0; i < rawPatches.length; i++) {
    if (rawPatches[i].triIndices.length >= minPatchSize) continue;

    // 找最近鄰的大 patch
    let bestTarget = -1;
    let bestDot = -Infinity;
    const myNormal = patchNormals[i];

    for (let j = 0; j < rawPatches.length; j++) {
      if (i === j) continue;
      if (rawPatches[j].triIndices.length < minPatchSize) continue;

      const dot = myNormal.x * patchNormals[j].x +
                  myNormal.y * patchNormals[j].y +
                  myNormal.z * patchNormals[j].z;
      if (dot > bestDot) {
        bestDot = dot;
        bestTarget = j;
      }
    }

    if (bestTarget >= 0) {
      mergedTo[i] = bestTarget;
    }
  }

  // 解析合併鏈
  function findRoot(i: number): number {
    while (mergedTo[i] !== i) i = mergedTo[i];
    return i;
  }

  // 重建 patches
  const mergedPatchMap = new Map<number, number[]>();
  for (let i = 0; i < rawPatches.length; i++) {
    const root = findRoot(i);
    const list = mergedPatchMap.get(root);
    if (list) list.push(...rawPatches[i].triIndices);
    else mergedPatchMap.set(root, [...rawPatches[i].triIndices]);
  }

  // 嘗試合併相鄰 patch（主法向夾角 < 10°）
  let patchEntries = Array.from(mergedPatchMap.entries());

  // 建立 patch 間鄰接關係
  const patchAdj = new Map<number, Set<number>>();
  for (const [pid] of patchEntries) patchAdj.set(pid, new Set());

  // 重新計算 assigned
  const finalAssigned = new Int32Array(numTris).fill(-1);
  for (const [pid, tris] of patchEntries) {
    for (const t of tris) finalAssigned[t] = pid;
  }

  for (let t = 0; t < numTris; t++) {
    const myPatch = finalAssigned[t];
    if (myPatch < 0) continue;
    const neighbors = adj.get(t) || [];
    for (const n of neighbors) {
      const nPatch = finalAssigned[n];
      if (nPatch >= 0 && nPatch !== myPatch) {
        patchAdj.get(myPatch)?.add(nPatch);
        patchAdj.get(nPatch)?.add(myPatch);
      }
    }
  }

  // 合併相似法向的相鄰 patch
  const patchNormalsMap = new Map<number, Vec3>();
  for (const [pid, tris] of patchEntries) {
    patchNormalsMap.set(pid, computePatchAverageNormal(tris, triNormals, triAreas));
  }

  let merged = true;
  while (merged) {
    merged = false;
    for (const [pidA, neighborsA] of patchAdj) {
      const normA = patchNormalsMap.get(pidA);
      if (!normA) continue;
      const trisA = mergedPatchMap.get(pidA);
      if (!trisA) continue;

      for (const pidB of neighborsA) {
        const normB = patchNormalsMap.get(pidB);
        if (!normB) continue;
        const trisB = mergedPatchMap.get(pidB);
        if (!trisB) continue;

        const dot = normA.x * normB.x + normA.y * normB.y + normA.z * normB.z;
        if (dot >= cosMergeThreshold) {
          // 合併 B 到 A
          trisA.push(...trisB);
          mergedPatchMap.delete(pidB);
          patchNormalsMap.set(pidA,
            computePatchAverageNormal(trisA, triNormals, triAreas));
          patchNormalsMap.delete(pidB);

          // 更新鄰接
          const neighborsB = patchAdj.get(pidB);
          if (neighborsB) {
            for (const nb of neighborsB) {
              if (nb !== pidA) {
                neighborsA.add(nb);
                patchAdj.get(nb)?.delete(pidB);
                patchAdj.get(nb)?.add(pidA);
              }
            }
          }
          patchAdj.delete(pidB);
          neighborsA.delete(pidB);

          merged = true;
          break;
        }
      }
      if (merged) break;
    }
  }

  // 建立最終 MeshPatch 陣列
  const finalPatches: MeshPatch[] = [];
  for (const [, tris] of mergedPatchMap) {
    if (tris.length === 0) continue;

    const vertexSet = new Set<number>();
    for (const t of tris) {
      vertexSet.add(mesh.indices[t * 3]);
      vertexSet.add(mesh.indices[t * 3 + 1]);
      vertexSet.add(mesh.indices[t * 3 + 2]);
    }

    finalPatches.push({
      triangleFaceIndices: tris,
      vertexIndices: Array.from(vertexSet),
      averageNormal: computePatchAverageNormal(tris, triNormals, triAreas),
    });
  }

  // 如果沒有有效 patch，建立一個包含所有三角形的 patch
  if (finalPatches.length === 0 && numTris > 0) {
    const allVerts = new Set<number>();
    const allTris: number[] = [];
    for (let t = 0; t < numTris; t++) {
      allTris.push(t);
      allVerts.add(mesh.indices[t * 3]);
      allVerts.add(mesh.indices[t * 3 + 1]);
      allVerts.add(mesh.indices[t * 3 + 2]);
    }
    finalPatches.push({
      triangleFaceIndices: allTris,
      vertexIndices: Array.from(allVerts),
      averageNormal: { x: 0, y: 1, z: 0 },
    });
  }

  console.log(`[NURBSFitter] Region growing: ${numTris} triangles → ${finalPatches.length} patches`);
  return finalPatches;
}

/**
 * 計算 patch 的面積加權平均法向
 */
function computePatchAverageNormal(
  triIndices: number[],
  triNormals: Vec3[],
  triAreas: number[]
): Vec3 {
  let nx = 0, ny = 0, nz = 0;
  for (const t of triIndices) {
    const a = triAreas[t];
    nx += triNormals[t].x * a;
    ny += triNormals[t].y * a;
    nz += triNormals[t].z * a;
  }
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (len < 1e-12) return { x: 0, y: 1, z: 0 };
  return { x: nx / len, y: ny / len, z: nz / len };
}

// ═══════════════════════════════════════════════════════════════
//  Stage 3: PCA 主軸投影 UV 參數化
// ═══════════════════════════════════════════════════════════════

/**
 * 3×3 對稱矩陣特徵值分解（Jacobi 迭代法）
 *
 * 適用於 covariance matrix 的特徵值/特徵向量計算。
 *
 * @param cov - 3×3 對稱矩陣（row-major）
 * @returns { eigenvalues: [λ1, λ2, λ3], eigenvectors: [e1, e2, e3] }，降序排列
 */
function eigenDecomposition3x3(
  cov: number[]
): { eigenvalues: [number, number, number]; eigenvectors: [Vec3, Vec3, Vec3] } {
  // 複製
  const a = [...cov];
  // 特徵向量初始化為單位矩陣
  const V = [1, 0, 0, 0, 1, 0, 0, 0, 1];

  const maxIter = 50;
  for (let iter = 0; iter < maxIter; iter++) {
    // 找最大非對角元素
    let maxOff = 0;
    let p = 0, q = 1;
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        const val = Math.abs(a[i * 3 + j]);
        if (val > maxOff) {
          maxOff = val;
          p = i; q = j;
        }
      }
    }

    if (maxOff < 1e-12) break;

    // Jacobi rotation
    const app = a[p * 3 + p];
    const aqq = a[q * 3 + q];
    const apq = a[p * 3 + q];

    let theta: number;
    if (Math.abs(app - aqq) < 1e-15) {
      theta = Math.PI / 4;
    } else {
      theta = 0.5 * Math.atan2(2 * apq, app - aqq);
    }

    const c = Math.cos(theta);
    const s = Math.sin(theta);

    // 更新 A = G^T A G
    const newA = [...a];
    newA[p * 3 + p] = c * c * app + 2 * s * c * apq + s * s * aqq;
    newA[q * 3 + q] = s * s * app - 2 * s * c * apq + c * c * aqq;
    newA[p * 3 + q] = 0;
    newA[q * 3 + p] = 0;

    for (let i = 0; i < 3; i++) {
      if (i === p || i === q) continue;
      const aip = a[i * 3 + p];
      const aiq = a[i * 3 + q];
      newA[i * 3 + p] = c * aip + s * aiq;
      newA[p * 3 + i] = newA[i * 3 + p];
      newA[i * 3 + q] = -s * aip + c * aiq;
      newA[q * 3 + i] = newA[i * 3 + q];
    }

    for (let i = 0; i < 9; i++) a[i] = newA[i];

    // 更新特徵向量
    const newV = [...V];
    for (let i = 0; i < 3; i++) {
      newV[i * 3 + p] = c * V[i * 3 + p] + s * V[i * 3 + q];
      newV[i * 3 + q] = -s * V[i * 3 + p] + c * V[i * 3 + q];
    }
    for (let i = 0; i < 9; i++) V[i] = newV[i];
  }

  // 提取特徵值和特徵向量
  const eigenvalues: [number, number, number] = [a[0], a[4], a[8]];
  const eigenvectors: [Vec3, Vec3, Vec3] = [
    { x: V[0], y: V[3], z: V[6] },
    { x: V[1], y: V[4], z: V[7] },
    { x: V[2], y: V[5], z: V[8] },
  ];

  // 按特徵值降序排列
  const indices = [0, 1, 2].sort((a, b) => eigenvalues[b] - eigenvalues[a]);
  const sortedEV: [number, number, number] = [
    eigenvalues[indices[0]], eigenvalues[indices[1]], eigenvalues[indices[2]],
  ];
  const sortedVec: [Vec3, Vec3, Vec3] = [
    eigenvectors[indices[0]], eigenvectors[indices[1]], eigenvectors[indices[2]],
  ];

  return { eigenvalues: sortedEV, eigenvectors: sortedVec };
}

/**
 * PCA 主軸投影 UV 參數化
 *
 * Step 1: 計算 patch 頂點的 covariance matrix
 * Step 2: 取兩個最大特徵向量作為 U, V 主軸
 * Step 3: 投影並標準化到 [0,1]²
 * Step 4: 品質評估（特徵值比）
 *
 * @param mesh - DC 網格
 * @param patch - 要參數化的 patch
 * @returns PatchWithUV
 */
function parameterizePatch(mesh: DCMeshData, patch: MeshPatch): PatchWithUV {
  const { vertexIndices } = patch;
  const numPts = vertexIndices.length;

  // 收集頂點
  const points: Vec3[] = [];
  for (const vi of vertexIndices) {
    points.push({
      x: mesh.positions[vi * 3],
      y: mesh.positions[vi * 3 + 1],
      z: mesh.positions[vi * 3 + 2],
    });
  }

  // Step 1: 計算質心
  let cx = 0, cy = 0, cz = 0;
  for (const p of points) { cx += p.x; cy += p.y; cz += p.z; }
  cx /= numPts; cy /= numPts; cz /= numPts;

  // Step 2: 計算 covariance matrix
  const cov = [0, 0, 0, 0, 0, 0, 0, 0, 0]; // 3×3 row-major
  for (const p of points) {
    const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
    cov[0] += dx * dx; cov[1] += dx * dy; cov[2] += dx * dz;
    cov[3] += dy * dx; cov[4] += dy * dy; cov[5] += dy * dz;
    cov[6] += dz * dx; cov[7] += dz * dy; cov[8] += dz * dz;
  }

  // Step 3: 特徵值分解
  const { eigenvalues, eigenvectors } = eigenDecomposition3x3(cov);

  const e1 = eigenvectors[0]; // 最大特徵值方向 → U 軸
  const e2 = eigenvectors[1]; // 第二大特徵值方向 → V 軸

  // 正規化特徵向量
  const normalize = (v: Vec3): Vec3 => {
    const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    if (len < 1e-12) return { x: 1, y: 0, z: 0 };
    return { x: v.x / len, y: v.y / len, z: v.z / len };
  };

  const ne1 = normalize(e1);
  const ne2 = normalize(e2);

  // Step 4: 投影到 PCA 主軸
  const uCoords = new Float64Array(numPts);
  const vCoords = new Float64Array(numPts);

  for (let k = 0; k < numPts; k++) {
    const dx = points[k].x - cx;
    const dy = points[k].y - cy;
    const dz = points[k].z - cz;
    uCoords[k] = dx * ne1.x + dy * ne1.y + dz * ne1.z;
    vCoords[k] = dx * ne2.x + dy * ne2.y + dz * ne2.z;
  }

  // Step 5: 標準化到 [0,1]²
  let uMin = Infinity, uMax = -Infinity;
  let vMin = Infinity, vMax = -Infinity;
  for (let k = 0; k < numPts; k++) {
    if (uCoords[k] < uMin) uMin = uCoords[k];
    if (uCoords[k] > uMax) uMax = uCoords[k];
    if (vCoords[k] < vMin) vMin = vCoords[k];
    if (vCoords[k] > vMax) vMax = vCoords[k];
  }

  const uRange = uMax - uMin || 1;
  const vRange = vMax - vMin || 1;

  for (let k = 0; k < numPts; k++) {
    uCoords[k] = Math.max(0, Math.min(1, (uCoords[k] - uMin) / uRange));
    vCoords[k] = Math.max(0, Math.min(1, (vCoords[k] - vMin) / vRange));
  }

  // Step 6: 品質評估
  const ev1 = Math.abs(eigenvalues[0]);
  const ev2 = Math.abs(eigenvalues[1]);
  const eigenRatio = ev2 > 1e-12 ? ev1 / ev2 : Infinity;
  const paramQuality: 'good' | 'poor' = eigenRatio > 100 ? 'poor' : 'good';

  if (paramQuality === 'poor') {
    console.log(`[NURBSFitter] Patch parameterization quality: poor (eigenRatio=${eigenRatio.toFixed(1)})`);
  }

  return {
    patch,
    uCoords,
    vCoords,
    points,
    e1: ne1,
    e2: ne2,
    paramQuality,
    eigenRatio,
  };
}

// ═══════════════════════════════════════════════════════════════
//  Least Squares NURBS 擬合（使用 QR 求解器）
// ═══════════════════════════════════════════════════════════════

/**
 * 對單個 patch 進行 Least Squares NURBS 擬合
 *
 * // === APPROXIMATE NURBS FITTING (Least Squares, not TRF) ===
 *
 * 使用 Householder QR 分解求解正規方程。
 */
function fitPatchLeastSquares(
  patchUV: PatchWithUV,
  degreeU: number,
  degreeV: number,
  cpU: number,
  cpV: number
): { surface: NURBSSurface | null; report: NURBSFittingReport } {
  const { uCoords, vCoords, points } = patchUV;
  const numPts = points.length;
  const numCP = cpU * cpV;

  const emptyReport: NURBSFittingReport = {
    conditionNumber: 0, tikhonovLambda: 0,
    solverUsed: 'qr', hasNaN: false, outOfBounds: false,
  };

  if (numPts < numCP) {
    return { surface: null, report: emptyReport };
  }

  // 建立 knot vectors
  const knotsU = generateClampedKnots(cpU, degreeU);
  const knotsV = generateClampedKnots(cpV, degreeV);

  // 組裝 N^T N 和 N^T P
  const NtN = new Float64Array(numCP * numCP);
  const NtPx = new Float64Array(numCP);
  const NtPy = new Float64Array(numCP);
  const NtPz = new Float64Array(numCP);

  for (let k = 0; k < numPts; k++) {
    const Nu = allBasisFunctions(cpU, degreeU, uCoords[k], knotsU);
    const Nv = allBasisFunctions(cpV, degreeV, vCoords[k], knotsV);

    const basis = new Float64Array(numCP);
    for (let i = 0; i < cpU; i++) {
      for (let j = 0; j < cpV; j++) {
        basis[i * cpV + j] = Nu[i] * Nv[j];
      }
    }

    for (let a = 0; a < numCP; a++) {
      if (Math.abs(basis[a]) < 1e-15) continue;
      for (let b = a; b < numCP; b++) {
        const val = basis[a] * basis[b];
        NtN[a * numCP + b] += val;
        if (a !== b) NtN[b * numCP + a] += val;
      }
      NtPx[a] += basis[a] * points[k].x;
      NtPy[a] += basis[a] * points[k].y;
      NtPz[a] += basis[a] * points[k].z;
    }
  }

  // 求解（帶條件數檢查）
  // 需要 3 份 NtN 副本（因為求解會修改矩陣）
  const NtN_x = new Float64Array(NtN);
  const NtN_y = new Float64Array(NtN);
  const NtN_z = new Float64Array(NtN);

  const { solution: cpX, report: reportX } = solveWithReport(NtN_x, NtPx, numCP);
  const { solution: cpY } = solveWithReport(NtN_y, NtPy, numCP);
  const { solution: cpZ } = solveWithReport(NtN_z, NtPz, numCP);

  if (!cpX || !cpY || !cpZ) {
    return { surface: null, report: reportX };
  }

  // 組裝 NURBSSurface
  const controlPoints: Vec3[][] = [];
  for (let i = 0; i < cpU; i++) {
    const row: Vec3[] = [];
    for (let j = 0; j < cpV; j++) {
      const idx = i * cpV + j;
      row.push({ x: cpX[idx], y: cpY[idx], z: cpZ[idx] });
    }
    controlPoints.push(row);
  }

  const weights = controlPoints.map(row => row.map(() => 1.0));

  const surface: NURBSSurface = {
    id: `nurbs_ls_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    controlPoints,
    degree: degreeU,
    knotsU,
    knotsV,
    weights,
  };

  return { surface, report: reportX };
}

/**
 * 驗證 NURBS patch 的控制點品質
 *
 * 檢查：
 *   1. NaN / Infinity
 *   2. 控制點是否在 patch bounding box 的 3 倍範圍內
 *
 * @returns maxError（控制點偏離 bounding box 的最大距離），-1 表示驗證失敗
 */
function validateNURBSPatch(
  surface: NURBSSurface,
  patchPoints: Vec3[]
): { valid: boolean; maxError: number; hasNaN: boolean; outOfBounds: boolean } {
  // 檢查 NaN / Infinity
  for (const row of surface.controlPoints) {
    for (const pt of row) {
      if (!isFinite(pt.x) || !isFinite(pt.y) || !isFinite(pt.z)) {
        return { valid: false, maxError: Infinity, hasNaN: true, outOfBounds: false };
      }
    }
  }

  // 計算 patch bounding box
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (const p of patchPoints) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
  }

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const rangeZ = maxZ - minZ || 1;
  const margin = 3.0; // 3 倍範圍

  let maxError = 0;
  let outOfBounds = false;

  for (const row of surface.controlPoints) {
    for (const pt of row) {
      const dx = Math.max(0, (pt.x - maxX) / rangeX, (minX - pt.x) / rangeX);
      const dy = Math.max(0, (pt.y - maxY) / rangeY, (minY - pt.y) / rangeY);
      const dz = Math.max(0, (pt.z - maxZ) / rangeZ, (minZ - pt.z) / rangeZ);
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > maxError) maxError = dist;
      if (dist > margin) outOfBounds = true;
    }
  }

  return { valid: !outOfBounds, maxError, hasNaN: false, outOfBounds };
}

// ═══════════════════════════════════════════════════════════════
//  Fallback：加權平均擬合
// ═══════════════════════════════════════════════════════════════

/**
 * Fallback NURBS 擬合（加權平均高度法）
 *
 * // === APPROXIMATE NURBS FITTING (Weighted Average, not TRF) ===
 */
function fitPatchFallback(
  patchUV: PatchWithUV,
  degreeU: number,
  degreeV: number,
  cpU: number,
  cpV: number
): NURBSSurface {
  const { uCoords, vCoords, points } = patchUV;

  const controlPoints: Vec3[][] = [];
  for (let i = 0; i < cpU; i++) {
    const row: Vec3[] = [];
    for (let j = 0; j < cpV; j++) {
      const targetU = i / (cpU - 1);
      const targetV = j / (cpV - 1);

      let wx = 0, wy = 0, wz = 0, wTotal = 0;
      for (let k = 0; k < points.length; k++) {
        const du = uCoords[k] - targetU;
        const dv = vCoords[k] - targetV;
        const dist = Math.sqrt(du * du + dv * dv) + 0.01;
        const w = 1.0 / (dist * dist);
        wx += points[k].x * w;
        wy += points[k].y * w;
        wz += points[k].z * w;
        wTotal += w;
      }

      row.push({
        x: wTotal > 0 ? wx / wTotal : 0,
        y: wTotal > 0 ? wy / wTotal : 0,
        z: wTotal > 0 ? wz / wTotal : 0,
      });
    }
    controlPoints.push(row);
  }

  const knotsU = generateClampedKnots(cpU, degreeU);
  const knotsV = generateClampedKnots(cpV, degreeV);
  const weights = controlPoints.map(row => row.map(() => 1.0));

  return {
    id: `nurbs_fallback_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    controlPoints,
    degree: degreeU,
    knotsU,
    knotsV,
    weights,
  };
}

// ═══════════════════════════════════════════════════════════════
//  Stage 4: 三層重試機制
// ═══════════════════════════════════════════════════════════════

/**
 * 對單個 patch 進行三層重試擬合
 *
 * 第一次：正常 least-squares
 * 第二次：增加控制點數量（cpU+2, cpV+2）
 * 第三次：降低 degree（p=1, q=1）
 * 全失敗：fallback weighted average
 *
 * @param errorThreshold - 最大可接受誤差（預設 2.0）
 */
function fitPatchWithRetry(
  mesh: DCMeshData,
  patchUV: PatchWithUV,
  degreeU: number,
  degreeV: number,
  cpU: number,
  cpV: number,
  errorThreshold: number = 2.0
): NURBSPatch {
  const { points, paramQuality } = patchUV;

  // 如果參數化品質差，直接使用 fallback
  if (paramQuality === 'poor') {
    console.log(`[NURBSFitter] Patch skipped (poor parameterization, eigenRatio=${patchUV.eigenRatio.toFixed(1)})`);
    const fallbackSurface = fitPatchFallback(patchUV, degreeU, degreeV, cpU, cpV);
    return {
      ...fallbackSurface,
      isApproximate: true,
      fallbackReason: `Poor UV parameterization (eigenRatio=${patchUV.eigenRatio.toFixed(1)})`,
      maxError: Infinity,
      conditionNumber: 0,
      tikhonovLambda: 0,
    };
  }

  // ─── 第一次嘗試：正常 least-squares ───
  {
    const effectiveCpU = Math.max(degreeU + 1, cpU);
    const effectiveCpV = Math.max(degreeV + 1, cpV);

    if (points.length >= effectiveCpU * effectiveCpV) {
      const { surface, report } = fitPatchLeastSquares(
        patchUV, degreeU, degreeV, effectiveCpU, effectiveCpV
      );

      if (surface) {
        const validation = validateNURBSPatch(surface, points);
        if (validation.valid && validation.maxError <= errorThreshold) {
          console.log(`[NURBSFitter] Patch fit: attempt 1 success (maxError=${validation.maxError.toFixed(3)})`);
          return {
            ...surface,
            isApproximate: false,
            maxError: validation.maxError,
            conditionNumber: report.conditionNumber,
            tikhonovLambda: report.tikhonovLambda,
          };
        }
      }
    }
  }

  // ─── 第二次嘗試：增加控制點 ───
  {
    const cpU2 = Math.max(degreeU + 1, cpU + 2);
    const cpV2 = Math.max(degreeV + 1, cpV + 2);

    if (points.length >= cpU2 * cpV2) {
      const { surface, report } = fitPatchLeastSquares(
        patchUV, degreeU, degreeV, cpU2, cpV2
      );

      if (surface) {
        const validation = validateNURBSPatch(surface, points);
        if (validation.valid && validation.maxError <= errorThreshold) {
          console.log(`[NURBSFitter] Patch fit: attempt 2 success (cpU+2, cpV+2, maxError=${validation.maxError.toFixed(3)})`);
          return {
            ...surface,
            isApproximate: false,
            maxError: validation.maxError,
            conditionNumber: report.conditionNumber,
            tikhonovLambda: report.tikhonovLambda,
          };
        }
      }
    }
  }

  // ─── 第三次嘗試：降低 degree ───
  {
    const lowDegU = 1;
    const lowDegV = 1;
    const cpU3 = Math.max(lowDegU + 1, cpU);
    const cpV3 = Math.max(lowDegV + 1, cpV);

    if (points.length >= cpU3 * cpV3) {
      const { surface, report } = fitPatchLeastSquares(
        patchUV, lowDegU, lowDegV, cpU3, cpV3
      );

      if (surface) {
        const validation = validateNURBSPatch(surface, points);
        if (validation.valid) {
          console.log(`[NURBSFitter] Patch fit: attempt 3 success (degree=1, maxError=${validation.maxError.toFixed(3)})`);
          return {
            ...surface,
            isApproximate: false,
            maxError: validation.maxError,
            conditionNumber: report.conditionNumber,
            tikhonovLambda: report.tikhonovLambda,
          };
        }
      }
    }
  }

  // ─── 全部失敗：fallback ───
  const reason = 'All 3 fitting attempts failed (LS normal, LS+cp, LS low-degree)';
  console.log(`[NURBSFitter] Patch fit: ${reason}, using fallback`);
  const fallbackSurface = fitPatchFallback(patchUV, degreeU, degreeV, cpU, cpV);

  return {
    ...fallbackSurface,
    isApproximate: true,
    fallbackReason: reason,
    maxError: Infinity,
    conditionNumber: 0,
    tikhonovLambda: 0,
  };
}

// ═══════════════════════════════════════════════════════════════
//  主入口：DC Mesh → NURBS 曲面
// ═══════════════════════════════════════════════════════════════

/**
 * 從 DC 網格擬合 NURBS 曲面
 *
 * // === APPROXIMATE NURBS FITTING (Least Squares, not TRF) ===
 *
 * 完整流程（v2.6 四階段強化版）：
 *   1. Region Growing patch 分群（Stage 2）
 *   2. PCA 主軸 UV 參數化（Stage 3）
 *   3. 三層重試 Least Squares 擬合（Stage 4）
 *   4. Householder QR 求解器（Stage 1）
 *   5. FittingStats 統計
 *
 * @param mesh - DC 網格
 * @param degreeU - U 方向 degree（預設 3）
 * @param degreeV - V 方向 degree（預設 3）
 * @param cpU - U 方向控制點數（預設 8）
 * @param cpV - V 方向控制點數（預設 8）
 * @param angleThreshold - patch 分群角度閾值（度，預設 30）
 * @param onProgress - 進度回調
 * @returns NURBSFitResult
 */
export function fitNURBSFromDCMesh(
  mesh: DCMeshData,
  degreeU: number = 3,
  degreeV: number = 3,
  cpU: number = 8,
  cpV: number = 8,
  angleThreshold: number = 30,
  onProgress?: (progress: number) => void
): NURBSFitResult {
  const startTime = performance.now();

  cpU = Math.max(degreeU + 1, cpU);
  cpV = Math.max(degreeV + 1, cpV);

  if (mesh.positions.length === 0) {
    return {
      surfaces: [],
      verbSurfaces: [],
      patches: [],
      fittingStats: {
        totalPatches: 0, exactPatches: 0, approximatePatches: 0,
        fallbackReasons: [], avgMaxError: 0, worstPatchError: 0,
      },
      stats: { patchCount: 0, totalControlPoints: 0, fitTimeMs: 0, method: 'least_squares' },
    };
  }

  // Step 1: Region Growing patch 分群
  const meshPatches = segmentPatches(mesh, angleThreshold);
  onProgress?.(10);

  // Step 2: PCA UV 參數化
  const patchesWithUV: PatchWithUV[] = meshPatches.map(p => parameterizePatch(mesh, p));
  onProgress?.(20);

  // Step 3: 三層重試擬合
  const nurbsPatches: NURBSPatch[] = [];
  const surfaces: NURBSSurface[] = [];
  const verbSurfaces: unknown[] = [];
  let hasApproximate = false;

  for (let p = 0; p < patchesWithUV.length; p++) {
    const nurbsPatch = fitPatchWithRetry(
      mesh, patchesWithUV[p], degreeU, degreeV, cpU, cpV
    );

    nurbsPatches.push(nurbsPatch);
    surfaces.push(nurbsPatch);
    if (nurbsPatch.isApproximate) hasApproximate = true;

    // 嘗試 verb-nurbs-web
    try {
      const verb = require('verb-nurbs-web');
      const verbCP = nurbsPatch.controlPoints.map(row =>
        row.map(pt => [pt.x, pt.y, pt.z])
      );
      const verbSurf = verb.geom.NurbsSurface.byKnotsControlPointsWeights(
        degreeU, degreeV,
        nurbsPatch.knotsU, nurbsPatch.knotsV,
        verbCP
      );
      verbSurfaces.push(verbSurf);
    } catch {
      verbSurfaces.push(null);
    }

    onProgress?.(20 + ((p + 1) / patchesWithUV.length) * 70);
  }

  onProgress?.(100);

  // 統計
  const fitTimeMs = performance.now() - startTime;
  const totalControlPoints = surfaces.reduce(
    (sum, s) => sum + s.controlPoints.length * (s.controlPoints[0]?.length || 0), 0
  );

  const exactPatches = nurbsPatches.filter(p => !p.isApproximate).length;
  const approximatePatches = nurbsPatches.filter(p => p.isApproximate).length;
  const fallbackReasons = nurbsPatches
    .filter(p => p.isApproximate && p.fallbackReason)
    .map(p => p.fallbackReason!);

  const errors = nurbsPatches
    .filter(p => isFinite(p.maxError))
    .map(p => p.maxError);
  const avgMaxError = errors.length > 0
    ? errors.reduce((a, b) => a + b, 0) / errors.length
    : 0;
  const worstPatchError = errors.length > 0
    ? Math.max(...errors)
    : 0;

  const fittingStats: FittingStats = {
    totalPatches: nurbsPatches.length,
    exactPatches,
    approximatePatches,
    fallbackReasons,
    avgMaxError,
    worstPatchError,
  };

  const method = hasApproximate ? 'weighted_average' as const : 'least_squares' as const;

  console.log(
    `[NURBSFitter] ${nurbsPatches.length} patches ` +
    `(${exactPatches} exact, ${approximatePatches} approximate), ` +
    `${totalControlPoints} control points, ` +
    `avgError=${avgMaxError.toFixed(3)}, worstError=${worstPatchError.toFixed(3)}, ` +
    `${fitTimeMs.toFixed(1)}ms`
  );

  return {
    surfaces,
    verbSurfaces,
    patches: nurbsPatches,
    fittingStats,
    stats: {
      patchCount: nurbsPatches.length,
      totalControlPoints,
      fitTimeMs,
      method,
    },
  };
}
