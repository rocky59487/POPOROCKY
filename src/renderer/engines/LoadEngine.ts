import eventBus from './EventBus';
import { Vec3, Voxel, FEAEdge, FEAResult, VoxelMaterial } from '../store/useStore';
import { solveFEA, FEAVoxel, GlueJoint as FEAGlueJoint, FEASolverResult } from './FEASolver';

/**
 * LoadEngine - 結構負載分析引擎
 *
 * 使用教科書級 FEASolver 進行 3D 桁架有限元素分析。
 * 本模組負責：
 *   - 將 Voxel[] 轉換為 FEASolver 所需的 FEAVoxel[] 格式
 *   - 管理材質預設庫
 *   - 生成結構分析報告
 *   - 管理動畫狀態（閃爍效果）
 */

const CROSS_SECTION = 1.0; // m² - 截面面積

function vecKey(p: Vec3): string { return `${p.x},${p.y},${p.z}`; }

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
  solverIterations: number;
  residualNorm: number;
  elapsedMs: number;
}

export class LoadEngine {
  private gravity: Vec3 = { x: 0, y: -1, z: 0 };
  private gravityMagnitude: number = 9.81;
  private lastResult: FEAResult | null = null;
  private lastSolverResult: FEASolverResult | null = null;
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

  updateFlashPhase(time: number): number {
    this.flashPhase = (Math.sin(time * 5) + 1) / 2;
    return this.flashPhase;
  }
  getFlashPhase(): number { return this.flashPhase; }

  getMaterialPreset(id: string): MaterialPreset | undefined {
    return MATERIAL_PRESETS.find(p => p.id === id);
  }

  getAllPresets(): MaterialPreset[] { return [...MATERIAL_PRESETS]; }

  /**
   * 執行教科書級桁架 FEA
   *
   * 將 Voxel[] 轉換為 FEAVoxel[] 格式，
   * 呼叫 FEASolver.solveFEA() 執行完整的 FEM 流程，
   * 然後將結果轉換回 FEAResult 格式。
   *
   * @param voxels - 體素陣列
   * @param glueJoints - Glue 接頭陣列（可選）
   */
  computeFEA(
    voxels: Voxel[],
    glueJoints?: Array<{ voxelA: Vec3; voxelB: Vec3; strength: number }>
  ): FEAResult {
    eventBus.emit('load:computing', { count: voxels.length });

    if (voxels.length === 0) {
      return { edges: [], displacements: new Map(), dangerCount: 0, maxStressRatio: 0, totalEdges: 0 };
    }

    // 轉換 Voxel[] → FEAVoxel[]
    const feaVoxels: FEAVoxel[] = voxels.map(v => ({
      pos: v.pos,
      material: {
        // LoadEngine 的 MATERIAL_PRESETS 使用 Pa 單位
        // useStore 的 DEFAULT_MATERIALS 使用 MPa 單位
        // 需要統一：如果值 < 1e6 則假設是 MPa，需要轉換
        youngModulus: v.material.youngModulus < 1e6
          ? v.material.youngModulus * 1e6  // MPa → Pa
          : v.material.youngModulus,
        maxCompression: v.material.maxCompression < 1e3
          ? v.material.maxCompression * 1e6  // MPa → Pa
          : v.material.maxCompression,
        maxTension: v.material.maxTension < 1e3
          ? v.material.maxTension * 1e6  // MPa → Pa
          : v.material.maxTension,
        density: v.material.density,
      },
      isSupport: v.isSupport,
      externalLoad: v.externalLoad,
    }));

    // 轉換 Glue Joints
    const feaGlueJoints: FEAGlueJoint[] = (glueJoints || []).map(gj => ({
      voxelA: gj.voxelA,
      voxelB: gj.voxelB,
      strength: gj.strength,
    }));

    // 呼叫教科書級 FEA 求解器
    const solverResult = solveFEA(feaVoxels, feaGlueJoints, {
      crossSectionArea: CROSS_SECTION,
      gravityAcceleration: this.gravityMagnitude,
      gravityDirection: this.gravity,
      autoSupports: true,
    });

    // 檢查求解是否成功
    if (!solverResult.success) {
      console.warn(`[LoadEngine] FEA failed: ${solverResult.error}`);
      eventBus.emit('load:error', { error: solverResult.error });
      return { edges: [], displacements: new Map(), dangerCount: 0, maxStressRatio: 0, totalEdges: 0 };
    }

    this.lastSolverResult = solverResult;

    // 轉換結果為 FEAResult 格式（向後相容）
    const feaEdges: FEAEdge[] = solverResult.edges.map(e => ({
      nodeA: e.nodeA,
      nodeB: e.nodeB,
      stress: e.stress,
      stressRatio: e.stressRatio,
      isTension: e.isTension,
    }));

    const result: FEAResult = {
      edges: feaEdges,
      displacements: solverResult.displacements,
      dangerCount: solverResult.dangerCount,
      maxStressRatio: solverResult.maxStressRatio,
      totalEdges: solverResult.totalEdges,
    };

    this.lastResult = result;

    eventBus.emit('load:computed', {
      totalEdges: result.totalEdges,
      dangerCount: result.dangerCount,
      maxStressRatio: result.maxStressRatio.toFixed(3),
      elapsed: solverResult.elapsedMs.toFixed(1),
      iterations: solverResult.solverIterations,
      residual: solverResult.residualNorm.toExponential(2),
    });

    console.log(
      `[LoadEngine] FEA completed via FEASolver: ${voxels.length} nodes, ` +
      `${result.totalEdges} edges, ${result.dangerCount} danger, ` +
      `maxStressRatio=${result.maxStressRatio.toFixed(4)}, ` +
      `${solverResult.solverIterations} iterations, ` +
      `${solverResult.elapsedMs.toFixed(1)}ms`
    );

    return result;
  }

