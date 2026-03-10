import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

/* ============================================================
   Types
   ============================================================ */
export type ToolType = 'select'|'place'|'erase'|'paint'|'brush'|'smooth'|'fill'|'sculpt'|'measure'|'tag-sharp'|'tag-smooth'|'tag-fillet';
export type ViewMode = 'wireframe'|'solid'|'rendered';
export type ViewLayout = 'single'|'quad';
export type CameraType = 'perspective'|'orthographic';
export type SelectMode = 'object'|'vertex'|'edge'|'face';
export type SemanticTag = 'sharp'|'smooth'|'fillet';
export type SemanticCategory = 'structure'|'decoration'|'function';
export type PipelineStatus = 'idle'|'running'|'done'|'error';
export type LogLevel = 'info'|'success'|'warning'|'error';

export interface Vec3 { x: number; y: number; z: number; }

export interface Voxel {
  id: string; pos: Vec3; color: string; semanticTag?: SemanticTag;
  category?: SemanticCategory; layerId: string; materialId?: string;
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

export interface LoadAnalysis {
  maxStress: number; minStress: number; safetyFactor: number;
  weakPoints: Vec3[]; loadPaths: Vec3[][]; stressMap: Map<string, number>;
}

export interface LogEntry { ts: number; level: LogLevel; source: string; message: string; }

export interface PBRMaterial {
  id: string; name: string; albedo: string; roughness: number;
  metallic: number; normalScale: number; aoIntensity: number;
}

export interface LODLevel { level: number; distance: number; triangleCount: number; enabled: boolean; }

export interface AgentMessage { role: 'user'|'agent'; content: string; ts: number; }

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

  // Voxels
  voxels: Voxel[]; selectedVoxelIds: string[];

  // Layers
  layers: Layer[]; activeLayerId: string;

  // Pipeline
  pipeline: PipelineState;

  // Load Analysis
  loadAnalysis: LoadAnalysis | null; showStressHeatmap: boolean;

  // Engines
  engines: EngineStatus[];

  // Logs
  logs: LogEntry[];

  // Materials
  materials: PBRMaterial[]; activeMaterialId: string;

  // LOD
  lodLevels: LODLevel[]; currentLOD: number;

  // Agent
  agentMessages: AgentMessage[]; agentThinking: boolean;

  // Multiplayer
  collabUsers: CollabUser[]; isCollabActive: boolean;

  // Semantic
  semanticRules: { id: string; name: string; condition: string; action: string; enabled: boolean; }[];

  // Performance
  fps: number; memoryUsage: number; triangleCount: number; drawCalls: number;

  // Actions
  setTool: (tool: ToolType) => void;
  setViewLayout: (l: ViewLayout) => void;
  setViewMode: (m: ViewMode) => void;
  setCameraType: (c: CameraType) => void;
  setSelectMode: (m: SelectMode) => void;
  toggleGrid: () => void;
  toggleAxes: () => void;
  toggleNormals: () => void;
  setBrushSize: (s: number) => void;
  setBrushStrength: (s: number) => void;
  setBrushShape: (s: 'sphere'|'cube'|'cylinder') => void;
  setPaintColor: (c: string) => void;

  addVoxel: (v: Voxel) => void;
  removeVoxel: (id: string) => void;
  selectVoxels: (ids: string[]) => void;
  clearSelection: () => void;
  updateVoxel: (id: string, patch: Partial<Voxel>) => void;

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

  setLoadAnalysis: (a: LoadAnalysis | null) => void;
  toggleStressHeatmap: () => void;

  addLog: (level: LogLevel, source: string, message: string) => void;
  clearLogs: () => void;

  addMaterial: (m: PBRMaterial) => void;
  updateMaterial: (id: string, patch: Partial<PBRMaterial>) => void;
  setActiveMaterial: (id: string) => void;

  setLODLevels: (levels: LODLevel[]) => void;
  setCurrentLOD: (l: number) => void;

