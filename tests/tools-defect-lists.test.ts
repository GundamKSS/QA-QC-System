import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildDefectLists, cleanName, parseCsv, readDefectFile, reviewFiles, seedSql, splitDefect, toCsv, type Link } from "@/tools/defect-lists-lib.mjs";

// The sheet's header cells contain line breaks, exactly like QA's export.
const HEADER = 'No.,หัวข้อตรวจ,Defect,ใช้งาน,เคสอนุโลม,"Severity Levels\nPUMA","PUMA\nRj/Rw",ใช้งาน,"Severity Levels\nOther","Other\nRj/Rw","Defect \nCategory",เคยพบ / ไม่เคยพบ,,,Severity Levels,ต้องแก้ไข';
const csv = (...rows: string[]) => [HEADER, ...rows].join("\r\n");

describe("parseCsv", () => {
  it("keeps quoted line breaks and doubled quotes inside one cell, and drops the BOM", () => {
    expect(parseCsv('﻿a,"b\nc","say ""hi"""\r\n1,2,3')).toEqual([
      ["a", "b\nc", 'say "hi"'],
      ["1", "2", "3"],
    ]);
  });
});

describe("readDefectFile", () => {
  it("rejects a file whose columns are not QA's layout", () => {
    expect(() => readDefectFile("No.,Defect,หัวข้อตรวจ\r\n1,a,b", "PISTON")).toThrow(/columns/);
  });

  it("reads the data rows and skips the legend rows", () => {
    const { rows } = readDefectFile(
      csv(
        "1,3.ตรวจควาสมบูรณ์ครบถ้วนของอุปกรณ์,สติ๊กเกอร์ถลอก,TRUE,FALSE,Critical,Rework,FALSE,NA,,Assembly,เคยพบ,,,Critical,TRUE",
        ",,,,,,,,,,,,,,Major,TRUE",
      ),
      "PISTON",
    );
    expect(rows).toEqual([
      expect.objectContaining({
        no: 1,
        topicSeq: 3,
        topicTitle: "ตรวจความสมบูรณ์ครบถ้วนของอุปกรณ์",
        usePuma: true,
        useOther: false,
        severityPuma: "CRITICAL",
        severityOther: null,
        dispPuma: "REWORK",
        dispOther: null,
        category: "Assembly Issue",
      }),
    ]);
  });

  it("maps Reject And Rework to CHOOSE (the inspector picks)", () => {
    const { rows } = readDefectFile(csv("5,2. ตรวจโครงสร้าง,ถังชำรุด,TRUE,FALSE,Critical,Reject,TRUE,Critical,Reject And Rework,Appearance Defect,เคยพบ"), "PISTON");
    expect(rows[0]).toMatchObject({ dispPuma: "REJECT", dispOther: "CHOOSE" });
  });
});

describe("cleanName", () => {
  it.each([
    ["ถังเป็นสนิม", "ถังเป็นสนิม"],
    ["โซลินอยด์เช็ควาล์วป็นสนิม", "โซลินอยด์เช็กวาล์วเป็นสนิม"],
    ["เกลียวสายระบายชำรุด", "เกลียวสายระบายชำรุด"],
    ["อุปกรณ์จ่ายลมกลียวเสีย", "อุปกรณ์จ่ายลมเกลียวเสีย"],
    ["เพลสเชอร์สวิตซ์รั่วซึม", "เพรสเชอร์สวิตซ์รั่วซึม"],
    ["Olสายหลวม", "OLสายหลวม"],
    ["ไม่ดูุดลม3หัว", "ไม่ดูดลม3หัว"],
    ["ถังผิวไม่เรียบ", "พื้นผิวถังไม่เรียบ"],
    ["  แรงดันค้าง  ไม่ขึ้นต่อ ", "แรงดันค้าง ไม่ขึ้นต่อ"],
  ])("%s → %s", (raw, clean) => {
    expect(cleanName(raw)).toBe(clean);
  });
});

