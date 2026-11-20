import { readFields } from "@/lib/api/body";
import { dbFailure } from "@/lib/api/db";
import { guardApi } from "@/lib/api/guard";
import { apiData, apiError, apiJson } from "@/lib/api/response";
import { audit, auditContext } from "@/lib/auth/audit";
import { parseRegisterDeviceInput } from "@/lib/auth/device-validation";
import { DeviceConflictError, listDevices, registerAndBindDevice } from "@/lib/auth/devices";
import { resolveActorId } from "@/lib/db/actor";
import { dbConfigured } from "@/lib/db/config";

export async function GET(request: Request) {
  const guard = await guardApi(request, { page: "settings", returnTo: "/settings" });
  if ("response" in guard) return guard.response;

  try {
    const payload = await listDevices();
    return apiData(payload);
  } catch (error) {
    return dbFailure(error, "list devices");
  }
}

export async function POST(request: Request) {
  const guard = await guardApi(request, { page: "settings", returnTo: "/settings" });
  if ("response" in guard) return guard.response;

  const fields = await readFields(request);
  const parsed = parseRegisterDeviceInput({
    deviceCode: fields.get("deviceCode"),
    deviceName: fields.get("deviceName"),
    location: fields.get("location"),
    deviceKind: fields.get("deviceKind"),
    idleMinutes: fields.get("idleMinutes"),
  });
  if (!parsed.ok) {
    return apiError(422, parsed.message);
  }

  try {
    const actorId = dbConfigured() ? await resolveActorId(guard.user.id) : guard.user.id;
    const device = await registerAndBindDevice(parsed.value, actorId);
    audit(
      {
        action: "device.register",
        employeeCode: guard.user.employeeCode,
        userId: actorId ?? undefined,
        entity: { type: "device", id: device.id },
        after: {
          deviceCode: device.deviceCode,
          deviceName: device.deviceName,
          location: device.location,
          deviceKind: device.deviceKind,
          idleMinutes: device.idleMinutes,
        },
      },
      auditContext(request.headers),
    );
    return apiJson({ status: "done", message: `ลงทะเบียนและผูกเครื่อง ${device.deviceCode} เรียบร้อยแล้ว`, device }, 201);
  } catch (error) {
    if (error instanceof DeviceConflictError) {
      return apiError(409, error.message);
    }
    return dbFailure(error, "register device");
  }
}
