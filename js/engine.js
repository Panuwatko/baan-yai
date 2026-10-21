// Game rules: state, the real-time drive, random event picking, choice resolution and ending checks.
// No DOM here: the UI calls drive() with the game minutes that passed and plays what it returns.
import { EVENTS } from "../data/events.js";
import { ENDINGS, ENDING_KEYS } from "../data/endings.js";
import { AMBUSHES } from "../data/ambushes.js";
import { LOOKS } from "../data/looks.js";
import * as L from "../data/logs.js";
import { SAVE_VERSION } from "./storage.js";
import { viewFor } from "./scenery.js";

export const TOTAL_KM = 420, STEP_KM = 35;
// Game minutes per real second at x1. A normal-speed trip is ~280 game minutes, so ~30 real minutes at x1.
export const BASE_RATE = .16, MULTS = [1, 2, 4, 8];
// kmh sets the pace; fuel is % of the tank per km; risk scales surprise scares.
// Fast takes about half the real time of normal, at a real cost in fuel and crash risk.
export const SPEEDS = { slow: { kmh: 60, fuel: .12, risk: .7 }, normal: { kmh: 90, fuel: .15, risk: 1 }, fast: { kmh: 165, fuel: .22, risk: 1.7 } };
const LOG_EVERY = 1.6;              // game minutes between log lines (~10 s at x1)
const MAX_SCARES = 4, MAX_AMBUSH = 3, MAX_LOOKS = 4, MAX_FAKES = 3, FAKE_CHANCE = .2, LOOK_SANITY = -6;
const clamp = v => Math.max(0, Math.min(100, v));
const pick = a => a[Math.random() * a.length | 0];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const between = (a, b) => a + Math.random() * (b - a);

export function fresh(){
  return { v: SAVE_VERSION, phase: "drive", san: 100, fuel: 80, km: 0, min: 0, leg: 0, lost: 0,
           bag: [], flags: {}, used: [], scares: 0, cur: null, deal: [], res: null, ending: null,
           ambush: 0, ambushUsed: [], fakes: 0, dread: 0, looks: 0, look: null,
           speed: "normal", lights: "low", radio: "off", win: "closed", mult: 1,
           drowsy: 0, logT: 0, nextKm: between(18, 28), nextRest: between(40, 70), restOffer: null,
           warnedFuel: false, warnedLate: false, log: [], crash: null, damage: 0,
           scene: { setting: "road", weather: "clear" }, thread: null, threadsUsed: [], echoed: [], recent: [] };
}

export const byId = id => EVENTS.find(e => e.id === id);
export const textOf = (e, S) => typeof e.text === "function" ? e.text(S) : e.text;

/* ---------- the drive ---------- */

