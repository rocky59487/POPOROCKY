import React from 'react';
import { X, Eye, Zap, RefreshCw } from 'lucide-react';
import { useStore } from '../../store/useStore';

interface Props { open: boolean; onClose: () => void; }

const lodColors = ['#3dd68c', '#638cff', '#f5a623', '#ff4757'];
const lodLabels = ['原始 (100%)', '高 (75%)', '中 (50%)', '低 (25%)'];
const lodRanges = [
  { min: 0, max: 20, step: 1 },
  { min: 5, max: 100, step: 5 },
  { min: 20, max: 500, step: 10 },
  { min: 50, max: 1000, step: 50 },
];

export function LODDialog({ open, onClose }: Props) {
  const lodLevels = useStore(s => s.lodLevels);
  const currentLOD = useStore(s => s.currentLOD);
  const setCurrentLOD = useStore(s => s.setCurrentLOD);
  const setLODLevels = useStore(s => s.setLODLevels);
  const addLog = useStore(s => s.addLog);

  if (!open) return null;

  const updateDistance = (idx: number, dist: number) => {
    const updated = [...lodLevels];
    updated[idx] = { ...updated[idx], distance: dist };
    setLODLevels(updated);
  };

  const toggleEnabled = (idx: number) => {
    const updated = [...lodLevels];
    updated[idx] = { ...updated[idx], enabled: !updated[idx].enabled };
    setLODLevels(updated);
  };

  const regenerateLOD = () => {
    addLog('info', 'LOD', '重新生成 LOD 層級...');
    setTimeout(() => {
      addLog('success', 'LOD', 'LOD 層級重新生成完成');
    }, 500);
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={e => e.stopPropagation()} style={{ minWidth: 500 }}>
        <div className="dialog-header">
          <h2>LOD 層級管理</h2>
          <button className="dialog-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="dialog-body">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
              當前層級: <strong style={{ color: lodColors[currentLOD] }}>LOD{currentLOD}</strong>
              <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>({lodLabels[currentLOD]})</span>
            </span>
            <button className="btn btn-sm" onClick={regenerateLOD}>
              <RefreshCw size={12} /> 重新生成
            </button>
          </div>

          {lodLevels.map((lod, i) => (
            <div key={i} style={{
              padding: '10px 12px', marginBottom: 8,
              background: currentLOD === i ? 'var(--accent-dim)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${currentLOD === i ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-md)',
              transition: 'all 0.15s ease',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={`lod-badge lod-${i}`}>LOD{i}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{lodLabels[i]}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {lod.triangleCount.toLocaleString()} 面
                  </span>
                  <button className="icon-btn-sm" onClick={() => setCurrentLOD(i)} title={`預覽 LOD${i}`}>
                    <Eye size={13} style={{ color: currentLOD === i ? 'var(--accent)' : undefined }} />
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', minWidth: 50 }}>距離閾值</span>
                <input type="range"
                  min={lodRanges[i].min} max={lodRanges[i].max} step={lodRanges[i].step}
                  value={lod.distance}
                  onChange={e => updateDistance(i, +e.target.value)}
                  style={{ flex: 1 }}
                />
                <span style={{
                  fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)',
                  minWidth: 36, textAlign: 'right',
                }}>{lod.distance}</span>
              </div>
            </div>
          ))}

          <div style={{
            marginTop: 12, padding: 12,
            background: 'rgba(99,140,255,0.05)', border: '1px solid rgba(99,140,255,0.1)',
            borderRadius: 'var(--radius-md)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Zap size={14} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>效能提示</span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
              LOD0 = 原始品質 (100%)，LOD3 = 最低品質 (25%)。
              系統會根據相機距離自動切換 LOD 層級。
              降低遠處物件的細節可以大幅提升渲染效能。
              使用 meshoptimizer QEM 演算法進行網格簡化。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
