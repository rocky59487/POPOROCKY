import eventBus from './EventBus';
import { Vec3, Voxel, SemanticTag, DEFAULT_MATERIALS, VoxelMaterial } from '../store/useStore';

const CHUNK_SIZE = 16;
function chunkKey(cx: number, cy: number, cz: number) { return `${cx},${cy},${cz}`; }
function posToChunk(p: Vec3) { return { x: Math.floor(p.x / CHUNK_SIZE), y: Math.floor(p.y / CHUNK_SIZE), z: Math.floor(p.z / CHUNK_SIZE) }; }
function voxelKey(p: Vec3) { return `${p.x},${p.y},${p.z}`; }

// ─── True Octree Spatial Index ───
interface OctreeNode {
  bounds: { min: Vec3; max: Vec3 };
  children: (OctreeNode | null)[];
  voxelKeys: Set<string>;
  depth: number;
}

const MAX_OCTREE_DEPTH = 8;
const MAX_VOXELS_PER_NODE = 8;

class Octree {
  root: OctreeNode;

  constructor(min: Vec3, max: Vec3) {
    this.root = this.createNode(min, max, 0);
  }

  private createNode(min: Vec3, max: Vec3, depth: number): OctreeNode {
    return { bounds: { min, max }, children: new Array(8).fill(null), voxelKeys: new Set(), depth };
  }

  private getOctant(node: OctreeNode, pos: Vec3): number {
    const mid = {
      x: (node.bounds.min.x + node.bounds.max.x) / 2,
      y: (node.bounds.min.y + node.bounds.max.y) / 2,
      z: (node.bounds.min.z + node.bounds.max.z) / 2,
    };
    let octant = 0;
    if (pos.x >= mid.x) octant |= 1;
    if (pos.y >= mid.y) octant |= 2;
    if (pos.z >= mid.z) octant |= 4;
    return octant;
  }

  private getChildBounds(node: OctreeNode, octant: number): { min: Vec3; max: Vec3 } {
    const mid = {
      x: (node.bounds.min.x + node.bounds.max.x) / 2,
      y: (node.bounds.min.y + node.bounds.max.y) / 2,
      z: (node.bounds.min.z + node.bounds.max.z) / 2,
    };
    const min = {
      x: (octant & 1) ? mid.x : node.bounds.min.x,
      y: (octant & 2) ? mid.y : node.bounds.min.y,
      z: (octant & 4) ? mid.z : node.bounds.min.z,
    };
    const max = {
      x: (octant & 1) ? node.bounds.max.x : mid.x,
      y: (octant & 2) ? node.bounds.max.y : mid.y,
      z: (octant & 4) ? node.bounds.max.z : mid.z,
    };
    return { min, max };
  }

  insert(pos: Vec3, key: string): void {
    this._insert(this.root, pos, key);
  }

  private _insert(node: OctreeNode, pos: Vec3, key: string): void {
    if (node.depth >= MAX_OCTREE_DEPTH || (node.voxelKeys.size < MAX_VOXELS_PER_NODE && !node.children[0])) {
      node.voxelKeys.add(key);
      return;
    }
    // Subdivide if needed
    const octant = this.getOctant(node, pos);
    if (!node.children[octant]) {
      const bounds = this.getChildBounds(node, octant);
      node.children[octant] = this.createNode(bounds.min, bounds.max, node.depth + 1);
    }
    // Move existing voxels down if this is first subdivision
    if (node.voxelKeys.size > 0 && node.depth < MAX_OCTREE_DEPTH) {
      // Keep in current node for simplicity since we track by key
    }
    node.voxelKeys.add(key);
    this._insert(node.children[octant]!, pos, key);
  }

  remove(pos: Vec3, key: string): void {
    this._remove(this.root, pos, key);
  }

  private _remove(node: OctreeNode, pos: Vec3, key: string): void {
    node.voxelKeys.delete(key);
    const octant = this.getOctant(node, pos);
    if (node.children[octant]) {
      this._remove(node.children[octant]!, pos, key);
    }
  }

  queryRegion(min: Vec3, max: Vec3): string[] {
    const results: string[] = [];
    this._queryRegion(this.root, min, max, results);
    return results;
  }

