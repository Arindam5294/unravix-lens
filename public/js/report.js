// Knot Report + Knot profile (0.6): history of knots by concept, kept only in this browser (localStorage).
// No server copy, no personal data: each entry is the concept, the slip and the fix. Clear/delete controls in the UI.
export const STORE_KEY = "lens-knots-v1";
export const MAX_ENTRIES = 200;

/** Normalise a topic so "Expanding brackets" and "expanding  brackets." group together. */
export function topicKey(t) {
  return String(t || "other").toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\s+/g, " ").trim() || "other";
}

/** Grouping key: Spark's English concept (same in every answer language), else the topic. */
export function conceptOf(e) {
  return topicKey(e && (e.concept || e.topic));
}

/** Build a history entry from an analysis (null when there was no knot). */
export function entryFrom(result, now = Date.now()) {
  const a = result && result.analysis;
  if (!a || !a.knot) return null;
  return {
    id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    ts: now,
    subject: a.subject || "other",
    category: a.category || "",
    level: a.level || "",
    topic: a.knot_report?.topic || "Other",
    concept: a.knot_report?.concept_en || "",
    error_type: a.knot_report?.error_type || "",
    tip: a.knot_report?.tip || "",
    what: a.knot.what_is_wrong || "",
    fix: a.knot.corrected_step || "",
    fixed: false,
    sample: Boolean(result.sample),
  };
}

export function load(storage = globalThis.localStorage) {
  try {
    const v = JSON.parse(storage.getItem(STORE_KEY) || "[]");
    return Array.isArray(v) ? v.filter((e) => e && typeof e.ts === "number" && e.topic) : [];
  } catch { return []; }
}

export function save(list, storage = globalThis.localStorage) {
  try { storage.setItem(STORE_KEY, JSON.stringify(list.slice(0, MAX_ENTRIES))); return true; } catch { return false; }
}

export function add(entry, storage = globalThis.localStorage) {
  if (!entry) return load(storage);
  const list = [entry, ...load(storage)].slice(0, MAX_ENTRIES);
  save(list, storage);
  return list;
}

/** "Rescan to verify" untied this knot. */
export function markFixed(id, storage = globalThis.localStorage) {
  const list = load(storage).map((e) => (e.id === id ? { ...e, fixed: true } : e));
  save(list, storage);
  return list;
}

/** Delete every entry of one concept (the × on a weak spot). */
export function removeConcept(key, storage = globalThis.localStorage) {
  const list = load(storage).filter((e) => conceptOf(e) !== key);
  save(list, storage);
  return list;
}

export function clear(storage = globalThis.localStorage) {
  try { storage.removeItem(STORE_KEY); } catch {}
  return [];
}

/**
 * Group by concept, most frequent first (ties: most recent). A concept seen 2+ times "keeps coming back".
 * @returns {{key:string, topic:string, count:number, open:number, last:number, tip:string, error_type:string, what:string, level:string, category:string, recurring:boolean}[]}
 */
export function summarize(list) {
  const map = new Map();
  for (const e of list) {
    const k = conceptOf(e);
    const g = map.get(k) || { key: k, topic: e.topic, count: 0, open: 0, last: 0, tip: e.tip, error_type: e.error_type, what: e.what || "", level: e.level || "", category: e.category || "" };
    g.count++;
    if (!e.fixed) g.open++;
    if (e.ts > g.last) {
      g.last = e.ts; g.topic = e.topic; g.tip = e.tip || g.tip; g.error_type = e.error_type || g.error_type;
      g.what = e.what || g.what; g.level = e.level || g.level; g.category = e.category || g.category;
    }
    map.set(k, g);
  }
  return [...map.values()].map((g) => ({ ...g, recurring: g.count >= 2 })).sort((a, b) => b.count - a.count || b.last - a.last);
}

/**
 * Weak concepts: still-open knots weigh 1, untied ones 0.25, and a knot from the last 14 days counts a bit more.
 * Returns the top `n` with a 0-1 score for the bar.
 */
export function weakSpots(list, n = 5, now = Date.now()) {
  const map = new Map();
  for (const e of list) {
    if (e.sample) continue;
    const k = conceptOf(e);
    const recent = now - e.ts < 14 * 864e5 ? 1.25 : 1;
    map.set(k, (map.get(k) || 0) + (e.fixed ? 0.25 : 1) * recent);
  }
  const groups = summarize(list.filter((e) => !e.sample));
  const scored = groups.map((g) => ({ ...g, score: map.get(g.key) || 0 })).filter((g) => g.score > 0).sort((a, b) => b.score - a.score || b.last - a.last);
  const top = scored[0]?.score || 1;
  return scored.slice(0, n).map((g) => ({ ...g, weight: Math.round((g.score / top) * 100) / 100 }));
}

/** The concepts sent to POST /api/practice (top 3 weak spots; no personal data). */
export function practiceConcepts(spots) {
  return spots.slice(0, 3).map((g) => ({
    topic: g.topic, slip: [g.error_type, g.what].filter(Boolean).join(": ").slice(0, 240), level: g.level || "", subject: g.category || "",
  }));
}
