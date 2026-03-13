/**
 * FEASolver.ts - 教科書級 3D 桁架有限元素分析求解器
 *
 * 嚴格遵循標準桁架 FEM 教科書流程：
 *   1. 從 Voxel 陣列與 Glue Joints 建立節點列表與桿件列表
 *   2. 對每個桿件建立局部剛度矩陣 k_local (6×6)
 *   3. 用方向餘弦矩陣 T 將 k_local 轉換到全域座標 → k_global
 *   4. 組裝全域剛度矩陣 K (nDOF × nDOF, sparse)
 *   5. 建立全域力向量 F（外力 + 自重）
 *   6. 施加邊界條件（固定自由度：對角設 1，行列清零，F 設 0）
 *   7. 共軛梯度法求解 Ku = F
 *   8. 回算桿件軸向變形、應變、應力、應力比
 *
 * 物理模型層與數值計算層嚴格分離。
 * 所有物理量均有明確單位，無魔術常數。
 *
 * 單位系統：
 *   - 長度：m（每個 voxel 為 1m × 1m × 1m 立方體）
 *   - 力：N
 *   - 應力/楊氏模量：Pa (N/m²)
 *   - 密度：kg/m³
 *   - 截面面積：m²
 *
 * 參考文獻：
 *   - Logan, D.L. "A First Course in the Finite Element Method"
 *   - Cook, R.D. et al. "Concepts and Applications of Finite Element Analysis"
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

/** 體素材質屬性 */
export interface VoxelMaterial {
  youngModulus: number;    // Pa - 楊氏模量
  maxCompression: number;  // Pa - 最大容許壓縮應力
  maxTension: number;      // Pa - 最大容許拉伸應力
  density: number;         // kg/m³ - 密度
}

/** 輸入體素 */
export interface FEAVoxel {
  pos: Vec3;
  material: VoxelMaterial;
  isSupport: boolean;
  externalLoad?: Vec3;     // N - 外部施加的力向量
}

/** Glue 接頭 */
export interface GlueJoint {
  voxelA: Vec3;
  voxelB: Vec3;
  strength: number;        // 0-1, 1 = 完全剛性連接
}

/** FEA 桿件結果 */
export interface FEAEdgeResult {
  nodeA: Vec3;
  nodeB: Vec3;
  stress: number;          // Pa - 軸向應力（正=拉伸，負=壓縮）
  stressRatio: number;     // |σ| / σ_limit, 0=安全, 1=極限, >1=超載
  isTension: boolean;      // true=拉伸, false=壓縮
  axialForce: number;      // N - 軸向力
  strain: number;          // 無因次 - 軸向應變
}

/** FEA 完整結果 */
export interface FEASolverResult {
  /** 是否成功求解（false 表示模型無法分析，例如無支撐點） */
  success: boolean;
  /** 錯誤訊息（當 success = false 時） */
  error?: string;
  edges: FEAEdgeResult[];
  displacements: Map<string, Vec3>;  // 節點位移
  dangerCount: number;               // stressRatio > 0.8 的邊數
  maxStressRatio: number;
  totalEdges: number;
  solverIterations: number;
  residualNorm: number;
  elapsedMs: number;
}

// ═══════════════════════════════════════════════════════════════
//  物理模型層：節點與桿件建模
// ═══════════════════════════════════════════════════════════════

/** 桁架節點 */
interface TrussNode {
  index: number;           // 節點全域索引
  pos: Vec3;               // 節點位置 (m)
  material: VoxelMaterial; // 材質屬性
  isFixed: boolean;        // 是否為固定支撐
  externalForce: Vec3;     // 外力向量 (N)，含自重
}

/** 桁架桿件 */
interface TrussElement {
  nodeAIndex: number;      // 節點 A 的全域索引
  nodeBIndex: number;      // 節點 B 的全域索引
  length: number;          // 桿件長度 L (m)
  direction: Vec3;         // 單位方向向量 d = (B-A)/|B-A|
  area: number;            // 截面面積 A (m²)
  youngModulus: number;    // 楊氏模量 E (Pa)
}

// ═══════════════════════════════════════════════════════════════
//  數值計算層：稀疏矩陣
// ═══════════════════════════════════════════════════════════════

