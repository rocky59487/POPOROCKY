/**
 * OBJExporter - Export voxels as OBJ mesh file
 * Each voxel becomes a unit cube with proper vertex positions, normals, and faces
 */
import { useStore, Voxel } from '../store/useStore';

const MATERIAL_COLORS: Record<string, [number, number, number]> = {
  concrete: [0.5, 0.5, 0.5],
  steel:    [0.75, 0.75, 0.75],
  wood:     [0.545, 0.271, 0.075],
  brick:    [0.545, 0.227, 0.227],
  aluminum: [0.816, 0.816, 0.878],
  glass:    [0.533, 0.8, 0.933],
};

export class OBJExporter {
  /**
   * Generate OBJ file content from voxels
   * Optimized: only generates faces that are not shared between adjacent voxels
   */
  static exportOBJ(voxels: Voxel[]): string {
    if (voxels.length === 0) return '# Empty scene\n';

    const occupied = new Set<string>();
    for (const v of voxels) {
      occupied.add(`${v.pos.x},${v.pos.y},${v.pos.z}`);
    }

    const lines: string[] = [
      '# FastDesign v1.6 OBJ Export',
      `# ${voxels.length} voxels`,
      `# Generated: ${new Date().toISOString()}`,
      '',
    ];

    let vertexIdx = 1;
    const cubeSize = 0.5; // half-size

    // Face definitions: [normal direction, 4 vertex offsets]
    const faces: { dir: [number, number, number]; verts: [number, number, number][] }[] = [
      { dir: [0, 0, 1],  verts: [[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]] },   // front (+Z)
      { dir: [0, 0, -1], verts: [[-1,-1,-1],[-1,1,-1],[1,1,-1],[1,-1,-1]] }, // back (-Z)
      { dir: [0, 1, 0],  verts: [[-1,1,-1],[-1,1,1],[1,1,1],[1,1,-1]] },    // top (+Y)
      { dir: [0, -1, 0], verts: [[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]] }, // bottom (-Y)
      { dir: [1, 0, 0],  verts: [[1,-1,-1],[1,1,-1],[1,1,1],[1,-1,1]] },     // right (+X)
      { dir: [-1, 0, 0], verts: [[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1]] }, // left (-X)
    ];

    for (const v of voxels) {
      const { x, y, z } = v.pos;

      for (const face of faces) {
        // Check if adjacent voxel exists in this direction
        const nx = x + face.dir[0];
        const ny = y + face.dir[1];
        const nz = z + face.dir[2];
        if (occupied.has(`${nx},${ny},${nz}`)) continue; // skip internal faces

        // Emit 4 vertices
        for (const [dx, dy, dz] of face.verts) {
          lines.push(`v ${x + dx * cubeSize} ${y + dy * cubeSize} ${z + dz * cubeSize}`);
        }
        // Normal
        lines.push(`vn ${face.dir[0]} ${face.dir[1]} ${face.dir[2]}`);
        // Face (quad)
        const vi = vertexIdx;
        const ni = Math.ceil(vertexIdx / 4); // simplified normal index
        lines.push(`f ${vi}//${vi} ${vi+1}//${vi+1} ${vi+2}//${vi+2} ${vi+3}//${vi+3}`);
        vertexIdx += 4;
      }
    }

    lines.push('');
    return lines.join('\n');
  }

  /**
   * Generate MTL file content
   */
  static exportMTL(voxels: Voxel[]): string {
    const materials = new Set<string>();
    for (const v of voxels) {
      materials.add(v.materialId || 'concrete');
    }

    const lines: string[] = [
      '# FastDesign v1.6 MTL Export',
      '',
    ];

    for (const matId of materials) {
      const color = MATERIAL_COLORS[matId] || [0.5, 0.5, 0.5];
      lines.push(`newmtl ${matId}`);
      lines.push(`Ka ${(color[0] * 0.3).toFixed(3)} ${(color[1] * 0.3).toFixed(3)} ${(color[2] * 0.3).toFixed(3)}`);
      lines.push(`Kd ${color[0].toFixed(3)} ${color[1].toFixed(3)} ${color[2].toFixed(3)}`);
      lines.push(`Ks 0.200 0.200 0.200`);
      lines.push(`Ns 50.000`);
      lines.push(`d 1.000`);
      lines.push('');
    }

    return lines.join('\n');
  }

  /** Download OBJ file */
  static downloadOBJ(): void {
    const state = useStore.getState();
    const voxels = state.voxels;

    if (voxels.length === 0) {
      state.addLog('error', 'Export', '場景中沒有體素可匯出');
      return;
    }

    const obj = this.exportOBJ(voxels);
    const blob = new Blob([obj], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.projectName || 'scene'}.obj`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    state.addLog('success', 'Export', `已匯出 OBJ: ${voxels.length} 個體素`);
  }

  /** Download MTL file */
  static downloadMTL(): void {
    const state = useStore.getState();
    const mtl = this.exportMTL(state.voxels);
    const blob = new Blob([mtl], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.projectName || 'scene'}.mtl`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    state.addLog('success', 'Export', '已匯出 MTL 材質檔');
  }
}
