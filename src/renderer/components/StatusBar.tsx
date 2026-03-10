import React from 'react';
import { useStore } from '../store/useStore';
import { Activity, Cpu, Triangle, Box, MousePointer2, Layers, Link2, Save, Zap } from 'lucide-react';

const toolNames: Record<string, string> = {
  select: '選取', place: '放置', erase: '刪除', paint: '上色',
  brush: '體素刷', smooth: '平滑', fill: '填充', sculpt: '雕刻',
  measure: '測量', glue: '黏合', 'tag-sharp': 'Sharp', 'tag-smooth': 'Smooth', 'tag-fillet': 'Fillet',
  'set-support': '設定支撐點', 'set-load': '施加負載',
};

export function StatusBar() {
  const fps = useStore(s => s.fps);
  const mem = useStore(s => s.memoryUsage);
  const vc = useStore(s => s.voxels.length);
  const tris = useStore(s => s.triangleCount);
  const tool = useStore(s => s.activeTool);
  const pl = useStore(s => s.pipeline);
  const engines = useStore(s => s.engines);
  const loadAnalysis = useStore(s => s.loadAnalysis);
  const fpMode = useStore(s => s.fpMode);
  const currentLOD = useStore(s => s.currentLOD);
  const isCollabActive = useStore(s => s.isCollabActive);
  const collabUsers = useStore(s => s.collabUsers);
  const selectedCount = useStore(s => s.selectedVoxelIds.length);
  const glueCount = useStore(s => s.glueJoints.length);
  const isDirty = useStore(s => s.isDirty);
  const projectName = useStore(s => s.projectName);
  const rc = engines.filter(e => e.running).length;
  const renderMode = vc > 1000 ? 'Instanced' : 'Standard';

  return (
    <div className="app-status-bar">
      <div className="status-section">
        <span className="status-item"><MousePointer2 size={10} /> {toolNames[tool] || tool}</span>
        <span className="status-divider">|</span>
        <span className="status-item"><Box size={10} /> 體素: {vc}</span>
        <span className="status-divider">|</span>
        <span className="status-item"><Triangle size={10} /> 三角面: {tris}</span>
        <span className="status-divider">|</span>
        <span className="status-item" style={{ color: vc > 1000 ? '#a78bfa' : 'var(--text-muted)' }}>
          <Zap size={10} /> {renderMode}
        </span>
        {glueCount > 0 && <>
          <span className="status-divider">|</span>
          <span className="status-item"><Link2 size={10} /> 黏合: {glueCount}</span>
        </>}
        {selectedCount > 0 && <>
          <span className="status-divider">|</span>
          <span className="status-item" style={{ color: 'var(--accent)' }}>已選: {selectedCount}</span>
        </>}
        <span className="status-divider">|</span>
        <span className="status-item"><Layers size={10} /> LOD{currentLOD}</span>
        <span className="status-divider">|</span>
        <span className="status-item">引擎: {rc}/{engines.length}</span>
        {fpMode && <><span className="status-divider">|</span><span className="status-item" style={{ color: 'var(--accent)' }}>第一人稱模式</span></>}
        {isCollabActive && <><span className="status-divider">|</span><span className="status-item" style={{ color: 'var(--success)' }}>協作: {collabUsers.filter(u=>u.online).length} 人在線</span></>}
        {pl.status === 'running' && <><span className="status-divider">|</span><span className="status-item" style={{ color: 'var(--accent)' }}>管線: {pl.progress.toFixed(0)}%</span></>}
        {pl.status === 'done' && <><span className="status-divider">|</span><span className="status-item" style={{ color: 'var(--success)' }}>NURBS 已生成</span></>}
        {loadAnalysis.isComputing && <><span className="status-divider">|</span><span className="status-item" style={{ color: 'var(--warning)' }}>FEA 計算中...</span></>}
        {loadAnalysis.result && !loadAnalysis.isComputing && <>
          <span className="status-divider">|</span>
          <span className="status-item" style={{ color: loadAnalysis.result.dangerCount > 0 ? 'var(--error)' : 'var(--success)' }}>
            分析完成：{loadAnalysis.result.dangerCount} 條危險邊，最大應力比 {loadAnalysis.result.maxStressRatio.toFixed(3)}
          </span>
        </>}
      </div>
      <div className="status-section">
        <span className="status-item">
          <Save size={10} /> {projectName}{isDirty ? ' *' : ''}
        </span>
        <span className="status-divider">|</span>
        <span className="status-item" style={{ color: fps >= 50 ? 'var(--success)' : fps >= 30 ? 'var(--warning)' : 'var(--error)' }}><Activity size={10} /> {fps} FPS</span>
        <span className="status-divider">|</span>
        <span className="status-item"><Cpu size={10} /> {mem} MB</span>
        <span className="status-divider">|</span>
        <span className="status-item">FastDesign v1.6</span>
      </div>
    </div>
  );
}
