/*
  QCheck — 017: ตารางผลการตรวจรับคุณภาพรายเครื่อง (Unit Inspections & Findings)  (SQL Server)
  Spec: docs/03 BR-04, BR-05, BR-18, §3.1 · FR-QC-01..15 (WBS 1.8)
  - unit_inspections: ผลการตรวจรายเครื่อง (Serial ปั๊ม, มอเตอร์, วิธีกรอก, ผู้ตรวจ, ผล Pass/Concession/Not Passed, Action Rework/Reject)
  - item_results: ผลตรวจรายหัวข้อ Checklist ของเครื่องนั้น (NORMAL / FAIL, ค่าที่วัดได้)
  - item_defect_results: รายการอาการ Defect ที่พบในแต่ละหัวข้อ (เชื่อมโยง item_defects, defects, severity, disposition)
  - media: รูปถ่ายและวิดีโอหลักฐานของการตรวจ (ผูกกับ item_results, ลายน้ำ, pHash สำหรับกันรูปซ้ำ)
  - ไม่แก้ไฟล์ก่อนหน้า · รันซ้ำได้
*/

IF OBJECT_ID(N'dbo.plans', N'U') IS NULL OR OBJECT_ID(N'dbo.work_orders', N'U') IS NULL OR OBJECT_ID(N'dbo.template_versions', N'U') IS NULL OR OBJECT_ID(N'dbo.checklist_items', N'U') IS NULL OR OBJECT_ID(N'dbo.defects', N'U') IS NULL
    THROW 51170, '017 needs dbo.plans, dbo.work_orders, dbo.template_versions, dbo.checklist_items, and dbo.defects (run earlier migrations first).', 1;
GO