describe("splitDefect", () => {
  it.each([
    ["ขาถังสีถลอก", "สีถลอก", "ขาถัง"],
    ["สีเพลาล้อไม่ผ่าน", "สีไม่ผ่าน", "เพลาล้อ"],
    ["อุปกรณ์จ่ายลมรั่วซึม", "รั่วซึม", "อุปกรณ์จ่ายลม"],
    ["สายหรือท่อมีลมรั่วซึม", "รั่วซึม", "สายหรือท่อ"],
    ["พูลเลย์มอเตอร์ไม่ใส่สลักยึดเพลา", "ไม่ใส่ / ไม่มี", "พูลเลย์มอเตอร์ สลักยึดเพลา"],
    ["ไม่ใส่เกจย์วัดลมมา", "ไม่ใส่ / ไม่มี", "เกจย์วัดลม"],
    ["ไม่ติดสติ๊กเกอร์บอกยี่ห้อ", "ไม่ใส่ / ไม่มี", "สติ๊กเกอร์บอกยี่ห้อ"],
    ["แนวสายพานไม่ตรง", "เอียง / ไม่ตรง", "สายพาน"],
    ["จุดยึดหัวปั๊มหลุดหลวม", "ไม่แน่น / หลวม", "จุดยึดหัวปั๊ม"],
  ])("%s → %s · %s", (name, defect, part) => {
    expect(splitDefect(name)).toEqual({ defect, part });
  });

  it.each(["มอเตอร์ไหม้", "ตาดูน้ำมันไม่แน่นรั่วซึม", "ไม่มีแรงดูดที่ปากกรอง", "แรงดันค้าง ไม่ขึ้นต่อ หรือไม่ถึงแรงดันตัด"])("keeps %s as one specific defect", (name) => {
    expect(splitDefect(name)).toEqual({ defect: name, part: null });
  });
});

describe("buildDefectLists", () => {
  const piston = readDefectFile(
    csv(
      "10,7.ตรวจสีตัวถัง,ขาถังสีถลอก,TRUE,FALSE,minor,Rework,TRUE,Major,Concession,cosmetic,เคยพบ",
      "11,7.ตรวจสีตัวถัง,ถังสีถลอก,TRUE,TRUE,minor,Rework,TRUE,minor,Rework,cosmetic,เคยพบ",
      "12,7.ตรวจสีตัวถัง,ขาถังสีถลอก,TRUE,FALSE,minor,Rework,TRUE,minor,Concession,cosmetic,เคยพบ",
      "13,1. ตรวจเอกสาร,ไม่ติดสติ๊กเกอร์ISO9001,TRUE,FALSE,Critical,Rework,TRUE,NA,,Assembly Issue,ไม่เคยพบ",
      "14,9.ตรวจน้ำมัน,เป็นรุ่นที่ไม่มีน้ำมัน,FALSE,FALSE,,,TRUE,,,,ไม่เคยพบ",
      "15,15.ตรวจกระแส,มอเตอร์ไหม้,TRUE,TRUE,Critical,Rework,TRUE,Critical,Reject,Electric & Motor,ไม่เคยพบ",
    ),
    "PISTON",
  );
  const rotary = readDefectFile(csv("20,6.ตรวจสีตัวถัง,ขาถังสีถลอก,TRUE,FALSE,Major,Reject,TRUE,Major,Reject,cosmetic,เคยพบ"), "ROTARY");
  const lists = buildDefectLists([piston, rotary]);
  const kinds = lists.issues.map((issue) => issue.kind);

  it("shares one defect across pump types while each link keeps its own rules", () => {
    expect(lists.defects.filter((defect) => defect.name === "สีถลอก")).toEqual([
      expect.objectContaining({ kind: "generic", category: "Cosmetic", linkCount: 3, byPump: { PISTON: 2, OIL_FREE: 0, ROTARY: 1 } }),
    ]);
    const legs = lists.links.filter((link) => link.part === "ขาถัง");
    expect(legs.map((link) => [link.pumpType, link.severity, link.dispPuma, link.dispOther])).toEqual([
      ["PISTON", "MAJOR", "REWORK", "CONCESSION"],
      ["ROTARY", "MAJOR", "REJECT", "REJECT"],
    ]);
  });

  it("takes the stricter of the PUMA and Other severities", () => {
    expect(lists.links.find((link) => link.pumpType === "PISTON" && link.part === "ขาถัง")?.severity).toBe("MAJOR");
  });

  it("merges the same defect + part listed twice in one topic and reports it", () => {
    const legs = lists.links.find((link) => link.pumpType === "PISTON" && link.part === "ขาถัง");
    expect(legs?.sources.map((source) => source.no)).toEqual([10, 12]);
    expect(kinds).toContain("รวมแถวซ้ำ");
  });

  it("leaves no Other disposition when the file says NA, and says so", () => {
    const iso = lists.links.find((link) => link.part === "สติ๊กเกอร์ISO9001");
    expect(iso).toMatchObject({ dispPuma: "REWORK", dispOther: null, severity: "CRITICAL" });
    expect(lists.issues).toContainEqual(expect.objectContaining({ kind: "ไม่มี Disposition", no: 13 }));
  });

  it("skips a row with no severity at all", () => {
    expect(lists.links.some((link) => link.defect === "เป็นรุ่นที่ไม่มีน้ำมัน")).toBe(false);
    expect(lists.issues).toContainEqual(expect.objectContaining({ kind: "ข้ามแถว", no: 14 }));
  });

  it("flags a ticked concession box whose dispositions are not Concession", () => {
    expect(lists.issues).toContainEqual(expect.objectContaining({ kind: "เคสอนุโลมไม่ตรง", no: 11 }));
  });

  it("lists topics per pump type in order", () => {
    expect(lists.topics.map((topic) => `${topic.pumpType} ${topic.seq}`)).toEqual(["PISTON 1", "PISTON 7", "PISTON 15", "ROTARY 6"]);
  });
});

