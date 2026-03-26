/**
 * MinecraftExporter.ts - 體素/NURBS → Minecraft 格式匯出器
 *
 * 支援格式：
 *   1. .schematic (MCEdit Classic) - Minecraft 1.12 以下
 *   2. .litematic (Litematica) - Minecraft 1.13+ (block state palette)
 *   3. .schem (Sponge Schematic v2) - WorldEdit 1.13+
 *
 * 管線整合：
 *   - 直接路徑：VoxelEngine 體素 → Minecraft 方塊
 *   - NURBS 路徑：NURBS 曲面 → 體素化 → Minecraft 方塊
 *
 * 材質映射：
 *   FastDesign 材質 → Minecraft Block State
 */

import { Voxel, Vec3, NURBSSurface } from '../store/useStore';
import {
  NBTWriter, gzipCompress, NBTCompound, NBTList, TAG,
  nbtByte, nbtShort, nbtInt, nbtLong, nbtString, nbtCompound, nbtList,
  nbtByteArray, nbtIntArray, nbtLongArray,
} from './NBTWriter';
import eventBus from './EventBus';

// ═══════════════════════════════════════════════════════════════
//  材質映射表：FastDesign → Minecraft Block State
// ═══════════════════════════════════════════════════════════════

export interface MinecraftBlock {
  /** Minecraft 命名空間 ID（1.13+） */
  blockState: string;
  /** Legacy block ID（1.12 以下） */
  legacyId: number;
  /** Legacy data value */
  legacyData: number;
}

/**
 * 預設材質映射表
 *
 * FastDesign 的材質對應到最接近的 Minecraft 方塊。
 * 使用者可透過 setMaterialMapping() 自訂。
 */
const DEFAULT_MATERIAL_MAP: Record<string, MinecraftBlock> = {
  concrete:  { blockState: 'minecraft:stone',            legacyId: 1,   legacyData: 0 },
  steel:     { blockState: 'minecraft:iron_block',       legacyId: 42,  legacyData: 0 },
  wood:      { blockState: 'minecraft:oak_planks',       legacyId: 5,   legacyData: 0 },
  brick:     { blockState: 'minecraft:bricks',           legacyId: 45,  legacyData: 0 },
  aluminum:  { blockState: 'minecraft:quartz_block',     legacyId: 155, legacyData: 0 },
  glass:     { blockState: 'minecraft:glass',            legacyId: 20,  legacyData: 0 },
};

/**
 * 顏色 → Minecraft 方塊映射（當無材質 ID 時使用顏色近似）
 */
const COLOR_BLOCK_MAP: Array<{ color: [number, number, number]; block: MinecraftBlock }> = [
  { color: [255, 255, 255], block: { blockState: 'minecraft:white_concrete',      legacyId: 251, legacyData: 0 } },
  { color: [128, 128, 128], block: { blockState: 'minecraft:stone',               legacyId: 1,   legacyData: 0 } },
  { color: [64, 64, 64],    block: { blockState: 'minecraft:gray_concrete',       legacyId: 251, legacyData: 7 } },
  { color: [0, 0, 0],       block: { blockState: 'minecraft:black_concrete',      legacyId: 251, legacyData: 15 } },
  { color: [255, 0, 0],     block: { blockState: 'minecraft:red_concrete',        legacyId: 251, legacyData: 14 } },
  { color: [0, 255, 0],     block: { blockState: 'minecraft:lime_concrete',       legacyId: 251, legacyData: 5 } },
  { color: [0, 0, 255],     block: { blockState: 'minecraft:blue_concrete',       legacyId: 251, legacyData: 11 } },
  { color: [255, 255, 0],   block: { blockState: 'minecraft:yellow_concrete',     legacyId: 251, legacyData: 4 } },
  { color: [255, 165, 0],   block: { blockState: 'minecraft:orange_concrete',     legacyId: 251, legacyData: 1 } },
  { color: [128, 0, 128],   block: { blockState: 'minecraft:purple_concrete',     legacyId: 251, legacyData: 10 } },
  { color: [0, 255, 255],   block: { blockState: 'minecraft:cyan_concrete',       legacyId: 251, legacyData: 9 } },
  { color: [255, 192, 203], block: { blockState: 'minecraft:pink_concrete',       legacyId: 251, legacyData: 6 } },
  { color: [139, 69, 19],   block: { blockState: 'minecraft:brown_concrete',      legacyId: 251, legacyData: 12 } },
  { color: [173, 216, 230], block: { blockState: 'minecraft:light_blue_concrete', legacyId: 251, legacyData: 3 } },
];

