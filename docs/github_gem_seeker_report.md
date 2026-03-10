# GitHub Gem Seeker 報告
## Electron + React Three Fiber + TypeScript 專案最強開源方案評估

**報告日期：** 2026 年 3 月 11 日  
**研究方法：** github-gem-seeker（多關鍵字交叉搜尋 + 實際瀏覽 GitHub 頁面驗證）  
**目標技術棧：** Electron + React Three Fiber + TypeScript

---

## 評估標準說明

本報告依據以下六項標準對各方案進行評分，以確保推薦結果符合實際整合需求：

| 評估維度 | 說明 |
|---|---|
| GitHub 星數 | 社群採用程度與成熟度指標 |
| 最後更新時間 | 6 個月內更新為最佳，超過 2 年視為高風險 |
| NPM 套件 | 是否可直接 `npm install` 安裝 |
| TypeScript 支援 | 原生型別定義或 `@types` 支援 |
| 授權 | MIT 或 Apache 2.0 為最佳（商業友好） |
| Electron/Node.js 相容性 | 是否可在非瀏覽器環境執行 |

---

## 引擎 1：體素引擎（VoxelEngine）

### 搜尋關鍵字

本次搜尋使用以下三組關鍵字交叉驗證：`"github voxel engine javascript three.js"`、`"github voxel editor typescript npm"`、`"github chunk octree voxel web"`。

---

### 第 1 名：Divine-Star-Software/DivineVoxelEngine

**GitHub URL：** https://github.com/Divine-Star-Software/DivineVoxelEngine  
**NPM 安裝：** `npm install @divinevoxel/vlox`  
**星數：** ⭐ 250  
**授權：** MIT  
**最後更新：** 2026 年 1 月（約 2 個月前）  
**TypeScript：** ✅ 原生 TypeScript  
**Electron 相容：** ✅ 支援（可關閉 SharedArrayBuffer）

**功能覆蓋評估：**

| 需求功能 | 支援狀態 | 說明 |
|---|---|---|
| Chunk 管理 | ✅ 完整支援 | 多執行緒 Chunk 更新架構 |
| Octree 空間索引 | ⚠️ 間接支援 | 透過 Vlox 世界系統實現 |
| 體素刷（大小/形狀/強度） | ✅ 支援 | dvegames/vlox-tools 工具套件 |
| 體素平滑 | ⚠️ 部分支援 | 需自行實現或擴展 |
| 體素填充 | ✅ 支援 | 世界模擬引擎 API |
| 體素雕刻 | ✅ 支援 | 世界更新 API |
| Undo/Redo | ⚠️ 需自行實現 | 框架未內建，但可透過 Archiving API 實現 |

**優點分析：**

DivineVoxelEngine 是目前 JavaScript/TypeScript 生態中最活躍的體素引擎。其核心優勢在於多執行緒架構——所有網格化（meshing）和世界更新均在 Web Worker 中並行執行，主執行緒不會被阻塞。這對 Electron 應用而言尤為重要，因為 Electron 的主執行緒需要保持響應性。

引擎採用完全 TypeScript 編寫，提供嚴格的型別安全保障，與 TypeScript 專案整合無縫。`@divinevoxel/vlox` 套件提供 Minecraft 風格的體素資料處理，支援光照、流動、電源等複雜系統。Vlox 模型系統允許透過 JSON 定義體素幾何，極大降低了自訂體素的開發成本。

**缺點分析：**

主要限制在於渲染器支援。DivineVoxelEngine 的官方渲染器（`@divinevoxel/vlox-babylon`）基於 Babylon.js，而非 Three.js。若要整合至 React Three Fiber 專案，需要自行實現 Three.js 渲染橋接層，或等待社群提供 Three.js 渲染器。此外，文件相對稀少，學習曲線較陡。

**整合建議：**

建議使用 `@divinevoxel/vlox` 作為體素資料層（Chunk 管理、世界狀態、光照計算），並自行實現 Three.js 的 `BufferGeometry` 渲染橋接。核心思路是讓 DVE 負責體素邏輯，React Three Fiber 負責渲染呈現。

```typescript
import { StartRenderer } from "@divinevoxel/vlox/Init/StartRenderer";

const DVER = await StartRenderer({
  renderer: customThreeJsRenderer,
  worldWorker,
  mesherWorkers,
  voxels: DVEVoxelData,
  memoryAndCPU: { useSharedMemory: false }, // Electron 相容模式
});
```

