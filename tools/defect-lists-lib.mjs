// Turns QA's defect lists ("New <type> Checklist V.1 - Defect.csv") into the DEC-14 shape:
// common defects shared by every pump type + item × defect × part links that carry their own
// severity and Disposition. Pure functions only — tools/defect-lists.mjs does the file I/O.

export const PUMP_TYPES = [
  { code: "PISTON", name: "Piston", option: "piston" },
  { code: "OIL_FREE", name: "Oil-free", option: "oil-free" },
  { code: "ROTARY", name: "Rotary", option: "rotary" },
];

const SEVERITY = { critical: "CRITICAL", major: "MAJOR", minor: "MINOR" };
const SEVERITY_RANK = { MINOR: 1, MAJOR: 2, CRITICAL: 3 };
const DISPOSITION = { concession: "CONCESSION", rework: "REWORK", reject: "REJECT", "reject and rework": "CHOOSE" };
// Only used when one topic lists the same defect + part twice with different rules.
const DISPOSITION_RANK = { CONCESSION: 1, REWORK: 2, CHOOSE: 3, REJECT: 4 };
const CATEGORY = {
  assembly: "Assembly Issue",
  "assembly issue": "Assembly Issue",
  cosmetic: "Cosmetic",
  "appearance defect": "Appearance Defect",
  "electric & motor": "Electric & Motor",
  leakage: "Leakage",
  performance: "Performance",
};

/** Typos and spelling variants, so one defect written two ways (often in two files) becomes one row. */
const TYPOS = [
  [/ดูุด/g, "ดูด"],
  [/สููง/g, "สูง"],
  [/รัวซึม/g, "รั่วซึม"],
  [/ตั่งค่า/g, "ตั้งค่า"],
  [/ศุนย์/g, "ศูนย์"],
  [/เรียบรอย/g, "เรียบร้อย"],
  [/เพลสเชอร์|เพรชเชอร์/g, "เพรสเชอร์"],
  [/ไฟไฟ/g, "ไฟ"],
  // The correct spellings contain these too; without the lookbehind they would gain a second เ.
  [/(?<!เ)ป็นสนิม/g, "เป็นสนิม"],
  [/(?<!เ)กลียว/g, "เกลียว"],
  [/^Ol/, "OL"],
  [/เช็ควาล์ว/g, "เช็กวาล์ว"],
  [/เทอมินอล/g, "เทอร์มินอล"],
  [/เรกูเลเตอร์เกจย์/g, "เกจย์เรกูเลเตอร์"],
];
const TOPIC_TYPOS = [[/ควาสมบูรณ์/g, "ความสมบูรณ์"]];

/** Different wording for the same defect (keys without spaces). */
const SYNONYMS = {
  ถังผิวไม่เรียบ: "พื้นผิวถังไม่เรียบ",
  มอเตอร์สตาร์ทออกตัวไม่ได้: "มอเตอร์ออกตัวไม่ได้",
  จุกแขนจับไม่มี: "ไม่ใส่จุกปิดแขน",
  เกจย์วัดลมหน้าปัดไม่ใส: "หน้าปัดเกจย์ไม่ใส",
};

/** Names shaped like "<part><symptom>" whose meaning is one specific defect (keys without spaces). */
const SPECIFIC = new Set([
  "ตาดูน้ำมันไม่แน่นรั่วซึม",
  "มีคราบน้ำมันรั่วซึม",
  "ตัวหายใจมีน้ำมันรั่วพุ่งออก",
  "สติ๊กเกอร์NamePlateข้อมูลไม่ครบ",
  "อุปกรณ์หลุดหลวมหลังรันทดสอบ",
  "ไม่มีแรงดูดที่ปากกรอง",
  "อุปกรณ์จ่ายลมไม่มีลมออก",
  "วาล์วระบายน้ำทิ้งลมไม่ออก",
  "ไม่เจาะรูถังที่เป็นจุดลมเข้าหรือออก",
  "ไม่เติมน้ำมัน",
  "ลมรั่วรอยต่อฝาสูบ",
  "ลมรั่วเห็นได้ชัด",
  "เกจย์วัดลมไม่ชี้เลขศูนย์",
  "OLไม่ย้ำหางปลา",
  "แรงดันค้างไม่ขึ้นต่อหรือไม่ถึงแรงดันตัด",
  "ไม่ดูดลม1หัว",
  "ไม่ดูดลม2หัว",
  "ไม่ดูดลม3หัว",
  "ไม่ดูดลม4หัว",
  "ไฟรั่วลงกราวด์",
  "อุปกรณ์จ่ายลมมีขี้เกลือ",
  "ลูกสูบกระแทก",
  "มอเตอร์หมุนผิดทาง",
]);

