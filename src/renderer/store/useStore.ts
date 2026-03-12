import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

/* ============================================================
   Types
   ============================================================ */
export type ToolType = 'select'|'place'|'erase'|'paint'|'brush'|'smooth'|'fill'|'sculpt'|'measure'|'tag-sharp'|'tag-smooth'|'tag-fillet'|'set-support'|'set-load'|'glue';
export type ViewMode = 'wireframe'|'solid'|'rendered';
export type ViewLayout = 'single'|'quad';
export type CameraType = 'perspective'|'orthographic';
export type SelectMode = 'object'|'vertex'|'edge'|'face';
// SemanticTag and SemanticCategory removed in v2.1
export type PipelineStatus = 'idle'|'running'|'done'|'error';
export type LogLevel = 'info'|'success'|'warning'|'error';

export interface Vec3 { x: number; y: number; z: number; }

export interface VoxelMaterial {
  maxCompression: number;  // MPa - 最大壓縮力
  maxTension: number;      // MPa - 最大拉伸力
  density: number;         // kg/m³ - 密度
  youngModulus: number;    // MPa - 楊氏模量
}

export const DEFAULT_MATERIALS: Record<string, VoxelMaterial> = {
  concrete: { maxCompression: 30, maxTension: 3, density: 2400, youngModulus: 25000 },
  steel:    { maxCompression: 250, maxTension: 400, density: 7850, youngModulus: 200000 },
  wood:     { maxCompression: 5, maxTension: 8, density: 600, youngModulus: 12000 },
  brick:    { maxCompression: 10, maxTension: 0.5, density: 1800, youngModulus: 15000 },
};

export interface Voxel {
  id: string; pos: Vec3; color: string;
  layerId: string; materialId?: string;
  material: VoxelMaterial;
  isSupport: boolean;       // 是否為固定支撐點
  externalLoad?: Vec3;      // 外部施加的力向量 (N)
}

export interface Layer {
  id: string; name: string; color: string; visible: boolean;
  locked: boolean; opacity: number; blendMode: string;
  groupId?: string; order: number; voxelCount: number;
  physicsEnabled: boolean; maskEnabled: boolean;
}

export interface NURBSSurface {
  id: string; controlPoints: Vec3[][]; degree: number;
  knotsU: number[]; knotsV: number[]; weights: number[][];
}

export interface PipelineState {
  status: PipelineStatus; currentStage: number; totalStages: number;
  progress: number; stages: { name: string; status: PipelineStatus; progress: number; }[];
  params: { qefThreshold: number; pcaTolerance: number; nurbsDegree: number; controlPointCount: number; };
  result?: NURBSSurface[];
}

// FEA 結果
export interface FEAEdge {
  nodeA: Vec3;
  nodeB: Vec3;
  stress: number;       // 應力值 (MPa)
  stressRatio: number;  // 0=安全, 1=極限, >1=超載
  isTension: boolean;   // true=拉伸, false=壓縮
}

export interface FEAResult {
  edges: FEAEdge[];
  displacements: Map<string, Vec3>;
  dangerCount: number;    // stressRatio > 0.8 的邊數
  maxStressRatio: number;
  totalEdges: number;
}

export interface LoadAnalysisState {
  gravity: Vec3;
  gravityMagnitude: number;
  result: FEAResult | null;
  showStressOverlay: boolean;
  isComputing: boolean;
}

export interface LogEntry { ts: number; level: LogLevel; source: string; message: string; }

export interface PBRMaterial {
  id: string; name: string; albedo: string; roughness: number;
  metallic: number; normalScale: number; aoIntensity: number;
}

export interface LODLevel { level: number; distance: number; triangleCount: number; enabled: boolean; }

export interface CollabUser { id: string; name: string; color: string; cursor?: Vec3; online: boolean; }

export interface EngineStatus { name: string; running: boolean; fps?: number; memory?: number; }

/* ============================================================
   Store
   ============================================================ */
export interface AppState {
  // Project
  projectName: string; version: string;

  // Tools
  activeTool: ToolType; brushSize: number; brushStrength: number;
  brushShape: 'sphere'|'cube'|'cylinder'; paintColor: string;

