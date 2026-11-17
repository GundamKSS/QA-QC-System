---
name: qcheck
description: >-
  Comprehensive guide, architectural rules, domain knowledge, API recipes, and troubleshooting runbooks
  for the QCheck project (Theerawat TRW × PUMA air compressor quality inspection web app).
  Use whenever working on the QCheck codebase, creating API routes, designing pages with log-book conventions,
  handling SQL Server migrations, debugging Central/PIN auth, or running tests.
---

# QCheck Expert Skill & Runbook

ระบบตรวจรับคุณภาพปั๊มลม **ธีรวัฒน์ (TRW) × PUMA** — เว็บแอป Mobile-First (Next.js 16 App Router, React 19, Tailwind CSS v4, SQL Server, Three.js 3D, ZXing) ที่พัฒนาตามแนวทางโปรเจกต์ `../log-book` อย่างเคร่งครัด

---

## สารบัญเอกสารอ้างอิงเชิงลึก (In-Depth References)

1. [กติกาและสถาปัตยกรรม (Architecture & Rules)](./references/architecture-and-rules.md) — กฎเหล็ก log-book, ห้าม `src/`, ห้าม Server Actions, ทุกหน้าอ่านผ่าน `GET /api`
2. [สัญญาและการสร้าง API Routes (API Conventions)](./references/api-conventions.md) — สูตร Route Handler, `guardApi`, `readFields`, `useApiRead`, `useApiAction`, `invalidateApiReads`
3. [ฐานข้อมูลและการ Migration (Database & Migrations)](./references/database-and-migrations.md) — SQL Server, กติกาไฟล์ `db/NNN_*.sql`, คอลัมน์มาตรฐาน Master table, Audit logs
4. [ระบบยืนยันตัวตนและความปลอดภัย (Auth & Security)](./references/auth-and-security.md) — Central Auth vs Local PIN (F0001), RBAC `PAGE_ACCESS`, Mock mode
5. [การทดสอบและการแก้ปัญหา (Testing & Troubleshooting)](./references/testing-and-troubleshooting.md) — Vitest, Pre-flight quality gates, ข้อควรระวังและวิธีแก้ปัญหาทั่วไป

---

## กฎเหล็กที่ต้องจำ (Quick Golden Rules)

| ข้อห้าม | สิ่งที่ต้องทำแทน |
|---|---|
| ❌ ห้ามสร้างโฟลเดอร์ `src/` | โค้ดทั้งหมดอยู่ที่ root: `app/`, `lib/`, `components/`, `db/`, `tests/` |
| ❌ ห้ามใช้ Server Actions (`"use server"`) | เขียนเป็น Route Handler ใน `app/api/**/route.ts` เท่านั้น |
| ❌ ห้ามต่อ Database ในหน้าจอหรือคอมโพเนนต์ | รวมคำสั่ง SQL และ Pool ใน `lib/` แล้วเรียกผ่าน `app/api/` |
| ❌ ห้ามดึงข้อมูล DB ตรง ๆ ใน Server Component | หน้าจอ (`page.tsx`) มีหน้าที่ตรวจสิทธิ์ แล้วส่งให้ Client Component ดึงผ่าน `GET /api` (`useApiRead`) |
| ❌ ห้ามแก้ไฟล์ Migration ที่รันแล้ว | สร้างไฟล์ migration เลขถัดไปเสมอ (`db/NNN_*.sql`) |
| ❌ ห้ามใช้ Relative Import (`../../`) | ใช้ Path Alias `@/*` เสมอในทุกไฟล์ รวมถึงใน `tests/` |
| ❌ ห้ามวางไฟล์เทสต์ข้างไฟล์โค้ด | เทสต์ทั้งหมดอยู่ใน `tests/` แบบ flat ชื่อ `<หมวด>-<เรื่อง>.test.ts` |

---

## ขั้นตอนการทำงานมาตรฐาน (Standard Procedures)

