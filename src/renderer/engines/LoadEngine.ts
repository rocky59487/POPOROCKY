import eventBus from './EventBus';
import { Vec3, Voxel, FEAEdge, FEAResult } from '../store/useStore';

/**
 * LoadEngine - 簡化桁架有限元素分析 (Simplified Truss FEA)
 *
 * 每個體素 = 一個節點
 * 每對相鄰體素（含對角線）= 一條桁架邊
 * 使用 Conjugate Gradient 求解 Ku = F
 */

const CROSS_SECTION = 1.0; // m² - 桁架截面積（體素單位面積）

function vecKey(p: Vec3): string { return `${p.x},${p.y},${p.z}`; }
function vecSub(a: Vec3, b: Vec3): Vec3 { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function vecLen(v: Vec3): number { return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z); }
function vecDot(a: Vec3, b: Vec3): number { return a.x * b.x + a.y * b.y + a.z * b.z; }

// 26 鄰居方向（6面 + 12邊 + 8角）
const NEIGHBOR_DIRS: Vec3[] = [];
for (let dx = -1; dx <= 1; dx++)
  for (let dy = -1; dy <= 1; dy++)
    for (let dz = -1; dz <= 1; dz++)
      if (dx !== 0 || dy !== 0 || dz !== 0)
        NEIGHBOR_DIRS.push({ x: dx, y: dy, z: dz });

interface TrussNode {
  index: number;
  pos: Vec3;
  voxel: Voxel;
  isFixed: boolean;
  externalForce: Vec3;
}

interface TrussEdge {
  nodeA: number; // index into nodes array
  nodeB: number;
  length: number;
  direction: Vec3; // unit vector from A to B
  stiffness: number; // EA/L
}

/**
 * Sparse matrix stored as Map<row, Map<col, value>>
 */
class SparseMatrix {
  private data: Map<number, Map<number, number>> = new Map();
  size: number;

  constructor(size: number) { this.size = size; }

  add(row: number, col: number, val: number): void {
    if (Math.abs(val) < 1e-15) return;
    if (!this.data.has(row)) this.data.set(row, new Map());
    const rowMap = this.data.get(row)!;
    rowMap.set(col, (rowMap.get(col) || 0) + val);
  }

  // Sparse matrix-vector multiply: result = M * v
  mulVec(v: Float64Array, result: Float64Array): void {
    result.fill(0);
    this.data.forEach((rowMap, row) => {
      let sum = 0;
      rowMap.forEach((val, col) => { sum += val * v[col]; });
      result[row] = sum;
    });
  }

  // Zero out row and column for fixed DOF, set diagonal to 1
  applyBC(dof: number): void {
    // Zero the row
    this.data.set(dof, new Map([[dof, 1.0]]));
    // Zero the column entries
    this.data.forEach((rowMap, row) => {
      if (row !== dof && rowMap.has(dof)) {
        rowMap.delete(dof);
      }
    });
  }
}

/**
 * Conjugate Gradient solver for sparse symmetric positive-definite system Ax = b
 */
function conjugateGradient(A: SparseMatrix, b: Float64Array, maxIter: number, tol: number): Float64Array {
  const n = b.length;
  const x = new Float64Array(n); // initial guess = 0
  const r = new Float64Array(b);  // r = b - Ax = b (since x=0)
  const p = new Float64Array(r);
  const Ap = new Float64Array(n);

  let rsOld = 0;
  for (let i = 0; i < n; i++) rsOld += r[i] * r[i];

  if (rsOld < tol * tol) return x;

  for (let iter = 0; iter < maxIter; iter++) {
    A.mulVec(p, Ap);

    let pAp = 0;
    for (let i = 0; i < n; i++) pAp += p[i] * Ap[i];
    if (Math.abs(pAp) < 1e-30) break;

    const alpha = rsOld / pAp;

    for (let i = 0; i < n; i++) {
      x[i] += alpha * p[i];
      r[i] -= alpha * Ap[i];
    }

    let rsNew = 0;
    for (let i = 0; i < n; i++) rsNew += r[i] * r[i];

    if (Math.sqrt(rsNew) < tol) break;

    const beta = rsNew / rsOld;
    for (let i = 0; i < n; i++) {
      p[i] = r[i] + beta * p[i];
    }
    rsOld = rsNew;
  }
  return x;
}

export class LoadEngine {
  private gravity: Vec3 = { x: 0, y: -1, z: 0 };
  private gravityMagnitude: number = 9.81;

  setGravity(dir: Vec3): void { this.gravity = dir; }
  setGravityMagnitude(m: number): void { this.gravityMagnitude = m; }

