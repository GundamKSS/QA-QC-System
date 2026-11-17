# 08 — แผนย้าย Login ไปใช้ระบบกลาง TRW (ทางเลือก A)

> สถานะ: **ตรวจด้วย API จำลอง และบัญชีทดสอบบนระบบกลางจริงครบ 9 บทบาทแล้ว** · 19 ต.ค. 2026 · ยืนยัน happy path Login/PRG003/role/menu/logout ด้วย TEST001–TEST009 บน Chrome แล้ว; รายละเอียดสัญญา error/token/revalidation และหัวข้ออื่นใน §2 ยังต้องยืนยันกับทีมระบบกลาง · โค้ดปัจจุบันและข้อจำกัดดู §4–5
> ทางเลือกที่ตกลงแล้ว (A): **ระบบกลางเป็นเจ้าของทั้งตัวตนและบทบาท** — `role_prog` ของโปรแกรม `PRG003` (QCheck) ส่งรายการบทบาท QCheck มาให้ QCheck อ่านไปใช้ตรงๆ ไม่ต้องมีหน้าจัดการบทบาทในตัวเอง

---

## 1. สัญญา (contract) ที่ขอจากระบบกลาง

Response ปัจจุบัน (ตัวอย่างจาก dev):

```json
{ "access_token": "…", "display_name": "dev gundam", "employee_no": "dev",
  "email": "…", "role": "dev",
  "programs": [ { "program_code": "PRG003", "program_name": "QCheck",
                  "role_prog": "dev", "can_use": true, "is_active": true, … } ] }
```

ขอเปลี่ยน/ยืนยันเฉพาะส่วนของ `PRG003`:

| ฟิลด์ | ค่าที่ขอ | เหตุผล |
|---|---|---|
| `role_prog` | **array ของรหัสบทบาท QCheck** เช่น `["QA_HEAD","QA_INSPECTOR","MASTER_ADMIN"]` · ถ้าทำ array ไม่ได้ ใช้ string คั่นด้วย `,` ได้ (`"QA_HEAD,QA_INSPECTOR"`) — ฝั่ง QCheck รับได้ทั้งสองแบบ | คนหนึ่งมีหลายบทบาท (FR-AUTH-04) |
| รหัสบทบาทที่ใช้ได้ | `ADMIN` `MASTER_ADMIN` `QC_HEAD` `QC_INSPECTOR` `QA_HEAD` `QA_INSPECTOR` `PURCHASING` `PM` `MANAGEMENT` (ตรงกับ `lib/auth/types.ts`) | สะกดต้องตรงตัว ตัวพิมพ์ใหญ่ |
| `can_use` + `is_active` | `false` = ห้ามเข้า QCheck | ใช้ปิดบัญชีคนลาออก (FR-AUTH-06) |
| (เพิ่ม) `affiliation` | `TRW` / `PUMA` | ❓ E9 — ถ้าระบบกลางไม่มี QCheck จะไม่เก็บสังกัด |

กติกาฝั่ง QCheck:

- หาโปรแกรมด้วย **`program_code === "PRG003"`** (ตั้งค่าได้ผ่าน env) — ไม่ใช้ `program_id` หรือ `url`
- เข้าได้เมื่อ `can_use && is_active` **และ** มีบทบาทที่รู้จักอย่างน้อย 1 บทบาท — ไม่อย่างนั้นแสดง "บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้ QCheck"
- รหัสบทบาทที่ไม่รู้จัก → ตัดทิ้ง + บันทึก audit (ไม่ทำให้ login ล้ม)
- `role_prog = "dev"` → ได้ทุกบทบาท **เฉพาะเมื่อ `QCHECK_ALLOW_DEV_ROLE=on` และไม่ใช่ production**
- เรียกระบบกลาง **จากฝั่ง server เท่านั้น** (route handler `POST /api/auth/login`) — `access_token` และรายการโปรแกรมอื่นไม่ส่งถึงเบราว์เซอร์ QCheck ยังออก session cookie ของตัวเอง (HttpOnly, เข้ารหัส) เหมือนเดิม

## 2. คำถามที่ต้องยืนยันกับทีมระบบกลางก่อนใช้งานจริง (อยู่ใน 06 กลุ่ม G — เลข C ใช้กับ QA & AQL แล้ว)