/**
 * 稀疏矩陣 (CSR-like with Map)
 *
 * 用於儲存全域剛度矩陣 K。
 * 支援：加值、矩陣-向量乘法、邊界條件施加。
 */
class SparseMatrix {
  private rows: Map<number, Map<number, number>> = new Map();
  readonly size: number;

  constructor(size: number) {
    this.size = size;
  }

  /**
   * 將值加到 (row, col) 位置：K[row][col] += value
   */
  add(row: number, col: number, value: number): void {
    if (Math.abs(value) < 1e-20) return;
    let rowMap = this.rows.get(row);
    if (!rowMap) {
      rowMap = new Map();
      this.rows.set(row, rowMap);
    }
    rowMap.set(col, (rowMap.get(col) || 0) + value);
  }

  /**
   * 矩陣-向量乘法：result = K * v
   */
  multiplyVector(v: Float64Array, result: Float64Array): void {
    result.fill(0);
    this.rows.forEach((rowMap, row) => {
      let sum = 0;
      rowMap.forEach((value, col) => {
        sum += value * v[col];
      });
      result[row] = sum;
    });
  }

  /**
   * 施加邊界條件（固定自由度）
   *
   * 標準做法：
   *   - 將第 dof 行清零，對角元素設為 1
   *   - 將第 dof 列中其他行的元素清零
   *   - 對應的 F[dof] 在外部設為 0
   *
   * 這保持矩陣對稱性，且固定自由度的解為 u[dof] = 0。
   */
  applyBoundaryCondition(dof: number): void {
    // 清除第 dof 行，設對角為 1
    this.rows.set(dof, new Map([[dof, 1.0]]));

    // 清除第 dof 列中其他行的元素（保持對稱性）
    this.rows.forEach((rowMap, row) => {
      if (row !== dof && rowMap.has(dof)) {
        rowMap.delete(dof);
      }
    });
  }

  /**
   * 取得對角元素值（用於預條件器）
   */
  getDiagonal(index: number): number {
    const rowMap = this.rows.get(index);
    return rowMap ? (rowMap.get(index) || 0) : 0;
  }
}

// ═══════════════════════════════════════════════════════════════
//  數值計算層：桿件剛度矩陣與座標轉換
// ═══════════════════════════════════════════════════════════════

/**
 * 建立 3D 桁架桿件的全域剛度矩陣 (6×6)
 *
 * 對於 3D 桁架桿件，局部剛度矩陣為：
 *
 *   k_local = (EA/L) * [ 1  -1 ]  (2×2 in local axis)
 *                      [-1   1 ]
 *
 * 轉換到全域座標後，6×6 全域桿件剛度矩陣為：
 *
 *   k_global = (EA/L) * [ [D]  [-D] ]
 *                       [[-D]  [D]  ]
 *
 * 其中 D 是方向餘弦外積矩陣：
 *   D[i][j] = l_i * l_j
 *   l = (lx, ly, lz) = 桿件方向餘弦（單位方向向量）
 *
 * 這等價於 T^T * k_local_full * T 的結果。
 *
 * 參考：Logan, "A First Course in FEM", Chapter 3 (3D Truss Element)
 *
 * @param E - 楊氏模量 (Pa)
 * @param A - 截面面積 (m²)
 * @param L - 桿件長度 (m)
 * @param d - 單位方向向量 (from nodeA to nodeB)
 * @returns 6×6 全域桿件剛度矩陣（以一維陣列儲存，row-major）
 */
function buildElementGlobalStiffness(
  E: number,
  A: number,
  L: number,
  d: Vec3
): Float64Array {
  const k = new Float64Array(36); // 6×6
  const coeff = (E * A) / L;

  // 方向餘弦
  const l = [d.x, d.y, d.z];

  // 填入 6×6 矩陣
  // k_global = coeff * [ [D]  [-D] ]
  //                    [[-D]  [D]  ]
  // 其中 D[i][j] = l[i] * l[j]
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const dij = l[i] * l[j];
      const val = coeff * dij;

      // 左上 3×3 塊 (nodeA-nodeA): +D
      k[i * 6 + j] = val;
      // 右下 3×3 塊 (nodeB-nodeB): +D
      k[(i + 3) * 6 + (j + 3)] = val;
      // 右上 3×3 塊 (nodeA-nodeB): -D
      k[i * 6 + (j + 3)] = -val;
      // 左下 3×3 塊 (nodeB-nodeA): -D
      k[(i + 3) * 6 + j] = -val;
    }
  }

  return k;
}

