import eventBus from '../engines/EventBus';
import { NURBSSurface, Vec3 } from '../store/useStore';

export class SurfaceEngine {
  validateManifold(s: NURBSSurface): {valid:boolean;issues:string[]} {
    const issues: string[]=[];
    if(!s.controlPoints.length) issues.push('控制點為空');
    if(s.degree<1||s.degree>5) issues.push(`階數異常: ${s.degree}`);
    const kn=s.knotsU.length, exp=s.controlPoints.length+s.degree+1;
    if(kn!==exp) issues.push(`節點向量長度不符: ${kn} vs ${exp}`);
    for(let i=1;i<s.knotsU.length;i++) if(s.knotsU[i]<s.knotsU[i-1]){issues.push('節點向量非遞增');break;}
    eventBus.emit('surface:validated',{valid:issues.length===0});
    return {valid:issues.length===0,issues};
  }
  evaluatePoint(s: NURBSSurface, u: number, v: number): Vec3 {
    const n=s.controlPoints.length, m=s.controlPoints[0]?.length||0;
    const i=Math.min(Math.floor(u*(n-1)),n-1), j=Math.min(Math.floor(v*(m-1)),m-1);
    return s.controlPoints[i][j];
  }
  tessellate(s: NURBSSurface, res: number): {vertices:Vec3[];indices:number[]} {
    const verts: Vec3[]=[]; const indices: number[]=[];
    for(let i=0;i<=res;i++) for(let j=0;j<=res;j++) verts.push(this.evaluatePoint(s,i/res,j/res));
    for(let i=0;i<res;i++) for(let j=0;j<res;j++){const a=i*(res+1)+j; indices.push(a,a+1,a+res+1,a+1,a+res+2,a+res+1);}
    return {vertices:verts,indices};
  }
}
export const surfaceEngine = new SurfaceEngine();
