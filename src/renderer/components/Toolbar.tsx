import React from 'react';
import { useStore, ToolType, SelectMode } from '../store/useStore';
import { voxelEngine } from '../engines/VoxelEngine';
import { projectManager } from '../engines/ProjectManager';
import {
  MousePointer2, Plus, Eraser, Paintbrush, CircleDot, Waves, Droplets, Mountain,
  Ruler, Maximize2, Grid3x3, Undo2, Redo2, Link2, Anchor, Weight, Camera,
  Save, FolderOpen, FileDown, Settings, HelpCircle, Keyboard
} from 'lucide-react';

interface ToolbarProps {
  onShowPipeline?: () => void;
  onShowLOD?: () => void;
  onShowAbout?: () => void;
  onShowShortcuts?: () => void;
}

const tools: {id:ToolType;icon:any;label:string;key:string}[] = [
  {id:'select',icon:MousePointer2,label:'選取',key:'V'},
  {id:'place',icon:Plus,label:'放置',key:'B'},
  {id:'erase',icon:Eraser,label:'刪除',key:'E'},
  {id:'paint',icon:Paintbrush,label:'上色',key:'P'},
  {id:'brush',icon:CircleDot,label:'體素刷',key:'⇧B'},
  {id:'smooth',icon:Waves,label:'平滑',key:'⇧S'},
  {id:'fill',icon:Droplets,label:'填充',key:'⇧F'},
  {id:'sculpt',icon:Mountain,label:'雕刻',key:'⇧C'},
  {id:'measure',icon:Ruler,label:'測量',key:'M'},
  {id:'glue',icon:Link2,label:'黏合',key:'G'},
];

const feaTools: {id:ToolType;icon:any;label:string}[] = [
  {id:'set-support',icon:Anchor,label:'設定支撐'},
  {id:'set-load',icon:Weight,label:'施加負載'},
];

const materialOptions = [
  { id: 'concrete', label: '混凝土', color: '#808080' },
  { id: 'steel', label: '鋼材', color: '#C0C0C0' },
  { id: 'wood', label: '木材', color: '#8B4513' },
  { id: 'brick', label: '磚塊', color: '#8B3A3A' },
];

const tags: {id:ToolType;label:string;color:string}[] = [
  {id:'tag-sharp',label:'Sharp',color:'#ff4757'},
  {id:'tag-smooth',label:'Smooth',color:'#3dd68c'},
  {id:'tag-fillet',label:'Fillet',color:'#f5a623'},
];

