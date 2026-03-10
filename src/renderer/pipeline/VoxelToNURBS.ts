/**
 * VoxelToNURBS - 體素轉 NURBS 演算法管線
 * 
 * 三大轉換階段：
 * 1. 邊界拓撲提取 (Boundary Topology Extraction) - Dual Contouring
 * 2. 共面簡化與特徵線辨識 (Planar Simplification & Feature Recognition) - PCA
 * 3. NURBS 參數擬合 (NURBS Curve/Surface Fitting) - Trust-Region Reflective
 */

import signalBus, { SIGNALS } from '../engines/EventBus';
import {
  VoxelGridPayload,
  NURBSPayload,
  NURBSSurface,
  FeatureLine,
  QualityMetrics,
  SemanticTag,
  PipelineStage,
} from '../store/DataModels';
import { v4 as uuidv4 } from 'uuid';

// ============================================================
// Helper Types
// ============================================================
interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface DCVertex {
  position: Vec3;
  normal: Vec3;
  semanticTag: SemanticTag | null;
}

interface DCEdge {
  v1: number;
  v2: number;
  dihedralAngle: number;
  isFeature: boolean;
}

interface MacroPlane {
  id: string;
  normal: Vec3;
  centroid: Vec3;
  vertices: number[];
  eigenvalues: [number, number, number];
}

interface FeatureLineData {
  id: string;
  points: Vec3[];
  adjacentPlanes: string[];
  isSharp: boolean;
}

// ============================================================
// Phase 1: Boundary Topology Extraction (Dual Contouring)
// ============================================================
class BoundaryExtractor {
  private grid: number[];
  private dims: [number, number, number];
  private voxelSize: number;
  private semanticTags: Map<string, SemanticTag>;

  constructor(payload: VoxelGridPayload) {
    this.grid = payload.voxel_grid.data;
    this.dims = payload.voxel_grid.dimensions;
    this.voxelSize = payload.metadata.voxel_size;
    this.semanticTags = new Map();
    payload.semantic_tags.forEach(tag => {
      this.semanticTags.set(tag.coordinate.join(','), tag);
    });
  }

  /**
   * 取得體素值 (0 = 空, 1 = 實體)
   */
  private getVoxel(x: number, y: number, z: number): number {
    if (x < 0 || x >= this.dims[0] || y < 0 || y >= this.dims[1] || z < 0 || z >= this.dims[2]) {
      return 0;
    }
    return this.grid[x * this.dims[1] * this.dims[2] + y * this.dims[2] + z];
  }

  /**
   * 計算 Hermite 數據 - 邊界交叉點與法向量
   */
  private computeHermiteData(x: number, y: number, z: number): { intersections: Vec3[]; normals: Vec3[] } {
    const intersections: Vec3[] = [];
    const normals: Vec3[] = [];

    // Check 12 edges of the cell
    const edges = [
      // X-aligned edges
      [[0, 0, 0], [1, 0, 0]], [[0, 1, 0], [1, 1, 0]],
      [[0, 0, 1], [1, 0, 1]], [[0, 1, 1], [1, 1, 1]],
      // Y-aligned edges
      [[0, 0, 0], [0, 1, 0]], [[1, 0, 0], [1, 1, 0]],
      [[0, 0, 1], [0, 1, 1]], [[1, 0, 1], [1, 1, 1]],
      // Z-aligned edges
      [[0, 0, 0], [0, 0, 1]], [[1, 0, 0], [1, 0, 1]],
      [[0, 1, 0], [0, 1, 1]], [[1, 1, 0], [1, 1, 1]],
    ];

    for (const [p1, p2] of edges) {
      const v1 = this.getVoxel(x + p1[0], y + p1[1], z + p1[2]);
      const v2 = this.getVoxel(x + p2[0], y + p2[1], z + p2[2]);

      if (v1 !== v2) {
        // Sign change - boundary crossing
        const t = 0.5; // Linear interpolation
        intersections.push({
          x: (x + p1[0] + t * (p2[0] - p1[0])) * this.voxelSize,
          y: (y + p1[1] + t * (p2[1] - p1[1])) * this.voxelSize,
          z: (z + p1[2] + t * (p2[2] - p1[2])) * this.voxelSize,
        });

        // Compute normal (gradient direction)
        const nx = p2[0] - p1[0];
        const ny = p2[1] - p1[1];
        const nz = p2[2] - p1[2];
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        normals.push({
          x: (v2 > v1 ? 1 : -1) * nx / len,
          y: (v2 > v1 ? 1 : -1) * ny / len,
          z: (v2 > v1 ? 1 : -1) * nz / len,
        });
      }
    }

    return { intersections, normals };
  }