  // ─── Generate Structural Report ───
  generateReport(voxels: Voxel[], feaResult?: FEAResult): StructuralReport {
    const result = feaResult || this.lastResult;
    const solverResult = this.lastSolverResult;

    if (!result) {
      return {
        timestamp: new Date().toISOString(), totalNodes: 0, totalEdges: 0, dangerEdges: 0,
        maxStressRatio: 0, avgStressRatio: 0, materialBreakdown: [], weakPoints: [],
        recommendations: ['尚未執行分析'], overallSafety: 'safe',
        solverIterations: 0, residualNorm: 0, elapsedMs: 0,
      };
    }

    // Material breakdown
    const matCount = new Map<string, number>();
    voxels.forEach(v => {
      const preset = MATERIAL_PRESETS.find(p =>
        Math.abs(p.material.density - v.material.density) < 10
      );
      const name = preset ? preset.name : '自訂材質';
      matCount.set(name, (matCount.get(name) || 0) + 1);
    });
    const materialBreakdown = Array.from(matCount.entries()).map(
      ([material, count]: [string, number]) => ({ material, count })
    );

    // Weak points
    const weakPointMap = new Map<string, { position: Vec3; maxRatio: number }>();
    result.edges.forEach((e: FEAEdge) => {
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
      .sort((a: { maxRatio: number }, b: { maxRatio: number }) => b.maxRatio - a.maxRatio)
      .slice(0, 10)
      .map((wp: { position: Vec3; maxRatio: number }) => ({ position: wp.position, stressRatio: wp.maxRatio }));

    // Average stress ratio
    const avgStressRatio = result.edges.length > 0
      ? result.edges.reduce((sum: number, e: FEAEdge) => sum + e.stressRatio, 0) / result.edges.length
      : 0;

    // Recommendations
    const recommendations: string[] = [];
    if (result.dangerCount === 0) {
      recommendations.push('結構整體安全，所有桿件的應力比均在安全範圍內。');
    } else {
      recommendations.push(`發現 ${result.dangerCount} 條危險桿件（應力比 > 0.8），建議加固。`);
      if (weakPoints.length > 0) {
        const wp = weakPoints[0];
        recommendations.push(`最危險位置在 (${wp.position.x}, ${wp.position.y}, ${wp.position.z})，應力比 ${wp.stressRatio.toFixed(3)}。`);
      }
      if (result.maxStressRatio > 1.0) {
        recommendations.push('存在超載桿件（應力比 > 1.0），結構可能失效！建議更換為更強材質或增加支撐。');
      }
    }

    // Solver info
    if (solverResult) {
      recommendations.push(
        `求解器：PCG，${solverResult.solverIterations} 次迭代，` +
        `殘差 ${solverResult.residualNorm.toExponential(2)}，` +
        `耗時 ${solverResult.elapsedMs.toFixed(1)}ms。`
      );
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
      solverIterations: solverResult?.solverIterations || 0,
      residualNorm: solverResult?.residualNorm || 0,
      elapsedMs: solverResult?.elapsedMs || 0,
    };

    this.lastReport = report;
    eventBus.emit('load:report-generated', { safety: overallSafety, dangerEdges: result.dangerCount });
    return report;
  }

  getLastResult(): FEAResult | null { return this.lastResult; }
  getLastSolverResult(): FEASolverResult | null { return this.lastSolverResult; }
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
      `桿件數: ${report.totalEdges}`,
      `危險桿件: ${report.dangerEdges}`,
      `最大應力比: ${report.maxStressRatio.toFixed(4)}`,
      `平均應力比: ${report.avgStressRatio.toFixed(4)}`,
      '',
      '─── 求解器資訊 ───',
      `  方法: 預條件共軛梯度法 (PCG)`,
      `  迭代次數: ${report.solverIterations}`,
      `  殘差範數: ${report.residualNorm.toExponential(2)}`,
      `  計算時間: ${report.elapsedMs.toFixed(1)}ms`,
      '',
      '─── 材質分佈 ───',
      ...report.materialBreakdown.map((m: { material: string; count: number }) => `  ${m.material}: ${m.count} 個體素`),
      '',
      '─── 弱點位置 ───',
      ...report.weakPoints.map((wp: { position: Vec3; stressRatio: number }, i: number) =>
        `  ${i + 1}. (${wp.position.x}, ${wp.position.y}, ${wp.position.z}) 應力比: ${wp.stressRatio.toFixed(4)}`
      ),
      '',
      '─── 建議 ───',
      ...report.recommendations.map((r: string) => `  • ${r}`),
      '═══════════════════════════════════════',
    ];
    return lines.join('\n');
  }
}

export const loadEngine = new LoadEngine();
