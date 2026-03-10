import React, { useState } from 'react';
import { useStore } from '../../store/useStore';

type Tab = 'props'|'material'|'lod'|'load';

export function PropertiesPanel() {
  const [tab, setTab] = useState<Tab>('props');
  const engines=useStore(s=>s.engines), voxels=useStore(s=>s.voxels);
  const projectName=useStore(s=>s.projectName), version=useStore(s=>s.version);
  const materials=useStore(s=>s.materials), activeMaterialId=useStore(s=>s.activeMaterialId);
  const setActiveMaterial=useStore(s=>s.setActiveMaterial), updateMaterial=useStore(s=>s.updateMaterial);
  const lodLevels=useStore(s=>s.lodLevels), pipeline=useStore(s=>s.pipeline);
  const loadAnalysis=useStore(s=>s.loadAnalysis), showStress=useStore(s=>s.showStressHeatmap), toggleStress=useStore(s=>s.toggleStressHeatmap);
  const selectedIds=useStore(s=>s.selectedVoxelIds);
  const activeMat = materials.find(m=>m.id===activeMaterialId);

  return (
    <div className="glass-panel" style={{flex:1}}>
      <div className="panel-header"><span>屬性面板</span></div>
      <div className="tab-bar">
        <div className={`tab ${tab==='props'?'active':''}`} onClick={()=>setTab('props')}>屬性</div>
        <div className={`tab ${tab==='material'?'active':''}`} onClick={()=>setTab('material')}>材質</div>
        <div className={`tab ${tab==='lod'?'active':''}`} onClick={()=>setTab('lod')}>LOD</div>
        <div className={`tab ${tab==='load'?'active':''}`} onClick={()=>setTab('load')}>負載</div>
      </div>
      <div className="panel-body">
        {tab==='props'&&(<>
          <div className="prop-section">
            <div className="prop-section-title">專案資訊</div>
            <div className="prop-row"><span className="prop-label">專案名稱</span><span className="prop-value">{projectName}</span></div>
            <div className="prop-row"><span className="prop-label">版本</span><span className="prop-value">{version}</span></div>
            <div className="prop-row"><span className="prop-label">體素總數</span><span className="prop-value">{voxels.length}</span></div>
            <div className="prop-row"><span className="prop-label">已選取</span><span className="prop-value">{selectedIds.length}</span></div>
            <div className="prop-row"><span className="prop-label">管線狀態</span><span className="prop-value" style={{color:pipeline.status==='done'?'var(--success)':pipeline.status==='running'?'var(--accent)':'var(--text-muted)'}}>{pipeline.status==='idle'?'待命':pipeline.status==='running'?'執行中':pipeline.status==='done'?'完成':'錯誤'}</span></div>
          </div>
          <div className="prop-section">
            <div className="prop-section-title">引擎狀態</div>
            {engines.map(e=>(<div key={e.name} className="prop-row"><span className="prop-label">{e.name}</span><span><span className={`status-dot ${e.running?'green':'red'}`}/>{e.running?'運行':'停止'}</span></div>))}
          </div>
        </>)}
        {tab==='material'&&(<>
          <div className="prop-section">
            <div className="prop-section-title">PBR 材質庫</div>
            {materials.map(m=>(<div key={m.id} className={`layer-item ${activeMaterialId===m.id?'active':''}`} onClick={()=>setActiveMaterial(m.id)}><div className="color-swatch-sm" style={{background:m.albedo}}/><span className="layer-name">{m.name}</span></div>))}
          </div>
          {activeMat&&(<div className="prop-section">
            <div className="prop-section-title">材質參數</div>
            <div className="prop-row"><span className="prop-label">Albedo</span><input type="color" value={activeMat.albedo} onChange={e=>updateMaterial(activeMat.id,{albedo:e.target.value})} className="color-swatch"/></div>
            <div className="prop-row"><span className="prop-label">Roughness</span><div className="slider-row"><input type="range" min={0} max={100} value={activeMat.roughness*100} onChange={e=>updateMaterial(activeMat.id,{roughness:+e.target.value/100})}/><span className="text-xs">{activeMat.roughness.toFixed(1)}</span></div></div>
            <div className="prop-row"><span className="prop-label">Metallic</span><div className="slider-row"><input type="range" min={0} max={100} value={activeMat.metallic*100} onChange={e=>updateMaterial(activeMat.id,{metallic:+e.target.value/100})}/><span className="text-xs">{activeMat.metallic.toFixed(1)}</span></div></div>
            <div className="prop-row"><span className="prop-label">Normal</span><div className="slider-row"><input type="range" min={0} max={200} value={activeMat.normalScale*100} onChange={e=>updateMaterial(activeMat.id,{normalScale:+e.target.value/100})}/><span className="text-xs">{activeMat.normalScale.toFixed(1)}</span></div></div>
            <div className="prop-row"><span className="prop-label">AO</span><div className="slider-row"><input type="range" min={0} max={100} value={activeMat.aoIntensity*100} onChange={e=>updateMaterial(activeMat.id,{aoIntensity:+e.target.value/100})}/><span className="text-xs">{activeMat.aoIntensity.toFixed(1)}</span></div></div>
          </div>)}
        </>)}
        {tab==='lod'&&(<div className="prop-section">
          <div className="prop-section-title">LOD 層級管理</div>
          {lodLevels.map((l,i)=>(<div key={i} className="prop-row" style={{flexDirection:'column',alignItems:'stretch',gap:4}}>
            <div style={{display:'flex',justifyContent:'space-between'}}><span className="prop-label">Level {l.level}</span><span className={`text-xs ${l.enabled?'text-success':'text-muted'}`}>{l.enabled?'啟用':'停用'}</span></div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'var(--text-muted)'}}><span>距離: {l.distance}m</span><span>三角面: {l.triangleCount}</span></div>
          </div>))}
        </div>)}
        {tab==='load'&&(<div className="prop-section">
          <div className="prop-section-title">負載分析</div>
          {loadAnalysis?(<>
            <div className="prop-row"><span className="prop-label">最大應力</span><span className="prop-value">{loadAnalysis.maxStress.toFixed(2)} MPa</span></div>
            <div className="prop-row"><span className="prop-label">安全係數</span><span className="prop-value" style={{color:loadAnalysis.safetyFactor>=1.5?'var(--success)':'var(--error)'}}>{loadAnalysis.safetyFactor.toFixed(2)}</span></div>
            <div className="prop-row"><span className="prop-label">弱點數</span><span className="prop-value">{loadAnalysis.weakPoints.length}</span></div>
            <div className="prop-row"><span className="prop-label">應力熱圖</span><button className={`btn-sm ${showStress?'active':''}`} onClick={toggleStress}>{showStress?'顯示':'隱藏'}</button></div>
          </>):(<div className="text-xs text-muted" style={{padding:8}}>尚未執行負載分析</div>)}
        </div>)}
      </div>
    </div>
  );
}
