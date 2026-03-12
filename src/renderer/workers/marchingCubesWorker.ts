/**
 * Marching Cubes Worker - Runs isosurface extraction off the main thread
 * 
 * Receives voxel positions as typed arrays and generates mesh data.
 */

import { expose } from 'comlink';

interface MarchingCubesInput {
  positions: Float32Array;
  count: number;
  threshold: number;
  gridResolution: number;
}

interface MarchingCubesResult {
  vertices: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  vertexCount: number;
  triangleCount: number;
}

// Marching Cubes edge table and triangle table (standard)
// Simplified version for voxel-based input

function generateScalarField(
  positions: Float32Array,
  count: number,
  gridMin: [number, number, number],
  gridMax: [number, number, number],
  resolution: number,
): { field: Float32Array; dims: [number, number, number] } {
  const dx = gridMax[0] - gridMin[0];
  const dy = gridMax[1] - gridMin[1];
  const dz = gridMax[2] - gridMin[2];

  const nx = Math.ceil(dx / resolution) + 2;
  const ny = Math.ceil(dy / resolution) + 2;
  const nz = Math.ceil(dz / resolution) + 2;

  const field = new Float32Array(nx * ny * nz);

  // For each voxel, add contribution to nearby grid points
  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const vx = positions[i3];
    const vy = positions[i3 + 1];
    const vz = positions[i3 + 2];

    // Grid coordinates
    const gx = (vx - gridMin[0]) / resolution;
    const gy = (vy - gridMin[1]) / resolution;
    const gz = (vz - gridMin[2]) / resolution;

    // Influence radius in grid cells
    const radius = 1.5;
    const r2 = radius * radius;

    const minGx = Math.max(0, Math.floor(gx - radius));
    const maxGx = Math.min(nx - 1, Math.ceil(gx + radius));
    const minGy = Math.max(0, Math.floor(gy - radius));
    const maxGy = Math.min(ny - 1, Math.ceil(gy + radius));
    const minGz = Math.max(0, Math.floor(gz - radius));
    const maxGz = Math.min(nz - 1, Math.ceil(gz + radius));

    for (let ix = minGx; ix <= maxGx; ix++) {
      for (let iy = minGy; iy <= maxGy; iy++) {
        for (let iz = minGz; iz <= maxGz; iz++) {
          const dx2 = (ix - gx) * (ix - gx);
          const dy2 = (iy - gy) * (iy - gy);
          const dz2 = (iz - gz) * (iz - gz);
          const dist2 = dx2 + dy2 + dz2;
          if (dist2 < r2) {
            const contribution = 1.0 - Math.sqrt(dist2) / radius;
            field[ix + iy * nx + iz * nx * ny] += contribution;
          }
        }
      }
    }
  }

  return { field, dims: [nx, ny, nz] };
}

function marchingCubes(input: MarchingCubesInput): MarchingCubesResult {
  const { positions, count, threshold, gridResolution } = input;

  if (count === 0) {
    return {
      vertices: new Float32Array(0),
      normals: new Float32Array(0),
      indices: new Uint32Array(0),
      vertexCount: 0,
      triangleCount: 0,
    };
  }

  // Find bounding box
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    minX = Math.min(minX, positions[i3]);
    minY = Math.min(minY, positions[i3 + 1]);
    minZ = Math.min(minZ, positions[i3 + 2]);
    maxX = Math.max(maxX, positions[i3]);
    maxY = Math.max(maxY, positions[i3 + 1]);
    maxZ = Math.max(maxZ, positions[i3 + 2]);
  }

  // Expand bounds
  const pad = 2;
  minX -= pad; minY -= pad; minZ -= pad;
  maxX += pad; maxY += pad; maxZ += pad;

  // Generate scalar field
  const { field, dims } = generateScalarField(
    positions, count,
    [minX, minY, minZ],
    [maxX, maxY, maxZ],
    gridResolution,
  );

  const [nx, ny, nz] = dims;
  const vertices: number[] = [];
  const normals: number[] = [];

  // Simple marching cubes: for each cell, check if it crosses the threshold
  // and generate triangles accordingly (simplified version)
  for (let ix = 0; ix < nx - 1; ix++) {
    for (let iy = 0; iy < ny - 1; iy++) {
      for (let iz = 0; iz < nz - 1; iz++) {
        // Get 8 corner values
        const v000 = field[ix + iy * nx + iz * nx * ny];
        const v100 = field[(ix + 1) + iy * nx + iz * nx * ny];
        const v010 = field[ix + (iy + 1) * nx + iz * nx * ny];
        const v110 = field[(ix + 1) + (iy + 1) * nx + iz * nx * ny];
        const v001 = field[ix + iy * nx + (iz + 1) * nx * ny];
        const v101 = field[(ix + 1) + iy * nx + (iz + 1) * nx * ny];
        const v011 = field[ix + (iy + 1) * nx + (iz + 1) * nx * ny];
        const v111 = field[(ix + 1) + (iy + 1) * nx + (iz + 1) * nx * ny];

        // Compute cube index
        let cubeIndex = 0;
        if (v000 >= threshold) cubeIndex |= 1;
        if (v100 >= threshold) cubeIndex |= 2;
        if (v110 >= threshold) cubeIndex |= 4;
        if (v010 >= threshold) cubeIndex |= 8;
        if (v001 >= threshold) cubeIndex |= 16;
        if (v101 >= threshold) cubeIndex |= 32;
        if (v111 >= threshold) cubeIndex |= 64;
        if (v011 >= threshold) cubeIndex |= 128;

        // Skip if entirely inside or outside
        if (cubeIndex === 0 || cubeIndex === 255) continue;

        // World position of this cell's origin
        const wx = minX + ix * gridResolution;
        const wy = minY + iy * gridResolution;
        const wz = minZ + iz * gridResolution;

        // Simplified: place a vertex at the cell center if it crosses
        const cx = wx + gridResolution * 0.5;
        const cy = wy + gridResolution * 0.5;
        const cz = wz + gridResolution * 0.5;

        // Compute gradient for normal
        const gx = (v100 - v000 + v110 - v010 + v101 - v001 + v111 - v011) * 0.25;
        const gy = (v010 - v000 + v110 - v100 + v011 - v001 + v111 - v101) * 0.25;
        const gz = (v001 - v000 + v101 - v100 + v011 - v010 + v111 - v110) * 0.25;
        const gLen = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;

        vertices.push(cx, cy, cz);
        normals.push(-gx / gLen, -gy / gLen, -gz / gLen);
      }
    }
  }

  // Build simple triangle fan from nearby vertices (simplified)
  const indices: number[] = [];
  const vertCount = vertices.length / 3;
  for (let i = 0; i + 2 < vertCount; i += 3) {
    indices.push(i, i + 1, i + 2);
  }

  return {
    vertices: new Float32Array(vertices),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices),
    vertexCount: vertCount,
    triangleCount: indices.length / 3,
  };
}

const marchingCubesAPI = {
  marchingCubes,
};

expose(marchingCubesAPI);

export type MarchingCubesWorkerAPI = typeof marchingCubesAPI;
