# รายงานผลการทดสอบ E2E ทุกบทบาท (All-Roles Live E2E Audit & Findings)

> **วันที่ทดสอบ:** 19 พฤศจิกายน 2026  
> **สภาพแวดล้อมที่ทดสอบ:** Next.js 16.4.6 (Production build บนพอร์ตทดสอบ `:3099`) + SQL Server จริง (`QCheck` & `DATA_CENTER`) + Datacenter Auth API จริง  
> **ขอบเขตการทดสอบ:** ทดสอบล็อกอินจริง, สิทธิ์เข้าถึงหน้าเว็บ (15 บทบาท × 16 หน้า = 240 เคส), API Matrix, Master Data CRUD, และการกรอก-ตรวจจริงครบวงจรตั้งแต่ต้นจนจบ (เปิดแผน → เปิดใบงาน QC → เคลมเครื่อง → ส่งผลไม่ผ่าน + Rework → ซ่อมผ่าน → Local PIN User ตรวจครบ → ส่งต่อ QA → QA รับงาน/จ่ายงาน → QA ตรวจผ่าน + Local QA ตรวจครบ → QA ยืนยันปิดแผน → รายงาน & ประวัติ)  
> **สถานะข้อมูลทดสอบ:** ล้างข้อมูลทดสอบชั่วคราว (Test Plan, Work Orders, Inspections, Test Brand, Temp Users) ออกจากฐานข้อมูลเรียบร้อยแล้ว

---

## 1. สรุปภาพรวม (Executive Summary)

### บทบาททั้งหมดที่ทดสอบ (15 Personas)
| # | Persona | บัญชี / แหล่งข้อมูล | `program_role` | `dbo.user_roles` | ผลทดสอบหลัก |
|---|---|---|---|---|---|
| 1 | **DEV (หลัก)** | `dev` (Central) | `DEV` | ครบ 9 บทบาท | ✅ เข้าได้ทุกหน้า/API |
| 2 | **DEV (ไม่มี sub-roles)** | `15969945007` (Central) | `DEV` | *(ว่าง)* | ✅ เข้าได้ทุกหน้า/API · ⚠️ พังตอนกด Dev Impersonate |
| 3 | **Program Admin (ไม่มี sub-roles)** | `E2E_PADMIN` (Temp) | `ADMIN` | *(ว่าง)* | ✅ เข้าได้เฉพาะ `/home`, `/alerts`, `/admin/users`, `/settings`, `/more` และแก้สิทธิ์ได้ |
| 4 | **Super Admin** | `DEMO_ADMIN` (Central) | `ADMIN` | `ADMIN` | ✅ ล็อกอินได้ · ⚠️ ขาดสิทธิ์ย่อยในบางจุด (`cancel` แผน, `scan` fallback, `notifications`) |
| 5 | **Master Data Admin** | `DEMO_MADMIN` (Central) | `USER` | `MASTERDATA_ADMIN` | ❌ ล็อกอินผ่าน Datacenter ถูกบล็อก 403 · ✅ CRUD ข้อมูลหลักผ่านครบ |
| 6 | **QC Head** | `DEMO_QCHEAD` (Central) | `USER` | `QC_HEAD` | ❌ ล็อกอินผ่าน Datacenter ถูกบล็อก 403 · ✅ เปิดแผน/ใบงาน/ส่งต่อ QA ผ่านครบ |
| 7 | **QC Inspector (Central)** | `DEMO_QC01` (Central) | `USER` | `QC_INSPECTOR` | ❌ ล็อกอินผ่าน Datacenter ถูกบล็อก 403 · ✅ เคลม/ตรวจไม่ผ่าน/Rework ผ่านครบ |
| 8 | **QC Inspector (Field PIN)** | `F0002` (Local) | `null` | `QC_INSPECTOR` | ✅ เห็นงาน/สแกน/เคลม/ตรวจผ่านครบ |
| 9 | **QA Head** | `DEMO_QAHEAD` (Central) | `USER` | `QA_HEAD` | ❌ ล็อกอินผ่าน Datacenter ถูกบล็อก 403 · ✅ รับแผน/จ่ายงาน/ยืนยันปิดแผนผ่านครบ |
| 10 | **QA Inspector (Central)** | `DEMO_QA01` (Central) | `USER` | `QA_INSPECTOR` | ❌ ล็อกอินผ่าน Datacenter ถูกบล็อก 403 · ✅ เคลม/ตรวจ QA ผ่านครบ |
| 11 | **QA Inspector (Field PIN)** | `F0001` (Local) | `null` | `QA_INSPECTOR` | ✅ เห็นคิว QA/สแกน/เคลม/ตรวจ QA ผ่านครบ |
| 12 | **Purchasing** | `E2E_PURCH` (Temp) | `USER` | `PURCHASING` | ✅ เห็นภาพรวม + รายงาน · ถูกบล็อกหน้าปฏิบัติการถูกต้อง |
| 13 | **PM** | `E2E_PM` (Temp) | `USER` | `PM` | ✅ ดูรายงาน + ข้อมูลหลัก (Read-only, บล็อกการเขียน 403) ถูกต้อง |
| 14 | **Management** | `E2E_MGMT` (Temp) | `USER` | `MANAGEMENT` | ✅ ดูรายงาน + ข้อมูลหลัก (Read-only, บล็อกการเขียน 403) ถูกต้อง |
| 15 | **User ไม่มีสิทธิ์ย่อย** | `E2E_NOROLE` (Temp) | `USER` | *(ว่าง)* | ✅ ถูกส่งไป `/no-access` ทุกหน้า · ⚠️ ยังเรียก `/api/notifications` ได้ 200 |

