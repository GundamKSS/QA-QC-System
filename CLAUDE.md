@AGENTS.md

# QCheck — กติกาของโปรเจกต์ (ตามสไตล์ log-book)

ผู้ใช้สั่งเมื่อ 26 ต.ค. 2026: **QCheck ต้องเป็นสไตล์เดียวกับโปรเจกต์ `../log-book` ตลอดไป** — งานใหม่ทุกชิ้นทำตามกติกาด้านล่างโดยไม่ต้องถามซ้ำ ถ้าต้องทำต่างจากกติกา ให้บอกผู้ใช้ก่อนและรอ OK · อย่าเปลี่ยนโครงสร้างใหญ่เอง

## โครงสร้าง (ห้ามมี `src/`)

```
app/            routes ทั้งหมด: (app)/ หน้าหลังล็อกอิน · (auth)/ login + เปลี่ยน PIN · api/ ทุกอย่างที่ต่อ DB
components/     UI (โฟลเดอร์ตามฟีเจอร์/ชนิด)
lib/            ตรรกะและการต่อ DB — เรียกจาก app/api เท่านั้น (แยกโฟลเดอร์ตามโดเมน: auth, db, plans, master, api …)
db/             migration SQL `NNN_ชื่อ.sql` (ห้ามแก้ไฟล์ที่รันแล้ว — เพิ่มไฟล์ใหม่) · seed/ ไม่เข้า git
docs/           เอกสาร spec ขึ้นต้นด้วยเลขลำดับ · docs/19 = กติกา/แผนที่ API
tests/          เทสต์ทั้งหมด ไฟล์เดียวต่อเรื่อง แบบ flat — ห้ามวาง *.test.ts ข้างโค้ด
tools/          สคริปต์ (ไม่ใช้ `scripts/`)
tmp/            ไฟล์ชั่วคราว/ร่างเก่า — ไม่ใช่ส่วนของแอป
.local-backups/ สำรองก่อนแก้ใหญ่: `before-<เรื่อง>-<วันที่>/originals.tar.gz` (โปรเจกต์นี้ไม่มี git)
```

alias `@/*` ชี้ที่ root (`@/lib/…`, `@/components/…`) · ไฟล์ config อยู่ที่ root เหมือน log-book · `AGENTS.md` มี block ที่ `next dev` สร้างให้ อย่าแก้หรือลบ

## ทุกอย่างที่ต่อ DB อยู่ใน `app/api` (กติกาหลัก)

1. SQL และการเรียก pool อยู่ใน `lib/` เท่านั้น และถูกเรียกจาก route handler (`app/api/**/route.ts`) — **ห้ามใส่ใน page, component หรือ Server Action**
2. **ห้ามใช้ Server Actions** (`"use server"`) — ทุกการเขียนเป็น route handler
3. โฟลเดอร์ API ตั้งชื่อ kebab-case ตามฟีเจอร์ และซ้อนโฟลเดอร์ย่อยตามทรัพยากร/การกระทำ (`plans/[id]/cancel`, `reports/arrival/export`) · หนึ่ง `route.ts` ต่อโฟลเดอร์ export เฉพาะ method ที่ใช้
4. route ใหม่ทำตามสูตรใน [docs/19 §5](docs/19-api-routes-plan.md): `guardApi(request, { page })` เป็นบรรทัดแรก (ยกเว้น route ที่ยังไม่มี session เช่น login) → `readFields` → เรียก service ใน `lib/` → `audit` → `apiJson`/`apiError` (route อ่านตอบด้วย `apiData`) · DB error ใช้ `dbFailure` · ฟอร์มฝั่ง client ใช้ `useApiAction`, ปุ่มที่ไม่ใช่ฟอร์มใช้ `useApiCall`, การอ่านใช้ `useApiRead` (`lib/api/client.ts`)
5. endpoint เขียนตอบ JSON ที่มี `status` (สัญญาใน docs/19 §2) · **endpoint อ่าน (`GET`) ตอบข้อมูลตรง ๆ ไม่ห่อ `status`** (`apiData`) ส่วนตอนล้มเหลวใช้ `apiError` เหมือนกัน — ฝั่งเบราว์เซอร์แยกด้วย HTTP status (`readApi`) · ข้อยกเว้นเดิม: `notifications` (ตอบ `{ error }`), `plans/lookup-doc` (ห่อ `status: "done"`) และ `logout` (ตอบ 303) · ข้อความที่ผู้ใช้เห็นเป็นภาษาไทยพร้อมแสดง · ไม่ส่ง error ดิบของ DB ออกไป · PIN/รหัสผ่านต้องไม่อยู่ใน audit, log หรือคำตอบที่ไม่จำเป็น
6. เพิ่ม/เปลี่ยน endpoint → อัปเดตตารางใน docs/19 §3 และเขียนเทสต์ใน `tests/api-<ฟีเจอร์>.test.ts` ให้ครบ: ไม่ล็อกอิน (401) · ข้ามเว็บ (403) · ไม่มีสิทธิ์ (403) · ข้อมูลผิด (422) · DB ล่ม (503) · สำเร็จ + audit

