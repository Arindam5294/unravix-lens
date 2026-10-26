// Knot Report: history of knots, kept only in this browser (localStorage). No server copy.
export const STORE_KEY = "lens-knots-v1";
export const MAX_ENTRIES = 200;

/** Normalise a topic so "Expanding brackets" and "expanding  brackets." group together. */
export function topicKey(t) {
  return String(t || "other").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim() || "other";
}

/** Build a history entry from an analysis (null when there was no knot). */
export function entryFrom(result, now = Date.now()) {
  const a = result && result.analysis;
  if (!a || !a.knot) return null;
  return {
    id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    ts: now,
    subject: a.subject || "other",
    topic: a.knot_report?.topic || "Other",
    error_type: a.knot_report?.error_type || "",
    tip: a.knot_report?.tip || "",
    what: a.knot.what_is_wrong || "",
    fix: a.knot.corrected_step || "",
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

/**
 * Group by topic, most frequent first (ties: most recent). A topic seen 2+ times "keeps coming back".
 * @returns {{key:string, topic:string, count:number, last:number, tip:string, error_type:string, recurring:boolean}[]}
 */
export function summarize(list) {
  const map = new Map();
  for (const e of list) {
    const k = topicKey(e.topic);
    const g = map.get(k) || { key: k, topic: e.topic, count: 0, last: 0, tip: e.tip, error_type: e.error_type };
    g.count++;
    if (e.ts > g.last) { g.last = e.ts; g.topic = e.topic; g.tip = e.tip || g.tip; g.error_type = e.error_type || g.error_type; }
    map.set(k, g);
  }
  return [...map.values()].map((g) => ({ ...g, recurring: g.count >= 2 })).sort((a, b) => b.count - a.count || b.last - a.last);
}
