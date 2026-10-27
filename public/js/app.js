// Unravix Lens front end (vanilla ES modules, no build step). Swanix Labs.
import { prepareImage, PrepError } from "./image.js";
import { snapToImage } from "./snap.js";
import { boxToPx, clampBox, contentRect, parseObjectPosition, placeLabels } from "./layout.js";
import * as Report from "./report.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const API = (document.querySelector('meta[name="lens-api"]')?.content || window.LENS_API || "").replace(/\/$/, "");
const SAMPLE_IMG = "samples/test-knot-step2.jpg";
const SAMPLE_JSON = "samples/sample-result.json";
const SAMPLE_DOUBT = "samples/sample-doubt.json";
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
let shownBoxes = []; // boxes currently drawn, for re-layout on resize
let mode = "doubt"; // "doubt" (Ask a doubt) | "check" (Check my working)
let attached = null; // { dataUrl, url } photo attached to a doubt
let lastDoubt = null; // { text, img } of the last live doubt, for "Try again"
const asked = $("#asked");
const stage = $("#stage");

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
    else { dot.className = "dot is-bad"; txt.textContent = "Live answers offline · the samples still work"; }
  } catch {
    dot.className = "dot is-bad"; txt.textContent = "Live answers offline · the samples still work";
  }
}

/* ---------------- state ---------------- */
function setState(state) {
  panel.dataset.state = state;
}

const PROGRESS = {
  check: ["Preparing photo", "Mapping lines with SAM 3.1", "Reading every step with Muse Spark", "Finding the knot"],
  doubt: ["Reading your question", "Working out the subject and your level", "Building the explanation with Muse Spark", "Writing your check questions"],
};
function setProgressList(m) {
  $("#progress").innerHTML = PROGRESS[m].map((t, i) => `<li data-step="${i}"><i></i><span>${esc(t)}</span></li>`).join("");
}

/* ---------------- mode toggle (accessible tabs) ---------------- */
function setMode(next, { focusTab = false, scroll = false } = {}) {
  if (next !== "doubt" && next !== "check") return;
  const changed = next !== mode;
  mode = next;
  panel.dataset.mode = next;
  panel.setAttribute("aria-labelledby", `tab-${next}`);
  $$(".mode").forEach((t) => {
    const on = t.dataset.mode === next;
    t.setAttribute("aria-selected", String(on));
    t.tabIndex = on ? 0 : -1;
    if (on && focusTab) t.focus();
  });
  setProgressList(next);
  if (changed && panel.dataset.state !== "idle") { runId++; setState("idle"); clearStage(); }
  if (scroll) scrollToPanel();
}

function initModes() {
  const tabs = $$(".mode");
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => setMode(t.dataset.mode));
    t.addEventListener("keydown", (e) => {
      const k = e.key;
      let j = null;
      if (k === "ArrowRight" || k === "ArrowDown") j = (i + 1) % tabs.length;
      else if (k === "ArrowLeft" || k === "ArrowUp") j = (i - 1 + tabs.length) % tabs.length;
      else if (k === "Home") j = 0;
      else if (k === "End") j = tabs.length - 1;
      if (j === null) return;
      e.preventDefault();
      setMode(tabs[j].dataset.mode, { focusTab: true });
    });
  });
  setProgressList(mode);
}

function setProgress(step) {
  $$("#progress li").forEach((li) => {
    const n = Number(li.dataset.step);
    li.classList.toggle("is-done", n < step);
    li.classList.toggle("is-on", n === step);
  });
}

/* ---------------- fixed header offset ---------------- */
function navOffset() {
  const nav = $("#nav");
  return nav ? Math.ceil(nav.getBoundingClientRect().bottom) + 12 : 84;
}
function syncNavOffset() {
  document.documentElement.style.setProperty("--nav-offset", `${navOffset()}px`);
}

function scrollToPanel() {
  const top = panel.getBoundingClientRect().top + scrollY - navOffset();
  if (Math.abs(scrollY - top) > 40) scrollTo({ top, behavior: reduced() ? "auto" : "smooth" });
}

