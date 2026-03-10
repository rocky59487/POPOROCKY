/**
 * Viewport3D - 3D 視口組件
 * 
 * 使用 React Three Fiber 實現第一人稱視角沉浸式 3D 場景，
 * 包含體素渲染、NURBS 曲面視覺化、網格地面等。
 */

import React, { useRef, useMemo, useCallback, useState } from 'react';
import { Canvas, useFrame, useThree, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Grid, GizmoHelper, GizmoViewport, Line, Html } from '@react-three/drei';
import * as THREE from 'three';
import { useAppState } from '../store/AppStore';
import { VoxelData, NURBSSurface, FeatureLine } from '../store/DataModels';
import signalBus, { SIGNALS } from '../engines/EventBus';

// ============================================================
// Voxel Mesh Component
// ============================================================
interface VoxelMeshProps {
  voxel: VoxelData;
  isSelected: boolean;
  onClick: (voxelId: string) => void;
}

const VoxelMesh: React.FC<VoxelMeshProps> = React.memo(({ voxel, isSelected, onClick }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  const color = useMemo(() => {
    if (isSelected) return '#ff6b81';
    if (hovered) return '#6bc5f7';
    switch (voxel.semantic_intent) {
      case 'sharp': return '#e94560';
      case 'smooth_curve': return '#4ecdc4';
      case 'fillet_R': return '#ffe66d';
      default: return voxel.material_data.color || '#4ecdc4';
    }
  }, [isSelected, hovered, voxel.semantic_intent, voxel.material_data.color]);

  const opacity = voxel.is_virtual ? 0.4 : 0.85;

  return (
    <mesh
      ref={meshRef}
      position={[voxel.position[0], voxel.position[1], voxel.position[2]]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onClick(voxel.voxel_id);
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      <boxGeometry args={[0.95, 0.95, 0.95]} />
      <meshStandardMaterial
        color={color}
        transparent={opacity < 1}
        opacity={opacity}
        roughness={0.3}
        metalness={0.1}
      />
      {isSelected && (
        <lineSegments>
          <edgesGeometry args={[new THREE.BoxGeometry(1.0, 1.0, 1.0)]} />
          <lineBasicMaterial color="#ffffff" linewidth={2} />
        </lineSegments>
      )}
      {voxel.semantic_intent !== 'default' && (
        <mesh position={[0, 0.55, 0]} scale={[0.15, 0.15, 0.15]}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshBasicMaterial
            color={
              voxel.semantic_intent === 'sharp' ? '#ff0000' :
              voxel.semantic_intent === 'smooth_curve' ? '#00ff00' : '#ffff00'
            }
          />
        </mesh>
      )}
    </mesh>
  );
});

// ============================================================
// NURBS Surface Visualization
// ============================================================
interface NURBSSurfaceVizProps {
  surface: NURBSSurface;
}

const NURBSSurfaceViz: React.FC<NURBSSurfaceVizProps> = ({ surface }) => {
  const mesh = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const points: number[] = [];
    const indices: number[] = [];

    // Sample NURBS surface as mesh
    const resU = 20;
    const resV = 20;

    if (surface.control_points.length === 0) return null;

    // Simple evaluation: interpolate control points
    const cpRows = surface.control_points.length;
    const cpCols = surface.control_points[0]?.length || 0;

    for (let i = 0; i <= resU; i++) {
      for (let j = 0; j <= resV; j++) {
        const u = i / resU;
        const v = j / resV;

        // Bilinear interpolation of control points
        const row = Math.min(Math.floor(u * (cpRows - 1)), cpRows - 2);
        const col = Math.min(Math.floor(v * (cpCols - 1)), cpCols - 2);
        const fu = u * (cpRows - 1) - row;
        const fv = v * (cpCols - 1) - col;

        const p00 = surface.control_points[row]?.[col] || [0, 0, 0, 1];
        const p10 = surface.control_points[row + 1]?.[col] || p00;
        const p01 = surface.control_points[row]?.[col + 1] || p00;
        const p11 = surface.control_points[row + 1]?.[col + 1] || p00;

        const x = (1 - fu) * (1 - fv) * p00[0] + fu * (1 - fv) * p10[0] + (1 - fu) * fv * p01[0] + fu * fv * p11[0];
        const y = (1 - fu) * (1 - fv) * p00[1] + fu * (1 - fv) * p10[1] + (1 - fu) * fv * p01[1] + fu * fv * p11[1];
        const z = (1 - fu) * (1 - fv) * p00[2] + fu * (1 - fv) * p10[2] + (1 - fu) * fv * p01[2] + fu * fv * p11[2];

        points.push(x, y, z);

        if (i < resU && j < resV) {
          const idx = i * (resV + 1) + j;
          indices.push(idx, idx + 1, idx + resV + 1);
          indices.push(idx + 1, idx + resV + 2, idx + resV + 1);
        }
      }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return geometry;
  }, [surface]);

  if (!mesh) return null;

  return (
    <mesh geometry={mesh}>
      <meshStandardMaterial
        color="#4dabf7"
        transparent
        opacity={0.6}
        side={THREE.DoubleSide}
        wireframe={false}
        roughness={0.2}
        metalness={0.3}
      />
    </mesh>
  );
};

