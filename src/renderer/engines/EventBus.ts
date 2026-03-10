/**
 * SignalBus - 全域事件匯流排 (Star Topology Event Bus)
 * 
 * FastDesign 系統的幾何中心，所有八大引擎透過此匯流排進行 Publish-Subscribe 通訊。
 * 引擎之間完全解耦（Blindness），互不知道彼此的存在。
 */

export type EventCallback = (payload: any) => void;

export interface SignalDefinition {
  name: string;
  description: string;
}

// 核心事件訊號定義 (Signal Registry)
export const SIGNALS = {
  // 語意引擎 → 代理人引擎, 體素引擎
  CMD_PARSED: 'cmd_parsed',
  // 體素引擎 → LOD, 圖層, 多人引擎
  VOXEL_STATE_CHANGED: 'voxel_state_changed',
  // 玩家控制器 → 負載/物理, 貼圖引擎
  PLAYER_IDLE_DETECTED: 'player_idle_detected',
  // FastAPI 客戶端 → 負載/物理引擎
  PHYSICS_CALC_REQ: 'physics_calc_req',
  // FastAPI 客戶端 → 圖層, 貼圖引擎
  STRESS_MAP_UPDATED: 'stress_map_updated',
  // 玩家控制器 → 代理人引擎
  AGENT_OVERRIDE_REQ: 'agent_override_req',
  // 多人引擎 → 體素, 圖層引擎
  NETWORK_SYNC_STATE: 'network_sync_state',
  // 體素引擎 → 曲面轉換引擎
  NURBS_CONVERSION_REQ: 'nurbs_conversion_req',
  // 曲面轉換引擎 → 渲染引擎
  NURBS_CONVERSION_DONE: 'nurbs_conversion_done',
  // LOD 引擎 → 渲染引擎
  LOD_UPDATE: 'lod_update',
  // 貼圖引擎 → 渲染引擎
  TEXTURE_GENERATED: 'texture_generated',
  // 圖層引擎 → UI
  LAYER_CHANGED: 'layer_changed',
  // 通用 UI 更新
  UI_UPDATE: 'ui_update',
  // 日誌
  LOG_MESSAGE: 'log_message',
  // 管線狀態
  PIPELINE_STATE_CHANGED: 'pipeline_state_changed',
  // 專案狀態
  PROJECT_STATE_CHANGED: 'project_state_changed',
} as const;

class SignalBus {
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private eventLog: Array<{ signal: string; timestamp: number; payload: any }> = [];
  private maxLogSize: number = 1000;

  /**
   * 訂閱事件
   */
  subscribe(signal: string, callback: EventCallback): () => void {
    if (!this.listeners.has(signal)) {
      this.listeners.set(signal, new Set());
    }
    this.listeners.get(signal)!.add(callback);

    // 返回取消訂閱函數
    return () => {
      this.listeners.get(signal)?.delete(callback);
    };
  }

  /**
   * 發布事件
   */
  publish(signal: string, payload: any = {}): void {
    // 記錄事件日誌
    this.eventLog.push({
      signal,
      timestamp: Date.now(),
      payload,
    });

    // 限制日誌大小
    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog = this.eventLog.slice(-this.maxLogSize);
    }

    // 通知所有訂閱者
    const callbacks = this.listeners.get(signal);
    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          callback(payload);
        } catch (error) {
          console.error(`[SignalBus] Error in handler for ${signal}:`, error);
        }
      });
    }
  }

  /**
   * 一次性訂閱
   */
  once(signal: string, callback: EventCallback): () => void {
    const wrapper: EventCallback = (payload) => {
      callback(payload);
      this.listeners.get(signal)?.delete(wrapper);
    };
    return this.subscribe(signal, wrapper);
  }

  /**
   * 取得事件日誌
   */
  getEventLog(): Array<{ signal: string; timestamp: number; payload: any }> {
    return [...this.eventLog];
  }

  /**
   * 清除所有訂閱
   */
  clear(): void {
    this.listeners.clear();
    this.eventLog = [];
  }

  /**
   * 取得訂閱者數量
   */
  getSubscriberCount(signal: string): number {
    return this.listeners.get(signal)?.size || 0;
  }
}

// 全域單例
export const signalBus = new SignalBus();
export default signalBus;
