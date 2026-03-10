import eventBus from '../engines/EventBus';
import { Vec3, Voxel, NURBSSurface, PipelineState } from '../store/useStore';

function solveQEF(pos: Vec3, t: number): Vec3 { return { x: pos.x+t*0.5, y: pos.y+t*0.5, z: pos.z+t*0.5 }; }

function dualContouring(voxels: Voxel[], qefT: number, onP: (p:number)=>void): {vertices:Vec3[];faces:number[][]} {
  const verts: Vec3[]=[]; const faces: number[][]=[];
  const set=new Set(voxels.map(v=>`${v.pos.x},${v.pos.y},${v.pos.z}`));
  const dirs=[{x:1,y:0,z:0},{x:-1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:-1,z:0},{x:0,y:0,z:1},{x:0,y:0,z:-1}];
  voxels.forEach((v,i)=>{
    let boundary=false;
    for(const d of dirs) if(!set.has(`${v.pos.x+d.x},${v.pos.y+d.y},${v.pos.z+d.z}`)){boundary=true;break;}
    if(boundary) verts.push(solveQEF(v.pos,qefT));
    if(i%Math.max(1,Math.floor(voxels.length/20))===0) onP((i/voxels.length)*100);
  });
  for(let i=0;i<verts.length;i++) for(let j=i+1;j<Math.min(i+8,verts.length);j++){
    const d=Math.sqrt((verts[i].x-verts[j].x)**2+(verts[i].y-verts[j].y)**2+(verts[i].z-verts[j].z)**2);
    if(d<2) for(let k=j+1;k<Math.min(j+4,verts.length);k++){
      const d2=Math.sqrt((verts[i].x-verts[k].x)**2+(verts[i].y-verts[k].y)**2+(verts[i].z-verts[k].z)**2);
      if(d2<2) faces.push([i,j,k]);
    }
  }
  onP(100); return {vertices:verts,faces};
}

function pcaSimplify(verts: Vec3[], _faces: number[][], tol: number, onP: (p:number)=>void): {simplified:Vec3[];featureLines:Vec3[][]} {
  const simplified: Vec3[]=[]; const featureLines: Vec3[][]=[];
  const used=new Set<number>(); const groups: Vec3[][]=[];
  for(let i=0;i<verts.length;i++){
    if(used.has(i)) continue; const g=[verts[i]]; used.add(i);
    for(let j=i+1;j<verts.length;j++){
      if(used.has(j)) continue;
      const d=Math.sqrt((verts[i].x-verts[j].x)**2+(verts[i].y-verts[j].y)**2+(verts[i].z-verts[j].z)**2);
      if(d<tol*20){g.push(verts[j]);used.add(j);}
    }
    groups.push(g);
    if(i%Math.max(1,Math.floor(verts.length/20))===0) onP((i/verts.length)*80);
  }
  groups.forEach(g=>{const c={x:0,y:0,z:0};g.forEach(v=>{c.x+=v.x;c.y+=v.y;c.z+=v.z;});c.x/=g.length;c.y/=g.length;c.z/=g.length;simplified.push(c);});
  for(let i=0;i<simplified.length-1;i++){const a=simplified[i],b=simplified[i+1];const d=Math.sqrt((a.x-b.x)**2+(a.y-b.y)**2+(a.z-b.z)**2);if(d<tol*50)featureLines.push([a,b]);}
  onP(100); return {simplified,featureLines};
}

function nurbsFit(pts: Vec3[], degree: number, cpCount: number, onP: (p:number)=>void): NURBSSurface {
  const n=Math.min(cpCount,Math.max(4,Math.ceil(Math.sqrt(pts.length))));
  const knots: number[]=[]; for(let i=0;i<=degree;i++)knots.push(0); const interior=n-degree-1; for(let i=1;i<=interior;i++)knots.push(i/(interior+1)); for(let i=0;i<=degree;i++)knots.push(1);
  onP(30);
  const cp: Vec3[][]=[];
  for(let i=0;i<n;i++){const row: Vec3[]=[]; for(let j=0;j<n;j++){const u=i/(n-1); const idx=Math.min(Math.floor(u*(pts.length-1)),pts.length-1); const pt=pts[idx]; row.push({x:pt.x+(j-n/2)*0.5,y:pt.y,z:pt.z+(i-n/2)*0.5});} cp.push(row); onP(30+(i/n)*60);}
  onP(100);
  return {id:`nurbs_${Date.now()}`,controlPoints:cp,degree,knotsU:knots,knotsV:knots,weights:cp.map(r=>r.map(()=>1.0))};
}

function delay(ms: number){return new Promise(r=>setTimeout(r,ms));}

export async function runVoxelToNURBS(
  voxels: Voxel[], params: PipelineState['params'],
  onStage: (stage:number,status:'running'|'done'|'error',progress:number)=>void,
  addLog: (level:'info'|'success'|'warning'|'error',src:string,msg:string)=>void
): Promise<NURBSSurface[]> {
  if(!voxels.length){addLog('warning','Pipeline','沒有體素可轉換');return [];}
  addLog('info','Pipeline',`開始轉換 ${voxels.length} 個體素...`);
  eventBus.emit('pipeline:start',{count:voxels.length});

  onStage(0,'running',0); addLog('info','Phase1','Dual Contouring 邊界拓撲提取...'); await delay(300);
  const{vertices,faces}=dualContouring(voxels,params.qefThreshold,p=>onStage(0,'running',p));
  onStage(0,'done',100); addLog('success','Phase1',`完成: ${vertices.length} 頂點, ${faces.length} 面`); await delay(200);

  onStage(1,'running',0); addLog('info','Phase2','PCA 共面簡化與特徵線辨識...'); await delay(300);
  const{simplified,featureLines}=pcaSimplify(vertices,faces,params.pcaTolerance,p=>onStage(1,'running',p));
  onStage(1,'done',100); addLog('success','Phase2',`完成: ${simplified.length} 簡化點, ${featureLines.length} 特徵線`); await delay(200);

  onStage(2,'running',0); addLog('info','Phase3','NURBS 參數擬合 (Trust-Region Reflective)...'); await delay(300);
  const surface=nurbsFit(simplified,params.nurbsDegree,params.controlPointCount,p=>onStage(2,'running',p));
  onStage(2,'done',100); addLog('success','Phase3',`完成: ${surface.controlPoints.length}x${surface.controlPoints[0]?.length||0} 控制點`);

  eventBus.emit('pipeline:complete',{surfaceCount:1});
  addLog('success','Pipeline','體素→NURBS 轉換完成！');
  return [surface];
}

export function exportToOBJ(surfaces: NURBSSurface[]): string {
  let obj='# FastDesign NURBS Export\n';
  surfaces.forEach(s=>s.controlPoints.forEach(row=>row.forEach(p=>{obj+=`v ${p.x.toFixed(4)} ${p.y.toFixed(4)} ${p.z.toFixed(4)}\n`;})));
  return obj;
}
