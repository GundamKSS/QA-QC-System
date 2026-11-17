// Usage:
//   node tools/defect-lists.mjs review --piston <csv> --oil-free <csv> --rotary <csv> [--out tmp/defect-lists-review]
//   node tools/defect-lists.mjs sql    --piston <csv> --oil-free <csv> --rotary <csv> --out db/NNN_name.sql [--roles QA,QC] [--version 1]
// Reads QA's defect lists (DEC-14). `review` writes the defects / links / issues files QA checks first;
// `sql` writes the seed migration from the same rules. Neither touches the database.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { PUMP_TYPES, buildDefectLists, readDefectFile, reviewFiles, seedSql } from "./defect-lists-lib.mjs";

const usage = [
  "Usage: node tools/defect-lists.mjs review --piston <csv> --oil-free <csv> --rotary <csv> [--out tmp/defect-lists-review]",
  "       node tools/defect-lists.mjs sql --piston <csv> --oil-free <csv> --rotary <csv> --out db/NNN_name.sql [--roles QA,QC] [--version 1]",
].join("\n");
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    ...Object.fromEntries(PUMP_TYPES.map((type) => [type.option, { type: "string" }])),
    out: { type: "string" },
    roles: { type: "string", default: "QA" },
    version: { type: "string", default: "1" },
  },
});
const command = positionals[0];
const missing = PUMP_TYPES.filter((type) => !values[type.option]);
if (!["review", "sql"].includes(command) || missing.length || (command === "sql" && !values.out)) {
  console.error(missing.length ? `Missing --${missing.map((type) => type.option).join(", --")}.\n${usage}` : usage);
  process.exit(1);
}

const files = [];
for (const type of PUMP_TYPES) files.push(readDefectFile(await readFile(values[type.option], "utf8"), type.code));
const lists = buildDefectLists(files);

if (command === "sql") {
  const roles = values.roles.split(",").map((role) => role.trim().toUpperCase());
  const version = Number(values.version);
  if (roles.some((role) => !["QA", "QC"].includes(role)) || !Number.isInteger(version) || version < 1) {
    console.error(`--roles takes QA and/or QC, --version a whole number ≥ 1.\n${usage}`);
    process.exit(1);
  }
  const sql = seedSql(lists, {
    fileName: basename(values.out),
    sources: PUMP_TYPES.map((type) => basename(values[type.option])),
    roles,
    version,
    generatedOn: new Date().toISOString().slice(0, 10),
  });
  await mkdir(dirname(values.out), { recursive: true });
  await writeFile(values.out, sql, "utf8");
  console.log(`wrote ${values.out}: ${lists.defects.length} defects, ${roles.length * lists.topics.length} topics, ${roles.length * lists.links.length} links (${roles.join(" + ")}, version ${version} DRAFT)`);
  process.exit(0);
}

const out = values.out ?? "tmp/defect-lists-review";
await mkdir(out, { recursive: true });
for (const [name, text] of Object.entries(reviewFiles(lists))) await writeFile(join(out, name), text, "utf8");

const generic = lists.defects.filter((defect) => defect.kind === "generic").length;
const kinds = Object.entries(Object.groupBy(lists.issues, (issue) => issue.kind)).map(([kind, list]) => `${kind} ${list.length}`);
console.log(`rows read: ${files.map((file) => `${file.pumpType} ${file.rows.length}`).join(", ")}`);
console.log(`defects: ${lists.defects.length} (generic ${generic}, specific ${lists.defects.length - generic})`);
console.log(`topics: ${PUMP_TYPES.map((type) => `${type.code} ${lists.topics.filter((topic) => topic.pumpType === type.code).length}`).join(", ")}`);
console.log(`links: ${lists.links.length} · dispositions: PUMA ${lists.links.filter((link) => link.dispPuma).length}, OTHER ${lists.links.filter((link) => link.dispOther).length}`);
console.log(`issues: ${kinds.join(", ")}`);
console.log(`written to ${out}/`);
