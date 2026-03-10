import React, { useRef, useMemo, useCallback, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Grid, GizmoHelper, GizmoViewport, Line, PerspectiveCamera, OrthographicCamera, Environment, ContactShadows, Html } from '@react-three/drei';
import * as THREE from 'three';
import { useStore, Voxel, DEFAULT_MATERIALS } from '../../store/useStore';
import { voxelEngine } from '../../engines/VoxelEngine';
import { loadEngine, MATERIAL_PRESETS } from '../../engines/LoadEngine';
import { getLatestPipelineResult } from '../../pipeline/VoxelToNURBS';
import eventBus from '../../engines/EventBus';

/* ─── Material Color Map ─── */
const MATERIAL_COLORS: Record<string, { color: string; roughness: number; metalness: number }> = {
  concrete: { color: '#808080', roughness: 0.9, metalness: 0.0 },
  steel:    { color: '#C0C0C0', roughness: 0.2, metalness: 0.8 },
  wood:     { color: '#8B4513', roughness: 0.8, metalness: 0.0 },
  brick:    { color: '#8B3A3A', roughness: 0.85, metalness: 0.0 },
  aluminum: { color: '#d0d0e0', roughness: 0.3, metalness: 0.7 },
  glass:    { color: '#88ccee', roughness: 0.1, metalness: 0.1 },
};

/* ============================================================
   Voxel Rendering (InstancedMesh) with Material Colors
   ============================================================ */