// Picks the next travel-log line. In order of precedence: the next step of a story that is unfolding,
// a new story, a memory of an event already passed, then a weighted mix of omens, drowsiness, the
// current scenery, weather, the hour, settings, radio, thoughts and plain road.
function logLine(S){
  const fill = t => t.replace("{km}", Math.floor(S.km)).replace("{town}", pick(L.TOWNS)).replace("{n}", 3 + (Math.random() * 40 | 0));
  // Avoid lines shown recently: a few retries, then accept a repeat.
  const fresh = pool => {
    let t = pick(pool);
    for (let i = 0; i < 4 && S.recent.includes(t); i++) t = pick(pool);
    S.recent.push(t); if (S.recent.length > 40) S.recent.shift();
    return t;
  };
  const th = S.thread;
  if (th && S.min >= th.next) {
    const steps = L.THREADS.find(t => t.id === th.id).steps, step = steps[th.step++];
    if (th.step >= steps.length) S.thread = null; else th.next = S.min + between(8, 18);
    if (step.kind === "omen") S.dread = clamp(S.dread + 3);
    return { kind: step.kind, text: step.text };
  }
  if (!th && S.km > 10 && Math.random() < .07) {
    const unused = L.THREADS.filter(t => !S.threadsUsed.includes(t.id));
    if (unused.length) {
      const t = pick(unused);
      S.threadsUsed.push(t.id); S.thread = { id: t.id, step: 1, next: S.min + between(8, 18) };
      return { kind: t.steps[0].kind, text: t.steps[0].text };
    }
  }
  if (Math.random() < .08) {
    const mem = S.used.filter(id => L.ECHO[id] && !S.echoed.includes(id));
    if (mem.length) { const id = pick(mem); S.echoed.push(id); return { kind: "thought", text: L.ECHO[id] }; }
  }
  const omen = .06 + S.dread / 100 * .3, sc = S.scene || { setting: "road", weather: "clear" };
  const hour = L.HOURS.find(h => S.min >= h.from && S.min < h.to);
  const pools = [
    [S.flags.passenger ? .15 : 0, L.PASSENGER, "omen"],
    [omen, S.dread > 45 ? L.OMEN_HIGH : L.OMEN_LOW, "omen"],
    [S.drowsy > 60 ? .25 : 0, L.DROWSY, "drowsy"],
    [.2, L.SCENE[sc.setting], "road"],
    [sc.weather !== "clear" ? .12 : 0, L.WEATHER[sc.weather], "road"],
    [.06, hour.lines, "thought"],
    [S.lights === "high" ? .1 : 0, L.LIGHTS_HIGH, "omen"],
    [S.win === "open" ? .08 : 0, L.WINDOW_OPEN, "road"],
    [S.radio !== "off" ? .2 : 0, L.RADIO[S.radio] || [], "radio"],
    [.14, L.THOUGHT, "thought"]
  ];
  let x = Math.random();
  for (const [w, pool, kind] of pools) { if (pool && pool.length && (x -= w) < 0) return { kind, text: fill(fresh(pool)) }; }
  return { kind: "road", text: fill(fresh(L.ROAD)) };
}

function pickLook(S){
  const weights = { mirror: 1, glass: 1, road: S.lights === "high" ? 2.2 : 1, forest: S.lights === "high" ? 1.8 : .8 };
  let x = Math.random() * Object.values(weights).reduce((a, b) => a + b, 0);
  const scene = Object.keys(weights).find(k => (x -= weights[k]) < 0) || "mirror";
  return { scene, ghost: pick(LOOKS[scene].ghosts), hit: Math.random() < lookOdds(S), wait: between(1800, 4600) };
}
export const lookOdds = S => Math.min(.82, .12 + S.dread / 100 * .7);