/** Generic symptoms. First match wins; the capture groups (joined by a space) are the part. */
const RULES = [
  [/^สี(.+?)(?:สีถลอก|ถลอก)$/, "สีถลอก"],
  [/^(.*?)สีถลอก$/, "สีถลอก"],
  [/^สี(.+?)ไม่ผ่าน$/, "สีไม่ผ่าน"],
  [/^(.*?)สีไม่ผ่าน$/, "สีไม่ผ่าน"],
  [/^(.*?)เป็นสนิม$/, "เป็นสนิม"],
  [/^(.*?)ชำรุด$/, "ชำรุด"],
  [/^(.*?)มีลมรั่วซึม$/, "รั่วซึม"],
  [/^(.*?)รั่วซึม$/, "รั่วซึม"],
  [/^(.*?)(?:มี)?ลมรั่ว$/, "รั่วซึม"],
  [/^แนว(.+?)ไม่ตรง$/, "เอียง / ไม่ตรง"],
  [/^(.*?)แนวไม่ตรง$/, "เอียง / ไม่ตรง"],
  [/^(.*?)(?:แนว)?เชื่อมไม่เรียบร้อย$/, "เชื่อมไม่เรียบร้อย"],
  [/^(.*?)ไม่ตรงมาตรฐานJIS$/, "ไม่ตรงมาตรฐาน JIS"],
  [/^(.*?)ไม่ตรงมาตรฐานการผลิต$/, "ไม่ตรงมาตรฐานการผลิต"],
  [/^(.*?)(?:หลุด)?หลวม$/, "ไม่แน่น / หลวม"],
  [/^(.*?)ไม่แน่น$/, "ไม่แน่น / หลวม"],
  [/^(.*?)ไม่ครบ$/, "ไม่ครบ"],
  [/^(.*?)(?:เอียง|ไม่ตรง)$/, "เอียง / ไม่ตรง"],
  [/^(.*?)บิดงอ$/, "บิดงอ"],
  [/^(.*?)ใช้งานไม่ได้$/, "ใช้งานไม่ได้"],
  [/^(.*?)เสื่อมสภาพ$/, "เสื่อมสภาพ"],
  [/^(.*?)(?:ไม่สะอาด|สกปรก)$/, "สกปรก / ไม่สะอาด"],
  [/^(.*?)ไม่ใส$/, "ไม่ใส"],
  [/^(.*?)ถลอก$/, "ถลอก"],
  [/^(.*?)ไม่ใส่(.*?)(?:มา)?$/, "ไม่ใส่ / ไม่มี"],
  [/^ไม่ติด(สติ๊กเกอร์.+)$/, "ไม่ใส่ / ไม่มี"],
  [/^ไม่(?:พบ|มี)(.+)$/, "ไม่ใส่ / ไม่มี"],
  [/^(.+?)ไม่มี$/, "ไม่ใส่ / ไม่มี"],
];

const compact = (text) => text.replace(/\s+/g, "");
const tidy = (text) => text.replace(/\s+/g, " ").trim();
const stricterSeverity = (a, b) => (!a ? b : !b ? a : SEVERITY_RANK[b] > SEVERITY_RANK[a] ? b : a);
const stricterDisposition = (a, b) => (!a ? b : !b ? a : DISPOSITION_RANK[b] > DISPOSITION_RANK[a] ? b : a);

/** RFC 4180 CSV (quoted cells may hold commas, quotes and line breaks — the sheet headers do). */
export function parseCsv(text) {
  const src = text.replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (src[i + 1] === '"') cell += src[++i];
      else quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) rows.push([...row, cell]);
  return rows;
}

/** A defect name with typos fixed and spelling variants unified (single spaces kept for display). */
export function cleanName(name) {
  let text = tidy(name);
  for (const [pattern, fix] of TYPOS) text = text.replace(pattern, fix);
  return SYNONYMS[compact(text)] ?? text;
}

