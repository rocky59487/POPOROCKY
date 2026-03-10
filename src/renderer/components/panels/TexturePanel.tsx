import React, { useState } from 'react';
import { useStore } from '../../store/useStore';
import { textureEngine } from '../../engines/EngineManager';
import { Image } from 'lucide-react';

export function TexturePanel() {
  const addLog = useStore(s => s.addLog);
  const [texType, setTexType] = useState('checker');
  const [texSize, setTexSize] = useState(256);

  const genTex = () => {
    const id = textureEngine.generateProceduralTexture(
      { type: texType as any, scale: 8, color1: '#ffffff', color2: '#000000', roughness: 0.5, metallic: 0.0 },
      texSize
    );
    addLog('success', 'Texture', `已生成 ${texType} 程序貼圖 (${texSize}x${texSize}) [${id}]`);
  };

  const bake = () => {
    addLog('info', 'Texture', '貼圖烘焙功能需要選取物件');
  };

  return (
    <div className="glass-panel" style={{flex:1}}>
      <div className="panel-header"><span><Image size={12}/> 貼圖引擎</span></div>
      <div className="panel-body">
        <div className="prop-section">
          <div className="prop-section-title">程序貼圖生成</div>
          <div className="prop-row">
            <span className="prop-label">類型</span>
            <select className="input" style={{width:90}} value={texType} onChange={e=>setTexType(e.target.value)}>
              <option value="checker">棋盤格</option>
              <option value="noise">Perlin 雜訊</option>
              <option value="gradient">漸層</option>
              <option value="brick">磚塊</option>
              <option value="wood">木紋</option>
              <option value="marble">大理石</option>
            </select>
          </div>
          <div className="prop-row">
            <span className="prop-label">解析度</span>
            <select className="input" style={{width:90}} value={texSize} onChange={e=>setTexSize(+e.target.value)}>
              <option value={128}>128x128</option>
              <option value={256}>256x256</option>
              <option value={512}>512x512</option>
              <option value={1024}>1024x1024</option>
            </select>
          </div>
          <div style={{display:'flex',gap:4,marginTop:4}}>
            <button className="btn btn-primary" style={{flex:1,fontSize:10}} onClick={genTex}>生成貼圖</button>
            <button className="btn" style={{flex:1,fontSize:10}} onClick={bake}>烘焙</button>
          </div>
        </div>
        <div className="prop-section">
          <div className="prop-section-title">PBR 材質通道</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4}}>
            {['Albedo','Roughness','Metallic','Normal','AO','Height'].map(ch => (
              <div key={ch} style={{
                padding:'4px 6px',fontSize:9,borderRadius:4,
                background:'rgba(255,255,255,0.03)',border:'1px solid var(--border)',
                textAlign:'center',color:'var(--text-secondary)',cursor:'pointer'
              }}>{ch}</div>
            ))}
          </div>
        </div>
        <div className="prop-section">
          <div className="prop-section-title">UV 展開</div>
          <button className="btn" style={{width:'100%',fontSize:10,marginTop:4}}>自動 UV 展開</button>
        </div>
        <div className="prop-section">
          <div className="prop-section-title">貼圖庫</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:4}}>
            {['#808080','#c0c0c0','#8B6914','#a0a0a0','#4a90d9','#d94a4a'].map((c,i)=>(
              <div key={i} style={{width:'100%',aspectRatio:'1',background:c,borderRadius:4,cursor:'pointer',border:'1px solid var(--border)'}} title={`貼圖 ${i+1}`}/>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