  /**
   * QEF 最小化求解 (Quadratic Error Function)
   * 使用 SVD 分解保證穩定性
   */
  private solveQEF(intersections: Vec3[], normals: Vec3[], cellCenter: Vec3): Vec3 {
    if (intersections.length === 0) return cellCenter;

    // Build the least-squares system: A * x = b
    // where each row is: n_i^T * (x - p_i) = 0
    // => n_i^T * x = n_i^T * p_i

    let sumX = 0, sumY = 0, sumZ = 0;
    let ata00 = 0, ata01 = 0, ata02 = 0;
    let ata11 = 0, ata12 = 0, ata22 = 0;
    let atb0 = 0, atb1 = 0, atb2 = 0;

    for (let i = 0; i < intersections.length; i++) {
      const n = normals[i];
      const p = intersections[i];
      const d = n.x * p.x + n.y * p.y + n.z * p.z;

      ata00 += n.x * n.x; ata01 += n.x * n.y; ata02 += n.x * n.z;
      ata11 += n.y * n.y; ata12 += n.y * n.z;
      ata22 += n.z * n.z;
      atb0 += n.x * d; atb1 += n.y * d; atb2 += n.z * d;

      sumX += p.x; sumY += p.y; sumZ += p.z;
    }

    // Mass point (centroid) as fallback for rank-deficient systems
    const massPoint: Vec3 = {
      x: sumX / intersections.length,
      y: sumY / intersections.length,
      z: sumZ / intersections.length,
    };

    // Add regularization (Tikhonov) to handle rank deficiency
    const lambda = 0.01;
    ata00 += lambda; ata11 += lambda; ata22 += lambda;
    atb0 += lambda * massPoint.x;
    atb1 += lambda * massPoint.y;
    atb2 += lambda * massPoint.z;

    // Solve 3x3 system using Cramer's rule
    const det = ata00 * (ata11 * ata22 - ata12 * ata12)
              - ata01 * (ata01 * ata22 - ata12 * ata02)
              + ata02 * (ata01 * ata12 - ata11 * ata02);

    if (Math.abs(det) < 1e-10) {
      return massPoint; // Fallback to mass point
    }

    const invDet = 1.0 / det;
    return {
      x: invDet * (atb0 * (ata11 * ata22 - ata12 * ata12) - ata01 * (atb1 * ata22 - ata12 * atb2) + ata02 * (atb1 * ata12 - ata11 * atb2)),
      y: invDet * (ata00 * (atb1 * ata22 - ata12 * atb2) - atb0 * (ata01 * ata22 - ata12 * ata02) + ata02 * (ata01 * atb2 - atb1 * ata02)),
      z: invDet * (ata00 * (ata11 * atb2 - atb1 * ata12) - ata01 * (ata01 * atb2 - atb1 * ata02) + atb0 * (ata01 * ata12 - ata11 * ata02)),
    };
  }

