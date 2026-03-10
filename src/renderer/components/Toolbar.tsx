import React from 'react';
import { useStore, ToolType, SelectMode } from '../store/useStore';
import { MousePointer2, Plus, Eraser, Paintbrush, CircleDot, Waves, Droplets, Mountain, Ruler, Maximize2, Grid3x3 } from 'lucide-react';

const tools: {id:ToolType;icon:any;label:string;key:string}[] = [
  {id:'select',icon:MousePointer2,label:'選取',key:'V'},{id:'place',icon:Plus,label:'放置',key:'B'},
  {id:'erase',icon:Eraser,label:'刪除',key:'E'},{id:'paint',icon:Paintbrush,label:'上色',key:'P'},
  {id:'brush',icon:CircleDot,label:'體素刷',key:'⇧B'},{id:'smooth',icon:Waves,label:'平滑',key:'⇧S'},
  {id:'fill',icon:Droplets,label:'填充',key:'⇧F'},{id:'sculpt',icon:Mountain,label:'雕刻',key:'⇧C'},
  {id:'measure',icon:Ruler,label:'測量',key:'M'},
];
const tags: {id:ToolType;label:string;color:string}[] = [
  {id:'tag-sharp',label:'Sharp',color:'#ff4757'},{id:'tag-smooth',label:'Smooth',color:'#3dd68c'},{id:'tag-fillet',label:'Fillet',color:'#f5a623'},
];

export function Toolbar() {
  const activeTool=useStore(s=>s.activeTool), setTool=useStore(s=>s.setTool);
  const viewMode=useStore(s=>s.viewMode), setViewMode=useStore(s=>s.setViewMode);
  const viewLayout=useStore(s=>s.viewLayout), setViewLayout=useStore(s=>s.setViewLayout);
  const selectMode=useStore(s=>s.selectMode), setSelectMode=useStore(s=>s.setSelectMode);
  const brushSize=useStore(s=>s.brushSize), setBrushSize=useStore(s=>s.setBrushSize);
  const paintColor=useStore(s=>s.paintColor), setPaintColor=useStore(s=>s.setPaintColor);
  const pipeline=useStore(s=>s.pipeline), startPipeline=useStore(s=>s.startPipeline);

  return (
    <div className="app-toolbar-row">
      <div className="toolbar-group">
        {tools.map(t=>{const I=t.icon;return(<button key={t.id} className={`btn-icon ${activeTool===t.id?'active':''}`} onClick={()=>setTool(t.id)} title={`${t.label} (${t.key})`}><I size={15}/></button>);})}
      </div>
      <div className="toolbar-divider"/>
      <div className="toolbar-group">
        <span className="toolbar-label">語意</span>
        {tags.map(t=>(<button key={t.id} className={`btn-sm ${activeTool===t.id?'active':''}`} onClick={()=>setTool(t.id)} style={{borderColor:activeTool===t.id?t.color:undefined,color:activeTool===t.id?t.color:undefined}}>{t.label}</button>))}
      </div>
      <div className="toolbar-divider"/>
      <div className="toolbar-group">
        <span className="toolbar-label">刷</span>
        <input type="range" min={1} max={10} value={brushSize} onChange={e=>setBrushSize(+e.target.value)} style={{width:60}} title={`刷大小: ${brushSize}`}/>
        <span className="text-xs text-muted" style={{width:16,textAlign:'center'}}>{brushSize}</span>
      </div>
      <div className="toolbar-divider"/>
      <div className="toolbar-group">
        <span className="toolbar-label">色</span>
        <input type="color" value={paintColor} onChange={e=>setPaintColor(e.target.value)} className="color-swatch"/>
      </div>
      <div className="toolbar-divider"/>
      <div className="toolbar-group">
        <button className={`btn-sm ${viewMode==='wireframe'?'active':''}`} onClick={()=>setViewMode('wireframe')}>線框</button>
        <button className={`btn-sm ${viewMode==='solid'?'active':''}`} onClick={()=>setViewMode('solid')}>實體</button>
        <button className={`btn-sm ${viewMode==='rendered'?'active':''}`} onClick={()=>setViewMode('rendered')}>渲染</button>
      </div>
      <div className="toolbar-divider"/>
      <div className="toolbar-group">
        <button className={`btn-icon ${viewLayout==='single'?'active':''}`} onClick={()=>setViewLayout('single')} title="單視口"><Maximize2 size={14}/></button>
        <button className={`btn-icon ${viewLayout==='quad'?'active':''}`} onClick={()=>setViewLayout('quad')} title="四視口"><Grid3x3 size={14}/></button>
      </div>
      <div className="toolbar-divider"/>
      <div className="toolbar-group">
        <span className="toolbar-label">選取</span>
        {(['object','vertex','edge','face'] as SelectMode[]).map(m=>(<button key={m} className={`btn-sm ${selectMode===m?'active':''}`} onClick={()=>setSelectMode(m)}>{m==='object'?'物件':m==='vertex'?'點':m==='edge'?'邊':'面'}</button>))}
      </div>
      <div className="toolbar-spacer"/>
      <div className="toolbar-group">
        <button className="btn btn-primary" onClick={startPipeline} disabled={pipeline.status==='running'} style={{fontSize:11}}>
          {pipeline.status==='running'?'轉換中...':'體素→NURBS'}
        </button>
      </div>
    </div>
  );
}