/** "ขาถังสีถลอก" → { defect: "สีถลอก", part: "ขาถัง" }; a specific defect keeps its name and has no part. */
export function splitDefect(name) {
  if (SPECIFIC.has(compact(name))) return { defect: name, part: null };
  for (const [pattern, symptom] of RULES) {
    const match = pattern.exec(name);
    if (!match) continue;
    const part = match.slice(1).map((group) => group?.trim()).filter(Boolean).join(" ");
    return { defect: symptom, part: part || null };
  }
  return { defect: name, part: null };
}

/** Reads one QA file. Column positions are fixed by the sheet, so the header is checked first. */
export function readDefectFile(text, pumpType) {
  const [header = [], ...records] = parseCsv(text);
  const label = (i) => tidy(header[i] ?? "");
  if (label(1) !== "หัวข้อตรวจ" || label(2) !== "Defect" || !label(6).includes("Rj/Rw") || !label(9).includes("Rj/Rw")) {
    throw new Error(`${pumpType}: the columns are not the QA defect-list layout (No., หัวข้อตรวจ, Defect, ใช้งาน, เคสอนุโลม, Severity/Rj-Rw PUMA, ใช้งาน, Severity/Rj-Rw Other, Category)`);
  }
  const rows = [];
  const issues = [];
  for (const cells of records) {
    const cell = (i) => tidy(cells[i] ?? "");
    if (!/^\d+$/.test(cell(0))) continue;
    const no = Number(cell(0));
    const topic = /^(\d+)\s*\.?\s*(.+)$/.exec(cell(1));
    if (!topic) throw new Error(`${pumpType} No. ${no}: topic "${cell(1)}" does not start with its number`);
    let topicTitle = topic[2];
    for (const [pattern, fix] of TOPIC_TYPOS) topicTitle = topicTitle.replace(pattern, fix);
    const note = (detail) => issues.push({ kind: "ค่าที่อ่านไม่ออก", pumpType, no, name: cell(2), detail });
    const severity = (i) => {
      const value = SEVERITY[cell(i).toLowerCase()] ?? null;
      if (!value && cell(i) && cell(i).toUpperCase() !== "NA") note(`ความรุนแรง "${cell(i)}"`);
      return value;
    };
    const disposition = (i) => {
      const value = DISPOSITION[cell(i).toLowerCase()] ?? null;
      if (!value && cell(i)) note(`Disposition "${cell(i)}"`);
      return value;
    };
    const rawCategory = cell(10);
    const category = rawCategory ? (CATEGORY[rawCategory.toLowerCase()] ?? rawCategory) : null;
    if (rawCategory && !CATEGORY[rawCategory.toLowerCase()]) note(`หมวด "${rawCategory}" ไม่อยู่ในรายการ — ใช้ตามไฟล์`);
    rows.push({
      pumpType,
      no,
      topicSeq: Number(topic[1]),
      topicTitle,
      rawName: cell(2),
      name: cleanName(cell(2)),
      usePuma: cell(3).toUpperCase() === "TRUE",
      concessionFlag: cell(4).toUpperCase() === "TRUE",
      severityPuma: severity(5),
      dispPuma: disposition(6),
      useOther: cell(7).toUpperCase() === "TRUE",
      severityOther: severity(8),
      dispOther: disposition(9),
      category,
    });
  }
  return { pumpType, rows, issues };
}

const mostCommon = (counts, tieBreak) =>
  [...counts].reduce((best, entry) => (!best || entry[1] > best[1] || (entry[1] === best[1] && tieBreak?.(entry[0], best[0])) ? entry : best), null)?.[0] ?? null;

