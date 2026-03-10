/**
 * GlueEngine - Glue Joint 黏合管理引擎
 * 管理體素之間的黏合關係，支援連通性分析，與 FEA 整合
 */
import { Vec3 } from '../store/useStore';
import eventBus from './EventBus';

export interface GlueJoint {
  id: string;
  voxelA: Vec3;
  voxelB: Vec3;
  type: 'rigid' | 'hinge' | 'spring';
  strength: number;  // 0-1, 1 = full strength
  breakForce: number; // N - force at which joint breaks
}

class GlueEngine {
  private joints: Map<string, GlueJoint> = new Map();
  private adjacencyMap: Map<string, Set<string>> = new Map(); // voxelKey -> Set<voxelKey>

  private posKey(p: Vec3): string {
    return `${p.x},${p.y},${p.z}`;
  }

  /** Add a glue joint between two voxels */
  addJoint(voxelA: Vec3, voxelB: Vec3, type: GlueJoint['type'] = 'rigid', strength: number = 1.0): GlueJoint {
    const id = `gj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const joint: GlueJoint = {
      id,
      voxelA: { ...voxelA },
      voxelB: { ...voxelB },
      type,
      strength,
      breakForce: strength * 100000, // 100kN at full strength
    };

    this.joints.set(id, joint);

    // Update adjacency
    const keyA = this.posKey(voxelA);
    const keyB = this.posKey(voxelB);
    if (!this.adjacencyMap.has(keyA)) this.adjacencyMap.set(keyA, new Set());
    if (!this.adjacencyMap.has(keyB)) this.adjacencyMap.set(keyB, new Set());
    this.adjacencyMap.get(keyA)!.add(keyB);
    this.adjacencyMap.get(keyB)!.add(keyA);

    eventBus.emit('glue:add', { ...joint });
    return joint;
  }

  /** Remove a glue joint */
  removeJoint(id: string): void {
    const joint = this.joints.get(id);
    if (!joint) return;

    const keyA = this.posKey(joint.voxelA);
    const keyB = this.posKey(joint.voxelB);
    this.adjacencyMap.get(keyA)?.delete(keyB);
    this.adjacencyMap.get(keyB)?.delete(keyA);

    this.joints.delete(id);
    eventBus.emit('glue:remove', { voxelA: joint.voxelA, voxelB: joint.voxelB });
  }

  /** Clear all joints */
  clearAll(): void {
    this.joints.clear();
    this.adjacencyMap.clear();
    eventBus.emit('glue:clear', {});
  }

  /** Get all joints */
  getJoints(): GlueJoint[] {
    return Array.from(this.joints.values());
  }

  /** Get joints for a specific voxel */
  getJointsForVoxel(pos: Vec3): GlueJoint[] {
    const key = this.posKey(pos);
    return Array.from(this.joints.values()).filter(j =>
      this.posKey(j.voxelA) === key || this.posKey(j.voxelB) === key
    );
  }

  /** Check if two voxels are directly connected */
  areConnected(a: Vec3, b: Vec3): boolean {
    const keyA = this.posKey(a);
    const keyB = this.posKey(b);
    return this.adjacencyMap.get(keyA)?.has(keyB) || false;
  }

  /** Find connected component (BFS) from a starting voxel */
  findConnectedComponent(start: Vec3): Set<string> {
    const startKey = this.posKey(start);
    const visited = new Set<string>();
    const queue: string[] = [startKey];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const neighbors = this.adjacencyMap.get(current);
      if (neighbors) {
        for (const n of neighbors) {
          if (!visited.has(n)) queue.push(n);
        }
      }
    }

    return visited;
  }

  /** Find all connected components */
  findAllComponents(): Set<string>[] {
    const allKeys = new Set<string>();
    for (const joint of this.joints.values()) {
      allKeys.add(this.posKey(joint.voxelA));
      allKeys.add(this.posKey(joint.voxelB));
    }

    const components: Set<string>[] = [];
    const visited = new Set<string>();

    for (const key of allKeys) {
      if (visited.has(key)) continue;
      const [x, y, z] = key.split(',').map(Number);
      const component = this.findConnectedComponent({ x, y, z });
      component.forEach(k => visited.add(k));
      components.push(component);
    }

    return components;
  }

  /** Get glue pairs for FEA (only connected voxels participate) */
  getGluePairsForFEA(): { a: Vec3; b: Vec3; stiffnessMultiplier: number }[] {
    return Array.from(this.joints.values()).map(j => ({
      a: j.voxelA,
      b: j.voxelB,
      stiffnessMultiplier: j.strength * (j.type === 'rigid' ? 1.0 : j.type === 'hinge' ? 0.5 : 0.3),
    }));
  }

  /** Import joints from serialized data */
  importJoints(joints: GlueJoint[]): void {
    this.clearAll();
    for (const j of joints) {
      this.addJoint(j.voxelA, j.voxelB, j.type, j.strength);
    }
  }

  /** Export joints for serialization */
  exportJoints(): GlueJoint[] {
    return this.getJoints();
  }

  /** Get joint count */
  getJointCount(): number {
    return this.joints.size;
  }

  /** Get component count */
  getComponentCount(): number {
    return this.findAllComponents().length;
  }
}

export const glueEngine = new GlueEngine();
