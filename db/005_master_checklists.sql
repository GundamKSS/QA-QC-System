/*
  QCheck — 005: checklist_templates, template_versions, checklist_items, header_fields  (SQL Server)
  Spec: docs/03 §3.1 (Master data) · คอลัมน์มาตรฐาน docs/03 §3.0: สถานะ + วันที่เพิ่ม + วันที่แก้ไข (+ ผู้ทำ)
  - ตามรูปแบบของ 002_brands.sql: INT IDENTITY, ชื่อ constraint DF_/PK_/UQ_/CK_/FK_, รันซ้ำได้
  - ไม่ใช้ trigger ตั้ง updated_at: INSERT/MERGE ... OUTPUT ใช้กับตารางที่มี trigger ไม่ได้ (error 334)
    → ชั้นแอปตั้ง updated_at = SYSUTCDATETIME() และ updated_by ทุกครั้งที่แก้ไข
  - ยังไม่ได้รันกับ SQL Server จริง
*/

IF OBJECT_ID(N'dbo.users', N'U') IS NULL
    THROW 51001, 'dbo.users not found: run 001_users.sql first and make sure you are in the QCheck database.', 1;
GO

IF OBJECT_ID(N'dbo.models', N'U') IS NULL
    THROW 51004, 'dbo.models not found: run 004_master_catalog.sql first.', 1;
GO

