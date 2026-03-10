import eventBus from './EventBus';

// LOD Engine using meshoptimizer for real QEM mesh simplification
// 4 LOD levels: LOD0=100%, LOD1=75%, LOD2=50%, LOD3=25%

export interface LODLevel {
  level: number;
  ratio: number;
  triangleCount: number;
  positions: Float32Array | null;
  indices: Uint32Array | null;
  distanceThreshold: number;
}

export interface LODMesh {
  id: string;
  levels: LODLevel[];
  currentLevel: number;
  originalPositions: Float32Array;
  originalIndices: Uint32Array;
}

let simplifierReady = false;
let MeshoptSimplifier: any = null;

async function initSimplifier(): Promise<void> {
  if (simplifierReady) return;
  try {
    const mo = await import('meshoptimizer');
    MeshoptSimplifier = mo.MeshoptSimplifier;
    await MeshoptSimplifier.ready;
    simplifierReady = true;
    eventBus.emit('lod:ready', {});
    console.log('[LODEngine] meshoptimizer simplifier ready');
  } catch (e) {
    console.warn('[LODEngine] meshoptimizer not available, using fallback', e);
  }
}

initSimplifier();

export class LODEngine {
  private meshes: Map<string, LODMesh> = new Map();
  private distanceThresholds = [0, 20, 50, 100];

  setDistanceThresholds(thresholds: number[]): void {
    this.distanceThresholds = thresholds;
    eventBus.emit('lod:thresholds-changed', { thresholds });
  }

  getDistanceThresholds(): number[] {
    return [...this.distanceThresholds];
  }

  async generateLOD(id: string, positions: Float32Array, indices: Uint32Array): Promise<LODMesh> {
    const ratios = [1.0, 0.75, 0.5, 0.25];
    const levels: LODLevel[] = [];
    const originalTriCount = indices.length / 3;

    for (let i = 0; i < ratios.length; i++) {
      const ratio = ratios[i];
      const threshold = this.distanceThresholds[i] || i * 30;

      if (ratio >= 1.0) {
        levels.push({ level: 0, ratio: 1.0, triangleCount: originalTriCount, positions: new Float32Array(positions), indices: new Uint32Array(indices), distanceThreshold: threshold });
        continue;
      }

      if (simplifierReady && MeshoptSimplifier) {
        try {
          const targetIndexCount = Math.max(3, Math.floor(indices.length * ratio / 3) * 3);
          const [newIndices, error] = MeshoptSimplifier.simplify(indices, positions, 3, targetIndexCount, 0.01);
          levels.push({ level: i, ratio, triangleCount: newIndices.length / 3, positions: new Float32Array(positions), indices: new Uint32Array(newIndices), distanceThreshold: threshold });
          console.log(`[LODEngine] LOD${i}: ${ratio * 100}% -> ${newIndices.length / 3} tris (error: ${error.toFixed(6)})`);
          continue;
        } catch (e) {
          console.warn(`[LODEngine] meshoptimizer failed for LOD${i}, fallback`, e);
        }
      }

      // Fallback: naive decimation
      const targetCount = Math.max(1, Math.floor(originalTriCount * ratio));
      const step = Math.max(1, Math.floor(originalTriCount / targetCount));
      const fallbackIndices: number[] = [];
      for (let t = 0; t < indices.length; t += 3 * step) {
        if (t + 2 < indices.length) fallbackIndices.push(indices[t], indices[t + 1], indices[t + 2]);
      }
      levels.push({ level: i, ratio, triangleCount: fallbackIndices.length / 3, positions: new Float32Array(positions), indices: new Uint32Array(fallbackIndices), distanceThreshold: threshold });
    }

    const lodMesh: LODMesh = { id, levels, currentLevel: 0, originalPositions: new Float32Array(positions), originalIndices: new Uint32Array(indices) };
    this.meshes.set(id, lodMesh);
    eventBus.emit('lod:generated', { id, levelCount: levels.length, triCounts: levels.map(l => l.triangleCount) });
    return lodMesh;
  }

  selectLODLevel(id: string, cameraDistance: number): number {
    const mesh = this.meshes.get(id);
    if (!mesh) return 0;
    let selectedLevel = 0;
    for (let i = mesh.levels.length - 1; i >= 0; i--) {
      if (cameraDistance >= mesh.levels[i].distanceThreshold) { selectedLevel = i; break; }
    }
    if (mesh.currentLevel !== selectedLevel) {
      mesh.currentLevel = selectedLevel;
      eventBus.emit('lod:level-changed', { id, level: selectedLevel, triangleCount: mesh.levels[selectedLevel].triangleCount });
    }
    return selectedLevel;
  }

  getCurrentLODData(id: string): { positions: Float32Array; indices: Uint32Array } | null {
    const mesh = this.meshes.get(id);
    if (!mesh) return null;
    const level = mesh.levels[mesh.currentLevel];
    if (!level || !level.positions || !level.indices) return null;
    return { positions: level.positions, indices: level.indices };
  }

  getLODMesh(id: string): LODMesh | undefined { return this.meshes.get(id); }

  async batchGenerateLOD(meshes: Array<{ id: string; positions: Float32Array; indices: Uint32Array }>): Promise<LODMesh[]> {
    const results: LODMesh[] = [];
    for (const m of meshes) results.push(await this.generateLOD(m.id, m.positions, m.indices));
    eventBus.emit('lod:batch-complete', { count: results.length });
    return results;
  }

  getStats() {
    let totalOrigTris = 0, totalCurrentTris = 0;
    this.meshes.forEach(m => {
      totalOrigTris += m.levels[0]?.triangleCount || 0;
      totalCurrentTris += m.levels[m.currentLevel]?.triangleCount || 0;
    });
    return { meshCount: this.meshes.size, totalOriginalTriangles: totalOrigTris, totalCurrentTriangles: totalCurrentTris, simplifierReady };
  }

  clear(): void { this.meshes.clear(); }
}

export const lodEngine = new LODEngine();
