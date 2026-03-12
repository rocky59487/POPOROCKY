/**
 * VoxelBuffer - High-performance voxel data structure using Typed Arrays
 * 
 * Memory layout per voxel:
 * - positions: Float32Array [x, y, z] × maxVoxels
 * - materials: Uint8Array [materialType] × maxVoxels  (0=empty, 1=concrete, 2=steel, 3=wood, 4=brick, 5=aluminum, 6=glass)
 * - colors: Uint8Array [r, g, b] × maxVoxels (0-255)
 * - properties: Float32Array [maxCompression, maxTension, density, youngModulus] × maxVoxels
 * - flags: Uint8Array [bitfield] × maxVoxels (bit0=isSupport, bit1=hasLoad, bit2=isSelected)
 * - loads: Float32Array [lx, ly, lz] × maxVoxels (external load vector)
 * - layerIds: Uint16Array [layerIndex] × maxVoxels
 */

export const MATERIAL_TYPE = {
  EMPTY: 0,
  CONCRETE: 1,
  STEEL: 2,
  WOOD: 3,
  BRICK: 4,
  ALUMINUM: 5,
  GLASS: 6,
} as const;

export type MaterialType = typeof MATERIAL_TYPE[keyof typeof MATERIAL_TYPE];

const MATERIAL_NAME_TO_TYPE: Record<string, MaterialType> = {
  concrete: MATERIAL_TYPE.CONCRETE,
  steel: MATERIAL_TYPE.STEEL,
  wood: MATERIAL_TYPE.WOOD,
  brick: MATERIAL_TYPE.BRICK,
  aluminum: MATERIAL_TYPE.ALUMINUM,
  glass: MATERIAL_TYPE.GLASS,
};

const MATERIAL_TYPE_TO_NAME: Record<number, string> = {
  [MATERIAL_TYPE.CONCRETE]: 'concrete',
  [MATERIAL_TYPE.STEEL]: 'steel',
  [MATERIAL_TYPE.WOOD]: 'wood',
  [MATERIAL_TYPE.BRICK]: 'brick',
  [MATERIAL_TYPE.ALUMINUM]: 'aluminum',
  [MATERIAL_TYPE.GLASS]: 'glass',
};

const MATERIAL_DEFAULT_COLORS: Record<number, [number, number, number]> = {
  [MATERIAL_TYPE.CONCRETE]: [128, 128, 128],
  [MATERIAL_TYPE.STEEL]: [192, 192, 192],
  [MATERIAL_TYPE.WOOD]: [139, 69, 19],
  [MATERIAL_TYPE.BRICK]: [139, 58, 58],
  [MATERIAL_TYPE.ALUMINUM]: [208, 208, 224],
  [MATERIAL_TYPE.GLASS]: [136, 204, 238],
};

const MATERIAL_DEFAULT_PROPS: Record<number, [number, number, number, number]> = {
  // [maxCompression MPa, maxTension MPa, density kg/m³, youngModulus GPa]
  [MATERIAL_TYPE.CONCRETE]: [30, 3, 2400, 30],
  [MATERIAL_TYPE.STEEL]: [250, 250, 7850, 200],
  [MATERIAL_TYPE.WOOD]: [40, 50, 600, 12],
  [MATERIAL_TYPE.BRICK]: [15, 1, 1800, 15],
  [MATERIAL_TYPE.ALUMINUM]: [270, 270, 2700, 69],
  [MATERIAL_TYPE.GLASS]: [1000, 33, 2500, 70],
};

// Flags bitmask
export const FLAG_SUPPORT = 1;
export const FLAG_HAS_LOAD = 2;
export const FLAG_SELECTED = 4;

export class VoxelBuffer {
  readonly maxVoxels: number;
  readonly positions: Float32Array;
  readonly materials: Uint8Array;
  readonly colors: Uint8Array;
  readonly properties: Float32Array;
  readonly flags: Uint8Array;
  readonly loads: Float32Array;
  readonly layerIds: Uint16Array;