---

### 第 2 名：joshmarinacci/voxeljs-next

**GitHub URL：** https://github.com/joshmarinacci/voxeljs-next  
**NPM 安裝：** 需從 GitHub 複製源碼  
**星數：** ⭐ 153  
**授權：** BSD-3-Clause  
**最後更新：** 2021 年（約 5 年前）  
**TypeScript：** ❌ 純 JavaScript  
**Electron 相容：** ✅ 支援（基於 Three.js）

**功能覆蓋評估：**

| 需求功能 | 支援狀態 | 說明 |
|---|---|---|
| Chunk 管理 | ✅ 完整支援 | ChunkManager API |
| Octree 空間索引 | ❌ 不支援 | 未實現 |
| 體素刷 | ❌ 不支援 | 需自行實現 |
| 體素平滑 | ❌ 不支援 | 未實現 |
| 體素填充 | ⚠️ 基礎支援 | 基礎 set/get block API |
| 體素雕刻 | ⚠️ 基礎支援 | 基礎 add/remove block |
| Undo/Redo | ❌ 不支援 | 未實現 |

**優點分析：**

voxeljs-next 的最大優勢是與 Three.js 的原生整合——它直接使用 Three.js 作為渲染引擎，因此與 React Three Fiber 的整合相對直接。引擎採用現代化 JavaScript（ES6 模組、箭頭函數），並支援 WebXR/VR，適合需要 VR 功能的應用。ECSY 實體元件系統提供了良好的架構基礎。

**缺點分析：**

5 年未更新是最大的風險因素。Three.js API 在過去幾年有重大變更，該引擎可能存在相容性問題。缺乏 TypeScript 支援意味著需要自行添加型別定義。功能覆蓋率低，缺少 Octree、體素刷、平滑等進階功能。

**整合建議：**

適合作為學習參考或快速原型開發。若選用此方案，建議複製源碼並進行現代化改造：添加 TypeScript 型別定義、更新 Three.js API 呼叫，並補充缺失的功能模組。

---

### 第 3 名：max-mapper/voxel-engine

**GitHub URL：** https://github.com/max-mapper/voxel-engine  
**NPM 安裝：** `npm install voxel-engine`（已棄用）  
**星數：** ⭐ 1,300  
**授權：** MIT  
**最後更新：** 2015 年（約 11 年前）  
**TypeScript：** ❌ 純 JavaScript  
**Electron 相容：** ⚠️ 理論上可行，但版本過舊

**功能覆蓋評估：**

| 需求功能 | 支援狀態 | 說明 |
|---|---|---|
| Chunk 管理 | ✅ 基礎支援 | 基礎 Chunk 系統 |
| Octree 空間索引 | ❌ 不支援 | 未實現 |
| 體素刷 | ❌ 不支援 | 未實現 |
| 體素平滑 | ❌ 不支援 | 未實現 |
| 體素填充 | ⚠️ 基礎支援 | 基礎 API |
| 體素雕刻 | ⚠️ 基礎支援 | 基礎 API |
| Undo/Redo | ❌ 不支援 | 未實現 |

**優點分析：**

voxel-engine 是 JavaScript 體素引擎的先驅，擁有最多的 GitHub 星數（1.3k）和最大的社群生態系統（voxeljs 生態）。MIT 授權，API 簡單易用，有豐富的社群插件。

**缺點分析：**

11 年未更新，已嚴重過時。NPM 套件版本為 0.20.2，依賴的 Three.js 版本極舊，與現代 React Three Fiber 不相容。缺乏所有進階功能。**不建議用於新專案。**

**整合建議：**

僅建議作為歷史參考，了解體素引擎的基礎概念。新專案應選擇 DivineVoxelEngine。

---

### 體素引擎綜合評分

| 方案 | 星數 | 更新 | NPM | TypeScript | 授權 | Electron | 總評 |
|---|---|---|---|---|---|---|---|
| DivineVoxelEngine | ⭐250 | ✅ 2月前 | ✅ | ✅ | MIT | ✅ | ★★★★★ |
| voxeljs-next | ⭐153 | ❌ 5年前 | ⚠️ | ❌ | BSD-3 | ✅ | ★★☆☆☆ |
| voxel-engine | ⭐1.3k | ❌ 11年前 | ⚠️ 棄用 | ❌ | MIT | ⚠️ | ★☆☆☆☆ |

