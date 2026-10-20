// Game rules: state, random event picking, choice resolution and ending checks. No DOM here.
import { EVENTS } from "../data/events.js";
import { ENDINGS, ENDING_KEYS } from "../data/endings.js";
import { SAVE_VERSION } from "./storage.js";

export const TOTAL_KM = 420, STEP_KM = 60, FUEL_PER_LEG = 8, MIN_PER_LEG = 35, MAX_SCARES = 3;
const clamp = v => Math.max(0, Math.min(100, v));
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

export function fresh(){
  return { v: SAVE_VERSION, phase: "event", san: 100, fuel: 70, km: 0, min: 0, leg: 0, lost: 0,
           bag: [], flags: {}, used: [], scares: 0, cur: null, deal: [], res: null, ending: null };
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
}

function resolve(c){
  if (!Array.isArray(c.r)) return c.r;
  const x = Math.random(); let acc = 0;
  for (const o of c.r) { acc += o.p; if (x < acc) return o; }
  return c.r[c.r.length - 1];
}

// Applies choice i of the current event. Returns the ghost type to show, or null.
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
  const scare = o.scare || (o.sc && Math.random() < o.sc);
  if (!scare || !jumpOn || S.scares >= MAX_SCARES) return null;
  S.scares++;
  return o.ghost || "pale";
}

export function checkEnding(S){
  const arrived = S.km >= TOTAL_KM;
  return ENDING_KEYS.find(k => {
    const en = ENDINGS[k];
    return (en.at === "road" || arrived) && en.when(S);
  }) || null;
}