export function Toolbar({ onShowPipeline, onShowLOD, onShowAbout, onShowShortcuts }: ToolbarProps) {
  const activeTool=useStore(s=>s.activeTool), setTool=useStore(s=>s.setTool);
  const viewMode=useStore(s=>s.viewMode), setViewMode=useStore(s=>s.setViewMode);
  const viewLayout=useStore(s=>s.viewLayout), setViewLayout=useStore(s=>s.setViewLayout);
  const selectMode=useStore(s=>s.selectMode), setSelectMode=useStore(s=>s.setSelectMode);
  const brushSize=useStore(s=>s.brushSize), setBrushSize=useStore(s=>s.setBrushSize);
  const paintColor=useStore(s=>s.paintColor), setPaintColor=useStore(s=>s.setPaintColor);
  const pipeline=useStore(s=>s.pipeline), startPipeline=useStore(s=>s.startPipeline);
  const activeVoxelMaterial=useStore(s=>s.activeVoxelMaterial), setActiveVoxelMaterial=useStore(s=>s.setActiveVoxelMaterial);
  const addLog=useStore(s=>s.addLog);

  const handleUndo = () => {
    const result = voxelEngine.undo();
    if (result) addLog('info', 'Edit', `復原 (剩餘 ${voxelEngine.getUndoCount()} 步)`);
  };
  const handleRedo = () => {
    const result = voxelEngine.redo();
    if (result) addLog('info', 'Edit', `重做 (剩餘 ${voxelEngine.getRedoCount()} 步)`);
  };

  return (
    <div className="app-toolbar-row">
      {/* File operations */}
      <div className="toolbar-group">
        <button className="btn-icon" onClick={() => projectManager.newProject()} title="新專案 (Ctrl+N)"><FileDown size={14}/></button>
        <button className="btn-icon" onClick={() => projectManager.openProject()} title="開啟專案 (Ctrl+O)"><FolderOpen size={14}/></button>
        <button className="btn-icon" onClick={() => projectManager.downloadProject()} title="儲存專案 (Ctrl+S)"><Save size={14}/></button>
      </div>
      <div className="toolbar-divider"/>

      {/* Undo/Redo */}
      <div className="toolbar-group">
        <button className="btn-icon" onClick={handleUndo} title="復原 (Ctrl+Z)" disabled={voxelEngine.getUndoCount()===0}><Undo2 size={15}/></button>
        <button className="btn-icon" onClick={handleRedo} title="重做 (Ctrl+Y)" disabled={voxelEngine.getRedoCount()===0}><Redo2 size={15}/></button>
      </div>
      <div className="toolbar-divider"/>

      {/* Main tools */}
      <div className="toolbar-group">
        {tools.map(t=>{const I=t.icon;return(
          <button key={t.id} className={`btn-icon ${activeTool===t.id?'active':''}`}
            onClick={()=>setTool(t.id)} title={`${t.label} (${t.key})`}>
            <I size={15}/>
          </button>
        );})}
      </div>
      <div className="toolbar-divider"/>

      {/* FEA tools */}
      <div className="toolbar-group">
        <span className="toolbar-label">FEA</span>
        {feaTools.map(t=>{const I=t.icon;return(
          <button key={t.id} className={`btn-icon ${activeTool===t.id?'active':''}`}
            onClick={()=>setTool(t.id)} title={t.label}>
            <I size={14}/>
          </button>
        );})}
      </div>
      <div className="toolbar-divider"/>

      {/* Material selector */}
      <div className="toolbar-group">
        <span className="toolbar-label">材質</span>
        <div style={{ display: 'flex', gap: 2 }}>
          {materialOptions.map(m => (
            <button
              key={m.id}
              className={`btn-icon ${activeVoxelMaterial === m.id ? 'active' : ''}`}
              onClick={() => setActiveVoxelMaterial(m.id)}
              title={m.label}
              style={{
                width: 20, height: 20, borderRadius: 3, padding: 0,
                background: activeVoxelMaterial === m.id ? m.color : `${m.color}66`,
                border: activeVoxelMaterial === m.id ? `2px solid ${m.color}` : '1px solid rgba(255,255,255,0.1)',
              }}
            />
          ))}
        </div>
      </div>
      <div className="toolbar-divider"/>

      {/* Semantic tags */}
      <div className="toolbar-group">
        <span className="toolbar-label">語意</span>
        {tags.map(t=>(
          <button key={t.id} className={`btn-sm ${activeTool===t.id?'active':''}`}
            onClick={()=>setTool(t.id)}
            style={{borderColor:activeTool===t.id?t.color:undefined,color:activeTool===t.id?t.color:undefined}}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="toolbar-divider"/>

      {/* Brush size */}
      <div className="toolbar-group">
        <span className="toolbar-label">刷</span>
        <input type="range" min={1} max={10} value={brushSize}
          onChange={e=>setBrushSize(+e.target.value)} style={{width:60}}
          title={`刷大小: ${brushSize}`}/>
        <span className="text-xs text-muted" style={{width:16,textAlign:'center'}}>{brushSize}</span>
      </div>
      <div className="toolbar-divider"/>

      {/* Color */}
      <div className="toolbar-group">
        <span className="toolbar-label">色</span>
        <input type="color" value={paintColor} onChange={e=>setPaintColor(e.target.value)} className="color-swatch"/>
      </div>
      <div className="toolbar-divider"/>

      {/* View mode */}
      <div className="toolbar-group">
        <button className={`btn-sm ${viewMode==='wireframe'?'active':''}`} onClick={()=>setViewMode('wireframe')}>線框</button>
        <button className={`btn-sm ${viewMode==='solid'?'active':''}`} onClick={()=>setViewMode('solid')}>實體</button>
        <button className={`btn-sm ${viewMode==='rendered'?'active':''}`} onClick={()=>setViewMode('rendered')}>渲染</button>
      </div>
      <div className="toolbar-divider"/>

      {/* Layout */}
      <div className="toolbar-group">
        <button className={`btn-icon ${viewLayout==='single'?'active':''}`} onClick={()=>setViewLayout('single')} title="單視口"><Maximize2 size={14}/></button>
        <button className={`btn-icon ${viewLayout==='quad'?'active':''}`} onClick={()=>setViewLayout('quad')} title="四視口"><Grid3x3 size={14}/></button>
      </div>
      <div className="toolbar-divider"/>

      {/* Select mode */}
      <div className="toolbar-group">
        <span className="toolbar-label">選取</span>
        {(['object','vertex','edge','face'] as SelectMode[]).map(m=>(
          <button key={m} className={`btn-sm ${selectMode===m?'active':''}`}
            onClick={()=>setSelectMode(m)}>
            {m==='object'?'物件':m==='vertex'?'點':m==='edge'?'邊':'面'}
          </button>
        ))}
      </div>

      {/* Spacer */}
      <div className="toolbar-spacer"/>

      {/* Help/Info buttons */}
      <div className="toolbar-group">
        <button className="btn-icon" onClick={onShowShortcuts} title="快捷鍵 (F1)"><Keyboard size={14}/></button>
        <button className="btn-icon" onClick={onShowAbout} title="關於"><HelpCircle size={14}/></button>
      </div>
      <div className="toolbar-divider"/>

      {/* Screenshot */}
      <div className="toolbar-group">
        <button className="btn-icon" onClick={() => projectManager.takeScreenshot()} title="截圖 (Ctrl+Shift+S)">
          <Camera size={14}/>
        </button>
      </div>
      <div className="toolbar-divider"/>

      {/* Pipeline */}
      <div className="toolbar-group">
        <button className="btn btn-primary" onClick={onShowPipeline || startPipeline}
          style={{fontSize:11}}>
          {pipeline.status==='running'?'轉換中...':'體素→NURBS'}
        </button>
      </div>
    </div>
  );
}
