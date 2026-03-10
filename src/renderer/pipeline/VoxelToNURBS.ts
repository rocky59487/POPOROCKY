/**
 * VoxelToNURBS Pipeline - 四階段管線
 *
 * Stage 1: 體素 → 等值面網格 (Marching Cubes)
 * Stage 2: 網格簡化 + 特徵線辨識 (Quadric Error Metrics)
 * Stage 3: NURBS 曲面擬合 (verb-nurbs-web)
 * Stage 4: 匯出 (.obj / .3dm)
 */

import eventBus from '../engines/EventBus';
import { Vec3, Voxel, NURBSSurface, PipelineState } from '../store/useStore';

/* ============================================================
   Types
   ============================================================ */
export interface MeshData {
  positions: Float32Array;  // [x,y,z, x,y,z, ...]
  normals: Float32Array;
  indices: Uint32Array;
  featureEdges: { a: number[]; b: number[] }[];
}

export interface PipelineResult {
  mesh?: MeshData;
  simplifiedMesh?: MeshData;
  surfaces: NURBSSurface[];
  verbSurfaces?: any[];  // verb.geom.NurbsSurface objects for tessellation
}

type StageCallback = (stage: number, status: 'running'|'done'|'error', progress: number) => void;
type LogCallback = (level: 'info'|'success'|'warning'|'error', src: string, msg: string) => void;

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

/* ============================================================
   Stage 1: Marching Cubes - Voxels to Isosurface Mesh
   ============================================================ */

// Build a 3D scalar field from voxel positions
function buildScalarField(voxels: Voxel[], padding: number = 2): {
  field: Float32Array; sizeX: number; sizeY: number; sizeZ: number;
  originX: number; originY: number; originZ: number;
} {
  if (voxels.length === 0) {
    return { field: new Float32Array(0), sizeX: 0, sizeY: 0, sizeZ: 0, originX: 0, originY: 0, originZ: 0 };
  }

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  const voxelSet = new Set<string>();

  for (const v of voxels) {
    minX = Math.min(minX, v.pos.x); minY = Math.min(minY, v.pos.y); minZ = Math.min(minZ, v.pos.z);
    maxX = Math.max(maxX, v.pos.x); maxY = Math.max(maxY, v.pos.y); maxZ = Math.max(maxZ, v.pos.z);
    voxelSet.add(`${v.pos.x},${v.pos.y},${v.pos.z}`);
  }

  const ox = minX - padding, oy = minY - padding, oz = minZ - padding;
  const sx = (maxX - minX) + 1 + padding * 2;
  const sy = (maxY - minY) + 1 + padding * 2;
  const sz = (maxZ - minZ) + 1 + padding * 2;

  const field = new Float32Array(sx * sy * sz);

  // Fill field: 1.0 inside voxels, 0.0 outside, with distance-based falloff
  for (let z = 0; z < sz; z++) {
    for (let y = 0; y < sy; y++) {
      for (let x = 0; x < sx; x++) {
        const wx = ox + x, wy = oy + y, wz = oz + z;
        if (voxelSet.has(`${wx},${wy},${wz}`)) {
          field[z * sy * sx + y * sx + x] = 1.0;
        } else {
          // Distance falloff for smooth surface
          let minDist = Infinity;
          for (const v of voxels) {
            const dx = wx - v.pos.x, dy = wy - v.pos.y, dz = wz - v.pos.z;
            const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (d < minDist) minDist = d;
          }
          field[z * sy * sx + y * sx + x] = Math.max(0, 1.0 - minDist * 0.7);
        }
      }
    }
  }

  return { field, sizeX: sx, sizeY: sy, sizeZ: sz, originX: ox, originY: oy, originZ: oz };
}

