import React, { useState } from 'react';
import { X, Play, SkipForward, RotateCcw, Download, CheckCircle, Clock, AlertCircle, Loader, ChevronDown, ChevronRight, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { downloadMinecraft, MINECRAFT_FORMATS, MinecraftFormat } from '../../engines/MinecraftExporter';
import { nurbsToVoxels } from '../../pipeline/NURBSToVoxel';

interface Props { open: boolean; onClose: () => void; }

const statusIcons: Record<string, React.ReactNode> = {
  idle: <Clock size={14} style={{ color: 'var(--text-muted)' }} />,
  running: <Loader size={14} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />,
  done: <CheckCircle size={14} style={{ color: '#3dd68c' }} />,
  error: <AlertCircle size={14} style={{ color: '#ff4757' }} />,
};

const stageColors = ['#3dd68c', '#638cff', '#a78bfa', '#f472b6', '#f0932b'];

export function PipelineDialog({ open, onClose }: Props) {
  const pipeline = useStore(s => s.pipeline);
  const setPipelineParams = useStore(s => s.setPipelineParams);
  const startPipeline = useStore(s => s.startPipeline);
  const resetPipeline = useStore(s => s.resetPipeline);
  const toggleApproximateOverlay = useStore(s => s.toggleApproximateOverlay);
  const addLog = useStore(s => s.addLog);
  const [mode, setMode] = useState<'all' | 'step'>('all');
  const [expandedStage, setExpandedStage] = useState<number>(0);
  const [exportFormats, setExportFormats] = useState({ obj: true, rhino: false, step: false });
  const [mcFormat, setMcFormat] = useState<MinecraftFormat>('schem');
  const [mcExporting, setMcExporting] = useState(false);

  if (!open) return null;

  const handleRun = () => {
    startPipeline();
    addLog('info', 'Pipeline', `管線開始執行 (${mode === 'all' ? '全部' : '逐步'} 模式)`);
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

  const fittingStats = pipeline.fittingStats;
  const approxRatio = fittingStats && fittingStats.totalPatches > 0
    ? fittingStats.approximatePatches / fittingStats.totalPatches
    : 0;

  const stageConfigs = [
    {
      name: 'Dual Contouring 等值面提取',
      desc: '使用 True Dual Contouring 演算法將體素轉換為三角網格',
      params: (
        <>
          <div className="param-row">
            <label>QEF 閾值</label>
            <input type="range" min="0.001" max="0.1" step="0.001"
              value={pipeline.params.qefThreshold}
              onChange={e => setPipelineParams({ qefThreshold: +e.target.value })} />
            <span className="param-value">{pipeline.params.qefThreshold.toFixed(3)}</span>
          </div>
        </>
      ),
    },
    {
      name: 'Region Growing 分群 + PCA 參數化',
      desc: '使用法向角度增長分群，PCA 主軸投影 UV 參數化',
      params: (
        <>
          <div className="param-row">
            <label>分群角度閾值 (°)</label>
            <input type="range" min="10" max="60" step="5"
              value={pipeline.params.angleThreshold}
              onChange={e => setPipelineParams({ angleThreshold: +e.target.value })} />
            <span className="param-value">{pipeline.params.angleThreshold}°</span>
          </div>
          <div className="param-row">
            <label>簡化比例 (%)</label>
            <input type="range" min="10" max="100" step="5"
              value={Math.round(pipeline.params.pcaTolerance * 500)}
              onChange={e => setPipelineParams({ pcaTolerance: +e.target.value / 500 })} />
            <span className="param-value">{Math.round(pipeline.params.pcaTolerance * 500)}%</span>
          </div>
        </>
      ),
    },
    {
      name: 'NURBS 曲面擬合（Least Squares）',
      desc: '使用 Householder QR 求解器進行 B-Spline 曲面擬合（近似方法，非 TRF）',
      params: (
        <>
          <div className="param-row">
            <label>NURBS 階數</label>
            <div className="param-select">
              {[1, 2, 3, 4, 5].map(d => (
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
    {
      name: 'Minecraft 匯出',
      desc: '將 NURBS 曲面體素化後匯出為 Minecraft 格式（.schem / .litematic / .schematic）',
      params: (
        <>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.5 }}>
            管線：NURBS 曲面 → 表面取樣 → 體素化（含實心填充）→ Minecraft NBT
          </div>
          {MINECRAFT_FORMATS.map(fmt => (
            <div key={fmt.key} className="export-format-item">
              <label className="checkbox-label">
                <input type="radio" name="mc-format" checked={mcFormat === fmt.key}
                  onChange={() => setMcFormat(fmt.key)} />
                <span className="checkbox-custom" />
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                    {fmt.label}
                    <span style={{ fontSize: 10, color: 'var(--accent)', marginLeft: 6 }}>{fmt.mcVersion}</span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{fmt.desc}</div>
                </div>
              </label>
            </div>
          ))}
          <button
            className="btn btn-sm btn-primary"
            disabled={mcExporting || pipeline.status !== 'done'}
            onClick={async () => {
              setMcExporting(true);
              try {
                const surfaces = pipeline.result || [];
                const voxels = useStore.getState().voxels;
                if (surfaces.length > 0) {
                  const mcVoxels = nurbsToVoxels(surfaces, { sampleResolution: 64, fillInterior: true });
                  const name = useStore.getState().projectName || 'export';
                  await downloadMinecraft(mcVoxels, { format: mcFormat }, `${name}.${mcFormat === 'schem' ? 'schem' : mcFormat}`);
                  addLog('success', 'Minecraft', `已匯出 ${mcVoxels.length} 個方塊為 .${mcFormat}`);
                } else if (voxels.length > 0) {
                  const name = useStore.getState().projectName || 'export';
                  await downloadMinecraft(voxels, { format: mcFormat }, `${name}.${mcFormat === 'schem' ? 'schem' : mcFormat}`);
                  addLog('success', 'Minecraft', `已從體素匯出 ${voxels.length} 個方塊為 .${mcFormat}`);
                } else {
                  addLog('warning', 'Minecraft', '沒有 NURBS 曲面或體素可匯出');
                }
              } catch (e: any) {
                addLog('error', 'Minecraft', `匯出失敗: ${e.message}`);
              } finally {
                setMcExporting(false);
              }
            }}
            style={{ marginTop: 8, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <Download size={12} />
            {mcExporting ? '匯出中...' : '匯出 Minecraft'}
          </button>
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

          {/* Fitting Stats (shown after pipeline completes) */}
          {fittingStats && pipeline.status === 'done' && (
            <div style={{
              marginTop: 12, padding: 12,
              border: `1px solid ${approxRatio > 0.3 ? '#f0932b' : 'var(--border)'}`,
              borderRadius: 'var(--radius-md)',
              background: approxRatio > 0.3 ? 'rgba(240, 147, 43, 0.08)' : 'rgba(255,255,255,0.02)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                {approxRatio > 0.3
                  ? <AlertTriangle size={14} style={{ color: '#f0932b' }} />
                  : <CheckCircle size={14} style={{ color: '#3dd68c' }} />
                }
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                  擬合統計
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: 11 }}>
                <div style={{ color: 'var(--text-secondary)' }}>精確 patch</div>
                <div style={{ color: '#3dd68c', fontFamily: 'var(--font-mono)' }}>
                  {fittingStats.exactPatches} / {fittingStats.totalPatches}
                </div>

                <div style={{ color: 'var(--text-secondary)' }}>近似 patch</div>
                <div style={{
                  color: fittingStats.approximatePatches > 0 ? '#f0932b' : 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                }}>
                  {fittingStats.approximatePatches}
                </div>

                <div style={{ color: 'var(--text-secondary)' }}>平均最大誤差</div>
                <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                  {fittingStats.avgMaxError.toFixed(4)}
                </div>

                <div style={{ color: 'var(--text-secondary)' }}>最差 patch 誤差</div>
                <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                  {fittingStats.worstPatchError.toFixed(4)}
                </div>
              </div>

              {/* Fallback reasons */}
              {fittingStats.fallbackReasons.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Fallback 原因：</div>
                  {fittingStats.fallbackReasons.map((reason, idx) => (
                    <div key={idx} style={{
                      fontSize: 10, color: '#f0932b', padding: '2px 0',
                      fontFamily: 'var(--font-mono)',
                    }}>
                      {idx + 1}. {reason}
                    </div>
                  ))}
                </div>
              )}

              {/* Warning for high approximate ratio */}
              {approxRatio > 0.3 && (
                <div style={{
                  marginTop: 8, padding: '6px 8px',
                  background: 'rgba(240, 147, 43, 0.15)',
                  borderRadius: 4, fontSize: 10, color: '#f0932b',
                  lineHeight: 1.5,
                }}>
                  超過 30% 的 patch 使用近似模式（{(approxRatio * 100).toFixed(0)}%），
                  建議增加模型支撐點或降低解析度以改善擬合品質。
                </div>
              )}

              {/* Toggle approximate overlay button */}
              {fittingStats.approximatePatches > 0 && (
                <button
                  className="btn btn-sm"
                  onClick={toggleApproximateOverlay}
                  style={{
                    marginTop: 8, width: '100%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    background: pipeline.showApproximateOverlay ? 'rgba(240, 147, 43, 0.2)' : undefined,
                    borderColor: pipeline.showApproximateOverlay ? '#f0932b' : undefined,
                    color: pipeline.showApproximateOverlay ? '#f0932b' : undefined,
                  }}
                >
                  {pipeline.showApproximateOverlay
                    ? <><EyeOff size={12} /> 隱藏 fallback patch</>
                    : <><Eye size={12} /> 顯示 fallback patch</>
                  }
                </button>
              )}
            </div>
          )}

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
