/*
  QCheck — 004: pump_types, vendors, models (+ คอลัมน์ผู้ทำของ brands)  (SQL Server)
  Spec: docs/03 §3.1 (Master data) · คอลัมน์มาตรฐาน docs/03 §3.0: สถานะ + วันที่เพิ่ม + วันที่แก้ไข (+ ผู้ทำ)
  - ตามรูปแบบของ 002_brands.sql: INT IDENTITY, ชื่อ constraint DF_/PK_/UQ_/CK_/FK_, รันซ้ำได้
  - ไม่ใช้ trigger ตั้ง updated_at: INSERT/MERGE ... OUTPUT ใช้กับตารางที่มี trigger ไม่ได้ (error 334)
    → ชั้นแอปตั้ง updated_at = SYSUTCDATETIME() และ updated_by ทุกครั้งที่แก้ไข
  - ยังไม่ได้รันกับ SQL Server จริง
*/

IF OBJECT_ID(N'dbo.users', N'U') IS NULL
    THROW 51001, 'dbo.users not found: run 001_users.sql first and make sure you are in the QCheck database.', 1;
GO

/* brands (002_brands.sql) ยังไม่มี created_by / updated_by ตามมาตรฐาน §3.0 → เติมที่นี่ (ไม่แก้ไฟล์ 002 ที่อาจถูกรันแล้ว) */
IF OBJECT_ID(N'dbo.brands', N'U') IS NULL
    THROW 51003, 'dbo.brands not found: run 002_brands.sql first.', 1;
GO

IF COL_LENGTH(N'dbo.brands', N'created_by') IS NULL
    ALTER TABLE dbo.brands ADD created_by BIGINT NULL, updated_by BIGINT NULL;
GO

IF OBJECT_ID(N'dbo.FK_brands_created_by', N'F') IS NULL
    ALTER TABLE dbo.brands ADD CONSTRAINT FK_brands_created_by FOREIGN KEY (created_by) REFERENCES dbo.users (id);
GO
IF OBJECT_ID(N'dbo.FK_brands_updated_by', N'F') IS NULL
    ALTER TABLE dbo.brands ADD CONSTRAINT FK_brands_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users (id);
GO

