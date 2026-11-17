import { revalidatePath } from "next/cache";
import { readFields } from "@/lib/api/body";
import { dbFailure } from "@/lib/api/db";
import { guardApi } from "@/lib/api/guard";
import { readQuery } from "@/lib/api/query";
import { apiData, apiError, apiJson } from "@/lib/api/response";
import { audit, auditContext } from "@/lib/auth/audit";
import { canAccessPage } from "@/lib/auth/page-access";
import type { InspectionRole } from "@/lib/inspections/types";
import { parseSaveModelChecklistInput } from "@/lib/master/model-checklist-types";
import {
  assignModelChecklistTemplate,
  loadModelChecklistHistory,
  loadModelChecklistPayload,
  saveModelChecklist,
  switchChecklistTemplateVersion,
} from "@/lib/master/model-checklists";

/**
 * GET /api/master/model-checklists
 * Load checklist templates (Template 1, 2, 3...), models, active checklist items for the selected template & role,
 * and the common master checklist pool.
 * When `history=1`, returns the complete version timeline and audit logs for that template (or model + role).
 */
export async function GET(request: Request) {
  const guard = await guardApi(request, {
    page: "master",
    returnTo: "/master/model-checklists",
  });
  if ("response" in guard) return guard.response;

  const query = readQuery(request);
  const rawTemplateId = typeof query.templateId === "string" ? Number(query.templateId) : undefined;
  const templateId = rawTemplateId && Number.isFinite(rawTemplateId) && rawTemplateId > 0 ? rawTemplateId : undefined;
  const rawModelId = typeof query.modelId === "string" ? Number(query.modelId) : undefined;
  const modelId = rawModelId && Number.isFinite(rawModelId) && rawModelId > 0 ? rawModelId : undefined;
  const role: InspectionRole = query.role === "QA" ? "QA" : "QC";

  const isHistory = query.history === "1" || query.history === "true";
  if (isHistory) {
    if (!templateId && !modelId) {
      return apiError(422, "กรุณาระบุรหัสเทมเพลต (templateId) หรือรหัสโมเดล (modelId)");
    }
    try {
      const history = await loadModelChecklistHistory({ templateId, modelId, role });
      if (!history) {
        return apiError(404, "ไม่พบข้อมูลประวัติของเทมเพลตหรือโมเดลที่ระบุ");
      }
      return apiData(history);
    } catch (error) {
      return dbFailure(error, "load model checklist history");
    }
  }

  try {
    const payload = await loadModelChecklistPayload({ templateId, modelId, role });
    return apiData(payload);
  } catch (error) {
    return dbFailure(error, "load model checklists");
  }
}

/**
 * POST /api/master/model-checklists
 * 1) Create a new Checklist Template OR save & publish a new version of an existing Checklist Template.
 * 2) When `action = "assign_model_template"`, bind a Master Model to a Checklist Template.
 */
