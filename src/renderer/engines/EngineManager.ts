/**
 * EngineManager - 引擎管理器
 * 
 * 統一管理八大引擎的初始化、啟動、停止。
 * 包含 Agent Engine, Multiplayer Engine, Texture Engine, LOD Engine, Layer Engine 的實作。
 */

import signalBus, { SIGNALS } from './EventBus';
import { VoxelData, LayerData } from '../store/DataModels';

// ============================================================
// Agent Engine - 代理人引擎 (LLM 智慧)
// ============================================================
export class AgentEngine {
  private isActive: boolean = false;

  constructor() {
    this.initializeListeners();
  }

  private initializeListeners(): void {
    signalBus.subscribe(SIGNALS.CMD_PARSED, (payload) => {
      this.handleParsedCommand(payload);
    });

    signalBus.subscribe(SIGNALS.AGENT_OVERRIDE_REQ, (payload) => {
      this.handleOverrideRequest(payload);
    });
  }

  private handleParsedCommand(payload: any): void {
    if (payload.action === 'unknown') {
      signalBus.publish(SIGNALS.LOG_MESSAGE, {
        level: 'warning',
        source: 'AgentEngine',
        message: `無法識別的命令: "${payload.target}"`,
      });
      return;
    }

    signalBus.publish(SIGNALS.LOG_MESSAGE, {
      level: 'info',
      source: 'AgentEngine',
      message: `處理命令: ${payload.action} ${payload.type} (信心度: ${(payload.confidence * 100).toFixed(0)}%)`,
    });

    // Simulate AI-generated voxel placement (is_virtual: true)
    if (payload.action === 'place' && payload.params?.position) {
      signalBus.publish(SIGNALS.LOG_MESSAGE, {
        level: 'info',
        source: 'AgentEngine',
        message: `AI 生成虛擬體素於 [${payload.params.position}]`,
      });
    }
  }

  private handleOverrideRequest(payload: any): void {
    signalBus.publish(SIGNALS.LOG_MESSAGE, {
      level: 'info',
      source: 'AgentEngine',
      message: `人類權威覆寫: ${payload.action} on ${payload.voxel_id}`,
    });
  }

  activate(): void {
    this.isActive = true;
    signalBus.publish(SIGNALS.LOG_MESSAGE, {
      level: 'success',
      source: 'AgentEngine',
      message: 'AI Co-Pilot 已啟動',
    });
  }

  deactivate(): void {
    this.isActive = false;
  }
}

// ============================================================
// Multiplayer Engine - 多人引擎
// ============================================================
export class MultiplayerEngine {
  private isConnected: boolean = false;
  private syncVersion: number = 0;

  constructor() {
    this.initializeListeners();
  }

  private initializeListeners(): void {
    signalBus.subscribe(SIGNALS.VOXEL_STATE_CHANGED, (payload) => {
      if (this.isConnected) {
        this.broadcastDelta(payload);
      }
    });
  }

  private broadcastDelta(payload: any): void {
    this.syncVersion++;
    signalBus.publish(SIGNALS.LOG_MESSAGE, {
      level: 'info',
      source: 'MultiplayerEngine',
      message: `Delta 同步 v${this.syncVersion}: ${payload.voxels_added?.length || 0} 新增, ${payload.voxels_removed?.length || 0} 移除`,
    });
  }

  connect(): void {
    this.isConnected = true;
    signalBus.publish(SIGNALS.LOG_MESSAGE, {
      level: 'success',
      source: 'MultiplayerEngine',
      message: '多人連線已建立 (主機權威模式)',
    });
  }

  disconnect(): void {
    this.isConnected = false;
  }
}

// ============================================================
// Texture Engine - 貼圖引擎
// ============================================================
export class TextureEngine {
  constructor() {
    this.initializeListeners();
  }

  private initializeListeners(): void {
    signalBus.subscribe(SIGNALS.PLAYER_IDLE_DETECTED, (payload) => {
      // Trigger texture generation during idle
      signalBus.publish(SIGNALS.LOG_MESSAGE, {
        level: 'info',
        source: 'TextureEngine',
        message: '空閒期間觸發貼圖生成佇列',
      });
    });

    signalBus.subscribe(SIGNALS.STRESS_MAP_UPDATED, (payload) => {
      this.generateStressVisualization(payload);
    });
  }

  private generateStressVisualization(payload: any): void {
    signalBus.publish(SIGNALS.TEXTURE_GENERATED, {
      type: 'stress_heatmap',
      data: payload,
    });
    signalBus.publish(SIGNALS.LOG_MESSAGE, {
      level: 'success',
      source: 'TextureEngine',
      message: '應力熱圖貼圖生成完成',
    });
  }