IF OBJECT_ID(N'dbo.checklist_templates', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.checklist_templates (
        id                  INT            IDENTITY(1,1) NOT NULL,
        code                NVARCHAR(64)   NOT NULL,
        name                NVARCHAR(200)  NOT NULL,
        role                VARCHAR(2)     NOT NULL,        -- QC | QA
        scope               NVARCHAR(100)  NULL,            -- ประเภทปั๊ม หรือ แผนก 408 / 409 / FG
        current_version_id  INT            NULL,  -- เวอร์ชันที่ Publish ล่าสุด (FK เพิ่มด้านล่าง)
        is_active    BIT          NOT NULL CONSTRAINT DF_checklist_templates_is_active DEFAULT (1),            -- สถานะ: 1 ใช้งาน / 0 ปิด (ไม่ลบแถวจริง)
        created_at   DATETIME2(0) NOT NULL CONSTRAINT DF_checklist_templates_created_at DEFAULT (SYSUTCDATETIME()),  -- วันที่เพิ่ม (UTC)
        created_by   BIGINT       NULL,                                                              -- ผู้เพิ่ม (users.id)
        updated_at   DATETIME2(0) NOT NULL CONSTRAINT DF_checklist_templates_updated_at DEFAULT (SYSUTCDATETIME()),  -- วันที่แก้ไขล่าสุด (UTC) — แอปตั้งค่าทุกครั้งที่แก้
        updated_by   BIGINT       NULL,                                                              -- ผู้แก้ไขล่าสุด (users.id)
        CONSTRAINT PK_checklist_templates PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_checklist_templates_code UNIQUE (code),
        CONSTRAINT CK_checklist_templates_role CHECK (role IN ('QC', 'QA')),
        CONSTRAINT FK_checklist_templates_created_by FOREIGN KEY (created_by) REFERENCES dbo.users (id),
        CONSTRAINT FK_checklist_templates_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users (id)
    );
END
GO

/* เวอร์ชันของ Template: Publish แล้วแก้ไม่ได้ (BR-20) — สถานะอยู่ในคอลัมน์ status */
IF OBJECT_ID(N'dbo.template_versions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.template_versions (
        id             INT          IDENTITY(1,1) NOT NULL,
        template_id    INT          NOT NULL,
        version_no     INT          NOT NULL,
        status         VARCHAR(10)  NOT NULL CONSTRAINT DF_template_versions_status DEFAULT ('DRAFT'),  -- สถานะวงจรเวอร์ชัน
        published_at   DATETIME2(0) NULL,
        published_by   BIGINT       NULL,
        source         VARCHAR(8)   NOT NULL,  -- IMPORT | BUILDER
        created_at   DATETIME2(0) NOT NULL CONSTRAINT DF_template_versions_created_at DEFAULT (SYSUTCDATETIME()),  -- วันที่เพิ่ม (UTC)
        created_by   BIGINT       NULL,                                                              -- ผู้เพิ่ม (users.id)
        updated_at   DATETIME2(0) NOT NULL CONSTRAINT DF_template_versions_updated_at DEFAULT (SYSUTCDATETIME()),  -- วันที่แก้ไขล่าสุด (UTC) — แอปตั้งค่าทุกครั้งที่แก้
        updated_by   BIGINT       NULL,                                                              -- ผู้แก้ไขล่าสุด (users.id)
        CONSTRAINT PK_template_versions PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_template_versions_no UNIQUE (template_id, version_no),
        CONSTRAINT FK_template_versions_template FOREIGN KEY (template_id) REFERENCES dbo.checklist_templates (id),
        CONSTRAINT FK_template_versions_published_by FOREIGN KEY (published_by) REFERENCES dbo.users (id),
        CONSTRAINT CK_template_versions_status CHECK (status IN ('DRAFT', 'PUBLISHED', 'RETIRED')),
        CONSTRAINT CK_template_versions_source CHECK (source IN ('IMPORT', 'BUILDER')),
        CONSTRAINT FK_template_versions_created_by FOREIGN KEY (created_by) REFERENCES dbo.users (id),
        CONSTRAINT FK_template_versions_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users (id)
    );
END
GO

IF OBJECT_ID(N'dbo.FK_checklist_templates_current', N'F') IS NULL
    ALTER TABLE dbo.checklist_templates ADD CONSTRAINT FK_checklist_templates_current FOREIGN KEY (current_version_id) REFERENCES dbo.template_versions (id);
GO
IF OBJECT_ID(N'dbo.FK_models_qc_template', N'F') IS NULL
    ALTER TABLE dbo.models ADD CONSTRAINT FK_models_qc_template FOREIGN KEY (qc_template_id) REFERENCES dbo.checklist_templates (id);
GO
IF OBJECT_ID(N'dbo.FK_models_qa_template', N'F') IS NULL
    ALTER TABLE dbo.models ADD CONSTRAINT FK_models_qa_template FOREIGN KEY (qa_template_id) REFERENCES dbo.checklist_templates (id);
GO

IF OBJECT_ID(N'dbo.checklist_items', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.checklist_items (
        id           INT            IDENTITY(1,1) NOT NULL,
        version_id   INT            NOT NULL,
        seq          INT            NOT NULL,             -- ลำดับในเวอร์ชัน
        topic_code   NVARCHAR(32)   NULL,
        title        NVARCHAR(400)  NOT NULL,
        input_type   VARCHAR(10)    NOT NULL,             -- PASS_FAIL | NUMBER | TEXT | SELECT | DISPLAY
        is_required  BIT            NOT NULL CONSTRAINT DF_checklist_items_required DEFAULT (1),
        photo_rule   VARCHAR(10)    NOT NULL CONSTRAINT DF_checklist_items_photo DEFAULT ('NONE'),   -- NONE | ON_FAIL | ALWAYS
        video_rule   VARCHAR(10)    NOT NULL CONSTRAINT DF_checklist_items_video DEFAULT ('NONE'),
        help_text    NVARCHAR(1000) NULL,
        example_image NVARCHAR(400) NULL,  -- storage key
        is_active    BIT          NOT NULL CONSTRAINT DF_checklist_items_is_active DEFAULT (1),            -- สถานะ: 1 ใช้งาน / 0 ปิด (ไม่ลบแถวจริง)
        created_at   DATETIME2(0) NOT NULL CONSTRAINT DF_checklist_items_created_at DEFAULT (SYSUTCDATETIME()),  -- วันที่เพิ่ม (UTC)
        created_by   BIGINT       NULL,                                                              -- ผู้เพิ่ม (users.id)
        updated_at   DATETIME2(0) NOT NULL CONSTRAINT DF_checklist_items_updated_at DEFAULT (SYSUTCDATETIME()),  -- วันที่แก้ไขล่าสุด (UTC) — แอปตั้งค่าทุกครั้งที่แก้
        updated_by   BIGINT       NULL,                                                              -- ผู้แก้ไขล่าสุด (users.id)
        CONSTRAINT PK_checklist_items PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_checklist_items_seq UNIQUE (version_id, seq),
        CONSTRAINT FK_checklist_items_version FOREIGN KEY (version_id) REFERENCES dbo.template_versions (id),
        CONSTRAINT CK_checklist_items_type CHECK (input_type IN ('PASS_FAIL', 'NUMBER', 'TEXT', 'SELECT', 'DISPLAY')),
        CONSTRAINT CK_checklist_items_photo CHECK (photo_rule IN ('NONE', 'ON_FAIL', 'ALWAYS')),
        CONSTRAINT CK_checklist_items_video CHECK (video_rule IN ('NONE', 'ON_FAIL', 'ALWAYS')),
        CONSTRAINT FK_checklist_items_created_by FOREIGN KEY (created_by) REFERENCES dbo.users (id),
        CONSTRAINT FK_checklist_items_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users (id)
    );
END
GO

/* ฟิลด์หัวใบตรวจ (Serial ปั๊ม/มอเตอร์ ฯลฯ) */
IF OBJECT_ID(N'dbo.header_fields', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.header_fields (
        id           INT           IDENTITY(1,1) NOT NULL,
        version_id   INT           NOT NULL,
        field_key    VARCHAR(48)   NOT NULL,                -- serial_pump, serial_motor, …
        label        NVARCHAR(200) NOT NULL,
        scan_enabled BIT           NOT NULL CONSTRAINT DF_header_fields_scan DEFAULT (0),
        is_required  BIT           NOT NULL CONSTRAINT DF_header_fields_required DEFAULT (0),
        is_active    BIT          NOT NULL CONSTRAINT DF_header_fields_is_active DEFAULT (1),            -- สถานะ: 1 ใช้งาน / 0 ปิด (ไม่ลบแถวจริง)
        created_at   DATETIME2(0) NOT NULL CONSTRAINT DF_header_fields_created_at DEFAULT (SYSUTCDATETIME()),  -- วันที่เพิ่ม (UTC)
        created_by   BIGINT       NULL,                                                              -- ผู้เพิ่ม (users.id)
        updated_at   DATETIME2(0) NOT NULL CONSTRAINT DF_header_fields_updated_at DEFAULT (SYSUTCDATETIME()),  -- วันที่แก้ไขล่าสุด (UTC) — แอปตั้งค่าทุกครั้งที่แก้
        updated_by   BIGINT       NULL,                                                              -- ผู้แก้ไขล่าสุด (users.id)
        CONSTRAINT PK_header_fields PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_header_fields_key UNIQUE (version_id, field_key),
        CONSTRAINT FK_header_fields_version FOREIGN KEY (version_id) REFERENCES dbo.template_versions (id),
        CONSTRAINT FK_header_fields_created_by FOREIGN KEY (created_by) REFERENCES dbo.users (id),
        CONSTRAINT FK_header_fields_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users (id)
    );
END
GO
