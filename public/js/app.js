// Unravix Lens front end (vanilla ES modules, no build step). Swanix Labs.
import { prepareImage, PrepError, rotatePrepared, grayOf } from "./image.js";
import { normRot, rotateBox, textAxis } from "./orient.js";
import { snapToImage } from "./snap.js";
import { boxToPx, clampBox, contentRect, parseObjectPosition, placeLabels } from "./layout.js";
import * as Report from "./report.js";
import { doubtCaption, judgeChip } from "./caption.js";
import * as I18n from "./i18n.js";
import { hintsFor, prevFrom, rescanVerdict } from "./verify.js";
import * as Voice from "./voice.js";

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
let lastImage = null; // { dataUrl, url, width, height } of the photo to scan (upright as sent), for "Try again"
let viewImage = null; // a rotated copy shown after a result when the student turns the view (never sent)
let viewRot = 0; // clockwise turn of the result view, 0/90/180/270
let resultBoxes = []; // boxes of the last result as drawn at viewRot 0 (after the ink snap)
let resultBase = null; // { url } of the photo the last result was drawn on (the live photo or the sample)
let runId = 0;
let shownBoxes = []; // boxes currently drawn, for re-layout on resize
let mode = "doubt"; // "doubt" (Ask a doubt) | "check" (Check my working)
let attached = null; // { dataUrl, url } photo attached to a doubt
let lastDoubt = null; // { text, img } of the last live doubt, for "Try again"
const asked = $("#asked");
const stage = $("#stage");
const previewCard = $("#preview-card");
/** Sideways pages are turned this way by default: every real sideways phone photo so far needed it (0.5.0). */
const AUTO_TURN = 270;
const SCAN_TIMEOUT_MS = 90_000;
const JUDGE_KEY = "lens-judge";
let judgeCode = null;
let langPref = I18n.getPref(); // "auto" or a language code, kept on this device only
const navLang = () => (navigator.languages && navigator.languages[0]) || navigator.language || "en";
let uiLang = I18n.uiLangFor(langPref, navLang());
const tt = (key, params) => I18n.t(key, params, uiLang);
/** lang + ui_lang for every billed request. */
const langBody = () => I18n.langFields(langPref, navLang());
let pendingPrev = null;
let lastResult = null; // { result, entryId } of the last check, for "Rescan to verify" // the knot the student says they fixed, sent once with the next scan ("Rescan to verify")

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
    const r = await fetch(`${API}/api/health`, { cache: "no-store", headers: judgeCode ? { "X-Lens-Judge": judgeCode } : {} });
    const j = await r.json();
    if (j.ok && j.configured) { dot.className = "dot is-ok"; txt.textContent = "Live · Meta SAM 3.1 + Muse Spark"; }
    else { dot.className = "dot is-bad"; txt.textContent = "Live answers offline · the samples still work"; }
    if (j.judge === "invalid") { setJudge(null); judgeNote("That judge code was not recognised, so the public daily limit applies."); }
    else if (j.judge === "valid") judgeNote("");
    syncJudgeBadge();
  } catch {
    dot.className = "dot is-bad"; txt.textContent = "Live answers offline · the samples still work";
  }
}

