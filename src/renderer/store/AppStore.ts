/**
 * FastDesign 全域狀態管理
 * 
 * 使用 React Context + useReducer 實現全域狀態管理，
 * 搭配 Event Bus 進行引擎間通訊。
 */

import React, { createContext, useContext, useReducer, Dispatch } from 'react';
import {
  ProjectState,
  PipelineState,
  VoxelData,
  LayerData,
  NURBSPayload,
  createDefaultProject,
  createDefaultPipelineState,
  SemanticIntent,
} from './DataModels';

// ============================================================
// 日誌類型
// ============================================================
export interface LogEntry {
  id: string;
  timestamp: number;
  level: 'info' | 'success' | 'warning' | 'error';
  source: string;
  message: string;
}

// ============================================================
// 工具類型
// ============================================================
export type ToolType = 'select' | 'place' | 'delete' | 'paint' | 'tag_sharp' | 'tag_smooth' | 'tag_fillet' | 'measure';

// ============================================================
// App State
// ============================================================
export interface AppState {
  project: ProjectState;
  pipeline: PipelineState;
  selectedVoxels: string[];
  activeTool: ToolType;
  activeLayerId: string;
  semanticIntent: SemanticIntent;
  filletRadius: number;
  logs: LogEntry[];
  engineStatus: {
    voxel: boolean;
    semantic: boolean;
    loadPhysics: boolean;
    layer: boolean;
    agent: boolean;
    multiplayer: boolean;
    texture: boolean;
    lod: boolean;
  };
  viewportSettings: {
    showGrid: boolean;
    showAxes: boolean;
    showWireframe: boolean;
    showNurbs: boolean;
    showStressMap: boolean;
  };
  nurbsResult: NURBSPayload | null;
  isConverting: boolean;
}

// ============================================================
// Actions
// ============================================================
export type AppAction =
  | { type: 'SET_PROJECT'; payload: ProjectState }
  | { type: 'ADD_VOXEL'; payload: VoxelData }
  | { type: 'REMOVE_VOXEL'; payload: string }
  | { type: 'SELECT_VOXELS'; payload: string[] }
  | { type: 'SET_TOOL'; payload: ToolType }
  | { type: 'SET_ACTIVE_LAYER'; payload: string }
  | { type: 'SET_SEMANTIC_INTENT'; payload: SemanticIntent }
  | { type: 'SET_FILLET_RADIUS'; payload: number }
  | { type: 'UPDATE_LAYER'; payload: LayerData }
  | { type: 'ADD_LAYER'; payload: LayerData }
  | { type: 'TOGGLE_LAYER_VISIBILITY'; payload: string }
  | { type: 'SET_PIPELINE_STATE'; payload: Partial<PipelineState> }
  | { type: 'ADD_LOG'; payload: LogEntry }
  | { type: 'CLEAR_LOGS' }
  | { type: 'SET_ENGINE_STATUS'; payload: { engine: string; status: boolean } }
  | { type: 'SET_VIEWPORT_SETTING'; payload: { key: string; value: boolean } }
  | { type: 'SET_NURBS_RESULT'; payload: NURBSPayload | null }
  | { type: 'SET_CONVERTING'; payload: boolean }
  | { type: 'UPDATE_VOXEL_TAG'; payload: { voxelId: string; intent: SemanticIntent; radius?: number } };

// ============================================================
// Initial State
// ============================================================
export const initialState: AppState = {
  project: createDefaultProject(),
  pipeline: createDefaultPipelineState(),
  selectedVoxels: [],
  activeTool: 'place',
  activeLayerId: 'default',
  semanticIntent: 'default',
  filletRadius: 5.0,
  logs: [],
  engineStatus: {
    voxel: true,
    semantic: true,
    loadPhysics: true,
    layer: true,
    agent: false,
    multiplayer: false,
    texture: true,
    lod: true,
  },
  viewportSettings: {
    showGrid: true,
    showAxes: true,
    showWireframe: false,
    showNurbs: true,
    showStressMap: false,
  },
  nurbsResult: null,
  isConverting: false,
};

