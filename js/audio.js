// All sound is synthesized with Web Audio, so there are no audio files to load.
// Browsers only allow audio after a user gesture, so enable() must be called from a tap.
let ac = null, drone = null, on = true;
const DRONE_LEVEL = .05;

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
    drone = a.createGain(); drone.gain.setValueAtTime(0, a.currentTime);
    [55, 58.3, 110.4].forEach(f => { const o = a.createOscillator(); o.type = "sine"; o.frequency.value = f; o.connect(drone); o.start(); });
    drone.connect(a.destination);
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

export function scream(){
  const a = ctx(); if (!a) return;
  const t = a.currentTime, out = a.createGain();
  out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(.75, t + .02); out.gain.exponentialRampToValueAtTime(.001, t + 1.1);
  out.connect(a.destination);
  const len = a.sampleRate * 1.1 | 0, buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const n = a.createBufferSource(), bp = a.createBiquadFilter();
  n.buffer = buf; bp.type = "bandpass"; bp.frequency.value = 1900; bp.Q.value = .7;
  n.connect(bp); bp.connect(out); n.start(t);
  [520, 553, 1107].forEach(f => {
    const o = a.createOscillator(), g = a.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.6, t + .22); o.frequency.exponentialRampToValueAtTime(f * .7, t + 1.1);
    g.gain.value = .22; o.connect(g); g.connect(out); o.start(t); o.stop(t + 1.15);
  });
}

document.addEventListener("visibilitychange", () => {
  if (!ac) return;
  if (document.hidden) ac.suspend(); else if (on) ac.resume();
});
