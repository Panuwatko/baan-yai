// Surprise scares that can hit at any moment, in the middle of reading an event or its result,
// unrelated to the choice the player made. The engine allows at most 2 per trip.
// ghost = jump scare type in js/scare.js: "pale", "tall", "drowned", "crowd"
// s = sanity change; text = what interrupts the story after the scare.
export const AMBUSHES = [
  {id:"window", ghost:"pale", s:-10,
   text:"ใบหน้าซีดๆ แนบกระจกข้างคนขับ ทั้งที่รถวิ่งอยู่ 80 กิโล แล้วก็หายไปพร้อมไฟถนนที่กะพริบดับ"},
  {id:"crossing", ghost:"tall", s:-10,
   text:"ร่างสูงผิดคนเดินตัดหน้ารถไปช้าๆ คุณเหยียบเบรกจนตัวโก่ง พอไฟหน้าส่องไปถึง ถนนว่างเปล่า"},
  {id:"glass", ghost:"drowned", s:-10,
   text:"ใบหน้าเปียกน้ำโผล่แนบกระจกหน้ารถตรงหน้าคุณ ทั้งที่ฝนไม่ได้ตก ที่ปัดน้ำฝนปัดผ่านไปทีเดียว มันก็หายไป"},
  {id:"backseat", ghost:"pale", s:-10,
   text:"มีเสียงหายใจดังมาจากเบาะหลัง คุณหันขวับ… ไม่มีใคร แต่เบาะหลังยุบเป็นรอยเหมือนเพิ่งมีคนลุกออกไป"},
  {id:"candles", ghost:"crowd", s:-5,
   text:"ริมทางมีคนยืนถือเทียนเรียงเป็นแถวยาว ทุกคนหันหน้ามาทางรถพร้อมกันตอนคุณขับผ่าน"}
];