/** Builds the common defects, the topics per pump type and every link, plus the points QA should confirm. */
export function buildDefectLists(files) {
  const issues = files.flatMap((file) => file.issues);
  const order = new Map(PUMP_TYPES.map((type, index) => [type.code, index]));
  const topics = new Map();
  const defects = new Map();
  const links = new Map();
  const renamed = new Map();

  for (const { pumpType, rows } of files) {
    for (const row of rows) {
      const where = { pumpType, no: row.no, name: row.rawName };
      const severity = stricterSeverity(row.severityPuma, row.severityOther);
      if (!severity) {
        issues.push({ kind: "ข้ามแถว", ...where, detail: "ไม่มีความรุนแรงทั้ง PUMA และ Other — ไม่ใช่อาการที่ใช้ตัดสินได้" });
        continue;
      }
      const topicKey = `${pumpType}|${row.topicSeq}`;
      const knownTitle = topics.get(topicKey)?.title;
      if (knownTitle && knownTitle !== row.topicTitle) throw new Error(`${pumpType}: topic ${row.topicSeq} has two titles ("${knownTitle}", "${row.topicTitle}")`);
      topics.set(topicKey, { pumpType, seq: row.topicSeq, title: row.topicTitle });

      if (compact(row.name) !== compact(row.rawName)) {
        const change = `${tidy(row.rawName)} → ${row.name}`;
        renamed.set(change, new Set([...(renamed.get(change) ?? []), pumpType]));
      }
      const { defect, part } = splitDefect(row.name);
      const defectKey = compact(defect);
      const entry = defects.get(defectKey) ?? {
        name: defect,
        kind: part ? "generic" : "specific",
        firstSeen: defects.size,
        spellings: new Set(),
        categories: new Map(),
        severities: new Map(),
        byPump: new Map(),
        parts: new Map(),
        linkCount: 0,
      };
      if (part) entry.kind = "generic";
      entry.spellings.add(row.name);
      defects.set(defectKey, entry);

      if (row.usePuma && !row.dispPuma) issues.push({ kind: "ไม่มี Disposition", ...where, detail: "ใช้งาน PUMA แต่ไม่มี Disposition — จะไม่ขึ้นเป็นตัวเลือกให้ยี่ห้อกลุ่ม PUMA" });
      if (row.useOther && !row.dispOther) issues.push({ kind: "ไม่มี Disposition", ...where, detail: "ใช้งาน Other แต่ไม่มี Disposition — จะไม่ขึ้นเป็นตัวเลือกให้ยี่ห้อกลุ่ม Other" });
      if (row.concessionFlag && row.dispPuma !== "CONCESSION" && row.dispOther !== "CONCESSION") {
        issues.push({ kind: "เคสอนุโลมไม่ตรง", ...where, detail: `ติ๊กเคสอนุโลม แต่ Disposition PUMA = ${row.dispPuma ?? "-"}, Other = ${row.dispOther ?? "-"}` });
      }

      const linkKey = `${topicKey}|${defectKey}|${part ? compact(part) : ""}`;
      const link = links.get(linkKey);
      if (!link) {
        links.set(linkKey, {
          pumpType,
          topicSeq: row.topicSeq,
          topicTitle: row.topicTitle,
          seq: row.no,
          sources: [{ no: row.no, rawName: row.rawName }],
          // The defect's first spelling, so every link points at the same name the defect row gets.
          defect: entry.name,
          part,
          severity,
          usePuma: row.usePuma,
          useOther: row.useOther,
          dispPuma: row.dispPuma,
          dispOther: row.dispOther,
          category: row.category,
        });
        entry.linkCount++;
        entry.byPump.set(pumpType, (entry.byPump.get(pumpType) ?? 0) + 1);
        entry.categories.set(row.category, (entry.categories.get(row.category) ?? 0) + 1);
        entry.severities.set(severity, (entry.severities.get(severity) ?? 0) + 1);
        if (part) entry.parts.set(compact(part), entry.parts.get(compact(part)) ?? part);
        continue;
      }
      const sameRules = link.severity === severity && link.dispPuma === row.dispPuma && link.dispOther === row.dispOther && link.usePuma === row.usePuma && link.useOther === row.useOther;
      issues.push({
        kind: "รวมแถวซ้ำ",
        ...where,
        detail: `ซ้ำกับ No. ${link.sources.map((source) => source.no).join(", ")} ในหัวข้อเดียวกัน (${entry.name}${part ? ` · ${part}` : ""})${sameRules ? " ค่าเท่ากัน" : " ค่าต่างกัน — ใช้ค่าที่เข้มกว่า"}`,
      });
      link.sources.push({ no: row.no, rawName: row.rawName });
      link.severity = stricterSeverity(link.severity, severity);
      link.dispPuma = stricterDisposition(link.dispPuma, row.dispPuma);
      link.dispOther = stricterDisposition(link.dispOther, row.dispOther);
      link.usePuma ||= row.usePuma;
      link.useOther ||= row.useOther;
    }
  }

  for (const [change, pumpTypes] of renamed) {
    issues.push({ kind: "แก้ชื่อ", pumpType: [...pumpTypes].join(", "), no: null, name: change.split(" → ")[0], detail: change });
  }

  // Generic defects first (most used first), then specific ones in the order the files list them.
  const defectList = [...defects.values()]
    .sort((a, b) => (a.kind === b.kind ? (a.kind === "generic" ? b.linkCount - a.linkCount : a.firstSeen - b.firstSeen) : a.kind === "generic" ? -1 : 1))
    .map((entry) => {
      const category = mostCommon(entry.categories);
      const severity = mostCommon(entry.severities, (a, b) => SEVERITY_RANK[a] > SEVERITY_RANK[b]);
      if (entry.categories.size > 1) {
        const counts = [...entry.categories].map(([name, count]) => `${name ?? "(ว่าง)"} ${count}`).join(" · ");
        issues.push({ kind: "หมวดไม่ตรงกัน", pumpType: null, no: null, name: entry.name, detail: `${counts} → ใช้ ${category ?? "(ว่าง)"}` });
      }
      if (entry.kind === "specific" && entry.spellings.size > 1) {
        issues.push({ kind: "รวมชื่อ", pumpType: null, no: null, name: entry.name, detail: [...entry.spellings].join(" | ") });
      }
      return {
        name: entry.name,
        kind: entry.kind,
        category,
        severity,
        linkCount: entry.linkCount,
        byPump: Object.fromEntries(PUMP_TYPES.map((type) => [type.code, entry.byPump.get(type.code) ?? 0])),
        parts: [...entry.parts.values()],
      };
    });

  const linkList = [...links.values()].sort((a, b) => order.get(a.pumpType) - order.get(b.pumpType) || a.topicSeq - b.topicSeq || a.seq - b.seq);
  const concessions = linkList.reduce((count, link) => count + (link.dispPuma === "CONCESSION") + (link.dispOther === "CONCESSION"), 0);
  if (concessions) {
    issues.push({ kind: "อนุโลมยังไม่มีผู้อนุมัติ", pumpType: null, no: null, name: null, detail: `${concessions} Disposition เป็น Concession แต่ไฟล์ไม่มีผู้อนุมัติ — concession_approved_by จะว่าง (BR-04: อนุโลมต้องอนุมัติล่วงหน้า)` });
  }

  return {
    defects: defectList,
    topics: [...topics.values()].sort((a, b) => order.get(a.pumpType) - order.get(b.pumpType) || a.seq - b.seq),
    links: linkList,
    issues,
  };
}

