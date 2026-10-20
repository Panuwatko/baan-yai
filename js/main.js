// Screens and UI flow: start → event → result → … → ending. Game rules live in engine.js.
import { ENDINGS, ENDING_KEYS } from "../data/endings.js";
import { LOOKS } from "../data/looks.js";
import { Windshield, viewFor, FOCUS } from "./windshield.js";
import * as E from "./engine.js";
import * as store from "./storage.js";
import * as sfx from "./audio.js";
import { jumpScare, fakeOut, preloadMedia } from "./scare.js";

const $ = id => document.getElementById(id);
const scene = $("scene");
const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
let S = null, prefs = store.loadPrefs(), busy = false, ws = null;

/* ---------- windshield view ---------- */
const SHIELD = `<div class="shield" id="shield"><canvas aria-hidden="true"></canvas></div>`;
function mountShield(){
  dropShield();
  const e = E.byId(S.cur);
  ws = new Windshield($("shield").querySelector("canvas"), viewFor(e.id, e.title + " " + E.textOf(e, S)));
  ws.start();
}
function dropShield(){ if (ws) { ws.stop(); ws = null; } }
addEventListener("resize", () => { if (ws) { ws.resize(); ws.draw(); } });

/* ---------- typewriter ----------
   Splits by grapheme so Thai vowels never float alone, pauses at spaces (Thai phrase breaks)
   and at … ! ?, and can run a hook (a surprise scare) when it reaches a given point in the text. */
const seg = "Segmenter" in Intl ? new Intl.Segmenter("th", { granularity: "grapheme" }) : null;
const graphemes = t => seg ? [...seg.segment(t)].map(s => s.segment) : Array.from(t);
let typing = null;

function type(el, text, done, hook){
  if (typing) typing.dead = true;
  document.body.classList.add("reading");
  const finish = () => { document.body.classList.remove("reading"); done && done(); };
  if (RM) {
    if (hook) hook.run().then(() => { el.textContent = text; finish(); });
    else { el.textContent = text; finish(); }
    return;
  }
  const parts = graphemes(text), t = { el, text, finish, hook, dead: false, running: false, timer: null };
  const stop = hook ? Math.max(1, Math.floor(parts.length * hook.at)) : -1;
  let i = 0; el.textContent = "";
  const step = () => {
    if (t.dead) return;
    if (t.hook && i >= stop) {
      const h = t.hook; t.hook = null; t.running = true;
      h.run().then(() => { t.running = false; step(); });
      return;
    }
    if (i >= parts.length) { typing = null; finish(); return; }
    const ch = parts[i++];
    el.textContent += ch;
    t.timer = setTimeout(step, ch === " " ? 150 : /[…!?”]/.test(ch) ? 420 : 28);
  };
  typing = t; step();
}

// Tapping skips the typing. A surprise that was still waiting fires right away instead of being lost.
function skipType(){
  const t = typing;
  if (!t || t.running) return;
  clearTimeout(t.timer); t.dead = true; typing = null;
  if (t.hook) {
    const h = t.hook; t.hook = null;
    h.run().then(() => { t.el.textContent = t.text; t.finish(); });
  } else { t.el.textContent = t.text; t.finish(); }
}
scene.addEventListener("click", e => { if (!e.target.closest("button")) skipType(); });

/* ---------- HUD and focus ---------- */
const clock = m => `${String((22 + Math.floor(m / 60)) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")} น.`;
function hud(show){
  $("hud").hidden = !show;
  // The darkness at the screen edges closes in as sanity drops; below 35 the light starts to flicker.
  const san = show ? S.san : 100;
  document.documentElement.style.setProperty("--veil", (.35 + (100 - san) / 100 * .55).toFixed(2));
  document.querySelector(".app").classList.toggle("flicker", show && san < 35 && !RM);
  sfx.tension(show && S.phase !== "end" ? san : 100);
  if (!show) return;
  $("car").style.left = (S.km / E.TOTAL_KM * 100) + "%";
  $("sanBar").style.width = S.san + "%"; $("sanBar").classList.toggle("low", S.san < 35); $("sanVal").textContent = S.san;
  $("fuelBar").style.width = S.fuel + "%"; $("fuelBar").classList.toggle("low", S.fuel < 20); $("fuelVal").textContent = S.fuel;
  $("clock").textContent = clock(S.min); $("km").textContent = `${S.km} / ${E.TOTAL_KM} กม.`;
  $("bag").innerHTML = S.bag.map(b => `<span class="chip">${esc(b)}</span>`).join("");
}
$("pause").onclick = () => { if (!busy) { if (typing) { typing.dead = true; typing = null; } showStart(); } };

