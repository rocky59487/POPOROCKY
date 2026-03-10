/**
 * ProjectManager - 專案儲存/載入/自動儲存
 * JSON 格式，包含所有體素、圖層、Glue Joint、材質、FEA 設定
 */
import { useStore, Voxel, Layer, Vec3 } from '../store/useStore';
import eventBus from './EventBus';

export interface ProjectData {
  version: string;
  name: string;
  createdAt: number;
  savedAt: number;
  voxels: Voxel[];
  layers: Layer[];
  glueJoints: { id: string; voxelA: Vec3; voxelB: Vec3; type: string; strength: number }[];
  settings: {
    gravity: Vec3;
    gravityMagnitude: number;
    activeVoxelMaterial: string;
    viewMode: string;
    cameraType: string;
    showGrid: boolean;
    showAxes: boolean;
  };
}

class ProjectManager {
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  private autoSaveIntervalMs = 5 * 60 * 1000; // 5 minutes

  /** Serialize current state to JSON */
  serializeProject(): ProjectData {
    const state = useStore.getState();
    return {
      version: '1.0',
      name: state.projectName,
      createdAt: Date.now(),
      savedAt: Date.now(),
      voxels: state.voxels.map(v => ({
        id: v.id,
        pos: { ...v.pos },
        color: v.color,
        semanticTag: v.semanticTag,
        category: v.category,
        layerId: v.layerId,
        materialId: v.materialId,
        material: { ...v.material },
        isSupport: v.isSupport,
        externalLoad: v.externalLoad ? { ...v.externalLoad } : undefined,
      })),
      layers: state.layers.map(l => ({ ...l })),
      glueJoints: state.glueJoints.map(j => ({ ...j, voxelA: { ...j.voxelA }, voxelB: { ...j.voxelB } })),
      settings: {
        gravity: { ...state.loadAnalysis.gravity },
        gravityMagnitude: state.loadAnalysis.gravityMagnitude,
        activeVoxelMaterial: state.activeVoxelMaterial,
        viewMode: state.viewMode,
        cameraType: state.cameraType,
        showGrid: state.showGrid,
        showAxes: state.showAxes,
      },
    };
  }

  /** Deserialize project data and load into store */
  loadProject(data: ProjectData): void {
    const store = useStore.getState();
    store.setVoxels(data.voxels);
    store.setLayers(data.layers);
    store.setProjectName(data.name);

    // Load glue joints
    store.clearGlueJoints();
    data.glueJoints.forEach(j => store.addGlueJoint(j));

    // Load settings
    if (data.settings) {
      store.setGravity(data.settings.gravity);
      store.setGravityMagnitude(data.settings.gravityMagnitude);
      store.setActiveVoxelMaterial(data.settings.activeVoxelMaterial);
      store.setViewMode(data.settings.viewMode as any);
      store.setCameraType(data.settings.cameraType as any);
      if (data.settings.showGrid !== store.showGrid) store.toggleGrid();
      if (data.settings.showAxes !== store.showAxes) store.toggleAxes();
    }

    store.markSaved();
    store.addLog('success', 'Project', `已載入專案: ${data.name}`);
    eventBus.emit('project:loaded', { name: data.name });
  }

  /** Save project to JSON string */
  saveToJSON(): string {
    const data = this.serializeProject();
    const json = JSON.stringify(data, null, 2);
    useStore.getState().markSaved();
    useStore.getState().addLog('success', 'Project', `已儲存專案: ${data.name}`);
    return json;
  }

  /** Load project from JSON string */
  loadFromJSON(json: string): boolean {
    try {
      const data: ProjectData = JSON.parse(json);
      if (!data.version || !data.voxels) {
        useStore.getState().addLog('error', 'Project', '無效的專案檔案格式');
        return false;
      }
      this.loadProject(data);
      return true;
    } catch (e) {
      useStore.getState().addLog('error', 'Project', `載入失敗: ${(e as Error).message}`);
      return false;
    }
  }

  /** Download project as .fdp (FastDesign Project) file */
  downloadProject(): void {
    const json = this.saveToJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${useStore.getState().projectName || 'project'}.fdp`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /** Open file dialog and load project */
  openProject(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.fdp,.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const json = ev.target?.result as string;
        if (this.loadFromJSON(json)) {
          useStore.getState().addRecentProject(file.name, file.name);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  /** New project - reset all state */
  newProject(): void {
    const store = useStore.getState();
    store.setVoxels([]);
    store.clearGlueJoints();
    store.setFEAResult(null);
    store.resetPipeline();
    store.clearSelection();
    store.setProjectName('新專案');
    store.setProjectFilePath(null);
    store.markSaved();
    store.addLog('info', 'Project', '已建立新專案');
    eventBus.emit('project:new', {});
  }

  /** Start auto-save timer */
  startAutoSave(): void {
    this.stopAutoSave();
    this.autoSaveTimer = setInterval(() => {
      const state = useStore.getState();
      if (state.autoSaveEnabled && state.isDirty) {
        try {
          const json = this.saveToJSON();
          // Store in localStorage as backup
          localStorage.setItem('fastdesign_autosave', json);
          localStorage.setItem('fastdesign_autosave_time', Date.now().toString());
          state.addLog('info', 'AutoSave', '自動儲存完成');
        } catch (e) {
          state.addLog('warning', 'AutoSave', `自動儲存失敗: ${(e as Error).message}`);
        }
      }
    }, this.autoSaveIntervalMs);
  }

  /** Stop auto-save timer */
  stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  /** Check for auto-save recovery */
  checkAutoSaveRecovery(): boolean {
    try {
      const saved = localStorage.getItem('fastdesign_autosave');
      if (saved) {
        const time = parseInt(localStorage.getItem('fastdesign_autosave_time') || '0');
        if (Date.now() - time < 24 * 60 * 60 * 1000) { // within 24 hours
          return true;
        }
      }
    } catch (e) { /* ignore */ }
    return false;
  }

  /** Recover from auto-save */
  recoverAutoSave(): boolean {
    try {
      const saved = localStorage.getItem('fastdesign_autosave');
      if (saved) {
        return this.loadFromJSON(saved);
      }
    } catch (e) { /* ignore */ }
    return false;
  }

  /** Take screenshot of the 3D viewport */
  takeScreenshot(includeUI: boolean = false): void {
    try {
      const canvas = document.querySelector('canvas');
      if (!canvas) {
        useStore.getState().addLog('error', 'Screenshot', '找不到 Canvas 元素');
        return;
      }

      if (includeUI) {
        // Use html2canvas-like approach for full UI
        // For now, just capture the canvas
      }

      const dataURL = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataURL;
      a.download = `FastDesign_${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      useStore.getState().addLog('success', 'Screenshot', '截圖已儲存');
    } catch (e) {
      useStore.getState().addLog('error', 'Screenshot', `截圖失敗: ${(e as Error).message}`);
    }
  }
}

export const projectManager = new ProjectManager();
