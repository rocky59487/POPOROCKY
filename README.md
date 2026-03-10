# FastDesign - 次世代 3D 敏捷設計系統

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
| 體素引擎 | `VoxelEngine.ts` | Chunk-based Octree 空間管理、體素 CRUD |
| 語意引擎 | `SemanticEngine.ts` | Levenshtein 模糊匹配、命令解析 |
| 負載引擎 | `LoadPhysicsEngine.ts` | 延遲運算、直接剛度方法應力計算 |
| 圖層引擎 | `EngineManager.ts` | BIM 屬性深度、物理剔除 |
| 代理人引擎 | `EngineManager.ts` | AI Co-Pilot、人類權威覆寫 |
| 多人引擎 | `EngineManager.ts` | Delta 同步、主機權威模式 |
| 貼圖引擎 | `EngineManager.ts` | SD REST API、應力熱圖 |
| LOD 引擎 | `EngineManager.ts` | 貪婪網格、視錐剔除 |

### 演算法管線（三階段）

**第一階段 - 邊界拓撲提取 (Dual Contouring)**：使用 QEF 最小化求解頂點位置，SVD 分解保證穩定性，Lagrange 乘數處理 sharp 約束。

**第二階段 - 共面簡化與特徵線辨識 (PCA)**：區域生長法法向分群，MLS 平滑降噪，二面角閾值特徵線提取。

**第三階段 - NURBS 參數擬合**：向心參數化 (Centripetal Parameterization)，鉗位節點向量 (Clamped Knot Vector)，Trust-Region Reflective 求解器，Cox-de Boor 遞迴基底函數。

## 技術棧

| 技術 | 版本 | 用途 |
|------|------|------|
| Electron | 36.x | 桌面端框架 |
| React | 19.x | UI 框架 |
| TypeScript | 5.x | 型別安全 |
| Three.js | 0.173.x | 3D 渲染 |
| React Three Fiber | 9.x | React 3D 整合 |
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
│   │   ├── main.ts              # Electron 主進程
│   │   └── preload.ts           # Preload 腳本
│   └── renderer/
│       ├── App.tsx              # 主應用程式組件
│       ├── index.tsx            # React 入口
│       ├── components/
│       │   ├── Viewport3D.tsx   # 3D 視口 (Three.js)
│       │   ├── Toolbar.tsx      # 工具列
│       │   ├── LayerPanel.tsx   # 圖層面板
│       │   ├── PropertiesPanel.tsx # 屬性面板
│       │   ├── ConsolePanel.tsx # 控制台/管線面板
│       │   └── StatusBar.tsx    # 狀態列
│       ├── engines/
│       │   ├── EventBus.ts      # 星狀拓撲事件匯流排
│       │   ├── VoxelEngine.ts   # 體素引擎
│       │   ├── SemanticEngine.ts # 語意引擎
│       │   ├── LoadPhysicsEngine.ts # 負載物理引擎
│       │   ├── SurfaceEngine.ts # 曲面引擎整合
│       │   └── EngineManager.ts # 引擎管理器
│       ├── pipeline/
│       │   └── VoxelToNURBS.ts  # 體素→NURBS 三階段管線
│       ├── store/
│       │   ├── AppStore.ts      # 全域狀態管理
│       │   └── DataModels.ts    # 資料模型定義
│       └── styles/
│           └── global.css       # 全域樣式
├── public/
│   └── index.html
├── dist/                        # 構建輸出
├── package.json
├── tsconfig.json
├── webpack.main.config.js
└── webpack.renderer.config.js
```

## 功能特色

**體素建模**：支援放置、刪除、選取體素，即時 3D 視覺化。

**語意標籤系統**：Sharp（銳利）、Smooth Curve（平滑曲線）、Fillet R（圓角）三種語意標籤，影響 NURBS 轉換結果。

**演算法管線**：一鍵執行體素→NURBS 轉換，三階段管線即時進度顯示。

**曲面引擎整合**：流形驗證、TRF 邊界保護、節點向量驗證、Rhino 匯出格式生成。

**多圖層管理**：支援圖層新增、可見性切換、物理剔除標記。

**事件匯流排**：星狀拓撲 Event Bus，所有引擎完全解耦，支援即時事件監控。

**語意命令**：支援自然語言命令輸入，Levenshtein 模糊匹配。

## 授權

MIT License
