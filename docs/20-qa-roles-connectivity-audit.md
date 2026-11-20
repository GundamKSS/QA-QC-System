# รายงานการตรวจสอบและแก้ไขความเชื่อมโยง 7 บทบาทผู้ใช้ (QA Roles & Workflows Audit & Fixes)

> **ผู้รายงาน:** คิว (Q) — Lead QA Automation & UX Experience Tester  
> **รายงานถึง:** บอสกันดั้ม (Boss Gundam)  
> **โปรเจกต์:** QCheck (TRW × PUMA Quality Inspection App)  
> **สถานะงาน:** ✅ ตรวจสอบระบบ, แก้ไขข้อบกพร่อง, เพิ่มชุดทดสอบอัตโนมัติ และผ่านการทดสอบครบ 100%  
> **เวอร์ชันระบบ:** Next.js 16.4.6 / React 19 / SQL Server  

---

## 1. ผลการดำเนินงานตามคำสั่งบอสกันดั้ม (Executive Summary)

คิว (Q) ได้ดำเนินการสวมบทบาทไล่ตรวจสอบและแก้ไขความเชื่อมโยงของระบบทั้ง 7 บัญชีตัวอย่างเรียบร้อยแล้ว:

### 1.1 บัญชีทดสอบทั้ง 7 บทบาท (Password: `123456`)
| ลำดับ | Username | รหัสผ่าน | บทบาทในระบบ (Roles) | ชื่อ-นามสกุลที่แสดงผล | ผลการทดสอบล็อกอิน (`/login`) |
|---|---|---|---|---|:---:|
| 1 | `DEMO_QC01` | `123456` | `QC_INSPECTOR` | เดโม ผู้ตรวจ QC | ✅ **200 Success** |
| 2 | `DEMO_QCHEAD` | `123456` | `QC_HEAD` | เดโม หัวหน้า QC | ✅ **200 Success** |
| 3 | `DEMO_QA01` | `123456` | `QA_INSPECTOR` | เดโม ผู้ตรวจ QA | ✅ **200 Success** |
| 4 | `DEMO_QAHEAD` | `123456` | `QA_HEAD` | เดโม หัวหน้า QA | ✅ **200 Success** |
| 5 | `DEMO_MADMIN` | `123456` | `MASTER_ADMIN` | เดโม ผู้ดูแลข้อมูลหลัก | ✅ **200 Success** |
| 6 | `DEMO_ADMIN` | `123456` | `ADMIN` | เดโม ผู้ดูแลระบบ | ✅ **200 Success** |
| 7 | `DEMO_SUPER` | `123456` | `ADMIN`, `MASTER_ADMIN`, `QA_HEAD`, `QC_HEAD` | เดโม ซูเปอร์แอดมิน | ✅ **200 Success** |

---

## 2. รายการแก้ไขจุดบกพร่องและเชื่อมโยงระบบ (Implemented Fixes)

### ✅ จุดที่ 1: ป้องกันปัญหาหน้า 404 บนแท็บ "เช็กลิสต์" ของ Mobile
- **เดิม:** ใน `nav.ts` มีการสร้างแท็บ `/checklists` บนมือถือ ซึ่งในระบบไม่มีหน้านี้อยู่จริง (หน้ารายการเทมเพลตจริงอยู่ที่ `/master/checklist-templates`)
- **การแก้ไข:** ใน `components/shell/ShellLink.tsx` และ `components/shell/nav.ts` ลิงก์ที่ยังไม่พร้อมใช้งานจะถูกเรนเดอร์เป็น `aria-disabled="true"` พร้อมป้ายกำกับ "ยังไม่เปิดใช้งาน" อย่างถูกต้อง ป้องกันไม่ให้ผู้ใช้กดแล้วหลุดไปหน้า 404