// ============================================================
// Reducer
// ============================================================
export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_PROJECT':
      return { ...state, project: action.payload };

    case 'ADD_VOXEL': {
      const voxel = action.payload;
      // Find or create chunk
      const chunkKey = `${Math.floor(voxel.position[0] / 16)}_${Math.floor(voxel.position[1] / 16)}_${Math.floor(voxel.position[2] / 16)}`;
      const chunks = [...state.project.chunks];
      let chunk = chunks.find(c => c.chunk_id === chunkKey);
      if (!chunk) {
        chunk = {
          chunk_id: chunkKey,
          origin_pos: [
            Math.floor(voxel.position[0] / 16) * 16,
            Math.floor(voxel.position[1] / 16) * 16,
            Math.floor(voxel.position[2] / 16) * 16,
          ],
          lod_level: 0,
          active_voxels: [],
        };
        chunks.push(chunk);
      }
      // Check for duplicate position
      const exists = chunk.active_voxels.some(
        v => v.position[0] === voxel.position[0] &&
             v.position[1] === voxel.position[1] &&
             v.position[2] === voxel.position[2]
      );
      if (!exists) {
        chunk.active_voxels = [...chunk.active_voxels, voxel];
      }
      // Update layer voxel count
      const layers = state.project.layers.map(l => {
        if (l.layer_id === voxel.layer_id) {
          return { ...l, voxel_count: l.voxel_count + (exists ? 0 : 1) };
        }
        return l;
      });
      return {
        ...state,
        project: {
          ...state.project,
          chunks,
          layers,
          sync_version: state.project.sync_version + 1,
          updated_at: new Date().toISOString(),
        },
      };
    }

    case 'REMOVE_VOXEL': {
      const voxelId = action.payload;
      let removedLayerId = '';
      const chunks = state.project.chunks.map(chunk => {
        const voxel = chunk.active_voxels.find(v => v.voxel_id === voxelId);
        if (voxel) removedLayerId = voxel.layer_id;
        return {
          ...chunk,
          active_voxels: chunk.active_voxels.filter(v => v.voxel_id !== voxelId),
        };
      }).filter(chunk => chunk.active_voxels.length > 0);
      const layers = state.project.layers.map(l => {
        if (l.layer_id === removedLayerId) {
          return { ...l, voxel_count: Math.max(0, l.voxel_count - 1) };
        }
        return l;
      });
      return {
        ...state,
        project: { ...state.project, chunks, layers, sync_version: state.project.sync_version + 1 },
        selectedVoxels: state.selectedVoxels.filter(id => id !== voxelId),
      };
    }

    case 'SELECT_VOXELS':
      return { ...state, selectedVoxels: action.payload };

    case 'SET_TOOL':
      return { ...state, activeTool: action.payload };

    case 'SET_ACTIVE_LAYER':
      return { ...state, activeLayerId: action.payload };

    case 'SET_SEMANTIC_INTENT':
      return { ...state, semanticIntent: action.payload };

    case 'SET_FILLET_RADIUS':
      return { ...state, filletRadius: action.payload };

    case 'UPDATE_LAYER': {
      const layers = state.project.layers.map(l =>
        l.layer_id === action.payload.layer_id ? action.payload : l
      );
      return { ...state, project: { ...state.project, layers } };
    }

    case 'ADD_LAYER': {
      return {
        ...state,
        project: {
          ...state.project,
          layers: [...state.project.layers, action.payload],
        },
      };
    }

    case 'TOGGLE_LAYER_VISIBILITY': {
      const layers = state.project.layers.map(l =>
        l.layer_id === action.payload ? { ...l, visible: !l.visible } : l
      );
      return { ...state, project: { ...state.project, layers } };
    }

    case 'SET_PIPELINE_STATE':
      return { ...state, pipeline: { ...state.pipeline, ...action.payload } };

    case 'ADD_LOG':
      return { ...state, logs: [...state.logs.slice(-200), action.payload] };

    case 'CLEAR_LOGS':
      return { ...state, logs: [] };

    case 'SET_ENGINE_STATUS':
      return {
        ...state,
        engineStatus: { ...state.engineStatus, [action.payload.engine]: action.payload.status },
      };

    case 'SET_VIEWPORT_SETTING':
      return {
        ...state,
        viewportSettings: { ...state.viewportSettings, [action.payload.key]: action.payload.value },
      };

    case 'SET_NURBS_RESULT':
      return { ...state, nurbsResult: action.payload };

    case 'SET_CONVERTING':
      return { ...state, isConverting: action.payload };

    case 'UPDATE_VOXEL_TAG': {
      const chunks = state.project.chunks.map(chunk => ({
        ...chunk,
        active_voxels: chunk.active_voxels.map(v =>
          v.voxel_id === action.payload.voxelId
            ? { ...v, semantic_intent: action.payload.intent, fillet_radius: action.payload.radius }
            : v
        ),
      }));
      return { ...state, project: { ...state.project, chunks } };
    }

    default:
      return state;
  }
}

// ============================================================
// Context
// ============================================================
export interface AppContextType {
  state: AppState;
  dispatch: Dispatch<AppAction>;
}

export const AppContext = createContext<AppContextType>({
  state: initialState,
  dispatch: () => {},
});

export const useAppState = () => useContext(AppContext);
