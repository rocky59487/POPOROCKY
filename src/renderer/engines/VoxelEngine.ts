/**
 * VoxelEngine - 體素與曲面引擎
 * 
 * 混合幾何資料結構 (Hybrid Voxel-BRep)，管理體素的 CRUD 操作，
 * 基於 Chunk-based Octree + Sparse Array 的空間管理。
 */

import signalBus, { SIGNALS } from './EventBus';
import { VoxelData, ChunkData, VoxelGridPayload, SemanticTag } from '../store/DataModels';
import { v4 as uuidv4 } from 'uuid';

export class VoxelEngine {
  private chunks: Map<string, ChunkData> = new Map();
  private chunkSize: number = 16;
  private voxelSize: number = 1.0; // mm

  constructor() {
    this.initializeListeners();
  }

  private initializeListeners(): void {
    signalBus.subscribe(SIGNALS.NETWORK_SYNC_STATE, (payload) => {
      this.handleNetworkSync(payload);
    });
  }

  /**
   * 計算體素所屬的 Chunk ID
   */
  private getChunkId(position: [number, number, number]): string {
    const cx = Math.floor(position[0] / this.chunkSize);
    const cy = Math.floor(position[1] / this.chunkSize);
    const cz = Math.floor(position[2] / this.chunkSize);
    return `${cx}_${cy}_${cz}`;
  }

  /**
   * 新增體素
   */
  addVoxel(voxel: VoxelData): void {
    const chunkId = this.getChunkId(voxel.position);
    let chunk = this.chunks.get(chunkId);

    if (!chunk) {
      chunk = {
        chunk_id: chunkId,
        origin_pos: [
          Math.floor(voxel.position[0] / this.chunkSize) * this.chunkSize,
          Math.floor(voxel.position[1] / this.chunkSize) * this.chunkSize,
          Math.floor(voxel.position[2] / this.chunkSize) * this.chunkSize,
        ],
        lod_level: 0,
        active_voxels: [],
      };
      this.chunks.set(chunkId, chunk);
    }

    // Check for duplicate
    const exists = chunk.active_voxels.some(
      v => v.position[0] === voxel.position[0] &&
           v.position[1] === voxel.position[1] &&
           v.position[2] === voxel.position[2]
    );

    if (!exists) {
      chunk.active_voxels.push(voxel);
      signalBus.publish(SIGNALS.VOXEL_STATE_CHANGED, {
        chunk_id: chunkId,
        voxels_added: [voxel],
        voxels_removed: [],
      });
    }
  }

  /**
   * 移除體素
   */
  removeVoxel(voxelId: string): VoxelData | null {
    for (const [chunkId, chunk] of this.chunks) {
      const idx = chunk.active_voxels.findIndex(v => v.voxel_id === voxelId);
      if (idx !== -1) {
        const removed = chunk.active_voxels.splice(idx, 1)[0];
        if (chunk.active_voxels.length === 0) {
          this.chunks.delete(chunkId);
        }
        signalBus.publish(SIGNALS.VOXEL_STATE_CHANGED, {
          chunk_id: chunkId,
          voxels_added: [],
          voxels_removed: [removed],
        });
        return removed;
      }
    }
    return null;
  }

  /**
   * 將體素資料轉換為 VoxelGridPayload（用於演算法管線輸入）
   */
  toVoxelGridPayload(): VoxelGridPayload {
    const allVoxels = this.getAllVoxels();
    if (allVoxels.length === 0) {
      return {
        metadata: { voxel_size: this.voxelSize, bounding_box: [0, 0, 0, 0, 0, 0] },
        voxel_grid: { dimensions: [0, 0, 0], data: [] },
        semantic_tags: [],
      };
    }

    // Calculate bounding box
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    allVoxels.forEach(v => {
      minX = Math.min(minX, v.position[0]);
      minY = Math.min(minY, v.position[1]);
      minZ = Math.min(minZ, v.position[2]);
      maxX = Math.max(maxX, v.position[0]);
      maxY = Math.max(maxY, v.position[1]);
      maxZ = Math.max(maxZ, v.position[2]);
    });

    const dimX = maxX - minX + 1;
    const dimY = maxY - minY + 1;
    const dimZ = maxZ - minZ + 1;

    // Create flattened 3D grid
    const data = new Array(dimX * dimY * dimZ).fill(0);
    const semanticTags: SemanticTag[] = [];

    allVoxels.forEach(v => {
      const x = v.position[0] - minX;
      const y = v.position[1] - minY;
      const z = v.position[2] - minZ;
      const idx = x * dimY * dimZ + y * dimZ + z;
      data[idx] = 1;

      if (v.semantic_intent !== 'default') {
        semanticTags.push({
          coordinate: [x, y, z],
          intent: v.semantic_intent,
          radius: v.fillet_radius,
        });
      }
    });

    return {
      metadata: {
        voxel_size: this.voxelSize,
        bounding_box: [minX, minY, minZ, maxX, maxY, maxZ],
      },
      voxel_grid: {
        dimensions: [dimX, dimY, dimZ],
        data,
      },
      semantic_tags: semanticTags,
    };
  }

  /**
   * 取得所有體素
   */
  getAllVoxels(): VoxelData[] {
    const voxels: VoxelData[] = [];
    this.chunks.forEach(chunk => {
      voxels.push(...chunk.active_voxels);
    });
    return voxels;
  }

  /**
   * 取得所有區塊
   */
  getChunks(): ChunkData[] {
    return Array.from(this.chunks.values());
  }

  /**
   * 同步網路狀態
   */
  private handleNetworkSync(payload: any): void {
    // Handle multiplayer sync
    signalBus.publish(SIGNALS.LOG_MESSAGE, {
      level: 'info',
      source: 'VoxelEngine',
      message: '接收網路同步狀態',
    });
  }

  /**
   * 從 ProjectState 載入體素
   */
  loadFromChunks(chunks: ChunkData[]): void {
    this.chunks.clear();
    chunks.forEach(chunk => {
      this.chunks.set(chunk.chunk_id, { ...chunk });
    });
  }
}

export const voxelEngine = new VoxelEngine();
export default voxelEngine;
