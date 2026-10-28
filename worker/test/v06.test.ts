// 0.6 features: any language, hint ladder, rescan-to-verify, practice set with a second checking pass, prompt guards.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import worker, { readPrev, validatePractice, type Env } from "../src/index.ts";
import { LANGS, findLang, languageRule, readLang } from "../src/lang.ts";
import { SYSTEM_PROMPT, prevKnotLine } from "../src/prompt.ts";
import { KNOT_SCHEMA, applyVerification, conceptKey, parseAnalysis, parseDoubt, parseHints, parseLangCode, parsePractice, parseVerify } from "../src/schema.ts";
import type { KVLike } from "../src/budget.ts";

class MemKV implements KVLike {
  m = new Map<string, string>();
  async get(k: string) { return this.m.get(k) ?? null; }
  async put(k: string, v: string) { this.m.set(k, v); }
}
const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ" + "A".repeat(120);
const mkEnv = (kv = new MemKV()) => ({ MODEL_API_KEY: "test", LENS_KV: kv, DAILY_CAP: "5" }) as unknown as Env;
const post = (path: string, body: unknown) => new Request("https://x" + path, { method: "POST", headers: { "Content-Type": "application/json", "CF-Connecting-IP": "7.7.7.7" }, body: JSON.stringify(body) });

const knotJson = {
  page_up: "top", language: "hi", subject: "Brackets", category: "maths", level: "Class 7", level_band: "middle",
  checkable: true, not_checkable_reason: "",
  steps: [
    { n: 1, box_id: null, bbox: [100, 100, 600, 200], transcription: "3(x - 2) = 2x + 5", status: "correct" },
    { n: 2, box_id: null, bbox: [100, 300, 600, 400], transcription: "3x - 2 = 2x + 5", status: "incorrect" },
  ],
  knot: { step_n: 2, what_is_wrong: "w", misconception: "m", explanation: "e", corrected_step: "3x - 6 = 2x + 5", hints: ["h1", "h2", "h3", "h4"] },
  check_questions: [{ q: "a", answer: "1" }],
  knot_report: { error_type: "e", topic: "कोष्ठक खोलना", concept_en: "Expanding Brackets.", tip: "t" },
  previous_knot: "fixed", confidence: 0.9,
};

let bodies: { url: string; body: any }[] = [];
let sparkQueue: unknown[] = [];
const realFetch = globalThis.fetch;
beforeEach(() => {
  bodies = []; sparkQueue = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    bodies.push({ url: String(url), body });
    if (String(url).endsWith("/responses")) return new Response("data: {\"type\":\"response.completed\"}\n\n", { status: 200 });
    const next = sparkQueue.length ? sparkQueue.shift() : knotJson;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(next) } }], usage: { prompt_tokens: 500, completion_tokens: 500 } }), { status: 200 });
  }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; });
const sparkCalls = () => bodies.filter((b) => b.url.endsWith("/chat/completions"));

test("language list: all 22 scheduled Indian languages plus the major world ones, unique codes", () => {
  assert.equal(LANGS.filter((l) => l.indian).length, 22);
  for (const c of ["hi", "or", "bn", "ta", "te", "mr", "ur", "sat", "mni", "es", "fr", "ar", "zh", "pt", "ru", "ja", "de", "sw", "id"]) assert.ok(findLang(c), c);
  assert.equal(new Set(LANGS.map((l) => l.code)).size, LANGS.length);
  assert.ok(findLang("ar")?.rtl && findLang("ur")?.rtl && !findLang("hi")?.rtl);
});

test("findLang/readLang: BCP-47 tags, regional variants, junk falls back to auto + English", () => {
  assert.equal(findLang("hi-IN")?.code, "hi");
  assert.equal(findLang("zh-TW")?.code, "zh-Hant");
  assert.equal(findLang("zh-CN")?.code, "zh");
  assert.equal(findLang("tl")?.code, "fil");
  assert.equal(findLang("x"), null);
  assert.equal(findLang("<script>"), null);
  assert.deepEqual(readLang("or", "en-US").lang?.name, "Odia");
  const a = readLang("auto", "es-MX");
  assert.equal(a.mode, "auto"); assert.equal(a.fallback.code, "es");
  const j = readLang("klingon!!", 42);
  assert.equal(j.mode, "auto"); assert.equal(j.fallback.code, "en");
});

test("languageRule: fixed names the language and keeps maths; auto matches the student, then the browser", () => {
  const f = languageRule(readLang("ar", "en"), "FIELDS");
  assert.match(f, /Arabic/); assert.match(f, /formula/); assert.match(f, /"ar"/);
  const a = languageRule(readLang("auto", "hi-IN"), "FIELDS");
  assert.match(a, /language the student used/); assert.match(a, /use Hindi/);
});

