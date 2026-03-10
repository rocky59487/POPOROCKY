/**
 * LayerPanel - 圖層面板組件
 * 
 * 對應架構藍圖中的「圖層引擎 (Layer & Semantic Structure Engine)」，
 * 提供 BIM 屬性深度、結構語意標籤管理。
 */

import React, { useCallback, useState } from 'react';
import { useAppState } from '../store/AppStore';
import { LayerData } from '../store/DataModels';
import { v4 as uuidv4 } from 'uuid';
import signalBus, { SIGNALS } from '../engines/EventBus';

const LayerPanel: React.FC = () => {
  const { state, dispatch } = useAppState();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLayerName, setNewLayerName] = useState('');
  const [newLayerColor, setNewLayerColor] = useState('#4ecdc4');

  const handleToggleVisibility = useCallback((layerId: string) => {
    dispatch({ type: 'TOGGLE_LAYER_VISIBILITY', payload: layerId });
    signalBus.publish(SIGNALS.LAYER_CHANGED, { layerId, action: 'toggle_visibility' });
  }, [dispatch]);

  const handleSelectLayer = useCallback((layerId: string) => {
    dispatch({ type: 'SET_ACTIVE_LAYER', payload: layerId });
  }, [dispatch]);

  const handleAddLayer = useCallback(() => {
    if (!newLayerName.trim()) return;
    const newLayer: LayerData = {
      layer_id: uuidv4(),
      name: newLayerName.trim(),
      color: newLayerColor,
      visible: true,
      locked: false,
      is_culled_by_physics: false,
      voxel_count: 0,
    };
    dispatch({ type: 'ADD_LAYER', payload: newLayer });
    signalBus.publish(SIGNALS.LAYER_CHANGED, { layerId: newLayer.layer_id, action: 'added' });
    signalBus.publish(SIGNALS.LOG_MESSAGE, {
      level: 'success',
      source: 'LayerEngine',
      message: `新增圖層: ${newLayerName}`,
    });
    setNewLayerName('');
    setShowAddForm(false);
  }, [newLayerName, newLayerColor, dispatch]);

  return (
    <div className="panel left-panel">
      <div className="panel-header">
        <span>圖層引擎</span>
        <button
          className="toolbar-btn"
          onClick={() => setShowAddForm(!showAddForm)}
          title="新增圖層"
          style={{ width: '20px', height: '20px', fontSize: '14px' }}
        >
          +
        </button>
      </div>
      <div className="panel-content">
        {/* Add Layer Form */}
        {showAddForm && (
          <div style={{ marginBottom: '10px', padding: '8px', background: 'var(--bg-primary)', borderRadius: '4px' }}>
            <input
              className="prop-input"
              placeholder="圖層名稱"
              value={newLayerName}
              onChange={(e) => setNewLayerName(e.target.value)}
              style={{ marginBottom: '6px' }}
            />
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <input
                type="color"
                value={newLayerColor}
                onChange={(e) => setNewLayerColor(e.target.value)}
                style={{ width: '30px', height: '24px', border: 'none', cursor: 'pointer' }}
              />
              <button className="btn btn-primary" onClick={handleAddLayer} style={{ flex: 1, fontSize: '11px' }}>
                新增
              </button>
            </div>
          </div>
        )}

        {/* Layer List */}
        {state.project.layers.map(layer => (
          <div
            key={layer.layer_id}
            className={`layer-item ${state.activeLayerId === layer.layer_id ? 'active' : ''}`}
            onClick={() => handleSelectLayer(layer.layer_id)}
          >
            <div className="layer-color" style={{ backgroundColor: layer.color }} />
            <span className="layer-name">{layer.name}</span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginRight: '6px' }}>
              {layer.voxel_count}
            </span>
            <span
              className="layer-visibility"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleVisibility(layer.layer_id);
              }}
              style={{ opacity: layer.visible ? 1 : 0.3 }}
            >
              {layer.visible ? '◉' : '◎'}
            </span>
          </div>
        ))}

        {/* Layer Legend */}
        <div style={{ marginTop: '16px', padding: '8px', background: 'var(--bg-primary)', borderRadius: '4px' }}>
          <div className="prop-group-title">語意標籤圖例</div>
          <div style={{ fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '10px', height: '10px', background: '#e94560', borderRadius: '2px' }} />
              <span>Sharp (銳利)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '10px', height: '10px', background: '#4ecdc4', borderRadius: '2px' }} />
              <span>Smooth Curve (平滑)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '10px', height: '10px', background: '#ffe66d', borderRadius: '2px' }} />
              <span>Fillet R (圓角)</span>
            </div>
          </div>
        </div>

        {/* Physics Culling Info */}
        <div style={{ marginTop: '10px', padding: '8px', background: 'var(--bg-primary)', borderRadius: '4px' }}>
          <div className="prop-group-title">物理剔除</div>
          {state.project.layers.filter(l => l.is_culled_by_physics).map(l => (
            <div key={l.layer_id} style={{ fontSize: '11px', color: 'var(--warning)' }}>
              {l.name} - 受物理應力剔除
            </div>
          ))}
          {state.project.layers.filter(l => l.is_culled_by_physics).length === 0 && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>無物理剔除圖層</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LayerPanel;