---

## 2. รายการสิ่งที่พัง / ไม่เชื่อมโยงกัน (เรียงตามความรุนแรง)

### 🔴 CRITICAL — ต้องแก้ด่วน (ใช้งานไม่ได้จริง / ช่องโหว่ความปลอดภัยร้ายแรง)

#### C1. บัญชีเดิม 13 บัญชีใน `DATA_CENTER.dbo.ProgramPermission` ล็อกอินไม่ได้เลย (HTTP 403)
- **อาการที่พบ:** เมื่อยิง `POST /api/auth/login` จริง บัญชี `DEMO_QCHEAD`, `DEMO_QC01`, `DEMO_QAHEAD`, `DEMO_QA01`, `DEMO_MADMIN` (รวมถึง `TEST002`–`TEST009` ใน `DATA_CENTER`) ถูกปฏิเสธด้วย `HTTP 403`: *"บัญชีนี้ยังไม่ได้รับบทบาทระดับโปรแกรม (User / Admin / Dev)"*
- **สาเหตุ:** ใน `[DATA_CENTER].[dbo].[ProgramPermission]` (`ProgramID = 3`) ยังเก็บค่า `Role` แบบเก่าอยู่ (`QC_HEAD`, `QC_INSPECTOR`, `QA_HEAD`, `QA_INSPECTOR`, `MASTER_ADMIN`, `PURCHASING`, `PM`, `MANAGEMENT`) ไม่ได้อัปเดตเป็น `User` / `Admin` / `Dev` ตามโครงสร้างใหม่
- **แนวทางแก้ไข:**
  1. อัปเดต `DATA_CENTER.dbo.ProgramPermission` (`ProgramID = 3`) ของบัญชีกลุ่ม User (`DEMO_QCHEAD`, `DEMO_QC01`, `DEMO_QAHEAD`, `DEMO_QA01`, `DEMO_MADMIN`, `TEST002`–`TEST009`) ให้ `Role = 'User'` และ `DEMO_ADMIN` / `DEMO_SUPER` / `TEST001` เป็น `'Admin'`
  2. ตรวจสอบ `dbo.user_roles` ของ `DEMO_SUPER` (ปัจจุบันเหลือแค่ `MASTERDATA_ADMIN` ขาด `ADMIN`, `QC_HEAD`, `QA_HEAD` ตามที่ระบุใน `docs/20`)