  // View
  viewLayout: ViewLayout; viewMode: ViewMode; cameraType: CameraType;
  selectMode: SelectMode; showGrid: boolean; showAxes: boolean; showNormals: boolean;
  fpMode: boolean; // 第一人稱模式

  // Voxels
  voxels: Voxel[]; selectedVoxelIds: string[];

  // Layers
  layers: Layer[]; activeLayerId: string;

  // Pipeline
  pipeline: PipelineState;

  // Load Analysis (FEA)
  loadAnalysis: LoadAnalysisState;

  // Engines
  engines: EngineStatus[];

  // Logs
  logs: LogEntry[];

  // Materials
  materials: PBRMaterial[]; activeMaterialId: string;

  // LOD
  lodLevels: LODLevel[]; currentLOD: number;

  // Multiplayer
  collabUsers: CollabUser[]; isCollabActive: boolean;



  // Performance
  fps: number; memoryUsage: number; triangleCount: number; drawCalls: number;

  // Active voxel material for new voxels
  activeVoxelMaterial: string; // key into DEFAULT_MATERIALS

  // Project save/load
  projectFilePath: string | null;
  recentProjects: { name: string; path: string; date: number }[];
  autoSaveEnabled: boolean;
  lastSaveTime: number;
  isDirty: boolean; // unsaved changes

  // Glue joints
  glueJoints: { id: string; voxelA: Vec3; voxelB: Vec3; type: string; strength: number }[];

  // Actions
  setTool: (tool: ToolType) => void;
  setViewLayout: (l: ViewLayout) => void;
  setViewMode: (m: ViewMode) => void;
  setCameraType: (c: CameraType) => void;
  setSelectMode: (m: SelectMode) => void;
  toggleGrid: () => void;
  toggleAxes: () => void;
  toggleNormals: () => void;
  setFpMode: (fp: boolean) => void;
  setBrushSize: (s: number) => void;
  setBrushStrength: (s: number) => void;
  setBrushShape: (s: 'sphere'|'cube'|'cylinder') => void;
  setPaintColor: (c: string) => void;
  setActiveVoxelMaterial: (m: string) => void;

  addVoxel: (v: Voxel) => void;
  removeVoxel: (id: string) => void;
  selectVoxels: (ids: string[]) => void;
  clearSelection: () => void;
  updateVoxel: (id: string, patch: Partial<Voxel>) => void;
  toggleVoxelSupport: (id: string) => void;
  setVoxelExternalLoad: (id: string, load: Vec3 | undefined) => void;

  addLayer: (l: Layer) => void;
  removeLayer: (id: string) => void;
  updateLayer: (id: string, patch: Partial<Layer>) => void;
  setActiveLayer: (id: string) => void;
  duplicateLayer: (id: string) => void;
  reorderLayers: (fromIdx: number, toIdx: number) => void;

  startPipeline: () => void;
  updatePipelineStage: (stage: number, status: PipelineStatus, progress: number) => void;
  completePipeline: (surfaces: NURBSSurface[]) => void;
  setPipelineParams: (p: Partial<PipelineState['params']>) => void;
  resetPipeline: () => void;

  // FEA
  setFEAResult: (r: FEAResult | null) => void;
  toggleStressOverlay: () => void;
  setGravity: (dir: Vec3) => void;
  setGravityMagnitude: (m: number) => void;
  setFEAComputing: (c: boolean) => void;

  addLog: (level: LogLevel, source: string, message: string) => void;
  clearLogs: () => void;

  addMaterial: (m: PBRMaterial) => void;
  updateMaterial: (id: string, patch: Partial<PBRMaterial>) => void;
  setActiveMaterial: (id: string) => void;

  setLODLevels: (levels: LODLevel[]) => void;
  setCurrentLOD: (l: number) => void;

  setCollabUsers: (users: CollabUser[]) => void;
  setCollabActive: (a: boolean) => void;

  updatePerformance: (fps: number, mem: number, tris: number, draws: number) => void;
  setProjectName: (n: string) => void;