/** 自訂材質映射表 */
let customMaterialMap: Record<string, MinecraftBlock> = {};

/** 設定自訂材質映射 */
export function setMaterialMapping(mapping: Record<string, MinecraftBlock>): void {
  customMaterialMap = { ...mapping };
}

/** 取得方塊映射 */
function resolveBlock(voxel: Voxel): MinecraftBlock {
  // 優先使用自訂映射
  const matId = voxel.materialId || 'concrete';
  if (customMaterialMap[matId]) return customMaterialMap[matId];
  if (DEFAULT_MATERIAL_MAP[matId]) return DEFAULT_MATERIAL_MAP[matId];

  // 退回顏色近似
  return colorToBlock(voxel.color);
}

/** 解析 CSS 顏色為 RGB */
function parseColor(color: string): [number, number, number] {
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      return [
        parseInt(hex[0] + hex[0], 16),
        parseInt(hex[1] + hex[1], 16),
        parseInt(hex[2] + hex[2], 16),
      ];
    }
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  }
  return [128, 128, 128]; // fallback grey
}

/** 顏色距離（歐幾里得） */
function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

/** 最近顏色 → 方塊 */
function colorToBlock(color: string): MinecraftBlock {
  const rgb = parseColor(color);
  let best = COLOR_BLOCK_MAP[0].block;
  let bestDist = Infinity;
  for (const entry of COLOR_BLOCK_MAP) {
    const d = colorDistance(rgb, entry.color);
    if (d < bestDist) {
      bestDist = d;
      best = entry.block;
    }
  }
  return best;
}

// ═══════════════════════════════════════════════════════════════
//  共用工具
// ═══════════════════════════════════════════════════════════════

interface BoundingBox {
  minX: number; minY: number; minZ: number;
  maxX: number; maxY: number; maxZ: number;
  width: number; height: number; length: number;
}

function computeBounds(voxels: Voxel[]): BoundingBox {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const v of voxels) {
    const { x, y, z } = v.pos;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  return {
    minX, minY, minZ, maxX, maxY, maxZ,
    width:  maxX - minX + 1,
    height: maxY - minY + 1,
    length: maxZ - minZ + 1,
  };
}

// ═══════════════════════════════════════════════════════════════
//  Format 1: .schematic (MCEdit Classic / Minecraft 1.12-)
// ═══════════════════════════════════════════════════════════════

/**
 * 匯出為 MCEdit .schematic 格式
 *
 * 使用 legacy block ID 系統（Minecraft 1.12 以下）。
 * 格式：GZip 壓縮的 NBT，根標籤為 "Schematic"。
 *
 * 結構：
 *   TAG_Compound "Schematic" {
 *     TAG_Short "Width"    - X 軸大小
 *     TAG_Short "Height"   - Y 軸大小
 *     TAG_Short "Length"   - Z 軸大小
 *     TAG_String "Materials" - "Alpha"
 *     TAG_ByteArray "Blocks"   - block ID 陣列
 *     TAG_ByteArray "Data"     - block data 陣列
 *     TAG_List "Entities"      - 空
 *     TAG_List "TileEntities"  - 空
 *   }
 *
 * 索引公式：index = (y * length + z) * width + x
 */