function clearStage() {
  overlay.innerHTML = "";
  labels.innerHTML = "";
  cap.innerHTML = "";
  shownBoxes = [];
  asked.hidden = true;
  asked.textContent = "";
  stage.classList.remove("is-textonly");
}

/* ---------------- overlay geometry ---------------- */
/**
 * Size the overlay + badge layers to the photo's rendered pixels. The <img> is width:100% with a max-height
 * and object-fit: contain, so a tall phone photo is pillarboxed: the layers must cover the image, not the frame.
 * Returns the image rect size in px, or null before the photo has loaded.
 */
function fitLayer() {
  const nw = photo.naturalWidth, nh = photo.naturalHeight, bw = photo.clientWidth, bh = photo.clientHeight;
  if (!nw || !nh || !bw || !bh) return null;
  const cs = getComputedStyle(photo);
  const fit = cs.objectFit || "fill";
  const r0 = contentRect(nw, nh, bw, bh, fit);
  const r = contentRect(nw, nh, bw, bh, fit, parseObjectPosition(cs.objectPosition, bw - r0.width, bh - r0.height));
  for (const el of [overlay, labels]) {
    el.style.left = `${photo.offsetLeft + r.left}px`;
    el.style.top = `${photo.offsetTop + r.top}px`;
    el.style.width = `${r.width}px`;
    el.style.height = `${r.height}px`;
  }
  return { width: r.width, height: r.height };
}

/** Place every badge next to its box, without collisions and inside the image. */
function layoutLabels() {
  const size = fitLayer();
  if (!size) return;
  const els = $$(".lbl", labels);
  const items = els.map((el) => {
    const b = shownBoxes.find((x) => String(x.step_n) === el.dataset.step);
    return b && { id: el, box: boxToPx(clampBox(b, BOX_PAD), size.width, size.height), w: el.offsetWidth, h: el.offsetHeight, priority: el.classList.contains("lbl--knot") ? 2 : 0 };
  }).filter(Boolean);
  const pos = placeLabels(items, size);
  for (const [el, p] of pos) {
    el.style.left = `${Math.round(p.left)}px`;
    el.style.top = `${Math.round(p.top)}px`;
    el.dataset.side = p.side;
  }
}

async function showPhoto(src) {
  clearStage();
  photo.src = src;
  try { await photo.decode(); } catch {}
}

