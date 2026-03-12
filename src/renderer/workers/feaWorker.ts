/**
 * FEA Worker - Runs structural analysis off the main thread
 * 
 * Receives voxel data as transferable typed arrays,
 * performs FEA computation, and returns results.
 */

import { expose } from 'comlink';

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface FEAEdge {
  nodeA: Vec3;
  nodeB: Vec3;
  stressRatio: number;
  force: number;
  type: 'compression' | 'tension';
}

interface FEAResult {
  edges: FEAEdge[];
  maxStressRatio: number;
  dangerCount: number;
  overloadCount: number;
  totalForce: number;
  safetyLevel: 'safe' | 'warning' | 'danger';
}

interface FEAInput {
  positions: Float32Array;
  materials: Uint8Array;
  properties: Float32Array;
  flags: Uint8Array;
  loads: Float32Array;
  count: number;
  glueJoints: Array<{ voxelA: Vec3; voxelB: Vec3; strength: number }>;
  gravity: Vec3;
  gravityMagnitude: number;
}

// Flag bitmask constants
const FLAG_SUPPORT = 1;
const FLAG_HAS_LOAD = 2;

// Material default properties [maxCompression, maxTension, density, youngModulus]
const MATERIAL_DEFAULTS: Record<number, [number, number, number, number]> = {
  1: [30, 3, 2400, 30],    // concrete
  2: [250, 250, 7850, 200], // steel
  3: [40, 50, 600, 12],     // wood
  4: [15, 1, 1800, 15],     // brick
  5: [270, 270, 2700, 69],  // aluminum
  6: [1000, 33, 2500, 70],  // glass
};

function posKey(x: number, y: number, z: number): string {
  return `${Math.round(x)},${Math.round(y)},${Math.round(z)}`;
}

function analyze(input: FEAInput): FEAResult {
  const { positions, materials, properties, flags, loads, count, glueJoints, gravity, gravityMagnitude } = input;

  // Build position map
  const posMap = new Map<string, number>();
  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const key = posKey(positions[i3], positions[i3 + 1], positions[i3 + 2]);
    posMap.set(key, i);
  }

  // Find all edges (adjacent voxels + glue joints)
  const edgeSet = new Set<string>();
  const rawEdges: Array<{ a: number; b: number; isGlue: boolean; strength: number }> = [];

  // 6-connected adjacency
  const offsets: [number, number, number][] = [
    [1, 0, 0], [-1, 0, 0],
    [0, 1, 0], [0, -1, 0],
    [0, 0, 1], [0, 0, -1],
  ];

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const x = Math.round(positions[i3]);
    const y = Math.round(positions[i3 + 1]);
    const z = Math.round(positions[i3 + 2]);

    for (const [dx, dy, dz] of offsets) {
      const nKey = posKey(x + dx, y + dy, z + dz);
      const nIdx = posMap.get(nKey);
      if (nIdx !== undefined) {
        const edgeKey = i < nIdx ? `${i}-${nIdx}` : `${nIdx}-${i}`;
        if (!edgeSet.has(edgeKey)) {
          edgeSet.add(edgeKey);
          rawEdges.push({ a: i, b: nIdx, isGlue: false, strength: 1.0 });
        }
      }
    }
  }

  // Add glue joints
  for (const gj of glueJoints) {
    const aKey = posKey(gj.voxelA.x, gj.voxelA.y, gj.voxelA.z);
    const bKey = posKey(gj.voxelB.x, gj.voxelB.y, gj.voxelB.z);
    const aIdx = posMap.get(aKey);
    const bIdx = posMap.get(bKey);
    if (aIdx !== undefined && bIdx !== undefined) {
      const edgeKey = aIdx < bIdx ? `${aIdx}-${bIdx}` : `${bIdx}-${aIdx}`;
      if (!edgeSet.has(edgeKey)) {
        edgeSet.add(edgeKey);
        rawEdges.push({ a: aIdx, b: bIdx, isGlue: true, strength: gj.strength });
      }
    }
  }

  // Simple FEA: compute forces on each edge
  const edges: FEAEdge[] = [];
  let maxStressRatio = 0;
  let dangerCount = 0;
  let overloadCount = 0;
  let totalForce = 0;

  // Compute weight of each voxel
  const weights = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const i4 = i * 4;
    const density = properties[i4 + 2] || 2400;
    weights[i] = density * gravityMagnitude * 1.0; // 1m³ per voxel
  }

  // Simple force propagation: each edge carries proportional load
  for (const edge of rawEdges) {
    const a3 = edge.a * 3;
    const b3 = edge.b * 3;
    const a4 = edge.a * 4;
    const b4 = edge.b * 4;

    const ax = positions[a3], ay = positions[a3 + 1], az = positions[a3 + 2];
    const bx = positions[b3], by = positions[b3 + 1], bz = positions[b3 + 2];

    // Force = average weight of connected voxels + external loads
    let force = (weights[edge.a] + weights[edge.b]) / 2;

    // Add external loads
    if (flags[edge.a] & FLAG_HAS_LOAD) {
      const lMag = Math.sqrt(
        loads[a3] * loads[a3] + loads[a3 + 1] * loads[a3 + 1] + loads[a3 + 2] * loads[a3 + 2]
      );
      force += lMag / 6; // Distribute among neighbors
    }
    if (flags[edge.b] & FLAG_HAS_LOAD) {
      const lMag = Math.sqrt(
        loads[b3] * loads[b3] + loads[b3 + 1] * loads[b3 + 1] + loads[b3 + 2] * loads[b3 + 2]
      );
      force += lMag / 6;
    }

    // Apply glue strength
    force *= edge.strength;

    // Determine compression vs tension based on gravity direction
    const dy = by - ay;
    const isCompression = dy < 0; // Lower voxel bears compression

    // Compute stress ratio
    const maxStress = isCompression
      ? Math.min(properties[a4], properties[b4]) * 1e6 // MPa to Pa
      : Math.min(properties[a4 + 1], properties[b4 + 1]) * 1e6;

    const stressRatio = maxStress > 0 ? force / maxStress : 0;

    totalForce += force;
    if (stressRatio > maxStressRatio) maxStressRatio = stressRatio;
    if (stressRatio > 0.8) dangerCount++;
    if (stressRatio > 1.0) overloadCount++;

    edges.push({
      nodeA: { x: ax, y: ay, z: az },
      nodeB: { x: bx, y: by, z: bz },
      stressRatio,
      force,
      type: isCompression ? 'compression' : 'tension',
    });
  }

  const safetyLevel: 'safe' | 'warning' | 'danger' =
    overloadCount > 0 ? 'danger' : dangerCount > 0 ? 'warning' : 'safe';

  return {
    edges,
    maxStressRatio,
    dangerCount,
    overloadCount,
    totalForce,
    safetyLevel,
  };
}

const feaWorkerAPI = {
  analyze,
};

expose(feaWorkerAPI);

export type FEAWorkerAPI = typeof feaWorkerAPI;
