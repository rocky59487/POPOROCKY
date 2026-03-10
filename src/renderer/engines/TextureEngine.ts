import eventBus from './EventBus';

export interface PBRMaterial {
  id: string;
  name: string;
  albedo: string;
  roughness: number;
  metallic: number;
  ao: number;
  normalMapUrl: string | null;
  albedoMapUrl: string | null;
  type: 'custom' | 'procedural';
}

export interface ProceduralTextureParams {
  type: 'brick' | 'concrete' | 'wood' | 'metal' | 'checker' | 'noise';
  scale: number;
  color1: string;
  color2: string;
  roughness: number;
  metallic: number;
}

export const PROCEDURAL_SHADERS: Record<string, { vertexShader: string; fragmentShader: string }> = {
  brick: {
    vertexShader: `varying vec2 vUv; varying vec3 vNormal; void main() { vUv = uv; vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 color1; uniform vec3 color2; uniform float scale; varying vec2 vUv; varying vec3 vNormal;
    void main() { vec2 uv = vUv * scale; float by = step(0.1, fract(uv.y)) * step(fract(uv.y), 0.9);
    float offset = step(0.5, fract(uv.y * 0.5)) * 0.5; float bx = step(0.05, fract(uv.x + offset)) * step(fract(uv.x + offset), 0.95);
    float brick = bx * by; vec3 col = mix(color2, color1, brick); float light = max(dot(vNormal, normalize(vec3(1,1,0.5))), 0.3); gl_FragColor = vec4(col * light, 1.0); }`,
  },
  concrete: {
    vertexShader: `varying vec2 vUv; varying vec3 vNormal; void main() { vUv = uv; vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 color1; uniform vec3 color2; uniform float scale; varying vec2 vUv; varying vec3 vNormal;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); float a = hash(i); float b = hash(i + vec2(1,0)); float c = hash(i + vec2(0,1)); float d = hash(i + vec2(1,1)); vec2 u = f*f*(3.0-2.0*f); return mix(a,b,u.x)+(c-a)*u.y*(1.0-u.x)+(d-b)*u.x*u.y; }
    void main() { float n = noise(vUv*scale*10.0)*0.5 + noise(vUv*scale*20.0)*0.25; vec3 col = mix(color1, color2, n); float light = max(dot(vNormal, normalize(vec3(1,1,0.5))), 0.3); gl_FragColor = vec4(col*light, 1.0); }`,
  },
  wood: {
    vertexShader: `varying vec2 vUv; varying vec3 vNormal; void main() { vUv = uv; vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 color1; uniform vec3 color2; uniform float scale; varying vec2 vUv; varying vec3 vNormal;
    void main() { float ring = sin((vUv.x*scale*5.0 + sin(vUv.y*scale*2.0)*0.5)*6.2831)*0.5+0.5; vec3 col = mix(color1, color2, ring); float light = max(dot(vNormal, normalize(vec3(1,1,0.5))), 0.3); gl_FragColor = vec4(col*light, 1.0); }`,
  },
  metal: {
    vertexShader: `varying vec2 vUv; varying vec3 vNormal; void main() { vUv = uv; vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 color1; uniform vec3 color2; uniform float scale; varying vec2 vUv; varying vec3 vNormal;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main() { float scratch = hash(floor(vUv*scale*30.0))*0.15; vec3 col = mix(color1, color2, scratch+0.3); float light = max(dot(vNormal, normalize(vec3(1,1,0.5))), 0.4); gl_FragColor = vec4(col*light, 1.0); }`,
  },
};

export class TextureEngine {
  private materials: Map<string, PBRMaterial> = new Map();
  private textureLibrary: Map<string, string> = new Map();

