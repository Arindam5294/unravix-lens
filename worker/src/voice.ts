// "Speak your doubt" (0.6): Muse Voice Transcribe turns a short spoken doubt into text, which the student checks
// and sends to /api/doubt like a typed one. The browser records, resamples to 16 kHz mono and encodes WAV itself.
import { META_BASE, MetaApiError, fetchWithRetry } from "./meta.ts";

export const VOICE_MODEL = "muse-voice-transcribe-1.0";
/** $0.18 per hour of audio. */
export const VOICE_USD_PER_SEC = 0.18 / 3600;
/** 60 s of 16 kHz mono 16-bit PCM is 1.92 MB; allow 24 kHz too. */
export const MAX_VOICE_SECONDS = 60;
export const MAX_VOICE_BYTES = 24000 * 2 * MAX_VOICE_SECONDS + 4096;
/** Separate, generous allowance so speaking a doubt never uses up the 15 free questions. */
export const DEFAULT_VOICE_CAP = 40;

export type WavCheck = { ok: true; bytes: Uint8Array; seconds: number } | { ok: false; error: string };

const DATA_RE = /^data:audio\/(?:wav|x-wav|wave);base64,([A-Za-z0-9+/]+={0,2})$/;

/** Accept only a RIFF/WAVE, mono, 16-bit PCM clip at 16 or 24 kHz, at most 60 s. */
export function validateWav(audio: unknown): WavCheck {
  if (typeof audio !== "string") return { ok: false, error: "Send the recording as a WAV data URL in the \"audio\" field." };
  const m = DATA_RE.exec(audio);
  if (!m) return { ok: false, error: "The recording must be a WAV file." };
  const est = Math.floor((m[1].length * 3) / 4);
  if (est > MAX_VOICE_BYTES) return { ok: false, error: `Keep the recording under ${MAX_VOICE_SECONDS} seconds.` };
  let bin: string;
  try { bin = atob(m[1]); } catch { return { ok: false, error: "The recording could not be read." }; }
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  if (b.length < 44) return { ok: false, error: "The recording is empty." };
  const dv = new DataView(b.buffer);
  const str = (o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));
  if (str(0, 4) !== "RIFF" || str(8, 4) !== "WAVE" || str(12, 4) !== "fmt ") return { ok: false, error: "The recording must be a WAV file." };
  const format = dv.getUint16(20, true), channels = dv.getUint16(22, true), rate = dv.getUint32(24, true), bits = dv.getUint16(34, true);
  if (format !== 1 || channels !== 1 || bits !== 16 || (rate !== 16000 && rate !== 24000)) {
    return { ok: false, error: "The recording must be mono 16-bit PCM at 16 or 24 kHz." };
  }
  const seconds = (b.length - 44) / (rate * 2);
  if (seconds < 0.3) return { ok: false, error: "That recording is too short. Hold the mic and speak your doubt." };
  if (seconds > MAX_VOICE_SECONDS + 1) return { ok: false, error: `Keep the recording under ${MAX_VOICE_SECONDS} seconds.` };
  return { ok: true, bytes: b, seconds };
}

export interface VoiceResult { text: string; seconds: number; costUsd: number; ms: number }

export async function transcribe(apiKey: string, wav: Uint8Array, seconds: number, fetchImpl: typeof fetch = fetch): Promise<VoiceResult> {
  const t0 = Date.now();
  const form = new FormData();
  form.append("request", new Blob([JSON.stringify({ model: VOICE_MODEL, audioEncoding: "WAV", mode: "PUSH_TO_TALK" })], { type: "application/json" }));
  form.append("audio", new Blob([wav], { type: "audio/wav" }), "doubt.wav");
  const res = await fetchWithRetry(`${META_BASE}/asr/transcribe`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    body: form,
  }, 2, fetchImpl);
  if (!res.ok) throw new MetaApiError(res.status, `voice transcribe ${res.status}`);
  const j = (await res.json()) as { transcript?: unknown; audioDurationMs?: unknown; turns?: { transcript?: unknown }[] };
  let text = typeof j.transcript === "string" ? j.transcript : "";
  if (!text && Array.isArray(j.turns)) text = j.turns.map((t) => (typeof t?.transcript === "string" ? t.transcript : "")).join(" ");
  const secs = typeof j.audioDurationMs === "number" && j.audioDurationMs > 0 ? j.audioDurationMs / 1000 : seconds;
  return { text: text.replace(/\s+/g, " ").trim().slice(0, 2000), seconds: secs, costUsd: secs * VOICE_USD_PER_SEC, ms: Date.now() - t0 };
}
