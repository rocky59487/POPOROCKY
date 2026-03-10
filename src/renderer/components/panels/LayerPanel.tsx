import React, { useState } from 'react';
import { useStore } from '../../store/useStore';
import { Eye, EyeOff, Lock, Unlock, Plus, Copy, Trash2, GripVertical, Shield } from 'lucide-react';

export function LayerPanel() {
  const layers=useStore(s=>s.layers), activeLayerId=useStore(s=>s.activeLayerId);
  const setActiveLayer=useStore(s=>s.setActiveLayer), updateLayer=useStore(s=>s.updateLayer);
  const addLayer=useStore(s=>s.addLayer), removeLayer=useStore(s=>s.removeLayer), duplicateLayer=useStore(s=>s.duplicateLayer);
  const [dragIdx,setDragIdx]=useState<number|null>(null);
  const handleAdd=()=>{const id=`layer_${Date.now()}`;const colors=['#638cff','#ff4757','#3dd68c','#f5a623','#a78bfa'];addLayer({id,name:`圖層 ${layers.length+1}`,color:colors[layers.length%colors.length],visible:true,locked:false,opacity:1,blendMode:'normal',order:layers.length,voxelCount:0,physicsEnabled:false,maskEnabled:false});};
  const active=layers.find(l=>l.id===activeLayerId);
  return (
    <div className="glass-panel" style={{flex:1}}>
      <div className="panel-header"><span>圖層引擎</span><div className="panel-header-actions"><button className="btn-icon" onClick={handleAdd} title="新增圖層"><Plus size={13}/></button></div></div>
      <div className="panel-body">
        {layers.map((layer,idx)=>(
          <div key={layer.id} className={`layer-item ${activeLayerId===layer.id?'active':''}`} onClick={()=>setActiveLayer(layer.id)}
            draggable onDragStart={()=>setDragIdx(idx)} onDragOver={e=>e.preventDefault()} onDrop={()=>{if(dragIdx!==null&&dragIdx!==idx)useStore.getState().reorderLayers(dragIdx,idx);setDragIdx(null);}}>
            <GripVertical size={10} style={{color:'var(--text-muted)',cursor:'grab'}}/>
            <div className="layer-color" style={{background:layer.color}}/>
            <span className="layer-name">{layer.name}</span>
            <span className="layer-count">{layer.voxelCount}</span>
            <div className="layer-actions">
              {layer.physicsEnabled&&<Shield size={10} style={{color:'var(--warning)'}}/>}
              <button className="btn-icon" style={{width:20,height:20}} onClick={e=>{e.stopPropagation();updateLayer(layer.id,{visible:!layer.visible});}}>{layer.visible?<Eye size={11}/>:<EyeOff size={11}/>}</button>
              <button className="btn-icon" style={{width:20,height:20}} onClick={e=>{e.stopPropagation();updateLayer(layer.id,{locked:!layer.locked});}}>{layer.locked?<Lock size={11}/>:<Unlock size={11}/>}</button>
              <button className="btn-icon" style={{width:20,height:20}} onClick={e=>{e.stopPropagation();duplicateLayer(layer.id);}} title="複製"><Copy size={11}/></button>
              {layers.length>1&&<button className="btn-icon" style={{width:20,height:20,color:'var(--error)'}} onClick={e=>{e.stopPropagation();removeLayer(layer.id);}} title="刪除"><Trash2 size={11}/></button>}
            </div>
          </div>
        ))}
        {active&&(
          <div style={{marginTop:8,padding:'8px 4px',borderTop:'1px solid var(--border)'}}>
            <div className="prop-section-title">圖層設定</div>
            <div className="prop-row"><span className="prop-label">不透明度</span><div className="slider-row" style={{flex:1,marginLeft:8}}><input type="range" min={0} max={100} value={active.opacity*100} onChange={e=>updateLayer(active.id,{opacity:+e.target.value/100})}/><span className="text-xs" style={{width:28}}>{Math.round(active.opacity*100)}%</span></div></div>
            <div className="prop-row"><span className="prop-label">混合模式</span><select className="input" style={{width:90}} value={active.blendMode} onChange={e=>updateLayer(active.id,{blendMode:e.target.value})}><option value="normal">正常</option><option value="multiply">正片疊底</option><option value="screen">濾色</option><option value="overlay">覆蓋</option></select></div>
            <div className="prop-row"><span className="prop-label">物理剔除</span><button className={`btn-sm ${active.physicsEnabled?'active':''}`} onClick={()=>updateLayer(active.id,{physicsEnabled:!active.physicsEnabled})}>{active.physicsEnabled?'啟用':'停用'}</button></div>
            <div className="prop-row"><span className="prop-label">遮罩</span><button className={`btn-sm ${active.maskEnabled?'active':''}`} onClick={()=>updateLayer(active.id,{maskEnabled:!active.maskEnabled})}>{active.maskEnabled?'啟用':'停用'}</button></div>
          </div>
        )}
      </div>
    </div>
  );
}
