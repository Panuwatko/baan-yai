// Screens and UI flow: start → event → result → … → ending. Game rules live in engine.js.
import { ENDINGS, ENDING_KEYS } from "../data/endings.js";
import * as E from "./engine.js";
import * as store from "./storage.js";
import * as sfx from "./audio.js";
import { jumpScare } from "./scare.js";

const $ = id => document.getElementById(id);
const scene = $("scene");
const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let S = null, prefs = store.loadPrefs(), busy = false;

/* ---------- typewriter (splits by grapheme so Thai vowels never float alone) ---------- */
const seg = "Segmenter" in Intl ? new Intl.Segmenter("th", { granularity: "grapheme" }) : null;
const graphemes = t => seg ? [...seg.segment(t)].map(s => s.segment) : Array.from(t);
let typing = null;
function type(el, text, done){
  if (typing) clearInterval(typing.id);
  if (RM) { el.textContent = text; typing = null; done && done(); return; }
  const parts = graphemes(text); let i = 0; el.textContent = "";
  const id = setInterval(() => {
    el.textContent += parts[i++];
    if (i >= parts.length) { clearInterval(id); typing = null; done && done(); }
  }, 26);
  typing = { id, el, text, done };
}
function skipType(){
  if (!typing) return;
  clearInterval(typing.id); typing.el.textContent = typing.text;
  const d = typing.done; typing = null; d && d();
}
scene.addEventListener("click", e => { if (!e.target.closest("button")) skipType(); });

/* ---------- HUD ---------- */
const clock = m => `${String((22 + Math.floor(m / 60)) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")} น.`;
function hud(show){
  $("hud").hidden = !show;
  if (!show) return;
  $("car").style.left = (S.km / E.TOTAL_KM * 100) + "%";
  $("sanBar").style.width = S.san + "%"; $("sanBar").classList.toggle("low", S.san < 35); $("sanVal").textContent = S.san;
  $("fuelBar").style.width = S.fuel + "%"; $("fuelBar").classList.toggle("low", S.fuel < 20); $("fuelVal").textContent = S.fuel;
  $("clock").textContent = clock(S.min); $("km").textContent = `${S.km} / ${E.TOTAL_KM} กม.`;
  $("bag").innerHTML = S.bag.map(b => `<span class="chip">${esc(b)}</span>`).join("");
}
$("pause").onclick = () => { if (!busy) { skipType(); showStart(); } };

/* ---------- wake lock: keep the screen on while playing ---------- */
let lock = null;
async function keepAwake(){ try { lock = await navigator.wakeLock?.request("screen"); } catch (e) {} }
document.addEventListener("visibilitychange", () => { if (!document.hidden && S && S.phase !== "end") keepAwake(); });

function choicesBox(html, bind){
  const box = $("choices"); box.classList.add("fade"); box.innerHTML = html; bind && bind(box);
}

