// 0.6 front-end modules: language list + UI strings, hint ladder + rescan verdict, Knot profile, voice WAV encoding.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as I18n from "../../public/js/i18n.js";
import { hintsFor, prevFrom, rescanVerdict, similar } from "../../public/js/verify.js";
import * as Report from "../../public/js/report.js";
import { encodeWav, toMono16k, wavDataUrl, MAX_SECONDS } from "../../public/js/voice.js";
import { LANGS as WORKER_LANGS } from "../../worker/src/lang.ts";

class Mem { m = new Map(); getItem(k) { return this.m.has(k) ? this.m.get(k) : null; } setItem(k, v) { this.m.set(k, String(v)); } removeItem(k) { this.m.delete(k); } }

test("i18n: same language codes as the Worker, 22 Indian languages, search and RTL", () => {
  assert.deepEqual(I18n.LANGS.map((l) => l.code), WORKER_LANGS.map((l) => l.code));
  assert.equal(I18n.LANGS.filter((l) => l.indian).length, 22);
  assert.ok(I18n.searchLangs("odia").some((l) => l.code === "or"));
  assert.ok(I18n.searchLangs("ଓଡ଼ିଆ").some((l) => l.code === "or"));
  assert.ok(I18n.searchLangs("swa").some((l) => l.code === "sw"));
  assert.ok(I18n.isRtl("ar") && I18n.isRtl("ur") && !I18n.isRtl("hi"));
});

test("i18n: saved choice, request fields and UI language fallback", () => {
  const st = new Mem();
  assert.equal(I18n.getPref(st), "auto");
  assert.equal(I18n.setPref("hi-IN", st), "hi");
  assert.equal(I18n.getPref(st), "hi");
  assert.equal(I18n.setPref("klingon", st), "auto");
  assert.deepEqual(I18n.langFields("or", "en-IN"), { lang: "or", ui_lang: "en-IN" });
  assert.equal(I18n.uiLangFor("auto", "ar-EG"), "ar");
  assert.equal(I18n.uiLangFor("sw", "en"), "en"); // answers in Swahili, UI strings fall back to English
  assert.equal(I18n.uiLangFor("or", "en"), "or");
});

test("i18n: every UI language has every English key, and params fill in", () => {
  const keys = Object.keys(I18n.STRINGS.en);
  for (const [code, table] of Object.entries(I18n.STRINGS)) {
    const missing = keys.filter((k) => !(k in table));
    assert.deepEqual(missing, [], `${code} is missing ${missing.join(", ")}`);
  }
  assert.equal(I18n.t("knotted_at", { n: 4 }, "en"), "Knotted at step 4");
  assert.ok(I18n.t("spot_it", { n: 3 }, "hi").includes("3"));
  assert.equal(I18n.t("no_such_key", {}, "hi"), "no_such_key");
});

const analysis = {
  steps: [{ n: 1, transcription: "3(x - 2) = 2x + 5" }, { n: 2, transcription: "3x - 2 = 2x + 5" }],
  knot: { step_n: 2, what_is_wrong: "w", misconception: "m", corrected_step: "3x - 6 = 2x + 5", hints: ["a", "b", "c"] },
  knot_report: { topic: "brackets" },
};

test("verify: three hints, with a safe fallback when Spark gave fewer", () => {
  assert.deepEqual(hintsFor(analysis.knot, analysis.steps), ["a", "b", "c"]);
  const fb = hintsFor({ ...analysis.knot, hints: ["only one"] }, analysis.steps);
  assert.equal(fb.length, 3);
  assert.equal(fb[0], "only one");
  assert.equal(hintsFor(null).length, 0);
});

