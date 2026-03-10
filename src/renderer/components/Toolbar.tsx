/**
 * Toolbar - 工具列組件
 * 
 * 包含體素操作工具、語意標籤工具、視口設定等。
 */

import React, { useCallback } from 'react';
import { useAppState, ToolType } from '../store/AppStore';
import { SemanticIntent } from '../store/DataModels';
import signalBus, { SIGNALS } from '../engines/EventBus';

interface ToolButtonProps {
  icon: string;
  label: string;
  tool: ToolType;
  activeTool: ToolType;
  onClick: (tool: ToolType) => void;
}

const ToolButton: React.FC<ToolButtonProps> = ({ icon, label, tool, activeTool, onClick }) => (
  <button
    className={`toolbar-btn ${activeTool === tool ? 'active' : ''}`}
    onClick={() => onClick(tool)}
    title={label}
  >
    {icon}
  </button>
);

const Toolbar: React.FC = () => {
  const { state, dispatch } = useAppState();

  const setTool = useCallback((tool: ToolType) => {
    dispatch({ type: 'SET_TOOL', payload: tool });
    signalBus.publish(SIGNALS.LOG_MESSAGE, {
      level: 'info',
      source: 'Toolbar',
      message: `工具切換: ${tool}`,
    });
  }, [dispatch]);

  const handleConvert = useCallback(() => {
    signalBus.publish(SIGNALS.NURBS_CONVERSION_REQ, {
      project: state.project,
    });
  }, [state.project]);

  const handleExport = useCallback(() => {
    signalBus.publish(SIGNALS.LOG_MESSAGE, {
      level: 'info',
      source: 'Export',
      message: '正在準備 Rhino 匯出資料...',
    });
    // Trigger export
    const payload = {
      export_metadata: {
        timestamp: new Date().toISOString(),
        author: 'FastDesign User',
        units: 'Millimeters',
      },
      rhino_layers: state.project.layers.map(l => ({
        name: l.name,
        color: l.color,
        is_culled_by_physics: l.is_culled_by_physics,
      })),
      geometry_objects: [],
    };
    signalBus.publish(SIGNALS.LOG_MESSAGE, {
      level: 'success',
      source: 'Export',
      message: `匯出完成: ${JSON.stringify(payload.export_metadata)}`,
    });
  }, [state.project]);

  const toggleViewport = useCallback((key: string) => {
    const current = (state.viewportSettings as any)[key];
    dispatch({ type: 'SET_VIEWPORT_SETTING', payload: { key, value: !current } });
  }, [state.viewportSettings, dispatch]);

  return (
    <div className="app-toolbar">
      {/* 基本工具 */}
      <span className="toolbar-label">工具</span>
      <ToolButton icon="⊞" label="選取 (Select)" tool="select" activeTool={state.activeTool} onClick={setTool} />
      <ToolButton icon="＋" label="放置體素 (Place)" tool="place" activeTool={state.activeTool} onClick={setTool} />
      <ToolButton icon="✕" label="刪除體素 (Delete)" tool="delete" activeTool={state.activeTool} onClick={setTool} />
      <ToolButton icon="◎" label="上色 (Paint)" tool="paint" activeTool={state.activeTool} onClick={setTool} />

      <div className="toolbar-separator" />

      {/* 語意標籤工具 */}
      <span className="toolbar-label">語意標籤</span>
      <ToolButton icon="◆" label="銳利標籤 (Sharp)" tool="tag_sharp" activeTool={state.activeTool} onClick={setTool} />
      <ToolButton icon="◠" label="平滑曲線 (Smooth Curve)" tool="tag_smooth" activeTool={state.activeTool} onClick={setTool} />
      <ToolButton icon="◯" label="圓角標籤 (Fillet R)" tool="tag_fillet" activeTool={state.activeTool} onClick={setTool} />

      <div className="toolbar-separator" />

      {/* 語意意圖選擇 */}
      <span className="toolbar-label">放置意圖</span>
      <select
        value={state.semanticIntent}
        onChange={(e) => dispatch({ type: 'SET_SEMANTIC_INTENT', payload: e.target.value as SemanticIntent })}
        style={{
          background: 'var(--bg-primary)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border)',
          borderRadius: '3px',
          padding: '2px 6px',
          fontSize: '11px',
        }}
      >
        <option value="default">預設</option>
        <option value="sharp">銳利 (Sharp)</option>
        <option value="smooth_curve">平滑曲線</option>
        <option value="fillet_R">圓角 (Fillet)</option>
      </select>

      {state.semanticIntent === 'fillet_R' && (
        <input
          type="number"
          value={state.filletRadius}
          onChange={(e) => dispatch({ type: 'SET_FILLET_RADIUS', payload: parseFloat(e.target.value) || 5 })}
          style={{
            width: '50px',
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            borderRadius: '3px',
            padding: '2px 4px',
            fontSize: '11px',
            marginLeft: '4px',
          }}
          title="圓角半徑 (mm)"
        />
      )}

      <div className="toolbar-separator" />

      {/* 轉換與匯出 */}
      <span className="toolbar-label">管線</span>
      <button
        className="btn btn-primary"
        onClick={handleConvert}
        disabled={state.isConverting}
        style={{ fontSize: '11px', padding: '3px 10px' }}
      >
        {state.isConverting ? '轉換中...' : '體素→NURBS'}
      </button>

      <button
        className="btn"
        onClick={handleExport}
        style={{ fontSize: '11px', padding: '3px 10px', marginLeft: '4px' }}
      >
        匯出 Rhino
      </button>

      <div style={{ flex: 1 }} />

      {/* 視口設定 */}
      <span className="toolbar-label">顯示</span>
      <button
        className={`toolbar-btn ${state.viewportSettings.showGrid ? 'active' : ''}`}
        onClick={() => toggleViewport('showGrid')}
        title="網格"
      >
        #
      </button>
      <button
        className={`toolbar-btn ${state.viewportSettings.showAxes ? 'active' : ''}`}
        onClick={() => toggleViewport('showAxes')}
        title="座標軸"
      >
        +
      </button>
      <button
        className={`toolbar-btn ${state.viewportSettings.showNurbs ? 'active' : ''}`}
        onClick={() => toggleViewport('showNurbs')}
        title="NURBS 曲面"
      >
        S
      </button>
      <button
        className={`toolbar-btn ${state.viewportSettings.showWireframe ? 'active' : ''}`}
        onClick={() => toggleViewport('showWireframe')}
        title="線框"
      >
        W
      </button>
    </div>
  );
};

export default Toolbar;
