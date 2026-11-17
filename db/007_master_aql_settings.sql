/*
  QCheck — 007: aql_table, complexity_levels, severity_addons, master_snapshots, settings  (SQL Server)
  Spec: docs/03 §3.1 (Master data) · คอลัมน์มาตรฐาน docs/03 §3.0: สถานะ + วันที่เพิ่ม + วันที่แก้ไข (+ ผู้ทำ)
  - ตามรูปแบบของ 002_brands.sql: INT IDENTITY, ชื่อ constraint DF_/PK_/UQ_/CK_/FK_, รันซ้ำได้
  - ไม่ใช้ trigger ตั้ง updated_at: INSERT/MERGE ... OUTPUT ใช้กับตารางที่มี trigger ไม่ได้ (error 334)
    → ชั้นแอปตั้ง updated_at = SYSUTCDATETIME() และ updated_by ทุกครั้งที่แก้ไข
  - ยังไม่ได้รันกับ SQL Server จริง
*/

IF OBJECT_ID(N'dbo.users', N'U') IS NULL
    THROW 51001, 'dbo.users not found: run 001_users.sql first and make sure you are in the QCheck database.', 1;
GO

/* ตาราง AQL (ค่าจริงรอไฟล์จาก QA) */
IF OBJECT_ID(N'dbo.aql_table', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.aql_table (
        id           INT         NOT NULL IDENTITY(1,1),
        level        VARCHAR(10) NOT NULL,                 -- REDUCED | NORMAL | TIGHTENED
        lot_min      INT         NOT NULL,
        lot_max      INT         NOT NULL,
        code_letter  VARCHAR(2)  NOT NULL,                 -- ตัวอักษรรหัสขนาดตัวอย่าง (ISO 2859-1)
        sample_size  INT         NOT NULL,
        ac           INT         NOT NULL,                 -- Accept
        re           INT         NOT NULL,  -- Reject
        is_active    BIT          NOT NULL CONSTRAINT DF_aql_table_is_active DEFAULT (1),            -- สถานะ: 1 ใช้งาน / 0 ปิด (ไม่ลบแถวจริง)
        created_at   DATETIME2(0) NOT NULL CONSTRAINT DF_aql_table_created_at DEFAULT (SYSUTCDATETIME()),  -- วันที่เพิ่ม (UTC)
        created_by   BIGINT       NULL,                                                              -- ผู้เพิ่ม (users.id)
        updated_at   DATETIME2(0) NOT NULL CONSTRAINT DF_aql_table_updated_at DEFAULT (SYSUTCDATETIME()),  -- วันที่แก้ไขล่าสุด (UTC) — แอปตั้งค่าทุกครั้งที่แก้
        updated_by   BIGINT       NULL,                                                              -- ผู้แก้ไขล่าสุด (users.id)
        CONSTRAINT PK_aql_table PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_aql_table UNIQUE (level, lot_min),
        CONSTRAINT CK_aql_table_level CHECK (level IN ('REDUCED', 'NORMAL', 'TIGHTENED')),
        CONSTRAINT CK_aql_table_range CHECK (lot_min >= 1 AND lot_max >= lot_min),
        CONSTRAINT CK_aql_table_accept CHECK (ac >= 0 AND re > ac AND sample_size >= 1),
        CONSTRAINT FK_aql_table_created_by FOREIGN KEY (created_by) REFERENCES dbo.users (id),
        CONSTRAINT FK_aql_table_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users (id)
    );
END
GO

/* ค่าแรง (man-day) ต่อระดับความซับซ้อน BR-21 */
IF OBJECT_ID(N'dbo.complexity_levels', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.complexity_levels (
        level   TINYINT      NOT NULL,                     -- 1–4
        manday  DECIMAL(6,2) NOT NULL,
        is_active    BIT          NOT NULL CONSTRAINT DF_complexity_levels_is_active DEFAULT (1),            -- สถานะ: 1 ใช้งาน / 0 ปิด (ไม่ลบแถวจริง)
        created_at   DATETIME2(0) NOT NULL CONSTRAINT DF_complexity_levels_created_at DEFAULT (SYSUTCDATETIME()),  -- วันที่เพิ่ม (UTC)
        created_by   BIGINT       NULL,                                                              -- ผู้เพิ่ม (users.id)
        updated_at   DATETIME2(0) NOT NULL CONSTRAINT DF_complexity_levels_updated_at DEFAULT (SYSUTCDATETIME()),  -- วันที่แก้ไขล่าสุด (UTC) — แอปตั้งค่าทุกครั้งที่แก้
        updated_by   BIGINT       NULL,                                                              -- ผู้แก้ไขล่าสุด (users.id)
        CONSTRAINT PK_complexity_levels PRIMARY KEY CLUSTERED (level),
        CONSTRAINT CK_complexity_levels_level CHECK (level BETWEEN 1 AND 4),
        CONSTRAINT CK_complexity_levels_manday CHECK (manday >= 0),
        CONSTRAINT FK_complexity_levels_created_by FOREIGN KEY (created_by) REFERENCES dbo.users (id),
        CONSTRAINT FK_complexity_levels_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users (id)
    );
END
GO

/* ค่าแรงเพิ่มตามความรุนแรง BR-21 */
IF OBJECT_ID(N'dbo.severity_addons', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.severity_addons (
        severity  VARCHAR(8)   NOT NULL,                   -- MINOR | MAJOR | CRITICAL
        manday    DECIMAL(6,2) NOT NULL,
        is_active    BIT          NOT NULL CONSTRAINT DF_severity_addons_is_active DEFAULT (1),            -- สถานะ: 1 ใช้งาน / 0 ปิด (ไม่ลบแถวจริง)
        created_at   DATETIME2(0) NOT NULL CONSTRAINT DF_severity_addons_created_at DEFAULT (SYSUTCDATETIME()),  -- วันที่เพิ่ม (UTC)
        created_by   BIGINT       NULL,                                                              -- ผู้เพิ่ม (users.id)
        updated_at   DATETIME2(0) NOT NULL CONSTRAINT DF_severity_addons_updated_at DEFAULT (SYSUTCDATETIME()),  -- วันที่แก้ไขล่าสุด (UTC) — แอปตั้งค่าทุกครั้งที่แก้
        updated_by   BIGINT       NULL,                                                              -- ผู้แก้ไขล่าสุด (users.id)
        CONSTRAINT PK_severity_addons PRIMARY KEY CLUSTERED (severity),
        CONSTRAINT CK_severity_addons_severity CHECK (severity IN ('MINOR', 'MAJOR', 'CRITICAL')),
        CONSTRAINT CK_severity_addons_manday CHECK (manday >= 0),
        CONSTRAINT FK_severity_addons_created_by FOREIGN KEY (created_by) REFERENCES dbo.users (id),
        CONSTRAINT FK_severity_addons_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users (id)
    );
END
GO

/* ภาพถ่าย Master ที่แผนใช้ — สร้างแล้วไม่แก้ (BR-20) */
IF OBJECT_ID(N'dbo.master_snapshots', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.master_snapshots (
        id       INT           NOT NULL IDENTITY(1,1),
        payload  NVARCHAR(MAX) NOT NULL,  -- JSON ของ Defect + Disposition ที่ใช้ตอนรับงาน (BR-20)
        is_active    BIT          NOT NULL CONSTRAINT DF_master_snapshots_is_active DEFAULT (1),            -- สถานะ: 1 ใช้งาน / 0 ปิด (ไม่ลบแถวจริง)
        created_at   DATETIME2(0) NOT NULL CONSTRAINT DF_master_snapshots_created_at DEFAULT (SYSUTCDATETIME()),  -- วันที่เพิ่ม (UTC)
        created_by   BIGINT       NULL,                                                              -- ผู้เพิ่ม (users.id)
        updated_at   DATETIME2(0) NOT NULL CONSTRAINT DF_master_snapshots_updated_at DEFAULT (SYSUTCDATETIME()),  -- วันที่แก้ไขล่าสุด (UTC) — แอปตั้งค่าทุกครั้งที่แก้
        updated_by   BIGINT       NULL,                                                              -- ผู้แก้ไขล่าสุด (users.id)
        CONSTRAINT PK_master_snapshots PRIMARY KEY CLUSTERED (id),
        CONSTRAINT CK_master_snapshots_json CHECK (ISJSON(payload) = 1),
        CONSTRAINT FK_master_snapshots_created_by FOREIGN KEY (created_by) REFERENCES dbo.users (id),
        CONSTRAINT FK_master_snapshots_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users (id)
    );
END
GO

/* ค่าตั้งระบบ ⚙️ (docs/03 `settings`) */
IF OBJECT_ID(N'dbo.settings', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.settings (
        setting_key    VARCHAR(64)   NOT NULL,             -- เช่น qc_percent, report_required_by_origin
        setting_value  NVARCHAR(MAX) NULL,
        description    NVARCHAR(400) NULL,
        is_active    BIT          NOT NULL CONSTRAINT DF_settings_is_active DEFAULT (1),            -- สถานะ: 1 ใช้งาน / 0 ปิด (ไม่ลบแถวจริง)
        created_at   DATETIME2(0) NOT NULL CONSTRAINT DF_settings_created_at DEFAULT (SYSUTCDATETIME()),  -- วันที่เพิ่ม (UTC)
        created_by   BIGINT       NULL,                                                              -- ผู้เพิ่ม (users.id)
        updated_at   DATETIME2(0) NOT NULL CONSTRAINT DF_settings_updated_at DEFAULT (SYSUTCDATETIME()),  -- วันที่แก้ไขล่าสุด (UTC) — แอปตั้งค่าทุกครั้งที่แก้
        updated_by   BIGINT       NULL,                                                              -- ผู้แก้ไขล่าสุด (users.id)
        CONSTRAINT PK_settings PRIMARY KEY CLUSTERED (setting_key),
        CONSTRAINT FK_settings_created_by FOREIGN KEY (created_by) REFERENCES dbo.users (id),
        CONSTRAINT FK_settings_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users (id)
    );
END
GO
