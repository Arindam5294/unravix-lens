// Unravix Lens front end (vanilla ES modules, no build step). Swanix Labs.
import { prepareImage, PrepError } from "./image.js";
import { snapToImage } from "./snap.js";
import * as Report from "./report.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const API = (document.querySelector('meta[name="lens-api"]')?.content || window.LENS_API || "").replace(/\/$/, "");
const SAMPLE_IMG = "samples/test-knot-step2.jpg";
const SAMPLE_JSON = "samples/sample-result.json";
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const panel = $("#scan-panel");
const photo = $("#photo");
const overlay = $("#overlay");
const labels = $("#labels");
const cap = $("#stage-cap");
const knotCard = $("#knot-card");
const errCard = $("#err-card");
let lastImage = null; // { dataUrl, url } of the last live photo, for "Try again"
let runId = 0;

/* ---------------- theme ---------------- */
function initTheme() {
  const btn = $("#theme");
  const sync = () => {
    const light = document.documentElement.dataset.theme === "light";
    btn.setAttribute("aria-checked", String(light));
    btn.setAttribute("aria-label", light ? "Switch to dark mode" : "Switch to light mode");
    document.querySelector('meta[name="theme-color"]').content = light ? "#f7f7fb" : "#06070b";
  };
  btn.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("lens-theme", next); } catch {}
    sync();
  });
  sync();
}

/* ---------------- reveal on scroll ---------------- */
function initReveal() {
  const els = $$(".reveal");
  if (!("IntersectionObserver" in window) || reduced()) { els.forEach((e) => e.classList.add("is-in")); return; }
  const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } }), { threshold: 0.15 });
  els.forEach((e) => io.observe(e));
}

/* ---------------- API health ---------------- */
async function checkHealth() {
  const dot = $("#api-dot"), txt = $("#api-text");
  try {
    const r = await fetch(`${API}/api/health`, { cache: "no-store" });
    const j = await r.json();
    if (j.ok && j.configured) { dot.className = "dot is-ok"; txt.textContent = "Live · Meta SAM 3.1 + Muse Spark"; }
    else { dot.className = "dot is-bad"; txt.textContent = "Live scans offline · the sample still works"; }
  } catch {
    dot.className = "dot is-bad"; txt.textContent = "Live scans offline · the sample still works";
  }
}

/* ---------------- state ---------------- */
function setState(state) {
  panel.dataset.state = state;
}

function setProgress(step) {
  $$("#progress li").forEach((li) => {
    const n = Number(li.dataset.step);
    li.classList.toggle("is-done", n < step);
    li.classList.toggle("is-on", n === step);
  });
}

function scrollToPanel() {
  const top = panel.getBoundingClientRect().top + scrollY - 84;
  if (Math.abs(scrollY - top) > 40) scrollTo({ top, behavior: reduced() ? "auto" : "smooth" });
}

function clearStage() {
  overlay.innerHTML = "";
  labels.innerHTML = "";
  cap.innerHTML = "";
}

async function showPhoto(src) {
  clearStage();
  photo.src = src;
  try { await photo.decode(); } catch {}
}

/* ---------------- flows ---------------- */
async function runSample() {
  const id = ++runId;
  setState("working");
  setProgress(0);
  scrollToPanel();
  await showPhoto(SAMPLE_IMG);
  const json = fetch(SAMPLE_JSON).then((r) => r.json());
  const beat = reduced() ? 150 : 650;
  for (let s = 1; s <= 3; s++) { await sleep(beat); if (id !== runId) return; setProgress(s); }
  await sleep(beat);
  if (id !== runId) return;
  try {
    const result = await json;
    renderResult({ ...result, sample: true });
  } catch {
    renderError("network", "The sample could not load.");
  }
}

