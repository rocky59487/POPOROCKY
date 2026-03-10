import eventBus from './EventBus';
import { Vec3, Voxel, LoadAnalysis } from '../store/useStore';

export class LoadEngine {
  private gravity: Vec3 = { x: 0, y: -9.81, z: 0 };
  private stressThreshold = 100;
  private stressMap = new Map<string, number>();

  computeStress(voxels: Voxel[]): LoadAnalysis {
    eventBus.emit('load:computing', { count: voxels.length });
    this.stressMap.clear();
    let maxStress = 0, minStress = Infinity;
    const weakPoints: Vec3[] = [];
    const loadPaths: Vec3[][] = [];
    voxels.forEach((v, i) => {
      const height = Math.max(0, v.pos.y);
      const neighborCount = voxels.filter(n => Math.abs(n.pos.x-v.pos.x)<=1 && Math.abs(n.pos.y-v.pos.y)<=1 && Math.abs(n.pos.z-v.pos.z)<=1 && n.id!==v.id).length;
      const stress = (height * Math.abs(this.gravity.y) * 10) / Math.max(1, neighborCount);
      this.stressMap.set(`${v.pos.x},${v.pos.y},${v.pos.z}`, stress);
      if (stress > maxStress) maxStress = stress;
      if (stress < minStress) minStress = stress;
      if (stress > this.stressThreshold) weakPoints.push(v.pos);
      if (i % 10 === 0 && v.pos.y > 0) {
        const path: Vec3[] = [v.pos]; let cy = v.pos.y;
        while (cy > 0) { cy--; path.push({ x: v.pos.x, y: cy, z: v.pos.z }); }
        loadPaths.push(path);
      }
    });
    const safetyFactor = maxStress > 0 ? this.stressThreshold / maxStress : 99;
    const result: LoadAnalysis = { maxStress, minStress: minStress===Infinity?0:minStress, safetyFactor, weakPoints, loadPaths, stressMap: this.stressMap };
    eventBus.emit('load:computed', { maxStress, safetyFactor, weakPointCount: weakPoints.length });
    return result;
  }

  getStressAt(pos: Vec3): number { return this.stressMap.get(`${pos.x},${pos.y},${pos.z}`) || 0; }
  setGravity(g: Vec3) { this.gravity = g; }
  setThreshold(t: number) { this.stressThreshold = t; }

  generateReport(a: LoadAnalysis): string {
    return `=== 負載分析報告 ===\n最大應力: ${a.maxStress.toFixed(2)} MPa\n最小應力: ${a.minStress.toFixed(2)} MPa\n安全係數: ${a.safetyFactor.toFixed(2)}\n弱點數量: ${a.weakPoints.length}\n結論: ${a.safetyFactor>=1.5?'結構安全':'需要加強'}`;
  }
}
export const loadEngine = new LoadEngine();
