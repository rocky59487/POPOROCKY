import React, { useEffect, useState, useCallback } from 'react';
import { useStore, Voxel, Vec3 } from './store/useStore';
import { Toolbar } from './components/Toolbar';
import { Viewport3D } from './components/viewport/Viewport3D';
import { LayerPanel } from './components/panels/LayerPanel';
import { PropertiesPanel } from './components/panels/PropertiesPanel';
import { ConsolePanel } from './components/panels/ConsolePanel';
import { TexturePanel } from './components/panels/TexturePanel';
import { LoadAnalysisPanel } from './components/panels/LoadAnalysisPanel';
import { CommandLine } from './components/CommandLine';
import { StatusBar } from './components/StatusBar';
import { runVoxelToNURBS } from './pipeline/VoxelToNURBS';
import { voxelEngine } from './engines/VoxelEngine';
import { loadEngine, MATERIAL_PRESETS } from './engines/LoadEngine';
import eventBus from './engines/EventBus';
import { Layers, Image, BarChart3 } from 'lucide-react';

type RightTab = 'layers' | 'texture' | 'load';

/* ─── Glue Joint System ─── */
export interface GlueJoint {
  id: string;
  voxelA: Vec3;
  voxelB: Vec3;
  strength: number; // 0-1, multiplier for connection stiffness
  type: 'rigid' | 'flexible' | 'hinge';
}

