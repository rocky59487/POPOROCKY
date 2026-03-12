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
import { AboutDialog } from './components/dialogs/AboutDialog';
import { ShortcutsDialog } from './components/dialogs/ShortcutsDialog';
import { PipelineDialog } from './components/dialogs/PipelineDialog';
import { LODDialog } from './components/dialogs/LODDialog';
import { runVoxelToNURBS } from './pipeline/VoxelToNURBS';
import { voxelEngine } from './engines/VoxelEngine';
import { loadEngine, MATERIAL_PRESETS } from './engines/LoadEngine';
import { projectManager } from './engines/ProjectManager';
import { OBJExporter } from './engines/OBJExporter';
import { glueEngine } from './engines/GlueEngine';
import eventBus from './engines/EventBus';
import { Layers, Image, BarChart3 } from 'lucide-react';
import { SceneStatsPanel } from './components/panels/SceneStatsPanel';
import { BrushSettingsPanel } from './components/panels/BrushSettingsPanel';
import { TemplateLibrary } from './components/panels/TemplateLibrary';
import { AnalysisTimeline } from './components/panels/AnalysisTimeline';
import { ContextMenu } from './components/ContextMenu';
import { MaterialEditor } from './components/panels/MaterialEditor';
import { IntegrityCheck } from './components/panels/IntegrityCheck';
import { WelcomeScreen } from './components/WelcomeScreen';
import { VoxelSearch } from './components/panels/VoxelSearch';

type RightTab = 'layers' | 'texture' | 'load';

