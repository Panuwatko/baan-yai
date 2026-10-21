// Screens and UI flow. The trip runs in real time: the car drives itself, the travel log scrolls,
// and the drive stops for decisions, scares, look moments and rest stops. Game rules live in engine.js.
import { ENDINGS, ENDING_KEYS } from "../data/endings.js";
import { LOOKS } from "../data/looks.js";
import { Windshield, viewFor, FOCUS } from "./windshield.js";
import * as E from "./engine.js";
import * as store from "./storage.js";
import * as sfx from "./audio.js";
import { jumpScare, fakeOut, preloadMedia, clearScare } from "./scare.js";
import { makeCard } from "./sharecard.js";

const $ = id => document.getElementById(id);
const scene = $("scene");
const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
// LOG_SHOWN lines stay on the drive screen; LOG_KEEP are saved for the history pop-up.
const TICK_MS = 200, SAVE_MS = 4000, LOG_KEEP = 120, LOG_SHOWN = 14;
let S = null, prefs = store.loadPrefs(), busy = false, paused = false, ws = null, timer = null, lastTick = 0, savedAt = 0;

/* ---------- typewriter ----------
   Splits by grapheme so Thai vowels never float alone, pauses at spaces (Thai phrase breaks)
   and at … ! ?, and can run a hook (a scare) when it reaches a given point in the text. */
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
// Tapping skips the typing. A scare that was still waiting fires right away instead of being lost.
function skipType(){
  const t = typing;
  if (!t || t.running) return;
  clearTimeout(t.timer); t.dead = true; typing = null;
  if (t.hook) {
    const h = t.hook; t.hook = null;
    h.run().then(() => { t.el.textContent = t.text; t.finish(); });
  } else { t.el.textContent = t.text; t.finish(); }
}
scene.addEventListener("click", e => { if (e.target.closest("#card") && !e.target.closest("button")) skipType(); });

/* ---------- HUD and focus ---------- */
const clock = m => `${String((22 + Math.floor(m / 60)) % 24).padStart(2, "0")}:${String(Math.floor(m % 60)).padStart(2, "0")} น.`;
const hhmm = m => clock(m).slice(0, 5);
function hud(show){
  $("hud").hidden = !show;
  // The darkness at the screen edges closes in as sanity drops; below 35 the light starts to flicker.
  const san = show ? S.san : 100;
  document.documentElement.style.setProperty("--veil", (.35 + (100 - san) / 100 * .55).toFixed(2));
  document.body.classList.toggle("flicker", show && san < 35 && !RM);
  sfx.tension(show && S.phase !== "end" ? san : 100);
  if (!show) return;
  const san0 = Math.round(S.san), fuel0 = Math.round(S.fuel);
  $("car").style.left = (S.km / E.TOTAL_KM * 100) + "%";
  $("sanBar").style.width = san0 + "%"; $("sanBar").classList.toggle("low", san0 < 35); $("sanVal").textContent = san0;
  $("fuelBar").style.width = fuel0 + "%"; $("fuelBar").classList.toggle("low", fuel0 < 20); $("fuelVal").textContent = fuel0;
  $("clock").textContent = clock(S.min); $("km").textContent = `${Math.floor(S.km)} / ${E.TOTAL_KM} กม.`;
  $("bag").innerHTML = S.bag.map(b => `<span class="chip">${esc(b)}</span>`).join("");
}

/* ---------- windshield ---------- */
function mountShield(){
  dropShield();
  const e = S.cur && E.byId(S.cur);
  ws = new Windshield($("shield").querySelector("canvas"), e ? viewFor(e.id, e.title + " " + E.textOf(e, S)) : viewFor("start", ""));
  ws.start();
}
function dropShield(){ if (ws) { ws.stop(); ws = null; } }
addEventListener("resize", () => { if (ws) { ws.resize(); ws.draw(); } });
function snapshot(){
  const src = $("shield") && $("shield").querySelector("canvas");
  if (!src) return "";
  const c = document.createElement("canvas"); c.width = 240; c.height = 120;
  c.getContext("2d").drawImage(src, 0, 0, 240, 120);
  return c.toDataURL("image/jpeg", .6);
}

