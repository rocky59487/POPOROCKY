# FastDesign v1.0 - 次世代 3D 敏捷設計系統

FastDesign 是一個基於 Electron + React + Three.js 的桌面端 3D 設計應用程式，實現了體素建模、語意標籤、NURBS 曲面轉換等核心功能。系統採用星狀拓撲 Event Bus 架構，八大引擎完全解耦，支援延遲運算與即時協作。

## 系統架構

本專案基於三份架構設計文件開發：

| 文件 | 對應模組 | 說明 |
|------|----------|------|
| FastDesign 系統架構藍圖 | 整體架構 | 星狀拓撲 Event Bus、八大引擎、Chunk-based 空間管理 |
| 體素轉 NURBS 演算法管線設計 | 演算法管線 | Dual Contouring、PCA 簡化、Trust-Region Reflective 擬合 |
| 曲面引擎整合 FastDesign 架構 | 曲面引擎 | 流形驗證、TRF 邊界保護、Rhino 匯出 |

### 八大引擎

| 引擎 | 檔案 | 功能 |
|------|------|------|
| 體素引擎 | `VoxelEngine.ts` | Chunk-based Octree 空間管理、體素刷（大小/形狀/強度）、平滑/填充/雕刻模式 |
| 語意引擎 | `SemanticEngine.ts` | 物件標籤系統、語意分類（結構/裝飾/功能）、語意搜尋、屬性繼承、規則引擎 |
| 負載引擎 | `LoadEngine.ts` | 靜態/動態負載計算、應力分析視覺化、安全係數、弱點偵測、報告生成 |
| 圖層引擎 | `EngineManager.ts` | 圖層新增/刪除/複製、可見性/鎖定、混合模式、群組、遮罩、拖拽排序 |
| 代理人引擎 | `EngineManager.ts` | AI 設計建議、自動佈局優化、設計規則檢查、智能填充、對話介面 |
| 多人引擎 | `EngineManager.ts` | 即時協作狀態、用戶游標追蹤、操作歷史同步、衝突解決、權限管理 |
| 貼圖引擎 | `EngineManager.ts` | UV 展開、PBR 材質編輯器（Albedo/Roughness/Metallic/Normal/AO）、程序貼圖生成、烘焙 |
| LOD 引擎 | `EngineManager.ts` | 自動 LOD 生成、層級管理、距離閾值設定、效能監控、批次處理 |

### 演算法管線（三階段）

**第一階段 - 邊界拓撲提取 (Dual Contouring)**：使用 QEF 最小化求解頂點位置，SVD 分解保證穩定性，Lagrange 乘數處理 sharp 約束。

**第二階段 - 共面簡化與特徵線辨識 (PCA)**：區域生長法法向分群，MLS 平滑降噪，二面角閾值特徵線提取。

**第三階段 - NURBS 參數擬合**：向心參數化 (Centripetal Parameterization)，鉗位節點向量 (Clamped Knot Vector)，Trust-Region Reflective 求解器，Cox-de Boor 遞迴基底函數。

## 技術棧

| 技術 | 版本 | 用途 |
|------|------|------|
| Electron | 40.x | 桌面端框架 |
| React | 19.x | UI 框架 |
| TypeScript | 5.x | 型別安全 |
| Three.js | 0.183.x | 3D 渲染 |
| React Three Fiber | 9.x | React 3D 整合 |
| Zustand | 5.x | 狀態管理 |
| Lucide React | 0.577.x | 圖示庫 |
| Webpack | 5.x | 模組打包 |

## 安裝與執行

```bash
# 安裝依賴
npm install

# 構建專案
npm run build

# 啟動應用程式
npm start
```

## 專案結構

