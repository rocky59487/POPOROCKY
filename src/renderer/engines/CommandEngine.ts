/**
 * CommandEngine - AutoCAD-style Command Line Engine
 * 
 * Parses and executes text commands for voxel operations, view control,
 * FEA analysis, layer management, and file I/O.
 */
import Fuse from 'fuse.js';
import { useStore, Voxel, Vec3 } from '../store/useStore';
import { voxelEngine } from './VoxelEngine';
import { loadEngine, MATERIAL_PRESETS } from './LoadEngine';
import eventBus from './EventBus';
import { ReportGenerator } from './ReportGenerator';

/* ─── Command Definition ─── */
export interface CommandDef {
  name: string;
  aliases: string[];
  syntax: string;
  description: string;
  category: 'voxel' | 'view' | 'analysis' | 'layer' | 'export' | 'system';
  execute: (args: string[]) => CommandResult;
}

export interface CommandResult {
  success: boolean;
  message: string;
  data?: any;
}

export interface CommandHistoryEntry {
  input: string;
  result: CommandResult;
  timestamp: number;
}

/* ─── Helper ─── */
function parseNum(s: string): number | null {
  const n = Number(s);
  return isNaN(n) ? null : n;
}

function parseVec3(args: string[], offset: number): Vec3 | null {
  const x = parseNum(args[offset]);
  const y = parseNum(args[offset + 1]);
  const z = parseNum(args[offset + 2]);
  if (x === null || y === null || z === null) return null;
  return { x, y, z };
}

/* ─── Command Engine Class ─── */
class CommandEngine {
  private commands: Map<string, CommandDef> = new Map();
  private history: CommandHistoryEntry[] = [];
  private historyIndex: number = -1;
  private fuse!: Fuse<CommandDef>;

  constructor() {
    this.registerAllCommands();
    this.buildSearchIndex();
  }

  private buildSearchIndex() {
    const allCmds = Array.from(this.commands.values());
    // Deduplicate by name
    const unique = allCmds.filter((c, i, arr) => arr.findIndex(x => x.name === c.name) === i);
    this.fuse = new Fuse(unique, {
      keys: ['name', 'aliases', 'description'],
      threshold: 0.4,
      includeScore: true,
    });
  }

  /* ─── Registration ─── */
  private reg(def: CommandDef) {
    this.commands.set(def.name.toUpperCase(), def);
    for (const alias of def.aliases) {
      this.commands.set(alias.toUpperCase(), def);
    }
  }

