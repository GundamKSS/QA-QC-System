---
name: db-migration
description: >-
  Create a new QCheck SQL Server migration (db/NNN_<name>.sql) applied by `npm run db:migrate`, in the
  project's idempotent, guarded style. Use when the user asks to "เพิ่มตาราง", "เพิ่มคอลัมน์", "แก้ schema",
  "ทำ migration", "seed master", or a feature needs new DB objects.
---

# Goal

สร้างไฟล์ migration เลขถัดไปที่รันซ้ำได้ปลอดภัย ตรวจ dependency ของตารางก่อนหน้า และให้ `tools/migrate.mjs` ใช้ได้ทันที

# Instructions

1. ดูเลขล่าสุด: `ls db/` → ไฟล์ใหม่ `db/<NNN ถัดไป>_<ชื่อ_snake_case>.sql`
2. ใช้ไฟล์ล่าสุด (เช่น `db/015_plans_production_wo_no.sql`) เป็นแม่แบบ:
   ```sql
   /*
     QCheck — NNN: <เรื่อง>  (SQL Server)
     Spec: docs/<เลข> <อ้างอิง BR/FR> (ผู้ใช้ <วันที่>)
     - <อะไรเปลี่ยน / ทำไม> · ไม่แก้ไฟล์ก่อนหน้า · รันซ้ำได้
   */
   IF OBJECT_ID(N'dbo.<ตารางที่ต้องมีก่อน>', N'U') IS NULL
       THROW 51NNN, 'NNN needs dbo.<...> (run <เลข> first).', 1;
   GO
   IF COL_LENGTH(N'dbo.<ตาราง>', N'<คอลัมน์>') IS NULL
       ALTER TABLE dbo.<ตาราง> ADD <คอลัมน์> <ชนิด> NULL;
   GO
   ```
   - ตาราง Master ใหม่ต้องมีคอลัมน์มาตรฐานตาม skill `qcheck` (`references/database-and-migrations.md`)
   - แยก batch ด้วย `GO` (`tools/migrate-lib.mjs` ใช้ `splitBatches`)
3. ฝั่งแอป: SQL ใหม่วางใน `lib/<โมดูล>/` · เทสต์ service แบบ mock ใน `tests/`
   เทสต์ที่ต้องใช้ DB จริงต้องครอบด้วย `QCHECK_DB_TESTS=on` (ดู `tests/master-db.test.ts`)
4. ตรวจด้วย skill `verify-changes`
5. บอกผู้ใช้ให้รันเอง:
   ```bash
   npm run db:migrate
   ```
   (อ่านค่าเชื่อมต่อจาก `.env.local` และบันทึกลง `dbo.schema_migrations` พร้อม checksum)

# Constraints

- **ห้ามแก้ไฟล์ migration ที่รันแล้ว** (checksum ใน `schema_migrations` จะไม่ตรง) — เพิ่มไฟล์ใหม่เสมอ
- **ห้ามอ่าน แสดง หรือแก้ `.env.local`**
- ห้ามรัน `npm run db:migrate` หรือ SQL กับฐานข้อมูลจริงเองโดยผู้ใช้ไม่ได้สั่ง
- `db/seed/` ไม่เข้าระบบ — ห้ามใส่ข้อมูลจริง/ความลับลงในไฟล์ migration
- ห้าม `DROP` / `DELETE` / `UPDATE` ข้อมูลจำนวนมากโดยไม่แจ้งผลกระทบและรอผู้ใช้ยืนยัน
