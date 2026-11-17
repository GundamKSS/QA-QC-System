"use client";

import { useApiRead } from "@/lib/api/client";
import type { InspectionRole } from "@/lib/inspections/types";
import type { ModelChecklistPayload } from "@/lib/master/model-checklist-types";

export function useModelChecklists(
  templateId?: number,
  role: InspectionRole = "QC",
  modelId?: number,
) {
  const params = new URLSearchParams();
  if (templateId && templateId > 0) params.set("templateId", String(templateId));
  if (modelId && modelId > 0) params.set("modelId", String(modelId));
  params.set("role", role);
  return useApiRead<ModelChecklistPayload>(
    `/api/master/model-checklists?${params.toString()}`,
  );
}