// Advances the drive by gm game minutes. Returns what happened, in order:
//   {type:"log", kind, text}  {type:"decision"}  {type:"ambush", a}  {type:"look"}
//   {type:"rest"} (a stop is offered)  {type:"doze", ...}  {type:"end", key}
// Anything other than a log line stops the batch, so the UI can play it before driving on.
export function drive(S, gm){
  const out = [], sp = SPEEDS[S.speed];
  while (gm > 0 && S.phase === "drive") {
    const dt = Math.min(gm, .5); gm -= dt;
    const dkm = sp.kmh / 60 * dt;
    S.km = Math.min(TOTAL_KM, S.km + dkm); S.min += dt;
    S.fuel = clamp(S.fuel - sp.fuel * dkm);
    S.drowsy = clamp(S.drowsy + dt * (S.win === "open" ? -.6 : .45) * (S.radio === "dhamma" ? 1.4 : S.radio === "music" ? .8 : 1));
    S.san = clamp(S.san + dt * ((S.radio === "music" ? .05 : S.radio === "dhamma" ? .04 : 0) - (S.drowsy > 70 ? .04 : 0)));
    S.dread = clamp(S.dread + dt * (-.02 - (S.radio === "dhamma" ? .08 : 0) + (S.lights === "high" ? .02 : 0) + (S.win === "open" ? .02 : 0)));
    if (S.restOffer && S.min > S.restOffer.until) S.restOffer = null;

    const end = checkEnding(S);
    if (end) { out.push({ type: "end", key: end }); break; }
    if (S.km >= S.nextKm && S.km < TOTAL_KM - 5) { nextEvent(S); out.push({ type: "decision" }); break; }

    S.logT += dt;
    if (S.logT >= LOG_EVERY) { S.logT = 0; out.push({ type: "log", ...logLine(S) }); }
    if (!S.warnedFuel && S.fuel < 15) { S.warnedFuel = true; out.push({ type: "log", kind: "warn", text: pick(L.FUEL_LOW) }); }
    if (!S.warnedLate && S.min > 240) { S.warnedLate = true; out.push({ type: "log", kind: "thought", text: pick(L.LATE) }); }

    // A possessed radio: the longer it plays and the higher the dread, the likelier.
    if (S.radio !== "off" && Math.random() < dt * .004 * (1 + S.dread / 50)) {
      S.san = clamp(S.san - 4); S.dread = clamp(S.dread + 5);
      out.push({ type: "log", kind: "omen", text: pick(L.RADIO.haunted) });
    }
    const nearDecision = S.nextKm - S.km < 6;
    if (S.km > 15 && !nearDecision && S.ambush < MAX_AMBUSH && Math.random() < dt * .004 * sp.risk * (S.win === "open" ? 1.4 : 1) * (1 + S.dread / 100)) {
      const left = AMBUSHES.map((a, i) => i).filter(i => !S.ambushUsed.includes(i));
      if (left.length) { const i = pick(left); S.ambushUsed.push(i); out.push({ type: "ambush", a: triggerAmbush(S, i), crash: crashRoll(S, .06) }); break; }
    }
    if (S.km > 40 && !nearDecision && S.looks < MAX_LOOKS && Math.random() < dt * .005 * (S.lights === "high" ? 1.7 : 1)) {
      S.looks++; S.look = pickLook(S); out.push({ type: "look" }); break;
    }
    if (!S.restOffer && S.min >= S.nextRest) {
      const i = Math.random() * L.RESTS.length | 0;
      S.restOffer = { i, until: S.min + 6 }; S.nextRest = S.min + between(50, 85);
      out.push({ type: "rest", text: L.RESTS[i].line }); break;
    }
    if (S.drowsy > 75 && Math.random() < dt * .015 * (S.drowsy - 75) / 25) { out.push({ type: "doze", ...doze(S) }); break; }
  }
  return out;
}

export function setOption(S, key, value){ S[key] = value; return L.SETTING_LINES[key][value]; }

// Startled, drowsy, reckless or fast: the car can leave the road. Odds scale with speed, drowsiness,
// low sanity and damage from earlier crashes; how bad it is depends mostly on speed.
// Returns null, or { sev: "minor" | "hospital" | "disabled" | "dead", text }.
// A severe crash sets S.crash, which ends the trip through the matching ending.
const CRASH_SPEED = { slow: .5, normal: 1, fast: 2 }, CRASH_SEVERITY = { slow: .55, normal: .92, fast: 1 };
function crashRoll(S, chance){
  const p = chance * CRASH_SPEED[S.speed] * (1 + S.drowsy / 100) * (S.san < 30 ? 1.5 : 1) * (1 + S.damage * .3);
  if (Math.random() > p) return null;
  const x = Math.random() * CRASH_SEVERITY[S.speed] + S.damage * .08;
  if (x < .55) {
    S.damage++; S.san = clamp(S.san - 10); S.fuel = clamp(S.fuel - 4); S.min += 20; S.dread = clamp(S.dread + 5);
    return { sev: "minor", text: pick(L.CRASH_MINOR) + "  (สติ −10)" };
  }
  S.crash = x < .75 ? "hospital" : x < .88 ? "disabled" : "dead";
  return { sev: S.crash, text: L.CRASH_SEVERE };
}

function triggerAmbush(S, i){
  const a = AMBUSHES[i], before = S.san;
  S.ambush++; S.san = clamp(S.san + (a.s || 0)); S.dread = clamp(S.dread + 6);
  return { ...a, ds: S.san - before };
}

export function finishLook(S){
  const hit = S.look.hit, before = S.san;
  if (hit) { S.san = clamp(S.san + LOOK_SANITY); S.dread = clamp(S.dread + 5); }
  S.look = null;
  const crash = hit ? crashRoll(S, .05) : null;
  return { hit, ds: S.san - before, crash };
}

