import React from 'react';
import { useStore } from '../../store/useStore';
import { loadEngine } from '../../engines/LoadEngine';
import { BarChart3, Play } from 'lucide-react';

export function LoadAnalysisPanel() {
  const voxels=useStore(s=>s.voxels), setLoadAnalysis=useStore(s=>s.setLoadAnalysis);
  const la=useStore(s=>s.loadAnalysis), addLog=useStore(s=>s.addLog);
  const showStress=useStore(s=>s.showStressHeatmap), toggleStress=useStore(s=>s.toggleStressHeatmap);
  const run=()=>{if(!voxels.length){addLog('warning','Load','沒有體素可分析');return;}addLog('info','Load',`分析 ${voxels.length} 個體素...`);const r=loadEngine.computeStress(voxels);setLoadAnalysis(r);addLog('success','Load',`完成: SF=${r.safetyFactor.toFixed(2)}`);};
  return (
    <div className="glass-panel" style={{flex:1}}>
      <div className="panel-header"><span><BarChart3 size={12}/> 負載引擎</span></div>
      <div className="panel-body">
        <button className="btn btn-primary" style={{width:'100%',fontSize:11,marginBottom:8}} onClick={run}><Play size={11}/> 執行負載分析</button>
        {la&&(<>
          <div className="prop-section">
            <div className="prop-section-title">分析結果</div>
            <div className="prop-row"><span className="prop-label">最大應力</span><span className="prop-value">{la.maxStress.toFixed(2)} MPa</span></div>
            <div className="prop-row"><span className="prop-label">安全係數</span><span className="prop-value" style={{color:la.safetyFactor>=1.5?'var(--success)':'var(--error)'}}>{la.safetyFactor.toFixed(2)}</span></div>
            <div className="prop-row"><span className="prop-label">弱點</span><span className="prop-value">{la.weakPoints.length} 處</span></div>
          </div>
          <button className={`btn ${showStress?'btn-primary':''}`} style={{width:'100%',fontSize:10}} onClick={toggleStress}>{showStress?'隱藏':'顯示'}應力熱圖</button>
        </>)}
        {!la&&<div className="text-xs text-muted" style={{padding:8}}>放置體素後執行負載分析</div>}
      </div>
    </div>
  );
}
