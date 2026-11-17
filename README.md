# QCheck

ระบบตรวจรับคุณภาพปั๊มลม ธีรวัฒน์ (TRW) × PUMA — เว็บแอป mobile-first (Next.js 16 App Router)
เอกสาร scope/spec อยู่ที่ [docs/](docs/README.md) · Art direction หน้า Login อยู่ที่ [docs/07-login-art-direction.md](docs/07-login-art-direction.md)

## เริ่มใช้งาน

ต้องใช้ Node.js ≥ 22.12

```bash
npm install
cp .env.example .env.local   # แล้วใส่ SESSION_SECRET (คำสั่งสร้างอยู่ในไฟล์)
npm run dev                  # http://localhost:3000
```

| คำสั่ง | ใช้ทำอะไร |
|---|---|
| `npm run dev` | dev server (Turbopack) |
| `npm run build` / `npm start` | production build / รัน build |
| `npm test` | unit test (Vitest) — auth, PIN/ผู้ใช้หน้างาน, CSRF, audit, API routes (สิทธิ์ · ข้ามเว็บ · ข้อความ · audit ของทุก endpoint), ตรวจไฟล์ migration (คอลัมน์ วันที่เพิ่ม/แก้ไข/สถานะ), สี CSS ↔ TS, geometry, scan timeline และ shader integration |
| `npm run typecheck` · `npm run lint` | TypeScript · ESLint |
| `npm run db:migrate` | สร้างฐานข้อมูล (ถ้ายังไม่มี) แล้วรันไฟล์ `db/NNN_*.sql` ที่ยังไม่เคยรัน — ดูหัวข้อ “ฐานข้อมูล” |

