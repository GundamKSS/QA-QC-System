import { checkpointPositions } from "./checkpointPulse";

export type InspectionId = "gauge" | "pump" | "motor";
export type InspectionItem = { id: string; label: string; description: string };
export type InspectionPart = {
  id: InspectionId; label: string; shortLabel: string; subtitle: string;
  anchor: readonly [number, number, number]; size: readonly [number, number, number];
  items: readonly InspectionItem[];
};

/** Illustrative anatomy, not a manufacturer-specific parts list or a live machine reading. */
export const inspectionParts: readonly InspectionPart[] = [
  { id: "gauge", label: "ชุดเกจวัดแรงดัน", shortLabel: "เกจวัดแรงดัน", subtitle: "สำรวจหน้าปัด กลไก และชุดข้อต่อ", anchor: checkpointPositions[0], size: [1.7, 1.2, 1.2], items: [
    {id:"case",label:"ตัวเรือน",description:"ตัวเรือนด้านหลังและกรอบยึดหน้าปัด"},
    {id:"mechanism",label:"ชุดกลไก",description:"โครงสร้างจำลองชุดกลไกภายในเกจ"},
    {id:"dial",label:"หน้าปัด",description:"แผ่นหน้าปัดและขีดแบ่งสเกล"},
    {id:"needle",label:"เข็มชี้",description:"เข็มชี้พร้อมแกนกลางหน้าปัด"},
    {id:"glass",label:"ฝาครอบใส",description:"ฝาครอบด้านหน้าของชุดหน้าปัด"},
    {id:"fitting",label:"ข้อต่อ",description:"ข้อต่อเกลียวบริเวณฐานของเกจ"},
    {id:"screws",label:"สกรูยึด",description:"ชุดสกรูยึดกรอบและฝาครอบ"},
  ]},
  { id: "pump", label: "ชุดหัวปั๊มและลูกสูบ", shortLabel: "หัวปั๊ม", subtitle: "เปิดดูชุดฝาสูบ ลูกสูบ และเพลาขับ", anchor: checkpointPositions[1], size: [1.65, 2.1, 1.0], items: [
    {id:"head",label:"ฝาสูบ",description:"ชุดฝาครอบส่วนบนของกระบอกสูบ"},
    {id:"valves",label:"แผ่นวาล์ว",description:"ชั้นแผ่นวาล์วระหว่างฝาสูบกับกระบอกสูบ"},
    {id:"barrel",label:"กระบอกสูบ / ครีบ",description:"กระบอกสูบพร้อมครีบภายนอก"},
    {id:"piston",label:"ลูกสูบ",description:"ตัวลูกสูบภายในกระบอกสูบ"},
    {id:"rings",label:"แหวนลูกสูบ",description:"แหวนที่ประกอบรอบตัวลูกสูบ"},
    {id:"rod",label:"ก้านสูบ",description:"ก้านเชื่อมระหว่างลูกสูบและชุดเพลา"},
    {id:"crank",label:"เพลาข้อเหวี่ยง",description:"ชุดเพลาข้อเหวี่ยงบริเวณด้านล่าง"},
    {id:"bolts",label:"นอตและสลัก",description:"ชุดยึดประกอบฝาสูบและกระบอกสูบ"},
  ]},
  { id: "motor", label: "ชุดมอเตอร์ไฟฟ้า", shortLabel: "มอเตอร์", subtitle: "แยกดูตัวเรือน โรเตอร์ และชุดระบายอากาศ", anchor: checkpointPositions[2], size: [2.4, 1.4, 1.7], items: [
    {id:"housing",label:"ตัวเรือน / ครีบ",description:"ตัวเรือนภายนอกและครีบระบายความร้อน"},
    {id:"stator",label:"สเตเตอร์ / ขดลวด",description:"โครงสร้างจำลองขดลวดภายในตัวเรือน"},
    {id:"rotor",label:"โรเตอร์ / เพลา",description:"แกนโรเตอร์และเพลาภายในมอเตอร์"},
    {id:"bearings",label:"ตลับลูกปืน",description:"ชิ้นส่วนรองรับเพลาบริเวณปลายทั้งสองด้าน"},
    {id:"fan",label:"ใบพัด",description:"ชุดใบพัดระบายอากาศบริเวณท้ายมอเตอร์"},
    {id:"cover",label:"ฝาครอบพัดลม",description:"ฝาครอบและช่องระบายอากาศ"},
    {id:"bolts",label:"สกรูยึด",description:"ชุดสกรูยึดฝาครอบกับตัวเรือน"},
  ]},
];
export const inspectionPart = (id: InspectionId) => inspectionParts.find((part) => part.id === id)!;

/** Portrait inspection uses the upper viewport; its detail sheet covers the login below. */
export function inspectionFraming(width: number, height: number) {
  if (width >= 1024) return { centerX: 0.29, centerY: 0.32, width: 0.43, height: 0.4 };
  if (width > height && height <= 540) return { centerX: 0.235, centerY: 0.5, width: 0.39, height: 0.76 };
  return { centerX: 0.5, centerY: 0.23, width: 0.86, height: 0.35 };
}