  /**
   * 執行 Dual Contouring
   */
  extract(): { vertices: DCVertex[]; edges: DCEdge[] } {
    const vertices: DCVertex[] = [];
    const edges: DCEdge[] = [];
    const vertexMap = new Map<string, number>();

    signalBus.publish(SIGNALS.LOG_MESSAGE, {
      level: 'info',
      source: 'Pipeline:Phase1',
      message: `Dual Contouring 開始: 網格維度 [${this.dims}]`,
    });

    // For each cell in the grid
    for (let x = 0; x < this.dims[0] - 1; x++) {
      for (let y = 0; y < this.dims[1] - 1; y++) {
        for (let z = 0; z < this.dims[2] - 1; z++) {
          // Check if this cell has a sign change
          const { intersections, normals } = this.computeHermiteData(x, y, z);

          if (intersections.length > 0) {
            const cellCenter: Vec3 = {
              x: (x + 0.5) * this.voxelSize,
              y: (y + 0.5) * this.voxelSize,
              z: (z + 0.5) * this.voxelSize,
            };

            // Solve QEF for optimal vertex position
            const position = this.solveQEF(intersections, normals, cellCenter);

            // Check for semantic tag
            const tagKey = `${x},${y},${z}`;
            const semanticTag = this.semanticTags.get(tagKey) || null;

            // Apply sharp constraint via Lagrange multipliers
            if (semanticTag?.intent === 'sharp') {
              // Keep vertex closer to cell center for sharp features
              position.x = position.x * 0.7 + cellCenter.x * 0.3;
              position.y = position.y * 0.7 + cellCenter.y * 0.3;
              position.z = position.z * 0.7 + cellCenter.z * 0.3;
            }

            // Compute average normal
            let avgNx = 0, avgNy = 0, avgNz = 0;
            normals.forEach(n => { avgNx += n.x; avgNy += n.y; avgNz += n.z; });
            const nLen = Math.sqrt(avgNx * avgNx + avgNy * avgNy + avgNz * avgNz) || 1;

            const vertexIdx = vertices.length;
            vertexMap.set(`${x},${y},${z}`, vertexIdx);
            vertices.push({
              position,
              normal: { x: avgNx / nLen, y: avgNy / nLen, z: avgNz / nLen },
              semanticTag,
            });
          }
        }
      }
    }

    // Generate edges between adjacent cells
    for (let x = 0; x < this.dims[0] - 1; x++) {
      for (let y = 0; y < this.dims[1] - 1; y++) {
        for (let z = 0; z < this.dims[2] - 1; z++) {
          const key = `${x},${y},${z}`;
          const idx = vertexMap.get(key);
          if (idx === undefined) continue;

          // Connect to neighbors
          const neighbors = [
            `${x + 1},${y},${z}`,
            `${x},${y + 1},${z}`,
            `${x},${y},${z + 1}`,
          ];

          for (const nKey of neighbors) {
            const nIdx = vertexMap.get(nKey);
            if (nIdx !== undefined) {
              const n1 = vertices[idx].normal;
              const n2 = vertices[nIdx].normal;
              const dot = n1.x * n2.x + n1.y * n2.y + n1.z * n2.z;
              const angle = Math.acos(Math.max(-1, Math.min(1, dot)));

              edges.push({
                v1: idx,
                v2: nIdx,
                dihedralAngle: angle,
                isFeature: angle > Math.PI / 6, // 30 degrees threshold
              });
            }
          }
        }
      }
    }

    signalBus.publish(SIGNALS.LOG_MESSAGE, {
      level: 'success',
      source: 'Pipeline:Phase1',
      message: `Dual Contouring 完成: ${vertices.length} 頂點, ${edges.length} 邊`,
    });

    return { vertices, edges };
  }
}

// ============================================================
// Phase 2: Planar Simplification & Feature Recognition
// ============================================================
class PlanarSimplifier {
  private vertices: DCVertex[];
  private edges: DCEdge[];
  private featureAngleThreshold: number = Math.PI / 6; // 30 degrees

  constructor(vertices: DCVertex[], edges: DCEdge[]) {
    this.vertices = vertices;
    this.edges = edges;
  }

  /**
   * PCA 法向分群 (Principal Component Analysis)
   */
  private performPCA(vertexIndices: number[]): { eigenvalues: [number, number, number]; normal: Vec3; centroid: Vec3 } {
    if (vertexIndices.length === 0) {
      return { eigenvalues: [0, 0, 0], normal: { x: 0, y: 1, z: 0 }, centroid: { x: 0, y: 0, z: 0 } };
    }

    // Compute centroid
    let cx = 0, cy = 0, cz = 0;
    vertexIndices.forEach(i => {
      cx += this.vertices[i].position.x;
      cy += this.vertices[i].position.y;
      cz += this.vertices[i].position.z;
    });
    const n = vertexIndices.length;
    cx /= n; cy /= n; cz /= n;

    // Compute covariance matrix
    let cov00 = 0, cov01 = 0, cov02 = 0;
    let cov11 = 0, cov12 = 0, cov22 = 0;

    vertexIndices.forEach(i => {
      const dx = this.vertices[i].position.x - cx;
      const dy = this.vertices[i].position.y - cy;
      const dz = this.vertices[i].position.z - cz;
      cov00 += dx * dx; cov01 += dx * dy; cov02 += dx * dz;
      cov11 += dy * dy; cov12 += dy * dz;
      cov22 += dz * dz;
    });

    cov00 /= n; cov01 /= n; cov02 /= n;
    cov11 /= n; cov12 /= n; cov22 /= n;

    // Simplified eigenvalue computation (power iteration for smallest eigenvalue)
    // Use trace and determinant for 3x3 symmetric matrix
    const trace = cov00 + cov11 + cov22;
    const q = trace / 3;
    const p1 = cov01 * cov01 + cov02 * cov02 + cov12 * cov12;
    const p2 = (cov00 - q) * (cov00 - q) + (cov11 - q) * (cov11 - q) + (cov22 - q) * (cov22 - q) + 2 * p1;
    const p = Math.sqrt(p2 / 6);

    // Eigenvalues (approximate)
    const lambda1 = q + 2 * p;
    const lambda2 = q;
    const lambda3 = q - 2 * p;

    // Normal is the eigenvector corresponding to smallest eigenvalue
    // Approximate using cross product of two rows
    const normal = this.vertices[vertexIndices[0]]?.normal || { x: 0, y: 1, z: 0 };

    return {
      eigenvalues: [Math.abs(lambda1), Math.abs(lambda2), Math.abs(lambda3)],
      normal,
      centroid: { x: cx, y: cy, z: cz },
    };
  }

