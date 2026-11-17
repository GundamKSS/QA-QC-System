# 11 — สไลด์ประชุม IT (QC_Application_Workflow_IT_Meeting.pptx) เทียบกับสเปก

> 19 ต.ค. 2026 · ที่มา: สไลด์ 22 แผ่นที่ผู้ใช้เข้าประชุมด้วย ([QC_Application_Workflow_IT_Meeting.pptx](QC_Application_Workflow_IT_Meeting.pptx)) — แผ่น 11, 14, 15, 16 เป็นรูป Dashboard / Claim Flow / KPI ที่ตัวอย่างเป็นข้อมูลจำลอง
> สไลด์นี้เป็น **ข้อเสนอที่นำเสนอต่อ IT** (เขียนเป็น "สิ่งที่ IT ต้องรองรับ") ไม่ใช่ข้อสรุปของ QA — จึงแยกเป็น: ✅ ตรงกับสเปกแล้ว · 🆕 ข้อมูลใหม่ที่ควรรับเข้าสเปก · ⚠️ ขัดหรือต่างจากสเปก ต้องตัดสิน
> คำถามใหม่อยู่ที่ [06-open-questions.md](06-open-questions.md) กลุ่ม H

## 1. ตอบคำถามที่ค้างอยู่ได้เลย

| คำถามเดิม | คำตอบจากสไลด์ | สถานะ |
|---|---|---|
| A5: Checklist ชนิดที่ 6 คืออะไร (ได้ยิน "เอ็นจี") | **FG** (Finished Goods) — สไลด์ 7 มี 6 ชนิด: Piston, Oil-free, Rotary, แผนก 408, แผนก 409, **FG** (ป้ายซ้ำเป็น "Checklist 5" ทั้ง 409 และ FG ต้องยืนยันว่า FG เป็นชนิดแยก) | ใช้ตามนี้ รอ QA ยืนยัน |
| E4/G: Login | ระบุ "Account บริษัท / SSO / Permission" เป็นประเด็นกับ IT | ตรงกับ DEC-09 (ระบบกลาง TRW) |
| ปัญหาข้อมูลซ้ำ | หลักการ "กรอกข้อมูลครั้งเดียว → ใช้ได้ตลอดทั้งกระบวนการ" และ Invoice/Vendor/Brand/Model ดึงจากแผน ห้าม QC กรอกซ้ำใน Checklist | ✅ ตรงกับ FR-QC-03 |

## 2. ✅ ตรงกับสเปกแล้ว (ไม่ต้องแก้)

- ลำดับ Plan → Assign → Checklist → Pass/Concession → QA → Report; Defect → Reject/Rework; ผลเครื่อง Pass / Concession / Failed และ QC เลือก Rework/Reject (BR-04) · QA เจอ Defect = Reject เท่านั้น (สไลด์ 12)
- กันแผนซ้ำด้วย Description/Model + Invoice (BR-01) · เลือก Checklist อัตโนมัติจากประเภทปั๊ม · QA แก้ Checklist/Defect Master เองได้โดยไม่ต้องรอ IT
- QC 100% แต่บันทึกลงแอปแค่ 10% (สไลด์ 3) = BR-02 · Rework เก็บรูป Before/After + วิธีแก้ · Defect เลือกจาก Master ไม่ให้พิมพ์เอง · FAIL ต้องมีรูป · Audit trail
- Search ด้วย Plan No., Invoice/PO, Serial, Model, Supplier, Claim No., Defect, Status · Export PDF/Excel · Master แยกจาก Transaction
- Dashboard: Top Defect, Vendor Defect Rate, Claim, Trend; Overseas Purchasing ใช้ Defect เพื่อ Claim + อัปเดตสถานะ

## 3. 🆕 ข้อมูลใหม่ที่ควรรับเข้าสเปก

### 3.1 สถานะแผน (สไลด์ 17) — เพิ่มสถานะ **HOLD** และเส้นทางหลัง QA
`PLAN CREATED → WAITING FOR INSPECTION → IN PROGRESS → INSPECTION COMPLETED → WAITING QA REVIEW → (5 เส้นทาง) ACCEPTED | REWORK | HOLD | CLAIM | REJECTED → CLOSED`
- สเปกมี 5 เส้นทางนี้ในรูปอื่น (Pass/Rework/Reject/NCP) แต่ **ไม่มี HOLD** (พักล็อตไว้รอตัดสินใจ) และไม่มีสถานะ **ACCEPTED/CLOSED ที่แยกชัด** → ต้องจับคู่กับ state machine 03 §2.1 (ดู H1)

