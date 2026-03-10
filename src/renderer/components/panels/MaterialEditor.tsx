/**
 * MaterialEditor - Edit voxel material properties (structural properties)
 * Shows when a voxel is selected, allows editing maxCompression, maxTension, density, youngModulus
 */
import React, { useState, useCallback, useMemo } from 'react';
import { useStore, DEFAULT_MATERIALS, VoxelMaterial } from '../../store/useStore';
import { MATERIAL_PRESETS } from '../../engines/LoadEngine';
import { Settings, Copy, Palette } from 'lucide-react';

const PRESET_COLORS: { hex: string; name: string }[] = [
  { hex: '#808080', name: '灰色' }, { hex: '#C0C0C0', name: '銀色' },
  { hex: '#8B4513', name: '棕色' }, { hex: '#8B3A3A', name: '紅棕' },
  { hex: '#d0d0e0', name: '淺灰' }, { hex: '#88ccee', name: '淺藍' },
  { hex: '#ff4757', name: '紅色' }, { hex: '#3dd68c', name: '綠色' },
  { hex: '#638cff', name: '藍色' }, { hex: '#f5a623', name: '橙色' },
  { hex: '#a78bfa', name: '紫色' }, { hex: '#ffd700', name: '金色' },
  { hex: '#ffffff', name: '白色' }, { hex: '#333333', name: '深灰' },
  { hex: '#e879f9', name: '粉紫' }, { hex: '#22d3ee', name: '青色' },
];

