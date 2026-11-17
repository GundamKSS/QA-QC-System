# QCheck — เอกสารโครงการ (Scope & Spec)

> สถานะ: **Draft v0.4** · วันที่ 16 ต.ค. 2026 (v0.3 Login ระบบกลาง TRW — DEC-09 · v0.4 App shell — DEC-10 · อัปเดต 19 ต.ค. 2026: ยืนยัน Login ระบบกลางจริง 9 บทบาท, เมนู/สิทธิ์หน้าปัจจุบัน และ 150 tests ผ่าน; โมดูลธุรกิจยังไม่เปิดใช้) · ยังไม่ผ่านการยืนยันจากผู้ใช้งาน (QC / QA / จัดซื้อ / PM / Management)
> ที่มา: ถอดความจากการประชุม 2 ครั้ง (ไฟล์ถอดเสียงอัตโนมัติ — มีคำผิดเยอะ) — **Meeting A** (~56 นาที: Master data, ผู้ใช้, AQL, Defect, NCP/เคลม, ค่าแรง, Dashboard) และ **Meeting B** (~2 ชม. 13 นาที: Flow QC/QA, แผน, Checklist, Rework, QA/AQL, Report, NCP, Offline)
> เลขเวลาในเอกสาร เช่น `[B 01:12:06]` = Meeting B นาทีที่ 1:12:06 ใช้ย้อนกลับไปฟัง/ยืนยันได้
> v0.2: ปรับตามการตรวจทานแบบ adversarial 4 มุม (ครอบคลุม Meeting A, ครอบคลุม Meeting B, ความสอดคล้องข้ามเอกสาร, ความเป็นไปได้ทางเทคนิค/แผน)

## QCheck คืออะไร

เว็บแอป (mobile-first, ใช้บน laptop ได้ตามเกณฑ์ Device × Flow) สำหรับ **ตรวจรับคุณภาพปั๊มลม** ทั้งปั๊มนำเข้าจากต่างประเทศ และปั๊มผลิตเองในโรงงาน PUMA (แผนก 408, 409)
แทนที่ Google Sheets + AppSheet + Excel ในปัจจุบัน ครอบคลุม: เปิดแผนตรวจต่อ Invoice/PO → มอบหมายงาน → QC ตรวจ Checklist บนมือถือ (สแกน/ถ่ายรูปสด/เลือก Defect มาตรฐาน, ทำงานออฟไลน์ได้) → Rework → QA สุ่มตรวจตาม AQL จากแผนเดียวกัน → Report QC/QA → NCP ต่อ Invoice ส่งจัดซื้อ → ติดตามเคลม → Dashboard คุณภาพ Vendor / KPI

## สารบัญ