### 1. การสร้างฟีเจอร์ใหม่หรือหน้าใหม่ (Log-Book Style)
1. **ออกแบบ Service ใน `lib/<โมดูล>/`**:
   - สร้างฟังก์ชันอ่านข้อมูล เช่น `loadFeatureData(user, query)` ใส่ `import "server-only"`
   - กำหนด Type คำตอบ (ส่งเฉพาะฟิลด์ที่หน้าจอต้องแสดง)
2. **สร้าง Route Handler ใน `app/api/<ฟีเจอร์>/route.ts`**:
   - `GET`: เรียก `guardApi(request, { page })` → อ่าน query ด้วย `readQuery(request)` → เรียก service → ส่งคืนด้วย `apiData(payload)`
   - `POST`/`PATCH`: เรียก `guardApi` → `readFields(request)` → เรียก service → บันทึก audit → ส่งคืน `apiJson({ status: "done", ... })` ครอบด้วย `try/catch` และ `dbFailure(error, label)`
3. **สร้าง Client Component ใน `components/<ฟีเจอร์>/`**:
   - สร้าง `useFeatureData.ts` ห่อ `useApiRead<FeaturePayload>("/api/<ฟีเจอร์>")`
   - สร้าง `FeatureView.tsx` (`"use client"`) รองรับ Loading (`CardsSkeleton`), Error (`LoadError`), และข้อมูลพร้อมแสดง
4. **สร้าง Page ใน `app/(app)/<ฟีเจอร์>/page.tsx`**:
   - เรียก `requirePageAccess("<ฟีเจอร์>")` ฝั่ง Server แล้ว render `<FeatureView />`
5. **สร้างเทสต์ใน `tests/`**:
   - `tests/api-<ฟีเจอร์>.test.ts`: ทดสอบสิทธิ์ (401, 403), same-origin, ข้อมูลไม่ถูกต้อง (422), DB ขัดข้อง (503), สำเร็จ
   - `tests/<โมดูล>-<ฟีเจอร์>.test.ts`: ทดสอบตรรกะใน `lib/`

### 2. การสร้างหรือแก้ไขตารางข้อมูลหลัก (Master Table)
1. สร้างไฟล์ Migration `db/NNN_ชื่อตาราง.sql` พร้อมคอลัมน์มาตรฐาน 5 ตัว:
   - `status VARCHAR(20) NOT NULL DEFAULT 'active'`
   - `created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()`
   - `created_by INT NOT NULL FOREIGN KEY REFERENCES users(id)`
   - `updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()`
   - `updated_by INT NOT NULL FOREIGN KEY REFERENCES users(id)`
2. ลงทะเบียนนิยามตารางใน `lib/master/registry.ts`
3. รันเทสต์ `tests/master.test.ts` เพื่อยืนยันว่า Registry สอดคล้องกับ Migration ครบถ้วน
4. รัน `npm run db:migrate` เพื่ออัปเดตสคีมาเข้าฐานข้อมูล

---

## คำสั่งประจำ (Essential Commands)

```bash
# รันโหมดพัฒนา (อย่าปิดเซิร์ฟเวอร์ถ้าผู้ใช้เปิดค้างอยู่)
npm run dev

# ทดสอบ Unit Tests ทั้งหมด
npm test

# ตรวจสอบ Type และ Lint
npm run lint
npm run build        # สร้าง .next/types ก่อน typecheck เสมอเมื่อมีการแตะ routes
npm run typecheck

# รัน Migration ฐานข้อมูล
npm run db:migrate
```

---

## รายการตรวจสอบก่อนแจ้งเสร็จงาน (Pre-Completion Checklist)

- [ ] โค้ดผ่าน `npm run lint` ไม่มีข้อผิดพลาด
- [ ] สั่ง `npm run build` สำเร็จเรียบร้อย
- [ ] รัน `npm run typecheck` ไม่มี Type error
- [ ] รัน `npm test` ทุกไฟล์ผ่านหมด (84+ test suites)
- [ ] ไม่มีโค้ดที่ใช้ `"use server"` (Server Action)
- [ ] ไม่มี Relative Imports (`../../`) ในโค้ดหรือเทสต์ใหม่
- [ ] บันทึกการแก้ไขใหญ่ลง `.local-backups/` หากมีการปรับโครงสร้าง
