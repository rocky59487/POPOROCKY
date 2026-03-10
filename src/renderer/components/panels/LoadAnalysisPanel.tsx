import React, { useCallback, useState } from 'react';
import { useStore, DEFAULT_MATERIALS } from '../../store/useStore';
import { loadEngine } from '../../engines/LoadEngine';
import { BarChart3, Anchor, ArrowDown, Play, Trash2, Eye, EyeOff, AlertTriangle, CheckCircle } from 'lucide-react';

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

  const supportCount = voxels.filter(v => v.isSupport).length;
  const loadCount = voxels.filter(v => v.externalLoad && (v.externalLoad.x !== 0 || v.externalLoad.y !== 0 || v.externalLoad.z !== 0)).length;

  const runFEA = useCallback(() => {
    if (voxels.length === 0) {
      addLog('warning', 'FEA', '沒有體素可分析');
      return;
    }

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

        if (!loadAnalysis.showStressOverlay) {
          toggleStressOverlay();
        }

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
    if (loadAnalysis.showStressOverlay) toggleStressOverlay();
    addLog('info', 'FEA', '已清除分析結果');
  }, [loadAnalysis.showStressOverlay]);

  const result = loadAnalysis.result;

  return (
    <div className="glass-panel" style={{ flex: 1 }}>
      <div className="panel-header">
        <span><BarChart3 size={12} style={{ marginRight: 4 }} /> 負載分析 (FEA)</span>
      </div>
      <div className="panel-body">
        {/* Gravity Settings */}
        <div className="prop-section">
          <div className="prop-section-title">重力設定</div>
          <div className="prop-row">
            <span className="prop-label">大小 (m/s²)</span>
            <input
              type="number" className="input" style={{ width: 70 }}
              value={loadAnalysis.gravityMagnitude}
              onChange={e => setGravityMagnitude(parseFloat(e.target.value) || 0)}
              step={0.1} min={0} max={100}
            />
          </div>
          <div className="prop-row">
            <span className="prop-label">方向</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                className={`btn btn-sm ${loadAnalysis.gravity.y === -1 ? 'active' : ''}`}
                onClick={() => setGravity({ x: 0, y: -1, z: 0 })}
              >-Y</button>
              <button
                className={`btn btn-sm ${loadAnalysis.gravity.x === -1 ? 'active' : ''}`}
                onClick={() => setGravity({ x: -1, y: 0, z: 0 })}
              >-X</button>
              <button
                className={`btn btn-sm ${loadAnalysis.gravity.z === -1 ? 'active' : ''}`}
                onClick={() => setGravity({ x: 0, y: 0, z: -1 })}
              >-Z</button>
            </div>
          </div>
        </div>

        {/* Support & Load Tools */}
        <div className="prop-section">
          <div className="prop-section-title">邊界條件</div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
            <button
              className={`btn btn-sm ${activeTool === 'set-support' ? 'active' : ''}`}
              onClick={() => setTool('set-support')}
              style={{ flex: 1 }}
            >
              <Anchor size={11} /> 設定支撐點
            </button>
            <button
              className={`btn btn-sm ${activeTool === 'set-load' ? 'active' : ''}`}
              onClick={() => setTool('set-load')}
              style={{ flex: 1 }}
            >
              <ArrowDown size={11} /> 施加負載
            </button>
          </div>
          <div className="prop-row">
            <span className="prop-label">支撐點數</span>
            <span className="prop-value" style={{ color: supportCount > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
              {supportCount}
            </span>
          </div>
          <div className="prop-row">
            <span className="prop-label">外部負載點</span>
            <span className="prop-value" style={{ color: loadCount > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
              {loadCount}
            </span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
            支撐點 = <span style={{ color: '#00ffff' }}>青色</span>，
            負載點 = <span style={{ color: '#ff00ff' }}>洋紅色</span>
          </div>
        </div>

        {/* Material */}
        <div className="prop-section">
          <div className="prop-section-title">體素材質</div>
          <div className="prop-row">
            <span className="prop-label">新體素材質</span>
            <select
              className="input" style={{ width: 90 }}
              value={useStore.getState().activeVoxelMaterial}
              onChange={e => useStore.getState().setActiveVoxelMaterial(e.target.value)}
            >
              {Object.keys(DEFAULT_MATERIALS).map(k => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Run Analysis */}
        <div className="prop-section">
          <div className="prop-section-title">分析控制</div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
            <button
              className="btn btn-sm btn-primary"
              onClick={runFEA}
              disabled={loadAnalysis.isComputing || voxels.length === 0}
              style={{ flex: 1 }}
            >
              <Play size={11} /> {loadAnalysis.isComputing ? '計算中...' : '執行分析'}
            </button>
            <button
              className="btn btn-sm btn-danger"
              onClick={clearFEA}
              disabled={!result}
              style={{ flex: 1 }}
            >
              <Trash2 size={11} /> 清除分析
            </button>
          </div>
          {result && (
            <button
              className={`btn btn-sm ${loadAnalysis.showStressOverlay ? 'active' : ''}`}
              onClick={toggleStressOverlay}
              style={{ width: '100%', marginBottom: 6 }}
            >
              {loadAnalysis.showStressOverlay ? <Eye size={11} /> : <EyeOff size={11} />}
              {loadAnalysis.showStressOverlay ? ' 隱藏應力覆蓋' : ' 顯示應力覆蓋'}
            </button>
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
              <span className="prop-label">危險邊 (比 &gt; 0.8)</span>
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

            {/* Color legend */}
            <div style={{ marginTop: 8, padding: 6, background: 'var(--bg-input)', borderRadius: 4 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>應力色彩圖例</div>
              <div style={{
                height: 12, borderRadius: 2,
                background: 'linear-gradient(to right, #00ff00, #ffff00, #ff0000)',
              }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                <span>安全 (0.0)</span>
                <span>中等 (0.5)</span>
                <span>危險 (1.0+)</span>
              </div>
            </div>
          </div>
        )}

        {!result && !loadAnalysis.isComputing && (
          <div className="text-xs text-muted" style={{ padding: 8, textAlign: 'center' }}>
            放置體素並設定支撐點後，執行負載分析
          </div>
        )}
      </div>
    </div>
  );
}
