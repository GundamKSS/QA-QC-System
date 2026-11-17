---
name: api-route
description: >-
  Create or modify a QCheck API route (app/api/**/route.ts) plus its lib/ service, client hook/view
  component and tests, following the docs/19 recipe (guardApi, readFields, audit, apiJson/apiData/apiError,
  dbFailure, useApiRead/useApiAction). Use when the user asks to add/change an endpoint, API, route handler,
  page, or feature that reads/writes data — "สร้าง API", "เพิ่ม endpoint", "เพิ่มหน้า", "แก้ route".
---

# Goal

เพิ่ม/แก้ endpoint และหน้าที่ใช้ ให้ตรงสูตรของ QCheck (สไตล์ log-book) ครบทั้ง 5 ชิ้น: service → route → UI → page → tests และอัปเดตเอกสาร API

# Instructions

1. **อ่านก่อนเขียน**: `docs/19-api-routes-plan.md` (§2 สัญญา, §3 ตาราง endpoint, §5 สูตร route) และตัวอย่างครบชุดที่ฟีเจอร์ `/jobs`
   (มีตัวกรอง + แบ่งหน้า ดู `/history`) · helper อยู่ที่ `lib/api/` (`guard.ts`, `body.ts`, `query.ts`, `response.ts`, `db.ts`, `client.ts`)
2. **① Service** — `lib/<โมดูล>/<เรื่อง>.ts` ขึ้นต้นด้วย `import "server-only"` มี `loadXxx(user, query)` / ฟังก์ชันเขียน
   และ type คำตอบ (ส่งเฉพาะฟิลด์ที่หน้าใช้) · SQL และ pool อยู่ที่นี่เท่านั้น
3. **② Route** — `app/api/<ฟีเจอร์-kebab>/<ทรัพยากร>/[id]/<การกระทำ>/route.ts` export เฉพาะ method ที่ใช้
   - `GET`: `guardApi(request, { page })` → `readQuery(request)` → parser เดียวกับที่หน้าใช้ → `loadXxx` → `apiData(payload)` · catch → `dbFailure(error, label)`
   - `POST/PUT/PATCH/DELETE`: `guardApi` → `readFields(request)` → validate (ผิด → `apiError(422, "ข้อความไทย")`) → service → `audit` (`lib/auth/audit.ts`) → `apiJson({ status: "done", message, … })` · catch → `dbFailure`
   - ข้อยกเว้น: route ที่ยังไม่มี session (เช่น login) ไม่ต้อง `guardApi`
4. **③ UI** — `components/<ฟีเจอร์>/useXxxData.ts` (ห่อ `useApiRead` → `{ data, loading, error, reload }`) + `XxxView.tsx` (`"use client"`)
   แสดง `CardsSkeleton` / `LoadError` จาก `components/feedback/` · ฟอร์มใช้ `useApiAction`, ปุ่มเดี่ยวใช้ `useApiCall`
   หลังบันทึกเรียก `invalidateApiReads()` · แถวรายการใช้ `key` = id
5. **④ Page** — `app/(app)/<ฟีเจอร์>/page.tsx` บาง ๆ: `requirePageAccess(page)` แล้ว render View (ส่ง prop จาก role/`searchParams`)
   ค่าคงที่ที่ server ต้องอ่าน ห้าม export จากไฟล์ `"use client"` — วางใน `lib/`
6. **⑤ Tests** — `tests/api-<ฟีเจอร์>.test.ts`: ไม่ล็อกอิน (401) · ข้ามเว็บ (403) · ไม่มีสิทธิ์ (403) · ข้อมูลผิด (422) · DB ล่ม (503) · สำเร็จ + audit
   และ `tests/<โมดูล>-<เรื่อง>.test.ts` สำหรับ service · เรียก handler ตรงด้วย `new Request(…)` mock `@/lib/auth/dal`, store, `next/cache` (ดู `tests/api-plans.test.ts`)
7. **อัปเดต `docs/19-api-routes-plan.md` §3** (ตาราง endpoint) ทุกครั้งที่เพิ่ม/เปลี่ยน endpoint
8. ยืนยันด้วย skill `verify-changes` (เพิ่ม route → build ก่อน typecheck)

# Constraints

- ห้ามใช้ Server Actions (`"use server"`) · ห้ามต่อ DB ใน page/component/Server Component
- ห้ามสร้าง `src/` · import ด้วย `@/…` เท่านั้น
- endpoint อ่าน (`GET`) ตอบข้อมูลตรง ๆ ไม่ห่อ `status` · endpoint เขียนตอบ JSON ที่มี `status`
- ไม่ส่ง error ดิบของ DB ออกไป · PIN/รหัสผ่านห้ามอยู่ใน audit/log/คำตอบ
- ห้ามเพิ่ม dependency ใหม่โดยไม่ถามผู้ใช้ · งานใหญ่ให้สำรองก่อนด้วย skill `change-review`
- ความรู้เชิงลึก: skill `qcheck` (`references/api-conventions.md`, `references/auth-and-security.md`)