async function runFile(file) {
  const id = ++runId;
  setState("working");
  setProgress(0);
  scrollToPanel();
  let img;
  try {
    img = await prepareImage(file);
  } catch (e) {
    if (id !== runId) return;
    clearStage();
    photo.removeAttribute("src");
    return renderError(e instanceof PrepError ? "prep" : "prep", e.message || "Lens could not open that photo.");
  }
  if (id !== runId) return;
  if (lastImage?.url) URL.revokeObjectURL(lastImage.url);
  lastImage = img;
  await showPhoto(img.url);
  await analyze(img, id);
}

async function analyze(img, id = ++runId) {
  setState("working");
  setProgress(1);
  const t1 = setTimeout(() => id === runId && setProgress(2), 1600);
  const t2 = setTimeout(() => id === runId && setProgress(3), 7000);
  const ctl = new AbortController();
  const timeout = setTimeout(() => ctl.abort(), 60_000);
  let res, body;
  try {
    res = await fetch(`${API}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: img.dataUrl }),
      signal: ctl.signal,
    });
    body = await res.json().catch(() => null);
  } catch (e) {
    body = null;
    res = { ok: false, status: e?.name === "AbortError" ? 504 : 0 };
  } finally {
    clearTimeout(t1); clearTimeout(t2); clearTimeout(timeout);
  }
  if (id !== runId) return;
  if (res.ok && body?.ok) return renderResult(body);
  const code = body?.error?.code || (res.status === 504 ? "timeout" : "network");
  renderError(code, body?.error?.message);
}

/* ---------------- result ---------------- */
const KIND = { correct: "ok", incorrect: "knot", consequence: "carry", unclear: "unclear" };
const KIND_WORD = { ok: "Untied", knot: "Knot", carry: "Carried", unclear: "Unclear" };
const SEG = { "sam-3.1": "SAM 3.1 boxes", "sam+spark": "SAM 3.1 + Spark boxes", "spark-estimate": "Spark-estimated boxes", none: "No boxes" };

function drawBoxes(boxes) {
  overlay.innerHTML = "";
  labels.innerHTML = "";
  const ns = "http://www.w3.org/2000/svg";
  boxes.forEach((b, i) => {
    const kind = KIND[b.status] || "unclear";
    const pad = 6;
    const r = document.createElementNS(ns, "rect");
    r.setAttribute("x", String(Math.max(0, b.x1 - pad)));
    r.setAttribute("y", String(Math.max(0, b.y1 - pad)));
    r.setAttribute("width", String(Math.min(1000, b.x2 + pad) - Math.max(0, b.x1 - pad)));
    r.setAttribute("height", String(Math.min(1000, b.y2 + pad) - Math.max(0, b.y1 - pad)));
    r.setAttribute("rx", "8");
    r.setAttribute("pathLength", "100");
    r.setAttribute("class", `bx bx--${kind}`);
    r.dataset.step = String(b.step_n);
    r.style.setProperty("--i", String(i));
    overlay.appendChild(r);

    const l = document.createElement("button");
    l.type = "button";
    // Prefer a tag to the right of the line (clear of the line above); fall back to above/below.
    const side = b.x2 + pad < 760;
    const below = !side && b.y1 < 70;
    l.className = `lbl lbl--${kind}${side ? " is-side" : below ? " is-below" : ""}`;
    if (side) {
      l.style.left = `${Math.min(1000, b.x2 + pad) / 10}%`;
      l.style.top = `${(b.y1 + b.y2) / 20}%`;
    } else {
      l.style.left = `${Math.max(0, Math.min(86, (b.x1 - pad) / 10))}%`;
      l.style.top = `${(below ? Math.min(1000, b.y2 + pad) : Math.max(0, b.y1 - pad)) / 10}%`;
    }
    l.style.setProperty("--i", String(i));
    l.dataset.step = String(b.step_n);
    l.textContent = kind === "knot" ? `Knot · step ${b.step_n}` : `${kind === "ok" ? "✓" : kind === "carry" ? "↯" : "?"} ${b.step_n}`;
    l.setAttribute("aria-label", `Step ${b.step_n}: ${KIND_WORD[kind]}`);
    l.addEventListener("click", () => focusStep(b.step_n));
    labels.appendChild(l);
  });
}

function focusStep(n) {
  $$(".bx").forEach((r) => r.classList.toggle("is-focus", r.dataset.step === String(n)));
  $$(".steps li").forEach((li) => li.classList.toggle("is-focus", li.dataset.step === String(n)));
}

function renderResult(result) {
  const a = result.analysis;
  let boxes = Array.isArray(result.boxes) ? result.boxes : [];
  const before = boxes;
  boxes = snapToImage(photo, boxes);
  const snapped = boxes.filter((b) => b.snapped).length;
  void before;
  drawBoxes(boxes);

  const secs = result.timing?.total_ms ? `${(result.timing.total_ms / 1000).toFixed(1)} s` : "";
  cap.innerHTML = [
    result.sample ? `<span class="chip chip--violet">Sample · cached result, no API call</span>` : "",
    `<span class="chip">${esc(SEG[result.segmentation] || "Boxes")}</span>`,
    snapped ? `<span class="chip">${snapped} snapped to ink</span>` : "",
    secs ? `<span class="chip">${secs}</span>` : "",
  ].join("");

  const steps = a.steps || [];
  const knot = a.knot;
  const stepList = `<div><p class="knot__label">Every step</p><ol class="steps">${steps.map((s) => {
    const k = KIND[s.status] || "unclear";
    return `<li data-step="${s.n}" tabindex="0"><span class="n n--${k}">${s.n}</span><span class="tx">${esc(s.transcription)}</span><span class="st">${KIND_WORD[k]}</span></li>`;
  }).join("")}</ol></div>`;
  const conf = Math.round((a.confidence || 0) * 100);
  const confRow = `<div class="conf"><span>Confidence</span><span class="conf__bar"><span style="width:${conf}%"></span></span><span>${conf}%</span></div>`;
  const qs = (a.check_questions || []).map((q, i) => `
    <button class="q" type="button" aria-expanded="false" aria-controls="qa-${i}">
      <span class="q__q"><span>${i + 1}. ${esc(q.q)}</span><span class="q__hint">Tap to reveal</span></span>
      <span class="q__a" id="qa-${i}">${esc(q.answer)}</span>
    </button>`).join("");
  const actions = `<div class="btns"><button class="btn" type="button" data-action="again"><svg class="i" aria-hidden="true"><use href="#i-camera"/></svg>Scan another</button><a class="btn btn--ghost" href="#report">Knot Report</a></div>`;
  const subject = a.subject && a.subject !== "other" ? `<span class="chip chip--violet">${esc(a.subject[0].toUpperCase() + a.subject.slice(1))}</span>` : "";

  if (knot) {
    const wrong = steps.find((s) => s.n === knot.step_n)?.transcription || "";
    knotCard.innerHTML = `
      <div class="knot__top"><span class="chip chip--knot">● Knotted at step ${knot.step_n}</span>${subject}</div>
      <h3>${esc(knot.what_is_wrong)}</h3>
      <div><p class="knot__label">The fix</p><div class="fix">${wrong ? `<span class="fix__from">${esc(wrong)}</span>` : ""}<span class="fix__to">${esc(knot.corrected_step)}</span></div></div>
      <div class="why"><p class="knot__label">Why it happens</p><p><b>${esc(knot.misconception)}</b></p><p style="margin-top:6px">${esc(knot.explanation)}</p></div>
      ${qs ? `<div><p class="knot__label">Check yourself</p><div class="qs">${qs}</div></div>` : ""}
      ${a.knot_report?.tip ? `<p class="tip"><svg class="i" aria-hidden="true"><use href="#i-sparkle"/></svg><span>${esc(a.knot_report.tip)}</span></p>` : ""}
      ${stepList}
      ${confRow}
      ${actions}`;
  } else {
    knotCard.innerHTML = `
      <div class="knot__top"><span class="chip chip--ok">✓ All untied</span>${subject}</div>
      <div class="ok-state"><h3>No knot found. Every step holds.</h3><p style="margin-top:6px">Try these to go one level deeper.</p></div>
      ${qs ? `<div><p class="knot__label">Go deeper</p><div class="qs">${qs}</div></div>` : ""}
      ${stepList}
      ${confRow}
      ${actions}`;
  }
  knotCard.classList.remove("reveal-in");
  void knotCard.offsetWidth;
  knotCard.classList.add("reveal-in");
  $$(".q", knotCard).forEach((b) => b.addEventListener("click", () => b.setAttribute("aria-expanded", String(b.getAttribute("aria-expanded") !== "true"))));
  $$(".steps li", knotCard).forEach((li) => {
    const go = () => focusStep(li.dataset.step);
    li.addEventListener("click", go);
    li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
  });
  setProgress(4);
  setState("result");

  const entry = Report.entryFrom(result);
  if (entry && !result.demo) { Report.add(entry); renderReport(); }
}

/* ---------------- errors ---------------- */
const ERRORS = {
  budget_exhausted: { t: "Lens is resting", p: "The demo budget for this hackathon is used up, so live scans are paused. The sample still shows the full flow.", sample: true },
  daily_limit: { t: "That's today's free scans", p: "Each device gets 15 live scans a day to keep Lens free for everyone. Come back tomorrow, or try the sample now.", sample: true },
  no_steps: { t: "No steps found", p: "Lens could not find handwritten working in this photo.", tips: ["One solution per photo, filling most of the frame", "Bright, even light with no strong shadows", "Dark pen or pencil on plain or ruled paper"], retake: true },
  upstream_busy: { t: "Lens is busy", p: "Lots of people are scanning right now. Try again in a minute.", retry: true },
  upstream_error: { t: "Lens couldn't read this one", p: "Something went wrong while reading the photo. Try again, or take a clearer photo.", retry: true, retake: true },
  timeout: { t: "That took too long", p: "The scan did not finish in time. Check your connection and try again.", retry: true },
  network: { t: "Can't reach Lens", p: "Live scans are offline or your connection dropped. The sample works without a connection to the API.", retry: true, sample: true },
  not_configured: { t: "Live scans are offline", p: "Lens is not connected right now. The sample still shows the full flow.", sample: true },
  prep: { t: "That photo didn't work", p: "", retake: true },
  invalid_image: { t: "That photo didn't work", p: "", retake: true },
  image_too_large: { t: "That photo is too large", p: "", retake: true },
  payload_too_large: { t: "That photo is too large", p: "", retake: true },
};

function renderError(code, message) {
  const e = ERRORS[code] || ERRORS.upstream_error;
  const p = message && (!e.p || code === "prep" || code.includes("image") || code.includes("payload")) ? message : e.p;
  const btns = [
    e.retry && lastImage ? `<button class="btn" type="button" data-action="retry"><svg class="i" aria-hidden="true"><use href="#i-redo"/></svg>Try again</button>` : "",
    e.retake ? `<button class="btn${e.retry && lastImage ? " btn--ghost" : ""}" type="button" data-action="again"><svg class="i" aria-hidden="true"><use href="#i-camera"/></svg>New photo</button>` : "",
    e.sample ? `<button class="btn btn--ghost" type="button" data-action="sample"><svg class="i" aria-hidden="true"><use href="#i-sparkle"/></svg>Try the sample</button>` : "",
  ].join("");
  errCard.innerHTML = `
    <div class="err__icon" aria-hidden="true"><svg class="i"><use href="#i-alert"/></svg></div>
    <h3>${esc(e.t)}</h3>
    <p>${esc(p)}</p>
    ${e.tips ? `<ul>${e.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
    <div class="btns">${btns || `<button class="btn" type="button" data-action="again">Start over</button>`}</div>`;
  setState("error");
}

/* ---------------- knot report ---------------- */
function renderReport() {
  const body = $("#report-body");
  const list = Report.load();
  $("#clear-report").hidden = list.length === 0;
  if (!list.length) {
    body.innerHTML = `<div class="report__empty"><b>No knots yet</b><span>Every knot Lens finds is saved here, on this device only. Topics that show up twice are flagged so you know what to practise.</span><button class="btn btn--ghost btn--sm" type="button" data-action="sample"><svg class="i" aria-hidden="true"><use href="#i-sparkle"/></svg>Try a sample</button></div>`;
    return;
  }
  const groups = Report.summarize(list);
  const recurring = groups.filter((g) => g.recurring).length;
  const fmt = (ts) => new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  body.innerHTML = `
    <div class="report__stats">
      <div class="stat glass"><b>${list.length}</b><span>knots found</span></div>
      <div class="stat glass"><b>${groups.length}</b><span>topics</span></div>
      <div class="stat glass"><b>${recurring}</b><span>keep coming back</span></div>
    </div>
    <ul class="topics">${groups.slice(0, 8).map((g) => `
      <li class="topic glass${g.recurring ? " is-recurring" : ""}">
        <span class="topic__name">${esc(g.topic)}</span>
        <span class="topic__meta">${g.recurring ? `<span class="chip chip--knot">Keeps coming back</span>` : ""}<span class="count">×${g.count}</span></span>
        <p class="topic__tip">${esc(g.tip || g.error_type)} <span style="color:var(--text-3)">· last ${fmt(g.last)}</span></p>
      </li>`).join("")}</ul>`;
}

/* ---------------- inputs ---------------- */
function pickFile(useCamera) {
  const input = $(useCamera ? "#file-camera" : "#file-any");
  input.value = "";
  input.click();
}

function initInputs() {
  for (const id of ["#file-camera", "#file-any"]) {
    $(id).addEventListener("change", (e) => {
      const f = e.target.files?.[0];
      e.target.value = ""; // allow picking the same photo again
      if (f) runFile(f);
    });
  }
  const zone = $("#dropzone");
  const over = (on) => (e) => { e.preventDefault(); zone.classList.toggle("is-over", on); };
  ["dragenter", "dragover"].forEach((t) => panel.addEventListener(t, (e) => { if (panel.dataset.state === "idle") over(true)(e); else e.preventDefault(); }));
  ["dragleave", "dragend"].forEach((t) => panel.addEventListener(t, over(false)));
  panel.addEventListener("drop", (e) => {
    over(false)(e);
    const f = [...(e.dataTransfer?.files || [])].find((f) => /^image\//.test(f.type) || /\.(heic|heif)$/i.test(f.name));
    if (f) runFile(f);
  });
  window.addEventListener("paste", (e) => {
    const f = [...(e.clipboardData?.files || [])].find((f) => /^image\//.test(f.type));
    if (f) runFile(f);
  });

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const act = el.dataset.action;
    if (act === "sample") runSample();
    else if (act === "scan") {
      const touch = matchMedia("(hover: none), (pointer: coarse)").matches;
      if (touch) pickFile(true); else { setState("idle"); scrollToPanel(); }
    } else if (act === "again") { runId++; setState("idle"); clearStage(); scrollToPanel(); }
    else if (act === "retry" && lastImage) analyze(lastImage);
  });

  $("#clear-report").addEventListener("click", () => {
    if (confirm("Clear your Knot Report on this device?")) { Report.save([]); renderReport(); }
  });
}

/* ---------------- demo hooks (screenshots / judging): ?state=scanning|result|error&code=... ---------------- */
async function demoHooks() {
  const q = new URLSearchParams(location.search);
  const st = q.get("state");
  if (!st) return;
  if (st === "scanning") {
    runId++;
    setState("working");
    await showPhoto(SAMPLE_IMG);
    setProgress(2);
  } else if (st === "result") {
    await showPhoto(SAMPLE_IMG);
    const r = await fetch(SAMPLE_JSON).then((x) => x.json());
    renderResult({ ...r, sample: true, demo: true });
  } else if (st === "error") {
    await showPhoto(SAMPLE_IMG);
    renderError(q.get("code") || "daily_limit");
  }
  if (q.has("scroll")) panel.scrollIntoView({ block: "start" });
}

initTheme();
initReveal();
initInputs();
renderReport();
checkHealth();
demoHooks();