// Marching Cubes implementation
function marchingCubes(
  field: Float32Array, sx: number, sy: number, sz: number,
  ox: number, oy: number, oz: number, isoLevel: number,
  onProgress: (p: number) => void
): { positions: number[]; normals: number[]; indices: number[] } {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const vertexCache = new Map<string, number>();

  function getField(x: number, y: number, z: number): number {
    if (x < 0 || x >= sx || y < 0 || y >= sy || z < 0 || z >= sz) return 0;
    return field[z * sy * sx + y * sx + x];
  }

  function getNormal(x: number, y: number, z: number): [number, number, number] {
    const nx = getField(x - 1, y, z) - getField(x + 1, y, z);
    const ny = getField(x, y - 1, z) - getField(x, y + 1, z);
    const nz = getField(x, y, z - 1) - getField(x, y, z + 1);
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    return [nx / len, ny / len, nz / len];
  }

  function interpolateVertex(
    x1: number, y1: number, z1: number, v1: number,
    x2: number, y2: number, z2: number, v2: number
  ): [number, number, number] {
    if (Math.abs(isoLevel - v1) < 1e-6) return [x1, y1, z1];
    if (Math.abs(isoLevel - v2) < 1e-6) return [x2, y2, z2];
    if (Math.abs(v1 - v2) < 1e-6) return [x1, y1, z1];
    const t = (isoLevel - v1) / (v2 - v1);
    return [x1 + t * (x2 - x1), y1 + t * (y2 - y1), z1 + t * (z2 - z1)];
  }

  function addVertex(px: number, py: number, pz: number, nx: number, ny: number, nz: number): number {
    const key = `${px.toFixed(4)},${py.toFixed(4)},${pz.toFixed(4)}`;
    if (vertexCache.has(key)) return vertexCache.get(key)!;
    const idx = positions.length / 3;
    positions.push(px + ox, py + oy, pz + oz);
    normals.push(nx, ny, nz);
    vertexCache.set(key, idx);
    return idx;
  }

  // Corner offsets for a cube
  const cornerOffsets: [number, number, number][] = [
    [0,0,0],[1,0,0],[1,1,0],[0,1,0],
    [0,0,1],[1,0,1],[1,1,1],[0,1,1]
  ];

  // Edge connections (which two corners each edge connects)
  const edgeConnections: [number, number][] = [
    [0,1],[1,2],[2,3],[3,0],
    [4,5],[5,6],[6,7],[7,4],
    [0,4],[1,5],[2,6],[3,7]
  ];

  // Triangulation table (simplified - using standard MC lookup)
  // For brevity, we use a procedural approach
  const totalCubes = (sx - 1) * (sy - 1) * (sz - 1);
  let processedCubes = 0;

  for (let z = 0; z < sz - 1; z++) {
    for (let y = 0; y < sy - 1; y++) {
      for (let x = 0; x < sx - 1; x++) {
        // Get corner values
        const cornerValues: number[] = [];
        const cornerPositions: [number, number, number][] = [];
        for (const [dx, dy, dz] of cornerOffsets) {
          cornerValues.push(getField(x + dx, y + dy, z + dz));
          cornerPositions.push([x + dx, y + dy, z + dz]);
        }

        // Determine cube index
        let cubeIndex = 0;
        for (let i = 0; i < 8; i++) {
          if (cornerValues[i] >= isoLevel) cubeIndex |= (1 << i);
        }

        if (cubeIndex === 0 || cubeIndex === 255) {
          processedCubes++;
          continue;
        }

        // Compute edge vertices
        const edgeVertices: ([number, number, number] | null)[] = new Array(12).fill(null);
        for (let e = 0; e < 12; e++) {
          const [c1, c2] = edgeConnections[e];
          if ((cubeIndex & (1 << c1)) !== (cubeIndex & (1 << c2))) {
            edgeVertices[e] = interpolateVertex(
              cornerPositions[c1][0], cornerPositions[c1][1], cornerPositions[c1][2], cornerValues[c1],
              cornerPositions[c2][0], cornerPositions[c2][1], cornerPositions[c2][2], cornerValues[c2]
            );
          }
        }

        // Generate triangles using a simple approach
        // Find all edges that have vertices and create triangle fan
        const activeEdges: number[] = [];
        for (let e = 0; e < 12; e++) {
          if (edgeVertices[e]) activeEdges.push(e);
        }

        if (activeEdges.length >= 3) {
          for (let i = 1; i < activeEdges.length - 1; i++) {
            const v0 = edgeVertices[activeEdges[0]]!;
            const v1 = edgeVertices[activeEdges[i]]!;
            const v2 = edgeVertices[activeEdges[i + 1]]!;

            const n0 = getNormal(Math.round(v0[0]), Math.round(v0[1]), Math.round(v0[2]));
            const n1 = getNormal(Math.round(v1[0]), Math.round(v1[1]), Math.round(v1[2]));
            const n2 = getNormal(Math.round(v2[0]), Math.round(v2[1]), Math.round(v2[2]));

            const i0 = addVertex(v0[0], v0[1], v0[2], n0[0], n0[1], n0[2]);
            const i1 = addVertex(v1[0], v1[1], v1[2], n1[0], n1[1], n1[2]);
            const i2 = addVertex(v2[0], v2[1], v2[2], n2[0], n2[1], n2[2]);

            indices.push(i0, i1, i2);
          }
        }

        processedCubes++;
        if (processedCubes % Math.max(1, Math.floor(totalCubes / 20)) === 0) {
          onProgress((processedCubes / totalCubes) * 100);
        }
      }
    }
  }

  return { positions, normals, indices };
}