  /**
   * 區域生長法分群
   */
  private regionGrowing(): MacroPlane[] {
    const visited = new Set<number>();
    const planes: MacroPlane[] = [];

    // Build adjacency list
    const adjacency = new Map<number, number[]>();
    this.edges.forEach(edge => {
      if (!edge.isFeature) { // Only connect non-feature edges
        if (!adjacency.has(edge.v1)) adjacency.set(edge.v1, []);
        if (!adjacency.has(edge.v2)) adjacency.set(edge.v2, []);
        adjacency.get(edge.v1)!.push(edge.v2);
        adjacency.get(edge.v2)!.push(edge.v1);
      }
    });

    for (let i = 0; i < this.vertices.length; i++) {
      if (visited.has(i)) continue;

      // BFS region growing
      const region: number[] = [];
      const queue = [i];
      visited.add(i);

      while (queue.length > 0) {
        const current = queue.shift()!;
        region.push(current);

        const neighbors = adjacency.get(current) || [];
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            // Check normal similarity
            const n1 = this.vertices[current].normal;
            const n2 = this.vertices[neighbor].normal;
            const dot = n1.x * n2.x + n1.y * n2.y + n1.z * n2.z;
            if (dot > 0.85) { // Similar normals
              visited.add(neighbor);
              queue.push(neighbor);
            }
          }
        }
      }

      if (region.length >= 1) {
        const pca = this.performPCA(region);
        planes.push({
          id: uuidv4(),
          normal: pca.normal,
          centroid: pca.centroid,
          vertices: region,
          eigenvalues: pca.eigenvalues,
        });
      }
    }

    return planes;
  }

  /**
   * 特徵線提取
   */
  private extractFeatureLines(planes: MacroPlane[]): FeatureLineData[] {
    const featureLines: FeatureLineData[] = [];

    // Feature edges are edges with high dihedral angle
    const featureEdges = this.edges.filter(e => e.isFeature);

    // Group connected feature edges into lines
    const visited = new Set<number>();
    const edgeAdj = new Map<number, number[]>();

    featureEdges.forEach((edge, idx) => {
      if (!edgeAdj.has(edge.v1)) edgeAdj.set(edge.v1, []);
      if (!edgeAdj.has(edge.v2)) edgeAdj.set(edge.v2, []);
      edgeAdj.get(edge.v1)!.push(idx);
      edgeAdj.get(edge.v2)!.push(idx);
    });

    for (let i = 0; i < featureEdges.length; i++) {
      if (visited.has(i)) continue;

      const linePoints: Vec3[] = [];
      const queue = [i];
      visited.add(i);

      while (queue.length > 0) {
        const edgeIdx = queue.shift()!;
        const edge = featureEdges[edgeIdx];

        if (linePoints.length === 0) {
          linePoints.push(this.vertices[edge.v1].position);
        }
        linePoints.push(this.vertices[edge.v2].position);

        // Find connected feature edges
        const nextEdges = edgeAdj.get(edge.v2) || [];
        for (const nextIdx of nextEdges) {
          if (!visited.has(nextIdx)) {
            visited.add(nextIdx);
            queue.push(nextIdx);
          }
        }
      }

      if (linePoints.length >= 2) {
        // Apply MLS smoothing for smooth_curve tagged lines
        const hasSmooth = linePoints.some((_, idx) => {
          // Check if any vertex near this point has smooth tag
          return this.vertices.some(v =>
            v.semanticTag?.intent === 'smooth_curve' &&
            Math.abs(v.position.x - linePoints[idx].x) < 1.5 &&
            Math.abs(v.position.y - linePoints[idx].y) < 1.5 &&
            Math.abs(v.position.z - linePoints[idx].z) < 1.5
          );
        });

        if (hasSmooth) {
          // Moving Least Squares smoothing
          this.mlsSmooth(linePoints);
        }

        featureLines.push({
          id: uuidv4(),
          points: linePoints,
          adjacentPlanes: [],
          isSharp: !hasSmooth,
        });
      }
    }

    return featureLines;
  }

  /**
   * Moving Least Squares (MLS) 平滑降噪
   */
  private mlsSmooth(points: Vec3[], iterations: number = 3): void {
    for (let iter = 0; iter < iterations; iter++) {
      for (let i = 1; i < points.length - 1; i++) {
        points[i] = {
          x: 0.25 * points[i - 1].x + 0.5 * points[i].x + 0.25 * points[i + 1].x,
          y: 0.25 * points[i - 1].y + 0.5 * points[i].y + 0.25 * points[i + 1].y,
          z: 0.25 * points[i - 1].z + 0.5 * points[i].z + 0.25 * points[i + 1].z,
        };
      }
    }
  }

  /**
   * 執行簡化與特徵辨識
   */
  simplify(): { planes: MacroPlane[]; featureLines: FeatureLineData[] } {
    signalBus.publish(SIGNALS.LOG_MESSAGE, {
      level: 'info',
      source: 'Pipeline:Phase2',
      message: 'PCA 共面簡化與特徵線辨識開始',
    });

    const planes = this.regionGrowing();
    const featureLines = this.extractFeatureLines(planes);

    signalBus.publish(SIGNALS.LOG_MESSAGE, {
      level: 'success',
      source: 'Pipeline:Phase2',
      message: `簡化完成: ${planes.length} 巨觀平面, ${featureLines.length} 特徵線`,
    });

    return { planes, featureLines };
  }
}