### 3.2 สถานะและประเภท Claim (สไลด์ 13)
- สถานะ: `Draft → Waiting Purchasing → Sent Supplier → Supplier Reviewing → Accepted/Rejected → Compensation/Replacement Pending → Closed` (ในรูปเพิ่ม *Replacement Received*) — ละเอียดกว่า Pending/On Process/Accept/Reject ของ Phase 2 ในสเปก
- ประเภท: Replacement Part/Product · **Credit Note** · Rework/Labor Cost · **Transportation Cost** · Other Compensation (สเปกมี เงิน/สินค้า/อะไหล่/ส่วนลด/ส่งคืน/อื่นๆ — ขาด Rework/Labor, Transportation)
- ข้อมูลที่ส่งต่อ: Supplier / Invoice / PO / Model / Qty / Defect / **Defect Qty / Defect Rate** / Photo / Inspection Result
- **Claim Package 7 ไฟล์** ที่ส่งจัดซื้อ: (1) Claim Summary (PDF) (2) รายงาน QC ก่อน Rework (PDF) (3) รายงาน QA ก่อน Rework (PDF) (4) รูปภาพ Defect (5) รายละเอียด Invoice/PO (Excel) (6) จำนวนที่พบ/Defect Rate (Excel) (7) Claim List (Excel) — ตรงกับสเปกที่ให้ Report ใช้ผลรอบแรก (BR-14) แต่ **ต้องการแพ็กเป็นชุดและมี Excel** (สเปกบอกส่งอีเมลสรุป+ลิงก์ ไม่แนบไฟล์)
- แต่ละสถานะมีวันที่กำกับ (Claim Status Tracking) → เก็บ timestamp ต่อสถานะ

### 3.3 ตัวอย่างรายงาน QC/QA (สไลด์ 14)
หัวรายงานมี: เลขเอกสาร (ตัวอย่าง `NCP690910`, `QA690910`), วันที่ตรวจ, Invoice No., Item No. (เช่น `FG1004-000515`), ชื่อสินค้า, จำนวนตามใบ/จำนวนที่ตรวจจริง, Brand, Vendor, วันที่รับ, **Pass % / Concession % / Not Pass %**, ตารางปัญหา (จำนวน, อัตราเกิด, **Severity Level**, วิธีแก้, ค่าแนะนำ) และรูปพร้อมวงแดงกับคำบรรยาย (เช่น "สายหรือท่อลมรั่วซึม 8 ตัว") · แยกรายงาน QC กับ QA และเก็บ "รูปเพิ่มเติมจาก QA"
- ข้อสังเกต: ตัวอย่างเลขเอกสารอ่านเป็น **คำนำหน้า + ปี พ.ศ. 2 หลัก + เดือน + วัน** (69/09/10) และวันที่ในรูปทั้งหมดเป็น พ.ศ. — เป็นเพียงข้อมูลจำลอง แต่ควรถามจริงใน D6/D15

### 3.4 ข้อมูลระบุเครื่อง (สไลด์ 8)
สเปกมี Serial ปั๊ม + มอเตอร์; สไลด์เพิ่ม **Inspection No.**, **Supplier Serial Number**, **Motor Brand / HP / Voltage**, ผู้ตรวจ, วันเวลาตรวจ → เพิ่มฟิลด์ใน `unit_inspections` (ดู H3)

### 3.5 Plan / Job List (สไลด์ 5–6)
- เลขแผนตัวอย่าง `QC-2610-001` (QC-YYMM-NNN) ต่างจากที่เสนอ `QP-YYMM-NNNN` → ตัดสินใน D15
- ฟอร์มแผนมี **Sampling Level / Qty QC** (ตรงกับ AQL) · สถานะแรก PLAN CREATED → WAITING FOR INSPECTION เมื่อ Assign
- Assign มี **Due Date** (ไม่บังคับ) · Job List แสดง Qty QC / Done / Balance และ **Qty QA / Done / Balance** ในแถวเดียว (ตรงกับ FR-JOB-04 แต่เพิ่มคอลัมน์ QA)
- บทบาท **คลังสินค้า**: กรอก `QC_Demand Planning` และแจ้งทางอีเมล — ตรงกับ "ตารางดีมานด์" ที่เราตั้งเป็นนอกขอบเขต (ดู H6)