/* ============================================================
   Stage 2: Mesh Simplification (QEM) + Feature Edge Detection
   ============================================================ */

interface QEMVertex {
  pos: [number, number, number];
  Q: number[][]; // 4x4 quadric matrix
  collapsed: boolean;
  neighbors: Set<number>;
}

function computeFaceNormal(
  v0: [number, number, number], v1: [number, number, number], v2: [number, number, number]
): [number, number, number, number] {
  const e1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
  const e2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
  const n = [
    e1[1] * e2[2] - e1[2] * e2[1],
    e1[2] * e2[0] - e1[0] * e2[2],
    e1[0] * e2[1] - e1[1] * e2[0]
  ];
  const len = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]) || 1;
  n[0] /= len; n[1] /= len; n[2] /= len;
  const d = -(n[0] * v0[0] + n[1] * v0[1] + n[2] * v0[2]);
  return [n[0], n[1], n[2], d];
}

function planeQuadric(p: [number, number, number, number]): number[][] {
  const [a, b, c, d] = p;
  return [
    [a*a, a*b, a*c, a*d],
    [a*b, b*b, b*c, b*d],
    [a*c, b*c, c*c, c*d],
    [a*d, b*d, c*d, d*d]
  ];
}

function addMatrix(A: number[][], B: number[][]): number[][] {
  return A.map((row, i) => row.map((v, j) => v + B[i][j]));
}