describe("review files", () => {
  it("writes Excel-friendly CSV: BOM, CRLF, quoted cells", () => {
    expect(toCsv([["a,b", 'x"y', null], [1, "line\nbreak", "ok"]])).toBe('﻿"a,b","x""y",\r\n1,"line\nbreak",ok\r\n');
  });

  it("produces the three files QA reviews", () => {
    const files = reviewFiles(buildDefectLists([readDefectFile(csv("1,7.ตรวจสี,ถังสีถลอก,TRUE,FALSE,minor,Rework,TRUE,minor,Concession,cosmetic,เคยพบ"), "PISTON")]));
    expect(Object.keys(files)).toEqual(["defects.csv", "links.csv", "issues.csv"]);
    expect(files["links.csv"]).toContain("Piston,7,ตรวจสี,1,ถังสีถลอก,สีถลอก,ถัง,Minor,ใช้,Rework,ใช้,Concession (อนุโลม),Cosmetic");
  });
});

describe("seedSql", () => {
  const lists = buildDefectLists([
    readDefectFile(
      csv(
        "1,7.ตรวจสีตัวถัง,ถังสีถลอก,TRUE,FALSE,minor,Rework,TRUE,minor,Concession,cosmetic,เคยพบ",
        "2,1. ตรวจเอกสาร,ไม่ติดสติ๊กเกอร์ISO9001,TRUE,FALSE,Critical,Rework,TRUE,NA,,Assembly Issue,ไม่เคยพบ",
        "3,15.ตรวจกระแส,มอเตอร์ไหม้,TRUE,TRUE,Critical,Rework,FALSE,Critical,Reject,Electric & Motor,ไม่เคยพบ",
      ),
      "PISTON",
    ),
  ]);
  const options = { fileName: "099_seed_test.sql", sources: ["piston.csv"], roles: ["QA", "QC"] as ("QA" | "QC")[], generatedOn: "2026-10-28" };
  const sql = seedSql(lists, options);

  it("guards on 014 and 012 before touching any data", () => {
    const firstData = sql.indexOf("DECLARE @version");
    expect(sql.indexOf("THROW 51160")).toBeGreaterThan(-1);
    expect(sql.indexOf("THROW 51160")).toBeLessThan(firstData);
    expect(sql.indexOf("THROW 51161")).toBeLessThan(firstData);
  });

  it("makes one checklist per role for each pump type that has topics", () => {
    expect(sql).toContain("(N'QA-PISTON', N'Checklist QA — Piston', 'QA', N'Piston', 'PISTON')");
    expect(sql).toContain("(N'QC-PISTON', N'Checklist QC — Piston', 'QC', N'Piston', 'PISTON')");
    expect(sql).not.toContain("ROTARY");
  });

  it("writes missing parts and NA dispositions as NULL", () => {
    expect(sql).toContain("N'มอเตอร์ไหม้', NULL, 'CRITICAL', 3, 1, 0, 'REWORK', 'REJECT')");
    expect(sql).toContain("N'สติ๊กเกอร์ISO9001', 'CRITICAL', 2, 1, 1, 'REWORK', NULL)");
  });

  it("adds topics and links only to DRAFT versions (a published version is locked)", () => {
    expect(sql.match(/v\.status = 'DRAFT'/g)).toHaveLength(2);
  });

  it("keeps ORDER BY away from the insert that draws defect codes from the sequence", () => {
    const insert = /INSERT INTO dbo\.defects[\s\S]*?;/.exec(sql)?.[0] ?? "";
    expect(insert).toContain("FROM @defects");
    expect(insert).not.toMatch(/ORDER BY/);
  });

  it("escapes quotes and splits long VALUES lists under SQL Server's 1000-row limit", () => {
    const many: Link[] = Array.from({ length: 1001 }, (_, index) => ({ ...lists.links[0], seq: index + 1, part: `ชิ้นที่ ${index}` }));
    const big = seedSql({ ...lists, defects: [{ ...lists.defects[0], name: "อาการ'ทดสอบ" }], links: many }, options);
    expect(big).toContain("N'อาการ''ทดสอบ'");
    const chunks = [...big.matchAll(/INSERT INTO @links \([^)]*\) VALUES\n([\s\S]*?);\n/g)].map((match) => match[1].split("\n").length);
    expect(chunks).toEqual([900, 101]);
  });

  it("refuses names longer than their columns", () => {
    expect(() => seedSql({ ...lists, links: [{ ...lists.links[0], part: "ก".repeat(101) }] }, options)).toThrow(/longer than 100/);
  });
});

