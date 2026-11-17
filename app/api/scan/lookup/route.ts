import { readFields } from "@/lib/api/body";
import { dbFailure } from "@/lib/api/db";
import { guardApi } from "@/lib/api/guard";
import { apiError, apiJson } from "@/lib/api/response";
import { lookupScan } from "@/lib/scan/service";

/**
 * Scan lookup endpoint (Screen S05 / Global Scan).
 * Receives scanned QR or Barcode text, parses it, and either:
 * - Matches an active Work Order automatically (for in-house pumps), or
 * - Returns scanned details and available active Work Orders for 1-click selection (for imported/generic pumps).
 */
export async function POST(request: Request) {
  const guard = await guardApi(request, { page: "scan", returnTo: "/scan" });
  if ("response" in guard) return guard.response;

  const fields = await readFields(request);
  const code = fields.text("code").trim();

  if (!code) {
    return apiError(422, "กรุณาระบุรหัสที่สแกน (code)");
  }

  try {
    const result = await lookupScan(guard.user, code);
    return apiJson({ status: "done", result });
  } catch (error) {
    return dbFailure(error, "scan lookup");
  }
}