const SEVERITY_LABEL = { MINOR: "Minor", MAJOR: "Major", CRITICAL: "Critical" };
const DISPOSITION_LABEL = { CONCESSION: "Concession (อนุโลม)", REWORK: "Rework", REJECT: "Reject", CHOOSE: "Reject And Rework (ผู้ตรวจเลือก)" };
const pumpName = (code) => PUMP_TYPES.find((type) => type.code === code)?.name ?? code ?? "";
const used = (flag) => (flag ? "ใช้" : "ไม่ใช้");

/** CSV for Excel: UTF-8 BOM (or Thai shows as mojibake) and CRLF. */
export function toCsv(rows) {
  const quote = (value) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return `﻿${rows.map((row) => row.map(quote).join(",")).join("\r\n")}\r\n`;
}

/** The three files QA reviews before anything is loaded into the database. */
export function reviewFiles({ defects, links, issues }) {
  return {
    "defects.csv": toCsv([
      ["ลำดับ", "อาการกลาง", "ชนิด", "หมวด", "ความรุนแรงตั้งต้น", "จำนวนลิงก์", ...PUMP_TYPES.map((type) => type.name), "ชิ้นส่วน"],
      ...defects.map((defect, index) => [
        index + 1,
        defect.name,
        defect.kind === "generic" ? "อาการกลาง (มีชิ้นส่วน)" : "อาการเฉพาะ",
        defect.category,
        SEVERITY_LABEL[defect.severity],
        defect.linkCount,
        ...PUMP_TYPES.map((type) => defect.byPump[type.code]),
        defect.parts.join(" · "),
      ]),
    ]),
    "links.csv": toCsv([
      ["ชนิดปั๊ม", "หัวข้อ", "ชื่อหัวข้อ", "No. ในไฟล์", "ชื่อเดิม", "อาการกลาง", "ชิ้นส่วน", "ความรุนแรง", "ใช้งาน PUMA", "Disposition PUMA", "ใช้งาน Other", "Disposition Other", "หมวดในไฟล์"],
      ...links.map((link) => [
        pumpName(link.pumpType),
        link.topicSeq,
        link.topicTitle,
        link.sources.map((source) => source.no).join(", "),
        link.sources.map((source) => source.rawName).join(" | "),
        link.defect,
        link.part,
        SEVERITY_LABEL[link.severity],
        used(link.usePuma),
        DISPOSITION_LABEL[link.dispPuma] ?? "",
        used(link.useOther),
        DISPOSITION_LABEL[link.dispOther] ?? "",
        link.category,
      ]),
    ]),
    "issues.csv": toCsv([
      ["ประเภท", "ชนิดปั๊ม", "No. ในไฟล์", "ชื่อ", "รายละเอียด"],
      ...issues.map((issue) => [
        issue.kind,
        issue.pumpType?.split(", ").map(pumpName).join(", ") ?? "",
        issue.no,
        issue.name,
        issue.detail,
      ]),
    ]),
  };
}

