/**
 * ReportGenerator - Generates structural analysis report as HTML
 * Can be printed to PDF via Electron's webContents.printToPDF()
 */
import { useStore } from '../store/useStore';
import type { FEAEdge, Vec3 } from '../store/useStore';

export class ReportGenerator {
  static generateHTML(): string {
    const state = useStore.getState();
    const { voxels, glueJoints, loadAnalysis, layers } = state;

    const now = new Date();
    const timestamp = now.toLocaleString('zh-TW', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });

    // Material distribution
    const matCounts: Record<string, number> = {};
    for (const v of voxels) {
      const m = v.materialId || 'unknown';
      matCounts[m] = (matCounts[m] || 0) + 1;
    }

    const matNames: Record<string, string> = {
      concrete: '混凝土', steel: '鋼材', wood: '木材',
      brick: '磚塊', aluminum: '鋁合金', glass: '玻璃',
    };

    // FEA results — loadAnalysis.result?.edges is the correct path
    const edges: FEAEdge[] = loadAnalysis.result?.edges ?? [];
    const maxStress = edges.length > 0
      ? Math.max(...edges.map((e: FEAEdge) => e.stressRatio))
      : 0;
    const dangerEdges = edges.filter((e: FEAEdge) => e.stressRatio > 0.8).length;
    const overloadEdges = edges.filter((e: FEAEdge) => e.stressRatio > 1.0).length;
    const safetyLevel = maxStress > 1.0 ? '危險' : maxStress > 0.8 ? '警告' : '安全';
    const safetyColor = maxStress > 1.0 ? '#f85149' : maxStress > 0.8 ? '#f5a623' : '#3dd68c';

    // Support and load counts
    const supportCount = voxels.filter((v) => v.isSupport).length;
    const loadCount = voxels.filter((v) => {
      const l = v.externalLoad;
      return l != null && (l.x !== 0 || l.y !== 0 || l.z !== 0);
    }).length;

    // Connected components (BFS)
    const posKey = (p: Vec3): string => `${p.x},${p.y},${p.z}`;
    const posSet = new Set(voxels.map((v) => posKey(v.pos)));
    const visited = new Set<string>();
    let componentCount = 0;
    for (const v of voxels) {
      const key = posKey(v.pos);
      if (visited.has(key)) continue;
      componentCount++;
      const queue: string[] = [key];
      visited.add(key);
      while (queue.length > 0) {
        const curr = queue.shift()!;
        const parts = curr.split(',');
        const cx = Number(parts[0]);
        const cy = Number(parts[1]);
        const cz = Number(parts[2]);
        const neighbors: [number, number, number][] = [
          [1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1],
        ];
        for (const [dx, dy, dz] of neighbors) {
          const nk = `${cx+dx},${cy+dy},${cz+dz}`;
          if (posSet.has(nk) && !visited.has(nk)) {
            visited.add(nk);
            queue.push(nk);
          }
        }
      }
    }

    // Danger locations table — FEAEdge uses nodeA/nodeB
    const dangerList: FEAEdge[] = edges
      .filter((e: FEAEdge) => e.stressRatio > 0.8)
      .sort((a: FEAEdge, b: FEAEdge) => b.stressRatio - a.stressRatio)
      .slice(0, 20);

    const dangerRows = dangerList.map((e: FEAEdge) => {
      const suggestion = e.stressRatio > 1.0 ? '需要加強或更換材質' : '接近極限，建議監控';
      const stressColor = e.stressRatio > 1.0 ? '#f85149' : '#f5a623';
      return `<tr>
        <td>(${e.nodeA.x},${e.nodeA.y},${e.nodeA.z}) → (${e.nodeB.x},${e.nodeB.y},${e.nodeB.z})</td>
        <td style="color:${stressColor};font-weight:bold">${e.stressRatio.toFixed(3)}</td>
        <td>${e.isTension ? '拉伸' : '壓縮'}</td>
        <td>${suggestion}</td>
      </tr>`;
    }).join('\n');

    // Material distribution rows
    const matRows = Object.entries(matCounts)
      .map(([m, c]: [string, number]) =>
        `<tr><td>${matNames[m] || m}</td><td>${c}</td><td>${(c / voxels.length * 100).toFixed(1)}%</td></tr>`,
      )
      .join('\n');