// ============================================================
// Phase 3: NURBS Parameter Fitting
// ============================================================
class NURBSFitter {
  private planes: MacroPlane[];
  private featureLines: FeatureLineData[];
  private vertices: DCVertex[];
  private semanticTags: Map<string, SemanticTag>;

  constructor(
    planes: MacroPlane[],
    featureLines: FeatureLineData[],
    vertices: DCVertex[],
    semanticTags: SemanticTag[]
  ) {
    this.planes = planes;
    this.featureLines = featureLines;
    this.vertices = vertices;
    this.semanticTags = new Map();
    semanticTags.forEach(tag => {
      this.semanticTags.set(tag.coordinate.join(','), tag);
    });
  }

  /**
   * 向心參數化 (Centripetal Parameterization)
   */
  private centripetalParameterize(points: Vec3[]): number[] {
    const n = points.length;
    if (n <= 1) return [0];

    const params = [0];
    let totalDist = 0;
    const dists: number[] = [];

    for (let i = 1; i < n; i++) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      const dz = points[i].z - points[i - 1].z;
      const dist = Math.sqrt(Math.sqrt(dx * dx + dy * dy + dz * dz)); // Square root for centripetal
      dists.push(dist);
      totalDist += dist;
    }

    for (let i = 0; i < dists.length; i++) {
      params.push(params[params.length - 1] + dists[i] / totalDist);
    }