  /**
   * 模擬 Stable Diffusion REST API 貼圖生成
   */
  async generateTexture(prompt: string): Promise<string> {
    signalBus.publish(SIGNALS.LOG_MESSAGE, {
      level: 'info',
      source: 'TextureEngine',
      message: `SD 貼圖生成請求: "${prompt}" (32x32 Base64)`,
    });
    // Return placeholder base64
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  }
}

// ============================================================
// LOD Engine - LOD 引擎
// ============================================================
export class LODEngine {
  private lodLevels: Map<string, number> = new Map();

  constructor() {
    this.initializeListeners();
  }

  private initializeListeners(): void {
    signalBus.subscribe(SIGNALS.VOXEL_STATE_CHANGED, (payload) => {
      this.updateLOD(payload.chunk_id);
    });
  }

  /**
   * 貪婪網格算法 (Greedy Meshing) 簡化實作
   */
  private updateLOD(chunkId: string): void {
    // Calculate appropriate LOD level based on distance
    const currentLOD = this.lodLevels.get(chunkId) || 0;
    this.lodLevels.set(chunkId, currentLOD);

    signalBus.publish(SIGNALS.LOD_UPDATE, {
      chunk_id: chunkId,
      lod_level: currentLOD,
    });
  }

  /**
   * 根據相機距離更新 LOD
   */
  updateFromCamera(cameraPosition: [number, number, number], chunks: string[]): void {
    chunks.forEach(chunkId => {
      const parts = chunkId.split('_').map(Number);
      const dx = cameraPosition[0] - parts[0] * 16;
      const dy = cameraPosition[1] - parts[1] * 16;
      const dz = cameraPosition[2] - parts[2] * 16;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      let lodLevel = 0;
      if (distance > 50) lodLevel = 3;
      else if (distance > 30) lodLevel = 2;
      else if (distance > 15) lodLevel = 1;

      this.lodLevels.set(chunkId, lodLevel);
    });
  }

  /**
   * 視錐剔除 (Frustum Culling)
   */
  frustumCull(visibleChunks: string[]): string[] {
    // Simplified: return all chunks as visible
    return visibleChunks;
  }
}

// ============================================================
// Layer Engine - 圖層引擎
// ============================================================
export class LayerEngine {
  private layers: Map<string, LayerData> = new Map();

  constructor() {
    this.initializeListeners();
  }

  private initializeListeners(): void {
    signalBus.subscribe(SIGNALS.STRESS_MAP_UPDATED, (payload) => {
      this.performPhysicsCulling(payload);
    });

    signalBus.subscribe(SIGNALS.LAYER_CHANGED, (payload) => {
      signalBus.publish(SIGNALS.LOG_MESSAGE, {
        level: 'info',
        source: 'LayerEngine',
        message: `圖層變更: ${payload.layerId} (${payload.action})`,
      });
    });
  }

  /**
   * 物理應力剔除
   */
  private performPhysicsCulling(stressData: any): void {
    signalBus.publish(SIGNALS.LOG_MESSAGE, {
      level: 'info',
      source: 'LayerEngine',
      message: `物理剔除: 最大應力 ${stressData.max_stress?.toFixed(2)} MPa`,
    });
  }

  loadLayers(layers: LayerData[]): void {
    this.layers.clear();
    layers.forEach(l => this.layers.set(l.layer_id, l));
  }
}

// ============================================================
// Engine Manager - 統一管理器
// ============================================================
export class EngineManagerClass {
  public agentEngine: AgentEngine;
  public multiplayerEngine: MultiplayerEngine;
  public textureEngine: TextureEngine;
  public lodEngine: LODEngine;
  public layerEngine: LayerEngine;

  private initialized: boolean = false;

  constructor() {
    this.agentEngine = new AgentEngine();
    this.multiplayerEngine = new MultiplayerEngine();
    this.textureEngine = new TextureEngine();
    this.lodEngine = new LODEngine();
    this.layerEngine = new LayerEngine();
  }

  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;

    signalBus.publish(SIGNALS.LOG_MESSAGE, {
      level: 'success',
      source: 'EngineManager',
      message: '八大引擎初始化完成 (星狀拓撲 Event Bus 已連接)',
    });

    // Log engine status
    const engines = [
      'VoxelEngine', 'SemanticEngine', 'LoadPhysicsEngine',
      'LayerEngine', 'AgentEngine', 'MultiplayerEngine',
      'TextureEngine', 'LODEngine'
    ];
    engines.forEach(name => {
      signalBus.publish(SIGNALS.LOG_MESSAGE, {
        level: 'info',
        source: 'EngineManager',
        message: `  ✓ ${name} 已就緒`,
      });
    });
  }

  shutdown(): void {
    this.initialized = false;
    signalBus.clear();
  }
}

export const engineManager = new EngineManagerClass();
export default engineManager;
