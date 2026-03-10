import eventBus from './EventBus';
import { Vec3, Voxel, SemanticTag, DEFAULT_MATERIALS } from '../store/useStore';

const CHUNK_SIZE = 16;
function chunkKey(cx: number, cy: number, cz: number) { return `${cx},${cy},${cz}`; }
function posToChunk(p: Vec3) { return { x: Math.floor(p.x / CHUNK_SIZE), y: Math.floor(p.y / CHUNK_SIZE), z: Math.floor(p.z / CHUNK_SIZE) }; }
function voxelKey(p: Vec3) { return `${p.x},${p.y},${p.z}`; }

interface Chunk { key: string; origin: Vec3; voxels: Map<string, Voxel>; dirty: boolean; lodLevel: number; }

export class VoxelEngine {
  private chunks: Map<string, Chunk> = new Map();
  private totalVoxels = 0;

  private getOrCreateChunk(pos: Vec3): Chunk {
    const cp = posToChunk(pos);
    const key = chunkKey(cp.x, cp.y, cp.z);
    if (!this.chunks.has(key)) {
      this.chunks.set(key, { key, origin: { x: cp.x * CHUNK_SIZE, y: cp.y * CHUNK_SIZE, z: cp.z * CHUNK_SIZE }, voxels: new Map(), dirty: true, lodLevel: 0 });
    }
    return this.chunks.get(key)!;
  }

  addVoxel(voxel: Voxel): boolean {
    const chunk = this.getOrCreateChunk(voxel.pos);
    const key = voxelKey(voxel.pos);
    if (chunk.voxels.has(key)) return false;
    chunk.voxels.set(key, voxel); chunk.dirty = true; this.totalVoxels++;
    eventBus.emit('voxel:added', voxel);
    return true;
  }

  removeVoxel(pos: Vec3): Voxel | null {
    const chunk = this.getOrCreateChunk(pos);
    const key = voxelKey(pos);
    const voxel = chunk.voxels.get(key);
    if (!voxel) return null;
    chunk.voxels.delete(key); chunk.dirty = true; this.totalVoxels--;
    eventBus.emit('voxel:removed', voxel);
    return voxel;
  }

  getVoxel(pos: Vec3): Voxel | null {
    const chunk = this.getOrCreateChunk(pos);
    return chunk.voxels.get(voxelKey(pos)) || null;
  }

  queryRegion(min: Vec3, max: Vec3): Voxel[] {
    const results: Voxel[] = [];
    this.chunks.forEach(chunk => {
      chunk.voxels.forEach(v => {
        if (v.pos.x >= min.x && v.pos.x <= max.x && v.pos.y >= min.y && v.pos.y <= max.y && v.pos.z >= min.z && v.pos.z <= max.z) results.push(v);
      });
    });
    return results;
  }

  brushPlace(center: Vec3, radius: number, shape: string, color: string, layerId: string, tag?: SemanticTag): Voxel[] {
    const placed: Voxel[] = [];
    const r = Math.ceil(radius);
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
      const pos = { x: center.x + dx, y: center.y + dy, z: center.z + dz };
      let inBrush = shape === 'sphere' ? Math.sqrt(dx*dx+dy*dy+dz*dz) <= radius : shape === 'cylinder' ? Math.sqrt(dx*dx+dz*dz) <= radius && Math.abs(dy) <= radius : true;
      if (inBrush) {
        const v: Voxel = { id: `v_${Date.now()}_${dx}_${dy}_${dz}`, pos, color, layerId, semanticTag: tag, material: { ...DEFAULT_MATERIALS.concrete }, isSupport: false };
        if (this.addVoxel(v)) placed.push(v);
      }
    }
    eventBus.emit('voxel:brush-placed', { count: placed.length });
    return placed;
  }

  brushErase(center: Vec3, radius: number, shape: string): Voxel[] {
    const removed: Voxel[] = [];
    const r = Math.ceil(radius);
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
      const inBrush = shape === 'sphere' ? Math.sqrt(dx*dx+dy*dy+dz*dz) <= radius : true;
      if (inBrush) { const v = this.removeVoxel({ x: center.x+dx, y: center.y+dy, z: center.z+dz }); if (v) removed.push(v); }
    }
    return removed;
  }

  smoothRegion(center: Vec3, radius: number, _strength: number): number {
    const voxels = this.queryRegion({ x: center.x-radius, y: center.y-radius, z: center.z-radius }, { x: center.x+radius, y: center.y+radius, z: center.z+radius });
    eventBus.emit('voxel:smoothed', { count: voxels.length });
    return voxels.length;
  }

  floodFill(start: Vec3, color: string, maxCount = 1000): number {
    const queue: Vec3[] = [start]; const visited = new Set<string>(); let count = 0;
    const dirs = [{x:1,y:0,z:0},{x:-1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:-1,z:0},{x:0,y:0,z:1},{x:0,y:0,z:-1}];
    while (queue.length > 0 && count < maxCount) {
      const pos = queue.shift()!; const key = voxelKey(pos);
      if (visited.has(key)) continue; visited.add(key);
      const v = this.getVoxel(pos); if (!v) continue;
      v.color = color; count++;
      for (const d of dirs) { const np = { x: pos.x+d.x, y: pos.y+d.y, z: pos.z+d.z }; if (!visited.has(voxelKey(np)) && this.getVoxel(np)) queue.push(np); }
    }
    eventBus.emit('voxel:filled', { count, color }); return count;
  }

  sculptPush(center: Vec3, radius: number, _strength: number, _dir: Vec3): number {
    const voxels = this.queryRegion({ x: center.x-radius, y: center.y-radius, z: center.z-radius }, { x: center.x+radius, y: center.y+radius, z: center.z+radius });
    eventBus.emit('voxel:sculpted', { count: voxels.length }); return voxels.length;
  }

  setChunkLOD(cx: number, cy: number, cz: number, level: number): void {
    const chunk = this.chunks.get(chunkKey(cx, cy, cz)); if (chunk) { chunk.lodLevel = level; chunk.dirty = true; }
  }

  getStats() { return { totalVoxels: this.totalVoxels, chunkCount: this.chunks.size }; }
  getAllVoxels(): Voxel[] { const all: Voxel[] = []; this.chunks.forEach(c => c.voxels.forEach(v => all.push(v))); return all; }
}

export const voxelEngine = new VoxelEngine();