// Column sizes from db/005, db/006 and db/014 — checked here so a long name fails before SQL Server truncates it.
const LIMITS = { defect: 200, part: 100, title: 400, category: 64 };
// One INSERT … VALUES takes at most 1000 rows in SQL Server.
const VALUES_PER_INSERT = 900;

const sqlText = (value) => (value === null || value === undefined ? "NULL" : `N'${String(value).replace(/'/g, "''")}'`);
const sqlCode = (value) => (value === null || value === undefined ? "NULL" : `'${value}'`);
const sqlBit = (flag) => (flag ? "1" : "0");

function valuesInsert(table, columns, rows) {
  const chunks = [];
  for (let i = 0; i < rows.length; i += VALUES_PER_INSERT) {
    chunks.push(`INSERT INTO ${table} (${columns}) VALUES\n${rows.slice(i, i + VALUES_PER_INSERT).map((row) => `    (${row.join(", ")})`).join(",\n")};`);
  }
  return chunks.join("\n");
}

function checkLength(kind, value) {
  if (value && value.length > LIMITS[kind]) throw new Error(`${kind} "${value}" is longer than ${LIMITS[kind]} characters`);
}

/**
 * The seed migration: common defects, one checklist per pump type and role (version DRAFT for QA to publish),
 * its topics, and every link with its dispositions. Re-runnable; existing rows are reused, never overwritten,
 * and only DRAFT versions get topics or links (a published version is locked, BR-20).
 */
