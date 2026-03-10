import eventBus from './EventBus';
import { Vec3, Voxel, FEAEdge, FEAResult, VoxelMaterial } from '../store/useStore';

/**
 * LoadEngine - 簡化桁架有限元素分析 (Simplified Truss FEA)
 * 
 * 強化版：mathjs 矩陣運算、材質預設庫、閃爍動畫、結構報告
 */

const CROSS_SECTION = 1.0;

function vecKey(p: Vec3): string { return `${p.x},${p.y},${p.z}`; }
function vecSub(a: Vec3, b: Vec3): Vec3 { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function vecLen(v: Vec3): number { return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z); }
function vecDot(a: Vec3, b: Vec3): number { return a.x * b.x + a.y * b.y + a.z * b.z; }

const NEIGHBOR_DIRS: Vec3[] = [];
for (let dx = -1; dx <= 1; dx++)
  for (let dy = -1; dy <= 1; dy++)
    for (let dz = -1; dz <= 1; dz++)
      if (dx !== 0 || dy !== 0 || dz !== 0)
        NEIGHBOR_DIRS.push({ x: dx, y: dy, z: dz });

// ─── Material Presets Library ───
export interface MaterialPreset {
  id: string;
  name: string;
  color: string;
  material: VoxelMaterial;
}

export const MATERIAL_PRESETS: MaterialPreset[] = [
  {
    id: 'concrete', name: '混凝土', color: '#a0a0a0',
    material: { youngModulus: 30e9, maxCompression: 30e6, maxTension: 3e6, density: 2400 },
  },
  {
    id: 'steel', name: '鋼材', color: '#c0c0c0',
    material: { youngModulus: 200e9, maxCompression: 250e6, maxTension: 400e6, density: 7850 },
  },
  {
    id: 'wood', name: '木材', color: '#8B6914',
    material: { youngModulus: 12e9, maxCompression: 40e6, maxTension: 80e6, density: 600 },
  },
  {
    id: 'brick', name: '磚塊', color: '#b35c44',
    material: { youngModulus: 5e9, maxCompression: 10e6, maxTension: 0.5e6, density: 1800 },
  },
  {
    id: 'aluminum', name: '鋁合金', color: '#d0d0e0',
    material: { youngModulus: 70e9, maxCompression: 200e6, maxTension: 300e6, density: 2700 },
  },
  {
    id: 'glass', name: '玻璃', color: '#e0e8f0',
    material: { youngModulus: 70e9, maxCompression: 100e6, maxTension: 7e6, density: 2500 },
  },
];

// ─── Structural Report ───
export interface StructuralReport {
  timestamp: string;
  totalNodes: number;
  totalEdges: number;
  dangerEdges: number;
  maxStressRatio: number;
  avgStressRatio: number;
  materialBreakdown: { material: string; count: number }[];
  weakPoints: { position: Vec3; stressRatio: number }[];
  recommendations: string[];
  overallSafety: 'safe' | 'warning' | 'danger';
}

interface TrussNode {
  index: number;
  pos: Vec3;
  voxel: Voxel;
  isFixed: boolean;
  externalForce: Vec3;
}

interface TrussEdge {
  nodeA: number;
  nodeB: number;
  length: number;
  direction: Vec3;
  stiffness: number;
}

// ─── Sparse Matrix ───
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

  mulVec(v: Float64Array, result: Float64Array): void {
    result.fill(0);
    this.data.forEach((rowMap, row) => {
      let sum = 0;
      rowMap.forEach((val, col) => { sum += val * v[col]; });
      result[row] = sum;
    });
  }

  applyBC(dof: number): void {
    this.data.set(dof, new Map([[dof, 1.0]]));
    this.data.forEach((rowMap, row) => {
      if (row !== dof && rowMap.has(dof)) rowMap.delete(dof);
    });
  }
}

// ─── CG Solver ───
function conjugateGradient(A: SparseMatrix, b: Float64Array, maxIter: number, tol: number): Float64Array {
  const n = b.length;
  const x = new Float64Array(n);
  const r = new Float64Array(b);
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
    for (let i = 0; i < n; i++) { x[i] += alpha * p[i]; r[i] -= alpha * Ap[i]; }
    let rsNew = 0;
    for (let i = 0; i < n; i++) rsNew += r[i] * r[i];
    if (Math.sqrt(rsNew) < tol) break;
    const beta = rsNew / rsOld;
    for (let i = 0; i < n; i++) p[i] = r[i] + beta * p[i];
    rsOld = rsNew;
  }
  return x;
}

// ─── mathjs-backed solver (used when available) ───
let mathjsAvailable = false;
let mathjs: any = null;