function zeroMatrix(): number[][] {
  return [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
}

function qemError(Q: number[][], v: [number, number, number]): number {
  const [x, y, z] = v;
  return Q[0][0]*x*x + 2*Q[0][1]*x*y + 2*Q[0][2]*x*z + 2*Q[0][3]*x
       + Q[1][1]*y*y + 2*Q[1][2]*y*z + 2*Q[1][3]*y
       + Q[2][2]*z*z + 2*Q[2][3]*z + Q[3][3];
}

function simplifyMesh(
  positions: number[], normals: number[], indices: number[],
  targetRatio: number, featureAngleDeg: number,
  onProgress: (p: number) => void
): MeshData {
  const numVerts = positions.length / 3;
  const numFaces = indices.length / 3;
  const targetFaces = Math.max(4, Math.floor(numFaces * targetRatio));

  // Build QEM vertices
  const vertices: QEMVertex[] = [];
  for (let i = 0; i < numVerts; i++) {
    vertices.push({
      pos: [positions[i*3], positions[i*3+1], positions[i*3+2]],
      Q: zeroMatrix(),
      collapsed: false,
      neighbors: new Set()
    });
  }

  // Build face list and compute quadrics
  const faceNormals: [number, number, number][] = [];
  const faceIndices: [number, number, number][] = [];

  for (let f = 0; f < numFaces; f++) {
    const i0 = indices[f*3], i1 = indices[f*3+1], i2 = indices[f*3+2];
    if (i0 >= numVerts || i1 >= numVerts || i2 >= numVerts) continue;

    faceIndices.push([i0, i1, i2]);
    const plane = computeFaceNormal(vertices[i0].pos, vertices[i1].pos, vertices[i2].pos);
    faceNormals.push([plane[0], plane[1], plane[2]]);
    const Q = planeQuadric(plane);

    vertices[i0].Q = addMatrix(vertices[i0].Q, Q);
    vertices[i1].Q = addMatrix(vertices[i1].Q, Q);
    vertices[i2].Q = addMatrix(vertices[i2].Q, Q);

    vertices[i0].neighbors.add(i1); vertices[i0].neighbors.add(i2);
    vertices[i1].neighbors.add(i0); vertices[i1].neighbors.add(i2);
    vertices[i2].neighbors.add(i0); vertices[i2].neighbors.add(i1);
  }

  // Feature edge detection
  const featureEdges: { a: number[]; b: number[] }[] = [];
  const featureAngleRad = featureAngleDeg * Math.PI / 180;
  const edgeFaces = new Map<string, number[]>();

  faceIndices.forEach((face, fi) => {
    for (let e = 0; e < 3; e++) {
      const a = face[e], b = face[(e + 1) % 3];
      const key = Math.min(a, b) + '-' + Math.max(a, b);
      if (!edgeFaces.has(key)) edgeFaces.set(key, []);
      edgeFaces.get(key)!.push(fi);
    }
  });

  edgeFaces.forEach((faces, key) => {
    if (faces.length === 2) {
      const n1 = faceNormals[faces[0]], n2 = faceNormals[faces[1]];
      if (n1 && n2) {
        const dot = n1[0]*n2[0] + n1[1]*n2[1] + n1[2]*n2[2];
        const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
        if (angle > featureAngleRad) {
          const [aIdx, bIdx] = key.split('-').map(Number);
          featureEdges.push({
            a: [vertices[aIdx].pos[0], vertices[aIdx].pos[1], vertices[aIdx].pos[2]],
            b: [vertices[bIdx].pos[0], vertices[bIdx].pos[1], vertices[bIdx].pos[2]]
          });
        }
      }
    }
  });

  // Greedy edge collapse (simplified QEM)
  let currentFaces = faceIndices.length;
  const collapseIterations = currentFaces - targetFaces;
  let collapsed = 0;

  // Build edge collapse candidates
  type CollapseCandidate = { edge: string; cost: number; target: [number, number, number] };
  const candidates: CollapseCandidate[] = [];

  edgeFaces.forEach((_, key) => {
    const [aIdx, bIdx] = key.split('-').map(Number);
    if (aIdx >= numVerts || bIdx >= numVerts) return;
    const midpoint: [number, number, number] = [
      (vertices[aIdx].pos[0] + vertices[bIdx].pos[0]) / 2,
      (vertices[aIdx].pos[1] + vertices[bIdx].pos[1]) / 2,
      (vertices[aIdx].pos[2] + vertices[bIdx].pos[2]) / 2
    ];
    const Q = addMatrix(vertices[aIdx].Q, vertices[bIdx].Q);
    const cost = Math.abs(qemError(Q, midpoint));
    candidates.push({ edge: key, cost, target: midpoint });
  });

  candidates.sort((a, b) => a.cost - b.cost);

  // Perform collapses
  for (const cand of candidates) {
    if (collapsed >= collapseIterations) break;
    const [aIdx, bIdx] = cand.edge.split('-').map(Number);
    if (vertices[aIdx].collapsed || vertices[bIdx].collapsed) continue;

    // Collapse bIdx into aIdx
    vertices[aIdx].pos = cand.target;
    vertices[aIdx].Q = addMatrix(vertices[aIdx].Q, vertices[bIdx].Q);
    vertices[bIdx].collapsed = true;

    // Update neighbor references
    vertices[bIdx].neighbors.forEach(n => {
      if (n !== aIdx && !vertices[n].collapsed) {
        vertices[n].neighbors.delete(bIdx);
        vertices[n].neighbors.add(aIdx);
        vertices[aIdx].neighbors.add(n);
      }
    });

    collapsed++;
    if (collapsed % Math.max(1, Math.floor(collapseIterations / 20)) === 0) {
      onProgress((collapsed / Math.max(1, collapseIterations)) * 100);
    }
  }

  // Rebuild mesh from remaining vertices
  const newIndexMap = new Map<number, number>();
  const newPositions: number[] = [];
  const newNormals: number[] = [];
  let newIdx = 0;

  for (let i = 0; i < numVerts; i++) {
    if (!vertices[i].collapsed) {
      newIndexMap.set(i, newIdx);
      newPositions.push(vertices[i].pos[0], vertices[i].pos[1], vertices[i].pos[2]);
      newNormals.push(normals[i*3] || 0, normals[i*3+1] || 0, normals[i*3+2] || 1);
      newIdx++;
    }
  }

  // Remap collapsed vertices
  for (let i = 0; i < numVerts; i++) {
    if (vertices[i].collapsed && !newIndexMap.has(i)) {
      // Find the vertex this was collapsed into
      for (const n of vertices[i].neighbors) {
        if (newIndexMap.has(n)) {
          newIndexMap.set(i, newIndexMap.get(n)!);
          break;
        }
      }
    }
  }

  const newIndices: number[] = [];
  for (let f = 0; f < faceIndices.length; f++) {
    const [i0, i1, i2] = faceIndices[f];
    const ni0 = newIndexMap.get(i0), ni1 = newIndexMap.get(i1), ni2 = newIndexMap.get(i2);
    if (ni0 !== undefined && ni1 !== undefined && ni2 !== undefined && ni0 !== ni1 && ni1 !== ni2 && ni0 !== ni2) {
      newIndices.push(ni0, ni1, ni2);
    }
  }

  onProgress(100);

  return {
    positions: new Float32Array(newPositions),
    normals: new Float32Array(newNormals),
    indices: new Uint32Array(newIndices),
    featureEdges
  };
}

/* ============================================================
   Stage 3: NURBS Surface Fitting (verb-nurbs-web)
   ============================================================ */

function fitNURBSSurface(
  positions: Float32Array, degreeU: number, degreeV: number,
  cpU: number, cpV: number, onProgress: (p: number) => void
): { surface: NURBSSurface; verbSurface: any } {
  // Import verb-nurbs-web
  let verb: any;
  try {
    verb = require('verb-nurbs-web');
  } catch (e) {
    // Fallback: create surface manually
    return fallbackNURBSFit(positions, degreeU, degreeV, cpU, cpV, onProgress);
  }

  onProgress(10);

  // Organize vertices into a grid for surface fitting
  const numVerts = positions.length / 3;
  const pts: [number, number, number][] = [];
  for (let i = 0; i < numVerts; i++) {
    pts.push([positions[i*3], positions[i*3+1], positions[i*3+2]]);
  }

  // Find bounding box and project onto UV grid
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const [x, y, z] of pts) {
    minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z);
  }

  onProgress(20);

  // Create control point grid by sampling from point cloud
  const rangeX = maxX - minX || 1;
  const rangeZ = maxZ - minZ || 1;

  const controlPoints: number[][][] = [];
  for (let i = 0; i < cpU; i++) {
    const row: number[][] = [];
    for (let j = 0; j < cpV; j++) {
      const u = i / (cpU - 1);
      const v = j / (cpV - 1);
      const targetX = minX + u * rangeX;
      const targetZ = minZ + v * rangeZ;

      // Find nearest points and average their Y values (weighted by distance)
      let weightedY = 0, totalWeight = 0;
      for (const [px, py, pz] of pts) {
        const dx = px - targetX, dz = pz - targetZ;
        const dist = Math.sqrt(dx * dx + dz * dz) + 0.01;
        const w = 1 / (dist * dist);
        weightedY += py * w;
        totalWeight += w;
      }
      const avgY = totalWeight > 0 ? weightedY / totalWeight : (minY + maxY) / 2;
      row.push([targetX, avgY, targetZ]);
    }
    controlPoints.push(row);
    onProgress(20 + (i / cpU) * 40);
  }

  onProgress(60);

  // Generate knot vectors
  function generateKnots(n: number, degree: number): number[] {
    const knots: number[] = [];
    for (let i = 0; i <= degree; i++) knots.push(0);
    const interior = n - degree - 1;
    for (let i = 1; i <= interior; i++) knots.push(i / (interior + 1));
    for (let i = 0; i <= degree; i++) knots.push(1);
    return knots;
  }

  const knotsU = generateKnots(cpU, degreeU);
  const knotsV = generateKnots(cpV, degreeV);

  onProgress(70);

  // Create verb NURBS surface
  let verbSurface: any = null;
  try {
    verbSurface = verb.geom.NurbsSurface.byKnotsControlPointsWeights(
      degreeU, degreeV, knotsU, knotsV, controlPoints
    );
    onProgress(90);
  } catch (e) {
    console.warn('verb NURBS creation failed, using raw control points');
  }

  const surface: NURBSSurface = {
    id: `nurbs_${Date.now()}`,
    controlPoints: controlPoints.map(row => row.map(p => ({ x: p[0], y: p[1], z: p[2] }))),
    degree: degreeU,
    knotsU,
    knotsV,
    weights: controlPoints.map(row => row.map(() => 1.0))
  };

  onProgress(100);
  return { surface, verbSurface };
}

