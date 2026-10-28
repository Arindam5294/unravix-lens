import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { doubtCaption, judgeChip } from "../../public/js/caption.js";

const sampleDoubt = JSON.parse(readFileSync(new URL("../../public/samples/sample-doubt.json", import.meta.url), "utf8"));

test("doubt-mode caption shows the Judge access chip when the Worker says judge: true (0.5.0 fix)", () => {
  const live = { ok: true, mode: "doubt", judge: true, input: { text: true, image: false }, timing: { total_ms: 6400 }, doubt: {} };
  const html = doubtCaption(live);
  assert.match(html, /Judge access/);
  assert.match(html, /Muse Spark 1\.3/);
  assert.match(html, /Text only · no SAM call/);
  assert.match(html, /6\.4 s/);
  assert.match(doubtCaption({ ...live, input: { text: false, image: true } }), /Photo read/);
});

test("no Judge access chip for public calls or the cached sample", () => {
  assert.doesNotMatch(doubtCaption({ judge: false, input: { text: true } }), /Judge access/);
  assert.doesNotMatch(doubtCaption({ input: { text: true } }), /Judge access/);
  const s = doubtCaption({ ...sampleDoubt, sample: true });
  assert.doesNotMatch(s, /Judge access/);
  assert.match(s, /Sample · cached answer/);
  assert.equal(judgeChip({ judge: "valid" }), "", "only the boolean from /api/doubt and /api/analyze counts");
  assert.equal(judgeChip(undefined), "");
  assert.match(judgeChip({ judge: true }), /chip--violet/);
});

test("app.js renders both modes' captions through the shared judge chip", () => {
  const app = readFileSync(new URL("../../public/js/app.js", import.meta.url), "utf8");
  assert.match(app, /cap\.innerHTML = doubtCaption\(result\)/);
  assert.match(app, /judgeChip\(result\)/);
});