export default function App() {
  const [rightTab, setRightTab] = useState<RightTab>('layers');
  const [glueJoints, setGlueJoints] = useState<GlueJoint[]>([]);
  const pipeline = useStore(s => s.pipeline);
  const voxels = useStore(s => s.voxels);
  const addLog = useStore(s => s.addLog);
  const updatePipelineStage = useStore(s => s.updatePipelineStage);
  const completePipeline = useStore(s => s.completePipeline);
  const addVoxel = useStore(s => s.addVoxel);

  // ─── Glue Joint Event Handlers ───
  useEffect(() => {
    const onGlueAdd = (data: { voxelA: Vec3; voxelB: Vec3; strength: number; type: string }) => {
      const joint: GlueJoint = {
        id: `glue_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        voxelA: data.voxelA,
        voxelB: data.voxelB,
        strength: data.strength,
        type: (data.type as GlueJoint['type']) || 'rigid',
      };
      setGlueJoints(prev => [...prev, joint]);
      addLog('success', 'Glue', `黏合 (${data.voxelA.x},${data.voxelA.y},${data.voxelA.z}) ↔ (${data.voxelB.x},${data.voxelB.y},${data.voxelB.z}) [${data.type}]`);
    };

    const onGlueRemove = (data: { voxelA: Vec3; voxelB: Vec3 }) => {
      setGlueJoints(prev => prev.filter(j =>
        !(j.voxelA.x === data.voxelA.x && j.voxelA.y === data.voxelA.y && j.voxelA.z === data.voxelA.z &&
          j.voxelB.x === data.voxelB.x && j.voxelB.y === data.voxelB.y && j.voxelB.z === data.voxelB.z) &&
        !(j.voxelA.x === data.voxelB.x && j.voxelA.y === data.voxelB.y && j.voxelA.z === data.voxelB.z &&
          j.voxelB.x === data.voxelA.x && j.voxelB.y === data.voxelA.y && j.voxelB.z === data.voxelA.z)
      ));
      addLog('info', 'Glue', `解除黏合 (${data.voxelA.x},${data.voxelA.y},${data.voxelA.z}) ↔ (${data.voxelB.x},${data.voxelB.y},${data.voxelB.z})`);
    };

    // Project save/load events
    const onProjectSave = (data: { filename: string }) => {
      const state = useStore.getState();
      const projectData = {
        version: '1.3',
        name: state.projectName,
        voxels: state.voxels,
        layers: state.layers,
        glueJoints,
        loadAnalysis: {
          gravity: state.loadAnalysis.gravity,
          gravityMagnitude: state.loadAnalysis.gravityMagnitude,
        },
        activeVoxelMaterial: state.activeVoxelMaterial,
      };
      const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${data.filename}.fdp`;
      a.click();
      URL.revokeObjectURL(url);
      addLog('success', 'File', `專案已儲存為 ${data.filename}.fdp`);
    };

    eventBus.on('glue:add', onGlueAdd);
    eventBus.on('glue:remove', onGlueRemove);
    eventBus.on('project:save', onProjectSave);

    return () => {
      eventBus.off('glue:add', onGlueAdd);
      eventBus.off('glue:remove', onGlueRemove);
      eventBus.off('project:save', onProjectSave);
    };
  }, [glueJoints, addLog]);

  // ─── Demo voxels ───
  useEffect(() => {
    addLog('info', 'System', 'FastDesign v1.3 完整版已啟動');
    addLog('info', 'System', '七大引擎已初始化（體素/語意/負載/圖層/多人/貼圖/LOD）');
    addLog('info', 'System', '指令列就緒 — 輸入 ` 或 : 聚焦，HELP 查看所有指令');
    addLog('info', 'System', 'FEA 負載引擎 (桁架分析 + CG 求解器 + 材質預設庫) 就緒');
    addLog('info', 'System', '體素引擎 (Octree + Undo/Redo + 三種刷形狀) 就緒');
    addLog('info', 'System', 'Glue Joint 黏合系統就緒');

    const concrete = MATERIAL_PRESETS.find(p => p.id === 'concrete')!.material;
    const steel = MATERIAL_PRESETS.find(p => p.id === 'steel')!.material;
    const brick = MATERIAL_PRESETS.find(p => p.id === 'brick')!.material;

    let c = 0;

    // Ground floor (concrete, support)
    for (let x = -4; x <= 4; x++) {
      for (let z = -4; z <= 4; z++) {
        const v: Voxel = {
          id: `d_${c++}`, pos: { x, y: 0, z }, color: '#808080',
          layerId: 'structure', material: { ...concrete }, isSupport: true, materialId: 'concrete',
        };
        addVoxel(v);
        voxelEngine.addVoxel(v);
      }
    }

    // Pillars (steel)
    for (const [px, pz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) {
      for (let y = 1; y <= 5; y++) {
        const v: Voxel = {
          id: `d_${c++}`, pos: { x: px, y, z: pz }, color: '#C0C0C0',
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
          id: `d_${c++}`, pos: { x, y: 6, z }, color: '#8B3A3A',
          layerId: 'decoration', material: { ...brick }, isSupport: false, materialId: 'brick',
        };
        addVoxel(v);
        voxelEngine.addVoxel(v);
      }
    }

    // Central column (concrete)
    for (let y = 1; y <= 3; y++) {
      const v: Voxel = {
        id: `d_${c++}`, pos: { x: 0, y, z: 0 }, color: '#808080',
        layerId: 'default', material: { ...concrete }, isSupport: false, materialId: 'concrete',
      };
      addVoxel(v);
      voxelEngine.addVoxel(v);
    }

    // Wood beams
    const wood = MATERIAL_PRESETS.find(p => p.id === 'wood')!.material;
    for (let x = -3; x <= 3; x++) {
      const v: Voxel = {
        id: `d_${c++}`, pos: { x, y: 3, z: 0 }, color: '#8B4513',
        layerId: 'structure', material: { ...wood }, isSupport: false, materialId: 'wood',
      };
      addVoxel(v);
      voxelEngine.addVoxel(v);
    }

    addLog('success', 'Demo', `已載入示範結構: ${c} 個體素（混凝土=灰, 鋼=銀, 磚=紅棕, 木=棕）`);
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

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Allow command line input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const s = useStore.getState();

      // Undo/Redo
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

      // Save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        eventBus.emit('project:save', { filename: s.projectName || 'project' });
        return;
      }

      // Don't process other shortcuts in first-person mode
      if (s.fpMode && e.key !== 'Escape') return;

      switch (e.key.toLowerCase()) {
        case 'v': s.setTool('select'); break;
        case 'b': e.shiftKey ? s.setTool('brush') : s.setTool('place'); break;
        case 'e': s.setTool('erase'); break;
        case 'p': s.setTool('paint'); break;
        case 'm': s.setTool('measure'); break;
        case 'g': if (!e.ctrlKey) s.toggleGrid(); break;
        case 'x': s.toggleAxes(); break;
        case '1': s.setTool('tag-sharp'); break;
        case '2': s.setTool('tag-smooth'); break;
        case '3': s.setTool('tag-fillet'); break;
        case '5': s.setViewMode('wireframe'); break;
        case '6': s.setViewMode('solid'); break;
        case '7': s.setViewMode('rendered'); break;
        case 'f': if (e.shiftKey) s.setTool('fill'); break;
        case 'delete': {
          // Delete selected voxels
          const selected = s.selectedVoxelIds;
          if (selected.length > 0) {
            selected.forEach(id => {
              const v = s.voxels.find(v => v.id === id);
              if (v) {
                s.removeVoxel(id);
                voxelEngine.removeVoxel(v.pos);
              }
            });
            s.clearSelection();
            s.addLog('info', 'Edit', `已刪除 ${selected.length} 個選取的體素`);
          }
          break;
        }
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
          <CommandLine />
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