/* ---------- wake lock and fullscreen ---------- */
async function keepAwake(){ try { await navigator.wakeLock?.request("screen"); } catch (e) {} }
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { if (S && S.phase !== "end") store.saveGame(S); }
  else if (S && S.phase !== "end") keepAwake();
});
function goFullscreen(){
  const phone = matchMedia("(pointer: coarse)").matches, installed = matchMedia("(display-mode: standalone)").matches;
  if (phone && !installed && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
}

function choicesBox(html, bind){
  const box = $("choices"); box.classList.add("fade"); box.innerHTML = html; bind && bind(box);
  box.scrollIntoView({ block: "nearest", behavior: RM ? "auto" : "smooth" });   // keep the buttons on screen on short phones
}

/* ---------- start, gallery ---------- */
function showStart(){
  stopLoop(); hud(false); dropShield();
  const saved = store.loadGame(), canResume = saved && saved.phase !== "end";
  const f = store.found().length;
  scene.innerHTML = `
    <p class="eyebrow">TEXT ADVENTURE · ROAD TRIP</p>
    <h1>ทางกลับบ้านยาย</h1>
    <p class="lead">คืนนี้คุณต้องขับรถคนเดียวไปบ้านยายให้ถึงก่อนเช้า รถจะวิ่งไปเอง อ่านบันทึกการเดินทางไปเรื่อยๆ ปรับการขับได้ตลอดทาง และตัดสินใจเมื่อมีเรื่องให้ต้องเลือก</p>
    <p class="route">กรุงเทพฯ → บ้านยาย ต.ห้วยหินลาด · ${E.TOTAL_KM} กม. · ออกเดินทาง 22:00 น.</p>
    <div class="panel">
      <p>เกมนี้มีภาพและเสียงที่อาจทำให้ตกใจ (jump scare) แนะนำให้ใส่หูฟัง เล่นในที่มืด</p>
      <label class="toggle" for="jumpToggle"><input type="checkbox" id="jumpToggle" ${prefs.jump ? "checked" : ""}> เปิด jump scare</label>
      <label class="toggle" for="soundToggle"><input type="checkbox" id="soundToggle" ${prefs.sound ? "checked" : ""}> เปิดเสียง</label>
    </div>
    <div class="choices" id="choices">
      ${canResume ? `<button class="btn primary" id="resume">ขับต่อจากที่พักไว้ (${Math.floor(saved.km)} กม.)</button>` : ""}
      <button class="btn ${canResume ? "" : "primary"}" id="go">${canResume ? "เริ่มเดินทางใหม่" : "สตาร์ทรถ"}</button>
      <button class="btn quiet" id="gallery">ฉากจบที่เจอแล้ว ${f} / ${ENDING_KEYS.length}</button>
    </div>`;
  const begin = () => {
    prefs = { jump: $("jumpToggle").checked, sound: $("soundToggle").checked };
    store.savePrefs(prefs); sfx.enable(prefs.sound); preloadMedia(); keepAwake(); goFullscreen();
  };
  $("go").onclick = () => {
    begin(); store.clearAlbum(); S = E.fresh();
    S.log.push({ t: 0, kind: "event", text: `ออกจากกรุงเทพฯ ปลายทางบ้านยาย ${E.TOTAL_KM} กม.` });
    store.saveGame(S); renderDrive();
  };
  if (canResume) $("resume").onclick = () => { begin(); S = saved; renderDrive(); };
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

/* ---------- the drive screen ---------- */
const CONTROLS = [
  ["speed", "ความเร็ว", [["slow", "ช้า"], ["normal", "ปกติ"], ["fast", "เร็ว"]]],
  ["lights", "ไฟหน้า", [["low", "ต่ำ"], ["high", "สูง"]]],
  ["radio", "วิทยุ", [["off", "ปิด"], ["music", "เพลง"], ["dhamma", "ธรรมะ"]]],
  ["win", "กระจก", [["closed", "ปิด"], ["open", "แง้ม"]]]
];
// How the current settings read in the one-line summary under the time controls.
const SUMMARY = {
  speed: { slow: "ขับช้า", normal: "ขับปกติ", fast: "ขับเร็ว" },
  lights: { low: "ไฟต่ำ", high: "ไฟสูง" },
  radio: { off: "วิทยุปิด", music: "เปิดเพลง", dhamma: "ฟังธรรมะ" },
  win: { closed: "กระจกปิด", open: "แง้มกระจก" }
};
const segHtml = (key, opts) => `<div class="seg" data-key="${key}" role="group">${opts.map(([v, t]) => `<button data-v="${v}">${t}</button>`).join("")}</div>`;

function renderDrive(){
  hud(true);
  scene.innerHTML = `
    <div class="drive" id="drive">
      <div class="shield" id="shield"><canvas aria-hidden="true"></canvas></div>
      <div class="timebar">
        <div class="seg" id="mult" role="group" aria-label="ความเร็วเวลา">${E.MULTS.map(m => `<button data-v="${m}">x${m}</button>`).join("")}</div>
        <button class="pill" id="setupBtn">ปรับการขับ</button>
        <button class="pill" id="pauseBtn">จอดพัก</button>
      </div>
      <div class="sumrow"><p class="drivesum" id="drivesum"></p><button class="linkbtn" id="historyBtn">ดูบันทึกย้อนหลัง</button></div>
      <div class="paused" id="paused" hidden>
        <span>จอดพักข้างทาง เวลาหยุดเดิน</span>
        <button class="pill on" id="goOn">ขับต่อ</button>
        <button class="pill" id="home">หน้าหลัก</button>
      </div>
      <div class="log" id="log" aria-live="polite"></div>
      <div class="backdrop" id="backdrop" hidden></div>
      <div class="card sheet" id="history" role="dialog" aria-modal="true" aria-label="บันทึกการเดินทาง" hidden>
        <h2>บันทึกการเดินทาง</h2>
        <p class="tap">เวลาหยุดเดินระหว่างอ่าน</p>
        <div class="history" id="historyList"></div>
        <button class="btn primary" id="historyDone">ขับต่อ</button>
      </div>
      <div class="card" id="card" role="dialog" aria-modal="true" hidden></div>
      <div class="card sheet" id="setup" role="dialog" aria-modal="true" aria-label="ปรับการขับ" hidden>
        <h2>ปรับการขับ</h2>
        <p class="tap">เวลาหยุดเดินระหว่างปรับ</p>
        <div class="controls">
          ${CONTROLS.map(([k, label, opts]) => `<div class="ctl"><span>${label}</span>${segHtml(k, opts)}</div>`).join("")}
        </div>
        <button class="btn primary" id="setupDone">ขับต่อ</button>
      </div>
    </div>`;
  mountShield();
  for (const line of S.log.slice(-LOG_SHOWN)) appendLine(line);
  for (const g of document.querySelectorAll(".seg[data-key]"))
    g.onclick = e => { const b = e.target.closest("button"); if (!b || S[g.dataset.key] === b.dataset.v) return;
                       addLog(E.setOption(S, g.dataset.key, b.dataset.v), "setting"); refreshControls(); store.saveGame(S); };
  $("mult").onclick = e => { const b = e.target.closest("button"); if (b) { S.mult = +b.dataset.v; refreshControls(); } };
  $("pauseBtn").onclick = () => setPaused(true);
  $("setupBtn").onclick = () => openSetup(true);
  $("setupDone").onclick = () => openSetup(false);
  $("historyBtn").onclick = () => openHistory(true);
  $("historyDone").onclick = () => openHistory(false);
  $("backdrop").onclick = () => { if (!$("setup").hidden) openSetup(false); if (!$("history").hidden) openHistory(false); };
  $("goOn").onclick = () => setPaused(false);
  $("home").onclick = () => { store.saveGame(S); paused = false; showStart(); };
  refreshControls();
  paused = false; busy = false;
  if (S.phase === "event") { busy = true; showDecision(true); }
  else if (S.phase === "rest") { busy = true; showRest(); }
  else if (S.phase === "result") { busy = true; showResult(true); }
  startLoop();
}

function refreshControls(){
  for (const g of document.querySelectorAll(".seg[data-key]"))
    for (const b of g.children) { const on = S[g.dataset.key] === b.dataset.v; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); }
  for (const b of $("mult").children) { const on = +b.dataset.v === S.mult; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); }
  $("drivesum").textContent = Object.entries(SUMMARY).map(([k, m]) => m[S[k]]).join(" · ");
}
// The driving options live in a pop-up; the clock holds while it is open.
let setupOpen = false;
function openSetup(on){
  setupOpen = on; $("setup").hidden = !on; $("backdrop").hidden = !on && $("card").hidden;
  if (!on) store.saveGame(S);
}
// The full log, newest first, in a pop-up. It is built only when opened and emptied when closed.
function openHistory(on){
  setupOpen = on; $("history").hidden = !on; $("backdrop").hidden = !on && $("card").hidden;
  $("historyList").innerHTML = on ? S.log.slice().reverse().map(l =>
    `<p class="ln k-${l.kind || "road"}"><time>${hhmm(l.t)}</time><span>${esc(l.text)}</span></p>`).join("") : "";
}
function setPaused(on){
  paused = on; $("paused").hidden = !on; $("pauseBtn").hidden = on;
  if (on) store.saveGame(S);
}