export function seedSql({ defects, topics, links }, { fileName, sources, roles = ["QA"], version = 1, generatedOn }) {
  for (const defect of defects) {
    checkLength("defect", defect.name);
    checkLength("category", defect.category);
  }
  for (const topic of topics) checkLength("title", topic.title);
  for (const link of links) checkLength("part", link.part);

  const pumpTypes = PUMP_TYPES.filter((type) => topics.some((topic) => topic.pumpType === type.code));
  const templates = roles.flatMap((role) => pumpTypes.map((type) => [sqlText(`${role}-${type.code}`), sqlText(`Checklist ${role} — ${type.name}`), sqlCode(role), sqlText(type.name), sqlCode(type.code)]));
  const dispositions = links.reduce((count, link) => count + Boolean(link.dispPuma) + Boolean(link.dispOther), 0);
  const name = fileName.replace(/\.sql$/, "");

  return `/*
  QCheck — ${name}: อาการและ Checklist จากไฟล์อาการของ QA — DEC-14  (SQL Server)
  - สร้างด้วย tools/defect-lists.mjs เมื่อ ${generatedOn} จาก ${sources.join(", ")}
    → ถ้าต้องแก้ ให้แก้ไฟล์ต้นทางหรือกติกาใน tools/defect-lists-lib.mjs แล้วสร้างใหม่ (ก่อนรันเท่านั้น — รันแล้วห้ามแก้)
  - อาการกลาง ${defects.length} ตัว · Checklist ${roles.join(" + ")} × ${pumpTypes.map((type) => type.name).join(" / ")} = ${templates.length} ชุด (เวอร์ชัน ${version} DRAFT รอ QA กด Publish)
    · หัวข้อ ${topics.length} ต่อบทบาท · ลิงก์ ${links.length} · Disposition ${dispositions} ต่อบทบาท
  - รันซ้ำได้: อ้างด้วยชื่ออาการ / รหัส Checklist / เลขหัวข้อ ไม่เขียนทับแถวที่มีอยู่ (อาการที่ชื่อตรงกับของเดิมใช้แถวเดิม)
  - ใส่หัวข้อและลิงก์เฉพาะเวอร์ชันที่ยังเป็น DRAFT · อนุโลมยังไม่มีผู้อนุมัติ (concession_approved_by ว่าง)
*/

IF COL_LENGTH(N'dbo.item_defects', N'part') IS NULL OR OBJECT_ID(N'dbo.item_defect_dispositions', N'U') IS NULL
    THROW 51160, '${name} needs 014_item_defect_rules.sql first.', 1;
GO
IF OBJECT_ID(N'dbo.DF_defects_code', N'D') IS NULL
    THROW 51161, '${name} needs 012_defects_code_sequence.sql first (defect codes come from the sequence).', 1;
GO

DECLARE @version INT = ${version};

DECLARE @defects TABLE (name_th NVARCHAR(${LIMITS.defect}) NOT NULL, category NVARCHAR(${LIMITS.category}) NULL, severity VARCHAR(8) NOT NULL);
${valuesInsert("@defects", "name_th, category, severity", defects.map((defect) => [sqlText(defect.name), sqlText(defect.category), sqlCode(defect.severity)]))}

DECLARE @templates TABLE (code NVARCHAR(64) NOT NULL, name NVARCHAR(200) NOT NULL, role VARCHAR(2) NOT NULL, scope NVARCHAR(100) NOT NULL, pump VARCHAR(10) NOT NULL);
${valuesInsert("@templates", "code, name, role, scope, pump", templates)}

DECLARE @items TABLE (pump VARCHAR(10) NOT NULL, seq INT NOT NULL, title NVARCHAR(${LIMITS.title}) NOT NULL);
${valuesInsert("@items", "pump, seq, title", topics.map((topic) => [sqlCode(topic.pumpType), topic.seq, sqlText(topic.title)]))}

DECLARE @links TABLE (n INT NOT NULL, pump VARCHAR(10) NOT NULL, topic INT NOT NULL, defect NVARCHAR(${LIMITS.defect}) NOT NULL, part NVARCHAR(${LIMITS.part}) NULL,
    severity VARCHAR(8) NOT NULL, seq INT NOT NULL, use_puma BIT NOT NULL, use_other BIT NOT NULL, disp_puma VARCHAR(10) NULL, disp_other VARCHAR(10) NULL);
${valuesInsert(
  "@links",
  "n, pump, topic, defect, part, severity, seq, use_puma, use_other, disp_puma, disp_other",
  links.map((link, index) => [
    index + 1,
    sqlCode(link.pumpType),
    link.topicSeq,
    sqlText(link.defect),
    sqlText(link.part),
    sqlCode(link.severity),
    link.seq,
    sqlBit(link.usePuma),
    sqlBit(link.useOther),
    sqlCode(link.dispPuma),
    sqlCode(link.dispOther),
  ]),
)}

/* อาการกลาง — รหัส DEF… มาจาก SEQUENCE (012); เลี่ยง ORDER BY ในคำสั่งที่ดึงเลขจาก SEQUENCE (ข้อจำกัดของ NEXT VALUE FOR) */
INSERT INTO dbo.defects (name_th, category, severity)
SELECT v.name_th, v.category, v.severity
FROM @defects AS v
WHERE NOT EXISTS (SELECT 1 FROM dbo.defects AS d WHERE d.name_th = v.name_th);

IF EXISTS (SELECT 1 FROM @links AS l WHERE NOT EXISTS (SELECT 1 FROM dbo.defects AS d WHERE d.name_th = l.defect))
    THROW 51162, 'a link refers to a defect name that is not in dbo.defects.', 1;

/* Checklist ต่อชนิดปั๊ม × บทบาท + เวอร์ชัน DRAFT (current_version_id ตั้งตอน Publish) */
INSERT INTO dbo.checklist_templates (code, name, role, scope)
SELECT t.code, t.name, t.role, t.scope
FROM @templates AS t
WHERE NOT EXISTS (SELECT 1 FROM dbo.checklist_templates AS x WHERE x.code = t.code);

INSERT INTO dbo.template_versions (template_id, version_no, status, source)
SELECT ct.id, @version, 'DRAFT', 'IMPORT'
FROM @templates AS t
JOIN dbo.checklist_templates AS ct ON ct.code = t.code
WHERE NOT EXISTS (SELECT 1 FROM dbo.template_versions AS x WHERE x.template_id = ct.id AND x.version_no = @version);

/* หัวข้อตรวจ: ผ่าน/ไม่ผ่าน บังคับตอบ ถ่ายรูปเมื่อไม่ผ่าน (BR-05) */
INSERT INTO dbo.checklist_items (version_id, seq, topic_code, title, input_type, is_required, photo_rule, video_rule)
SELECT v.id, i.seq, CAST(i.seq AS NVARCHAR(32)), i.title, 'PASS_FAIL', 1, 'ON_FAIL', 'NONE'
FROM @templates AS t
JOIN dbo.checklist_templates AS ct ON ct.code = t.code
JOIN dbo.template_versions AS v ON v.template_id = ct.id AND v.version_no = @version AND v.status = 'DRAFT'
JOIN @items AS i ON i.pump = t.pump
WHERE NOT EXISTS (SELECT 1 FROM dbo.checklist_items AS x WHERE x.version_id = v.id AND x.seq = i.seq);

/* ตำแหน่งของแต่ละลิงก์ในทุก Checklist ของชนิดปั๊มนั้น (QA และ QC ใช้ลิงก์ชุดเดียวกัน) */
DECLARE @placed TABLE (n INT NOT NULL, item_id INT NOT NULL, defect_id INT NOT NULL, part NVARCHAR(${LIMITS.part}) NULL);
INSERT INTO @placed (n, item_id, defect_id, part)
SELECT l.n, ci.id, d.id, l.part
FROM @links AS l
JOIN @templates AS t ON t.pump = l.pump
JOIN dbo.checklist_templates AS ct ON ct.code = t.code
JOIN dbo.template_versions AS v ON v.template_id = ct.id AND v.version_no = @version AND v.status = 'DRAFT'
JOIN dbo.checklist_items AS ci ON ci.version_id = v.id AND ci.seq = l.topic
CROSS APPLY (SELECT TOP (1) x.id FROM dbo.defects AS x WHERE x.name_th = l.defect ORDER BY x.id) AS d;

INSERT INTO dbo.item_defects (item_id, defect_id, part, severity, seq, is_active)
SELECT p.item_id, p.defect_id, p.part, l.severity, l.seq, CASE WHEN l.use_puma = 1 OR l.use_other = 1 THEN 1 ELSE 0 END
FROM @placed AS p
JOIN @links AS l ON l.n = p.n
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.item_defects AS x
    WHERE x.item_id = p.item_id AND x.defect_id = p.defect_id AND (x.part = p.part OR (x.part IS NULL AND p.part IS NULL))
);

/* Disposition แยก PUMA / OTHER — สถานะตามช่อง "ใช้งาน" · ไฟล์เป็น NA = ไม่สร้างแถว (ไม่ขึ้นเป็นตัวเลือกให้กลุ่มนั้น) */
INSERT INTO dbo.item_defect_dispositions (item_defect_id, brand_group, disposition, is_active)
SELECT idf.id, g.brand_group, g.disposition, g.is_active
FROM @placed AS p
JOIN @links AS l ON l.n = p.n
JOIN dbo.item_defects AS idf
    ON idf.item_id = p.item_id AND idf.defect_id = p.defect_id AND (idf.part = p.part OR (idf.part IS NULL AND p.part IS NULL))
CROSS APPLY (VALUES ('PUMA', l.disp_puma, l.use_puma), ('OTHER', l.disp_other, l.use_other)) AS g (brand_group, disposition, is_active)
WHERE g.disposition IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM dbo.item_defect_dispositions AS x WHERE x.item_defect_id = idf.id AND x.brand_group = g.brand_group);
GO
`;
}
