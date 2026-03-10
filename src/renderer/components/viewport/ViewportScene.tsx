import React, { useRef, useMemo, useCallback, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Grid, GizmoHelper, GizmoViewport, Line, PerspectiveCamera, OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';
import { useStore, Voxel, DEFAULT_MATERIALS } from '../../store/useStore';
import { voxelEngine } from '../../engines/VoxelEngine';
import { getLatestPipelineResult } from '../../pipeline/VoxelToNURBS';

/* ============================================================
   Voxel Rendering (InstancedMesh)
   ============================================================ */
function VoxelInstances() {
  const voxels = useStore(s => s.voxels);
  const selectedIds = useStore(s => s.selectedVoxelIds);
  const viewMode = useStore(s => s.viewMode);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    if (!meshRef.current || voxels.length === 0) return;
    const mesh = meshRef.current;
    voxels.forEach((v, i) => {
      dummy.position.set(v.pos.x, v.pos.y, v.pos.z);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      // Color: support points = cyan, has external load = magenta, selected = white, else normal
      let color = v.color;
      if (v.isSupport) color = '#00ffff';
      else if (v.externalLoad && (v.externalLoad.x !== 0 || v.externalLoad.y !== 0 || v.externalLoad.z !== 0)) color = '#ff00ff';
      if (selectedIds.includes(v.id)) color = '#ffffff';
      mesh.setColorAt(i, new THREE.Color(color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [voxels, selectedIds, dummy]);

  if (voxels.length === 0) return null;
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, Math.max(voxels.length, 1)]} castShadow receiveShadow>
      <boxGeometry args={[0.95, 0.95, 0.95]} />
      {viewMode === 'wireframe'
        ? <meshBasicMaterial wireframe color="#555577" />
        : <meshStandardMaterial roughness={0.6} metalness={0.1} vertexColors />}
    </instancedMesh>
  );
}

/* ============================================================
   FEA Stress Overlay (LineSegments)
   ============================================================ */
function StressOverlay() {
  const feaResult = useStore(s => s.loadAnalysis.result);
  const showOverlay = useStore(s => s.loadAnalysis.showStressOverlay);
  const lineRef = useRef<THREE.LineSegments>(null);

  const geometry = useMemo(() => {
    if (!feaResult || !showOverlay || feaResult.edges.length === 0) return null;

    const positions: number[] = [];
    const colors: number[] = [];

    for (const edge of feaResult.edges) {
      // Offset slightly so lines are visible above voxel surfaces
      positions.push(edge.nodeA.x, edge.nodeA.y, edge.nodeA.z);
      positions.push(edge.nodeB.x, edge.nodeB.y, edge.nodeB.z);

      // Color gradient: green (0) → yellow (0.5) → red (1.0+)
      const ratio = Math.min(edge.stressRatio, 1.5);
      let r: number, g: number, b: number;
      if (ratio <= 0.5) {
        // Green to Yellow
        const t = ratio / 0.5;
        r = t;
        g = 1.0;
        b = 0;
      } else {
        // Yellow to Red
        const t = Math.min((ratio - 0.5) / 0.5, 1.0);
        r = 1.0;
        g = 1.0 - t;
        b = 0;
      }

      colors.push(r, g, b);
      colors.push(r, g, b);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return geo;
  }, [feaResult, showOverlay]);

  if (!geometry) return null;

  return (
    <lineSegments ref={lineRef} geometry={geometry}>
      <lineBasicMaterial vertexColors linewidth={2} transparent opacity={0.9} depthTest={false} />
    </lineSegments>
  );
}

/* ============================================================
   NURBS / Pipeline Result Visualization
   ============================================================ */
function PipelineResultViz() {
  const pipeline = useStore(s => s.pipeline);
  const [meshGeo, setMeshGeo] = useState<THREE.BufferGeometry | null>(null);
  const [nurbsGeo, setNurbsGeo] = useState<THREE.BufferGeometry | null>(null);
  const [featureLines, setFeatureLines] = useState<{ a: number[]; b: number[] }[]>([]);

  useEffect(() => {
    if (pipeline.status !== 'done') {
      setMeshGeo(null);
      setNurbsGeo(null);
      setFeatureLines([]);
      return;
    }

    const result = getLatestPipelineResult();
    if (!result) return;

    // Show simplified mesh if available
    const mesh = result.simplifiedMesh || result.mesh;
    if (mesh && mesh.positions.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions, 3));
      if (mesh.normals.length > 0) {
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.normals, 3));
      }
      if (mesh.indices.length > 0) {
        geo.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
      }
      geo.computeVertexNormals();
      setMeshGeo(geo);
      if (mesh.featureEdges) setFeatureLines(mesh.featureEdges);
    }

    // Tessellate NURBS surface using verb if available
    if (result.verbSurfaces && result.verbSurfaces.length > 0) {
      try {
        const tess = result.verbSurfaces[0].tessellate();
        if (tess && tess.points && tess.faces) {
          const geo = new THREE.BufferGeometry();
          const positions: number[] = [];
          const indices: number[] = [];
          tess.points.forEach((p: number[]) => positions.push(p[0], p[1], p[2]));
          tess.faces.forEach((f: number[]) => indices.push(f[0], f[1], f[2]));
          geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
          geo.setIndex(indices);
          geo.computeVertexNormals();
          setNurbsGeo(geo);
        }
      } catch (e) {
        console.warn('NURBS tessellation failed:', e);
      }
    }

    // Fallback: show control points as NURBS visualization
    if (!nurbsGeo && result.surfaces.length > 0) {
      const s = result.surfaces[0];
      const pts: number[] = [];
      const idx: number[] = [];
      let vi = 0;
      for (let i = 0; i < s.controlPoints.length; i++) {
        for (let j = 0; j < s.controlPoints[i].length; j++) {
          const p = s.controlPoints[i][j];
          pts.push(p.x, p.y, p.z);
          // Create quad faces between adjacent control points
          if (i > 0 && j > 0) {
            const cols = s.controlPoints[0].length;
            const a = i * cols + j;
            const b = (i - 1) * cols + j;
            const c = (i - 1) * cols + (j - 1);
            const d = i * cols + (j - 1);
            idx.push(a, b, c, a, c, d);
          }
          vi++;
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      if (idx.length > 0) geo.setIndex(idx);
      geo.computeVertexNormals();
      setNurbsGeo(geo);
    }
  }, [pipeline.status, pipeline.result]);

  return (
    <group>
      {/* Isosurface mesh (semi-transparent blue) */}
      {meshGeo && (
        <mesh geometry={meshGeo}>
          <meshStandardMaterial color="#4a90d9" transparent opacity={0.3} side={THREE.DoubleSide} wireframe={false} />
        </mesh>
      )}

      {/* NURBS surface (purple) */}
      {nurbsGeo && (
        <mesh geometry={nurbsGeo}>
          <meshStandardMaterial color="#a78bfa" transparent opacity={0.6} side={THREE.DoubleSide} metalness={0.2} roughness={0.4} />
        </mesh>
      )}

      {/* Feature edges (bright yellow lines) */}
      {featureLines.map((edge, i) => (
        <Line key={`fe_${i}`} points={[edge.a as [number,number,number], edge.b as [number,number,number]]} color="#ffff00" lineWidth={3} />
      ))}

      {/* NURBS control points */}
      {pipeline.status === 'done' && pipeline.result?.map((s, si) =>
        s.controlPoints.map((row, ri) =>
          row.map((cp, ci) => (
            <mesh key={`cp_${si}_${ri}_${ci}`} position={[cp.x, cp.y, cp.z]}>
              <sphereGeometry args={[0.1, 6, 6]} />
              <meshBasicMaterial color="#a78bfa" />
            </mesh>
          ))
        )
      )}
    </group>
  );
}