  addAgentMessage: (msg: AgentMessage) => void;
  setAgentThinking: (t: boolean) => void;

  setCollabUsers: (users: CollabUser[]) => void;
  setCollabActive: (a: boolean) => void;

  updatePerformance: (fps: number, mem: number, tris: number, draws: number) => void;
  setProjectName: (n: string) => void;
}

const defaultLayers: Layer[] = [
  { id: 'default', name: '預設圖層', color: '#638cff', visible: true, locked: false, opacity: 1, blendMode: 'normal', order: 0, voxelCount: 0, physicsEnabled: false, maskEnabled: false },
  { id: 'structure', name: '結構圖層', color: '#ff4757', visible: true, locked: false, opacity: 1, blendMode: 'normal', order: 1, voxelCount: 0, physicsEnabled: true, maskEnabled: false },
  { id: 'decoration', name: '裝飾圖層', color: '#f5a623', visible: true, locked: false, opacity: 1, blendMode: 'normal', order: 2, voxelCount: 0, physicsEnabled: false, maskEnabled: false },
];

const defaultEngines: EngineStatus[] = [
  { name: '體素引擎', running: true },
  { name: '語意引擎', running: true },
  { name: '負載引擎', running: true },
  { name: '圖層引擎', running: true },
  { name: '代理人引擎', running: true },
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
    loadAnalysis: null, showStressHeatmap: false,
    engines: defaultEngines,
    logs: [{ ts: Date.now(), level: 'info', source: 'System', message: 'FastDesign v1.0 已啟動' }],
    materials: defaultMaterials, activeMaterialId: 'default',
    lodLevels: defaultLOD, currentLOD: 0,
    agentMessages: [], agentThinking: false,
    collabUsers: [], isCollabActive: false,
    semanticRules: [
      { id: 'r1', name: '結構完整性', condition: '應力 > 閾值', action: '標記弱點', enabled: true },
      { id: 'r2', name: '裝飾一致性', condition: '相鄰語意不同', action: '建議統一', enabled: true },
    ],
    fps: 60, memoryUsage: 0, triangleCount: 0, drawCalls: 0,

    setTool: (tool) => set((s) => { s.activeTool = tool; }),
    setViewLayout: (l) => set((s) => { s.viewLayout = l; }),
    setViewMode: (m) => set((s) => { s.viewMode = m; }),
    setCameraType: (c) => set((s) => { s.cameraType = c; }),
    setSelectMode: (m) => set((s) => { s.selectMode = m; }),
    toggleGrid: () => set((s) => { s.showGrid = !s.showGrid; }),
    toggleAxes: () => set((s) => { s.showAxes = !s.showAxes; }),
    toggleNormals: () => set((s) => { s.showNormals = !s.showNormals; }),
    setBrushSize: (sz) => set((s) => { s.brushSize = sz; }),
    setBrushStrength: (st) => set((s) => { s.brushStrength = st; }),
    setBrushShape: (sh) => set((s) => { s.brushShape = sh; }),
    setPaintColor: (c) => set((s) => { s.paintColor = c; }),

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

    setLoadAnalysis: (a) => set((s) => { s.loadAnalysis = a as any; }),
    toggleStressHeatmap: () => set((s) => { s.showStressHeatmap = !s.showStressHeatmap; }),

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

    addAgentMessage: (msg) => set((s) => { s.agentMessages.push(msg); }),
    setAgentThinking: (t) => set((s) => { s.agentThinking = t; }),

    setCollabUsers: (users) => set((s) => { s.collabUsers = users as any; }),
    setCollabActive: (a) => set((s) => { s.isCollabActive = a; }),

    updatePerformance: (fps, mem, tris, draws) => set((s) => {
      s.fps = fps; s.memoryUsage = mem; s.triangleCount = tris; s.drawCalls = draws;
    }),
    setProjectName: (n) => set((s) => { s.projectName = n; }),
  }))
);
