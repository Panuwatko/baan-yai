// Full-screen jump scares. Each ghost type is drawn on a canvas at the moment it appears,
// so there are no image files and every scare is slightly different.
import { scream, quiet } from "./audio.js";

const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
const BUILD_UP = [900, 1900];  // ms of silence before the ghost appears (random in range)
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
  }
};

export const GHOSTS = Object.keys(DRAW);

// Dims the scene, waits in silence, flashes the ghost with a scream, then resolves.
export function jumpScare(type, scene){
  ensure();
  return new Promise(resolve => {
    scene.classList.add("hush"); quiet(true);
    setTimeout(() => {
      const { g, w, h } = setup();
      (DRAW[type] || DRAW.pale)(g, w, h); grain(g, w, h); vignette(g, w, h);
      overlay.hidden = false; if (!RM) overlay.classList.add("shake");
      scream();
      try { navigator.vibrate && navigator.vibrate([90, 40, 260]); } catch (e) {}
      setTimeout(() => {
        overlay.hidden = true; overlay.classList.remove("shake");
        scene.classList.remove("hush"); quiet(false);
        resolve();
      }, SHOW_MS);
    }, rand(...BUILD_UP));
  });
}