/* ประเภทปั๊ม: ใช้แยก Defect/Checklist ตามประเภท */
IF OBJECT_ID(N'dbo.pump_types', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.pump_types (
        id           INT           IDENTITY(1,1) NOT NULL,
        code         NVARCHAR(32)  NOT NULL,             -- เช่น PISTON, OIL_FREE, ROTARY
        name         NVARCHAR(100) NOT NULL,  -- Piston, Oil-free, Rotary, …
        is_active    BIT          NOT NULL CONSTRAINT DF_pump_types_is_active DEFAULT (1),            -- สถานะ: 1 ใช้งาน / 0 ปิด (ไม่ลบแถวจริง)
        created_at   DATETIME2(0) NOT NULL CONSTRAINT DF_pump_types_created_at DEFAULT (SYSUTCDATETIME()),  -- วันที่เพิ่ม (UTC)
        created_by   BIGINT       NULL,                                                              -- ผู้เพิ่ม (users.id)
        updated_at   DATETIME2(0) NOT NULL CONSTRAINT DF_pump_types_updated_at DEFAULT (SYSUTCDATETIME()),  -- วันที่แก้ไขล่าสุด (UTC) — แอปตั้งค่าทุกครั้งที่แก้
        updated_by   BIGINT       NULL,                                                              -- ผู้แก้ไขล่าสุด (users.id)
        CONSTRAINT PK_pump_types PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_pump_types_code UNIQUE (code),
        CONSTRAINT FK_pump_types_created_by FOREIGN KEY (created_by) REFERENCES dbo.users (id),
        CONSTRAINT FK_pump_types_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users (id)
    );
END
GO

/* ผู้ขาย/Supplier (KPI Vendor, NCP) */
IF OBJECT_ID(N'dbo.vendors', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.vendors (
        id           INT           IDENTITY(1,1) NOT NULL,
        name         NVARCHAR(200) NOT NULL,
        country      NVARCHAR(64)  NULL,
        is_active    BIT          NOT NULL CONSTRAINT DF_vendors_is_active DEFAULT (1),            -- สถานะ: 1 ใช้งาน / 0 ปิด (ไม่ลบแถวจริง)
        created_at   DATETIME2(0) NOT NULL CONSTRAINT DF_vendors_created_at DEFAULT (SYSUTCDATETIME()),  -- วันที่เพิ่ม (UTC)
        created_by   BIGINT       NULL,                                                              -- ผู้เพิ่ม (users.id)
        updated_at   DATETIME2(0) NOT NULL CONSTRAINT DF_vendors_updated_at DEFAULT (SYSUTCDATETIME()),  -- วันที่แก้ไขล่าสุด (UTC) — แอปตั้งค่าทุกครั้งที่แก้
        updated_by   BIGINT       NULL,                                                              -- ผู้แก้ไขล่าสุด (users.id)
        CONSTRAINT PK_vendors PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_vendors_name UNIQUE (name),
        CONSTRAINT FK_vendors_created_by FOREIGN KEY (created_by) REFERENCES dbo.users (id),
        CONSTRAINT FK_vendors_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users (id)
    );
END
GO

/* รุ่นปั๊ม (Model/SKU): ผูกยี่ห้อ + ประเภทปั๊ม + Template */
IF OBJECT_ID(N'dbo.models', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.models (
        id                 INT            IDENTITY(1,1) NOT NULL,
        code               NVARCHAR(64)   NOT NULL,       -- รหัสรุ่น/SKU
        description        NVARCHAR(400)  NULL,
        brand_id           INT            NOT NULL,
        pump_type_id       INT            NULL,           -- ว่างได้จนกว่าจะแมปจากไฟล์ QA
        origin             VARCHAR(10)    NOT NULL,       -- IMPORTED | DOMESTIC (ปั๊มนำเข้า / ผลิตเอง)
        default_aql_level  VARCHAR(10)    NULL,           -- NULL = ตามแหล่งที่มา (BR-03)
        qc_template_id     INT            NULL,           -- FK เพิ่มใน 005 (checklist_templates)
        qa_template_id     INT            NULL,
        is_scannable       BIT            NOT NULL CONSTRAINT DF_models_is_scannable DEFAULT (0),
        barcode_pattern    NVARCHAR(200)  NULL,
        display_fields     NVARCHAR(MAX)  NULL,  -- JSON: ฟิลด์ที่แสดงตอนตรวจ
        is_active    BIT          NOT NULL CONSTRAINT DF_models_is_active DEFAULT (1),            -- สถานะ: 1 ใช้งาน / 0 ปิด (ไม่ลบแถวจริง)
        created_at   DATETIME2(0) NOT NULL CONSTRAINT DF_models_created_at DEFAULT (SYSUTCDATETIME()),  -- วันที่เพิ่ม (UTC)
        created_by   BIGINT       NULL,                                                              -- ผู้เพิ่ม (users.id)
        updated_at   DATETIME2(0) NOT NULL CONSTRAINT DF_models_updated_at DEFAULT (SYSUTCDATETIME()),  -- วันที่แก้ไขล่าสุด (UTC) — แอปตั้งค่าทุกครั้งที่แก้
        updated_by   BIGINT       NULL,                                                              -- ผู้แก้ไขล่าสุด (users.id)
        CONSTRAINT PK_models PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_models_code UNIQUE (code),
        CONSTRAINT FK_models_brand FOREIGN KEY (brand_id) REFERENCES dbo.brands (id),
        CONSTRAINT FK_models_pump_type FOREIGN KEY (pump_type_id) REFERENCES dbo.pump_types (id),
        CONSTRAINT CK_models_origin CHECK (origin IN ('IMPORTED', 'DOMESTIC')),
        CONSTRAINT CK_models_aql CHECK (default_aql_level IS NULL OR default_aql_level IN ('REDUCED', 'NORMAL', 'TIGHTENED')),
        CONSTRAINT CK_models_display_json CHECK (display_fields IS NULL OR ISJSON(display_fields) = 1),
        CONSTRAINT FK_models_created_by FOREIGN KEY (created_by) REFERENCES dbo.users (id),
        CONSTRAINT FK_models_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users (id)
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_models_brand' AND object_id = OBJECT_ID(N'dbo.models'))
    CREATE INDEX IX_models_brand ON dbo.models (brand_id) INCLUDE (is_active);
GO
