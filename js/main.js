// Screens and UI flow. The trip runs in real time: the car drives itself, the travel log scrolls,
// and the drive stops for decisions, scares, look moments and rest stops. Game rules live in engine.js.
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
const TICK_MS = 200, SAVE_MS = 4000, LOG_KEEP = 60;
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
  document.querySelector(".app").classList.toggle("flicker", show && san < 35 && !RM);
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
const segHtml = (key, opts) => `<div class="seg" data-key="${key}" role="group">${opts.map(([v, t]) => `<button data-v="${v}">${t}</button>`).join("")}</div>`;

function renderDrive(){
  hud(true);
  scene.innerHTML = `
    <div class="drive" id="drive">
      <div class="shield" id="shield"><canvas aria-hidden="true"></canvas></div>
      <div class="timebar">
        <div class="seg" id="mult" role="group" aria-label="ความเร็วเวลา">${E.MULTS.map(m => `<button data-v="${m}">x${m}</button>`).join("")}</div>
        <button class="pill" id="pauseBtn">จอดพัก</button>
      </div>
      <div class="paused" id="paused" hidden>
        <span>จอดพักข้างทาง เวลาหยุดเดิน</span>
        <button class="pill on" id="goOn">ขับต่อ</button>
        <button class="pill" id="home">หน้าหลัก</button>
      </div>
      <div class="controls" id="controls">
        ${CONTROLS.map(([k, label, opts]) => `<div class="ctl"><span>${label}</span>${segHtml(k, opts)}</div>`).join("")}
      </div>
      <div class="log" id="log" aria-live="polite"></div>
      <div class="card" id="card" hidden></div>
    </div>`;
  mountShield();
  for (const line of S.log) appendLine(line);
  $("log").scrollTop = $("log").scrollHeight;
  for (const g of document.querySelectorAll(".seg[data-key]"))
    g.onclick = e => { const b = e.target.closest("button"); if (!b || S[g.dataset.key] === b.dataset.v) return;
                       addLog(E.setOption(S, g.dataset.key, b.dataset.v), "setting"); refreshControls(); store.saveGame(S); };
  $("mult").onclick = e => { const b = e.target.closest("button"); if (b) { S.mult = +b.dataset.v; refreshControls(); } };
  $("pauseBtn").onclick = () => setPaused(true);
  $("goOn").onclick = () => setPaused(false);
  $("home").onclick = () => { store.saveGame(S); paused = false; showStart(); };
  refreshControls();
  paused = false; busy = false;
  if (S.phase === "event") { busy = true; showDecision(true); }
  else if (S.phase === "result") { busy = true; showResult(true); }
  startLoop();
}

function refreshControls(){
  for (const g of document.querySelectorAll(".seg[data-key]"))
    for (const b of g.children) { const on = S[g.dataset.key] === b.dataset.v; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); }
  for (const b of $("mult").children) { const on = +b.dataset.v === S.mult; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); }
}
function setPaused(on){
  paused = on; $("paused").hidden = !on; $("pauseBtn").hidden = on;
  if (on) store.saveGame(S);
}

/* ---------- the log ---------- */
function appendLine(line, extra){
  const el = $("log"); if (!el) return;
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  const p = document.createElement("p");
  p.className = "ln " + (line.kind || "road");
  p.innerHTML = `<time>${hhmm(line.t)}</time><span>${esc(line.text)}</span>`;
  if (extra) p.appendChild(extra);
  el.appendChild(p);
  while (el.children.length > LOG_KEEP) el.firstChild.remove();
  if (atBottom) el.scrollTop = el.scrollHeight;
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
  if (busy || paused || document.hidden || !S || S.phase !== "drive") return;
  busy = true;
  for (const h of E.drive(S, dt * E.BASE_RATE * S.mult)) await handle(h);
  if (S.phase === "drive") busy = false;
  for (const b of document.querySelectorAll(".restbtn")) b.disabled = !S.restOffer;
  if (S.phase !== "end") hud(true);
  if (now - savedAt > SAVE_MS && S.phase !== "end") { savedAt = now; store.saveGame(S); }
}

async function handle(h){
  if (h.type === "log") addLog(h.text, h.kind);
  else if (h.type === "decision") showDecision(false);
  else if (h.type === "ambush") {
    if (prefs.jump) await jumpScare(h.a.ghost, scene, { buildup: "none" }); else await sleep(300);
    addLog(h.a.text + (h.a.ds ? `  (สติ −${Math.abs(h.a.ds)})` : ""), "scare");
    store.saveGame(S);
  }
  else if (h.type === "look") await lookMoment();
  else if (h.type === "rest") offerRest(h.text);
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
  if (L.hit && prefs.jump) await jumpScare(L.ghost, scene, { buildup: Math.random() < .5 ? "none" : "hush" });
  else await sleep(500);
  const r = E.finishLook(S);
  addLog((r.hit ? info.hit : info.miss) + (r.ds ? `  (สติ −${Math.abs(r.ds)})` : ""), r.hit ? "scare" : "thought");
  shield.classList.remove("focus"); document.body.classList.remove("reading");
  store.saveGame(S);
}

