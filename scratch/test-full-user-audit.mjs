/**
 * Full Realistic User Journey & Deep Security/Vulnerability/Inconsistency Audit
 */

const BASE_URL = "http://localhost:3000";

const findings = {
  journeySteps: [],
  securityProbes: [],
  inconsistencies: [],
  functionalBugs: []
};

function logStep(step, status, details) {
  const icon = status === "PASS" ? "✅" : status === "WARN" ? "⚠️" : status === "FAIL" ? "❌" : "ℹ️";
  console.log(`${icon} [${step}] ${details}`);
  findings.journeySteps.push({ step, status, details });
}

function logSecurity(probe, result, severity, details) {
  const icon = result === "SECURE" ? "🛡️" : result === "VULNERABLE" ? "🚨" : "⚠️";
  console.log(`${icon} [SEC-AUDIT] [${severity}] ${probe}: ${details}`);
  findings.securityProbes.push({ probe, result, severity, details });
}

function logInconsistency(topic, description, impact) {
  console.log(`⚡ [INCONSISTENCY] [${topic}]: ${description} (Impact: ${impact})`);
  findings.inconsistencies.push({ topic, description, impact });
}

function logBug(bugId, title, description, repro) {
  console.log(`🐞 [BUG] [${bugId}] ${title}: ${description}`);
  findings.functionalBugs.push({ bugId, title, description, repro });
}

