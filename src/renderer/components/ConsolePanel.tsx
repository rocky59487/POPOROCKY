/**
 * ConsolePanel - 控制台面板組件
 * 
 * 顯示系統日誌、引擎事件、管線狀態等資訊。
 * 包含管線進度視覺化。
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAppState, LogEntry } from '../store/AppStore';
import { PipelineStage } from '../store/DataModels';

const STAGE_LABELS: Record<PipelineStage, string> = {
  idle: '就緒',
  boundary_extraction: '邊界拓撲提取',
  planar_simplification: '共面簡化',
  nurbs_fitting: 'NURBS 擬合',
  completed: '完成',
  error: '錯誤',
};

const ConsolePanel: React.FC = () => {
  const { state, dispatch } = useAppState();
  const logEndRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<'console' | 'pipeline' | 'events'>('console');

  // Auto-scroll to bottom
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.logs]);

  const formatTime = useCallback((timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-TW', { hour12: false }) + '.' + String(date.getMilliseconds()).padStart(3, '0');
  }, []);

  const handleClearLogs = useCallback(() => {
    dispatch({ type: 'CLEAR_LOGS' });
  }, [dispatch]);

  const stages: PipelineStage[] = ['boundary_extraction', 'planar_simplification', 'nurbs_fitting', 'completed'];

  return (
    <div className="bottom-panel">
      {/* Tab Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="tab-bar">
          <div
            className={`tab ${activeTab === 'console' ? 'active' : ''}`}
            onClick={() => setActiveTab('console')}
          >
            控制台
          </div>
          <div
            className={`tab ${activeTab === 'pipeline' ? 'active' : ''}`}
            onClick={() => setActiveTab('pipeline')}
          >
            演算法管線
          </div>
          <div
            className={`tab ${activeTab === 'events' ? 'active' : ''}`}
            onClick={() => setActiveTab('events')}
          >
            事件匯流排
          </div>
        </div>
        {activeTab === 'console' && (
          <button
            className="toolbar-btn"
            onClick={handleClearLogs}
            title="清除日誌"
            style={{ marginRight: '8px', fontSize: '11px' }}
          >
            清除
          </button>
        )}
      </div>

      {/* Content */}
      <div className="panel-content" style={{ flex: 1 }}>
        {activeTab === 'console' && (
          <div>
            {state.logs.length === 0 && (
              <div className="console-line" style={{ color: 'var(--text-muted)' }}>
                FastDesign 系統就緒。開始放置體素或執行演算法管線。
              </div>
            )}
            {state.logs.map((log) => (
              <div key={log.id} className={`console-line ${log.level}`}>
                <span className="timestamp">{formatTime(log.timestamp)}</span>
                <span style={{ color: 'var(--text-muted)', marginRight: '6px' }}>[{log.source}]</span>
                {log.message}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        )}

        {activeTab === 'pipeline' && (
          <div>
            {/* Pipeline Progress Visualization */}
            <div className="pipeline-progress">
              {stages.map((stage, idx) => {
                const isActive = state.pipeline.current_stage === stage;
                const isCompleted = stages.indexOf(state.pipeline.current_stage) > idx ||
                  state.pipeline.current_stage === 'completed';
                return (
                  <React.Fragment key={stage}>
                    {idx > 0 && <span className="pipeline-arrow">→</span>}
                    <div className={`pipeline-stage ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>
                      {isCompleted && !isActive ? '✓ ' : ''}
                      {STAGE_LABELS[stage]}
                    </div>
                  </React.Fragment>
                );
              })}
            </div>

            {/* Pipeline Details */}
            <div style={{ padding: '8px' }}>
              <div className="prop-row">
                <span className="prop-label">當前階段</span>
                <span className="prop-value">{STAGE_LABELS[state.pipeline.current_stage]}</span>
              </div>
              <div className="prop-row">
                <span className="prop-label">進度</span>
                <span className="prop-value">{state.pipeline.progress}%</span>
              </div>
              <div className="prop-row">
                <span className="prop-label">訊息</span>
                <span className="prop-value">{state.pipeline.message}</span>
              </div>

              {/* Progress Bar */}
              <div style={{
                marginTop: '8px',
                height: '4px',
                background: 'var(--bg-primary)',
                borderRadius: '2px',
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${state.pipeline.progress}%`,
                  height: '100%',
                  background: state.pipeline.current_stage === 'error' ? 'var(--error)' :
                              state.pipeline.current_stage === 'completed' ? 'var(--success)' : 'var(--accent)',
                  transition: 'width 0.3s ease',
                  borderRadius: '2px',
                }} />
              </div>

              {/* Pipeline Description */}
              <div style={{ marginTop: '12px', fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                <p><strong>第一階段 - 邊界拓撲提取 (Dual Contouring)</strong></p>
                <p>使用 QEF 最小化求解頂點位置，SVD 分解保證穩定性。</p>
                <p style={{ marginTop: '6px' }}><strong>第二階段 - 共面簡化與特徵線辨識</strong></p>
                <p>PCA 法向分群消除階梯效應，MLS 平滑降噪。</p>
                <p style={{ marginTop: '6px' }}><strong>第三階段 - NURBS 參數擬合</strong></p>
                <p>向心參數化 + Trust-Region Reflective 求解器。</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'events' && (
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
              星狀拓撲事件匯流排 (Star Topology Event Bus) - 即時事件監控
            </div>
            {state.logs.filter(l => l.source !== 'Console').slice(-50).map((log) => (
              <div key={log.id} className="console-line info" style={{ fontSize: '11px' }}>
                <span className="timestamp">{formatTime(log.timestamp)}</span>
                <span style={{ color: 'var(--accent)', marginRight: '6px' }}>{log.source}</span>
                → {log.message}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ConsolePanel;
