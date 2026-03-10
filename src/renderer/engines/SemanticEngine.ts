import eventBus from './EventBus';
import { Voxel, SemanticTag, SemanticCategory } from '../store/useStore';

// ─── Levenshtein for fuzzy search ───
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

// ─── ECS Component Store (bitECS-inspired typed arrays) ───
const MAX_ENTITIES = 100000;

class ECSStore {
  posX = new Float32Array(MAX_ENTITIES);
  posY = new Float32Array(MAX_ENTITIES);
  posZ = new Float32Array(MAX_ENTITIES);
  categoryBits = new Uint8Array(MAX_ENTITIES); // bit0=structural, bit1=decorative, bit2=functional
  height = new Float32Array(MAX_ENTITIES);
  loadBearing = new Uint8Array(MAX_ENTITIES);
  count = 0;
  idToIndex = new Map<string, number>();
  indexToId = new Map<number, string>();

  add(id: string, x: number, y: number, z: number, category: SemanticCategory): number {
    const idx = this.count++;
    this.idToIndex.set(id, idx);
    this.indexToId.set(idx, id);
    this.posX[idx] = x; this.posY[idx] = y; this.posZ[idx] = z;
    this.categoryBits[idx] = category === 'structure' ? 1 : category === 'decoration' ? 2 : 4;
    this.height[idx] = y;
    this.loadBearing[idx] = category === 'structure' ? 1 : 0;
    return idx;
  }

  remove(id: string): void {
    const idx = this.idToIndex.get(id);
    if (idx === undefined) return;
    this.idToIndex.delete(id);
    this.indexToId.delete(idx);
    if (idx < this.count - 1) {
      const lastIdx = this.count - 1;
      const lastId = this.indexToId.get(lastIdx);
      if (lastId) {
        this.posX[idx] = this.posX[lastIdx]; this.posY[idx] = this.posY[lastIdx]; this.posZ[idx] = this.posZ[lastIdx];
        this.categoryBits[idx] = this.categoryBits[lastIdx]; this.height[idx] = this.height[lastIdx];
        this.loadBearing[idx] = this.loadBearing[lastIdx];
        this.idToIndex.set(lastId, idx); this.indexToId.set(idx, lastId); this.indexToId.delete(lastIdx);
      }
    }
    this.count--;
  }

  queryByCategory(bit: number): string[] {
    const r: string[] = [];
    for (let i = 0; i < this.count; i++) if (this.categoryBits[i] & bit) { const id = this.indexToId.get(i); if (id) r.push(id); }
    return r;
  }

  queryAboveHeight(h: number): string[] {
    const r: string[] = [];
    for (let i = 0; i < this.count; i++) if (this.height[i] >= h) { const id = this.indexToId.get(i); if (id) r.push(id); }
    return r;
  }
}

// ─── Semantic Rule ───
export interface SemanticRule {
  id: string;
  name: string;
  conditions: { field: string; operator: string; value: any }[];
  action: string;
  priority: number;
}

// ─── Semantic Group ───
export interface SemanticGroup {
  id: string;
  name: string;
  category: SemanticCategory;
  entityIds: string[];
}

// ─── Semantic Engine ───
export class SemanticEngine {
  private labels = new Map<string, { tag: SemanticTag; category: SemanticCategory; tags: string[]; properties: Record<string, any> }>();
  private groups = new Map<string, SemanticGroup>();
  private rules: SemanticRule[] = [];
  private ecs = new ECSStore();
  private rulesEngine: any = null;
  private commands = new Map<string, (args: string[]) => void>();

  constructor() {
    this.registerDefaults();
    this.initRulesEngine();
  }

  private async initRulesEngine() {
    try {
      const { Engine } = await import('json-rules-engine');
      this.rulesEngine = new Engine();
      // Default rules
      this.addRule({ id: 'high_risk', name: '高層結構風險', conditions: [{ field: 'category', operator: 'equal', value: 'structure' }, { field: 'height', operator: 'greaterThan', value: 10 }], action: 'high_risk', priority: 10 });
      this.addRule({ id: 'unsupported', name: '無支撐裝飾', conditions: [{ field: 'category', operator: 'equal', value: 'decoration' }, { field: 'height', operator: 'greaterThan', value: 5 }], action: 'needs_support', priority: 5 });
      console.log('[SemanticEngine] json-rules-engine initialized');
      eventBus.emit('semantic:ready', {});
    } catch (e) {
      console.warn('[SemanticEngine] json-rules-engine not available', e);
    }
  }

  // ─── Entity Registration ───
  registerEntity(voxelId: string, x: number, y: number, z: number, category: SemanticCategory, tag: SemanticTag = 'smooth'): void {
    this.labels.set(voxelId, { tag, category, tags: [], properties: { height: y } });
    this.ecs.add(voxelId, x, y, z, category);
  }

  removeEntity(voxelId: string): void {
    this.labels.delete(voxelId);
    this.ecs.remove(voxelId);
    // Remove from groups
    this.groups.forEach(g => { g.entityIds = g.entityIds.filter(id => id !== voxelId); });
  }

  setLabel(vid: string, tag: SemanticTag, cat: SemanticCategory, props?: Record<string, any>) {
    const existing = this.labels.get(vid);
    if (existing) { existing.tag = tag; existing.category = cat; if (props) existing.properties = { ...existing.properties, ...props }; }
    else this.labels.set(vid, { tag, category: cat, tags: [], properties: props || {} });
    eventBus.emit('semantic:label-set', { vid, tag });
  }

  getLabel(vid: string) { return this.labels.get(vid); }