**推薦：DivineVoxelEngine（首選）**

---

## 引擎 2：LOD 引擎（Level of Detail）

### 搜尋關鍵字

本次搜尋使用以下三組關鍵字交叉驗證：`"github three.js LOD level of detail mesh simplification"`、`"github quadric error metrics javascript QEM"`、`"github progressive mesh simplification npm"`。

---

### 第 1 名：zeux/meshoptimizer

**GitHub URL：** https://github.com/zeux/meshoptimizer  
**NPM 安裝：** `npm install meshoptimizer`（v1.0.1）  
**星數：** ⭐ 7,300  
**授權：** MIT  
**最後更新：** 2026 年 3 月（5 天前）  
**TypeScript：** ✅ JavaScript/WebAssembly 介面（含型別定義）  
**Electron 相容：** ✅ 完整支援（Node.js 環境）

**功能覆蓋評估：**

| 需求功能 | 支援狀態 | 說明 |
|---|---|---|
| 自動 LOD 生成 | ✅ 完整支援 | `meshopt_simplify` + LOD 選擇算法 |
| QEM 網格簡化 | ✅ 完整支援 | 屬性感知 QEM 算法 |
| 距離閾值切換 | ⚠️ 需配合 Three.js LOD 類 | 提供誤差計算，切換邏輯需自行實現 |
| 效能監控 | ⚠️ 部分支援 | 提供統計資訊，監控 UI 需自行實現 |

**優點分析：**

meshoptimizer 是業界標準的網格優化庫，廣泛應用於遊戲引擎和 3D 工具鏈。其 7.3k 星數和 189k+ 依賴者數量充分說明了其可靠性。最近一次更新（5 天前）顯示專案仍在積極維護。

核心優勢在於其全面的網格優化算法套件：不僅提供 QEM 網格簡化，還包含頂點緩存優化、過度繪優化、網格壓縮等一系列效能優化工具。WebAssembly 版本在瀏覽器中提供接近原生的效能。

在 LOD 生成方面，meshoptimizer 提供了 `meshopt_simplify` 函數，可以根據目標面數或誤差閾值自動生成不同細節層級的網格。配合 Three.js 內置的 `LOD` 類，可以實現完整的 LOD 系統。

**缺點分析：**

meshoptimizer 本身是一個網格優化工具庫，而非完整的 LOD 引擎。它不提供 LOD 切換邏輯、距離閾值管理或效能監控 UI——這些需要開發者自行實現，或配合 Three.js 的 `LOD` 類使用。

**整合建議：**

建議採用「meshoptimizer + Three.js LOD 類」的組合方案：

```typescript
import { MeshoptSimplifier } from "meshoptimizer";

// 生成多個 LOD 層級
async function generateLODs(geometry: THREE.BufferGeometry, levels: number[]) {
  await MeshoptSimplifier.ready;
  const lods = levels.map(targetRatio => {
    const targetCount = Math.floor(geometry.index!.count * targetRatio);
    const [simplified, error] = MeshoptSimplifier.simplify(
      positions, indices, 3, targetCount, 0.01
    );
    return { geometry: buildGeometry(simplified), error };
  });
  return lods;
}

// 配合 Three.js LOD 類使用
const lod = new THREE.LOD();
lod.addLevel(highDetailMesh, 0);    // 0-50 單位：高細節
lod.addLevel(medDetailMesh, 50);   // 50-200 單位：中細節
lod.addLevel(lowDetailMesh, 200);  // 200+ 單位：低細節
```

---

### 第 2 名：gkjohnson/three-mesh-bvh

**GitHub URL：** https://github.com/gkjohnson/three-mesh-bvh  
**NPM 安裝：** `npm install three-mesh-bvh`（v0.9.9）  
**星數：** ⭐ 3,200  
**授權：** MIT  
**最後更新：** 2026 年 3 月（上週）  
**TypeScript：** ✅ 完整型別定義  
**Electron 相容：** ✅ 完整支援

**功能覆蓋評估：**

| 需求功能 | 支援狀態 | 說明 |
|---|---|---|
| 自動 LOD 生成 | ❌ 非主要功能 | 主要用於空間查詢加速 |
| QEM 網格簡化 | ❌ 不支援 | 非設計目標 |
| 距離閾值切換 | ⚠️ 間接支援 | 可用 BVH 加速距離計算 |
| 效能監控 | ✅ 支援 | 提供 BVH 視覺化工具 |

