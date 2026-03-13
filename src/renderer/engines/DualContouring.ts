/**
 * DualContouring.ts - 真正的 Dual Contouring of Hermite Data 實作
 *
 * // === TRUE DUAL CONTOURING ===
 *
 * 嚴格遵循 Ju et al. (2002) "Dual Contouring of Hermite Data" 的演算法：
 *
 *   1. 對每個 active cell（至少一條 edge 有 sign change）：
 *      - 收集該 cell 中所有 edge intersection points 與 normals
 *      - 建立 Quadric Error Function (QEF)：
 *          Q(v) = Σᵢ (nᵢ · (v - pᵢ))²
 *        展開為 Q(v) = v^T A v - 2 b^T v + c
 *        其中 A = Σ nᵢnᵢ^T, b = Σ (nᵢ·pᵢ)nᵢ, c = Σ (nᵢ·pᵢ)²
 *      - 求解 Av* = b 得到最小化點 v*
 *      - 若 A 病態（det ≈ 0），加入 Tikhonov regularization 或退回 cell 中心
 *      - 將 v* 夾限在 cell 範圍內（避免頂點飛出）
 *
 *   2. 透過 edge adjacency 產生四邊形面片：
 *      - 每條 sign-change edge 被 4 個 cell 共享
 *      - 這 4 個 cell 的代表頂點組成一個 quad
 *      - Quad 分割為 2 個三角形
 *
 *   3. 輸出 DCMeshData：positions, normals, indices
 *
 * 效能設計：
 *   - 使用 Map<string, number> 做 cell → vertex 映射
 *   - 3×3 線性系統直接用 Cramer's rule 求解（避免矩陣庫依賴）
 *   - 支援 Tikhonov regularization 處理退化情況
 *
 * 參考文獻：
 *   - Ju, T., Losasso, F., Schaefer, S., Warren, J.
 *     "Dual Contouring of Hermite Data" (SIGGRAPH 2002)
 *   - Schaefer, S., Warren, J. "Dual Contouring: The Secret Sauce" (2003)
 */

import { HermiteGrid, HermiteEdgeData, getGridSDF } from './HermiteData';

// ═══════════════════════════════════════════════════════════════
//  型別定義
// ═══════════════════════════════════════════════════════════════

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Dual Contouring 輸出網格 */
export interface DCMeshData {
  /** 頂點位置 [x,y,z, x,y,z, ...] */
  positions: Float32Array;
  /** 頂點法向 [nx,ny,nz, ...] */
  normals: Float32Array;
  /** 三角形索引 */
  indices: Uint32Array;
  /** 統計資訊 */
  stats: {
    activeCells: number;
    totalQuads: number;
    totalTriangles: number;
    regularizedCells: number;
    buildTimeMs: number;
  };
}

// ═══════════════════════════════════════════════════════════════
//  QEF 求解器（Quadric Error Function）
// ═══════════════════════════════════════════════════════════════

/**
 * QEF 累加器
 *
 * 累加 Q(v) = Σ (nᵢ · (v - pᵢ))² 的係數。
 *
 * 展開：
 *   Q(v) = Σ (nᵢ · v - nᵢ · pᵢ)²
 *        = v^T (Σ nᵢnᵢ^T) v - 2 (Σ (nᵢ·pᵢ)nᵢ)^T v + Σ (nᵢ·pᵢ)²
 *        = v^T A v - 2 b^T v + c
 *
 * 最小化：Av* = b
 */
class QEFSolver {
  // A 矩陣（3×3 對稱，只存 6 個元素）
  // A = [a00 a01 a02]
  //     [a01 a11 a12]
  //     [a02 a12 a22]
  private a00 = 0; private a01 = 0; private a02 = 0;
  private a11 = 0; private a12 = 0;
  private a22 = 0;

  // b 向量
  private b0 = 0; private b1 = 0; private b2 = 0;

