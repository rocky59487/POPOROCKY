import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useStore, Voxel, DEFAULT_MATERIALS } from '../store/useStore';
import { loadEngine } from '../engines/LoadEngine';
import eventBus from '../engines/EventBus';
import {
  Trash2, Copy, Anchor, ArrowDown, Paintbrush, Tag,
  Link, Unlink, Eye, Layers, ChevronRight, Package
} from 'lucide-react';

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  voxel: Voxel | null;
}

const MATERIAL_OPTIONS = [
  { id: 'concrete', name: '混凝土', color: '#808080' },
  { id: 'steel', name: '鋼材', color: '#C0C0C0' },
  { id: 'wood', name: '木材', color: '#8B4513' },
  { id: 'brick', name: '磚塊', color: '#8B3A3A' },
  { id: 'aluminum', name: '鋁合金', color: '#d0d0e0' },
  { id: 'glass', name: '玻璃', color: '#88ccee' },
];

export function ContextMenu() {
  const [menu, setMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, voxel: null });
  const [showMaterialSub, setShowMaterialSub] = useState(false);
  const [showSemanticSub, setShowSemanticSub] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const removeVoxel = useStore(s => s.removeVoxel);
  const updateVoxel = useStore(s => s.updateVoxel);
  const toggleVoxelSupport = useStore(s => s.toggleVoxelSupport);
  const setVoxelExternalLoad = useStore(s => s.setVoxelExternalLoad);
  const selectVoxels = useStore(s => s.selectVoxels);
  const addVoxel = useStore(s => s.addVoxel);
  const addLog = useStore(s => s.addLog);
  const setTool = useStore(s => s.setTool);

  // Listen for context menu events from viewport
  useEffect(() => {
    const onShow = (data: { voxel: Voxel; screenX: number; screenY: number }) => {
      // Adjust position to stay within viewport
      const x = Math.min(data.screenX, window.innerWidth - 220);
      const y = Math.min(data.screenY, window.innerHeight - 400);
      setMenu({ visible: true, x, y, voxel: data.voxel });
      setShowMaterialSub(false);
      setShowSemanticSub(false);
    };
    eventBus.on('context-menu:show', onShow);
    return () => { eventBus.off('context-menu:show', onShow); };
  }, []);

  // Close on click outside or Escape
  useEffect(() => {
    if (!menu.visible) return;
    const onClose = () => setMenu(m => ({ ...m, visible: false }));
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    // Prevent native context menu
    const onNativeContext = (e: MouseEvent) => { e.preventDefault(); };

    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick, { capture: true });
    document.addEventListener('contextmenu', onNativeContext);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick, { capture: true });
      document.removeEventListener('contextmenu', onNativeContext);
    };
  }, [menu.visible]);

  const close = useCallback(() => setMenu(m => ({ ...m, visible: false })), []);

  if (!menu.visible || !menu.voxel) return null;

  const v = menu.voxel;
  const hasLoad = v.externalLoad && (v.externalLoad.x !== 0 || v.externalLoad.y !== 0 || v.externalLoad.z !== 0);
  const currentMat = MATERIAL_OPTIONS.find(m => m.id === v.materialId) || MATERIAL_OPTIONS[0];

  const menuItems = [
    {
      icon: <Eye size={13} />, label: '選取此體素',
      action: () => { selectVoxels([v.id]); close(); },
    },
    { type: 'separator' as const },
    {
      icon: <Package size={13} />, label: `材質: ${currentMat.name}`,
      hasSubmenu: true,
      action: () => { setShowMaterialSub(!showMaterialSub); setShowSemanticSub(false); },
    },
    {
      icon: <Tag size={13} />, label: `語意: ${v.semanticTag || '無'}`,
      hasSubmenu: true,
      action: () => { setShowSemanticSub(!showSemanticSub); setShowMaterialSub(false); },
    },
    { type: 'separator' as const },
    {
      icon: <Anchor size={13} />, label: v.isSupport ? '取消固定支撐' : '設為固定支撐',
      action: () => { toggleVoxelSupport(v.id); addLog('info', 'FEA', `${v.isSupport ? '取消' : '設定'}支撐點`); close(); },
      highlight: v.isSupport,
    },
    {
      icon: <ArrowDown size={13} />, label: hasLoad ? '移除外部負載' : '施加外部負載 (-50kN)',
      action: () => {
        if (hasLoad) {
          setVoxelExternalLoad(v.id, undefined);
          addLog('info', 'FEA', '移除外部負載');
        } else {
          setVoxelExternalLoad(v.id, { x: 0, y: -50000, z: 0 });
          addLog('info', 'FEA', '施加外部負載 [0, -50000, 0] N');
        }
        close();
      },
      highlight: !!hasLoad,
    },
    {
      icon: <Link size={13} />, label: '黏合至...',
      action: () => { setTool('glue'); addLog('info', 'Glue', '請點擊要黏合的目標體素'); close(); },
    },
    { type: 'separator' as const },
    {
      icon: <Copy size={13} />, label: '複製體素',
      action: () => {
        const newV: Voxel = {
          ...v,
          id: `v_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
          pos: { x: v.pos.x, y: v.pos.y + 1, z: v.pos.z },
        };
        addVoxel(newV);
        addLog('info', 'Voxel', `複製至 (${newV.pos.x},${newV.pos.y},${newV.pos.z})`);
        close();
      },
    },
    {
      icon: <Trash2 size={13} />, label: '刪除體素', danger: true,
      action: () => { removeVoxel(v.id); addLog('info', 'Voxel', `刪除 (${v.pos.x},${v.pos.y},${v.pos.z})`); close(); },
    },
  ];

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: menu.x, top: menu.y }}
      onContextMenu={e => e.preventDefault()}
    >
      {/* Header */}
      <div className="context-menu-header">
        <span style={{ color: currentMat.color, marginRight: 6 }}>&#9632;</span>
        體素 ({v.pos.x}, {v.pos.y}, {v.pos.z})
      </div>

      {menuItems.map((item, i) => {
        if ('type' in item && item.type === 'separator') {
          return <div key={`sep_${i}`} className="context-menu-separator" />;
        }
        const mi = item as any;
        return (
          <div
            key={i}
            className={`context-menu-item ${mi.danger ? 'danger' : ''} ${mi.highlight ? 'highlight' : ''}`}
            onClick={mi.action}
          >
            <span className="context-menu-icon">{mi.icon}</span>
            <span className="context-menu-label">{mi.label}</span>
            {mi.hasSubmenu && <ChevronRight size={12} style={{ marginLeft: 'auto', opacity: 0.5 }} />}
          </div>
        );
      })}

      {/* Material submenu */}
      {showMaterialSub && (
        <div className="context-submenu" style={{ top: 68 }}>
          {MATERIAL_OPTIONS.map(mat => (
            <div
              key={mat.id}
              className={`context-menu-item ${mat.id === v.materialId ? 'highlight' : ''}`}
              onClick={() => {
                const preset = loadEngine.getMaterialPreset(mat.id);
                updateVoxel(v.id, {
                  materialId: mat.id,
                  color: mat.color,
                  material: preset ? { ...preset.material } : (DEFAULT_MATERIALS[mat.id] || DEFAULT_MATERIALS.concrete),
                });
                addLog('info', 'Material', `更換材質 → ${mat.name}`);
                close();
              }}
            >
              <span style={{ color: mat.color, marginRight: 8, fontSize: 14 }}>&#9632;</span>
              <span className="context-menu-label">{mat.name}</span>
              {mat.id === v.materialId && <span style={{ marginLeft: 'auto', color: 'var(--accent)', fontSize: 11 }}>&#10003;</span>}
            </div>
          ))}
        </div>
      )}

      {/* Semantic tag submenu */}
      {showSemanticSub && (
        <div className="context-submenu" style={{ top: 94 }}>
          {(['sharp', 'smooth', 'fillet'] as const).map(tag => (
            <div
              key={tag}
              className={`context-menu-item ${tag === v.semanticTag ? 'highlight' : ''}`}
              onClick={() => {
                updateVoxel(v.id, { semanticTag: tag === v.semanticTag ? undefined : tag });
                addLog('info', 'Semantic', `語意標記 → ${tag}`);
                close();
              }}
            >
              <span className="context-menu-label">
                {tag === 'sharp' ? '銳邊 (Sharp)' : tag === 'smooth' ? '平滑 (Smooth)' : '圓角 (Fillet)'}
              </span>
              {tag === v.semanticTag && <span style={{ marginLeft: 'auto', color: 'var(--accent)', fontSize: 11 }}>&#10003;</span>}
            </div>
          ))}
          <div className="context-menu-separator" />
          <div
            className="context-menu-item"
            onClick={() => {
              updateVoxel(v.id, { semanticTag: undefined });
              addLog('info', 'Semantic', '清除語意標記');
              close();
            }}
          >
            <Unlink size={13} style={{ marginRight: 8 }} />
            <span className="context-menu-label">清除標記</span>
          </div>
        </div>
      )}
    </div>
  );
}
