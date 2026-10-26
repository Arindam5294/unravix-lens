// Read width/height from JPEG, PNG or WebP bytes without decoding pixels (Workers have no canvas).

export interface ImageSize { w: number; h: number }

export function b64ToBytes(b64: string, maxBytes = Infinity): Uint8Array {
  const chars = Math.min(b64.length, Number.isFinite(maxBytes) ? Math.ceil(maxBytes / 3) * 4 : b64.length);
  const bin = atob(b64.slice(0, chars - (chars % 4)));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function imageSize(bytes: Uint8Array): ImageSize | null {
  const u16be = (i: number) => (bytes[i] << 8) | bytes[i + 1];
  const u16le = (i: number) => bytes[i] | (bytes[i + 1] << 8);
  const u24le = (i: number) => bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16);
  const ok = (s: ImageSize) => (s.w > 0 && s.h > 0 ? s : null);
  // PNG: IHDR is always first
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return ok({ w: dv.getUint32(16), h: dv.getUint32(20) });
  }
  // JPEG: walk markers to the first SOFn
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) { i++; continue; }
      const m = bytes[i + 1];
      if (m === 0xff) { i++; continue; }
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      const len = u16be(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return ok({ h: u16be(i + 5), w: u16be(i + 7) });
      if (len < 2) return null;
      i += 2 + len;
    }
    return null;
  }
  // WebP
  if (bytes.length >= 30 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") {
    const kind = String.fromCharCode(...bytes.slice(12, 16));
    if (kind === "VP8X") return ok({ w: u24le(24) + 1, h: u24le(27) + 1 });
    if (kind === "VP8 ") return ok({ w: u16le(26) & 0x3fff, h: u16le(28) & 0x3fff });
    if (kind === "VP8L") {
      const b = bytes.slice(21, 25);
      return ok({ w: 1 + (((b[1] & 0x3f) << 8) | b[0]), h: 1 + (((b[3] & 0xf) << 10) | (b[2] << 2) | ((b[1] & 0xc0) >> 6)) });
    }
  }
  return null;
}

export function dataUrlSize(dataUrl: string): ImageSize | null {
  const i = dataUrl.indexOf("base64,");
  if (i < 0) return null;
  try { return imageSize(b64ToBytes(dataUrl.slice(i + 7))); } catch { return null; }
}
