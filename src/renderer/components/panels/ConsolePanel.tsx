import React, { useRef, useEffect, useState } from 'react';
import { useStore } from '../../store/useStore';
import { Terminal, Activity, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

type Tab = 'console'|'pipeline';

export function ConsolePanel() {
  const [tab, setTab] = useState<Tab>('console');
  const [collapsed, setCollapsed] = useState(false);
  const logs=useStore(s=>s.logs), clearLogs=useStore(s=>s.clearLogs);
  const pipeline=useStore(s=>s.pipeline), setPipelineParams=useStore(s=>s.setPipelineParams);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(()=>{endRef.current?.scrollIntoView({behavior:'smooth'});},[logs]);
  const lc=(l:string)=>l==='error'?'var(--error)':l==='warning'?'var(--warning)':l==='success'?'var(--success)':'var(--text-muted)';

  if(collapsed) return (<div className="glass-panel" style={{height:28,cursor:'pointer'}} onClick={()=>setCollapsed(false)}><div className="panel-header" style={{borderBottom:'none'}}><span>控制台</span><ChevronUp size={12}/></div></div>);

  return (
    <div className="glass-panel" style={{height:180,flexShrink:0}}>
      <div className="panel-header">
        <div className="tab-bar" style={{border:'none',padding:0}}>
          <div className={`tab ${tab==='console'?'active':''}`} onClick={()=>setTab('console')}><Terminal size={11}/> 控制台</div>
          <div className={`tab ${tab==='pipeline'?'active':''}`} onClick={()=>setTab('pipeline')}><Activity size={11}/> 管線</div>
        </div>
        <div className="panel-header-actions">
          {tab==='console'&&<button className="btn-icon" onClick={clearLogs} title="清除"><Trash2 size={12}/></button>}
          <button className="btn-icon" onClick={()=>setCollapsed(true)}><ChevronDown size={12}/></button>
        </div>
      </div>
      <div className="panel-body" style={{fontFamily:'monospace',fontSize:11}}>
        {tab==='console'&&(<div style={{overflowY:'auto',height:'100%'}}>
          {logs.map((log,i)=>(<div key={i} className="log-line"><span className="log-time">{new Date(log.ts).toLocaleTimeString()}</span><span className="log-level" style={{color:lc(log.level)}}>[{log.level.toUpperCase()}]</span><span className="log-source">{log.source}</span><span className="log-msg">{log.message}</span></div>))}
          <div ref={endRef}/>
        </div>)}
        {tab==='pipeline'&&(<div style={{padding:4}}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
            <span>狀態: <span style={{color:pipeline.status==='done'?'var(--success)':pipeline.status==='running'?'var(--accent)':'var(--text-muted)'}}>{pipeline.status==='idle'?'待命':pipeline.status==='running'?'執行中':'完成'}</span></span>
            <span>總進度: {pipeline.progress.toFixed(0)}%</span>
          </div>
          <div className="pipeline-progress-bar"><div className="pipeline-progress-fill" style={{width:`${pipeline.progress}%`}}/></div>
          <div style={{marginTop:8}}>
            {pipeline.stages.map((s,i)=>(<div key={i} style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
              <span className={`status-dot ${s.status==='done'?'green':s.status==='running'?'blue':'gray'}`}/>
              <span style={{flex:1,fontSize:10}}>{s.name}</span>
              <span style={{fontSize:10,color:'var(--text-muted)'}}>{s.progress.toFixed(0)}%</span>
              <div style={{width:60,height:3,background:'var(--bg-tertiary)',borderRadius:2}}><div style={{width:`${s.progress}%`,height:'100%',background:s.status==='done'?'var(--success)':s.status==='running'?'var(--accent)':'var(--text-muted)',borderRadius:2,transition:'width 0.3s'}}/></div>
            </div>))}
          </div>
          <div style={{marginTop:8,borderTop:'1px solid var(--border)',paddingTop:6}}>
            <div className="prop-section-title">管線參數</div>
            <div className="prop-row"><span className="prop-label">QEF 閾值</span><input type="number" className="input" style={{width:60}} value={pipeline.params.qefThreshold} onChange={e=>setPipelineParams({qefThreshold:+e.target.value})} step={0.001}/></div>
            <div className="prop-row"><span className="prop-label">PCA 容差</span><input type="number" className="input" style={{width:60}} value={pipeline.params.pcaTolerance} onChange={e=>setPipelineParams({pcaTolerance:+e.target.value})} step={0.01}/></div>
            <div className="prop-row"><span className="prop-label">NURBS 階數</span><input type="number" className="input" style={{width:60}} value={pipeline.params.nurbsDegree} onChange={e=>setPipelineParams({nurbsDegree:+e.target.value})} min={1} max={5}/></div>
            <div className="prop-row"><span className="prop-label">控制點數</span><input type="number" className="input" style={{width:60}} value={pipeline.params.controlPointCount} onChange={e=>setPipelineParams({controlPointCount:+e.target.value})} min={4} max={64}/></div>
          </div>
        </div>)}
      </div>
    </div>
  );
}
