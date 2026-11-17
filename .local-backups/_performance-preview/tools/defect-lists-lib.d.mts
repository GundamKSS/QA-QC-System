export type PumpTypeCode = "PISTON" | "OIL_FREE" | "ROTARY";
export type Severity = "MINOR" | "MAJOR" | "CRITICAL";
export type Disposition = "CONCESSION" | "REWORK" | "REJECT" | "CHOOSE";

export const PUMP_TYPES: { code: PumpTypeCode; name: string; option: string }[];

export type DefectRow = {
  pumpType: PumpTypeCode;
  no: number;
  topicSeq: number;
  topicTitle: string;
  rawName: string;
  name: string;
  usePuma: boolean;
  concessionFlag: boolean;
  severityPuma: Severity | null;
  dispPuma: Disposition | null;
  useOther: boolean;
  severityOther: Severity | null;
  dispOther: Disposition | null;
  category: string | null;
};

export type Issue = { kind: string; pumpType: string | null; no: number | null; name: string | null; detail: string };
export type DefectFile = { pumpType: PumpTypeCode; rows: DefectRow[]; issues: Issue[] };

export type CommonDefect = {
  name: string;
  kind: "generic" | "specific";
  category: string | null;
  severity: Severity;
  linkCount: number;
  byPump: Record<PumpTypeCode, number>;
  parts: string[];
};

export type Topic = { pumpType: PumpTypeCode; seq: number; title: string };

export type Link = {
  pumpType: PumpTypeCode;
  topicSeq: number;
  topicTitle: string;
  seq: number;
  sources: { no: number; rawName: string }[];
  defect: string;
  part: string | null;
  severity: Severity;
  usePuma: boolean;
  useOther: boolean;
  dispPuma: Disposition | null;
  dispOther: Disposition | null;
  category: string | null;
};

export type DefectLists = { defects: CommonDefect[]; topics: Topic[]; links: Link[]; issues: Issue[] };

export function parseCsv(text: string): string[][];
export function cleanName(name: string): string;
export function splitDefect(name: string): { defect: string; part: string | null };
export function readDefectFile(text: string, pumpType: PumpTypeCode): DefectFile;
export function buildDefectLists(files: DefectFile[]): DefectLists;
export function toCsv(rows: unknown[][]): string;
export function reviewFiles(lists: DefectLists): Record<"defects.csv" | "links.csv" | "issues.csv", string>;
export function seedSql(
  lists: Pick<DefectLists, "defects" | "topics" | "links">,
  options: { fileName: string; sources: string[]; roles?: ("QA" | "QC")[]; version?: number; generatedOn: string },
): string;