### 3.6 Rework Job (สไลด์ 10)
Rework Job ดึง Plan/Invoice/Model/Serial/Defect/Picture Before/Qty/ผู้รับผิดชอบ/Due Date · **Re-inspection ไม่ผ่าน → ส่งกลับ Rework หรือ Escalate ให้ QA ตัดสิน** (เก็บประวัติทุกครั้ง) · ลำดับปิด: แนบ Picture After → Re-inspection → ใส่วิธีแก้ → Close Rework → **QA approve**

### 3.7 Dashboard / KPI (สไลด์ 11, 15, 16, 18)
- เมนูแอปตัวอย่าง: หน้าหลัก Dashboard · แผนการตรวจ · ตรวจสินค้า · ผลการตรวจ · งาน Rework · งานเคลม · รายงาน · ตั้งค่า (Master Data) — เทียบกับเมนู 4 แท็บ/sidebar ใน [09-app-shell.md](09-app-shell.md)
- ตัวกรองบนสุด: ช่วงวันที่ + Brand + Model + Vendor · การ์ด: รวมแผน, จำนวนต้องตรวจ, ตรวจครบแล้ว, ยังไม่ครบ, PASS, Defect · Auto Summary เฉพาะแผนที่ตรวจครบ · ตารางแผนที่ยังไม่ครบ · Top 5 อาการ
- **หมวด Defect**: Leakage, Assembly Issue, Performance, Cosmetic, **Electrical**
- **สูตร KPI พร้อมเป้า**: Inspection Completion ≥ 95% · Defect Rate ≤ 15% · Rework Closure On Time ≥ 90% · Claim Submission On Time ≥ 95% · Claim Closure Rate ≥ 80%
- **KPI รายบุคคล (QC) แบบถ่วงน้ำหนัก**: ตรวจครบตามแผน 25% (≥95%) · เสร็จตามเวลา/SLA 25% (≥95%) · ความครบถ้วนของ Checklist 20% (≥98%) · รูป/ข้อมูล Defect ครบถ้วน 20% (100%) · งานค้างเกินกำหนด 10% (≤5%) → คะแนนรวม (ตัวอย่าง 96.2)
- **KPI ทีม QA/QC**: Defect Rate ≤15% · **Repeat Defect Rate ≤5%** · Rework Closure On Time ≥90% · **First Rework Pass Rate ≥90%** · Claim Submission On Time ≥95% · Claim Closure Rate ≥80% · Supplier Defect Rate ≤10%
- **Vendor Grade**: A ≤5% (ดี) · B 5.1–10% (พอใช้) · C 10.1–15% (ต้องปรับปรุง) · D >15% (ไม่ผ่าน) — Dashboard Vendor ในสเปกยังไม่มีเกรด
- ตัวอย่างเป็นข้อมูลจำลอง (เช่น 120 แผน, 480 ชิ้น) ไม่ใช่ตัวเลขจริง

### 3.8 ประเด็นกับ IT (สไลด์ 21)
Platform (Web/Responsive) · Login · Database/Backup · Photo Storage (จำกัดพื้นที่?) · Offline · Report PDF/Excel + Template · Dashboard Real-time หรือรอบ · Master แก้เองได้ · Notification (Email/LINE/In-App) · Integration Warehouse/ERP ในอนาคต · Audit trail · Performance (ผู้ใช้พร้อมกัน/จำนวนรูป) — **ครอบคลุมใน 04 แล้วทั้งหมด**; ที่ยังไม่มีคำตอบจาก IT คือ Database/Backup, ที่เก็บรูป, Offline และ Real-time vs Refresh (ผูกกับ DEC-01/03/08)

## 4. ⚠️ ขัดหรือต่างจากสเปก ต้องตัดสิน