```
fastdesign/
├── src/
│   ├── main/
│   │   ├── main.ts                  # Electron 主進程 + 完整選單系統
│   │   └── preload.ts               # Preload 安全橋接
│   └── renderer/
│       ├── App.tsx                   # 主應用程式組件
│       ├── index.tsx                 # React 入口
│       ├── components/
│       │   ├── Toolbar.tsx           # 工具列（所有工具 + 視口模式 + 選取模式）
│       │   ├── StatusBar.tsx         # 狀態列（FPS/記憶體/體素數/三角面數）
│       │   ├── viewport/
│       │   │   ├── Viewport3D.tsx    # 3D 視口容器（單/四視口切換）
│       │   │   └── ViewportScene.tsx # Three.js 場景（體素渲染/NURBS 視覺化）
│       │   ├── panels/
│       │   │   ├── LayerPanel.tsx    # 圖層面板（完整圖層管理）
│       │   │   ├── PropertiesPanel.tsx # 屬性面板（屬性/材質/LOD/負載）
│       │   │   ├── ConsolePanel.tsx  # 控制台/管線監控面板
│       │   │   ├── AgentPanel.tsx    # AI 代理人對話面板
│       │   │   ├── TexturePanel.tsx  # 貼圖引擎面板
│       │   │   └── LoadAnalysisPanel.tsx # 負載分析面板
│       │   └── dialogs/
│       │       ├── PipelineDialog.tsx
│       │       ├── AboutDialog.tsx
│       │       ├── ShortcutsDialog.tsx
│       │       └── LODDialog.tsx
│       ├── engines/
│       │   ├── EventBus.ts           # 星狀拓撲事件匯流排
│       │   ├── VoxelEngine.ts        # 體素引擎（Chunk/Octree/刷/平滑/填充/雕刻）
│       │   ├── SemanticEngine.ts     # 語意引擎（標籤/分類/搜尋/規則）
│       │   ├── LoadEngine.ts         # 負載引擎（應力/安全係數/弱點/報告）
│       │   └── EngineManager.ts      # 引擎管理器（Layer/Agent/Multiplayer/Texture/LOD）
│       ├── pipeline/
│       │   ├── VoxelToNURBS.ts       # 體素→NURBS 三階段管線
│       │   └── SurfaceEngine.ts      # 曲面引擎整合
│       ├── store/
│       │   └── useStore.ts           # Zustand 全域狀態管理
│       └── styles/
│           └── global.css            # 現代化深色主題（玻璃擬態）
├── public/
│   └── index.html
├── package.json
├── tsconfig.json
├── webpack.main.config.js
└── webpack.renderer.config.js
```

## 功能特色

### 現代化 UI 設計
深色主題 + 玻璃擬態 (Glassmorphism) + 流暢動畫，參考 Blender/Figma/Rhino 的 UI 美學。

### 3D 視口
- 多視口切換（單視口/四視口）
- 透視/正交切換
- 線框/實體/渲染模式
- 網格顯示、座標軸
- 選取模式（點/邊/面/物件）

### 體素建模
- 放置、刪除、選取體素
- 體素刷（大小/形狀/強度可調）
- 體素平滑、填充、雕刻模式
- Chunk-based Octree 空間索引

### 演算法管線 UI
- 管線步驟視覺化（進度條 + 每步驟狀態）
- 參數調整面板（QEF 閾值、PCA 容差、NURBS 階數、控制點數）
- 即時預覽（體素 → 邊界網格 → NURBS 曲面）
- 匯出選項（.3dm Rhino、.step、.iges、.obj）

### PBR 材質系統
- Albedo / Roughness / Metallic / Normal / AO 完整 PBR 參數
- 程序貼圖生成（棋盤格/雜訊/漸層）
- 貼圖烘焙

### 負載分析
- 靜態/動態負載計算
- 應力熱圖視覺化
- 安全係數計算
- 結構弱點偵測

### 完整選單系統
File / Edit / View / Engine / Tools / Help，所有功能都有對應快捷鍵。

### 快捷鍵

| 快捷鍵 | 功能 |
|--------|------|
| V | 選取工具 |
| B | 放置體素 |
| E | 刪除體素 |
| P | 上色工具 |
| M | 測量工具 |
| Shift+B | 體素刷 |
| Shift+S | 體素平滑 |
| Shift+F | 體素填充 |
| Shift+C | 雕刻模式 |
| 1/2/3 | Sharp/Smooth/Fillet 語意標籤 |
| 5/6/7 | 線框/實體/渲染模式 |
| G | 切換網格 |
| X | 切換座標軸 |
| Ctrl+R | 執行 NURBS 轉換 |
| Ctrl+N/O/S | 新建/開啟/儲存 |

## 授權

MIT License