/* ============================================================
   First Person Controls (PointerLock + WASD)
   ============================================================ */
function FirstPersonControls() {
  const fpMode = useStore(s => s.fpMode);
  const setFpMode = useStore(s => s.setFpMode);
  const { camera, gl } = useThree();
  const velocity = useRef(new THREE.Vector3());
  const direction = useRef(new THREE.Vector3());
  const euler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));
  const keys = useRef<Set<string>>(new Set());
  const isLocked = useRef(false);

  const SPEED = 8;
  const FAST_SPEED = 24;
  const MOUSE_SENSITIVITY = 0.002;

  useEffect(() => {
    if (!fpMode) return;

    const canvas = gl.domElement;

    const onPointerLockChange = () => {
      isLocked.current = document.pointerLockElement === canvas;
      if (!isLocked.current) {
        setFpMode(false);
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isLocked.current) return;
      euler.current.setFromQuaternion(camera.quaternion);
      euler.current.y -= e.movementX * MOUSE_SENSITIVITY;
      euler.current.x -= e.movementY * MOUSE_SENSITIVITY;
      euler.current.x = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, euler.current.x));
      camera.quaternion.setFromEuler(euler.current);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      keys.current.add(e.code.toLowerCase());
      if (e.code === 'Escape') {
        document.exitPointerLock();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keys.current.delete(e.code.toLowerCase());
    };

    // Request pointer lock
    canvas.requestPointerLock();

    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    return () => {
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      if (document.pointerLockElement === canvas) {
        document.exitPointerLock();
      }
      keys.current.clear();
    };
  }, [fpMode, camera, gl, setFpMode]);

  useFrame((_, delta) => {
    if (!fpMode || !isLocked.current) return;

    const speed = keys.current.has('shiftleft') || keys.current.has('shiftright') ? FAST_SPEED : SPEED;
    direction.current.set(0, 0, 0);

    // Forward/Backward (W/S)
    if (keys.current.has('keyw')) direction.current.z -= 1;
    if (keys.current.has('keys')) direction.current.z += 1;
    // Left/Right (A/D)
    if (keys.current.has('keya')) direction.current.x -= 1;
    if (keys.current.has('keyd')) direction.current.x += 1;
    // Up/Down (Space/Ctrl)
    if (keys.current.has('space')) direction.current.y += 1;
    if (keys.current.has('controlleft') || keys.current.has('controlright')) direction.current.y -= 1;

    if (direction.current.length() > 0) {
      direction.current.normalize();

      // Get camera forward and right vectors (ignoring Y for horizontal movement)
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);

      // Horizontal movement
      const horizontalForward = new THREE.Vector3(forward.x, 0, forward.z).normalize();
      const horizontalRight = new THREE.Vector3(right.x, 0, right.z).normalize();

      velocity.current.set(0, 0, 0);
      velocity.current.addScaledVector(horizontalForward, -direction.current.z * speed * delta);
      velocity.current.addScaledVector(horizontalRight, direction.current.x * speed * delta);
      velocity.current.y += direction.current.y * speed * delta;

      camera.position.add(velocity.current);
    }
  });

  return null;
}

