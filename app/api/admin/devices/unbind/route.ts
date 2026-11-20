import { dbFailure } from "@/lib/api/db";
import { guardApi } from "@/lib/api/guard";
import { apiJson } from "@/lib/api/response";
import { audit, auditContext } from "@/lib/auth/audit";
import { clearDeviceCookie, getCurrentDevicePolicy } from "@/lib/auth/devices";
import { resolveActorId } from "@/lib/db/actor";
import { dbConfigured } from "@/lib/db/config";

export async function POST(request: Request) {
  const guard = await guardApi(request, { page: "settings", returnTo: "/settings" });
  if ("response" in guard) return guard.response;

  try {
    const current = await getCurrentDevicePolicy();
    await clearDeviceCookie();
    const actorId = dbConfigured() ? await resolveActorId(guard.user.id) : guard.user.id;
    audit(
      {
        action: "device.unbind",
        employeeCode: guard.user.employeeCode,
        userId: actorId ?? undefined,
        entity: current.deviceId ? { type: "device", id: current.deviceId } : undefined,
        detail: current.deviceCode ? { deviceCode: current.deviceCode } : undefined,
      },
      auditContext(request.headers),
    );
    return apiJson({ status: "done", message: "ยกเลิกการผูกเครื่องส่วนกลางบนเบราว์เซอร์นี้แล้ว" });
  } catch (error) {
    return dbFailure(error, "unbind device");
  }
}