test("verify: prev payload and every rescan verdict", () => {
  const prev = prevFrom({ analysis }, "e1");
  assert.deepEqual(prev, { line: "3x - 2 = 2x + 5", fix: "3x - 6 = 2x + 5", topic: "brackets", step_n: 2, entryId: "e1" });
  assert.equal(rescanVerdict(prev, { steps: [], knot: null, previous_knot: "fixed" }).kind, "untied");
  assert.equal(rescanVerdict(prev, { steps: [{ n: 4, transcription: "x = 9" }], knot: { step_n: 4 }, previous_knot: "fixed" }).kind, "next");
  assert.equal(rescanVerdict(prev, { ...analysis, previous_knot: "still_there" }).kind, "still");
  assert.equal(rescanVerdict(prev, { steps: [], knot: null, previous_knot: "not_visible" }).kind, "unseen");
  // model silent: the same wrong line again means it is still there
  assert.equal(rescanVerdict(prev, { ...analysis, previous_knot: "none" }).kind, "still");
  assert.ok(similar("3x-2=2x+5", "3x - 2 = 2x + 5") > 0.95);
});

test("report: device-only history, weak spots, remove, mark fixed, practice payload", () => {
  const st = new Mem();
  const now = Date.now();
  const mk = (concept, topic, ts) => ({ ...Report.entryFrom({ analysis: { ...analysis, category: "maths", level: "Class 7", knot_report: { topic, concept_en: concept, error_type: "slip" } } }, ts) });
  Report.add(mk("expanding brackets", "कोष्ठक खोलना", now - 1000), st);
  Report.add(mk("Expanding Brackets.", "expanding brackets", now - 500), st);
  Report.add(mk("fractions", "fractions", now), st);
  let spots = Report.weakSpots(Report.load(st), 5, now);
  assert.equal(spots[0].key, "expanding brackets"); // Hindi and English entries group by the English concept
  assert.equal(spots[0].count, 2);
  assert.equal(spots[0].weight, 1);
  const pc = Report.practiceConcepts(spots);
  assert.equal(pc.length, 2);
  assert.ok(pc[0].topic && pc[0].level === "Class 7");
  const id = Report.load(st).find((e) => e.concept === "fractions").id;
  Report.markFixed(id, st);
  assert.equal(Report.load(st).find((e) => e.id === id).fixed, true);
  Report.removeConcept("expanding brackets", st);
  spots = Report.weakSpots(Report.load(st), 5, now);
  assert.deepEqual(spots.map((g) => g.key), ["fractions"]);
  assert.deepEqual(Report.clear(st), []);
  assert.equal(Report.load(st).length, 0);
});

test("report: the cached sample never counts as a weak spot", () => {
  const st = new Mem();
  Report.add({ ...Report.entryFrom({ analysis, sample: true }), sample: true }, st);
  assert.equal(Report.weakSpots(Report.load(st)).length, 0);
});

test("voice: mono 16 kHz resample and a valid 16-bit WAV, capped at 60 s", () => {
  const sr = 48000, n = sr; // 1 s stereo
  const l = new Float32Array(n).fill(0.5), r = new Float32Array(n).fill(-0.5);
  const mono = toMono16k([l, r], sr);
  assert.equal(mono.length, 16000);
  assert.ok(Math.abs(mono[100]) < 1e-6);
  const wav = encodeWav(new Float32Array(16000).fill(1));
  const dv = new DataView(wav.buffer);
  const str = (o) => String.fromCharCode(...wav.subarray(o, o + 4));
  assert.equal(str(0), "RIFF"); assert.equal(str(8), "WAVE"); assert.equal(str(36), "data");
  assert.equal(dv.getUint16(22, true), 1); assert.equal(dv.getUint32(24, true), 16000); assert.equal(dv.getUint16(34, true), 16);
  assert.equal(dv.getInt16(44, true), 0x7fff);
  assert.equal(encodeWav(new Float32Array(16000 * (MAX_SECONDS + 5))).length, 44 + 16000 * MAX_SECONDS * 2);
  assert.ok(wavDataUrl(wav).startsWith("data:audio/wav;base64,UklGR"));
});