| # | คำถาม | ค่าตั้งต้นที่จะใช้ถ้ายังไม่ได้คำตอบ | P |
|---|---|---|:-:|
| G1 | Endpoint login ของระบบกลาง: URL, method, ชื่อฟิลด์ request (รหัสพนักงาน/รหัสผ่าน), รหัส error แต่ละแบบ (รหัสผิด / ถูกล็อก / ปิดบัญชี) | POST JSON `{employee_no, password}` → 200 = สำเร็จ, 401 = ผิด | P0 |
| G2 | `access_token` เป็นของแต่ละคนและหมดอายุไหม? มี endpoint ตรวจ token / ดึงสิทธิ์ล่าสุดไหม? (ค่าในตัวอย่าง `TRW_TOKEN_2026` ดูเหมือนค่าคงที่ — ถ้าเหมือนกันทุกคนจะใช้ยืนยันตัวตนไม่ได้) | ไม่ใช้ token หลัง login · สิทธิ์ใช้ได้จนหมด session QCheck | P0 |
| G3 | `role_prog` ทำเป็น array ได้ไหม | รับทั้ง array และ string คั่นจุลภาค | P0 |
| G4 | ใครทำ **ล็อกหลังผิด 5 ครั้ง** และ **บังคับเปลี่ยนรหัสครั้งแรก** — ระบบกลางหรือ QCheck? มีหน้าเปลี่ยนรหัสของระบบกลางไหม | ระบบกลางทำ · QCheck คงตัวนับฝั่งตัวเองไว้กันยิงรัว (defense in depth) · ตัดหน้า `/change-password` ของ QCheck | P0 |
| G5 | **Server QCheck ต้องเข้าถึง `192.168.0.248` ได้** — ถ้า Hosting = Cloud (DEC-01 ทางเลือก A) ต้องมี VPN/tunnel หรือระบบกลางต้องเปิดออก internet ผ่าน HTTPS | ต้องตัดสิน DEC-01 ใหม่คู่กัน | P0 |
| G6 | URL ของ QCheck ในระบบกลางเป็น `http://192.168.0.248:8083` — กล้อง, Service Worker, PWA ใช้ได้เฉพาะ **HTTPS ที่มีใบรับรอง public** (04 §2.3) | ต้องมีโดเมน + TLS ก่อน Pilot | P0 |
| G7 | Login ระหว่าง server กับระบบกลางเป็น HTTPS หรือ HTTP ใน LAN? (รหัสผ่านวิ่งผ่านเส้นนี้) | ขอ HTTPS | P1 |
| G8 | ระบบกลางรองรับคน PUMA ที่เข้าออกบ่อยไหม (สร้าง/ปิดบัญชีเร็ว) และใครเป็นคนให้บทบาท QCheck (QA Head ทำเองได้ หรือต้องผ่าน IT) | IT ของระบบกลางทำตามคำขอ QA Head | P1 |

## 3. ผลต่อ spec (แก้ใน 01–06 หลังตอบ G1–G5)

