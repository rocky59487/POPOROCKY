import React from 'react';
import { useStore } from '../../store/useStore';
import { ViewportScene } from './ViewportScene';
import { MiniMap } from './MiniMap';
import { FloatingToolbar } from './FloatingToolbar';
import { PerfPanel } from './PerfPanel';
import { Maximize2, Grid3X3 } from 'lucide-react';

const quadViews = [
  { label: '透視', orthoDir: null },
  { label: '頂視 (Top)', orthoDir: 'top' as const },
  { label: '前視 (Front)', orthoDir: 'front' as const },
  { label: '右視 (Right)', orthoDir: 'right' as const },
];

export function Viewport3D() {
  const layout = useStore(s => s.viewLayout);
  const viewMode = useStore(s => s.viewMode);
  const cameraType = useStore(s => s.cameraType);
  const voxelCount = useStore(s => s.voxels.length);
  const selectedCount = useStore(s => s.selectedVoxelIds.length);
  const pipeline = useStore(s => s.pipeline);
  const showStress = useStore(s => s.loadAnalysis.showStressOverlay);
  const glueCount = useStore(s => s.glueJoints.length);
  const setViewLayout = useStore(s => s.setViewLayout);

  const modeLabel = viewMode === 'wireframe' ? '線框' : viewMode === 'solid' ? '實體' : '渲染';
  const camLabel = cameraType === 'perspective' ? '透視' : '正交';
  const renderMode = voxelCount > 100 ? 'Instanced' : 'Standard';

  if (layout === 'quad') {
    return (
      <div className="viewport-quad">
        {quadViews.map((v, i) => (
          <div key={i} className="viewport-container viewport-quad-cell">
            <div className="viewport-overlay">
              <span className="viewport-badge">{v.label}</span>
              <button className="viewport-btn" onClick={() => setViewLayout('single')} title="最大化">
                <Maximize2 size={12} />
              </button>
            </div>
            <ViewportScene label={v.label} orthoDirection={v.orthoDir} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="viewport-container" style={{ position: 'relative' }}>
      <div className="viewport-overlay">
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span className="viewport-badge">{camLabel} | {modeLabel}</span>
          <span className="viewport-badge">體素: {voxelCount}</span>
          <span className="viewport-badge" style={{ color: voxelCount > 100 ? '#a78bfa' : 'var(--text-muted)' }}>
            {renderMode}
          </span>
          {selectedCount > 0 && <span className="viewport-badge" style={{ color: '#f5a623' }}>選取: {selectedCount}</span>}
          {glueCount > 0 && <span className="viewport-badge" style={{ color: '#fbbf24' }}>黏合: {glueCount}</span>}
          {showStress && <span className="viewport-badge" style={{ color: '#ef4444' }}>FEA</span>}
          {pipeline.status === 'running' && <span className="viewport-badge" style={{ color: 'var(--accent)' }}>管線 {Math.round(pipeline.progress)}%</span>}
          {pipeline.status === 'done' && <span className="viewport-badge" style={{ color: '#3dd68c' }}>NURBS 已生成</span>}
        </div>
        <button className="viewport-btn" onClick={() => setViewLayout('quad')} title="四視口">
          <Grid3X3 size={12} />
        </button>
      </div>

      {/* Floating Toolbar - left side */}
      <FloatingToolbar />

      {/* Performance Panel - top right */}
      <PerfPanel />

      <ViewportScene />
      <MiniMap />
    </div>
  );
}