/* ---------------- flows ---------------- */
async function runSample() {
  if (mode === "doubt") return runDoubtSample();
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

/* ---------------- Ask a doubt ---------------- */
function showAsked(text, imgUrl) {
  if (imgUrl) {
    stage.classList.remove("is-textonly");
  } else {
    stage.classList.add("is-textonly");
    photo.removeAttribute("src");
  }
  asked.hidden = !text;
  asked.textContent = text || "";
}

async function runDoubtSample() {
  const id = ++runId;
  setState("working");
  setProgress(0);
  scrollToPanel();
  clearStage();
  const json = fetch(SAMPLE_DOUBT).then((r) => r.json());
  let result;
  try { result = await json; } catch { return renderError("network", "The sample could not load."); }
  if (id !== runId) return;
  showAsked(result.asked || "", null);
  const beat = reduced() ? 150 : 600;
  for (let s = 1; s <= 3; s++) { await sleep(beat); if (id !== runId) return; setProgress(s); }
  await sleep(beat);
  if (id !== runId) return;
  renderDoubt({ ...result, sample: true });
}

async function attachFile(file) {
  const box = $("#ask-box");
  try {
    const img = await prepareImage(file);
    if (attached?.url) URL.revokeObjectURL(attached.url);
    attached = img;
    $("#ask-img").src = img.url;
    $("#ask-thumb").hidden = false;
    box.classList.remove("is-over");
  } catch (e) {
    setMode("doubt");
    renderError("prep", e?.message || "Lens could not open that photo.");
  }
}

function clearAttachment() {
  if (attached?.url) URL.revokeObjectURL(attached.url);
  attached = null;
  $("#ask-img").removeAttribute("src");
  $("#ask-thumb").hidden = true;
}

async function submitDoubt(text, img) {
  text = (text || "").trim();
  if (!text && !img) {
    const ta = $("#ask-text");
    ta.focus();
    ta.setAttribute("aria-invalid", "true");
    $("#ask-hint").textContent = "Type a question first, or add a photo of it.";
    return;
  }
  $("#ask-text").removeAttribute("aria-invalid");
  lastDoubt = { text, img };
  const id = ++runId;
  setState("working");
  setProgress(0);
  scrollToPanel();
  clearStage();
  if (img) await showPhoto(img.url);
  showAsked(text, img?.url);
  setProgress(1);
  const t1 = setTimeout(() => id === runId && setProgress(2), 1800);
  const t2 = setTimeout(() => id === runId && setProgress(3), 9000);
  const ctl = new AbortController();
  const timeout = setTimeout(() => ctl.abort(), 60_000);
  let res, body;
  try {
    res = await fetch(`${API}/api/doubt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(img ? { text, image: img.dataUrl } : { text }),
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
  if (res.ok && body?.ok) return renderDoubt({ ...body, asked: text });
  const code = body?.error?.code || (res.status === 504 ? "timeout" : "network");
  renderError(code, body?.error?.message);
}

const CATEGORY = {
  maths: "Maths", physics: "Physics", chemistry: "Chemistry", biology: "Biology", statistics: "Statistics",
  accounting: "Accounting", economics: "Economics", computer_science: "Computer science", language: "Language",
  history: "History", geography: "Geography", social_science: "Social science", engineering: "Engineering",
};
/** Subject + level chips shared by both modes. */
function detectChips(a) {
  const cat = CATEGORY[a.category] || CATEGORY[a.subject] || "";
  const topic = a.subject && !CATEGORY[a.subject] && a.subject.toLowerCase() !== cat.toLowerCase() ? a.subject : "";
  return [
    cat ? `<span class="chip chip--violet">${esc(cat)}</span>` : "",
    topic ? `<span class="chip">${esc(topic)}</span>` : "",
    a.level ? `<span class="chip chip--ok">${esc(a.level)}</span>` : "",
  ].join("");
}

function questionsHtml(list, prefix = "qa") {
  return (list || []).map((q, i) => `
    <button class="q" type="button" aria-expanded="false" aria-controls="${prefix}-${i}">
      <span class="q__q"><span>${i + 1}. ${esc(q.q)}</span><span class="q__hint">Tap to reveal</span></span>
      <span class="q__a" id="${prefix}-${i}">${esc(q.answer)}</span>
    </button>`).join("");
}

function wireCard() {
  $$(".q", knotCard).forEach((b) => b.addEventListener("click", () => b.setAttribute("aria-expanded", String(b.getAttribute("aria-expanded") !== "true"))));
  knotCard.classList.remove("reveal-in");
  void knotCard.offsetWidth;
  knotCard.classList.add("reveal-in");
}

function renderDoubt(result) {
  const d = result.doubt || {};
  const secs = result.timing?.total_ms ? `${(result.timing.total_ms / 1000).toFixed(1)} s` : "";
  cap.innerHTML = [
    result.sample ? `<span class="chip chip--violet">Sample · cached answer, no API call</span>` : "",
    `<span class="chip">Muse Spark 1.3</span>`,
    result.input?.image ? `<span class="chip">Photo read</span>` : `<span class="chip">Text only · no SAM call</span>`,
    secs ? `<span class="chip">${secs}</span>` : "",
  ].join("");
  if (result.asked !== undefined && !asked.textContent && !photo.getAttribute("src")) showAsked(result.asked || d.question || "", null);
  const qs = questionsHtml(d.check_questions, "dq");
  const steps = (d.steps || []).map((s) => `<li>${s.title ? `<b>${esc(s.title)}</b>` : ""}${s.detail ? `<p>${esc(s.detail)}</p>` : ""}</li>`).join("");
  const conf = Math.round((d.confidence || 0) * 100);
  knotCard.innerHTML = `
    <div class="knot__top"><span class="chip chip--ok">✓ Untangled</span>${detectChips(d)}</div>
    <h3>${esc(d.question || "Here's how it works")}</h3>
    ${d.answer ? `<div class="answer"><p class="knot__label">Answer</p><b>${esc(d.answer)}</b></div>` : ""}
    <div><p class="knot__label">Step by step</p><ol class="explain">${steps}</ol></div>
    ${d.key_idea ? `<p class="key"><svg class="i" aria-hidden="true"><use href="#i-bulb"/></svg><span><b>Key idea.</b> ${esc(d.key_idea)}</span></p>` : ""}
    ${d.misconception ? `<div class="trap"><p class="knot__label">Watch out</p><p>${esc(d.misconception)}</p></div>` : ""}
    ${qs ? `<div><p class="knot__label">Check yourself</p><div class="qs">${qs}</div></div>` : ""}
    <div class="conf"><span>Confidence</span><span class="conf__bar"><span style="width:${conf}%"></span></span><span>${conf}%</span></div>
    <div class="btns"><button class="btn" type="button" data-action="again"><svg class="i" aria-hidden="true"><use href="#i-chat"/></svg>Ask another</button><button class="btn btn--ghost" type="button" data-action="mode-check"><svg class="i" aria-hidden="true"><use href="#i-target"/></svg>Check my working</button></div>`;
  wireCard();
  setProgress(4);
  setState("result");
}

/* ---------------- result ---------------- */
const KIND = { correct: "ok", incorrect: "knot", consequence: "carry", unclear: "unclear" };
const KIND_WORD = { ok: "Untied", knot: "Knot", carry: "Carried", unclear: "Unclear" };
const SEG = { "sam-3.1": "SAM 3.1 boxes", "sam+spark": "SAM 3.1 + Spark boxes", "spark-estimate": "Spark-estimated boxes", none: "No boxes" };

const BOX_PAD = 6; // grid units around the ink

function drawBoxes(boxes) {
  overlay.innerHTML = "";
  labels.innerHTML = "";
  shownBoxes = boxes;
  const ns = "http://www.w3.org/2000/svg";
  boxes.forEach((b, i) => {
    const kind = KIND[b.status] || "unclear";
    // clamp to the image (inset 1 so the stroke is not cut at the edge)
    const c = clampBox(b, BOX_PAD, 1);
    const r = document.createElementNS(ns, "rect");
    r.setAttribute("x", String(c.x1));
    r.setAttribute("y", String(c.y1));
    r.setAttribute("width", String(c.x2 - c.x1));
    r.setAttribute("height", String(c.y2 - c.y1));
    r.setAttribute("rx", "8");
    r.setAttribute("pathLength", "100");
    r.setAttribute("class", `bx bx--${kind}`);
    r.dataset.step = String(b.step_n);
    r.style.setProperty("--i", String(i));
    overlay.appendChild(r);

    const l = document.createElement("button");
    l.type = "button";
    l.className = `lbl lbl--${kind} is-placed`;
    l.style.setProperty("--i", String(i));
    l.dataset.step = String(b.step_n);
    l.textContent = kind === "knot" ? `Knot · step ${b.step_n}` : `${kind === "ok" ? "✓" : kind === "carry" ? "↯" : "?"} ${b.step_n}`;
    l.setAttribute("aria-label", `Step ${b.step_n}: ${KIND_WORD[kind]}`);
    l.addEventListener("click", () => focusStep(b.step_n, true));
    labels.appendChild(l);
  });
  layoutLabels();
}

function focusStep(n, fromBadge = false) {
  $$(".bx").forEach((r) => r.classList.toggle("is-focus", r.dataset.step === String(n)));
  $$(".steps li").forEach((li) => li.classList.toggle("is-focus", li.dataset.step === String(n)));
  if (fromBadge) {
    // scroll-margin-top keeps the row clear of the fixed header
    $(`.steps li[data-step="${n}"]`)?.scrollIntoView({ block: "nearest", behavior: reduced() ? "auto" : "smooth" });
  }
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
  const subject = detectChips(a);

  if (a.checkable === false) {
    knotCard.innerHTML = `
      <div class="knot__top"><span class="chip chip--amber">Not step-checkable</span>${subject}</div>
      <h3>There's no single right line of working here.</h3>
      <div class="nc"><p>${esc(a.not_checkable_reason || "This looks like an essay or an opinion, so there is no one wrong step to find.")}</p><p>Lens can explain the topic instead, at your level.</p></div>
      ${qs ? `<div><p class="knot__label">Think about</p><div class="qs">${qs}</div></div>` : ""}
      <div class="btns"><button class="btn" type="button" data-action="explain-instead"${lastImage ? "" : " disabled"}><svg class="i" aria-hidden="true"><use href="#i-chat"/></svg>Explain this instead</button><button class="btn btn--ghost" type="button" data-action="again"><svg class="i" aria-hidden="true"><use href="#i-camera"/></svg>Scan another</button></div>`;
  } else if (knot) {
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
  wireCard();
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
  daily_limit: { t: "That's today's free questions", p: "Each device gets 15 free questions and scans a day to keep Lens free for everyone. Come back tomorrow, or try a sample now.", sample: true },
  empty_doubt: { t: "Nothing to explain yet", p: "Type a question or add a photo of it.", retake: true },
  doubt_too_long: { t: "That question is very long", p: "Keep it under 2,000 characters, or photograph the page instead.", retake: true },
  no_steps: { t: "No steps found", p: "Lens could not find handwritten working in this photo.", tips: ["One solution per photo, filling most of the frame", "Bright, even light with no strong shadows", "Dark pen or pencil on plain or ruled paper"], retake: true },
  upstream_busy: { t: "Lens is busy", p: "Lots of people are scanning right now. Try again in a minute.", retry: true },
  upstream_error: { t: "Lens couldn't untangle this one", p: "Something went wrong while reading it. Try again, or rephrase the question or take a clearer photo.", retry: true, retake: true },
  timeout: { t: "That took too long", p: "The scan did not finish in time. Check your connection and try again.", retry: true },
  network: { t: "Can't reach Lens", p: "Live scans are offline or your connection dropped. The sample works without a connection to the API.", retry: true, sample: true },
  not_configured: { t: "Live scans are offline", p: "Lens is not connected right now. The sample still shows the full flow.", sample: true },
  prep: { t: "That photo didn't work", p: "", retake: true },
  invalid_image: { t: "That photo didn't work", p: "", retake: true },
  image_too_large: { t: "That photo is too large", p: "", retake: true },
  payload_too_large: { t: "That photo is too large", p: "", retake: true },
};

const canRetry = () => (mode === "doubt" ? Boolean(lastDoubt) : Boolean(lastImage));

function renderError(code, message) {
  const e = ERRORS[code] || ERRORS.upstream_error;
  const p = message && (!e.p || code === "prep" || code.includes("image") || code.includes("payload") || code.includes("doubt")) ? message : e.p;
  const btns = [
    e.retry && canRetry() ? `<button class="btn" type="button" data-action="retry"><svg class="i" aria-hidden="true"><use href="#i-redo"/></svg>Try again</button>` : "",
    e.retake ? `<button class="btn${e.retry && canRetry() ? " btn--ghost" : ""}" type="button" data-action="again"><svg class="i" aria-hidden="true"><use href="#i-${mode === "doubt" ? "chat" : "camera"}"/></svg>${mode === "doubt" ? "Edit question" : "New photo"}</button>` : "",
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
  const askBox = $("#ask-box");
  const overAny = (on) => (e) => { e.preventDefault(); (mode === "doubt" ? askBox : zone).classList.toggle("is-over", on); };
  ["dragenter", "dragover"].forEach((t) => panel.addEventListener(t, (e) => { if (panel.dataset.state === "idle") overAny(true)(e); else e.preventDefault(); }));
  ["dragleave", "dragend"].forEach((t) => panel.addEventListener(t, overAny(false)));
  panel.addEventListener("drop", (e) => {
    overAny(false)(e);
    const f = [...(e.dataTransfer?.files || [])].find((f) => /^image\//.test(f.type) || /\.(heic|heif)$/i.test(f.name));
    if (!f) return;
    if (mode === "doubt") attachFile(f); else runFile(f);
  });
  window.addEventListener("paste", (e) => {
    const f = [...(e.clipboardData?.files || [])].find((f) => /^image\//.test(f.type));
    if (!f) return;
    if (mode === "doubt") { if (panel.dataset.state === "idle") attachFile(f); } else runFile(f);
  });

  // Ask a doubt form
  const ta = $("#ask-text");
  const count = () => { const n = ta.value.length; const c = $("#ask-count"); c.textContent = `${n} / 2000`; c.classList.toggle("is-near", n > 1800); };
  ta.addEventListener("input", () => { count(); ta.removeAttribute("aria-invalid"); });
  ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); $("#ask").requestSubmit(); } });
  $("#ask").addEventListener("submit", (e) => { e.preventDefault(); submitDoubt(ta.value, attached); });
  $("#ask-file").addEventListener("change", (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) attachFile(f); });
  $("#ask-rm").addEventListener("click", clearAttachment);
  $$(".ex").forEach((b) => b.addEventListener("click", () => { ta.value = b.dataset.ex; count(); ta.focus(); }));
  count();

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const act = el.dataset.action;
    if (act === "sample") runSample();
    else if (act === "mode-doubt" || act === "mode-check") {
      setMode(act === "mode-doubt" ? "doubt" : "check", { scroll: true });
      if (panel.dataset.state !== "idle") { runId++; setState("idle"); clearStage(); }
      if (mode === "doubt") setTimeout(() => $("#ask-text").focus({ preventScroll: true }), reduced() ? 0 : 450);
    } else if (act === "scan") {
      setMode("check");
      const touch = matchMedia("(hover: none), (pointer: coarse)").matches;
      if (touch) pickFile(true); else { setState("idle"); scrollToPanel(); }
    } else if (act === "again") { runId++; setState("idle"); clearStage(); scrollToPanel(); if (mode === "doubt") $("#ask-text").focus({ preventScroll: true }); }
    else if (act === "retry") { if (mode === "doubt" && lastDoubt) submitDoubt(lastDoubt.text, lastDoubt.img); else if (lastImage) analyze(lastImage); }
    else if (act === "explain-instead" && lastImage) {
      setMode("doubt");
      submitDoubt("This is my written work. It has no single right answer, so please explain the topic and how to write a strong answer.", lastImage);
    }
  });

  $("#clear-report").addEventListener("click", () => {
    if (confirm("Clear your Knot Report on this device?")) { Report.save([]); renderReport(); }
  });
}

/* ---------------- demo hooks (screenshots / judging): ?state=scanning|result|error&code=... ---------------- */
async function demoHooks() {
  const q = new URLSearchParams(location.search);
  if (q.get("mode")) setMode(q.get("mode"));
  const st = q.get("state");
  if (!st) { if (q.has("scroll")) panel.scrollIntoView({ block: "start" }); return; }
  if (mode === "doubt" && (st === "scanning" || st === "result")) {
    const r = await fetch(SAMPLE_DOUBT).then((x) => x.json());
    showAsked(r.asked || "", null);
    if (st === "scanning") { runId++; setState("working"); setProgress(2); }
    else renderDoubt({ ...r, sample: true });
  } else if (st === "nc") {
    await showPhoto(SAMPLE_IMG);
    const r = await fetch(SAMPLE_JSON).then((x) => x.json());
    renderResult({ ...r, sample: true, demo: true, boxes: (r.boxes || []).map((b) => ({ ...b, status: "unclear" })), analysis: { ...r.analysis, steps: (r.analysis.steps || []).map((x) => ({ ...x, status: "unclear" })), checkable: false, knot: null, not_checkable_reason: "This is an opinion paragraph, so there is no single right line of reasoning to check.", category: "language", subject: "Opinion writing", level: "Class 9" } });
  } else if (st === "scanning") {
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

function initLayout() {
  syncNavOffset();
  const relayout = () => { syncNavOffset(); if (shownBoxes.length) layoutLabels(); else fitLayer(); };
  addEventListener("resize", relayout, { passive: true });
  if ("ResizeObserver" in window) new ResizeObserver(relayout).observe(photo);
  photo.addEventListener("load", relayout);
  document.fonts?.ready?.then(relayout).catch(() => {});
}

initTheme();
initModes();
initLayout();
initReveal();
initInputs();
renderReport();
checkHealth();
demoHooks();