function fallbackNURBSFit(
  positions: Float32Array, degreeU: number, degreeV: number,
  cpU: number, cpV: number, onProgress: (p: number) => void
): { surface: NURBSSurface; verbSurface: any } {
  const numVerts = positions.length / 3;
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  const pts: [number, number, number][] = [];
  for (let i = 0; i < numVerts; i++) {
    const x = positions[i*3], y = positions[i*3+1], z = positions[i*3+2];
    pts.push([x, y, z]);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }

  const rangeX = maxX - minX || 1, rangeZ = maxZ - minZ || 1;
  const cp: Vec3[][] = [];
  for (let i = 0; i < cpU; i++) {
    const row: Vec3[] = [];
    for (let j = 0; j < cpV; j++) {
      const u = i / (cpU - 1), v = j / (cpV - 1);
      const tx = minX + u * rangeX, tz = minZ + v * rangeZ;
      let wy = 0, tw = 0;
      for (const [px, py, pz] of pts) {
        const d = Math.sqrt((px - tx) ** 2 + (pz - tz) ** 2) + 0.01;
        const w = 1 / (d * d);
        wy += py * w; tw += w;
      }
      row.push({ x: tx, y: tw > 0 ? wy / tw : 0, z: tz });
    }
    cp.push(row);
    onProgress((i / cpU) * 100);
  }

  function genKnots(n: number, deg: number): number[] {
    const k: number[] = [];
    for (let i = 0; i <= deg; i++) k.push(0);
    for (let i = 1; i <= n - deg - 1; i++) k.push(i / (n - deg));
    for (let i = 0; i <= deg; i++) k.push(1);
    return k;
  }

  onProgress(100);
  return {
    surface: {
      id: `nurbs_${Date.now()}`, controlPoints: cp, degree: degreeU,
      knotsU: genKnots(cpU, degreeU), knotsV: genKnots(cpV, degreeV),
      weights: cp.map(r => r.map(() => 1.0))
    },
    verbSurface: null
  };
}