## หน้า/ฟีเจอร์ใหม่ (แบบ log-book)

- `page.tsx` บาง ๆ: ตรวจ session/สิทธิ์ที่ server (`requirePageAccess(page)`) แล้ว render component ของฟีเจอร์ที่ `components/<ฟีเจอร์>/` ซึ่ง **เรียก `GET /api/<ฟีเจอร์>` เองเพื่ออ่านข้อมูล** (ทุกการอ่านผ่าน API ไม่ใช่แค่การเขียน)
- UI ของฟีเจอร์ใหม่อยู่ใน `components/<ฟีเจอร์>/` (ไม่วางข้างหน้า) พร้อม hook อ่านข้อมูลของฟีเจอร์นั้น (`useXxxData` ที่ห่อ `useApiRead` จาก `lib/api/client.ts` → `{ data, loading, error, reload }`)
- สูตรหน้าอ่านข้อมูล — ดูตัวอย่างครบชุดที่ `/jobs`: ① `lib/<โมดูล>/<เรื่อง>.ts` มี `loadXxx(user, query)` + ชนิดคำตอบ (ส่งเฉพาะฟิลด์ที่หน้าวาด; ไฟล์นี้ `import "server-only"` ฝั่ง client จึงใช้ `import type` เท่านั้น) ② `app/api/<ฟีเจอร์>/route.ts` `GET` = `guardApi` → `loadXxx` → `apiData` / `dbFailure` (ตัวกรองในแอดเดรส: อ่านด้วย `readQuery(request)` แล้วส่งให้ parser ตัวเดียวกับที่หน้าใช้ เช่น `parseHistoryQuery`) ③ `components/<ฟีเจอร์>/` มี `useXxxData.ts` + `XxxView.tsx` (สถานะโหลด · error · ลองอีกครั้ง — ใช้ `CardsSkeleton` / `LoadError` จาก `components/feedback/`) ④ `page.tsx` ตรวจสิทธิ์แล้วส่ง prop ที่คำนวณจาก role/`searchParams` ⑤ เทสต์ `tests/api-<ฟีเจอร์>.test.ts` (401 · 403 · 503 · สำเร็จ) + `tests/<โมดูล>-<เรื่อง>.test.ts` (service) · ตัวอย่างที่มีตัวกรองและแบ่งหน้า: `/history`
- **ทุกหน้าอ่านผ่าน `GET /api` แล้ว (ย้ายครบ 10 หน้า 26 ต.ค. 2026 — ลำดับและผลตรวจอยู่ใน [docs/19 §9](docs/19-api-routes-plan.md))** — หน้าใหม่ทำตามสูตรข้างบนเสมอ ไม่มีหน้าเดิมให้เลียนแบบอีก · ข้อควรจำจากการย้าย: ① ฟอร์มที่ใช้ `useApiAction`/`useApiCall` สั่ง `useApiRead` ในหน้าโหลดใหม่เองหลังบันทึก (`invalidateApiReads`) — แถวรายการใช้ `key` = id เพื่อไม่ให้ไดอะล็อก/ผลลัพธ์ใต้แถวหาย และฟอร์มที่ต้องใช้ข้อมูลให้วาดเมื่อข้อมูลมาแล้วโดยตั้ง `key` จากข้อมูลบนจอ ไม่ใช่แอดเดรส ② **ค่า (ไม่ใช่คอมโพเนนต์) ที่ page ฝั่ง server ต้องอ่าน เช่น ค่าคงที่ของแท็บ ห้ามส่งออกจากไฟล์ `"use client"`** (ฝั่ง server จะได้ client reference ที่ใช้เป็นข้อมูลไม่ได้) ให้วางใน `lib/` ③ ฟอร์มค้นหา GET ที่เป็นช่องแบบไม่ควบคุม ให้ใส่ `key` ตามค่าในแอดเดรส