  // Project save/load
  setProjectFilePath: (p: string | null) => void;
  addRecentProject: (name: string, path: string) => void;
  setAutoSave: (enabled: boolean) => void;
  markDirty: () => void;
  markSaved: () => void;

  // Glue
  addGlueJoint: (joint: { id: string; voxelA: Vec3; voxelB: Vec3; type: string; strength: number }) => void;
  removeGlueJoint: (id: string) => void;
  clearGlueJoints: () => void;

  // Bulk operations
  setVoxels: (voxels: Voxel[]) => void;
  setLayers: (layers: Layer[]) => void;
}

const defaultLayers: Layer[] = [
  { id: 'default', name: '預設圖層', color: '#638cff', visible: true, locked: false, opacity: 1, blendMode: 'normal', order: 0, voxelCount: 0, physicsEnabled: false, maskEnabled: false },
  { id: 'structure', name: '結構圖層', color: '#ff4757', visible: true, locked: false, opacity: 1, blendMode: 'normal', order: 1, voxelCount: 0, physicsEnabled: true, maskEnabled: false },
  { id: 'decoration', name: '裝飾圖層', color: '#f5a623', visible: true, locked: false, opacity: 1, blendMode: 'normal', order: 2, voxelCount: 0, physicsEnabled: false, maskEnabled: false },
];

const defaultEngines: EngineStatus[] = [
  { name: '體素引擎', running: true },

  { name: '負載引擎', running: true },
  { name: '圖層引擎', running: true },
  { name: '多人引擎', running: false },
  { name: '貼圖引擎', running: true },
  { name: 'LOD引擎', running: true },
];

const defaultMaterials: PBRMaterial[] = [
  { id: 'default', name: '預設材質', albedo: '#808080', roughness: 0.5, metallic: 0.0, normalScale: 1.0, aoIntensity: 1.0 },
  { id: 'metal', name: '金屬', albedo: '#c0c0c0', roughness: 0.2, metallic: 1.0, normalScale: 1.0, aoIntensity: 1.0 },
  { id: 'wood', name: '木材', albedo: '#8B6914', roughness: 0.8, metallic: 0.0, normalScale: 0.5, aoIntensity: 0.8 },
  { id: 'concrete', name: '混凝土', albedo: '#a0a0a0', roughness: 0.9, metallic: 0.0, normalScale: 1.2, aoIntensity: 0.7 },
];

const defaultLOD: LODLevel[] = [
  { level: 0, distance: 0, triangleCount: 0, enabled: true },
  { level: 1, distance: 50, triangleCount: 0, enabled: true },
  { level: 2, distance: 100, triangleCount: 0, enabled: true },
  { level: 3, distance: 200, triangleCount: 0, enabled: false },
];

