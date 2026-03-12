import React from 'react';
import { X, ExternalLink } from 'lucide-react';

interface Props { open: boolean; onClose: () => void; }

const engines = [
  { name: '體素引擎 (VoxelEngine)', color: '#3dd68c', desc: 'Chunk-based Octree, Undo/Redo, 三種刷形狀' },

  { name: '負載引擎 (LoadEngine)', color: '#ff4757', desc: '簡化桁架 FEA, CG 求解器, 應力熱圖' },
  { name: '圖層引擎 (LayerEngine)', color: '#f5a623', desc: 'Group 層級, 混合模式, 遮罩, 拖拽排序' },
  { name: '多人引擎 (MultiplayerEngine)', color: '#a78bfa', desc: 'Yjs CRDT, WebSocket, 游標追蹤' },
  { name: '貼圖引擎 (TextureEngine)', color: '#f472b6', desc: 'PBR 材質, 程序貼圖生成, 貼圖庫' },
  { name: 'LOD 引擎 (LODEngine)', color: '#22d3ee', desc: 'meshoptimizer QEM, 4 層級, 距離自動切換' },
];

const deps = [
  'Three.js', 'React Three Fiber', '@react-three/drei', 'Electron',
  'Zustand', 'Yjs', 'meshoptimizer', 'verb-nurbs-web', 'rhino3dm',
  'cmdk', 'Fuse.js', 'mathjs',
  'three-mesh-bvh', 'Lucide React',
];

export function AboutDialog({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={e => e.stopPropagation()} style={{ minWidth: 500 }}>
        <div className="dialog-header">
          <h2>關於 FastDesign</h2>
          <button className="dialog-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="dialog-body">
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{
              fontSize: 28, fontWeight: 800, letterSpacing: -1,
              background: 'linear-gradient(135deg, #638cff, #a78bfa, #f472b6)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              marginBottom: 4,
            }}>FastDesign</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 2 }}>
              次世代 3D 敏捷設計系統
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              版本 2.2.0 | Electron + React + Three.js + VoxelBuffer
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              六大引擎
            </div>
            {engines.map(e => (
              <div key={e.name} className="about-engine-item">
                <div className="about-engine-dot" style={{ background: e.color }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>{e.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{e.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              演算法管線
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
              <span style={{ padding: '2px 8px', background: 'rgba(61,214,140,0.1)', borderRadius: 4, color: '#3dd68c' }}>Marching Cubes</span>
              <span>→</span>
              <span style={{ padding: '2px 8px', background: 'rgba(99,140,255,0.1)', borderRadius: 4, color: '#638cff' }}>QEM 簡化</span>
              <span>→</span>
              <span style={{ padding: '2px 8px', background: 'rgba(167,139,250,0.1)', borderRadius: 4, color: '#a78bfa' }}>NURBS 擬合</span>
              <span>→</span>
              <span style={{ padding: '2px 8px', background: 'rgba(244,114,182,0.1)', borderRadius: 4, color: '#f472b6' }}>匯出</span>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              開源依賴
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {deps.map(d => (
                <span key={d} style={{
                  padding: '2px 8px', fontSize: 10, background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text-secondary)',
                }}>{d}</span>
              ))}
            </div>
          </div>

          <div style={{ textAlign: 'center', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <a href="#" onClick={e => e.preventDefault()} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              color: 'var(--accent)', fontSize: 12, textDecoration: 'none',
            }}>
              <ExternalLink size={14} />
              github.com/rocky59487/POPOROCKY
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
