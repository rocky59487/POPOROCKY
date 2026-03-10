/**
 * LoadPhysicsEngine - 負載/物理引擎
 * 
 * 延遲運算 (Lazy Evaluation)，體素→三維桁架節點轉換，
 * 直接剛度方法 (Direct Stiffness Method) 的簡化實作。
 */

import signalBus, { SIGNALS } from './EventBus';
import { VoxelData } from '../store/DataModels';

interface TrussNode {
  id: string;
  position: [number, number, number];
  fixed: boolean;
}

interface TrussElement {
  id: string;
  node_start: string;
  node_end: string;
  area: number;
  elasticity: number;
}

interface StressResult {
  voxel_stress_map: Map<string, number>;
  max_stress: number;
  min_stress: number;
}

export class LoadPhysicsEngine {
  private debounceTimer: NodeJS.Timeout | null = null;
  private debounceMs: number = 2000;
  private isCalculating: boolean = false;

  constructor() {
    this.initializeListeners();
  }

  private initializeListeners(): void {
    // Listen for idle detection (Lazy Evaluation trigger)
    signalBus.subscribe(SIGNALS.PLAYER_IDLE_DETECTED, (payload) => {
      this.onIdleDetected(payload);
    });

    // Listen for explicit physics calculation requests
    signalBus.subscribe(SIGNALS.PHYSICS_CALC_REQ, (payload) => {
      this.calculateStress(payload.voxels);
    });

    // Debounced voxel state change
    signalBus.subscribe(SIGNALS.VOXEL_STATE_CHANGED, () => {
      this.debouncedCalculation();
    });
  }

  /**
   * 防抖動計算觸發
   */
  private debouncedCalculation(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    // Don't auto-trigger, wait for idle
  }

  /**
   * 空閒偵測觸發延遲運算
   */
  private onIdleDetected(payload: { idle_duration_ms: number }): void {
    if (this.isCalculating) return;
    signalBus.publish(SIGNALS.LOG_MESSAGE, {
      level: 'info',
      source: 'LoadPhysicsEngine',
      message: `空閒偵測觸發 (${payload.idle_duration_ms}ms)，準備延遲運算...`,
    });
  }

  /**
   * 體素→桁架節點轉換
   */
  private voxelsToTruss(voxels: VoxelData[]): { nodes: TrussNode[]; elements: TrussElement[] } {
    const nodes: TrussNode[] = [];
    const elements: TrussElement[] = [];
    const nodeMap = new Map<string, TrussNode>();

    // Create nodes from voxel positions
    voxels.forEach(v => {
      const key = v.position.join(',');
      if (!nodeMap.has(key)) {
        const node: TrussNode = {
          id: key,
          position: v.position,
          fixed: v.position[1] === 0, // Ground level is fixed
        };
        nodeMap.set(key, node);
        nodes.push(node);
      }
    });

    // Create elements between adjacent voxels
    voxels.forEach(v => {
      const [x, y, z] = v.position;
      const neighbors = [
        [x + 1, y, z], [x - 1, y, z],
        [x, y + 1, z], [x, y - 1, z],
        [x, y, z + 1], [x, y, z - 1],
      ];

      neighbors.forEach(([nx, ny, nz]) => {
        const neighborKey = `${nx},${ny},${nz}`;
        if (nodeMap.has(neighborKey)) {
          const currentKey = v.position.join(',');
          const elemId = [currentKey, neighborKey].sort().join('-');
          if (!elements.find(e => e.id === elemId)) {
            elements.push({
              id: elemId,
              node_start: currentKey,
              node_end: neighborKey,
              area: 1.0,
              elasticity: 200000, // Steel: 200 GPa
            });
          }
        }
      });
    });

    return { nodes, elements };
  }

  /**
   * 簡化的應力計算（直接剛度方法簡化版）
   */
  async calculateStress(voxels: VoxelData[]): Promise<StressResult> {
    this.isCalculating = true;
    signalBus.publish(SIGNALS.LOG_MESSAGE, {
      level: 'info',
      source: 'LoadPhysicsEngine',
      message: `開始應力計算，體素數量: ${voxels.length}`,
    });

    const { nodes, elements } = this.voxelsToTruss(voxels);

    // Simplified stress calculation
    const stressMap = new Map<string, number>();
    let maxStress = 0;
    let minStress = Infinity;

    // Simple gravity-based stress estimation
    nodes.forEach(node => {
      // Count voxels above this position
      const voxelsAbove = voxels.filter(v =>
        v.position[0] === node.position[0] &&
        v.position[2] === node.position[2] &&
        v.position[1] > node.position[1]
      ).length;

      const stress = voxelsAbove * 9.81 * 1.0; // mass * gravity * density
      stressMap.set(node.id, stress);
      maxStress = Math.max(maxStress, stress);
      if (stress > 0) minStress = Math.min(minStress, stress);
    });

    if (minStress === Infinity) minStress = 0;

    const result: StressResult = {
      voxel_stress_map: stressMap,
      max_stress: maxStress,
      min_stress: minStress,
    };

    this.isCalculating = false;

    signalBus.publish(SIGNALS.STRESS_MAP_UPDATED, {
      voxel_stress_map: Object.fromEntries(stressMap),
      max_stress: maxStress,
      min_stress: minStress,
    });

    signalBus.publish(SIGNALS.LOG_MESSAGE, {
      level: 'success',
      source: 'LoadPhysicsEngine',
      message: `應力計算完成: 最大應力 ${maxStress.toFixed(2)} MPa, 節點數 ${nodes.length}, 元素數 ${elements.length}`,
    });

    return result;
  }
}

export const loadPhysicsEngine = new LoadPhysicsEngine();
export default loadPhysicsEngine;