describe("db/016_seed_defect_lists.sql (generated)", () => {
  const sql = readFileSync(join(process.cwd(), "db", "016_seed_defect_lists.sql"), "utf8");
  const rows = (table: string) =>
    [...sql.matchAll(new RegExp(`INSERT INTO ${table} \\([^)]*\\) VALUES\\n([\\s\\S]*?);\\n`, "g"))].flatMap((match) => match[1].split("\n"));
  const unquote = (text: string) => text.replace(/''/g, "'");

  it("has every link point at a defect it also creates, inside a topic it also creates", () => {
    const defects = new Set(rows("@defects").map((row) => unquote(/^\s*\(N'((?:[^']|'')*)'/.exec(row)?.[1] ?? "")));
    const topics = new Set(rows("@items").map((row) => /^\s*\('(\w+)', (\d+),/.exec(row)?.slice(1, 3).join(" ")));
    const links = rows("@links").map((row) => /^\s*\(\d+, '(\w+)', (\d+), N'((?:[^']|'')*)'/.exec(row));
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link, "link row parses").not.toBeNull();
      expect(defects).toContain(unquote(link![3]));
      expect(topics).toContain(`${link![1]} ${link![2]}`);
    }
  });

  it("creates QA and QC checklists for the three pump types", () => {
    expect(rows("@templates").map((row) => /^\s*\(N'([\w-]+)'/.exec(row)?.[1])).toEqual(["QA-PISTON", "QA-OIL_FREE", "QA-ROTARY", "QC-PISTON", "QC-OIL_FREE", "QC-ROTARY"]);
  });
});