`package.json` กำหนด override ชั่วคราวให้ `@azure/identity` ใช้ `@azure/msal-node@7.1.1` เพื่อแก้ [GHSA-xcx6-jx8p-x3h5](https://github.com/advisories/GHSA-xcx6-jx8p-x3h5) ที่มากับ `mssql → tedious` เพราะ Identity 4.14.0 ยังอ้าง MSAL 6 อยู่ โดย QCheck เชื่อม SQL Server ด้วย user/password และไม่ได้ใช้ browser-loopback authentication ที่เปลี่ยนใน MSAL 7 ควรถอด override เมื่อ Identity รองรับ MSAL ที่แพตช์แล้วและตรวจ `npm audit` ผ่าน

## โหมด Login

- `QCHECK_AUTH=central` (ค่าตั้งต้น): เรียก API กลางฝั่ง server ผ่าน `API_DATACENTER` (รองรับชื่อเดิม `API_Datacenter`) ตรวจสิทธิ์ `PROGRAM_CODE=PRG003` และอ่านบทบาทจาก `role_prog`
- `QCHECK_AUTH=mock`: ใช้บัญชี demo ด้านล่างโดยไม่เรียกระบบกลาง · ไม่มีการสลับเป็น demo อัตโนมัติเมื่อ API ล่ม
- ลองทั้งแอปโดยไม่ต้องมี DB/ระบบกลาง: ตั้ง `QCHECK_AUTH=mock`, เว้น `DB_SERVER` ว่าง และตั้ง `PIN_PEPPER` (≥ 32 ตัวอักษร) แล้วเข้าด้วยบัญชีทดสอบด้านล่าง (`ADM0001` เปิดแผน/ใบงาน/จัดการผู้ใช้หน้างานได้ครบ) — แผน ใบงาน และผู้ใช้หน้างานใช้ข้อมูลในหน่วยความจำ (หายเมื่อรีสตาร์ท) ส่วนหน้า Master data ต้องใช้ SQL Server จริง · ถ้า `next dev` ของ `.env.local` จริงรันอยู่แล้วต้องหยุดก่อน หรือรันจากสำเนาโฟลเดอร์ (Next ไม่ให้รัน 2 ตัวในโฟลเดอร์เดียว)
- `CENTRAL_AUTH_TIMEOUT_MS=5000`: API ผิดรูปแบบ/ล่ม/timeout แสดงสถานะระบบไม่พร้อม และไม่นับเป็นรหัสผิด
- บทบาทกลาง `dev` ต้องเปิด `QCHECK_ALLOW_DEV_ROLE=on` เอง และใช้ได้เฉพาะนอก production; บทบาท QCheck ปกติไม่ต้องใช้สวิตช์นี้
- สิทธิ์หน้า/เมนูใช้กติกาเดียวใน `lib/auth/page-access.ts`; หน้าใหม่ต้องเรียก `requirePageAccess` ใน server data loader และตรวจสิทธิ์รายข้อมูล/การกระทำเพิ่มเติม · route ใน `app/api` เรียก `guardApi(request, { page })` ซึ่งใช้ตารางสิทธิ์เดียวกัน · ตารางสิทธิ์ใน [docs/09-app-shell.md](docs/09-app-shell.md#8-กติกาสิทธิ์หน้าจอที่ใช้ร่วมกัน)
- ตัวอย่างตัวแปรทั้งหมดอยู่ใน [.env.example](.env.example); การเปลี่ยนค่า env ต้อง restart server · รายละเอียดใน [docs/08-central-auth-plan.md](docs/08-central-auth-plan.md)

## ฐานข้อมูล (SQL Server)

- ตั้งค่าใน `.env.local`: `DB_SERVER`, `DB_PORT`, `DB_NAME` (ค่าตั้งต้น `QCheck`), `DB_USER`, `DB_PASSWORD`, `DB_ENCRYPT`, `DB_TRUST_CERT` — เว้น `DB_SERVER` ว่างเพื่อรันแบบไม่มี DB (ข้อมูลผู้ใช้หน้างานอยู่ในหน่วยความจำและหายเมื่อรีสตาร์ท)
- `npm run db:migrate` สร้างฐานข้อมูลถ้ายังไม่มี แล้วรัน `db/*.sql` ตามเลขลำดับ แต่ละไฟล์เป็น transaction เดียวและบันทึกใน `dbo.schema_migrations` พร้อม checksum — **ห้ามแก้ไฟล์ที่รันไปแล้ว** ให้เพิ่มไฟล์ใหม่ · ไฟล์เขียนให้รันซ้ำได้
- ไฟล์ปัจจุบัน: `008_users_schema_repair` เติมคอลัมน์ผู้ใช้ที่ขาดใน schema รุ่นเดิม; `001` users/user_roles · `002_audit_logs` · `002_brands` · `003` ผู้ใช้หน้างาน (LOCAL) + PIN · `004` pump_types/vendors/models · `005` checklist templates/versions/items/header_fields · `006` defects/dispositions/fix_methods · `007` AQL/ค่าแรง/settings · `009`–`011` แผน/ใบงาน · `012` รหัสอาการรันเลขอัตโนมัติ DEF00001 (SEQUENCE) · `013` Vendor ของ Invoice/PO เว้นว่างได้ตอนเปิดแผน · `014` กติกาอาการระดับหัวข้อ (`item_defects` + ชิ้นส่วน/ความรุนแรง/ลำดับ และ `item_defect_dispositions` — DEC-14) · `015` เลขที่ผลิต (WO) ของแผน PO (`plans.production_wo_no` + เติมให้แผน PO เดิม) · `016` อาการกลาง + Checklist QA/QC ของ Piston / Oil-free / Rotary จากไฟล์ QA (สร้างด้วย `tools/defect-lists.mjs`) — ตรวจเชื่อม SQL Server จริงจากเครื่องพัฒนาได้แล้วหลังตั้ง `DB_ENCRYPT=on` และ `DB_TRUST_CERT=on` ใน `.env.local` (เหมือน DATACENTER เดิมที่ใช้ `TrustServerCertificate=yes`); พบตารางแอป 20 ตาราง แต่ยังไม่มี `schema_migrations` จึงยังไม่ยืนยันประวัติการรันผ่าน runner รอบแก้ TLS รันเฉพาะ `008_users_schema_repair.sql` แบบ transaction เพื่อเติม `nickname`/`pin_must_change`/`updated_by` และ FK ที่ขาด; ทดสอบรันซ้ำแล้วจำนวนแถวเดิมไม่เปลี่ยน และ Chrome อ่านหน้าผู้ใช้หน้างานจาก SQL จริงได้ (LOCAL 0 คน) · Production ใช้ใบรับรองที่เครื่องเชื่อถือได้และตรวจใบรับรองตามปกติ
- ทุกตาราง Master ต้องมี สถานะ + วันที่เพิ่ม + วันที่แก้ไข (+ ผู้ทำ) และ **แอปต้องตั้ง `updated_at`/`updated_by` เองทุกครั้งที่แก้** (ไม่ใช้ trigger — ดู [docs/03 §3.0](docs/03-spec-business-rules-data.md)); test `tests/db-master-columns.test.ts` ตรวจให้อัตโนมัติ
- ข้อควรระวังตอนพัฒนา: `mssql`/`tedious` ถูกตั้งเป็น `serverExternalPackages` ใน `next.config.ts` (โหลดเป็น Node ปกติ ไม่ bundle) เพราะเคยเกิด `type.validate is not a function` กับพารามิเตอร์ DateTime2 · เวลาใน `audit_logs.at` จึงให้ฐานข้อมูลตั้งเอง · อย่าเก็บอ็อบเจกต์ store ที่เป็น closure ไว้ใน `globalThis` (ค้างโค้ดเก่าหลัง hot reload) — เก็บเฉพาะ pool/ข้อมูล · `created_by`/`updated_by` ต้องเป็น `users.id` (ผู้ใช้ออฟฟิศมี session id เป็นรหัสพนักงาน → store ค้น id จาก `employee_code` ให้)
- ข้อมูลตั้งต้นที่มีข้อมูลส่วนบุคคลอยู่ใน `db/seed/` (อยู่ใน `.gitignore`) — เช่น `field-users.sql` รันมือหลัง migration 001 + 003
- Login ของพนักงานออฟฟิศบันทึกผู้ใช้/บทบาทลง `users`/`user_roles` ถ้า DB ใช้ได้; **ถ้า DB ล้ม login ยังเข้าได้** (แค่ไม่บันทึก) · `audit_logs` เป็น append-only (trigger ปฏิเสธ UPDATE/DELETE) — ควรให้บัญชีที่แอปใช้เป็น `db_datawriter` + `db_datareader` ไม่ใช่ `db_owner`

## ข้อมูลหลัก (Master data)

- หน้า **`/master`** (เมนู “ข้อมูลหลัก”): ยี่ห้อ, ประเภทปั๊ม, Vendor, รุ่นปั๊ม, Defect, วิธีแก้ไข — รายการพร้อม สถานะ / วันที่เพิ่ม / วันที่แก้ไข (+ ผู้ทำ), ค้นหา, กรองสถานะ, แบ่งหน้า 50 แถว
- Master Admin เพิ่ม/แก้ไข/ปิด-เปิดใช้งาน (ไม่มีลบ) ผ่าน `app/api/master/[table]/…` · QC/QA Head, PM, ผู้บริหารดูอย่างเดียว · ทุกการแก้บันทึก audit ค่าก่อน→หลัง
- เพิ่มตาราง Master ใหม่: เขียน migration (มีคอลัมน์มาตรฐาน) + เพิ่ม 1 รายการใน `lib/master/registry.ts` — `tests/master.test.ts` ตรวจว่าทุกช่องตรงกับ `db/*.sql` (ชื่อคอลัมน์, NOT NULL, ความยาว, ค่า CHECK)
- ทดสอบกับ SQL Server จริงแบบไม่ทิ้งข้อมูล (ทุกเคสอยู่ใน transaction ที่ rollback):

```bash
QCHECK_DB_TESTS=on node --env-file=.env.local node_modules/.bin/vitest run tests/master-db.test.ts
```

- นำเข้าอาการจากไฟล์ของ QA ("New <ชนิด> Checklist V.1 - Defect.csv" — DEC-14): `review` เขียนไฟล์ให้ QA ตรวจลง `tmp/defect-lists-review/` (อาการกลาง / ลิงก์ / จุดที่ต้องยืนยัน) แล้ว `sql` สร้าง migration จากกติกาเดียวกัน (แก้คำผิด รวมชื่อ แยกชิ้นส่วน อยู่ใน `tools/defect-lists-lib.mjs`) · QA ส่งไฟล์ฉบับแก้ → สร้างเป็น `--version` ถัดไปในไฟล์ migration ใหม่ (เวอร์ชันที่ Publish แล้วแก้ไม่ได้, BR-20)

```bash
node tools/defect-lists.mjs review --piston <csv> --oil-free <csv> --rotary <csv>
```

```bash
node tools/defect-lists.mjs sql --piston <csv> --oil-free <csv> --rotary <csv> --roles QA,QC --out db/NNN_seed_defect_lists.sql
```

## ผู้ใช้หน้างาน (PIN) — DEC-12

พนักงานหน้างานไม่มีบัญชีระบบกลาง จึงเข้าด้วย **รหัส `F0001…` + PIN 6 หลัก** ที่ QCheck ตรวจเอง (รหัสขึ้นต้น `F` ไม่ถูกส่งไประบบกลาง) รายละเอียด/ความเสี่ยงอยู่ใน [docs/12](docs/12-field-users-pin-plan.md)

- ตั้ง `PIN_PEPPER` ใน `.env.local` (≥ 32 ตัวอักษรสุ่ม; คำสั่งสร้างอยู่ใน `.env.example`) — ไม่ตั้ง = เข้าด้วย PIN ไม่ได้; เปลี่ยนค่านี้แล้ว PIN เดิมทั้งหมดใช้ไม่ได้
- Admin เปิด **`/admin/users`** (เมนู “ผู้ใช้หน้างาน”) เพื่อสร้างผู้ใช้ผ่าน `app/api/admin/users/…` (ระบบออกรหัส F… + PIN ชั่วคราว **แสดงครั้งเดียว** ในคำตอบของ API ไม่ถูกเขียนลง audit/log), แก้ข้อมูล/บทบาท (เลือกได้เฉพาะ QC/QA Inspector), ออก PIN ใหม่, ปิด/เปิดบัญชี · QC Head ปลดล็อก PIN ของ QC Inspector ได้
- ผู้ใช้เข้าด้วย PIN ชั่วคราวครั้งแรก → ถูกพาไป `/change-password` เพื่อตั้ง PIN ของตัวเอง (ห้ามเลขซ้ำ/เรียง) ผ่าน `POST /api/auth/change-pin`
- PIN ผิด 5 ครั้ง → ล็อกจนกว่า Admin/QC Head ปลดล็อก (ไม่ปลดตามเวลา) + จำกัดต่อ IP · สถานะ/บทบาทของผู้ใช้หน้างานถูกอ่านจาก DB ทุกคำขอ ปิดบัญชีแล้วมีผลทันที
- ยังไม่มี “ลืม PIN” ด้วยตัวเอง (ให้ Admin ออก PIN ใหม่) และยังไม่มีสลับผู้ใช้บนเครื่องส่วนกลาง

## บัญชีทดสอบ (`QCHECK_AUTH=mock`)

ผู้ใช้และรหัสผ่านทดสอบอยู่ใน [lib/auth/mock-users.ts](lib/auth/mock-users.ts) (ชื่อสมมติทั้งหมด)

| รหัสพนักงาน | ใช้ทดสอบ |
|---|---|
| `TRW1001` | QC Inspector — เข้าสู่ระบบปกติ |
| `TRW2001` | QA Head + Master Admin — หลายบทบาท |
| `PUMA3001` | ผู้ใช้ใหม่ → ถูกพาไปหน้าตั้งรหัสผ่านใหม่ (FR-AUTH-02) |
| `TRW9001` | ผู้ใช้ที่ถูกปิดการใช้งาน (FR-AUTH-06) |
| `ADM0001` | Admin |

- ผิด 5 ครั้งติดกัน → ล็อกรหัสนั้น 15 นาที · ความผิดที่เก่ากว่า 15 นาทีไม่นับ · ยิงคำขอพร้อมกันก็ตรวจรหัสได้ไม่เกิน 5 ครั้ง (สถานะเก็บในหน่วยความจำ — restart dev server = ล้าง)
- Production demo ต้องตั้งทั้ง `QCHECK_AUTH=mock` และ `QCHECK_MOCK_AUTH=on`
- Audit log ของ login/logout และการจัดการผู้ใช้พิมพ์ลง server console เป็นบรรทัด `[audit] {...}` พร้อม IP/User-Agent และบันทึกลงตาราง `audit_logs` เมื่อมี DB — action: `login.success` · `login.failure` · `login.lockout` (ครั้งที่ทำให้ล็อก) · `login.locked` (ลองขณะล็อกอยู่) · `login.throttled` · `login.disabled` · `login.pin_*` · `user.*` · `logout` · รหัสที่ไม่มีในระบบถูกบันทึกเป็น `<unknown:…>` (HMAC) ไม่ใช่ข้อความที่พิมพ์
- ทดสอบบนมือถือผ่าน LAN (เช่น สแกนด้วยกล้อง ซึ่งเบราว์เซอร์มือถือเปิดให้เฉพาะ https): หยุด `npm run dev` แล้วรัน `npm run dev:phone` (macOS) — เปิด https ที่ IP ของ Wi-Fi (`ipconfig getifaddr en0`) โดย Next สร้างใบรับรองใน `certificates/` ให้ครอบ IP นั้นและยอมรับ origin นั้นเอง ไม่ต้องแก้ `allowedDevOrigins` · มือถืออยู่ Wi-Fi วงเดียวกัน เปิด `https://<IP>:3000` และกดผ่านหน้าเตือนใบรับรอง (หรือติดตั้ง `rootCA.pem` จาก `mkcert -CAROOT` ลงมือถือ — ห้ามคัดลอก `rootCA-key.pem`) · ระหว่างนี้ `localhost:3000` ใช้ไม่ได้ ใช้ `https://<IP>:3000` แทน · ครั้งแรก macOS อาจถามให้อนุญาต node รับการเชื่อมต่อ · ติดตั้งเป็นแอป (PWA จาก `app/manifest.ts`): Chrome จะให้ "ติดตั้ง" เฉพาะเมื่อมือถือเชื่อถือใบรับรองแล้ว (ติดตั้ง `rootCA.pem`) — แค่กดผ่านหน้าเตือนจะได้แค่ "สร้างทางลัด"

## โครงสร้าง

```
app/
├─ layout.tsx              ฟอนต์ IBM Plex Sans Thai Looped + Mono, metadata (noindex), viewport, BfcacheGuard
├─ globals.css             design tokens (Tailwind v4 @theme)
├─ (auth)/                 กลุ่มหน้า auth — ฉาก 3D, scan-reveal และ interaction (Pass 4)
│  ├─ login/               page · error.tsx (ส่งฟอร์มผ่าน api/auth/login)
│  └─ change-password/     ตั้ง PIN ใหม่ของผู้ใช้หน้างาน (ผู้ใช้ระบบกลางยังเป็นข้อความรอ — รหัสผ่านอยู่ที่ระบบกลาง)
├─ (app)/                 layout (shell) + home · alerts · history · jobs · more · plans (รายการ · เปิดแผน · รายละเอียด · เปิดใบงาน) · admin/users · master — ไม่มี WebGL
└─ api/                    route handlers ทุกตัวที่เขียนข้อมูลหรือต้องมี session (docs/19) — แต่ละกลุ่มมีไฟล์ทดสอบข้างกัน
   ├─ auth/                login · logout (POST → 303 /login) · change-pin
   ├─ admin/users/         สร้าง · [id] แก้ · reset-pin · unlock-pin · active
   ├─ master/              จำนวนรายการของแต่ละตาราง (GET) — หน้า `/master`
   ├─ master/[table]/      สร้าง · [id] แก้ · [id]/active
   ├─ plans/               รายการแผน (GET: ตัวกรอง + แบ่งหน้า) · เปิดแผน · lookup-doc · [id]/cancel · waiting-goods · vendor · [id]/work-orders (เปิด · [woId]/assignees · [woId]/cancel)
   ├─ home/                แดชบอร์ดแผนของหน้าแรก (GET: ตัวเลขสรุป · แผนล่าสุด · กำหนด 90 วัน) — หน้า `/home`
   ├─ jobs/                งานของฉัน (GET) — หน้า `/jobs`
   ├─ history/             ประวัติ (GET: ตัวกรอง + แบ่งหน้า) — หน้า `/history`
   └─ notifications/       แจ้งเตือนงาน (GET, polling)

components/dom/               LoginForm, Wordmark, StaticStage, SignOutButton, BfcacheGuard
components/canvas/            กระบอกสูบ, แสง, CameraRig, ModelInteraction, Checkpoints, ScanRing และ scan shader/timeline
components/shell/             Sidebar, BottomTabBar, TopAppBar และ nav ตามบทบาท
components/jobs/              งานของฉัน (`/jobs`): JobsView + useJobsData — อ่านผ่าน `GET /api/jobs` (หน้าแรกที่ย้ายมาแบบ log-book)
components/plans/             รายการแผน (`/plans`): PlanList + usePlanList + MoreFilters — อ่านผ่าน `GET /api/plans` · PlanBits: ป้ายสถานะ แถบ QC วันที่ (ใช้ร่วมกันหลายหน้า)
components/history/           ประวัติ (`/history`): HistoryView + useHistoryData — อ่านผ่าน `GET /api/history`
components/home/              แดชบอร์ดแผนของหน้าแรก (`/home`): HomeDashboard + useHomeDashboard — อ่านผ่าน `GET /api/home`
components/master/            ข้อมูลหลัก (`/master`): MasterIndex + useMasterCounts — จำนวนรายการอ่านผ่าน `GET /api/master`
components/feedback/          LoadError (แถบ error + ลองอีกครั้ง) · CardsSkeleton (โครงกำลังโหลด) ที่หน้าอ่านข้อมูลใช้ร่วมกัน
components/notifications/     กระดิ่ง, badge, รายการแจ้งเตือนงาน (poll `/api/notifications`)
lib/hooks/useBrowserState.ts  hydrated / online / reduced-motion / countdown
lib/hooks/useStageTier.ts     เครื่องนี้ได้ 3D ไหม (WebGL2, Save-Data, RAM) + รอ idle ก่อนโหลดฉาก
lib/auth-stage.ts             สถานะฟอร์ม → ฉาก 3D (เฉพาะ phase ไม่มีค่าที่กรอก)
lib/config/                   auth.ts (นโยบาย) · experience.ts (สี, copy, timing — จูนที่นี่)
lib/auth/                     authenticate · datacenter-adapter · roles · session (A256GCM) · dal · mock-adapter · attempts · audit · pin · local-auth · local-admin · idle
lib/master/                   registry (นิยามตาราง) · form (ตรวจข้อมูล) · sql (สร้างคำสั่ง) · repo (รันกับ DB) · counts (จำนวนรายการ ใช้กับ `GET /api/master`)
lib/db/                       pool/config (mssql) · actor (ผู้ทำ → users.id) · users · local-users (SQL store) · audit-log · migrate helper tests
lib/api/                      ตัวช่วยกลางของ API: guardApi (ด่านแรก) · readFields · apiJson/apiError/apiData · dbFailure · readQuery (อ่านแอดเดรสของคำขอ) · useApiAction/useApiCall/useApiRead + readApi (ฝั่งเบราว์เซอร์)
lib/plans/                    แผน/ใบงาน: rules · service · work-orders · store · runtime (+ api · state · lookup-client · jobs · history · list · home)
lib/notifications/            แจ้งเตือนงาน: service · read-state · work
lib/scan/                     สแกนด้วยกล้อง: detector (BarcodeDetector ของเบราว์เซอร์ หรือ ZXing WASM) · camera (เปิดกล้องหลัง + ข้อความไทย)
db/                           migration SQL (001–013) · seed/ (ข้อมูลส่วนบุคคล — .gitignore)
tools/migrate.mjs             ตัวรัน `npm run db:migrate`
tools/copy-zxing-wasm.mjs     คัดลอกตัวอ่าน QR (.wasm) ไป public/zxing/ — รันเองหลัง `npm install` (postinstall)
tests/                        เทสต์ทั้งหมด (`<พื้นที่>-<เรื่อง>.test.ts` แบบ flat: api-* · auth-* · plans-* · canvas-* …) + server-only-stub.ts
tmp/                          ไฟล์ชั่วคราว/ร่างเก่า (ไม่ใช่ส่วนของแอป)
AGENTS.md · CLAUDE.md         กติกาสำหรับคนและ AI ที่แก้โปรเจกต์ — CLAUDE.md = กติกาสไตล์ log-book (ดูหัวข้อถัดไป)
```

## หลักที่ควรรู้ก่อนแก้

- **สไตล์ของโปรเจกต์ = log-book ตลอดไป** (สั่งเมื่อ 26 ต.ค. 2026) — โครงสร้าง, การต่อ DB ผ่าน `app/api` ทั้งหมด, หน้าใหม่อ่านผ่าน `GET /api`, เทสต์ทั้งหมดใน `tests/` และข้อที่ต่างโดยตั้งใจ อยู่ใน [CLAUDE.md](CLAUDE.md)
- **Next.js 16 ไม่เหมือนเวอร์ชันเก่า** — อ่าน `node_modules/next/dist/docs/` ก่อน (ดู [AGENTS.md](AGENTS.md))
- **การเขียนข้อมูลทุกอย่างผ่าน `app/api/**/route.ts` — ไม่ใช้ Server Actions** (เหตุผล แผนที่ endpoint และตารางแมปชื่อเดิม → route ใหม่อยู่ใน [docs/19](docs/19-api-routes-plan.md)) · route ใหม่เริ่มด้วย `guardApi(request, { page })`, อ่าน body ด้วย `readFields`, ตอบด้วย `apiJson`/`apiError`, จับ DB error ด้วย `dbFailure` · ฟอร์มใช้ `useApiAction(url, initial, failed)` แทน `useActionState` · การอ่าน: ทุกหน้า (ย้ายครบ 10 หน้า 26 ต.ค. 2026) ให้ component ฝั่งเบราว์เซอร์อ่านผ่าน `GET /api` ด้วย `useApiRead` และโหลดใหม่เองหลังบันทึกฟอร์มผ่าน `invalidateApiReads` (ดู [docs/19](docs/19-api-routes-plan.md) §9)
- เปิด `cacheComponents`: โค้ดที่อ่าน cookie ต้องอยู่ใน `<Suspense>` และอ่านผ่าน `lib/auth/dal.ts` เท่านั้น
- หน้า `/login` ไม่อ่าน session โดยตั้งใจ (เป็น static และไม่ redirect ซ้อนตอน login ตั้ง cookie)
- Login สำเร็จ / Logout ใช้ full page navigation เพื่อล้าง state ของผู้ใช้คนก่อนที่ Next เก็บไว้ด้วย `<Activity>` (สำคัญกับเครื่องส่วนกลาง)
- ฟอร์ม login ส่งด้วย JavaScript (`POST /api/auth/login`): ปุ่มถูกล็อก “กำลังเตรียม…” จนหน้าพร้อม และมี `<noscript>` บอกให้เปิด JS (เหตุผลและทางเลือกที่ไม่เลือกอยู่ใน [docs/19](docs/19-api-routes-plan.md) §6 และ [docs/07](docs/07-login-art-direction.md) §9) · ออกจากระบบยังเป็นฟอร์ม POST ธรรมดา ไม่ต้องใช้ JS
- ใน route handler ห้ามใช้ `request.url` / `request.nextUrl` สร้าง URL หรือเช็ค origin — Next สร้างจาก address ที่ server bind (`localhost:3000`) ไม่ใช่ host ที่เบราว์เซอร์ใช้ → ใช้ `isSameOriginRequest()` และ `Location` แบบ relative (ดู `api/auth/logout/route.ts`)
- Cookie session เข้ารหัสเก็บ id/รหัส/ชื่อ/บทบาทจาก Login กลาง โดยไม่เก็บ `access_token` · DAL ตรวจรหัสบทบาทซ้ำ; โปรไฟล์กลางเป็น snapshot จนหมด session 12 ชม. ส่วน mock อ่าน local record ซ้ำ
- สีอยู่ 2 ที่: `globals.css` (CSS) และ `lib/config/experience.ts` (WebGL) — แก้ให้ตรงกันทั้งคู่ (`tests/config-palette.test.ts` จะ fail ถ้าไม่ตรง) · `app/icon.svg` ใส่ค่าสีตรง ๆ ต้องแก้มือ
- ข้อความบนหน้าจอ, ป้ายบทบาท และเวลาของ animation อยู่ใน `lib/config/experience.ts` · path ของหน้า auth และ API ออกจากระบบอยู่ใน `lib/config/auth.ts`
- Login Pass 2: กระบอกสูบสร้างจากโค้ดทั้งหมด (`compressorGeometry.ts`) · สีไทเทเนียมใน 3D (`stage.titanium.color`) ตั้งใจให้ต่างจาก token `ti-metal` เพราะเป็นค่าสะท้อนของโลหะ · ตำแหน่ง/ขนาดวัตถุต่อ layout อยู่ `stage.framing` · `window.__qcheckStage` (dev เท่านั้น) ใช้ดู draw calls ผ่าน `gl.info`
- Login Pass 3: เลเซอร์เผยผิวจากพิมพ์เขียวเป็นไทเทเนียมตอน intro และสแกนวนทุก 6 วินาที โดยเหนือเลเซอร์เป็นเส้นพิมพ์เขียวโปร่ง ใต้เลเซอร์เป็นโลหะ · intro ครั้งแรกของวัน 1.4 วินาที/ครั้งถัดไป 0.45 วินาที (ตามเวลาโรงงาน) · คลิกหรือกดคีย์เพื่อข้าม intro
- ฉากรับเฉพาะสถานะจากฟอร์มผ่าน `lib/auth-stage.ts`: focus หยุดสแกน, ส่งฟอร์มเร่งสแกน, สำเร็จเปลี่ยนเป็นสีเขียว, ล็อกดับเลเซอร์ · ไม่ส่งค่ารหัสพนักงานหรือรหัสผ่านเข้าฉาก
- Login Pass 4: เมาส์ขยับกล้อง ≤ 2.5°, ลากหมุน ±35° แล้วค่อย ๆ กลับ, hover ครีบ และจุดตรวจ 5 จุด · focus ดันกล้องเข้า 6%; success เปลี่ยนเลเซอร์เป็นตราถูกพร้อมเคลื่อนกล้องและ fade ภายในช่วงรอเดิม 650 ms
- Review Pass 3–4: เส้นพิมพ์เขียวติดกับโมเดล, แสงสแกนจำกัดตามขอบผิว, เปลี่ยนสถานะเลเซอร์ต่อเนื่องใน 180 ms · เครื่องหมายถูกแสดงหน้าวัตถุ และจุดตรวจหันเข้ากล้อง · รายละเอียด/ผลตรวจอยู่ `docs/login-progress.md`
- โฟกัสช่องรหัสพนักงาน: ขยาย/จัดโมเดลเป็นพื้นหลังกลางจอและหรี่ภาพอย่างต่อเนื่อง; Tab ไปช่องรหัสผ่านหรือคลิกออกย่อกลับ · ค่าจูนอยู่ `stage.interaction.usernameBackdrop` · reduced motion ไม่ซูม
- Canvas รับ pointer จาก parent ร่วมกับฟอร์ม โดยกัน panel/control ออกจาก raycast; มือถือแยกท่าลากแนวนอนจากการเลื่อนหน้าแนวตั้ง · reduced motion ปิด parallax/drag/fly-through และแสดงเครื่องหมายถูกทันที
- Environment และ contact shadow bake ครั้งเดียว ไม่สร้างใหม่ตามสถานะฟอร์ม; bake ใหม่เมื่อ WebGL context ฟื้น · reduced motion ขอ frame เองเมื่อเริ่ม/หยุดพิมพ์
- Reduced motion แสดงผิวโลหะเต็มและวงเลเซอร์นิ่ง; ซ่อนแท็บแล้วพัก render · `?stage=static` ทดสอบฉากสำรอง · เปิด dev ผ่าน `http://localhost:3000/login`

## หน้า Home และโครงแอป

- มือถือมี 5 แท็บ (ต่างกันตามบทบาท); แท็บเล็ต/คอมมี Sidebar โดยใช้เมนูตามบทบาท · เปิดใช้แล้ว `/home`, `/alerts`, `/history`, `/jobs`, `/more`, `/plans` (+ `/plans/new`, `/plans/[id]`, `/plans/[id]/work-orders/new`), `/master`, `/admin/users`
- แจ้งเตือนงาน: กระดิ่ง, badge (สูงสุด `9+`) และ popup แสดงใบงาน QC ที่มอบให้ผู้ใช้ปัจจุบันและยังเป็น `IN_PROGRESS`/`RETURNED`; `/alerts` เปิดใบงานจากลิงก์ได้ และอ่านทั้งหมดได้ โดยไม่เปลี่ยนสถานะงาน · อ่านแล้วบันทึกแยกบัญชีเฉพาะบนเบราว์เซอร์/อุปกรณ์นี้ (ไม่เก็บรายละเอียดงานใน localStorage) · งานที่ส่ง/ปิด/ยกเลิก หรือแผนที่ปิด/ยกเลิกแล้วไม่แสดง · `/api/notifications` ตรวจ session ทุกคำขอ, ไม่ cache และอัปเดตทุก 30 วินาทีขณะเปิดแอป รวมถึงเมื่อกลับมาที่แท็บ/ออนไลน์อีกครั้ง · ยังไม่มี Web Push/อีเมล หรือประวัติเหตุการณ์แจ้งเตือนถาวร (วันที่ในการ์ดคือวันที่สร้างใบงาน; การตีกลับซ้ำสถานะเดิมยังไม่สร้าง read identity ใหม่)
- Home แสดงข้อมูลตัวอย่าง, ค้นหาแผน/Invoice/รุ่นด้วยช่องค้นหาแล้วกด Enter; KPI คำนวณจากชุดข้อมูลเดียวกับตาราง
- เมนูที่ยังไม่สร้างแสดงสีจางและไม่ส่งไป 404; `/more` แสดงบัญชี/บทบาทและออกจากระบบด้วย POST ได้ทั้งมือถือและคอม
- ยังไม่เปิดใช้ (เมนูแสดงสีจาง): การตรวจรายเครื่อง/สแกน, คิว QA, รายงาน, Dashboard, Audit, ตั้งค่า · แผน/ใบงานใช้ SQL Server เมื่อตั้ง `DB_SERVER` — ไม่ตั้งจะใช้ชุดข้อมูลตัวอย่างในหน่วยความจำ (หายเมื่อรีสตาร์ท) · ดู [docs/09-app-shell.md](docs/09-app-shell.md) และ docs/14–18
# QA-QC-System
