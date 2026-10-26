// Client-side photo prep: honour EXIF orientation, resize to <= 1600 px, re-encode as JPEG.
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

  let q = 0.86, blob = await toBlob(canvas, q);
  while (blob && blob.size > MAX_UPLOAD_BYTES * 0.95 && q > 0.45) { q -= 0.12; blob = await toBlob(canvas, q); }
  if (!blob) throw new PrepError("encode", "Lens could not prepare that photo. Try another one.");
  if (blob.size > MAX_UPLOAD_BYTES) throw new PrepError("too_big", "That photo is still too large after shrinking. Try a simpler photo.");
  const dataUrl = await blobToDataUrl(blob);
  return { dataUrl, url: URL.createObjectURL(blob), width: w, height: h, bytes: blob.size };
}
