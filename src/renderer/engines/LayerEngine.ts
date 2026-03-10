import eventBus from './EventBus';

export type BlendMode = 'normal' | 'additive' | 'multiply';

export interface LayerData {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: BlendMode;
  parentId: string | null;
  order: number;
  maskEnabled: boolean;
  maskBit: number;
  childIds: string[];
  voxelCount: number;
}

export class LayerEngine {
  private layers: Map<string, LayerData> = new Map();
  private nextOrder = 0;
  private nextMaskBit = 1;

  constructor() {
    this.createLayer('default', '預設圖層', '#4a90d9');
    this.createLayer('structure', '結構', '#e74c3c');
    this.createLayer('decoration', '裝飾', '#f5a623');
  }

  createLayer(id: string, name: string, color: string, parentId: string | null = null): LayerData {
    const maskBit = Math.min(this.nextMaskBit++, 31);
    const layer: LayerData = {
      id, name, color, visible: true, locked: false, opacity: 1.0,
      blendMode: 'normal', parentId, order: this.nextOrder++,
      maskEnabled: false, maskBit, childIds: [], voxelCount: 0,
    };
    this.layers.set(id, layer);
    if (parentId) {
      const parent = this.layers.get(parentId);
      if (parent) parent.childIds.push(id);
    }
    eventBus.emit('layer:created', { id, name });
    return layer;
  }

  deleteLayer(id: string): boolean {
    if (id === 'default') return false;
    const layer = this.layers.get(id);
    if (!layer) return false;
    for (const childId of layer.childIds) {
      const child = this.layers.get(childId);
      if (child) child.parentId = layer.parentId;
      if (layer.parentId) {
        const parent = this.layers.get(layer.parentId);
        if (parent) parent.childIds.push(childId);
      }
    }
    if (layer.parentId) {
      const parent = this.layers.get(layer.parentId);
      if (parent) parent.childIds = parent.childIds.filter(c => c !== id);
    }
    this.layers.delete(id);
    eventBus.emit('layer:deleted', { id });
    return true;
  }

  duplicateLayer(id: string): LayerData | null {
    const src = this.layers.get(id);
    if (!src) return null;
    const newId = `${id}_copy_${Date.now()}`;
    const dup = this.createLayer(newId, `${src.name} (複製)`, src.color, src.parentId);
    dup.opacity = src.opacity;
    dup.blendMode = src.blendMode;
    dup.visible = src.visible;
    return dup;
  }

  setVisible(id: string, visible: boolean): void {
    const layer = this.layers.get(id);
    if (!layer) return;
    layer.visible = visible;
    for (const childId of layer.childIds) this.setVisible(childId, visible);
    eventBus.emit('layer:visibility-changed', { id, visible });
  }

  setLocked(id: string, locked: boolean): void {
    const layer = this.layers.get(id);
    if (!layer) return;
    layer.locked = locked;
    eventBus.emit('layer:lock-changed', { id, locked });
  }

  setOpacity(id: string, opacity: number): void {
    const layer = this.layers.get(id);
    if (!layer) return;
    layer.opacity = Math.max(0, Math.min(1, opacity));
    eventBus.emit('layer:opacity-changed', { id, opacity: layer.opacity });
  }

  setBlendMode(id: string, mode: BlendMode): void {
    const layer = this.layers.get(id);
    if (!layer) return;
    layer.blendMode = mode;
    eventBus.emit('layer:blend-changed', { id, mode });
  }

  setMaskEnabled(id: string, enabled: boolean): void {
    const layer = this.layers.get(id);
    if (!layer) return;
    layer.maskEnabled = enabled;
    eventBus.emit('layer:mask-changed', { id, enabled });
  }

  reorderLayer(id: string, newOrder: number): void {
    const layer = this.layers.get(id);
    if (!layer) return;
    const oldOrder = layer.order;
    this.layers.forEach(l => {
      if (l.id === id) return;
      if (oldOrder < newOrder) { if (l.order > oldOrder && l.order <= newOrder) l.order--; }
      else { if (l.order >= newOrder && l.order < oldOrder) l.order++; }
    });
    layer.order = newOrder;
    eventBus.emit('layer:reordered', { id, newOrder });
  }

  setParent(id: string, parentId: string | null): void {
    const layer = this.layers.get(id);
    if (!layer || id === parentId) return;
    if (layer.parentId) {
      const oldParent = this.layers.get(layer.parentId);
      if (oldParent) oldParent.childIds = oldParent.childIds.filter(c => c !== id);
    }
    layer.parentId = parentId;
    if (parentId) {
      const newParent = this.layers.get(parentId);
      if (newParent) newParent.childIds.push(id);
    }
    eventBus.emit('layer:parent-changed', { id, parentId });
  }

  updateVoxelCount(id: string, count: number): void {
    const layer = this.layers.get(id);
    if (layer) layer.voxelCount = count;
  }

  getLayer(id: string): LayerData | undefined { return this.layers.get(id); }
  getAllLayers(): LayerData[] { return Array.from(this.layers.values()).sort((a, b) => a.order - b.order); }
  getRootLayers(): LayerData[] { return this.getAllLayers().filter(l => !l.parentId); }

  isLayerVisible(id: string): boolean {
    const layer = this.layers.get(id);
    if (!layer) return false;
    if (!layer.visible) return false;
    if (layer.parentId) return this.isLayerVisible(layer.parentId);
    return true;
  }

  getThreeBlending(mode: BlendMode): number {
    switch (mode) { case 'additive': return 2; case 'multiply': return 4; default: return 1; }
  }
}

export const layerEngine = new LayerEngine();
