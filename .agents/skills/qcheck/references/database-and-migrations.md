# QCheck — ฐานข้อมูลและการ Migration (Database & Migrations)

เอกสารสรุปข้อกำหนด การเชื่อมต่อ และกติกาการจัดการฐานข้อมูล Microsoft SQL Server ในโปรเจกต์ QCheck

---

## 1. การกำหนดค่าเชื่อมต่อ (`.env.local`)

```bash
DB_SERVER=192.168.1.xxx       # ไอพีหรือโฮสต์ของ SQL Server (เว้นว่างไว้เพื่อรัน in-memory mock โหมดสาธิต)
DB_PORT=1433
DB_NAME=QCheck
DB_USER=sa
DB_PASSWORD=xxxx
DB_ENCRYPT=on                 # เปิดเข้ารหัส TLS (on/true)
DB_TRUST_CERT=on              # อนุญาต Self-Signed Certificate (on/true) สำหรับเครื่องพัฒนา
```

> **ข้อควรจำด้านไดรเวอร์**:
> `next.config.ts` กำหนด `mssql` และ `tedious` ไว้ใน `serverExternalPackages` เพื่อป้องกันปัญหา `type.validate is not a function` กับพารามิเตอร์ประเภท DateTime2 จากการ bundle ของ Webpack/Turbopack

---

## 2. กติกา Migration (`db/NNN_*.sql`)

รัน migration ด้วยคำสั่ง:
```bash
npm run db:migrate
```

1. **ห้ามแก้ไขไฟล์เดิมเด็ดขาด**:
   - Migration runner (`tools/migrate.mjs`) ตรวจสอบ SHA-256 checksum ของทุกไฟล์เทียบกับตาราง `dbo.schema_migrations`
   - หากไฟล์เดิมถูกแก้ไข runner จะหยุดและแจ้งเตือนข้อผิดพลาด
   - การเปลี่ยนแปลงสคีมาหรือข้อมูลใหม่ ต้องสร้างไฟล์ใหม่เลขลำดับถัดไป เช่น `017_new_feature.sql`
2. **Transaction ปลอดภัย**:
   - แต่ละไฟล์ `.sql` จะรันใน Single Transaction เสมอ หากมีข้อผิดพลาดจะ rollback ทั้งหมด
3. **โครงสร้างไฟล์ที่รันซ้ำได้ (Idempotency)**:
   - แนะนำให้ใช้เงื่อนไขตรวจสอบก่อนสร้าง เช่น `IF NOT EXISTS (SELECT * FROM sys.tables ...)` หรือ `IF COL_LENGTH(...) IS NULL`

---

## 3. คอลัมน์มาตรฐานของตาราง Master (Master Table Standards)

ทุกตารางในหมวด Master Data (เช่น `brands`, `pump_types`, `vendors`, `pump_models`, `defects`, `dispositions`, `fix_methods`) **ต้องมีคอลัมน์มาตรฐานครบ 5 ตัว**:

| ชื่อคอลัมน์ | ชนิดข้อมูล | เงื่อนไข | ความหมาย |
|---|---|---|---|
| `status` | `VARCHAR(20)` | `NOT NULL DEFAULT 'active'` | สถานะ (`active` / `inactive`) |
| `created_at` | `DATETIME2` | `NOT NULL DEFAULT SYSUTCDATETIME()` | วันเวลาที่สร้าง (UTC) |
| `created_by` | `INT` | `NOT NULL FOREIGN KEY REFERENCES users(id)` | ผู้สร้างรายการ |
| `updated_at` | `DATETIME2` | `NOT NULL DEFAULT SYSUTCDATETIME()` | วันเวลาที่แก้ไขล่าสุด (UTC) |
| `updated_by` | `INT` | `NOT NULL FOREIGN KEY REFERENCES users(id)` | ผู้แก้ไขล่าสุด |

> **กติกาสำคัญ**:
> แอปพลิเคชันต้องตั้งค่า `updated_at` และ `updated_by` ด้วยตนเองในคำสั่ง SQL `UPDATE` เสมอ **ห้ามใช้ Database Trigger ในการอัปเดตฟิลด์นี้** (ผ่านการตรวจใน `tests/db-master-columns.test.ts`)

---

## 4. Master Data Registry (`lib/master/registry.ts`)

เมื่อเพิ่มตาราง Master ใหม่ ให้ลงทะเบียนที่ `lib/master/registry.ts` เพียงจุดเดียว:

```ts
// ตัวอย่างการลงทะเบียนตาราง
export const MASTER_TABLES: Record<string, MasterTableDefinition> = {
  brands: {
    slug: "brands",
    tableName: "brands",
    title: "ยี่ห้อสินค้า",
    codeField: "code",
    nameField: "name",
    fields: [
      { name: "code", label: "รหัสยี่ห้อ", required: true, maxLength: 50 },
      { name: "name", label: "ชื่อยี่ห้อ", required: true, maxLength: 255 },
    ],
  },
  // ...
};
```

- หน้ารายการ `/master/[table]` และ API `/api/master/[table]` จะสร้าง UI และ Validation ให้อัตโนมัติ
- เทสต์ `tests/master.test.ts` จะตรวจความสอดคล้องระหว่าง Registry กับตาราง SQL จริงโดยอัตโนมัติ

---

## 5. ตารางประวัติและ Audit Logs (`dbo.audit_logs`)

- สร้างใน `002_audit_logs.sql`
- ออกแบบเป็น **Append-Only Table** โดยมี Trigger ดักป้องกันคำสั่ง `UPDATE` และ `DELETE`
- บันทึกการเปลี่ยนแปลงสำคัญ: ใคร (`actor_id`), ทำอะไร (`action`), ที่ข้อมูลชุดใด (`entity_type`, `entity_id`), ข้อมูลเดิม (`before_data`), ข้อมูลใหม่ (`after_data`)
- **ห้ามบันทึกข้อมูลความลับลงใน Audit Logs**: เช่น PIN หรือ Plaintext Password

---

## 6. การทดสอบกับ SQL Server จริง

เพื่อทดสอบตรรกะ DB โดยไม่ทิ้งข้อมูลตกค้างในระบบ (จะรันใน Transaction แล้ว Rollback เสมอ):

```bash
QCHECK_DB_TESTS=on node --env-file=.env.local node_modules/.bin/vitest run tests/master-db.test.ts
```
