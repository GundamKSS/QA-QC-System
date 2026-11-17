/*
  QCheck — 014: กติกาอาการระดับหัวข้อ — item_defects.part / severity / seq + item_defect_dispositions  (SQL Server)
  Spec: docs/03 BR-04, §3.1 · DEC-14 (ผู้ใช้ 28 ต.ค. 2026)
  - ไฟล์อาการของ QA (Piston / Oil-free / Rotary) ให้อาการชื่อเดียวกันมีความรุนแรงและ Disposition ต่างกัน
    ตามชนิดปั๊มและชิ้นส่วน → ค่าที่ใช้ตัดสินผลย้ายมาอยู่ที่ลิงก์ หัวข้อ × อาการ × ชิ้นส่วน (item_defects)
  - defects.severity และ defect_dispositions เหลือเป็น "ค่าตั้งต้น" ที่ copy ไปตอนผูกอาการเข้าหัวข้อ (ไม่แก้ 2 ตารางนี้)
  - item_defect_dispositions ไม่มีคอลัมน์ role: Checklist แยกตามบทบาทอยู่แล้ว (checklist_templates.role)
  - ลิงก์เดิมใน item_defects (ถ้ามี) ได้ severity และ Disposition จากระดับอาการ ผลเดิมจึงไม่เปลี่ยน
  - ไม่แก้ไฟล์ 006 · รันซ้ำได้
*/

IF OBJECT_ID(N'dbo.item_defects', N'U') IS NULL
    THROW 51140, '014 needs dbo.item_defects and dbo.defect_dispositions (run 006 first).', 1;
GO

IF COL_LENGTH(N'dbo.item_defects', N'part') IS NULL
    ALTER TABLE dbo.item_defects ADD part NVARCHAR(100) NULL;   -- ชิ้นส่วน/ตำแหน่ง เช่น ถัง, ขาถัง, พูลเลย์มอเตอร์ · ว่าง = ทั้งหัวข้อ
GO
IF COL_LENGTH(N'dbo.item_defects', N'seq') IS NULL
    ALTER TABLE dbo.item_defects ADD seq INT NULL;              -- ลำดับตัวเลือกในหัวข้อ (ตามไฟล์ของ QA)
GO
IF COL_LENGTH(N'dbo.item_defects', N'severity') IS NULL
    ALTER TABLE dbo.item_defects ADD severity VARCHAR(8) NULL;  -- ตั้งเป็น NOT NULL หลังเติมค่าให้ลิงก์เดิม
GO

UPDATE l
SET severity = d.severity
FROM dbo.item_defects AS l
JOIN dbo.defects AS d ON d.id = l.defect_id
WHERE l.severity IS NULL;
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.item_defects') AND name = N'severity' AND is_nullable = 1)
    ALTER TABLE dbo.item_defects ALTER COLUMN severity VARCHAR(8) NOT NULL;
GO
IF OBJECT_ID(N'dbo.CK_item_defects_severity', N'C') IS NULL
    ALTER TABLE dbo.item_defects ADD CONSTRAINT CK_item_defects_severity CHECK (severity IN ('MINOR', 'MAJOR', 'CRITICAL'));
GO

/* อาการเดียวกันอยู่ในหัวข้อเดียวกันได้หลายชิ้นส่วน (เช่น สีถลอก ที่ ถัง / ขาถัง / ฐานรอง) */
IF OBJECT_ID(N'dbo.UQ_item_defects', N'UQ') IS NOT NULL
    ALTER TABLE dbo.item_defects DROP CONSTRAINT UQ_item_defects;
GO
IF OBJECT_ID(N'dbo.UQ_item_defects_part', N'UQ') IS NULL
    ALTER TABLE dbo.item_defects ADD CONSTRAINT UQ_item_defects_part UNIQUE (item_id, defect_id, part);
GO

/* Disposition ของลิงก์ หัวข้อ × อาการ × ชิ้นส่วน แยก PUMA / OTHER — ค่าที่ใช้ตัดสินผล (BR-04) */
IF OBJECT_ID(N'dbo.item_defect_dispositions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.item_defect_dispositions (
        id                      INT          NOT NULL IDENTITY(1,1),
        item_defect_id          INT          NOT NULL,
        brand_group             VARCHAR(8)   NOT NULL,        -- PUMA | OTHER
        disposition             VARCHAR(10)  NOT NULL,        -- CONCESSION | REWORK | REJECT | CHOOSE
        concession_approved_by  BIGINT       NULL,
        concession_approved_at  DATETIME2(0) NULL,
        is_active    BIT          NOT NULL CONSTRAINT DF_item_defect_dispositions_is_active DEFAULT (1),            -- สถานะ: 1 ใช้กับกลุ่มยี่ห้อนี้ (ช่อง "ใช้งาน PUMA/Other" ของ QA) / 0 ไม่แสดงเป็นตัวเลือก
        created_at   DATETIME2(0) NOT NULL CONSTRAINT DF_item_defect_dispositions_created_at DEFAULT (SYSUTCDATETIME()),  -- วันที่เพิ่ม (UTC)
        created_by   BIGINT       NULL,                                                              -- ผู้เพิ่ม (users.id)
        updated_at   DATETIME2(0) NOT NULL CONSTRAINT DF_item_defect_dispositions_updated_at DEFAULT (SYSUTCDATETIME()),  -- วันที่แก้ไขล่าสุด (UTC) — แอปตั้งค่าทุกครั้งที่แก้
        updated_by   BIGINT       NULL,                                                              -- ผู้แก้ไขล่าสุด (users.id)
        CONSTRAINT PK_item_defect_dispositions PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_item_defect_dispositions UNIQUE (item_defect_id, brand_group),
        CONSTRAINT FK_item_defect_dispositions_link FOREIGN KEY (item_defect_id) REFERENCES dbo.item_defects (id),
        CONSTRAINT FK_item_defect_dispositions_approver FOREIGN KEY (concession_approved_by) REFERENCES dbo.users (id),
        CONSTRAINT CK_item_defect_dispositions_group CHECK (brand_group IN ('PUMA', 'OTHER')),
        CONSTRAINT CK_item_defect_dispositions_value CHECK (disposition IN ('CONCESSION', 'REWORK', 'REJECT', 'CHOOSE')),
        CONSTRAINT FK_item_defect_dispositions_created_by FOREIGN KEY (created_by) REFERENCES dbo.users (id),
        CONSTRAINT FK_item_defect_dispositions_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users (id)
    );
END
GO

/* ลิงก์เดิมที่ยังไม่มี Disposition เลย: copy จากระดับอาการตามบทบาทของ Checklist
   (เฉพาะลิงก์ที่ไม่มีแถวเลย — ลิงก์ที่ตั้งใจไม่ใช้กับบางกลุ่มยี่ห้อจะไม่ถูกเติมเมื่อรันซ้ำ) */
INSERT INTO dbo.item_defect_dispositions (item_defect_id, brand_group, disposition, concession_approved_by, concession_approved_at, is_active)
SELECT l.id, dd.brand_group, dd.disposition, dd.concession_approved_by, dd.concession_approved_at, dd.is_active
FROM dbo.item_defects AS l
JOIN dbo.checklist_items AS ci ON ci.id = l.item_id
JOIN dbo.template_versions AS tv ON tv.id = ci.version_id
JOIN dbo.checklist_templates AS t ON t.id = tv.template_id
JOIN dbo.defect_dispositions AS dd ON dd.defect_id = l.defect_id AND dd.role = t.role
WHERE NOT EXISTS (SELECT 1 FROM dbo.item_defect_dispositions AS x WHERE x.item_defect_id = l.id);
GO
