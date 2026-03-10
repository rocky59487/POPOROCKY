/**
 * FastDesign - 主應用程式組件
 * 
 * 整合八大引擎、Event Bus、3D 視口、演算法管線。
 */

import React, { useReducer, useEffect, useCallback, useRef } from 'react';
import { AppContext, appReducer, initialState, LogEntry } from './store/AppStore';
import { PipelineStage } from './store/DataModels';
import signalBus, { SIGNALS } from './engines/EventBus';
import { voxelToNURBSPipeline } from './pipeline/VoxelToNURBS';
import { surfaceEngine } from './engines/SurfaceEngine';
import { semanticEngine } from './engines/SemanticEngine';
import { loadPhysicsEngine } from './engines/LoadPhysicsEngine';
import engineManager from './engines/EngineManager';
import Viewport3D from './components/Viewport3D';
import Toolbar from './components/Toolbar';
import LayerPanel from './components/LayerPanel';
import PropertiesPanel from './components/PropertiesPanel';
import ConsolePanel from './components/ConsolePanel';
import StatusBar from './components/StatusBar';
import { v4 as uuidv4 } from 'uuid';

const App: React.FC = () => {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const commandInputRef = useRef<HTMLInputElement>(null);
  const initialized = useRef(false);

  // Initialize engines
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Initialize all engines
    engineManager.initialize();

    // Subscribe to log messages
    signalBus.subscribe(SIGNALS.LOG_MESSAGE, (payload) => {
      const logEntry: LogEntry = {
        id: uuidv4(),
        timestamp: Date.now(),
        level: payload.level || 'info',
        source: payload.source || 'System',
        message: payload.message || '',
      };
      dispatch({ type: 'ADD_LOG', payload: logEntry });
    });

    // Subscribe to pipeline state changes
    signalBus.subscribe(SIGNALS.PIPELINE_STATE_CHANGED, (payload) => {
      dispatch({
        type: 'SET_PIPELINE_STATE',
        payload: {
          current_stage: payload.current_stage as PipelineStage,
          progress: payload.progress,
          message: payload.message,
          started_at: payload.current_stage === 'boundary_extraction' ? Date.now() : undefined,
          completed_at: payload.current_stage === 'completed' ? Date.now() : undefined,
          result: payload.result || undefined,
        },
      });

      if (payload.current_stage === 'boundary_extraction') {
        dispatch({ type: 'SET_CONVERTING', payload: true });
      }
      if (payload.current_stage === 'completed' || payload.current_stage === 'error') {
        dispatch({ type: 'SET_CONVERTING', payload: false });
      }
    });

    // Subscribe to NURBS conversion results
    signalBus.subscribe(SIGNALS.NURBS_CONVERSION_DONE, (payload) => {
      dispatch({ type: 'SET_NURBS_RESULT', payload: payload.result });
    });

    // Welcome message
    signalBus.publish(SIGNALS.LOG_MESSAGE, {
      level: 'info',
      source: 'System',
      message: 'FastDesign 次世代 3D 敏捷設計系統 v1.0.0',
    });
    signalBus.publish(SIGNALS.LOG_MESSAGE, {
      level: 'info',
      source: 'System',
      message: '星狀拓撲 Event Bus 已啟動，八大引擎就緒',
    });
    signalBus.publish(SIGNALS.LOG_MESSAGE, {
      level: 'info',
      source: 'System',
      message: '使用工具列放置體素，或輸入語意命令進行操作',
    });

    return () => {
      engineManager.shutdown();
    };
  }, []);

  // Handle semantic command input
  const handleCommandSubmit = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const input = commandInputRef.current;
      if (input && input.value.trim()) {
        const text = input.value.trim();
        signalBus.publish(SIGNALS.LOG_MESSAGE, {
          level: 'info',
          source: 'User',
          message: `> ${text}`,
        });
        signalBus.publish('raw_command_input', { text });
        input.value = '';
      }
    }
  }, []);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      <div className="app-container">
        {/* Header */}
        <div className="app-header">
          <div className="app-header-title">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" fill="none" />
            </svg>
            FastDesign
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>
              次世代 3D 敏捷設計系統
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', WebkitAppRegion: 'no-drag' } as any}>
            {/* Semantic Command Input */}
            <input
              ref={commandInputRef}
              className="prop-input"
              placeholder="輸入語意命令 (例: mk arc, fillet 5, smooth)..."
              onKeyDown={handleCommandSubmit}
              style={{
                width: '300px',
                fontSize: '12px',
                background: 'var(--bg-primary)',
              }}
            />
          </div>
        </div>

        {/* Toolbar */}
        <Toolbar />

        {/* Main Content */}
        <div className="app-main">
          {/* Left Panel - Layers */}
          <LayerPanel />

          {/* Center - 3D Viewport + Console */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <Viewport3D />
            <ConsolePanel />
          </div>

          {/* Right Panel - Properties */}
          <PropertiesPanel />
        </div>

        {/* Status Bar */}
        <StatusBar />
      </div>
    </AppContext.Provider>
  );
};

export default App;