function VoxelInstances() {
  const voxels = useStore(s => s.voxels);
  const selectedIds = useStore(s => s.selectedVoxelIds);
  const viewMode = useStore(s => s.viewMode);
  const layers = useStore(s => s.layers);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const edgesRef = useRef<THREE.LineSegments>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Filter visible voxels based on layer visibility
  const visibleVoxels = useMemo(() => {
    const visibleLayerIds = new Set(layers.filter(l => l.visible).map(l => l.id));
    return voxels.filter(v => visibleLayerIds.has(v.layerId));
  }, [voxels, layers]);

  useEffect(() => {
    if (!meshRef.current || visibleVoxels.length === 0) return;
    const mesh = meshRef.current;

    visibleVoxels.forEach((v, i) => {
      dummy.position.set(v.pos.x, v.pos.y, v.pos.z);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      // Determine color based on material or state
      let color: string;
      if (selectedIds.includes(v.id)) {
        color = '#ffffff';
      } else if (v.isSupport) {
        color = '#00e5ff'; // Cyan for support points
      } else if (v.externalLoad && (v.externalLoad.x !== 0 || v.externalLoad.y !== 0 || v.externalLoad.z !== 0)) {
        color = '#ff4081'; // Pink for load points
      } else {
        // Use material-specific color
        const matColor = MATERIAL_COLORS[v.materialId || ''];
        color = matColor ? matColor.color : v.color;
      }
      mesh.setColorAt(i, new THREE.Color(color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.count = visibleVoxels.length;
  }, [visibleVoxels, selectedIds, dummy]);

  // Wireframe edges overlay
  const edgesGeo = useMemo(() => {
    if (viewMode !== 'wireframe' || visibleVoxels.length === 0) return null;
    const positions: number[] = [];
    const box = new THREE.BoxGeometry(0.95, 0.95, 0.95);
    const edges = new THREE.EdgesGeometry(box);
    const edgePositions = edges.getAttribute('position').array;

    for (const v of visibleVoxels) {
      for (let j = 0; j < edgePositions.length; j += 3) {
        positions.push(
          edgePositions[j] + v.pos.x,
          edgePositions[j + 1] + v.pos.y,
          edgePositions[j + 2] + v.pos.z
        );
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }, [visibleVoxels, viewMode]);

  if (visibleVoxels.length === 0) return null;

  return (
    <group>
      <instancedMesh ref={meshRef} args={[undefined, undefined, Math.max(visibleVoxels.length, 1)]} castShadow receiveShadow>
        <boxGeometry args={[0.95, 0.95, 0.95]} />
        {viewMode === 'wireframe'
          ? <meshBasicMaterial wireframe color="#555577" transparent opacity={0.1} />
          : viewMode === 'rendered'
            ? <meshPhysicalMaterial roughness={0.5} metalness={0.15} vertexColors clearcoat={0.1} clearcoatRoughness={0.4} envMapIntensity={0.8} />
            : <meshStandardMaterial roughness={0.6} metalness={0.1} vertexColors />}
      </instancedMesh>
      {edgesGeo && (
        <lineSegments geometry={edgesGeo}>
          <lineBasicMaterial color="#8888aa" transparent opacity={0.6} />
        </lineSegments>
      )}
    </group>
  );
}

/* ============================================================
   FEA Stress Overlay (LineSegments) with flashing animation
   ============================================================ */
function StressOverlay() {
  const feaResult = useStore(s => s.loadAnalysis.result);
  const showOverlay = useStore(s => s.loadAnalysis.showStressOverlay);
  const lineRef = useRef<THREE.LineSegments>(null);

  const { geometry, dangerIndices } = useMemo(() => {
    if (!feaResult || !showOverlay || feaResult.edges.length === 0) return { geometry: null, dangerIndices: [] as number[] };

    const positions: number[] = [];
    const colors: number[] = [];
    const danger: number[] = [];

    for (let ei = 0; ei < feaResult.edges.length; ei++) {
      const edge = feaResult.edges[ei];
      positions.push(edge.nodeA.x, edge.nodeA.y, edge.nodeA.z);
      positions.push(edge.nodeB.x, edge.nodeB.y, edge.nodeB.z);

      const ratio = Math.min(edge.stressRatio, 1.5);
      let r: number, g: number, b: number;
      if (ratio <= 0.5) {
        const t = ratio / 0.5;
        r = t; g = 1.0; b = 0;
      } else {
        const t = Math.min((ratio - 0.5) / 0.5, 1.0);
        r = 1.0; g = 1.0 - t; b = 0;
      }
      colors.push(r, g, b, r, g, b);

      if (edge.stressRatio > 0.8) danger.push(ei);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return { geometry: geo, dangerIndices: danger };
  }, [feaResult, showOverlay]);

  // Flashing animation for danger edges
  useFrame(({ clock }) => {
    if (!geometry || !feaResult || dangerIndices.length === 0) return;
    if (!loadEngine.isFlashingEnabled()) return;

    const time = clock.getElapsedTime();
    const flash = loadEngine.updateFlashPhase(time);
    const colorAttr = geometry.getAttribute('color') as THREE.BufferAttribute;
    if (!colorAttr) return;

    for (const ei of dangerIndices) {
      const edge = feaResult.edges[ei];
      const ratio = Math.min(edge.stressRatio, 1.5);
      let baseR = 1.0, baseG = 0;
      if (ratio <= 1.0) {
        const t = Math.min((ratio - 0.5) / 0.5, 1.0);
        baseG = 1.0 - t;
      }
      const brightness = 0.3 + 0.7 * flash;
      colorAttr.setXYZ(ei * 2, baseR * brightness, baseG * brightness, 0);
      colorAttr.setXYZ(ei * 2 + 1, baseR * brightness, baseG * brightness, 0);
    }
    colorAttr.needsUpdate = true;
  });

  if (!geometry) return null;
  return (
    <lineSegments ref={lineRef} geometry={geometry}>
      <lineBasicMaterial vertexColors linewidth={2} transparent opacity={0.9} depthTest={false} />
    </lineSegments>
  );
}

/* ============================================================
   Glue Joint Visualization
   ============================================================ */
function GlueJointViz() {
  const [joints, setJoints] = useState<{ a: THREE.Vector3; b: THREE.Vector3; type: string }[]>([]);

  useEffect(() => {
    const onAdd = (data: any) => {
      setJoints(prev => [...prev, {
        a: new THREE.Vector3(data.voxelA.x, data.voxelA.y, data.voxelA.z),
        b: new THREE.Vector3(data.voxelB.x, data.voxelB.y, data.voxelB.z),
        type: data.type || 'rigid',
      }]);
    };
    const onRemove = (data: any) => {
      setJoints(prev => prev.filter(j =>
        !(j.a.x === data.voxelA.x && j.a.y === data.voxelA.y && j.a.z === data.voxelA.z &&
          j.b.x === data.voxelB.x && j.b.y === data.voxelB.y && j.b.z === data.voxelB.z)
      ));
    };
    eventBus.on('glue:add', onAdd);
    eventBus.on('glue:remove', onRemove);
    return () => { eventBus.off('glue:add', onAdd); eventBus.off('glue:remove', onRemove); };
  }, []);

  return (
    <group>
      {joints.map((j, i) => {
        const mid = j.a.clone().add(j.b).multiplyScalar(0.5);
        const color = j.type === 'rigid' ? '#00ff88' : j.type === 'hinge' ? '#ffaa00' : '#88aaff';
        return (
          <group key={`glue_${i}`}>
            <Line points={[j.a.toArray(), j.b.toArray()]} color={color} lineWidth={4} dashed dashSize={0.1} gapSize={0.05} />
            <mesh position={mid}>
              <sphereGeometry args={[0.08, 8, 8]} />
              <meshBasicMaterial color={color} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/* ============================================================
   Measurement Tool Visualization
   ============================================================ */
function MeasurementViz() {
  const tool = useStore(s => s.activeTool);
  const [points, setPoints] = useState<THREE.Vector3[]>([]);
  const [measurements, setMeasurements] = useState<{ points: THREE.Vector3[]; distance: number; label: string }[]>([]);

  // Listen for measurement clicks
  useEffect(() => {
    if (tool !== 'measure') {
      setPoints([]);
      return;
    }
    const handler = (data: { point: THREE.Vector3 }) => {
      setPoints(prev => {
        const next = [...prev, data.point];
        if (next.length === 2) {
          const dist = next[0].distanceTo(next[1]);
          setMeasurements(prev => [...prev, {
            points: next,
            distance: dist,
            label: `${dist.toFixed(2)} u`,
          }]);
          return [];
        }
        return next;
      });
    };
    eventBus.on('measure:point', handler);
    return () => { eventBus.off('measure:point', handler); };
  }, [tool]);

  return (
    <group>
      {/* Active measurement points */}
      {points.map((p, i) => (
        <mesh key={`mp_${i}`} position={p}>
          <sphereGeometry args={[0.12, 8, 8]} />
          <meshBasicMaterial color="#ffff00" />
        </mesh>
      ))}
      {/* Completed measurements */}
      {measurements.map((m, i) => {
        const mid = m.points[0].clone().add(m.points[1]).multiplyScalar(0.5);
        return (
          <group key={`meas_${i}`}>
            <Line points={[m.points[0].toArray(), m.points[1].toArray()]} color="#ffff00" lineWidth={2} />
            <Html position={[mid.x, mid.y + 0.3, mid.z]} center style={{ pointerEvents: 'none' }}>
              <div className="measure-label">{m.label}</div>
            </Html>
          </group>
        );
      })}
    </group>
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

    const mesh = result.simplifiedMesh || result.mesh;
    if (mesh && mesh.positions.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions, 3));
      if (mesh.normals.length > 0) geo.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.normals, 3));
      if (mesh.indices.length > 0) geo.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
      geo.computeVertexNormals();
      setMeshGeo(geo);
      if (mesh.featureEdges) setFeatureLines(mesh.featureEdges);
    }

    if (result.verbSurfaces && result.verbSurfaces.length > 0) {
      try {
        const tess = result.verbSurfaces[0].tessellate();
        if (tess && tess.points && tess.faces) {
          const geo = new THREE.BufferGeometry();
          const positions: number[] = [];
          tess.points.forEach((p: number[]) => positions.push(p[0], p[1], p[2]));
          const indices: number[] = [];
          tess.faces.forEach((f: number[]) => indices.push(f[0], f[1], f[2]));
          geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
          geo.setIndex(indices);
          geo.computeVertexNormals();
          setNurbsGeo(geo);
        }
      } catch (e) { console.warn('NURBS tessellation failed:', e); }
    }
  }, [pipeline.status, pipeline.result]);

  return (
    <group>
      {meshGeo && (
        <mesh geometry={meshGeo}>
          <meshStandardMaterial color="#4a90d9" transparent opacity={0.3} side={THREE.DoubleSide} />
        </mesh>
      )}
      {nurbsGeo && (
        <mesh geometry={nurbsGeo}>
          <meshPhysicalMaterial color="#a78bfa" transparent opacity={0.6} side={THREE.DoubleSide} metalness={0.3} roughness={0.3} clearcoat={0.5} />
        </mesh>
      )}
      {featureLines.map((edge, i) => (
        <Line key={`fe_${i}`} points={[edge.a as [number,number,number], edge.b as [number,number,number]]} color="#ffff00" lineWidth={3} />
      ))}
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
      if (!isLocked.current) setFpMode(false);
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
      if (e.code === 'Escape') document.exitPointerLock();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keys.current.delete(e.code.toLowerCase());
    };

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
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      keys.current.clear();
    };
  }, [fpMode, camera, gl, setFpMode]);

  useFrame((_, delta) => {
    if (!fpMode || !isLocked.current) return;
    const speed = keys.current.has('shiftleft') || keys.current.has('shiftright') ? FAST_SPEED : SPEED;
    direction.current.set(0, 0, 0);

    if (keys.current.has('keyw')) direction.current.z -= 1;
    if (keys.current.has('keys')) direction.current.z += 1;
    if (keys.current.has('keya')) direction.current.x -= 1;
    if (keys.current.has('keyd')) direction.current.x += 1;
    if (keys.current.has('space')) direction.current.y += 1;
    if (keys.current.has('controlleft') || keys.current.has('controlright')) direction.current.y -= 1;

    if (direction.current.length() > 0) {
      direction.current.normalize();
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      const hFwd = new THREE.Vector3(forward.x, 0, forward.z).normalize();
      const hRight = new THREE.Vector3(right.x, 0, right.z).normalize();

      velocity.current.set(0, 0, 0);
      velocity.current.addScaledVector(hFwd, -direction.current.z * speed * delta);
      velocity.current.addScaledVector(hRight, direction.current.x * speed * delta);
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
   Click Handler (voxel placement, support/load, material, measure)
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
  const updateVoxel = useStore(s => s.updateVoxel);
  const selectVoxels = useStore(s => s.selectVoxels);
  const selectedVoxelIds = useStore(s => s.selectedVoxelIds);
  const voxels = useStore(s => s.voxels);
  const addLog = useStore(s => s.addLog);

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (!e.point) return;
    const pos = { x: Math.round(e.point.x), y: Math.round(e.point.y), z: Math.round(e.point.z) };

    const clickedVoxel = voxels.find(v =>
      Math.abs(v.pos.x - pos.x) < 0.6 && Math.abs(v.pos.y - pos.y) < 0.6 && Math.abs(v.pos.z - pos.z) < 0.6
    );

    if (tool === 'measure') {
      eventBus.emit('measure:point', { point: new THREE.Vector3(pos.x, pos.y, pos.z) });
      return;
    }

    if (tool === 'select' && clickedVoxel) {
      if (e.nativeEvent.shiftKey) {
        // Multi-select with Shift
        const newIds = selectedVoxelIds.includes(clickedVoxel.id)
          ? selectedVoxelIds.filter(id => id !== clickedVoxel.id)
          : [...selectedVoxelIds, clickedVoxel.id];
        selectVoxels(newIds);
      } else {
        selectVoxels([clickedVoxel.id]);
      }
    } else if (tool === 'place') {
      const n = e.face?.normal;
      const pp = n ? { x: pos.x + Math.round(n.x), y: pos.y + Math.round(n.y), z: pos.z + Math.round(n.z) } : { ...pos, y: pos.y + 1 };
      const preset = loadEngine.getMaterialPreset(activeVoxelMaterial);
      const mat = preset ? { ...preset.material } : (DEFAULT_MATERIALS[activeVoxelMaterial] || DEFAULT_MATERIALS.concrete);
      const matColor = MATERIAL_COLORS[activeVoxelMaterial];
      const v: Voxel = {
        id: `v_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
        pos: pp, color: matColor ? matColor.color : color, layerId,
        material: { ...mat }, isSupport: false, materialId: activeVoxelMaterial,
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
      const hasLoad = clickedVoxel.externalLoad && (clickedVoxel.externalLoad.x !== 0 || clickedVoxel.externalLoad.y !== 0 || clickedVoxel.externalLoad.z !== 0);
      if (hasLoad) {
        setVoxelExternalLoad(clickedVoxel.id, undefined);
        addLog('info', 'FEA', `移除外部負載 (${pos.x},${pos.y},${pos.z})`);
      } else {
        setVoxelExternalLoad(clickedVoxel.id, { x: 0, y: -50000, z: 0 });
        addLog('info', 'FEA', `施加外部負載 (${pos.x},${pos.y},${pos.z}) [0, -50000, 0] N`);
      }
    }
  }, [tool, color, layerId, bSize, bShape, activeVoxelMaterial, addVoxel, removeVoxel, addLog, voxels, toggleVoxelSupport, setVoxelExternalLoad, selectVoxels, updateVoxel, selectedVoxelIds]);

  // Right-click to change material
  const handleContextMenu = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (!e.point) return;
    const pos = { x: Math.round(e.point.x), y: Math.round(e.point.y), z: Math.round(e.point.z) };
    const clickedVoxel = voxels.find(v =>
      Math.abs(v.pos.x - pos.x) < 0.6 && Math.abs(v.pos.y - pos.y) < 0.6 && Math.abs(v.pos.z - pos.z) < 0.6
    );
    if (clickedVoxel) {
      const preset = loadEngine.getMaterialPreset(activeVoxelMaterial);
      const matColor = MATERIAL_COLORS[activeVoxelMaterial];
      if (preset) {
        updateVoxel(clickedVoxel.id, {
          material: { ...preset.material },
          materialId: activeVoxelMaterial,
          color: matColor ? matColor.color : clickedVoxel.color,
        });
        addLog('info', 'Material', `更換材質 (${pos.x},${pos.y},${pos.z}) → ${preset.name}`);
      }
    }
  }, [voxels, activeVoxelMaterial, updateVoxel, addLog]);

  return (
    <mesh visible={false} onClick={handleClick} onContextMenu={handleContextMenu} position={[0, -0.5, 0]}>
      <boxGeometry args={[200, 0.01, 200]} />
      <meshBasicMaterial transparent opacity={0} />
    </mesh>
  );
}

/* ============================================================
   Complete Lighting System
   ============================================================ */
function LightingSystem() {
  const viewMode = useStore(s => s.viewMode);

  if (viewMode === 'wireframe') {
    return <ambientLight intensity={1.0} />;
  }

  return (
    <group>
      {/* Ambient fill */}
      <ambientLight intensity={0.15} color="#b0b8d0" />

      {/* Key light - warm directional */}
      <directionalLight
        position={[15, 25, 10]}
        intensity={1.2}
        color="#fff5e6"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={80}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
        shadow-bias={-0.001}
      />

      {/* Fill light - cool blue */}
      <directionalLight position={[-10, 15, -8]} intensity={0.4} color="#c0d0ff" />

      {/* Rim / back light */}
      <directionalLight position={[0, 10, -15]} intensity={0.3} color="#e0e8ff" />

      {/* Hemisphere light for natural sky/ground bounce */}
      <hemisphereLight args={['#87CEEB', '#2a2a3e', 0.35]} />

      {/* Point light for local highlight */}
      <pointLight position={[0, 8, 0]} intensity={0.3} color="#ffffff" distance={30} decay={2} />

      {/* Contact shadows on ground */}
      <ContactShadows
        position={[0, -0.49, 0]}
        opacity={0.4}
        scale={40}
        blur={2}
        far={20}
        color="#000000"
      />
    </group>
  );
}

/* ============================================================
   Selection Box Indicator
   ============================================================ */
function SelectionIndicator() {
  const selectedIds = useStore(s => s.selectedVoxelIds);
  const voxels = useStore(s => s.voxels);

  const selectedVoxels = useMemo(() =>
    voxels.filter(v => selectedIds.includes(v.id)),
    [voxels, selectedIds]
  );

  if (selectedVoxels.length === 0) return null;

  return (
    <group>
      {selectedVoxels.map(v => (
        <mesh key={`sel_${v.id}`} position={[v.pos.x, v.pos.y, v.pos.z]}>
          <boxGeometry args={[1.02, 1.02, 1.02]} />
          <meshBasicMaterial color="#638cff" wireframe transparent opacity={0.5} />
        </mesh>
      ))}
    </group>
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
  const selectedCount = useStore(s => s.selectedVoxelIds.length);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* First person mode prompt */}
      {!fpMode && (
        <div
          style={{
            position: 'absolute', top: 8, left: 8, zIndex: 10,
            padding: '4px 10px', borderRadius: 4,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.05)',
            fontSize: 10, color: '#9ca3b4', cursor: 'pointer', userSelect: 'none',
          }}
          onClick={() => setFpMode(true)}
        >
          點擊進入第一人稱模式 (WASD / 滑鼠 / Shift 加速 / Esc 退出)
        </div>
      )}

      {/* Selection count badge */}
      {selectedCount > 0 && (
        <div style={{
          position: 'absolute', top: 8, right: 8, zIndex: 10,
          padding: '3px 8px', borderRadius: 4,
          background: 'rgba(99,140,255,0.15)', border: '1px solid rgba(99,140,255,0.3)',
          fontSize: 10, color: '#638cff',
        }}>
          已選取 {selectedCount} 個體素
        </div>
      )}

      {/* FP crosshair */}
      {fpMode && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          zIndex: 10, pointerEvents: 'none', fontSize: 24, color: 'rgba(255,255,255,0.3)', fontWeight: 'bold',
        }}>+</div>
      )}

      <Canvas
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', logarithmicDepthBuffer: true }}
        style={{ background: '#0a0a0f' }}
        shadows
        dpr={[1, 2]}
      >
        {camType === 'perspective'
          ? <PerspectiveCamera makeDefault position={[15, 12, 15]} fov={50} near={0.1} far={500} />
          : <OrthographicCamera makeDefault position={[15, 12, 15]} zoom={20} near={-500} far={500} />}

        {/* Complete Lighting System */}
        <LightingSystem />

        {/* Grid */}
        {showGrid && (
          <Grid args={[100, 100]} cellSize={1} cellThickness={0.5} cellColor="#1a1a2e"
            sectionSize={5} sectionThickness={1} sectionColor="#252540" fadeDistance={80} infiniteGrid />
        )}

        {/* Axes */}
        {showAxes && (
          <group>
            <Line points={[[0,0,0],[10,0,0]]} color="#ff4757" lineWidth={2} />
            <Line points={[[0,0,0],[0,10,0]]} color="#3dd68c" lineWidth={2} />
            <Line points={[[0,0,0],[0,0,10]]} color="#638cff" lineWidth={2} />
            {/* Axis labels */}
            <Html position={[10.5, 0, 0]} center style={{ pointerEvents: 'none' }}>
              <span style={{ color: '#ff4757', fontSize: 10, fontWeight: 'bold' }}>X</span>
            </Html>
            <Html position={[0, 10.5, 0]} center style={{ pointerEvents: 'none' }}>
              <span style={{ color: '#3dd68c', fontSize: 10, fontWeight: 'bold' }}>Y</span>
            </Html>
            <Html position={[0, 0, 10.5]} center style={{ pointerEvents: 'none' }}>
              <span style={{ color: '#638cff', fontSize: 10, fontWeight: 'bold' }}>Z</span>
            </Html>
          </group>
        )}

        {/* Ground plane (subtle) */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} receiveShadow>
          <planeGeometry args={[100, 100]} />
          <meshStandardMaterial color="#0e0e16" roughness={0.95} metalness={0} transparent opacity={0.5} />
        </mesh>

        <VoxelInstances />
        <SelectionIndicator />
        <StressOverlay />
        <GlueJointViz />
        <MeasurementViz />
        <PipelineResultViz />
        <ClickHandler />

        {!fpMode && <OrbitControls makeDefault enableDamping dampingFactor={0.1} />}
        <FirstPersonControls />

        <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
          <GizmoViewport labelColor="white" axisHeadScale={0.8} />
        </GizmoHelper>
        <PerfMonitor />
        <fog attach="fog" args={['#0a0a0f', 60, 150]} />
      </Canvas>
    </div>
  );
}