| เอกสาร | ส่วน | เปลี่ยนเป็น |
|---|---|---|
| 01 §3 | แถว System Admin | "จัดการอุปกรณ์ส่วนกลางและการตั้งค่า" — ผู้ใช้/รหัสผ่าน/บทบาทย้ายไป **ระบบกลาง TRW** · เพิ่มแถว "ผู้ดูแลระบบกลาง (IT)" |
| 01 §2 | ข้อ 7 / In-scope M01 | ใช้บัญชีระบบกลางเดียวกับโปรแกรมอื่นของบริษัท |
| 02 §1 | ตารางสิทธิ์ แถวแรก | "จัดการผู้ใช้/รหัสผ่าน/บทบาท" → ทำใน**ระบบกลาง** · Admin QCheck เหลือ "อุปกรณ์/ตั้งค่า" · เพิ่มหมายเหตุ: บทบาทมาจาก `role_prog` ของ PRG003 |
| 02 M01 | FR-AUTH-01 | Login ด้วยรหัสพนักงาน + รหัสผ่าน **ผ่านระบบกลาง TRW** (เรียกจาก server) |
| | FR-AUTH-02 | ~~Admin สร้างผู้ใช้/ตั้งรหัส/บังคับเปลี่ยนรหัส~~ → ทำในระบบกลาง (ตาม G4) · QCheck สร้างแถวผู้ใช้อัตโนมัติเมื่อ login ครั้งแรก (JIT) |
| | FR-AUTH-03 | ~~import Excel~~ → ข้อมูลชื่อ/อีเมล/สังกัด sync จาก response ทุกครั้งที่ login |
| | FR-AUTH-04 | หลายบทบาทต่อคน **กำหนดในระบบกลาง** (`role_prog`) |
| | FR-AUTH-05 | ~~ตัด PIN (DEC-11)~~ → **DEC-12 (19 ต.ค.): ผู้ใช้หน้างานที่ไม่มีบัญชีระบบกลางใช้ PIN ของ QCheck** ([12](12-field-users-pin-plan.md)); ผู้ใช้ออฟฟิศยังใช้รหัสผ่านระบบกลาง |
| | FR-AUTH-06 | ปิดการใช้งาน = ระบบกลางตั้ง `can_use=false` · มีผลเมื่อ login ครั้งถัดไป (หรือทันทีถ้ามี endpoint ตาม G2) · ประวัติใน QCheck ยังอยู่ |
| | FR-AUTH-08 (ใหม่) | ระบบกลางล่ม/เข้าไม่ถึง → แสดง "ระบบยืนยันตัวตนไม่พร้อม" · คนที่ session ยังไม่หมดทำงานต่อได้ · Outbox ไม่หาย (04 §4.2 ข้อ 7) |
| | AC | ตัด "บังคับเปลี่ยนรหัส" และ "ล็อก 15 นาที" ออกจาก AC ของ QCheck ถ้า G4 = ระบบกลางทำ · เพิ่ม AC: ไม่มี PRG003 / `can_use=false` / ไม่มีบทบาท → เข้าไม่ได้และมี audit |
| 02 §5 | S01, S24 | S01 ไม่มีหน้าเปลี่ยนรหัส · S24 เหลือ "อุปกรณ์ & ตั้งค่า" + ดูรายชื่อผู้ใช้ที่เคย login (อ่านอย่างเดียว) |
| 03 | `users` | เพิ่ม `source='CENTRAL'`, `email`, `last_login_at`, `roles_synced_at` · ตัด `password_hash`, `must_change_password` |
| | `user_roles` | ไม่ใช่ข้อมูลต้นทางแล้ว — เป็น snapshot จาก `role_prog` ตอน login (เก็บไว้ให้ query/รายงาน/audit ใช้) |
| 04 | §2.2 Auth / NFR-07 | Auth = ระบบกลาง TRW + session cookie ของ QCheck + RBAC ฝั่ง server · ตัด Argon2id (ไม่เก็บรหัสผ่าน) · เพิ่มหัวข้อ "เชื่อมระบบกลาง" (timeout 5 วิ, ไม่ส่ง token ถึง client, ตรวจรูปแบบ response) |
| | §8 Decision log | เพิ่ม **DEC-09 ใช้ระบบกลาง TRW สำหรับ Login + บทบาท (ทางเลือก A)** — Decided 19 ต.ค. 2026 · ทบทวน DEC-01 เพราะ G5 |
| 05 | WBS | งาน "จัดการผู้ใช้/รหัส/import" ลดลง · เพิ่ม "เชื่อมระบบกลาง + mock" และงานประสานทีมระบบกลาง |
| 06 | — | เพิ่ม G1–G8 · E2 เหลือเรื่องผู้ดูแลอุปกรณ์ · E9 ผูกกับฟิลด์ `affiliation` |
| 07 | §5b, Pass 7 | ตัดฉากหน้าเปลี่ยนรหัสครั้งแรก (ถ้า G4 = ระบบกลางทำ) |

## 4. โค้ดที่ทำแล้ว — 19 ต.ค. 2026

| ส่วน | ไฟล์ / พฤติกรรมปัจจุบัน |
|---|---|
| เลือกแหล่ง Login | `authenticate.ts`: `QCHECK_AUTH=central` (ค่าตั้งต้น) หรือ `mock`; mock ไม่เรียก API และ central ไม่ fallback เป็น demo เมื่อรหัสผิด/API ล่ม |
| API กลาง | `datacenter-adapter.ts`: POST JSON `{username,password}` ไป `API_DATACENTER` + `/auth/auth_permission_prog` (รองรับชื่อ env เดิม `API_Datacenter`) · timeout `CENTRAL_AUTH_TIMEOUT_MS` ค่าเริ่มต้น 5000 ms |
| ตรวจสิทธิ์ | หา `PROGRAM_CODE` ค่าเริ่มต้น PRG003 · `can_use`/`is_active` ต้องเป็น boolean true จริง · response ผิดรูปแบบเป็น unavailable |
| แปลงบทบาท | `roles.ts`: array หรือ string คั่น comma, trim/uppercase, ตัดซ้ำ/unknown · ต้องมีบทบาทที่รู้จักอย่างน้อยหนึ่งค่า · ไม่ใช้ top-level role |
| บทบาท dev | ต้องตั้ง `QCHECK_ALLOW_DEV_ROLE=on` และไม่ใช่ production; ค่าตั้งต้น off |
| ชื่อผู้ใช้ | ส่งชื่อที่ trim แล้วให้ระบบกลางโดยรักษาตัวพิมพ์เล็ก/ใหญ่ รวมถึงการคงค่าเมื่อรหัสผิด; ตัวกันยิงซ้ำใช้ชื่อ normalize เป็น key |
| Session/DAL | `session.ts` เก็บโปรไฟล์/บทบาทใน cookie เข้ารหัส; `dal.ts` กรองบทบาทซ้ำ · ไม่เก็บ access_token · เป็น snapshot ตอน login จนหมด session 12 ชม.; ยังไม่มี local user-store/DB หรือ endpoint ตรวจสิทธิ์ล่าสุด |
| ฟอร์ม | `LoginForm.tsx` + `experience.ts`: invalid/locked/disabled/forbidden/unavailable · ระบบกลางล่มไม่สั่นฟอร์มและไม่นับรหัสผิด · username focus ขยายฉาก 3D; password ใช้กรอบปกติ |
| Audit | success/failure/lockout/forbidden/unavailable/unknown_role/logout · username ที่ยังไม่ได้ยืนยันเป็นบัญชีจริงใช้ HMAC แทนข้อความที่พิมพ์ |
| ตั้งรหัสใหม่ | central ส่ง `mustChangePassword=false`; หน้าของ QCheck ยังเป็น placeholder สำหรับ mock เก่าเท่านั้น · การจัดการรหัสจริงรอ G4 |
| Config | `.env.example` มีโหมด/API/program/timeout/dev-role/demo switch · `QCHECK_AUTH=mock` ใน production ต้องเปิด `QCHECK_MOCK_AUTH=on` เพิ่ม |

