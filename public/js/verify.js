// Hint ladder + "Rescan to verify" logic (0.6). Pure functions, unit-tested; the DOM side lives in app.js.

/** The 3 escalating hints for a knot: Spark's own (same call), else a safe fallback built from the knot fields. */
export function hintsFor(knot, steps = []) {
  if (!knot) return [];
  const got = Array.isArray(knot.hints) ? knot.hints.filter((h) => typeof h === "string" && h.trim()).slice(0, 3) : [];
  if (got.length === 3) return got;
  const line = steps.find((s) => s.n === knot.step_n)?.transcription || "";
  const fallback = [
    `Look closely at step ${knot.step_n}${line ? `: ${line}` : ""}. Redo it yourself from the line before it.`,
    knot.misconception ? `Think about this: ${knot.misconception}` : "Check which rule that step uses, and whether it was applied fully.",
    knot.what_is_wrong || "Compare each term of that step with the line before it.",
  ];
  return [...got, ...fallback.slice(got.length)].slice(0, 3);
}

/** The knot the student is about to fix, as sent back in "prev" on the rescan. */
export function prevFrom(result, entryId = null) {
  const a = result && result.analysis;
  if (!a || !a.knot) return null;
  const line = (a.steps || []).find((s) => s.n === a.knot.step_n)?.transcription || "";
  return { line: line.slice(0, 300), fix: String(a.knot.corrected_step || "").slice(0, 300), topic: String(a.knot_report?.topic || "").slice(0, 120), step_n: a.knot.step_n, entryId };
}

const norm = (s) => String(s || "").toLowerCase().replace(/[\s{}$\\]/g, "").replace(/[−–]/g, "-");

/** Rough similarity (0-1) of two transcriptions, by shared character bigrams. */
export function similar(a, b) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const grams = (s) => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); } return m; };
  const gx = grams(x), gy = grams(y);
  let hit = 0;
  for (const [g, c] of gx) hit += Math.min(c, gy.get(g) || 0);
  return (2 * hit) / Math.max(1, x.length - 1 + y.length - 1);
}

/**
 * Verdict of a rescan. kind: "untied" (no knot left), "next" (that knot is untied, another one remains),
 * "still" (the same knot is still there), "unseen" (the fixed step is not on this photo).
 */
export function rescanVerdict(prev, analysis) {
  if (!prev || !analysis) return null;
  const knot = analysis.knot;
  const pk = analysis.previous_knot || "none";
  const knotLine = knot ? (analysis.steps || []).find((s) => s.n === knot.step_n)?.transcription || "" : "";
  if (pk === "not_visible" && !knot) return { kind: "unseen" };
  if (pk === "still_there") return { kind: "still", n: knot ? knot.step_n : prev.step_n };
  if (!knot) return { kind: "untied" };
  if (pk === "fixed") return { kind: "next", n: knot.step_n };
  // Model said nothing useful: the same wrong line again means it is still there.
  return similar(knotLine, prev.line) >= 0.8 ? { kind: "still", n: knot.step_n } : { kind: "next", n: knot.step_n };
}