/* ============================================================
   Stage 4: Export
   ============================================================ */

export function exportToOBJ(mesh: MeshData | null, surfaces: NURBSSurface[]): string {
  let obj = '# FastDesign NURBS Export\n# Generated by VoxelToNURBS Pipeline\n\n';

  if (mesh && mesh.positions.length > 0) {
    obj += '# Mesh vertices\n';
    for (let i = 0; i < mesh.positions.length; i += 3) {
      obj += `v ${mesh.positions[i].toFixed(6)} ${mesh.positions[i+1].toFixed(6)} ${mesh.positions[i+2].toFixed(6)}\n`;
    }
    for (let i = 0; i < mesh.normals.length; i += 3) {
      obj += `vn ${mesh.normals[i].toFixed(6)} ${mesh.normals[i+1].toFixed(6)} ${mesh.normals[i+2].toFixed(6)}\n`;
    }
    obj += '\n# Faces\n';
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const a = mesh.indices[i] + 1, b = mesh.indices[i+1] + 1, c = mesh.indices[i+2] + 1;
      obj += `f ${a}//${a} ${b}//${b} ${c}//${c}\n`;
    }
  }

  // Also export NURBS control points as a separate group
  surfaces.forEach((s, si) => {
    obj += `\n# NURBS Surface ${si} control points\ng nurbs_${si}\n`;
    let vOffset = mesh ? mesh.positions.length / 3 : 0;
    s.controlPoints.forEach(row => row.forEach(p => {
      obj += `v ${p.x.toFixed(6)} ${p.y.toFixed(6)} ${p.z.toFixed(6)}\n`;
    }));
  });

  return obj;
}

