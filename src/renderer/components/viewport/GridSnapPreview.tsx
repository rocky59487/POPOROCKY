/**
 * GridSnapPreview - Shows a semi-transparent preview cube at the grid-snapped cursor position
 * Follows the mouse cursor in the 3D viewport, snapping to integer grid positions
 */
import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../store/useStore';

const MATERIAL_COLORS: Record<string, string> = {
  concrete: '#808080', steel: '#C0C0C0', wood: '#8B4513',
  brick: '#8B3A3A', aluminum: '#d0d0e0', glass: '#88ccee',
};

export function GridSnapPreview() {
  const tool = useStore(s => s.activeTool);
  const activeVoxelMaterial = useStore(s => s.activeVoxelMaterial);
  const meshRef = useRef<THREE.Mesh>(null);
  const edgesRef = useRef<THREE.LineSegments>(null);
  const { camera, gl, raycaster, scene } = useThree();
  const [visible, setVisible] = useState(false);
  const mouse = useRef(new THREE.Vector2());
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.5), []);
  const intersectPoint = useRef(new THREE.Vector3());

  const showPreview = tool === 'place' || tool === 'brush';

  useEffect(() => {
    if (!showPreview) { setVisible(false); return; }
    const canvas = gl.domElement;

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      setVisible(true);
    };

    const onMouseLeave = () => setVisible(false);

    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseleave', onMouseLeave);
    return () => {
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseleave', onMouseLeave);
    };
  }, [showPreview, gl]);

  useFrame(() => {
    if (!showPreview || !visible || !meshRef.current) return;

    raycaster.setFromCamera(mouse.current, camera);

    // Try to intersect with existing voxels first
    const meshes = scene.children.filter(c => c instanceof THREE.InstancedMesh || c.type === 'Group');
    const intersects = raycaster.intersectObjects(scene.children, true);

    let targetPos: THREE.Vector3 | null = null;

    for (const hit of intersects) {
      if (hit.object === meshRef.current || hit.object === edgesRef.current) continue;
      if (hit.object.visible === false) continue;

      // If hitting an existing voxel, place adjacent
      if (hit.face) {
        const normal = hit.face.normal.clone();
        // Transform normal to world space if needed
        if (hit.object.matrixWorld) {
          const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
          normal.applyMatrix3(normalMatrix).normalize();
        }
        const pos = hit.point.clone().add(normal.multiplyScalar(0.01));
        targetPos = new THREE.Vector3(
          Math.round(pos.x),
          Math.max(0, Math.round(pos.y)),
          Math.round(pos.z)
        );
        break;
      }
    }

    // Fallback: intersect with ground plane
    if (!targetPos) {
      const ray = raycaster.ray;
      if (ray.intersectPlane(plane, intersectPoint.current)) {
        targetPos = new THREE.Vector3(
          Math.round(intersectPoint.current.x),
          0,
          Math.round(intersectPoint.current.z)
        );
      }
    }

    if (targetPos) {
      meshRef.current.position.copy(targetPos);
      meshRef.current.visible = true;
      if (edgesRef.current) {
        edgesRef.current.position.copy(targetPos);
        edgesRef.current.visible = true;
      }
    } else {
      meshRef.current.visible = false;
      if (edgesRef.current) edgesRef.current.visible = false;
    }
  });

  const previewColor = MATERIAL_COLORS[activeVoxelMaterial] || '#638cff';

  if (!showPreview) return null;

  return (
    <group>
      <mesh ref={meshRef} visible={false}>
        <boxGeometry args={[0.95, 0.95, 0.95]} />
        <meshBasicMaterial color={previewColor} transparent opacity={0.3} depthWrite={false} />
      </mesh>
      <lineSegments ref={edgesRef} visible={false}>
        <edgesGeometry args={[new THREE.BoxGeometry(0.95, 0.95, 0.95)]} />
        <lineBasicMaterial color={previewColor} transparent opacity={0.8} />
      </lineSegments>
    </group>
  );
}
