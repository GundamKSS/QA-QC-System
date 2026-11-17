---
name: verify-changes
description: >-
  Run QCheck's full pre-completion gates (ESLint, tsc typecheck, Vitest, Next.js build) and report the real
  results. Use when the user asks to run tests, check types, lint, build, "เช็คโค้ด", "รันเทสต์",
  "เช็ค type", "ตรวจว่าพังไหม", or before declaring any code change done.
---

# Goal

ยืนยันด้วยผลลัพธ์จริงว่าโค้ดหลังแก้ ผ่านครบ 4 ด่านตามกติกา `CLAUDE.md` (lint · typecheck · test · build) แล้วรายงานผลตามจริง

# Instructions

1. ทำงานที่ root ของโปรเจกต์ (`QCheck/`)
2. รันตามลำดับ หยุดแก้ทันทีเมื่อขั้นไหนพัง แล้วค่อยรันขั้นนั้นซ้ำ:
   ```bash
   npm run lint         # ESLint 9
   npm run typecheck    # tsc --noEmit
   npm test             # vitest run (เทสต์ทั้งหมดอยู่ใน tests/ แบบ flat)
   npm run build        # next build
   ```
   **ถ้าเพิ่ม/ลบ route** ให้ `npm run build` ก่อน `npm run typecheck` เพื่อสร้าง type ใน `.next/types` ใหม่
3. เทสต์เฉพาะไฟล์เพื่อความเร็ว แล้วค่อยรันทั้งชุด:
   ```bash
   npx vitest run tests/api-plans.test.ts
   ```
   เทสต์ที่ต้องใช้ SQL Server จริงจะข้ามเองถ้าไม่ได้ตั้ง `QCHECK_DB_TESTS=on` — **ไม่ต้องเปิดเอง** ถ้าผู้ใช้ไม่ได้สั่ง
4. ถ้าเทสต์พัง: อ่าน error จริง → หาสาเหตุในโค้ด (ไม่ใช่แก้เทสต์ให้ผ่าน) → แก้ → รันซ้ำ
   ถ้าเชื่อว่าเทสต์เดิมผิดจริง ให้แจ้งผู้ใช้พร้อมเหตุผลก่อนแก้เทสต์
5. ลองหน้าเว็บโดยไม่ต้องมี DB/บัญชีจริง: ใช้โหมดสาธิตตาม `README.md` (หัวข้อ "โหมด Login")
6. รายงานผลแบบตาราง: คำสั่ง · ผล (✅/❌) · จำนวนเทสต์ผ่าน/ตก · error สำคัญ (ถ้ามี)

# Constraints

- ห้ามบอกว่า "เสร็จ" ถ้ายังไม่ผ่านครบทั้ง 4 คำสั่ง
- ห้ามปิดหรือ skip เทสต์เพื่อให้ผ่าน
- ผู้ใช้อาจรัน `next dev` ค้างที่พอร์ต 3000 — **ห้ามฆ่า** และห้ามแก้ `next.config.ts` ขณะรันอยู่
- ห้ามอ่านหรือแสดงค่าใน `.env.local`
- ห้ามแก้ block `nextjs-agent-rules` ใน `AGENTS.md`