/* ---------- the log ---------- */
// Newest line goes on top and pushes older ones down; the oldest fall off the bottom.
// Only the latest lines are kept on screen; the full log is in the history pop-up.
function appendLine(line, extra){
  const el = $("log"); if (!el) return;
  const p = document.createElement("p");
  // Kinds are prefixed: a bare "scare" class would pick up the full-screen jump-scare styles.
  p.className = "ln k-" + (line.kind || "road");
  p.innerHTML = `<time>${hhmm(line.t)}</time><span>${esc(line.text)}</span>`;
  if (extra) p.appendChild(extra);
  el.prepend(p);
  while (el.children.length > LOG_SHOWN) el.lastChild.remove();
}
function addLog(text, kind, extra){
  const line = { t: S.min, kind, text };
  S.log.push(line); if (S.log.length > LOG_KEEP) S.log.shift();
  appendLine(line, extra);
}

/* ---------- the clock ---------- */
function startLoop(){ stopLoop(); lastTick = performance.now(); timer = setInterval(tick, TICK_MS); }
function stopLoop(){ clearInterval(timer); timer = null; }

async function tick(){
  const now = performance.now(), dt = Math.min(1, (now - lastTick) / 1000);
  lastTick = now;
  if (busy || paused || setupOpen || document.hidden || !S || S.phase !== "drive") return;
  // Nothing is playing right now, so no dark layer should be up. Clear any that got stuck
  // (except the blackout of a fatal crash, which the ending is about to replace).
  if (!S.crash) clearScare();
  if ($("card").hidden && $("setup").hidden && $("history").hidden) $("backdrop").hidden = true;
  busy = true;
  try { for (const h of E.drive(S, dt * E.BASE_RATE * S.mult)) await handle(h); }
  catch (err) { console.error(err); }   // a broken effect must not freeze the drive
  finally { if (S.phase === "drive") busy = false; }
  if (S.phase !== "end") hud(true);
  if (now - savedAt > SAVE_MS && S.phase !== "end") { savedAt = now; store.saveGame(S); }
}