// ============================================================
// Feature Line Visualization
// ============================================================
interface FeatureLineVizProps {
  line: FeatureLine;
}

const FeatureLineViz: React.FC<FeatureLineVizProps> = ({ line }) => {
  const points = useMemo(() => {
    return line.control_points.map(cp => new THREE.Vector3(cp[0], cp[1], cp[2]));
  }, [line]);

  if (points.length < 2) return null;

  return (
    <Line
      points={points}
      color="#ffe66d"
      lineWidth={2}
    />
  );
};

// ============================================================
// Grid Plane Placement Helper
// ============================================================
const PlacementPlane: React.FC<{ onPlace: (pos: [number, number, number]) => void }> = ({ onPlace }) => {
  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    const point = e.point;
    const x = Math.round(point.x);
    const y = Math.round(Math.max(0, point.y));
    const z = Math.round(point.z);
    onPlace([x, y, z]);
  }, [onPlace]);

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -0.5, 0]}
      onClick={handleClick}
      visible={false}
    >
      <planeGeometry args={[100, 100]} />
      <meshBasicMaterial transparent opacity={0} />
    </mesh>
  );
};

// ============================================================
// Scene Content
// ============================================================
const SceneContent: React.FC = () => {
  const { state, dispatch } = useAppState();
  const { viewportSettings, nurbsResult } = state;

  // Collect all voxels from all chunks
  const allVoxels = useMemo(() => {
    const voxels: VoxelData[] = [];
    state.project.chunks.forEach(chunk => {
      chunk.active_voxels.forEach(v => {
        const layer = state.project.layers.find(l => l.layer_id === v.layer_id);
        if (layer?.visible !== false) {
          voxels.push(v);
        }
      });
    });
    return voxels;
  }, [state.project.chunks, state.project.layers]);

  const handleVoxelClick = useCallback((voxelId: string) => {
    if (state.activeTool === 'select') {
      dispatch({ type: 'SELECT_VOXELS', payload: [voxelId] });
    } else if (state.activeTool === 'delete') {
      dispatch({ type: 'REMOVE_VOXEL', payload: voxelId });
      signalBus.publish(SIGNALS.VOXEL_STATE_CHANGED, {
        action: 'removed',
        voxel_id: voxelId,
      });
    } else if (state.activeTool === 'tag_sharp' || state.activeTool === 'tag_smooth' || state.activeTool === 'tag_fillet') {
      const intentMap: Record<string, 'sharp' | 'smooth_curve' | 'fillet_R'> = {
        tag_sharp: 'sharp',
        tag_smooth: 'smooth_curve',
        tag_fillet: 'fillet_R',
      };
      dispatch({
        type: 'UPDATE_VOXEL_TAG',
        payload: {
          voxelId,
          intent: intentMap[state.activeTool],
          radius: state.activeTool === 'tag_fillet' ? state.filletRadius : undefined,
        },
      });
    }
  }, [state.activeTool, state.filletRadius, dispatch]);

  const handlePlace = useCallback((pos: [number, number, number]) => {
    if (state.activeTool !== 'place') return;
    const { createDefaultVoxel } = require('../store/DataModels');
    const voxel = createDefaultVoxel(pos, state.activeLayerId, state.semanticIntent);
    const layer = state.project.layers.find(l => l.layer_id === state.activeLayerId);
    if (layer) {
      voxel.material_data.color = layer.color;
    }
    if (state.semanticIntent === 'fillet_R') {
      voxel.fillet_radius = state.filletRadius;
    }
    dispatch({ type: 'ADD_VOXEL', payload: voxel });
    signalBus.publish(SIGNALS.VOXEL_STATE_CHANGED, {
      action: 'added',
      voxel: voxel,
    });
  }, [state.activeTool, state.activeLayerId, state.semanticIntent, state.filletRadius, state.project.layers, dispatch]);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 20, 10]} intensity={0.8} castShadow />
      <directionalLight position={[-5, 10, -5]} intensity={0.3} />
      <pointLight position={[0, 10, 0]} intensity={0.2} />

      {/* Grid */}
      {viewportSettings.showGrid && (
        <Grid
          args={[100, 100]}
          cellSize={1}
          cellThickness={0.5}
          cellColor="#2a3a4e"
          sectionSize={5}
          sectionThickness={1}
          sectionColor="#3a4a5e"
          fadeDistance={50}
          fadeStrength={1}
          followCamera={false}
          position={[0, -0.5, 0]}
        />
      )}

      {/* Axes */}
      {viewportSettings.showAxes && (
        <GizmoHelper alignment="bottom-left" margin={[60, 60]}>
          <GizmoViewport labelColor="white" axisHeadScale={0.8} />
        </GizmoHelper>
      )}

      {/* Placement Plane */}
      <PlacementPlane onPlace={handlePlace} />

      {/* Voxels */}
      {allVoxels.map(voxel => (
        <VoxelMesh
          key={voxel.voxel_id}
          voxel={voxel}
          isSelected={state.selectedVoxels.includes(voxel.voxel_id)}
          onClick={handleVoxelClick}
        />
      ))}

      {/* NURBS Surfaces */}
      {viewportSettings.showNurbs && nurbsResult?.nurbs_surfaces.map(surface => (
        <NURBSSurfaceViz key={surface.patch_id} surface={surface} />
      ))}

      {/* Feature Lines */}
      {viewportSettings.showNurbs && nurbsResult?.feature_lines.map(line => (
        <FeatureLineViz key={line.curve_id} line={line} />
      ))}

      {/* Camera Controls */}
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.1}
        minDistance={2}
        maxDistance={100}
        maxPolarAngle={Math.PI * 0.85}
      />
    </>
  );
};

