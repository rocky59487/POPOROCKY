/**
 * NBTWriter.ts - Minecraft NBT 二進位格式序列化器
 *
 * 實作 Minecraft Named Binary Tag (NBT) 格式的寫入器。
 * 支援所有 NBT 標籤類型，輸出符合 Java Edition 規範的二進位資料。
 *
 * 規格參考：https://wiki.vg/NBT
 *
 * NBT Tag Types:
 *   0  TAG_End
 *   1  TAG_Byte
 *   2  TAG_Short
 *   3  TAG_Int
 *   4  TAG_Long
 *   5  TAG_Float
 *   6  TAG_Double
 *   7  TAG_Byte_Array
 *   8  TAG_String
 *   9  TAG_List
 *   10 TAG_Compound
 *   11 TAG_Int_Array
 *   12 TAG_Long_Array
 */

// ═══════════════════════════════════════════════════════════════
//  NBT Tag 型別定義
// ═══════════════════════════════════════════════════════════════

export const TAG = {
  End: 0,
  Byte: 1,
  Short: 2,
  Int: 3,
  Long: 4,
  Float: 5,
  Double: 6,
  ByteArray: 7,
  String: 8,
  List: 9,
  Compound: 10,
  IntArray: 11,
  LongArray: 12,
} as const;

export type TagType = typeof TAG[keyof typeof TAG];

export type NBTValue =
  | number
  | bigint
  | string
  | Int8Array
  | Int32Array
  | BigInt64Array
  | NBTCompound
  | NBTList;

export interface NBTCompound {
  [key: string]: { type: TagType; value: NBTValue };
}

export interface NBTList {
  listType: TagType;
  values: NBTValue[];
}

// ═══════════════════════════════════════════════════════════════
//  NBTWriter - 低階二進位寫入器
// ═══════════════════════════════════════════════════════════════

export class NBTWriter {
  private buffer: Uint8Array;
  private view: DataView;
  private offset: number;
  private capacity: number;

  constructor(initialSize: number = 65536) {
    this.capacity = initialSize;
    this.buffer = new Uint8Array(this.capacity);
    this.view = new DataView(this.buffer.buffer);
    this.offset = 0;
  }

  private ensureCapacity(needed: number): void {
    while (this.offset + needed > this.capacity) {
      this.capacity *= 2;
      const newBuf = new Uint8Array(this.capacity);
      newBuf.set(this.buffer);
      this.buffer = newBuf;
      this.view = new DataView(this.buffer.buffer);
    }
  }

  private writeByte(v: number): void {
    this.ensureCapacity(1);
    this.view.setInt8(this.offset, v);
    this.offset += 1;
  }

  private writeUByte(v: number): void {
    this.ensureCapacity(1);
    this.view.setUint8(this.offset, v);
    this.offset += 1;
  }

  private writeShort(v: number): void {
    this.ensureCapacity(2);
    this.view.setInt16(this.offset, v, false); // Big Endian
    this.offset += 2;
  }

  private writeInt(v: number): void {
    this.ensureCapacity(4);
    this.view.setInt32(this.offset, v, false);
    this.offset += 4;
  }

  private writeLong(v: bigint): void {
    this.ensureCapacity(8);
    this.view.setBigInt64(this.offset, v, false);
    this.offset += 8;
  }

  private writeFloat(v: number): void {
    this.ensureCapacity(4);
    this.view.setFloat32(this.offset, v, false);
    this.offset += 4;
  }

  private writeDouble(v: number): void {
    this.ensureCapacity(8);
    this.view.setFloat64(this.offset, v, false);
    this.offset += 8;
  }

  private writeString(s: string): void {
    const encoded = new TextEncoder().encode(s);
    this.writeShort(encoded.length);
    this.ensureCapacity(encoded.length);
    this.buffer.set(encoded, this.offset);
    this.offset += encoded.length;
  }

  // ═══════════════════════════════════════════════════════════
  //  NBT Tag 寫入
  // ═══════════════════════════════════════════════════════════

  /** 寫入完整的根 TAG_Compound（含 tag type + name） */
  writeRootCompound(name: string, compound: NBTCompound): void {
    this.writeUByte(TAG.Compound);
    this.writeString(name);
    this.writeCompoundPayload(compound);
  }