export const useStore = create<AppState>()(
  immer((set) => ({
    projectName: '新專案', version: 'v1.0',
    activeTool: 'select', brushSize: 3, brushStrength: 0.8,
    brushShape: 'sphere', paintColor: '#638cff',
    viewLayout: 'single', viewMode: 'solid', cameraType: 'perspective',
    selectMode: 'object', showGrid: true, showAxes: true, showNormals: false,
    fpMode: false,
    voxels: [], selectedVoxelIds: [],
    layers: defaultLayers, activeLayerId: 'default',
    pipeline: {
      status: 'idle', currentStage: 0, totalStages: 3, progress: 0,
      stages: [
        { name: 'Dual Contouring', status: 'idle', progress: 0 },
        { name: 'PCA 簡化', status: 'idle', progress: 0 },
        { name: 'NURBS 擬合', status: 'idle', progress: 0 },
      ],
      params: { qefThreshold: 0.01, pcaTolerance: 0.05, nurbsDegree: 3, controlPointCount: 16 },
    },
    loadAnalysis: {
      gravity: { x: 0, y: -1, z: 0 },
      gravityMagnitude: 9.81,
      result: null,
      showStressOverlay: false,
      isComputing: false,
    },
    engines: defaultEngines,
    logs: [{ ts: Date.now(), level: 'info', source: 'System', message: 'FastDesign v1.0 已啟動' }],
    materials: defaultMaterials, activeMaterialId: 'default',
    lodLevels: defaultLOD, currentLOD: 0,
    collabUsers: [], isCollabActive: false,

    fps: 60, memoryUsage: 0, triangleCount: 0, drawCalls: 0,
    activeVoxelMaterial: 'concrete',
    projectFilePath: null,
    recentProjects: [],
    autoSaveEnabled: true,
    lastSaveTime: Date.now(),
    isDirty: false,
    glueJoints: [],

    setTool: (tool) => set((s) => { s.activeTool = tool; }),
    setViewLayout: (l) => set((s) => { s.viewLayout = l; }),
    setViewMode: (m) => set((s) => { s.viewMode = m; }),
    setCameraType: (c) => set((s) => { s.cameraType = c; }),
    setSelectMode: (m) => set((s) => { s.selectMode = m; }),
    toggleGrid: () => set((s) => { s.showGrid = !s.showGrid; }),
    toggleAxes: () => set((s) => { s.showAxes = !s.showAxes; }),
    toggleNormals: () => set((s) => { s.showNormals = !s.showNormals; }),
    setFpMode: (fp) => set((s) => { s.fpMode = fp; }),
    setBrushSize: (sz) => set((s) => { s.brushSize = sz; }),
    setBrushStrength: (st) => set((s) => { s.brushStrength = st; }),
    setBrushShape: (sh) => set((s) => { s.brushShape = sh; }),
    setPaintColor: (c) => set((s) => { s.paintColor = c; }),
    setActiveVoxelMaterial: (m) => set((s) => { s.activeVoxelMaterial = m; }),

    addVoxel: (v) => set((s) => {
      s.voxels.push(v);
      const layer = s.layers.find(l => l.id === v.layerId);
      if (layer) layer.voxelCount++;
    }),
    removeVoxel: (id) => set((s) => {
      const idx = s.voxels.findIndex(v => v.id === id);
      if (idx >= 0) {
        const v = s.voxels[idx];
        const layer = s.layers.find(l => l.id === v.layerId);
        if (layer) layer.voxelCount = Math.max(0, layer.voxelCount - 1);
        s.voxels.splice(idx, 1);
      }
      s.selectedVoxelIds = s.selectedVoxelIds.filter(sid => sid !== id);
    }),
    selectVoxels: (ids) => set((s) => { s.selectedVoxelIds = ids; }),
    clearSelection: () => set((s) => { s.selectedVoxelIds = []; }),
    updateVoxel: (id, patch) => set((s) => {
      const v = s.voxels.find(v => v.id === id);
      if (v) Object.assign(v, patch);
    }),
    toggleVoxelSupport: (id) => set((s) => {
      const v = s.voxels.find(v => v.id === id);
      if (v) v.isSupport = !v.isSupport;
    }),
    setVoxelExternalLoad: (id, load) => set((s) => {
      const v = s.voxels.find(v => v.id === id);
      if (v) v.externalLoad = load;
    }),

    addLayer: (l) => set((s) => { s.layers.push(l); }),
    removeLayer: (id) => set((s) => {
      if (s.layers.length <= 1) return;
      s.layers = s.layers.filter(l => l.id !== id);
      if (s.activeLayerId === id) s.activeLayerId = s.layers[0].id;
    }),
    updateLayer: (id, patch) => set((s) => {
      const l = s.layers.find(l => l.id === id);
      if (l) Object.assign(l, patch);
    }),
    setActiveLayer: (id) => set((s) => { s.activeLayerId = id; }),
    duplicateLayer: (id) => set((s) => {
      const src = s.layers.find(l => l.id === id);
      if (src) {
        const dup = { ...src, id: `layer_${Date.now()}`, name: `${src.name} (複製)`, order: s.layers.length, voxelCount: 0 };
        s.layers.push(dup as any);
      }
    }),
    reorderLayers: (from, to) => set((s) => {
      const [item] = s.layers.splice(from, 1);
      s.layers.splice(to, 0, item);
      s.layers.forEach((l, i) => { l.order = i; });
    }),

    startPipeline: () => set((s) => {
      s.pipeline.status = 'running';
      s.pipeline.currentStage = 0;
      s.pipeline.progress = 0;
      s.pipeline.stages.forEach(st => { st.status = 'idle'; st.progress = 0; });
    }),
    updatePipelineStage: (stage, status, progress) => set((s) => {
      if (s.pipeline.stages[stage]) {
        s.pipeline.stages[stage].status = status;
        s.pipeline.stages[stage].progress = progress;
      }
      s.pipeline.currentStage = stage;
      s.pipeline.progress = ((stage + progress / 100) / s.pipeline.totalStages) * 100;
    }),
    completePipeline: (surfaces) => set((s) => {
      s.pipeline.status = 'done';
      s.pipeline.progress = 100;
      s.pipeline.result = surfaces as any;
      s.pipeline.stages.forEach(st => { st.status = 'done'; st.progress = 100; });
    }),
    setPipelineParams: (p) => set((s) => { Object.assign(s.pipeline.params, p); }),
    resetPipeline: () => set((s) => {
      s.pipeline.status = 'idle';
      s.pipeline.currentStage = 0;
      s.pipeline.progress = 0;
      s.pipeline.result = undefined;
      s.pipeline.stages.forEach(st => { st.status = 'idle'; st.progress = 0; });
    }),

    // FEA
    setFEAResult: (r) => set((s) => { s.loadAnalysis.result = r as any; }),
    toggleStressOverlay: () => set((s) => { s.loadAnalysis.showStressOverlay = !s.loadAnalysis.showStressOverlay; }),
    setGravity: (dir) => set((s) => { s.loadAnalysis.gravity = dir; }),
    setGravityMagnitude: (m) => set((s) => { s.loadAnalysis.gravityMagnitude = m; }),
    setFEAComputing: (c) => set((s) => { s.loadAnalysis.isComputing = c; }),

    addLog: (level, source, message) => set((s) => {
      s.logs.push({ ts: Date.now(), level, source, message });
      if (s.logs.length > 500) s.logs = s.logs.slice(-300);
    }),
    clearLogs: () => set((s) => { s.logs = []; }),

    addMaterial: (m) => set((s) => { s.materials.push(m); }),
    updateMaterial: (id, patch) => set((s) => {
      const m = s.materials.find(m => m.id === id);
      if (m) Object.assign(m, patch);
    }),
    setActiveMaterial: (id) => set((s) => { s.activeMaterialId = id; }),

    setLODLevels: (levels) => set((s) => { s.lodLevels = levels as any; }),
    setCurrentLOD: (l) => set((s) => { s.currentLOD = l; }),

    setCollabUsers: (users) => set((s) => { s.collabUsers = users as any; }),
    setCollabActive: (a) => set((s) => { s.isCollabActive = a; }),

    updatePerformance: (fps, mem, tris, draws) => set((s) => {
      s.fps = fps; s.memoryUsage = mem; s.triangleCount = tris; s.drawCalls = draws;
    }),
    setProjectName: (n) => set((s) => { s.projectName = n; s.isDirty = true; }),

    setProjectFilePath: (p) => set((s) => { s.projectFilePath = p; }),
    addRecentProject: (name, path) => set((s) => {
      s.recentProjects = [{ name, path, date: Date.now() }, ...s.recentProjects.filter(r => r.path !== path)].slice(0, 10);
    }),
    setAutoSave: (enabled) => set((s) => { s.autoSaveEnabled = enabled; }),
    markDirty: () => set((s) => { s.isDirty = true; }),
    markSaved: () => set((s) => { s.isDirty = false; s.lastSaveTime = Date.now(); }),

    addGlueJoint: (joint) => set((s) => { s.glueJoints.push(joint as any); s.isDirty = true; }),
    removeGlueJoint: (id) => set((s) => { s.glueJoints = s.glueJoints.filter(j => j.id !== id); s.isDirty = true; }),
    clearGlueJoints: () => set((s) => { s.glueJoints = []; s.isDirty = true; }),

    setVoxels: (voxels) => set((s) => { s.voxels = voxels as any; }),
    setLayers: (layers) => set((s) => { s.layers = layers as any; }),
  }))
);
