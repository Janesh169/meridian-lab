/**
 * Export/import of the save as a text code or a .json file.
 * Format: "MLAB1." + base64(utf-8 JSON) + "." + crc32 (hex). The CRC only catches
 * copy/paste mistakes; it is not security. Importing always lands in LOCKED with
 * no banked break (see Store.importSave), so editing a code gains nothing.
 */
import { upgradeSave, type Save } from './save';

const PREFIX = 'MLAB1.';

let CRC_TABLE: Uint32Array | null = null;
export function crc32(str: string): number {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < str.length; i++) crc = CRC_TABLE[(crc ^ str.charCodeAt(i)) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function utf8ToB64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function b64ToUtf8(b: string): string {
  const bin = atob(b);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeSave(save: Save): string {
  const b64 = utf8ToB64(JSON.stringify(save));
  return PREFIX + b64 + '.' + crc32(b64).toString(16).padStart(8, '0');
}

/** Accepts a save code or the raw JSON of an exported .json file. */
export function decodeSave(text: string, now: number): Save {
  const t = text.trim().replace(/\s+/g, '');
  if (t.startsWith('{')) return upgradeSave(JSON.parse(text), now);
  if (!t.startsWith(PREFIX)) throw new Error('That is not a Meridian Lab save code.');
  const body = t.slice(PREFIX.length);
  const dot = body.lastIndexOf('.');
  if (dot < 0) throw new Error('The save code is incomplete.');
  const b64 = body.slice(0, dot);
  const crc = body.slice(dot + 1);
  if (crc32(b64).toString(16).padStart(8, '0') !== crc.toLowerCase()) {
    throw new Error('The save code is damaged (checksum mismatch). Copy it again in full.');
  }
  return upgradeSave(JSON.parse(b64ToUtf8(b64)), now);
}