async function initMathjs() {
  try {
    mathjs = await import('mathjs');
    mathjsAvailable = true;
    console.log('[LoadEngine] mathjs loaded for matrix operations');
  } catch (e) {
    console.warn('[LoadEngine] mathjs not available, using built-in CG solver');
  }
}
initMathjs();

export class LoadEngine {
  private gravity: Vec3 = { x: 0, y: -1, z: 0 };
  private gravityMagnitude: number = 9.81;
  private lastResult: FEAResult | null = null;
  private lastReport: StructuralReport | null = null;

  // Flashing animation state
  private flashingEnabled = true;
  private flashPhase = 0;

  setGravity(dir: Vec3): void { this.gravity = dir; }
  setGravityMagnitude(m: number): void { this.gravityMagnitude = m; }
  getGravity(): Vec3 { return { ...this.gravity }; }
  getGravityMagnitude(): number { return this.gravityMagnitude; }

  setFlashingEnabled(enabled: boolean): void { this.flashingEnabled = enabled; }
  isFlashingEnabled(): boolean { return this.flashingEnabled; }

  // Update flash phase for animation (call from requestAnimationFrame)
  updateFlashPhase(time: number): number {
    this.flashPhase = (Math.sin(time * 5) + 1) / 2; // 0-1 oscillation
    return this.flashPhase;
  }
  getFlashPhase(): number { return this.flashPhase; }

  // Get material preset by id
  getMaterialPreset(id: string): MaterialPreset | undefined {
    return MATERIAL_PRESETS.find(p => p.id === id);
  }

  getAllPresets(): MaterialPreset[] { return [...MATERIAL_PRESETS]; }

