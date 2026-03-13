import React, { useState } from 'react';
import { useStore, Voxel, DEFAULT_MATERIALS } from '../../store/useStore';
import { voxelEngine } from '../../engines/VoxelEngine';
import { MATERIAL_PRESETS } from '../../engines/LoadEngine';
import { semanticEngine, VoxelCategory } from '../../engines/SemanticEngine';
import { BookOpen, ChevronDown, ChevronRight, Building2, Columns3, Fence, Box, Triangle, Hexagon } from 'lucide-react';

interface TemplateVoxelData {
  pos: { x: number; y: number; z: number };
  materialId: string;
  /** 語意分類（可選，預設由 SemanticEngine 自動推斷） */
  semanticCategory?: VoxelCategory;
  /** 語意標籤（可選） */
  semanticTags?: string[];
}

interface TemplateItem {
  id: string;
  name: string;
  icon: React.ReactNode;
  description: string;
  category: string;
  generate: (ox: number, oy: number, oz: number) => TemplateVoxelData[];
}

const getMat = (id: string) => {
  const p = MATERIAL_PRESETS.find(m => m.id === id);
  return p ? { ...p.material } : { ...DEFAULT_MATERIALS[id] || DEFAULT_MATERIALS.concrete };
};

const MATERIAL_COLORS: Record<string, string> = {
  concrete: '#808080', steel: '#C0C0C0', wood: '#8B4513', brick: '#8B3A3A',
};

const templates: TemplateItem[] = [
  {
    id: 'wall_3x5', name: '牆壁 3×5', icon: <Fence size={14} />,
    description: '3格寬 5格高的磚牆', category: '基礎',
    generate: (ox, oy, oz) => {
      const result: TemplateVoxelData[] = [];
      for (let x = 0; x < 3; x++) for (let y = 0; y < 5; y++)
        result.push({ pos: { x: ox + x, y: oy + y, z: oz }, materialId: 'brick',
          semanticCategory: 'structure', semanticTags: ['wall'] });
      return result;
    },
  },
  {
    id: 'pillar_1x8', name: '柱子 1×8', icon: <Columns3 size={14} />,
    description: '1格寬 8格高的鋼柱', category: '基礎',
    generate: (ox, oy, oz) => {
      const result: TemplateVoxelData[] = [];
      for (let y = 0; y < 8; y++)
        result.push({ pos: { x: ox, y: oy + y, z: oz }, materialId: 'steel',
          semanticCategory: 'structure', semanticTags: ['column'] });
      return result;
    },
  },
  {
    id: 'floor_5x5', name: '樓板 5×5', icon: <Box size={14} />,
    description: '5×5 混凝土樓板', category: '基礎',
    generate: (ox, oy, oz) => {
      const result: TemplateVoxelData[] = [];
      for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++)
        result.push({ pos: { x: ox + x, y: oy, z: oz + z }, materialId: 'concrete',
          semanticCategory: 'structure', semanticTags: ['slab'] });
      return result;
    },
  },
  {
    id: 'beam_7', name: '橫樑 7格', icon: <Box size={14} />,
    description: '7格長的木橫樑', category: '基礎',
    generate: (ox, oy, oz) => {
      const result: TemplateVoxelData[] = [];
      for (let x = 0; x < 7; x++)
        result.push({ pos: { x: ox + x, y: oy, z: oz }, materialId: 'wood',
          semanticCategory: 'structure', semanticTags: ['beam'] });
      return result;
    },
  },
  {
    id: 'arch_5', name: '拱門 5格', icon: <Triangle size={14} />,
    description: '5格寬的拱門結構', category: '結構',
    generate: (ox, oy, oz) => {
      const result: TemplateVoxelData[] = [];
      // Pillars
      for (let y = 0; y < 4; y++) {
        result.push({ pos: { x: ox, y: oy + y, z: oz }, materialId: 'brick',
          semanticCategory: 'structure', semanticTags: ['arch', 'column'] });
        result.push({ pos: { x: ox + 4, y: oy + y, z: oz }, materialId: 'brick',
          semanticCategory: 'structure', semanticTags: ['arch', 'column'] });
      }
      // Arch top
      result.push({ pos: { x: ox + 1, y: oy + 4, z: oz }, materialId: 'brick',
        semanticCategory: 'structure', semanticTags: ['arch'] });
      result.push({ pos: { x: ox + 2, y: oy + 5, z: oz }, materialId: 'brick',
        semanticCategory: 'structure', semanticTags: ['arch'] });
      result.push({ pos: { x: ox + 3, y: oy + 4, z: oz }, materialId: 'brick',
        semanticCategory: 'structure', semanticTags: ['arch'] });
      return result;
    },
  },
  {
    id: 'frame_4x4x4', name: '框架 4×4×4', icon: <Building2 size={14} />,
    description: '4×4×4 鋼框架結構', category: '結構',
    generate: (ox, oy, oz) => {
      const result: TemplateVoxelData[] = [];
      // 4 pillars
      for (const [px, pz] of [[0, 0], [3, 0], [0, 3], [3, 3]]) {
        for (let y = 0; y < 4; y++)
          result.push({ pos: { x: ox + px, y: oy + y, z: oz + pz }, materialId: 'steel',
            semanticCategory: 'structure', semanticTags: ['column'] });
      }
      // Top beams
      for (let x = 0; x <= 3; x++) {
        result.push({ pos: { x: ox + x, y: oy + 3, z: oz }, materialId: 'steel',
          semanticCategory: 'structure', semanticTags: ['beam'] });
        result.push({ pos: { x: ox + x, y: oy + 3, z: oz + 3 }, materialId: 'steel',
          semanticCategory: 'structure', semanticTags: ['beam'] });
      }
      for (let z = 1; z < 3; z++) {
        result.push({ pos: { x: ox, y: oy + 3, z: oz + z }, materialId: 'steel',
          semanticCategory: 'structure', semanticTags: ['beam'] });
        result.push({ pos: { x: ox + 3, y: oy + 3, z: oz + z }, materialId: 'steel',
          semanticCategory: 'structure', semanticTags: ['beam'] });
      }
      return result;
    },
  },
  {
    id: 'stairs_5', name: '階梯 5級', icon: <Triangle size={14} />,
    description: '5級混凝土階梯', category: '結構',
    generate: (ox, oy, oz) => {
      const result: TemplateVoxelData[] = [];
      for (let step = 0; step < 5; step++) {
        for (let fill = 0; fill <= step; fill++) {
          result.push({ pos: { x: ox + step, y: oy + fill, z: oz }, materialId: 'concrete',
            semanticCategory: 'structure', semanticTags: ['stair'] });
          result.push({ pos: { x: ox + step, y: oy + fill, z: oz + 1 }, materialId: 'concrete',
            semanticCategory: 'structure', semanticTags: ['stair'] });
        }
      }
      return result;
    },
  },
  {
    id: 'pyramid_5', name: '金字塔 5層', icon: <Hexagon size={14} />,
    description: '5層金字塔結構', category: '造型',
    generate: (ox, oy, oz) => {
      const result: TemplateVoxelData[] = [];
      for (let layer = 0; layer < 5; layer++) {
        const size = 5 - layer;
        const off = layer;
        for (let x = 0; x < size; x++) {
          for (let z = 0; z < size; z++) {
            result.push({ pos: { x: ox + off + x, y: oy + layer, z: oz + off + z }, materialId: 'brick',
              semanticCategory: 'decoration', semanticTags: ['pyramid'] });
          }
        }
      }
      return result;
    },
  },
];

