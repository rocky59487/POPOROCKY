/**
 * SemanticEngine.ts - 精簡版語意引擎
 *
 * 管理體素的語意分類、標籤系統、設計規則檢查。
 *
 * 功能：
 *   1. 語意分類：每個體素歸類為 structure / decoration / functional
 *   2. 標籤系統：每個體素可附加多個 tags（如 'column', 'slab', 'overstress'）
 *   3. 規則系統：定義設計規則，自動檢查並標記違規體素
 *   4. FEA 整合：將 FEA 結果標記到語意實體上
 *   5. 查詢 API：按分類、標籤、高度範圍查詢
 *
 * 設計原則：
 *   - 與 useStore 解耦：SemanticEngine 不直接依賴 Zustand
 *   - 由 store actions 呼叫 register/remove/update
 *   - 規則評估是主動觸發的（非自動監聽）
 */

// ═══════════════════════════════════════════════════════════════
//  型別定義
// ═══════════════════════════════════════════════════════════════

/** 語意分類 */
export type VoxelCategory = 'structure' | 'decoration' | 'functional';

/** 語意實體 */
export interface SemanticEntity {
  voxelId: string;
  category: VoxelCategory;
  tags: Set<string>;
  properties: {
    height: number;
    layerName: string;
    materialName: string;
    [key: string]: unknown;
  };
}

/** 規則上下文 */
export interface RuleContext {
  allEntities: Map<string, SemanticEntity>;
  feaResults: FEAResultForRules | null;
}

/** FEA 結果（規則系統用的簡化版） */
export interface FEAResultForRules {
  maxStressRatio: number;
  dangerCount: number;
  /** voxelId → maxStressRatio at that node */
  nodeStressRatios: Map<string, number>;
}

/** 設計規則定義 */
export interface DesignRule {
  id: string;
  name: string;
  priority: number;
  description: string;
  condition: (entity: SemanticEntity, context: RuleContext) => boolean;
  tag: string;
  severity: 'info' | 'warning' | 'error';
}

/** 規則檢查結果 */
export interface RuleCheckResult {
  ruleId: string;
  ruleName: string;
  severity: 'info' | 'warning' | 'error';
  matchedVoxelIds: string[];
  count: number;
}

/** 語意統計 */
export interface SemanticStats {
  structure: number;
  decoration: number;
  functional: number;
  tagCounts: Record<string, number>;
}

/** 輸入體素（SemanticEngine 需要的最小資訊） */
export interface VoxelInput {
  id: string;
  pos: { x: number; y: number; z: number };
  materialId?: string;
  layerId: string;
  isSupport: boolean;
}

// ═══════════════════════════════════════════════════════════════
//  語意分類推斷
// ═══════════════════════════════════════════════════════════════

/** 材質名稱 → 分類映射 */
const MATERIAL_CATEGORY_MAP: Record<string, VoxelCategory> = {
  concrete: 'structure',
  steel: 'structure',
  wood: 'structure',
  brick: 'structure',
  aluminum: 'structure',
  glass: 'decoration',
};

/** 圖層名稱 → 分類映射 */
const LAYER_CATEGORY_MAP: Record<string, VoxelCategory> = {
  structure: 'structure',
  '結構圖層': 'structure',
  decoration: 'decoration',
  '裝飾圖層': 'decoration',
  functional: 'functional',
  '功能圖層': 'functional',
};

/**
 * 推斷體素的語意分類
 *
 * 優先順序：
 *   1. 圖層名稱（如果匹配已知分類）
 *   2. 材質名稱（如果匹配已知分類）
 *   3. 預設為 'decoration'
 */
function inferCategory(materialId: string | undefined, layerName: string): VoxelCategory {
  const layerCat = LAYER_CATEGORY_MAP[layerName];
  if (layerCat) return layerCat;

  if (materialId) {
    const matCat = MATERIAL_CATEGORY_MAP[materialId.toLowerCase()];
    if (matCat) return matCat;
  }

  return 'decoration';
}

