// "Speak your doubt" (0.6). Record on the device, then resample to 16 kHz mono 16-bit WAV (what Muse Voice
// Transcribe takes) before anything leaves the phone. Pure helpers are unit-tested; record() needs a browser.
export const RATE = 16000;
export const MAX_SECONDS = 60;

/** Mix channels to mono and resample (linear) to `rate`. */
export function toMono16k(channels, inRate, rate = RATE) {
  const ch = channels.filter(Boolean);
  if (!ch.length || !inRate) return new Float32Array(0);
  const len = ch[0].length;
  const mono = new Float32Array(len);
  for (const c of ch) for (let i = 0; i < len; i++) mono[i] += c[i] / ch.length;
  if (inRate === rate) return mono;
  const outLen = Math.max(0, Math.floor((len * rate) / inRate));
  const out = new Float32Array(outLen);
  const step = inRate / rate;
  for (let i = 0; i < outLen; i++) {
    const x = i * step, i0 = Math.floor(x), f = x - i0;
    const a = mono[i0] ?? 0, b = mono[i0 + 1] ?? a;
    out[i] = a + (b - a) * f;
  }
  return out;
}

/** 16-bit PCM WAV bytes for mono float samples in [-1, 1], trimmed to MAX_SECONDS. */
export function encodeWav(samples, rate = RATE) {
  const n = Math.min(samples.length, rate * MAX_SECONDS);
  const buf = new ArrayBuffer(44 + n * 2);
  const dv = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); dv.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt ");
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, rate, true);
  dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  w(36, "data"); dv.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] || 0));
    dv.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buf);
}

export function wavDataUrl(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:audio/wav;base64,${btoa(s)}`;
}

export const canRecord = () => Boolean(globalThis.navigator?.mediaDevices?.getUserMedia && globalThis.MediaRecorder && (globalThis.AudioContext || globalThis.webkitAudioContext));

/**
 * Start recording. Returns { stop(): Promise<{dataUrl, seconds}>, cancel() }. Stops by itself at MAX_SECONDS
 * (onLimit is called). The microphone is released as soon as recording stops.
 */
export async function record({ onLimit } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const rec = new MediaRecorder(stream);
  const parts = [];
  rec.ondataavailable = (e) => { if (e.data?.size) parts.push(e.data); };
  const done = new Promise((res) => { rec.onstop = res; });
  rec.start();
  const t0 = Date.now();
  const limit = setTimeout(() => { if (rec.state === "recording") { rec.stop(); onLimit?.(); } }, MAX_SECONDS * 1000);
  const release = () => { clearTimeout(limit); stream.getTracks().forEach((t) => t.stop()); };
  return {
    startedAt: t0,
    async stop() {
      if (rec.state === "recording") rec.stop();
      await done;
      release();
      const blob = new Blob(parts, { type: rec.mimeType || "audio/webm" });
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      const ctx = new AC();
      try {
        const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
        const chans = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i));
        const mono = toMono16k(chans, audio.sampleRate);
        return { dataUrl: wavDataUrl(encodeWav(mono)), seconds: Math.min(MAX_SECONDS, mono.length / RATE) };
      } finally { ctx.close?.(); }
    },
    cancel() { if (rec.state === "recording") rec.stop(); release(); },
  };
}