  private writeTagPayload(type: TagType, value: NBTValue): void {
    switch (type) {
      case TAG.Byte:
        this.writeByte(value as number);
        break;
      case TAG.Short:
        this.writeShort(value as number);
        break;
      case TAG.Int:
        this.writeInt(value as number);
        break;
      case TAG.Long:
        this.writeLong(value as bigint);
        break;
      case TAG.Float:
        this.writeFloat(value as number);
        break;
      case TAG.Double:
        this.writeDouble(value as number);
        break;
      case TAG.ByteArray: {
        const arr = value as Int8Array;
        this.writeInt(arr.length);
        this.ensureCapacity(arr.length);
        for (let i = 0; i < arr.length; i++) {
          this.writeByte(arr[i]);
        }
        break;
      }
      case TAG.String:
        this.writeString(value as string);
        break;
      case TAG.List: {
        const list = value as NBTList;
        this.writeUByte(list.listType);
        this.writeInt(list.values.length);
        for (const item of list.values) {
          this.writeTagPayload(list.listType, item);
        }
        break;
      }
      case TAG.Compound:
        this.writeCompoundPayload(value as NBTCompound);
        break;
      case TAG.IntArray: {
        const intArr = value as Int32Array;
        this.writeInt(intArr.length);
        for (let i = 0; i < intArr.length; i++) {
          this.writeInt(intArr[i]);
        }
        break;
      }
      case TAG.LongArray: {
        const longArr = value as BigInt64Array;
        this.writeInt(longArr.length);
        for (let i = 0; i < longArr.length; i++) {
          this.writeLong(longArr[i]);
        }
        break;
      }
    }
  }

  private writeCompoundPayload(compound: NBTCompound): void {
    for (const [key, entry] of Object.entries(compound)) {
      this.writeUByte(entry.type);
      this.writeString(key);
      this.writeTagPayload(entry.type, entry.value);
    }
    this.writeUByte(TAG.End);
  }

  /** 取得最終的二進位資料 */
  getBuffer(): Uint8Array {
    return this.buffer.slice(0, this.offset);
  }
}

// ═══════════════════════════════════════════════════════════════
//  GZip 壓縮（使用瀏覽器內建 CompressionStream）
// ═══════════════════════════════════════════════════════════════

/**
 * GZip 壓縮 NBT 資料
 *
 * Minecraft .schematic 和 .litematic 檔案使用 GZip 壓縮。
 * 使用瀏覽器原生 CompressionStream API。
 */
export async function gzipCompress(data: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream !== 'undefined') {
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    writer.write(data as unknown as BufferSource);
    writer.close();

    const chunks: Uint8Array[] = [];
    const reader = cs.readable.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    let totalLen = 0;
    for (const c of chunks) totalLen += c.length;
    const result = new Uint8Array(totalLen);
    let off = 0;
    for (const c of chunks) {
      result.set(c, off);
      off += c.length;
    }
    return result;
  }

  // Fallback: 直接回傳未壓縮
  console.warn('[NBTWriter] CompressionStream not available, returning raw NBT');
  return data;
}

// ═══════════════════════════════════════════════════════════════
//  便利工具函式
// ═══════════════════════════════════════════════════════════════

/** 建立 TAG_Byte 項目 */
export function nbtByte(v: number) {
  return { type: TAG.Byte as TagType, value: v };
}

/** 建立 TAG_Short 項目 */
export function nbtShort(v: number) {
  return { type: TAG.Short as TagType, value: v };
}

/** 建立 TAG_Int 項目 */
export function nbtInt(v: number) {
  return { type: TAG.Int as TagType, value: v };
}

/** 建立 TAG_Long 項目 */
export function nbtLong(v: bigint) {
  return { type: TAG.Long as TagType, value: v };
}

/** 建立 TAG_String 項目 */
export function nbtString(v: string) {
  return { type: TAG.String as TagType, value: v };
}

/** 建立 TAG_Compound 項目 */
export function nbtCompound(v: NBTCompound) {
  return { type: TAG.Compound as TagType, value: v };
}

/** 建立 TAG_List 項目 */
export function nbtList(listType: TagType, values: NBTValue[]) {
  return { type: TAG.List as TagType, value: { listType, values } as NBTList };
}

/** 建立 TAG_ByteArray 項目 */
export function nbtByteArray(v: Int8Array) {
  return { type: TAG.ByteArray as TagType, value: v };
}

/** 建立 TAG_IntArray 項目 */
export function nbtIntArray(v: Int32Array) {
  return { type: TAG.IntArray as TagType, value: v };
}

/** 建立 TAG_LongArray 項目 */
export function nbtLongArray(v: BigInt64Array) {
  return { type: TAG.LongArray as TagType, value: v };
}