// Nodding off at the wheel: you might wake in time, wake somewhere else, or wake to a face.
function doze(S){
  const r = Math.random(), before = S.san;
  let res;
  if (r < .5) res = { text: "รถส่ายออกนอกเลน คุณสะดุ้งตื่น หัวใจเต้นแรง", ghost: null, crash: crashRoll(S, 1) };
  else if (r < .8) { S.km = Math.max(0, S.km - 20); S.lost += .5; res = { text: "คุณวูบไปพักหนึ่ง ตื่นมาอีกที รถจอดอยู่ข้างทางที่ไม่คุ้นตา ต้องย้อนกลับไปเกือบ 20 กิโล", ghost: null }; }
  else res = { text: "คุณหลับไปแค่วินาทีเดียว ลืมตาขึ้นมาเจอหน้าใครคนหนึ่งแนบกระจกหน้ารถ", ghost: "pale" };
  S.san = clamp(S.san - (res.ghost ? 15 : 8)); S.drowsy = clamp(S.drowsy - 45);
  return { ...res, ds: S.san - before };
}

// Pulling in at the stop offered in the log. Any stop can turn out not to be what it looked like.
export function takeRest(S){
  const R = L.RESTS[S.restOffer.i], before = { san: S.san, fuel: S.fuel };
  S.restOffer = null;
  const twisted = Math.random() < twistChance(S);
  S.min += R.t; S.drowsy = R.rest ? 0 : S.drowsy;
  if (R.fuel) S.fuel = clamp(R.fuelAdd ? S.fuel + R.fuel : Math.max(S.fuel, R.fuel));
  if (twisted) { S.san = clamp(S.san - 12); S.dread = clamp(S.dread + 10); }
  else { S.san = clamp(S.san + R.s); S.dread = clamp(S.dread + (R.dread || -5)); }
  return { text: twisted ? R.twist : R.ok, ghost: twisted ? R.ghost : null, ds: S.san - before.san, df: S.fuel - before.fuel, twisted };
}

/* ---------- decisions ---------- */

// The first third of the road draws tier 0 events, the middle tier 1, the last stretch tier 2.
const stage = S => S.km < TOTAL_KM / 3 ? 0 : S.km < TOTAL_KM * 2 / 3 ? 1 : 2;

export function nextEvent(S){
  const st = stage(S), unused = EVENTS.filter(e => !S.used.includes(e.id));
  let pool = unused.filter(e => e.tier === st || e.tier < 0);
  if (!pool.length) pool = unused;
  if (!pool.length) { S.used = []; pool = EVENTS; }
  const e = pick(pool);
  const usable = e.choices.map((c, i) => i).filter(i => !e.choices[i].need || S.bag.includes(e.choices[i].need));
  S.cur = e.id; S.deal = shuffle(usable).slice(0, 3); S.phase = "event";
  const v = viewFor(e.id, e.title + " " + textOf(e, S)); S.scene = { setting: v.setting, weather: v.weather };
  S.nextKm = S.km + between(31, 39);
}

// Dread is hidden. Choices that cost sanity, invite a scare or pick up the hitchhiker raise it;
// choices that calm you, use a charm or show respect lower it. It sets the odds of looks and twists.
function updateDread(S, c, o){
  const risk = Math.max(0, -(o.s || 0)) * .8 + (o.scare || o.sc ? 8 : 0) + (o.flag === "passenger" ? 15 : 0);
  const calm = Math.max(0, o.s || 0) + (o.use ? 12 : 0) + (c.need ? 6 : 0);
  S.dread = clamp(S.dread + risk - calm);
}

// Even a good choice can go wrong: 20% with no dread, up to 50% when dread is full.
const RECKLESS = /เร่ง|เหยียบ|ฝ่า|ชน|หนี/;
export const twistChance = S => .2 + S.dread / 100 * .3;