export async function exportSchematic(voxels: Voxel[]): Promise<Uint8Array> {
  if (voxels.length === 0) throw new Error('沒有體素可匯出');

  const bounds = computeBounds(voxels);
  const { width, height, length, minX, minY, minZ } = bounds;
  const volume = width * height * length;

  // 建立方塊陣列
  const blocks = new Int8Array(volume);
  const data = new Int8Array(volume);

  for (const v of voxels) {
    const x = Math.round(v.pos.x) - minX;
    const y = Math.round(v.pos.y) - minY;
    const z = Math.round(v.pos.z) - minZ;
    const idx = (y * length + z) * width + x;

    const block = resolveBlock(v);
    blocks[idx] = block.legacyId & 0xFF;
    data[idx] = block.legacyData & 0xF;
  }

  // 建立 NBT
  const root: NBTCompound = {
    Width:    nbtShort(width),
    Height:   nbtShort(height),
    Length:   nbtShort(length),
    Materials: nbtString('Alpha'),
    Blocks:   nbtByteArray(blocks),
    Data:     nbtByteArray(data),
    Entities:      nbtList(TAG.Compound, []),
    TileEntities:  nbtList(TAG.Compound, []),
  };

  const writer = new NBTWriter();
  writer.writeRootCompound('Schematic', root);

  eventBus.emit('minecraft:exported', { format: 'schematic', voxelCount: voxels.length });
  return gzipCompress(writer.getBuffer());
}

// ═══════════════════════════════════════════════════════════════
//  Format 2: .litematic (Litematica, Minecraft 1.13+)
// ═══════════════════════════════════════════════════════════════

/**
 * 匯出為 Litematica .litematic 格式
 *
 * 使用 block state palette 系統（Minecraft 1.13+）。
 * 方塊資料使用可變長度 packed long array。
 *
 * 結構：
 *   TAG_Compound "" {
 *     TAG_Int "MinecraftDataVersion" - 資料版本
 *     TAG_Int "Version" - Litematica 格式版本 (6)
 *     TAG_Compound "Metadata" { ... }
 *     TAG_Compound "Regions" {
 *       TAG_Compound "<regionName>" {
 *         TAG_Compound "Position" { X, Y, Z }
 *         TAG_Compound "Size" { X, Y, Z }
 *         TAG_List "BlockStatePalette" [ { Name: "..." }, ... ]
 *         TAG_LongArray "BlockStates" - packed bits
 *         TAG_List "Entities" []
 *         TAG_List "TileEntities" []
 *         TAG_List "PendingBlockTicks" []
 *         TAG_List "PendingFluidTicks" []
 *       }
 *     }
 *   }
 */