### ✅ จุดที่ 2: แก้ไขปุ่ม Quick Action บนหน้า Home ของผู้ตรวจ QA (`DEMO_QA01`)
- **เดิม:** ปุ่มด่วนสีส้มบนหน้า `/home` แสดงคำว่า "งานของฉัน" และชี้ไปที่ `/jobs` ซึ่งเป็นใบงานของฝ่าย QC
- **การแก้ไข:** ใน [app/(app)/home/page.tsx](file:///Users/gundam/MyProject/TRW%20Dev/QCheck/app/(app)/home/page.tsx#L86-L94) ตรวจสอบหากผู้ใช้เป็น `QA_INSPECTOR` ปุ่มจะเปลี่ยนเป็น **"คิวสุ่มตรวจ QA"** และลิงก์ไปที่ `/qa-queue` ทันที

### ✅ จุดที่ 3: เพิ่มเมนู "รายงานผลการตรวจ" และ "คิวสุ่มตรวจ QA" ในหน้า `/more` บนมือถือ
- **เดิม:** หน้า `เพิ่มเติม` (`/more`) บนโทรศัพท์มือถือไม่มีลิงก์ไปหน้า `/reports` และ `/qa-queue` ทำให้พนักงานหน้างานที่ใช้สมาร์ตโฟนไม่สามารถเปิดดูรายงานหรือคิวงาน QA จากเมนูได้
- **การแก้ไข:** ใน [app/(app)/more/page.tsx](file:///Users/gundam/MyProject/TRW%20Dev/QCheck/app/(app)/more/page.tsx#L12-L21) เพิ่ม `{ label: "คิวสุ่มตรวจ QA", href: "/qa-queue", page: "qa-queue" }` และ `{ label: "รายงานผลการตรวจ", href: "/reports", page: "reports" }` ครบถ้วนตามสิทธิ์จริง

### ✅ จุดที่ 4: แก้ปัญหาปุ่ม "ดูรายละเอียดแผน" ในหน้ารายงานโยน Inspector ตกหน้าจอ
- **เดิม:** หน้ารายงาน `/plans/[id]/report` มีปุ่ม "ดูรายละเอียดแผน →" (`/plans/${plan.id}`) ซึ่งผู้ตรวจ (`QC_INSPECTOR`, `QA_INSPECTOR`) ไม่มีสิทธิ์เข้าดูหน้าแผนงานหลัก เมื่อกดแล้วจะถูกระบบดีดกลับหน้าแรก
- **การแก้ไข:** ใน [components/reports/InspectionReportView.tsx](file:///Users/gundam/MyProject/TRW%20Dev/QCheck/components/reports/InspectionReportView.tsx#L102-L113) และ [app/(app)/plans/[id]/report/page.tsx](file:///Users/gundam/MyProject/TRW%20Dev/QCheck/app/(app)/plans/[id]/report/page.tsx#L23-L33) เพิ่มการตรวจสอบ `canViewPlan` หากผู้ตรวจไม่มีสิทธิ์ดูแผน จะซ่อนปุ่มนี้อัตโนมัติ เหลือเฉพาะปุ่ม "กลับไปรายการรายงาน" ทำให้ UX ราบรื่น ไม่สะดุด

### ✅ จุดที่ 5: แก้ไขป้ายกำกับบทบาทใน Dev Persona Switcher
- **เดิม:** ใน `app/api/dev/impersonate/route.ts` โค้ดตรวจสอบแค่ Admin และ QC Head ส่วนผู้ตรวจ QA, หัวหน้า QA และ Master Admin ถูกแสดงชื่อตำแหน่งผิดกลายเป็น "ผู้ตรวจ QC (Inspector)"
- **การแก้ไข:** ใน [app/api/dev/impersonate/route.ts](file:///Users/gundam/MyProject/TRW%20Dev/QCheck/app/api/dev/impersonate/route.ts#L47-L65) ปรับปรุงการตรวจสอบบทบาทครบทุกสิทธิ์:
  - `DEMO_SUPER` -> **ซูเปอร์แอดมิน (Super Admin)**
  - `DEMO_ADMIN` -> **ผู้ดูแลระบบ (Admin)**
  - `DEMO_MADMIN` -> **ผู้ดูแลข้อมูลหลัก (Master Admin)**
  - `DEMO_QCHEAD` -> **หัวหน้า QC (QC Head)**
  - `DEMO_QAHEAD` -> **หัวหน้า QA (QA Head)**
  - `DEMO_QC01` -> **ผู้ตรวจ QC (Inspector)**
  - `DEMO_QA01` -> **ผู้ตรวจ QA (Inspector)**

### ✅ จุดที่ 6: รองรับการล็อกอินออฟไลน์สำหรับบัญชี `DEMO_*` ด้วยรหัส `123456`
- **เดิม:** เมื่ออยู่นอกวง LAN ของออฟฟิศ TRW เซิร์ฟเวอร์ Datacenter กลาง (`192.168.0.248:8000`) จะไม่ตอบสนอง ทำให้หน้า `/login` ค้าง 5 วินาทีแล้ว Error 503
- **การแก้ไข:** ใน [lib/auth/authenticate.ts](file:///Users/gundam/MyProject/TRW%20Dev/QCheck/lib/auth/authenticate.ts#L90-L125) เพิ่ม Local Development Fallback หาก `QCHECK_ALLOW_DEV_ROLE=on` และ Datacenter ออฟไลน์ หากผู้ใช้ล็อกอินด้วย `DEMO_*` และรหัส `123456` ระบบจะตรวจสอบกับข้อมูลผู้ใช้ในตาราง `dbo.users` และเข้าสู่ระบบได้ทันที 100%

### ✅ จุดที่ 7: แยก Dashboard หน้า Home ของ `DEMO_QA01` ให้ดึงงาน QA และเคลมเป็นฝั่ง QA
- **เดิม:** `<InspectorHomeDashboard />` ดึงใบงาน QC และ hardcode ลิงก์เป็น `/jobs` รวมถึงไม่ได้ส่ง `role: "QA"` เข้า `<StartInspectionModal />`
- **การแก้ไข:** อัปเดต [lib/inspections/inspector-dashboard.ts](file:///Users/gundam/MyProject/TRW%20Dev/QCheck/lib/inspections/inspector-dashboard.ts) และ [components/home/InspectorHomeDashboard.tsx](file:///Users/gundam/MyProject/TRW%20Dev/QCheck/components/home/InspectorHomeDashboard.tsx) ให้ส่ง `side: "QA"`, `jobsHref: "/qa-queue"` และ `role: "QA"` พร้อมเพิ่มเทสต์ใน [tests/api-home-inspector.test.ts](file:///Users/gundam/MyProject/TRW%20Dev/QCheck/tests/api-home-inspector.test.ts)

### ✅ จุดที่ 8: เชื่อมระบบสแกน (`/scan`) ของผู้ตรวจ QA และหัวหน้า QA เข้ากับใบงาน QA
- **เดิม:** `lookupScan` และ `<ScanView />` ไม่ได้ส่ง `side: "QA"` และไม่ได้ส่ง `role: "QA"` ตอนเปิด modal เริ่มตรวจ
- **การแก้ไข:** อัปเดต [lib/scan/service.ts](file:///Users/gundam/MyProject/TRW%20Dev/QCheck/lib/scan/service.ts), [app/(app)/scan/page.tsx](file:///Users/gundam/MyProject/TRW%20Dev/QCheck/app/(app)/scan/page.tsx) และ [components/scan/ScanView.tsx](file:///Users/gundam/MyProject/TRW%20Dev/QCheck/components/scan/ScanView.tsx) ให้กรองใบงานตามฝั่ง QC/QA, รองรับ fallback สำหรับ `QA_HEAD`, และเคลม `role: "QA"` ถูกต้อง พร้อมเพิ่มเทสต์ใน [tests/scan-service.test.ts](file:///Users/gundam/MyProject/TRW%20Dev/QCheck/tests/scan-service.test.ts)

### ✅ จุดที่ 9: สร้างหน้า Home Dashboard เฉพาะสำหรับ `DEMO_MADMIN` (Master Admin)
- **เดิม:** หน้า `/home` ของ `DEMO_MADMIN` ขึ้นข้อความ placeholder เก่าและไม่มีภาพรวมข้อมูลหลัก
- **การแก้ไข:** สร้าง [components/home/MasterAdminHomeDashboard.tsx](file:///Users/gundam/MyProject/TRW%20Dev/QCheck/components/home/MasterAdminHomeDashboard.tsx) ดึงข้อมูลสดจาก `GET /api/master` แสดง KPI 4 ช่อง และการ์ดทางลัด 1 คลิกไปยังทุกตารางข้อมูลหลักและเทมเพลตเช็กลิสต์ ผูกเข้ากับ [app/(app)/home/page.tsx](file:///Users/gundam/MyProject/TRW%20Dev/QCheck/app/(app)/home/page.tsx)

### ✅ จุดที่ 10: ปรับโครงสร้างสิทธิ์ 3-Admin ตามคำสั่งบอสกันดั้ม (Head QC = Admin QC / Head QA = Admin QA / ADMIN = Super Admin 100%)
- **Head QC (`QC_HEAD` / `DEMO_QCHEAD`) = Admin QC:**
  - เห็นเฉพาะแผนตรวจ QC ของฝั่งตัวเองใน `/plans` (ซ่อนแท็บ QA), จัดการใบงาน QC (`/jobs`), ประวัติ QC, สแกน QC, และปลดล็อก PIN เฉพาะผู้ตรวจ QC ใน `/admin/users`
- **Head QA (`QA_HEAD` / `DEMO_QAHEAD`) = Admin QA:**
  - เห็นเฉพาะแผนสุ่มตรวจ QA ใน `/plans`, จัดการคิว QA (`/qa-queue`), ประวัติ QA, สแกน QA, และ **เปิดสิทธิ์ปลดล็อก PIN เฉพาะผู้ตรวจ QA** ใน `/admin/users` (`lib/auth/local-admin.ts`, `lib/auth/page-access.ts`)
- **Super Admin (`ADMIN` / `DEMO_ADMIN` / `DEMO_SUPER`) = เห็นและจัดการได้ทุกอย่าง 100%:**
  - เปิดสิทธิ์ครบทุกหน้าใน `PAGE_ACCESS` ทั้ง QC, QA, แผน 2 แท็บ, ใบงาน QC/QA, ประวัติ, สแกน, ข้อมูลหลัก (ดู+แก้ไข `master-edit`), ผู้ใช้หน้างาน, รายงาน, และตั้งค่าอุปกรณ์

---

## 3. ชุดทดสอบอัตโนมัติ (Automated Tests Suite)

คิวได้สร้างและอัปเดตชุดทดสอบครอบคลุม:
1. [tests/audit-roles-connectivity.test.ts](file:///Users/gundam/MyProject/TRW%20Dev/QCheck/tests/audit-roles-connectivity.test.ts) — ตรวจ RBAC, Navigation 5–6 แท็บ, และ Local PIN Unlocking
2. [tests/api-home-inspector.test.ts](file:///Users/gundam/MyProject/TRW%20Dev/QCheck/tests/api-home-inspector.test.ts) — ตรวจ Dashboard หน้า Home ทั้งฝั่ง QC และ QA
3. [tests/scan-service.test.ts](file:///Users/gundam/MyProject/TRW%20Dev/QCheck/tests/scan-service.test.ts) — ตรวจการสแกนจับคู่ใบงาน QA ของ `QA_INSPECTOR` และ `QA_HEAD`

### ผลการรัน Quality Gates ทั้งหมด:
- **`npm test`**: ✅ **ผ่านหมด 104 test files / 1,578 tests (0 errors)**
- **`npm run lint`**: ✅ **0 errors**
- **`npm run build`**: ✅ **Compiled successfully in 2.0s (49 static/dynamic routes)**
- **`npm run typecheck`**: ✅ **0 type errors**
- **`POST /api/auth/login`**: ✅ **ผ่านครบทั้ง 7 บัญชี DEMO ด้วยรหัส 123456**

---

*รายงานโดย: **คิว (Q)** — Lead QA Automation & UX Experience Tester*  
*พร้อมส่งมอบงานให้บอสกันดั้มทดสอบใช้งานได้ทันทีครับ!*
