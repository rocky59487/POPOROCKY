import React from 'react';
import { useStore } from '../../store/useStore';
import { ViewportScene } from './ViewportScene';

export function Viewport3D() {
  const layout = useStore(s => s.viewLayout);
  const viewMode = useStore(s => s.viewMode);
  const cameraType = useStore(s => s.cameraType);
  const voxelCount = useStore(s => s.voxels.length);
  const pipeline = useStore(s => s.pipeline);

  if (layout === 'quad') {
    return (
      <div className="viewport-quad">
        {['透視','前視','右視','俯視'].map((label, i) => (
          <div key={i} className="viewport-container">
            <div className="viewport-overlay"><span className="viewport-badge">{label}</span></div>
            <ViewportScene label={label} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="viewport-container">
      <div className="viewport-overlay">
        <span className="viewport-badge">{cameraType==='perspective'?'透視':'正交'} | {viewMode==='wireframe'?'線框':viewMode==='solid'?'實體':'渲染'}</span>
        <span className="viewport-badge">體素: {voxelCount}</span>
        {pipeline.status==='done' && <span className="viewport-badge" style={{color:'#3dd68c'}}>NURBS 已生成</span>}
      </div>
      <ViewportScene />
    </div>
  );
}
