/**
 * NURBSFitter.ts - DC 網格 → NURBS 曲面擬合
 *
 * // === APPROXIMATE NURBS FITTING (Least Squares, not TRF) ===
 *
 * 本模組從 Dual Contouring 產生的三角網格擬合 NURBS 曲面。
 *
 * 重要聲明：
 *   這是一個「近似 NURBS 擬合」方案，使用 Least Squares 方法，
 *   並非 True Rational Fitting (TRF)。具體限制：
 *     - 參數化使用 XZ 平面投影（適合高度場型曲面）
 *     - 控制點解算使用加權最小二乘法
 *     - 權重固定為 1.0（非有理 NURBS）
 *     - 對於複雜拓撲（環面、自交叉）效果有限
 *
 * 擬合流程：
 *   1. Patch 分群：按法向方向將三角形分為不同 patch
 *   2. 參數化：對每個 patch 沿主要方向投影到 UV 平面
 *   3. B-spline basis 計算：使用 Cox-de Boor 遞推
 *   4. Least Squares 控制點解算：
 *      min Σ‖S(uᵢ,vᵢ) - Pᵢ‖²
 *      其中 S(u,v) = ΣΣ Nᵢ(u)Nⱼ(v) Cᵢⱼ
 *      展開為 (N^T N) C = N^T P 的正規方程
 *   5. 若 verb-nurbs-web 可用，使用其 API 建立 NurbsSurface
 *   6. 否則使用 fallback：加權平均高度 + 均勻 knot vector
 *
 * 參考文獻：
 *   - Piegl, L., Tiller, W. "The NURBS Book" (1997), Chapter 9
 *   - 最小二乘曲面擬合的標準教科書方法
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

/** Patch 分群結果 */
interface SurfacePatch {
  /** Patch 中的頂點索引 */
  vertexIndices: number[];
  /** Patch 中的三角形索引（每 3 個一組） */
  triangleIndices: number[];
  /** 主法向方向 */
  dominantNormal: Vec3;
  /** UV 投影的主軸 */
  uAxis: Vec3;
  vAxis: Vec3;
  /** 法向軸（高度方向） */
  heightAxis: Vec3;
}

/** 擬合結果 */
export interface NURBSFitResult {
  surfaces: NURBSSurface[];
  verbSurfaces: unknown[];
  stats: {
    patchCount: number;
    totalControlPoints: number;
    fitTimeMs: number;
    method: 'least_squares' | 'weighted_average';
  };
}

// ═══════════════════════════════════════════════════════════════
//  B-spline Basis Functions（Cox-de Boor 遞推）
// ═══════════════════════════════════════════════════════════════

/**
 * 計算 B-spline basis function Nᵢ,ₚ(t)
 *
 * 使用 Cox-de Boor 遞推公式：
 *   N_{i,0}(t) = 1 if t_i ≤ t < t_{i+1}, else 0
 *   N_{i,p}(t) = [(t - t_i) / (t_{i+p} - t_i)] N_{i,p-1}(t)
 *              + [(t_{i+p+1} - t) / (t_{i+p+1} - t_{i+1})] N_{i+1,p-1}(t)
 *
 * @param i - basis function 索引
 * @param p - degree
 * @param t - 參數值
 * @param knots - knot vector
 * @returns basis function 值
 */
