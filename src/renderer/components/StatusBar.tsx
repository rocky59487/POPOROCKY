/**
 * StatusBar - 狀態列組件
 */

import React, { useMemo } from 'react';
import { useAppState } from '../store/AppStore';

const TOOL_LABELS: Record<string, string> = {
  select: '選取',
  place: '放置體素',
  delete: '刪除體素',
  paint: '上色',
  tag_sharp: '標記銳利',
  tag_smooth: '標記平滑',
  tag_fillet: '標記圓角',
  measure: '測量',
};

const StatusBar: React.FC = () => {
  const { state } = useAppState();

  const activeEngines = useMemo(() => {
    return Object.values(state.engineStatus).filter(Boolean).length;
  }, [state.engineStatus]);

  const totalVoxels = useMemo(() => {
    return state.project.chunks.reduce((sum, c) => sum + c.active_voxels.length, 0);
  }, [state.project.chunks]);

  return (
    <div className="status-bar">
      <div className="status-bar-left">
        <div className="status-indicator">
          <span className="status-dot green" />
          <span>系統就緒</span>
        </div>
        <span>工具: {TOOL_LABELS[state.activeTool] || state.activeTool}</span>
        <span>圖層: {state.project.layers.find(l => l.layer_id === state.activeLayerId)?.name || '-'}</span>
        {state.semanticIntent !== 'default' && (
          <span style={{ color: 'var(--warning)' }}>語意: {state.semanticIntent}</span>
        )}
      </div>
      <div className="status-bar-right">
        <span>體素: {totalVoxels}</span>
        <span>區塊: {state.project.chunks.length}</span>
        <span>引擎: {activeEngines}/8</span>
        <span>v{state.project.sync_version}</span>
      </div>
    </div>
  );
};

export default StatusBar;
