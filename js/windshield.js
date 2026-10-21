// The driver's view through the windshield, drawn on canvas and animated: road markings and roadside
// posts slide toward the car, wipers sweep in the rain. The setting comes from the event's text.
// Look moments zoom the camera onto one focus point (mirror, road, forest, glass); the ghost itself is a photo (scare.js).
export { viewFor } from "./scenery.js";

const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
const FRAME_MS = 1000 / 30 - 2;   // a little under 33 ms so 60 Hz screens reliably land on every other frame

function rng(seed){
  return () => {
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function roundRect(g, x, y, w, h, r){
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// transform-origin for the look-moment zoom, so the camera pushes in on the right spot.
export const FOCUS = { mirror: "50% 9%", road: "50% 50%", forest: "15% 58%", glass: "50% 48%" };

export class Windshield {
  constructor(canvas, view){
    this.cv = canvas; this.view = view; this.g = canvas.getContext("2d");
    this.raf = 0; this.t = 0;
    this.resize();
  }
  resize(){
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.w = this.cv.clientWidth || 340; this.h = Math.round(this.w * .5);
    this.cv.width = Math.round(this.w * dpr); this.cv.height = Math.round(this.h * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  // Animates at ~30 fps (plenty for slow road motion, half the battery of 60) and only while the
  // view is on screen; scrolled away it stops redrawing until it comes back.
  start(){
    this.draw();
    if (RM) return;
    let last = 0;
    const loop = ts => {
      this.raf = requestAnimationFrame(loop);
      if (!this.visible || ts - last < FRAME_MS) return;
      last = ts; this.t = ts / 1000; this.draw();
    };
    this.visible = true;
    if ("IntersectionObserver" in window) {
      this.io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; });
      this.io.observe(this.cv);
    }
    this.raf = requestAnimationFrame(loop);
  }
  stop(){ cancelAnimationFrame(this.raf); if (this.io) this.io.disconnect(); }
  setView(view){ this.view = view; if (RM) this.draw(); }

  draw(){
    const { g, w, h, t } = this, { setting, weather, seed } = this.view, R = rng(seed);
    const hz = h * .46, off = (t * .8) % 1;
    const depthY = z => hz + (h - hz) * z, half = z => w * .03 + z * w * .58;

    // sky and ground
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#020304"); sky.addColorStop(.46, "#0b100f"); sky.addColorStop(1, "#040505");
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    g.fillStyle = setting === "bridge" ? "#03060a" : "#060807"; g.fillRect(0, hz, w, h - hz);

    // distant tree line
    g.fillStyle = "#050706"; g.beginPath(); g.moveTo(0, hz);
    for (let x = 0; x <= w; x += w / 40) g.lineTo(x, hz - h * (.02 + R() * .07));
    g.lineTo(w, hz); g.closePath(); g.fill();

    // road surface
    g.fillStyle = "#131615"; g.beginPath();
    g.moveTo(w / 2 - half(0), hz); g.lineTo(w / 2 + half(0), hz); g.lineTo(w / 2 + half(1), h); g.lineTo(w / 2 - half(1), h); g.closePath(); g.fill();

    // center dashes sliding toward the car
    for (let i = 0; i < 10; i++) {
      const p = (i + off) / 10, z = p * p, z2 = Math.min(1, (p + .045) ** 2), dw = 1 + z * w * .012;
      g.fillStyle = `rgba(200,160,70,${.2 + z * .6})`; g.fillRect(w / 2 - dw / 2, depthY(z), dw, Math.max(1, depthY(z2) - depthY(z)));
    }

    // forest trunks (static, by depth)
    if (setting === "forest") {
      for (let i = 0; i < 18; i++) {
        const s = R() < .5 ? -1 : 1, z = .05 + R() * .95, x = w / 2 + s * (half(z) + w * .03 + R() * w * .08), tw = 2 + z * w * .05;
        const lit = 10 + z * 22 | 0;
        g.fillStyle = `rgb(${lit},${lit + 3},${lit + 2})`; g.fillRect(x - tw / 2, 0, tw, depthY(z));
      }
    }
    // bridge railings
    if (setting === "bridge") {
      g.strokeStyle = "#2a302d"; g.lineWidth = 2;
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(w / 2 + s * half(0), hz - h * .02); g.lineTo(w / 2 + s * half(1), h - h * .2); g.stroke(); }
    }
    // roadside reflector posts (or bridge posts) sliding past
    for (const s of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        const p = ((i + off * 1.6) / 6) % 1, z = p * p, x = w / 2 + s * (half(z) + w * .01 + z * w * .02), y = depthY(z);
        const ph = 2 + z * h * (setting === "bridge" ? .28 : .16), pw = 1 + z * 5;
        g.fillStyle = setting === "bridge" ? "#1f2522" : `rgba(210,210,200,${.15 + z * .5})`;
        g.fillRect(x - pw / 2, y - ph, pw, ph);
        if (setting !== "bridge") { g.fillStyle = `rgba(233,120,60,${.3 + z * .6})`; g.fillRect(x - pw / 2, y - ph, pw, ph * .2); }
      }
    }
    // railway crossing
    if (setting === "rail") {
      const y = depthY(.12);
      g.strokeStyle = "#2c2e2b"; g.lineWidth = 2;
      for (const dy of [0, h * .025]) { g.beginPath(); g.moveTo(0, y + dy); g.lineTo(w, y + dy); g.stroke(); }
      const sx = w * .7, blink = Math.floor(t * 2) % 2;
      g.fillStyle = "#151816"; g.fillRect(sx, y - h * .2, 3, h * .2);
      g.strokeStyle = "#cfcfc4"; g.lineWidth = 3;
      g.beginPath(); g.moveTo(sx - 12, y - h * .2 - 8); g.lineTo(sx + 15, y - h * .2 + 8); g.moveTo(sx - 12, y - h * .2 + 8); g.lineTo(sx + 15, y - h * .2 - 8); g.stroke();
      for (const k of [0, 1]) {
        const on = (k === blink) && !RM, lx = sx - 6 + k * 15, ly = y - h * .13;
        g.fillStyle = on ? "#ff3b1f" : "#3a0d08"; g.beginPath(); g.arc(lx, ly, 4, 0, Math.PI * 2); g.fill();
        if (on) { const gl = g.createRadialGradient(lx, ly, 0, lx, ly, 22); gl.addColorStop(0, "rgba(255,60,30,.45)"); gl.addColorStop(1, "rgba(255,60,30,0)"); g.fillStyle = gl; g.fillRect(lx - 22, ly - 22, 44, 44); }
      }
    }
    // a lit shop or station by the road; the light buzzes and drops out now and then
    if (setting === "lights") {
      const x = w * .66, y = hz - h * .09, bw = w * .14, bh = h * .12, dim = Math.sin(t * 13) > .93 ? .3 : 1;
      const glow = g.createRadialGradient(x + bw / 2, y + bh / 2, 0, x + bw / 2, y + bh / 2, bw * 1.4);
      glow.addColorStop(0, `rgba(233,190,110,${.35 * dim})`); glow.addColorStop(1, "rgba(233,190,110,0)");
      g.fillStyle = glow; g.fillRect(x - bw, y - bh, bw * 3, bh * 3);
      g.fillStyle = `rgba(214,170,90,${.75 * dim})`; g.fillRect(x, y, bw, bh);
      g.fillStyle = "#0a0b0a"; g.fillRect(x + bw * .1, y + bh * .25, bw * .3, bh * .75); g.fillRect(x - 4, y - bh * .3, bw + 8, bh * .3);
    }
    // a small roadside shrine with red lamps
    if (setting === "shrine") {
      const x = w * .24, y = hz + h * .05, s = h * .1;
      const glow = g.createRadialGradient(x, y - s * .5, 0, x, y - s * .5, s * 2);
      glow.addColorStop(0, "rgba(220,60,40,.35)"); glow.addColorStop(1, "rgba(220,60,40,0)");
      g.fillStyle = glow; g.fillRect(x - s * 2, y - s * 2.5, s * 4, s * 4);
      g.fillStyle = "#1b1512"; g.fillRect(x - 2, y - s * .2, 4, s * .6);
      g.fillStyle = "#2a201a"; g.fillRect(x - s * .5, y - s * .9, s, s * .7);
      g.beginPath(); g.moveTo(x - s * .7, y - s * .9); g.lineTo(x, y - s * 1.4); g.lineTo(x + s * .7, y - s * .9); g.closePath(); g.fill();
      g.fillStyle = "#ff6a3a"; for (const k of [-1, 1]) { g.beginPath(); g.arc(x + k * s * .3, y - s * .6, 2, 0, Math.PI * 2); g.fill(); }
    }

    // headlight cone
    const cone = g.createRadialGradient(w / 2, h * 1.1, 10, w / 2, h * .62, h * .8);
    cone.addColorStop(0, "rgba(240,215,160,.3)"); cone.addColorStop(1, "rgba(240,215,160,0)");
    g.fillStyle = cone; g.fillRect(0, 0, w, h);


    const fogA = weather === "fog" ? .55 : .22;
    const fog = g.createLinearGradient(0, hz - h * .2, 0, hz + h * .25);
    fog.addColorStop(0, "rgba(90,100,95,0)"); fog.addColorStop(.5, `rgba(90,100,95,${fogA})`); fog.addColorStop(1, "rgba(90,100,95,0)");
    g.fillStyle = fog; g.fillRect(0, hz - h * .2, w, h * .45);

    // rain on the glass
    if (weather === "rain") {
      for (let i = 0; i < 70; i++) {
        const x = R() * w, y = R() * h * .8, r = .8 + R() * 2.4;
        g.fillStyle = "rgba(200,215,210,.2)"; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      }
    }
    if (weather === "rain") {
      const a = -Math.PI / 2 + Math.sin(t * 2.2) * 1.05;
      g.strokeStyle = "#030303"; g.lineWidth = 4; g.lineCap = "round";
      g.beginPath(); g.moveTo(w * .3, h * .86); g.lineTo(w * .3 + Math.cos(a) * h * .78, h * .86 + Math.sin(a) * h * .78); g.stroke();
    }

    // the car: roof, A-pillars, dashboard, top of the steering wheel
    g.fillStyle = "#020303";
    g.fillRect(0, 0, w, h * .045);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(w * .1, 0); g.lineTo(w * .015, h * .8); g.lineTo(0, h * .8); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(w, 0); g.lineTo(w * .9, 0); g.lineTo(w * .985, h * .8); g.lineTo(w, h * .8); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(0, h * .82); g.quadraticCurveTo(w / 2, h * .72, w, h * .82); g.lineTo(w, h); g.lineTo(0, h); g.closePath(); g.fill();
    g.strokeStyle = "#070808"; g.lineWidth = h * .06;
    g.beginPath(); g.arc(w * .3, h * 1.32, h * .52, Math.PI * 1.18, Math.PI * 1.82); g.stroke();
    for (const [x, c] of [[w * .22, "rgba(233,180,76,.35)"], [w * .38, "rgba(233,180,76,.25)"]]) {
      const d = g.createRadialGradient(x, h * .93, 0, x, h * .93, h * .06);
      d.addColorStop(0, c); d.addColorStop(1, "rgba(233,180,76,0)"); g.fillStyle = d; g.fillRect(x - h * .06, h * .87, h * .12, h * .12);
    }

    // rear-view mirror, with whatever is in the back seat
    const mx = w * .41, my = h * .065, mw = w * .18, mh = h * .1;
    g.fillStyle = "#0a0c0c"; g.fillRect(w / 2 - 2, 0, 4, my);
    roundRect(g, mx - 2, my - 2, mw + 4, mh + 4, mh * .45); g.fill();
    const mg = g.createLinearGradient(0, my, 0, my + mh); mg.addColorStop(0, "#1a2221"); mg.addColorStop(1, "#070909");
    g.fillStyle = mg; roundRect(g, mx, my, mw, mh, mh * .4); g.fill();

    const v = g.createRadialGradient(w / 2, h / 2, h * .3, w / 2, h / 2, w * .62);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,.55)");
    g.fillStyle = v; g.fillRect(0, 0, w, h);
  }
}