function resolve(c){
  if (!Array.isArray(c.r)) return c.r;
  const x = Math.random(); let acc = 0;
  for (const o of c.r) { acc += o.p; if (x < acc) return o; }
  return c.r[c.r.length - 1];
}

// A choice that looked right backfires. Uses the event's own twist when it has one,
// otherwise the charm breaks (or a generic line) and it costs sanity instead.
function twistOf(S, c, o){
  // "Looks right" = calms you, uses a charm, or costs almost nothing.
  const hasOwn = !!o.twist, looksGood = (o.s || 0) >= -5 || !!c.need;
  if (!(hasOwn || looksGood) || Math.random() > twistChance(S) * (hasOwn ? 1 : .8)) return null;
  if (hasOwn) return { t: o.t, f: o.f, ...o.twist };
  if (c.need) S.bag = S.bag.filter(b => b !== c.need);   // the charm is spent or broken either way
  return { text: L.TWISTS[c.need] || pick(L.TWISTS.default), s: -10, t: o.t, f: o.f, km: o.km, sc: .35, ghost: "pale" };
}

// Applies choice i of the current event. Returns how the scare should play, or null:
//   { ghost, mode: "instant" }  right as the choice is tapped, no warning
//   { ghost, mode: "mid" }      halfway through reading the result
//   { ghost, mode: "hush" }     after a dim, silent build-up
//   { ghost: null, mode: "fake" } the same build-up, but nothing comes
export function choose(S, i, jumpOn){
  const e = byId(S.cur), c = e.choices[i], base = resolve(c), tw = twistOf(S, c, base), o = tw || base;
  // Event data uses km: 60 / -60 to mean "shortcut" / "got lost"; only the sign matters here.
  const before = { san: S.san, fuel: S.fuel }, km = Math.sign(o.km || 0) * STEP_KM;
  S.san = clamp(S.san + (o.s || 0));
  S.fuel = clamp(S.fuel + (o.f || 0));
  S.km = Math.max(0, Math.min(TOTAL_KM, S.km + km));
  if (km) S.nextKm += km;
  S.min += o.t || 0;
  if (km < 0) S.lost++;
  if (!tw && o.item && !S.bag.includes(o.item)) S.bag.push(o.item);
  if (!tw && o.use && c.need) S.bag = S.bag.filter(b => b !== c.need);
  if (o.flag) S.flags[o.flag] = 1;
  if (o.unflag) delete S.flags[o.unflag];
  S.used.push(e.id); S.leg++;
  S.res = { title: e.title, choice: c.label, text: o.text, ds: S.san - before.san, df: S.fuel - before.fuel,
            item: tw ? null : o.item || null, used: !tw && o.use ? c.need : null, lost: km < 0, short: km > 0, twist: !!tw };
  // Reckless choices on a night road can end in a crash.
  const crash = RECKLESS.test(c.label) ? crashRoll(S, .12) : null;
  if (crash) { S.res.crash = crash.sev; S.res.text += " " + L.CRASH_RECKLESS + (crash.sev === "minor" ? "" : " แล้วทุกอย่างก็มืดไป"); S.res.ds = S.san - before.san; }
  S.phase = "result";
  updateDread(S, c, o);
  if (tw) S.dread = clamp(S.dread + 10);
  if (!jumpOn) return null;
  if ((o.scare || (o.sc && Math.random() < o.sc)) && S.scares < MAX_SCARES) {
    S.scares++;
    const r = Math.random();
    return { ghost: o.ghost || "pale", mode: r < .35 ? "instant" : r < .7 ? "mid" : "hush" };
  }
  if (S.fakes < MAX_FAKES && Math.random() < FAKE_CHANCE) { S.fakes++; return { ghost: null, mode: "fake" }; }
  return null;
}

// Driving on after a decision steadies you a little.
export function resume(S){ S.phase = "drive"; S.res = null; S.san = clamp(S.san + 4); }

export function checkEnding(S){
  const arrived = S.km >= TOTAL_KM;
  return ENDING_KEYS.find(k => {
    const en = ENDINGS[k];
    return (en.at === "road" || arrived) && en.when(S);
  }) || null;
}