async function loginAs(employeeCode) {
  const res = await fetch(`${BASE_URL}/api/dev/impersonate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employeeCode })
  });
  if (!res.ok) {
    throw new Error(`Failed to login as ${employeeCode}: ${res.status}`);
  }
  const cookie = res.headers.get("set-cookie");
  const data = await res.json();
  return { cookie, user: data.user };
}

async function main() {
  console.log("=====================================================================");
  console.log("🚀 STARTING FULL REALISTIC USER AUDIT & SYSTEM INTEGRITY TEST");
  console.log("=====================================================================\n");

  let adminSession, qcSession, otherQcSession, qaSession;
  try {
    adminSession = await loginAs("dev"); // Admin / QC Head / QA Head
    qcSession = await loginAs("F0002");   // นิภาพร เพชรศิลา (QC Inspector)
    otherQcSession = await loginAs("F0003"); // มาอรวรรณ เทียนยุทธ (Other QC Inspector)
    qaSession = await loginAs("F0001");   // ประภาพร ดงกระโทก (QA Inspector)
    logStep("AUTH_INIT", "PASS", "Initialized test sessions for Admin(dev), QC(F0002), OtherQC(F0003), QA(F0001)");
  } catch (err) {
    logStep("AUTH_INIT", "FAIL", `Cannot initialize sessions: ${err.message}`);
    process.exit(1);
  }

  // =========================================================================
  // PART 1: REALISTIC USER JOURNEY
  // =========================================================================
  console.log("\n--- [PART 1: REALISTIC USER JOURNEY] ---");

  // Step 1: Get active models and options
  let targetModel = null;
  try {
    const optRes = await fetch(`${BASE_URL}/api/plans/options`, {
      headers: { Cookie: adminSession.cookie }
    });
    const optData = await optRes.json();
    const models = optData.options?.models || [];
    if (optRes.ok && models.length > 0) {
      targetModel = models.find(m => m.code === "CHEETAH-25") || models[0];
      logStep("PLAN_OPTIONS", "PASS", `Fetched options. Target model: ${targetModel.code} (ID: ${targetModel.id})`);
    } else {
      logStep("PLAN_OPTIONS", "FAIL", `Failed to fetch plan options: ${JSON.stringify(optData)}`);
    }
  } catch (err) {
    logStep("PLAN_OPTIONS", "FAIL", err.message);
  }

  if (!targetModel) {
    console.error("Cannot proceed without a target model.");
    return;
  }

  // Step 2: Create a fresh Inspection Plan
  const testDocNo = `INV-AUDIT-${Date.now().toString().slice(-6)}`;
  let createdPlanId = null;
  let createdPlanNo = null;
  try {
    const createPlanRes = await fetch(`${BASE_URL}/api/plans`, {
      method: "POST",
      headers: {
        Cookie: adminSession.cookie,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        docType: "INVOICE",
        docNo: testDocNo,
        vendorId: String(targetModel.vendorId || 1),
        modelId: String(targetModel.id),
        lotQty: "2",
        invoiceDate: new Date().toISOString().slice(0, 10),
        docDate: new Date().toISOString().slice(0, 10),
        receiptDate: new Date().toISOString().slice(0, 10),
        department: "408",
        expectedSkuCount: "1",
        remarks: "Audit E2E User Journey Plan"
      })
    });
    const planResult = await createPlanRes.json();
    const matchId = planResult.planId || planResult.id || (planResult.redirectTo ? Number(planResult.redirectTo.split("opened=")[1]) : null);
    if (createPlanRes.ok && matchId) {
      createdPlanId = matchId;
      createdPlanNo = planResult.planNo;
      logStep("PLAN_CREATE", "PASS", `Created plan ${createdPlanNo || createdPlanId} (ID: ${createdPlanId}) for model ${targetModel.code}`);
    } else {
      logStep("PLAN_CREATE", "FAIL", `Plan creation failed (Status: ${createPlanRes.status}): ${JSON.stringify(planResult)}`);
    }
  } catch (err) {
    logStep("PLAN_CREATE", "FAIL", err.message);
  }

  if (!createdPlanId) {
    console.error("Cannot proceed without a created plan.");
    return;
  }

  // Step 3: Create Work Order under this Plan (requires 2 QC assignees: F0002 = 5, F0003 = 6)
  let createdWoId = null;
  let createdWoNo = null;
  try {
    const createWoRes = await fetch(`${BASE_URL}/api/plans/${createdPlanId}/work-orders`, {
      method: "POST",
      headers: {
        Cookie: adminSession.cookie,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        calledDate: new Date().toISOString().slice(0, 10),
        calledQty: "2",
        assignee1: "5", // F0002 (นิภาพร)
        assignee2: "6", // F0003 (มาอรวรรณ)
        assigneeQty1: "1",
        assigneeQty2: "1",
        remarks: "Audit E2E Call-in Work Order"
      })
    });
    const woResult = await createWoRes.json();
    if (createWoRes.status === 201 || (createWoRes.ok && woResult.status === "done")) {
      const matchWo = woResult.redirectTo ? woResult.redirectTo.split("opened=")[1] : null;
      createdWoNo = woResult.woNo || matchWo;
      logStep("WO_CREATE", "PASS", `Created Work Order ${createdWoNo} Target: 2 units (F0002: 1, F0003: 1)`);
    } else {
      logStep("WO_CREATE", "FAIL", `Work Order creation failed (Status: ${createWoRes.status}): ${JSON.stringify(woResult)}`);
    }
  } catch (err) {
    logStep("WO_CREATE", "FAIL", err.message);
  }

  // Recover created work order ID from work-order-list
  try {
    const woListRes = await fetch(`${BASE_URL}/api/plans/${createdPlanId}/work-order-list`, {
      headers: { Cookie: adminSession.cookie }
    });
    const woListData = await woListRes.json();
    const firstWo = woListData.workOrders?.[0];
    if (firstWo) {
      createdWoId = firstWo.id;
      createdWoNo = firstWo.woNo;
      logStep("WO_RECOVER", "PASS", `Recovered Work Order ${createdWoNo} (ID: ${createdWoId})`);
    }
  } catch (err) {
    logStep("WO_RECOVER", "FAIL", err.message);
  }

  if (!createdWoId) {
    console.error("Cannot proceed without a created work order ID.");
    return;
  }

  // Step 4: QC Inspector Checks Assigned Jobs
  try {
    const jobsRes = await fetch(`${BASE_URL}/api/jobs`, {
      headers: { Cookie: qcSession.cookie }
    });
    const jobsData = await jobsRes.json();
    if (jobsRes.ok && jobsData.jobs) {
      const myJob = jobsData.jobs.find(j => j.woNo === createdWoNo || j.planNo === createdPlanNo);
      if (myJob) {
        logStep("QC_VIEW_JOBS", "PASS", `QC Inspector F0002 sees assigned job: ${myJob.woNo} (${myJob.modelCode}) remaining=${myJob.remaining}`);
      } else {
        logStep("QC_VIEW_JOBS", "WARN", `Job not found in F0002 /api/jobs list (Total jobs returned: ${jobsData.jobs.length})`);
      }
    } else {
      logStep("QC_VIEW_JOBS", "FAIL", `Failed to get jobs: ${jobsRes.status}`);
    }
  } catch (err) {
    logStep("QC_VIEW_JOBS", "FAIL", err.message);
  }

  // Step 5: Fetch QC Checklist Template for this Plan
  let qcTemplate = null;
  let qcTemplateItems = [];
  try {
    const tplRes = await fetch(`${BASE_URL}/api/inspections/template?planId=${createdPlanId}&role=QC`, {
      headers: { Cookie: qcSession.cookie }
    });
    const tplData = await tplRes.json();
    qcTemplateItems = tplData.items || tplData.template?.items || [];
    if (tplRes.ok && qcTemplateItems.length > 0) {
      qcTemplate = { ...tplData.template, items: qcTemplateItems };
      logStep("QC_TEMPLATE", "PASS", `Fetched QC template: ${qcTemplate.name} (${qcTemplateItems.length} items)`);
    } else {
      logStep("QC_TEMPLATE", "FAIL", `QC template empty or not found: ${JSON.stringify(tplData)}`);
    }
  } catch (err) {
    logStep("QC_TEMPLATE", "FAIL", err.message);
  }

  // Step 6: QC Inspector Claims Unit 1 (Serial: SN-AUDIT-001) as F0002
  const serial1 = `SN-AUDIT-${Date.now().toString().slice(-4)}-1`;
  let claim1Id = null;
  try {
    const claimRes = await fetch(`${BASE_URL}/api/inspections/claim`, {
      method: "POST",
      headers: {
        Cookie: qcSession.cookie,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        workOrderId: String(createdWoId),
        planId: createdPlanId,
        serialPump: serial1,
        role: "QC"
      })
    });
    const claimData = await claimRes.json();
    const inspId = claimData.inspectionId || claimData.inspection?.id;
    if (claimRes.ok && inspId) {
      claim1Id = inspId;
      logStep("QC_CLAIM_1", "PASS", `F0002 claimed Unit 1 (${serial1}) -> Inspection ID: ${claim1Id}`);
    } else {
      logStep("QC_CLAIM_1", "FAIL", `F0002 claim Unit 1 failed: ${JSON.stringify(claimData)}`);
    }
  } catch (err) {
    logStep("QC_CLAIM_1", "FAIL", err.message);
  }

  // Step 7: QC Inspector Submits Unit 1 as PASS
  if (claim1Id && qcTemplateItems.length > 0) {
    try {
      const answers = {};
      for (const item of qcTemplateItems) {
        answers[item.id] = {
          status: "NORMAL",
          value: "8.0",
          remark: "Normal Spec OK"
        };
      }

      const submitRes = await fetch(`${BASE_URL}/api/inspections/${claim1Id}/submit`, {
        method: "POST",
        headers: {
          Cookie: qcSession.cookie,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          planId: createdPlanId,
          workOrderId: String(createdWoId),
          role: "QC",
          decision: "PASS",
          answers
        })
      });
      const submitData = await submitRes.json();
      if (submitRes.ok && submitData.status === "done") {
        logStep("QC_SUBMIT_1", "PASS", `Submitted Unit 1 as PASS successfully! (Result: ${submitData.result || "PASS"})`);
      } else {
        logStep("QC_SUBMIT_1", "FAIL", `Submit Unit 1 failed: ${JSON.stringify(submitData)}`);
      }
    } catch (err) {
      logStep("QC_SUBMIT_1", "FAIL", err.message);
    }
  }

  // Step 8: Other QC Inspector (F0003) Claims Unit 2 (Serial: SN-AUDIT-002)
  const serial2 = `SN-AUDIT-${Date.now().toString().slice(-4)}-2`;
  let claim2Id = null;
  try {
    const claimRes = await fetch(`${BASE_URL}/api/inspections/claim`, {
      method: "POST",
      headers: {
        Cookie: otherQcSession.cookie,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        workOrderId: String(createdWoId),
        planId: createdPlanId,
        serialPump: serial2,
        role: "QC"
      })
    });
    const claimData = await claimRes.json();
    const inspId = claimData.inspectionId || claimData.inspection?.id;
    if (claimRes.ok && inspId) {
      claim2Id = inspId;
      logStep("QC_CLAIM_2", "PASS", `F0003 claimed Unit 2 (${serial2}) -> Inspection ID: ${claim2Id}`);
    } else {
      logStep("QC_CLAIM_2", "FAIL", `F0003 claim Unit 2 failed: ${JSON.stringify(claimData)}`);
    }
  } catch (err) {
    logStep("QC_CLAIM_2", "FAIL", err.message);
  }

  // Step 9: F0003 Submits Unit 2 with DEFECT / FAIL (Simulating Defect + Rework Flow)
  let failedItemId = null;
  if (claim2Id && qcTemplateItems.length > 0) {
    try {
      const answers = {};
      qcTemplateItems.forEach((item, idx) => {
        if (idx === 0) {
          failedItemId = item.id;
          answers[item.id] = {
            status: "FAIL",
            value: "0.0",
            remark: "Defect: Paint scratch and oil leak",
            photos: [
              {
                id: "photo-audit-01",
                uri: "https://example.com/photos/audit-scratch.jpg", url: "https://example.com/photos/audit-scratch.jpg",
                photoType: "DEFECT",
                defectId: 5
              }
            ],
            defects: [
              {
                defectId: 5,
                code: "DEF00003",
                nameTh: "สีถลอก",
                severity: "MAJOR",
                disposition: "REWORK",
                photos: [
                  {
                    id: "photo-audit-01",
                    uri: "https://example.com/photos/audit-scratch.jpg", url: "https://example.com/photos/audit-scratch.jpg",
                    photoType: "DEFECT"
                  }
                ]
              }
            ]
          };
        } else {
          answers[item.id] = {
            status: "NORMAL",
            value: "8.0",
            remark: "Pass"
          };
        }
      });

      const submitRes = await fetch(`${BASE_URL}/api/inspections/${claim2Id}/submit`, {
        method: "POST",
        headers: {
          Cookie: otherQcSession.cookie,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          planId: createdPlanId,
          workOrderId: String(createdWoId),
          role: "QC",
          decision: "REWORK",
          answers
        })
      });
      const submitData = await submitRes.json();
      if (submitRes.ok && submitData.status === "done") {
        logStep("QC_SUBMIT_2_DEFECT", "PASS", `Submitted Unit 2 with DEFECT/REWORK successfully! (Outcome: ${submitData.result})`);
      } else {
        logStep("QC_SUBMIT_2_DEFECT", "FAIL", `Submit Unit 2 DEFECT failed: ${JSON.stringify(submitData)}`);
      }
    } catch (err) {
      logStep("QC_SUBMIT_2_DEFECT", "FAIL", err.message);
    }
  }

  // Step 10: Rework Flow - Fetch Rework Details & Submit Fix
  if (claim2Id) {
    try {
      const reworkDetailRes = await fetch(`${BASE_URL}/api/inspections/${claim2Id}/rework`, {
        headers: { Cookie: otherQcSession.cookie }
      });
      const reworkDetailData = await reworkDetailRes.json();
      if (reworkDetailRes.ok && reworkDetailData.inspection) {
        logStep("REWORK_GET", "PASS", `Fetched Rework Details for Unit 2: Serial=${reworkDetailData.inspection.serialPump}, Status=${reworkDetailData.inspection.status}`);
      } else {
        logStep("REWORK_GET", "WARN", `Rework details response: ${reworkDetailRes.status} ${JSON.stringify(reworkDetailData)}`);
      }

      // Submit Rework Fix
      const reworkAnswers = {};
      if (failedItemId) {
        reworkAnswers[failedItemId] = {
          status: "NORMAL",
          remark: "Fixed and repainted",
          fixes: [
            {
              defectId: 5,
              fixMethod: "REPAINT",
              fixNote: "Repainted and cured under UV lamp"
            }
          ]
        };
      }

      const submitReworkRes = await fetch(`${BASE_URL}/api/inspections/${claim2Id}/rework`, {
        method: "POST",
        headers: {
          Cookie: otherQcSession.cookie,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          parentInspectionId: claim2Id,
          answers: reworkAnswers,
          decision: "PASS"
        })
      });
      const submitReworkData = await submitReworkRes.json();
      if (submitReworkRes.ok && submitReworkData.status === "done") {
        logStep("REWORK_SUBMIT", "PASS", `Submitted Rework fix for Unit 2 successfully! (Result: ${submitReworkData.result || "PASS"})`);
      } else {
        logStep("REWORK_SUBMIT", "WARN", `Submit Rework fix response: ${submitReworkRes.status} ${JSON.stringify(submitReworkData)}`);
      }
    } catch (err) {
      logStep("REWORK_FLOW", "FAIL", err.message);
    }
  }

  // Step 11: QC Head Lot Handover to QA
  try {
    const handoverRes = await fetch(`${BASE_URL}/api/plans/${createdPlanId}/submit-to-qa`, {
      method: "POST",
      headers: {
        Cookie: adminSession.cookie,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        notes: "QC inspection completed for all 2 units (1 PASS, 1 Reworked to PASS). Handed over to QA."
      })
    });
    const handoverData = await handoverRes.json();
    if (handoverRes.ok && handoverData.status === "done") {
      logStep("QC_HANDOVER_QA", "PASS", `QC Head submitted lot to QA successfully! Plan transitioned to QA_PENDING`);
    } else {
      logStep("QC_HANDOVER_QA", "WARN", `Handover to QA response: ${handoverRes.status} ${JSON.stringify(handoverData)}`);
    }
  } catch (err) {
    logStep("QC_HANDOVER_QA", "FAIL", err.message);
  }

  // Step 12: QA Inspector Claims & Samples Unit
  let qaClaimId = null;
  try {
    const qaClaimRes = await fetch(`${BASE_URL}/api/inspections/claim`, {
      method: "POST",
      headers: {
        Cookie: qaSession.cookie,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        workOrderId: String(createdWoId),
        planId: createdPlanId,
        serialPump: serial1, // QA samples Unit 1
        role: "QA"
      })
    });
    const qaClaimData = await qaClaimRes.json();
    const inspId = qaClaimData.inspectionId || qaClaimData.inspection?.id;
    if (qaClaimRes.ok && inspId) {
      qaClaimId = inspId;
      logStep("QA_CLAIM", "PASS", `QA Inspector F0001 claimed Unit 1 (${serial1}) -> Inspection ID: ${qaClaimId}`);
    } else {
      logStep("QA_CLAIM", "FAIL", `QA Claim failed: ${JSON.stringify(qaClaimData)}`);
    }
  } catch (err) {
    logStep("QA_CLAIM", "FAIL", err.message);
  }

  // Step 13: QA Inspector Fetches QA Template & Submits QA Decision
  if (qaClaimId) {
    try {
      const qaTplRes = await fetch(`${BASE_URL}/api/inspections/template?planId=${createdPlanId}&role=QA`, {
        headers: { Cookie: qaSession.cookie }
      });
      const qaTplData = await qaTplRes.json();
      const qaItems = qaTplData.items || qaTplData.template?.items || [];
      logStep("QA_TEMPLATE", qaItems.length > 0 ? "PASS" : "WARN", `QA Template: ${qaTplData.template?.name} (${qaItems.length} items)`);

      const qaAnswers = {};
      for (const item of qaItems) {
        qaAnswers[item.id] = {
          status: "NORMAL",
          value: "8.0",
          remark: "QA Audit Sample PASS"
        };
      }

      const qaSubmitRes = await fetch(`${BASE_URL}/api/inspections/${qaClaimId}/submit`, {
        method: "POST",
        headers: {
          Cookie: qaSession.cookie,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          planId: createdPlanId,
          workOrderId: String(createdWoId),
          role: "QA",
          decision: "PASS",
          answers: qaAnswers
        })
      });
      const qaSubmitData = await qaSubmitRes.json();
      if (qaSubmitRes.ok && qaSubmitData.status === "done") {
        logStep("QA_SUBMIT", "PASS", `QA Inspector submitted sample PASS decision successfully!`);
      } else {
        logStep("QA_SUBMIT", "FAIL", `QA submit failed: ${JSON.stringify(qaSubmitData)}`);
      }
    } catch (err) {
      logStep("QA_SUBMIT", "FAIL", err.message);
    }
  }

  // Step 14: Check Final Plan Status
  try {
    const finalPlanRes = await fetch(`${BASE_URL}/api/plans/${createdPlanId}`, {
      headers: { Cookie: adminSession.cookie }
    });
    const finalPlanData = await finalPlanRes.json();
    if (finalPlanRes.ok && finalPlanData.plan) {
      const p = finalPlanData.plan;
      logStep("PLAN_FINAL_STATUS", "PASS", `Plan status: ${p.status}, QC Progress: ${p.qcDoneTotal}/${p.lotCalledTotal}, QA Progress: ${p.qaDoneTotal || 0}`);
    } else {
      logStep("PLAN_FINAL_STATUS", "FAIL", `Failed to get final plan status: ${finalPlanRes.status}`);
    }
  } catch (err) {
    logStep("PLAN_FINAL_STATUS", "FAIL", err.message);
  }

  // =========================================================================
  // PART 2: SECURITY & VULNERABILITY PROBES
  // =========================================================================
  console.log("\n--- [PART 2: SECURITY & VULNERABILITY PROBES] ---");

  // Probe 1: Unauthorized access without session cookie
  try {
    const unauthRes = await fetch(`${BASE_URL}/api/plans/${createdPlanId}`);
    if (unauthRes.status === 401) {
      logSecurity("UNAUTH_GUARD", "SECURE", "HIGH", "Unauthenticated request correctly rejected with 401");
    } else {
      logSecurity("UNAUTH_GUARD", "VULNERABLE", "HIGH", `Unauthenticated request returned ${unauthRes.status}`);
    }
  } catch (err) {
    logSecurity("UNAUTH_GUARD", "ERROR", "HIGH", err.message);
  }

  // Probe 2: Privilege Escalation - QC Inspector accessing Admin endpoint (/api/admin/users)
  try {
    const privEscRes = await fetch(`${BASE_URL}/api/admin/users`, {
      headers: { Cookie: qcSession.cookie }
    });
    if (privEscRes.status === 403) {
      logSecurity("ROLE_ESCALATION_ADMIN", "SECURE", "HIGH", "QC Inspector cannot access /api/admin/users (403 Forbidden)");
    } else {
      logSecurity("ROLE_ESCALATION_ADMIN", "VULNERABLE", "CRITICAL", `QC Inspector got ${privEscRes.status} on /api/admin/users!`);
    }
  } catch (err) {
    logSecurity("ROLE_ESCALATION_ADMIN", "ERROR", "HIGH", err.message);
  }

  // Probe 3: Privilege Escalation - QC Inspector submitting Plan to QA
  try {
    const privEscQaRes = await fetch(`${BASE_URL}/api/plans/${createdPlanId}/submit-to-qa`, {
      method: "POST",
      headers: {
        Cookie: qcSession.cookie,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ notes: "Malicious QC Inspector handover" })
    });
    if (privEscQaRes.status === 403) {
      logSecurity("ROLE_ESCALATION_SUBMIT_QA", "SECURE", "HIGH", "QC Inspector cannot call submit-to-qa (403 Forbidden)");
    } else {
      logSecurity("ROLE_ESCALATION_SUBMIT_QA", "VULNERABLE", "HIGH", `QC Inspector got ${privEscQaRes.status} on submit-to-qa!`);
    }
  } catch (err) {
    logSecurity("ROLE_ESCALATION_SUBMIT_QA", "ERROR", "HIGH", err.message);
  }

  // Probe 4: IDOR - Can Inspector F0003 cancel or submit Inspector F0002's claimed inspection?
  if (claim1Id) {
    try {
      const idorRes = await fetch(`${BASE_URL}/api/inspections/${claim1Id}/cancel`, {
        method: "POST",
        headers: {
          Cookie: otherQcSession.cookie,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ reason: "IDOR malicious cancel attempt" })
      });
      const idorData = await idorRes.json();
      if (idorRes.status === 403 || idorRes.status === 400 || (idorRes.ok && (idorData.status === "error" || idorData.error))) {
        logSecurity("IDOR_CANCEL_CLAIM", "SECURE", "HIGH", `F0003 blocked from cancelling F0002's inspection: "${idorData.message || idorRes.status}"`);
      } else {
        if (idorData.status === "done") { logSecurity("IDOR_CANCEL_CLAIM", "VULNERABLE", "HIGH", `IDOR VULNERABILITY: F0003 succeeded in modifying F0002 claim!`); } else { logSecurity("IDOR_CANCEL_CLAIM", "SECURE", "HIGH", `F0003 blocked from cancelling F0002 inspection: "${idorData.message}"`); }
      }
    } catch (err) {
      logSecurity("IDOR_CANCEL_CLAIM", "ERROR", "HIGH", err.message);
    }
  }

  // Probe 5: Concurrency / Race Condition on Claim (Double Claim of same Serial)
  try {
    const raceSerial = `SN-RACE-${Date.now()}`;
    const [claimA, claimB] = await Promise.all([
      fetch(`${BASE_URL}/api/inspections/claim`, {
        method: "POST",
        headers: { Cookie: qcSession.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ workOrderId: String(createdWoId), planId: createdPlanId, serialPump: raceSerial, role: "QC" })
      }),
      fetch(`${BASE_URL}/api/inspections/claim`, {
        method: "POST",
        headers: { Cookie: otherQcSession.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ workOrderId: String(createdWoId), planId: createdPlanId, serialPump: raceSerial, role: "QC" })
      })
    ]);
    const resA = await claimA.json();
    const resB = await claimB.json();

    const successA = claimA.ok && (resA.inspectionId || resA.inspection?.id);
    const successB = claimB.ok && (resB.inspectionId || resB.inspection?.id);

    if (successA && successB) {
      logSecurity("RACE_DOUBLE_CLAIM", "VULNERABLE", "HIGH", `RACE CONDITION: Both inspectors successfully claimed same serial ${raceSerial}!`);
    } else if (successA || successB) {
      logSecurity("RACE_DOUBLE_CLAIM", "SECURE", "HIGH", `Properly locked: One claim succeeded, other was rejected with error.`);
    } else {
      logSecurity("RACE_DOUBLE_CLAIM", "INFO", "MEDIUM", `Neither claim succeeded (quota reached): A=${resA.message}, B=${resB.message}`);
    }
  } catch (err) {
    logSecurity("RACE_DOUBLE_CLAIM", "ERROR", "HIGH", err.message);
  }

  // Probe 6: Over-Quota Claim Attack (Claiming after remaining quota is 0)
  try {
    const overQuotaSerial = `SN-OVERQUOTA-${Date.now()}`;
    const overQuotaRes = await fetch(`${BASE_URL}/api/inspections/claim`, {
      method: "POST",
      headers: { Cookie: qcSession.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ workOrderId: String(createdWoId), planId: createdPlanId, serialPump: overQuotaSerial, role: "QC" })
    });
    const overQuotaData = await overQuotaRes.json();
    if (overQuotaData.status === "error" || overQuotaRes.status === 400 || overQuotaData.message?.includes("ครบจำนวน") || overQuotaData.message?.includes("โควต้า")) {
      logSecurity("QUOTA_ENFORCEMENT", "SECURE", "MEDIUM", `Over-quota claim correctly rejected: "${overQuotaData.message}"`);
    } else if (overQuotaRes.ok && (overQuotaData.inspectionId || overQuotaData.inspection?.id)) {
      logSecurity("QUOTA_ENFORCEMENT", "VULNERABLE", "HIGH", `QUOTA BYPASS: Inspector claimed unit beyond quota! ID: ${overQuotaData.inspection?.id}`);
    } else {
      logSecurity("QUOTA_ENFORCEMENT", "INFO", "LOW", `Response: ${JSON.stringify(overQuotaData)}`);
    }
  } catch (err) {
    logSecurity("QUOTA_ENFORCEMENT", "ERROR", "MEDIUM", err.message);
  }

  // Probe 7: Replay / Submitting an already COMPLETED Inspection
  if (claim1Id) {
    try {
      const resubmitRes = await fetch(`${BASE_URL}/api/inspections/${claim1Id}/submit`, {
        method: "POST",
        headers: { Cookie: qcSession.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: createdPlanId,
          workOrderId: String(createdWoId),
          role: "QC",
          decision: "REJECT", // Malicious tamper to flip PASS to REJECT
          answers: {}
        })
      });
      const resubmitData = await resubmitRes.json();
      if (resubmitRes.status === 400 || resubmitData.status === "error" || resubmitData.kind === "already_completed") {
        logSecurity("COMPLETED_TAMPER_PROTECTION", "SECURE", "HIGH", `Cannot re-submit completed inspection: "${resubmitData.message || resubmitData.kind}"`);
      } else {
        logSecurity("COMPLETED_TAMPER_PROTECTION", "VULNERABLE", "CRITICAL", `TAMPERING: Completed inspection was overwritten!`);
      }
    } catch (err) {
      logSecurity("COMPLETED_TAMPER_PROTECTION", "ERROR", "HIGH", err.message);
    }
  }

  // =========================================================================
  // PART 3: FUNCTIONAL BUGS & BUSINESS RULE INCONSISTENCIES
  // =========================================================================
  console.log("\n--- [PART 3: INCONSISTENCIES & FUNCTIONAL BUGS] ---");

  // Inconsistency 1: QA Inspector access to QA Queue (Screen S10 / docs/02 FR-NAV-02)
  try {
    const qaQueueRes = await fetch(`${BASE_URL}/api/qa-queue`, {
      headers: { Cookie: qaSession.cookie }
    });
    if (qaQueueRes.status === 200) {
      const qData = await qaQueueRes.json();
      logStep("QA_QUEUE_ACCESS", "PASS", `QA Inspector can access /api/qa-queue (Status: 200, Queue items: ${qData.queue?.length ?? 0})`);
    } else {
      logInconsistency("QA_QUEUE_ACCESS", `QA Inspector received ${qaQueueRes.status} on /api/qa-queue`, "HIGH");
    }
  } catch (err) {
    logInconsistency("QA_QUEUE_ACCESS", err.message, "MEDIUM");
  }

  // Inconsistency 2: Screen S15 Report Viewer & PDF Export (docs/02 FR-RPT-01..08)
  try {
    const reportPageRes = await fetch(`${BASE_URL}/plans/${createdPlanId}/report`, {
      headers: { Cookie: adminSession.cookie }
    });
    const reportApiRes = await fetch(`${BASE_URL}/api/plans/${createdPlanId}/report`, {
      headers: { Cookie: adminSession.cookie }
    });
    const reportsListRes = await fetch(`${BASE_URL}/api/reports`, {
      headers: { Cookie: adminSession.cookie }
    });

    if (reportPageRes.status === 200 && reportApiRes.status === 200 && reportsListRes.status === 200) {
      const repData = await reportApiRes.json();
      logStep("REPORT_EXISTS", "PASS", `Official Report & Reports List fully functional: Plan ${repData.plan?.planNo}, Status: ${repData.plan?.status}, QC pass rate: ${repData.qcSummary?.firstTimePassRate}%`);
    } else {
      logInconsistency("SCREEN_S15_REPORT_MISSING", `Report routes returned unexpected status: Page=${reportPageRes.status}, Api=${reportApiRes.status}, List=${reportsListRes.status}`, "HIGH");
    }
  } catch (err) {
    logInconsistency("SCREEN_S15_REPORT_MISSING", err.message, "HIGH");
  }

  // Inconsistency 3: Work Order Cancellation after units inspected
  try {
    const cancelWoRes = await fetch(`${BASE_URL}/api/plans/${createdPlanId}/work-orders/${createdWoId}/cancel`, {
      method: "POST",
      headers: { Cookie: adminSession.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Testing cancellation of WO with existing completed inspections" })
    });
    const cancelWoData = await cancelWoRes.json();
    if (cancelWoRes.ok && cancelWoData.status === "done") {
      logBug("BUG-WO-CANCEL-ORPHAN", "Work Order Cancelled With Completed Units", "The system permitted cancelling a Work Order that already has completed inspections, which could orphan inspection records or corrupt lot statistics", `WO ID: ${createdWoId}`);
    } else {
      logStep("WO_CANCEL_GUARD", "PASS", `Cancelled WO properly guarded: "${cancelWoData.message}"`);
    }
  } catch (err) {
    logInconsistency("WO_CANCEL_GUARD", err.message, "MEDIUM");
  }

  // Inconsistency 4: Submitting Plan to QA before QC finishes 100%
  try {
    const draftPlanRes = await fetch(`${BASE_URL}/api/plans`, {
      method: "POST",
      headers: { Cookie: adminSession.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        docType: "INVOICE",
        docNo: `INV-PREMATURE-${Date.now().toString().slice(-4)}`,
        vendorId: String(targetModel.vendorId || 1),
        modelId: String(targetModel.id),
        lotQty: "10",
        invoiceDate: new Date().toISOString().slice(0, 10),
        docDate: new Date().toISOString().slice(0, 10),
        receiptDate: new Date().toISOString().slice(0, 10),
        department: "408",
        expectedSkuCount: "1",
        remarks: "Premature QA submit test"
      })
    });
    const draftPlan = await draftPlanRes.json();
    const dPlanId = draftPlan.planId || (draftPlan.redirectTo ? Number(draftPlan.redirectTo.split("opened=")[1]) : null);
    if (dPlanId) {
      const prematureSubmitRes = await fetch(`${BASE_URL}/api/plans/${dPlanId}/submit-to-qa`, {
        method: "POST",
        headers: { Cookie: adminSession.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "Premature QA submit test" })
      });
      const prematureData = await prematureSubmitRes.json();
      if (prematureSubmitRes.ok && prematureData.status === "done") {
        logInconsistency("PREMATURE_QA_SUBMIT", "Plan was transitioned to QA_PENDING even though 0 units were inspected by QC", "HIGH");
      } else {
        logStep("PREMATURE_QA_GUARD", "PASS", `Premature submit to QA properly blocked: "${prematureData.message}"`);
      }
    }
  } catch (err) {
    logInconsistency("PREMATURE_QA_GUARD", err.message, "MEDIUM");
  }

  console.log("\n=====================================================================");
  console.log("🏁 AUDIT & TEST RUN COMPLETED");
  console.log("=====================================================================");
}

main().catch(console.error);