// ============================================================
// Main Viewport Component
// ============================================================
const Viewport3D: React.FC = () => {
  const { state } = useAppState();
  const voxelCount = useMemo(() => {
    return state.project.chunks.reduce((sum, c) => sum + c.active_voxels.length, 0);
  }, [state.project.chunks]);

  return (
    <div className="viewport-container">
      <Canvas
        camera={{ position: [8, 8, 8], fov: 60, near: 0.1, far: 1000 }}
        gl={{ antialias: true, alpha: false }}
        style={{ background: '#1a1a2e' }}
      >
        <color attach="background" args={['#1a1a2e']} />
        <fog attach="fog" args={['#1a1a2e', 30, 80]} />
        <SceneContent />
      </Canvas>

      {/* Viewport Overlay Info */}
      <div className="viewport-overlay">
        <div className="viewport-info">
          體素數量: {voxelCount} | 圖層: {state.project.layers.filter(l => l.visible).length}/{state.project.layers.length}
        </div>
        {state.nurbsResult && (
          <div className="viewport-info">
            NURBS 曲面: {state.nurbsResult.nurbs_surfaces.length} | 特徵線: {state.nurbsResult.feature_lines.length}
          </div>
        )}
        {state.isConverting && (
          <div className="viewport-info" style={{ color: '#ffe66d' }}>
            轉換中... {state.pipeline.progress}%
          </div>
        )}
      </div>
    </div>
  );
};

export default Viewport3D;
