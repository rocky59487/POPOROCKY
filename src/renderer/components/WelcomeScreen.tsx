import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Box, Layers, FolderOpen, Plus, LayoutTemplate, X } from 'lucide-react';

interface WelcomeScreenProps {
  onClose: () => void;
  onNewProject: () => void;
  onOpenProject: () => void;
  onShowTemplates: () => void;
}

export function WelcomeScreen({ onClose, onNewProject, onOpenProject, onShowTemplates }: WelcomeScreenProps) {
  const recentProjects = useStore(s => s.recentProjects);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const handleClose = () => {
    if (dontShowAgain) {
      localStorage.setItem('fd-hide-welcome', 'true');
    }
    onClose();
  };

  return (
    <div className="welcome-overlay">
      <div className="welcome-screen">
        <button className="welcome-close" onClick={handleClose} title="關閉">
          <X size={18} />
        </button>

        {/* Header */}
        <div className="welcome-header">
          <div className="welcome-logo">
            <Box size={48} strokeWidth={1.5} />
          </div>
          <h1 className="welcome-title">FastDesign</h1>
          <p className="welcome-version">v2.1 — 次世代 3D 敏捷設計系統</p>
          <p className="welcome-subtitle">六大引擎 · AutoCAD 指令 · Minecraft 操作 · FEA 結構分析</p>
        </div>

        {/* Actions */}
        <div className="welcome-actions">
          <button className="welcome-action-btn primary" onClick={() => { onNewProject(); handleClose(); }}>
            <Plus size={20} />
            <div>
              <div className="welcome-action-title">新建專案</div>
              <div className="welcome-action-desc">建立空白專案開始設計</div>
            </div>
          </button>

          <button className="welcome-action-btn" onClick={() => { onOpenProject(); handleClose(); }}>
            <FolderOpen size={20} />
            <div>
              <div className="welcome-action-title">開啟專案</div>
              <div className="welcome-action-desc">載入已儲存的 .fdp 專案檔</div>
            </div>
          </button>

          <button className="welcome-action-btn" onClick={() => { onShowTemplates(); handleClose(); }}>
            <LayoutTemplate size={20} />
            <div>
              <div className="welcome-action-title">從模板開始</div>
              <div className="welcome-action-desc">選擇預設模板快速開始</div>
            </div>
          </button>
        </div>

        {/* Recent Projects */}
        {recentProjects.length > 0 && (
          <div className="welcome-recent">
            <h3 className="welcome-section-title">最近開啟的專案</h3>
            <div className="welcome-recent-list">
              {recentProjects.slice(0, 5).map((p, i) => (
                <button key={i} className="welcome-recent-item" onClick={() => { handleClose(); }}>
                  <Layers size={14} />
                  <span className="welcome-recent-name">{p.name}</span>
                  <span className="welcome-recent-date">
                    {new Date(p.date).toLocaleDateString('zh-TW')}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Keyboard hints */}
        <div className="welcome-hints">
          <span>` 或 : 開啟指令列</span>
          <span>HELP 查看所有指令</span>
          <span>F1 快捷鍵參考</span>
        </div>

        {/* Don't show again */}
        <label className="welcome-checkbox">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={e => setDontShowAgain(e.target.checked)}
          />
          不再顯示
        </label>
      </div>
    </div>
  );
}
