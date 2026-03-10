import React, { useState } from 'react';
import { X, Play, SkipForward, RotateCcw, Download, CheckCircle, Clock, AlertCircle, Loader, ChevronDown, ChevronRight } from 'lucide-react';
import { useStore } from '../../store/useStore';

interface Props { open: boolean; onClose: () => void; }

const statusIcons: Record<string, React.ReactNode> = {
  idle: <Clock size={14} style={{ color: 'var(--text-muted)' }} />,
  running: <Loader size={14} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />,
  done: <CheckCircle size={14} style={{ color: '#3dd68c' }} />,
  error: <AlertCircle size={14} style={{ color: '#ff4757' }} />,
};

const stageColors = ['#3dd68c', '#638cff', '#a78bfa', '#f472b6'];

export function PipelineDialog({ open, onClose }: Props) {
  const pipeline = useStore(s => s.pipeline);
  const setPipelineParams = useStore(s => s.setPipelineParams);
  const startPipeline = useStore(s => s.startPipeline);
  const resetPipeline = useStore(s => s.resetPipeline);
  const addLog = useStore(s => s.addLog);
  const [mode, setMode] = useState<'all' | 'step'>('all');
  const [expandedStage, setExpandedStage] = useState<number>(0);
  const [exportFormats, setExportFormats] = useState({ obj: true, rhino: false, step: false });

  if (!open) return null;

  const handleRun = () => {
    startPipeline();
    addLog('info', 'Pipeline', `管線開始執行 (${mode === 'all' ? '全部' : '逐步'} 模式)`);
    // Simulate pipeline execution
    let progress = 0;
    const interval = setInterval(() => {
      progress += 5;
      if (progress >= 100) {
        clearInterval(interval);
        addLog('success', 'Pipeline', '管線執行完成');
      }
    }, 200);
  };

  const toggleStage = (idx: number) => {
    setExpandedStage(expandedStage === idx ? -1 : idx);
  };

  const stageConfigs = [
    {
      name: '等值面提取 (Marching Cubes)',
      desc: '將體素密度場轉換為三角網格',
      params: (
        <>
          <div className="param-row">
            <label>等值面閾值 (isoLevel)</label>
            <input type="range" min="0.1" max="0.9" step="0.05"
              value={pipeline.params.qefThreshold}
              onChange={e => setPipelineParams({ qefThreshold: +e.target.value })} />
            <span className="param-value">{pipeline.params.qefThreshold.toFixed(2)}</span>
          </div>
        </>
      ),
    },
    {
      name: 'QEM 網格簡化',
      desc: '使用 Quadric Error Metrics 簡化網格並辨識特徵線',
      params: (
        <>
          <div className="param-row">
            <label>簡化比例 (%)</label>
            <input type="range" min="10" max="100" step="5"
              value={Math.round(pipeline.params.pcaTolerance * 500)}
              onChange={e => setPipelineParams({ pcaTolerance: +e.target.value / 500 })} />
            <span className="param-value">{Math.round(pipeline.params.pcaTolerance * 500)}%</span>
          </div>
          <div className="param-row">
            <label>特徵角度閾值 (°)</label>
            <input type="range" min="5" max="90" step="5"
              value={45}
              onChange={() => {}} />
            <span className="param-value">45°</span>
          </div>
        </>
      ),
    },
    {
      name: 'NURBS 曲面擬合',
      desc: '使用 verb-nurbs 將簡化網格擬合為 B-Spline 曲面',
      params: (
        <>
          <div className="param-row">
            <label>NURBS 階數</label>
            <div className="param-select">
              {[3, 4, 5].map(d => (
                <button key={d}
                  className={`param-option ${pipeline.params.nurbsDegree === d ? 'active' : ''}`}
                  onClick={() => setPipelineParams({ nurbsDegree: d })}>
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div className="param-row">
            <label>U 方向控制點</label>
            <input type="range" min="3" max="20" step="1"
              value={pipeline.params.controlPointCount}
              onChange={e => setPipelineParams({ controlPointCount: +e.target.value })} />
            <span className="param-value">{pipeline.params.controlPointCount}</span>
          </div>
          <div className="param-row">
            <label>V 方向控制點</label>
            <input type="range" min="3" max="20" step="1"
              value={pipeline.params.controlPointCount}
              onChange={e => setPipelineParams({ controlPointCount: +e.target.value })} />
            <span className="param-value">{pipeline.params.controlPointCount}</span>
          </div>
        </>
      ),
    },
    {
      name: '匯出',
      desc: '將 NURBS 曲面匯出為各種 CAD 格式',
      params: (
        <>
          {[
            { key: 'obj' as const, label: '.OBJ (Wavefront)', desc: '通用 3D 格式' },
            { key: 'rhino' as const, label: '.3DM (Rhino)', desc: 'Rhinoceros 格式 (rhino3dm)' },
            { key: 'step' as const, label: '.STEP (ISO 10303)', desc: 'CAD 交換格式 (opencascade.js)' },
          ].map(fmt => (
            <div key={fmt.key} className="export-format-item">
              <label className="checkbox-label">
                <input type="checkbox" checked={exportFormats[fmt.key]}
                  onChange={e => setExportFormats({ ...exportFormats, [fmt.key]: e.target.checked })} />
                <span className="checkbox-custom" />
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>{fmt.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{fmt.desc}</div>
                </div>
              </label>
            </div>
          ))}
        </>
      ),
    },
  ];

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={e => e.stopPropagation()} style={{ minWidth: 520 }}>
        <div className="dialog-header">
          <h2>體素 → NURBS 管線</h2>
          <button className="dialog-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="dialog-body">
          {/* Progress Bar */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {pipeline.status === 'running' ? '執行中...' : pipeline.status === 'done' ? '完成' : '就緒'}
              </span>
              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
                {Math.round(pipeline.progress)}%
              </span>
            </div>
            <div style={{
              height: 4, background: 'var(--bg-secondary)', borderRadius: 2, overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', width: `${pipeline.progress}%`,
                background: 'linear-gradient(90deg, #3dd68c, #638cff, #a78bfa, #f472b6)',
                borderRadius: 2, transition: 'width 0.3s ease',
              }} />
            </div>
          </div>

          {/* Stages */}
          {stageConfigs.map((cfg, i) => {
            const stage = pipeline.stages[i];
            const isExpanded = expandedStage === i;
            return (
              <div key={i} style={{
                marginBottom: 6, border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)', overflow: 'hidden',
                borderColor: stage?.status === 'running' ? 'var(--accent)' : 'var(--border)',
              }}>
                <div
                  onClick={() => toggleStage(i)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                    cursor: 'pointer', background: 'rgba(255,255,255,0.02)',
                  }}
                >
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: stageColors[i] }} />
                  {stage ? statusIcons[stage.status] : statusIcons.idle}
                  <span style={{ flex: 1, fontSize: 12, color: 'var(--text-primary)' }}>{cfg.name}</span>
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                    {stage ? `${Math.round(stage.progress)}%` : '0%'}
                  </span>
                </div>
                {isExpanded && (
                  <div style={{ padding: '8px 12px 12px', borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>{cfg.desc}</div>
                    {cfg.params}
                  </div>
                )}
              </div>
            );
          })}

          {/* Controls */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                className={`btn btn-sm ${mode === 'all' ? 'btn-primary' : ''}`}
                onClick={() => setMode('all')}
              >
                <Play size={12} /> 全部
              </button>
              <button
                className={`btn btn-sm ${mode === 'step' ? 'btn-primary' : ''}`}
                onClick={() => setMode('step')}
              >
                <SkipForward size={12} /> 逐步
              </button>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn btn-sm" onClick={resetPipeline}>
                <RotateCcw size={12} /> 重置
              </button>
              <button className="btn btn-sm btn-primary" onClick={handleRun}
                disabled={pipeline.status === 'running'}>
                <Play size={12} /> {pipeline.status === 'running' ? '執行中...' : '開始執行'}
              </button>
              <button className="btn btn-sm" disabled={pipeline.status !== 'done'}>
                <Download size={12} /> 匯出
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