ชื่อไฟล์ที่ใช้งานจริงต่างจากแผนเริ่มต้น: ไม่มี `central/parse.ts`, `central/client.ts` หรือ `user-store.ts`; ใช้ `roles.ts` และ `datacenter-adapter.ts` ร่วมกับ session snapshot แทน

ผลตรวจ: unit tests ครอบคลุมสิทธิ์/บทบาท, HTTP error/schema, dev role ใน production, การแยก demo/central, case ของ username และการไม่บันทึกข้อมูลที่ยังไม่ยืนยัน · ผลรวมชุดตรวจล่าสุดอยู่ [login-progress.md](login-progress.md)

## 5. ความเสี่ยงที่ต้องรู้

1. **บทบาทค้าง**: ถ้าไม่มี endpoint ตาม G2 การถอดบทบาทในระบบกลางจะมีผลเมื่อ session QCheck หมด (สูงสุด 12 ชม.) — ลดได้ด้วยการลด `sessionHours` หรือขอ endpoint
2. **ระบบกลางเป็นจุดล่มจุดเดียว**: ระบบกลางล่ม = login ใหม่ไม่ได้ทุกคน (คนที่ทำงานออฟไลน์อยู่ไม่กระทบ)
3. **Hosting (G5) และ HTTPS (G6)** เป็นตัวบล็อก Pilot ไม่ใช่แค่เรื่อง auth

## ภาคผนวก — ตาราง Employee ของระบบกลาง (19 ต.ค. 2026)

ผู้ใช้แจ้งว่าข้อมูลผู้ใช้อยู่ที่ `DATA_CENTER.dbo.Employee` (คอลัมน์: `No`, `First_Name`, `Last_Name`, `E_Mail`, `Mobile_Phone_No`, `Job_Title`, `PasswordHash`, `Role`) — **ตัดสินใจ: เป็นแหล่งข้อมูลผู้ใช้เท่านั้น, login ยังผ่าน API `/auth/auth_permission_prog` ตาม DEC-09**

| คอลัมน์ Employee | ใช้กับ QCheck |
|---|---|
| `No` | = `employee_code` (ยืนยันกับ IT ว่าตรงกับ `employee_no` ที่ API ส่งมา) |
| `First_Name` + `Last_Name` | `users.full_name` (ปัจจุบันได้จาก API อยู่แล้ว) |
| `E_Mail` | `users.email` (แจ้งเตือนเท่านั้น) |
| `Job_Title` | ยังไม่มีคอลัมน์รองรับ — เพิ่มใน `users` ได้ถ้าต้องแสดงตำแหน่ง |
| `Mobile_Phone_No` | ยังไม่ใช้ (ข้อมูลส่วนบุคคล — เก็บเมื่อมีความจำเป็นเท่านั้น) |
| `PasswordHash` | **ห้ามอ่าน/เก็บ** — รหัสผ่านเป็นของระบบกลาง |
| `Role` | **ไม่ใช้** — บทบาท QCheck มาจาก `role_prog` ของ PRG003 เท่านั้น (คอลัมน์นี้เป็นบทบาทของระบบกลางเอง) |

ถ้าจะอ่านตารางนี้จากแอป: ขอสิทธิ์ `SELECT` เฉพาะคอลัมน์ที่ใช้ (ไม่รวม `PasswordHash`) ให้บัญชีเฉพาะของ QCheck และต้องแก้ TLS ของ SQL Server ก่อน