/* ---------- screens ---------- */
function showStart(){
  hud(false);
  const saved = store.loadGame(), canResume = saved && saved.phase !== "end" && E.byId(saved.cur);
  const f = store.found().length;
  scene.innerHTML = `
    <p class="eyebrow">TEXT ADVENTURE · ROAD TRIP</p>
    <h1>ทางกลับบ้านยาย</h1>
    <p class="lead">คืนนี้คุณต้องขับรถคนเดียวไปบ้านยายให้ถึงก่อนเช้า ระหว่างทางจะเจอเรื่องแปลกๆ ที่ไม่เหมือนกันสักรอบ ทุกทางเลือกมีผลกับสติและน้ำมันที่เหลืออยู่</p>
    <p class="route">กรุงเทพฯ → บ้านยาย ต.ห้วยหินลาด · ${E.TOTAL_KM} กม. · ออกเดินทาง 22:00 น.</p>
    <div class="panel">
      <p>เกมนี้มีภาพและเสียงที่อาจทำให้ตกใจ (jump scare) แนะนำให้ใส่หูฟัง</p>
      <label class="toggle" for="jumpToggle"><input type="checkbox" id="jumpToggle" ${prefs.jump ? "checked" : ""}> เปิด jump scare</label>
      <label class="toggle" for="soundToggle"><input type="checkbox" id="soundToggle" ${prefs.sound ? "checked" : ""}> เปิดเสียง</label>
    </div>
    <div class="choices" id="choices">
      ${canResume ? `<button class="btn primary" id="resume">ขับต่อจากที่พักไว้ (${saved.km} กม.)</button>` : ""}
      <button class="btn ${canResume ? "" : "primary"}" id="go">${canResume ? "เริ่มเดินทางใหม่" : "สตาร์ทรถ"}</button>
      <button class="btn quiet" id="gallery">ฉากจบที่เจอแล้ว ${f} / ${ENDING_KEYS.length}</button>
    </div>`;
  const readPrefs = () => {
    prefs = { jump: $("jumpToggle").checked, sound: $("soundToggle").checked };
    store.savePrefs(prefs); sfx.enable(prefs.sound); keepAwake();
  };
  $("go").onclick = () => { readPrefs(); S = E.fresh(); E.nextEvent(S); store.saveGame(S); renderEvent(false); };
  if (canResume) $("resume").onclick = () => { readPrefs(); S = saved; route(); };
  $("gallery").onclick = showGallery;
}

function showGallery(){
  hud(false);
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
  scene.innerHTML = `
    <p class="eyebrow">ช่วงที่ ${S.leg + 1} · ${clock(S.min)}</p>
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
  const text = E.textOf(e, S);
  if (instant) { $("story").textContent = text; show(); } else type($("story"), text, show);
}

async function choose(i){
  if (busy) return;
  busy = true;
  const ghost = E.choose(S, i, prefs.jump);
  store.saveGame(S);
  if (ghost) await jumpScare(ghost, scene);
  busy = false;
  renderResult(false);
}

function renderResult(instant){
  hud(true);
  const r = S.res, chips = [], sign = n => n > 0 ? "+" + n : "−" + Math.abs(n);
  if (r.ds) chips.push(`<span class="chip ${r.ds < 0 ? "bad" : "good"}">สติ ${sign(r.ds)}</span>`);
  if (r.df) chips.push(`<span class="chip ${r.df < 0 ? "bad" : "good"}">น้ำมัน ${sign(r.df)}</span>`);
  if (r.item) chips.push(`<span class="chip good">ได้: ${esc(r.item)}</span>`);
  if (r.used) chips.push(`<span class="chip">ใช้: ${esc(r.used)}</span>`);
  if (r.lost) chips.push(`<span class="chip bad">หลงทาง</span>`);
  if (r.short) chips.push(`<span class="chip good">ทางลัด +${E.STEP_KM} กม.</span>`);
  scene.innerHTML = `
    <p class="eyebrow">${clock(S.min)}</p>
    <p class="picked">คุณเลือก: ${esc(r.choice)}</p>
    <p class="story" id="story"></p>
    <div class="deltas">${chips.join("")}</div>
    <div class="choices" id="choices"></div>`;
  const show = () => choicesBox(`<button class="btn primary" id="next">ขับต่อ</button>`, () => $("next").onclick = proceed);
  if (instant) { $("story").textContent = r.text; show(); } else type($("story"), r.text, show);
}

function proceed(){
  if (busy) return;
  const k = E.checkEnding(S);
  if (k) { S.phase = "end"; S.ending = k; store.addFound(k); store.saveGame(S); renderEnd(false); return; }
  E.nextEvent(S); store.saveGame(S); renderEvent(false);
}

function renderEnd(instant){
  hud(true);
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
  type($("story"), en.text, async () => {
    if (en.scare && prefs.jump) { busy = true; await jumpScare(en.ghost, scene); busy = false; }
    show();
  });
}

/* ---------- boot ---------- */
showStart();
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