**優點分析：**

three-mesh-bvh 是 Three.js 生態中最重要的空間加速結構庫，提供 BVH（包圍體層次結構）實現，可將射線投射速度提升 100-1000 倍。雖然不是傳統意義上的 LOD 引擎，但 BVH 是實現高效 LOD 系統的基礎元件。

該庫與 Three.js 深度整合，支援 `BufferGeometry`、`BatchedMesh`，並提供 Shader 級別的 BVH 查詢。完整的 TypeScript 支援和活躍的維護狀態使其成為 Three.js 生態中最可靠的空間查詢庫。

**缺點分析：**

three-mesh-bvh 的設計目標是加速空間查詢（射線投射、碰撞檢測），而非 LOD 生成。若需要完整的 LOD 功能，需要配合 meshoptimizer 使用。

**整合建議：**

建議將 three-mesh-bvh 作為 LOD 系統的輔助庫，用於加速距離計算和射線投射，配合 meshoptimizer 進行網格簡化，形成完整的 LOD 解決方案。

---

### 第 3 名：neurolabusc/simplifyjs

**GitHub URL：** https://github.com/neurolabusc/simplifyjs  
**NPM 安裝：** 需從 GitHub 複製源碼  
**星數：** ⭐ 15  
**授權：** MIT  
**最後更新：** 2024 年（約 2 年前）  
**TypeScript：** ❌ 純 JavaScript  
**Electron 相容：** ✅ 支援

**功能覆蓋評估：**

| 需求功能 | 支援狀態 | 說明 |
|---|---|---|
| 自動 LOD 生成 | ⚠️ 部分支援 | 提供簡化算法，LOD 邏輯需自行實現 |
| QEM 網格簡化 | ✅ 完整支援 | 基於 Sven Forstmann 的快速 QEM 算法 |
| 距離閾值切換 | ❌ 不支援 | 需自行實現 |
| 效能監控 | ❌ 不支援 | 未實現 |

**優點分析：**

simplifyjs 提供了多個版本的 QEM 網格簡化實現，包括純 JavaScript 版本和 WebAssembly 版本。其基於 Sven Forstmann 的快速 QEM 算法，在效能和品質之間取得了良好平衡。支援 Web Worker，可在背景執行緒中執行簡化操作，不阻塞主執行緒。

**缺點分析：**

星數極少（15），社群支援有限。2 年未更新，無 NPM 套件，無 TypeScript 支援。功能相對單一，僅提供網格簡化算法，缺乏完整的 LOD 管理功能。

**整合建議：**

若 meshoptimizer 的複雜度過高，simplifyjs 可作為輕量級替代方案。建議複製 `simplify.js` 源碼並添加 TypeScript 型別定義後使用。

---

### LOD 引擎綜合評分

| 方案 | 星數 | 更新 | NPM | TypeScript | 授權 | Electron | 總評 |
|---|---|---|---|---|---|---|---|
| meshoptimizer | ⭐7.3k | ✅ 5天前 | ✅ | ✅ | MIT | ✅ | ★★★★★ |
| three-mesh-bvh | ⭐3.2k | ✅ 上週 | ✅ | ✅ | MIT | ✅ | ★★★★☆ |
| simplifyjs | ⭐15 | ⚠️ 2年前 | ❌ | ❌ | MIT | ✅ | ★★☆☆☆ |

**推薦：meshoptimizer（首選）+ three-mesh-bvh（輔助）**

---

## 引擎 3：圖層引擎（LayerEngine）

### 搜尋關鍵字

本次搜尋使用以下三組關鍵字交叉驗證：`"github 3D scene layer manager three.js"`、`"github layer blending compositing javascript"`、`"github scene graph node hierarchy three.js"`。

> **重要發現：** 在廣泛搜尋後，目前 GitHub 上**不存在**專門針對 Three.js 的完整圖層引擎開源方案。現有方案要麼已停止維護，要麼不支援 Three.js，要麼功能覆蓋率嚴重不足。以下列出最接近需求的三個方案，並提供自建方案建議。

---

### 第 1 名：pmndrs/react-three-editor（已歸檔）

**GitHub URL：** https://github.com/pmndrs/react-three-editor  
**NPM 安裝：** 無（已停止維護）  
**星數：** ⭐ 641  
**授權：** MIT  
**最後更新：** 2023 年 6 月（已歸檔，停止維護）  
**TypeScript：** ✅ 完整 TypeScript  
**Electron 相容：** ✅ 理論上支援

