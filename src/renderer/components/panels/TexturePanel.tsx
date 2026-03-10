import React, { useState } from 'react';
import { useStore } from '../../store/useStore';
import { textureEngine } from '../../engines/EngineManager';
import { Image } from 'lucide-react';

export function TexturePanel() {
  const activeMaterialId=useStore(s=>s.activeMaterialId), addLog=useStore(s=>s.addLog);
  const [texType,setTexType]=useState('checker');
  const genTex=()=>{textureEngine.generateProcedural(texType);addLog('success','Texture',`已生成 ${texType} 程序貼圖`);};
  const bake=()=>{textureEngine.bakeTexture(activeMaterialId);addLog('success','Texture','貼圖烘焙完成');};
  return (
    <div className="glass-panel" style={{flex:1}}>
      <div className="panel-header"><span><Image size={12}/> 貼圖引擎</span></div>
      <div className="panel-body">
        <div className="prop-section">
          <div className="prop-section-title">程序貼圖生成</div>
          <div className="prop-row"><span className="prop-label">類型</span><select className="input" style={{width:90}} value={texType} onChange={e=>setTexType(e.target.value)}><option value="checker">棋盤格</option><option value="noise">雜訊</option><option value="gradient">漸層</option></select></div>
          <div style={{display:'flex',gap:4,marginTop:4}}><button className="btn btn-primary" style={{flex:1,fontSize:10}} onClick={genTex}>生成貼圖</button><button className="btn" style={{flex:1,fontSize:10}} onClick={bake}>烘焙</button></div>
        </div>
        <div className="prop-section">
          <div className="prop-section-title">UV 展開</div>
          <button className="btn" style={{width:'100%',fontSize:10,marginTop:4}}>自動 UV 展開</button>
        </div>
        <div className="prop-section">
          <div className="prop-section-title">貼圖庫</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:4}}>
            {['#808080','#c0c0c0','#8B6914','#a0a0a0','#4a90d9','#d94a4a'].map((c,i)=>(<div key={i} style={{width:'100%',aspectRatio:'1',background:c,borderRadius:4,cursor:'pointer',border:'1px solid var(--border)'}} title={`貼圖 ${i+1}`}/>))}
          </div>
        </div>
      </div>
    </div>
  );
}