function offerRest(text){
  const b = document.createElement("button");
  b.className = "restbtn"; b.textContent = "แวะพัก";
  b.onclick = () => takeRest(b);
  addLog(text, "rest", b);
}
async function takeRest(btn){
  if (!S.restOffer || S.phase !== "drive") { btn.disabled = true; return; }
  // Wait out any tick in progress, then hold the clock while the stop plays out.
  while (busy) await sleep(50);
  if (!S.restOffer) { btn.disabled = true; return; }
  busy = true; btn.remove();
  const r = E.takeRest(S);
  addLog("คุณเลี้ยวรถเข้าไปจอด", "setting");
  await sleep(RM ? 0 : 900);
  if (r.ghost && prefs.jump) await jumpScare(r.ghost, scene);
  const bits = [r.ds ? `สติ ${r.ds > 0 ? "+" : "−"}${Math.abs(r.ds)}` : "", r.df ? `น้ำมัน +${r.df}` : ""].filter(Boolean).join(", ");
  addLog(r.text + (bits ? `  (${bits})` : ""), r.twisted ? "scare" : "thought");
  hud(true); store.saveGame(S);
  busy = false;
}

async function dozeMoment(h){
  document.body.classList.add("doze");
  await sleep(RM ? 300 : 1600);
  document.body.classList.remove("doze");
  if (h.ghost && prefs.jump) await jumpScare(h.ghost, scene, { buildup: "none" });
  addLog(h.text + `  (สติ −${Math.abs(h.ds)})`, h.ghost ? "scare" : "warn");
  store.saveGame(S);
}

/* ---------- decisions ---------- */
function openCard(){
  $("drive").classList.add("deciding"); const c = $("card"); c.hidden = false;
  c.scrollIntoView({ block: "start", behavior: RM ? "auto" : "smooth" });
  return c;
}
function closeCard(){ $("drive").classList.remove("deciding"); $("card").hidden = true; scrollTo({ top: 0, behavior: RM ? "auto" : "smooth" }); }

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

let choosing = false;
async function choose(i){
  if (choosing) return;
  choosing = true;
  const sc = E.choose(S, i, prefs.jump);
  store.saveGame(S);
  if (sc && sc.mode === "instant") await jumpScare(sc.ghost, scene, { buildup: "none" });
  else if (sc && sc.mode === "hush") await jumpScare(sc.ghost, scene);
  else if (sc && sc.mode === "fake") await fakeOut(scene);
  choosing = false;
  showResult(false, sc && sc.mode === "mid" ? sc.ghost : null);
}

const midHook = ghost => ({ at: .25 + Math.random() * .45, run: () => jumpScare(ghost, scene, { buildup: "none" }) });

function showResult(instant, midGhost){
  hud(true);
  const r = S.res, chips = [], sign = n => n > 0 ? "+" + n : "−" + Math.abs(n);
  if (r.twist) chips.push(`<span class="chip bad">ผลพลิก</span>`);
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
  stopLoop();
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
    ${album.length ? `<h3 class="album-title">อัลบั้มการเดินทาง</h3>
    <div class="album">${album.map(a => `
      <figure>${a.img ? `<img src="${a.img}" alt="">` : ""}
        <figcaption><b>${esc(a.title)}</b><span>${esc(a.choice)}${a.twist ? " · ผลพลิก" : ""}</span><time>${esc(a.clock)} · กม. ${a.km}</time></figcaption>
      </figure>`).join("")}</div>` : ""}`;
  const show = () => choicesBox(
    `<button class="btn primary" id="again">เล่นอีกรอบ</button><button class="btn quiet" id="gallery">ดูฉากจบทั้งหมด</button>`,
    () => {
      $("again").onclick = () => { store.clearGame(); showStart(); };
      $("gallery").onclick = showGallery;
    });
  // Ending scares land on the last line, while the player is still reading.
  const hook = en.scare && prefs.jump ? { at: .92, run: () => jumpScare(en.ghost, scene, { buildup: "none" }) } : null;
  type($("story"), en.text, show, hook);
}

/* ---------- boot ---------- */
showStart();
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