async function handle(h){
  if (h.type === "log") addLog(h.text, h.kind);
  else if (h.type === "decision") showDecision(false);
  else if (h.type === "ambush") {
    if (prefs.jump) await boo(h.a.ghost, { buildup: "none" }); else await sleep(300);
    addLog(h.a.text + (h.a.ds ? `  (สติ −${Math.abs(h.a.ds)})` : ""), "scare");
    if (h.crash) await crashMoment(h.crash);
    store.saveGame(S);
  }
  else if (h.type === "look") await lookMoment();
  else if (h.type === "rest") showRest();
  else if (h.type === "doze") await dozeMoment(h);
  else if (h.type === "end") finish(h.key);
}

// Look moment: the windshield pushes in on one spot and the player waits. Something comes out of it
// only if the engine's dread roll said so.
async function lookMoment(){
  const L = S.look, info = LOOKS[L.scene], shield = $("shield");
  shield.style.setProperty("--fx", FOCUS[L.scene]); shield.classList.add("focus");
  addLog(info.text, "omen");
  document.body.classList.add("reading");
  await sleep(L.wait);
  if (L.hit && prefs.jump) await boo(L.ghost, { buildup: Math.random() < .5 ? "none" : "hush" });
  else await sleep(500);
  const r = E.finishLook(S);
  addLog((r.hit ? info.hit : info.miss) + (r.ds ? `  (สติ −${Math.abs(r.ds)})` : ""), r.hit ? "scare" : "thought");
  shield.classList.remove("focus"); document.body.classList.remove("reading");
  if (r.crash) await crashMoment(r.crash);
  store.saveGame(S);
}