export function TemplateLibrary() {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedCat, setExpandedCat] = useState<string>('基礎');
  const addVoxel = useStore(s => s.addVoxel);
  const addLog = useStore(s => s.addLog);
  const activeLayerId = useStore(s => s.activeLayerId);

  const categories = [...new Set(templates.map(t => t.category))];

  const placeTemplate = (template: TemplateItem) => {
    const voxelData = template.generate(0, 0, 0);
    let count = 0;
    for (const d of voxelData) {
      const mat = getMat(d.materialId);
      const color = MATERIAL_COLORS[d.materialId] || '#808080';
      const vId = `tpl_${Date.now()}_${count}`;
      const v: Voxel = {
        id: vId,
        pos: d.pos,
        color,
        layerId: activeLayerId,
        material: mat,
        isSupport: false,
        materialId: d.materialId,
      };
      addVoxel(v);
      voxelEngine.addVoxel(v);

      // 設定語意標籤（如果模板有提供）
      if (d.semanticCategory || d.semanticTags) {
        if (d.semanticCategory) {
          semanticEngine.setCategory(vId, d.semanticCategory);
        }
        if (d.semanticTags) {
          for (const tag of d.semanticTags) {
            semanticEngine.addTag(vId, tag);
          }
        }
      }
      count++;
    }
    addLog('success', 'Template', `已放置模板「${template.name}」(${count} 個體素)`);
    // 刷新語意統計
    useStore.getState().refreshSemanticStats();
  };

  return (
    <div className="glass-panel" style={{ marginTop: 4 }}>
      <div
        className="panel-header"
        style={{ cursor: 'pointer' }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <BookOpen size={12} /> 模板庫
        </span>
        {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </div>
      {isOpen && (
        <div className="panel-body" style={{ padding: '4px 6px', maxHeight: 300, overflowY: 'auto' }}>
          {categories.map(cat => (
            <div key={cat}>
              <div
                className="prop-section-title"
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                onClick={() => setExpandedCat(expandedCat === cat ? '' : cat)}
              >
                {expandedCat === cat ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                {cat}
              </div>
              {expandedCat === cat && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 6 }}>
                  {templates.filter(t => t.category === cat).map(t => (
                    <div
                      key={t.id}
                      className="template-item"
                      onClick={() => placeTemplate(t)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '5px 8px', borderRadius: 4, cursor: 'pointer',
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid transparent',
                        transition: 'all 0.15s',
                        fontSize: 11,
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLElement).style.background = 'rgba(88,166,255,0.08)';
                        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(88,166,255,0.2)';
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)';
                        (e.currentTarget as HTMLElement).style.borderColor = 'transparent';
                      }}
                    >
                      <span style={{ color: 'var(--accent)', flexShrink: 0 }}>{t.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{t.name}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: 9 }}>{t.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
