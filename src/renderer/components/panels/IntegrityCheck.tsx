/**
 * IntegrityCheck - Structural integrity check panel
 * Checks for isolated voxels, missing supports, hanging structures
 */
import React, { useState, useCallback, useMemo } from 'react';
import { useStore, Vec3 } from '../../store/useStore';
import { AlertTriangle, CheckCircle, Search, Eye } from 'lucide-react';

interface Warning {
  type: 'isolated' | 'no-support' | 'hanging' | 'no-glue';
  message: string;
  voxelIds: string[];
  severity: 'error' | 'warning' | 'info';
}

export function IntegrityCheck() {
  const voxels = useStore(s => s.voxels);
  const glueJoints = useStore(s => s.glueJoints);
  const selectVoxels = useStore(s => s.selectVoxels);
  const addLog = useStore(s => s.addLog);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [checked, setChecked] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const posKey = (p: Vec3) => `${p.x},${p.y},${p.z}`;

  const runCheck = useCallback(() => {
    const results: Warning[] = [];

    if (voxels.length === 0) {
      setWarnings([{ type: 'isolated', message: '場景中沒有體素', voxelIds: [], severity: 'info' }]);
      setChecked(true);
      return;
    }

    // Build adjacency map from glue joints
    const adjacency = new Map<string, Set<string>>();
    const posToId = new Map<string, string>();
    for (const v of voxels) {
      const key = posKey(v.pos);
      posToId.set(key, v.id);
      if (!adjacency.has(key)) adjacency.set(key, new Set());
    }

    for (const joint of glueJoints) {
      const keyA = posKey(joint.voxelA);
      const keyB = posKey(joint.voxelB);
      if (adjacency.has(keyA)) adjacency.get(keyA)!.add(keyB);
      if (adjacency.has(keyB)) adjacency.get(keyB)!.add(keyA);
    }

    // Check 1: Isolated voxels (no glue connections and not adjacent to any other voxel)
    const isolatedIds: string[] = [];
    for (const v of voxels) {
      const key = posKey(v.pos);
      const neighbors = adjacency.get(key);
      if (!neighbors || neighbors.size === 0) {
        // Check if physically adjacent to another voxel
        const dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
        let hasPhysicalNeighbor = false;
        for (const [dx, dy, dz] of dirs) {
          const nk = `${v.pos.x + dx},${v.pos.y + dy},${v.pos.z + dz}`;
          if (posToId.has(nk)) { hasPhysicalNeighbor = true; break; }
        }
        if (!hasPhysicalNeighbor) {
          isolatedIds.push(v.id);
        }
      }
    }
    if (isolatedIds.length > 0) {
      results.push({
        type: 'isolated',
        message: `${isolatedIds.length} 個孤立體素（無相鄰體素）`,
        voxelIds: isolatedIds,
        severity: 'warning',
      });
    }

    // Check 2: No support points
    const supportCount = voxels.filter(v => v.isSupport).length;
    if (supportCount === 0) {
      results.push({
        type: 'no-support',
        message: 'FEA 需要至少一個固定支撐點',
        voxelIds: [],
        severity: 'error',
      });
    }

    // Check 3: Hanging structures (connected to rest by only 1 glue joint)
    // Find articulation points using simple approach
    const hangingIds: string[] = [];
    for (const v of voxels) {
      const key = posKey(v.pos);
      const neighbors = adjacency.get(key);
      if (neighbors && neighbors.size === 1) {
        // Only 1 glue connection - potentially hanging
        const neighborKey = Array.from(neighbors)[0];
        const neighborNeighbors = adjacency.get(neighborKey);
        if (neighborNeighbors && neighborNeighbors.size > 1) {
          hangingIds.push(v.id);
        }
      }
    }
    if (hangingIds.length > 0) {
      results.push({
        type: 'hanging',
        message: `${hangingIds.length} 個懸空體素（只靠一個黏合連接）`,
        voxelIds: hangingIds,
        severity: 'warning',
      });
    }

    // Check 4: No glue joints at all
    if (glueJoints.length === 0 && voxels.length > 1) {
      results.push({
        type: 'no-glue',
        message: '沒有任何黏合連接，FEA 分析需要黏合',
        voxelIds: [],
        severity: 'warning',
      });
    }

    // Check 5: Connected components (BFS)
    const visited = new Set<string>();
    let componentCount = 0;
    for (const v of voxels) {
      const key = posKey(v.pos);
      if (visited.has(key)) continue;
      componentCount++;
      // BFS using physical adjacency
      const queue = [key];
      visited.add(key);
      while (queue.length > 0) {
        const curr = queue.shift()!;
        const [cx, cy, cz] = curr.split(',').map(Number);
        const dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
        for (const [dx, dy, dz] of dirs) {
          const nk = `${cx + dx},${cy + dy},${cz + dz}`;
          if (posToId.has(nk) && !visited.has(nk)) {
            visited.add(nk);
            queue.push(nk);
          }
        }
        // Also traverse glue connections
        const glueNeighbors = adjacency.get(curr);
        if (glueNeighbors) {
          for (const nk of glueNeighbors) {
            if (!visited.has(nk)) {
              visited.add(nk);
              queue.push(nk);
            }
          }
        }
      }
    }
    if (componentCount > 1) {
      results.push({
        type: 'isolated',
        message: `結構分為 ${componentCount} 個不連通的區域`,
        voxelIds: [],
        severity: 'warning',
      });
    }

    if (results.length === 0) {
      results.push({
        type: 'isolated',
        message: '結構完整性檢查通過',
        voxelIds: [],
        severity: 'info',
      });
    }

    setWarnings(results);
    setChecked(true);
    addLog('info', 'Integrity', `完整性檢查完成: ${results.filter(r => r.severity === 'error').length} 錯誤, ${results.filter(r => r.severity === 'warning').length} 警告`);
  }, [voxels, glueJoints, addLog]);

  const highlightVoxels = useCallback((ids: string[]) => {
    if (ids.length > 0) {
      selectVoxels(ids);
      addLog('info', 'Integrity', `已高亮 ${ids.length} 個問題體素`);
    }
  }, [selectVoxels, addLog]);

  const severityColor = (s: string) => {
    if (s === 'error') return 'var(--error)';
    if (s === 'warning') return 'var(--warning)';
    return 'var(--success)';
  };

  const severityIcon = (s: string) => {
    if (s === 'error') return <AlertTriangle size={11} style={{ color: 'var(--error)' }} />;
    if (s === 'warning') return <AlertTriangle size={11} style={{ color: 'var(--warning)' }} />;
    return <CheckCircle size={11} style={{ color: 'var(--success)' }} />;
  };

  return (
    <div className="glass-panel" style={{ marginTop: 4 }}>
      <div className="panel-header" onClick={() => setExpanded(!expanded)} style={{ cursor: 'pointer' }}>
        <span><Search size={11} style={{ marginRight: 4 }} /> 完整性檢查</span>
      </div>
      {expanded && (
        <div className="panel-body" style={{ padding: '6px 8px' }}>
          <button className="btn btn-sm btn-primary" onClick={runCheck} style={{ width: '100%', marginBottom: 6 }}>
            <Search size={11} /> 執行完整性檢查
          </button>

          {checked && warnings.map((w, i) => (
            <div
              key={i}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px',
                background: 'var(--bg-input)', borderRadius: 4, marginBottom: 3,
                borderLeft: `3px solid ${severityColor(w.severity)}`,
                cursor: w.voxelIds.length > 0 ? 'pointer' : 'default',
                fontSize: 10,
              }}
              onClick={() => highlightVoxels(w.voxelIds)}
              title={w.voxelIds.length > 0 ? '點擊高亮問題體素' : ''}
            >
              {severityIcon(w.severity)}
              <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{w.message}</span>
              {w.voxelIds.length > 0 && (
                <Eye size={10} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
