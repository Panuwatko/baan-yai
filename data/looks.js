// "Look" moments: after a result, the windshield view zooms in on one spot and the player has to stare at it.
// Whether something comes out of it is rolled from the hidden dread score that risky choices build up.
// Keys are the focus points drawn in js/windshield.js. ghosts = which jump scare can come out of this spot;
// text = shown while looking; hit / miss = caption after something did / did not appear.
export const LOOKS = {
  mirror: {
    ghosts: ["pale", "kuman", "kuman"],
    text: "คุณเหลือบมองกระจกมองหลัง เบาะหลังมืดสนิท แต่สายตาคุณละออกมาไม่ได้…",
    hit: "มันนั่งอยู่ตรงนั้นมาตลอดทาง",
    miss: "ไม่มีใคร… คุณบอกตัวเองแบบนั้น"
  },
  road: {
    ghosts: ["tall", "dog"],
    text: "ไฟหน้ารถส่องไปได้ไม่ไกล หมอกหนาขึ้นเรื่อยๆ ปลายแสงไฟเหมือนมีอะไรยืนอยู่…",
    hit: "มันยืนรอคุณอยู่กลางถนน",
    miss: "แค่หลักกิโลเมตรเก่าๆ ริมทาง"
  },
  forest: {
    ghosts: ["tall", "owl"],
    text: "แนวป่าข้างทางเหมือนมีอะไรขยับตามรถมา คุณเพ่งมองเข้าไปในความมืด…",
    hit: "มันวิ่งตามรถมาได้ทัน",
    miss: "ลมพัดกิ่งไม้เท่านั้นเอง"
  },
  glass: {
    ghosts: ["drowned", "pale"],
    text: "ไอน้ำเกาะกระจกหน้ารถเป็นฝ้า คุณจ้องจุดเดิมจนตาพร่า เหมือนมีรอยอะไรค่อยๆ ปรากฏ…",
    hit: "มีใบหน้าแนบกระจกอยู่ตรงหน้าคุณ",
    miss: "แค่รอยนิ้วมือเก่าบนกระจก… ของใครกัน"
  }
};
