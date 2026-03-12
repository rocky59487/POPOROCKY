import React, { useState } from 'react';
import { X, Mouse, ScrollText, Keyboard } from 'lucide-react';

interface QuickStartOverlayProps {
  onClose: () => void;
}

export function QuickStartOverlay({ onClose }: QuickStartOverlayProps) {
  const [dontShow, setDontShow] = useState(false);

  const handleClose = () => {
    if (dontShow) {
      localStorage.setItem('fd-hide-quickstart', 'true');
    }
    onClose();
  };

  return (
    <div className="quickstart-overlay" onClick={handleClose}>
      <div className="quickstart-card" onClick={e => e.stopPropagation()}>
        <button className="quickstart-close" onClick={handleClose}>
          <X size={16} />
        </button>

        <h2 className="quickstart-title">快速開始</h2>

        <div className="quickstart-sections">
          <div className="quickstart-section">
            <div className="quickstart-section-icon"><Mouse size={16} /></div>
            <div className="quickstart-section-content">
              <div className="quickstart-row">
                <kbd>右鍵拖拽</kbd>
                <span>旋轉視圖</span>
              </div>
              <div className="quickstart-row">
                <kbd>中鍵拖拽</kbd>
                <span>平移視圖</span>
              </div>
              <div className="quickstart-row">
                <kbd>滾輪</kbd>
                <span>縮放</span>
              </div>
            </div>
          </div>

          <div className="quickstart-section">
            <div className="quickstart-section-icon"><Keyboard size={16} /></div>
            <div className="quickstart-section-content">
              <div className="quickstart-row">
                <kbd>W</kbd>
                <span>放置體素</span>
              </div>
              <div className="quickstart-row">
                <kbd>E</kbd>
                <span>刪除體素</span>
              </div>
              <div className="quickstart-row">
                <kbd>G</kbd>
                <span>Glue 黏合工具</span>
              </div>
              <div className="quickstart-row">
                <kbd>Q</kbd>
                <span>選取工具</span>
              </div>
              <div className="quickstart-row">
                <kbd>F</kbd>
                <span>聚焦選取物件</span>
              </div>
            </div>
          </div>

          <div className="quickstart-section">
            <div className="quickstart-section-icon"><ScrollText size={16} /></div>
            <div className="quickstart-section-content">
              <div className="quickstart-row">
                <kbd>` 或 :</kbd>
                <span>開啟指令列</span>
              </div>
              <div className="quickstart-hint">
                試試輸入：<code>BOX 0 0 0 3 3 3</code>
              </div>
              <div className="quickstart-hint">
                分析結構：<code>ANALYZE</code>
              </div>
              <div className="quickstart-hint">
                查看所有指令：<code>HELP</code>
              </div>
            </div>
          </div>
        </div>

        <div className="quickstart-footer">
          <label className="quickstart-checkbox">
            <input type="checkbox" checked={dontShow} onChange={e => setDontShow(e.target.checked)} />
            不再顯示
          </label>
          <button className="quickstart-btn" onClick={handleClose}>
            開始設計
          </button>
        </div>
      </div>
    </div>
  );
}