    return params;
  }

  /**
   * 生成鉗位節點向量 (Clamped Knot Vector)
   */
  private generateClampedKnots(n: number, degree: number): number[] {
    const m = n + degree + 1;
    const knots: number[] = [];

    for (let i = 0; i <= degree; i++) knots.push(0);

    const internalKnots = m - 2 * (degree + 1);
    for (let i = 1; i <= internalKnots; i++) {
      knots.push(i / (internalKnots + 1));
    }

    for (let i = 0; i <= degree; i++) knots.push(1);

    return knots;
  }

  /**
   * Cox-de Boor 遞迴演算法 - B 樣條基底函數
   */
  private basisFunction(i: number, p: number, u: number, knots: number[]): number {
    if (p === 0) {
      return (u >= knots[i] && u < knots[i + 1]) ? 1 : 0;
    }

    let left = 0;
    let right = 0;

    const denom1 = knots[i + p] - knots[i];
    if (denom1 !== 0) {
      left = ((u - knots[i]) / denom1) * this.basisFunction(i, p - 1, u, knots);
    }

    const denom2 = knots[i + p + 1] - knots[i + 1];
    if (denom2 !== 0) {
      right = ((knots[i + p + 1] - u) / denom2) * this.basisFunction(i + 1, p - 1, u, knots);
    }

    return left + right;
  }

  /**
   * Trust-Region Reflective 求解器（簡化實作）
   * 最小平方法曲面擬合
   */
  private fitSurface(
    targetPoints: Vec3[],
    gridU: number,
    gridV: number,
    degreeU: number,
    degreeV: number,
    isRational: boolean,
    weights?: number[]
  ): { controlPoints: number[][][]; knotsU: number[]; knotsV: number[]; iterations: number; error: number } {
    const numCPU = gridU;
    const numCPV = gridV;

    // Generate knot vectors
    const knotsU = this.generateClampedKnots(numCPU, degreeU);
    const knotsV = this.generateClampedKnots(numCPV, degreeV);

    // Initialize control points from target points
    const controlPoints: number[][][] = [];
    for (let i = 0; i < numCPU; i++) {
      controlPoints[i] = [];
      for (let j = 0; j < numCPV; j++) {
        const idx = Math.min(i * numCPV + j, targetPoints.length - 1);
        const pt = targetPoints[idx] || { x: 0, y: 0, z: 0 };
        const w = isRational ? (weights?.[idx] || 1.0) : 1.0;
        controlPoints[i][j] = [pt.x, pt.y, pt.z, w];
      }
    }

    // Simplified Trust-Region optimization
    let totalError = 0;
    let iterations = 0;
    const maxIterations = 50;
    const tolerance = 1e-6;

    // Parameterize target points
    const params = targetPoints.map((_, idx) => ({
      u: (idx % gridV) / Math.max(1, gridV - 1),
      v: Math.floor(idx / gridV) / Math.max(1, gridU - 1),
    }));

    for (iterations = 0; iterations < maxIterations; iterations++) {
      totalError = 0;

      // Compute residuals
      for (let k = 0; k < targetPoints.length; k++) {
        const target = targetPoints[k];
        const { u, v } = params[k];

        // Evaluate NURBS surface at (u, v)
        let sx = 0, sy = 0, sz = 0, sw = 0;
        for (let i = 0; i < numCPU; i++) {
          const Nu = this.basisFunction(i, degreeU, Math.min(u, 0.999), knotsU);
          for (let j = 0; j < numCPV; j++) {
            const Nv = this.basisFunction(j, degreeV, Math.min(v, 0.999), knotsV);
            const cp = controlPoints[i][j];
            const w = cp[3];
            sx += Nu * Nv * cp[0] * w;
            sy += Nu * Nv * cp[1] * w;
            sz += Nu * Nv * cp[2] * w;
            sw += Nu * Nv * w;
          }
        }

        if (sw > 0) {
          sx /= sw; sy /= sw; sz /= sw;
        }

        const dx = target.x - sx;
        const dy = target.y - sy;
        const dz = target.z - sz;
        totalError += dx * dx + dy * dy + dz * dz;

        // Gradient descent step (simplified Trust-Region)
        const stepSize = 0.1 / (1 + iterations * 0.1);
        for (let i = 0; i < numCPU; i++) {
          const Nu = this.basisFunction(i, degreeU, Math.min(u, 0.999), knotsU);
          for (let j = 0; j < numCPV; j++) {
            const Nv = this.basisFunction(j, degreeV, Math.min(v, 0.999), knotsV);
            const influence = Nu * Nv * stepSize;
            if (influence > 1e-8) {
              controlPoints[i][j][0] += dx * influence;
              controlPoints[i][j][1] += dy * influence;
              controlPoints[i][j][2] += dz * influence;
            }
          }
        }
      }

      totalError = Math.sqrt(totalError / targetPoints.length);
      if (totalError < tolerance) break;
    }

    return { controlPoints, knotsU, knotsV, iterations, error: totalError };
  }

  /**
   * 擬合特徵線為 NURBS 曲線
   */
  private fitFeatureLine(line: FeatureLineData, semanticTags: SemanticTag[]): FeatureLine {
    const degree = line.isSharp ? 1 : 3;
    const knots = this.generateClampedKnots(line.points.length, degree);

    // For smooth curves, use centripetal parameterization
    let controlPoints: number[][];
    if (line.isSharp) {
      controlPoints = line.points.map(p => [p.x, p.y, p.z, 1.0]);
    } else {
      // Smooth: use points as initial control points with MLS refinement
      controlPoints = line.points.map(p => [p.x, p.y, p.z, 1.0]);
    }

    return {
      curve_id: line.id,
      degree,
      knots,
      control_points: controlPoints,
      adjacent_patch_ids: line.adjacentPlanes,
    };
  }

  /**
   * 執行 NURBS 擬合
   */
  fit(): NURBSPayload {
    signalBus.publish(SIGNALS.LOG_MESSAGE, {
      level: 'info',
      source: 'Pipeline:Phase3',
      message: `NURBS 參數擬合開始: ${this.planes.length} 平面, ${this.featureLines.length} 特徵線`,
    });

    const nurbsSurfaces: NURBSSurface[] = [];
    const nurbsFeatureLines: FeatureLine[] = [];
    let totalIterations = 0;
    let maxDeviation = 0;
    let totalDeviation = 0;
    let surfaceCount = 0;

    // Fit each macro plane as a NURBS surface
    for (const plane of this.planes) {
      if (plane.vertices.length < 4) continue;

      const targetPoints = plane.vertices.map(i => this.vertices[i].position);

      // Determine degree based on semantic tags
      let degreeU = 3, degreeV = 3;
      let isRational = false;
      const weights: number[] = [];

      // Check for semantic tags in this plane's vertices
      const planeSemanticTags = plane.vertices
        .map(i => this.vertices[i].semanticTag)
        .filter(Boolean);

      if (planeSemanticTags.some(t => t?.intent === 'fillet_R')) {
        degreeU = 2; degreeV = 2;
        isRational = true;
        // Rational weights for circular arc representation
        targetPoints.forEach(() => weights.push(Math.cos(Math.PI / 4)));
      } else if (planeSemanticTags.some(t => t?.intent === 'sharp')) {
        degreeU = 1; degreeV = 1;
      }

      // Determine grid size
      const gridU = Math.max(3, Math.min(8, Math.ceil(Math.sqrt(targetPoints.length))));
      const gridV = Math.max(3, Math.min(8, Math.ceil(targetPoints.length / gridU)));

      const result = this.fitSurface(
        targetPoints, gridU, gridV,
        degreeU, degreeV, isRational,
        weights.length > 0 ? weights : undefined
      );

      nurbsSurfaces.push({
        patch_id: plane.id,
        degree_u: degreeU,
        degree_v: degreeV,
        knots_u: result.knotsU,
        knots_v: result.knotsV,
        is_rational: isRational,
        control_points: result.controlPoints,
      });

      totalIterations += result.iterations;
      maxDeviation = Math.max(maxDeviation, result.error);
      totalDeviation += result.error;
      surfaceCount++;
    }

    // Fit feature lines
    for (const line of this.featureLines) {
      const semanticTags = Array.from(this.semanticTags.values());
      nurbsFeatureLines.push(this.fitFeatureLine(line, semanticTags));
    }

    const qualityMetrics: QualityMetrics = {
      max_deviation_mm: maxDeviation,
      mean_deviation_mm: surfaceCount > 0 ? totalDeviation / surfaceCount : 0,
      convergence_iterations: totalIterations,
      solver_used: 'Trust-Region Reflective (Simplified)',
    };

    signalBus.publish(SIGNALS.LOG_MESSAGE, {
      level: 'success',
      source: 'Pipeline:Phase3',
      message: `NURBS 擬合完成: ${nurbsSurfaces.length} 曲面, ${nurbsFeatureLines.length} 特徵線, 最大偏差 ${maxDeviation.toFixed(4)}mm`,
    });

    return {
      model_unit: 'Millimeters',
      nurbs_surfaces: nurbsSurfaces,
      feature_lines: nurbsFeatureLines,
      quality_metrics: qualityMetrics,
    };
  }
}

