// Client-side photo prep: honour EXIF orientation, resize to <= 1600 px, re-encode as JPEG.
// 0.5.0: rotatePrepared() turns a photo upright (Rotate button / auto-orientation); grayOf() feeds orient.js.
// Re-encoding through a canvas drops all EXIF/GPS metadata, so location never leaves the phone.

export const MAX_EDGE = 1600;
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // matches the Worker limit
export const MAX_INPUT_BYTES = 30 * 1024 * 1024;

export class PrepError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/** Scale (w, h) so the long edge is at most `max`. Never upscales. */
export function fitSize(w, h, max = MAX_EDGE) {
  const s = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

/** Approximate decoded size of a base64 data URL. */
export function dataUrlBytes(dataUrl) {
  const i = dataUrl.indexOf(",");
  const b64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
  return Math.floor((b64.length * 3) / 4);
}

async function decode(file) {
  if ("createImageBitmap" in window) {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch { /* fall through */ }
  }
  // Fallback: <img> applies EXIF orientation in modern browsers (image-orientation: from-image).
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function toBlob(canvas, quality) {
  return new Promise((res) => canvas.toBlob((b) => res(b), "image/jpeg", quality));
}

function blobToDataUrl(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

/**
 * @param {File} file
 * @returns {Promise<{dataUrl:string, url:string, width:number, height:number, bytes:number}>}
 */
export async function prepareImage(file) {
  if (!file) throw new PrepError("no_file", "No photo selected.");
  const looksImage = /^image\//.test(file.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name || "");
  if (!looksImage) throw new PrepError("not_image", "That file is not a photo. Choose a JPEG, PNG or WebP image.");
  if (file.size > MAX_INPUT_BYTES) throw new PrepError("too_big", "That photo is very large. Try a photo under 30 MB.");

  let src;
  try { src = await decode(file); } catch {
    throw new PrepError("decode", /heic|heif/i.test(file.type + file.name)
      ? "This browser cannot open HEIC photos. On iPhone, set Camera > Formats to Most Compatible, or take the photo with the Open camera button."
      : "Lens could not open that photo. Try another one.");
  }
  const sw = src.width || src.naturalWidth, sh = src.height || src.naturalHeight;
  if (!sw || !sh) throw new PrepError("decode", "Lens could not open that photo. Try another one.");
  if (Math.min(sw, sh) < 200) throw new PrepError("too_small", "That photo is too small to read. Move closer and try again.");

  const { w, h } = fitSize(sw, sh);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff"; // flatten transparency (PNG/WebP) onto white paper
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, w, h);
  if (src.close) src.close();

  const { blob, dataUrl } = await encode(canvas);
  return { dataUrl, url: URL.createObjectURL(blob), width: w, height: h, bytes: blob.size };
}

function loadImage(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new PrepError("decode", "Lens could not open that photo. Try another one."));
    img.src = url;
  });
}

async function encode(canvas) {
  let q = 0.86, blob = await toBlob(canvas, q);
  while (blob && blob.size > MAX_UPLOAD_BYTES * 0.95 && q > 0.45) { q -= 0.12; blob = await toBlob(canvas, q); }
  if (!blob) throw new PrepError("encode", "Lens could not prepare that photo. Try another one.");
  if (blob.size > MAX_UPLOAD_BYTES) throw new PrepError("too_big", "That photo is still too large after shrinking. Try a simpler photo.");
  return { blob, dataUrl: await blobToDataUrl(blob) };
}

/**
 * Turn a prepared photo by `deg` clockwise (90 / 180 / 270) and re-encode it, so the pixels Lens sends are
 * upright. Returns a new prepared image; the caller revokes the old object URL.
 * @param {{url:string,width:number,height:number}} img @param {number} deg
 */
export async function rotatePrepared(img, deg) {
  const r = ((Math.round(deg / 90) * 90) % 360 + 360) % 360;
  const src = await loadImage(img.url);
  const w = src.naturalWidth, h = src.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = r % 180 === 0 ? w : h;
  canvas.height = r % 180 === 0 ? h : w;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((r * Math.PI) / 180);
  ctx.drawImage(src, -w / 2, -h / 2);
  const { blob, dataUrl } = await encode(canvas);
  return { dataUrl, url: URL.createObjectURL(blob), width: canvas.width, height: canvas.height, bytes: blob.size };
}

/**
 * Small grayscale copy of a prepared photo (long edge `max` px) for on-device checks such as orientation.
 * @param {{url:string}} img @returns {Promise<{gray:Uint8ClampedArray,w:number,h:number}|null>}
 */
export async function grayOf(img, max = 256) {
  try {
    const src = await loadImage(img.url);
    const s = Math.min(1, max / Math.max(src.naturalWidth, src.naturalHeight));
    const w = Math.max(8, Math.round(src.naturalWidth * s)), h = Math.max(8, Math.round(src.naturalHeight * s));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(src, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    const gray = new Uint8ClampedArray(w * h);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) gray[j] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    return { gray, w, h };
  } catch {
    return null;
  }
}