export function exportTo3DM(surfaces: NURBSSurface[]): Promise<ArrayBuffer | null> {
  return new Promise(async (resolve) => {
    try {
      const rhino3dm = require('rhino3dm');
      const rhino = await rhino3dm();

      const file = new rhino.File3dm();

      surfaces.forEach(s => {
        const nurbsSurface = rhino.NurbsSurface.create(
          3, // dimension
          false, // isRational
          s.degree + 1, // orderU
          s.degree + 1, // orderV
          s.controlPoints.length, // countU
          s.controlPoints[0].length // countV
        );

        // Set knots
        for (let i = 0; i < s.knotsU.length - 2; i++) {
          nurbsSurface.knotsU().set(i, s.knotsU[i + 1]);
        }
        for (let i = 0; i < s.knotsV.length - 2; i++) {
          nurbsSurface.knotsV().set(i, s.knotsV[i + 1]);
        }

        // Set control points
        for (let i = 0; i < s.controlPoints.length; i++) {
          for (let j = 0; j < s.controlPoints[i].length; j++) {
            const p = s.controlPoints[i][j];
            nurbsSurface.pointAt(i, j).set(p.x, p.y, p.z);
          }
        }

        const brep = rhino.Brep.createFromSurface(nurbsSurface);
        if (brep) {
          file.objects().addBrep(brep, null);
        }
      });

      const buffer = file.toByteArray();
      resolve(buffer.buffer);
    } catch (e) {
      console.warn('rhino3dm export failed:', e);
      resolve(null);
    }
  });
}

/* ============================================================
   Main Pipeline Runner
   ============================================================ */

// Store latest pipeline result for rendering
let latestResult: PipelineResult | null = null;
export function getLatestPipelineResult(): PipelineResult | null { return latestResult; }

