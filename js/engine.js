// Game rules: state, random event picking, choice resolution and ending checks. No DOM here.
import { EVENTS } from "../data/events.js";
import { ENDINGS, ENDING_KEYS } from "../data/endings.js";
import { AMBUSHES } from "../data/ambushes.js";
import { LOOKS } from "../data/looks.js";
import { SAVE_VERSION } from "./storage.js";

export const TOTAL_KM = 420, STEP_KM = 60, FUEL_PER_LEG = 8, MIN_PER_LEG = 35, MAX_SCARES = 3;
// Surprise scares and fake build-ups make the timing of a scare hard to read.
const MAX_AMBUSH = 2, AMBUSH_CHANCE = .3, MAX_FAKES = 2, FAKE_CHANCE = .2;
// Look moments: how often one follows a result, and how many per trip.
const LOOK_CHANCE = .4, MAX_LOOKS = 3, LOOK_SANITY = -10;
const clamp = v => Math.max(0, Math.min(100, v));
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

export function fresh(){
  return { v: SAVE_VERSION, phase: "event", san: 100, fuel: 70, km: 0, min: 0, leg: 0, lost: 0,
           bag: [], flags: {}, used: [], scares: 0, cur: null, deal: [], res: null, ending: null,
           ambush: 0, lastAmbush: -9, ambushUsed: [], pending: null, fakes: 0,
           dread: 0, looks: 0, look: null };
}

export const byId = id => EVENTS.find(e => e.id === id);
export const textOf = (e, S) => typeof e.text === "function" ? e.text(S) : e.text;

// Early legs draw tier 0, middle legs tier 1, the last stretch tier 2; tier -1 can appear anywhere.
const stage = S => S.leg < 2 ? 0 : S.leg < 5 ? 1 : 2;

export function nextEvent(S){
  const st = stage(S), unused = EVENTS.filter(e => !S.used.includes(e.id));
  let pool = unused.filter(e => e.tier === st || e.tier < 0);
  if (!pool.length) pool = unused;
  if (!pool.length) { S.used = []; pool = EVENTS; }
  const e = pool[Math.random() * pool.length | 0];
  const usable = e.choices.map((c, i) => i).filter(i => !e.choices[i].need || S.bag.includes(e.choices[i].need));
  S.cur = e.id; S.deal = shuffle(usable).slice(0, 3); S.phase = "event";
  rollAmbush(S);
}

// Maybe schedule a surprise for this leg: somewhere inside the event text or the result text.
// Never on the first leg and never on two legs in a row.
function rollAmbush(S){
  S.pending = null;
  if (S.leg < 1 || S.ambush >= MAX_AMBUSH || S.lastAmbush >= S.leg - 1 || Math.random() > AMBUSH_CHANCE) return;
  const left = AMBUSHES.map((a, i) => i).filter(i => !S.ambushUsed.includes(i));
  if (!left.length) return;
  const i = left[Math.random() * left.length | 0];
  S.ambushUsed.push(i);
  S.pending = { i, where: Math.random() < .7 ? "event" : "result", at: .05 + Math.random() * .8 };
}

export function triggerAmbush(S){
  const a = AMBUSHES[S.pending.i], before = S.san;
  S.pending = null; S.ambush++; S.lastAmbush = S.leg;
  S.san = clamp(S.san + (a.s || 0));
  return { ...a, ds: S.san - before };
}

// Dread is hidden. Choices that cost sanity, invite a scare or pick up the hitchhiker raise it;
// choices that calm you, use a charm or show respect lower it. It sets the odds of a look moment going wrong.
function updateDread(S, c, o){
  const risk = Math.max(0, -(o.s || 0)) * .8 + (o.scare || o.sc ? 8 : 0) + (o.flag === "passenger" ? 15 : 0);
  const calm = Math.max(0, o.s || 0) + (o.use ? 12 : 0) + (c.need ? 6 : 0);
  S.dread = clamp(S.dread + risk - calm);
}
export const lookOdds = S => Math.min(.82, .12 + S.dread / 100 * .7);

function rollLook(S){
  S.look = null;
  if (S.leg < 2 || S.looks >= MAX_LOOKS || Math.random() > LOOK_CHANCE) return;
  const keys = Object.keys(LOOKS), scene = keys[Math.random() * keys.length | 0], ghosts = LOOKS[scene].ghosts;
  S.looks++;
  S.look = { scene, ghost: ghosts[Math.random() * ghosts.length | 0], hit: Math.random() < lookOdds(S), wait: 1800 + Math.random() * 2800 };
}
export function finishLook(S){
  const hit = S.look.hit, before = S.san;
  if (hit) S.san = clamp(S.san + LOOK_SANITY);
  S.look = null;
  return { hit, ds: S.san - before };
}

function resolve(c){
  if (!Array.isArray(c.r)) return c.r;
  const x = Math.random(); let acc = 0;
  for (const o of c.r) { acc += o.p; if (x < acc) return o; }
  return c.r[c.r.length - 1];
}

// Applies choice i of the current event. Returns how the scare should play, or null:
//   { ghost, mode: "instant" }  right as the choice is tapped, no warning
//   { ghost, mode: "mid" }      halfway through reading the result
//   { ghost, mode: "hush" }     after a dim, silent build-up
//   { ghost: null, mode: "fake" } the same build-up, but nothing comes
export function choose(S, i, jumpOn){
  const e = byId(S.cur), c = e.choices[i], o = resolve(c);
  const before = { san: S.san, fuel: S.fuel }, km = o.km || 0;
  S.san = clamp(S.san + (o.s || 0));
  S.fuel = clamp(S.fuel + (o.f || 0) - FUEL_PER_LEG);
  S.km = Math.max(0, Math.min(TOTAL_KM, S.km + STEP_KM + km));
  S.min += MIN_PER_LEG + (o.t || 0);
  if (km < 0) S.lost++;
  if (o.item && !S.bag.includes(o.item)) S.bag.push(o.item);
  if (o.use && c.need) S.bag = S.bag.filter(b => b !== c.need);
  if (o.flag) S.flags[o.flag] = 1;
  if (o.unflag) delete S.flags[o.unflag];
  S.used.push(e.id); S.leg++;
  S.res = { choice: c.label, text: o.text, ds: S.san - before.san, df: S.fuel - before.fuel,
            item: o.item || null, used: o.use ? c.need : null, lost: km < 0, short: km > 0 };
  S.phase = "result";
  updateDread(S, c, o);
  const scare = jumpOn && (o.scare || (o.sc && Math.random() < o.sc)) && S.scares < MAX_SCARES;
  if (!scare) rollLook(S); else S.look = null;   // a leg never gets both a choice scare and a look
  if (!jumpOn) return null;
  if (scare) {
    S.scares++;
    if (S.pending && S.pending.where === "result") S.pending = null;
    const r = Math.random();
    return { ghost: o.ghost || "pale", mode: r < .35 ? "instant" : r < .7 ? "mid" : "hush" };
  }
  if (!S.pending && !S.look && S.fakes < MAX_FAKES && Math.random() < FAKE_CHANCE) { S.fakes++; return { ghost: null, mode: "fake" }; }
  return null;
}

export function checkEnding(S){
  const arrived = S.km >= TOTAL_KM;
  return ENDING_KEYS.find(k => {
    const en = ENDINGS[k];
    return (en.at === "road" || arrived) && en.when(S);
  }) || null;
}