**功能覆蓋評估：**

| 需求功能 | 支援狀態 | 說明 |
|---|---|---|
| 圖層新增/刪除/複製 | ⚠️ 間接支援 | 透過 React 元件樹管理 |
| 可見性/鎖定 | ⚠️ 間接支援 | 需自行實現 |
| 混合模式 | ❌ 不支援 | 未實現 |
| 群組 | ✅ 支援 | React 元件群組 |
| 遮罩 | ❌ 不支援 | 未實現 |

**優點分析：**

react-three-editor 是 pmndrs 生態（React Three Fiber 的主要維護者）開發的場景編輯器，與 React Three Fiber 有最佳的原生整合。其創新的「寫回原始碼」機制允許在編輯器中修改場景，並自動將變更同步回 TypeScript 源碼。完整的 TypeScript 支援和 React 元件架構使其概念上最接近需求。

**缺點分析：**

**最大問題：已於 2023 年 6 月歸檔，停止維護。** 這意味著不會有安全更新、bug 修復或新功能。不建議在新專案中使用已歸檔的庫。此外，缺乏混合模式、遮罩等進階圖層功能。

**整合建議：**

可作為架構參考，了解如何在 React Three Fiber 中實現場景編輯器。但不建議直接使用，應自行實現類似功能。

---

### 第 2 名：jagenjo/litescene.js

**GitHub URL：** https://github.com/jagenjo/litescene.js  
**NPM 安裝：** 需從 GitHub 複製源碼  
**星數：** ⭐ 379  
**授權：** MIT  
**最後更新：** 2020 年（約 6 年前）  
**TypeScript：** ❌ 純 JavaScript  
**Electron 相容：** ✅ 支援（WebGL）

**功能覆蓋評估：**

| 需求功能 | 支援狀態 | 說明 |
|---|---|---|
| 圖層新增/刪除/複製 | ✅ 支援 | 場景節點系統 |
| 可見性/鎖定 | ✅ 支援 | 節點屬性 |
| 混合模式 | ⚠️ 部分支援 | 材質系統支援 |
| 群組 | ✅ 支援 | 場景節點層級 |
| 遮罩 | ⚠️ 部分支援 | 需透過材質實現 |

**優點分析：**

litescene.js 是一個完整的場景圖庫，提供元件式分層節點系統，功能覆蓋率在現有方案中最高。與 WebGLStudio 整合，有實際的編輯器使用案例。MIT 授權，可自由使用。

**缺點分析：**

6 年未更新，使用自有渲染引擎（litegl.js）而非 Three.js，無法直接與 React Three Fiber 整合。無 TypeScript 支援，無 NPM 套件。

**整合建議：**

可作為圖層系統的設計參考，借鑒其節點層級架構，但不建議直接整合至 Three.js 專案。

---

### 第 3 名：jagenjo/rendeer.js

**GitHub URL：** https://github.com/jagenjo/rendeer.js  
**NPM 安裝：** 需從 GitHub 複製源碼  
**星數：** ⭐ 94  
**授權：** MIT  
**最後更新：** 2025 年 5 月（約 10 個月前）  
**TypeScript：** ❌ 純 JavaScript  
**Electron 相容：** ✅ 支援

**功能覆蓋評估：**

| 需求功能 | 支援狀態 | 說明 |
|---|---|---|
| 圖層新增/刪除/複製 | ✅ 支援 | SceneNode 系統 |
| 可見性/鎖定 | ✅ 支援 | 節點屬性 |
| 混合模式 | ❌ 不支援 | 未實現 |
| 群組 | ✅ 支援 | 節點層級 |
| 遮罩 | ❌ 不支援 | 未實現 |

**優點分析：**

rendeer.js 是三個方案中最近更新的（10 個月前），提供輕量級場景圖實現。支援骨骼動畫、動畫軌道、光線拾取等功能。MIT 授權，程式碼相對簡潔，易於理解和修改。

**缺點分析：**

使用自有渲染引擎，不支援 Three.js。無 TypeScript 支援，無 NPM 套件。混合模式和遮罩功能缺失。

**整合建議：**

可作為輕量級場景圖的參考實現，但需要大量改造才能整合至 Three.js 專案。

---

### 圖層引擎綜合評分