    return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<title>FastDesign 結構分析報告</title>
<style>
  body { font-family: 'Inter', -apple-system, sans-serif; background: #0d1117; color: #e6edf3; padding: 40px; max-width: 800px; margin: 0 auto; }
  h1 { color: #638cff; border-bottom: 2px solid #21262d; padding-bottom: 12px; margin-bottom: 24px; }
  h2 { color: #58a6ff; margin-top: 32px; border-bottom: 1px solid #21262d; padding-bottom: 8px; }
  .meta { display: grid; grid-template-columns: 140px 1fr; gap: 8px; margin-bottom: 24px; }
  .meta-label { color: #8b949e; font-weight: 600; }
  .meta-value { color: #e6edf3; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th { background: #161b22; color: #8b949e; text-align: left; padding: 8px 12px; border: 1px solid #21262d; font-weight: 600; font-size: 12px; }
  td { padding: 8px 12px; border: 1px solid #21262d; font-size: 12px; }
  tr:nth-child(even) { background: rgba(255,255,255,0.02); }
  .safety-badge { display: inline-block; padding: 4px 12px; border-radius: 4px; font-weight: bold; font-size: 14px; }
  .stat-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin: 16px 0; }
  .stat-card { background: #161b22; border: 1px solid #21262d; border-radius: 8px; padding: 16px; text-align: center; }
  .stat-value { font-size: 24px; font-weight: bold; color: #638cff; }
  .stat-label { font-size: 11px; color: #8b949e; margin-top: 4px; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #21262d; color: #484f58; font-size: 11px; text-align: center; }
</style>
</head>
<body>
  <h1>FastDesign 結構分析報告</h1>

  <div class="meta">
    <span class="meta-label">專案名稱</span><span class="meta-value">${state.projectName || '新專案'}</span>
    <span class="meta-label">分析時間</span><span class="meta-value">${timestamp}</span>
    <span class="meta-label">FastDesign 版本</span><span class="meta-value">v2.0</span>
    <span class="meta-label">體素總數</span><span class="meta-value">${voxels.length}</span>
    <span class="meta-label">圖層數</span><span class="meta-value">${layers.length}</span>
    <span class="meta-label">Glue 接頭</span><span class="meta-value">${glueJoints.length}</span>
    <span class="meta-label">連通區域</span><span class="meta-value">${componentCount}</span>
    <span class="meta-label">支撐點</span><span class="meta-value">${supportCount}</span>
    <span class="meta-label">負載點</span><span class="meta-value">${loadCount}</span>
  </div>

  <h2>材質分佈</h2>
  <table>
    <thead><tr><th>材質</th><th>數量</th><th>比例</th></tr></thead>
    <tbody>${matRows}</tbody>
  </table>

  <h2>FEA 分析結果</h2>
  <div class="stat-grid">
    <div class="stat-card">
      <div class="stat-value" style="color:${safetyColor}">${maxStress.toFixed(3)}</div>
      <div class="stat-label">最大應力比</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" style="color:#f5a623">${dangerEdges}</div>
      <div class="stat-label">危險邊 (&gt;0.8)</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" style="color:#f85149">${overloadEdges}</div>
      <div class="stat-label">超載邊 (&gt;1.0)</div>
    </div>
  </div>

  <p>結構安全評估：<span class="safety-badge" style="background:${safetyColor}20;color:${safetyColor};border:1px solid ${safetyColor}">${safetyLevel}</span></p>

  ${dangerList.length > 0 ? `
  <h2>危險位置列表</h2>
  <table>
    <thead><tr><th>位置</th><th>應力比</th><th>類型</th><th>建議</th></tr></thead>
    <tbody>${dangerRows}</tbody>
  </table>
  ` : '<p style="color:#3dd68c">沒有危險位置，結構安全。</p>'}

  <div class="footer">
    FastDesign v2.0 — 次世代 3D 敏捷設計系統<br>
    報告生成時間：${timestamp}
  </div>
</body>
</html>`;
  }

  static downloadReport(): void {
    const html = ReportGenerator.generateHTML();
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FastDesign_Report_${new Date().toISOString().slice(0, 10)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
