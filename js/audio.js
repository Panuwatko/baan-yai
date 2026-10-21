// All sound is synthesized with Web Audio, so there are no audio files to load.
// Browsers only allow audio after a user gesture, so enable() must be called from a tap.
let ac = null, drone = null, on = true;
const DRONE_LEVEL = .035;   // background road rumble: low enough to sit under everything
const samples = {};         // decoded sound files by ghost type, see loadSamples()

function ctx(){
  if (!on) return null;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === "suspended") ac.resume();
  } catch (e) { ac = null; }
  return ac;
}

export function enable(soundOn){
  on = soundOn;
  if (!on && drone && ac) { drone.gain.setValueAtTime(0, ac.currentTime); return; }
  const a = ctx(); if (!a) return;
  if (!drone) {
    // Low-passed noise loop: sounds like tyres on a road at night rather than a musical hum.
    drone = a.createGain(); drone.gain.setValueAtTime(0, a.currentTime);
    const len = a.sampleRate * 3, buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + .02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    const src = a.createBufferSource(), lp = a.createBiquadFilter();
    src.buffer = buf; src.loop = true; lp.type = "lowpass"; lp.frequency.value = 160;
    src.connect(lp); lp.connect(drone); drone.connect(a.destination); src.start();
  }
  drone.gain.cancelScheduledValues(a.currentTime);
  drone.gain.linearRampToValueAtTime(DRONE_LEVEL, a.currentTime + 3);
}

// Fade the background hum out before a scare (on = true) and back in after.
export function quiet(silent){
  if (!drone || !ac || !on) return;
  const t = ac.currentTime;
  drone.gain.cancelScheduledValues(t); drone.gain.setValueAtTime(drone.gain.value, t);
  drone.gain.linearRampToValueAtTime(silent ? 0 : DRONE_LEVEL, t + (silent ? .3 : 2.5));
}

// Envelope that every scare sound plays through.
function burst(a, t, peak, dur){
  const out = a.createGain();
  out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(peak, t + .02); out.gain.exponentialRampToValueAtTime(.001, t + dur);
  out.connect(a.destination);
  return out;
}
function noise(a, t, dur, type, freq, q, out){
  const len = a.sampleRate * dur | 0, buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const n = a.createBufferSource(), f = a.createBiquadFilter();
  n.buffer = buf; f.type = type; f.frequency.value = freq; f.Q.value = q;
  n.connect(f); f.connect(out); n.start(t);
}
function saw(a, t, dur, from, peak, to, level, out){
  const o = a.createOscillator(), g = a.createGain();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(peak, t + dur * .2); o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.value = level; o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + .05);
}

// Real sound files (listed in data/media.js) replace the synthesized scare sounds when present.
export async function loadSamples(map){
  const a = ctx(); if (!a) return;
  await Promise.all(Object.entries(map).map(async ([type, url]) => {
    if (samples[type]) return;
    try { samples[type] = await a.decodeAudioData(await (await fetch(url)).arrayBuffer()); } catch (e) {}
  }));
}
function playSample(type){
  const a = ctx(), buf = samples[type];
  if (!a || !buf) return false;
  const src = a.createBufferSource(), g = a.createGain();
  src.buffer = buf; g.gain.value = .9; src.connect(g); g.connect(a.destination); src.start();
  return true;
}

// type = ghost type; uses its sound file if one is loaded, otherwise a synthesized scream.
export function scream(type){
  const a = ctx(); if (!a) return;
  if (type && playSample(type)) return;
  const t = a.currentTime, out = burst(a, t, .75, 1.1);
  noise(a, t, 1.1, "bandpass", 1900, .7, out);
  [520, 553, 1107].forEach(f => saw(a, t, 1.1, f, f * 1.6, f * .7, .22, out));
}

// A crash: low thump, crunching noise and a short metallic scrape.
export function crash(){
  const a = ctx(); if (!a) return;
  const t = a.currentTime, out = burst(a, t, .9, 1.2);
  noise(a, t, 1.2, "lowpass", 900, .8, out);
  saw(a, t + .05, .35, 1800, 2400, 700, .12, out);
  const o = a.createOscillator(), g = a.createGain();
  o.type = "sine"; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(35, t + .5);
  g.gain.setValueAtTime(.9, t); g.gain.exponentialRampToValueAtTime(.001, t + .6);
  o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + .65);
}

// A slow creak used by fake-outs: something is there, then nothing happens.
export function creak(){
  const a = ctx(); if (!a) return;
  const t = a.currentTime, out = burst(a, t, .12, 1.4);
  saw(a, t, 1.3, 140, 170, 95, .5, out);
}

// Heartbeat that starts below 40 sanity and speeds up as sanity drops.
let hbTimer = null, hbRate = 0;
function beat(level){
  const a = ctx(); if (!a) return;
  const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
  o.type = "sine"; o.frequency.setValueAtTime(72, t); o.frequency.exponentialRampToValueAtTime(40, t + .16);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level, t + .01); g.gain.exponentialRampToValueAtTime(.001, t + .2);
  o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + .22);
}
export function tension(san){
  const rate = on && san < 30 ? Math.round(1150 - (30 - san) * 12) : 0;
  if (rate === hbRate) return;
  hbRate = rate; clearInterval(hbTimer); hbTimer = null;
  if (rate) hbTimer = setInterval(() => { beat(.18); setTimeout(() => beat(.11), 170); }, rate);
}

document.addEventListener("visibilitychange", () => {
  if (!ac) return;
  if (document.hidden) ac.suspend(); else if (on) ac.resume();
});