export async function exportLitematic(
  voxels: Voxel[],
  regionName: string = 'FastDesign',
  author: string = 'FastDesign',
  description: string = '',
  mcDataVersion: number = 3700, // 1.20.4
): Promise<Uint8Array> {
  if (voxels.length === 0) throw new Error('沒有體素可匯出');

  const bounds = computeBounds(voxels);
  const { width, height, length, minX, minY, minZ } = bounds;
  const volume = width * height * length;

  // Step 1: 建立 block state palette
  const paletteMap = new Map<string, number>(); // blockState → palette index
  paletteMap.set('minecraft:air', 0); // index 0 = air

  const voxelBlocks: MinecraftBlock[] = [];
  for (const v of voxels) {
    const block = resolveBlock(v);
    voxelBlocks.push(block);
    if (!paletteMap.has(block.blockState)) {
      paletteMap.set(block.blockState, paletteMap.size);
    }
  }

  // Step 2: 建立 block state 索引陣列
  const blockIndices = new Int32Array(volume); // 預設 0 = air

  for (let i = 0; i < voxels.length; i++) {
    const v = voxels[i];
    const x = Math.round(v.pos.x) - minX;
    const y = Math.round(v.pos.y) - minY;
    const z = Math.round(v.pos.z) - minZ;
    const idx = (y * length + z) * width + x;
    blockIndices[idx] = paletteMap.get(voxelBlocks[i].blockState)!;
  }

  // Step 3: Pack 到 long array（Litematica 格式）
  const bitsPerEntry = Math.max(2, Math.ceil(Math.log2(paletteMap.size)));
  const entriesPerLong = Math.floor(64 / bitsPerEntry);
  const totalLongs = Math.ceil(volume / entriesPerLong);
  const packedStates = new BigInt64Array(totalLongs);

  for (let i = 0; i < volume; i++) {
    const longIndex = Math.floor(i / entriesPerLong);
    const bitOffset = (i % entriesPerLong) * bitsPerEntry;
    const value = BigInt(blockIndices[i]);
    packedStates[longIndex] |= value << BigInt(bitOffset);
  }

  // Step 4: 建立 palette NBT list
  const paletteEntries: NBTCompound[] = [];
  const sortedPalette = Array.from(paletteMap.entries()).sort((a, b) => a[1] - b[1]);
  for (const [blockState] of sortedPalette) {
    paletteEntries.push({ Name: nbtString(blockState) });
  }

  // Step 5: 組裝 NBT
  const now = BigInt(Date.now());

  const regionCompound: NBTCompound = {
    Position: nbtCompound({
      x: nbtInt(0),
      y: nbtInt(0),
      z: nbtInt(0),
    }),
    Size: nbtCompound({
      x: nbtInt(width),
      y: nbtInt(height),
      z: nbtInt(length),
    }),
    BlockStatePalette: nbtList(TAG.Compound, paletteEntries),
    BlockStates: nbtLongArray(packedStates),
    Entities:           nbtList(TAG.Compound, []),
    TileEntities:       nbtList(TAG.Compound, []),
    PendingBlockTicks:  nbtList(TAG.Compound, []),
    PendingFluidTicks:  nbtList(TAG.Compound, []),
  };

  const root: NBTCompound = {
    MinecraftDataVersion: nbtInt(mcDataVersion),
    Version: nbtInt(6),
    Metadata: nbtCompound({
      Name:        nbtString(regionName),
      Author:      nbtString(author),
      Description: nbtString(description),
      RegionCount: nbtInt(1),
      TimeCreated: nbtLong(now),
      TimeModified: nbtLong(now),
      TotalBlocks: nbtInt(voxels.length),
      TotalVolume: nbtInt(volume),
      EnclosingSize: nbtCompound({
        x: nbtInt(width),
        y: nbtInt(height),
        z: nbtInt(length),
      }),
    }),
    Regions: nbtCompound({
      [regionName]: nbtCompound(regionCompound),
    }),
  };

  const writer = new NBTWriter();
  writer.writeRootCompound('', root);

  eventBus.emit('minecraft:exported', { format: 'litematic', voxelCount: voxels.length });
  return gzipCompress(writer.getBuffer());
}

// ═══════════════════════════════════════════════════════════════
//  Format 3: .schem (Sponge Schematic v2, WorldEdit 1.13+)
// ═══════════════════════════════════════════════════════════════

/**
 * 匯出為 Sponge Schematic v2 (.schem) 格式
 *
 * 被 WorldEdit、FAWE 等主流工具支援。
 * 使用 varint-encoded block palette。
 *
 * 結構：
 *   TAG_Compound "Schematic" {
 *     TAG_Int "Version" - 2
 *     TAG_Int "DataVersion" - MC data version
 *     TAG_Short "Width" / "Height" / "Length"
 *     TAG_Compound "Palette" { "block_state": TAG_Int index }
 *     TAG_Int "PaletteMax"
 *     TAG_ByteArray "BlockData" - varint-encoded palette indices
 *     TAG_List "BlockEntities" []
 *   }
 *
 * 索引公式：index = (y * length + z) * width + x
 * BlockData 使用 varint 編碼。
 */