function basisFunction(i: number, p: number, t: number, knots: number[]): number {
  if (p === 0) {
    // 特殊處理最後一個 knot span
    if (i === knots.length - p - 2 && t === knots[knots.length - 1]) {
      return 1.0;
    }
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
 * 計算所有非零 basis functions 在參數 t 處的值
 *
 * @param n - 控制點數
 * @param p - degree
 * @param t - 參數值 [0, 1]
 * @param knots - knot vector
 * @returns 長度為 n 的陣列，N[i] = N_{i,p}(t)
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
 *
 * 結構：[0,...,0, uniform interior, 1,...,1]
 * 前後各 (degree+1) 個重複 knot
 *
 * @param n - 控制點數
 * @param p - degree
 * @returns knot vector
 */
function generateClampedKnots(n: number, p: number): number[] {
  const m = n + p + 1; // knot vector 長度
  const knots: number[] = [];

  for (let i = 0; i < m; i++) {
    if (i <= p) {
      knots.push(0);
    } else if (i >= m - p - 1) {
      knots.push(1);
    } else {
      knots.push((i - p) / (n - p));
    }
  }

  return knots;
}

// ═══════════════════════════════════════════════════════════════
//  Patch 分群
// ═══════════════════════════════════════════════════════════════

/**
 * 將 DC 網格分為多個 patch
 *
 * 策略：按三角形法向的主方向分群
 *   - 6 個主方向：±X, ±Y, ±Z
 *   - 每個三角形歸入法向最接近的方向
 *   - 合併面數太少的 patch 到最近的大 patch
 *
 * @param mesh - DC 網格
 * @param minPatchTriangles - 最小 patch 三角形數（預設 4）
 * @returns patch 陣列
 */
function segmentPatches(mesh: DCMeshData, minPatchTriangles: number = 4): SurfacePatch[] {
  const numTris = mesh.indices.length / 3;
  if (numTris === 0) return [];

  // 6 個主方向
  const DIRECTIONS: Vec3[] = [
    { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
    { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
  ];

  // UV 投影軸（對應每個法向方向）
  // 法向 X → UV 在 YZ 平面
  // 法向 Y → UV 在 XZ 平面
  // 法向 Z → UV 在 XY 平面
  const UV_AXES: { u: Vec3; v: Vec3; h: Vec3 }[] = [
    { u: { x: 0, y: 1, z: 0 }, v: { x: 0, y: 0, z: 1 }, h: { x: 1, y: 0, z: 0 } }, // +X
    { u: { x: 0, y: 1, z: 0 }, v: { x: 0, y: 0, z: 1 }, h: { x: -1, y: 0, z: 0 } }, // -X
    { u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: 1 }, h: { x: 0, y: 1, z: 0 } }, // +Y
    { u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: 1 }, h: { x: 0, y: -1, z: 0 } }, // -Y
    { u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 1, z: 0 }, h: { x: 0, y: 0, z: 1 } }, // +Z
    { u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 1, z: 0 }, h: { x: 0, y: 0, z: -1 } }, // -Z
  ];

  // 分群
  const patchTriangles: number[][] = [[], [], [], [], [], []];
  const patchVertices: Set<number>[] = [new Set(), new Set(), new Set(), new Set(), new Set(), new Set()];

  for (let t = 0; t < numTris; t++) {
    const i0 = mesh.indices[t * 3], i1 = mesh.indices[t * 3 + 1], i2 = mesh.indices[t * 3 + 2];

    // 計算面法向
    const v0x = mesh.positions[i0 * 3], v0y = mesh.positions[i0 * 3 + 1], v0z = mesh.positions[i0 * 3 + 2];
    const v1x = mesh.positions[i1 * 3], v1y = mesh.positions[i1 * 3 + 1], v1z = mesh.positions[i1 * 3 + 2];
    const v2x = mesh.positions[i2 * 3], v2y = mesh.positions[i2 * 3 + 1], v2z = mesh.positions[i2 * 3 + 2];

    const e1x = v1x - v0x, e1y = v1y - v0y, e1z = v1z - v0z;
    const e2x = v2x - v0x, e2y = v2y - v0y, e2z = v2z - v0z;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len < 1e-12) continue;
    nx /= len; ny /= len; nz /= len;

    // 找最接近的主方向
    let bestDir = 0;
    let bestDot = -Infinity;
    for (let d = 0; d < 6; d++) {
      const dot = nx * DIRECTIONS[d].x + ny * DIRECTIONS[d].y + nz * DIRECTIONS[d].z;
      if (dot > bestDot) {
        bestDot = dot;
        bestDir = d;
      }
    }

    patchTriangles[bestDir].push(t);
    patchVertices[bestDir].add(i0);
    patchVertices[bestDir].add(i1);
    patchVertices[bestDir].add(i2);
  }

  // 建立 patches（跳過太小的）
  const patches: SurfacePatch[] = [];
  for (let d = 0; d < 6; d++) {
    if (patchTriangles[d].length < minPatchTriangles) continue;

    const triIndices: number[] = [];
    for (const t of patchTriangles[d]) {
      triIndices.push(mesh.indices[t * 3], mesh.indices[t * 3 + 1], mesh.indices[t * 3 + 2]);
    }

    patches.push({
      vertexIndices: Array.from(patchVertices[d]),
      triangleIndices: triIndices,
      dominantNormal: DIRECTIONS[d],
      uAxis: UV_AXES[d].u,
      vAxis: UV_AXES[d].v,
      heightAxis: UV_AXES[d].h,
    });
  }

  // 如果沒有有效 patch，建立一個包含所有三角形的 patch（使用 Y-up）
  if (patches.length === 0 && numTris > 0) {
    const allVerts = new Set<number>();
    const allTriIndices: number[] = [];
    for (let t = 0; t < numTris; t++) {
      const i0 = mesh.indices[t * 3], i1 = mesh.indices[t * 3 + 1], i2 = mesh.indices[t * 3 + 2];
      allTriIndices.push(i0, i1, i2);
      allVerts.add(i0); allVerts.add(i1); allVerts.add(i2);
    }
    patches.push({
      vertexIndices: Array.from(allVerts),
      triangleIndices: allTriIndices,
      dominantNormal: { x: 0, y: 1, z: 0 },
      uAxis: { x: 1, y: 0, z: 0 },
      vAxis: { x: 0, y: 0, z: 1 },
      heightAxis: { x: 0, y: 1, z: 0 },
    });
  }

  return patches;
}