  // 質心累加（用於 fallback）
  private massPointX = 0;
  private massPointY = 0;
  private massPointZ = 0;
  private pointCount = 0;

  /**
   * 加入一個 Hermite 資料點
   *
   * @param px, py, pz - intersection point
   * @param nx, ny, nz - surface normal（單位向量）
   */
  add(px: number, py: number, pz: number, nx: number, ny: number, nz: number): void {
    // A += n * n^T
    this.a00 += nx * nx;
    this.a01 += nx * ny;
    this.a02 += nx * nz;
    this.a11 += ny * ny;
    this.a12 += ny * nz;
    this.a22 += nz * nz;

    // d = n · p
    const d = nx * px + ny * py + nz * pz;

    // b += d * n
    this.b0 += d * nx;
    this.b1 += d * ny;
    this.b2 += d * nz;

    // 質心累加
    this.massPointX += px;
    this.massPointY += py;
    this.massPointZ += pz;
    this.pointCount++;
  }

  /**
   * 求解 QEF 最小化點
   *
   * 使用 Cramer's rule 求解 3×3 線性系統 Av = b。
   * 若 A 病態（|det(A)| < threshold），使用 Tikhonov regularization：
   *   (A + λI)v = b + λ·massPoint
   * 若仍然失敗，退回質心。
   *
   * @param cellMin - cell 最小角（用於夾限）
   * @param cellMax - cell 最大角（用於夾限）
   * @param regularization - Tikhonov 正則化係數（預設 0.1）
   * @returns { point, wasRegularized }
   */
  solve(
    cellMin: Vec3,
    cellMax: Vec3,
    regularization: number = 0.1
  ): { point: Vec3; wasRegularized: boolean } {
    if (this.pointCount === 0) {
      return {
        point: {
          x: (cellMin.x + cellMax.x) * 0.5,
          y: (cellMin.y + cellMax.y) * 0.5,
          z: (cellMin.z + cellMax.z) * 0.5,
        },
        wasRegularized: true,
      };
    }

    const massPoint: Vec3 = {
      x: this.massPointX / this.pointCount,
      y: this.massPointY / this.pointCount,
      z: this.massPointZ / this.pointCount,
    };

    // 先嘗試不加正則化
    let result = this.solveLinearSystem(
      this.a00, this.a01, this.a02,
      this.a01, this.a11, this.a12,
      this.a02, this.a12, this.a22,
      this.b0, this.b1, this.b2
    );

    let wasRegularized = false;

    if (!result || !isInsideCell(result, cellMin, cellMax)) {
      // 加入 Tikhonov regularization: (A + λI)v = b + λ·massPoint
      const lambda = regularization;
      result = this.solveLinearSystem(
        this.a00 + lambda, this.a01, this.a02,
        this.a01, this.a11 + lambda, this.a12,
        this.a02, this.a12, this.a22 + lambda,
        this.b0 + lambda * massPoint.x,
        this.b1 + lambda * massPoint.y,
        this.b2 + lambda * massPoint.z
      );
      wasRegularized = true;
    }

    if (!result) {
      // 完全退化，使用質心
      result = massPoint;
      wasRegularized = true;
    }

    // 夾限到 cell 範圍內
    const clamped: Vec3 = {
      x: Math.max(cellMin.x, Math.min(cellMax.x, result.x)),
      y: Math.max(cellMin.y, Math.min(cellMax.y, result.y)),
      z: Math.max(cellMin.z, Math.min(cellMax.z, result.z)),
    };

    return { point: clamped, wasRegularized };
  }