  // ─── Tag Management ───
  addTag(voxelId: string, tag: string): void {
    const e = this.labels.get(voxelId);
    if (e && !e.tags.includes(tag)) { e.tags.push(tag); eventBus.emit('semantic:tag-added', { voxelId, tag }); }
  }

  removeTag(voxelId: string, tag: string): void {
    const e = this.labels.get(voxelId);
    if (e) { e.tags = e.tags.filter(t => t !== tag); eventBus.emit('semantic:tag-removed', { voxelId, tag }); }
  }

  // ─── Group Management ───
  createGroup(name: string, category: SemanticCategory): SemanticGroup {
    const id = `grp_${Date.now()}`;
    const group: SemanticGroup = { id, name, category, entityIds: [] };
    this.groups.set(id, group);
    eventBus.emit('semantic:group-created', { id, name });
    return group;
  }

  addToGroup(groupId: string, voxelId: string): void {
    const g = this.groups.get(groupId);
    if (g && !g.entityIds.includes(voxelId)) g.entityIds.push(voxelId);
  }

  // ─── Search ───
  search(query: string, voxels: Voxel[]): Voxel[] {
    const q = query.toLowerCase();
    return voxels.filter(v => {
      const l = this.labels.get(v.id);
      if (!l) return false;
      return levenshtein(q, l.tag) <= 2 || levenshtein(q, l.category) <= 2 || l.tags.some(t => t.toLowerCase().includes(q));
    });
  }

  searchByTag(tag: string): string[] {
    const results: string[] = [];
    this.labels.forEach((l, id) => { if (l.tags.includes(tag)) results.push(id); });
    return results;
  }

  // ─── ECS Queries ───
  queryStructural(): string[] { return this.ecs.queryByCategory(1); }
  queryDecorative(): string[] { return this.ecs.queryByCategory(2); }
  queryFunctional(): string[] { return this.ecs.queryByCategory(4); }
  queryAboveHeight(h: number): string[] { return this.ecs.queryAboveHeight(h); }

  classify(voxels: Voxel[]) {
    const g = new Map<SemanticCategory, Voxel[]>();
    voxels.forEach(v => { const c = v.category || 'structure'; if (!g.has(c)) g.set(c, []); g.get(c)!.push(v); });
    return g;
  }

  getClassificationTree() {
    return {
      structural: this.ecs.queryByCategory(1).length,
      decorative: this.ecs.queryByCategory(2).length,
      functional: this.ecs.queryByCategory(4).length,
      groups: this.groups.size,
    };
  }

  // ─── Rules ───
  addRule(rule: SemanticRule): void {
    this.rules.push(rule);
    if (this.rulesEngine) {
      this.rulesEngine.addRule({
        conditions: { all: rule.conditions.map(c => ({ fact: c.field, operator: c.operator, value: c.value })) },
        event: { type: rule.action, params: { ruleId: rule.id } },
        priority: rule.priority,
      });
    }
  }

  async evaluateRules(voxelId: string): Promise<string[]> {
    const e = this.labels.get(voxelId);
    if (!e || !this.rulesEngine) return [];
    try {
      const result = await this.rulesEngine.run({ category: e.category, height: e.properties.height || 0 });
      const actions = result.events.map((ev: any) => ev.type);
      for (const a of actions) this.addTag(voxelId, a);
      return actions;
    } catch { return []; }
  }

  async evaluateAllRules(): Promise<number> {
    let count = 0;
    for (const [id] of this.labels) {
      const actions = await this.evaluateRules(id);
      if (actions.length > 0) count++;
    }
    eventBus.emit('semantic:rules-evaluated', { count });
    return count;
  }

  // ─── Commands ───
  parseCommand(input: string) {
    const parts = input.trim().split(/\s+/);
    if (!parts.length) return null;
    const best = this.findBest(parts[0].toLowerCase());
    return best ? { command: best, args: parts.slice(1) } : null;
  }

  executeCommand(input: string): string {
    const p = this.parseCommand(input);
    if (!p) return `未知命令: ${input}`;
    const h = this.commands.get(p.command);
    if (h) { h(p.args); return `已執行: ${p.command}`; }
    return `無法執行: ${p.command}`;
  }

  private findBest(input: string): string | null {
    let best = '', bestD = Infinity;
    this.commands.forEach((_, cmd) => { const d = levenshtein(input, cmd); if (d < bestD && d <= 3) { bestD = d; best = cmd; } });
    return best || null;
  }

  private registerDefaults() {
    this.commands.set('place', () => eventBus.emit('command:tool', 'place'));
    this.commands.set('erase', () => eventBus.emit('command:tool', 'erase'));
    this.commands.set('select', () => eventBus.emit('command:tool', 'select'));
    this.commands.set('smooth', () => eventBus.emit('command:tool', 'smooth'));
    this.commands.set('fill', () => eventBus.emit('command:tool', 'fill'));
    this.commands.set('sculpt', () => eventBus.emit('command:tool', 'sculpt'));
    this.commands.set('nurbs', () => eventBus.emit('command:run-pipeline'));
    this.commands.set('undo', () => eventBus.emit('command:undo'));
    this.commands.set('redo', () => eventBus.emit('command:redo'));
  }

  getAllGroups(): SemanticGroup[] { return Array.from(this.groups.values()); }
  getRules(): SemanticRule[] { return [...this.rules]; }

  getStats() {
    return {
      labelCount: this.labels.size,
      ecsCount: this.ecs.count,
      groupCount: this.groups.size,
      ruleCount: this.rules.length,
    };
  }
}

export const semanticEngine = new SemanticEngine();