| # | เอกสาร | เนื้อหา |
|---|---|---|
| 1 | [01-scope.md](01-scope.md) | ที่มา ปัญหา เป้าหมาย ผู้ใช้ ขอบเขต In/Out การแบ่ง Phase + ช่วงเปลี่ยนผ่าน สมมติฐาน ข้อจำกัด |
| 2 | [02-spec-functional.md](02-spec-functional.md) | Functional spec รายโมดูล (FR-xxx) สิทธิ์ Flow หน้าจอ Acceptance criteria และ Device × Flow (นิยาม "ใช้บน laptop ได้") |
| 3 | [03-spec-business-rules-data.md](03-spec-business-rules-data.md) | Business rules (BR-01…21) สูตรคำนวณ State machine ตารางจับคู่สถานะ Data model Master data template |
| 4 | [04-spec-technical.md](04-spec-technical.md) | Non-functional, สถาปัตยกรรม, สแกน/กล้อง/วิดีโอ, Offline + ข้อจำกัด iOS, Responsive, แจ้งเตือน, งาน IT, Decision log |
| 5 | [05-work-plan.md](05-work-plan.md) | WBS + ประมาณการ, Timeline 3 ทางเลือก, Sprint plan, Milestone, UAT ชุด A–D, Pilot, Go-live, ความเสี่ยง |
| 6 | [06-open-questions.md](06-open-questions.md) | คำถามที่ต้องยืนยัน (P0/P1/P2) พร้อมค่าตั้งต้นที่ใช้ในสเปก |
| 7 | [07-login-art-direction.md](07-login-art-direction.md) | หน้า Login: Art direction · 3D · Storyboard · Performance tiers — สร้าง Pass 1–5 แล้ว; ขั้นถัดไป Pass 6 |
| 8 | [08-central-auth-plan.md](08-central-auth-plan.md) | แผนย้าย Login + บทบาทไปใช้ระบบกลาง TRW (`role_prog` ของ PRG003): สัญญา API, คำถาม G1–G8, ผลต่อ spec, สถานะโค้ดและการตรวจด้วย API จำลอง |
| 9 | [09-app-shell.md](09-app-shell.md) | โครงแอปหลัง login บนมือถือ: bottom tab bar 4 แท็บ, เมื่อซ่อนแท็บ, sidebar บน laptop — **มีโครงแอปและ Home ข้อมูลตัวอย่างแล้ว**; โมดูลธุรกิจจริงยังไม่เปิดใช้ |
| 10 | [10-pass7-shared-device-plan.md](10-pass7-shared-device-plan.md) | Pass 7: หมดเวลาไม่ใช้งานบนเครื่องส่วนกลาง — (PIN กลับมาแล้ว — ดู 12; หน้าตั้งรหัสใหม่ยังตัดตาม DEC-09); logic พร้อมแล้ว, checklist ทดสอบมือถือจริง |
| 11 | [11-meeting-slides-delta.md](11-meeting-slides-delta.md) | เทียบสไลด์ประชุม IT 22 แผ่นกับสเปก: สิ่งที่ตรงแล้ว ข้อมูลใหม่ (สถานะ HOLD, Claim Package, KPI/Vendor Grade) และจุดที่ขัด (คำถามกลุ่ม H) |
| 12 | [12-field-users-pin-plan.md](12-field-users-pin-plan.md) | ผู้ใช้หน้างาน (ไม่มีบัญชีระบบกลาง) + PIN — **DEC-12 กลับ DEC-11**: Admin สร้างผู้ใช้ LOCAL, ความเสี่ยง R1–R6, ลำดับงาน ~6–7 pd, คำถาม I1–I6 — **แผน ยังไม่เขียนโค้ด** |
| 13 | [13-meeting-c-workorder-delta.md](13-meeting-c-workorder-delta.md) | ประชุม 20 ต.ค.: ใบงาน = การเรียกของเข้าแต่ละครั้ง (เลขแผน-ครั้งที่), Need ต่อใบงาน, ประเภท QC/เรียกเข้าแก้ไข, ≥2 ผู้รับผิดชอบ, ไม่ต้องกดรับ — คำถามกลุ่ม J |
| 14 | [14-open-plan-storyboard.md](14-open-plan-storyboard.md) | Storyboard หน้าเปิดแผน `/plans/new` (WBS 1.6 ขั้น 5): โครงมือถือ/laptop, ลำดับเหตุการณ์, ไฟล์ที่จะสร้าง, K1–K8 ตามค่าตั้งต้น — **สร้างแล้ว 20 ต.ค.** (ยังไม่ทดสอบกับ SQL Server จริง) |
| 15 | [15-plan-list-detail-storyboard.md](15-plan-list-detail-storyboard.md) | Storyboard รายการแผน `/plans` + รายละเอียด `/plans/[id]` (WBS 1.6 ขั้น 6): ตาราง/การ์ด, แท็บ, ยกเลิก/รอของ, P1–P5 ตามค่าตั้งต้น — **สร้างแล้ว 20 ต.ค.** (ยังไม่ทดสอบกับ SQL Server จริง) |
| 16 | [16-work-order-storyboard.md](16-work-order-storyboard.md) | Storyboard ใบงาน + มอบหมาย QC (WBS 1.6 ขั้น 7): เปิดใบงานต่อการเรียกเข้า, Need/ประเภทอัตโนมัติ, ผู้ตรวจ 2–5 คน, แท็บใบงาน, งานของฉัน `/jobs`, W1–W12 — **สร้างแล้ว 20 ต.ค.** (ยังไม่ทดสอบกับ SQL Server จริง) |
| 18 | [18-history-tab-storyboard.md](18-history-tab-storyboard.md) | Storyboard แท็บ "ประวัติ" `/history` แทนแท็บแจ้งเตือนล่าง, H1–H3 — **สร้างแล้ว 21 ต.ค.** |
| 17 | [17-meeting-d-open-workorder-delta.md](17-meeting-d-open-workorder-delta.md) | ประชุม 21 ต.ค.: Need = เป้า 10% ของล็อต − True สะสม, จำนวนเรียก ≥ Need, True นับ Serial ไม่ซ้ำ, 1 ใบงาน/แผน/วัน, สถานะ "ไม่สำเร็จ" — **ใช้แทนสูตร Meeting C (K1 ยืนยัน 21 ต.ค.)**; สเปก 02/03 และโค้ดใบงานปรับแล้ว (db/011 ยังต้องรันบนเซิร์ฟเวอร์จริง) |
| 19 | [19-api-routes-plan.md](19-api-routes-plan.md) | แผนย้ายการเขียนข้อมูลจาก Server Actions เป็น API routes `app/api/<ฟีเจอร์>/...` ตามแบบโปรเจกต์ log-book: ตัวช่วยกลาง `lib/api/`, สัญญา API, แผนที่ 19 endpoints, ลำดับ 8 ขั้น — **ครบทุกขั้น 0–7 แล้ว (26 ต.ค.)** — ดูสรุปผลและสิ่งที่ยังไม่ได้ตรวจกับของจริงใน §8 · **§9 ย้ายหน้าเดิมไปอ่านผ่าน `GET /api` ทีละหน้า (ครบ 10/10: `/jobs`, `/history`, `/master`, `/plans`, `/home`, `/admin/users`, `/master/[table]`, `/plans/new`, `/plans/[id]/work-orders/new`, `/plans/[id]`)** หน้าถัดไปรอ confirm |
| — | [login-progress.md](login-progress.md) | สถานะล่าสุด (231 tests; PIN หน้างาน; สคีมา DB `db/001–007` ยังไม่ได้รันจริง): username backdrop, Login กลาง/Home, สิทธิ์หน้า/เมนู, บัญชีระบบกลางจริง 9 บทบาท, 150 tests/Chrome และ Pass 5 เสร็จ |