| # | ประเด็น | สไลด์ | สเปก v0.4 | ข้อเสนอ |
|---|---|---|---|---|
| H1 | **การแบ่ง Phase** | Phase 1 = Core QC (Plan, Assign, Checklist, Serial, Defect+Photo, **QA Review**, Basic Report) · Phase 2 = **Rework**, Re-inspection, Claim, Notification, Search, **Audit** · Phase 3 = Dashboard/Analytics | R1.0 มี Rework + Audit; Claim/NCP = Phase 2; Dashboard = Phase 3 | Rework/Audit อยู่ R1.0 เพราะเป็นแกนของ Checklist (Fail → Rework) และหัวหน้า QA ขอ — **ควรแจ้ง IT/ผู้บริหารว่าเราเลื่อน Rework และ Audit เข้ามาก่อน** เพราะสไลด์ที่นำเสนอบอกเป็น Phase 2 และ QA Review อยู่ Phase 1 ซึ่งตรงกับ T1 ของเรา |
| H2 | **Rework ต้อง QA approve ก่อนปิด?** | ลำดับ: Close Rework → QA approve | ปิด Rework เมื่อ QC ประเมินซ้ำผ่าน; QA เข้าเกี่ยวเฉพาะเมื่อสุ่มตรวจ | ถามว่า QA ต้องอนุมัติ **ทุกใบ Rework** หรือเฉพาะ Re-inspection ไม่ผ่าน (Escalate) |
| H3 | **Re-inspection ไม่ผ่านรอบที่ 2+** | "ส่งกลับ Rework หรือ Escalate ให้ QA ตัดสิน" | วนรอบ Rework หรือ Reject | เพิ่มทางเลือก Escalate (QA ตัดสิน: Rework ต่อ / Reject / HOLD) |
| H4 | **HOLD** | เป็น 1 ใน 5 เส้นทางหลัง QA | ไม่มี | เพิ่มสถานะ HOLD (พักล็อต) — ใช้เมื่อใด ใครปลด |
| H5 | **สถานะ/ประเภทเคลม** | ละเอียดกว่า (3.2) | Pending/On Process/Accept/Reject (P2) + สถานะเต็ม (P3) | ปรับ Phase 3 ให้ใช้ชุดสถานะของสไลด์ + เพิ่มประเภท Rework/Labor, Transportation, Credit Note |
| H6 | **บทบาทคลังสินค้า / QC_Demand Planning** | คลังกรอกข้อมูลแผนความต้องการและแจ้งอีเมล | ตารางดีมานด์ = นอกขอบเขต (QC Head หยอดเอง) | ถามว่า "QC_Demand Planning" เป็นไฟล์/ระบบที่มีอยู่ ให้ import ได้ไหม (A12) — และคลังต้องมีบัญชีใน QCheck หรือไม่ |
| H7 | **KPI/เกรด Vendor** | มีสูตรและเป้า (3.7) | เป็น P2 ยังไม่กำหนด (E6/E7) | รับสูตรสไลด์เป็นค่าตั้งต้นใน FR-DSH-03/05 และตั้งให้แก้ค่าเป้า/ถ่วงน้ำหนักได้ |
| H8 | **หมวด Defect** | Leakage, Assembly, Performance, Cosmetic, Electrical | `category` ยังไม่กำหนดค่า | ใช้ 5 ค่านี้เป็นค่าตั้งต้นของ Defect Category |

## 5. การแก้ในเอกสาร (ทำแล้ว 19 ต.ค.)

1. **03 §2.1/§2.6**: เพิ่ม HOLD + จับคู่ชื่อสถานะกับสไลด์ 17; เพิ่ม Escalate ใน Rework (H3)
2. **03 §3.1**: `unit_inspections` เพิ่ม `inspection_no`, `serial_supplier`, `motor_brand`, `motor_hp`, `motor_voltage`; `defects.category` ค่าตั้งต้น 5 ค่า; `ncps.claim_type` เพิ่ม `LABOR`, `TRANSPORT`, `CREDIT_NOTE`
3. **02 M09/M11**: ปรับสถานะเคลมและ Claim Package (7 ไฟล์) ใน Phase 3; เพิ่ม KPI/Vendor Grade ตามสไลด์ใน FR-DSH-03/05; เพิ่มคอลัมน์ Qty QA ใน Job List
4. **05**: เพิ่มหมายเหตุเรื่อง H1 ในการสื่อสารกับ IT/ผู้บริหาร
