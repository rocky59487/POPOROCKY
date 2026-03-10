import React, { useMemo } from 'react';
import { useStore, DEFAULT_MATERIALS } from '../../store/useStore';
import { Box, Link, Weight, Layers, Activity, Triangle, Cpu, MemoryStick } from 'lucide-react';

const MATERIAL_LABELS: Record<string, { name: string; color: string; density: number }> = {
  concrete: { name: '混凝土', color: '#808080', density: 2400 },
  steel:    { name: '鋼材', color: '#C0C0C0', density: 7850 },
  wood:     { name: '木材', color: '#8B4513', density: 600 },
  brick:    { name: '磚塊', color: '#8B3A3A', density: 1800 },
  aluminum: { name: '鋁合金', color: '#d0d0e0', density: 2700 },
  glass:    { name: '玻璃', color: '#88ccee', density: 2500 },
};

export function SceneStatsPanel() {
  const voxels = useStore(s => s.voxels);
  const glueJoints = useStore(s => s.glueJoints);
  const layers = useStore(s => s.layers);
  const fps = useStore(s => s.fps);
  const memoryUsage = useStore(s => s.memoryUsage);
  const triangleCount = useStore(s => s.triangleCount);
  const drawCalls = useStore(s => s.drawCalls);
  const feaResult = useStore(s => s.loadAnalysis.result);

  const stats = useMemo(() => {
    const materialCounts: Record<string, number> = {};
    let totalWeight = 0;
    let supportCount = 0;
    let loadCount = 0;

    for (const v of voxels) {
      const matId = v.materialId || 'concrete';
      materialCounts[matId] = (materialCounts[matId] || 0) + 1;

      // Weight calculation: density * volume (1 voxel = 1m^3)
      const density = v.material?.density || 2400;
      totalWeight += density; // kg per voxel

      if (v.isSupport) supportCount++;
      if (v.externalLoad && (v.externalLoad.x !== 0 || v.externalLoad.y !== 0 || v.externalLoad.z !== 0)) loadCount++;
    }

    // Connected components (BFS)
    const posKey = (x: number, y: number, z: number) => `${x},${y},${z}`;
    const posMap = new Map<string, number>();
    voxels.forEach((v, i) => posMap.set(posKey(v.pos.x, v.pos.y, v.pos.z), i));
    const visited = new Set<number>();
    let components = 0;
    const dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];

    for (let i = 0; i < voxels.length; i++) {
      if (visited.has(i)) continue;
      components++;
      const queue = [i];
      visited.add(i);
      while (queue.length > 0) {
        const ci = queue.shift()!;
        const cv = voxels[ci];
        for (const [dx, dy, dz] of dirs) {
          const nk = posKey(cv.pos.x + dx, cv.pos.y + dy, cv.pos.z + dz);
          const ni = posMap.get(nk);
          if (ni !== undefined && !visited.has(ni)) {
            visited.add(ni);
            queue.push(ni);
          }
        }
      }
    }

    return { materialCounts, totalWeight, supportCount, loadCount, components };
  }, [voxels]);

  const maxMaterialCount = Math.max(1, ...Object.values(stats.materialCounts));

  return (
    <div className="glass-panel" style={{ flex: 0, marginTop: 2 }}>
      <div className="panel-header"><span>場景統計</span></div>
      <div className="panel-body" style={{ padding: 8 }}>
        {/* Overview stats grid */}
        <div className="stats-grid" style={{ marginBottom: 8 }}>
          <div className="stat-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Box size={12} style={{ color: 'var(--accent)' }} />
              <span className="stat-label">體素總數</span>
            </div>
            <span className="stat-value" style={{ fontSize: 14 }}>{voxels.length}</span>
          </div>
          <div className="stat-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Link size={12} style={{ color: '#ffd700' }} />
              <span className="stat-label">黏合接頭</span>
            </div>
            <span className="stat-value" style={{ fontSize: 14 }}>{glueJoints.length}</span>
          </div>
          <div className="stat-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Layers size={12} style={{ color: '#a78bfa' }} />
              <span className="stat-label">連通區域</span>
            </div>
            <span className="stat-value" style={{ fontSize: 14 }}>{stats.components}</span>
          </div>
          <div className="stat-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Weight size={12} style={{ color: '#f5a623' }} />
              <span className="stat-label">估計重量</span>
            </div>
            <span className="stat-value" style={{ fontSize: 14 }}>
              {stats.totalWeight >= 1000 ? `${(stats.totalWeight / 1000).toFixed(1)}t` : `${stats.totalWeight.toFixed(0)}kg`}
            </span>
          </div>
        </div>

        {/* Material breakdown */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            材質分佈
          </div>
          {Object.entries(stats.materialCounts).sort((a, b) => b[1] - a[1]).map(([matId, count]) => {
            const mat = MATERIAL_LABELS[matId] || { name: matId, color: '#666', density: 2400 };
            const pct = voxels.length > 0 ? ((count / voxels.length) * 100).toFixed(0) : '0';
            return (
              <div key={matId} style={{ marginBottom: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 2 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: mat.color, display: 'inline-block' }} />
                    <span style={{ color: 'var(--text-secondary)' }}>{mat.name}</span>
                  </span>
                  <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{count} ({pct}%)</span>
                </div>
                <div className="stat-bar">
                  <div className="stat-bar-fill" style={{ width: `${(count / maxMaterialCount) * 100}%`, background: mat.color }} />
                </div>
              </div>
            );
          })}
          {Object.keys(stats.materialCounts).length === 0 && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: 4 }}>無體素</div>
          )}
        </div>

        {/* FEA & Structure info */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            結構資訊
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 8px', fontSize: 10 }}>
            <span style={{ color: 'var(--text-secondary)' }}>支撐點</span>
            <span style={{ color: '#00e5ff', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{stats.supportCount}</span>
            <span style={{ color: 'var(--text-secondary)' }}>負載點</span>
            <span style={{ color: '#ff4081', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{stats.loadCount}</span>
            {feaResult && (
              <>
                <span style={{ color: 'var(--text-secondary)' }}>FEA 邊數</span>
                <span style={{ color: 'var(--text-primary)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{feaResult.totalEdges}</span>
                <span style={{ color: 'var(--text-secondary)' }}>危險邊</span>
                <span style={{ color: feaResult.dangerCount > 0 ? 'var(--error)' : 'var(--success)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{feaResult.dangerCount}</span>
                <span style={{ color: 'var(--text-secondary)' }}>最大應力比</span>
                <span style={{ color: feaResult.maxStressRatio > 1 ? 'var(--error)' : feaResult.maxStressRatio > 0.8 ? 'var(--warning)' : 'var(--success)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{feaResult.maxStressRatio.toFixed(3)}</span>
              </>
            )}
          </div>
        </div>

        {/* Performance */}
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            效能
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 8px', fontSize: 10 }}>
            <span style={{ color: 'var(--text-secondary)' }}>FPS</span>
            <span style={{ color: fps >= 30 ? 'var(--success)' : fps >= 15 ? 'var(--warning)' : 'var(--error)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fps}</span>
            <span style={{ color: 'var(--text-secondary)' }}>記憶體</span>
            <span style={{ color: 'var(--text-primary)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{memoryUsage} MB</span>
            <span style={{ color: 'var(--text-secondary)' }}>三角面</span>
            <span style={{ color: 'var(--text-primary)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{triangleCount.toLocaleString()}</span>
            <span style={{ color: 'var(--text-secondary)' }}>Draw Calls</span>
            <span style={{ color: 'var(--text-primary)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{drawCalls}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