// ═══════════════════════════════════════════════════════════════
//  SemanticEngine 類
// ═══════════════════════════════════════════════════════════════

export class SemanticEngine {
  private entities: Map<string, SemanticEntity> = new Map();
  private rules: Map<string, DesignRule> = new Map();
  private lastFEAResults: FEAResultForRules | null = null;
  private layerNames: Map<string, string> = new Map();

  /**
   * 設定圖層 ID → 名稱映射
   */
  setLayerNames(layers: Array<{ id: string; name: string }>): void {
    this.layerNames.clear();
    for (const l of layers) {
      this.layerNames.set(l.id, l.name);
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  Voxel 生命週期
  // ═══════════════════════════════════════════════════════════

  /**
   * 註冊體素到語意引擎
   */
  registerVoxel(
    voxel: VoxelInput,
    layerName?: string,
    category?: VoxelCategory,
    tags?: string[]
  ): void {
    const resolvedLayerName = layerName || this.layerNames.get(voxel.layerId) || voxel.layerId;
    const resolvedCategory = category || inferCategory(voxel.materialId, resolvedLayerName);

    const tagSet = new Set<string>(tags || []);
    if (voxel.isSupport) tagSet.add('support');

    const entity: SemanticEntity = {
      voxelId: voxel.id,
      category: resolvedCategory,
      tags: tagSet,
      properties: {
        height: voxel.pos.y,
        layerName: resolvedLayerName,
        materialName: voxel.materialId || 'unknown',
      },
    };

    this.entities.set(voxel.id, entity);
  }

  /**
   * 移除體素
   */
  removeVoxel(id: string): void {
    this.entities.delete(id);
  }

  /**
   * 更新體素
   */
  updateVoxel(id: string, patch: Partial<VoxelInput>): void {
    const entity = this.entities.get(id);
    if (!entity) return;

    if (patch.materialId !== undefined) {
      entity.properties.materialName = patch.materialId;
      entity.category = inferCategory(patch.materialId, entity.properties.layerName);
    }

    if (patch.layerId !== undefined) {
      const ln = this.layerNames.get(patch.layerId) || patch.layerId;
      entity.properties.layerName = ln;
      entity.category = inferCategory(entity.properties.materialName, ln);
    }

    if (patch.pos !== undefined) {
      entity.properties.height = patch.pos.y;
    }

    if (patch.isSupport !== undefined) {
      if (patch.isSupport) entity.tags.add('support');
      else entity.tags.delete('support');
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  標籤 API
  // ═══════════════════════════════════════════════════════════

  addTag(voxelId: string, tag: string): void {
    const e = this.entities.get(voxelId);
    if (e) e.tags.add(tag);
  }

  removeTag(voxelId: string, tag: string): void {
    const e = this.entities.get(voxelId);
    if (e) e.tags.delete(tag);
  }

  setCategory(voxelId: string, category: VoxelCategory): void {
    const e = this.entities.get(voxelId);
    if (e) e.category = category;
  }

  // ═══════════════════════════════════════════════════════════
  //  查詢 API
  // ═══════════════════════════════════════════════════════════

  queryByCategory(category: VoxelCategory): SemanticEntity[] {
    const result: SemanticEntity[] = [];
    this.entities.forEach(e => {
      if (e.category === category) result.push(e);
    });
    return result;
  }

  queryByTag(tag: string): SemanticEntity[] {
    const result: SemanticEntity[] = [];
    this.entities.forEach(e => {
      if (e.tags.has(tag)) result.push(e);
    });
    return result;
  }

  queryByHeightRange(min: number, max: number): SemanticEntity[] {
    const result: SemanticEntity[] = [];
    this.entities.forEach(e => {
      if (e.properties.height >= min && e.properties.height <= max) result.push(e);
    });
    return result;
  }

  getEntity(voxelId: string): SemanticEntity | undefined {
    return this.entities.get(voxelId);
  }

  getStats(): SemanticStats {
    let structure = 0, decoration = 0, functional = 0;
    const tagCounts: Record<string, number> = {};

    this.entities.forEach(e => {
      switch (e.category) {
        case 'structure': structure++; break;
        case 'decoration': decoration++; break;
        case 'functional': functional++; break;
      }
      e.tags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });

    return { structure, decoration, functional, tagCounts };
  }

  getEntityCount(): number {
    return this.entities.size;
  }

  // ═══════════════════════════════════════════════════════════
  //  規則系統
  // ═══════════════════════════════════════════════════════════

  addRule(rule: DesignRule): void {
    this.rules.set(rule.id, rule);
  }

  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
  }

  getRules(): DesignRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * 評估所有規則
   *
   * 對每個規則，檢查所有實體是否滿足條件。
   * 滿足條件的實體會被加上對應的 tag。
   */
  evaluateAllRules(context: RuleContext): RuleCheckResult[] {
    // 先清除所有規則產生的 tags
    const ruleTags = new Set<string>();
    this.rules.forEach(rule => ruleTags.add(rule.tag));

    this.entities.forEach(entity => {
      ruleTags.forEach(tag => entity.tags.delete(tag));
    });

    // 按 priority 排序
    const sortedRules = Array.from(this.rules.values())
      .sort((a, b) => a.priority - b.priority);

    const results: RuleCheckResult[] = [];

    for (const rule of sortedRules) {
      const matchedIds: string[] = [];

      this.entities.forEach(entity => {
        try {
          if (rule.condition(entity, context)) {
            entity.tags.add(rule.tag);
            matchedIds.push(entity.voxelId);
          }
        } catch (err) {
          console.warn(`[SemanticEngine] Rule "${rule.id}" threw error for voxel ${entity.voxelId}:`, err);
        }
      });

      results.push({
        ruleId: rule.id,
        ruleName: rule.name,
        severity: rule.severity,
        matchedVoxelIds: matchedIds,
        count: matchedIds.length,
      });
    }

    return results;
  }

  // ═══════════════════════════════════════════════════════════
  //  FEA 整合
  // ═══════════════════════════════════════════════════════════

  /**
   * 套用 FEA 結果到語意實體
   *
   * 將每個節點的應力比標記到對應的語意實體上：
   *   - stressRatio > 0.8 → 加上 'overstress' tag
   *   - stressRatio > 1.0 → 加上 'overload' tag
   *   - 其他 → 加上 'safe' tag
   */
  applyFEAResults(feaResult: FEAResultForRules): void {
    this.lastFEAResults = feaResult;

    // 先清除所有 FEA 相關 tags
    this.entities.forEach(entity => {
      entity.tags.delete('overstress');
      entity.tags.delete('overload');
      entity.tags.delete('safe');
    });

    // 標記
    feaResult.nodeStressRatios.forEach((stressRatio, voxelId) => {
      const entity = this.entities.get(voxelId);
      if (!entity) return;

      entity.properties['stressRatio'] = stressRatio;

      if (stressRatio > 1.0) {
        entity.tags.add('overload');
        entity.tags.add('overstress');
      } else if (stressRatio > 0.8) {
        entity.tags.add('overstress');
      } else {
        entity.tags.add('safe');
      }
    });

    console.log(
      `[SemanticEngine] Applied FEA results: ` +
      `${this.queryByTag('overstress').length} overstress, ` +
      `${this.queryByTag('overload').length} overload`
    );
  }

  getLastFEAResults(): FEAResultForRules | null {
    return this.lastFEAResults;
  }

  // ═══════════════════════════════════════════════════════════
  //  清除
  // ═══════════════════════════════════════════════════════════

  clear(): void {
    this.entities.clear();
    this.lastFEAResults = null;
  }

  clearEntities(): void {
    this.entities.clear();
    this.lastFEAResults = null;
  }
}

// ═══════════════════════════════════════════════════════════════
//  全域單例
// ═══════════════════════════════════════════════════════════════

export const semanticEngine = new SemanticEngine();