export function MaterialEditor() {
  const selectedIds = useStore(s => s.selectedVoxelIds);
  const voxels = useStore(s => s.voxels);
  const updateVoxel = useStore(s => s.updateVoxel);
  const addLog = useStore(s => s.addLog);
  const [expanded, setExpanded] = useState(true);

  const selectedVoxels = useMemo(() =>
    voxels.filter(v => selectedIds.includes(v.id)),
    [voxels, selectedIds]
  );

  const firstVoxel = selectedVoxels[0];

  const updateMaterialProp = useCallback((prop: keyof VoxelMaterial, value: number) => {
    for (const v of selectedVoxels) {
      updateVoxel(v.id, {
        material: { ...v.material, [prop]: value },
      });
    }
  }, [selectedVoxels, updateVoxel]);

  const changeMaterialType = useCallback((matId: string) => {
    const preset = MATERIAL_PRESETS.find(p => p.id === matId);
    if (!preset) return;
    const MATERIAL_COLORS: Record<string, string> = {
      concrete: '#808080', steel: '#C0C0C0', wood: '#8B4513',
      brick: '#8B3A3A', aluminum: '#d0d0e0', glass: '#88ccee',
    };
    for (const v of selectedVoxels) {
      updateVoxel(v.id, {
        materialId: matId,
        material: { ...preset.material },
        color: MATERIAL_COLORS[matId] || v.color,
      });
    }
    addLog('info', 'Material', `已將 ${selectedVoxels.length} 個體素材質更改為 ${preset.name}`);
  }, [selectedVoxels, updateVoxel, addLog]);

  const applyToAllSameType = useCallback(() => {
    if (!firstVoxel) return;
    const matId = firstVoxel.materialId || 'concrete';
    const sameTypeVoxels = voxels.filter(v => v.materialId === matId);
    for (const v of sameTypeVoxels) {
      updateVoxel(v.id, {
        material: { ...firstVoxel.material },
      });
    }
    addLog('success', 'Material', `已將材質屬性套用到所有 ${matId} 體素（${sameTypeVoxels.length} 個）`);
  }, [firstVoxel, voxels, updateVoxel, addLog]);

  const changeColor = useCallback((color: string) => {
    for (const v of selectedVoxels) {
      updateVoxel(v.id, { color });
    }
    addLog('info', 'Color', `已將 ${selectedVoxels.length} 個體素顏色更改為 ${color}`);
  }, [selectedVoxels, updateVoxel, addLog]);

  if (selectedVoxels.length === 0) return null;

  const mat = firstVoxel.material;

  return (
    <div className="glass-panel" style={{ marginTop: 4 }}>
      <div className="panel-header" onClick={() => setExpanded(!expanded)} style={{ cursor: 'pointer' }}>
        <span><Settings size={11} style={{ marginRight: 4 }} /> 材質屬性編輯</span>
        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{selectedVoxels.length} 個選取</span>
      </div>
      {expanded && (
        <div className="panel-body" style={{ padding: '6px 8px' }}>
          {/* Material Type */}
          <div className="prop-section">
            <div className="prop-section-title">材質類型</div>
            <select
              value={firstVoxel.materialId || 'concrete'}
              onChange={e => changeMaterialType(e.target.value)}
              style={{
                width: '100%', padding: '4px 8px', fontSize: 11,
                background: 'var(--bg-input)', color: 'var(--text-primary)',
                border: '1px solid var(--border)', borderRadius: 4, outline: 'none',
              }}
            >
              {MATERIAL_PRESETS.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Color Picker */}
          <div className="prop-section">
            <div className="prop-section-title"><Palette size={10} style={{ marginRight: 4 }} />自訂顏色</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 3, marginBottom: 6 }}>
              {PRESET_COLORS.map(c => (
                <button
                  key={c.hex}
                  onClick={() => changeColor(c.hex)}
                  title={c.name}
                  style={{
                    width: '100%', aspectRatio: '1', borderRadius: 3, border: firstVoxel.color === c.hex ? '2px solid #fff' : '1px solid rgba(255,255,255,0.1)',
                    background: c.hex, cursor: 'pointer', padding: 0,
                  }}
                />
              ))}
            </div>
            <div className="prop-row">
              <span className="prop-label">自訂 HEX</span>
              <input
                type="color"
                value={firstVoxel.color}
                onChange={e => changeColor(e.target.value)}
                style={{ width: 28, height: 20, border: 'none', padding: 0, cursor: 'pointer' }}
              />
            </div>
          </div>

          {/* Structural Properties */}
          <div className="prop-section">
            <div className="prop-section-title">結構屬性</div>
            <div className="prop-row">
              <span className="prop-label">最大壓縮 (MPa)</span>
              <input
                type="number" step={1} min={0} max={10000}
                value={mat.maxCompression}
                onChange={e => updateMaterialProp('maxCompression', parseFloat(e.target.value) || 0)}
                className="input" style={{ width: 70, fontSize: 10 }}
              />
            </div>
            <div className="prop-row">
              <span className="prop-label">最大拉伸 (MPa)</span>
              <input
                type="number" step={1} min={0} max={10000}
                value={mat.maxTension}
                onChange={e => updateMaterialProp('maxTension', parseFloat(e.target.value) || 0)}
                className="input" style={{ width: 70, fontSize: 10 }}
              />
            </div>
            <div className="prop-row">
              <span className="prop-label">密度 (kg/m³)</span>
              <input
                type="number" step={10} min={0} max={50000}
                value={mat.density}
                onChange={e => updateMaterialProp('density', parseFloat(e.target.value) || 0)}
                className="input" style={{ width: 70, fontSize: 10 }}
              />
            </div>
            <div className="prop-row">
              <span className="prop-label">楊氏模量 (MPa)</span>
              <input
                type="number" step={1000} min={0} max={1000000}
                value={mat.youngModulus}
                onChange={e => updateMaterialProp('youngModulus', parseFloat(e.target.value) || 0)}
                className="input" style={{ width: 70, fontSize: 10 }}
              />
            </div>
          </div>

          {/* Apply to all same type */}
          <button className="btn btn-sm" onClick={applyToAllSameType} style={{ width: '100%', marginTop: 4 }}>
            <Copy size={11} /> 套用到所有同類型體素
          </button>
        </div>
      )}
    </div>
  );
}