#### C2. ช่องโหว่ `/api/dev/impersonate` และหน้า `/settings` เปิดโล่งให้ทุกคน (รวมถึงคนที่ไม่ได้ล็อกอิน!)
- **ไฟล์ที่เกี่ยวข้อง:**
  - [app/api/dev/impersonate/route.ts](file:///Users/gundam/MyProject/TRW%20Dev/QCheck/app/api/dev/impersonate/route.ts#L10-L14) และ [L87-L91](file:///Users/gundam/MyProject/TRW%20Dev/QCheck/app/api/dev/impersonate/route.ts#L87-L91)
  - [app/(app)/settings/page.tsx](file:///Users/gundam/MyProject/TRW%20Dev/QCheck/app/(app)/settings/page.tsx#L10-L16)
- **อาการที่พบ:**
  1. เมื่อ `QCHECK_ALLOW_DEV_ROLE=on` (ค่าปัจจุบันใน `.env.local`) **คนที่ไม่มี Cookie ล็อกอินเลย** สามารถเรียก `GET /api/dev/impersonate` ได้ `HTTP 200` (ได้รายชื่อผู้ใช้ทั้งหมด 21 คน) และสามารถยิง `POST /api/dev/impersonate` สวมรอยเป็น `dev` หรือ `ADMIN` ได้ทันทีโดยไม่ต้องใส่รหัสผ่าน!
  2. ผู้ใช้ทุกบทบาท (`QC_INSPECTOR`, `LOCAL_QC`, `PURCHASING`, `PM`, `MANAGEMENT`, `MASTERDATA_ADMIN`) สามารถเข้า `/settings` ได้ `HTTP 200` (แทนที่จะเป็น 404) และกดสลับบทบาทเป็น `dev` / `ADMIN` ได้เอง
- **สาเหตุ:** เงื่อนไขใช้ `if (!devRoleAllowed() && currentUser?.programRole !== "DEV")` และ `if (!isAdmin && !isDevMode)` ทำให้ `QCHECK_ALLOW_DEV_ROLE=on` ข้ามการเช็คตัวตนและบทบาทไปเลย
- **แนวทางแก้ไข:**
  - `/api/dev/impersonate` (`GET` & `POST`): บังคับต้องล็อกอินก่อน (`if (!currentUser) return 401`) + ต้องเป็น `currentUser.programRole === "DEV"` (หรือเก็บ flag `impersonatedByDev: true` ใน JWE session เพื่ออนุญาตให้สลับกลับเป็น `DEV` ได้อย่างปลอดภัย โดยไม่เปิดให้ user ธรรมดาเข้าถึง) + เพิ่ม `isSameOriginRequest` บน `POST`
  - `/settings`: ตรวจ `canAccessPage(user.roles, "settings", user.programRole)` (ให้เฉพาะ `ADMIN` / `DEV` หรือ session ที่กำลัง impersonate จาก `DEV` เท่านั้น)

---

### 🟠 HIGH — กระทบการทำงานจริงและไม่เชื่อมโยงระหว่างโมดูล

#### H1. `POST /api/dev/impersonate` ทำลายสิทธิ์ `DEV` และ `programRole` เมื่อสวมรอยผู้ใช้ระบบใหม่
- **ไฟล์ที่เกี่ยวข้อง:** [app/api/dev/impersonate/route.ts](file:///Users/gundam/MyProject/TRW%20Dev/QCheck/app/api/dev/impersonate/route.ts#L105-L158)
- **อาการที่พบ:**
  - เมื่อ Dev กดสวมรอยเป็น `15969945007` (ซึ่งมี `program_role = 'DEV'` และไม่มีแถวใน `dbo.user_roles`) ระบบกลับให้สิทธิ์เป็น `["QC_INSPECTOR"]` แทนที่จะเป็น `DEV` (ทุกสิทธิ์)!
  - และเมื่อสวมรอยเป็น `ADMIN` ที่ยังไม่มีสิทธิ์ย่อย ระบบก็ตกไปเป็น `["QC_INSPECTOR"]` และไม่ได้เขียน `programRole` ลง JWE cookie
- **สาเหตุ:** โค้ดยังเช็ค `first.employee_code.toLowerCase() === "dev"` แบบ hardcode, ไม่ได้ `SELECT u.program_role`, และไม่ส่ง `programRole` เข้า `createSession(...)` รวมถึง fallback เป็น `["QC_INSPECTOR"]` เมื่อ `userRoles.length === 0`
- **แนวทางแก้ไข:** `SELECT u.program_role` มาด้วย, ใช้ `resolveEffectiveRoles(programRole, userRoles)`, ส่ง `programRole` เข้า `createSession(...)`, และเลิก fallback มั่วเป็น `["QC_INSPECTOR"]`

#### H2. Offline Fallback สำหรับบัญชี `DEMO_*` ใน `authenticate.ts` ล้างค่า `program_role` ใน DB เป็น `NULL`
- **ไฟล์ที่เกี่ยวข้อง:** [lib/auth/authenticate.ts](file:///Users/gundam/MyProject/TRW%20Dev/QCheck/lib/auth/authenticate.ts#L92-L120) + [app/api/auth/login/route.ts](file:///Users/gundam/MyProject/TRW%20Dev/QCheck/app/api/auth/login/route.ts#L53-L61)
- **อาการที่พบ:** เมื่ออยู่นอก LAN (Datacenter API ออฟไลน์) แล้วล็อกอินด้วย `DEMO_*` / `123456` → `authenticate.ts` ไม่ได้ `SELECT u.program_role` ทำให้ `demoUser.programRole` เป็น `undefined` → จากนั้น `login/route.ts` เรียก `syncUserOnLogin(demoUser)` ซึ่งไป `UPDATE dbo.users SET program_role = NULL` ทับค่าเดิมใน DB หายหมด!
- **แนวทางแก้ไข:** เพิ่ม `u.program_role` ใน SELECT ของ `authenticate.ts` และใน `syncUserOnLogin` ใช้ `COALESCE(@program_role, t.program_role)` เพื่อไม่ให้ค่า `null` เผลอไปล้างของเดิม

#### H3. `DEMO_ADMIN` (`roles: ["ADMIN"]`) ไม่เชื่อมโยงกับสิทธิ์ Head ใน 3 จุดสำคัญ
1. **ยกเลิกแผน (`POST /api/plans/[id]/cancel`)** — [app/api/plans/[id]/cancel/route.ts:23](file:///Users/gundam/MyProject/TRW%20Dev/QCheck/app/api/plans/[id]/cancel/route.ts#L23):
   - เช็คแค่ `const isHead = actor.roles.includes("QC_HEAD");` ลืม `|| actor.roles.includes("ADMIN")` (ทั้งที่ `ADMIN` เปิดแผนและเปิดใบงานได้)
2. **สแกน Fallback สำหรับหัวหน้า (`POST /api/scan/lookup`)** — [lib/scan/service.ts:95](file:///Users/gundam/MyProject/TRW%20Dev/QCheck/lib/scan/service.ts#L95):
   - เช็คแค่ `user.roles.includes("QC_HEAD") || user.roles.includes("QA_HEAD")` ลืม `|| user.roles.includes("ADMIN")` ทำให้ `DEMO_ADMIN` ที่ไม่ได้ถูกมอบหมายในใบงานโดยตรงสแกนไม่เจอ Fallback
3. **การแจ้งเตือนส่งต่องาน (`GET /api/notifications`)** — [lib/notifications/service.ts:19-21](file:///Users/gundam/MyProject/TRW%20Dev/QCheck/lib/notifications/service.ts#L19-L21):
   - เช็คแค่ `isQcHead = roles.includes("QC_HEAD")`, `isQaHead = roles.includes("QA_HEAD")` ลืม `ADMIN` ทำให้ `DEMO_ADMIN` ไม่เห็นแจ้งเตือนส่งต่องาน QC ↔ QA

#### H4. API ตรวจเครื่อง (`claim`, `submit`, `rework`) ไม่บังคับแยกฝั่ง role QC vs QA ที่ชั้น Route Handler
- **ไฟล์ที่เกี่ยวข้อง:**
  - [app/api/inspections/claim/route.ts:36](file:///Users/gundam/MyProject/TRW%20Dev/QCheck/app/api/inspections/claim/route.ts#L36)
  - [app/api/inspections/[id]/submit/route.ts:63](file:///Users/gundam/MyProject/TRW%20Dev/QCheck/app/api/inspections/[id]/submit/route.ts#L63)
  - [app/api/inspections/[id]/rework/route.ts:41](file:///Users/gundam/MyProject/TRW%20Dev/QCheck/app/api/inspections/[id]/rework/route.ts#L41)
- **อาการที่พบ:** Route ตรวจเพียง `page: "scan"` (ซึ่งผ่านทั้ง QC และ QA) แล้วเชื่อค่า `role` (`"QC" | "QA"`) จาก body ของ client โดยไม่ตรวจว่าผู้ใช้ถือบทบาทฝั่งนั้นจริงหรือไม่ (แม้ `claim` จะบังเอิญติด 404 หากไม่ได้ถูก assign ในใบงาน แต่ควรตรวจสิทธิ์ฝั่ง QC/QA ให้ชัดเจนที่ชั้น Route ด้วยเพื่อ Defense-in-Depth)

---

### 🟡 MEDIUM — จุดบกพร่องย่อย / API Robustness / ความสอดคล้องของข้อมูล

#### M1. `GET /api/notifications` ยังตอบ `HTTP 200` ให้ผู้ใช้ที่ไม่มีสิทธิ์ (`NO_ROLE_USER` บน `/no-access`)
- **ไฟล์ที่เกี่ยวข้อง:** [app/api/notifications/route.ts:10-13](file:///Users/gundam/MyProject/TRW%20Dev/QCheck/app/api/notifications/route.ts#L10-L13)
- **สาเหตุ:** ไม่ได้เรียก `hasAppAccess(user)` (หรือ `guardApi`) หลัง `getCurrentUser()`
- **แนวทางแก้ไข:** เพิ่ม `if (!hasAppAccess(user)) return Response.json({ error: "forbidden" }, { status: 403, headers });`

#### M2. `POST /api/inspections/[id]/submit` ไม่ Validate ค่า `answers[id].status` ก่อนยิง SQL
- **ไฟล์ที่เกี่ยวข้อง:** [lib/inspections/service.ts](file:///Users/gundam/MyProject/TRW%20Dev/QCheck/lib/inspections/service.ts) / [lib/db/inspections.ts](file:///Users/gundam/MyProject/TRW%20Dev/QCheck/lib/db/inspections.ts)
- **อาการที่พบ:** หาก client ส่ง `status` ที่ไม่ใช่ `"NORMAL" | "FAIL" | "NA"` (เช่น `"PASS"`) แทนที่จะตอบ `422 Unprocessable Entity` ระบบกลับปล่อยลง SQL จนพังด้วย `CHECK constraint "CK_item_results_status"` และคืน `503 ฐานข้อมูลขัดข้อง`
- **แนวทางแก้ไข:** Validate ค่า `status` ของแต่ละข้อใน `submitUnitInspection` ให้เป็น `"NORMAL" | "FAIL" | "NA"` (คืน `422` พร้อมข้อความที่เข้าใจง่ายหากค่าผิด)

#### M3. ข้อมูล `DEMO_SUPER` ใน `dbo.user_roles` ไม่ตรงกับบทบาท Super Admin
- **อาการที่พบ:** ใน `dbo.user_roles` ของ `DEMO_SUPER` (id=14) ปัจจุบันมีแค่แถวเดียวคือ `MASTERDATA_ADMIN` (ไม่มี `ADMIN`, `QC_HEAD`, `QA_HEAD`) ทำให้เมื่อสวมรอยหรือล็อกอินเป็น `DEMO_SUPER` เห็นแค่หน้าข้อมูลหลัก + หน้าผู้ใช้/ตั้งค่า (จาก `program_role='ADMIN'`) แต่ไม่เห็นแผนตรวจ QC/QA และรายงานเหมือนที่ออกแบบไว้ใน `docs/20`

#### M4. `POST /api/qa-queue` (`action: "set_aql"`) ควรตรวจสอบค่า AQL ในข้อความ error ให้ชัดเจน
- **อาการที่พบ:** ตอนส่ง `aqlLevel: "G-II"` ได้ 422 เพราะค่าที่ระบบรับคือ `"S-1".."S-4", "I", "II", "III"` (ทำงานถูกต้องตามสเปก `lib/qa/aql.ts` แต่ควรตรวจให้แน่ใจว่า UI Dropdown ส่งค่าตรงกับ `isValidAqlLevel` ทุกจุด)

---

## 3. สิ่งที่ทดสอบจริงแล้วผ่านครบ 100% ✅

1. **Full QC → Rework → QA → Confirm → Report Lifecycle (ข้อมูลจริงใน SQL Server):**
   - `QC_HEAD` เปิดแผนตรวจ (`POST /api/plans` → 201) + กันเปิดแผนซ้ำ Invoice+Model (`409` BR-01)
   - `QA_HEAD` ถูกบล็อกไม่ให้เปิดแผน (403), บล็อกไม่ให้เปิดใบงาน QC (403), และบล็อกไม่ให้ดูแผนที่ QC ยังไม่ส่งต่อ (403)
   - `QC_HEAD` เปิดใบงาน QC (`POST /api/plans/[id]/work-orders` → 201) มอบหมายทั้ง Central (`DEMO_QC01`) และ Local PIN (`F0002`) + แก้ผู้รับผิดชอบ (`PUT assignees` → 200)
   - `QC_INSPECTOR` & `LOCAL_QC` เห็นงานใน `/api/jobs`, `/api/home/inspector` และ `POST /api/scan/lookup` ครบทั้งคู่
   - `QC_INSPECTOR` เคลมเครื่องที่ 1 → กันคนอื่นเคลมซ้ำ (`409`) → ตอบเช็กลิสต์ 19 ข้อแบบไม่ผ่าน + แนบอาการ + แนบรูปหลักฐาน + ส่งซ่อม `REWORK` (200) → `QC_HEAD` ถูกกันไม่ให้ส่งต่อ QA ระหว่างค้างซ่อม (422) → โหลดหน้า/API Rework (200) → ซ่อมผ่านรอบที่ 2 (`PASS`, round 2)
   - `LOCAL_QC` (`F0002`) เคลมและตรวจเครื่องที่ 2 ผ่านครบโควตา (`2/2`)
   - `QC_INSPECTOR` ถูกบล็อก `submit-to-qa` (403) → `QC_HEAD` ส่งต่อแผนให้ QA (`ASSIGNED` → `QA_PENDING`, 200)
   - `QA_HEAD` เห็นแผนใน `/api/qa-queue` → `QA_INSPECTOR` ถูกบล็อกการรับงาน (403) → `QA_HEAD` กดรับงาน (`accept` → สร้างใบงาน `<plan_no>-QA`, 200) → จ่ายงานให้ `DEMO_QA01` และ `F0001` (`assign` → 200)
   - `QA_INSPECTOR` & `LOCAL_QA` เห็นงานใน `/api/qa-queue`, `/api/home/inspector`, `POST /api/scan/lookup` → โหลดเช็กลิสต์ QA (19 ข้อ) → เคลมและตรวจผ่านครบทั้ง 2 เครื่อง (`2/2`)
   - `QA_HEAD` กดยืนยันปิดแผน (`confirm` → `COMPLETED`, 200)
   - หน้ารายงาน (`/plans/[id]/report` & `/api/plans/[id]/report`) และประวัติ (`/api/history`) เปิดดูได้ครบทั้ง 12 บทบาทที่มีสิทธิ์ และบล็อก `MASTERDATA_ADMIN`, `PROGRAM_ADMIN_ONLY`, `NO_ROLE_USER` ถูกต้อง
2. **Master Data CRUD & RBAC:**
   - `MASTERDATA_ADMIN` สร้าง (201), แก้ไข (200), ปิดใช้งาน (200) แบรนด์ได้ครบ และบันทึก Audit Log ครบ
   - `PM`, `QC_HEAD`, `QA_HEAD`, `MANAGEMENT` ดูข้อมูลหลักได้แต่ถูกบล็อกการแก้ไข (`403`) ถูกต้อง
3. **ระบบสิทธิ์ใหม่ (`ProgramPermission: User/Admin/Dev` + `QCheck.dbo.user_roles`):**
   - `PROGRAM_ADMIN_ONLY` (`program_role='ADMIN'`, ไม่มี sub-roles) เข้าจัดการผู้ใช้และกำหนดบทบาท `MASTERDATA_ADMIN` ผ่าน `/api/admin/central-users/[id]/roles` ได้สำเร็จ (200) และถูกบล็อกหน้าปฏิบัติการอื่นถูกต้อง
   - `DEV_NO_SUBROLES` (`15969945007`, `program_role='DEV'`, ไม่มี sub-roles) เข้าได้ครบทุกหน้าและทุก API โดยไม่ต้องติ๊กสิทธิ์ย่อย
   - `NO_ROLE_USER` (`program_role='USER'`, ไม่มี sub-roles) ถูกบังคับ redirect ไป `/no-access` ทุกหน้า (ยกเว้น `/api/notifications` ที่ระบุใน M1)
   - ขอบเขตปลดล็อก PIN ผู้ใช้หน้างาน: `QC_HEAD` ถูกบล็อกไม่ให้ปลดล็อก `F0001` (QA) (`403`) และ `QA_HEAD` ถูกบล็อกไม่ให้ปลดล็อก `F0002` (QC) (`403`) ถูกต้อง

---

## 4. ลำดับแผนการแก้ไข (Fix Checklist — แก้ไขครบ 100%)

- [x] **C1 + M3:** อัปเดต `DATA_CENTER.dbo.ProgramPermission` (`ProgramID = 3`) ของบัญชี `DEMO_*` และ `TEST001–TEST009` เป็น `User` / `Admin` / `Dev` + เติม `user_roles` ของ `DEMO_SUPER` ให้ครบ *(ทดสอบล็อกอินผ่าน Datacenter จริงครบ 7/7 บัญชีแล้ว)*
- [x] **C2 + H1:** ล็อก `/api/dev/impersonate` และ `/settings` ไม่ให้คนไม่ได้ล็อกอินหรือ user ทั่วไปเข้าถึงได้ (401/403) + เพิ่ม JWE claim `impersonatedByDev` ที่ปลอมไม่ได้เพื่อให้ Dev สลับกลับได้ปลอดภัย + แก้ `impersonate` ให้รองรับ `program_role` (`DEV`/`ADMIN`/`USER`) อย่างถูกต้อง
- [x] **H2:** แก้ `lib/auth/authenticate.ts` ให้ดึง `u.program_role` และแก้ `lib/db/users.ts` (`COALESCE`) ไม่ให้การล็อกอินออฟไลน์ `DEMO_*` ไปล้าง `program_role` เป็น `NULL`
- [x] **H3:** เพิ่ม `ADMIN` ใน `scan` fallback (`lib/scan/service.ts`) และ handover notifications (`lib/notifications/service.ts`) *(หมายเหตุ: `cancel` แผนที่เริ่มตรวจแล้วยังคงแยก `isHead = QC_HEAD` ตาม BR-13 และ `tests/api-plans.test.ts` อย่างเคร่งครัด)*
- [x] **H4:** เพิ่มการตรวจบทบาทฝั่ง QC/QA (`canInspectSide`) ใน `app/api/inspections/claim`, `submit`, และ `rework` (รองรับ QC ที่ถูก `returnQaUnitToQc` มอบหมายซ่อมโดยตรง)
- [x] **M1 + M2:** เพิ่ม `hasAppAccess(user)` ใน `app/api/notifications/route.ts` และ validate `answers[id].status` เป็น 422 ใน `lib/inspections/service.ts`
