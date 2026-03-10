import React, { useCallback, useState } from 'react';
import { useStore, DEFAULT_MATERIALS } from '../../store/useStore';
import { loadEngine, MATERIAL_PRESETS, StructuralReport } from '../../engines/LoadEngine';
import { BarChart3, Anchor, ArrowDown, Play, Trash2, Eye, EyeOff, AlertTriangle, CheckCircle, FileText, Zap } from 'lucide-react';

export function LoadAnalysisPanel() {
  const voxels = useStore(s => s.voxels);
  const loadAnalysis = useStore(s => s.loadAnalysis);
  const setFEAResult = useStore(s => s.setFEAResult);
  const toggleStressOverlay = useStore(s => s.toggleStressOverlay);
  const setGravity = useStore(s => s.setGravity);
  const setGravityMagnitude = useStore(s => s.setGravityMagnitude);
  const setFEAComputing = useStore(s => s.setFEAComputing);
  const setTool = useStore(s => s.setTool);
  const addLog = useStore(s => s.addLog);
  const activeTool = useStore(s => s.activeTool);

  const [computeTime, setComputeTime] = useState<number | null>(null);
  const [report, setReport] = useState<StructuralReport | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [flashEnabled, setFlashEnabled] = useState(true);

  const supportCount = voxels.filter(v => v.isSupport).length;
  const loadCount = voxels.filter(v => v.externalLoad && (v.externalLoad.x !== 0 || v.externalLoad.y !== 0 || v.externalLoad.z !== 0)).length;

  const runFEA = useCallback(() => {
    if (voxels.length === 0) { addLog('warning', 'FEA', '沒有體素可分析'); return; }
    setFEAComputing(true);
    addLog('info', 'FEA', `開始有限元素分析: ${voxels.length} 節點...`);
    setTimeout(() => {
      const t0 = performance.now();
      loadEngine.setGravity(loadAnalysis.gravity);
      loadEngine.setGravityMagnitude(loadAnalysis.gravityMagnitude);
      try {
        const result = loadEngine.computeFEA(voxels);
        const elapsed = performance.now() - t0;
        setComputeTime(elapsed);
        setFEAResult(result);
        setFEAComputing(false);
        if (!loadAnalysis.showStressOverlay) toggleStressOverlay();
        addLog('success', 'FEA', `分析完成: ${result.totalEdges} 邊, ${result.dangerCount} 危險邊, 最大應力比 ${result.maxStressRatio.toFixed(3)} (${elapsed.toFixed(0)}ms)`);
      } catch (e: any) {
        setFEAComputing(false);
        addLog('error', 'FEA', `分析失敗: ${e.message}`);
      }
    }, 50);
  }, [voxels, loadAnalysis.gravity, loadAnalysis.gravityMagnitude]);

  const clearFEA = useCallback(() => {
    setFEAResult(null);
    setComputeTime(null);
    setReport(null);
    setShowReport(false);
    if (loadAnalysis.showStressOverlay) toggleStressOverlay();
    addLog('info', 'FEA', '已清除分析結果');
  }, [loadAnalysis.showStressOverlay]);

  const generateReport = useCallback(() => {
    const r = loadEngine.generateReport(voxels);
    setReport(r);
    setShowReport(true);
    addLog('info', 'FEA', `結構報告已生成: ${r.overallSafety === 'safe' ? '安全' : r.overallSafety === 'warning' ? '警告' : '危險'}`);
  }, [voxels]);

  const toggleFlash = useCallback(() => {
    const next = !flashEnabled;
    setFlashEnabled(next);
    loadEngine.setFlashingEnabled(next);
  }, [flashEnabled]);

  const result = loadAnalysis.result;

  return (
    <div className="glass-panel" style={{ flex: 1, overflow: 'auto' }}>
      <div className="panel-header">
        <span><BarChart3 size={12} style={{ marginRight: 4 }} /> 負載分析 (FEA)</span>
      </div>
      <div className="panel-body">
        {/* Gravity Settings */}
        <div className="prop-section">
          <div className="prop-section-title">重力設定</div>
          <div className="prop-row">
            <span className="prop-label">大小 (m/s²)</span>
            <input type="number" className="input" style={{ width: 70 }} value={loadAnalysis.gravityMagnitude}
              onChange={e => setGravityMagnitude(parseFloat(e.target.value) || 0)} step={0.1} min={0} max={100} />
          </div>
          <div className="prop-row">
            <span className="prop-label">方向</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className={`btn btn-sm ${loadAnalysis.gravity.y === -1 ? 'active' : ''}`} onClick={() => setGravity({ x: 0, y: -1, z: 0 })}>-Y</button>
              <button className={`btn btn-sm ${loadAnalysis.gravity.x === -1 ? 'active' : ''}`} onClick={() => setGravity({ x: -1, y: 0, z: 0 })}>-X</button>
              <button className={`btn btn-sm ${loadAnalysis.gravity.z === -1 ? 'active' : ''}`} onClick={() => setGravity({ x: 0, y: 0, z: -1 })}>-Z</button>
            </div>
          </div>
        </div>

        {/* Support & Load Tools */}
        <div className="prop-section">
          <div className="prop-section-title">邊界條件</div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
            <button className={`btn btn-sm ${activeTool === 'set-support' ? 'active' : ''}`} onClick={() => setTool('set-support')} style={{ flex: 1 }}>
              <Anchor size={11} /> 支撐點
            </button>
            <button className={`btn btn-sm ${activeTool === 'set-load' ? 'active' : ''}`} onClick={() => setTool('set-load')} style={{ flex: 1 }}>
              <ArrowDown size={11} /> 施加負載
            </button>
          </div>
          <div className="prop-row">
            <span className="prop-label">支撐點數</span>
            <span className="prop-value" style={{ color: supportCount > 0 ? 'var(--success)' : 'var(--text-muted)' }}>{supportCount}</span>
          </div>
          <div className="prop-row">
            <span className="prop-label">外部負載點</span>
            <span className="prop-value" style={{ color: loadCount > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>{loadCount}</span>
          </div>
        </div>

        {/* Material Presets */}
        <div className="prop-section">
          <div className="prop-section-title">材質預設庫</div>
          <select className="input" style={{ width: '100%', marginBottom: 4 }}
            value={useStore.getState().activeVoxelMaterial}
            onChange={e => useStore.getState().setActiveVoxelMaterial(e.target.value)}>
            {MATERIAL_PRESETS.map(p => (
              <option key={p.id} value={p.id}>{p.name} (E={p.material.youngModulus >= 1e9 ? `${(p.material.youngModulus / 1e9).toFixed(0)}GPa` : `${(p.material.youngModulus / 1e6).toFixed(0)}MPa`})</option>
            ))}
          </select>
          <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>
            右鍵點選體素可更換材質
          </div>
        </div>

        {/* Run Analysis */}
        <div className="prop-section">
          <div className="prop-section-title">分析控制</div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
            <button className="btn btn-sm btn-primary" onClick={runFEA} disabled={loadAnalysis.isComputing || voxels.length === 0} style={{ flex: 1 }}>
              <Play size={11} /> {loadAnalysis.isComputing ? '計算中...' : '執行分析'}
            </button>
            <button className="btn btn-sm btn-danger" onClick={clearFEA} disabled={!result} style={{ flex: 1 }}>
              <Trash2 size={11} /> 清除
            </button>
          </div>
          {result && (
            <>
              <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                <button className={`btn btn-sm ${loadAnalysis.showStressOverlay ? 'active' : ''}`} onClick={toggleStressOverlay} style={{ flex: 1 }}>
                  {loadAnalysis.showStressOverlay ? <Eye size={11} /> : <EyeOff size={11} />}
                  {loadAnalysis.showStressOverlay ? ' 隱藏覆蓋' : ' 顯示覆蓋'}
                </button>
                <button className={`btn btn-sm ${flashEnabled ? 'active' : ''}`} onClick={toggleFlash} style={{ flex: 1 }} title="超載邊閃爍動畫">
                  <Zap size={11} /> 閃爍
                </button>
              </div>
              <button className="btn btn-sm" onClick={generateReport} style={{ width: '100%', marginBottom: 6 }}>
                <FileText size={11} /> 生成結構報告
              </button>
            </>
          )}
        </div>

        {/* Results */}
        {result && (
          <div className="prop-section">
            <div className="prop-section-title">分析結果</div>
            <div className="prop-row">
              <span className="prop-label">總邊數</span>
              <span className="prop-value">{result.totalEdges}</span>
            </div>
            <div className="prop-row">
              <span className="prop-label">危險邊 (&gt;0.8)</span>
              <span className="prop-value" style={{ color: result.dangerCount > 0 ? 'var(--error)' : 'var(--success)' }}>
                {result.dangerCount > 0 ? <AlertTriangle size={10} style={{ marginRight: 2 }} /> : <CheckCircle size={10} style={{ marginRight: 2 }} />}
                {result.dangerCount}
              </span>
            </div>
            <div className="prop-row">
              <span className="prop-label">最大應力比</span>
              <span className="prop-value" style={{ color: result.maxStressRatio > 1 ? 'var(--error)' : result.maxStressRatio > 0.8 ? 'var(--warning)' : 'var(--success)' }}>
                {result.maxStressRatio.toFixed(3)}
              </span>
            </div>
            {computeTime !== null && (
              <div className="prop-row">
                <span className="prop-label">計算耗時</span>
                <span className="prop-value">{computeTime.toFixed(0)} ms</span>
              </div>
            )}
            <div style={{ marginTop: 8, padding: 6, background: 'var(--bg-input)', borderRadius: 4 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>應力色彩圖例</div>
              <div style={{ height: 12, borderRadius: 2, background: 'linear-gradient(to right, #00ff00, #ffff00, #ff0000)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                <span>安全 (0.0)</span><span>中等 (0.5)</span><span>危險 (1.0+)</span>
              </div>
            </div>
          </div>
        )}

        {/* Structural Report */}
        {showReport && report && (
          <div className="prop-section">
            <div className="prop-section-title" style={{ color: report.overallSafety === 'safe' ? 'var(--success)' : report.overallSafety === 'warning' ? 'var(--warning)' : 'var(--error)' }}>
              結構報告 — {report.overallSafety === 'safe' ? '安全' : report.overallSafety === 'warning' ? '警告' : '危險'}
            </div>
            <div style={{ fontSize: 10, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
              {report.materialBreakdown.length > 0 && (
                <div style={{ marginBottom: 4 }}>
                  <strong>材質分佈:</strong>
                  {report.materialBreakdown.map(m => (
                    <div key={m.material} style={{ paddingLeft: 8 }}>{m.material}: {m.count} 個</div>
                  ))}
                </div>
              )}
              {report.weakPoints.length > 0 && (
                <div style={{ marginBottom: 4 }}>
                  <strong>弱點位置 (前 {Math.min(report.weakPoints.length, 5)} 個):</strong>
                  {report.weakPoints.slice(0, 5).map((wp, i) => (
                    <div key={i} style={{ paddingLeft: 8, color: wp.stressRatio > 1 ? 'var(--error)' : 'var(--warning)' }}>
                      ({wp.position.x},{wp.position.y},{wp.position.z}) 比={wp.stressRatio.toFixed(3)}
                    </div>
                  ))}
                </div>
              )}
              <div>
                <strong>建議:</strong>
                {report.recommendations.map((r, i) => (
                  <div key={i} style={{ paddingLeft: 8 }}>{r}</div>
                ))}
              </div>
            </div>
          </div>
        )}

        {!result && !loadAnalysis.isComputing && (
          <div style={{ padding: 8, textAlign: 'center', fontSize: 10, color: 'var(--text-muted)' }}>
            放置體素並設定支撐點後，執行負載分析
          </div>
        )}
      </div>
    </div>
  );
}