  constructor() {
    this.createMaterial('default', '預設', '#808080', 0.5, 0.0, 1.0);
    this.createMaterial('concrete_pbr', '混凝土', '#a0a0a0', 0.9, 0.0, 0.8);
    this.createMaterial('steel_pbr', '鋼材', '#c0c0c0', 0.3, 0.9, 0.5);
    this.createMaterial('wood_pbr', '木材', '#8B6914', 0.7, 0.0, 0.9);
    this.createMaterial('brick_pbr', '磚塊', '#b35c44', 0.85, 0.0, 0.7);
    this.createMaterial('glass_pbr', '玻璃', '#e0e8f0', 0.05, 0.0, 0.3);
  }

  createMaterial(id: string, name: string, albedo: string, roughness: number, metallic: number, ao: number): PBRMaterial {
    const mat: PBRMaterial = { id, name, albedo, roughness, metallic, ao, normalMapUrl: null, albedoMapUrl: null, type: 'custom' };
    this.materials.set(id, mat);
    eventBus.emit('texture:material-created', { id, name });
    return mat;
  }

  updateMaterial(id: string, updates: Partial<PBRMaterial>): void {
    const mat = this.materials.get(id);
    if (!mat) return;
    Object.assign(mat, updates);
    eventBus.emit('texture:material-updated', { id });
  }

  deleteMaterial(id: string): boolean {
    if (id === 'default') return false;
    this.materials.delete(id);
    return true;
  }

  getMaterial(id: string): PBRMaterial | undefined { return this.materials.get(id); }
  getAllMaterials(): PBRMaterial[] { return Array.from(this.materials.values()); }

  generateProceduralTexture(params: ProceduralTextureParams, size: number = 256): string {
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const c1 = this.hexToRgb(params.color1);
    const c2 = this.hexToRgb(params.color2);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size, v = y / size;
        let t = 0;
        switch (params.type) {
          case 'checker': t = (Math.floor(u * params.scale) + Math.floor(v * params.scale)) % 2; break;
          case 'brick': {
            const row = Math.floor(v * params.scale);
            const off = row % 2 === 0 ? 0 : 0.5 / params.scale;
            const bx = (u + off) * params.scale, by = v * params.scale;
            t = (Math.abs(bx - Math.round(bx)) < 0.05 || Math.abs(by - Math.round(by)) < 0.08) ? 0 : 1;
            break;
          }
          case 'wood': t = Math.sin((u * params.scale * 5 + Math.sin(v * params.scale * 2) * 0.5) * Math.PI * 2) * 0.5 + 0.5; break;
          case 'noise': case 'concrete': t = this.noise(u * params.scale * 8, v * params.scale * 8); break;
          case 'metal': t = this.noise(u * params.scale * 20, v * params.scale * 20) * 0.15 + 0.5; break;
        }
        t = Math.max(0, Math.min(1, t));
        const r = Math.round(c1.r + (c2.r - c1.r) * t);
        const g = Math.round(c1.g + (c2.g - c1.g) * t);
        const b = Math.round(c1.b + (c2.b - c1.b) * t);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    const dataUrl = canvas.toDataURL('image/png');
    const texId = `proc_${params.type}_${Date.now()}`;
    this.textureLibrary.set(texId, dataUrl);
    eventBus.emit('texture:procedural-generated', { type: params.type, id: texId });
    return dataUrl;
  }

  private noise(x: number, y: number): number {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const h = (a: number, b: number) => { const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return n - Math.floor(n); };
    const a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), d = h(ix + 1, iy + 1);
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }

  private hexToRgb(hex: string) {
    const h = hex.replace('#', '');
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }

  getProceduralShader(type: string) { return PROCEDURAL_SHADERS[type] || null; }
  addToLibrary(id: string, dataUrl: string): void { this.textureLibrary.set(id, dataUrl); }
  getFromLibrary(id: string): string | undefined { return this.textureLibrary.get(id); }
  getLibrary(): Map<string, string> { return this.textureLibrary; }
  getStats() { return { materialCount: this.materials.size, libraryCount: this.textureLibrary.size }; }
}

export const textureEngine = new TextureEngine();
