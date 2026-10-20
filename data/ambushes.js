// Surprise scares that can hit at any moment, in the middle of reading an event or its result,
// unrelated to the choice the player made. The engine allows at most 2 per trip.
// ghost = drawing in js/scare.js: "owl", "dog", "snake", "pale", "tall", "drowned", "crowd"
// s = sanity change; text = what interrupts the story after the scare.
export const AMBUSHES = [
  {id:"owl", ghost:"owl", s:-5,
   text:"ตึง! นกแสกตัวใหญ่พุ่งชนกระจกหน้ารถ ใบหน้าขาวของมันแนบกระจกอยู่ครู่หนึ่งก่อนกระพือปีกหายไป ทิ้งรอยร้าวไว้กลางกระจก"},
  {id:"dog", ghost:"dog", s:-5,
   text:"หมาดำตัวใหญ่กระโจนออกจากพุ่มไม้มาขวางหน้ารถ ตาแดงก่ำ คุณหักหลบแทบไม่ทัน พอมองกระจกหลัง ถนนว่างเปล่า"},
  {id:"snake", ghost:"snake", s:-10,
   text:"งูเห่าตัวยาวแผ่แม่เบี้ยอยู่บนแผงหน้าปัด ไม่รู้ว่ามันเลื้อยเข้ามาตอนไหน คุณจอดรถแล้วใช้ร่มเขี่ยมันออกไปได้ มือยังสั่นไม่หาย"},
  {id:"window", ghost:"pale", s:-10,
   text:"ใบหน้าซีดๆ แนบกระจกข้างคนขับ ทั้งที่รถวิ่งอยู่ 80 กิโล แล้วก็หายไปพร้อมไฟถนนที่กะพริบดับ"},
  {id:"crow", ghost:"owl", s:-5,
   text:"เสียงอะไรบางอย่างกระแทกหลังคารถดังสนั่น ตามด้วยเสียงกรงเล็บขูดเหล็กยาวจากหน้าไปหลัง แล้วเงียบ"}
];
