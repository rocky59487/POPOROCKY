# GitHub Gem Seeker：四大引擎最強開源方案評估報告

**適用專案：** Electron + React Three Fiber + TypeScript  
**研究方法：** GitHub Gem Seeker（深度搜尋 + 多維評估）  
**報告日期：** 2026 年 3 月  
**評估版本：** v1.0

---

## 評估方法說明

本報告採用 **GitHub Gem Seeker** 方法，針對每個引擎的搜尋關鍵字進行系統性搜尋，並依據以下六項標準對候選方案進行量化評估：

| 評估維度 | 說明 | 權重 |
|---------|------|------|
| GitHub 星數 | 社群認可度與成熟度指標 | 高 |
| 最後更新時間 | 6 個月內為最佳，反映維護活躍度 | 高 |
| npm 套件可用性 | 是否可直接 `npm install` 安裝 | 高 |
| TypeScript 支援 | 原生 `.d.ts` 或 TypeScript 源碼 | 高 |
| 授權類型 | MIT/Apache 為最佳，GPL 需謹慎 | 中 |
| Electron/Node.js 相容性 | 是否可在非瀏覽器環境執行 | 高 |

---

## 引擎 1：語意引擎（SemanticEngine）

> **搜尋目標：** 物件標籤系統、語意分類（結構/裝飾/功能）、語意搜尋、屬性繼承、規則引擎

### 第 1 名：json-rules-engine