  private registerAllCommands() {
    const store = () => useStore.getState();

    // ═══════════════ VOXEL COMMANDS ═══════════════
    this.reg({
      name: 'BOX', aliases: [], syntax: 'BOX x y z w h d',
      description: '在指定位置建立方塊（寬高深）',
      category: 'voxel',
      execute: (args) => {
        if (args.length < 6) return { success: false, message: '用法: BOX x y z w h d' };
        const pos = parseVec3(args, 0);
        const w = parseNum(args[3]), h = parseNum(args[4]), d = parseNum(args[5]);
        if (!pos || w === null || h === null || d === null) return { success: false, message: '參數錯誤，需要 6 個數字' };
        const s = store();
        let count = 0;
        const preset = loadEngine.getMaterialPreset(s.activeVoxelMaterial);
        const mat = preset ? { ...preset.material } : { maxCompression: 30, maxTension: 3, density: 2400, youngModulus: 25000 };
        for (let dx = 0; dx < w; dx++) {
          for (let dy = 0; dy < h; dy++) {
            for (let dz = 0; dz < d; dz++) {
              const vp = { x: pos.x + dx, y: pos.y + dy, z: pos.z + dz };
              const v: Voxel = {
                id: `cmd_${Date.now()}_${count}`,
                pos: vp, color: s.paintColor, layerId: s.activeLayerId,
                material: { ...mat }, isSupport: false, materialId: s.activeVoxelMaterial,
              };
              s.addVoxel(v);
              voxelEngine.addVoxel(v);
              count++;
            }
          }
        }
        return { success: true, message: `已建立 ${count} 個體素方塊 (${w}x${h}x${d}) 於 (${pos.x},${pos.y},${pos.z})` };
      },
    });

    this.reg({
      name: 'SPHERE', aliases: [], syntax: 'SPHERE x y z r',
      description: '在指定位置建立球形體素群',
      category: 'voxel',
      execute: (args) => {
        if (args.length < 4) return { success: false, message: '用法: SPHERE x y z r' };
        const center = parseVec3(args, 0);
        const r = parseNum(args[3]);
        if (!center || r === null || r <= 0) return { success: false, message: '參數錯誤' };
        const s = store();
        let count = 0;
        const preset = loadEngine.getMaterialPreset(s.activeVoxelMaterial);
        const mat = preset ? { ...preset.material } : { maxCompression: 30, maxTension: 3, density: 2400, youngModulus: 25000 };
        for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
          for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
            for (let dz = -Math.ceil(r); dz <= Math.ceil(r); dz++) {
              if (dx * dx + dy * dy + dz * dz <= r * r) {
                const vp = { x: center.x + dx, y: center.y + dy, z: center.z + dz };
                const v: Voxel = {
                  id: `cmd_${Date.now()}_${count}`,
                  pos: vp, color: s.paintColor, layerId: s.activeLayerId,
                  material: { ...mat }, isSupport: false, materialId: s.activeVoxelMaterial,
                };
                s.addVoxel(v);
                voxelEngine.addVoxel(v);
                count++;
              }
            }
          }
        }
        return { success: true, message: `已建立 ${count} 個體素球體 (r=${r}) 於 (${center.x},${center.y},${center.z})` };
      },
    });

    this.reg({
      name: 'CYLINDER', aliases: [], syntax: 'CYLINDER x y z r h',
      description: '在指定位置建立圓柱體素群',
      category: 'voxel',
      execute: (args) => {
        if (args.length < 5) return { success: false, message: '用法: CYLINDER x y z r h' };
        const base = parseVec3(args, 0);
        const r = parseNum(args[3]), h = parseNum(args[4]);
        if (!base || r === null || h === null) return { success: false, message: '參數錯誤' };
        const s = store();
        let count = 0;
        const preset = loadEngine.getMaterialPreset(s.activeVoxelMaterial);
        const mat = preset ? { ...preset.material } : { maxCompression: 30, maxTension: 3, density: 2400, youngModulus: 25000 };
        for (let dy = 0; dy < h; dy++) {
          for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
            for (let dz = -Math.ceil(r); dz <= Math.ceil(r); dz++) {
              if (dx * dx + dz * dz <= r * r) {
                const vp = { x: base.x + dx, y: base.y + dy, z: base.z + dz };
                const v: Voxel = {
                  id: `cmd_${Date.now()}_${count}`,
                  pos: vp, color: s.paintColor, layerId: s.activeLayerId,
                  material: { ...mat }, isSupport: false, materialId: s.activeVoxelMaterial,
                };
                s.addVoxel(v);
                voxelEngine.addVoxel(v);
                count++;
              }
            }
          }
        }
        return { success: true, message: `已建立 ${count} 個體素圓柱 (r=${r}, h=${h}) 於 (${base.x},${base.y},${base.z})` };
      },
    });

    this.reg({
      name: 'FILL', aliases: [], syntax: 'FILL x1 y1 z1 x2 y2 z2',
      description: '填充指定範圍的體素',
      category: 'voxel',
      execute: (args) => {
        if (args.length < 6) return { success: false, message: '用法: FILL x1 y1 z1 x2 y2 z2' };
        const p1 = parseVec3(args, 0);
        const p2 = parseVec3(args, 3);
        if (!p1 || !p2) return { success: false, message: '參數錯誤' };
        const s = store();
        let count = 0;
        const preset = loadEngine.getMaterialPreset(s.activeVoxelMaterial);
        const mat = preset ? { ...preset.material } : { maxCompression: 30, maxTension: 3, density: 2400, youngModulus: 25000 };
        const minX = Math.min(p1.x, p2.x), maxX = Math.max(p1.x, p2.x);
        const minY = Math.min(p1.y, p2.y), maxY = Math.max(p1.y, p2.y);
        const minZ = Math.min(p1.z, p2.z), maxZ = Math.max(p1.z, p2.z);
        for (let x = minX; x <= maxX; x++) {
          for (let y = minY; y <= maxY; y++) {
            for (let z = minZ; z <= maxZ; z++) {
              const v: Voxel = {
                id: `cmd_${Date.now()}_${count}`,
                pos: { x, y, z }, color: s.paintColor, layerId: s.activeLayerId,
                material: { ...mat }, isSupport: false, materialId: s.activeVoxelMaterial,
              };
              s.addVoxel(v);
              voxelEngine.addVoxel(v);
              count++;
            }
          }
        }
        return { success: true, message: `已填充 ${count} 個體素 (${minX},${minY},${minZ}) → (${maxX},${maxY},${maxZ})` };
      },
    });

    this.reg({
      name: 'DELETE', aliases: ['DEL'], syntax: 'DELETE x y z',
      description: '刪除指定位置的體素',
      category: 'voxel',
      execute: (args) => {
        if (args.length < 3) return { success: false, message: '用法: DELETE x y z' };
        const pos = parseVec3(args, 0);
        if (!pos) return { success: false, message: '參數錯誤' };
        const s = store();
        const v = s.voxels.find(v => v.pos.x === pos.x && v.pos.y === pos.y && v.pos.z === pos.z);
        if (!v) return { success: false, message: `位置 (${pos.x},${pos.y},${pos.z}) 沒有體素` };
        s.removeVoxel(v.id);
        voxelEngine.removeVoxel(pos);
        return { success: true, message: `已刪除體素 (${pos.x},${pos.y},${pos.z})` };
      },
    });

    this.reg({
      name: 'CLEAR', aliases: [], syntax: 'CLEAR',
      description: '清空所有體素',
      category: 'voxel',
      execute: () => {
        const s = store();
        const count = s.voxels.length;
        // Clear all voxels from store
        while (s.voxels.length > 0) {
          s.removeVoxel(s.voxels[0].id);
        }
        voxelEngine.clear();
        return { success: true, message: `已清空 ${count} 個體素` };
      },
    });

    this.reg({
      name: 'UNDO', aliases: [], syntax: 'UNDO',
      description: '復原上一步操作',
      category: 'voxel',
      execute: () => {
        const ok = voxelEngine.undo();
        return ok
          ? { success: true, message: `已復原 (剩餘 ${voxelEngine.getUndoCount()} 步)` }
          : { success: false, message: '沒有可復原的操作' };
      },
    });

    this.reg({
      name: 'REDO', aliases: [], syntax: 'REDO',
      description: '重做上一步操作',
      category: 'voxel',
      execute: () => {
        const ok = voxelEngine.redo();
        return ok
          ? { success: true, message: `已重做 (剩餘 ${voxelEngine.getRedoCount()} 步)` }
          : { success: false, message: '沒有可重做的操作' };
      },
    });

    // ═══════════════ VIEW COMMANDS ═══════════════
    this.reg({
      name: 'ZOOM', aliases: [], syntax: 'ZOOM n',
      description: '縮放到指定倍率',
      category: 'view',
      execute: (args) => {
        const n = parseNum(args[0]);
        if (n === null) return { success: false, message: '用法: ZOOM n (倍率)' };
        eventBus.emit('camera:zoom', { zoom: n });
        return { success: true, message: `已縮放至 ${n}x` };
      },
    });

    this.reg({
      name: 'PAN', aliases: [], syntax: 'PAN x y',
      description: '平移視圖',
      category: 'view',
      execute: (args) => {
        const x = parseNum(args[0]), y = parseNum(args[1]);
        if (x === null || y === null) return { success: false, message: '用法: PAN x y' };
        eventBus.emit('camera:pan', { x, y });
        return { success: true, message: `已平移視圖 (${x}, ${y})` };
      },
    });

    for (const [name, desc] of [['TOP', '俯視圖'], ['FRONT', '前視圖'], ['SIDE', '側視圖'], ['ISO', '等角視圖']] as const) {
      this.reg({
        name, aliases: [], syntax: name,
        description: `切換至${desc}`,
        category: 'view',
        execute: () => {
          eventBus.emit('camera:preset', { view: name.toLowerCase() });
          return { success: true, message: `已切換至${desc}` };
        },
      });
    }

    this.reg({
      name: 'WIREFRAME', aliases: ['WF'], syntax: 'WIREFRAME',
      description: '切換至線框渲染模式',
      category: 'view',
      execute: () => { store().setViewMode('wireframe'); return { success: true, message: '已切換至線框模式' }; },
    });

    this.reg({
      name: 'SOLID', aliases: [], syntax: 'SOLID',
      description: '切換至實體渲染模式',
      category: 'view',
      execute: () => { store().setViewMode('solid'); return { success: true, message: '已切換至實體模式' }; },
    });

    this.reg({
      name: 'GRID', aliases: [], syntax: 'GRID ON/OFF',
      description: '顯示/隱藏網格',
      category: 'view',
      execute: (args) => {
        const s = store();
        if (args[0]?.toUpperCase() === 'ON') { if (!s.showGrid) s.toggleGrid(); return { success: true, message: '網格已開啟' }; }
        if (args[0]?.toUpperCase() === 'OFF') { if (s.showGrid) s.toggleGrid(); return { success: true, message: '網格已關閉' }; }
        s.toggleGrid();
        return { success: true, message: `網格已${s.showGrid ? '關閉' : '開啟'}` };
      },
    });

    this.reg({
      name: 'AXIS', aliases: ['AXES'], syntax: 'AXIS ON/OFF',
      description: '顯示/隱藏座標軸',
      category: 'view',
      execute: (args) => {
        const s = store();
        if (args[0]?.toUpperCase() === 'ON') { if (!s.showAxes) s.toggleAxes(); return { success: true, message: '座標軸已開啟' }; }
        if (args[0]?.toUpperCase() === 'OFF') { if (s.showAxes) s.toggleAxes(); return { success: true, message: '座標軸已關閉' }; }
        s.toggleAxes();
        return { success: true, message: `座標軸已${s.showAxes ? '關閉' : '開啟'}` };
      },
    });

    // ═══════════════ ANALYSIS COMMANDS ═══════════════
    this.reg({
      name: 'ANALYZE', aliases: ['FEA', 'ANALYSE'], syntax: 'ANALYZE',
      description: '執行 FEA 負載分析',
      category: 'analysis',
      execute: () => {
        const s = store();
        if (s.voxels.length === 0) return { success: false, message: '沒有體素可分析' };
        s.setFEAComputing(true);
        try {
          loadEngine.setGravity(s.loadAnalysis.gravity);
          loadEngine.setGravityMagnitude(s.loadAnalysis.gravityMagnitude);
          const result = loadEngine.computeFEA(s.voxels);
          s.setFEAResult(result);
          s.setFEAComputing(false);
          if (!s.loadAnalysis.showStressOverlay) s.toggleStressOverlay();
          return {
            success: true,
            message: `FEA 完成: ${result.totalEdges} 條邊, ${result.dangerCount} 條危險, 最大應力比 ${result.maxStressRatio.toFixed(3)}`,
          };
        } catch (e: any) {
          s.setFEAComputing(false);
          return { success: false, message: `FEA 錯誤: ${e.message}` };
        }
      },
    });

    this.reg({
      name: 'REPORT', aliases: [], syntax: 'REPORT [html]',
      description: '生成結構分析報告（加 html 參數可下載 HTML 報告）',
      category: 'analysis',
      execute: (args) => {
        const s = store();
        if (args[0]?.toLowerCase() === 'html') {
          try {
            ReportGenerator.downloadReport();
            s.addLog('success', 'Report', 'HTML 結構報告已下載');
            return { success: true, message: 'HTML 結構報告已下載' };
          } catch (err) {
            return { success: false, message: '報告生成失敗: ' + String(err) };
          }
        }
        if (!s.loadAnalysis.result) return { success: false, message: '請先執行 ANALYZE' };
        const report = loadEngine.generateReport(s.voxels, s.loadAnalysis.result);
        const reportText = loadEngine.formatReportText(report);
        s.addLog('info', 'Report', reportText);
        return { success: true, message: '結構報告已生成（查看控制台）。輸入 REPORT html 可下載 HTML 版本' };
      },
    });

    this.reg({
      name: 'GLUE', aliases: [], syntax: 'GLUE x1 y1 z1 x2 y2 z2',
      description: '黏合兩個相鄰體素',
      category: 'analysis',
      execute: (args) => {
        if (args.length < 6) return { success: false, message: '用法: GLUE x1 y1 z1 x2 y2 z2' };
        const p1 = parseVec3(args, 0);
        const p2 = parseVec3(args, 3);
        if (!p1 || !p2) return { success: false, message: '參數錯誤' };
        const s = store();
        const v1 = s.voxels.find(v => v.pos.x === p1.x && v.pos.y === p1.y && v.pos.z === p1.z);
        const v2 = s.voxels.find(v => v.pos.x === p2.x && v.pos.y === p2.y && v.pos.z === p2.z);
        if (!v1 || !v2) return { success: false, message: '指定位置沒有體素' };
        eventBus.emit('glue:add', { voxelA: p1, voxelB: p2, strength: 1.0, type: 'rigid' });
        return { success: true, message: `已黏合 (${p1.x},${p1.y},${p1.z}) ↔ (${p2.x},${p2.y},${p2.z})` };
      },
    });

    this.reg({
      name: 'UNGLUE', aliases: [], syntax: 'UNGLUE x1 y1 z1 x2 y2 z2',
      description: '解除兩個體素的黏合',
      category: 'analysis',
      execute: (args) => {
        if (args.length < 6) return { success: false, message: '用法: UNGLUE x1 y1 z1 x2 y2 z2' };
        const p1 = parseVec3(args, 0);
        const p2 = parseVec3(args, 3);
        if (!p1 || !p2) return { success: false, message: '參數錯誤' };
        eventBus.emit('glue:remove', { voxelA: p1, voxelB: p2 });
        return { success: true, message: `已解除黏合 (${p1.x},${p1.y},${p1.z}) ↔ (${p2.x},${p2.y},${p2.z})` };
      },
    });

    // ═══════════════ LAYER COMMANDS ═══════════════
    this.reg({
      name: 'LAYER', aliases: ['LY'], syntax: 'LAYER NEW/DELETE/SHOW/HIDE/SELECT name',
      description: '圖層操作',
      category: 'layer',
      execute: (args) => {
        if (args.length < 1) return { success: false, message: '用法: LAYER NEW/DELETE/SHOW/HIDE/SELECT name' };
        const sub = args[0].toUpperCase();
        const name = args.slice(1).join(' ');
        const s = store();

        switch (sub) {
          case 'NEW': {
            if (!name) return { success: false, message: '請指定圖層名稱' };
            const id = `layer_${Date.now()}`;
            s.addLayer({
              id, name, color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
              visible: true, locked: false, opacity: 1, blendMode: 'normal',
              order: s.layers.length, voxelCount: 0, physicsEnabled: false, maskEnabled: false,
            });
            return { success: true, message: `已新增圖層「${name}」` };
          }
          case 'DELETE': case 'DEL': {
            const layer = s.layers.find(l => l.name === name);
            if (!layer) return { success: false, message: `找不到圖層「${name}」` };
            s.removeLayer(layer.id);
            return { success: true, message: `已刪除圖層「${name}」` };
          }
          case 'SHOW': {
            const layer = s.layers.find(l => l.name === name);
            if (!layer) return { success: false, message: `找不到圖層「${name}」` };
            s.updateLayer(layer.id, { visible: true });
            return { success: true, message: `圖層「${name}」已顯示` };
          }
          case 'HIDE': {
            const layer = s.layers.find(l => l.name === name);
            if (!layer) return { success: false, message: `找不到圖層「${name}」` };
            s.updateLayer(layer.id, { visible: false });
            return { success: true, message: `圖層「${name}」已隱藏` };
          }
          case 'SELECT': case 'SEL': {
            const layer = s.layers.find(l => l.name === name);
            if (!layer) return { success: false, message: `找不到圖層「${name}」` };
            s.setActiveLayer(layer.id);
            return { success: true, message: `已選擇圖層「${name}」` };
          }
          default:
            return { success: false, message: `未知子指令「${sub}」，可用: NEW/DELETE/SHOW/HIDE/SELECT` };
        }
      },
    });

    // ═══════════════ EXPORT COMMANDS ═══════════════
    this.reg({
      name: 'EXPORT', aliases: [], syntax: 'EXPORT OBJ/3DM filename',
      description: '匯出模型檔案',
      category: 'export',
      execute: (args) => {
        if (args.length < 1) return { success: false, message: '用法: EXPORT OBJ/3DM filename' };
        const format = args[0].toUpperCase();
        const filename = args[1] || 'export';
        eventBus.emit('export:request', { format, filename });
        return { success: true, message: `正在匯出 ${format} 格式至 ${filename}.${format.toLowerCase()}` };
      },
    });

    this.reg({
      name: 'SAVE', aliases: [], syntax: 'SAVE [filename]',
      description: '儲存專案',
      category: 'export',
      execute: (args) => {
        const filename = args[0] || 'project';
        eventBus.emit('project:save', { filename });
        return { success: true, message: `專案已儲存為 ${filename}.fdp` };
      },
    });

    this.reg({
      name: 'LOAD', aliases: ['OPEN'], syntax: 'LOAD filename',
      description: '載入專案',
      category: 'export',
      execute: (args) => {
        if (args.length < 1) return { success: false, message: '用法: LOAD filename' };
        eventBus.emit('project:load', { filename: args[0] });
        return { success: true, message: `正在載入 ${args[0]}` };
      },
    });

    // ═══════════════ SYSTEM COMMANDS ═══════════════
    this.reg({
      name: 'HELP', aliases: ['?', 'H'], syntax: 'HELP [command]',
      description: '顯示所有指令或特定指令說明',
      category: 'system',
      execute: (args) => {
        if (args.length > 0) {
          const cmd = this.commands.get(args[0].toUpperCase());
          if (!cmd) return { success: false, message: `未知指令「${args[0]}」` };
          return { success: true, message: `${cmd.name}: ${cmd.description}\n用法: ${cmd.syntax}` };
        }
        // List all unique commands by category
        const unique = new Map<string, CommandDef>();
        this.commands.forEach(c => { if (!unique.has(c.name)) unique.set(c.name, c); });
        const cats: Record<string, string[]> = {};
        unique.forEach(c => {
          if (!cats[c.category]) cats[c.category] = [];
          cats[c.category].push(`  ${c.syntax.padEnd(30)} ${c.description}`);
        });
        const catNames: Record<string, string> = {
          voxel: '體素操作', view: '視圖操作', analysis: '分析操作',
          layer: '圖層操作', export: '匯出/儲存', system: '系統',
        };
        let msg = '═══ FastDesign 指令列表 ═══\n';
        for (const [cat, lines] of Object.entries(cats)) {
          msg += `\n【${catNames[cat] || cat}】\n${lines.join('\n')}\n`;
        }
        return { success: true, message: msg };
      },
    });

    this.reg({
      name: 'VERSION', aliases: ['VER'], syntax: 'VERSION',
      description: '顯示版本資訊',
      category: 'system',
      execute: () => {
        return { success: true, message: 'FastDesign v1.3 — 次世代 3D 敏捷設計系統\nElectron + React + Three.js + FEA Engine' };
      },
    });

    this.reg({
      name: 'FPS', aliases: ['PERF'], syntax: 'FPS',
      description: '顯示效能資訊',
      category: 'system',
      execute: () => {
        const s = store();
        return {
          success: true,
          message: `FPS: ${s.fps} | 記憶體: ${s.memoryUsage} MB | 三角面: ${s.triangleCount} | 繪製呼叫: ${s.drawCalls} | 體素: ${s.voxels.length}`,
        };
      },
    });

    // ═══════════════ BATCH OPERATION COMMANDS ═══════════════
    this.reg({
      name: 'COPY', aliases: ['CP'], syntax: 'COPY x y z dx dy dz',
      description: '複製指定位置的體素到偏移位置',
      category: 'voxel',
      execute: (args) => {
        const s = store();
        // If no args, copy selected voxels with offset
        if (args.length >= 3 && s.selectedVoxelIds.length > 0) {
          const dx = parseNum(args[0]), dy = parseNum(args[1]), dz = parseNum(args[2]);
          if (dx === null || dy === null || dz === null) return { success: false, message: '偏移量參數錯誤' };
          let count = 0;
          const selected = s.voxels.filter(v => s.selectedVoxelIds.includes(v.id));
          for (const sv of selected) {
            const np = { x: sv.pos.x + dx, y: sv.pos.y + dy, z: sv.pos.z + dz };
            const exists = s.voxels.some(v => v.pos.x === np.x && v.pos.y === np.y && v.pos.z === np.z);
            if (!exists) {
              const nv: Voxel = {
                id: `cp_${Date.now()}_${count}`, pos: np, color: sv.color,
                layerId: sv.layerId, material: { ...sv.material }, isSupport: false,
                materialId: sv.materialId,
              };
              s.addVoxel(nv); voxelEngine.addVoxel(nv); count++;
            }
          }
          return { success: true, message: `已複製 ${count} 個體素 (偏移 ${dx},${dy},${dz})` };
        }
        if (args.length < 6) return { success: false, message: '用法: COPY x y z dx dy dz 或選取體素後 COPY dx dy dz' };
        const pos = parseVec3(args, 0);
        const offset = parseVec3(args, 3);
        if (!pos || !offset) return { success: false, message: '參數錯誤' };
        const src = s.voxels.find(v => v.pos.x === pos.x && v.pos.y === pos.y && v.pos.z === pos.z);
        if (!src) return { success: false, message: `位置 (${pos.x},${pos.y},${pos.z}) 沒有體素` };
        const np = { x: pos.x + offset.x, y: pos.y + offset.y, z: pos.z + offset.z };
        const nv: Voxel = {
          id: `cp_${Date.now()}`, pos: np, color: src.color,
          layerId: src.layerId, material: { ...src.material }, isSupport: false, materialId: src.materialId,
        };
        s.addVoxel(nv); voxelEngine.addVoxel(nv);
        return { success: true, message: `已複製體素到 (${np.x},${np.y},${np.z})` };
      },
    });

    this.reg({
      name: 'MOVE', aliases: ['MV'], syntax: 'MOVE dx dy dz',
      description: '移動選取的體素',
      category: 'voxel',
      execute: (args) => {
        if (args.length < 3) return { success: false, message: '用法: MOVE dx dy dz' };
        const dx = parseNum(args[0]), dy = parseNum(args[1]), dz = parseNum(args[2]);
        if (dx === null || dy === null || dz === null) return { success: false, message: '參數錯誤' };
        const s = store();
        const selected = s.voxels.filter(v => s.selectedVoxelIds.includes(v.id));
        if (selected.length === 0) return { success: false, message: '請先選取體素' };
        for (const v of selected) {
          s.updateVoxel(v.id, { pos: { x: v.pos.x + dx, y: v.pos.y + dy, z: v.pos.z + dz } });
        }
        return { success: true, message: `已移動 ${selected.length} 個體素 (偏移 ${dx},${dy},${dz})` };
      },
    });

    this.reg({
      name: 'MIRROR', aliases: ['MIR'], syntax: 'MIRROR X/Y/Z',
      description: '沿指定軸鏡像複製選取的體素',
      category: 'voxel',
      execute: (args) => {
        if (args.length < 1) return { success: false, message: '用法: MIRROR X/Y/Z' };
        const axis = args[0].toUpperCase();
        if (!['X', 'Y', 'Z'].includes(axis)) return { success: false, message: '軸必須是 X, Y 或 Z' };
        const s = store();
        const selected = s.voxels.filter(v => s.selectedVoxelIds.includes(v.id));
        if (selected.length === 0) return { success: false, message: '請先選取體素' };
        // Find center of selection
        let cx = 0, cy = 0, cz = 0;
        for (const v of selected) { cx += v.pos.x; cy += v.pos.y; cz += v.pos.z; }
        cx = Math.round(cx / selected.length); cy = Math.round(cy / selected.length); cz = Math.round(cz / selected.length);
        let count = 0;
        for (const v of selected) {
          let np: Vec3;
          if (axis === 'X') np = { x: 2 * cx - v.pos.x, y: v.pos.y, z: v.pos.z };
          else if (axis === 'Y') np = { x: v.pos.x, y: 2 * cy - v.pos.y, z: v.pos.z };
          else np = { x: v.pos.x, y: v.pos.y, z: 2 * cz - v.pos.z };
          const exists = s.voxels.some(vv => vv.pos.x === np.x && vv.pos.y === np.y && vv.pos.z === np.z);
          if (!exists) {
            const nv: Voxel = {
              id: `mir_${Date.now()}_${count}`, pos: np, color: v.color,
              layerId: v.layerId, material: { ...v.material }, isSupport: false, materialId: v.materialId,
            };
            s.addVoxel(nv); voxelEngine.addVoxel(nv); count++;
          }
        }
        return { success: true, message: `已沿 ${axis} 軸鏡像複製 ${count} 個體素` };
      },
    });

    this.reg({
      name: 'ROTATE', aliases: ['ROT'], syntax: 'ROTATE angle',
      description: '繞 Y 軸旋轉選取的體素（90 度倍數）',
      category: 'voxel',
      execute: (args) => {
        if (args.length < 1) return { success: false, message: '用法: ROTATE 90/180/270' };
        const angle = parseNum(args[0]);
        if (angle === null) return { success: false, message: '角度必須是數字' };
        const s = store();
        const selected = s.voxels.filter(v => s.selectedVoxelIds.includes(v.id));
        if (selected.length === 0) return { success: false, message: '請先選取體素' };
        let cx = 0, cz = 0;
        for (const v of selected) { cx += v.pos.x; cz += v.pos.z; }
        cx = Math.round(cx / selected.length); cz = Math.round(cz / selected.length);
        const rad = (angle * Math.PI) / 180;
        const cosA = Math.round(Math.cos(rad));
        const sinA = Math.round(Math.sin(rad));
        for (const v of selected) {
          const dx = v.pos.x - cx, dz = v.pos.z - cz;
          const nx = cx + dx * cosA - dz * sinA;
          const nz = cz + dx * sinA + dz * cosA;
          s.updateVoxel(v.id, { pos: { x: Math.round(nx), y: v.pos.y, z: Math.round(nz) } });
        }
        return { success: true, message: `已旋轉 ${selected.length} 個體素 ${angle}°` };
      },
    });

    this.reg({
      name: 'MATERIAL', aliases: ['MAT'], syntax: 'MATERIAL type',
      description: '設定選取體素的材質類型',
      category: 'voxel',
      execute: (args) => {
        if (args.length < 1) return { success: false, message: '用法: MATERIAL concrete/steel/wood/brick/aluminum/glass' };
        const type = args[0].toLowerCase();
        const preset = loadEngine.getMaterialPreset(type);
        if (!preset) return { success: false, message: `未知材質類型: ${type}。可用: concrete, steel, wood, brick, aluminum, glass` };
        const s = store();
        const selected = s.voxels.filter(v => s.selectedVoxelIds.includes(v.id));
        if (selected.length === 0) {
          s.setActiveVoxelMaterial(type);
          return { success: true, message: `已設定預設材質為 ${type}` };
        }
        for (const v of selected) {
          s.updateVoxel(v.id, { materialId: type, material: { ...preset.material } });
        }
        return { success: true, message: `已將 ${selected.length} 個體素的材質設為 ${type}` };
      },
    });

    this.reg({
      name: 'COLOR', aliases: [], syntax: 'COLOR #hex',
      description: '設定選取體素的顏色',
      category: 'voxel',
      execute: (args) => {
        if (args.length < 1) return { success: false, message: '用法: COLOR #ff0000' };
        const color = args[0].startsWith('#') ? args[0] : `#${args[0]}`;
        if (!/^#[0-9a-fA-F]{6}$/.test(color)) return { success: false, message: '顏色格式錯誤，需要 #RRGGBB' };
        const s = store();
        const selected = s.voxels.filter(v => s.selectedVoxelIds.includes(v.id));
        if (selected.length === 0) {
          s.setPaintColor(color);
          return { success: true, message: `已設定預設顏色為 ${color}` };
        }
        for (const v of selected) {
          s.updateVoxel(v.id, { color });
        }
        return { success: true, message: `已將 ${selected.length} 個體素的顏色設為 ${color}` };
      },
    });

    this.reg({
      name: 'SELECT', aliases: ['SEL'], syntax: 'SELECT ALL/NONE/MATERIAL type',
      description: '選取操作',
      category: 'voxel',
      execute: (args) => {
        if (args.length < 1) return { success: false, message: '用法: SELECT ALL/NONE/MATERIAL type' };
        const sub = args[0].toUpperCase();
        const s = store();
        switch (sub) {
          case 'ALL':
            s.selectVoxels(s.voxels.map(v => v.id));
            return { success: true, message: `已全選 ${s.voxels.length} 個體素` };
          case 'NONE':
            s.clearSelection();
            return { success: true, message: '已取消選取' };
          case 'MATERIAL': case 'MAT': {
            const type = args[1]?.toLowerCase();
            if (!type) return { success: false, message: '請指定材質類型' };
            const matched = s.voxels.filter(v => v.materialId === type);
            s.selectVoxels(matched.map(v => v.id));
            return { success: true, message: `已選取 ${matched.length} 個 ${type} 體素` };
          }
          case 'LAYER': {
            const layerName = args.slice(1).join(' ');
            if (!layerName) return { success: false, message: '請指定圖層名稱' };
            const layer = s.layers.find(l => l.name === layerName);
            if (!layer) return { success: false, message: `找不到圖層「${layerName}」` };
            const matched = s.voxels.filter(v => v.layerId === layer.id);
            s.selectVoxels(matched.map(v => v.id));
            return { success: true, message: `已選取 ${matched.length} 個「${layerName}」圖層的體素` };
          }
          default:
            return { success: false, message: `未知子指令「${sub}」，可用: ALL/NONE/MATERIAL/LAYER` };
        }
      },
    });

    this.reg({
      name: 'GROUP', aliases: [], syntax: 'GROUP name',
      description: '將選取的體素移到新圖層',
      category: 'layer',
      execute: (args) => {
        const name = args.join(' ') || `群組_${Date.now()}`;
        const s = store();
        const selected = s.voxels.filter(v => s.selectedVoxelIds.includes(v.id));
        if (selected.length === 0) return { success: false, message: '請先選取體素' };
        const id = `layer_${Date.now()}`;
        s.addLayer({
          id, name, color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
          visible: true, locked: false, opacity: 1, blendMode: 'normal',
          order: s.layers.length, voxelCount: selected.length, physicsEnabled: false, maskEnabled: false,
        });
        for (const v of selected) {
          s.updateVoxel(v.id, { layerId: id });
        }
        return { success: true, message: `已將 ${selected.length} 個體素移到新圖層「${name}」` };
      },
    });

    this.reg({
      name: 'SUPPORT', aliases: ['SUP'], syntax: 'SUPPORT x y z',
      description: '設定/取消支撐點',
      category: 'analysis',
      execute: (args) => {
        const s = store();
        if (args.length === 0 && s.selectedVoxelIds.length > 0) {
          const selected = s.voxels.filter(v => s.selectedVoxelIds.includes(v.id));
          let supportCount = 0;
          for (const v of selected) {
            s.toggleVoxelSupport(v.id);
            if (!v.isSupport) supportCount++;
          }
          return { success: true, message: `已切換 ${selected.length} 個體素的支撐狀態` };
        }
        if (args.length < 3) return { success: false, message: '用法: SUPPORT x y z 或選取體素後 SUPPORT' };
        const pos = parseVec3(args, 0);
        if (!pos) return { success: false, message: '參數錯誤' };
        const v = s.voxels.find(v => v.pos.x === pos.x && v.pos.y === pos.y && v.pos.z === pos.z);
        if (!v) return { success: false, message: `位置 (${pos.x},${pos.y},${pos.z}) 沒有體素` };
        s.toggleVoxelSupport(v.id);
        return { success: true, message: `已${v.isSupport ? '取消' : '設定'}支撐點 (${pos.x},${pos.y},${pos.z})` };
      },
    });

    this.reg({
      name: 'LOADFORCE', aliases: ['FORCE'], syntax: 'LOADFORCE x y z fx fy fz',
      description: '施加外部負載',
      category: 'analysis',
      execute: (args) => {
        const s = store();
        if (args.length >= 3 && s.selectedVoxelIds.length > 0) {
          const fx = parseNum(args[0]), fy = parseNum(args[1]), fz = parseNum(args[2]);
          if (fx === null || fy === null || fz === null) return { success: false, message: '力的參數錯誤' };
          const selected = s.voxels.filter(v => s.selectedVoxelIds.includes(v.id));
          for (const v of selected) {
            s.setVoxelExternalLoad(v.id, { x: fx, y: fy, z: fz });
          }
          return { success: true, message: `已對 ${selected.length} 個體素施加負載 (${fx},${fy},${fz}) N` };
        }
        if (args.length < 6) return { success: false, message: '用法: LOADFORCE x y z fx fy fz 或選取體素後 LOADFORCE fx fy fz' };
        const pos = parseVec3(args, 0);
        const force = parseVec3(args, 3);
        if (!pos || !force) return { success: false, message: '參數錯誤' };
        const v = s.voxels.find(v => v.pos.x === pos.x && v.pos.y === pos.y && v.pos.z === pos.z);
        if (!v) return { success: false, message: `位置 (${pos.x},${pos.y},${pos.z}) 沒有體素` };
        s.setVoxelExternalLoad(v.id, force);
        return { success: true, message: `已施加負載 (${force.x},${force.y},${force.z}) N 到 (${pos.x},${pos.y},${pos.z})` };
      },
    });

    // Update VERSION command
    this.commands.delete('VERSION');
    this.commands.delete('VER');
    this.reg({
      name: 'VERSION', aliases: ['VER'], syntax: 'VERSION',
      description: '顯示版本資訊',
      category: 'system',
      execute: () => {
        return { success: true, message: 'FastDesign v1.9 — 次世代 3D 敏捷設計系統\nElectron + React + Three.js + FEA Engine\n七大引擎 + 30+ 指令 + 完整 FEA 分析' };
      },
    });
  }

  /* ─── Execute ─── */
  execute(input: string): CommandResult {
    const trimmed = input.trim();
    if (!trimmed) return { success: false, message: '' };

    const parts = trimmed.split(/\s+/);
    const cmdName = parts[0].toUpperCase();
    const args = parts.slice(1);

    const cmd = this.commands.get(cmdName);
    if (!cmd) {
      // Try fuzzy match for suggestion
      const suggestions = this.search(cmdName);
      const sugMsg = suggestions.length > 0
        ? `\n建議: ${suggestions.slice(0, 3).map(s => s.name).join(', ')}`
        : '';
      return { success: false, message: `未知指令「${cmdName}」${sugMsg}\n輸入 HELP 查看所有指令` };
    }

    const result = cmd.execute(args);

    // Log to history
    this.history.push({ input: trimmed, result, timestamp: Date.now() });
    if (this.history.length > 100) this.history.shift();
    this.historyIndex = this.history.length;

    // Log to store
    const s = useStore.getState();
    s.addLog(result.success ? 'success' : 'error', 'CMD', result.message);

    return result;
  }

  /* ─── Search / Autocomplete ─── */
  search(query: string): CommandDef[] {
    if (!query) return [];
    const results = this.fuse.search(query);
    return results.map(r => r.item).slice(0, 8);
  }

  getCommandByName(name: string): CommandDef | undefined {
    return this.commands.get(name.toUpperCase());
  }

  getAllCommands(): CommandDef[] {
    const unique = new Map<string, CommandDef>();
    this.commands.forEach(c => { if (!unique.has(c.name)) unique.set(c.name, c); });
    return Array.from(unique.values());
  }

  /* ─── History Navigation ─── */
  getHistoryPrev(): string | null {
    if (this.history.length === 0) return null;
    this.historyIndex = Math.max(0, this.historyIndex - 1);
    return this.history[this.historyIndex]?.input || null;
  }

  getHistoryNext(): string | null {
    if (this.history.length === 0) return null;
    this.historyIndex = Math.min(this.history.length, this.historyIndex + 1);
    if (this.historyIndex >= this.history.length) return '';
    return this.history[this.historyIndex]?.input || '';
  }

  getHistory(): CommandHistoryEntry[] {
    return this.history.slice(-20);
  }
}

export const commandEngine = new CommandEngine();
