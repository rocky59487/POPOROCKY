/**
 * PerfPanel - Collapsible performance monitoring panel in viewport top-right
 */
import React, { useState } from 'react';
import { useStore } from '../../store/useStore';
import { Activity, ChevronDown, ChevronRight } from 'lucide-react';

export function PerfPanel() {
  const [collapsed, setCollapsed] = useState(false);
  const fps = useStore(s => s.fps);
  const mem = useStore(s => s.memoryUsage);
  const vc = useStore(s => s.voxels.length);
  const tris = useStore(s => s.triangleCount);
  const drawCalls = useStore(s => s.drawCalls);
  const lod = useStore(s => s.currentLOD);

  const renderMode = vc > 100 ? 'Instanced' : 'Standard';
  const renderTime = fps > 0 ? (1000 / fps).toFixed(1) : '—';
  const fpsColor = fps >= 50 ? '#3dd68c' : fps >= 30 ? '#e3b341' : '#f85149';

  return (
    <div className="perf-panel">
      <div className="perf-header" onClick={() => setCollapsed(!collapsed)}>
        <Activity size={10} />
        <span>效能監控</span>
        {collapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
      </div>
      {!collapsed && (
        <div className="perf-body">
          <div className="perf-row">
            <span>FPS</span>
            <span style={{ color: fpsColor, fontWeight: 'bold' }}>{fps}</span>
          </div>
          <div className="perf-row">
            <span>渲染</span>
            <span>{renderTime}ms</span>
          </div>
          <div className="perf-row">
            <span>體素</span>
            <span>{vc.toLocaleString()}</span>
          </div>
          <div className="perf-row">
            <span>三角面</span>
            <span>{tris.toLocaleString()}</span>
          </div>
          <div className="perf-row">
            <span>繪製呼叫</span>
            <span>{drawCalls}</span>
          </div>
          <div className="perf-row">
            <span>記憶體</span>
            <span>{mem} MB</span>
          </div>
          <div className="perf-row">
            <span>LOD 層級</span>
            <span>{lod}</span>
          </div>
          <div className="perf-row">
            <span>渲染模式</span>
            <span style={{ color: renderMode === 'Instanced' ? '#58a6ff' : '#9ca3b4' }}>{renderMode}</span>
          </div>
        </div>
      )}
    </div>
  );
}
