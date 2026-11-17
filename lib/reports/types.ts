export type ReportApproval = {
  role: "PREPARED_BY" | "REVIEWED_BY" | "APPROVED_BY";
  title: string;
  name: string;
  employeeCode: string;
  signedAt: string | null;
  status: "APPROVED" | "PENDING" | "REJECTED";
};

export type ReportDefectItem = {
  defectCode: string;
  defectName: string;
  category: string | null;
  severity: "CRITICAL" | "MAJOR" | "MINOR";
  causeTag: "SUPPLIER" | "TRANSPORT" | "INTERNAL" | "UNKNOWN" | null;
  affectedUnitsCount: number;
  percentOfLot: number;
  dispositionApplied: string;
  discoveredByRole: "QC" | "QA";
};

export type ReportPhoto = {
  id: string;
  unitId?: string;
  kind?: "PHOTO" | "VIDEO";
  role?: "QC" | "QA";
  roundNo?: number;
  cycleNo?: number;
  modelCode?: string;
  serialPump: string;
  serialMotor?: string;
  itemSeq?: number | null;
  topicCode?: string | null;
  itemTitle?: string | null;
  itemRemark?: string | null;
  defectCode?: string | null;
  defectName: string;
  part: string | null;
  severity?: "CRITICAL" | "MAJOR" | "MINOR";
  dispositionApplied?: string | null;
  uri: string;
  mime: string;
  capturedAt: string;
  inspectorName: string;
};

export type ReportUnitItem = {
  id: string;
  serialPump: string;
  serialMotor: string;
  serialSupplier: string | null;
  role: "QC" | "QA";
  cycleNo: number;
  roundNo: number;
  result: string;
  failureDecision: string | null;
  inspectorName: string;
  completedAt: string | null;
  defectsList: string | null;
};

export type InspectionReportData = {
  plan: {
    id: number;
    planNo: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    docNo: string;
    docType: string;
    department: string | null;
    vendorName: string | null;
    vendorCode: string | null;
    modelCode: string;
    modelDescription: string | null;
    brandName: string;
    brandGroup: string;
    pumpType: string | null;
    lotQty: number;
    qcRequired: number;
    qcDoneTotal: number;
    qaRequired: number;
    qaDoneTotal: number;
    aqlLevel: string;
    aqlSampleSize: number;
    aqlAcceptNum: number;
    aqlRejectNum: number;
  };
  qcSummary: {
    totalInspected: number;
    passCount: number;
    concessionCount: number;
    reworkCount: number;
    rejectCount: number;
    firstTimePassRate: number;
  };
  qaSummary: {
    totalSampled: number;
    passCount: number;
    rejectCount: number;
    decision: "ACCEPT" | "REJECT" | "PENDING";
    sampledSerials: string[];
  };
  defectBreakdown: ReportDefectItem[];
  defectPhotos: ReportPhoto[];
  inspectedUnits: ReportUnitItem[];
  approvals: ReportApproval[];
};

export type ReportsListItem = {
  id: number;
  planNo: string;
  docNo: string;
  docType: string;
  vendorName: string | null;
  modelCode: string;
  brandName: string;
  pumpType: string | null;
  lotQty: number;
  qcDoneTotal: number;
  qcRequired: number;
  qaDoneTotal: number;
  qaRequired: number;
  status: string;
  createdAt: string;
  qcCompletedAt: string | null;
  defectsCount: number;
  ageDays: number;
};

export type ReportsListResponse = {
  reports: ReportsListItem[];
  total: number;
  counts: {
    all: number;
    completed: number;
    qaPending: number;
    qcInProgress: number;
  };
};