/* 1. ผลการตรวจรายเครื่อง (1 เครื่อง = 1 Serial ปั๊ม) */
IF OBJECT_ID(N'dbo.unit_inspections', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.unit_inspections (
        id                    UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_unit_inspections_id DEFAULT (NEWSEQUENTIALID()),
        plan_id               BIGINT           NOT NULL,
        work_order_id         UNIQUEIDENTIFIER NULL,                  -- ใบงาน QC (QC มีใบงานเสมอ, QA อาจไม่มีในเฟสแรก)
        role                  VARCHAR(8)       NOT NULL CONSTRAINT DF_unit_inspections_role DEFAULT ('QC'),     -- QC | QA
        cycle_no              INT              NOT NULL CONSTRAINT DF_unit_inspections_cycle_no DEFAULT (1),    -- รอบตรวจของล็อต (Phase 2)
        round_no              INT              NOT NULL CONSTRAINT DF_unit_inspections_round_no DEFAULT (1),    -- รอบตรวจ: 1 ตรวจครั้งแรก, 2 ตรวจซ้ำหลังซ่อม
        parent_inspection_id  UNIQUEIDENTIFIER NULL,                  -- อ้างอิงผลตรวจรอบก่อนหน้า (กรณี round_no > 1)
        inspection_no         INT              NULL,                  -- ลำดับเครื่องที่ตรวจในแผน
        serial_pump           NVARCHAR(64)     NOT NULL,              -- Serial ปั๊ม (บังคับ)
        serial_motor          NVARCHAR(64)     NULL,                  -- Serial มอเตอร์
        serial_supplier       NVARCHAR(64)     NULL,                  -- Serial ผู้ผลิตต่างประเทศ (ถ้ามี)
        motor_brand           NVARCHAR(64)     NULL,
        motor_hp              NVARCHAR(32)     NULL,
        motor_voltage         NVARCHAR(32)     NULL,
        serial_entry_mode     VARCHAR(16)      NOT NULL CONSTRAINT DF_unit_inspections_serial_entry_mode DEFAULT ('MANUAL'), -- SCAN_CAMERA | SCAN_WEDGE | MANUAL
        entry_mode            VARCHAR(16)      NOT NULL CONSTRAINT DF_unit_inspections_entry_mode DEFAULT ('LIVE'),          -- LIVE | PAPER_BACKFILL
        actual_inspected_at   DATETIME2(0)     NULL,                  -- เวลาตรวจจริง (กรณีบันทึกย้อนหลังจากกระดาษ)
        template_version_id   INT              NOT NULL,              -- เวอร์ชัน Checklist ที่ใช้ตรวจ ณ ขณะนั้น
        inspector_id          BIGINT           NOT NULL,              -- ผู้ตรวจ (users.id)
        started_at            DATETIME2(0)     NOT NULL CONSTRAINT DF_unit_inspections_started_at DEFAULT (SYSUTCDATETIME()),
        submitted_at          DATETIME2(0)     NULL,
        result                VARCHAR(16)      NOT NULL,              -- PASS | CONCESSION | NOT_PASSED (คำนวณตาม BR-04)
        action                VARCHAR(10)      NULL,                  -- REWORK | REJECT (กรณี NOT_PASSED)
        suggested_action      VARCHAR(10)      NULL,                  -- REWORK | REJECT (ที่ระบบเสนอ)
        flags                 NVARCHAR(MAX)    NULL,                  -- JSON: { duplicate_photo: bool, master_changed: bool, ... }
        device_id             NVARCHAR(64)     NULL,
        status                VARCHAR(16)      NOT NULL CONSTRAINT DF_unit_inspections_status DEFAULT ('COMPLETED'), -- IN_PROGRESS | COMPLETED | CANCELLED
        created_at            DATETIME2(0)     NOT NULL CONSTRAINT DF_unit_inspections_created_at DEFAULT (SYSUTCDATETIME()),
        created_by            BIGINT           NULL,
        updated_at            DATETIME2(0)     NOT NULL CONSTRAINT DF_unit_inspections_updated_at DEFAULT (SYSUTCDATETIME()),
        updated_by            BIGINT           NULL,
        CONSTRAINT PK_unit_inspections PRIMARY KEY CLUSTERED (id),
        CONSTRAINT CK_unit_inspections_role CHECK (role IN ('QC', 'QA')),
        CONSTRAINT CK_unit_inspections_cycle_no CHECK (cycle_no >= 1),
        CONSTRAINT CK_unit_inspections_round_no CHECK (round_no >= 1),
        CONSTRAINT CK_unit_inspections_serial_entry_mode CHECK (serial_entry_mode IN ('SCAN_CAMERA', 'SCAN_WEDGE', 'MANUAL')),
        CONSTRAINT CK_unit_inspections_entry_mode CHECK (entry_mode IN ('LIVE', 'PAPER_BACKFILL')),
        CONSTRAINT CK_unit_inspections_result CHECK (result IN ('PASS', 'CONCESSION', 'NOT_PASSED')),
        CONSTRAINT CK_unit_inspections_action CHECK (action IS NULL OR action IN ('REWORK', 'REJECT')),
        CONSTRAINT CK_unit_inspections_suggested_action CHECK (suggested_action IS NULL OR suggested_action IN ('REWORK', 'REJECT')),
        CONSTRAINT CK_unit_inspections_status CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
        CONSTRAINT FK_unit_inspections_plan FOREIGN KEY (plan_id) REFERENCES dbo.plans (id),
        CONSTRAINT FK_unit_inspections_work_order FOREIGN KEY (work_order_id) REFERENCES dbo.work_orders (id),
        CONSTRAINT FK_unit_inspections_parent FOREIGN KEY (parent_inspection_id) REFERENCES dbo.unit_inspections (id),
        CONSTRAINT FK_unit_inspections_template_version FOREIGN KEY (template_version_id) REFERENCES dbo.template_versions (id),
        CONSTRAINT FK_unit_inspections_inspector FOREIGN KEY (inspector_id) REFERENCES dbo.users (id),
        CONSTRAINT FK_unit_inspections_created_by FOREIGN KEY (created_by) REFERENCES dbo.users (id),
        CONSTRAINT FK_unit_inspections_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users (id)
    );
END
GO

/* BR-18: Serial ปั๊มไม่ซ้ำใน (แผน, บทบาท, cycle, round) สำหรับรายการที่ยังไม่ถูกยกเลิก */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_unit_inspections_plan_serial' AND object_id = OBJECT_ID(N'dbo.unit_inspections'))
    CREATE UNIQUE INDEX UX_unit_inspections_plan_serial
        ON dbo.unit_inspections (plan_id, role, cycle_no, round_no, serial_pump)
     WHERE status <> 'CANCELLED';
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_unit_inspections_work_order' AND object_id = OBJECT_ID(N'dbo.unit_inspections'))
    CREATE INDEX IX_unit_inspections_work_order ON dbo.unit_inspections (work_order_id, submitted_at);
GO


/* 2. ผลตรวจรายหัวข้อ Checklist */
IF OBJECT_ID(N'dbo.item_results', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.item_results (
        id                  UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_item_results_id DEFAULT (NEWSEQUENTIALID()),
        unit_inspection_id  UNIQUEIDENTIFIER NOT NULL,
        item_id             INT              NOT NULL,
        status              VARCHAR(10)      NOT NULL,      -- NORMAL | FAIL
        value               NVARCHAR(500)    NULL,          -- ค่าตัวเลข/ข้อความที่กรอก (ถ้ามี)
        remark              NVARCHAR(500)    NULL,          -- หมายเหตุเพิ่มเติม
        created_at          DATETIME2(0)     NOT NULL CONSTRAINT DF_item_results_created_at DEFAULT (SYSUTCDATETIME()),
        created_by          BIGINT           NULL,
        updated_at          DATETIME2(0)     NOT NULL CONSTRAINT DF_item_results_updated_at DEFAULT (SYSUTCDATETIME()),
        updated_by          BIGINT           NULL,
        CONSTRAINT PK_item_results PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_item_results_inspection_item UNIQUE (unit_inspection_id, item_id),
        CONSTRAINT CK_item_results_status CHECK (status IN ('NORMAL', 'FAIL')),
        CONSTRAINT FK_item_results_inspection FOREIGN KEY (unit_inspection_id) REFERENCES dbo.unit_inspections (id) ON DELETE CASCADE,
        CONSTRAINT FK_item_results_item FOREIGN KEY (item_id) REFERENCES dbo.checklist_items (id),
        CONSTRAINT FK_item_results_created_by FOREIGN KEY (created_by) REFERENCES dbo.users (id),
        CONSTRAINT FK_item_results_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users (id)
    );
END
GO


/* 3. อาการ Defect ที่พบในแต่ละหัวข้อ */
IF OBJECT_ID(N'dbo.item_defect_results', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.item_defect_results (
        id                  UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_item_defect_results_id DEFAULT (NEWSEQUENTIALID()),
        item_result_id      UNIQUEIDENTIFIER NOT NULL,
        item_defect_id      INT              NULL,          -- ลิงก์ item_defects ที่เลือก (รู้ชิ้นส่วน/ความรุนแรง)
        defect_id           INT              NOT NULL,      -- รหัสอาการกลาง (defects.id)
        disposition_applied VARCHAR(10)      NOT NULL,      -- CONCESSION | REWORK | REJECT | CHOOSE
        severity            VARCHAR(8)       NOT NULL,      -- MINOR | MAJOR | CRITICAL
        cause_tag           VARCHAR(16)      NULL,          -- SUPPLIER | TRANSPORT | INTERNAL | UNKNOWN
        location_note       NVARCHAR(200)    NULL,          -- ระบุตำแหน่งที่พบ (ไม่บังคับ)
        fix_method_id       INT              NULL,          -- วิธีแก้ไข
        fix_note            NVARCHAR(500)    NULL,
        is_active           BIT              NOT NULL CONSTRAINT DF_item_defect_results_is_active DEFAULT (1),
        created_at          DATETIME2(0)     NOT NULL CONSTRAINT DF_item_defect_results_created_at DEFAULT (SYSUTCDATETIME()),
        created_by          BIGINT           NULL,
        updated_at          DATETIME2(0)     NOT NULL CONSTRAINT DF_item_defect_results_updated_at DEFAULT (SYSUTCDATETIME()),
        updated_by          BIGINT           NULL,
        CONSTRAINT PK_item_defect_results PRIMARY KEY CLUSTERED (id),
        CONSTRAINT CK_item_defect_results_disposition CHECK (disposition_applied IN ('CONCESSION', 'REWORK', 'REJECT', 'CHOOSE')),
        CONSTRAINT CK_item_defect_results_severity CHECK (severity IN ('MINOR', 'MAJOR', 'CRITICAL')),
        CONSTRAINT CK_item_defect_results_cause CHECK (cause_tag IS NULL OR cause_tag IN ('SUPPLIER', 'TRANSPORT', 'INTERNAL', 'UNKNOWN')),
        CONSTRAINT FK_item_defect_results_item_result FOREIGN KEY (item_result_id) REFERENCES dbo.item_results (id) ON DELETE CASCADE,
        CONSTRAINT FK_item_defect_results_item_defect FOREIGN KEY (item_defect_id) REFERENCES dbo.item_defects (id),
        CONSTRAINT FK_item_defect_results_defect FOREIGN KEY (defect_id) REFERENCES dbo.defects (id),
        CONSTRAINT FK_item_defect_results_fix_method FOREIGN KEY (fix_method_id) REFERENCES dbo.fix_methods (id),
        CONSTRAINT FK_item_defect_results_created_by FOREIGN KEY (created_by) REFERENCES dbo.users (id),
        CONSTRAINT FK_item_defect_results_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users (id)
    );
END
GO


/* 4. ไฟล์รูปภาพและวิดีโอหลักฐาน (ผูกกับ item_results หรือ rework) */
IF OBJECT_ID(N'dbo.media', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.media (
        id             UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_media_id DEFAULT (NEWSEQUENTIALID()),
        owner_type     VARCHAR(24)      NOT NULL,      -- INSPECTION_ITEM | REWORK_ORDER | PLAN
        owner_id       UNIQUEIDENTIFIER NOT NULL,      -- ID ของ entity เจ้าของ (เช่น item_result_id)
        kind           VARCHAR(10)      NOT NULL,      -- PHOTO | VIDEO
        storage_key    NVARCHAR(500)    NOT NULL,      -- Path/URI หรือ storage key
        mime           VARCHAR(64)      NOT NULL,      -- image/jpeg, image/webp, video/mp4, video/webm
        bytes          BIGINT           NOT NULL CONSTRAINT DF_media_bytes DEFAULT (0),
        sha256         VARCHAR(64)      NULL,
        phash          VARCHAR(64)      NULL,          -- ตรวจรูปซ้ำ (BR-05a)
        captured_at    DATETIME2(0)     NOT NULL CONSTRAINT DF_media_captured_at DEFAULT (SYSUTCDATETIME()),
        uploaded_at    DATETIME2(0)     NOT NULL CONSTRAINT DF_media_uploaded_at DEFAULT (SYSUTCDATETIME()),
        capture_mode   VARCHAR(16)      NOT NULL CONSTRAINT DF_media_capture_mode DEFAULT ('IN_APP'), -- IN_APP | FILE_UPLOAD
        status         VARCHAR(16)      NOT NULL CONSTRAINT DF_media_status DEFAULT ('ACTIVE'),       -- ACTIVE | ARCHIVED | DELETED
        created_at     DATETIME2(0)     NOT NULL CONSTRAINT DF_media_created_at DEFAULT (SYSUTCDATETIME()),
        created_by     BIGINT           NULL,
        updated_at     DATETIME2(0)     NOT NULL CONSTRAINT DF_media_updated_at DEFAULT (SYSUTCDATETIME()),
        updated_by     BIGINT           NULL,
        CONSTRAINT PK_media PRIMARY KEY CLUSTERED (id),
        CONSTRAINT CK_media_owner_type CHECK (owner_type IN ('INSPECTION_ITEM', 'REWORK_ORDER', 'PLAN')),
        CONSTRAINT CK_media_kind CHECK (kind IN ('PHOTO', 'VIDEO')),
        CONSTRAINT CK_media_capture_mode CHECK (capture_mode IN ('IN_APP', 'FILE_UPLOAD')),
        CONSTRAINT CK_media_status CHECK (status IN ('ACTIVE', 'ARCHIVED', 'DELETED')),
        CONSTRAINT FK_media_created_by FOREIGN KEY (created_by) REFERENCES dbo.users (id),
        CONSTRAINT FK_media_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users (id)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_media_owner' AND object_id = OBJECT_ID(N'dbo.media'))
    CREATE INDEX IX_media_owner ON dbo.media (owner_type, owner_id);
GO
