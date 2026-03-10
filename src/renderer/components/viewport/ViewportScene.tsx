import React, { useRef, useMemo, useCallback } from 'react';
import { Canvas, useFrame, useThree, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Grid, GizmoHelper, GizmoViewport, Line, PerspectiveCamera, OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../../store/useStore';
import { voxelEngine } from '../../engines/VoxelEngine';

function VoxelInstances() {
  const voxels = useStore(s => s.voxels);
  const selectedIds = useStore(s => s.selectedVoxelIds);
  const viewMode = useStore(s => s.viewMode);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  React.useEffect(() => {
    if (!meshRef.current || voxels.length === 0) return;
    const mesh = meshRef.current;
    voxels.forEach((v, i) => {
      dummy.position.set(v.pos.x, v.pos.y, v.pos.z);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, new THREE.Color(selectedIds.includes(v.id) ? '#ffffff' : v.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [voxels, selectedIds, dummy]);
  if (voxels.length === 0) return null;
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, Math.max(voxels.length, 1)]}>
      <boxGeometry args={[0.95, 0.95, 0.95]} />
      {viewMode === 'wireframe' ? <meshBasicMaterial wireframe /> : <meshStandardMaterial roughness={0.6} metalness={0.1} />}
    </instancedMesh>
  );
}

function NURBSViz() {
  const pipeline = useStore(s => s.pipeline);
  if (pipeline.status !== 'done' || !pipeline.result?.length) return null;
  const pts = useMemo(() => {
    const p: THREE.Vector3[] = [];
    pipeline.result!.forEach(s => s.controlPoints.forEach(row => row.forEach(cp => p.push(new THREE.Vector3(cp.x, cp.y, cp.z)))));
    return p;
  }, [pipeline.result]);
  return (<group>{pts.map((p, i) => (<mesh key={i} position={[p.x, p.y, p.z]}><sphereGeometry args={[0.15, 8, 8]} /><meshStandardMaterial color="#a78bfa" emissive="#a78bfa" emissiveIntensity={0.3} /></mesh>))}</group>);
}

function PerfMonitor() {
  const updatePerf = useStore(s => s.updatePerformance);
  const fc = useRef(0); const lt = useRef(performance.now());
  useFrame(() => {
    fc.current++;
    const now = performance.now();
    if (now - lt.current >= 1000) {
      updatePerf(Math.round(fc.current * 1000 / (now - lt.current)), Math.round(((performance as any).memory?.usedJSHeapSize || 0) / 1048576), 0, 0);
      fc.current = 0; lt.current = now;
    }
  });
  return null;
}

function ClickHandler() {
  const tool = useStore(s => s.activeTool);
  const layerId = useStore(s => s.activeLayerId);
  const color = useStore(s => s.paintColor);
  const bSize = useStore(s => s.brushSize);
  const bShape = useStore(s => s.brushShape);
  const addVoxel = useStore(s => s.addVoxel);
  const removeVoxel = useStore(s => s.removeVoxel);
  const addLog = useStore(s => s.addLog);
  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (!e.point) return;
    const pos = { x: Math.round(e.point.x), y: Math.round(e.point.y), z: Math.round(e.point.z) };
    if (tool === 'place') {
      const n = e.face?.normal;
      const pp = n ? { x: pos.x + Math.round(n.x), y: pos.y + Math.round(n.y), z: pos.z + Math.round(n.z) } : { ...pos, y: pos.y + 1 };
      const v = { id: `v_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, pos: pp, color, layerId };
      addVoxel(v); voxelEngine.addVoxel(v);
      addLog('info', 'Voxel', `放置 (${pp.x},${pp.y},${pp.z})`);
    } else if (tool === 'erase') {
      removeVoxel(`v_at_${pos.x}_${pos.y}_${pos.z}`);
      voxelEngine.removeVoxel(pos);
    } else if (tool === 'brush') {
      const placed = voxelEngine.brushPlace(pos, bSize, bShape, color, layerId);
      placed.forEach(v => addVoxel(v));
      addLog('info', 'Brush', `刷入 ${placed.length} 個體素`);
    }
  }, [tool, color, layerId, bSize, bShape, addVoxel, removeVoxel, addLog]);
  return (<mesh visible={false} onClick={handleClick} position={[0, -0.5, 0]}><boxGeometry args={[200, 0.01, 200]} /><meshBasicMaterial transparent opacity={0} /></mesh>);
}

export function ViewportScene({ label }: { label?: string }) {
  const showGrid = useStore(s => s.showGrid);
  const showAxes = useStore(s => s.showAxes);
  const camType = useStore(s => s.cameraType);
  return (
    <Canvas gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }} style={{ background: '#0a0a0f' }} shadows>
      {camType === 'perspective' ? <PerspectiveCamera makeDefault position={[15, 12, 15]} fov={50} /> : <OrthographicCamera makeDefault position={[15, 12, 15]} zoom={20} />}
      <ambientLight intensity={0.3} />
      <directionalLight position={[10, 20, 10]} intensity={0.8} castShadow />
      <directionalLight position={[-5, 10, -5]} intensity={0.3} />
      <hemisphereLight args={['#1a1a2e', '#0a0a0f', 0.4]} />
      {showGrid && <Grid args={[100, 100]} cellSize={1} cellThickness={0.5} cellColor="#1a1a2e" sectionSize={5} sectionThickness={1} sectionColor="#252540" fadeDistance={80} infiniteGrid />}
      {showAxes && <group><Line points={[[0,0,0],[10,0,0]]} color="#ff4757" lineWidth={2} /><Line points={[[0,0,0],[0,10,0]]} color="#3dd68c" lineWidth={2} /><Line points={[[0,0,0],[0,0,10]]} color="#638cff" lineWidth={2} /></group>}
      <VoxelInstances />
      <NURBSViz />
      <ClickHandler />
      <OrbitControls makeDefault enableDamping dampingFactor={0.1} />
      <GizmoHelper alignment="bottom-right" margin={[60, 60]}><GizmoViewport labelColor="white" axisHeadScale={0.8} /></GizmoHelper>
      <PerfMonitor />
      <fog attach="fog" args={['#0a0a0f', 60, 120]} />
    </Canvas>
  );
}
