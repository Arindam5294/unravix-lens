// Public benchmark page: renders benchmark/data.json (no network calls beyond this static file).
try { const t = localStorage.getItem("lens-theme"); if (t === "light" || t === "dark") document.documentElement.dataset.theme = t; } catch {}

const $ = (s) => document.querySelector(s);
const el = (tag, props = {}, kids = []) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) { if (k === "class") n.className = v; else if (k === "text") n.textContent = v; else n.setAttribute(k, v); }
  for (const k of [].concat(kids)) if (k) n.append(k);
  return n;
};
const pct = (a, b) => `${Math.round((100 * a) / b)}%`;
const SUBJ = { computer_science: "computer science" };

const d = await (await fetch("benchmark/data.json")).json();
const s = d.summary;

const cards = [
  [`${s.final.found}/${s.knots}`, "planted mistakes found", `${pct(s.final.found, s.knots)}, all on the exact line`],
  [`${s.final.fp}/${s.clean}`, "clean pages falsely flagged", `${s.first.fp} before the second look`],
  [`${s.final.essays_ok}/${s.essays}`, "essays called open-ended", "no invented wrong line"],
  [`${s.final.correct}/${s.items}`, "items right overall", `${s.first.correct}/${s.items} on the first pass alone`],
  [`${(s.avg_ms / 1000).toFixed(1)} s`, "average answer time", `+${(s.second_look_ms / 1000).toFixed(1)} s when a mistake is flagged`],
  [`$${s.avg_cost.toFixed(3)}`, "average Meta API cost", `$${s.total_cost} for the whole run`],
];
for (const [b, span, small] of cards) $("#cards").append(el("div", { class: "card" }, [el("b", { text: b }), el("span", { text: span }), el("small", { text: small })]));
$("#runline").textContent = `Run: ${s.run}.`;

for (const r of d.real) {
  $("#real tbody").append(el("tr", {}, [el("td", { text: r.id }), el("td", { text: r.what }), el("td", { text: r.truth }), el("td", { text: r.lens + (r.note ? ` (${r.note})` : "") }),
    el("td", {}, el("span", { class: `tag ${r.ok ? "ok" : "no"}`, text: r.ok ? "✓" : "✗" }))]));
}

const subjects = ["all", ...new Set(d.rows.map((r) => r.subject))];
let pick = "all";
const draw = () => {
  const g = $("#grid"); g.textContent = "";
  for (const r of d.rows.filter((x) => pick === "all" || (pick === "misses" ? !x.ok : x.subject === pick))) {
    const verdict = r.final === "hit" ? `Found line ${r.planted}` : r.final === "clean ✓" ? "Clean, no false flag" : r.final === "not checkable ✓" ? "Open essay, not marked" :
      r.final.startsWith("missed") ? "Missed" : r.final === "±1" ? `Flagged line ${r.reported}, not ${r.planted}` : r.final === "false positive" ? "False flag" : `Flagged line ${r.reported}, not ${r.planted}`;
    const expect = r.planted ? `Planted: line ${r.planted}, ${r.error}` : r.error === "open essay" ? "Open essay" : "Clean page";
    const det = el("details", {}, [el("summary", { text: "Lines on the page" }), el("pre", { text: r.lines.map((l, i) => `${i + 1}. ${l}`).join("\n") })]);
    g.append(el("article", { class: "item" }, [
      el("img", { src: `benchmark/img/${r.id}.jpg`, alt: `Handwritten working: ${r.question}`, loading: "lazy", width: "420", height: "560" }),
      el("div", { class: "meta" }, [
        el("div", {}, [el("span", { class: `tag ${r.ok ? "ok" : "no"}`, text: r.ok ? "✓ " + verdict : "✗ " + verdict })]),
        el("div", { class: "q", text: r.question }),
        el("div", { text: `${r.id} · ${SUBJ[r.subject] || r.subject} · ${r.level}` }),
        el("div", { text: expect }),
        r.explanation ? el("div", { text: `Lens: “${r.explanation}”` }) : null,
        r.second_look === "overturned" ? el("div", { text: "Second look dropped the first-pass flag." }) : null,
        el("div", { text: `${(r.ms / 1000).toFixed(1)} s · $${r.cost.toFixed(4)}` }),
        det,
      ]),
    ]));
  }
};
for (const sub of [...subjects, "misses"]) {
  const b = el("button", { type: "button", "aria-pressed": String(sub === pick), text: sub === "all" ? "All 60" : sub === "misses" ? "Misses only" : (SUBJ[sub] || sub) });
  b.onclick = () => { pick = sub; for (const x of $("#filters").children) x.setAttribute("aria-pressed", String(x === b)); draw(); };
  $("#filters").append(b);
}
draw();
