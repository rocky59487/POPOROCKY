/**
 * designRules.ts - 預設設計規則
 *
 * 定義一組預設的設計規則，用於語意引擎的規則檢查系統。
 * 每個規則包含：
 *   - id: 唯一識別碼
 *   - name: 人類可讀名稱
 *   - priority: 優先順序（越小越先執行）
 *   - description: 規則描述
 *   - severity: 嚴重程度（info / warning / error）
 *   - tag: 觸發時加的標籤
 *   - condition: 判斷函式
 */

import { DesignRule, SemanticEntity, RuleContext } from './SemanticEngine';

// ═══════════════════════════════════════════════════════════════
//  預設設計規則
// ═══════════════════════════════════════════════════════════════

export const DEFAULT_DESIGN_RULES: DesignRule[] = [
  // ─── 結構安全規則 ───
  {
    id: 'stress-zone',
    name: '應力超標區域',
    priority: 0,
    description: 'FEA 分析顯示應力比超過 0.8',
    severity: 'error',
    tag: 'overstress',
    condition: (entity: SemanticEntity, _context: RuleContext): boolean => {
      return entity.tags.has('overstress');
    },
  },

  {
    id: 'overload-zone',
    name: '超載區域',
    priority: 1,
    description: 'FEA 分析顯示應力比超過 1.0，結構可能失效',
    severity: 'error',
    tag: 'overload',
    condition: (entity: SemanticEntity, _context: RuleContext): boolean => {
      return entity.tags.has('overload');
    },
  },

  // ─── 結構完整性規則 ───
  {
    id: 'floating-structure',
    name: '懸浮結構',
    priority: 2,
    description: '結構體素位於高處但下方無支撐',
    severity: 'warning',
    tag: 'floating',
    condition: (entity: SemanticEntity, context: RuleContext): boolean => {
      if (entity.category !== 'structure') return false;
      if (entity.properties.height <= 0) return false;
      if (entity.tags.has('support')) return false;

      // 檢查下方是否有體素
      const belowY = entity.properties.height - 1;
      let hasBelow = false;
      context.allEntities.forEach(other => {
        if (other.voxelId === entity.voxelId) return;
        if (Math.abs(other.properties.height - belowY) < 0.01) {
          hasBelow = true;
        }
      });

      return !hasBelow;
    },
  },

  // ─── 材質規則 ───
  {
    id: 'glass-load-bearing',
    name: '玻璃承重',
    priority: 3,
    description: '玻璃材質用於結構承重位置',
    severity: 'warning',
    tag: 'glass-structural',
    condition: (entity: SemanticEntity, _context: RuleContext): boolean => {
      return (
        entity.category === 'structure' &&
        entity.properties.materialName === 'glass'
      );
    },
  },

  {
    id: 'brick-tension',
    name: '磚塊受拉',
    priority: 4,
    description: '磚塊材質在拉伸區域（磚塊抗拉強度極低）',
    severity: 'warning',
    tag: 'brick-tension',
    condition: (entity: SemanticEntity, _context: RuleContext): boolean => {
      if (entity.properties.materialName !== 'brick') return false;
      // 如果有 FEA 標記為受拉，則觸發
      const sr = entity.properties['stressRatio'];
      return typeof sr === 'number' && sr > 0.3;
    },
  },

  // ─── 高度規則 ───
  {
    id: 'high-structure',
    name: '高層結構',
    priority: 5,
    description: '結構高度超過 10 個單位',
    severity: 'info',
    tag: 'high-rise',
    condition: (entity: SemanticEntity, _context: RuleContext): boolean => {
      return (
        entity.category === 'structure' &&
        entity.properties.height >= 10
      );
    },
  },

  // ─── 支撐規則 ───
  {
    id: 'unsupported-model',
    name: '無支撐模型',
    priority: 6,
    description: '模型中沒有任何標記為支撐的體素',
    severity: 'info',
    tag: 'no-supports',
    condition: (entity: SemanticEntity, context: RuleContext): boolean => {
      // 只在第一個實體上檢查（避免重複）
      let hasAnySupport = false;
      context.allEntities.forEach(e => {
        if (e.tags.has('support')) hasAnySupport = true;
      });
      // 如果沒有支撐，標記所有結構體素
      return !hasAnySupport && entity.category === 'structure';
    },
  },
];

/**
 * 取得所有預設設計規則的副本
 */
export function getDefaultDesignRules(): DesignRule[] {
  return DEFAULT_DESIGN_RULES.map(rule => ({ ...rule }));
}