// ═══════════════════════════════════════════════════════════════
//  Least Squares NURBS 擬合
// ═══════════════════════════════════════════════════════════════

/**
 * 對單個 patch 進行 Least Squares NURBS 擬合
 *
 * // === APPROXIMATE NURBS FITTING (Least Squares, not TRF) ===
 *
 * 流程：
 *   1. 將 patch 頂點投影到 UV 平面
 *   2. 正規化 UV 到 [0, 1]
 *   3. 建立 B-spline basis matrix N (m × n)
 *      N[k][i*cpV+j] = N_i(u_k) * N_j(v_k)
 *   4. 解正規方程 (N^T N) C = N^T P
 *      對 x, y, z 三個分量分別求解
 *   5. 組裝 NURBSSurface
 *
 * @param mesh - DC 網格
 * @param patch - 要擬合的 patch
 * @param degreeU - U 方向 degree
 * @param degreeV - V 方向 degree
 * @param cpU - U 方向控制點數
 * @param cpV - V 方向控制點數
 * @returns NURBSSurface
 */
function fitPatchLeastSquares(
  mesh: DCMeshData,
  patch: SurfacePatch,
  degreeU: number,
  degreeV: number,
  cpU: number,
  cpV: number
): NURBSSurface | null {
  const { vertexIndices, uAxis, vAxis, heightAxis } = patch;
  const numPts = vertexIndices.length;

  if (numPts < cpU * cpV) {
    // 資料點不足，無法擬合
    return null;
  }

  // ─── Step 1: 投影到 UV 平面 ───
  const uCoords = new Float64Array(numPts);
  const vCoords = new Float64Array(numPts);
  const points: Vec3[] = [];

  for (let k = 0; k < numPts; k++) {
    const vi = vertexIndices[k];
    const px = mesh.positions[vi * 3];
    const py = mesh.positions[vi * 3 + 1];
    const pz = mesh.positions[vi * 3 + 2];

    // 投影到 UV
    uCoords[k] = px * uAxis.x + py * uAxis.y + pz * uAxis.z;
    vCoords[k] = px * vAxis.x + py * vAxis.y + pz * vAxis.z;
    points.push({ x: px, y: py, z: pz });
  }

  // ─── Step 2: 正規化 UV 到 [0, 1] ───
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
    uCoords[k] = (uCoords[k] - uMin) / uRange;
    vCoords[k] = (vCoords[k] - vMin) / vRange;
    // 夾限避免邊界問題
    uCoords[k] = Math.max(0, Math.min(1, uCoords[k]));
    vCoords[k] = Math.max(0, Math.min(1, vCoords[k]));
  }

  // ─── Step 3: 建立 knot vectors 和 basis matrix ───
  const knotsU = generateClampedKnots(cpU, degreeU);
  const knotsV = generateClampedKnots(cpV, degreeV);

  const numCP = cpU * cpV;

  // Basis matrix N: numPts × numCP
  // N[k][i*cpV + j] = N_i(u_k) * N_j(v_k)
  // 為了記憶體效率，不建立完整矩陣，而是直接計算 N^T N 和 N^T P

  // N^T N: numCP × numCP (symmetric)
  const NtN = new Float64Array(numCP * numCP);
  // N^T P: numCP × 3
  const NtPx = new Float64Array(numCP);
  const NtPy = new Float64Array(numCP);
  const NtPz = new Float64Array(numCP);

  // 逐資料點累加
  for (let k = 0; k < numPts; k++) {
    const u = uCoords[k];
    const v = vCoords[k];

    // 計算所有 basis functions
    const Nu = allBasisFunctions(cpU, degreeU, u, knotsU);
    const Nv = allBasisFunctions(cpV, degreeV, v, knotsV);

    // 建立 tensor product basis
    const basis = new Float64Array(numCP);
    for (let i = 0; i < cpU; i++) {
      for (let j = 0; j < cpV; j++) {
        basis[i * cpV + j] = Nu[i] * Nv[j];
      }
    }

    // 累加 N^T N
    for (let a = 0; a < numCP; a++) {
      if (Math.abs(basis[a]) < 1e-15) continue;
      for (let b = a; b < numCP; b++) {
        const val = basis[a] * basis[b];
        NtN[a * numCP + b] += val;
        if (a !== b) NtN[b * numCP + a] += val; // symmetric
      }

      // 累加 N^T P
      NtPx[a] += basis[a] * points[k].x;
      NtPy[a] += basis[a] * points[k].y;
      NtPz[a] += basis[a] * points[k].z;
    }
  }

  // ─── Step 4: 解正規方程 (N^T N) C = N^T P ───
  // 加入 Tikhonov regularization 避免奇異
  const lambda = 1e-4;
  for (let i = 0; i < numCP; i++) {
    NtN[i * numCP + i] += lambda;
  }

  // 使用 Cholesky 分解或直接用 Gauss-Jordan 消去法
  // 這裡用 Gauss-Jordan（適合小矩陣 numCP ≤ 32×32 = 1024）
  const cpX = solveLinearSystem(NtN, NtPx, numCP);
  const cpY = solveLinearSystem(NtN, NtPy, numCP);
  const cpZ = solveLinearSystem(NtN, NtPz, numCP);

  if (!cpX || !cpY || !cpZ) {
    console.warn('[NURBSFitter] Linear system solve failed for patch');
    return null;
  }

  // ─── Step 5: 組裝 NURBSSurface ───
  const controlPoints: Vec3[][] = [];
  for (let i = 0; i < cpU; i++) {
    const row: Vec3[] = [];
    for (let j = 0; j < cpV; j++) {
      const idx = i * cpV + j;
      row.push({ x: cpX[idx], y: cpY[idx], z: cpZ[idx] });
    }
    controlPoints.push(row);
  }

  const weights: number[][] = controlPoints.map(row => row.map(() => 1.0));

  return {
    id: `nurbs_ls_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    controlPoints,
    degree: degreeU,
    knotsU,
    knotsV,
    weights,
  };
}

/**
 * Gauss-Jordan 消去法求解線性系統 Ax = b
 *
 * 注意：會修改輸入的 A 和 b！
 * 對於 numCP ≤ ~1000 的小系統足夠高效。
 *
 * @param A - 係數矩陣（n×n, row-major, 會被修改）
 * @param b - 右側向量（長度 n, 會被修改）
 * @param n - 矩陣維度
 * @returns 解向量，或 null（奇異矩陣）
 */
function solveLinearSystem(
  A_orig: Float64Array,
  b_orig: Float64Array,
  n: number
): Float64Array | null {
  // 複製以避免修改原始資料（因為要解 3 次）
  const A = new Float64Array(A_orig);
  const b = new Float64Array(b_orig);

  // 部分主元 Gauss 消去
  for (let col = 0; col < n; col++) {
    // 找主元
    let maxVal = Math.abs(A[col * n + col]);
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      const val = Math.abs(A[row * n + col]);
      if (val > maxVal) {
        maxVal = val;
        maxRow = row;
      }
    }

    if (maxVal < 1e-14) {
      // 奇異矩陣
      return null;
    }

    // 交換行
    if (maxRow !== col) {
      for (let j = 0; j < n; j++) {
        const tmp = A[col * n + j];
        A[col * n + j] = A[maxRow * n + j];
        A[maxRow * n + j] = tmp;
      }
      const tmpB = b[col];
      b[col] = b[maxRow];
      b[maxRow] = tmpB;
    }

    // 消去
    const pivot = A[col * n + col];
    for (let row = col + 1; row < n; row++) {
      const factor = A[row * n + col] / pivot;
      for (let j = col; j < n; j++) {
        A[row * n + j] -= factor * A[col * n + j];
      }
      b[row] -= factor * b[col];
    }
  }

  // 回代
  const x = new Float64Array(n);
  for (let row = n - 1; row >= 0; row--) {
    let sum = b[row];
    for (let j = row + 1; j < n; j++) {
      sum -= A[row * n + j] * x[j];
    }
    x[row] = sum / A[row * n + row];
  }

  // 檢查 NaN
  for (let i = 0; i < n; i++) {
    if (isNaN(x[i])) return null;
  }

  return x;
}

// ═══════════════════════════════════════════════════════════════
//  Fallback：加權平均擬合
// ═══════════════════════════════════════════════════════════════

/**
 * Fallback NURBS 擬合（加權平均高度法）
 *
 * // === APPROXIMATE NURBS FITTING (Weighted Average, not TRF) ===
 *
 * 當 Least Squares 方法失敗時使用。
 * 對每個控制點位置，用 inverse distance weighting 計算高度。
 *
 * @param mesh - DC 網格
 * @param patch - patch 資訊
 * @param degreeU, degreeV - NURBS degree
 * @param cpU, cpV - 控制點數
 * @returns NURBSSurface
 */
function fitPatchFallback(
  mesh: DCMeshData,
  patch: SurfacePatch,
  degreeU: number,
  degreeV: number,
  cpU: number,
  cpV: number
): NURBSSurface {
  const { vertexIndices, uAxis, vAxis } = patch;

  // 收集 patch 頂點
  const pts: Vec3[] = [];
  for (const vi of vertexIndices) {
    pts.push({
      x: mesh.positions[vi * 3],
      y: mesh.positions[vi * 3 + 1],
      z: mesh.positions[vi * 3 + 2],
    });
  }

  // 投影到 UV
  let uMin = Infinity, uMax = -Infinity;
  let vMin = Infinity, vMax = -Infinity;
  const uVals: number[] = [];
  const vVals: number[] = [];

  for (const p of pts) {
    const u = p.x * uAxis.x + p.y * uAxis.y + p.z * uAxis.z;
    const v = p.x * vAxis.x + p.y * vAxis.y + p.z * vAxis.z;
    uVals.push(u);
    vVals.push(v);
    if (u < uMin) uMin = u;
    if (u > uMax) uMax = u;
    if (v < vMin) vMin = v;
    if (v > vMax) vMax = v;
  }

  const uRange = uMax - uMin || 1;
  const vRange = vMax - vMin || 1;

  // 建立控制點
  const controlPoints: Vec3[][] = [];
  for (let i = 0; i < cpU; i++) {
    const row: Vec3[] = [];
    for (let j = 0; j < cpV; j++) {
      const targetU = uMin + (i / (cpU - 1)) * uRange;
      const targetV = vMin + (j / (cpV - 1)) * vRange;

      // Inverse distance weighting
      let wx = 0, wy = 0, wz = 0, wTotal = 0;
      for (let k = 0; k < pts.length; k++) {
        const du = uVals[k] - targetU;
        const dv = vVals[k] - targetV;
        const dist = Math.sqrt(du * du + dv * dv) + 0.01;
        const w = 1.0 / (dist * dist);
        wx += pts[k].x * w;
        wy += pts[k].y * w;
        wz += pts[k].z * w;
        wTotal += w;
      }

      row.push({
        x: wTotal > 0 ? wx / wTotal : targetU,
        y: wTotal > 0 ? wy / wTotal : 0,
        z: wTotal > 0 ? wz / wTotal : targetV,
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
//  主入口：DC Mesh → NURBS 曲面
// ═══════════════════════════════════════════════════════════════

/**
 * 從 DC 網格擬合 NURBS 曲面
 *
 * // === APPROXIMATE NURBS FITTING (Least Squares, not TRF) ===
 *
 * 完整流程：
 *   1. Patch 分群（按法向方向）
 *   2. 對每個 patch 嘗試 Least Squares 擬合
 *   3. 若失敗，使用 fallback（加權平均）
 *   4. 嘗試使用 verb-nurbs-web 建立 NurbsSurface 物件
 *
 * @param mesh - DC 網格（或簡化後的網格）
 * @param degreeU - U 方向 degree（預設 3）
 * @param degreeV - V 方向 degree（預設 3）
 * @param cpU - U 方向控制點數（預設 8）
 * @param cpV - V 方向控制點數（預設 8）
 * @param onProgress - 進度回調
 * @returns NURBSFitResult
 */
export function fitNURBSFromDCMesh(
  mesh: DCMeshData,
  degreeU: number = 3,
  degreeV: number = 3,
  cpU: number = 8,
  cpV: number = 8,
  onProgress?: (progress: number) => void
): NURBSFitResult {
  const startTime = performance.now();

  // 確保控制點數 ≥ degree + 1
  cpU = Math.max(degreeU + 1, cpU);
  cpV = Math.max(degreeV + 1, cpV);

  if (mesh.positions.length === 0) {
    return {
      surfaces: [],
      verbSurfaces: [],
      stats: { patchCount: 0, totalControlPoints: 0, fitTimeMs: 0, method: 'least_squares' },
    };
  }

  // Step 1: Patch 分群
  const patches = segmentPatches(mesh);
  onProgress?.(10);

  // Step 2 & 3: 對每個 patch 擬合 NURBS
  const surfaces: NURBSSurface[] = [];
  const verbSurfaces: unknown[] = [];
  let method: 'least_squares' | 'weighted_average' = 'least_squares';

  for (let p = 0; p < patches.length; p++) {
    const patch = patches[p];

    // 嘗試 Least Squares
    let surface = fitPatchLeastSquares(mesh, patch, degreeU, degreeV, cpU, cpV);

    if (!surface) {
      // Fallback
      surface = fitPatchFallback(mesh, patch, degreeU, degreeV, cpU, cpV);
      method = 'weighted_average';
      console.log(`[NURBSFitter] Patch ${p}: using fallback (weighted average)`);
    } else {
      console.log(`[NURBSFitter] Patch ${p}: least squares fit successful`);
    }

    surfaces.push(surface);

    // 嘗試使用 verb-nurbs-web
    try {
      const verb = require('verb-nurbs-web');
      const verbCP = surface.controlPoints.map(row =>
        row.map(pt => [pt.x, pt.y, pt.z])
      );
      const verbSurf = verb.geom.NurbsSurface.byKnotsControlPointsWeights(
        degreeU, degreeV,
        surface.knotsU, surface.knotsV,
        verbCP
      );
      verbSurfaces.push(verbSurf);
    } catch {
      // verb-nurbs-web 不可用
      verbSurfaces.push(null);
    }

    onProgress?.(10 + ((p + 1) / patches.length) * 80);
  }

  onProgress?.(100);

  const fitTimeMs = performance.now() - startTime;
  const totalControlPoints = surfaces.reduce(
    (sum, s) => sum + s.controlPoints.length * s.controlPoints[0].length, 0
  );

  console.log(
    `[NURBSFitter] ${patches.length} patches, ${totalControlPoints} control points, ` +
    `method=${method}, ${fitTimeMs.toFixed(1)}ms`
  );

  return {
    surfaces,
    verbSurfaces,
    stats: {
      patchCount: patches.length,
      totalControlPoints,
      fitTimeMs,
      method,
    },
  };
}