// A rest stop pops up like an event; the drive holds until the player pulls in or drives past.
function showRest(){
  const line = E.restLine(S);
  addLog(line, "event");
  const card = openCard();
  card.innerHTML = `
    <p class="eyebrow">กม. ${Math.floor(S.km)} · ${clock(S.min)}</p>
    <h2>จุดแวะพัก</h2>
    <p class="story">${esc(line)}</p>
    <p class="tap">น้ำมัน ${Math.round(S.fuel)} · สติ ${Math.round(S.san)}</p>
    <div class="choices" id="choices"></div>`;
  choicesBox(`<button class="btn" id="restStop"><span>แวะพัก</span></button><button class="btn" id="restPass"><span>ขับผ่านไป</span></button>`, () => {
    $("restStop").onclick = () => takeRest();
    $("restPass").onclick = () => { addLog("คุณขับผ่านไป ไม่แวะ", "setting"); E.leaveRest(S); closeCard(); store.saveGame(S); busy = false; };
  });
}
async function takeRest(){
  if (choosing) return;
  choosing = true;
  const r = E.takeRest(S);
  if (r.ghost && prefs.jump) await boo(r.ghost);
  choosing = false;
  const chips = [];
  if (r.twisted) chips.push(`<span class="chip bad">ผลพลิก</span>`);
  if (r.ds) chips.push(`<span class="chip ${r.ds < 0 ? "bad" : "good"}">สติ ${r.ds > 0 ? "+" : "−"}${Math.abs(Math.round(r.ds))}</span>`);
  if (r.df) chips.push(`<span class="chip good">น้ำมัน +${Math.round(r.df)}</span>`);
  const card = openCard();
  card.innerHTML = `
    <p class="eyebrow">จุดแวะพัก · ${clock(S.min)}</p>
    <p class="picked">คุณเลี้ยวรถเข้าไปจอด</p>
    <p class="story" id="story"></p>
    <div class="deltas" id="deltas" hidden>${chips.join("")}</div>
    <div class="choices" id="choices"></div>`;
  hud(true);
  type($("story"), r.text, () => {
    $("deltas").hidden = false;
    choicesBox(`<button class="btn primary" id="next">ขับต่อ</button>`, () => $("next").onclick = () => {
      addLog(r.text, r.twisted ? "scare" : "thought");
      E.leaveRest(S); closeCard(); hud(true); store.saveGame(S); busy = false;
    });
  });
}

async function dozeMoment(h){
  document.body.classList.add("doze");
  await sleep(RM ? 300 : 1600);
  document.body.classList.remove("doze");
  if (h.ghost && prefs.jump) await boo(h.ghost, { buildup: "none" });
  addLog(h.text + `  (สติ −${Math.abs(h.ds)})`, h.ghost ? "scare" : "warn");
  if (h.crash) await crashMoment(h.crash);
  store.saveGame(S);
}

// The car leaves the road: shake, crunch, and for a bad one the screen goes dark before the
// ending (which the next tick picks up from S.crash).
async function crashMoment(c, keepDark = true){
  sfx.crash();
  try { navigator.vibrate && navigator.vibrate([200, 60, 400]); } catch (e) {}
  const app = document.querySelector(".app");
  if (!RM) app.classList.add("crash");
  if (c.text) addLog(c.text, "scare");
  await sleep(700);
  app.classList.remove("crash");
  if (c.sev !== "minor") {
    // Stay dark until the ending screen takes over (finish lifts it); after a decision the result is still to be read.
    document.body.classList.add("blackout"); await sleep(RM ? 300 : 1800);
    if (!keepDark) document.body.classList.remove("blackout");
  }
  hud(true);
}

