// Phase 2a end-to-end check of the merged pipeline (SAM 3.1 -> Muse Spark bboxes -> merge).
// Run: MODEL_API_KEY=... NODE_USE_ENV_PROXY=1 node scripts/e2e-check.ts [image] [--sample]
// Writes docs/proof/e2e-phase2a.json; with --sample also refreshes public/samples/sample-result.json.
// Costs about $0.01-0.02 per run. Never prints or stores the key.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { analyzeImage } from "../worker/src/meta.ts";

const key = process.env.MODEL_API_KEY;
if (!key) throw new Error("MODEL_API_KEY not set");
const args = process.argv.slice(2);
const image = args.find((a) => !a.startsWith("--")) ?? "docs/proof/test-knot-step2.jpg";
const dataUrl = `data:image/jpeg;base64,${readFileSync(image).toString("base64")}`;
const t0 = Date.now();
const r = await analyzeImage(key, dataUrl);
const ms = Date.now() - t0;
const out = {
  run_at: new Date().toISOString(),
  image,
  ms,
  est_cost_usd: Number(r.costUsd.toFixed(6)),
  segmentation: r.segmentation,
  image_size: r.image,
  sam: r.sam,
  spark: r.spark,
  boxes: r.boxes,
  analysis: r.analysis,
};
writeFileSync("docs/proof/e2e-phase2a.json", JSON.stringify(out, null, 2));
if (args.includes("--sample")) {
  mkdirSync("public/samples", { recursive: true });
  const sample = {
    ok: true, version: "sample", sample: true,
    segmentation: r.segmentation, boxes: r.boxes, analysis: r.analysis,
    timing: { total_ms: ms, sam_ms: r.sam.ms, spark_ms: r.spark.ms }, sam: { boxes: r.sam.boxes, calls: r.sam.calls },
  };
  writeFileSync("public/samples/sample-result.json", JSON.stringify(sample, null, 2));
}
console.log(`ok in ${ms}ms, $${r.costUsd.toFixed(4)}, segmentation=${r.segmentation}, sam boxes=${r.sam.boxes}, steps=${r.analysis.steps.length}, knot=${r.analysis.knot?.step_n ?? "none"}`);