/* ---------- wake lock and fullscreen ---------- */
async function keepAwake(){ try { await navigator.wakeLock?.request("screen"); } catch (e) {} }
document.addEventListener("visibilitychange", () => { if (!document.hidden && S && S.phase !== "end") keepAwake(); });
function goFullscreen(){
  const phone = matchMedia("(pointer: coarse)").matches, installed = matchMedia("(display-mode: standalone)").matches;
  if (phone && !installed && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
}

function choicesBox(html, bind){
  const box = $("choices"); box.classList.add("fade"); box.innerHTML = html; bind && bind(box);
}

/* ---------- surprise scares ---------- */
// Builds a typewriter hook that plays the scheduled ambush and drops a note into the story.
function ambushHook(){
  const p = S.pending;
  if (!p) return null;
  return { at: p.at, run: async () => {
    busy = true;
    const a = E.triggerAmbush(S); store.saveGame(S);
    if (prefs.jump) await jumpScare(a.ghost, scene, { buildup: "none" }); else await sleep(250);
    const note = document.createElement("div");
    note.className = "ambush";
    note.innerHTML = `<p>${esc(a.text)}</p>${a.ds ? `<span class="chip bad">สติ −${Math.abs(a.ds)}</span>` : ""}`;
    $("story").before(note);
    hud(true); busy = false;
    await sleep(RM ? 0 : 1400);
  } };
}
// Look moment: the windshield zooms in on one spot and the player waits. Something comes out of it
// only if the engine's dread roll said so; a faint figure may or may not show first, either way.
async function lookMoment(){
  busy = true;
  const L = S.look, info = LOOKS[L.scene], shield = $("shield");
  const cap = document.createElement("p"); cap.className = "look-cap"; $("deltas").after(cap);
  shield.style.setProperty("--fx", FOCUS[L.scene]);
  shield.classList.add("focus");
  await new Promise(res => type(cap, info.text, res));
  document.body.classList.add("reading");
  await sleep(L.wait);
  const tease = L.hit ? Math.random() < .6 : Math.random() < .3;
  if (tease) for (let a = .1; a <= .55; a += .05) { ws.showFigure(L.scene, a); await sleep(110); }
  if (L.hit && prefs.jump) await jumpScare(L.ghost, scene, { buildup: "none" });
  else await sleep(600);
  const r = E.finishLook(S); store.saveGame(S);
  ws.showFigure(L.scene, r.hit ? .85 : 0);
  cap.textContent = r.hit ? info.hit : info.miss; cap.classList.add(r.hit ? "hit" : "miss");
  if (r.ds) $("deltas").insertAdjacentHTML("beforeend", `<span class="chip bad">สติ −${Math.abs(r.ds)}</span>`);
  hud(true);
  shield.classList.remove("focus"); document.body.classList.remove("reading");
  busy = false;
}

// A scare that hits halfway through reading the result of a choice.
const midHook = ghost => ({ at: .25 + Math.random() * .45, run: async () => { busy = true; await jumpScare(ghost, scene, { buildup: "none" }); busy = false; } });

/* ---------- screens ---------- */
function showStart(){
  hud(false); dropShield();
  const saved = store.loadGame(), canResume = saved && saved.phase !== "end" && E.byId(saved.cur);
  const f = store.found().length;
  scene.innerHTML = `
    <p class="eyebrow">TEXT ADVENTURE · ROAD TRIP</p>
    <h1>ทางกลับบ้านยาย</h1>
    <p class="lead">คืนนี้คุณต้องขับรถคนเดียวไปบ้านยายให้ถึงก่อนเช้า ระหว่างทางจะเจอเรื่องแปลกๆ ที่ไม่เหมือนกันสักรอบ ทุกทางเลือกมีผลกับสติและน้ำมันที่เหลืออยู่</p>
    <p class="route">กรุงเทพฯ → บ้านยาย ต.ห้วยหินลาด · ${E.TOTAL_KM} กม. · ออกเดินทาง 22:00 น.</p>
    <div class="panel">
      <p>เกมนี้มีภาพและเสียงที่อาจทำให้ตกใจ (jump scare) แนะนำให้ใส่หูฟัง เล่นในที่มืด</p>
      <label class="toggle" for="jumpToggle"><input type="checkbox" id="jumpToggle" ${prefs.jump ? "checked" : ""}> เปิด jump scare</label>
      <label class="toggle" for="soundToggle"><input type="checkbox" id="soundToggle" ${prefs.sound ? "checked" : ""}> เปิดเสียง</label>
    </div>
    <div class="choices" id="choices">
      ${canResume ? `<button class="btn primary" id="resume">ขับต่อจากที่พักไว้ (${saved.km} กม.)</button>` : ""}
      <button class="btn ${canResume ? "" : "primary"}" id="go">${canResume ? "เริ่มเดินทางใหม่" : "สตาร์ทรถ"}</button>
      <button class="btn quiet" id="gallery">ฉากจบที่เจอแล้ว ${f} / ${ENDING_KEYS.length}</button>
    </div>`;
  const begin = () => {
    prefs = { jump: $("jumpToggle").checked, sound: $("soundToggle").checked };
    store.savePrefs(prefs); sfx.enable(prefs.sound); preloadMedia(); keepAwake(); goFullscreen();
  };
  $("go").onclick = () => { begin(); S = E.fresh(); E.nextEvent(S); store.saveGame(S); renderEvent(false); };
  if (canResume) $("resume").onclick = () => { begin(); S = saved; route(); };
  $("gallery").onclick = showGallery;
}

function showGallery(){
  hud(false); dropShield();
  const f = store.found();
  scene.innerHTML = `
    <p class="eyebrow">ฉากจบ ${f.length} / ${ENDING_KEYS.length}</p>
    <h2>ฉากจบทั้งหมด</h2>
    <ul class="gallery">${ENDING_KEYS.map(k => {
      const en = ENDINGS[k], got = f.includes(k);
      return `<li class="${got ? (en.bad ? "bad" : "") : "locked"}"><b>${got ? esc(en.title) : "???"}</b><span>${esc(en.hint)}</span></li>`;
    }).join("")}</ul>
    <div class="choices" id="choices"><button class="btn quiet" id="back">กลับหน้าหลัก</button></div>`;
  $("back").onclick = showStart;
}

function route(){
  if (S.phase === "result") renderResult(true);
  else if (S.phase === "end") renderEnd(true);
  else renderEvent(true);
}

function renderEvent(instant){
  hud(true);
  const e = E.byId(S.cur);
  scene.innerHTML = `${SHIELD}
    <p class="eyebrow">ช่วงที่ ${S.leg + 1} · ${clock(S.min)}</p>
    <h2>${esc(e.title)}</h2>
    <p class="story" id="story"></p>
    <p class="tap" id="tap">แตะเพื่อข้าม</p>
    <div class="choices" id="choices"></div>`;
  mountShield();
  const show = () => {
    $("tap").hidden = true;
    choicesBox(S.deal.map(i => {
      const c = e.choices[i];
      return `<button class="btn" data-i="${i}"><span>${esc(c.label)}</span>${c.need ? `<span class="need">ใช้: ${esc(c.need)}</span>` : ""}</button>`;
    }).join(""), box => box.querySelectorAll("button").forEach(b => b.onclick = () => choose(+b.dataset.i)));
  };
  const text = E.textOf(e, S);
  if (instant) { $("story").textContent = text; show(); return; }
  type($("story"), text, show, S.pending && S.pending.where === "event" ? ambushHook() : null);
}

async function choose(i){
  if (busy) return;
  busy = true;
  const sc = E.choose(S, i, prefs.jump);
  store.saveGame(S);
  if (sc && sc.mode === "instant") await jumpScare(sc.ghost, scene, { buildup: "none" });
  else if (sc && sc.mode === "hush") await jumpScare(sc.ghost, scene);
  else if (sc && sc.mode === "fake") await fakeOut(scene);
  busy = false;
  renderResult(false, sc && sc.mode === "mid" ? sc.ghost : null);
}

function renderResult(instant, midGhost){
  hud(true);
  const r = S.res, chips = [], sign = n => n > 0 ? "+" + n : "−" + Math.abs(n);
  if (r.ds) chips.push(`<span class="chip ${r.ds < 0 ? "bad" : "good"}">สติ ${sign(r.ds)}</span>`);
  if (r.df) chips.push(`<span class="chip ${r.df < 0 ? "bad" : "good"}">น้ำมัน ${sign(r.df)}</span>`);
  if (r.item) chips.push(`<span class="chip good">ได้: ${esc(r.item)}</span>`);
  if (r.used) chips.push(`<span class="chip">ใช้: ${esc(r.used)}</span>`);
  if (r.lost) chips.push(`<span class="chip bad">หลงทาง</span>`);
  if (r.short) chips.push(`<span class="chip good">ทางลัด +${E.STEP_KM} กม.</span>`);
  scene.innerHTML = `${SHIELD}
    <p class="eyebrow">${clock(S.min)}</p>
    <p class="picked">คุณเลือก: ${esc(r.choice)}</p>
    <p class="story" id="story"></p>
    <div class="deltas" id="deltas" hidden>${chips.join("")}</div>
    <div class="choices" id="choices"></div>`;
  mountShield();
  const show = async () => {
    $("deltas").hidden = false;
    if (S.look) await lookMoment();
    choicesBox(`<button class="btn primary" id="next">ขับต่อ</button>`, () => $("next").onclick = proceed);
  };
  if (instant) { $("story").textContent = r.text; show(); return; }
  const hook = midGhost ? midHook(midGhost) : S.pending && S.pending.where === "result" ? ambushHook() : null;
  type($("story"), r.text, show, hook);
}

function proceed(){
  if (busy) return;
  const k = E.checkEnding(S);
  if (k) { S.phase = "end"; S.ending = k; store.addFound(k); store.saveGame(S); renderEnd(false); return; }
  E.nextEvent(S); store.saveGame(S); renderEvent(false);
}

function renderEnd(instant){
  hud(true); dropShield();
  const en = ENDINGS[S.ending], f = store.found().length;
  scene.innerHTML = `
    <p class="eyebrow">ฉากจบ · ${clock(S.min)}</p>
    <h2 class="end-title ${en.bad ? "bad" : ""}">${esc(en.title)}</h2>
    <p class="story" id="story"></p>
    <p class="endcount">ฉากจบที่เจอแล้ว ${f} / ${ENDING_KEYS.length}</p>
    <div class="choices" id="choices"></div>`;
  const show = () => choicesBox(
    `<button class="btn primary" id="again">เล่นอีกรอบ</button><button class="btn quiet" id="gallery">ดูฉากจบทั้งหมด</button>`,
    () => {
      $("again").onclick = () => { store.clearGame(); S = E.fresh(); E.nextEvent(S); store.saveGame(S); renderEvent(false); };
      $("gallery").onclick = showGallery;
    });
  if (instant) { $("story").textContent = en.text; show(); return; }
  // Ending scares land on the last line, not after it, so they arrive while the player is still reading.
  const hook = en.scare && prefs.jump ? { at: .92, run: async () => { busy = true; await jumpScare(en.ghost, scene, { buildup: "none" }); busy = false; } } : null;
  type($("story"), en.text, show, hook);
}

/* ---------- boot ---------- */
showStart();
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