export default function App() {
  const [rightTab, setRightTab] = useState<RightTab>('layers');
  const [showAbout, setShowAbout] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showPipeline, setShowPipeline] = useState(false);
  const [showLOD, setShowLOD] = useState(false);
  const [showWelcome, setShowWelcome] = useState(() => {
    return localStorage.getItem('fd-hide-welcome') !== 'true';
  });
  const pipeline = useStore(s => s.pipeline);
  const voxels = useStore(s => s.voxels);
  const addLog = useStore(s => s.addLog);
  const updatePipelineStage = useStore(s => s.updatePipelineStage);
  const completePipeline = useStore(s => s.completePipeline);
  const addVoxel = useStore(s => s.addVoxel);
  const addGlueJoint = useStore(s => s.addGlueJoint);
  const removeGlueJoint = useStore(s => s.removeGlueJoint);
  const clearGlueJoints = useStore(s => s.clearGlueJoints);
  const markDirty = useStore(s => s.markDirty);

  // ─── IPC from Electron menu ───
  useEffect(() => {
    const w = window as any;
    if (w.electronAPI) {
      w.electronAPI.onMenuAction?.((action: string) => {
        switch (action) {
          case 'about': setShowAbout(true); break;
          case 'shortcuts': setShowShortcuts(true); break;
          case 'pipeline': setShowPipeline(true); break;
          case 'lod': setShowLOD(true); break;
          case 'new-project': projectManager.newProject(); break;
          case 'open-project': projectManager.openProject(); break;
          case 'save-project': projectManager.downloadProject(); break;
          case 'screenshot': projectManager.takeScreenshot(); break;
          case 'export-obj': OBJExporter.downloadOBJ(); break;
        }
      });
    }
  }, []);

  // ─── Export Event Handlers ───
  useEffect(() => {
    const onExport = (data: { format: string; filename: string }) => {
      switch (data.format) {
        case 'OBJ': OBJExporter.downloadOBJ(); break;
        case 'MTL': OBJExporter.downloadMTL(); break;
        case 'JSON': projectManager.downloadProject(); break;
        default: addLog('warning', 'Export', `不支援的格式: ${data.format}`);
      }
    };
    const onSave = () => { projectManager.downloadProject(); };
    const onLoad = () => { projectManager.openProject(); };

    eventBus.on('export:request', onExport);
    eventBus.on('project:save', onSave);
    eventBus.on('project:load', onLoad);
    return () => {
      eventBus.off('export:request', onExport);
      eventBus.off('project:save', onSave);
      eventBus.off('project:load', onLoad);
    };
  }, [addLog]);

  // ─── Glue Joint Event Handlers ───
  useEffect(() => {
    const onGlueAdd = (data: { id: string; voxelA: Vec3; voxelB: Vec3; strength: number; type: string }) => {
      addGlueJoint({
        id: data.id || `gj_${Date.now()}`,
        voxelA: data.voxelA, voxelB: data.voxelB,
        type: data.type || 'rigid', strength: data.strength || 1.0,
      });
    };
    const onGlueRemove = (data: { voxelA: Vec3; voxelB: Vec3 }) => {
      const state = useStore.getState();
      const joint = state.glueJoints.find(j =>
        (j.voxelA.x === data.voxelA.x && j.voxelA.y === data.voxelA.y && j.voxelA.z === data.voxelA.z &&
         j.voxelB.x === data.voxelB.x && j.voxelB.y === data.voxelB.y && j.voxelB.z === data.voxelB.z) ||
        (j.voxelA.x === data.voxelB.x && j.voxelA.y === data.voxelB.y && j.voxelA.z === data.voxelB.z &&
         j.voxelB.x === data.voxelA.x && j.voxelB.y === data.voxelA.y && j.voxelB.z === data.voxelA.z)
      );
      if (joint) removeGlueJoint(joint.id);
    };
    const onGlueClear = () => { clearGlueJoints(); };

    eventBus.on('glue:add', onGlueAdd);
    eventBus.on('glue:remove', onGlueRemove);
    eventBus.on('glue:clear', onGlueClear);
    return () => {
      eventBus.off('glue:add', onGlueAdd);
      eventBus.off('glue:remove', onGlueRemove);
      eventBus.off('glue:clear', onGlueClear);
    };
  }, [addGlueJoint, removeGlueJoint, clearGlueJoints]);

  // ─── Init + Demo voxels + Auto-save ───
  useEffect(() => {
    addLog('info', 'System', 'FastDesign v1.9 完整版已啟動');
    addLog('info', 'System', '七大引擎已初始化（體素/語意/負載/圖層/多人/貼圖/LOD）');
    addLog('info', 'System', '指令列就緒 — 輸入 ` 或 : 聚焦，HELP 查看所有指令');
    addLog('info', 'System', '30+ 指令可用：BOX/SPHERE/CYLINDER/COPY/MOVE/MIRROR/ROTATE/SELECT/MATERIAL/COLOR...');
    addLog('info', 'System', 'FEA 負載引擎 + Glue 黏合系統 + OBJ 匯出引擎就緒');

    projectManager.startAutoSave();

    if (projectManager.checkAutoSaveRecovery()) {
      addLog('warning', 'AutoSave', '偵測到未儲存的自動備份');
    }

    const concrete = MATERIAL_PRESETS.find(p => p.id === 'concrete')!.material;
    const steel = MATERIAL_PRESETS.find(p => p.id === 'steel')!.material;
    const brick = MATERIAL_PRESETS.find(p => p.id === 'brick')!.material;
    const wood = MATERIAL_PRESETS.find(p => p.id === 'wood')!.material;

    let c = 0;

    // Ground floor (concrete, support)
    for (let x = -4; x <= 4; x++) {
      for (let z = -4; z <= 4; z++) {
        const v: Voxel = {
          id: `d_${c++}`, pos: { x, y: 0, z }, color: '#808080',
          layerId: 'structure', material: { ...concrete }, isSupport: true, materialId: 'concrete',
        };
        addVoxel(v); voxelEngine.addVoxel(v);
      }
    }

    // Pillars (steel)
    for (const [px, pz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) {
      for (let y = 1; y <= 5; y++) {
        const v: Voxel = {
          id: `d_${c++}`, pos: { x: px, y, z: pz }, color: '#C0C0C0',
          layerId: 'structure', material: { ...steel }, isSupport: false, materialId: 'steel',
        };
        addVoxel(v); voxelEngine.addVoxel(v);
      }
    }

    // Roof (brick)
    for (let x = -4; x <= 4; x++) {
      for (let z = -4; z <= 4; z++) {
        const v: Voxel = {
          id: `d_${c++}`, pos: { x, y: 6, z }, color: '#8B3A3A',
          layerId: 'decoration', material: { ...brick }, isSupport: false, materialId: 'brick',
        };
        addVoxel(v); voxelEngine.addVoxel(v);
      }
    }

    // Central column (concrete)
    for (let y = 1; y <= 3; y++) {
      const v: Voxel = {
        id: `d_${c++}`, pos: { x: 0, y, z: 0 }, color: '#808080',
        layerId: 'default', material: { ...concrete }, isSupport: false, materialId: 'concrete',
      };
      addVoxel(v); voxelEngine.addVoxel(v);
    }

    // Wood beams
    for (let x = -3; x <= 3; x++) {
      const v: Voxel = {
        id: `d_${c++}`, pos: { x, y: 3, z: 0 }, color: '#8B4513',
        layerId: 'structure', material: { ...wood }, isSupport: false, materialId: 'wood',
      };
      addVoxel(v); voxelEngine.addVoxel(v);
    }

    addLog('success', 'Demo', `已載入示範結構: ${c} 個體素（混凝土=灰, 鋼=銀, 磚=紅棕, 木=棕）`);

    return () => { projectManager.stopAutoSave(); };
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
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const s = useStore.getState();

      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'z': e.preventDefault(); voxelEngine.undo(); s.addLog('info', 'Edit', '復原'); return;
          case 'y': e.preventDefault(); voxelEngine.redo(); s.addLog('info', 'Edit', '重做'); return;
          case 's':
            e.preventDefault();
            if (e.shiftKey) {
              projectManager.takeScreenshot();
            } else {
              projectManager.downloadProject();
              s.markSaved();
              s.addLog('success', 'Save', '專案已儲存');
            }
            return;
          case 'o': e.preventDefault(); projectManager.openProject(); return;
          case 'n': e.preventDefault(); projectManager.newProject(); return;
          case 'a':
            e.preventDefault();
            s.selectVoxels(s.voxels.map(v => v.id));
            s.addLog('info', 'Edit', `已全選 ${s.voxels.length} 個體素`);
            return;
          case 'd':
            e.preventDefault();
            // Duplicate selected voxels
            if (s.selectedVoxelIds.length > 0) {
              const selected = s.voxels.filter(v => s.selectedVoxelIds.includes(v.id));
              let count = 0;
              const newIds: string[] = [];
              for (const sv of selected) {
                const np = { x: sv.pos.x + 1, y: sv.pos.y, z: sv.pos.z };
                const exists = s.voxels.some(v => v.pos.x === np.x && v.pos.y === np.y && v.pos.z === np.z);
                if (!exists) {
                  const nid = `dup_${Date.now()}_${count}`;
                  const nv: Voxel = {
                    id: nid, pos: np, color: sv.color,
                    layerId: sv.layerId, material: { ...sv.material }, isSupport: false, materialId: sv.materialId,
                  };
                  s.addVoxel(nv); voxelEngine.addVoxel(nv);
                  newIds.push(nid); count++;
                }
              }
              if (newIds.length > 0) s.selectVoxels(newIds);
              s.addLog('info', 'Edit', `已複製 ${count} 個體素`);
            }
            return;
          case 'g':
            e.preventDefault();
            // Group selected voxels into new layer
            if (s.selectedVoxelIds.length > 0) {
              const layerId = `layer_${Date.now()}`;
              s.addLayer({
                id: layerId, name: `群組_${s.layers.length}`,
                color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
                visible: true, locked: false, opacity: 1, blendMode: 'normal',
                order: s.layers.length, voxelCount: s.selectedVoxelIds.length,
                physicsEnabled: false, maskEnabled: false,
              });
              for (const id of s.selectedVoxelIds) {
                s.updateVoxel(id, { layerId });
              }
              s.addLog('info', 'Layer', `已將 ${s.selectedVoxelIds.length} 個體素移到新圖層`);
            }
            return;
        }
        return;
      }

      if (s.fpMode && e.key !== 'Escape') return;

      switch (e.key) {
        case 'Escape':
          if (s.selectedVoxelIds.length > 0) {
            s.clearSelection();
            s.addLog('info', 'Edit', '已取消選取');
          }
          break;
        case 'F1':
          e.preventDefault(); setShowShortcuts(true); break;
        case 'Delete':
        case 'Backspace': {
          e.preventDefault();
          const selected = s.selectedVoxelIds;
          if (selected.length > 0) {
            selected.forEach(id => {
              const v = s.voxels.find(v => v.id === id);
              if (v) { s.removeVoxel(id); voxelEngine.removeVoxel(v.pos); }
            });
            s.clearSelection();
            s.addLog('info', 'Edit', `已刪除 ${selected.length} 個選取的體素`);
          }
          break;
        }
        case '[':
          s.setBrushSize(Math.max(1, s.brushSize - 1));
          s.addLog('info', 'Brush', `刷子大小: ${Math.max(1, s.brushSize - 1)}`);
          break;
        case ']':
          s.setBrushSize(Math.min(10, s.brushSize + 1));
          s.addLog('info', 'Brush', `刷子大小: ${Math.min(10, s.brushSize + 1)}`);
          break;
        default: break;
      }

      switch (e.key.toLowerCase()) {
        case 'q': s.setTool('select'); break;
        case 'w': if (!e.ctrlKey) s.setTool('place'); break;
        case 'e': if (!e.ctrlKey) s.setTool('erase'); break;
        case 'g': if (!e.ctrlKey) s.setTool('glue'); break;
        case 'm': s.setTool('measure'); break;
        case 'b': e.shiftKey ? s.setTool('brush') : s.setTool('place'); break;
        case 'p': s.setTool('paint'); break;
        case 'x': s.toggleAxes(); break;
        case 'f':
          if (!e.shiftKey) {
            if (s.selectedVoxelIds.length > 0) {
              eventBus.emit('camera:focus', { ids: s.selectedVoxelIds });
              s.addLog('info', 'View', '聚焦到選取物件');
            }
          } else {
            s.setTool('fill');
          }
          break;
        case '1': s.setTool('tag-sharp'); break;
        case '2': s.setTool('tag-smooth'); break;
        case '3': s.setTool('tag-fillet'); break;
        case '5': s.setViewMode('wireframe'); break;
        case '6': s.setViewMode('solid'); break;
        case '7': s.setViewMode('rendered'); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="app-root">
      {/* Welcome Screen */}
      {showWelcome && (
        <WelcomeScreen
          onClose={() => setShowWelcome(false)}
          onNewProject={() => projectManager.newProject()}
          onOpenProject={() => projectManager.openProject()}
          onShowTemplates={() => setRightTab('layers')}
        />
      )}

      <Toolbar
        onShowPipeline={() => setShowPipeline(true)}
        onShowLOD={() => setShowLOD(true)}
        onShowAbout={() => setShowAbout(true)}
        onShowShortcuts={() => setShowShortcuts(true)}
      />
      <div className="app-main">
        <div className="app-sidebar left">
          <VoxelSearch />
          <PropertiesPanel />
          <MaterialEditor />
          <BrushSettingsPanel />
          <SceneStatsPanel />
          <TemplateLibrary />
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
          <IntegrityCheck />
          <AnalysisTimeline />
        </div>
      </div>
      <StatusBar />

      {/* Dialogs */}
      <ContextMenu />
      <AboutDialog open={showAbout} onClose={() => setShowAbout(false)} />
      <ShortcutsDialog open={showShortcuts} onClose={() => setShowShortcuts(false)} />
      <PipelineDialog open={showPipeline} onClose={() => setShowPipeline(false)} />
      <LODDialog open={showLOD} onClose={() => setShowLOD(false)} />
    </div>
  );
}
