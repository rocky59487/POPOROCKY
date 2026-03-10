/**
 * FloatingToolbar - Vertical floating toolbar in 3D viewport (Blender-style T panel)
 */
import React from 'react';
import { useStore } from '../../store/useStore';
import {
  MousePointer2, Box, Eraser, Link2, Ruler, PaintBucket,
  ZoomIn, ZoomOut, Home, Minus
} from 'lucide-react';

interface ToolItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  shortcut: string;
}

const tools: ToolItem[] = [
  { id: 'select', icon: <MousePointer2 size={14} />, label: '選取', shortcut: 'Q' },
  { id: 'place', icon: <Box size={14} />, label: '放置', shortcut: 'W' },
  { id: 'erase', icon: <Eraser size={14} />, label: '刪除', shortcut: 'E' },
  { id: 'glue', icon: <Link2 size={14} />, label: '黏合', shortcut: 'G' },
  { id: 'measure', icon: <Ruler size={14} />, label: '測量', shortcut: 'M' },
  { id: 'fill', icon: <PaintBucket size={14} />, label: '填充', shortcut: 'F' },
];

const MATERIAL_DOTS: { id: string; color: string; label: string }[] = [
  { id: 'concrete', color: '#808080', label: '混凝土' },
  { id: 'steel', color: '#C0C0C0', label: '鋼材' },
  { id: 'wood', color: '#8B4513', label: '木材' },
  { id: 'brick', color: '#8B3A3A', label: '磚塊' },
];

export function FloatingToolbar() {
  const activeTool = useStore(s => s.activeTool);
  const setTool = useStore(s => s.setTool);
  const activeMaterialId = useStore(s => s.activeMaterialId);

  return (
    <div className="floating-toolbar">
      {tools.map(t => (
        <button
          key={t.id}
          className={`ft-btn ${activeTool === t.id ? 'active' : ''}`}
          onClick={() => setTool(t.id as any)}
          title={`${t.label} (${t.shortcut})`}
        >
          {t.icon}
        </button>
      ))}

      <div className="ft-divider" />

      {MATERIAL_DOTS.map(m => (
        <button
          key={m.id}
          className={`ft-btn ft-mat ${activeMaterialId === m.id ? 'active' : ''}`}
          onClick={() => useStore.getState().setActiveMaterial(m.id)}
          title={m.label}
        >
          <span className="ft-dot" style={{ background: m.color }} />
        </button>
      ))}

      <div className="ft-divider" />

      <button className="ft-btn" onClick={() => {
        const evt = new KeyboardEvent('keydown', { key: '+', ctrlKey: true });
        window.dispatchEvent(evt);
      }} title="放大">
        <ZoomIn size={14} />
      </button>
      <button className="ft-btn" onClick={() => {
        const evt = new KeyboardEvent('keydown', { key: '-', ctrlKey: true });
        window.dispatchEvent(evt);
      }} title="縮小">
        <ZoomOut size={14} />
      </button>
      <button className="ft-btn" onClick={() => {
        const evt = new KeyboardEvent('keydown', { key: 'Home' });
        window.dispatchEvent(evt);
      }} title="重置視角 (Home)">
        <Home size={14} />
      </button>
    </div>
  );
}
