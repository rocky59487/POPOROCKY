/**
 * PropertiesPanel - 屬性面板組件
 * 
 * 顯示選中體素的屬性、NURBS 參數、引擎狀態等資訊。
 */

import React, { useMemo } from 'react';
import { useAppState } from '../store/AppStore';
import { VoxelData } from '../store/DataModels';

const PropertiesPanel: React.FC = () => {
  const { state } = useAppState();

  // Find selected voxel
  const selectedVoxel = useMemo((): VoxelData | null => {
    if (state.selectedVoxels.length === 0) return null;
    const targetId = state.selectedVoxels[0];
    for (const chunk of state.project.chunks) {
      const voxel = chunk.active_voxels.find(v => v.voxel_id === targetId);
      if (voxel) return voxel;
    }
    return null;
  }, [state.selectedVoxels, state.project.chunks]);

  const totalVoxels = useMemo(() => {
    return state.project.chunks.reduce((sum, c) => sum + c.active_voxels.length, 0);
  }, [state.project.chunks]);

  return (
    <div className="panel right-panel">
      <div className="panel-header">
        <span>屬性面板</span>
      </div>
      <div className="panel-content">
        {/* Project Info */}
        <div className="prop-group">
          <div className="prop-group-title">專案資訊</div>
          <div className="prop-row">
            <span className="prop-label">專案名稱</span>
            <span className="prop-value">{state.project.project_name}</span>
          </div>
          <div className="prop-row">
            <span className="prop-label">同步版本</span>
            <span className="prop-value">v{state.project.sync_version}</span>
          </div>
          <div className="prop-row">
            <span className="prop-label">體素總數</span>
            <span className="prop-value">{totalVoxels}</span>
          </div>
          <div className="prop-row">
            <span className="prop-label">區塊數量</span>
            <span className="prop-value">{state.project.chunks.length}</span>
          </div>
        </div>

        {/* Selected Voxel Properties */}
        {selectedVoxel ? (
          <div className="prop-group">
            <div className="prop-group-title">體素屬性</div>
            <div className="prop-row">
              <span className="prop-label">ID</span>
              <span className="prop-value" style={{ fontSize: '10px' }}>
                {selectedVoxel.voxel_id.substring(0, 8)}...
              </span>
            </div>
            <div className="prop-row">
              <span className="prop-label">位置</span>
              <span className="prop-value">
                [{selectedVoxel.position.join(', ')}]
              </span>
            </div>
            <div className="prop-row">
              <span className="prop-label">虛擬體素</span>
              <span className="prop-value">{selectedVoxel.is_virtual ? '是 (AI)' : '否'}</span>
            </div>
            <div className="prop-row">
              <span className="prop-label">圖層</span>
              <span className="prop-value">{selectedVoxel.layer_id}</span>
            </div>
            <div className="prop-row">
              <span className="prop-label">語意標籤</span>
              <span className="prop-value" style={{
                color: selectedVoxel.semantic_intent === 'sharp' ? 'var(--error)' :
                       selectedVoxel.semantic_intent === 'smooth_curve' ? 'var(--success)' :
                       selectedVoxel.semantic_intent === 'fillet_R' ? 'var(--warning)' : 'var(--text-primary)'
              }}>
                {selectedVoxel.semantic_intent}
              </span>
            </div>
            {selectedVoxel.fillet_radius && (
              <div className="prop-row">
                <span className="prop-label">圓角半徑</span>
                <span className="prop-value">{selectedVoxel.fillet_radius} mm</span>
              </div>
            )}
            <div className="prop-row">
              <span className="prop-label">質量密度</span>
              <span className="prop-value">{selectedVoxel.material_data.mass_density} kg/m³</span>
            </div>
            <div className="prop-row">
              <span className="prop-label">顏色</span>
              <span className="prop-value" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                <div style={{
                  width: '14px', height: '14px',
                  backgroundColor: selectedVoxel.material_data.color,
                  borderRadius: '2px', border: '1px solid var(--border)'
                }} />
                {selectedVoxel.material_data.color}
              </span>
            </div>

            {/* NURBS Data */}
            {selectedVoxel.nurbs_curve && (
              <>
                <div className="prop-group-title" style={{ marginTop: '8px' }}>NURBS 參數</div>
                <div className="prop-row">
                  <span className="prop-label">階數</span>
                  <span className="prop-value">{selectedVoxel.nurbs_curve.degree}</span>
                </div>
                <div className="prop-row">
                  <span className="prop-label">控制點數</span>
                  <span className="prop-value">{selectedVoxel.nurbs_curve.control_points.length}</span>
                </div>
                <div className="prop-row">
                  <span className="prop-label">節點數</span>
                  <span className="prop-value">{selectedVoxel.nurbs_curve.knots.length}</span>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="prop-group">
            <div className="prop-group-title">體素屬性</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '8px 0' }}>
              未選取任何體素。使用選取工具點擊體素查看屬性。
            </div>
          </div>
        )}

        {/* NURBS Conversion Result */}
        {state.nurbsResult && (
          <div className="prop-group">
            <div className="prop-group-title">NURBS 轉換結果</div>
            <div className="prop-row">
              <span className="prop-label">曲面數量</span>
              <span className="prop-value">{state.nurbsResult.nurbs_surfaces.length}</span>
            </div>
            <div className="prop-row">
              <span className="prop-label">特徵線數</span>
              <span className="prop-value">{state.nurbsResult.feature_lines.length}</span>
            </div>
            <div className="prop-row">
              <span className="prop-label">最大偏差</span>
              <span className="prop-value">{state.nurbsResult.quality_metrics.max_deviation_mm.toFixed(4)} mm</span>
            </div>
            <div className="prop-row">
              <span className="prop-label">平均偏差</span>
              <span className="prop-value">{state.nurbsResult.quality_metrics.mean_deviation_mm.toFixed(4)} mm</span>
            </div>
            <div className="prop-row">
              <span className="prop-label">迭代次數</span>
              <span className="prop-value">{state.nurbsResult.quality_metrics.convergence_iterations}</span>
            </div>
            <div className="prop-row">
              <span className="prop-label">求解器</span>
              <span className="prop-value">{state.nurbsResult.quality_metrics.solver_used}</span>
            </div>
          </div>
        )}

        {/* Engine Status */}
        <div className="prop-group">
          <div className="prop-group-title">引擎狀態</div>
          {Object.entries(state.engineStatus).map(([engine, status]) => (
            <div className="prop-row" key={engine}>
              <span className="prop-label" style={{ fontSize: '11px' }}>
                {engine === 'voxel' ? '體素引擎' :
                 engine === 'semantic' ? '語意引擎' :
                 engine === 'loadPhysics' ? '負載引擎' :
                 engine === 'layer' ? '圖層引擎' :
                 engine === 'agent' ? '代理人引擎' :
                 engine === 'multiplayer' ? '多人引擎' :
                 engine === 'texture' ? '貼圖引擎' :
                 engine === 'lod' ? 'LOD引擎' : engine}
              </span>
              <span className="prop-value">
                <span className={`status-dot ${status ? 'green' : 'red'}`} style={{ display: 'inline-block' }} />
              </span>
            </div>
          ))}
        </div>

        {/* Physics State */}
        <div className="prop-group">
          <div className="prop-group-title">物理狀態</div>
          <div className="prop-row">
            <span className="prop-label">重力向量</span>
            <span className="prop-value">
              [{state.project.global_physics_state.gravity_vector.join(', ')}]
            </span>
          </div>
          <div className="prop-row">
            <span className="prop-label">應力閾值</span>
            <span className="prop-value">{state.project.global_physics_state.global_stress_threshold} MPa</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PropertiesPanel;