  count: number = 0;
  version: number = 0; // Incremented on every mutation for React change detection

  // O(1) lookup: "x,y,z" → index
  private positionIndex: Map<string, number> = new Map();
  // Free list for reusing slots after removal
  private freeSlots: number[] = [];

  constructor(maxVoxels: number = 500000) {
    this.maxVoxels = maxVoxels;
    this.positions = new Float32Array(maxVoxels * 3);
    this.materials = new Uint8Array(maxVoxels);
    this.colors = new Uint8Array(maxVoxels * 3);
    this.properties = new Float32Array(maxVoxels * 4);
    this.flags = new Uint8Array(maxVoxels);
    this.loads = new Float32Array(maxVoxels * 3);
    this.layerIds = new Uint16Array(maxVoxels);
  }

  private static posKey(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  private allocSlot(): number {
    if (this.freeSlots.length > 0) {
      return this.freeSlots.pop()!;
    }
    if (this.count >= this.maxVoxels) {
      throw new Error(`VoxelBuffer full: ${this.maxVoxels} voxels max`);
    }
    return this.count++;
  }

  /**
   * Add a voxel. Returns the slot index, or -1 if position already occupied.
   */
  addVoxel(
    x: number, y: number, z: number,
    materialName: string,
    colorR?: number, colorG?: number, colorB?: number,
    layerIndex: number = 0,
  ): number {
    const key = VoxelBuffer.posKey(x, y, z);
    if (this.positionIndex.has(key)) return -1; // Already occupied

    const idx = this.allocSlot();
    const i3 = idx * 3;
    const i4 = idx * 4;

    // Position
    this.positions[i3] = x;
    this.positions[i3 + 1] = y;
    this.positions[i3 + 2] = z;

    // Material type
    const matType = MATERIAL_NAME_TO_TYPE[materialName] || MATERIAL_TYPE.CONCRETE;
    this.materials[idx] = matType;

    // Color
    const defaultColor = MATERIAL_DEFAULT_COLORS[matType] || [128, 128, 128];
    this.colors[i3] = colorR !== undefined ? colorR : defaultColor[0];
    this.colors[i3 + 1] = colorG !== undefined ? colorG : defaultColor[1];
    this.colors[i3 + 2] = colorB !== undefined ? colorB : defaultColor[2];

    // Properties
    const defaultProps = MATERIAL_DEFAULT_PROPS[matType] || [30, 3, 2400, 30];
    this.properties[i4] = defaultProps[0];
    this.properties[i4 + 1] = defaultProps[1];
    this.properties[i4 + 2] = defaultProps[2];
    this.properties[i4 + 3] = defaultProps[3];

    // Flags & loads
    this.flags[idx] = 0;
    this.loads[i3] = 0;
    this.loads[i3 + 1] = 0;
    this.loads[i3 + 2] = 0;

    // Layer
    this.layerIds[idx] = layerIndex;

    // Index
    this.positionIndex.set(key, idx);
    this.version++;
    return idx;
  }

  /**
   * Remove a voxel at (x, y, z). Returns true if removed.
   */
  removeVoxel(x: number, y: number, z: number): boolean {
    const key = VoxelBuffer.posKey(x, y, z);
    const idx = this.positionIndex.get(key);
    if (idx === undefined) return false;

    // Clear the slot
    this.materials[idx] = MATERIAL_TYPE.EMPTY;
    this.flags[idx] = 0;

    // Remove from index
    this.positionIndex.delete(key);
    this.freeSlots.push(idx);
    this.version++;
    return true;
  }

  /**
   * Check if a voxel exists at (x, y, z)
   */
  hasVoxel(x: number, y: number, z: number): boolean {
    return this.positionIndex.has(VoxelBuffer.posKey(x, y, z));
  }

  /**
   * Get the index of a voxel at (x, y, z), or -1 if not found
   */
  getIndex(x: number, y: number, z: number): number {
    return this.positionIndex.get(VoxelBuffer.posKey(x, y, z)) ?? -1;
  }

  /**
   * Get position of voxel at index
   */
  getPosition(idx: number): [number, number, number] {
    const i3 = idx * 3;
    return [this.positions[i3], this.positions[i3 + 1], this.positions[i3 + 2]];
  }

  /**
   * Get material name of voxel at index
   */
  getMaterialName(idx: number): string {
    return MATERIAL_TYPE_TO_NAME[this.materials[idx]] || 'concrete';
  }

  /**
   * Get color of voxel at index as [r, g, b] (0-255)
   */
  getColor(idx: number): [number, number, number] {
    const i3 = idx * 3;
    return [this.colors[i3], this.colors[i3 + 1], this.colors[i3 + 2]];
  }

  /**
   * Set color of voxel at index
   */
  setColor(idx: number, r: number, g: number, b: number): void {
    const i3 = idx * 3;
    this.colors[i3] = r;
    this.colors[i3 + 1] = g;
    this.colors[i3 + 2] = b;
    this.version++;
  }

  /**
   * Set material of voxel at index
   */
  setMaterial(idx: number, materialName: string): void {
    const matType = MATERIAL_NAME_TO_TYPE[materialName] || MATERIAL_TYPE.CONCRETE;
    this.materials[idx] = matType;
    // Update default color
    const defaultColor = MATERIAL_DEFAULT_COLORS[matType] || [128, 128, 128];
    const i3 = idx * 3;
    this.colors[i3] = defaultColor[0];
    this.colors[i3 + 1] = defaultColor[1];
    this.colors[i3 + 2] = defaultColor[2];
    // Update default properties
    const defaultProps = MATERIAL_DEFAULT_PROPS[matType] || [30, 3, 2400, 30];
    const i4 = idx * 4;
    this.properties[i4] = defaultProps[0];
    this.properties[i4 + 1] = defaultProps[1];
    this.properties[i4 + 2] = defaultProps[2];
    this.properties[i4 + 3] = defaultProps[3];
    this.version++;
  }

  /**
   * Toggle support flag
   */
  toggleSupport(idx: number): boolean {
    this.flags[idx] ^= FLAG_SUPPORT;
    this.version++;
    return (this.flags[idx] & FLAG_SUPPORT) !== 0;
  }

  /**
   * Set external load
   */
  setLoad(idx: number, lx: number, ly: number, lz: number): void {
    const i3 = idx * 3;
    this.loads[i3] = lx;
    this.loads[i3 + 1] = ly;
    this.loads[i3 + 2] = lz;
    this.flags[idx] |= FLAG_HAS_LOAD;
    if (lx === 0 && ly === 0 && lz === 0) {
      this.flags[idx] &= ~FLAG_HAS_LOAD;
    }
    this.version++;
  }

  /**
   * Set selection flag
   */
  setSelected(idx: number, selected: boolean): void {
    if (selected) {
      this.flags[idx] |= FLAG_SELECTED;
    } else {
      this.flags[idx] &= ~FLAG_SELECTED;
    }
  }

  /**
   * Clear all selection flags
   */
  clearSelection(): void {
    for (let i = 0; i < this.count; i++) {
      this.flags[i] &= ~FLAG_SELECTED;
    }
  }

  /**
   * Get active voxel count (excluding free slots)
   */
  getActiveCount(): number {
    return this.positionIndex.size;
  }

  /**
   * Iterate over all active voxels. Callback receives (index, x, y, z, materialType).
   */
  forEach(callback: (idx: number, x: number, y: number, z: number, mat: number) => void): void {
    for (const [_key, idx] of this.positionIndex) {
      const i3 = idx * 3;
      callback(idx, this.positions[i3], this.positions[i3 + 1], this.positions[i3 + 2], this.materials[idx]);
    }
  }

  /**
   * Get all active indices
   */
  getActiveIndices(): number[] {
    return Array.from(this.positionIndex.values());
  }

  /**
   * Get material counts for statistics
   */
  getMaterialCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const [_key, idx] of this.positionIndex) {
      const name = MATERIAL_TYPE_TO_NAME[this.materials[idx]] || 'unknown';
      counts[name] = (counts[name] || 0) + 1;
    }
    return counts;
  }

  /**
   * Estimate total weight in kg
   */
  estimateWeight(): number {
    let totalWeight = 0;
    for (const [_key, idx] of this.positionIndex) {
      const i4 = idx * 4;
      const density = this.properties[i4 + 2]; // kg/m³
      totalWeight += density * 1; // 1 m³ per voxel
    }
    return totalWeight;
  }

  /**
   * Get transferable buffers for Web Worker communication
   */
  getTransferableSnapshot(): {
    positions: Float32Array;
    materials: Uint8Array;
    properties: Float32Array;
    flags: Uint8Array;
    loads: Float32Array;
    count: number;
    activeIndices: number[];
  } {
    const activeIndices = this.getActiveIndices();
    // Create compact copies for transfer
    const n = activeIndices.length;
    const positions = new Float32Array(n * 3);
    const materials = new Uint8Array(n);
    const properties = new Float32Array(n * 4);
    const flags = new Uint8Array(n);
    const loads = new Float32Array(n * 3);

    for (let i = 0; i < n; i++) {
      const idx = activeIndices[i];
      const si3 = idx * 3;
      const di3 = i * 3;
      positions[di3] = this.positions[si3];
      positions[di3 + 1] = this.positions[si3 + 1];
      positions[di3 + 2] = this.positions[si3 + 2];
      materials[i] = this.materials[idx];
      const si4 = idx * 4;
      const di4 = i * 4;
      properties[di4] = this.properties[si4];
      properties[di4 + 1] = this.properties[si4 + 1];
      properties[di4 + 2] = this.properties[si4 + 2];
      properties[di4 + 3] = this.properties[si4 + 3];
      flags[i] = this.flags[idx];
      loads[di3] = this.loads[si3];
      loads[di3 + 1] = this.loads[si3 + 1];
      loads[di3 + 2] = this.loads[si3 + 2];
    }

    return { positions, materials, properties, flags, loads, count: n, activeIndices };
  }

  /**
   * Clear all voxels
   */
  clear(): void {
    this.positionIndex.clear();
    this.freeSlots = [];
    this.count = 0;
    this.materials.fill(0);
    this.flags.fill(0);
    this.version++;
  }

  /**
   * Get neighbors of a voxel (6-connected)
   */
  getNeighbors(x: number, y: number, z: number): number[] {
    const neighbors: number[] = [];
    const offsets: [number, number, number][] = [
      [1, 0, 0], [-1, 0, 0],
      [0, 1, 0], [0, -1, 0],
      [0, 0, 1], [0, 0, -1],
    ];
    for (const [dx, dy, dz] of offsets) {
      const idx = this.getIndex(x + dx, y + dy, z + dz);
      if (idx >= 0) neighbors.push(idx);
    }
    return neighbors;
  }

  /**
   * Check if a face of a voxel is exposed (no neighbor on that side)
   * Returns array of face normals that are exposed
   */
  getExposedFaces(x: number, y: number, z: number): [number, number, number][] {
    const exposed: [number, number, number][] = [];
    const offsets: [number, number, number][] = [
      [1, 0, 0], [-1, 0, 0],
      [0, 1, 0], [0, -1, 0],
      [0, 0, 1], [0, 0, -1],
    ];
    for (const [dx, dy, dz] of offsets) {
      if (!this.hasVoxel(x + dx, y + dy, z + dz)) {
        exposed.push([dx, dy, dz]);
      }
    }
    return exposed;
  }
}

// Singleton instance
export const voxelBuffer = new VoxelBuffer(500000);