/* ---------- decisions ---------- */
// Decisions pop up over the drive screen; the windshield and log stay visible, dimmed, behind it.
function openCard(){
  const c = $("card"); $("backdrop").hidden = false; c.hidden = false; c.scrollTop = 0;
  return c;
}
function closeCard(){ $("card").hidden = true; $("backdrop").hidden = true; }

function showDecision(instant){
  const e = E.byId(S.cur), text = E.textOf(e, S);
  ws.setView(viewFor(e.id, e.title + " " + text));
  if (!instant) addLog(e.title, "event");
  const card = openCard();
  card.innerHTML = `
    <p class="eyebrow">กม. ${Math.floor(S.km)} · ${clock(S.min)}</p>
    <h2>${esc(e.title)}</h2>
    <p class="story" id="story"></p>
    <p class="tap" id="tap">แตะเพื่อข้าม</p>
    <div class="choices" id="choices"></div>`;
  const show = () => {
    $("tap").hidden = true;
    choicesBox(S.deal.map(i => {
      const c = e.choices[i];
      return `<button class="btn" data-i="${i}"><span>${esc(c.label)}</span>${c.need ? `<span class="need">ใช้: ${esc(c.need)}</span>` : ""}</button>`;
    }).join(""), box => box.querySelectorAll("button").forEach(b => b.onclick = () => choose(+b.dataset.i)));
  };
  if (instant) { $("story").textContent = text; show(); } else type($("story"), text, show);
}

// Every jump scare goes through here so the trip can count the ghosts it met.
const boo = (ghost, opts) => { if (S) S.seenGhosts++; return jumpScare(ghost, scene, opts); };

let choosing = false;
async function choose(i){
  if (choosing) return;
  choosing = true;
  const sc = E.choose(S, i, prefs.jump);
  store.saveGame(S);
  if (sc && sc.mode === "instant") await boo(sc.ghost, { buildup: "none" });
  else if (sc && sc.mode === "hush") await boo(sc.ghost);
  else if (sc && sc.mode === "fake") await fakeOut(scene);
  if (S.res.crash) await crashMoment({ sev: S.res.crash }, false);
  choosing = false;
  showResult(false, sc && sc.mode === "mid" ? sc.ghost : null);
}

const midHook = ghost => ({ at: .25 + Math.random() * .45, run: () => boo(ghost, { buildup: "none" }) });

function showResult(instant, midGhost){
  hud(true);
  const r = S.res, chips = [], sign = n => n > 0 ? "+" + n : "−" + Math.abs(n);
  if (r.twist) chips.push(`<span class="chip bad">ผลพลิก</span>`);
  if (r.crash) chips.push(`<span class="chip bad">อุบัติเหตุ</span>`);
  if (r.ds) chips.push(`<span class="chip ${r.ds < 0 ? "bad" : "good"}">สติ ${sign(Math.round(r.ds))}</span>`);
  if (r.df) chips.push(`<span class="chip ${r.df < 0 ? "bad" : "good"}">น้ำมัน ${sign(Math.round(r.df))}</span>`);
  if (r.item) chips.push(`<span class="chip good">ได้: ${esc(r.item)}</span>`);
  if (r.used) chips.push(`<span class="chip">ใช้: ${esc(r.used)}</span>`);
  if (r.lost) chips.push(`<span class="chip bad">หลงทาง</span>`);
  if (r.short) chips.push(`<span class="chip good">ทางลัด +${E.STEP_KM} กม.</span>`);
  const card = openCard();
  card.innerHTML = `
    <p class="eyebrow">${esc(r.title)} · ${clock(S.min)}</p>
    <p class="picked">คุณเลือก: ${esc(r.choice)}</p>
    <p class="story" id="story"></p>
    <div class="deltas" id="deltas" hidden>${chips.join("")}</div>
    <div class="choices" id="choices"></div>`;
  const show = () => {
    $("deltas").hidden = false;
    choicesBox(`<button class="btn primary" id="next">ขับต่อ</button>`, () => $("next").onclick = driveOn);
  };
  if (instant) { $("story").textContent = r.text; show(); }
  else type($("story"), r.text, show, midGhost ? midHook(midGhost) : null);
}