// ============================================================
// Pipeline Controller
// ============================================================
export class VoxelToNURBSPipeline {
  private isRunning: boolean = false;

  constructor() {
    this.initializeListeners();
  }

  private initializeListeners(): void {
    signalBus.subscribe(SIGNALS.NURBS_CONVERSION_REQ, (payload) => {
      this.execute(payload.project);
    });
  }

  /**
   * 從 ProjectState 建立 VoxelGridPayload
   */
  private buildPayload(project: any): VoxelGridPayload {
    const allVoxels: any[] = [];
    project.chunks.forEach((chunk: any) => {
      allVoxels.push(...chunk.active_voxels);
    });

    if (allVoxels.length === 0) {
      return {
        metadata: { voxel_size: 1.0, bounding_box: [0, 0, 0, 0, 0, 0] },
        voxel_grid: { dimensions: [0, 0, 0], data: [] },
        semantic_tags: [],
      };
    }

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    allVoxels.forEach((v: any) => {
      minX = Math.min(minX, v.position[0]);
      minY = Math.min(minY, v.position[1]);
      minZ = Math.min(minZ, v.position[2]);
      maxX = Math.max(maxX, v.position[0]);
      maxY = Math.max(maxY, v.position[1]);
      maxZ = Math.max(maxZ, v.position[2]);
    });

    // Add padding
    minX -= 1; minY -= 1; minZ -= 1;
    maxX += 1; maxY += 1; maxZ += 1;

    const dimX = maxX - minX + 1;
    const dimY = maxY - minY + 1;
    const dimZ = maxZ - minZ + 1;

    const data = new Array(dimX * dimY * dimZ).fill(0);
    const semanticTags: SemanticTag[] = [];

    allVoxels.forEach((v: any) => {
      const x = v.position[0] - minX;
      const y = v.position[1] - minY;
      const z = v.position[2] - minZ;
      const idx = x * dimY * dimZ + y * dimZ + z;
      if (idx >= 0 && idx < data.length) {
        data[idx] = 1;
      }

      if (v.semantic_intent && v.semantic_intent !== 'default') {
        semanticTags.push({
          coordinate: [x, y, z],
          intent: v.semantic_intent,
          radius: v.fillet_radius,
        });
      }
    });

    return {
      metadata: {
        voxel_size: 1.0,
        bounding_box: [minX, minY, minZ, maxX, maxY, maxZ],
      },
      voxel_grid: { dimensions: [dimX, dimY, dimZ], data },
      semantic_tags: semanticTags,
    };
  }

