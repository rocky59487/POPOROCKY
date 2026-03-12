import React, { useState, useMemo, useCallback } from 'react';
import { useStore } from '../../store/useStore';
import { Search, Filter, X, Eye, Target } from 'lucide-react';

const MATERIAL_OPTIONS = [
  { id: 'all', label: '全部材質' },
  { id: 'concrete', label: '混凝土' },
  { id: 'steel', label: '鋼材' },
  { id: 'wood', label: '木材' },
  { id: 'brick', label: '磚塊' },
  { id: 'aluminum', label: '鋁合金' },
  { id: 'glass', label: '玻璃' },
];

export function VoxelSearch() {
  const voxels = useStore(s => s.voxels);
  const selectVoxels = useStore(s => s.selectVoxels);
  const layers = useStore(s => s.layers);
  const [materialFilter, setMaterialFilter] = useState('all');
  const [layerFilter, setLayerFilter] = useState('all');
  const [coordFilter, setCoordFilter] = useState('');
  const [showPanel, setShowPanel] = useState(false);

  const filteredVoxels = useMemo(() => {
    let result = voxels;

    if (materialFilter !== 'all') {
      result = result.filter(v => v.materialId === materialFilter);
    }

    if (layerFilter !== 'all') {
      result = result.filter(v => v.layerId === layerFilter);
    }

    if (coordFilter.trim()) {
      try {
        const parts = coordFilter.trim().split(/\s*,\s*/);
        for (const part of parts) {
          const match = part.match(/^([xyz])\s*(>|<|>=|<=|=|==)\s*(-?\d+)$/i);
          if (match) {
            const axis = match[1].toLowerCase() as 'x' | 'y' | 'z';
            const op = match[2];
            const val = parseInt(match[3]);
            result = result.filter(v => {
              const coord = v.pos[axis];
              switch (op) {
                case '>': return coord > val;
                case '<': return coord < val;
                case '>=': return coord >= val;
                case '<=': return coord <= val;
                case '=': case '==': return coord === val;
                default: return true;
              }
            });
          }
        }
      } catch (e) {
        // Invalid filter, ignore
      }
    }

    return result;
  }, [voxels, materialFilter, layerFilter, coordFilter]);

  const handleSelectFiltered = useCallback(() => {
    selectVoxels(filteredVoxels.map(v => v.id));
  }, [filteredVoxels, selectVoxels]);

  const handleClearFilters = useCallback(() => {
    setMaterialFilter('all');
    setLayerFilter('all');
    setCoordFilter('');
  }, []);

  if (!showPanel) {
    return (
      <div className="panel-section">
        <button
          className="panel-section-header"
          onClick={() => setShowPanel(true)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', background: 'none', border: 'none', color: '#e6edf3', padding: '6px 8px', fontSize: 11 }}
        >
          <Search size={12} />
          <span>搜尋和過濾體素</span>
        </button>
      </div>
    );
  }

  return (
    <div className="panel-section">
      <div className="panel-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Filter size={12} />
          <span>搜尋和過濾</span>
        </div>
        <button onClick={() => setShowPanel(false)} style={{ background: 'none', border: 'none', color: '#9ca3b4', cursor: 'pointer', padding: 2 }}>
          <X size={12} />
        </button>
      </div>

      <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Material filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: 10, color: '#9ca3b4', width: 40 }}>材質</label>
          <select
            value={materialFilter}
            onChange={e => setMaterialFilter(e.target.value)}
            style={{
              flex: 1, background: '#161b22', border: '1px solid #30363d', borderRadius: 4,
              color: '#e6edf3', fontSize: 10, padding: '3px 6px',
            }}
          >
            {MATERIAL_OPTIONS.map(o => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Layer filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: 10, color: '#9ca3b4', width: 40 }}>圖層</label>
          <select
            value={layerFilter}
            onChange={e => setLayerFilter(e.target.value)}
            style={{
              flex: 1, background: '#161b22', border: '1px solid #30363d', borderRadius: 4,
              color: '#e6edf3', fontSize: 10, padding: '3px 6px',
            }}
          >
            <option value="all">全部圖層</option>
            {layers.map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>

        {/* Coordinate filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: 10, color: '#9ca3b4', width: 40 }}>座標</label>
          <input
            type="text"
            value={coordFilter}
            onChange={e => setCoordFilter(e.target.value)}
            placeholder="x>5, y>=0, z<10"
            style={{
              flex: 1, background: '#161b22', border: '1px solid #30363d', borderRadius: 4,
              color: '#e6edf3', fontSize: 10, padding: '3px 6px',
            }}
          />
        </div>

        {/* Results */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
          <span style={{ fontSize: 10, color: '#9ca3b4' }}>
            符合: {filteredVoxels.length} / {voxels.length} 個體素
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={handleSelectFiltered}
              style={{
                background: '#1f6feb33', border: '1px solid #1f6feb55', borderRadius: 4,
                color: '#58a6ff', fontSize: 9, padding: '2px 8px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 3,
              }}
            >
              <Target size={10} /> 選取
            </button>
            <button
              onClick={handleClearFilters}
              style={{
                background: '#21262d', border: '1px solid #30363d', borderRadius: 4,
                color: '#9ca3b4', fontSize: 9, padding: '2px 8px', cursor: 'pointer',
              }}
            >
              清除
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
