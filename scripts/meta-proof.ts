// Phase 1 proof: call SAM 3.1 and Muse Spark 1.3 on the rendered test image.
// Run: MODEL_API_KEY=... node scripts/meta-proof.ts [image] [--spark-only|--sam-only] [--prompt="noun phrase"]
// Node 22.18+ runs .ts directly (type stripping). Behind an HTTP proxy, add NODE_USE_ENV_PROXY=1.
// Writes raw outputs to docs/proof/. Never prints or stores the key.
import { readFileSync, writeFileSync } from "node:fs";
import { SAM_MODEL, SAM_PROMPT, SPARK_MODEL, SYSTEM_PROMPT, userPrompt } from "../worker/src/prompt.ts";
import { KNOT_SCHEMA, KNOT_SCHEMA_NAME } from "../worker/src/schema.ts";
import { parseSamOutput, orderRegions, extractSseText } from "../worker/src/sam.ts";
import { samCostUsd, sparkCostUsd } from "../worker/src/budget.ts";

const BASE = "https://api.meta.ai/v1";
const key = process.env.MODEL_API_KEY;
if (!key) throw new Error("MODEL_API_KEY not set");
const args = process.argv.slice(2);
const image = args.find((a) => !a.startsWith("--")) ?? "docs/proof/test-knot-step2.jpg";
const promptArg = args.find((a) => a.startsWith("--prompt="))?.slice(9);
const samPrompt = promptArg ?? SAM_PROMPT;
const tag = promptArg ? `-${promptArg.replace(/[^a-z0-9]+/gi, "-")}` : "";
const dataUrl = `data:image/jpeg;base64,${readFileSync(image).toString("base64")}`;
const out = "docs/proof";

async function sam() {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: SAM_MODEL,
      stream: true,
      input: [{ role: "user", content: [
        { type: "input_text", text: samPrompt },
        { type: "input_image", image_url: dataUrl },
      ] }],
    }),
  });
  const raw = await res.text();
  const ms = Date.now() - t0;
  writeFileSync(`${out}/sam-raw${tag}.sse.txt`, raw);
  if (!res.ok) throw new Error(`SAM HTTP ${res.status}: ${raw.slice(0, 500)}`);
  const { text, usage } = extractSseText(raw);
  const dets = parseSamOutput(text);
  const regions = orderRegions(dets);
  const result = { http: res.status, ms, prompt: samPrompt, output_text_head: text.slice(0, 400), usage,
    detections: dets.map(({ mask, ...d }) => ({ ...d, mask: mask ? { h: mask.h, w: mask.w, bytes: mask.data.length } : null })),
    regions, est_cost_usd: samCostUsd(1) };
  writeFileSync(`${out}/sam-result${tag}.json`, JSON.stringify(result, null, 2));
  console.log(`SAM ${res.status} in ${ms}ms, ${dets.length} detections`);
  return regions;
}

async function spark(regions: ReturnType<typeof orderRegions>) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: SPARK_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: [
          { type: "text", text: userPrompt(regions) },
          { type: "image_url", image_url: { url: dataUrl } },
        ] },
      ],
      response_format: { type: "json_schema", json_schema: { name: KNOT_SCHEMA_NAME, schema: KNOT_SCHEMA } },
    }),
  });
  const body = (await res.json()) as any;
  const ms = Date.now() - t0;
  if (!res.ok) { writeFileSync(`${out}/spark-error.json`, JSON.stringify(body, null, 2)); throw new Error(`Spark HTTP ${res.status}: ${JSON.stringify(body).slice(0, 500)}`); }
  const content = body.choices?.[0]?.message?.content ?? "";
  const analysis = JSON.parse(content);
  const result = { http: res.status, ms, model: body.model, usage: body.usage, est_cost_usd: sparkCostUsd(body.usage), analysis };
  writeFileSync(`${out}/spark-result.json`, JSON.stringify(result, null, 2));
  console.log(`Spark ${res.status} in ${ms}ms, knot at step ${analysis.knot?.step_n ?? "none"}, conf ${analysis.confidence}`);
}

const regions = args.includes("--spark-only") ? JSON.parse(readFileSync(`${out}/sam-result.json`, "utf8")).regions : await sam();
if (!args.includes("--sam-only")) await spark(regions);