/* ---------------- judges' access: ?judge=CODE link or the footer dialog ---------------- */
function apiHeaders() {
  const h = { "Content-Type": "application/json" };
  if (judgeCode) h["X-Lens-Judge"] = judgeCode;
  return h;
}
function setJudge(code) {
  judgeCode = code ? String(code).trim().slice(0, 200) || null : null;
  try { if (judgeCode) localStorage.setItem(JUDGE_KEY, judgeCode); else localStorage.removeItem(JUDGE_KEY); } catch {}
  syncJudgeBadge();
}
function syncJudgeBadge() {
  const b = $("#judge-badge");
  if (b) b.hidden = !judgeCode;
  const rm = $("#judge-remove");
  if (rm) rm.hidden = !judgeCode;
}
function judgeNote(msg) {
  const n = $("#judge-note");
  if (n) { n.textContent = msg; n.hidden = !msg; }
}
function initJudge() {
  const q = new URLSearchParams(location.search);
  let code = null;
  try { code = localStorage.getItem(JUDGE_KEY); } catch {}
  if (q.get("judge")) {
    code = q.get("judge");
    // keep the code out of the address bar, screenshots and shared links
    q.delete("judge");
    history.replaceState(null, "", location.pathname + (q.toString() ? `?${q}` : "") + location.hash);
  }
  setJudge(code);
  const dlg = $("#judge-dlg"), input = $("#judge-code");
  $("#judge-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (e.submitter?.value === "cancel") { dlg.close(); return; }
    const v = input.value.trim();
    if (!v) { input.setAttribute("aria-invalid", "true"); input.focus(); return; }
    setJudge(v);
    input.value = "";
    dlg.close();
    await checkHealth();
  });
  $("#judge-remove").addEventListener("click", () => { setJudge(null); judgeNote(""); dlg.close(); });
  input.addEventListener("input", () => input.removeAttribute("aria-invalid"));
}
function openJudge() {
  const dlg = $("#judge-dlg");
  if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
  setTimeout(() => $("#judge-code").focus(), 30);
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

/** After 25 s: say that long pages take longer, so a slow scan does not look stuck. */
function slowHint(on) {
  const el = $("#slow-hint");
  if (el) el.hidden = !on;
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
  resultBoxes = [];
  viewRot = 0;
  if (viewImage?.url) URL.revokeObjectURL(viewImage.url);
  viewImage = null;
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
  // Sideways page? Text lines that run down the photo are found on-device for free; turn it upright first.
  let turned = 0;
  const g = await grayOf(img);
  if (g && textAxis(g.gray, g.w, g.h).axis === "down") {
    try {
      const up = await rotatePrepared(img, AUTO_TURN);
      URL.revokeObjectURL(img.url);
      img = up;
      turned = AUTO_TURN;
    } catch { /* keep the photo as it is; the Rotate button still works */ }
  }
  if (id !== runId) return;
  setLastImage(img);
  await showPhoto(img.url);
  showPreview(turned);
}

function setLastImage(img) {
  if (lastImage?.url && lastImage.url !== img.url) URL.revokeObjectURL(lastImage.url);
  lastImage = img;
}

/** Preview: the photo as Lens will read it, with Rotate controls, before any paid call. */
function showPreview(turned = 0) {
  previewCard.innerHTML = `
    <div class="knot__top"><span class="chip chip--ok">Photo ready</span>${turned ? `<span class="chip chip--violet">Turned upright</span>` : ""}</div>
    <h3>Is the writing the right way up?</h3>
    <p class="pv__note">${turned
      ? "The page was sideways, so Lens turned it. If the writing still isn't upright, rotate it before scanning."
      : "Lens reads best when lines run left to right. Rotate the photo if it is sideways or upside down."}</p>
    <div class="btns pv__go">
      <button class="btn" type="button" data-action="scan-now"><svg class="i" aria-hidden="true"><use href="#i-target"/></svg>Find the knot</button>
    </div>
    <div class="pv__rot" role="group" aria-label="Rotate photo">
      <button class="btn btn--ghost" type="button" data-action="rotate" data-deg="270" aria-label="Rotate left 90 degrees"><svg class="i" aria-hidden="true"><use href="#i-rotl"/></svg>Rotate left</button>
      <button class="btn btn--ghost" type="button" data-action="rotate" data-deg="90" aria-label="Rotate right 90 degrees"><svg class="i" aria-hidden="true"><use href="#i-rotr"/></svg>Rotate right</button>
    </div>
    <div class="btns">
      <button class="btn btn--ghost btn--sm" type="button" data-action="again"><svg class="i" aria-hidden="true"><use href="#i-camera"/></svg>New photo</button>
    </div>`;
  setState("preview");
  setTimeout(() => $('[data-action="scan-now"]', previewCard)?.focus({ preventScroll: true }), 60);
}

let rotating = false;
/** Rotate button. Preview: turns the photo that will be sent. Result: turns the view, boxes follow. */
async function rotateBy(deg) {
  const state = panel.dataset.state;
  if (rotating || (state === "preview" ? !lastImage : !resultBase)) return;
  rotating = true;
  const btns = $$('[data-action="rotate"]');
  btns.forEach((b) => (b.disabled = true));
  try {
    if (state === "preview") {
      const img = await rotatePrepared(lastImage, deg);
      setLastImage(img);
      await showPhoto(img.url);
      setState("preview");
    } else if (state === "result") {
      viewRot = normRot(viewRot + deg);
      const old = viewImage;
      viewImage = viewRot ? await rotatePrepared(resultBase, viewRot) : null;
      if (old?.url) URL.revokeObjectURL(old.url);
      photo.src = viewImage ? viewImage.url : resultBase.url;
      try { await photo.decode(); } catch {}
      drawBoxes(resultBoxes.map((b) => rotateBox(b, viewRot)), { keep: true });
      const again = $("#rescan-view");
      if (again) again.hidden = viewRot === 0;
    }
  } catch {
    renderError("prep", "Lens could not rotate that photo. Try another one.");
  } finally {
    rotating = false;
    btns.forEach((b) => (b.disabled = false));
  }
}

/** "Scan again this way up": the turned view becomes the photo Lens reads. */
async function rescanRotated(deg) {
  if (!lastImage) return;
  try {
    const img = await rotatePrepared(lastImage, deg);
    setLastImage(img);
    clearStage();
    await showPhoto(img.url);
    analyze(img);
  } catch {
    renderError("prep", "Lens could not rotate that photo. Try another one.");
  }
}

async function analyze(img, id = ++runId) {
  const prev = pendingPrev;
  pendingPrev = null;
  setState("working");
  setProgress(1);
  const t1 = setTimeout(() => id === runId && setProgress(2), 1600);
  const t2 = setTimeout(() => id === runId && setProgress(3), 7000);
  const t3 = setTimeout(() => id === runId && slowHint(true), 25_000);
  const ctl = new AbortController();
  const timeout = setTimeout(() => ctl.abort(), SCAN_TIMEOUT_MS);
  let res, body;
  try {
    res = await fetch(`${API}/api/analyze`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ image: img.dataUrl, ...langBody(), ...(prev ? { prev } : {}) }),
      signal: ctl.signal,
    });
    body = await res.json().catch(() => null);
  } catch (e) {
    body = null;
    res = { ok: false, status: e?.name === "AbortError" ? 504 : 0 };
  } finally {
    clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(timeout);
    slowHint(false);
  }
  if (id !== runId) return;
  if (res.ok && body?.ok) return renderResult(prev ? { ...body, rescanOf: prev } : body);
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
  const t3 = setTimeout(() => id === runId && slowHint(true), 25_000);
  const ctl = new AbortController();
  const timeout = setTimeout(() => ctl.abort(), SCAN_TIMEOUT_MS);
  let res, body;
  try {
    res = await fetch(`${API}/api/doubt`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify(img ? { text, image: img.dataUrl, ...langBody() } : { text, ...langBody() }),
      signal: ctl.signal,
    });
    body = await res.json().catch(() => null);
  } catch (e) {
    body = null;
    res = { ok: false, status: e?.name === "AbortError" ? 504 : 0 };
  } finally {
    clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(timeout);
    slowHint(false);
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
  cap.innerHTML = doubtCaption(result);
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
/** Clockwise turn that makes the page upright, from Spark's page_up (same map as the Worker's rotationFor). */
const PAGE_TURN = { right: 270, bottom: 180, left: 90 };

function drawBoxes(boxes, { keep = false } = {}) {
  overlay.innerHTML = "";
  labels.innerHTML = "";
  shownBoxes = boxes;
  overlay.classList.toggle("is-instant", keep); // a re-draw after Rotate does not replay the draw-in animation
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
  resultBoxes = boxes;
  resultBase = result.sample ? { url: photo.currentSrc || photo.src } : lastImage;
  viewRot = 0;
  drawBoxes(boxes);

  const secs = result.timing?.total_ms ? `${(result.timing.total_ms / 1000).toFixed(1)} s` : "";
  cap.innerHTML = [
    result.sample ? `<span class="chip chip--violet">Sample · cached result, no API call</span>` : "",
    `<span class="chip">${esc(SEG[result.segmentation] || "Boxes")}</span>`,
    snapped ? `<span class="chip">${snapped} snapped to ink</span>` : "",
    secs ? `<span class="chip">${secs}</span>` : "",
    judgeChip(result),
    boxes.length ? `<button class="chip chip--btn" type="button" data-action="rotate" data-deg="90" aria-label="Rotate the photo and boxes 90 degrees right"><svg class="i" aria-hidden="true"><use href="#i-rotr"/></svg>Rotate</button>` : "",
    !result.sample && boxes.length ? `<button class="chip chip--btn" type="button" id="rescan-view" data-action="rescan-view" hidden>Scan again this way up</button>` : "",
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
  const turn = PAGE_TURN[a.page_up] || 0;
  const sideways = !result.sample && turn && lastImage
    ? `<div class="warn" role="note"><p><b>This photo looks ${a.page_up === "bottom" ? "upside down" : "sideways"}.</b> Lens reads pages best upright, and the boxes may be off.</p><button class="btn btn--sm" type="button" data-action="rotate-rescan" data-deg="${turn}"><svg class="i" aria-hidden="true"><use href="#i-rotr"/></svg>Turn upright and scan again</button></div>`
    : "";

  const entry = Report.entryFrom(result);
  lastResult = { result, entryId: entry && !result.demo ? entry.id : null };
  let verdict = "";
  if (result.rescanOf) {
    const v = rescanVerdict(result.rescanOf, a);
    if (v) {
      if ((v.kind === "untied" || v.kind === "next") && result.rescanOf.entryId) Report.markFixed(result.rescanOf.entryId);
      const msg = v.kind === "untied" ? tt("untied") : v.kind === "next" ? tt("next_knot", { n: v.n }) : v.kind === "still" ? tt("still_there", { n: v.n }) : tt("not_visible");
      const cls = v.kind === "untied" || v.kind === "next" ? "ok" : v.kind === "still" ? "knot" : "amber";
      verdict = `<div class="verdict verdict--${cls}" role="status"><b>${esc(msg)}</b>${v.kind === "untied" ? `<span>${esc(tt("untied_sub"))}</span>` : ""}</div>`;
    }
  }

  if (a.checkable === false) {
    knotCard.innerHTML = `
      <div class="knot__top"><span class="chip chip--amber">Not step-checkable</span>${subject}</div>${sideways}
      <h3>There's no single right line of working here.</h3>
      <div class="nc"><p>${esc(a.not_checkable_reason || "This looks like an essay or an opinion, so there is no one wrong step to find.")}</p><p>Lens can explain the topic instead, at your level.</p></div>
      ${qs ? `<div><p class="knot__label">Think about</p><div class="qs">${qs}</div></div>` : ""}
      <div class="btns"><button class="btn" type="button" data-action="explain-instead"${lastImage ? "" : " disabled"}><svg class="i" aria-hidden="true"><use href="#i-chat"/></svg>Explain this instead</button><button class="btn btn--ghost" type="button" data-action="again"><svg class="i" aria-hidden="true"><use href="#i-camera"/></svg>Scan another</button></div>`;
  } else if (knot) {
    const wrong = steps.find((s) => s.n === knot.step_n)?.transcription || "";
    const hints = hintsFor(knot, steps);
    knotCard.innerHTML = `
      ${verdict}
      <div class="knot__top"><span class="chip chip--knot">● ${esc(tt("knotted_at", { n: knot.step_n }))}</span>${subject}</div>${sideways}
      <h3>${esc(tt("spot_it", { n: knot.step_n }))}</h3>
      <p class="spot__sub">${esc(tt("spot_sub"))}</p>
      <ol class="hints" id="hints" aria-live="polite">${hints.map((h, i) => `<li class="hint" data-hint="${i}" hidden><span class="hint__n">${esc(tt("hint_n", { n: i + 1 }))}</span><p dir="auto">${esc(h)}</p></li>`).join("")}</ol>
      <div class="btns ladder" id="ladder">
        <button class="btn" type="button" data-action="hint"><svg class="i" aria-hidden="true"><use href="#i-bulb"/></svg><span>${esc(tt("hint_btn"))}</span></button>
        <button class="btn btn--ghost" type="button" data-action="show-fix"><svg class="i" aria-hidden="true"><use href="#i-eye"/></svg>${esc(tt("show_fix_now"))}</button>
      </div>
      <div class="fixwrap" id="fixwrap" hidden>
        <h4 class="fix__what" dir="auto">${esc(knot.what_is_wrong)}</h4>
        <div><p class="knot__label">${esc(tt("the_fix"))}</p><div class="fix">${wrong ? `<span class="fix__from">${esc(wrong)}</span>` : ""}<span class="fix__to">${esc(knot.corrected_step)}</span></div></div>
        <div class="why" dir="auto"><p class="knot__label">${esc(tt("why"))}</p><p><b>${esc(knot.misconception)}</b></p><p style="margin-top:6px">${esc(knot.explanation)}</p></div>
        ${qs ? `<div><p class="knot__label">${esc(tt("check_yourself"))}</p><div class="qs" dir="auto">${qs}</div></div>` : ""}
        ${a.knot_report?.tip ? `<p class="tip" dir="auto"><svg class="i" aria-hidden="true"><use href="#i-sparkle"/></svg><span>${esc(a.knot_report.tip)}</span></p>` : ""}
        <div class="btns"><button class="btn" type="button" data-action="rescan-fixed"><svg class="i" aria-hidden="true"><use href="#i-redo"/></svg>${esc(tt("rescan"))}</button></div>
      </div>
      ${stepList}
      ${confRow}
      ${actions}`;
  } else {
    knotCard.innerHTML = `
      ${verdict}
      <div class="knot__top"><span class="chip chip--ok">✓ All untied</span>${subject}</div>${sideways}
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

  if (entry && !result.demo) { Report.add(entry); renderReport(); }
}

/* ---------------- hint ladder + rescan to verify (0.6) ---------------- */
function nextHint() {
  const hidden = $$(".hint[hidden]", knotCard);
  if (!hidden.length) return showFix();
  hidden[0].hidden = false;
  hidden[0].classList.add("is-new");
  const left = hidden.length - 1;
  const btn = $('[data-action="hint"]', knotCard);
  if (btn) {
    if (left === 0) { btn.querySelector("span").textContent = tt("show_fix"); btn.dataset.action = "show-fix"; }
    else btn.querySelector("span").textContent = tt("next_hint");
  }
}
function showFix() {
  $$(".hint", knotCard).forEach((h) => (h.hidden = false));
  const fw = $("#fixwrap", knotCard);
  if (fw) { fw.hidden = false; fw.classList.add("is-new"); }
  const ladder = $("#ladder", knotCard);
  if (ladder) ladder.hidden = true;
  fw?.scrollIntoView({ block: "nearest", behavior: reduced() ? "auto" : "smooth" });
}
/** "I fixed it": remember this knot, then take a new photo; the next scan says whether it is untied. */
function startRescan() {
  if (!lastResult) return;
  pendingPrev = prevFrom(lastResult.result, lastResult.entryId);
  setMode("check");
  const touch = matchMedia("(hover: none), (pointer: coarse)").matches;
  const input = $(touch ? "#file-camera" : "#file-any");
  input.value = "";
  input.click();
}

/* ---------------- practice my weak spots (0.6) ---------------- */
async function runPractice(btn) {
  const spots = Report.weakSpots(Report.load());
  const concepts = Report.practiceConcepts(spots);
  const out = $("#practice-out");
  if (!concepts.length || !out) return;
  btn.disabled = true;
  out.innerHTML = `<p class="practice__busy" role="status"><span class="spin" aria-hidden="true"></span>${esc(tt("practice_busy"))}</p>`;
  let res, body;
  try {
    res = await fetch(`${API}/api/practice`, { method: "POST", headers: apiHeaders(), body: JSON.stringify({ concepts, count: 3, ...langBody() }) });
    body = await res.json().catch(() => null);
  } catch { res = { ok: false }; body = null; }
  btn.disabled = false;
  if (!res.ok || !body?.ok) {
    const e = ERRORS[body?.error?.code] || ERRORS.upstream_error;
    out.innerHTML = `<p class="practice__err" role="alert"><b>${esc(e.t)}</b> ${esc(body?.error?.message || e.p)}</p>`;
    return;
  }
  const probs = body.practice?.problems || [];
  out.innerHTML = `<div class="practice__head"><b>${esc(body.practice?.title || tt("practice_title"))}</b><span class="chip chip--ok">✓ ${esc(tt("verified"))}</span></div>
    <ol class="practice__list">${probs.map((p, i) => `
      <li class="pcard glass" dir="auto">
        <p class="pcard__topic">${esc(p.concept || "")}</p>
        <p class="pcard__q">${esc(p.question || "")}</p>
        ${p.hint ? `<details class="pcard__hint"><summary>${esc(tt("hint"))}</summary><p>${esc(p.hint)}</p></details>` : ""}
        <button class="q" type="button" aria-expanded="false" aria-controls="pa-${i}"><span class="q__q"><span>${esc(tt("show_answer"))}</span></span><span class="q__a" id="pa-${i}"><b>${esc(p.answer || "")}</b>${(p.solution || []).length ? `<ol class="pcard__sol">${p.solution.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>` : ""}${p.trap ? `<small>${esc(tt("watch_out"))}: ${esc(p.trap)}</small>` : ""}</span></button>
      </li>`).join("")}</ol>`;
  $$(".q", out).forEach((b) => b.addEventListener("click", () => b.setAttribute("aria-expanded", String(b.getAttribute("aria-expanded") !== "true"))));
}

/* ---------------- speak your doubt: Muse Voice Transcribe (0.6) ---------------- */
let recording = null;
function initVoice() {
  const btn = $("#ask-mic");
  if (!btn) return;
  if (!Voice.canRecord()) { btn.hidden = true; return; }
  const label = $("#ask-mic-t");
  const hint = $("#ask-hint");
  const setBtn = (st) => {
    btn.dataset.state = st;
    btn.setAttribute("aria-pressed", String(st === "rec"));
    label.textContent = st === "rec" ? tt("listening") : st === "busy" ? tt("transcribing") : tt("speak");
    btn.disabled = st === "busy";
  };
  setBtn("idle");
  btn.addEventListener("click", async () => {
    if (btn.dataset.state === "busy") return;
    if (!recording) {
      try {
        recording = await Voice.record({ onLimit: () => btn.click() });
        setBtn("rec");
      } catch {
        recording = null;
        hint.textContent = tt("mic_denied");
        setBtn("idle");
      }
      return;
    }
    const r = recording;
    recording = null;
    setBtn("busy");
    let clip;
    try { clip = await r.stop(); } catch { setBtn("idle"); hint.textContent = tt("mic_denied"); return; }
    let res, body;
    try {
      res = await fetch(`${API}/api/voice`, { method: "POST", headers: apiHeaders(), body: JSON.stringify({ audio: clip.dataUrl, ...langBody() }) });
      body = await res.json().catch(() => null);
    } catch { res = { ok: false }; body = null; }
    setBtn("idle");
    if (!res.ok || !body?.ok) {
      const e = ERRORS[body?.error?.code] || ERRORS.upstream_error;
      hint.textContent = body?.error?.message || e.p || e.t;
      return;
    }
    const ta = $("#ask-text");
    const text = String(body.text || "").trim();
    if (!text) { hint.textContent = ERRORS.bad_audio.t; return; }
    ta.value = (ta.value.trim() ? ta.value.trim() + " " : "") + text;
    ta.dispatchEvent(new Event("input"));
    ta.focus();
    hint.textContent = tt("voice_hint");
  });
}

/* ---------------- language picker + translated UI (0.6) ---------------- */
function applyLang() {
  uiLang = I18n.uiLangFor(langPref, navLang());
  const root = document.documentElement;
  root.lang = uiLang;
  root.dir = I18n.isRtl(uiLang) ? "rtl" : "ltr";
  $$("[data-i18n]").forEach((el) => { el.textContent = tt(el.dataset.i18n); });
  $$("[data-i18n-ph]").forEach((el) => { el.setAttribute("placeholder", tt(el.dataset.i18nPh)); });
  const cur = langPref === "auto" ? null : I18n.findLang(langPref);
  const b = $("#lang-cur");
  if (b) b.textContent = cur ? cur.native : "Auto";
  $("#lang-btn")?.setAttribute("aria-label", `${tt("lang_label")}: ${cur ? cur.name : tt("lang_auto")}`);
  const mic = $("#ask-mic");
  if (mic && !recording && mic.dataset.state !== "busy") $("#ask-mic-t").textContent = tt("speak");
}
function langItem(l) {
  const on = langPref === l.code;
  return `<li><button type="button" class="lang__item${on ? " is-on" : ""}" data-code="${esc(l.code)}" aria-pressed="${on}"><span class="lang__native" dir="auto" lang="${esc(l.code)}">${esc(l.native)}</span><span class="lang__name">${esc(l.name)}</span></button></li>`;
}
function renderLangList(q = "") {
  const list = I18n.searchLangs(q);
  const ind = list.filter((l) => l.indian), world = list.filter((l) => !l.indian);
  const autoOn = langPref === "auto";
  const showAuto = !q || "auto".includes(q.trim().toLowerCase());
  $("#lang-list").innerHTML = [
    showAuto ? `<li><button type="button" class="lang__item lang__item--auto${autoOn ? " is-on" : ""}" data-code="auto" aria-pressed="${autoOn}"><span class="lang__native">Auto</span><span class="lang__name">${esc(tt("lang_auto"))}</span></button></li>` : "",
    ind.length ? `<li class="lang__group">${esc(tt("lang_indian"))}</li>${ind.map(langItem).join("")}` : "",
    world.length ? `<li class="lang__group">${esc(tt("lang_world"))}</li>${world.map(langItem).join("")}` : "",
    !list.length && !showAuto ? `<li class="lang__none">${esc(tt("lang_none"))}</li>` : "",
  ].join("");
}
function openLang() {
  const dlg = $("#lang-dlg");
  const input = $("#lang-q");
  input.value = "";
  input.placeholder = tt("lang_search");
  $("#lang-title").textContent = tt("lang_label");
  renderLangList();
  if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
  setTimeout(() => input.focus(), 30);
}
function initLang() {
  const dlg = $("#lang-dlg");
  $("#lang-q").addEventListener("input", (e) => renderLangList(e.target.value));
  $("#lang-list").addEventListener("click", (e) => {
    const b = e.target.closest(".lang__item");
    if (!b) return;
    langPref = I18n.setPref(b.dataset.code);
    applyLang();
    renderReport();
    dlg.close();
  });
  $("#lang-close").addEventListener("click", () => dlg.close());
  applyLang();
}

/* ---------------- errors ---------------- */
const ERRORS = {
  budget_exhausted: { t: "Lens is resting", p: "The demo budget for this hackathon is used up, so live scans are paused. The sample still shows the full flow.", sample: true },
  daily_limit: { t: "That's today's free questions", p: "Each device gets 15 free questions and scans a day to keep Lens free for everyone. It resets at 05:30 IST. Until then the samples show the full flow.", sample: true, judge: true },
  judge_limit: { t: "Judge allowance used for today", p: "This judge code has used today's scans and questions. It resets at 05:30 IST (00:00 UTC). The samples still show the full flow.", sample: true },
  judge_code_invalid: { t: "That judge code didn't work", p: "Check the code or the link you were given. You can also remove it and use the public demo.", judge: true, clearJudge: true },
  empty_doubt: { t: "Nothing to explain yet", p: "Type a question or add a photo of it.", retake: true },
  doubt_too_long: { t: "That question is very long", p: "Keep it under 2,000 characters, or photograph the page instead.", retake: true },
  no_steps: { t: "No steps found", p: "Lens could not find handwritten working in this photo.", tips: ["One solution per photo, filling most of the frame", "Bright, even light with no strong shadows", "Dark pen or pencil on plain or ruled paper"], retake: true },
  upstream_busy: { t: "Lens is busy", p: "Meta's models are handling a lot of requests right now. Wait a minute and try again; nothing was counted against your free scans.", retry: true },
  upstream_error: { t: "Lens couldn't untangle this one", p: "Something went wrong while reading it. Try again, or rephrase the question or take a clearer photo.", retry: true, retake: true },
  timeout: { t: "That took too long", p: "The scan did not finish within 90 seconds. Check your connection and try again. A closer photo of one solution is also quicker to read.", retry: true },
  network: { t: "Can't reach Lens", p: "Live scans are offline or your connection dropped. The sample works without a connection to the API.", retry: true, sample: true },
  not_configured: { t: "Live scans are offline", p: "Lens is not connected right now. The sample still shows the full flow.", sample: true },
  prep: { t: "That photo didn't work", p: "", retake: true },
  invalid_image: { t: "That photo didn't work", p: "Lens needs a JPEG, PNG or WebP photo.", retake: true },
  bad_request: { t: "Something went wrong", p: "Lens could not read that request. Reload the page and try again.", retake: true },
  image_too_large: { t: "That photo is too large", p: "", retake: true },
  payload_too_large: { t: "That photo is too large", p: "", retake: true },
  bad_practice: { t: "Nothing to practise yet", p: "Scan some working first. Lens builds practice from the knots it finds.", retake: true },
  bad_audio: { t: "Lens couldn't hear that", p: "", retake: true },
};

const canRetry = () => (mode === "doubt" ? Boolean(lastDoubt) : Boolean(lastImage));

function renderError(code, message) {
  const e = ERRORS[code] || ERRORS.upstream_error;
  const p = message && (!e.p || code === "prep" || code === "invalid_image" || code.includes("too_large") || code.includes("doubt")) ? message : e.p;
  const btns = [
    e.retry && canRetry() ? `<button class="btn" type="button" data-action="retry"><svg class="i" aria-hidden="true"><use href="#i-redo"/></svg>Try again</button>` : "",
    e.retake ? `<button class="btn${e.retry && canRetry() ? " btn--ghost" : ""}" type="button" data-action="again"><svg class="i" aria-hidden="true"><use href="#i-${mode === "doubt" ? "chat" : "camera"}"/></svg>${mode === "doubt" ? "Edit question" : "New photo"}</button>` : "",
    e.sample ? `<button class="btn btn--ghost" type="button" data-action="sample"><svg class="i" aria-hidden="true"><use href="#i-sparkle"/></svg>Try the sample</button>` : "",
    e.judge ? `<button class="btn btn--ghost" type="button" data-action="judge"><svg class="i" aria-hidden="true"><use href="#i-key"/></svg>${judgeCode ? "Change judge code" : "I have a judge code"}</button>` : "",
  ].join("");
  if (e.clearJudge) setJudge(null);
  errCard.innerHTML = `
    <div class="err__icon" aria-hidden="true"><svg class="i"><use href="#i-alert"/></svg></div>
    <h3>${esc(e.t)}</h3>
    <p>${esc(p)}</p>
    ${e.tips ? `<ul>${e.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
    <div class="btns">${btns || `<button class="btn" type="button" data-action="again">Start over</button>`}</div>`;
  setState("error");
}

/* ---------------- knot report ---------------- */
function weakHtml(list) {
  const spots = Report.weakSpots(list);
  if (!spots.length) return "";
  return `<div class="weak glass">
      <div class="weak__head"><h3>${esc(tt("weak_title"))}</h3></div>
      <ul class="weak__list">${spots.map((g) => `
        <li class="weak__row">
          <span class="weak__name" dir="auto">${esc(g.topic)}</span>
          <span class="weak__bar" aria-hidden="true"><span style="width:${Math.max(8, Math.round(g.weight * 100))}%"></span></span>
          <span class="weak__n">×${g.open}${g.count > g.open ? ` · ${g.count - g.open} ${esc(tt("fixed"))}` : ""}</span>
          <button class="weak__rm" type="button" data-action="rm-concept" data-key="${esc(g.key)}" aria-label="${esc(tt("remove"))}: ${esc(g.topic)}"><svg class="i" aria-hidden="true"><use href="#i-x"/></svg></button>
        </li>`).join("")}</ul>
      <div class="btns"><button class="btn" type="button" data-action="practice"><svg class="i" aria-hidden="true"><use href="#i-sparkle"/></svg>${esc(tt("practice"))}</button></div>
      <p class="weak__privacy"><svg class="i" aria-hidden="true"><use href="#i-shield"/></svg>${esc(tt("profile_privacy"))}</p>
      <div id="practice-out" class="practice" aria-live="polite"></div>
    </div>`;
}

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
      </li>`).join("")}</ul>
    ${weakHtml(list)}`;
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
    else if (act === "rotate") rotateBy(Number(el.dataset.deg) || 90);
    else if (act === "scan-now") { if (lastImage) analyze(lastImage); }
    else if (act === "rescan-view") { if (viewRot) rescanRotated(viewRot); }
    else if (act === "rotate-rescan") rescanRotated(Number(el.dataset.deg) || 0);
    else if (act === "judge") openJudge();
    else if (act === "hint") nextHint();
    else if (act === "show-fix") showFix();
    else if (act === "rescan-fixed") startRescan();
    else if (act === "practice") runPractice(el);
    else if (act === "rm-concept") { Report.removeConcept(el.dataset.key); renderReport(); }
    else if (act === "lang") openLang();
    else if (act === "mode-doubt" || act === "mode-check") {
      setMode(act === "mode-doubt" ? "doubt" : "check", { scroll: true });
      if (panel.dataset.state !== "idle") { runId++; setState("idle"); clearStage(); }
      if (mode === "doubt") setTimeout(() => $("#ask-text").focus({ preventScroll: true }), reduced() ? 0 : 450);
    } else if (act === "scan") {
      setMode("check");
      const touch = matchMedia("(hover: none), (pointer: coarse)").matches;
      if (touch) pickFile(true); else { setState("idle"); scrollToPanel(); }
    } else if (act === "again") { pendingPrev = null; runId++; setState("idle"); clearStage(); scrollToPanel(); if (mode === "doubt") $("#ask-text").focus({ preventScroll: true }); }
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
  } else if (st === "preview") {
    await showPhoto(SAMPLE_IMG);
    showPreview(q.has("turned") ? AUTO_TURN : 0);
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
initJudge();
initModes();
initLayout();
initReveal();
initInputs();
initLang();
initVoice();
renderReport();
checkHealth();
demoHooks();
