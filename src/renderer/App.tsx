import React, { useEffect, useState } from 'react';
import { useStore } from './store/useStore';
import { Toolbar } from './components/Toolbar';
import { Viewport3D } from './components/viewport/Viewport3D';
import { LayerPanel } from './components/panels/LayerPanel';
import { PropertiesPanel } from './components/panels/PropertiesPanel';
import { ConsolePanel } from './components/panels/ConsolePanel';
import { AgentPanel } from './components/panels/AgentPanel';
import { TexturePanel } from './components/panels/TexturePanel';
import { LoadAnalysisPanel } from './components/panels/LoadAnalysisPanel';
import { StatusBar } from './components/StatusBar';
import { runVoxelToNURBS } from './pipeline/VoxelToNURBS';
import { voxelEngine } from './engines/VoxelEngine';
import { Layers, Bot, Image, BarChart3 } from 'lucide-react';

type RightTab = 'layers'|'agent'|'texture'|'load';

export default function App() {
  const [rightTab, setRightTab] = useState<RightTab>('layers');
  const pipeline=useStore(s=>s.pipeline), voxels=useStore(s=>s.voxels);
  const addLog=useStore(s=>s.addLog), updatePipelineStage=useStore(s=>s.updatePipelineStage);
  const completePipeline=useStore(s=>s.completePipeline), addVoxel=useStore(s=>s.addVoxel);

  // Demo voxels
  useEffect(()=>{
    addLog('info','System','FastDesign v1.0 完整版已啟動');
    addLog('info','System','八大引擎已初始化');
    addLog('info','System','演算法管線 (Dual Contouring → PCA → NURBS) 就緒');
    const colors=['#638cff','#4a90d9','#5b9bd5','#7eb8da'];
    let c=0;
    for(let x=-4;x<=4;x++) for(let z=-4;z<=4;z++){const v={id:`d_${c++}`,pos:{x,y:0,z},color:'#3a3a5c',layerId:'structure'};addVoxel(v);voxelEngine.addVoxel(v);}
    for(const[px,pz]of[[-3,-3],[3,-3],[-3,3],[3,3]]) for(let y=1;y<=5;y++){const v={id:`d_${c++}`,pos:{x:px,y,z:pz},color:colors[y%colors.length],layerId:'structure'};addVoxel(v);voxelEngine.addVoxel(v);}
    for(let x=-4;x<=4;x++) for(let z=-4;z<=4;z++){const v={id:`d_${c++}`,pos:{x,y:6,z},color:'#f5a623',layerId:'decoration'};addVoxel(v);voxelEngine.addVoxel(v);}
    for(let y=1;y<=3;y++){const v={id:`d_${c++}`,pos:{x:0,y,z:0},color:'#a78bfa',layerId:'default'};addVoxel(v);voxelEngine.addVoxel(v);}
    addLog('success','Demo',`已載入示範結構: ${c} 個體素`);
  },[]);

  // Pipeline execution
  useEffect(()=>{
    if(pipeline.status!=='running')return;
    (async()=>{
      try{
        const surfaces=await runVoxelToNURBS(voxels,pipeline.params,(s,st,p)=>updatePipelineStage(s,st,p),addLog);
        completePipeline(surfaces);
      }catch(e:any){addLog('error','Pipeline',`錯誤: ${e.message}`);}
    })();
  },[pipeline.status]);

  // Keyboard shortcuts
  useEffect(()=>{
    const h=(e:KeyboardEvent)=>{
      if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement)return;
      const s=useStore.getState();
      switch(e.key.toLowerCase()){
        case'v':s.setTool('select');break;case'b':e.shiftKey?s.setTool('brush'):s.setTool('place');break;
        case'e':s.setTool('erase');break;case'p':s.setTool('paint');break;case'm':s.setTool('measure');break;
        case'g':s.toggleGrid();break;case'x':s.toggleAxes();break;
        case'1':s.setTool('tag-sharp');break;case'2':s.setTool('tag-smooth');break;case'3':s.setTool('tag-fillet');break;
        case'5':s.setViewMode('wireframe');break;case'6':s.setViewMode('solid');break;case'7':s.setViewMode('rendered');break;
        case'f':if(e.shiftKey)s.setTool('fill');break;case's':if(e.shiftKey)s.setTool('smooth');break;
        case'c':if(e.shiftKey)s.setTool('sculpt');break;
      }
    };
    window.addEventListener('keydown',h);return()=>window.removeEventListener('keydown',h);
  },[]);

  return (
    <div className="app-root">
      <Toolbar/>
      <div className="app-main">
        <div className="app-sidebar left"><PropertiesPanel/></div>
        <div className="app-center">
          <div className="app-viewport"><Viewport3D/></div>
          <ConsolePanel/>
        </div>
        <div className="app-sidebar right">
          <div className="sidebar-tabs">
            <button className={`sidebar-tab ${rightTab==='layers'?'active':''}`} onClick={()=>setRightTab('layers')} title="圖層"><Layers size={14}/></button>
            <button className={`sidebar-tab ${rightTab==='agent'?'active':''}`} onClick={()=>setRightTab('agent')} title="AI 代理人"><Bot size={14}/></button>
            <button className={`sidebar-tab ${rightTab==='texture'?'active':''}`} onClick={()=>setRightTab('texture')} title="貼圖"><Image size={14}/></button>
            <button className={`sidebar-tab ${rightTab==='load'?'active':''}`} onClick={()=>setRightTab('load')} title="負載"><BarChart3 size={14}/></button>
          </div>
          <div className="sidebar-content">
            {rightTab==='layers'&&<LayerPanel/>}
            {rightTab==='agent'&&<AgentPanel/>}
            {rightTab==='texture'&&<TexturePanel/>}
            {rightTab==='load'&&<LoadAnalysisPanel/>}
          </div>
        </div>
      </div>
      <StatusBar/>
    </div>
  );
}
