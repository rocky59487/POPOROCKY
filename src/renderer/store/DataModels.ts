/**
 * FastDesign 核心資料模型
 * 
 * 基於架構藍圖定義的 JSON Schema，包含 VoxelData、ChunkData、ProjectState 等。
 */

import { v4 as uuidv4 } from 'uuid';

// ============================================================
// 語意標籤 (Semantic Intent Tags)
// ============================================================
export type SemanticIntent = 'sharp' | 'smooth_curve' | 'fillet_R' | 'default';

// ============================================================
// VoxelData - 體素資料結構
// ============================================================
export interface MaterialData {
  texture_base64: string;
  mass_density: number;
  color: string;
}

export interface NURBSCurve {
  degree: number;
  control_points: number[][];
  knots: number[];
  weights: number[];
}

export interface VoxelData {
  voxel_id: string;
  position: [number, number, number];
  is_virtual: boolean;
  layer_id: string;
  semantic_intent: SemanticIntent;
  material_data: MaterialData;
  nurbs_curve: NURBSCurve | null;
  fillet_radius?: number;
}

// ============================================================
// ChunkData - 區塊資料結構
// ============================================================
export interface ChunkData {
  chunk_id: string;
  origin_pos: [number, number, number];
  lod_level: number;
  active_voxels: VoxelData[];
}

// ============================================================
// Layer - 圖層資料結構
// ============================================================
export interface LayerData {
  layer_id: string;
  name: string;
  color: string;
  visible: boolean;
  locked: boolean;
  is_culled_by_physics: boolean;
  voxel_count: number;
}

// ============================================================
// ProjectState - 專案狀態
// ============================================================
export interface GlobalPhysicsState {
  gravity_vector: [number, number, number];
  global_stress_threshold: number;
}

export interface ProjectState {
  project_id: string;
  project_name: string;
  sync_version: number;
  global_physics_state: GlobalPhysicsState;
  chunks: ChunkData[];
  layers: LayerData[];
  created_at: string;
  updated_at: string;
}

// ============================================================
// NURBS Payload - 演算法管線輸出
// ============================================================
export interface NURBSSurface {
  patch_id: string;
  degree_u: number;
  degree_v: number;
  knots_u: number[];
  knots_v: number[];
  is_rational: boolean;
  control_points: number[][][]; // 2D array of [x,y,z,w]
}

export interface FeatureLine {
  curve_id: string;
  degree: number;
  knots: number[];
  control_points: number[][];
  adjacent_patch_ids: string[];
}

export interface QualityMetrics {
  max_deviation_mm: number;
  mean_deviation_mm: number;
  convergence_iterations: number;
  solver_used: string;
}

export interface NURBSPayload {
  model_unit: string;
  nurbs_surfaces: NURBSSurface[];
  feature_lines: FeatureLine[];
  quality_metrics: QualityMetrics;
}

// ============================================================
// VoxelGrid Payload - 演算法管線輸入
// ============================================================
export interface SemanticTag {
  coordinate: [number, number, number];
  intent: SemanticIntent;
  radius?: number;
}

export interface VoxelGridPayload {
  metadata: {
    voxel_size: number;
    bounding_box: [number, number, number, number, number, number];
  };
  voxel_grid: {
    dimensions: [number, number, number];
    data: number[];
  };
  semantic_tags: SemanticTag[];
}

// ============================================================
// RhinoExportPayload - 匯出資料結構
// ============================================================
export interface RhinoExportPayload {
  export_metadata: {
    timestamp: string;
    author: string;
    units: string;
  };
  rhino_layers: Array<{
    name: string;
    color: string;
    is_culled_by_physics: boolean;
  }>;
  geometry_objects: Array<{
    type: string;
    layer: string;
    geometry_data: any;
    user_strings: Record<string, string>;
  }>;
}

// ============================================================
// Pipeline State - 管線狀態
// ============================================================
export type PipelineStage = 'idle' | 'boundary_extraction' | 'planar_simplification' | 'nurbs_fitting' | 'completed' | 'error';

export interface PipelineState {
  current_stage: PipelineStage;
  progress: number; // 0-100
  message: string;
  started_at: number | null;
  completed_at: number | null;
  result: NURBSPayload | null;
}

// ============================================================
// 工廠函數
// ============================================================
export function createDefaultVoxel(
  position: [number, number, number],
  layerId: string = 'default',
  intent: SemanticIntent = 'default'
): VoxelData {
  return {
    voxel_id: uuidv4(),
    position,
    is_virtual: false,
    layer_id: layerId,
    semantic_intent: intent,
    material_data: {
      texture_base64: '',
      mass_density: 1.0,
      color: '#4ecdc4',
    },
    nurbs_curve: null,
  };
}

export function createDefaultProject(): ProjectState {
  return {
    project_id: uuidv4(),
    project_name: '新專案',
    sync_version: 1,
    global_physics_state: {
      gravity_vector: [0, -9.81, 0],
      global_stress_threshold: 100.0,
    },
    chunks: [],
    layers: [
      {
        layer_id: 'default',
        name: '預設圖層',
        color: '#4ecdc4',
        visible: true,
        locked: false,
        is_culled_by_physics: false,
        voxel_count: 0,
      },
      {
        layer_id: 'structure',
        name: '結構圖層',
        color: '#e94560',
        visible: true,
        locked: false,
        is_culled_by_physics: true,
        voxel_count: 0,
      },
      {
        layer_id: 'decoration',
        name: '裝飾圖層',
        color: '#ffe66d',
        visible: true,
        locked: false,
        is_culled_by_physics: false,
        voxel_count: 0,
      },
    ],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function createDefaultPipelineState(): PipelineState {
  return {
    current_stage: 'idle',
    progress: 0,
    message: '就緒',
    started_at: null,
    completed_at: null,
    result: null,
  };
}
