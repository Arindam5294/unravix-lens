import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractSseText, orderRegions, parseSamOutput } from "../src/sam.ts";

const box = (id: number, x1: number, y1: number, x2: number, y2: number, mask = "") =>
  `${id}<|box;x1=${x1};y1=${y1};x2=${x2};y2=${y2};w=1200;h=900|>` + (mask ? `<|mask;x=0;y=0;data=${mask}|>` : "");

test("empty output means zero detections", () => {
  assert.deepEqual(parseSamOutput(""), []);
  assert.deepEqual(parseSamOutput("   \n"), []);
});

test("parses a single detection with mask; w/h are image size", () => {
  const [d] = parseSamOutput(`<0f>${box(0, 160, 155, 640, 231, "77,481,~!!#UZ")}`);
  assert.equal(d.id, 0);
  assert.deepEqual([d.x1, d.y1, d.x2, d.y2], [160, 155, 640, 231]);
  assert.equal(d.imageW, 1200);
  assert.equal(d.imageH, 900);
  assert.deepEqual(d.mask, { x: 0, y: 0, h: 77, w: 481, data: "~!!#UZ" });
});

test("parses several comma-separated detections", () => {
  const line = `<0f>${box(0, 10, 300, 200, 360, "2,2,~ab")},${box(1, 12, 100, 220, 160, "2,2,~cd")},${box(2, 15, 500, 90, 560)}`;
  const dets = parseSamOutput(line);
  assert.deepEqual(dets.map((d) => d.id), [0, 1, 2]);
  assert.equal(dets[2].mask, null);
});

test("mask data containing | and > does not break parsing", () => {
  const line = `<0f>${box(0, 1, 1, 50, 20, "3,3,~a|b>c|>d")},${box(1, 1, 40, 50, 60, "3,3,~x|>")}`;
  const dets = parseSamOutput(line);
  assert.equal(dets.length, 2);
  assert.equal(dets[0].mask?.data, "~a|b>c|>d");
  assert.equal(dets[1].mask?.data, "~x|>");
});

test("optional score is read; malformed boxes are skipped", () => {
  const dets = parseSamOutput(`<0f>0<|box;x1=1;y1=2;x2=3;y2=4;w=10;h=10;score=0.91|>,1<|box;x1=a;y1=2|>`);
  assert.equal(dets.length, 1);
  assert.equal(dets[0].score, 0.91);
});

test("orderRegions sorts top-to-bottom and merges same-row boxes", () => {
  const dets = parseSamOutput(`<0f>${box(0, 10, 300, 200, 360)},${box(1, 12, 100, 220, 160)},${box(2, 250, 105, 400, 158)}`);
  const rows = orderRegions(dets);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { id: 1, x1: 12, y1: 100, x2: 400, y2: 160 });
  assert.equal(rows[1].id, 0);
});

test("real SAM 3.1 stream from the Phase 1 proof parses", () => {
  const raw = readFileSync(new URL("../../docs/proof/sam-raw.sse.txt", import.meta.url), "utf8");
  const { text, usage } = extractSseText(raw);
  const dets = parseSamOutput(text);
  assert.ok(dets.length >= 1);
  assert.ok(dets[0].mask && dets[0].mask.h > 0);
  assert.equal((usage as { images_processed: number }).images_processed, 1);
});

test("extractSseText falls back to response.completed output", () => {
  const ev = { type: "response.completed", response: { usage: { images_processed: 1 }, output: [{ content: [{ text: "<0f>0<|box;x1=1;y1=1;x2=2;y2=2;w=9;h=9|>" }] }] } };
  const { text } = extractSseText(`event: response.completed\ndata: ${JSON.stringify(ev)}\n\n`);
  assert.equal(parseSamOutput(text).length, 1);
});