**GitHub：** [https://github.com/CacheControl/json-rules-engine](https://github.com/CacheControl/json-rules-engine)

| 指標 | 數值/狀態 |
|------|---------|
| GitHub 星數 | **3,000 ⭐** |
| 最後更新 | 2025 年 11 月（3 個月前）|
| npm 套件 | `npm install json-rules-engine` |
| TypeScript 支援 | ✅ 內建 `types/` 目錄（原生 TypeScript 定義）|
| 授權 | **ISC**（等同 MIT，商業友好）|
| Electron/Node.js | ✅ 完整支援（同構設計，17kb gzip）|

**核心功能說明**

json-rules-engine 是目前 GitHub 上最成熟的 JavaScript 規則引擎，擁有 3,000 星和 1,400+ 個依賴專案。其規則以 JSON 格式表達，支援完整的布林邏輯（ALL/ANY 巢狀運算），並提供非同步事實加載機制。對於語意引擎，可將 3D 物件的屬性（材質類型、幾何形狀、標籤等）作為「事實」輸入，透過預定義規則自動進行語意分類。規則可序列化為 JSON 持久化至資料庫，支援動態加載和修改，實現可配置的語意分類邏輯。

**優點分析**

規則以 JSON 持久化，可儲存於資料庫或設定檔，支援動態加載和修改。無 `eval()` 的安全設計適合企業級應用。17kb 的極小體積對 Electron 應用幾乎無負擔。已有 1,400+ 個生產環境依賴，穩定性極高。ISC 授權無商業限制。

**缺點分析**

不包含物件標籤系統或屬性繼承機制，需要與其他庫（如 bitECS）配合使用。對於複雜的語意搜尋場景，性能可能不如 ECS 架構。

**整合建議**

```typescript
import { Engine } from 'json-rules-engine'

const engine = new Engine()

// 定義語意分類規則：自動識別結構性物件
engine.addRule({
  conditions: {
    all: [{
      fact: 'materialType',
      operator: 'in',
      value: ['concrete', 'steel', 'wood']
    }, {
      fact: 'hasGeometry',
      operator: 'equal',
      value: true
    }]
  },
  event: { type: 'classify-as-structural' }
})

// 對 3D 物件進行語意分類
const { events } = await engine.run({
  materialType: 'concrete',
  hasGeometry: true,
  tags: ['wall', 'load-bearing']
})
// events[0].type === 'classify-as-structural'
```

---

### 第 2 名：bitECS

**GitHub：** [https://github.com/NateTheGreatt/bitECS](https://github.com/NateTheGreatt/bitECS)

| 指標 | 數值/狀態 |
|------|---------|
| GitHub 星數 | **1,300 ⭐** |
| 最後更新 | 2025 年 12 月（3 個月前）|
| npm 套件 | `npm install bitecs` |
| TypeScript 支援 | ✅ 完整 TypeScript 源碼（多個 tsconfig）|
| 授權 | **MPL-2.0**（注意：修改源碼需開源）|
| Electron/Node.js | ✅ 完整支援（含 Node.js setInterval 範例）|

**核心功能說明**

bitECS 是一個為 TypeScript 設計的輕量級 Entity Component System（ECS）庫，僅 5kb（gzip 壓縮後）。其核心設計理念是**資料導向架構**（Data-Oriented Design），透過 SoA（Structure of Arrays）和 AoS（Array of Structures）兩種記憶體佈局模式，實現極高的查詢性能。對於語意引擎而言，ECS 的組件系統天然支援物件標籤（Tag Components）和語意分類，每個 3D 物件可被賦予 `Structural`、`Decorative`、`Functional` 等語意標籤組件，並透過 `query()` 函數進行高效的語意搜尋。已被 Mozilla Hubs、Third Room 等知名 3D 協作平台採用。

**優點分析**

bitECS 的 `query()` API 支援多組件組合查詢，可輕鬆實現「查找所有具備 Structural 標籤且 LoadBearing 屬性為 true 的物件」等語意查詢。序列化功能內建，支援網路同步，與多人協作引擎整合自然。SoA 記憶體佈局對大型場景（數千物件）的查詢性能遠超傳統方法。

**缺點分析**

MPL-2.0 授權要求修改後的源碼必須以相同授權開源，對於商業閉源專案需要謹慎評估（但僅限於修改 bitECS 源碼本身，使用其 API 不受限制）。純 ECS 架構缺乏內建的規則引擎功能，複雜業務邏輯需要額外實現。

**整合建議**

```typescript
import { createWorld, addEntity, addComponent, query } from 'bitecs'

// 定義語意標籤組件（空陣列 = 純標籤）
const Structural: number[] = []
const Decorative: number[] = []
const Functional: number[] = []
const LoadBearing = { value: new Float32Array(10000) }

const world = createWorld({
  components: { Structural, Decorative, Functional, LoadBearing }
})

// 添加 3D 物件實體
const wallEntity = addEntity(world)
addComponent(world, wallEntity, Structural)
addComponent(world, wallEntity, LoadBearing)
LoadBearing.value[wallEntity] = 1.0 // 承重

// 語意搜尋：查詢所有承重結構物件
const structuralQuery = query(world, [Structural, LoadBearing])
for (const eid of structuralQuery) {
  console.log(`承重結構物件 ID: ${eid}`)
}
```

---

### 第 3 名：miniplex

**GitHub：** [https://github.com/hmans/miniplex](https://github.com/hmans/miniplex)

| 指標 | 數值/狀態 |
|------|---------|
| GitHub 星數 | **988 ⭐** |
| 最後更新 | 2023 年（3 年前）|
| npm 套件 | `npm install miniplex` |
| TypeScript 支援 | ✅ 完整 TypeScript 源碼 |
| 授權 | **MIT** |
| Electron/Node.js | ✅ 完整支援 |

**核心功能說明**

miniplex 是一個以開發者體驗為優先的 ECS 庫，實體（Entity）就是普通的 JavaScript 物件，組件就是物件屬性。這種設計使其與 React Three Fiber 的宣告式風格高度契合，並提供 `miniplex-react` 套件實現 React 整合。其類型系統基於 TypeScript 泛型，提供完整的編譯時類型安全。

**優點分析**

與 React Three Fiber 的整合是三個方案中最自然的，`miniplex-react` 提供了 React hooks 和組件，可直接在 JSX 中管理實體。MIT 授權無商業限制。實體即物件的設計使調試和序列化更直觀。

**缺點分析**

最後更新已是 3 年前，維護狀態存疑。相比 bitECS，性能較低（無 SoA 優化）。星數不足 1,000，社群規模較小。

**整合建議**

```typescript
import { World } from 'miniplex'

type SceneEntity = {
  position: { x: number; y: number; z: number }
  semanticTag?: 'structural' | 'decorative' | 'functional'
  material?: string
  loadBearing?: boolean
}

const world = new World<SceneEntity>()

// 添加物件
world.add({ position: { x: 0, y: 0, z: 0 }, semanticTag: 'structural', loadBearing: true })

// 查詢所有結構性物件
const structuralEntities = world.with('semanticTag', 'loadBearing')
```

---

### 語意引擎評估總表

| 方案 | 星數 | 更新 | TS | npm | 授權 | Electron | 綜合評分 |
|------|------|------|----|----|------|---------|---------|
| **json-rules-engine** | 3k | 3 個月前 | ✅ | ✅ | ISC | ✅ | ⭐⭐⭐⭐⭐ |
| **bitECS** | 1.3k | 3 個月前 | ✅ | ✅ | MPL-2.0 | ✅ | ⭐⭐⭐⭐ |
| **miniplex** | 988 | 3 年前 | ✅ | ✅ | MIT | ✅ | ⭐⭐⭐ |

> **推薦組合：** `json-rules-engine`（規則引擎層）+ `bitECS`（物件標籤與查詢層）。兩者互補，json-rules-engine 處理複雜業務規則與語意分類邏輯，bitECS 提供高效的物件標籤系統和語意查詢。

---

## 引擎 2：負載/FEA 引擎（LoadEngine / Structural Analysis）

> **搜尋目標：** 桁架/有限元素分析、應力計算、視覺化熱圖

### 第 1 名：FEAScript-core

**GitHub：** [https://github.com/FEAScript/FEAScript-core](https://github.com/FEAScript/FEAScript-core)

| 指標 | 數值/狀態 |
|------|---------|
| GitHub 星數 | **58 ⭐** |
| 最後更新 | **2026 年 3 月（本週）** |
| npm 套件 | `npm install feascript mathjs plotly.js` |
| TypeScript 支援 | ✅ tsconfig.json 存在，ES 模組設計 |
| 授權 | **MIT** |
| Electron/Node.js | ✅ 完整支援（Node.js 範例完整）|

**核心功能說明**

FEAScript 是目前 JavaScript 生態系中**唯一仍在積極開發的有限元素分析庫**，由 FEAScript 組織維護，2026 年 3 月仍有提交記錄（最新版 v0.2.0）。支援的物理模型包括：

- **Stokes 流體（蠕流）**：可用於流體壓力分析
- **前沿傳播（Front Propagation）**：用於波前模擬
- **熱傳導（Heat Conduction）**：可類比靜力學問題（溫度 ↔ 位移，熱流 ↔ 應力）

網格系統支援 1D/2D 自動生成和 Gmsh `.msh` 格式匯入。求解器包括 Frontal、Jacobi（CPU/WebGPU）和 LU 分解，並支援 Newton-Raphson 非線性求解。Web Worker 支援確保計算不阻塞 UI 執行緒。

**優點分析**

FEAScript 是 JavaScript FEA 領域中最活躍的專案，2026 年 3 月仍有更新，且已發布 v0.2.0 穩定版。MIT 授權無商業限制。Node.js 支援完整，可在 Electron 主行程中執行重型計算，透過 IPC 傳遞結果給渲染行程。WebGPU 支援（實驗性）為未來性能提升奠定基礎。

**缺點分析**

星數僅 58，社群規模較小，文件仍在完善中。不直接支援桁架（Truss）分析，需要自行實現桁架元素。視覺化依賴 Plotly，與 Three.js 的整合需要額外橋接層。

**整合建議**

```typescript
import { FEAScriptModel } from 'feascript'

// 在 Electron 主行程或 Web Worker 中執行 FEA 計算
const model = new FEAScriptModel()

// 熱傳導模型可類比靜力學：溫度 ↔ 位移，熱流 ↔ 應力
model.setModelConfig('heatConductionScript')
model.setMeshConfig({
  meshDimension: '2D',
  elementOrder: 'linear',
  numElementsX: 20,
  numElementsY: 10,
  maxX: 10.0,  // 結構寬度（公尺）
  maxY: 5.0    // 結構高度（公尺）
})

model.addBoundaryCondition('0', ['constantTemp', 0])   // 固定端（位移 = 0）
model.addBoundaryCondition('1', ['constantTemp', 100]) // 加載端（等效位移）

const { solutionVector, nodesCoordinates } = model.solve()

// 將結果傳遞給 Three.js 進行熱圖視覺化
// 使用 VertexColors 或 ShaderMaterial 渲染應力分佈
const stressColors = solutionVector.map(v => 
  new THREE.Color().setHSL((1 - v/100) * 0.67, 1, 0.5) // 藍→紅熱圖
)
```

---

### 第 2 名：janvorisek/edubeam

**GitHub：** [https://github.com/janvorisek/edubeam](https://github.com/janvorisek/edubeam)

| 指標 | 數值/狀態 |
|------|---------|
| GitHub 星數 | **35 ⭐** |
| 最後更新 | **2026 年 2 月（2 週前）** |
| npm 套件 | ❌ 無（需克隆源碼）|
| TypeScript 支援 | ✅ Vue 3 + Vite + TypeScript 架構 |
| 授權 | **GPL-3.0**（商業閉源需注意！）|
| Electron/Node.js | ⚠️ 需要適配（Vue 3 前端框架）|

**核心功能說明**

edubeam 是一個完整的 2D 結構分析工具，採用 Timoshenko 梁公式（Timoshenko Beam Formulation），支援梁（Beam）、桁架（Truss）和框架（Frame）混合分析。提供即時求解（每次編輯自動重新計算）、彎矩圖（BMD）、剪力圖（SFD）、撓曲圖（Deflection）視覺化，以及 JSON 模型持久化和 URL 分享功能。

**優點分析**

edubeam 是目前 JavaScript 生態中功能最完整的結構分析工具，Timoshenko 梁公式比 Euler-Bernoulli 更精確（考慮剪切變形）。源碼架構清晰（Vue 3 + Pinia + TypeScript），核心求解器可提取並整合進 Three.js 應用。支援多語言（含中文）。

**缺點分析**

**GPL-3.0 授權是最大障礙**，商業閉源應用不能直接使用，需要聯繫作者取得商業授權或重新實現核心算法。無 npm 套件，需要直接克隆源碼並提取求解器模組。

**整合建議**

若授權允許，可提取 `src/` 目錄中的求解器核心（stiffness matrix 計算、荷載向量組裝、位移求解），移植至 Three.js 應用中。建議在 Electron 主行程中執行計算，透過 IPC 傳遞結果。

---

### 第 3 名：自建方案（math.js + numeric.js）

**GitHub：** [https://github.com/josdejong/mathjs](https://github.com/josdejong/mathjs)

| 指標 | 數值/狀態 |
|------|---------|
| GitHub 星數 | **14,000 ⭐**（math.js）|
| 最後更新 | 2026 年 2 月（持續更新）|
| npm 套件 | `npm install mathjs` |
| TypeScript 支援 | ✅ 完整 TypeScript 定義 |
| 授權 | **Apache-2.0** |
| Electron/Node.js | ✅ 完整支援 |

**核心功能說明**

對於 JavaScript FEA 生態薄弱的現狀，建議採用 **math.js** 作為矩陣運算基礎，自行實現直接剛度法（Direct Stiffness Method）。math.js 提供完整的矩陣運算（乘法、逆矩陣、LU 分解），可實現桁架和梁的有限元素分析。

**優點分析**

math.js 擁有 14,000 星，是 JavaScript 數學計算的事實標準。Apache-2.0 授權無商業限制。完整的矩陣運算 API 足以實現基本的 FEA 求解器。

**缺點分析**

需要自行實現 FEA 算法（剛度矩陣組裝、邊界條件施加、求解），開發工作量較大。對於複雜的 3D 結構分析，性能可能不足。

**整合建議**

```typescript
import { matrix, multiply, inv, zeros, subset, index } from 'mathjs'

// 直接剛度法：桁架元素剛度矩陣
function trussStiffnessMatrix(E: number, A: number, L: number, angle: number) {
  const c = Math.cos(angle), s = Math.sin(angle)
  const k = (E * A) / L
  return matrix([
    [c*c, c*s, -c*c, -c*s],
    [c*s, s*s, -c*s, -s*s],
    [-c*c, -c*s, c*c, c*s],
    [-c*s, -s*s, c*s, s*s]
  ]).map((v: number) => v * k)
}
```

---

### FEA 引擎評估總表

| 方案 | 星數 | 更新 | TS | npm | 授權 | Electron | 綜合評分 |
|------|------|------|----|----|------|---------|---------|
| **FEAScript-core** | 58 | 本週 | ✅ | ✅ | MIT | ✅ | ⭐⭐⭐⭐⭐ |
| **edubeam** | 35 | 2 週前 | ✅ | ❌ | GPL-3.0 | ⚠️ | ⭐⭐⭐ |
| **math.js（自建）** | 14k | 持續 | ✅ | ✅ | Apache-2.0 | ✅ | ⭐⭐⭐⭐ |

> **重要說明：** JavaScript FEA 生態系相對薄弱，FEAScript 是目前唯一符合所有評估標準的選項。對於複雜的桁架/FEA 分析，建議採用 **FEAScript + math.js** 組合：FEAScript 處理連續體問題（熱傳導、流體），math.js 支援自建桁架求解器。

---

## 引擎 3：貼圖引擎（TextureEngine）

> **搜尋目標：** UV 展開、PBR 材質編輯（Albedo/Roughness/Metallic/Normal/AO）、程序貼圖生成、貼圖烘焙

### 第 1 名：xatlas-three

**GitHub：** [https://github.com/repalash/xatlas-three](https://github.com/repalash/xatlas-three)

| 指標 | 數值/狀態 |
|------|---------|
| GitHub 星數 | **119 ⭐** |
| 最後更新 | 2024 年（2 年前）|
| npm 套件 | `npm install xatlas-three` |
| TypeScript 支援 | ✅ TypeScript 源碼（tsconfig.json）|
| 授權 | **MIT** |
| Electron/Node.js | ✅ 支援（worker_threads）|

**核心功能說明**

xatlas-three 將業界標準的 UV 展開工具 xAtlas（原 NVIDIA 開發的 C++ 工具）透過 WebAssembly 移植至 Three.js 生態系。該庫提供兩個核心功能：

1. **單一幾何體 UV 展開**（`unwrap(geometry)`）：為 `BufferGeometry` 生成最優 UV 座標，最小化 UV 失真
2. **多幾何體圖集打包**（`packAtlas([geo1, geo2, ...])`）：將多個物件的 UV 打包至單一貼圖圖集，用於光貼圖烘焙

Web Worker 支援確保 WASM 計算不阻塞 UI，Node.js 環境可使用 `worker_threads` 模組。

**優點分析**

xAtlas 是業界驗證的 UV 展開算法，品質遠超自行實現。WASM 實現性能接近原生 C++。TypeScript 完整支援，API 設計清晰。MIT 授權無商業限制。是目前 Three.js 生態中**唯一可用的高品質 UV 展開 npm 套件**。

**缺點分析**

最後更新為 2024 年，已有 2 年未更新（但功能已相對完整）。不包含 PBR 材質編輯功能。WASM 文件需要從 CDN 加載（可自行托管）。

**整合建議**

```typescript
import { UVUnwrapper } from 'xatlas-three'
import * as THREE from 'three'

const unwrapper = new UVUnwrapper({ BufferAttribute: THREE.BufferAttribute })

// 加載 xAtlas WASM（建議本地托管）
await unwrapper.loadLibrary(
  (mode, progress) => console.log(`Loading: ${mode} ${progress}%`),
  '/assets/xatlas.wasm',
  '/assets/xatlas.js'
)

// UV 展開（用於貼圖繪製）
await unwrapper.unwrap(geometry)
// geometry.attributes.uv 現在包含最優 UV 座標

// 打包多個物件至光貼圖圖集（用於 AO/光貼圖烘焙）
const atlas = await unwrapper.packAtlas([geo1, geo2, geo3])
// 生成的 UV2 座標可用於 Three.js 的 lightMap 和 aoMap
```

---

### 第 2 名：tsl-textures

**GitHub：** [https://github.com/boytchev/tsl-textures](https://github.com/boytchev/tsl-textures)

| 指標 | 數值/狀態 |
|------|---------|
| GitHub 星數 | **247 ⭐** |
| 最後更新 | **2026 年 3 月（上週）** |
| npm 套件 | `npm install three tsl-textures` |
| TypeScript 支援 | ⚠️ JavaScript 源碼，但有 ESM 模組 |
| 授權 | **MIT** |
| Electron/Node.js | ⚠️ 需要 WebGPU 支援（Three.js WebGPU Renderer）|

**核心功能說明**

tsl-textures 是基於 Three.js Shading Language（TSL）的程序貼圖生成庫，提供 40+ 種程序貼圖（Polka Dots、Voronoi、Noise、Marble、Wood、Fordite 等），全部在 GPU 上即時生成，無需預先烘焙。使用 `MeshStandardNodeMaterial` 的 `colorNode` 屬性直接套用，支援 WebGPU Renderer。最新版 v3.0.1 已修復 WebGPU 相容性問題。

**優點分析**

是目前 Three.js 生態中**最活躍的程序貼圖庫**（2026 年 3 月上週仍有更新）。40+ 種貼圖類型覆蓋常見需求。GPU 即時生成，無貼圖記憶體佔用。MIT 授權。

**缺點分析**

需要 Three.js WebGPU Renderer（`three/webgpu`），而非標準 WebGL Renderer，對現有 React Three Fiber 專案需要升級（R3F 已有 WebGPU 支援計畫）。不支援 PBR 材質的 Roughness/Metallic/Normal 通道程序生成（僅 colorNode）。

**整合建議**

```typescript
// 需要使用 Three.js WebGPU 版本
import * as THREE from 'three/webgpu'
import { polkaDots, marble, wood } from 'tsl-textures'

const material = new THREE.MeshStandardNodeMaterial({
  roughness: 0.5,
  metalness: 0.0
})

// 程序生成 Albedo 貼圖（大理石紋理）
material.colorNode = marble({
  scale: 3,
  turbulence: 0.5,
  color1: new THREE.Color(0xffffff),
  color2: new THREE.Color(0x888888)
})
```

---

### 第 3 名：manthrax/monkeypaint

**GitHub：** [https://github.com/manthrax/monkeypaint](https://github.com/manthrax/monkeypaint)

| 指標 | 數值/狀態 |
|------|---------|
| GitHub 星數 | **57 ⭐** |
| 最後更新 | 2023 年（3 年前）|
| npm 套件 | ❌ 無（需克隆源碼）|
| TypeScript 支援 | ❌ 純 JavaScript |
| 授權 | ⚠️ 未明確指定 |
| Electron/Node.js | ⚠️ 需要 Canvas/WebGL |

**核心功能說明**

monkeypaint 是一個在 Three.js 網格上進行 3D 貼圖繪製的工具，使用 GPU RenderTarget 實現。算法核心是將 UV 座標渲染至 RenderTarget，計算筆刷位置與 UV 三角形的交叉，並混合顏色。支援 GLB 匯出（包含繪製後的貼圖），並包含 UV 展開模組（`UnwrapUVs.js`）。

**優點分析**

是目前 Three.js 生態中**唯一實現 3D 貼圖繪製**的開源工具。算法設計精良，包含 UV 島邊緣擴展（Dilation）以消除接縫。GLB 匯出功能完整。

**缺點分析**

無 npm 套件，需要直接複製源碼。不支援 TypeScript。授權不明確，商業使用需聯繫作者。已 3 年未更新。不支援 PBR 多通道繪製（僅 Albedo）。

**整合建議**

建議直接複製 `ScenePainter.js`、`MonkeyPaint.js`、`UnwrapUVs.js` 三個核心文件，並改寫為 TypeScript。可作為貼圖繪製功能的起點，擴展支援 Roughness/Metallic/Normal 通道。

---

### 貼圖引擎評估總表

| 方案 | 星數 | 更新 | TS | npm | 授權 | Electron | 綜合評分 |
|------|------|------|----|----|------|---------|---------|
| **xatlas-three** | 119 | 2 年前 | ✅ | ✅ | MIT | ✅ | ⭐⭐⭐⭐⭐ |
| **tsl-textures** | 247 | 上週 | ⚠️ | ✅ | MIT | ⚠️ | ⭐⭐⭐⭐ |
| **monkeypaint** | 57 | 3 年前 | ❌ | ❌ | 不明 | ⚠️ | ⭐⭐⭐ |

> **推薦組合：** `xatlas-three`（UV 展開 + 圖集烘焙）+ `tsl-textures`（程序貼圖生成）+ `monkeypaint`（貼圖繪製，需移植）。Three.js 內建的 `MeshStandardMaterial` 已支援完整 PBR 通道（Albedo/Roughness/Metallic/Normal/AO），可搭配上述工具完成完整的貼圖工作流。

---

## 引擎 4：多人協作引擎（MultiplayerEngine）

> **搜尋目標：** 即時協作、CRDT 衝突解決、游標追蹤、操作同步

### 第 1 名：yjs

**GitHub：** [https://github.com/yjs/yjs](https://github.com/yjs/yjs)

| 指標 | 數值/狀態 |
|------|---------|
| GitHub 星數 | **21,400 ⭐** |
| 最後更新 | **2026 年 2 月（2 週前）** |
| npm 套件 | `npm install yjs y-websocket` |
| TypeScript 支援 | ✅ 完整 TypeScript 定義（global.d.ts）|
| 授權 | **MIT** |
| Electron/Node.js | ✅ 完整支援（ws polyfill）|

**核心功能說明**

Yjs 是業界公認的 CRDT（Conflict-free Replicated Data Types）標準實現，21,400 星的社群規模遠超其他競爭者。其核心提供共享資料型別：`Y.Array`、`Y.Map`、`Y.Text`、`Y.XmlFragment`，以及 **Awareness Protocol**（游標追蹤和用戶狀態廣播）。

對於 3D 場景協作，`Y.Map` 可儲存物件變換（位置/旋轉/縮放），`Y.Array` 可儲存物件列表，Awareness 可廣播每個用戶的游標位置和選中物件。y-websocket 提供 WebSocket 連接層，支援跨標籤頁通訊（BroadcastChannel）。

Yjs 已被 AFFiNE、Evernote、AWS SageMaker、JupyterLab（含 JupyterCad 3D 協作）等企業級應用採用，是目前最可靠的協作框架。

**優點分析**

21,400 星的壓倒性社群優勢，確保長期維護。Awareness Protocol 原生支援游標追蹤，無需額外實現。支援多種連接提供者（WebSocket、WebRTC、IndexedDB、SQLite），適應不同部署場景。離線優先設計，網路斷線後重連自動合併。Node.js 支援完整，可在 Electron 主行程中運行 y-websocket 服務器。

**缺點分析**

學習曲線較陡，需要理解 CRDT 概念和 Yjs 的資料模型。初始化配置相對複雜。對於大型 3D 場景（數千個物件），`Y.Map` 的性能需要測試驗證。

**整合建議**

```typescript
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

// 初始化 Yjs 文件
const ydoc = new Y.Doc()

// 連接 WebSocket 服務器（Electron 環境需要 ws polyfill）
const provider = new WebsocketProvider(
  'ws://localhost:1234',
  'scene-room-001',
  ydoc,
  { WebSocketPolyfill: require('ws') }
)

// 3D 物件狀態同步
const sceneObjects = ydoc.getMap<{
  position: [number, number, number]
  rotation: [number, number, number, number]
  scale: [number, number, number]
  semanticTag: string
}>('sceneObjects')

// 游標追蹤（Awareness Protocol）
const awareness = provider.awareness
awareness.setLocalState({
  cursor: { x: 0, y: 0, z: 0 },
  selectedObjectId: null as string | null,
  userName: 'User1',
  color: '#ff0000'
})

// 監聽其他用戶的游標更新
awareness.on('change', () => {
  const states = awareness.getStates()
  states.forEach((state, clientId) => {
    if (clientId !== ydoc.clientID) {
      updateRemoteCursor(clientId, state.cursor)
    }
  })
})

// 物件變換同步（CRDT 自動解決衝突）
sceneObjects.observe(event => {
  event.changes.keys.forEach((change, objectId) => {
    if (change.action === 'update') {
      const transform = sceneObjects.get(objectId)
      updateThreeJSObject(objectId, transform)
    }
  })
})
```

---

### 第 2 名：liveblocks

**GitHub：** [https://github.com/liveblocks/liveblocks](https://github.com/liveblocks/liveblocks)

| 指標 | 數值/狀態 |
|------|---------|
| GitHub 星數 | **4,500 ⭐** |
| 最後更新 | **2026 年 3 月（今天）** |
| npm 套件 | `npm install @liveblocks/client @liveblocks/react` |
| TypeScript 支援 | ✅ 完整 TypeScript 支援 |
| 授權 | **Apache-2.0**（部分組件 AGPL-3.0）|
| Electron/Node.js | ✅ 支援（@liveblocks/node）|

**核心功能說明**

Liveblocks 是一個完整的協作基礎設施平台，提供 Multiplayer（即時協作）、Comments（評論系統）、Notifications（通知系統）和 AI Agents 四大模組。提供 `@liveblocks/react` 的 React hooks，以及 `@liveblocks/yjs` 的 Yjs 整合。官方提供 Multiplayer 3D Builder 範例，展示 Three.js 3D 協作。

**優點分析**

是目前**唯一有官方 3D 協作範例**的協作庫。`@liveblocks/react` 提供最佳的 React 整合體驗。4,500 星且 2026 年 3 月仍在積極開發。`@liveblocks/node` 支援 Electron 主行程。

**缺點分析**

核心服務依賴 Liveblocks 雲端服務器（有免費額度，但生產環境需付費）。部分組件採用 AGPL-3.0 授權，需要謹慎評估。完全離線使用不可行（依賴雲端同步）。

**整合建議**

```typescript
import { createClient } from '@liveblocks/client'
import { LiveMap, LiveObject } from '@liveblocks/client'

const client = createClient({ publicApiKey: 'pk_your_key' })

const { room } = client.enterRoom('3d-scene-room', {
  initialPresence: { cursor: null, selectedObjectId: null },
  initialStorage: { sceneObjects: new LiveMap() }
})

// 更新物件位置（自動同步至所有協作者）
const { sceneObjects } = await room.getStorage()
sceneObjects.set('wall-001', new LiveObject({
  position: [1, 2, 3],
  rotation: [0, 0, 0, 1],
  semanticTag: 'structural'
}))
```

---

### 第 3 名：YousefED/SyncedStore

**GitHub：** [https://github.com/YousefED/SyncedStore](https://github.com/YousefED/SyncedStore)

| 指標 | 數值/狀態 |
|------|---------|
| GitHub 星數 | **1,900 ⭐** |
| 最後更新 | 2024 年（2 年前）|
| npm 套件 | `npm install syncedstore yjs` |
| TypeScript 支援 | ✅ 完整 TypeScript 支援 |
| 授權 | **MIT** |
| Electron/Node.js | ✅ 支援 |

**核心功能說明**

SyncedStore 是建立在 Yjs 之上的高階抽象層，提供更簡潔的 API。透過 Proxy 機制，使 Yjs 的共享資料型別看起來像普通 JavaScript 物件，大幅降低學習曲線。

**優點分析**

API 極為簡潔，`store.sceneObjects['wall-001'] = {...}` 即可自動同步。MIT 授權。完整的 React 整合文件。

**缺點分析**

最後更新已是 2 年前，維護狀態存疑。依賴 Yjs，增加一層抽象可能帶來性能損耗。

**整合建議**

```typescript
import { syncedStore, getYjsDoc } from '@syncedstore/core'
import { WebsocketProvider } from 'y-websocket'

const store = syncedStore({
  sceneObjects: {} as Record<string, {
    position: [number, number, number]
    semanticTag: string
  }>
})

const doc = getYjsDoc(store)
const provider = new WebsocketProvider('ws://localhost:1234', 'room', doc)

// 直接修改即可自動同步至所有協作者
store.sceneObjects['wall-001'] = {
  position: [0, 0, 0],
  semanticTag: 'structural'
}
```

---

### 多人協作引擎評估總表

| 方案 | 星數 | 更新 | TS | npm | 授權 | Electron | 綜合評分 |
|------|------|------|----|----|------|---------|---------|
| **yjs** | 21.4k | 2 週前 | ✅ | ✅ | MIT | ✅ | ⭐⭐⭐⭐⭐ |
| **liveblocks** | 4.5k | 今天 | ✅ | ✅ | Apache-2.0 | ✅ | ⭐⭐⭐⭐ |
| **SyncedStore** | 1.9k | 2 年前 | ✅ | ✅ | MIT | ✅ | ⭐⭐⭐ |

> **推薦方案：** `yjs` + `y-websocket` 是最穩健的選擇，適合自托管部署（Electron 應用可內建 WebSocket 服務器）。若需要快速原型且接受雲端依賴，`liveblocks` 提供最佳的開發體驗和 3D 範例支援。

---

## 完整整合方案總覽

### 推薦技術棧

```bash
# 語意引擎（規則引擎 + 物件標籤系統）
npm install json-rules-engine bitecs

# FEA 引擎（有限元素分析 + 矩陣運算）
npm install feascript mathjs

# 貼圖引擎（UV 展開 + 程序貼圖）
npm install xatlas-three tsl-textures

# 多人協作引擎（CRDT + WebSocket）
npm install yjs y-websocket

# 共計 8 個核心套件
```

### 各引擎最終推薦一覽

| 引擎 | 首選方案 | npm 指令 | 星數 | 授權 |
|------|---------|---------|------|------|
| 語意引擎 | json-rules-engine | `npm i json-rules-engine` | 3k | ISC |
| 語意引擎（標籤） | bitECS | `npm i bitecs` | 1.3k | MPL-2.0 |
| FEA 引擎 | FEAScript-core | `npm i feascript mathjs` | 58 | MIT |
| 貼圖引擎（UV） | xatlas-three | `npm i xatlas-three` | 119 | MIT |
| 貼圖引擎（程序） | tsl-textures | `npm i tsl-textures` | 247 | MIT |
| 協作引擎 | yjs + y-websocket | `npm i yjs y-websocket` | 21.4k | MIT |

---

## 關鍵風險與緩解策略

| 引擎 | 主要風險 | 嚴重度 | 緩解策略 |
|------|---------|--------|---------|
| 語意引擎 | bitECS 採用 MPL-2.0，修改源碼需開源 | 低 | 使用 API 不受限制；或改用 miniplex（MIT）|
| FEA 引擎 | JavaScript FEA 生態薄弱，功能有限 | 高 | 考慮 WASM 橋接 C++ FEA 庫（OpenSees/CalculiX）|
| FEA 引擎 | edubeam 採用 GPL-3.0 | 高 | 僅參考算法，不直接使用源碼 |
| 貼圖引擎 | tsl-textures 需要 WebGPU Renderer | 中 | 確認 Electron 版本支援 WebGPU；R3F 升級至 v9+ |
| 貼圖引擎 | monkeypaint 授權不明確 | 中 | 聯繫作者確認授權；或自行實現貼圖繪製 |
| 協作引擎 | Liveblocks 依賴雲端服務 | 中 | 使用純 Yjs + 自托管 y-websocket |

---

## 附錄：備選方案

### 語意引擎備選

- **nools**（[https://github.com/noolsjs/nools](https://github.com/noolsjs/nools)）：Rete 算法規則引擎，但已 7 年未更新
- **rools**（[https://github.com/frankthelen/rools](https://github.com/frankthelen/rools)）：TypeScript 規則引擎，500 星，MIT 授權

### FEA 引擎備選

- **WebAssembly 橋接方案**：使用 Emscripten 將 OpenSees（C++）編譯為 WASM，性能最佳但開發複雜度高
- **Python 橋接方案**：在 Electron 主行程中透過 child_process 調用 Python FEA 庫（FEniCS、OpenSeesPy）

### 貼圖引擎備選

- **three-mesh-bvh**（[https://github.com/gkjohnson/three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh)）：高效的光線投射，可用於貼圖烘焙的光線追蹤
- **WebGPU Baking**：Three.js v170+ 的 WebGPU 路徑追蹤功能，可實現高品質貼圖烘焙

### 協作引擎備選

- **automerge**（[https://github.com/automerge/automerge](https://github.com/automerge/automerge)）：另一個 CRDT 實現，11k 星，MIT 授權，但 3D 整合案例較少
- **ShareDB**（[https://github.com/share/sharedb](https://github.com/share/sharedb)）：OT（操作變換）實現，3.5k 星，MIT 授權

---

## 參考資源

- [1] bitECS GitHub: https://github.com/NateTheGreatt/bitECS
- [2] json-rules-engine GitHub: https://github.com/CacheControl/json-rules-engine
- [3] miniplex GitHub: https://github.com/hmans/miniplex
- [4] FEAScript-core GitHub: https://github.com/FEAScript/FEAScript-core
- [5] edubeam GitHub: https://github.com/janvorisek/edubeam
- [6] math.js GitHub: https://github.com/josdejong/mathjs
- [7] xatlas-three GitHub: https://github.com/repalash/xatlas-three
- [8] tsl-textures GitHub: https://github.com/boytchev/tsl-textures
- [9] monkeypaint GitHub: https://github.com/manthrax/monkeypaint
- [10] yjs GitHub: https://github.com/yjs/yjs
- [11] y-websocket GitHub: https://github.com/yjs/y-websocket
- [12] liveblocks GitHub: https://github.com/liveblocks/liveblocks
- [13] SyncedStore GitHub: https://github.com/YousefED/SyncedStore
- [14] Liveblocks 3D Builder 範例: https://liveblocks.io/examples/multiplayer-3d-builder/nextjs-3d-builder