export async function runVoxelToNURBS(
  voxels: Voxel[],
  params: PipelineState['params'],
  onStage: StageCallback,
  addLog: LogCallback
): Promise<NURBSSurface[]> {
  if (!voxels.length) {
    addLog('warning', 'Pipeline', '沒有體素可轉換');
    return [];
  }

  const startTime = performance.now();
  addLog('info', 'Pipeline', `開始轉換 ${voxels.length} 個體素...`);
  eventBus.emit('pipeline:start', { count: voxels.length });

  latestResult = { surfaces: [] };

  // ---- Stage 1: Marching Cubes ----
  onStage(0, 'running', 0);
  addLog('info', 'Stage1', 'Marching Cubes 等值面提取...');
  await delay(100);

  const t1 = performance.now();
  const { field, sizeX, sizeY, sizeZ, originX, originY, originZ } = buildScalarField(voxels, 2);
  const isoLevel = params.qefThreshold > 0 ? params.qefThreshold : 0.5;
  const mcResult = marchingCubes(field, sizeX, sizeY, sizeZ, originX, originY, originZ, isoLevel,
    p => onStage(0, 'running', p));
  const t1End = performance.now();

  const mesh: MeshData = {
    positions: new Float32Array(mcResult.positions),
    normals: new Float32Array(mcResult.normals),
    indices: new Uint32Array(mcResult.indices),
    featureEdges: []
  };
  latestResult.mesh = mesh;

  onStage(0, 'done', 100);
  addLog('success', 'Stage1', `完成: ${mesh.positions.length/3} 頂點, ${mesh.indices.length/3} 三角面 (${(t1End-t1).toFixed(0)}ms)`);
  await delay(100);

  // ---- Stage 2: QEM Simplification ----
  onStage(1, 'running', 0);
  addLog('info', 'Stage2', 'QEM 網格簡化 + 特徵線辨識...');
  await delay(100);

  const t2 = performance.now();
  const targetRatio = Math.max(0.1, Math.min(1.0, params.pcaTolerance > 0 ? params.pcaTolerance : 0.5));
  const featureAngle = 30; // degrees
  const simplified = simplifyMesh(
    Array.from(mesh.positions), Array.from(mesh.normals), Array.from(mesh.indices),
    targetRatio, featureAngle, p => onStage(1, 'running', p)
  );
  const t2End = performance.now();

  latestResult.simplifiedMesh = simplified;

  onStage(1, 'done', 100);
  addLog('success', 'Stage2', `完成: ${simplified.positions.length/3} 頂點, ${simplified.indices.length/3} 面, ${simplified.featureEdges.length} 特徵線 (${(t2End-t2).toFixed(0)}ms)`);
  await delay(100);

  // ---- Stage 3: NURBS Fitting ----
  onStage(2, 'running', 0);
  addLog('info', 'Stage3', 'NURBS 曲面擬合 (verb-nurbs-web)...');
  await delay(100);

  const t3 = performance.now();
  const degU = Math.max(2, Math.min(5, params.nurbsDegree));
  const degV = Math.max(2, Math.min(5, params.nurbsDegree));
  const cpCount = Math.max(degU + 1, Math.min(32, params.controlPointCount));
  const { surface, verbSurface } = fitNURBSSurface(
    simplified.positions, degU, degV, cpCount, cpCount,
    p => onStage(2, 'running', p)
  );
  const t3End = performance.now();

  latestResult.surfaces = [surface];
  if (verbSurface) latestResult.verbSurfaces = [verbSurface];

  onStage(2, 'done', 100);
  addLog('success', 'Stage3', `完成: ${cpCount}x${cpCount} 控制點, degree ${degU} (${(t3End-t3).toFixed(0)}ms)`);

  // ---- Stage 4 (export) is triggered separately ----

  const totalTime = performance.now() - startTime;
  eventBus.emit('pipeline:complete', { surfaceCount: 1, totalTime });
  addLog('success', 'Pipeline', `體素→NURBS 轉換完成！總耗時 ${totalTime.toFixed(0)}ms`);

  return [surface];
}
