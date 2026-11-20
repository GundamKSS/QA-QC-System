import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  audit: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/dal", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/audit", () => ({
  audit: mocks.audit,
  auditContext: () => ({ ip: "10.0.0.5", userAgent: "test" }),
}));
vi.mock("@/lib/db/config", () => ({ dbConfigured: () => false }));

import { GET, POST } from "@/app/api/master/model-checklists/route";
import { parseSaveModelChecklistInput } from "@/lib/master/model-checklist-types";
import { resetMemoryModelChecklists } from "@/lib/master/model-checklists";

const masterAdmin = {
  id: "5",
  employeeCode: "TRW0005",
  fullName: "ผู้ดูแลข้อมูลหลัก",
  roles: ["MASTERDATA_ADMIN"],
  mustChangePassword: false,
};

const pmViewer = {
  id: "7",
  employeeCode: "TRW0007",
  fullName: "PM ดูข้อมูล",
  roles: ["PM"],
  mustChangePassword: false,
};

const qcInspector = {
  id: "9",
  employeeCode: "QC01",
  fullName: "ช่างตรวจ QC",
  roles: ["QC_INSPECTOR"],
  mustChangePassword: false,
};

describe("/api/master/model-checklists", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMemoryModelChecklists();
    mocks.getCurrentUser.mockResolvedValue(masterAdmin);
  });

  it("validates input with parseSaveModelChecklistInput", () => {
    expect(parseSaveModelChecklistInput({ modelId: 0, items: [] }).ok).toBe(false);
    expect(parseSaveModelChecklistInput({ modelId: 1, items: [] })).toEqual({
      ok: false,
      message: expect.stringContaining("อย่างน้อย 1 ขั้นตอน"),
    });
    expect(
      parseSaveModelChecklistInput({
        modelId: 1,
        items: [{ title: "   " }],
      }),
    ).toEqual({
      ok: false,
      message: expect.stringContaining("ชื่อหัวข้อตรวจในขั้นตอนที่ 1"),
    });

    const valid = parseSaveModelChecklistInput({
      modelId: 1,
      role: "QC",
      items: [
        {
          title: "สแกนปั๊มและตรวจสีตัวถัง",
          inputType: "PASS_FAIL",
          photoRule: "ON_FAIL",
          videoRule: "NONE",
          animationType: "SCAN_PUMP",
        },
      ],
    });
    expect(valid.ok).toBe(true);
  });

  it("GET rejects unauthenticated (401) and non-master roles (403)", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);
    const res401 = await GET(new Request("http://localhost:3000/api/master/model-checklists"));
    expect(res401.status).toBe(401);

    mocks.getCurrentUser.mockResolvedValueOnce(qcInspector);
    const res403 = await GET(new Request("http://localhost:3000/api/master/model-checklists"));
    expect(res403.status).toBe(403);
  });

  it("GET returns models, selected model checklist items, and common masterPool", async () => {
    const res = await GET(
      new Request("http://localhost:3000/api/master/model-checklists?modelId=3&role=QC"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.selectedModelId).toBe(3);
    expect(body.role).toBe("QC");
    expect(body.items.length).toBe(4);
    expect(body.masterPool.length).toBeGreaterThanOrEqual(8);
  });

  it("POST enforces same-origin, edit permission, validation, and publishes a new version", async () => {
    // 1. Cross-origin blocked (403)
    const crossRes = await POST(
      new Request("http://localhost:3000/api/master/model-checklists", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://evil.example",
        },
        body: JSON.stringify({ modelId: 1, role: "QC", items: [] }),
      }),
    );
    expect(crossRes.status).toBe(403);

    // 2. Read-only PM role cannot edit (403)
    mocks.getCurrentUser.mockResolvedValueOnce(pmViewer);
    const forbidRes = await POST(
      new Request("http://localhost:3000/api/master/model-checklists", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
          host: "localhost:3000",
        },
        body: JSON.stringify({
          modelId: 1,
          role: "QC",
          items: [{ title: "ข้อที่ 1" }],
        }),
      }),
    );
    expect(forbidRes.status).toBe(403);

    // 3. Invalid payload (422)
    const invalidRes = await POST(
      new Request("http://localhost:3000/api/master/model-checklists", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
          host: "localhost:3000",
        },
        body: JSON.stringify({ modelId: 1, role: "QC", items: [] }),
      }),
    );
    expect(invalidRes.status).toBe(422);

    // 4. Master Admin publishes new version (v1 -> v2) with custom 3 steps
    const saveRes = await POST(
      new Request("http://localhost:3000/api/master/model-checklists", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
          host: "localhost:3000",
        },
        body: JSON.stringify({
          modelId: 1,
          role: "QC",
          items: [
            {
              title: "สแกนปั๊มและตรวจเนมเพลท",
              inputType: "PASS_FAIL",
              photoRule: "ALWAYS",
              videoRule: "NONE",
              animationType: "SCAN_PUMP",
            },
            {
              title: "ตรวจชุดหัวปั๊มและลูกสูบ",
              inputType: "PASS_FAIL",
              photoRule: "ON_FAIL",
              videoRule: "NONE",
              animationType: "PISTON_HEAD",
            },
            {
              title: "วัดแรงดันตัด (Bar)",
              inputType: "NUMBER",
              photoRule: "NONE",
              videoRule: "NONE",
              animationType: "PRESSURE_GAUGE",
            },
          ],
        }),
      }),
    );
    expect(saveRes.status).toBe(200);
    const savedBody = await saveRes.json();
    expect(savedBody).toMatchObject({
      status: "done",
      versionNo: 2,
      itemCount: 3,
    });
    expect(mocks.audit).toHaveBeenCalledOnce();

    // 5. Subsequent GET reflects v2 and 3 steps
    const getAfter = await GET(
      new Request("http://localhost:3000/api/master/model-checklists?modelId=1&role=QC"),
    );
    const payloadAfter = await getAfter.json();
    expect(payloadAfter.activeVersionNo).toBe(2);
    expect(payloadAfter.items).toHaveLength(3);
    expect(payloadAfter.items[0].animationType).toBe("SCAN_PUMP");

    // 6. History query reflects both v2 and v1, preserving past version items
    const historyRes = await GET(
      new Request("http://localhost:3000/api/master/model-checklists?history=1&modelId=1&role=QC"),
    );
    expect(historyRes.status).toBe(200);
    const historyBody = await historyRes.json();
    expect(historyBody.modelId).toBe(1);
    expect(historyBody.currentVersionNo).toBe(2);
    expect(historyBody.versions.length).toBeGreaterThanOrEqual(2);
    expect(historyBody.versions[0].versionNo).toBe(2);
    expect(historyBody.versions[0].itemCount).toBe(3);
    expect(historyBody.versions[1].versionNo).toBe(1);
    expect(historyBody.auditLogs.length).toBeGreaterThanOrEqual(1);
  });

  it("GET history rejects missing templateId and modelId with 422", async () => {
    const res = await GET(
      new Request("http://localhost:3000/api/master/model-checklists?history=1&role=QC"),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.message).toContain("กรุณาระบุรหัสเทมเพลต");
  });

  it("creates a new checklist template (Template 4) and assigns a Master Model to it", async () => {
    const createRes = await POST(
      new Request("http://localhost:3000/api/master/model-checklists", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
          host: "localhost:3000",
        },
        body: JSON.stringify({
          isNewTemplate: true,
          templateCode: "TPL-QC-04",
          templateName: "Template 4 — ปั๊มลมพิเศษ",
          scope: "Special",
          role: "QC",
          items: [
            {
              title: "ตรวจสภาพพิเศษขั้นตอนที่ 1",
              inputType: "PASS_FAIL",
              photoRule: "ON_FAIL",
              videoRule: "NONE",
              animationType: "SCAN_PUMP",
            },
            {
              title: "วัดแรงดันพิเศษ (Bar)",
              inputType: "NUMBER",
              photoRule: "NONE",
              videoRule: "NONE",
              animationType: "PRESSURE_GAUGE",
            },
          ],
        }),
      }),
    );
    expect(createRes.status).toBe(200);
    const createdBody = await createRes.json();
    expect(createdBody).toMatchObject({
      status: "done",
      templateCode: "TPL-QC-04",
      templateName: "Template 4 — ปั๊มลมพิเศษ",
      versionNo: 1,
      itemCount: 2,
    });

    // Assign Model 1 (PP-21) to the newly created Template 4
    const assignRes = await POST(
      new Request("http://localhost:3000/api/master/model-checklists", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
          host: "localhost:3000",
        },
        body: JSON.stringify({
          action: "assign_model_template",
          modelId: 1,
          role: "QC",
          templateId: createdBody.templateId,
        }),
      }),
    );
    expect(assignRes.status).toBe(200);

    // Verify GET by templateId returns the new Template 4 with PP-21 linked
    const getTpl = await GET(
      new Request(
        `http://localhost:3000/api/master/model-checklists?templateId=${createdBody.templateId}&role=QC`,
      ),
    );
    const tplPayload = await getTpl.json();
    expect(tplPayload.selectedTemplateId).toBe(createdBody.templateId);
    expect(tplPayload.items).toHaveLength(2);
    const tplSummary = tplPayload.templates.find(
      (t: { templateId: number }) => t.templateId === createdBody.templateId,
    );
    expect(tplSummary.linkedModels.map((m: { modelCode: string }) => m.modelCode)).toContain(
      "PP-21",
    );
  });

  it("resolves template role automatically when queried by templateId alone", async () => {
    const res = await GET(
      new Request("http://localhost:3000/api/master/model-checklists?templateId=102"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.selectedTemplateId).toBe(102);
    expect(body.role).toBe("QA");

    const histRes = await GET(
      new Request("http://localhost:3000/api/master/model-checklists?history=1&templateId=102"),
    );
    expect(histRes.status).toBe(200);
    const histBody = await histRes.json();
    expect(histBody.templateId).toBe(102);
    expect(histBody.role).toBe("QA");
  });

  it("handles switch_template_version: checks permissions, validation, and switches active version", async () => {
    // 1. Unauthorized user cannot switch version (403)
    mocks.getCurrentUser.mockResolvedValueOnce(pmViewer);
    const res403 = await POST(
      new Request("http://localhost:3000/api/master/model-checklists", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
          host: "localhost:3000",
        },
        body: JSON.stringify({
          action: "switch_template_version",
          templateId: 101,
          versionId: 1001,
        }),
      }),
    );
    expect(res403.status).toBe(403);

    // 2. Invalid templateId / versionId returns 422
    const res422 = await POST(
      new Request("http://localhost:3000/api/master/model-checklists", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
          host: "localhost:3000",
        },
        body: JSON.stringify({
          action: "switch_template_version",
          templateId: "invalid",
          versionId: 1001,
        }),
      }),
    );
    expect(res422.status).toBe(422);

    // 3. Non-existent template or version returns 404
    const res404 = await POST(
      new Request("http://localhost:3000/api/master/model-checklists", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
          host: "localhost:3000",
        },
        body: JSON.stringify({
          action: "switch_template_version",
          templateId: 9999,
          versionId: 9999,
        }),
      }),
    );
    expect(res404.status).toBe(404);

    // 4. Publish v2 for Template 101 first
    const saveRes = await POST(
      new Request("http://localhost:3000/api/master/model-checklists", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
          host: "localhost:3000",
        },
        body: JSON.stringify({
          templateId: 101,
          role: "QC",
          items: [
            {
              title: "ตรวจสภาพภายนอกแบบย่อ v2",
              inputType: "PASS_FAIL",
              photoRule: "ON_FAIL",
              videoRule: "NONE",
              animationType: "SCAN_PUMP",
            },
          ],
        }),
      }),
    );
    expect(saveRes.status).toBe(200);
    const saveBody = await saveRes.json();
    expect(saveBody.versionNo).toBe(2);

    // Verify history now has v2 and v1
    const histRes = await GET(
      new Request("http://localhost:3000/api/master/model-checklists?history=1&templateId=101"),
    );
    const histBody = await histRes.json();
    expect(histBody.currentVersionNo).toBe(2);
    expect(histBody.versions.length).toBeGreaterThanOrEqual(2);
    const v1Entry = histBody.versions.find((v: { versionNo: number }) => v.versionNo === 1);
    expect(v1Entry).toBeDefined();

    // 5. Admin switches active version back to v1 (Option 2)
    const switchRes = await POST(
      new Request("http://localhost:3000/api/master/model-checklists", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
          host: "localhost:3000",
        },
        body: JSON.stringify({
          action: "switch_template_version",
          templateId: 101,
          versionId: v1Entry.versionId,
        }),
      }),
    );
    expect(switchRes.status).toBe(200);
    const switchBody = await switchRes.json();
    expect(switchBody).toMatchObject({
      status: "done",
      templateId: 101,
      versionNo: 1,
    });
    expect(mocks.revalidatePath).toHaveBeenCalled();

    // 6. Verify subsequent GET reflects v1 as active
    const getActive = await GET(
      new Request("http://localhost:3000/api/master/model-checklists?templateId=101"),
    );
    const activePayload = await getActive.json();
    expect(activePayload.activeVersionNo).toBe(1);
    expect(activePayload.items.length).toBe(v1Entry.itemCount);

    // 7. Verify history contains the switch audit log with actorCode, actorName, at, and description
    const histAfterSwitch = await GET(
      new Request("http://localhost:3000/api/master/model-checklists?history=1&templateId=101"),
    );
    const histAfterBody = await histAfterSwitch.json();
    expect(histAfterBody.auditLogs.length).toBeGreaterThanOrEqual(1);
    const latestLog = histAfterBody.auditLogs[0];
    expect(latestLog.actorCode).toBe(masterAdmin.employeeCode);
    expect(latestLog.actorName).toBe(masterAdmin.fullName);
    expect(latestLog.description).toContain("สลับกลับมาใช้เวอร์ชัน v1");
    expect(latestLog.at).toBeDefined();
  });
});