/* ============================================================
   Performance Monitor
   ============================================================ */
function PerfMonitor() {
  const updatePerf = useStore(s => s.updatePerformance);
  const voxels = useStore(s => s.voxels);
  const fc = useRef(0);
  const lt = useRef(performance.now());
  const { gl } = useThree();

  useFrame(() => {
    fc.current++;
    const now = performance.now();
    if (now - lt.current >= 1000) {
      const info = gl.info;
      updatePerf(
        Math.round(fc.current * 1000 / (now - lt.current)),
        Math.round(((performance as any).memory?.usedJSHeapSize || 0) / 1048576),
        info.render?.triangles || voxels.length * 12,
        info.render?.calls || 0
      );
      fc.current = 0;
      lt.current = now;
    }
  });
  return null;
}

/* ============================================================
   Click Handler (voxel placement, support/load setting)
   ============================================================ */
function ClickHandler() {
  const tool = useStore(s => s.activeTool);
  const layerId = useStore(s => s.activeLayerId);
  const color = useStore(s => s.paintColor);
  const bSize = useStore(s => s.brushSize);
  const bShape = useStore(s => s.brushShape);
  const activeVoxelMaterial = useStore(s => s.activeVoxelMaterial);
  const addVoxel = useStore(s => s.addVoxel);
  const removeVoxel = useStore(s => s.removeVoxel);
  const toggleVoxelSupport = useStore(s => s.toggleVoxelSupport);
  const setVoxelExternalLoad = useStore(s => s.setVoxelExternalLoad);
  const selectVoxels = useStore(s => s.selectVoxels);
  const voxels = useStore(s => s.voxels);
  const addLog = useStore(s => s.addLog);

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (!e.point) return;
    const pos = { x: Math.round(e.point.x), y: Math.round(e.point.y), z: Math.round(e.point.z) };

    // Find clicked voxel
    const clickedVoxel = voxels.find(v =>
      Math.abs(v.pos.x - pos.x) < 0.6 && Math.abs(v.pos.y - pos.y) < 0.6 && Math.abs(v.pos.z - pos.z) < 0.6
    );

    if (tool === 'select' && clickedVoxel) {
      selectVoxels([clickedVoxel.id]);
    } else if (tool === 'place') {
      const n = e.face?.normal;
      const pp = n ? { x: pos.x + Math.round(n.x), y: pos.y + Math.round(n.y), z: pos.z + Math.round(n.z) } : { ...pos, y: pos.y + 1 };
      const mat = DEFAULT_MATERIALS[activeVoxelMaterial] || DEFAULT_MATERIALS.concrete;
      const v: Voxel = {
        id: `v_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
        pos: pp, color, layerId, material: { ...mat }, isSupport: false,
      };
      addVoxel(v);
      voxelEngine.addVoxel(v);
      addLog('info', 'Voxel', `放置 (${pp.x},${pp.y},${pp.z}) [${activeVoxelMaterial}]`);
    } else if (tool === 'erase' && clickedVoxel) {
      removeVoxel(clickedVoxel.id);
      voxelEngine.removeVoxel(clickedVoxel.pos);
      addLog('info', 'Voxel', `刪除 (${pos.x},${pos.y},${pos.z})`);
    } else if (tool === 'brush') {
      const placed = voxelEngine.brushPlace(pos, bSize, bShape, color, layerId);
      placed.forEach(v => addVoxel(v));
      addLog('info', 'Brush', `刷入 ${placed.length} 個體素`);
    } else if (tool === 'set-support' && clickedVoxel) {
      toggleVoxelSupport(clickedVoxel.id);
      addLog('info', 'FEA', `${clickedVoxel.isSupport ? '取消' : '設定'}支撐點 (${pos.x},${pos.y},${pos.z})`);
    } else if (tool === 'set-load' && clickedVoxel) {
      // Toggle a default downward load
      const hasLoad = clickedVoxel.externalLoad && (clickedVoxel.externalLoad.x !== 0 || clickedVoxel.externalLoad.y !== 0 || clickedVoxel.externalLoad.z !== 0);
      if (hasLoad) {
        setVoxelExternalLoad(clickedVoxel.id, undefined);
        addLog('info', 'FEA', `移除外部負載 (${pos.x},${pos.y},${pos.z})`);
      } else {
        setVoxelExternalLoad(clickedVoxel.id, { x: 0, y: -50000, z: 0 });
        addLog('info', 'FEA', `施加外部負載 (${pos.x},${pos.y},${pos.z}) [0, -50000, 0] N`);
      }
    }
  }, [tool, color, layerId, bSize, bShape, activeVoxelMaterial, addVoxel, removeVoxel, addLog, voxels, toggleVoxelSupport, setVoxelExternalLoad, selectVoxels]);

  return (
    <mesh visible={false} onClick={handleClick} position={[0, -0.5, 0]}>
      <boxGeometry args={[200, 0.01, 200]} />
      <meshBasicMaterial transparent opacity={0} />
    </mesh>
  );
}

/* ============================================================
   Main Scene Export
   ============================================================ */
export function ViewportScene({ label }: { label?: string }) {
  const showGrid = useStore(s => s.showGrid);
  const showAxes = useStore(s => s.showAxes);
  const camType = useStore(s => s.cameraType);
  const fpMode = useStore(s => s.fpMode);
  const setFpMode = useStore(s => s.setFpMode);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* First person mode hint */}
      {!fpMode && (
        <div
          style={{
            position: 'absolute', top: 8, left: 8, zIndex: 10,
            padding: '4px 10px', borderRadius: 4,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.05)',
            fontSize: 10, color: '#9ca3b4', cursor: 'pointer',
            userSelect: 'none',
          }}
          onClick={() => setFpMode(true)}
        >
          點擊進入第一人稱模式 (WASD 移動 / 滑鼠視角 / Shift 加速 / Esc 退出)
        </div>
      )}
      {fpMode && (
        <div
          style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            zIndex: 10, pointerEvents: 'none',
            fontSize: 24, color: 'rgba(255,255,255,0.3)', fontWeight: 'bold',
          }}
        >
          +
        </div>
      )}
      <Canvas
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        style={{ background: '#0a0a0f' }}
        shadows
      >
        {camType === 'perspective'
          ? <PerspectiveCamera makeDefault position={[15, 12, 15]} fov={50} />
          : <OrthographicCamera makeDefault position={[15, 12, 15]} zoom={20} />}

        <ambientLight intensity={0.3} />
        <directionalLight position={[10, 20, 10]} intensity={0.8} castShadow />
        <directionalLight position={[-5, 10, -5]} intensity={0.3} />
        <hemisphereLight args={['#1a1a2e', '#0a0a0f', 0.4]} />

        {showGrid && (
          <Grid
            args={[100, 100]} cellSize={1} cellThickness={0.5} cellColor="#1a1a2e"
            sectionSize={5} sectionThickness={1} sectionColor="#252540"
            fadeDistance={80} infiniteGrid
          />
        )}
        {showAxes && (
          <group>
            <Line points={[[0,0,0],[10,0,0]]} color="#ff4757" lineWidth={2} />
            <Line points={[[0,0,0],[0,10,0]]} color="#3dd68c" lineWidth={2} />
            <Line points={[[0,0,0],[0,0,10]]} color="#638cff" lineWidth={2} />
          </group>
        )}

        <VoxelInstances />
        <StressOverlay />
        <PipelineResultViz />
        <ClickHandler />

        {/* Controls: OrbitControls when not in FP mode */}
        {!fpMode && <OrbitControls makeDefault enableDamping dampingFactor={0.1} />}
        <FirstPersonControls />

        <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
          <GizmoViewport labelColor="white" axisHeadScale={0.8} />
        </GizmoHelper>
        <PerfMonitor />
        <fog attach="fog" args={['#0a0a0f', 60, 120]} />
      </Canvas>
    </div>
  );
}
