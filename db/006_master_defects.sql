/*
  QCheck — 006: defects, item_defects, defect_dispositions, fix_methods  (SQL Server)
  Spec: docs/03 §3.1 (Master data) · คอลัมน์มาตรฐาน docs/03 §3.0: สถานะ + วันที่เพิ่ม + วันที่แก้ไข (+ ผู้ทำ)
  - ตามรูปแบบของ 002_brands.sql: INT IDENTITY, ชื่อ constraint DF_/PK_/UQ_/CK_/FK_, รันซ้ำได้
  - ไม่ใช้ trigger ตั้ง updated_at: INSERT/MERGE ... OUTPUT ใช้กับตารางที่มี trigger ไม่ได้ (error 334)
    → ชั้นแอปตั้ง updated_at = SYSUTCDATETIME() และ updated_by ทุกครั้งที่แก้ไข
  - ยังไม่ได้รันกับ SQL Server จริง
*/

IF OBJECT_ID(N'dbo.users', N'U') IS NULL
    THROW 51001, 'dbo.users not found: run 001_users.sql first and make sure you are in the QCheck database.', 1;
GO

IF OBJECT_ID(N'dbo.checklist_items', N'U') IS NULL
    THROW 51005, 'dbo.checklist_items not found: run 005_master_checklists.sql first.', 1;
GO

