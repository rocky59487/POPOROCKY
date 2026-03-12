import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../../store/useStore';
import { Move, Pencil, Eraser, Link, Ruler, Paintbrush, MousePointer, PaintBucket } from 'lucide-react';

const TOOL_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  select:      { label: '選取工具', icon: <MousePointer size={12} /> },
  place:       { label: '放置體素', icon: <Pencil size={12} /> },
  erase:       { label: '刪除體素', icon: <Eraser size={12} /> },
  brush:       { label: '體素刷', icon: <Paintbrush size={12} /> },
  glue:        { label: 'Glue 黏合', icon: <Link size={12} /> },
  measure:     { label: '測量工具', icon: <Ruler size={12} /> },
  paint:       { label: '上色工具', icon: <PaintBucket size={12} /> },
  fill:        { label: '填充工具', icon: <PaintBucket size={12} /> },
  'set-support': { label: '設定支撐', icon: <Move size={12} /> },
  'set-load':  { label: '施加負載', icon: <Move size={12} /> },
};

const MATERIAL_LABELS: Record<string, string> = {
  concrete: '混凝土', steel: '鋼材', wood: '木材',
  brick: '磚塊', aluminum: '鋁合金', glass: '玻璃',
};

export function ViewportOverlay() {
  const tool = useStore(s => s.activeTool);
  const material = useStore(s => s.activeVoxelMaterial);
  const isDirty = useStore(s => s.isDirty);
  const projectName = useStore(s => s.projectName);
  const lastSaveTime = useStore(s => s.lastSaveTime);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0, z: 0 });
  const [autoSaveMsg, setAutoSaveMsg] = useState('');

  const toolInfo = TOOL_LABELS[tool] || { label: tool, icon: null };
  const matLabel = MATERIAL_LABELS[material] || material;

  // Listen for auto-save events
  useEffect(() => {
    const interval = setInterval(() => {
      const s = useStore.getState();
      if (s.lastSaveTime > lastSaveTime) {
        setAutoSaveMsg('自動儲存完成');
        setTimeout(() => setAutoSaveMsg(''), 2000);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [lastSaveTime]);

  return (
    <>
      {/* Top-left: Tool + Material info */}
      <div className="viewport-overlay top-left">
        <div className="overlay-tool-info">
          {toolInfo.icon}
          <span className="overlay-tool-name">{toolInfo.label}</span>
          <span className="overlay-separator">·</span>
          <span className="overlay-material">{matLabel}</span>
        </div>
      </div>

      {/* Bottom-left: Coordinate display */}
      <div className="viewport-overlay bottom-left">
        <div className="overlay-coords">
          <span className="coord-label">游標</span>
          <span className="coord-x">X: {mousePos.x}</span>
          <span className="coord-y">Y: {mousePos.y}</span>
          <span className="coord-z">Z: {mousePos.z}</span>
        </div>
      </div>

      {/* Top-center: Project name + save status */}
      <div className="viewport-overlay top-center">
        <span className="overlay-project-name">
          {projectName}{isDirty ? ' *' : ''}
        </span>
        {autoSaveMsg && (
          <span className="overlay-autosave-msg">{autoSaveMsg}</span>
        )}
      </div>
    </>
  );
}