test("prompt guards against the two real false positives: crossed-out ink and notation conventions", () => {
  assert.match(SYSTEM_PROMPT, /crossed out/);
  assert.match(SYSTEM_PROMPT, /x1·x2ᵀ for row vectors/);
  assert.match(SYSTEM_PROMPT, /EVERY reasonable reading/);
  assert.match(SYSTEM_PROMPT, /3 escalating hints/);
});

test("knot schema asks for hints, language, concept_en and previous_knot in the same call", () => {
  const p = KNOT_SCHEMA.properties;
  assert.ok(p.knot.required.includes("hints"));
  assert.ok(KNOT_SCHEMA.required.includes("language"));
  assert.ok(KNOT_SCHEMA.required.includes("previous_knot"));
  assert.ok(p.knot_report.required.includes("concept_en"));
});

test("parseAnalysis: 3 hints max, language code, English concept key, previous_knot", () => {
  const a = parseAnalysis(JSON.stringify(knotJson));
  assert.deepEqual(a.knot?.hints, ["h1", "h2", "h3"]);
  assert.equal(a.language, "hi");
  assert.equal(a.knot_report.concept_en, "expanding brackets");
  assert.equal(a.previous_knot, "fixed");
  const old = parseAnalysis(JSON.stringify({ ...knotJson, language: "not a lang!", previous_knot: "maybe", knot: { ...knotJson.knot, hints: undefined } }));
  assert.equal(old.language, ""); assert.equal(old.previous_knot, "none"); assert.deepEqual(old.knot?.hints, []);
  assert.deepEqual(parseHints(["", "  a ", 3, "b"]), ["a", "b"]);
  assert.equal(parseLangCode("zh-Hant"), "zh-Hant");
  assert.equal(conceptKey("Chain Rule!"), "chain rule");
});

test("parseDoubt keeps the answer language", () => {
  const d = parseDoubt({ language: "es", subject: "s", category: "maths", level: "Class 5", level_band: "primary", question: "q", answer: "a", steps: [{ title: "t", detail: "d" }], key_idea: "k", misconception: "m", check_questions: [], confidence: 1 });
  assert.equal(d.language, "es");
});

test("analyze: lang and prev reach Spark (system language rule + rescan line); response has hints + previous_knot", async () => {
  const res = await worker.fetch(post("/api/analyze", { image: JPEG, lang: "hi", ui_lang: "en-IN", prev: { line: "3x - 2 = 2x + 5", fix: "3x - 6 = 2x + 5", topic: "brackets" } }), mkEnv());
  assert.equal(res.status, 200);
  const b = (await res.json()) as any;
  assert.equal(b.version, "0.6.0");
  assert.deepEqual(b.analysis.knot.hints, ["h1", "h2", "h3"]);
  assert.equal(b.analysis.previous_knot, "fixed");
  const s = sparkCalls()[0].body;
  assert.match(s.messages[0].content, /Write every student-facing text.*in Hindi/s);
  assert.match(s.messages[1].content[0].text, /Rescan to verify/);
});

test("doubt: auto language falls back to the browser language in the prompt", async () => {
  sparkQueue = [{ language: "or", subject: "s", category: "maths", level: "Class 5", level_band: "primary", question: "q", answer: "a", steps: [{ title: "t", detail: "d" }], key_idea: "k", misconception: "m", check_questions: [], confidence: 1 }];
  const res = await worker.fetch(post("/api/doubt", { text: "Why 1/2 = 2/4?", lang: "auto", ui_lang: "or-IN" }), mkEnv());
  const b = (await res.json()) as any;
  assert.equal(b.doubt.language, "or");
  assert.match(sparkCalls()[0].body.messages[0].content, /use Odia/);
});

test("readPrev / validatePractice", () => {
  assert.equal(readPrev(null), null);
  assert.equal(readPrev({ line: "", fix: "" }), null);
  assert.deepEqual(readPrev({ line: " a  b ", fix: "c", topic: 5 }), { line: "a b", fix: "c", topic: "" });
  assert.equal(validatePractice({}).ok, false);
  assert.equal(validatePractice({ concepts: [{ slip: "x" }] }).ok, false);
  const v = validatePractice({ concepts: [{ topic: "chain rule" }, { topic: "signs" }], count: 9 });
  assert.ok(v.ok && v.count === 5 && v.concepts.length === 2);
  const d = validatePractice({ concepts: [{ topic: "t" }] });
  assert.ok(d.ok && d.count === 3);
});