/* อาการ/ข้อบกพร่องมาตรฐาน */
IF OBJECT_ID(N'dbo.defects', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.defects (
        id                  INT            IDENTITY(1,1) NOT NULL,
        code                NVARCHAR(32)   NOT NULL,
        name_th             NVARCHAR(200)  NOT NULL,
        name_en             NVARCHAR(200)  NULL,
        category            NVARCHAR(64)   NULL,             -- Leakage, Assembly Issue, Performance, Cosmetic, Electrical (❓ H8)
        severity            VARCHAR(8)     NOT NULL,         -- MINOR | MAJOR | CRITICAL
        complexity          TINYINT        NOT NULL CONSTRAINT DF_defects_complexity DEFAULT (1),   -- 1–4 (ค่าแรง BR-21)
        requires_video      BIT            NOT NULL CONSTRAINT DF_defects_video DEFAULT (0),
        is_claimable        BIT            NOT NULL CONSTRAINT DF_defects_claimable DEFAULT (1),
        cause_type_default  VARCHAR(10)    NOT NULL CONSTRAINT DF_defects_cause DEFAULT ('UNKNOWN'), -- SUPPLIER | TRANSPORT | INTERNAL | UNKNOWN
        criteria_image      NVARCHAR(400)  NULL,  -- ภาพเกณฑ์แบบ SOP (storage key)
        is_active    BIT          NOT NULL CONSTRAINT DF_defects_is_active DEFAULT (1),            -- สถานะ: 1 ใช้งาน / 0 ปิด (ไม่ลบแถวจริง)
        created_at   DATETIME2(0) NOT NULL CONSTRAINT DF_defects_created_at DEFAULT (SYSUTCDATETIME()),  -- วันที่เพิ่ม (UTC)
        created_by   BIGINT       NULL,                                                              -- ผู้เพิ่ม (users.id)
        updated_at   DATETIME2(0) NOT NULL CONSTRAINT DF_defects_updated_at DEFAULT (SYSUTCDATETIME()),  -- วันที่แก้ไขล่าสุด (UTC) — แอปตั้งค่าทุกครั้งที่แก้
        updated_by   BIGINT       NULL,                                                              -- ผู้แก้ไขล่าสุด (users.id)
        CONSTRAINT PK_defects PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_defects_code UNIQUE (code),
        CONSTRAINT CK_defects_severity CHECK (severity IN ('MINOR', 'MAJOR', 'CRITICAL')),
        CONSTRAINT CK_defects_complexity CHECK (complexity BETWEEN 1 AND 4),
        CONSTRAINT CK_defects_cause CHECK (cause_type_default IN ('SUPPLIER', 'TRANSPORT', 'INTERNAL', 'UNKNOWN')),
        CONSTRAINT FK_defects_created_by FOREIGN KEY (created_by) REFERENCES dbo.users (id),
        CONSTRAINT FK_defects_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users (id)
    );
END
GO

/* อาการที่เลือกได้ในแต่ละหัวข้อ (ต่อเวอร์ชัน Template) */
IF OBJECT_ID(N'dbo.item_defects', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.item_defects (
        id         INT NOT NULL IDENTITY(1,1),
        item_id    INT NOT NULL,
        defect_id  INT NOT NULL,
        is_active    BIT          NOT NULL CONSTRAINT DF_item_defects_is_active DEFAULT (1),            -- สถานะ: 1 ใช้งาน / 0 ปิด (ไม่ลบแถวจริง)
        created_at   DATETIME2(0) NOT NULL CONSTRAINT DF_item_defects_created_at DEFAULT (SYSUTCDATETIME()),  -- วันที่เพิ่ม (UTC)
        created_by   BIGINT       NULL,                                                              -- ผู้เพิ่ม (users.id)
        updated_at   DATETIME2(0) NOT NULL CONSTRAINT DF_item_defects_updated_at DEFAULT (SYSUTCDATETIME()),  -- วันที่แก้ไขล่าสุด (UTC) — แอปตั้งค่าทุกครั้งที่แก้
        updated_by   BIGINT       NULL,                                                              -- ผู้แก้ไขล่าสุด (users.id)
        CONSTRAINT PK_item_defects PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_item_defects UNIQUE (item_id, defect_id),
        CONSTRAINT FK_item_defects_item FOREIGN KEY (item_id) REFERENCES dbo.checklist_items (id),
        CONSTRAINT FK_item_defects_defect FOREIGN KEY (defect_id) REFERENCES dbo.defects (id),
        CONSTRAINT FK_item_defects_created_by FOREIGN KEY (created_by) REFERENCES dbo.users (id),
        CONSTRAINT FK_item_defects_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users (id)
    );
END
GO

/* ตาราง Disposition 4 คอลัมน์: QC/QA × PUMA/OTHER */
IF OBJECT_ID(N'dbo.defect_dispositions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.defect_dispositions (
        id                      INT          NOT NULL IDENTITY(1,1),
        defect_id               INT          NOT NULL,
        role                    VARCHAR(2)   NOT NULL,        -- QC | QA
        brand_group             VARCHAR(8)   NOT NULL,        -- PUMA | OTHER
        disposition             VARCHAR(10)  NOT NULL,        -- CONCESSION | REWORK | REJECT | CHOOSE
        concession_approved_by  BIGINT       NULL,
        concession_approved_at  DATETIME2(0) NULL,
        is_active    BIT          NOT NULL CONSTRAINT DF_defect_dispositions_is_active DEFAULT (1),            -- สถานะ: 1 ใช้งาน / 0 ปิด (ไม่ลบแถวจริง)
        created_at   DATETIME2(0) NOT NULL CONSTRAINT DF_defect_dispositions_created_at DEFAULT (SYSUTCDATETIME()),  -- วันที่เพิ่ม (UTC)
        created_by   BIGINT       NULL,                                                              -- ผู้เพิ่ม (users.id)
        updated_at   DATETIME2(0) NOT NULL CONSTRAINT DF_defect_dispositions_updated_at DEFAULT (SYSUTCDATETIME()),  -- วันที่แก้ไขล่าสุด (UTC) — แอปตั้งค่าทุกครั้งที่แก้
        updated_by   BIGINT       NULL,                                                              -- ผู้แก้ไขล่าสุด (users.id)
        CONSTRAINT PK_defect_dispositions PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_defect_dispositions UNIQUE (defect_id, role, brand_group),
        CONSTRAINT FK_defect_dispositions_defect FOREIGN KEY (defect_id) REFERENCES dbo.defects (id),
        CONSTRAINT FK_defect_dispositions_approver FOREIGN KEY (concession_approved_by) REFERENCES dbo.users (id),
        CONSTRAINT CK_defect_dispositions_role CHECK (role IN ('QC', 'QA')),
        CONSTRAINT CK_defect_dispositions_group CHECK (brand_group IN ('PUMA', 'OTHER')),
        CONSTRAINT CK_defect_dispositions_value CHECK (disposition IN ('CONCESSION', 'REWORK', 'REJECT', 'CHOOSE')),
        CONSTRAINT FK_defect_dispositions_created_by FOREIGN KEY (created_by) REFERENCES dbo.users (id),
        CONSTRAINT FK_defect_dispositions_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users (id)
    );
END
GO

/* วิธีแก้ไขมาตรฐาน */
IF OBJECT_ID(N'dbo.fix_methods', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.fix_methods (
        id    INT           NOT NULL IDENTITY(1,1),
        name  NVARCHAR(100) NOT NULL,  -- เปลี่ยน, ซ่อม/ปรับแต่ง, พ่นสี, อื่นๆ
        is_active    BIT          NOT NULL CONSTRAINT DF_fix_methods_is_active DEFAULT (1),            -- สถานะ: 1 ใช้งาน / 0 ปิด (ไม่ลบแถวจริง)
        created_at   DATETIME2(0) NOT NULL CONSTRAINT DF_fix_methods_created_at DEFAULT (SYSUTCDATETIME()),  -- วันที่เพิ่ม (UTC)
        created_by   BIGINT       NULL,                                                              -- ผู้เพิ่ม (users.id)
        updated_at   DATETIME2(0) NOT NULL CONSTRAINT DF_fix_methods_updated_at DEFAULT (SYSUTCDATETIME()),  -- วันที่แก้ไขล่าสุด (UTC) — แอปตั้งค่าทุกครั้งที่แก้
        updated_by   BIGINT       NULL,                                                              -- ผู้แก้ไขล่าสุด (users.id)
        CONSTRAINT PK_fix_methods PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_fix_methods_name UNIQUE (name),
        CONSTRAINT FK_fix_methods_created_by FOREIGN KEY (created_by) REFERENCES dbo.users (id),
        CONSTRAINT FK_fix_methods_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users (id)
    );
END
GO
