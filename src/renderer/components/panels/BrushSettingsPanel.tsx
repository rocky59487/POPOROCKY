import React from 'react';
import { useStore } from '../../store/useStore';
import { Circle, Square, Cylinder, Plus, Minus } from 'lucide-react';

export function BrushSettingsPanel() {
  const activeTool = useStore(s => s.activeTool);
  const brushSize = useStore(s => s.brushSize);
  const brushStrength = useStore(s => s.brushStrength);
  const brushShape = useStore(s => s.brushShape);
  const activeVoxelMaterial = useStore(s => s.activeVoxelMaterial);
  const setBrushSize = useStore(s => s.setBrushSize);
  const setBrushStrength = useStore(s => s.setBrushStrength);
  const setBrushShape = useStore(s => s.setBrushShape);
  const setActiveVoxelMaterial = useStore(s => s.setActiveVoxelMaterial);
  const setTool = useStore(s => s.setTool);

  // Only show when brush tool is active
  if (activeTool !== 'brush' && activeTool !== 'place' && activeTool !== 'erase') return null;

  const isBrush = activeTool === 'brush';
  const isErase = activeTool === 'erase';

  return (
    <div className="glass-panel" style={{ marginTop: 4 }}>
      <div className="panel-header"><span>{isBrush ? '體素刷設定' : isErase ? '橡皮擦設定' : '放置設定'}</span></div>
      <div className="panel-body" style={{ padding: '6px 8px' }}>
        {/* Brush Size */}
        <div className="prop-section">
          <div className="prop-section-title">刷子大小</div>
          <div className="prop-row">
            <span className="prop-label">大小</span>
            <div className="slider-row" style={{ flex: 1 }}>
              <input
                type="range" min={1} max={10} step={1}
                value={brushSize}
                onChange={e => setBrushSize(+e.target.value)}
              />
              <span className="text-xs" style={{ minWidth: 20, textAlign: 'right' }}>{brushSize}</span>
            </div>
          </div>
        </div>

        {/* Brush Shape */}
        {isBrush && (
          <div className="prop-section">
            <div className="prop-section-title">刷子形狀</div>
            <div style={{ display: 'flex', gap: 4, padding: '4px 0' }}>
              <button
                className={`tool-btn ${brushShape === 'sphere' ? 'active' : ''}`}
                onClick={() => setBrushShape('sphere')}
                title="球形"
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '4px 8px', fontSize: 10 }}
              >
                <Circle size={12} /> 球形
              </button>
              <button
                className={`tool-btn ${brushShape === 'cube' ? 'active' : ''}`}
                onClick={() => setBrushShape('cube')}
                title="立方"
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '4px 8px', fontSize: 10 }}
              >
                <Square size={12} /> 立方
              </button>
              <button
                className={`tool-btn ${brushShape === 'cylinder' ? 'active' : ''}`}
                onClick={() => setBrushShape('cylinder')}
                title="圓柱"
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '4px 8px', fontSize: 10 }}
              >
                <Cylinder size={12} /> 圓柱
              </button>
            </div>
          </div>
        )}

        {/* Brush Strength */}
        {isBrush && (
          <div className="prop-section">
            <div className="prop-section-title">刷子強度</div>
            <div className="prop-row">
              <span className="prop-label">強度</span>
              <div className="slider-row" style={{ flex: 1 }}>
                <input
                  type="range" min={10} max={100} step={5}
                  value={Math.round(brushStrength * 100)}
                  onChange={e => setBrushStrength(+e.target.value / 100)}
                />
                <span className="text-xs" style={{ minWidth: 30, textAlign: 'right' }}>{(brushStrength * 100).toFixed(0)}%</span>
              </div>
            </div>
          </div>
        )}

        {/* Material Selection */}
        <div className="prop-section">
          <div className="prop-section-title">當前材質</div>
          <select
            value={activeVoxelMaterial}
            onChange={e => setActiveVoxelMaterial(e.target.value)}
            style={{
              width: '100%', padding: '4px 8px', fontSize: 11,
              background: 'var(--bg-secondary)', color: 'var(--text-primary)',
              border: '1px solid var(--border)', borderRadius: 4, outline: 'none',
            }}
          >
            <option value="concrete">混凝土</option>
            <option value="steel">鋼材</option>
            <option value="wood">木材</option>
            <option value="brick">磚塊</option>
            <option value="aluminum">鋁合金</option>
            <option value="glass">玻璃</option>
          </select>
        </div>

        {/* Add/Delete Mode Toggle */}
        <div className="prop-section">
          <div className="prop-section-title">模式</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              className={`tool-btn ${activeTool !== 'erase' ? 'active' : ''}`}
              onClick={() => setTool(isBrush ? 'brush' : 'place')}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '4px 8px', fontSize: 10 }}
            >
              <Plus size={12} /> 添加模式
            </button>
            <button
              className={`tool-btn ${activeTool === 'erase' ? 'active' : ''}`}
              onClick={() => setTool('erase')}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '4px 8px', fontSize: 10 }}
            >
              <Minus size={12} /> 刪除模式
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
