import { readFields } from "@/lib/api/body";
import { dbFailure } from "@/lib/api/db";
import { guardApi } from "@/lib/api/guard";
import { apiError, apiJson } from "@/lib/api/response";
import { adminFailure } from "@/lib/auth/admin-api";
import { audit, auditContext } from "@/lib/auth/audit";
import { adminErrors } from "@/lib/auth/admin-copy";
import { changeOwnPin } from "@/lib/auth/local-admin";
import { getLocalStore, getPinGuard, pinPepper } from "@/lib/auth/local-runtime";
import { authPolicy } from "@/lib/config/auth";

/**
 * A field user choosing their own PIN, forced after a temporary one (docs/12). Central users never
 * get here. Answers `{ status: "done", redirectTo }` so the form can send the person home.
 */
export async function POST(request: Request) {
  const guard = await guardApi(request, { returnTo: authPolicy.changePasswordPath, allowPasswordChange: true });
  if ("response" in guard) return guard.response;
  const { user } = guard;
  if (user.source !== "LOCAL") return apiError(403, adminErrors.forbidden);
  const pepper = pinPepper();
  if (!pepper) return apiError(503, "ระบบยังไม่พร้อม ติดต่อผู้ดูแลระบบ");

  const fields = await readFields(request);
  try {
    const result = await changeOwnPin(
      { store: getLocalStore(), guard: getPinGuard(), pepper, userId: user.id },
      { current: fields.text("current"), next: fields.text("next"), confirm: fields.text("confirm") },
    );
    if (!result.ok) return adminFailure(result.error);
  } catch (error) {
    return dbFailure(error, "change pin");
  }
  audit({ action: "user.pin_change", employeeCode: user.employeeCode, userId: user.id }, auditContext(request.headers));
  return apiJson({ status: "done", redirectTo: authPolicy.homePath });
}
