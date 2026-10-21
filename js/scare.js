// Full-screen jump scares: a ghost photo (data/media.js), color-graded, re-framed slightly
// differently each time, with grain, a vignette, a shake and a scream.
import { scream, quiet, creak, loadSamples } from "./audio.js";
import { MEDIA } from "../data/media.js";

const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
const BUILD_UP = [900, 1900];  // ms of silence before a "hush" scare (random in range)
const SHOW_MS = 900;
let overlay, canvas;

function ensure(){
  if (overlay) return;
  overlay = document.createElement("div"); overlay.className = "scare"; overlay.hidden = true;
  canvas = document.createElement("canvas"); overlay.appendChild(canvas);
  document.body.appendChild(overlay);
}

function setup(){
  const dpr = Math.min(devicePixelRatio || 1, 2), w = innerWidth, h = innerHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const g = canvas.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { g, w, h };
}

const rand = (a, b) => a + Math.random() * (b - a);

// Film grain is rendered once into a small tile, then laid over each scare as a pattern
// at a random offset, so it costs one fill instead of thousands of tiny rects.
let grainTile = null;
function makeGrain(){
  if (grainTile) return;
  grainTile = document.createElement("canvas"); grainTile.width = grainTile.height = 256;
  const t = grainTile.getContext("2d");
  for (let i = 0; i < 1400; i++) {
    t.fillStyle = `rgba(${Math.random() < .5 ? "255,255,255" : "0,0,0"},${Math.random() * .12})`;
    t.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
}
function grain(g, w, h){
  makeGrain();
  const ox = Math.random() * 256, oy = Math.random() * 256;
  g.save(); g.translate(-ox, -oy);
  g.fillStyle = g.createPattern(grainTile, "repeat"); g.fillRect(0, 0, w + ox, h + oy);
  g.restore();
}
function vignette(g, w, h){
  const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .25, w / 2, h / 2, Math.max(w, h) * .75);
  v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,.92)");
  g.fillStyle = v; g.fillRect(0, 0, w, h);
}

const wait = ms => new Promise(r => setTimeout(r, ms));

// Photos are loaded ahead of time: a scare that waits on a download loses its punch.
// Each type keeps a list; a path listed twice is picked twice as often. decode() does the
// JPEG/WebP decoding now, so the first scare doesn't stall while a photo is unpacked.
const photos = {};
let preloaded = false;
export function preloadMedia(){
  ensure(); makeGrain(); setup();   // warm up the overlay canvas now, not during the first scare
  const sounds = {};
  if (!preloaded) {
    preloaded = true;
    for (const [type, m] of Object.entries(MEDIA)) {
      photos[type] = [];
      for (const src of [].concat(m.img || [])) { const im = new Image(); im.src = src; im.decode().then(() => photos[type].push(im), () => {}); }
    }
  }
  for (const [type, m] of Object.entries(MEDIA)) if (m.sound) sounds[type] = m.sound;
  loadSamples(sounds);
}
const photoFor = type => { const list = photos[type]; return list && list.length ? list[Math.random() * list.length | 0] : null; };
const isRaw = type => !!(MEDIA[type] && MEDIA[type].raw);

function drawPhoto(g, w, h, im, raw){
  g.fillStyle = "#000"; g.fillRect(0, 0, w, h);
  const zoom = rand(1.02, 1.12), s = Math.max(w / im.width, h / im.height) * zoom;
  const dw = im.width * s, dh = im.height * s;
  // Grade photos the same way (cold, desaturated, harsher) so daylight shots still feel like night.
  if (!raw) g.filter = "grayscale(.55) contrast(1.25) brightness(.78)";
  g.drawImage(im, (w - dw) / 2 + rand(-.02, .02) * w, (h - dh) / 2, dw, dh);
  g.filter = "none";
  if (!raw) { g.fillStyle = "rgba(0,14,10,.22)"; g.fillRect(0, 0, w, h); }
}

function flash(type){
  const { g, w, h } = setup();
  // A type whose photos failed to load borrows from the pale ghost's pool.
  const photo = photoFor(type) || photoFor("pale");
  if (photo) drawPhoto(g, w, h, photo, isRaw(type));
  else { g.fillStyle = "#000"; g.fillRect(0, 0, w, h); }
  grain(g, w, h); vignette(g, w, h);
  overlay.hidden = false; if (!RM) overlay.classList.add("shake");
  scream(type);
  try { navigator.vibrate && navigator.vibrate([90, 40, 260]); } catch (e) {}
}

// buildup "hush": dim + silence first (the classic). "none": hits instantly with no warning.
export async function jumpScare(type, scene, { buildup = "hush" } = {}){
  ensure();
  if (buildup === "hush") { document.body.classList.add("hushing"); quiet(true); await wait(rand(...BUILD_UP)); }
  flash(type);
  await wait(SHOW_MS);
  overlay.hidden = true; overlay.classList.remove("shake");
  document.body.classList.remove("hushing"); quiet(false);
}

// Looks exactly like a hush build-up, but nothing comes. Keeps players from reading the pattern.
export async function fakeOut(scene){
  document.body.classList.add("hushing"); quiet(true);
  await wait(rand(700, 1300));
  if (Math.random() < .5) creak();
  await wait(rand(900, 1500));
  document.body.classList.remove("hushing"); quiet(false);
}