  private _queryRegion(node: OctreeNode, min: Vec3, max: Vec3, results: string[]): void {
    // AABB intersection test
    if (node.bounds.max.x < min.x || node.bounds.min.x > max.x ||
        node.bounds.max.y < min.y || node.bounds.min.y > max.y ||
        node.bounds.max.z < min.z || node.bounds.min.z > max.z) return;

    // If leaf or max depth, return all keys
    const hasChildren = node.children.some(c => c !== null);
    if (!hasChildren) {
      node.voxelKeys.forEach(k => results.push(k));
      return;
    }

    for (const child of node.children) {
      if (child) this._queryRegion(child, min, max, results);
    }
  }

  getStats(): { nodeCount: number; maxDepth: number } {
    let nodeCount = 0, maxDepth = 0;
    const traverse = (n: OctreeNode) => {
      nodeCount++;
      if (n.depth > maxDepth) maxDepth = n.depth;
      for (const c of n.children) if (c) traverse(c);
    };
    traverse(this.root);
    return { nodeCount, maxDepth };
  }
}

// ─── Undo/Redo System ───
type UndoAction = {
  type: 'add';
  voxels: Voxel[];
} | {
  type: 'remove';
  voxels: Voxel[];
} | {
  type: 'modify';
  before: Voxel[];
  after: Voxel[];
};

const MAX_UNDO_STEPS = 50;

// ─── Chunk ───
interface Chunk {
  key: string;
  origin: Vec3;
  voxels: Map<string, Voxel>;
  dirty: boolean;
  lodLevel: number;
}

// ─── VoxelEngine ───
export class VoxelEngine {
  private chunks: Map<string, Chunk> = new Map();
  private globalIndex: Map<string, Voxel> = new Map(); // fast global lookup
  private octree: Octree;
  private totalVoxels = 0;
  private undoStack: UndoAction[] = [];
  private redoStack: UndoAction[] = [];
  private batchActions: Voxel[] = []; // for batching undo
  private isBatching = false;

  constructor() {
    // Octree covers -512 to 512 in each axis
    this.octree = new Octree({ x: -512, y: -512, z: -512 }, { x: 512, y: 512, z: 512 });
  }

  // ─── Undo/Redo ───
  beginBatch(): void { this.isBatching = true; this.batchActions = []; }

  commitBatchAdd(): void {
    if (this.batchActions.length > 0) {
      this.pushUndo({ type: 'add', voxels: [...this.batchActions] });
    }
    this.isBatching = false;
    this.batchActions = [];
  }

  commitBatchRemove(): void {
    if (this.batchActions.length > 0) {
      this.pushUndo({ type: 'remove', voxels: [...this.batchActions] });
    }
    this.isBatching = false;
    this.batchActions = [];
  }

  private pushUndo(action: UndoAction): void {
    this.undoStack.push(action);
    if (this.undoStack.length > MAX_UNDO_STEPS) this.undoStack.shift();
    this.redoStack = []; // clear redo on new action
    eventBus.emit('undo:changed', { undoCount: this.undoStack.length, redoCount: 0 });
  }

  undo(): boolean {
    const action = this.undoStack.pop();
    if (!action) return false;

    if (action.type === 'add') {
      // Undo add = remove those voxels
      for (const v of action.voxels) this._removeVoxelInternal(v.pos);
    } else if (action.type === 'remove') {
      // Undo remove = add those voxels back
      for (const v of action.voxels) this._addVoxelInternal(v);
    } else if (action.type === 'modify') {
      // Undo modify = restore before state
      for (const v of action.before) {
        this._removeVoxelInternal(v.pos);
        this._addVoxelInternal(v);
      }
    }

    this.redoStack.push(action);
    eventBus.emit('undo:changed', { undoCount: this.undoStack.length, redoCount: this.redoStack.length });
    eventBus.emit('voxel:undo', {});
    return true;
  }