export async function exportSpongeSchematic(
  voxels: Voxel[],
  mcDataVersion: number = 3700,
): Promise<Uint8Array> {
  if (voxels.length === 0) throw new Error('沒有體素可匯出');

  const bounds = computeBounds(voxels);
  const { width, height, length, minX, minY, minZ } = bounds;
  const volume = width * height * length;

  // Build palette
  const paletteMap = new Map<string, number>();
  paletteMap.set('minecraft:air', 0);

  const blockIndices = new Int32Array(volume); // default 0 = air

  for (const v of voxels) {
    const block = resolveBlock(v);
    if (!paletteMap.has(block.blockState)) {
      paletteMap.set(block.blockState, paletteMap.size);
    }
    const x = Math.round(v.pos.x) - minX;
    const y = Math.round(v.pos.y) - minY;
    const z = Math.round(v.pos.z) - minZ;
    const idx = (y * length + z) * width + x;
    blockIndices[idx] = paletteMap.get(block.blockState)!;
  }

  // Encode block data as varint byte array
  const varintBuf: number[] = [];
  for (let i = 0; i < volume; i++) {
    let value = blockIndices[i];
    while (true) {
      if ((value & ~0x7F) === 0) {
        varintBuf.push(value);
        break;
      }
      varintBuf.push((value & 0x7F) | 0x80);
      value >>>= 7;
    }
  }
  const blockData = new Int8Array(varintBuf.length);
  for (let i = 0; i < varintBuf.length; i++) {
    blockData[i] = varintBuf[i] > 127 ? varintBuf[i] - 256 : varintBuf[i];
  }

  // Build palette NBT compound
  const paletteCompound: NBTCompound = {};
  for (const [blockState, index] of paletteMap) {
    paletteCompound[blockState] = nbtInt(index);
  }

  const root: NBTCompound = {
    Version:     nbtInt(2),
    DataVersion: nbtInt(mcDataVersion),
    Width:       nbtShort(width),
    Height:      nbtShort(height),
    Length:      nbtShort(length),
    Palette:     nbtCompound(paletteCompound),
    PaletteMax:  nbtInt(paletteMap.size),
    BlockData:   nbtByteArray(blockData),
    BlockEntities: nbtList(TAG.Compound, []),
  };

  const writer = new NBTWriter();
  writer.writeRootCompound('Schematic', root);

  eventBus.emit('minecraft:exported', { format: 'schem', voxelCount: voxels.length });
  return gzipCompress(writer.getBuffer());
}

// ═══════════════════════════════════════════════════════════════
//  匯出統一介面
// ═══════════════════════════════════════════════════════════════

export type MinecraftFormat = 'schematic' | 'litematic' | 'schem';

export interface MinecraftExportOptions {
  format: MinecraftFormat;
  regionName?: string;
  author?: string;
  description?: string;
  mcDataVersion?: number;
}

/**
 * 統一匯出介面
 */
export async function exportMinecraft(
  voxels: Voxel[],
  options: MinecraftExportOptions,
): Promise<Uint8Array> {
  switch (options.format) {
    case 'schematic':
      return exportSchematic(voxels);
    case 'litematic':
      return exportLitematic(
        voxels,
        options.regionName,
        options.author,
        options.description,
        options.mcDataVersion,
      );
    case 'schem':
      return exportSpongeSchematic(voxels, options.mcDataVersion);
    default:
      throw new Error(`不支援的格式: ${options.format}`);
  }
}

/**
 * 觸發下載 Minecraft 匯出檔
 */
export async function downloadMinecraft(
  voxels: Voxel[],
  options: MinecraftExportOptions,
  filename?: string,
): Promise<void> {
  const data = await exportMinecraft(voxels, options);
  const ext = options.format === 'schem' ? 'schem'
            : options.format === 'litematic' ? 'litematic'
            : 'schematic';
  const name = filename || `export.${ext}`;

  const blob = new Blob([data as unknown as BlobPart], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════════════
//  取得格式資訊（供 UI 使用）
// ═══════════════════════════════════════════════════════════════

export const MINECRAFT_FORMATS: Array<{
  key: MinecraftFormat;
  label: string;
  desc: string;
  ext: string;
  mcVersion: string;
}> = [
  {
    key: 'schem',
    label: '.schem (Sponge/WorldEdit)',
    desc: 'WorldEdit / FAWE 通用格式（推薦）',
    ext: 'schem',
    mcVersion: '1.13+',
  },
  {
    key: 'litematic',
    label: '.litematic (Litematica)',
    desc: 'Litematica mod 專用格式',
    ext: 'litematic',
    mcVersion: '1.13+',
  },
  {
    key: 'schematic',
    label: '.schematic (MCEdit Classic)',
    desc: 'Legacy 格式（1.12 以下）',
    ext: 'schematic',
    mcVersion: '1.12-',
  },
];

/** 取得完整材質映射表（供 UI 顯示） */
export function getMaterialMapping(): Record<string, MinecraftBlock> {
  return { ...DEFAULT_MATERIAL_MAP, ...customMaterialMap };
}
