import React from 'react';
import { useStore } from '../store/useStore';
import { Activity, Cpu, Triangle, Box, MousePointer2 } from 'lucide-react';

const tn: Record<string,string>={select:'選取',place:'放置',erase:'刪除',paint:'上色',brush:'體素刷',smooth:'平滑',fill:'填充',sculpt:'雕刻',measure:'測量','tag-sharp':'Sharp','tag-smooth':'Smooth','tag-fillet':'Fillet'};

export function StatusBar() {
  const fps=useStore(s=>s.fps),mem=useStore(s=>s.memoryUsage),vc=useStore(s=>s.voxels.length),tris=useStore(s=>s.triangleCount);
  const tool=useStore(s=>s.activeTool),pl=useStore(s=>s.pipeline),engines=useStore(s=>s.engines);
  const rc=engines.filter(e=>e.running).length;
  return (
    <div className="app-status-bar">
      <div className="status-section">
        <span className="status-item"><MousePointer2 size={10}/> {tn[tool]||tool}</span>
        <span className="status-divider">|</span>
        <span className="status-item"><Box size={10}/> 體素: {vc}</span>
        <span className="status-divider">|</span>
        <span className="status-item"><Triangle size={10}/> 三角面: {tris}</span>
        <span className="status-divider">|</span>
        <span className="status-item">引擎: {rc}/{engines.length}</span>
        {pl.status==='running'&&<><span className="status-divider">|</span><span className="status-item" style={{color:'var(--accent)'}}>管線: {pl.progress.toFixed(0)}%</span></>}
        {pl.status==='done'&&<><span className="status-divider">|</span><span className="status-item" style={{color:'var(--success)'}}>NURBS 已生成</span></>}
      </div>
      <div className="status-section">
        <span className="status-item" style={{color:fps>=50?'var(--success)':fps>=30?'var(--warning)':'var(--error)'}}><Activity size={10}/> {fps} FPS</span>
        <span className="status-divider">|</span>
        <span className="status-item"><Cpu size={10}/> {mem} MB</span>
        <span className="status-divider">|</span>
        <span className="status-item">FastDesign v1.0</span>
      </div>
    </div>
  );
}