test("practice: two Spark passes; only problems the checker agrees with come back, marked verified", async () => {
  sparkQueue = [
    { language: "en", title: "Brackets", problems: [
      { concept: "brackets", question: "Expand 2(x+3)", hint: "h", answer: "2x+6", solution: ["2·x + 2·3"], trap: "t" },
      { concept: "brackets", question: "Expand -3(x-1)", hint: "h", answer: "-3x-3", solution: ["s"], trap: "t" },
      { concept: "signs", question: "5 - (2 - 1)", hint: "h", answer: "4", solution: ["s"], trap: "t" },
    ] },
    { checks: [{ i: 0, verdict: "agree", correct_answer: "2x+6" }, { i: 1, verdict: "disagree", correct_answer: "-3x+3" }, { i: 2, verdict: "agree", correct_answer: "4" }] },
  ];
  const kv = new MemKV();
  const res = await worker.fetch(post("/api/practice", { concepts: [{ topic: "brackets", slip: "sign of the second term" }], count: 3, lang: "en" }), mkEnv(kv));
  assert.equal(res.status, 200);
  const b = (await res.json()) as any;
  assert.equal(b.practice.problems.length, 2);
  assert.ok(b.practice.problems.every((p: any) => p.verified));
  assert.equal(b.verification.dropped, 1);
  assert.equal(sparkCalls().length, 2);
  assert.ok(b.cost_usd > 0);
  assert.ok(Number(kv.m.get("budget:total_usd") ?? [...kv.m.entries()].find(([k]) => k.includes("budget"))?.[1]) > 0);
});

test("practice: validation error before any API call; parse helpers", async () => {
  const res = await worker.fetch(post("/api/practice", { concepts: [] }), mkEnv());
  assert.equal(res.status, 400);
  assert.equal(((await res.json()) as any).error.code, "bad_practice");
  assert.equal(bodies.length, 0);
  assert.throws(() => parsePractice({ problems: [] }));
  assert.deepEqual(parseVerify({ checks: [{ i: 0, verdict: "x", correct_answer: "1" }] })[0].verdict, "disagree");
  const set = { language: "en", title: "t", problems: [{ concept: "c", question: "q", hint: "", answer: "a", solution: [], trap: "" }] };
  assert.equal(applyVerification(set, []).set.problems.length, 0);
  assert.match(prevKnotLine({ line: "l", fix: "f", topic: "t" }), /still_there/);
  assert.equal(prevKnotLine(null), "");
});

test("knot confirmation: a second look that disagrees removes the knot and resets the lines", async () => {
  sparkQueue = [knotJson, { confirmed: false, reason: "the flagged ink is crossed out" }];
  const res = await worker.fetch(post("/api/analyze", { image: JPEG }), mkEnv());
  const j = await res.json() as any;
  assert.equal(j.ok, true);
  assert.equal(j.analysis.knot, null);
  assert.ok(j.analysis.steps.every((s: any) => s.status === "correct"));
  assert.deepEqual(j.confirmation, { checked: true, overturned: true });
  assert.equal(sparkCalls().length, 2);
  assert.match(JSON.stringify(sparkCalls()[1].body.messages[1].content), /flagged line 2/);
});

test("knot confirmation: agreement keeps the knot; a failed second look keeps the first answer", async () => {
  sparkQueue = [knotJson, { confirmed: true, reason: "3(x-2) is 3x-6" }];
  let j = await (await worker.fetch(post("/api/analyze", { image: JPEG }), mkEnv())).json() as any;
  assert.equal(j.analysis.knot.step_n, 2);
  assert.deepEqual(j.confirmation, { checked: true, overturned: false });
  sparkQueue = [knotJson, { nonsense: 1 }];
  j = await (await worker.fetch(post("/api/analyze", { image: JPEG }), mkEnv())).json() as any;
  assert.equal(j.analysis.knot.step_n, 2);
  assert.equal(j.confirmation.checked, false);
});

test("knot confirmation: clean pages and CONFIRM_KNOT=0 make no second call", async () => {
  sparkQueue = [{ ...knotJson, knot: null, steps: knotJson.steps.map((s) => ({ ...s, status: "correct" })) }];
  await worker.fetch(post("/api/analyze", { image: JPEG }), mkEnv());
  assert.equal(sparkCalls().length, 1);
  bodies = [];
  await worker.fetch(post("/api/analyze", { image: JPEG }), { ...mkEnv(), CONFIRM_KNOT: "0" } as Env);
  assert.equal(sparkCalls().length, 1);
});