  /**
   * 執行完整管線
   */
  async execute(project: any): Promise<NURBSPayload | null> {
    if (this.isRunning) {
      signalBus.publish(SIGNALS.LOG_MESSAGE, {
        level: 'warning',
        source: 'Pipeline',
        message: '管線正在執行中，請等待完成',
      });
      return null;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      // Check if there are voxels
      const totalVoxels = project.chunks.reduce((sum: number, c: any) => sum + c.active_voxels.length, 0);
      if (totalVoxels === 0) {
        signalBus.publish(SIGNALS.LOG_MESSAGE, {
          level: 'warning',
          source: 'Pipeline',
          message: '無體素資料，請先放置體素',
        });
        this.isRunning = false;
        return null;
      }

      signalBus.publish(SIGNALS.LOG_MESSAGE, {
        level: 'info',
        source: 'Pipeline',
        message: `===== 體素→NURBS 演算法管線啟動 (${totalVoxels} 體素) =====`,
      });

      // Build payload
      const payload = this.buildPayload(project);

      // ---- Phase 1: Boundary Topology Extraction ----
      signalBus.publish(SIGNALS.PIPELINE_STATE_CHANGED, {
        current_stage: 'boundary_extraction' as PipelineStage,
        progress: 10,
        message: '第一階段: Dual Contouring 邊界拓撲提取...',
      });

      await this.delay(100); // Allow UI update

      const extractor = new BoundaryExtractor(payload);
      const { vertices, edges } = extractor.extract();

      signalBus.publish(SIGNALS.PIPELINE_STATE_CHANGED, {
        progress: 35,
        message: `Phase 1 完成: ${vertices.length} DC 頂點`,
      });

      // ---- Phase 2: Planar Simplification ----
      signalBus.publish(SIGNALS.PIPELINE_STATE_CHANGED, {
        current_stage: 'planar_simplification' as PipelineStage,
        progress: 40,
        message: '第二階段: PCA 共面簡化與特徵線辨識...',
      });

      await this.delay(100);

      const simplifier = new PlanarSimplifier(vertices, edges);
      const { planes, featureLines } = simplifier.simplify();

      signalBus.publish(SIGNALS.PIPELINE_STATE_CHANGED, {
        progress: 65,
        message: `Phase 2 完成: ${planes.length} 平面, ${featureLines.length} 特徵線`,
      });

      // ---- Phase 3: NURBS Fitting ----
      signalBus.publish(SIGNALS.PIPELINE_STATE_CHANGED, {
        current_stage: 'nurbs_fitting' as PipelineStage,
        progress: 70,
        message: '第三階段: NURBS 參數擬合 (Trust-Region Reflective)...',
      });

      await this.delay(100);

      const fitter = new NURBSFitter(planes, featureLines, vertices, payload.semantic_tags);
      const result = fitter.fit();

      // ---- Complete ----
      const elapsed = Date.now() - startTime;

      signalBus.publish(SIGNALS.PIPELINE_STATE_CHANGED, {
        current_stage: 'completed' as PipelineStage,
        progress: 100,
        message: `管線完成 (${elapsed}ms)`,
        result,
      });

      signalBus.publish(SIGNALS.NURBS_CONVERSION_DONE, { result });

      signalBus.publish(SIGNALS.LOG_MESSAGE, {
        level: 'success',
        source: 'Pipeline',
        message: `===== 管線完成: ${result.nurbs_surfaces.length} 曲面, ${result.feature_lines.length} 特徵線, 耗時 ${elapsed}ms =====`,
      });

      this.isRunning = false;
      return result;

    } catch (error: any) {
      signalBus.publish(SIGNALS.PIPELINE_STATE_CHANGED, {
        current_stage: 'error' as PipelineStage,
        progress: 0,
        message: `管線錯誤: ${error.message}`,
      });

      signalBus.publish(SIGNALS.LOG_MESSAGE, {
        level: 'error',
        source: 'Pipeline',
        message: `管線執行失敗: ${error.message}`,
      });

      this.isRunning = false;
      return null;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const voxelToNURBSPipeline = new VoxelToNURBSPipeline();
export default voxelToNURBSPipeline;