## เทสต์

- Vitest · ไฟล์ทั้งหมดอยู่ใน `tests/` ตั้งชื่อ `<พื้นที่>-<เรื่อง>.test.ts` (kebab-case): `api-plans`, `lib-api-guard`, `auth-pin`, `plans-rules`, `canvas-scan-orbit` · ชื่อเท่าพื้นที่ใช้ชื่อเดียว (`auth.test.ts`) · import ด้วย alias `@/…` เสมอ ห้าม relative
- ทดสอบ route handler ตรง ๆ ด้วย `new Request(…)` และ mock ชั้นล่าง (`@/lib/auth/dal`, store, `next/cache`) — ดูตัวอย่างที่ `tests/api-plans.test.ts` · เทสต์ที่ต้องใช้ SQL Server จริงต้องครอบด้วย `QCHECK_DB_TESTS=on` (ดู `tests/master-db.test.ts`)

## ข้อที่ต่างจาก log-book โดยตั้งใจ (ผู้ใช้อนุมัติแล้ว — อย่า "แก้" เอง)

- route ใช้ `[id]` ใน path (`/api/plans/[id]/cancel`) และตอบ `{ status, message, … }` ตรงกับ state ของฟอร์ม แทนแบบ log-book (id ใน body, `{ error }`) — อนุมัติผ่านแผน docs/19 · endpoint ใหม่ใช้สัญญาเดียวกับ 19 ตัวเดิมเพื่อให้ API ไม่ปนกัน
- ใช้ `.env.local` (ไม่ใช่ `.env`): Next มาตรฐาน และ `npm run db:migrate` อ่านไฟล์นี้ · ห้ามแตะหรืออ่านค่าความลับในไฟล์นี้
- ไม่มี `proxy.ts`: การกันหน้าทำที่ `(app)/layout.tsx` + `lib/auth/dal.ts` และ `BfcacheGuard` แทน
- login อยู่ที่ `(auth)/login` (ใช้ layout ร่วมกับฉาก 3D) แทน `app/login`
- `lib/` แยกโฟลเดอร์ตามโดเมน (log-book เป็นไฟล์แบน) เพราะโปรเจกต์ใหญ่กว่า · เทสต์ใช้ Vitest แทน `node:test` + `tsx`

## วิธีทำงาน

- งานหลายขั้น: เสนอแผนทีละขั้นแล้วรอ OK ก่อนเริ่มแต่ละขั้น · ก่อนแก้ใหญ่ให้สำรองลง `.local-backups/` ก่อน
- ก่อนบอกว่าเสร็จต้องผ่าน `npm run lint` · `npm run typecheck` · `npm test` · `npm run build` (ถ้าเพิ่ม/ลบ route ให้ build ก่อน typecheck เพื่อสร้าง type ใน `.next/types` ใหม่)
- ผู้ใช้อาจรัน `next dev` ค้างอยู่ที่พอร์ต 3000 — อย่าฆ่า และอย่าแก้ `next.config.ts` ขณะรัน (จะรีสตาร์ทเซิร์ฟเวอร์ของผู้ใช้)
- ลองหน้า/ฟอร์มในเบราว์เซอร์โดยไม่ต้องมี DB หรือบัญชีจริง: โหมดสาธิตใน [README](README.md) (หัวข้อ "โหมด Login") · เอกสาร/ข้อความผู้ใช้เป็นภาษาไทย คอมเมนต์ในโค้ดเป็นอังกฤษและอธิบาย "ทำไม" ไม่ใช่ซ้ำสิ่งที่โค้ดบอก
