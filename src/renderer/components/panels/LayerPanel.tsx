import React, { useState, useRef } from 'react';
import { useStore } from '../../store/useStore';
import { Eye, EyeOff, Lock, Unlock, Plus, Copy, Trash2, GripVertical, Shield, FolderPlus, ChevronDown, ChevronRight } from 'lucide-react';

export function LayerPanel() {
  const layers = useStore(s => s.layers);
  const activeLayerId = useStore(s => s.activeLayerId);
  const setActiveLayer = useStore(s => s.setActiveLayer);
  const updateLayer = useStore(s => s.updateLayer);
  const addLayer = useStore(s => s.addLayer);
  const removeLayer = useStore(s => s.removeLayer);
  const duplicateLayer = useStore(s => s.duplicateLayer);
  const reorderLayers = useStore(s => s.reorderLayers);

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  const colors = ['#638cff', '#ff4757', '#3dd68c', '#f5a623', '#a78bfa', '#06b6d4', '#ec4899', '#84cc16'];

  const handleAdd = () => {
    const id = `layer_${Date.now()}`;
    addLayer({
      id, name: `圖層 ${layers.length + 1}`,
      color: colors[layers.length % colors.length],
      visible: true, locked: false, opacity: 1,
      blendMode: 'normal', order: layers.length,
      voxelCount: 0, physicsEnabled: false, maskEnabled: false,
    });
  };

  const handleDoubleClick = (layer: any) => {
    setEditingId(layer.id);
    setEditName(layer.name);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleRenameSubmit = () => {
    if (editingId && editName.trim()) {
      updateLayer(editingId, { name: editName.trim() });
    }
    setEditingId(null);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };

  const handleDrop = (idx: number) => {
    if (dragIdx !== null && dragIdx !== idx) {
      reorderLayers(dragIdx, idx);
    }
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const active = layers.find(l => l.id === activeLayerId);
  const totalVoxels = layers.reduce((sum, l) => sum + l.voxelCount, 0);

  return (
    <div className="glass-panel" style={{ flex: 1 }}>
      <div className="panel-header">
        <span>圖層引擎</span>
        <div className="panel-header-actions">
          <button className="btn-icon" onClick={handleAdd} title="新增圖層"><Plus size={13} /></button>
        </div>
      </div>
      <div className="panel-body" style={{ padding: 0 }}>
        {/* 圖層總覽 */}
        <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
          <span>{layers.length} 個圖層</span>
          <span>共 {totalVoxels} 體素</span>
        </div>

        {/* 圖層列表 */}
        <div style={{ maxHeight: 200, overflowY: 'auto' }}>
          {layers.map((layer, idx) => (
            <div
              key={layer.id}
              className={`layer-item ${activeLayerId === layer.id ? 'active' : ''} ${dragOverIdx === idx ? 'drag-over' : ''}`}
              onClick={() => setActiveLayer(layer.id)}
              onDoubleClick={() => handleDoubleClick(layer)}
              draggable
              onDragStart={() => setDragIdx(idx)}
              onDragOver={e => handleDragOver(e, idx)}
              onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
              onDrop={() => handleDrop(idx)}
              style={{
                opacity: dragIdx === idx ? 0.5 : 1,
                borderTop: dragOverIdx === idx ? '2px solid var(--accent)' : 'none',
              }}
            >
              <GripVertical size={10} style={{ color: 'var(--text-muted)', cursor: 'grab', flexShrink: 0 }} />
              <div className="layer-color" style={{ background: layer.color, flexShrink: 0 }} />

              {editingId === layer.id ? (
                <input
                  ref={inputRef}
                  className="layer-rename-input"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onBlur={handleRenameSubmit}
                  onKeyDown={e => { if (e.key === 'Enter') handleRenameSubmit(); if (e.key === 'Escape') setEditingId(null); }}
                  onClick={e => e.stopPropagation()}
                  style={{
                    flex: 1, background: 'var(--bg-tertiary)', border: '1px solid var(--accent)',
                    color: 'var(--text-primary)', borderRadius: 3, padding: '1px 4px', fontSize: 12,
                    outline: 'none', minWidth: 0,
                  }}
                />
              ) : (
                <span className="layer-name" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {layer.name}
                </span>
              )}

              <span className="layer-count" style={{ flexShrink: 0, fontSize: 10, color: 'var(--text-muted)', minWidth: 24, textAlign: 'right' }}>
                {layer.voxelCount}
              </span>

              <div className="layer-actions" style={{ display: 'flex', gap: 1, flexShrink: 0 }}>
                {layer.physicsEnabled && <Shield size={10} style={{ color: 'var(--warning)' }} />}
                <button className="btn-icon" style={{ width: 18, height: 18 }}
                  onClick={e => { e.stopPropagation(); updateLayer(layer.id, { visible: !layer.visible }); }}>
                  {layer.visible ? <Eye size={10} /> : <EyeOff size={10} style={{ opacity: 0.4 }} />}
                </button>
                <button className="btn-icon" style={{ width: 18, height: 18 }}
                  onClick={e => { e.stopPropagation(); updateLayer(layer.id, { locked: !layer.locked }); }}>
                  {layer.locked ? <Lock size={10} style={{ color: 'var(--warning)' }} /> : <Unlock size={10} style={{ opacity: 0.4 }} />}
                </button>
                <button className="btn-icon" style={{ width: 18, height: 18 }}
                  onClick={e => { e.stopPropagation(); duplicateLayer(layer.id); }} title="複製">
                  <Copy size={10} />
                </button>
                {layers.length > 1 && (
                  <button className="btn-icon" style={{ width: 18, height: 18, color: 'var(--error)' }}
                    onClick={e => { e.stopPropagation(); removeLayer(layer.id); }} title="刪除">
                    <Trash2 size={10} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* 選中圖層的詳細設定 */}
        {active && (
          <div style={{ padding: '8px', borderTop: '1px solid var(--border)' }}>
            <div className="prop-section-title">圖層設定</div>

            <div className="prop-row">
              <span className="prop-label">不透明度</span>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="range" min={0} max={100} value={active.opacity * 100}
                  onChange={e => updateLayer(active.id, { opacity: +e.target.value / 100 })}
                  style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 32, textAlign: 'right' }}>
                  {Math.round(active.opacity * 100)}%
                </span>
              </div>
            </div>

            <div className="prop-row">
              <span className="prop-label">混合模式</span>
              <select className="input" style={{ width: 90, fontSize: 11 }} value={active.blendMode}
                onChange={e => updateLayer(active.id, { blendMode: e.target.value })}>
                <option value="normal">正常</option>
                <option value="multiply">正片疊底</option>
                <option value="screen">濾色</option>
                <option value="overlay">覆蓋</option>
                <option value="add">加法</option>
              </select>
            </div>

            <div className="prop-row">
              <span className="prop-label">顏色</span>
              <input type="color" value={active.color}
                onChange={e => updateLayer(active.id, { color: e.target.value })}
                style={{ width: 28, height: 20, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} />
            </div>

            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
              <button className={`btn-sm ${active.physicsEnabled ? 'active' : ''}`}
                onClick={() => updateLayer(active.id, { physicsEnabled: !active.physicsEnabled })}
                style={{ flex: 1, fontSize: 10 }}>
                <Shield size={10} /> 物理 {active.physicsEnabled ? 'ON' : 'OFF'}
              </button>
              <button className={`btn-sm ${active.maskEnabled ? 'active' : ''}`}
                onClick={() => updateLayer(active.id, { maskEnabled: !active.maskEnabled })}
                style={{ flex: 1, fontSize: 10 }}>
                遮罩 {active.maskEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
