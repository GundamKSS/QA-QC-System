import { readFields } from "@/lib/api/body";
import { dbFailure } from "@/lib/api/db";
import { guardApi } from "@/lib/api/guard";
import { apiError, apiJson } from "@/lib/api/response";
import { audit, auditContext } from "@/lib/auth/audit";
import { parseUpdateDeviceInput } from "@/lib/auth/device-validation";
import { DeviceNotFoundError, updateDevice } from "@/lib/auth/devices";
import { resolveActorId } from "@/lib/db/actor";
import { dbConfigured } from "@/lib/db/config";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const guard = await guardApi(request, { page: "settings", returnTo: "/settings" });
  if ("response" in guard) return guard.response;

  const { id } = await context.params;
  if (!/^\d+$/.test(id)) {
    return apiError(404, "ไม่พบอุปกรณ์ที่ระบุ");
  }

  const fields = await readFields(request);
  const parsed = parseUpdateDeviceInput({
    deviceName: fields.get("deviceName") ?? undefined,
    location: fields.get("location") !== null ? fields.get("location") : undefined,
    deviceKind: fields.get("deviceKind") ?? undefined,
    idleMinutes: fields.get("idleMinutes") ?? undefined,
    isActive: fields.get("isActive") ?? undefined,
  });
  if (!parsed.ok) {
    return apiError(422, parsed.message);
  }

  try {
    const actorId = dbConfigured() ? await resolveActorId(guard.user.id) : guard.user.id;
    const { before, after } = await updateDevice(id, parsed.value, actorId);
    const action =
      parsed.value.isActive !== undefined && before.isActive !== after.isActive
        ? after.isActive
          ? "device.activate"
          : "device.deactivate"
        : "device.update";

    audit(
      {
        action,
        employeeCode: guard.user.employeeCode,
        userId: actorId ?? undefined,
        entity: { type: "device", id: after.id },
        before: {
          deviceName: before.deviceName,
          location: before.location,
          deviceKind: before.deviceKind,
          idleMinutes: before.idleMinutes,
          isActive: before.isActive,
        },
        after: {
          deviceName: after.deviceName,
          location: after.location,
          deviceKind: after.deviceKind,
          idleMinutes: after.idleMinutes,
          isActive: after.isActive,
        },
      },
      auditContext(request.headers),
    );
    return apiJson({ status: "done", message: "อัปเดตข้อมูลอุปกรณ์แล้ว", device: after });
  } catch (error) {
    if (error instanceof DeviceNotFoundError) {
      return apiError(404, error.message);
    }
    return dbFailure(error, "update device");
  }
}