function driveOn(){
  const r = S.res;
  store.addToAlbum({ img: snapshot(), title: r.title, choice: r.choice, twist: r.twist, clock: hhmm(S.min), km: Math.floor(S.km) });
  addLog(`คุณ${r.choice.startsWith("คุณ") ? r.choice.slice(3) : r.choice}${r.twist ? " (ผลพลิก)" : ""}`, r.twist ? "scare" : "choice");
  E.resume(S); closeCard(); hud(true); store.saveGame(S);
  busy = false;
}

/* ---------- endings ---------- */
function finish(key){
  stopLoop(); document.body.classList.remove("blackout");
  S.phase = "end"; S.ending = key; store.addFound(key); store.saveGame(S);
  renderEnd();
}

function renderEnd(){
  hud(true); dropShield();
  const en = ENDINGS[S.ending], f = store.found().length, album = store.loadAlbum();
  scene.innerHTML = `
    <p class="eyebrow">ฉากจบ · ${clock(S.min)} · ${Math.floor(S.km)} กม.</p>
    <h2 class="end-title ${en.bad ? "bad" : ""}">${esc(en.title)}</h2>
    <p class="story" id="story"></p>
    <p class="endcount">ฉากจบที่เจอแล้ว ${f} / ${ENDING_KEYS.length}</p>
    <div class="choices" id="choices"></div>
    <div class="sharebox" id="sharebox" hidden></div>
    ${album.length ? `<h3 class="album-title">อัลบั้มการเดินทาง</h3>
    <div class="album">${album.map(a => `
      <figure>${a.img ? `<img src="${a.img}" alt="">` : ""}
        <figcaption><b>${esc(a.title)}</b><span>${esc(a.choice)}${a.twist ? " · ผลพลิก" : ""}</span><time>${esc(a.clock)} · กม. ${a.km}</time></figcaption>
      </figure>`).join("")}</div>` : ""}`;
  const show = () => {
    choicesBox(
      `<button class="btn primary" id="again">เล่นอีกรอบ</button><button class="btn quiet" id="gallery">ดูฉากจบทั้งหมด</button>`,
      () => {
        $("again").onclick = () => { store.clearGame(); showStart(); };
        $("gallery").onclick = showGallery;
      });
    showShareCard(en, f);
  };
  // Ending scares land on the last line, while the player is still reading.
  const hook = en.scare && prefs.jump ? { at: .92, run: () => boo(en.ghost, { buildup: "none" }) } : null;
  type($("story"), en.text, show, hook);
}

// The trip summary card: an image to share (the phone's share sheet) or save.
async function showShareCard(en, found){
  const box = $("sharebox"); if (!box) return;
  box.hidden = false; box.innerHTML = `<p class="tap">กำลังทำการ์ดสรุปการเดินทาง…</p>`;
  let blob;
  try { blob = await makeCard(S, en, [found, ENDING_KEYS.length]); } catch (e) { console.error(e); box.hidden = true; return; }
  if (!blob || !$("sharebox")) return;
  const url = URL.createObjectURL(blob), file = new File([blob], "baan-yai.png", { type: "image/png" });
  const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
  box.innerHTML = `
    <h3 class="album-title">การ์ดสรุปการเดินทาง</h3>
    <img class="sharecard" src="${url}" alt="การ์ดสรุป: ${esc(en.title)}, ${Math.floor(S.km)} กม.">
    <div class="sharerow">
      ${canShare ? `<button class="btn primary" id="shareCard">แชร์การ์ด</button>` : ""}
      <a class="btn ${canShare ? "quiet" : "primary"}" id="saveCard" href="${url}" download="baan-yai.png">บันทึกรูป</a>
    </div>`;
  if (canShare) $("shareCard").onclick = async () => {
    try { await navigator.share({ files: [file], title: "ทางกลับบ้านยาย", text: `ฉันได้ฉากจบ “${en.title}” คุณจะไปถึงบ้านยายไหม?` }); }
    catch (e) { /* cancelled, or the share sheet failed: the save button is right there */ }
  };
}

/* ---------- boot ---------- */
showStart();
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  // When a new version's service worker takes over (it skips waiting), reload once so the page runs
  // the new code instead of a mix of old and new. Not on the very first install.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloading) return;
    reloading = true;
    if (S && S.phase !== "end") store.saveGame(S);
    location.reload();
  });
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
