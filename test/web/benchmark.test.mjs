// The public benchmark page's data must agree with itself, and every item must ship its image.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const d = JSON.parse(readFileSync("public/benchmark/data.json", "utf8"));

test("benchmark: summary matches the per-item rows", () => {
  const s = d.summary;
  assert.equal(d.rows.length, s.items);
  const knots = d.rows.filter((r) => r.planted !== null);
  assert.equal(knots.length, s.knots);
  assert.equal(knots.filter((r) => r.final === "hit").length, s.final.found);
  assert.equal(d.rows.filter((r) => r.ok).length, s.final.correct);
  assert.equal(d.rows.filter((r) => r.error === "open essay").length, s.essays);
});

test("benchmark: every item has its image and lines; the page and nav link exist", () => {
  for (const r of d.rows) {
    assert.ok(existsSync(`public/benchmark/img/${r.id}.jpg`), r.id);
    assert.ok(r.lines.length >= 2, r.id);
  }
  assert.match(readFileSync("public/index.html", "utf8"), /href="benchmark\.html"/);
  assert.match(readFileSync("public/benchmark.html", "utf8"), /js\/bench\.js/);
});