export async function POST(request: Request) {
  const guard = await guardApi(request, {
    page: "master",
    returnTo: "/master/model-checklists",
  });
  if ("response" in guard) return guard.response;

  const { user } = guard;
  const canEdit =
    canAccessPage(user.roles, "master-edit") ||
    user.roles.includes("ADMIN") ||
    user.roles.includes("QC_HEAD") ||
    user.roles.includes("QA_HEAD");

  if (!canEdit) {
    return apiError(403, "ไม่มีสิทธิ์แก้ไขเทมเพลตเช็คลิสต์ (เฉพาะ Admin / Master Admin / หัวหน้า QC-QA)");
  }

  const contentType = request.headers.get("content-type") ?? "";
  let rawBody: Record<string, unknown> = {};
  if (contentType.includes("application/json")) {
    try {
      rawBody = (await request.json()) as Record<string, unknown>;
    } catch {
      return apiError(422, "รูปแบบข้อมูล JSON ไม่ถูกต้อง");
    }
  } else {
    const fields = await readFields(request);
    rawBody = {
      action: fields.get("action"),
      templateId: fields.get("templateId"),
      versionId: fields.get("versionId"),
      isNewTemplate: fields.get("isNewTemplate"),
      templateCode: fields.get("templateCode"),
      templateName: fields.get("templateName"),
      scope: fields.get("scope"),
      modelId: fields.get("modelId"),
      role: fields.get("role"),
      items: fields.get("items"),
    };
  }

  if (rawBody.action === "switch_template_version") {
    const templateId = Number(rawBody.templateId);
    const versionId = Number(rawBody.versionId);
    if (!Number.isInteger(templateId) || templateId <= 0) {
      return apiError(422, "รหัส Template ไม่ถูกต้อง");
    }
    if (!Number.isInteger(versionId) || versionId <= 0) {
      return apiError(422, "รหัสเวอร์ชัน (versionId) ไม่ถูกต้อง");
    }

    try {
      const switched = await switchChecklistTemplateVersion(
        user.id,
        {
          templateId,
          versionId,
        },
        {
          employeeCode: user.employeeCode,
          fullName: user.fullName,
        },
      );
      if (!switched) {
        return apiError(404, "ไม่พบเทมเพลตหรือเวอร์ชันที่ระบุ");
      }

      audit(
        {
          action: "master.update",
          employeeCode: user.employeeCode,
          userId: user.id,
          entity: {
            type: "checklist_templates",
            id: String(templateId),
          },
          after: {
            action: "switch_version",
            actorCode: user.employeeCode,
            actorName: user.fullName,
            description: `สลับกลับมาใช้เวอร์ชัน v${switched.versionNo} (${switched.itemCount} ขั้นตอน) เป็นเวอร์ชันปัจจุบัน`,
            templateId: switched.templateId,
            templateCode: switched.templateCode,
            templateName: switched.templateName,
            role: switched.role,
            versionId: switched.versionId,
            versionNo: switched.versionNo,
            itemCount: switched.itemCount,
          },
        },
        auditContext(request.headers),
      );

      revalidatePath("/master");
      revalidatePath("/master/models");
      revalidatePath("/master/checklist-templates");
      revalidatePath("/master/model-checklists");

      return apiJson({
        status: "done",
        message: `สลับกลับมาใช้เวอร์ชัน v${switched.versionNo} (${switched.itemCount} ขั้นตอน) เป็นเวอร์ชันปัจจุบันเรียบร้อยแล้ว`,
        templateId: switched.templateId,
        templateCode: switched.templateCode,
        versionId: switched.versionId,
        versionNo: switched.versionNo,
        itemCount: switched.itemCount,
      });
    } catch (error) {
      return dbFailure(error, "switch checklist template version");
    }
  }

  if (rawBody.action === "assign_model_template") {
    const modelId = Number(rawBody.modelId);
    if (!Number.isInteger(modelId) || modelId <= 0) {
      return apiError(422, "กรุณาเลือกโมเดลที่ต้องการผูก Template");
    }
    const role: InspectionRole = rawBody.role === "QA" ? "QA" : "QC";
    const rawTplId = rawBody.templateId;
    const templateId =
      rawTplId === null || rawTplId === "" || rawTplId === undefined ? null : Number(rawTplId);
    if (templateId !== null && (!Number.isInteger(templateId) || templateId <= 0)) {
      return apiError(422, "รหัส Template ไม่ถูกต้อง");
    }

    try {
      const assigned = await assignModelChecklistTemplate(user.id, {
        modelId,
        role,
        templateId,
      });
      if (!assigned) {
        return apiError(404, "ไม่พบโมเดลหรือ Template ที่ระบุ");
      }

      audit(
        {
          action: "master.update",
          employeeCode: user.employeeCode,
          userId: user.id,
          entity: {
            type: "models",
            id: String(modelId),
          },
          after: {
            modelCode: assigned.modelCode,
            role,
            templateId: assigned.templateId,
            templateName: assigned.templateName,
          },
        },
        auditContext(request.headers),
      );

      revalidatePath("/master");
      revalidatePath("/master/models");
      revalidatePath("/master/model-checklists");

      return apiJson({
        status: "done",
        message: assigned.templateName
          ? `ผูกรุ่น ${assigned.modelCode} (${role}) เข้ากับ “${assigned.templateName}” เรียบร้อยแล้ว`
          : `ยกเลิกการผูก Template ของรุ่น ${assigned.modelCode} (${role}) แล้ว`,
        modelId: assigned.modelId,
        templateId: assigned.templateId,
      });
    } catch (error) {
      return dbFailure(error, "assign model checklist template");
    }
  }

  const parsed = parseSaveModelChecklistInput(rawBody);

  if (!parsed.ok) {
    return apiError(422, parsed.message);
  }

  try {
    const saved = await saveModelChecklist(user.id, parsed.data, {
      employeeCode: user.employeeCode,
      fullName: user.fullName,
    });
    if (!saved) {
      return apiError(404, "ไม่พบเทมเพลตหรือโมเดลที่ต้องการบันทึกเช็คลิสต์");
    }

    audit(
      {
        action: parsed.data.isNewTemplate ? "master.create" : "master.update",
        employeeCode: user.employeeCode,
        userId: user.id,
        entity: {
          type: "model_checklist",
          id: parsed.data.modelId ? `${parsed.data.modelId}:${parsed.data.role}` : `tpl:${saved.templateId}`,
        },
        after: {
          templateId: saved.templateId,
          templateCode: saved.templateCode,
          templateName: saved.templateName,
          modelCode: saved.modelCode,
          role: parsed.data.role,
          versionNo: saved.versionNo,
          itemCount: saved.itemCount,
          actorCode: user.employeeCode,
          actorName: user.fullName,
          description: parsed.data.isNewTemplate
            ? `สร้างเทมเพลตใหม่ ${saved.templateCode} และเผยแพร่เวอร์ชันแรก v1 (${saved.itemCount} ขั้นตอน)`
            : `บันทึกและเผยแพร่เวอร์ชันใหม่ v${saved.versionNo} (${saved.itemCount} ขั้นตอน)`,
        },
      },
      auditContext(request.headers),
    );

    revalidatePath("/master");
    revalidatePath("/master/models");
    revalidatePath("/master/checklist-templates");
    revalidatePath("/master/model-checklists");

    return apiJson({
      status: "done",
      message: parsed.data.isNewTemplate
        ? `สร้างเทมเพลต “${saved.templateName}” (${saved.templateCode}) เวอร์ชัน v1 (${saved.itemCount} ขั้นตอน) เรียบร้อยแล้ว`
        : `บันทึกและเผยแพร่เทมเพลต “${saved.templateName}” (${parsed.data.role}) เวอร์ชัน v${saved.versionNo} (${saved.itemCount} ขั้นตอน) เรียบร้อยแล้ว`,
      templateId: saved.templateId,
      templateCode: saved.templateCode,
      templateName: saved.templateName,
      versionId: saved.versionId,
      versionNo: saved.versionNo,
      itemCount: saved.itemCount,
    });
  } catch (error) {
    return dbFailure(error, "save model checklist");
  }
}
