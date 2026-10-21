// Where the car is: the setting and weather of the current stretch of road, worked out from the
// event's text. Shared by the windshield drawing and the travel log; no DOM, so the engine can use it.

export function hash(s){ let h = 2166136261; for (const ch of s) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

// First matching keyword wins; everything else is open road.
const SETTINGS = [[/สะพาน/, "bridge"], [/รถไฟ/, "rail"], [/ปั๊ม|ร้าน|ตู้น้ำมัน|ด่าน|ไฟถนน/, "lights"],
                  [/ศาล|วัด|เจดีย์/, "shrine"], [/ป่า|ต้นไม้|ตานี|กล้วย|สวนยาง|จามจุรี/, "forest"]];

export function viewFor(id, text){
  const setting = (SETTINGS.find(([re]) => re.test(text)) || [null, "road"])[1];
  const seed = hash(id);
  // Events that don't mention the weather get some anyway, fixed per event so it stays consistent.
  const weather = /ฝน/.test(text) ? "rain" : /หมอก/.test(text) ? "fog" : ["rain", "fog", "clear", "clear", "clear"][seed % 5];
  return { setting, weather, seed };
}