  redo(): boolean {
    const action = this.redoStack.pop();
    if (!action) return false;

    if (action.type === 'add') {
      for (const v of action.voxels) this._addVoxelInternal(v);
    } else if (action.type === 'remove') {
      for (const v of action.voxels) this._removeVoxelInternal(v.pos);
    } else if (action.type === 'modify') {
      for (const v of action.after) {
        this._removeVoxelInternal(v.pos);
        this._addVoxelInternal(v);
      }
    }

    this.undoStack.push(action);
    eventBus.emit('undo:changed', { undoCount: this.undoStack.length, redoCount: this.redoStack.length });
    eventBus.emit('voxel:redo', {});
    return true;
  }

  getUndoRedoState() {
    return { undoCount: this.undoStack.length, redoCount: this.redoStack.length };
  }

  getUndoCount(): number { return this.undoStack.length; }
  getRedoCount(): number { return this.redoStack.length; }

  // ─── Internal add/remove (no undo tracking) ───
  private _addVoxelInternal(voxel: Voxel): boolean {
    const chunk = this.getOrCreateChunk(voxel.pos);
    const key = voxelKey(voxel.pos);
    if (chunk.voxels.has(key)) return false;
    chunk.voxels.set(key, voxel);
    this.globalIndex.set(key, voxel);
    this.octree.insert(voxel.pos, key);
    chunk.dirty = true;
    this.totalVoxels++;
    return true;
  }

  private _removeVoxelInternal(pos: Vec3): Voxel | null {
    const chunk = this.getOrCreateChunk(pos);
    const key = voxelKey(pos);
    const voxel = chunk.voxels.get(key);
    if (!voxel) return null;
    chunk.voxels.delete(key);
    this.globalIndex.delete(key);
    this.octree.remove(pos, key);
    chunk.dirty = true;
    this.totalVoxels--;
    return voxel;
  }

  // ─── Chunk Management ───
  private getOrCreateChunk(pos: Vec3): Chunk {
    const cp = posToChunk(pos);
    const key = chunkKey(cp.x, cp.y, cp.z);
    if (!this.chunks.has(key)) {
      this.chunks.set(key, {
        key,
        origin: { x: cp.x * CHUNK_SIZE, y: cp.y * CHUNK_SIZE, z: cp.z * CHUNK_SIZE },
        voxels: new Map(),
        dirty: true,
        lodLevel: 0,
      });
    }
    return this.chunks.get(key)!;
  }

  // ─── Public API (with undo tracking) ───
  addVoxel(voxel: Voxel): boolean {
    const ok = this._addVoxelInternal(voxel);
    if (ok) {
      if (this.isBatching) {
        this.batchActions.push({ ...voxel, pos: { ...voxel.pos }, material: { ...voxel.material } });
      } else {
        this.pushUndo({ type: 'add', voxels: [{ ...voxel, pos: { ...voxel.pos }, material: { ...voxel.material } }] });
      }
      eventBus.emit('voxel:added', voxel);
    }
    return ok;
  }

  removeVoxel(pos: Vec3): Voxel | null {
    const voxel = this._removeVoxelInternal(pos);
    if (voxel) {
      if (this.isBatching) {
        this.batchActions.push({ ...voxel, pos: { ...voxel.pos }, material: { ...voxel.material } });
      } else {
        this.pushUndo({ type: 'remove', voxels: [{ ...voxel, pos: { ...voxel.pos }, material: { ...voxel.material } }] });
      }
      eventBus.emit('voxel:removed', voxel);
    }
    return voxel;
  }

  getVoxel(pos: Vec3): Voxel | null {
    return this.globalIndex.get(voxelKey(pos)) || null;
  }

  // ─── Octree-accelerated region query ───
  queryRegion(min: Vec3, max: Vec3): Voxel[] {
    const keys = this.octree.queryRegion(min, max);
    const results: Voxel[] = [];
    for (const key of keys) {
      const v = this.globalIndex.get(key);
      if (v && v.pos.x >= min.x && v.pos.x <= max.x &&
          v.pos.y >= min.y && v.pos.y <= max.y &&
          v.pos.z >= min.z && v.pos.z <= max.z) {
        results.push(v);
      }
    }
    return results;
  }