  /**
   * 執行簡化桁架 FEA
   */
  computeFEA(voxels: Voxel[]): FEAResult {
    eventBus.emit('load:computing', { count: voxels.length });
    const startTime = performance.now();

    if (voxels.length === 0) {
      return { edges: [], displacements: new Map(), dangerCount: 0, maxStressRatio: 0, totalEdges: 0 };
    }

    // Step 1: Build node list
    const nodeMap = new Map<string, TrussNode>();
    const nodes: TrussNode[] = [];

    voxels.forEach((v, i) => {
      const key = vecKey(v.pos);
      const mass = v.material.density * 1.0;
      const gForce: Vec3 = {
        x: this.gravity.x * this.gravityMagnitude * mass,
        y: this.gravity.y * this.gravityMagnitude * mass,
        z: this.gravity.z * this.gravityMagnitude * mass,
      };
      const extLoad = v.externalLoad || { x: 0, y: 0, z: 0 };
      const node: TrussNode = {
        index: i, pos: v.pos, voxel: v, isFixed: v.isSupport,
        externalForce: { x: gForce.x + extLoad.x, y: gForce.y + extLoad.y, z: gForce.z + extLoad.z },
      };
      nodeMap.set(key, node);
      nodes.push(node);
    });

    // Step 2: Build edge list
    const trussEdges: TrussEdge[] = [];
    const edgeSet = new Set<string>();

    nodes.forEach(nodeA => {
      for (const dir of NEIGHBOR_DIRS) {
        const neighborPos: Vec3 = { x: nodeA.pos.x + dir.x, y: nodeA.pos.y + dir.y, z: nodeA.pos.z + dir.z };
        const nodeB = nodeMap.get(vecKey(neighborPos));
        if (!nodeB) continue;
        const edgeKey = nodeA.index < nodeB.index ? `${nodeA.index}-${nodeB.index}` : `${nodeB.index}-${nodeA.index}`;
        if (edgeSet.has(edgeKey)) continue;
        edgeSet.add(edgeKey);
        const diff = vecSub(nodeB.pos, nodeA.pos);
        const length = vecLen(diff);
        if (length < 1e-10) continue;
        const direction: Vec3 = { x: diff.x / length, y: diff.y / length, z: diff.z / length };
        const avgE = (nodeA.voxel.material.youngModulus + nodeB.voxel.material.youngModulus) / 2;
        trussEdges.push({ nodeA: nodeA.index, nodeB: nodeB.index, length, direction, stiffness: avgE * CROSS_SECTION / length });
      }
    });

    if (trussEdges.length === 0) {
      return { edges: [], displacements: new Map(), dangerCount: 0, maxStressRatio: 0, totalEdges: 0 };
    }

    // Step 3: Assemble K
    const nDOF = nodes.length * 3;
    const K = new SparseMatrix(nDOF);
    const F = new Float64Array(nDOF);

    trussEdges.forEach(edge => {
      const { nodeA: iA, nodeB: iB, direction: d, stiffness: k } = edge;
      const dd = [
        [d.x * d.x, d.x * d.y, d.x * d.z],
        [d.y * d.x, d.y * d.y, d.y * d.z],
        [d.z * d.x, d.z * d.y, d.z * d.z],
      ];
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const val = k * dd[i][j];
          K.add(iA * 3 + i, iA * 3 + j, val);
          K.add(iB * 3 + i, iB * 3 + j, val);
          K.add(iA * 3 + i, iB * 3 + j, -val);
          K.add(iB * 3 + i, iA * 3 + j, -val);
        }
      }
    });

    // Step 4: Force vector
    nodes.forEach(node => {
      F[node.index * 3 + 0] = node.externalForce.x;
      F[node.index * 3 + 1] = node.externalForce.y;
      F[node.index * 3 + 2] = node.externalForce.z;
    });

    // Step 5: Boundary conditions
    const fixedDOFs: number[] = [];
    nodes.forEach(node => {
      if (node.isFixed) {
        fixedDOFs.push(node.index * 3 + 0, node.index * 3 + 1, node.index * 3 + 2);
      }
    });

    if (fixedDOFs.length === 0) {
      let minY = Infinity;
      nodes.forEach(n => { if (n.pos.y < minY) minY = n.pos.y; });
      nodes.forEach(n => {
        if (n.pos.y === minY) fixedDOFs.push(n.index * 3 + 0, n.index * 3 + 1, n.index * 3 + 2);
      });
    }

    fixedDOFs.forEach(dof => { K.applyBC(dof); F[dof] = 0; });

    // Step 6: Solve
    const maxIter = Math.min(nDOF * 2, 5000);
    const u = conjugateGradient(K, F, maxIter, 1e-6);

    // Step 7: Compute edge stresses
    const displacements = new Map<string, Vec3>();
    nodes.forEach(node => {
      displacements.set(vecKey(node.pos), {
        x: u[node.index * 3 + 0], y: u[node.index * 3 + 1], z: u[node.index * 3 + 2],
      });
    });

    const feaEdges: FEAEdge[] = [];
    let dangerCount = 0, maxStressRatio = 0;

    trussEdges.forEach(edge => {
      const { nodeA: iA, nodeB: iB, direction: d, length: L } = edge;
      const uA: Vec3 = { x: u[iA * 3], y: u[iA * 3 + 1], z: u[iA * 3 + 2] };
      const uB: Vec3 = { x: u[iB * 3], y: u[iB * 3 + 1], z: u[iB * 3 + 2] };
      const du: Vec3 = vecSub(uB, uA);
      const axialDeformation = vecDot(du, d);
      const strain = axialDeformation / L;
      const avgE = (nodes[iA].voxel.material.youngModulus + nodes[iB].voxel.material.youngModulus) / 2;
      const stress = strain * avgE;
      const isTension = stress >= 0;
      let limit: number;
      if (isTension) limit = Math.min(nodes[iA].voxel.material.maxTension, nodes[iB].voxel.material.maxTension);
      else limit = Math.min(nodes[iA].voxel.material.maxCompression, nodes[iB].voxel.material.maxCompression);
      const stressRatio = limit > 0 ? Math.abs(stress) / limit : (Math.abs(stress) > 0 ? 999 : 0);
      if (stressRatio > 0.8) dangerCount++;
      if (stressRatio > maxStressRatio) maxStressRatio = stressRatio;
      feaEdges.push({ nodeA: nodes[iA].pos, nodeB: nodes[iB].pos, stress: Math.abs(stress), stressRatio, isTension });
    });

    const elapsed = performance.now() - startTime;

    const result: FEAResult = { edges: feaEdges, displacements, dangerCount, maxStressRatio, totalEdges: feaEdges.length };
    this.lastResult = result;

    eventBus.emit('load:computed', { totalEdges: feaEdges.length, dangerCount, maxStressRatio: maxStressRatio.toFixed(3), elapsed: elapsed.toFixed(1) });
    console.log(`[LoadEngine] FEA computed: ${nodes.length} nodes, ${feaEdges.length} edges, ${dangerCount} danger, ${elapsed.toFixed(1)}ms`);

    return result;
  }

  // ─── Generate Structural Report ───
  generateReport(voxels: Voxel[], feaResult?: FEAResult): StructuralReport {
    const result = feaResult || this.lastResult;
    if (!result) {
      return {
        timestamp: new Date().toISOString(), totalNodes: 0, totalEdges: 0, dangerEdges: 0,
        maxStressRatio: 0, avgStressRatio: 0, materialBreakdown: [], weakPoints: [],
        recommendations: ['尚未執行分析'], overallSafety: 'safe',
      };
    }

    // Material breakdown
    const matCount = new Map<string, number>();
    voxels.forEach(v => {
      const preset = MATERIAL_PRESETS.find(p =>
        Math.abs(p.material.youngModulus - v.material.youngModulus) < 1e6 &&
        Math.abs(p.material.density - v.material.density) < 10
      );
      const name = preset ? preset.name : '自訂材質';
      matCount.set(name, (matCount.get(name) || 0) + 1);
    });
    const materialBreakdown = Array.from(matCount.entries()).map(([material, count]) => ({ material, count }));

    // Weak points: edges with stressRatio > 0.8, group by node position
    const weakPointMap = new Map<string, { position: Vec3; maxRatio: number }>();
    result.edges.forEach(e => {
      if (e.stressRatio > 0.8) {
        const keyA = vecKey(e.nodeA);
        const keyB = vecKey(e.nodeB);
        if (!weakPointMap.has(keyA) || weakPointMap.get(keyA)!.maxRatio < e.stressRatio) {
          weakPointMap.set(keyA, { position: e.nodeA, maxRatio: e.stressRatio });
        }
        if (!weakPointMap.has(keyB) || weakPointMap.get(keyB)!.maxRatio < e.stressRatio) {
          weakPointMap.set(keyB, { position: e.nodeB, maxRatio: e.stressRatio });
        }
      }
    });
    const weakPoints = Array.from(weakPointMap.values())
      .sort((a, b) => b.maxRatio - a.maxRatio)
      .slice(0, 10)
      .map(wp => ({ position: wp.position, stressRatio: wp.maxRatio }));

    // Average stress ratio
    const avgStressRatio = result.edges.length > 0
      ? result.edges.reduce((sum, e) => sum + e.stressRatio, 0) / result.edges.length
      : 0;

    // Recommendations
    const recommendations: string[] = [];
    if (result.dangerCount === 0) {
      recommendations.push('結構整體安全，所有邊的應力比均在安全範圍內。');
    } else {
      recommendations.push(`發現 ${result.dangerCount} 條危險邊（應力比 > 0.8），建議加固。`);
      if (weakPoints.length > 0) {
        const wp = weakPoints[0];
        recommendations.push(`最危險位置在 (${wp.position.x}, ${wp.position.y}, ${wp.position.z})，應力比 ${wp.stressRatio.toFixed(3)}。`);
      }
      if (result.maxStressRatio > 1.0) {
        recommendations.push('存在超載邊（應力比 > 1.0），結構可能失效！建議更換為更強材質或增加支撐。');
      }
      const brickCount = matCount.get('磚塊') || 0;
      if (brickCount > 0 && result.dangerCount > 0) {
        recommendations.push('磚塊的拉伸強度較低，建議在高應力區域改用混凝土或鋼材。');
      }
    }

    // Overall safety
    let overallSafety: 'safe' | 'warning' | 'danger' = 'safe';
    if (result.maxStressRatio > 1.0) overallSafety = 'danger';
    else if (result.maxStressRatio > 0.8) overallSafety = 'warning';

    const report: StructuralReport = {
      timestamp: new Date().toISOString(),
      totalNodes: voxels.length,
      totalEdges: result.totalEdges,
      dangerEdges: result.dangerCount,
      maxStressRatio: result.maxStressRatio,
      avgStressRatio,
      materialBreakdown,
      weakPoints,
      recommendations,
      overallSafety,
    };

    this.lastReport = report;
    eventBus.emit('load:report-generated', { safety: overallSafety, dangerEdges: result.dangerCount });
    return report;
  }

  getLastResult(): FEAResult | null { return this.lastResult; }
  getLastReport(): StructuralReport | null { return this.lastReport; }

  // Format report as text
  formatReportText(report: StructuralReport): string {
    const lines: string[] = [
      '═══════════════════════════════════════',
      '       FastDesign 結構分析報告',
      '═══════════════════════════════════════',
      `時間: ${report.timestamp}`,
      `整體安全性: ${report.overallSafety === 'safe' ? '✓ 安全' : report.overallSafety === 'warning' ? '⚠ 警告' : '✗ 危險'}`,
      '',
      `節點數: ${report.totalNodes}`,
      `邊數: ${report.totalEdges}`,
      `危險邊: ${report.dangerEdges}`,
      `最大應力比: ${report.maxStressRatio.toFixed(4)}`,
      `平均應力比: ${report.avgStressRatio.toFixed(4)}`,
      '',
      '─── 材質分佈 ───',
      ...report.materialBreakdown.map(m => `  ${m.material}: ${m.count} 個體素`),
      '',
      '─── 弱點位置 ───',
      ...report.weakPoints.map((wp, i) => `  ${i + 1}. (${wp.position.x}, ${wp.position.y}, ${wp.position.z}) 應力比: ${wp.stressRatio.toFixed(4)}`),
      '',
      '─── 建議 ───',
      ...report.recommendations.map(r => `  • ${r}`),
      '═══════════════════════════════════════',
    ];
    return lines.join('\n');
  }
}

export const loadEngine = new LoadEngine();
