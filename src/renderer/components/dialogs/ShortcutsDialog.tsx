import React from 'react';
import { X } from 'lucide-react';

interface Props { open: boolean; onClose: () => void; }

const sections = [
  {
    title: '視圖控制',
    shortcuts: [
      { key: '右鍵拖拽', desc: '旋轉視圖' },
      { key: '中鍵拖拽', desc: '平移視圖' },
      { key: '滾輪', desc: '縮放' },
      { key: 'F', desc: '聚焦選取物件' },
      { key: 'Num 1', desc: '前視圖' },
      { key: 'Num 3', desc: '右視圖' },
      { key: 'Num 7', desc: '頂視圖' },
      { key: 'Num 5', desc: '切換透視/正交' },
    ],
  },
  {
    title: '工具',
    shortcuts: [
      { key: 'Q / V', desc: '選取工具' },
      { key: 'B', desc: '放置體素' },
      { key: 'E', desc: '橡皮擦' },
      { key: 'P', desc: '上色工具' },
      { key: 'W / ⇧B', desc: '體素刷' },
      { key: 'G', desc: 'Glue 黏合工具' },
      { key: 'M', desc: '測量工具' },
      { key: '⇧F', desc: '填充工具' },
      { key: '⇧S', desc: '平滑工具' },
      { key: '⇧C', desc: '雕刻工具' },
    ],
  },
  {
    title: '編輯',
    shortcuts: [
      { key: 'Ctrl+Z', desc: '復原' },
      { key: 'Ctrl+Y', desc: '重做' },
      { key: 'Delete', desc: '刪除選取' },
      { key: 'Ctrl+A', desc: '全選' },
      { key: 'Escape', desc: '取消選取' },
    ],
  },
  {
    title: '指令列',
    shortcuts: [
      { key: ': 或 `', desc: '聚焦指令列' },
      { key: 'Tab', desc: '補全指令' },
      { key: '↑ ↓', desc: '瀏覽歷史' },
      { key: 'Enter', desc: '執行指令' },
      { key: 'Escape', desc: '關閉指令列' },
    ],
  },
  {
    title: '第一人稱模式',
    shortcuts: [
      { key: '點擊視口', desc: '進入第一人稱' },
      { key: 'W/A/S/D', desc: '移動' },
      { key: 'Shift', desc: '加速 (x3)' },
      { key: 'Space', desc: '上升' },
      { key: 'Ctrl', desc: '下降' },
      { key: 'Escape', desc: '退出第一人稱' },
    ],
  },
  {
    title: '檔案',
    shortcuts: [
      { key: 'Ctrl+N', desc: '新建專案' },
      { key: 'Ctrl+S', desc: '儲存專案' },
      { key: 'Ctrl+O', desc: '開啟專案' },
      { key: 'Ctrl+⇧+S', desc: '截圖' },
    ],
  },
];

export function ShortcutsDialog({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={e => e.stopPropagation()} style={{ minWidth: 560, maxWidth: 640 }}>
        <div className="dialog-header">
          <h2>快捷鍵</h2>
          <button className="dialog-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="dialog-body" style={{ maxHeight: '70vh' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {sections.map(section => (
              <div key={section.title}>
                <div style={{
                  fontSize: 11, fontWeight: 600, color: 'var(--accent)',
                  textTransform: 'uppercase', letterSpacing: 0.5,
                  marginBottom: 6, paddingBottom: 4,
                  borderBottom: '1px solid var(--border)',
                }}>
                  {section.title}
                </div>
                {section.shortcuts.map(s => (
                  <div key={s.key} className="shortcut-item">
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{s.desc}</span>
                    <span className="shortcut-key">{s.key}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
