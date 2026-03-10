import eventBus from './EventBus';
import { Voxel, SemanticTag, SemanticCategory } from '../store/useStore';

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m+1 }, () => Array(n+1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    dp[i][j] = a[i-1]===b[j-1] ? dp[i-1][j-1] : 1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
  return dp[m][n];
}

export class SemanticEngine {
  private labels = new Map<string, { tag: SemanticTag; category: SemanticCategory; properties: Record<string,any> }>();
  private commands = new Map<string, (args: string[]) => void>();
  constructor() { this.registerDefaults(); }
  setLabel(vid: string, tag: SemanticTag, cat: SemanticCategory, props?: Record<string,any>) { this.labels.set(vid, { tag, category: cat, properties: props||{} }); eventBus.emit('semantic:label-set', { vid, tag }); }
  getLabel(vid: string) { return this.labels.get(vid); }
  search(query: string, voxels: Voxel[]): Voxel[] { const q = query.toLowerCase(); return voxels.filter(v => { const l = this.labels.get(v.id); return l && (levenshtein(q,l.tag)<=2 || levenshtein(q,l.category)<=2); }); }
  classify(voxels: Voxel[]) { const g = new Map<SemanticCategory, Voxel[]>(); voxels.forEach(v => { const c = v.category||'structure'; if(!g.has(c)) g.set(c,[]); g.get(c)!.push(v); }); return g; }
  parseCommand(input: string) { const parts = input.trim().split(/\s+/); if(!parts.length) return null; const best = this.findBest(parts[0].toLowerCase()); return best ? { command: best, args: parts.slice(1) } : null; }
  executeCommand(input: string): string { const p = this.parseCommand(input); if(!p) return `未知命令: ${input}`; const h = this.commands.get(p.command); if(h) { h(p.args); return `已執行: ${p.command}`; } return `無法執行: ${p.command}`; }
  private findBest(input: string): string|null { let best='',bestD=Infinity; this.commands.forEach((_,cmd)=>{ const d=levenshtein(input,cmd); if(d<bestD&&d<=3){bestD=d;best=cmd;} }); return best||null; }
  private registerDefaults() {
    this.commands.set('place', ()=>eventBus.emit('command:tool','place'));
    this.commands.set('erase', ()=>eventBus.emit('command:tool','erase'));
    this.commands.set('select', ()=>eventBus.emit('command:tool','select'));
    this.commands.set('smooth', ()=>eventBus.emit('command:tool','smooth'));
    this.commands.set('fill', ()=>eventBus.emit('command:tool','fill'));
    this.commands.set('sculpt', ()=>eventBus.emit('command:tool','sculpt'));
    this.commands.set('nurbs', ()=>eventBus.emit('command:run-pipeline'));
    this.commands.set('undo', ()=>eventBus.emit('command:undo'));
    this.commands.set('redo', ()=>eventBus.emit('command:redo'));
  }
  getStats() { return { labelCount: this.labels.size }; }
}
export const semanticEngine = new SemanticEngine();