  /**
   * 執行簡化桁架 FEA
   *
   * 流程：
   * 1. 建立節點列表（每個體素 = 一個節點）
   * 2. 建立邊列表（每對相鄰體素 = 一條桁架邊）
   * 3. 組裝全域剛度矩陣 K（稀疏）
   * 4. 組裝力向量 F（重力 + 外部負載）
   * 5. 施加邊界條件（固定節點位移 = 0）
   * 6. 用 Conjugate Gradient 求解 Ku = F
   * 7. 計算每條邊的應變、應力、應力比
   */
  computeFEA(voxels: Voxel[]): FEAResult {
    eventBus.emit('load:computing', { count: voxels.length });

    if (voxels.length === 0) {
      return { edges: [], displacements: new Map(), dangerCount: 0, maxStressRatio: 0, totalEdges: 0 };
    }

    // Step 1: Build node list
    const nodeMap = new Map<string, TrussNode>();
    const nodes: TrussNode[] = [];

    voxels.forEach((v, i) => {
      const key = vecKey(v.pos);
      // Gravity force on this node: mass * g * direction
      // mass = density * volume (1 voxel = 1m³)
      const mass = v.material.density * 1.0;
      const gForce: Vec3 = {
        x: this.gravity.x * this.gravityMagnitude * mass,
        y: this.gravity.y * this.gravityMagnitude * mass,
        z: this.gravity.z * this.gravityMagnitude * mass,
      };

      // Add external load if present
      const extLoad = v.externalLoad || { x: 0, y: 0, z: 0 };

      const node: TrussNode = {
        index: i,
        pos: v.pos,
        voxel: v,
        isFixed: v.isSupport,
        externalForce: {
          x: gForce.x + extLoad.x,
          y: gForce.y + extLoad.y,
          z: gForce.z + extLoad.z,
        },
      };
      nodeMap.set(key, node);
      nodes.push(node);
    });

    // Step 2: Build edge list (adjacent voxels including diagonals)
    const trussEdges: TrussEdge[] = [];
    const edgeSet = new Set<string>();

    nodes.forEach(nodeA => {
      for (const dir of NEIGHBOR_DIRS) {
        const neighborPos: Vec3 = {
          x: nodeA.pos.x + dir.x,
          y: nodeA.pos.y + dir.y,
          z: nodeA.pos.z + dir.z,
        };
        const nodeB = nodeMap.get(vecKey(neighborPos));
        if (!nodeB) continue;

        // Avoid duplicate edges
        const edgeKey = nodeA.index < nodeB.index
          ? `${nodeA.index}-${nodeB.index}`
          : `${nodeB.index}-${nodeA.index}`;
        if (edgeSet.has(edgeKey)) continue;
        edgeSet.add(edgeKey);

        const diff = vecSub(nodeB.pos, nodeA.pos);
        const length = vecLen(diff);
        if (length < 1e-10) continue;

        const direction: Vec3 = { x: diff.x / length, y: diff.y / length, z: diff.z / length };

        // Stiffness = E * A / L
        // Use average Young's modulus of the two connected voxels
        const avgE = (nodeA.voxel.material.youngModulus + nodeB.voxel.material.youngModulus) / 2;
        const stiffness = avgE * CROSS_SECTION / length;

        trussEdges.push({
          nodeA: nodeA.index,
          nodeB: nodeB.index,
          length,
          direction,
          stiffness,
        });
      }
    });

    if (trussEdges.length === 0) {
      return { edges: [], displacements: new Map(), dangerCount: 0, maxStressRatio: 0, totalEdges: 0 };
    }

    // Step 3: Assemble global stiffness matrix K (3 DOF per node: x, y, z)
    const nDOF = nodes.length * 3;
    const K = new SparseMatrix(nDOF);
    const F = new Float64Array(nDOF);

    trussEdges.forEach(edge => {
      const { nodeA: iA, nodeB: iB, direction: d, stiffness: k } = edge;
      // Local stiffness matrix for a truss element in 3D:
      // k_local = (EA/L) * [d⊗d, -d⊗d; -d⊗d, d⊗d]
      // where d is the unit direction vector
      const dd = [
        [d.x * d.x, d.x * d.y, d.x * d.z],
        [d.y * d.x, d.y * d.y, d.y * d.z],
        [d.z * d.x, d.z * d.y, d.z * d.z],
      ];

      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const val = k * dd[i][j];
          // K[3*iA+i, 3*iA+j] += val
          K.add(iA * 3 + i, iA * 3 + j, val);
          // K[3*iB+i, 3*iB+j] += val
          K.add(iB * 3 + i, iB * 3 + j, val);
          // K[3*iA+i, 3*iB+j] -= val
          K.add(iA * 3 + i, iB * 3 + j, -val);
          // K[3*iB+i, 3*iA+j] -= val
          K.add(iB * 3 + i, iA * 3 + j, -val);
        }
      }
    });

    // Step 4: Assemble force vector
    nodes.forEach(node => {
      F[node.index * 3 + 0] = node.externalForce.x;
      F[node.index * 3 + 1] = node.externalForce.y;
      F[node.index * 3 + 2] = node.externalForce.z;
    });

    // Step 5: Apply boundary conditions (fixed nodes: displacement = 0)
    const fixedDOFs: number[] = [];
    nodes.forEach(node => {
      if (node.isFixed) {
        fixedDOFs.push(node.index * 3 + 0);
        fixedDOFs.push(node.index * 3 + 1);
        fixedDOFs.push(node.index * 3 + 2);
      }
    });

    // If no fixed nodes, fix the lowest y nodes automatically
    if (fixedDOFs.length === 0) {
      let minY = Infinity;
      nodes.forEach(n => { if (n.pos.y < minY) minY = n.pos.y; });
      nodes.forEach(n => {
        if (n.pos.y === minY) {
          fixedDOFs.push(n.index * 3 + 0);
          fixedDOFs.push(n.index * 3 + 1);
          fixedDOFs.push(n.index * 3 + 2);
        }
      });
    }

    fixedDOFs.forEach(dof => {
      K.applyBC(dof);
      F[dof] = 0;
    });

    // Step 6: Solve Ku = F using Conjugate Gradient
    const maxIter = Math.min(nDOF * 2, 5000);
    const u = conjugateGradient(K, F, maxIter, 1e-6);

    // Step 7: Compute edge stresses
    const displacements = new Map<string, Vec3>();
    nodes.forEach(node => {
      displacements.set(vecKey(node.pos), {
        x: u[node.index * 3 + 0],
        y: u[node.index * 3 + 1],
        z: u[node.index * 3 + 2],
      });
    });

    const feaEdges: FEAEdge[] = [];
    let dangerCount = 0;
    let maxStressRatio = 0;

    trussEdges.forEach(edge => {
      const { nodeA: iA, nodeB: iB, direction: d, length: L } = edge;

      // Displacement of node A and B
      const uA: Vec3 = { x: u[iA * 3], y: u[iA * 3 + 1], z: u[iA * 3 + 2] };
      const uB: Vec3 = { x: u[iB * 3], y: u[iB * 3 + 1], z: u[iB * 3 + 2] };

      // Relative displacement along edge direction
      const du: Vec3 = vecSub(uB, uA);
      const axialDeformation = vecDot(du, d); // positive = tension, negative = compression

      // Strain = axial deformation / original length
      const strain = axialDeformation / L;

      // Stress = strain * E (average of two nodes)
      const nodeAVoxel = nodes[iA].voxel;
      const nodeBVoxel = nodes[iB].voxel;
      const avgE = (nodeAVoxel.material.youngModulus + nodeBVoxel.material.youngModulus) / 2;
      const stress = strain * avgE; // positive = tension, negative = compression

      const isTension = stress >= 0;

      // Stress ratio: compare against material limits
      let limit: number;
      if (isTension) {
        limit = Math.min(nodeAVoxel.material.maxTension, nodeBVoxel.material.maxTension);
      } else {
        limit = Math.min(nodeAVoxel.material.maxCompression, nodeBVoxel.material.maxCompression);
      }

      const stressRatio = limit > 0 ? Math.abs(stress) / limit : (Math.abs(stress) > 0 ? 999 : 0);

      if (stressRatio > 0.8) dangerCount++;
      if (stressRatio > maxStressRatio) maxStressRatio = stressRatio;

      feaEdges.push({
        nodeA: nodes[iA].pos,
        nodeB: nodes[iB].pos,
        stress: Math.abs(stress),
        stressRatio,
        isTension,
      });
    });

    const result: FEAResult = {
      edges: feaEdges,
      displacements,
      dangerCount,
      maxStressRatio,
      totalEdges: feaEdges.length,
    };

    eventBus.emit('load:computed', {
      totalEdges: feaEdges.length,
      dangerCount,
      maxStressRatio: maxStressRatio.toFixed(3),
    });

    return result;
  }
}

export const loadEngine = new LoadEngine();