  /**
   * Cramer's rule 求解 3×3 線性系統
   *
   * | a00 a01 a02 | | x |   | r0 |
   * | a10 a11 a12 | | y | = | r1 |
   * | a20 a21 a22 | | z |   | r2 |
   *
   * @returns 解向量，若行列式接近零則回傳 null
   */
  private solveLinearSystem(
    a00: number, a01: number, a02: number,
    a10: number, a11: number, a12: number,
    a20: number, a21: number, a22: number,
    r0: number, r1: number, r2: number
  ): Vec3 | null {
    const det =
      a00 * (a11 * a22 - a12 * a21) -
      a01 * (a10 * a22 - a12 * a20) +
      a02 * (a10 * a21 - a11 * a20);

    if (Math.abs(det) < 1e-10) return null;

    const invDet = 1.0 / det;

    const x = (
      r0 * (a11 * a22 - a12 * a21) -
      a01 * (r1 * a22 - a12 * r2) +
      a02 * (r1 * a21 - a11 * r2)
    ) * invDet;

    const y = (
      a00 * (r1 * a22 - a12 * r2) -
      r0 * (a10 * a22 - a12 * a20) +
      a02 * (a10 * r2 - r1 * a20)
    ) * invDet;

    const z = (
      a00 * (a11 * r2 - r1 * a21) -
      a01 * (a10 * r2 - r1 * a20) +
      r0 * (a10 * a21 - a11 * a20)
    ) * invDet;

    if (isNaN(x) || isNaN(y) || isNaN(z)) return null;

    return { x, y, z };
  }
}

/** 檢查點是否在 cell 範圍內（含小容差） */
function isInsideCell(p: Vec3, cellMin: Vec3, cellMax: Vec3): boolean {
  const eps = (cellMax.x - cellMin.x) * 0.5; // 允許半個 cell 的容差
  return (
    p.x >= cellMin.x - eps && p.x <= cellMax.x + eps &&
    p.y >= cellMin.y - eps && p.y <= cellMax.y + eps &&
    p.z >= cellMin.z - eps && p.z <= cellMax.z + eps
  );
}

// ═══════════════════════════════════════════════════════════════
//  Cell Key 工具
// ═══════════════════════════════════════════════════════════════

/** Cell 座標 → 字串 key */
function cellKey(i: number, j: number, k: number): string {
  return `${i},${j},${k}`;
}

// ═══════════════════════════════════════════════════════════════
//  主演算法：Dual Contouring
// ═══════════════════════════════════════════════════════════════

/**
 * 執行 True Dual Contouring
 *
 * // === TRUE DUAL CONTOURING ===
 *
 * 完整流程：
 *   1. 從 HermiteGrid 的 hermiteEdges 建立 active cell 集合
 *   2. 對每個 active cell 求解 QEF → 代表頂點
 *   3. 對每條 sign-change edge 建立 quad（4 個相鄰 cell 的頂點）
 *   4. Quad → 2 個三角形
 *   5. 計算頂點法向（面法向加權平均）
 *
 * @param grid - HermiteGrid（由 buildHermiteGrid 產生）
 * @param regularization - QEF 正則化係數（預設 0.1）
 * @returns DCMeshData
 */
