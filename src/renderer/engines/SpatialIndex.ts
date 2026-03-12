/**
 * SpatialIndex - Spatial hashing for fast range queries on voxels
 * 
 * Uses a hash grid with configurable cell size for O(1) average-case
 * spatial queries like "find all voxels within radius R of point P".
 */

export class SpatialIndex {
  private cellSize: number;
  private grid: Map<string, Set<number>> = new Map();

  constructor(cellSize: number = 8) {
    this.cellSize = cellSize;
  }

  private cellKey(x: number, y: number, z: number): string {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    return `${cx},${cy},${cz}`;
  }

  /**
   * Insert a voxel index at position (x, y, z)
   */
  insert(idx: number, x: number, y: number, z: number): void {
    const key = this.cellKey(x, y, z);
    let cell = this.grid.get(key);
    if (!cell) {
      cell = new Set();
      this.grid.set(key, cell);
    }
    cell.add(idx);
  }

  /**
   * Remove a voxel index from position (x, y, z)
   */
  remove(idx: number, x: number, y: number, z: number): void {
    const key = this.cellKey(x, y, z);
    const cell = this.grid.get(key);
    if (cell) {
      cell.delete(idx);
      if (cell.size === 0) this.grid.delete(key);
    }
  }

  /**
   * Query all voxel indices within a sphere of radius R centered at (cx, cy, cz).
   * Returns indices only; caller must check actual positions for exact distance.
   */
  queryRadius(cx: number, cy: number, cz: number, radius: number): number[] {
    const results: number[] = [];
    const cellRadius = Math.ceil(radius / this.cellSize);
    const baseCx = Math.floor(cx / this.cellSize);
    const baseCy = Math.floor(cy / this.cellSize);
    const baseCz = Math.floor(cz / this.cellSize);

    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      for (let dy = -cellRadius; dy <= cellRadius; dy++) {
        for (let dz = -cellRadius; dz <= cellRadius; dz++) {
          const key = `${baseCx + dx},${baseCy + dy},${baseCz + dz}`;
          const cell = this.grid.get(key);
          if (cell) {
            for (const idx of cell) {
              results.push(idx);
            }
          }
        }
      }
    }
    return results;
  }

  /**
   * Query all voxel indices within an axis-aligned bounding box
   */
  queryAABB(
    minX: number, minY: number, minZ: number,
    maxX: number, maxY: number, maxZ: number,
  ): number[] {
    const results: number[] = [];
    const cMinX = Math.floor(minX / this.cellSize);
    const cMinY = Math.floor(minY / this.cellSize);
    const cMinZ = Math.floor(minZ / this.cellSize);
    const cMaxX = Math.floor(maxX / this.cellSize);
    const cMaxY = Math.floor(maxY / this.cellSize);
    const cMaxZ = Math.floor(maxZ / this.cellSize);

    for (let cx = cMinX; cx <= cMaxX; cx++) {
      for (let cy = cMinY; cy <= cMaxY; cy++) {
        for (let cz = cMinZ; cz <= cMaxZ; cz++) {
          const key = `${cx},${cy},${cz}`;
          const cell = this.grid.get(key);
          if (cell) {
            for (const idx of cell) {
              results.push(idx);
            }
          }
        }
      }
    }
    return results;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.grid.clear();
  }

  /**
   * Get total number of indexed entries
   */
  get size(): number {
    let total = 0;
    for (const cell of this.grid.values()) {
      total += cell.size;
    }
    return total;
  }
}

// Singleton instance
export const spatialIndex = new SpatialIndex(8);