  // ─── Brush with strength gradient ───
  brushPlace(center: Vec3, radius: number, shape: 'sphere' | 'cube' | 'cylinder', color: string, layerId: string, material?: VoxelMaterial, tag?: SemanticTag, strength: number = 1.0): Voxel[] {
    this.beginBatch();
    const placed: Voxel[] = [];
    const r = Math.ceil(radius);
    const mat = material || { ...DEFAULT_MATERIALS.concrete };

    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dz = -r; dz <= r; dz++) {
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          let inBrush = false;

          if (shape === 'sphere') {
            inBrush = dist <= radius;
          } else if (shape === 'cylinder') {
            inBrush = Math.sqrt(dx * dx + dz * dz) <= radius && Math.abs(dy) <= radius;
          } else {
            inBrush = true; // cube
          }

          if (!inBrush) continue;

          // Strength gradient: probability of placement decreases with distance
          const normalizedDist = dist / Math.max(radius, 1);
          const placementProb = strength * (1.0 - normalizedDist * 0.5); // 50% falloff at edge
          if (Math.random() > placementProb && normalizedDist > 0.5) continue;

          const pos = { x: center.x + dx, y: center.y + dy, z: center.z + dz };
          const v: Voxel = {
            id: `v_${Date.now()}_${dx}_${dy}_${dz}`,
            pos,
            color,
            layerId,
            semanticTag: tag,
            material: { ...mat },
            isSupport: false,
          };
          if (this.addVoxel(v)) placed.push(v);
        }
      }
    }

    this.commitBatchAdd();
    eventBus.emit('voxel:brush-placed', { count: placed.length, shape, radius, strength });
    return placed;
  }

  brushErase(center: Vec3, radius: number, shape: 'sphere' | 'cube' | 'cylinder'): Voxel[] {
    this.beginBatch();
    const removed: Voxel[] = [];
    const r = Math.ceil(radius);

    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dz = -r; dz <= r; dz++) {
          let inBrush = false;
          if (shape === 'sphere') inBrush = Math.sqrt(dx * dx + dy * dy + dz * dz) <= radius;
          else if (shape === 'cylinder') inBrush = Math.sqrt(dx * dx + dz * dz) <= radius && Math.abs(dy) <= radius;
          else inBrush = true;

          if (inBrush) {
            const v = this.removeVoxel({ x: center.x + dx, y: center.y + dy, z: center.z + dz });
            if (v) removed.push(v);
          }
        }
      }
    }

    this.commitBatchRemove();
    return removed;
  }

  // ─── Smooth: average neighbor colors ───
  smoothRegion(center: Vec3, radius: number, strength: number): number {
    const voxels = this.queryRegion(
      { x: center.x - radius, y: center.y - radius, z: center.z - radius },
      { x: center.x + radius, y: center.y + radius, z: center.z + radius }
    );
    const dirs = [
      { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
      { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
    ];

    const before = voxels.map(v => ({ ...v, pos: { ...v.pos }, material: { ...v.material } }));

    for (const v of voxels) {
      // Parse hex color
      const r = parseInt(v.color.slice(1, 3), 16);
      const g = parseInt(v.color.slice(3, 5), 16);
      const b = parseInt(v.color.slice(5, 7), 16);
      let sumR = r, sumG = g, sumB = b, count = 1;

      for (const d of dirs) {
        const n = this.getVoxel({ x: v.pos.x + d.x, y: v.pos.y + d.y, z: v.pos.z + d.z });
        if (n) {
          sumR += parseInt(n.color.slice(1, 3), 16);
          sumG += parseInt(n.color.slice(3, 5), 16);
          sumB += parseInt(n.color.slice(5, 7), 16);
          count++;
        }
      }

      const avgR = Math.round(r + (sumR / count - r) * strength);
      const avgG = Math.round(g + (sumG / count - g) * strength);
      const avgB = Math.round(b + (sumB / count - b) * strength);
      v.color = `#${avgR.toString(16).padStart(2, '0')}${avgG.toString(16).padStart(2, '0')}${avgB.toString(16).padStart(2, '0')}`;
    }

    const after = voxels.map(v => ({ ...v, pos: { ...v.pos }, material: { ...v.material } }));
    if (before.length > 0) this.pushUndo({ type: 'modify', before, after });

    eventBus.emit('voxel:smoothed', { count: voxels.length, strength });
    return voxels.length;
  }

  // ─── Flood Fill ───
  floodFill(start: Vec3, color: string, maxCount = 1000): number {
    const startVoxel = this.getVoxel(start);
    if (!startVoxel) return 0;

    const originalColor = startVoxel.color;
    if (originalColor === color) return 0;

    const queue: Vec3[] = [start];
    const visited = new Set<string>();
    const modified: { before: Voxel[]; after: Voxel[] } = { before: [], after: [] };
    let count = 0;
    const dirs = [
      { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
      { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
    ];

    while (queue.length > 0 && count < maxCount) {
      const pos = queue.shift()!;
      const key = voxelKey(pos);
      if (visited.has(key)) continue;
      visited.add(key);

      const v = this.getVoxel(pos);
      if (!v || v.color !== originalColor) continue;

      modified.before.push({ ...v, pos: { ...v.pos }, material: { ...v.material } });
      v.color = color;
      modified.after.push({ ...v, pos: { ...v.pos }, material: { ...v.material } });
      count++;

      for (const d of dirs) {
        const np = { x: pos.x + d.x, y: pos.y + d.y, z: pos.z + d.z };
        if (!visited.has(voxelKey(np)) && this.getVoxel(np)) queue.push(np);
      }
    }

    if (modified.before.length > 0) {
      this.pushUndo({ type: 'modify', before: modified.before, after: modified.after });
    }

    eventBus.emit('voxel:filled', { count, color });
    return count;
  }

  // ─── Sculpt Push ───
  sculptPush(center: Vec3, radius: number, strength: number, dir: Vec3): number {
    const voxels = this.queryRegion(
      { x: center.x - radius, y: center.y - radius, z: center.z - radius },
      { x: center.x + radius, y: center.y + radius, z: center.z + radius }
    );

    this.beginBatch();
    let moved = 0;

    // Sort by distance from center (furthest first to avoid collisions)
    const sorted = voxels
      .map(v => ({
        v,
        dist: Math.sqrt((v.pos.x - center.x) ** 2 + (v.pos.y - center.y) ** 2 + (v.pos.z - center.z) ** 2),
      }))
      .sort((a, b) => b.dist - a.dist);

    for (const { v, dist } of sorted) {
      const falloff = Math.max(0, 1 - dist / radius) * strength;
      const newPos = {
        x: Math.round(v.pos.x + dir.x * falloff),
        y: Math.round(v.pos.y + dir.y * falloff),
        z: Math.round(v.pos.z + dir.z * falloff),
      };

      if (newPos.x === v.pos.x && newPos.y === v.pos.y && newPos.z === v.pos.z) continue;
      if (this.getVoxel(newPos)) continue; // target occupied

      const copy = { ...v, pos: newPos, id: v.id };
      this.removeVoxel(v.pos);
      this.addVoxel(copy);
      moved++;
    }

    this.commitBatchAdd();
    eventBus.emit('voxel:sculpted', { count: moved });
    return moved;
  }

  // ─── LOD ───
  setChunkLOD(cx: number, cy: number, cz: number, level: number): void {
    const chunk = this.chunks.get(chunkKey(cx, cy, cz));
    if (chunk) { chunk.lodLevel = level; chunk.dirty = true; }
  }

  // ─── Stats ───
  getStats() {
    const octreeStats = this.octree.getStats();
    return {
      totalVoxels: this.totalVoxels,
      chunkCount: this.chunks.size,
      octreeNodes: octreeStats.nodeCount,
      octreeMaxDepth: octreeStats.maxDepth,
      undoSteps: this.undoStack.length,
      redoSteps: this.redoStack.length,
    };
  }

  getAllVoxels(): Voxel[] {
    return Array.from(this.globalIndex.values());
  }

  clear(): void {
    this.chunks.clear();
    this.globalIndex.clear();
    this.octree = new Octree({ x: -512, y: -512, z: -512 }, { x: 512, y: 512, z: 512 });
    this.totalVoxels = 0;
    this.undoStack = [];
    this.redoStack = [];
  }
}

export const voxelEngine = new VoxelEngine();