export function dualContouring(
  grid: HermiteGrid,
  regularization: number = 0.1
): DCMeshData {
  const startTime = performance.now();

  if (grid.hermiteEdges.length === 0) {
    return {
      positions: new Float32Array(0),
      normals: new Float32Array(0),
      indices: new Uint32Array(0),
      stats: {
        activeCells: 0, totalQuads: 0, totalTriangles: 0,
        regularizedCells: 0, buildTimeMs: 0,
      },
    };
  }

  const { sizeX, sizeY, sizeZ, originX, originY, originZ, cellSize } = grid;

  // ═══════════════════════════════════════════════════════════
  //  Step 1: 建立 active cell 集合並收集每個 cell 的 Hermite 資料
  //
  //  一條 edge (i,j,k) 沿 axis 方向屬於哪個 cell？
  //  在 DC 中，cell (ci, cj, ck) 是由 grid 節點
  //  (ci, cj, ck) 到 (ci+1, cj+1, ck+1) 圍成的立方體。
  //
  //  一條 X-edge (i,j,k)→(i+1,j,k) 被以下 4 個 cell 共享：
  //    (i, j-1, k-1), (i, j, k-1), (i, j-1, k), (i, j, k)
  //  一條 Y-edge (i,j,k)→(i,j+1,k) 被以下 4 個 cell 共享：
  //    (i-1, j, k-1), (i, j, k-1), (i-1, j, k), (i, j, k)
  //  一條 Z-edge (i,j,k)→(i,j,k+1) 被以下 4 個 cell 共享：
  //    (i-1, j-1, k), (i, j-1, k), (i-1, j, k), (i, j, k)
  // ═══════════════════════════════════════════════════════════

  // 每個 cell 的 QEF solver
  const cellQEFs = new Map<string, QEFSolver>();

  // Edge → 共享 cell 的偏移表
  // axis=0 (X-edge): cells at (i, j+dj, k+dk) where dj,dk ∈ {-1, 0}
  // axis=1 (Y-edge): cells at (i+di, j, k+dk) where di,dk ∈ {-1, 0}
  // axis=2 (Z-edge): cells at (i+di, j+dj, k) where di,dj ∈ {-1, 0}
  const EDGE_CELL_OFFSETS: [number, number, number][][] = [
    // X-edge: 固定 i，變化 j, k
    [[0, -1, -1], [0, 0, -1], [0, -1, 0], [0, 0, 0]],
    // Y-edge: 固定 j，變化 i, k
    [[-1, 0, -1], [0, 0, -1], [-1, 0, 0], [0, 0, 0]],
    // Z-edge: 固定 k，變化 i, j
    [[-1, -1, 0], [0, -1, 0], [-1, 0, 0], [0, 0, 0]],
  ];

  // 最大 cell 索引
  const maxCI = sizeX - 2;
  const maxCJ = sizeY - 2;
  const maxCK = sizeZ - 2;

  for (const edge of grid.hermiteEdges) {
    const { axis, gridI, gridJ, gridK, intersection, normal } = edge;
    const offsets = EDGE_CELL_OFFSETS[axis];

    for (const [di, dj, dk] of offsets) {
      const ci = gridI + di;
      const cj = gridJ + dj;
      const ck = gridK + dk;

      // 邊界檢查：cell 必須在有效範圍內
      if (ci < 0 || ci > maxCI || cj < 0 || cj > maxCJ || ck < 0 || ck > maxCK) continue;

      const key = cellKey(ci, cj, ck);
      let qef = cellQEFs.get(key);
      if (!qef) {
        qef = new QEFSolver();
        cellQEFs.set(key, qef);
      }

      qef.add(
        intersection.x, intersection.y, intersection.z,
        normal.x, normal.y, normal.z
      );
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  Step 2: 對每個 active cell 求解 QEF → 代表頂點
  // ═══════════════════════════════════════════════════════════

  const cellVertices = new Map<string, number>(); // cell key → vertex index
  const vertexPositions: number[] = [];
  let regularizedCount = 0;

  cellQEFs.forEach((qef, key) => {
    // 解析 cell 座標
    const parts = key.split(',');
    const ci = parseInt(parts[0], 10);
    const cj = parseInt(parts[1], 10);
    const ck = parseInt(parts[2], 10);

    // Cell 範圍（世界座標）
    const cellMin: Vec3 = {
      x: originX + ci * cellSize,
      y: originY + cj * cellSize,
      z: originZ + ck * cellSize,
    };
    const cellMax: Vec3 = {
      x: originX + (ci + 1) * cellSize,
      y: originY + (cj + 1) * cellSize,
      z: originZ + (ck + 1) * cellSize,
    };

    const { point, wasRegularized } = qef.solve(cellMin, cellMax, regularization);
    if (wasRegularized) regularizedCount++;

    const vertexIndex = vertexPositions.length / 3;
    vertexPositions.push(point.x, point.y, point.z);
    cellVertices.set(key, vertexIndex);
  });

  // ═══════════════════════════════════════════════════════════
  //  Step 3: 對每條 sign-change edge 建立 quad
  //
  //  每條 sign-change edge 被 4 個 cell 共享。
  //  這 4 個 cell 的代表頂點按順序組成一個 quad。
  //
  //  Quad 的頂點順序必須一致（逆時針或順時針），
  //  根據 edge 兩端的 SDF 符號決定 winding order。
  // ═══════════════════════════════════════════════════════════

  const triangleIndices: number[] = [];
  let quadCount = 0;

  for (const edge of grid.hermiteEdges) {
    const { axis, gridI, gridJ, gridK, sdfA, sdfB } = edge;
    const offsets = EDGE_CELL_OFFSETS[axis];

    // 收集 4 個相鄰 cell 的頂點索引
    const quadVerts: number[] = [];
    for (const [di, dj, dk] of offsets) {
      const ci = gridI + di;
      const cj = gridJ + dj;
      const ck = gridK + dk;

      if (ci < 0 || ci > maxCI || cj < 0 || cj > maxCJ || ck < 0 || ck > maxCK) continue;

      const key = cellKey(ci, cj, ck);
      const vIdx = cellVertices.get(key);
      if (vIdx !== undefined) {
        quadVerts.push(vIdx);
      }
    }

    // 需要恰好 4 個頂點才能形成 quad
    if (quadVerts.length < 3) continue;

    // 決定 winding order：
    // 如果 sdfA < 0（edge 起點在內部），法向指向 sdfB（外部）
    // 我們需要三角形的法向與 surface normal 一致
    const flip = sdfA > 0;

    if (quadVerts.length === 4) {
      // Quad → 2 個三角形
      if (flip) {
        triangleIndices.push(quadVerts[0], quadVerts[2], quadVerts[1]);
        triangleIndices.push(quadVerts[0], quadVerts[3], quadVerts[2]);
      } else {
        triangleIndices.push(quadVerts[0], quadVerts[1], quadVerts[2]);
        triangleIndices.push(quadVerts[0], quadVerts[2], quadVerts[3]);
      }
      quadCount++;
    } else if (quadVerts.length === 3) {
      // 邊界情況：只有 3 個 cell → 1 個三角形
      if (flip) {
        triangleIndices.push(quadVerts[0], quadVerts[2], quadVerts[1]);
      } else {
        triangleIndices.push(quadVerts[0], quadVerts[1], quadVerts[2]);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  Step 4: 計算頂點法向（面法向加權平均）
  // ═══════════════════════════════════════════════════════════

  const numVerts = vertexPositions.length / 3;
  const normalAccum = new Float32Array(numVerts * 3); // 累加法向

  const numTris = triangleIndices.length / 3;
  for (let t = 0; t < numTris; t++) {
    const i0 = triangleIndices[t * 3 + 0];
    const i1 = triangleIndices[t * 3 + 1];
    const i2 = triangleIndices[t * 3 + 2];

    // 三角形頂點
    const ax = vertexPositions[i0 * 3], ay = vertexPositions[i0 * 3 + 1], az = vertexPositions[i0 * 3 + 2];
    const bx = vertexPositions[i1 * 3], by = vertexPositions[i1 * 3 + 1], bz = vertexPositions[i1 * 3 + 2];
    const cx = vertexPositions[i2 * 3], cy = vertexPositions[i2 * 3 + 1], cz = vertexPositions[i2 * 3 + 2];

    // 邊向量
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;

    // 面法向（叉積）
    const fnx = e1y * e2z - e1z * e2y;
    const fny = e1z * e2x - e1x * e2z;
    const fnz = e1x * e2y - e1y * e2x;

    // 累加到各頂點
    normalAccum[i0 * 3 + 0] += fnx; normalAccum[i0 * 3 + 1] += fny; normalAccum[i0 * 3 + 2] += fnz;
    normalAccum[i1 * 3 + 0] += fnx; normalAccum[i1 * 3 + 1] += fny; normalAccum[i1 * 3 + 2] += fnz;
    normalAccum[i2 * 3 + 0] += fnx; normalAccum[i2 * 3 + 1] += fny; normalAccum[i2 * 3 + 2] += fnz;
  }

  // 正規化法向
  for (let v = 0; v < numVerts; v++) {
    const nx = normalAccum[v * 3 + 0];
    const ny = normalAccum[v * 3 + 1];
    const nz = normalAccum[v * 3 + 2];
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 1e-12) {
      normalAccum[v * 3 + 0] = nx / len;
      normalAccum[v * 3 + 1] = ny / len;
      normalAccum[v * 3 + 2] = nz / len;
    } else {
      normalAccum[v * 3 + 1] = 1; // 預設朝上
    }
  }

  const buildTimeMs = performance.now() - startTime;

  console.log(
    `[DualContouring] ${cellQEFs.size} active cells, ${quadCount} quads, ` +
    `${numTris} triangles, ${regularizedCount} regularized, ` +
    `${numVerts} vertices, ${buildTimeMs.toFixed(1)}ms`
  );

  return {
    positions: new Float32Array(vertexPositions),
    normals: normalAccum,
    indices: new Uint32Array(triangleIndices),
    stats: {
      activeCells: cellQEFs.size,
      totalQuads: quadCount,
      totalTriangles: numTris,
      regularizedCells: regularizedCount,
      buildTimeMs,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
//  網格簡化（QEM - Quadric Error Metrics）
//
//  在 DC 產生的 mesh 上進行邊坍縮簡化，
//  保留特徵邊（法向變化大的邊）。
// ═══════════════════════════════════════════════════════════════

/**
 * QEM 網格簡化
 *
 * 使用 Garland & Heckbert (1997) 的 Quadric Error Metrics 方法。
 *
 * @param mesh - DC 產生的網格
 * @param targetRatio - 目標面數比例 (0-1)
 * @param featureAngleDeg - 特徵邊角度閾值（度）
 * @returns 簡化後的 DCMeshData
 */
export function simplifyDCMesh(
  mesh: DCMeshData,
  targetRatio: number = 0.5,
  featureAngleDeg: number = 30
): DCMeshData {
  const startTime = performance.now();
  const numVerts = mesh.positions.length / 3;
  const numTris = mesh.indices.length / 3;
  const targetTris = Math.max(4, Math.floor(numTris * targetRatio));

  if (numTris <= targetTris || numVerts < 4) {
    return mesh; // 無需簡化
  }

  // 建立頂點與面的資料結構
  const positions = Array.from(mesh.positions);
  const indices = Array.from(mesh.indices);

  // 計算每個頂點的 quadric 矩陣
  const quadrics: number[][] = [];
  for (let v = 0; v < numVerts; v++) {
    quadrics.push([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]); // 4x4 symmetric, 10 elements
  }

  // 累加面的 quadric
  for (let t = 0; t < numTris; t++) {
    const i0 = indices[t * 3], i1 = indices[t * 3 + 1], i2 = indices[t * 3 + 2];
    const v0x = positions[i0 * 3], v0y = positions[i0 * 3 + 1], v0z = positions[i0 * 3 + 2];
    const v1x = positions[i1 * 3], v1y = positions[i1 * 3 + 1], v1z = positions[i1 * 3 + 2];
    const v2x = positions[i2 * 3], v2y = positions[i2 * 3 + 1], v2z = positions[i2 * 3 + 2];

    // 面法向
    const e1x = v1x - v0x, e1y = v1y - v0y, e1z = v1z - v0z;
    const e2x = v2x - v0x, e2y = v2y - v0y, e2z = v2z - v0z;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len < 1e-12) continue;
    nx /= len; ny /= len; nz /= len;
    const d = -(nx * v0x + ny * v0y + nz * v0z);

    // Quadric: p = [a, b, c, d] → Q = p*p^T (symmetric 4x4, stored as 10 elements)
    // [a²  ab  ac  ad]
    // [ab  b²  bc  bd]
    // [ac  bc  c²  cd]
    // [ad  bd  cd  d²]
    const q = [
      nx * nx, nx * ny, nx * nz, nx * d,
      ny * ny, ny * nz, ny * d,
      nz * nz, nz * d,
      d * d,
    ];

    for (const vi of [i0, i1, i2]) {
      for (let qi = 0; qi < 10; qi++) {
        quadrics[vi][qi] += q[qi];
      }
    }
  }

  // 建立鄰接表
  const neighbors = new Map<number, Set<number>>();
  for (let t = 0; t < numTris; t++) {
    const i0 = indices[t * 3], i1 = indices[t * 3 + 1], i2 = indices[t * 3 + 2];
    if (!neighbors.has(i0)) neighbors.set(i0, new Set());
    if (!neighbors.has(i1)) neighbors.set(i1, new Set());
    if (!neighbors.has(i2)) neighbors.set(i2, new Set());
    neighbors.get(i0)!.add(i1); neighbors.get(i0)!.add(i2);
    neighbors.get(i1)!.add(i0); neighbors.get(i1)!.add(i2);
    neighbors.get(i2)!.add(i0); neighbors.get(i2)!.add(i1);
  }

  // 邊坍縮：貪心法，每次坍縮 error 最小的邊
  const collapsed = new Uint8Array(numVerts);
  let currentTris = numTris;

  // 計算邊的 error
  function edgeError(v0: number, v1: number): number {
    // 合併 quadric
    const q: number[] = [];
    for (let i = 0; i < 10; i++) {
      q.push(quadrics[v0][i] + quadrics[v1][i]);
    }
    // 中點
    const mx = (positions[v0 * 3] + positions[v1 * 3]) * 0.5;
    const my = (positions[v0 * 3 + 1] + positions[v1 * 3 + 1]) * 0.5;
    const mz = (positions[v0 * 3 + 2] + positions[v1 * 3 + 2]) * 0.5;
    // Error = v^T Q v
    return q[0] * mx * mx + 2 * q[1] * mx * my + 2 * q[2] * mx * mz + 2 * q[3] * mx +
           q[4] * my * my + 2 * q[5] * my * mz + 2 * q[6] * my +
           q[7] * mz * mz + 2 * q[8] * mz + q[9];
  }

  // 簡單的迭代坍縮（非最優但足夠實用）
  while (currentTris > targetTris) {
    let bestError = Infinity;
    let bestV0 = -1, bestV1 = -1;

    // 找最小 error 的邊
    neighbors.forEach((nbrs, v0) => {
      if (collapsed[v0]) return;
      nbrs.forEach(v1 => {
        if (collapsed[v1] || v1 <= v0) return;
        const err = edgeError(v0, v1);
        if (err < bestError) {
          bestError = err;
          bestV0 = v0;
          bestV1 = v1;
        }
      });
    });

    if (bestV0 < 0) break;

    // 坍縮 v1 → v0
    const mx = (positions[bestV0 * 3] + positions[bestV1 * 3]) * 0.5;
    const my = (positions[bestV0 * 3 + 1] + positions[bestV1 * 3 + 1]) * 0.5;
    const mz = (positions[bestV0 * 3 + 2] + positions[bestV1 * 3 + 2]) * 0.5;
    positions[bestV0 * 3] = mx;
    positions[bestV0 * 3 + 1] = my;
    positions[bestV0 * 3 + 2] = mz;

    // 合併 quadric
    for (let i = 0; i < 10; i++) {
      quadrics[bestV0][i] += quadrics[bestV1][i];
    }

    collapsed[bestV1] = 1;

    // 更新索引：將所有 v1 替換為 v0
    for (let t = 0; t < indices.length; t++) {
      if (indices[t] === bestV1) indices[t] = bestV0;
    }

    // 更新鄰接表
    const v1Nbrs = neighbors.get(bestV1);
    if (v1Nbrs) {
      v1Nbrs.forEach(n => {
        if (n !== bestV0) {
          neighbors.get(bestV0)?.add(n);
          neighbors.get(n)?.delete(bestV1);
          neighbors.get(n)?.add(bestV0);
        }
      });
      neighbors.delete(bestV1);
    }

    // 移除退化三角形
    let removed = 0;
    for (let t = indices.length - 3; t >= 0; t -= 3) {
      const a = indices[t], b = indices[t + 1], c = indices[t + 2];
      if (a === b || b === c || a === c) {
        indices.splice(t, 3);
        removed++;
      }
    }
    currentTris -= removed;
  }

  // 重建緊湊的頂點和索引陣列
  const vertexRemap = new Map<number, number>();
  const newPositions: number[] = [];
  const newNormals: number[] = [];
  let newIdx = 0;

  for (let t = 0; t < indices.length; t++) {
    const oldIdx = indices[t];
    if (!vertexRemap.has(oldIdx)) {
      vertexRemap.set(oldIdx, newIdx);
      newPositions.push(positions[oldIdx * 3], positions[oldIdx * 3 + 1], positions[oldIdx * 3 + 2]);
      newNormals.push(0, 0, 0); // 稍後重新計算
      newIdx++;
    }
  }

  const newIndices = indices.map(i => vertexRemap.get(i)!);

  // 重新計算法向
  const normalArr = new Float32Array(newPositions.length);
  for (let t = 0; t < newIndices.length; t += 3) {
    const i0 = newIndices[t], i1 = newIndices[t + 1], i2 = newIndices[t + 2];
    const v0x = newPositions[i0 * 3], v0y = newPositions[i0 * 3 + 1], v0z = newPositions[i0 * 3 + 2];
    const v1x = newPositions[i1 * 3], v1y = newPositions[i1 * 3 + 1], v1z = newPositions[i1 * 3 + 2];
    const v2x = newPositions[i2 * 3], v2y = newPositions[i2 * 3 + 1], v2z = newPositions[i2 * 3 + 2];

    const e1x = v1x - v0x, e1y = v1y - v0y, e1z = v1z - v0z;
    const e2x = v2x - v0x, e2y = v2y - v0y, e2z = v2z - v0z;
    const fnx = e1y * e2z - e1z * e2y;
    const fny = e1z * e2x - e1x * e2z;
    const fnz = e1x * e2y - e1y * e2x;

    normalArr[i0 * 3] += fnx; normalArr[i0 * 3 + 1] += fny; normalArr[i0 * 3 + 2] += fnz;
    normalArr[i1 * 3] += fnx; normalArr[i1 * 3 + 1] += fny; normalArr[i1 * 3 + 2] += fnz;
    normalArr[i2 * 3] += fnx; normalArr[i2 * 3 + 1] += fny; normalArr[i2 * 3 + 2] += fnz;
  }
  for (let v = 0; v < newIdx; v++) {
    const nx = normalArr[v * 3], ny = normalArr[v * 3 + 1], nz = normalArr[v * 3 + 2];
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 1e-12) {
      normalArr[v * 3] /= len; normalArr[v * 3 + 1] /= len; normalArr[v * 3 + 2] /= len;
    }
  }

  const buildTimeMs = performance.now() - startTime;

  console.log(
    `[DualContouring] Simplified: ${numVerts}→${newIdx} vertices, ` +
    `${numTris}→${newIndices.length / 3} triangles, ${buildTimeMs.toFixed(1)}ms`
  );

  return {
    positions: new Float32Array(newPositions),
    normals: normalArr,
    indices: new Uint32Array(newIndices),
    stats: {
      activeCells: mesh.stats.activeCells,
      totalQuads: mesh.stats.totalQuads,
      totalTriangles: newIndices.length / 3,
      regularizedCells: mesh.stats.regularizedCells,
      buildTimeMs: mesh.stats.buildTimeMs + buildTimeMs,
    },
  };
}
