// Full-screen jump scares. Each ghost type is drawn on a canvas at the moment it appears,
// so there are no image files and every scare is slightly different.
import { scream, quiet, creak, loadSamples } from "./audio.js";
import { MEDIA } from "../data/media.js";

const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
const BUILD_UP = [900, 1900];  // ms of silence before a "hush" scare (random in range)
const SHOW_MS = 900;
const SOUND = { owl: "screech", dog: "growl", snake: "hiss" };
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

function grain(g, w, h){
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(${Math.random() < .5 ? "255,255,255" : "0,0,0"},${Math.random() * .12})`;
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
}
function vignette(g, w, h){
  const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .25, w / 2, h / 2, Math.max(w, h) * .75);
  v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,.92)");
  g.fillStyle = v; g.fillRect(0, 0, w, h);
}

// A face with hair, shared by the pale, drowned and crowd ghosts.
function portrait(g, cx, cy, fw, o){
  const fh = fw * (o.aspect || 1.34);
  g.save(); g.translate(cx, cy); g.rotate(o.tilt || 0);
  if (o.hair) { g.fillStyle = "#000"; g.beginPath(); g.ellipse(0, -fh * .08, fw * .78, fh * .9, 0, 0, Math.PI * 2); g.fill(); }
  const [c0, c1, c2] = o.skin, skin = g.createRadialGradient(0, -fh * .12, fw * .04, 0, 0, fw * .62);
  skin.addColorStop(0, c0); skin.addColorStop(.65, c1); skin.addColorStop(1, c2);
  g.fillStyle = skin; g.beginPath(); g.ellipse(0, 0, fw * .5, fh * .5, 0, 0, Math.PI * 2); g.fill();
  for (const s of [-1, 1]) {
    const ex = s * fw * .19, ey = -fh * .07, sock = g.createRadialGradient(ex, ey, 1, ex, ey, fw * .19);
    sock.addColorStop(0, "#000"); sock.addColorStop(.55, "#000"); sock.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = sock; g.beginPath(); g.ellipse(ex, ey, fw * .18, fw * .21, 0, 0, Math.PI * 2); g.fill();
    if (o.milky) {
      const m = g.createRadialGradient(ex, ey, 1, ex, ey, fw * .1);
      m.addColorStop(0, "#eef2ef"); m.addColorStop(1, "#8d9b97");
      g.fillStyle = m; g.beginPath(); g.ellipse(ex, ey, fw * .1, fw * .08, 0, 0, Math.PI * 2); g.fill();
    } else {
      g.fillStyle = "#f3f1e8"; g.beginPath(); g.arc(ex + s * fw * .012, ey + fw * .01, fw * .016, 0, Math.PI * 2); g.fill();
    }
  }
  const my = fh * .26, ms = o.mouth || 1, mouth = g.createRadialGradient(0, my, 1, 0, my, fw * .17 * ms);
  mouth.addColorStop(0, "#000"); mouth.addColorStop(.75, "#070707"); mouth.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = mouth; g.beginPath(); g.ellipse(0, my, fw * .11 * ms, fh * .16 * ms, 0, 0, Math.PI * 2); g.fill();
  if (o.wet) {
    for (let i = 0; i < 46; i++) {
      const x = rand(-fw * .45, fw * .45), y = rand(-fh * .35, fh * .2);
      g.strokeStyle = `rgba(8,28,26,${rand(.15, .45)})`; g.lineWidth = rand(1, 3);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + rand(-4, 4), y + rand(fh * .15, fh * .5)); g.stroke();
    }
  }
  g.strokeStyle = "#000"; g.lineCap = "round";
  for (let i = 0; i < (o.hair || 0); i++) {
    const side = Math.random() < .5 ? -1 : 1, cross = Math.random() < .18;
    const x0 = rand(-.45, .45) * fw, y0 = -fh * .52;
    const x1 = cross ? rand(-.27, .27) * fw : side * fw * rand(.28, .83), y1 = fh * rand(.1, .95);
    g.lineWidth = rand(.8, 3.2); g.globalAlpha = rand(.55, 1);
    g.beginPath(); g.moveTo(x0, y0);
    g.bezierCurveTo(x0 + side * fw * .1, y0 + fh * .3, x1 - side * fw * .05, y1 - fh * .3, x1, y1); g.stroke();
  }
  g.globalAlpha = 1; g.restore();
}

const DRAW = {
  // ผู้หญิงหน้าซีด ผมยาวปิดหน้า
  pale(g, w, h){
    g.fillStyle = "#0b0e0b"; g.fillRect(0, 0, w, h);
    portrait(g, w / 2 + rand(-.03, .03) * w, h * .47, Math.min(w * .7, h * .44),
      { skin: ["#e6e3d4", "#a7aa9a", "#3f453d"], hair: 170, tilt: rand(-.09, .09) });
  },
  // ผีน้ำ หน้าบวม ตาขาวขุ่น
  drowned(g, w, h){
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, "#03090a"); bg.addColorStop(1, "#0b1c1b");
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    portrait(g, w / 2, h * .5, Math.min(w * .82, h * .52),
      { skin: ["#cfdad2", "#7d9a92", "#1d302b"], aspect: 1.12, milky: true, wet: true, hair: 80, mouth: .7, tilt: rand(-.05, .05) });
  },
  // เงาสูงผิดคน ยืนในหมอก
  tall(g, w, h){
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#050606"); bg.addColorStop(.7, "#1a1f1d"); bg.addColorStop(1, "#2a302c");
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const cx = w / 2 + rand(-.05, .05) * w, unit = Math.min(w, h), headR = unit * .075, bw = unit * .17;
    const top = h * .05, neckTop = top + headR * 2, shoulder = neckTop + h * .08, hip = h * .6;
    g.save(); g.translate(cx, top + headR); g.rotate(rand(.18, .32));
    g.fillStyle = "#000"; g.beginPath(); g.ellipse(0, 0, headR * .85, headR * 1.15, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#f2efe4";
    for (const s of [-1, 1]) { g.beginPath(); g.arc(s * headR * .35, -headR * .05, headR * .1, 0, Math.PI * 2); g.fill(); }
    g.restore();
    g.fillStyle = "#000"; g.strokeStyle = "#000"; g.lineCap = "round";
    g.fillRect(cx - bw * .12, neckTop - headR * .3, bw * .24, shoulder - neckTop + headR * .3);
    g.beginPath(); g.moveTo(cx - bw * .7, shoulder); g.lineTo(cx + bw * .7, shoulder); g.lineTo(cx + bw * .45, hip); g.lineTo(cx - bw * .45, hip); g.closePath(); g.fill();
    for (const s of [-1, 1]) {
      g.lineWidth = bw * .22; g.beginPath(); g.moveTo(cx + s * bw * .65, shoulder + bw * .1);
      g.quadraticCurveTo(cx + s * bw * 1.15, h * .5, cx + s * bw * .95, h * .86); g.stroke();
      g.lineWidth = bw * .06;
      for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(cx + s * bw * .95, h * .86); g.lineTo(cx + s * bw * (.95 + k * .09), h * .86 + bw * .7); g.stroke(); }
      g.lineWidth = bw * .28; g.beginPath(); g.moveTo(cx + s * bw * .25, hip); g.lineTo(cx + s * bw * .32, h * 1.02); g.stroke();
    }
    const fog = g.createLinearGradient(0, h * .6, 0, h);
    fog.addColorStop(0, "rgba(42,48,44,0)"); fog.addColorStop(1, "rgba(66,74,69,.9)");
    g.fillStyle = fog; g.fillRect(0, h * .6, w, h * .4);
  },
  // หน้าคนนับสิบในความมืด ถือเทียน
  crowd(g, w, h){
    g.fillStyle = "#030303"; g.fillRect(0, 0, w, h);
    const unit = Math.min(w, h);
    for (let r = 0; r < 5; r++) {
      const depth = r / 4, s = unit * (.06 + .07 * depth), y = h * (.12 + .15 * r), n = Math.max(3, Math.ceil(w / (s * 1.7)));
      for (let i = 0; i < n; i++) {
        const x = (i + .5) * (w / n) + rand(-.25, .25) * s, yy = y + rand(-.2, .2) * s;
        g.globalAlpha = .2 + .55 * depth;
        const skin = g.createRadialGradient(x, yy - s * .1, 1, x, yy, s * .6);
        skin.addColorStop(0, "#e3dfcf"); skin.addColorStop(1, "#4f534a");
        g.fillStyle = skin; g.beginPath(); g.ellipse(x, yy, s * .4, s * .52, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#000";
        for (const k of [-1, 1]) { g.beginPath(); g.ellipse(x + k * s * .15, yy - s * .06, s * .08, s * .1, 0, 0, Math.PI * 2); g.fill(); }
        g.beginPath(); g.ellipse(x, yy + s * .24, s * .06, s * .09, 0, 0, Math.PI * 2); g.fill();
        const c = g.createRadialGradient(x, yy + s * .85, 0, x, yy + s * .85, s * .45);
        c.addColorStop(0, "rgba(233,180,76,.6)"); c.addColorStop(1, "rgba(233,180,76,0)");
        g.fillStyle = c; g.fillRect(x - s * .5, yy + s * .4, s, s * .9);
      }
    }
    g.globalAlpha = 1;
    portrait(g, w / 2, h * .9, Math.min(w * .85, h * .55), { skin: ["#e6e3d4", "#a3a696", "#3a4038"], hair: 120, tilt: rand(-.06, .06) });
  },
  // นกแสกพุ่งชนกระจกหน้ารถ
  owl(g, w, h){
    g.fillStyle = "#050505"; g.fillRect(0, 0, w, h);
    const cx = w / 2 + rand(-.04, .04) * w, cy = h * .45, u = Math.min(w, h * .75);
    for (const s of [-1, 1]) {
      const wing = g.createLinearGradient(cx, cy, cx + s * u * .9, cy - u * .3);
      wing.addColorStop(0, "#8a7656"); wing.addColorStop(1, "#2a2117");
      g.fillStyle = wing; g.beginPath(); g.moveTo(cx + s * u * .12, cy - u * .1);
      g.quadraticCurveTo(cx + s * u * .6, cy - u * .75, cx + s * u, cy - u * .55);
      g.quadraticCurveTo(cx + s * u * .85, cy + u * .05, cx + s * u * .95, cy + u * .35);
      g.quadraticCurveTo(cx + s * u * .5, cy + u * .25, cx + s * u * .12, cy + u * .35);
      g.closePath(); g.fill();
      g.strokeStyle = "rgba(20,15,10,.6)"; g.lineWidth = 2;
      for (let k = 0; k < 9; k++) {
        const t = k / 8;
        g.beginPath(); g.moveTo(cx + s * u * .2, cy + u * (-.05 + t * .3)); g.lineTo(cx + s * u * (.55 + .4 * t), cy + u * (-.55 + t * .85)); g.stroke();
      }
    }
    const body = g.createRadialGradient(cx, cy + u * .05, u * .05, cx, cy + u * .1, u * .35);
    body.addColorStop(0, "#e8dcc0"); body.addColorStop(1, "#9c8461");
    g.fillStyle = body; g.beginPath(); g.ellipse(cx, cy + u * .12, u * .22, u * .34, 0, 0, Math.PI * 2); g.fill();
    // หน้ารูปหัวใจของนกแสก
    const fy = cy - u * .12, fr = u * .2, disc = g.createRadialGradient(cx, fy, fr * .2, cx, fy, fr * 1.2);
    disc.addColorStop(0, "#fbf8ef"); disc.addColorStop(.8, "#e9e1cf"); disc.addColorStop(1, "#a88f6a");
    g.fillStyle = disc; g.beginPath(); g.moveTo(cx, fy - fr * .55);
    g.bezierCurveTo(cx - fr * .4, fy - fr * 1.25, cx - fr * 1.35, fy - fr * .6, cx - fr * 1.05, fy + fr * .25);
    g.bezierCurveTo(cx - fr * .8, fy + fr * .85, cx - fr * .25, fy + fr * 1.1, cx, fy + fr * 1.25);
    g.bezierCurveTo(cx + fr * .25, fy + fr * 1.1, cx + fr * .8, fy + fr * .85, cx + fr * 1.05, fy + fr * .25);
    g.bezierCurveTo(cx + fr * 1.35, fy - fr * .6, cx + fr * .4, fy - fr * 1.25, cx, fy - fr * .55);
    g.fill();
    for (const s of [-1, 1]) {
      g.fillStyle = "#000"; g.beginPath(); g.ellipse(cx + s * fr * .42, fy + fr * .05, fr * .17, fr * .2, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#fff"; g.beginPath(); g.arc(cx + s * fr * .42 + fr * .05, fy - fr * .03, fr * .04, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = "#d9c7a3"; g.beginPath(); g.moveTo(cx - fr * .08, fy + fr * .35); g.lineTo(cx + fr * .08, fy + fr * .35); g.lineTo(cx, fy + fr * .65); g.closePath(); g.fill();
    cracks(g, cx + rand(-.1, .1) * w, cy - u * .1, Math.max(w, h));
  },
  // หมาดำตาแดงกระโจนเข้าหาไฟหน้ารถ
  dog(g, w, h){
    g.fillStyle = "#040404"; g.fillRect(0, 0, w, h);
    const glare = g.createRadialGradient(w / 2, h * .85, 0, w / 2, h * .85, Math.max(w, h) * .7);
    glare.addColorStop(0, "rgba(233,200,140,.35)"); glare.addColorStop(1, "rgba(233,200,140,0)");
    g.fillStyle = glare; g.fillRect(0, 0, w, h);
    const cx = w / 2 + rand(-.03, .03) * w, cy = h * .46, u = Math.min(w * .95, h * .6);
    g.fillStyle = "#070707";
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * u * .18, cy - u * .28); g.lineTo(cx + s * u * .42, cy - u * .62); g.lineTo(cx + s * u * .44, cy - u * .18); g.closePath(); g.fill(); }
    g.beginPath(); g.ellipse(cx, cy - u * .1, u * .4, u * .32, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(cx, cy + u * .18, u * .26, u * .26, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "rgba(150,140,120,.35)"; g.lineWidth = 1.5;
    for (let i = 0; i < 120; i++) {
      const a = rand(Math.PI * 1.05, Math.PI * 1.95), x = cx + Math.cos(a) * u * .4, y = cy - u * .1 + Math.sin(a) * u * .32;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * rand(6, 18), y + Math.sin(a) * rand(6, 18)); g.stroke();
    }
    for (const s of [-1, 1]) {
      const ex = cx + s * u * .17, ey = cy - u * .12, eye = g.createRadialGradient(ex, ey, 0, ex, ey, u * .09);
      eye.addColorStop(0, "#fff2d0"); eye.addColorStop(.25, "#ff3b1f"); eye.addColorStop(1, "rgba(255,40,10,0)");
      g.fillStyle = eye; g.beginPath(); g.arc(ex, ey, u * .09, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = "#000"; g.beginPath(); g.ellipse(cx, cy + u * .07, u * .07, u * .045, 0, 0, Math.PI * 2); g.fill();
    const my = cy + u * .27, mw = u * .24, mh = u * .13;
    g.fillStyle = "#3a0606"; g.beginPath(); g.ellipse(cx, my, mw, mh, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#efe9da";
    const teeth = (y, dir) => {
      const n = 9, tw = mw * 1.8 / n;
      for (let i = 0; i < n; i++) {
        const x0 = cx - mw * .9 + i * tw, fang = i === 1 || i === n - 2;
        g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + tw, y); g.lineTo(x0 + tw / 2, y + dir * mh * (fang ? .9 : .45)); g.closePath(); g.fill();
      }
    };
    teeth(my - mh * .75, 1); teeth(my + mh * .75, -1);
  },
  // งูเห่าแผ่แม่เบี้ย อ้าปากโชว์เขี้ยว
  snake(g, w, h){
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, "#030403"); bg.addColorStop(1, "#121510");
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const cx = w / 2 + rand(-.03, .03) * w, cy = h * .45, u = Math.min(w * .9, h * .55);
    g.fillStyle = "#24251a"; g.beginPath(); g.moveTo(cx - u * .12, h);
    g.quadraticCurveTo(cx - u * .2, cy + u * .6, cx - u * .08, cy + u * .3); g.lineTo(cx + u * .08, cy + u * .3);
    g.quadraticCurveTo(cx + u * .2, cy + u * .6, cx + u * .12, h); g.closePath(); g.fill();
    const hood = g.createRadialGradient(cx, cy, u * .05, cx, cy, u * .5);
    hood.addColorStop(0, "#5a5638"); hood.addColorStop(1, "#1d1e14");
    g.fillStyle = hood; g.beginPath(); g.moveTo(cx, cy - u * .42);
    g.bezierCurveTo(cx - u * .55, cy - u * .3, cx - u * .5, cy + u * .3, cx - u * .08, cy + u * .4); g.lineTo(cx + u * .08, cy + u * .4);
    g.bezierCurveTo(cx + u * .5, cy + u * .3, cx + u * .55, cy - u * .3, cx, cy - u * .42); g.fill();
    g.strokeStyle = "rgba(0,0,0,.35)"; g.lineWidth = 1;
    for (let i = 0; i < 220; i++) { g.beginPath(); g.arc(cx + rand(-.4, .4) * u, cy + rand(-.28, .35) * u, u * .018, 0, Math.PI); g.stroke(); }
    g.strokeStyle = "rgba(230,220,180,.55)"; g.lineWidth = u * .02;
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * u * .12, cy + u * .02, u * .07, u * .06, 0, 0, Math.PI * 2); g.stroke(); }
    g.beginPath(); g.moveTo(cx - u * .05, cy + u * .08); g.quadraticCurveTo(cx, cy + u * .14, cx + u * .05, cy + u * .08); g.stroke();
    const hy = cy - u * .42;
    g.fillStyle = "#2e2f20"; g.beginPath(); g.ellipse(cx, hy, u * .13, u * .11, 0, 0, Math.PI * 2); g.fill();
    for (const s of [-1, 1]) {
      g.fillStyle = "#d9a43a"; g.beginPath(); g.arc(cx + s * u * .075, hy - u * .02, u * .022, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#000"; g.fillRect(cx + s * u * .075 - u * .004, hy - u * .04, u * .008, u * .04);
    }
    g.fillStyle = "#5c1414"; g.beginPath(); g.ellipse(cx, hy + u * .08, u * .09, u * .06, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#f2ede0";
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * u * .06, hy + u * .04); g.lineTo(cx + s * u * .042, hy + u * .04); g.lineTo(cx + s * u * .052, hy + u * .11); g.closePath(); g.fill(); }
    g.strokeStyle = "#b3261e"; g.lineWidth = u * .012; g.lineCap = "round";
    g.beginPath(); g.moveTo(cx, hy + u * .09); g.lineTo(cx, hy + u * .2); g.lineTo(cx - u * .03, hy + u * .25);
    g.moveTo(cx, hy + u * .2); g.lineTo(cx + u * .03, hy + u * .25); g.stroke();
  }
};

// Windshield cracks radiating from an impact point.
function cracks(g, x, y, R){
  g.strokeStyle = "rgba(230,235,230,.55)"; g.lineWidth = 1.2;
  for (let i = 0; i < 14; i++) {
    let a = i / 14 * Math.PI * 2 + rand(-.2, .2), px = x, py = y;
    const len = R * rand(.25, .6);
    g.beginPath(); g.moveTo(px, py);
    for (let d = 0; d < len;) { const step = rand(12, 40); d += step; a += rand(-.3, .3); px += Math.cos(a) * step; py += Math.sin(a) * step; g.lineTo(px, py); }
    g.stroke();
  }
  g.strokeStyle = "rgba(230,235,230,.3)";
  for (const r of [R * .05, R * .11]) {
    g.beginPath();
    for (let k = 0; k <= 24; k++) { const a = k / 24 * Math.PI * 2, rr = r * rand(.85, 1.15); k ? g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.stroke();
  }
}

export const GHOSTS = Object.keys(DRAW);
const wait = ms => new Promise(r => setTimeout(r, ms));

// Photos are loaded ahead of time: a scare that waits on a download loses its punch.
// Each type keeps a list; a path listed twice is picked twice as often.
const photos = {};
let preloaded = false;
export function preloadMedia(){
  const sounds = {};
  if (!preloaded) {
    preloaded = true;
    for (const [type, m] of Object.entries(MEDIA)) {
      photos[type] = [];
      for (const src of [].concat(m.img || [])) { const im = new Image(); im.onload = () => photos[type].push(im); im.src = src; }
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
  const photo = photoFor(type);
  if (photo) drawPhoto(g, w, h, photo, isRaw(type));
  else (DRAW[type] || DRAW.pale)(g, w, h);
  grain(g, w, h); vignette(g, w, h);
  overlay.hidden = false; if (!RM) overlay.classList.add("shake");
  scream(SOUND[type], type);
  try { navigator.vibrate && navigator.vibrate([90, 40, 260]); } catch (e) {}
}

// buildup "hush": dim + silence first (the classic). "none": hits instantly with no warning.
export async function jumpScare(type, scene, { buildup = "hush" } = {}){
  ensure();
  if (buildup === "hush") { scene.classList.add("hush"); quiet(true); await wait(rand(...BUILD_UP)); }
  flash(type);
  await wait(SHOW_MS);
  overlay.hidden = true; overlay.classList.remove("shake");
  scene.classList.remove("hush"); quiet(false);
}

// Looks exactly like a hush build-up, but nothing comes. Keeps players from reading the pattern.
export async function fakeOut(scene){
  scene.classList.add("hush"); quiet(true);
  await wait(rand(700, 1300));
  if (Math.random() < .5) creak();
  await wait(rand(900, 1500));
  scene.classList.remove("hush"); quiet(false);
}