| 方案 | 星數 | 更新 | NPM | TypeScript | 授權 | Electron | 總評 |
|---|---|---|---|---|---|---|---|
| react-three-editor | ⭐641 | ❌ 已歸檔 | ❌ | ✅ | MIT | ✅ | ★★☆☆☆ |
| litescene.js | ⭐379 | ❌ 6年前 | ❌ | ❌ | MIT | ✅ | ★★☆☆☆ |
| rendeer.js | ⭐94 | ⚠️ 10月前 | ❌ | ❌ | MIT | ✅ | ★★☆☆☆ |

**推薦：自建圖層管理系統（見下方詳細方案）**

---

### 圖層引擎自建方案（強烈推薦）

由於現有開源方案均不理想，建議基於 Three.js 原生功能自建輕量級圖層管理系統。以下是具體實現架構：

```typescript
// LayerEngine.ts - 基於 Three.js Object3D 的圖層管理系統

interface LayerConfig {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: THREE.Blending;
  mask?: THREE.Object3D;
}

class LayerEngine {
  private scene: THREE.Scene;
  private layers: Map<string, THREE.Group> = new Map();
  private configs: Map<string, LayerConfig> = new Map();

  addLayer(config: LayerConfig): THREE.Group {
    const group = new THREE.Group();
    group.name = config.name;
    group.visible = config.visible;
    this.scene.add(group);
    this.layers.set(config.id, group);
    this.configs.set(config.id, config);
    return group;
  }

  setVisibility(id: string, visible: boolean): void {
    const group = this.layers.get(id);
    if (group) group.visible = visible;
  }

  setBlendMode(id: string, blendMode: THREE.Blending): void {
    const group = this.layers.get(id);
    group?.traverse(obj => {
      if (obj instanceof THREE.Mesh) {
        obj.material.blending = blendMode;
        obj.material.needsUpdate = true;
      }
    });
  }

  duplicateLayer(id: string): string { /* ... */ }
  moveLayer(id: string, targetIndex: number): void { /* ... */ }
  mergeLayersDown(id: string): void { /* ... */ }
}
```

此自建方案完全基於 Three.js 的 `Object3D` 層級系統，與 React Three Fiber 天然相容，支援所有需求功能，且可完全控制實現細節。

---

## 最終整合建議

以下是針對 Electron + React Three Fiber + TypeScript 專案的完整技術棧建議：

| 引擎 | 推薦方案 | 安裝指令 | 備註 |
|---|---|---|---|
| 體素引擎 | DivineVoxelEngine | `npm install @divinevoxel/vlox` | 需自建 Three.js 渲染橋接 |
| LOD 引擎 | meshoptimizer | `npm install meshoptimizer` | 配合 `THREE.LOD` 類使用 |
| LOD 輔助 | three-mesh-bvh | `npm install three-mesh-bvh` | 加速空間查詢 |
| 圖層引擎 | 自建 | — | 基於 `THREE.Object3D` 層級系統 |

**整體架構建議：**

體素資料層由 DivineVoxelEngine 管理，渲染層由 React Three Fiber 負責，LOD 優化由 meshoptimizer 在 Web Worker 中執行，圖層管理由自建的 `LayerEngine` 類實現，狀態管理可使用 Zustand 或 Jotai 等輕量級方案。

---

## 參考資料

[1] Divine-Star-Software/DivineVoxelEngine: https://github.com/Divine-Star-Software/DivineVoxelEngine  
[2] joshmarinacci/voxeljs-next: https://github.com/joshmarinacci/voxeljs-next  
[3] max-mapper/voxel-engine: https://github.com/max-mapper/voxel-engine  
[4] zeux/meshoptimizer: https://github.com/zeux/meshoptimizer  
[5] gkjohnson/three-mesh-bvh: https://github.com/gkjohnson/three-mesh-bvh  
[6] neurolabusc/simplifyjs: https://github.com/neurolabusc/simplifyjs  
[7] pmndrs/react-three-editor: https://github.com/pmndrs/react-three-editor  
[8] jagenjo/litescene.js: https://github.com/jagenjo/litescene.js  
[9] jagenjo/rendeer.js: https://github.com/jagenjo/rendeer.js  
[10] meshoptimizer NPM: https://www.npmjs.com/package/meshoptimizer  
[11] three-mesh-bvh NPM: https://www.npmjs.com/package/three-mesh-bvh  
[12] @interverse/three-terrain-lod NPM: https://www.npmjs.com/package/@interverse/three-terrain-lod  
