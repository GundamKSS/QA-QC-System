import { Suspense } from "react";
import { HistoryView } from "@/components/history/HistoryView";
import { requirePageAccess } from "@/lib/auth/dal";
import { isHistoryHead } from "@/lib/plans/history";
import { historyToday, parseHistoryQuery } from "@/lib/plans/history-query";

export const metadata = { title: "ประวัติ" };

type SearchParams = Record<string, string | string[] | undefined>;

export default function HistoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <Suspense fallback={<p className="p-6 text-ti-400">กำลังโหลด…</p>}>
      <History searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * ประวัติ (docs/18). The role is checked here, on the server; the list itself is read by the browser from
 * `GET /api/history` (components/history). The address picks the filter, so the page parses it and hands over the values.
 */
async function History({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePageAccess("history", "/history");
  const { values } = parseHistoryQuery(await searchParams, historyToday());
  return <HistoryView isHead={isHistoryHead(user.roles)} values={values} />;
}
