// The end-of-trip card: a 1080×1350 image (the 4:5 size social apps show whole) with the ending,
// a fresh render of the last windshield view and the trip's numbers, for sharing.
import { Windshield, viewFor } from "./windshield.js";

const W = 1080, H = 1350, PAD = 72;
const C = { night: "#0a0d0f", asphalt: "#141a1d", line: "#263034", fog: "#d6dbcf", dim: "#859086", lamp: "#e9b44c", blood: "#c8442f" };
const F = { display: '"Chonburi", "Sarabun", serif', body: '"Sarabun", system-ui, sans-serif', mono: '"IBM Plex Mono", ui-monospace, monospace' };

const seg = "Segmenter" in Intl ? new Intl.Segmenter("th", { granularity: "word" }) : null;
// Thai has no spaces between words, so line breaks come from the word segmenter.
function wrap(g, text, maxW, maxLines){
  const words = seg ? [...seg.segment(text)].map(s => s.segment) : text.split(/(\s+)/);
  const lines = []; let cur = "";
  for (const w of words) {
    if (g.measureText(cur + w).width > maxW && cur) { lines.push(cur.trim()); cur = w.trimStart(); }
    else cur += w;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && cur.trim()) lines.push(cur.trim());
  if (lines.length === maxLines && words.join("").length > lines.join("").length + 2) lines[maxLines - 1] = lines[maxLines - 1].replace(/.{1,2}$/, "") + "…";
  return lines;
}
function roundRect(g, x, y, w, h, r){
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
const hhmm = m => `${String((22 + Math.floor(m / 60)) % 24).padStart(2, "0")}:${String(Math.floor(m % 60)).padStart(2, "0")}`;

// S = finished game state, ending = ENDINGS entry, found = endings unlocked / total. Resolves to a PNG Blob.
export async function makeCard(S, ending, found){
  try { await Promise.all([`64px ${F.display}`, `28px ${F.body}`, `600 28px ${F.body}`, `44px ${F.mono}`].map(f => document.fonts.load(f))); } catch (e) {}
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const g = cv.getContext("2d");

  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#07090a"); bg.addColorStop(1, "#11171a");
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * .04})`; g.fillRect(Math.random() * W, Math.random() * H, 2, 2); }

  g.textBaseline = "alphabetic";
  g.fillStyle = C.lamp; g.font = `500 24px ${F.mono}`;
  g.fillText("TEXT ADVENTURE · ROAD TRIP", PAD, 104);
  g.fillStyle = C.fog; g.font = `64px ${F.display}`;
  g.fillText("ทางกลับบ้านยาย", PAD, 190);

  // the last stretch of road, drawn fresh at card size
  const hx = PAD, hy = 230, hw = W - PAD * 2, hh = 400;
  const off = document.createElement("canvas");
  const ws = new Windshield(off, { ...viewFor(S.cur || "start", ""), ...(S.scene || {}) });
  off.width = hw; off.height = hh; ws.w = hw; ws.h = hh; ws.g.setTransform(1, 0, 0, 1, 0, 0); ws.t = 1.7; ws.draw();
  g.save(); roundRect(g, hx, hy, hw, hh, 24); g.clip(); g.drawImage(off, hx, hy); g.restore();
  g.strokeStyle = C.line; g.lineWidth = 2; roundRect(g, hx, hy, hw, hh, 24); g.stroke();

  // the ending
  let y = hy + hh + 64;
  g.fillStyle = C.dim; g.font = `500 24px ${F.mono}`;
  g.fillText("ฉากจบ", PAD, y);
  y += 70;
  g.fillStyle = ending.bad ? C.blood : C.fog; g.font = `56px ${F.display}`;
  for (const line of wrap(g, ending.title, hw, 1)) { g.fillText(line, PAD, y); y += 58; }
  g.fillStyle = C.dim; g.font = `28px ${F.body}`;
  const first = ending.text.split("\n")[0];
  for (const line of wrap(g, first, hw, 2)) { g.fillText(line, PAD, y); y += 42; }

  // the numbers
  const crashes = (S.damage || 0) + (S.crash ? 1 : 0);
  // 4 columns × 2 rows; the first row (how far, how late) is highlighted
  const stats = [
    ["ระยะทาง", `${Math.floor(S.km)} กม.`], ["จบตอน", `${hhmm(S.min)} น.`],
    ["สติที่เหลือ", `${Math.round(S.san)}`], ["น้ำมันที่เหลือ", `${Math.round(S.fuel)}`],
    ["เจอผี", `${S.seenGhosts || 0} ครั้ง`], ["ผลพลิก", `${S.twists || 0} ครั้ง`],
    ["อุบัติเหตุ", `${crashes} ครั้ง`], ["ตัดสินใจ", `${S.leg || 0} ครั้ง`]
  ];
  const top = y + 44, colW = hw / 4, rowH = 112;
  g.strokeStyle = C.line; g.lineWidth = 2;
  g.beginPath(); g.moveTo(PAD, top - 34); g.lineTo(W - PAD, top - 34); g.stroke();
  stats.forEach(([label, value], i) => {
    const x = PAD + (i % 4) * colW, yy = top + Math.floor(i / 4) * rowH;
    g.fillStyle = C.dim; g.font = `22px ${F.body}`; g.fillText(label, x, yy + 6);
    g.fillStyle = i < 2 ? C.lamp : C.fog; g.font = `500 34px ${F.mono}`; g.fillText(value, x, yy + 50);
  });

  // footer
  const fy = H - 70;
  g.strokeStyle = C.line; g.beginPath(); g.moveTo(PAD, fy - 64); g.lineTo(W - PAD, fy - 64); g.stroke();
  g.fillStyle = C.fog; g.font = `600 30px ${F.body}`;
  g.fillText("คุณจะไปถึงบ้านยายไหม?", PAD, fy - 14);
  g.fillStyle = C.dim; g.font = `500 22px ${F.mono}`;
  g.fillText(`${location.host}${location.pathname.replace(/\/(index\.html)?$/, "")}  ·  ฉากจบ ${found[0]}/${found[1]}`, PAD, fy + 22);

  return new Promise(res => cv.toBlob(res, "image/png"));
}
