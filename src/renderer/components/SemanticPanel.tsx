import React, { useCallback } from 'react';
import { useStore, VoxelCategory } from '../store/useStore';
import {
  Layers, Tag, AlertTriangle, AlertCircle, Info,
  CheckCircle, Filter, RefreshCw, Shield,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════
//  SemanticPanel - 語意引擎面板
//
//  顯示：
//    1. 語意統計：structure / decoration / functional 數量
//    2. 各 tag 數量（用小 badge 顯示）
//    3. 規則檢查結果列表
//    4. Filter 工具：勾選框過濾 category 或 tag
// ═══════════════════════════════════════════════════════════════

const CATEGORY_LABELS: Record<VoxelCategory, string> = {
  structure: '結構',
  decoration: '裝飾',
  functional: '功能',
};

const CATEGORY_COLORS: Record<VoxelCategory, string> = {
  structure: '#ef4444',
  decoration: '#f59e0b',
  functional: '#3b82f6',
};

const SEVERITY_ICONS: Record<string, React.ReactNode> = {
  error: <AlertCircle size={12} style={{ color: '#ef4444' }} />,
  warning: <AlertTriangle size={12} style={{ color: '#f59e0b' }} />,
  info: <Info size={12} style={{ color: '#3b82f6' }} />,
};

export function SemanticPanel() {
  const stats = useStore(s => s.semanticStats);
  const ruleResults = useStore(s => s.ruleCheckResults);
  const filter = useStore(s => s.semanticFilter);
  const runRuleCheck = useStore(s => s.runRuleCheck);
  const refreshStats = useStore(s => s.refreshSemanticStats);
  const setFilter = useStore(s => s.setSemanticFilter);
  const selectVoxels = useStore(s => s.selectVoxels);

  const totalVoxels = stats.structure + stats.decoration + stats.functional;

  const handleCategoryFilter = useCallback((cat: VoxelCategory | null) => {
    setFilter({ category: cat, tag: filter.tag });
  }, [filter.tag, setFilter]);

  const handleTagFilter = useCallback((tag: string | null) => {
    setFilter({ category: filter.category, tag });
  }, [filter.category, setFilter]);

  const handleRuleClick = useCallback((matchedIds: string[]) => {
    if (matchedIds.length > 0) {
      selectVoxels(matchedIds);
    }
  }, [selectVoxels]);

  const handleRefresh = useCallback(() => {
    refreshStats();
    runRuleCheck();
  }, [refreshStats, runRuleCheck]);

  // 排序 tags：先按數量降序
  const sortedTags = Object.entries(stats.tagCounts)
    .sort((a, b) => b[1] - a[1]);

  // 有問題的規則數
  const issueCount = ruleResults.filter(r => r.count > 0 && r.severity !== 'info').length;

  return (
    <div className="semantic-panel" style={panelStyle}>
      {/* 標題列 */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Shield size={14} />
          <span style={{ fontWeight: 600, fontSize: 12 }}>語意引擎</span>
          {issueCount > 0 && (
            <span style={issueBadgeStyle}>{issueCount}</span>
          )}
        </div>
        <button onClick={handleRefresh} style={refreshBtnStyle} title="重新檢查">
          <RefreshCw size={12} />
        </button>
      </div>

      {/* 分類統計 */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>
          <Layers size={11} />
          <span>分類統計</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 10, marginLeft: 'auto' }}>
            共 {totalVoxels} 個
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(Object.keys(CATEGORY_LABELS) as VoxelCategory[]).map(cat => {
            const count = stats[cat];
            const isActive = filter.category === cat;
            return (
              <button
                key={cat}
                onClick={() => handleCategoryFilter(isActive ? null : cat)}
                style={{
                  ...catBtnStyle,
                  borderColor: isActive ? CATEGORY_COLORS[cat] : 'transparent',
                  background: isActive ? `${CATEGORY_COLORS[cat]}20` : 'var(--bg-tertiary)',
                }}
              >
                <span style={{ color: CATEGORY_COLORS[cat], fontSize: 11, fontWeight: 600 }}>
                  {count}
                </span>
                <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                  {CATEGORY_LABELS[cat]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 標籤 */}
      {sortedTags.length > 0 && (
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>
            <Tag size={11} />
            <span>標籤</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {sortedTags.map(([tag, count]) => {
              const isActive = filter.tag === tag;
              return (
                <button
                  key={tag}
                  onClick={() => handleTagFilter(isActive ? null : tag)}
                  style={{
                    ...tagBadgeStyle,
                    borderColor: isActive ? 'var(--accent)' : 'transparent',
                    background: isActive ? 'var(--accent-bg)' : 'var(--bg-tertiary)',
                  }}
                >
                  {tag}
                  <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 3 }}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 規則檢查結果 */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>
          <CheckCircle size={11} />
          <span>設計規則</span>
          <button
            onClick={() => handleCategoryFilter(null)}
            style={{ ...clearFilterBtnStyle, marginLeft: 'auto' }}
            title="清除篩選"
          >
            <Filter size={10} />
          </button>
        </div>
        {ruleResults.length === 0 ? (
          <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '4px 0' }}>
            尚未執行規則檢查
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {ruleResults.map(r => (
              <button
                key={r.ruleId}
                onClick={() => handleRuleClick(r.matchedVoxelIds)}
                style={{
                  ...ruleRowStyle,
                  opacity: r.count === 0 ? 0.5 : 1,
                }}
                title={`點擊高亮 ${r.count} 個體素`}
              >
                {SEVERITY_ICONS[r.severity]}
                <span style={{ flex: 1, textAlign: 'left', fontSize: 10 }}>
                  {r.ruleName}
                </span>
                <span style={{
                  fontSize: 9,
                  color: r.count > 0 ? '#ef4444' : 'var(--text-muted)',
                  fontWeight: r.count > 0 ? 600 : 400,
                }}>
                  {r.count}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  Styles
// ═══════════════════════════════════════════════════════════════

const panelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 0,
  background: 'var(--bg-secondary)',
  borderRadius: 6,
  border: '1px solid var(--border)',
  overflow: 'hidden',
  fontSize: 11,
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '6px 8px',
  borderBottom: '1px solid var(--border)',
  background: 'var(--bg-tertiary)',
};

const sectionStyle: React.CSSProperties = {
  padding: '6px 8px',
  borderBottom: '1px solid var(--border)',
};

const sectionTitleStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 10,
  fontWeight: 600,
  color: 'var(--text-secondary)',
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};

const catBtnStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '4px 6px',
  borderRadius: 4,
  border: '1px solid transparent',
  cursor: 'pointer',
  transition: 'all 0.15s',
  background: 'var(--bg-tertiary)',
};

const tagBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '1px 6px',
  borderRadius: 8,
  fontSize: 9,
  border: '1px solid transparent',
  cursor: 'pointer',
  transition: 'all 0.15s',
  color: 'var(--text-primary)',
};

const ruleRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '3px 4px',
  borderRadius: 3,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  transition: 'background 0.15s',
  width: '100%',
  color: 'var(--text-primary)',
};

const refreshBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 3,
  borderRadius: 3,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  color: 'var(--text-muted)',
};

const issueBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 14,
  height: 14,
  borderRadius: 7,
  background: '#ef4444',
  color: '#fff',
  fontSize: 9,
  fontWeight: 700,
  padding: '0 3px',
};

const clearFilterBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: 2,
  borderRadius: 2,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  color: 'var(--text-muted)',
};