## ประเด็นที่ต้องตัดสินใจก่อน (จาก 06)

1. **T1** — นำ QA แกนหลักเข้ามาใน Phase 1 (แนะนำ) เพราะ QC/QA ใช้แผนเดียวกันและคนชุดเดียวกัน
2. **T2** — ทางเลือก Timeline: 2 นักพัฒนา (Go-live Phase 1 ~พ.ค. 2027, แนะนำ) / 1 คนขอบเขตเต็ม (~ก.ย. 2027) / 1 คนเร่ง (~ก.ค. 2027)
3. **E11** — Product owner คนเดียว · **A16** — แบรนด์ PUMA นำเข้าจาก OEM ด้วยหรือไม่ · **D11** — มีขั้น PM ใน NCP หรือไม่
4. **G1–G5** — สัญญา API ระบบกลาง TRW (login + `role_prog` ของ PRG003) และ server ต้องเข้าถึงระบบกลางได้ — ผูกกับ DEC-01 Hosting (ดู [08](08-central-auth-plan.md))

## ไม่อยู่ในเอกสารชุดนี้ (ตามที่ตกลง)

- **Theme / UI visual design** (สี ฟอนต์ โลโก้ สไตล์) — เริ่มคุยแล้วที่หน้า Login ([07](07-login-art-direction.md): ไทเทเนียม/ดำ/ส้ม) ส่วนหน้าทำงานใช้ design tokens (04 §6) และโครงมือถือตาม [09](09-app-shell.md) มีงาน "ใส่ธีม" ก่อน Go-live ใน WBS

## วิธีใช้เอกสารนี้

1. อ่าน `01-scope.md` เพื่อเห็นภาพรวม ขอบเขต และ Phase
2. นัด workshop ยืนยัน `06-open-questions.md` (กลุ่ม T และ P0 ก่อน)
3. เมื่อยืนยันแล้ว อัปเดตเป็น v1.0 และใช้ `05-work-plan.md` เป็นแผนตั้งต้น — ประเมิน timeline ใหม่หลัง Sprint 2
