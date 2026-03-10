import React, { useRef, useEffect, useMemo } from 'react';
import { useStore } from '../../store/useStore';

const MAP_SIZE = 120;
const MAP_PADDING = 2;

const MATERIAL_MINIMAP_COLORS: Record<string, string> = {
  concrete: '#808080',
  steel: '#C0C0C0',
  wood: '#8B4513',
  brick: '#8B3A3A',
  aluminum: '#d0d0e0',
  glass: '#88ccee',
};

export function MiniMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const voxels = useStore(s => s.voxels);
  const layers = useStore(s => s.layers);

  const visibleVoxels = useMemo(() => {
    const visibleLayerIds = new Set(layers.filter(l => l.visible).map(l => l.id));
    return voxels.filter(v => visibleLayerIds.has(v.layerId));
  }, [voxels, layers]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear
    ctx.fillStyle = '#0a0e14';
    ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);

    if (visibleVoxels.length === 0) {
      // Draw crosshair
      ctx.strokeStyle = '#1a1a2e';
      ctx.beginPath();
      ctx.moveTo(MAP_SIZE / 2, 0);
      ctx.lineTo(MAP_SIZE / 2, MAP_SIZE);
      ctx.moveTo(0, MAP_SIZE / 2);
      ctx.lineTo(MAP_SIZE, MAP_SIZE / 2);
      ctx.stroke();
      return;
    }

    // Calculate bounds
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const v of visibleVoxels) {
      minX = Math.min(minX, v.pos.x);
      maxX = Math.max(maxX, v.pos.x);
      minZ = Math.min(minZ, v.pos.z);
      maxZ = Math.max(maxZ, v.pos.z);
    }

    const rangeX = maxX - minX + 2;
    const rangeZ = maxZ - minZ + 2;
    const range = Math.max(rangeX, rangeZ, 10);
    const scale = (MAP_SIZE - MAP_PADDING * 2) / range;
    const offsetX = MAP_PADDING + (MAP_SIZE - MAP_PADDING * 2 - rangeX * scale) / 2;
    const offsetZ = MAP_PADDING + (MAP_SIZE - MAP_PADDING * 2 - rangeZ * scale) / 2;

    // Draw grid lines
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 0.5;
    const gridStep = Math.max(1, Math.ceil(range / 10));
    for (let x = Math.floor(minX / gridStep) * gridStep; x <= maxX + 1; x += gridStep) {
      const px = offsetX + (x - minX + 1) * scale;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, MAP_SIZE);
      ctx.stroke();
    }
    for (let z = Math.floor(minZ / gridStep) * gridStep; z <= maxZ + 1; z += gridStep) {
      const pz = offsetZ + (z - minZ + 1) * scale;
      ctx.beginPath();
      ctx.moveTo(0, pz);
      ctx.lineTo(MAP_SIZE, pz);
      ctx.stroke();
    }

    // Draw voxels (top-down projection)
    // Group by x,z and pick highest y for each position
    const topMap = new Map<string, { x: number; z: number; color: string; y: number }>();
    for (const v of visibleVoxels) {
      const key = `${v.pos.x},${v.pos.z}`;
      const existing = topMap.get(key);
      if (!existing || v.pos.y > existing.y) {
        const color = MATERIAL_MINIMAP_COLORS[v.materialId || ''] || v.color;
        topMap.set(key, { x: v.pos.x, z: v.pos.z, color, y: v.pos.y });
      }
    }

    const dotSize = Math.max(2, Math.min(6, scale * 0.8));
    for (const [, data] of topMap) {
      const px = offsetX + (data.x - minX + 1) * scale;
      const pz = offsetZ + (data.z - minZ + 1) * scale;
      ctx.fillStyle = data.color;
      ctx.globalAlpha = 0.8;
      ctx.fillRect(px - dotSize / 2, pz - dotSize / 2, dotSize, dotSize);
    }
    ctx.globalAlpha = 1.0;

    // Draw origin marker
    const ox = offsetX + (0 - minX + 1) * scale;
    const oz = offsetZ + (0 - minZ + 1) * scale;
    if (ox >= 0 && ox <= MAP_SIZE && oz >= 0 && oz <= MAP_SIZE) {
      ctx.strokeStyle = '#ff4757';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(ox, oz, 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Border
    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, MAP_SIZE, MAP_SIZE);
  }, [visibleVoxels]);

  return (
    <div style={{
      position: 'absolute',
      bottom: 8,
      right: 8,
      zIndex: 10,
      borderRadius: 6,
      overflow: 'hidden',
      border: '1px solid rgba(48,54,61,0.8)',
      boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
      background: '#0a0e14',
    }}>
      <div style={{
        fontSize: 8, color: '#8b949e', textAlign: 'center',
        padding: '2px 0', background: 'rgba(13,17,23,0.9)',
        borderBottom: '1px solid #1a1a2e',
        letterSpacing: 1,
      }}>
        MINI MAP
      </div>
      <canvas
        ref={canvasRef}
        width={MAP_SIZE}
        height={MAP_SIZE}
        style={{ display: 'block', width: MAP_SIZE, height: MAP_SIZE }}
      />
      <div style={{
        fontSize: 7, color: '#484f58', textAlign: 'center',
        padding: '1px 0', background: 'rgba(13,17,23,0.9)',
        borderTop: '1px solid #1a1a2e',
      }}>
        {visibleVoxels.length} 體素 · 俯視投影
      </div>
    </div>
  );
}