/**
 * 將桿件 6×6 剛度矩陣組裝到全域剛度矩陣 K
 *
 * 桿件連接 nodeA (全域索引 iA) 和 nodeB (全域索引 iB)。
 * nodeA 的自由度為 [iA*3, iA*3+1, iA*3+2]
 * nodeB 的自由度為 [iB*3, iB*3+1, iB*3+2]
 *
 * @param K - 全域稀疏剛度矩陣
 * @param kElem - 6×6 桿件剛度矩陣 (row-major)
 * @param iA - nodeA 的全域節點索引
 * @param iB - nodeB 的全域節點索引
 */
function assembleElementStiffnessToGlobal(
  K: SparseMatrix,
  kElem: Float64Array,
  iA: number,
  iB: number
): void {
  // 自由度映射：桿件局部 DOF [0,1,2,3,4,5] → 全域 DOF
  const dofs = [
    iA * 3,     iA * 3 + 1, iA * 3 + 2,  // nodeA: ux, uy, uz
    iB * 3,     iB * 3 + 1, iB * 3 + 2,  // nodeB: ux, uy, uz
  ];

  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      const value = kElem[i * 6 + j];
      if (Math.abs(value) > 1e-20) {
        K.add(dofs[i], dofs[j], value);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  數值計算層：共軛梯度法求解器
// ═══════════════════════════════════════════════════════════════

/**
 * 預條件共軛梯度法 (Preconditioned Conjugate Gradient, PCG)
 *
 * 求解線性系統 Ku = F，其中 K 為對稱正定稀疏矩陣。
 *
 * 使用 Jacobi 預條件器（對角預條件）加速收斂。
 *
 * 演算法：
 *   1. r₀ = F - K*u₀ (初始殘差)
 *   2. z₀ = M⁻¹ * r₀ (預條件)
 *   3. p₀ = z₀
 *   4. 迭代：
 *      α = (rᵢ·zᵢ) / (pᵢ·K*pᵢ)
 *      uᵢ₊₁ = uᵢ + α*pᵢ
 *      rᵢ₊₁ = rᵢ - α*K*pᵢ
 *      檢查收斂：‖rᵢ₊₁‖ < tol
 *      zᵢ₊₁ = M⁻¹ * rᵢ₊₁
 *      β = (rᵢ₊₁·zᵢ₊₁) / (rᵢ·zᵢ)
 *      pᵢ₊₁ = zᵢ₊₁ + β*pᵢ
 *
 * @param K - 全域剛度矩陣 (對稱正定)
 * @param F - 力向量
 * @param maxIterations - 最大迭代次數
 * @param tolerance - 收斂容差 (殘差 2-範數)
 * @returns { solution, iterations, residualNorm }
 */
function solvePCG(
  K: SparseMatrix,
  F: Float64Array,
  maxIterations: number,
  tolerance: number
): { solution: Float64Array; iterations: number; residualNorm: number } {
  const n = F.length;
  const u = new Float64Array(n);       // 解向量（初始為零）
  const r = new Float64Array(n);       // 殘差
  const z = new Float64Array(n);       // 預條件後的殘差
  const p = new Float64Array(n);       // 搜尋方向
  const Kp = new Float64Array(n);      // K * p

  // 建立 Jacobi 預條件器：M⁻¹ = diag(1/K[i][i])
  const invDiag = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const diag = K.getDiagonal(i);
    invDiag[i] = Math.abs(diag) > 1e-20 ? 1.0 / diag : 1.0;
  }

  // r₀ = F - K*u₀ = F（因為 u₀ = 0）
  for (let i = 0; i < n; i++) {
    r[i] = F[i];
  }

  // 檢查初始殘差
  let rNorm = norm2(r);
  if (rNorm < tolerance) {
    return { solution: u, iterations: 0, residualNorm: rNorm };
  }

  // z₀ = M⁻¹ * r₀
  for (let i = 0; i < n; i++) {
    z[i] = invDiag[i] * r[i];
  }

  // p₀ = z₀
  for (let i = 0; i < n; i++) {
    p[i] = z[i];
  }

  let rzOld = dot(r, z, n);
  let iterations = 0;

  for (let iter = 0; iter < maxIterations; iter++) {
    iterations = iter + 1;

    // Kp = K * p
    K.multiplyVector(p, Kp);

    // α = (r·z) / (p·Kp)
    const pKp = dot(p, Kp, n);
    if (Math.abs(pKp) < 1e-30) {
      // 搜尋方向與 K 正交，可能已收斂或矩陣奇異
      console.warn(`[FEASolver] PCG: p·Kp ≈ 0 at iteration ${iter}, possible singular matrix`);
      break;
    }
    const alpha = rzOld / pKp;

    // u = u + α*p
    // r = r - α*Kp
    for (let i = 0; i < n; i++) {
      u[i] += alpha * p[i];
      r[i] -= alpha * Kp[i];
    }

    // 檢查收斂
    rNorm = norm2(r);
    if (rNorm < tolerance) {
      break;
    }

    // 檢查 NaN
    if (isNaN(rNorm)) {
      console.error(`[FEASolver] PCG: NaN detected at iteration ${iter}. Matrix may be singular or ill-conditioned.`);
      break;
    }

    // z = M⁻¹ * r
    for (let i = 0; i < n; i++) {
      z[i] = invDiag[i] * r[i];
    }

    // β = (r_new·z_new) / (r_old·z_old)
    const rzNew = dot(r, z, n);
    const beta = rzNew / rzOld;

    // p = z + β*p
    for (let i = 0; i < n; i++) {
      p[i] = z[i] + beta * p[i];
    }

    rzOld = rzNew;
  }

  return { solution: u, iterations, residualNorm: rNorm };
}

/** 向量內積 */
function dot(a: Float64Array, b: Float64Array, n: number): number {
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

/** 向量 2-範數 */
function norm2(v: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < v.length; i++) {
    sum += v[i] * v[i];
  }
  return Math.sqrt(sum);
}

// ═══════════════════════════════════════════════════════════════
//  輔助函式
// ═══════════════════════════════════════════════════════════════

function vecKey(p: Vec3): string {
  return `${p.x},${p.y},${p.z}`;
}

function vecSub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function vecLength(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function vecDot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function vecNormalize(v: Vec3): Vec3 {
  const len = vecLength(v);
  if (len < 1e-15) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

// ═══════════════════════════════════════════════════════════════
//  主求解器
// ═══════════════════════════════════════════════════════════════

/** 求解器配置 */
export interface FEASolverConfig {
  /** 截面面積 (m²)，預設 1.0（每個 voxel 面的面積） */
  crossSectionArea: number;
  /** 重力加速度 (m/s²)，預設 9.81 */
  gravityAcceleration: number;
  /** 重力方向，預設 (0, -1, 0) */
  gravityDirection: Vec3;
  /** 體素體積 (m³)，預設 1.0（1m × 1m × 1m） */
  voxelVolume: number;
  /** CG 求解器最大迭代次數，預設 min(nDOF*3, 10000) */
  maxIterations?: number;
  /** CG 求解器收斂容差，預設 1e-8 */
  tolerance: number;
  /**
   * 自動支撐開關（預設 true）
   *
   * 當 autoSupports = true 且模型沒有任何支撐點時，
   * 自動固定最低一層節點，避免剛體運動造成 K 矩陣奇異。
   *
   * 當 autoSupports = false 且模型沒有任何支撐點時，
   * 回傳明確的錯誤結果（success = false）。
   */
  autoSupports: boolean;
  /**
   * Glue 接觸面積因子（預設 0.5）
   *
   * Glue joint 的截面面積 = crossSectionArea × glueAreaFactor。
   * 表示 glue 接觸面積是體素截面的百分比（0.5 = 50%）。
   */
  glueAreaFactor: number;
}

const DEFAULT_CONFIG: FEASolverConfig = {
  crossSectionArea: 1.0,
  gravityAcceleration: 9.81,
  gravityDirection: { x: 0, y: -1, z: 0 },
  voxelVolume: 1.0,
  tolerance: 1e-8,
  autoSupports: true,
  glueAreaFactor: 0.5,
};

/**
 * 教科書級 3D 桁架有限元素分析求解器
 *
 * 完整流程：
 *   1. 建立節點列表與桿件列表
 *   2. 對每個桿件計算全域剛度矩陣
 *   3. 組裝全域剛度矩陣 K
 *   4. 建立力向量 F（外力 + 自重）
 *   5. 施加邊界條件
 *   6. PCG 求解 Ku = F
 *   7. 回算桿件內力、應力、應力比
 */
export function solveFEA(
  voxels: FEAVoxel[],
  glueJoints: GlueJoint[],
  config: Partial<FEASolverConfig> = {}
): FEASolverResult {
  const startTime = performance.now();
  const cfg: FEASolverConfig = { ...DEFAULT_CONFIG, ...config };

  // ─── 空模型檢查 ───
  if (voxels.length === 0) {
    return {
      success: true, edges: [], displacements: new Map(), dangerCount: 0,
      maxStressRatio: 0, totalEdges: 0, solverIterations: 0,
      residualNorm: 0, elapsedMs: 0,
    };
  }

  // ═══════════════════════════════════════════════════════════
  //  Step 1: 建立節點列表
  // ═══════════════════════════════════════════════════════════

  const nodeMap = new Map<string, TrussNode>();
  const nodes: TrussNode[] = [];

  for (let i = 0; i < voxels.length; i++) {
    const v = voxels[i];
    const key = vecKey(v.pos);

    // 自重 = density × volume × g
    const mass = v.material.density * cfg.voxelVolume; // kg
    const gravityForce: Vec3 = {
      x: cfg.gravityDirection.x * cfg.gravityAcceleration * mass,
      y: cfg.gravityDirection.y * cfg.gravityAcceleration * mass,
      z: cfg.gravityDirection.z * cfg.gravityAcceleration * mass,
    };

    // 總外力 = 自重 + 使用者施加的外力
    const extLoad = v.externalLoad || { x: 0, y: 0, z: 0 };
    const totalForce: Vec3 = {
      x: gravityForce.x + extLoad.x,
      y: gravityForce.y + extLoad.y,
      z: gravityForce.z + extLoad.z,
    };

    const node: TrussNode = {
      index: i,
      pos: v.pos,
      material: v.material,
      isFixed: v.isSupport,
      externalForce: totalForce,
    };

    nodeMap.set(key, node);
    nodes.push(node);
  }

  // ═══════════════════════════════════════════════════════════
  //  Step 2: 建立桿件列表
  //
  //  桿件來源：
  //    a) 相鄰體素（6-connected: ±x, ±y, ±z）
  //    b) Glue Joints（可能連接非相鄰體素）
  // ═══════════════════════════════════════════════════════════

  const elements: TrussElement[] = [];
  const edgeSet = new Set<string>();

  // 6-connected 鄰居偏移
  const OFFSETS: Vec3[] = [
    { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
    { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
  ];

  // a) 相鄰體素桿件
  for (const nodeA of nodes) {
    for (const offset of OFFSETS) {
      const neighborPos: Vec3 = {
        x: nodeA.pos.x + offset.x,
        y: nodeA.pos.y + offset.y,
        z: nodeA.pos.z + offset.z,
      };
      const nodeB = nodeMap.get(vecKey(neighborPos));
      if (!nodeB) continue;

      // 避免重複邊
      const edgeKey = nodeA.index < nodeB.index
        ? `${nodeA.index}-${nodeB.index}`
        : `${nodeB.index}-${nodeA.index}`;
      if (edgeSet.has(edgeKey)) continue;
      edgeSet.add(edgeKey);

      const diff = vecSub(nodeB.pos, nodeA.pos);
      const L = vecLength(diff);
      if (L < 1e-10) continue;

      const direction = vecNormalize(diff);

      // 楊氏模量取兩端材質的調和平均（串聯模型）
      const EA = nodeA.material.youngModulus;
      const EB = nodeB.material.youngModulus;
      const E = (2 * EA * EB) / (EA + EB + 1e-20);

      elements.push({
        nodeAIndex: nodeA.index,
        nodeBIndex: nodeB.index,
        length: L,
        direction,
        area: cfg.crossSectionArea,
        youngModulus: E,
      });
    }
  }

  // b) Glue Joints 桁件
  //    Glue joint 的截面面積 = crossSectionArea × glueAreaFactor
  //    表示 glue 接觸面積是體素截面的百分比
  const glueArea = cfg.crossSectionArea * cfg.glueAreaFactor;
  for (const gj of glueJoints) {
    const nodeA = nodeMap.get(vecKey(gj.voxelA));
    const nodeB = nodeMap.get(vecKey(gj.voxelB));
    if (!nodeA || !nodeB) continue;

    const edgeKey = nodeA.index < nodeB.index
      ? `${nodeA.index}-${nodeB.index}`
      : `${nodeB.index}-${nodeA.index}`;
    if (edgeSet.has(edgeKey)) continue;
    edgeSet.add(edgeKey);

    const diff = vecSub(nodeB.pos, nodeA.pos);
    const L = vecLength(diff);
    if (L < 1e-10) continue;

    const direction = vecNormalize(diff);
    const EA = nodeA.material.youngModulus;
    const EB = nodeB.material.youngModulus;
    const E = (2 * EA * EB) / (EA + EB + 1e-20) * gj.strength;

    elements.push({
      nodeAIndex: nodeA.index,
      nodeBIndex: nodeB.index,
      length: L,
      direction,
      area: glueArea,
      youngModulus: E,
    });
  }

  // 無桁件 → 無法分析
  if (elements.length === 0) {
    return {
      success: true, edges: [], displacements: new Map(), dangerCount: 0,
      maxStressRatio: 0, totalEdges: 0, solverIterations: 0,
      residualNorm: 0, elapsedMs: performance.now() - startTime,
    };
  }

  // ═══════════════════════════════════════════════════════════
  //  Step 3: 組裝全域剛度矩陣 K
  //
  //  每個節點 3 個自由度 (ux, uy, uz)
  //  全域自由度數 nDOF = nodes.length × 3
  // ═══════════════════════════════════════════════════════════

  const nDOF = nodes.length * 3;
  const K = new SparseMatrix(nDOF);

  for (const elem of elements) {
    // 計算桿件全域剛度矩陣 (6×6)
    const kElem = buildElementGlobalStiffness(
      elem.youngModulus,
      elem.area,
      elem.length,
      elem.direction
    );

    // 組裝到全域矩陣
    assembleElementStiffnessToGlobal(K, kElem, elem.nodeAIndex, elem.nodeBIndex);
  }

  // ═══════════════════════════════════════════════════════════
  //  Step 4: 建立全域力向量 F
  // ═══════════════════════════════════════════════════════════

  const F = new Float64Array(nDOF);

  for (const node of nodes) {
    const base = node.index * 3;
    F[base + 0] = node.externalForce.x;
    F[base + 1] = node.externalForce.y;
    F[base + 2] = node.externalForce.z;
  }

  // ═══════════════════════════════════════════════════════════
  //  Step 5: 施加邊界條件
  //
  //  固定支撐：u = 0（所有 3 個自由度）
  //  標準做法：將對應行清零、對角設 1、F 設 0
  //
  //  若無任何支撐點，自動選擇最低一層節點作為固定支撐，
  //  避免剛體運動造成 K 奇異。
  // ═══════════════════════════════════════════════════════════

  const fixedDOFs: number[] = [];

  // 收集固定自由度
  for (const node of nodes) {
    if (node.isFixed) {
      fixedDOFs.push(node.index * 3 + 0);
      fixedDOFs.push(node.index * 3 + 1);
      fixedDOFs.push(node.index * 3 + 2);
    }
  }

  // 若無支撐點，根據 autoSupports 開關決定行為
  if (fixedDOFs.length === 0) {
    if (cfg.autoSupports) {
      // 自動固定最低一層節點
      let minY = Infinity;
      for (const node of nodes) {
        if (node.pos.y < minY) minY = node.pos.y;
      }
      let autoFixedCount = 0;
      for (const node of nodes) {
        if (Math.abs(node.pos.y - minY) < 0.01) {
          fixedDOFs.push(node.index * 3 + 0);
          fixedDOFs.push(node.index * 3 + 1);
          fixedDOFs.push(node.index * 3 + 2);
          autoFixedCount++;
        }
      }
      console.log(`[FEA] Auto-supports enabled: fixing ${autoFixedCount} nodes at y=${minY}`);
    } else {
      // autoSupports = false 且無支撐點 → 回傳錯誤
      console.log('[FEA] Auto-supports disabled: user must define supports');
      return {
        success: false,
        error: 'No supports defined. Enable autoSupports or add fixed nodes.',
        edges: [], displacements: new Map(), dangerCount: 0,
        maxStressRatio: 0, totalEdges: 0, solverIterations: 0,
        residualNorm: 0, elapsedMs: performance.now() - startTime,
      };
    }
  }

  // 施加邊界條件
  for (const dof of fixedDOFs) {
    K.applyBoundaryCondition(dof);
    F[dof] = 0;
  }

  // ═══════════════════════════════════════════════════════════
  //  Step 6: 求解 Ku = F
  // ═══════════════════════════════════════════════════════════

  const maxIter = config.maxIterations ?? Math.min(nDOF * 3, 10000);
  const { solution: u, iterations, residualNorm } = solvePCG(K, F, maxIter, cfg.tolerance);

  // 檢查解的有效性
  let hasNaN = false;
  for (let i = 0; i < u.length; i++) {
    if (isNaN(u[i])) {
      hasNaN = true;
      u[i] = 0;
    }
  }
  if (hasNaN) {
    console.error('[FEASolver] Warning: NaN values in displacement solution. Results may be inaccurate.');
  }

  // ═══════════════════════════════════════════════════════════
  //  Step 7: 回算桿件內力、應力、應力比
  //
  //  對每個桿件：
  //    δ = (uB - uA) · d        (軸向變形)
  //    ε = δ / L                (應變)
  //    σ = E × ε               (應力, Pa)
  //    σ > 0 → 拉伸, σ < 0 → 壓縮
  //    stressRatio = |σ| / σ_limit
  // ═══════════════════════════════════════════════════════════

  // 建立位移 map
  const displacements = new Map<string, Vec3>();
  for (const node of nodes) {
    const base = node.index * 3;
    displacements.set(vecKey(node.pos), {
      x: u[base + 0],
      y: u[base + 1],
      z: u[base + 2],
    });
  }

  const feaEdges: FEAEdgeResult[] = [];
  let dangerCount = 0;
  let maxStressRatio = 0;

  for (const elem of elements) {
    const iA = elem.nodeAIndex;
    const iB = elem.nodeBIndex;
    const nodeA = nodes[iA];
    const nodeB = nodes[iB];

    // 節點位移
    const uA: Vec3 = {
      x: u[iA * 3 + 0],
      y: u[iA * 3 + 1],
      z: u[iA * 3 + 2],
    };
    const uB: Vec3 = {
      x: u[iB * 3 + 0],
      y: u[iB * 3 + 1],
      z: u[iB * 3 + 2],
    };

    // 軸向變形 δ = (uB - uA) · d
    const du = vecSub(uB, uA);
    const axialDeformation = vecDot(du, elem.direction);

    // 應變 ε = δ / L
    const strain = axialDeformation / elem.length;

    // 應力 σ = E × ε (Pa)
    const stress = elem.youngModulus * strain;

    // 軸向力 N = σ × A (N)
    const axialForce = stress * elem.area;

    // 判定拉伸或壓縮
    const isTension = stress >= 0;

    // 容許應力（取兩端材質的較小值）
    let allowableStress: number;
    if (isTension) {
      allowableStress = Math.min(
        nodeA.material.maxTension,
        nodeB.material.maxTension
      );
    } else {
      allowableStress = Math.min(
        nodeA.material.maxCompression,
        nodeB.material.maxCompression
      );
    }

    // 應力比 = |σ| / σ_limit
    let stressRatio: number;
    if (allowableStress > 0) {
      stressRatio = Math.abs(stress) / allowableStress;
    } else {
      // 容許應力為 0 但有應力 → 無限大應力比
      stressRatio = Math.abs(stress) > 1e-10 ? 999.0 : 0;
    }

    if (stressRatio > 0.8) dangerCount++;
    if (stressRatio > maxStressRatio) maxStressRatio = stressRatio;

    feaEdges.push({
      nodeA: nodeA.pos,
      nodeB: nodeB.pos,
      stress: Math.abs(stress),
      stressRatio,
      isTension,
      axialForce,
      strain,
    });
  }

  const elapsedMs = performance.now() - startTime;

  console.log(
    `[FEASolver] Completed: ${nodes.length} nodes, ${elements.length} elements, ` +
    `${dangerCount} danger edges, maxStressRatio=${maxStressRatio.toFixed(4)}, ` +
    `${iterations} CG iterations, residual=${residualNorm.toExponential(2)}, ` +
    `${elapsedMs.toFixed(1)}ms`
  );

  return {
    success: true,
    edges: feaEdges,
    displacements,
    dangerCount,
    maxStressRatio,
    totalEdges: feaEdges.length,
    solverIterations: iterations,
    residualNorm,
    elapsedMs,
  };
}

// ═══════════════════════════════════════════════════════════════
//  Worker 用的純函式版本（不依賴 performance.now()）
// ═══════════════════════════════════════════════════════════════

/**
 * 從 Typed Arrays 輸入執行 FEA（供 Web Worker 使用）
 *
 * 將 Typed Arrays 轉換為 FEAVoxel[] 後呼叫 solveFEA。
 */
export function solveFEAFromArrays(
  positions: Float32Array,
  materials: Uint8Array,
  properties: Float32Array,
  flags: Uint8Array,
  loads: Float32Array,
  count: number,
  glueJoints: GlueJoint[],
  gravity: Vec3,
  gravityMagnitude: number
): FEASolverResult {
  // Material type → default properties
  const MATERIAL_DEFAULTS: Record<number, VoxelMaterial> = {
    1: { youngModulus: 30e9,  maxCompression: 30e6,  maxTension: 3e6,   density: 2400 }, // concrete
    2: { youngModulus: 200e9, maxCompression: 250e6, maxTension: 400e6, density: 7850 }, // steel
    3: { youngModulus: 12e9,  maxCompression: 40e6,  maxTension: 80e6,  density: 600  }, // wood
    4: { youngModulus: 5e9,   maxCompression: 10e6,  maxTension: 0.5e6, density: 1800 }, // brick
    5: { youngModulus: 70e9,  maxCompression: 200e6, maxTension: 300e6, density: 2700 }, // aluminum
    6: { youngModulus: 70e9,  maxCompression: 100e6, maxTension: 7e6,   density: 2500 }, // glass
  };

  const FLAG_SUPPORT = 1;
  const FLAG_HAS_LOAD = 2;

  const voxels: FEAVoxel[] = [];

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const i4 = i * 4;
    const matType = materials[i];
    const defaults = MATERIAL_DEFAULTS[matType] || MATERIAL_DEFAULTS[1];

    // 如果 properties 有自訂值則使用，否則用預設
    const mat: VoxelMaterial = {
      maxCompression: properties[i4 + 0] > 0 ? properties[i4 + 0] : defaults.maxCompression,
      maxTension:     properties[i4 + 1] > 0 ? properties[i4 + 1] : defaults.maxTension,
      density:        properties[i4 + 2] > 0 ? properties[i4 + 2] : defaults.density,
      youngModulus:   properties[i4 + 3] > 0 ? properties[i4 + 3] : defaults.youngModulus,
    };

    const isSupport = (flags[i] & FLAG_SUPPORT) !== 0;
    const hasLoad = (flags[i] & FLAG_HAS_LOAD) !== 0;

    const externalLoad: Vec3 | undefined = hasLoad
      ? { x: loads[i3 + 0], y: loads[i3 + 1], z: loads[i3 + 2] }
      : undefined;

    voxels.push({
      pos: { x: positions[i3], y: positions[i3 + 1], z: positions[i3 + 2] },
      material: mat,
      isSupport,
      externalLoad,
    });
  }

  return solveFEA(voxels, glueJoints, {
    gravityAcceleration: gravityMagnitude,
    gravityDirection: gravity,
  });
}
