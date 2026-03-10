import React, { useEffect, useState } from 'react';
import { useStore, Voxel } from './store/useStore';
import { Toolbar } from './components/Toolbar';
import { Viewport3D } from './components/viewport/Viewport3D';
import { LayerPanel } from './components/panels/LayerPanel';
import { PropertiesPanel } from './components/panels/PropertiesPanel';
import { ConsolePanel } from './components/panels/ConsolePanel';
import { TexturePanel } from './components/panels/TexturePanel';
import { LoadAnalysisPanel } from './components/panels/LoadAnalysisPanel';
import { StatusBar } from './components/StatusBar';
import { runVoxelToNURBS } from './pipeline/VoxelToNURBS';
import { voxelEngine } from './engines/VoxelEngine';
import { loadEngine, MATERIAL_PRESETS } from './engines/LoadEngine';
import { Layers, Image, BarChart3 } from 'lucide-react';

type RightTab = 'layers' | 'texture' | 'load';

export default function App() {
  const [rightTab, setRightTab] = useState<RightTab>('layers');
  const pipeline = useStore(s => s.pipeline);
  const voxels = useStore(s => s.voxels);
  const addLog = useStore(s => s.addLog);
  const updatePipelineStage = useStore(s => s.updatePipelineStage);
  const completePipeline = useStore(s => s.completePipeline);
  const addVoxel = useStore(s => s.addVoxel);

  // Demo voxels with material presets
  useEffect(() => {
    addLog('info', 'System', 'FastDesign v1.2 完整版已啟動');
    addLog('info', 'System', '七大引擎已初始化（體素/語意/負載/圖層/多人/貼圖/LOD）');
    addLog('info', 'System', '演算法管線 (Marching Cubes → QEM → NURBS) 就緒');
    addLog('info', 'System', 'FEA 負載引擎 (桁架分析 + CG 求解器 + 材質預設庫) 就緒');
    addLog('info', 'System', '體素引擎 (Octree + Undo/Redo + 三種刷形狀) 就緒');

    const concrete = MATERIAL_PRESETS.find(p => p.id === 'concrete')!.material;
    const steel = MATERIAL_PRESETS.find(p => p.id === 'steel')!.material;
    const brick = MATERIAL_PRESETS.find(p => p.id === 'brick')!.material;

    let c = 0;

    // Ground floor (concrete, support)
    for (let x = -4; x <= 4; x++) {
      for (let z = -4; z <= 4; z++) {
        const v: Voxel = {
          id: `d_${c++}`, pos: { x, y: 0, z }, color: '#3a3a5c',
          layerId: 'structure', material: { ...concrete }, isSupport: true, materialId: 'concrete',
        };
        addVoxel(v);
        voxelEngine.addVoxel(v);
      }
    }

    // Pillars (steel)
    const pillarColors = ['#638cff', '#4a90d9', '#5b9bd5', '#7eb8da'];
    for (const [px, pz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) {
      for (let y = 1; y <= 5; y++) {
        const v: Voxel = {
          id: `d_${c++}`, pos: { x: px, y, z: pz }, color: pillarColors[y % pillarColors.length],
          layerId: 'structure', material: { ...steel }, isSupport: false, materialId: 'steel',
        };
        addVoxel(v);
        voxelEngine.addVoxel(v);
      }
    }

    // Roof (brick)
    for (let x = -4; x <= 4; x++) {
      for (let z = -4; z <= 4; z++) {
        const v: Voxel = {
          id: `d_${c++}`, pos: { x, y: 6, z }, color: '#f5a623',
          layerId: 'decoration', material: { ...brick }, isSupport: false, materialId: 'brick',
        };
        addVoxel(v);
        voxelEngine.addVoxel(v);
      }
    }

    // Central column (concrete)
    for (let y = 1; y <= 3; y++) {
      const v: Voxel = {
        id: `d_${c++}`, pos: { x: 0, y, z: 0 }, color: '#a78bfa',
        layerId: 'default', material: { ...concrete }, isSupport: false, materialId: 'concrete',
      };
      addVoxel(v);
      voxelEngine.addVoxel(v);
    }

    addLog('success', 'Demo', `已載入示範結構: ${c} 個體素（地板=混凝土支撐, 柱=鋼, 屋頂=磚）`);
  }, []);

  // Pipeline execution
  useEffect(() => {
    if (pipeline.status !== 'running') return;
    (async () => {
      try {
        const surfaces = await runVoxelToNURBS(
          voxels, pipeline.params,
          (s, st, p) => updatePipelineStage(s, st, p),
          addLog
        );
        completePipeline(surfaces);
      } catch (e: any) {
        addLog('error', 'Pipeline', `錯誤: ${e.message}`);
      }
    })();
  }, [pipeline.status]);

  // Keyboard shortcuts (including Ctrl+Z/Y for undo/redo)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const s = useStore.getState();

      // Undo/Redo (works even in FP mode)
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        const result = voxelEngine.undo();
        if (result) s.addLog('info', 'Edit', `復原 (剩餘 ${voxelEngine.getUndoCount()} 步)`);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        const result = voxelEngine.redo();
        if (result) s.addLog('info', 'Edit', `重做 (剩餘 ${voxelEngine.getRedoCount()} 步)`);
        return;
      }

      // Don't process other shortcuts in first-person mode (except Escape)
      if (s.fpMode && e.key !== 'Escape') return;

      switch (e.key.toLowerCase()) {
        case 'v': s.setTool('select'); break;
        case 'b': e.shiftKey ? s.setTool('brush') : s.setTool('place'); break;
        case 'e': s.setTool('erase'); break;
        case 'p': s.setTool('paint'); break;
        case 'm': s.setTool('measure'); break;
        case 'g': s.toggleGrid(); break;
        case 'x': s.toggleAxes(); break;
        case '1': s.setTool('tag-sharp'); break;
        case '2': s.setTool('tag-smooth'); break;
        case '3': s.setTool('tag-fillet'); break;
        case '5': s.setViewMode('wireframe'); break;
        case '6': s.setViewMode('solid'); break;
        case '7': s.setViewMode('rendered'); break;
        case 'f': if (e.shiftKey) s.setTool('fill'); break;
        case 's': if (e.shiftKey) s.setTool('smooth'); break;
        case 'c': if (e.shiftKey) s.setTool('sculpt'); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="app-root">
      <Toolbar />
      <div className="app-main">
        <div className="app-sidebar left">
          <PropertiesPanel />
        </div>
        <div className="app-center">
          <div className="app-viewport">
            <Viewport3D />
          </div>
          <ConsolePanel />
        </div>
        <div className="app-sidebar right">
          <div className="sidebar-tabs">
            <button className={`sidebar-tab ${rightTab === 'layers' ? 'active' : ''}`} onClick={() => setRightTab('layers')} title="圖層"><Layers size={14} /></button>
            <button className={`sidebar-tab ${rightTab === 'texture' ? 'active' : ''}`} onClick={() => setRightTab('texture')} title="貼圖"><Image size={14} /></button>
            <button className={`sidebar-tab ${rightTab === 'load' ? 'active' : ''}`} onClick={() => setRightTab('load')} title="負載分析"><BarChart3 size={14} /></button>
          </div>
          <div className="sidebar-content">
            {rightTab === 'layers' && <LayerPanel />}
            {rightTab === 'texture' && <TexturePanel />}
            {rightTab === 'load' && <LoadAnalysisPanel />}
          </div>
        </div>
      </div>
      <StatusBar />
    </div>
  );
}
