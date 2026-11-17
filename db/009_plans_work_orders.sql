/*
  QCheck — 009: เปิดแผน + ใบงาน — receipt_docs, plans, plan_status_history, work_orders,
                work_order_assignees, qc_sampling_rates, doc_counters  (SQL Server)
  Spec: docs/03 BR-01 (กันซ้ำ), BR-02 (qc_required / need ต่อใบงาน), BR-10 (เลขเอกสาร), BR-11 (90 วัน),
        §2.1 (สถานะแผน), §2.4 (ใบงาน), §3.1 · docs/13 (Meeting C: ใบงาน = การเรียกเข้าแต่ละครั้ง)
  - ตามรูปแบบของ 004–007: ชื่อ constraint DF_/PK_/UQ_/CK_/FK_/IX_/UX_, รันซ้ำได้
  - เลขแผน QP-YYMM-NNNN (รีเซ็ตรายเดือน) · เลขใบงาน = <เลขแผน>-<ครั้งที่> เช่น QP-2610-0001-1 (ผู้ใช้ยืนยัน 20 ต.ค. 2026)
  - ไม่ใช้ trigger ตั้ง updated_at (error 334 กับ OUTPUT) → ชั้นแอปตั้ง updated_at / updated_by ทุกครั้งที่แก้
  - ยังไม่ได้รันกับ SQL Server จริง
*/

IF OBJECT_ID(N'dbo.models', N'U') IS NULL OR OBJECT_ID(N'dbo.vendors', N'U') IS NULL
    THROW 51004, 'dbo.models / dbo.vendors not found: run 004_master_catalog.sql first.', 1;
GO
IF OBJECT_ID(N'dbo.template_versions', N'U') IS NULL
    THROW 51005, 'dbo.template_versions not found: run 005_master_checklists.sql first.', 1;
GO

/* % การสุ่มตรวจ QC (Master — Admin แก้ได้เอง, เก็บประวัติทุกครั้ง) [C 04:42]
   ค่าที่ใช้ = แถว is_active ที่ effective_from ล่าสุดไม่เกินเวลาปัจจุบัน · แผนผูกค่า ณ วันเปิด (plans.qc_percent) */
IF OBJECT_ID(N'dbo.qc_sampling_rates', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.qc_sampling_rates (
        id              INT           IDENTITY(1,1) NOT NULL,
        qc_percent      DECIMAL(5,2)  NOT NULL,           -- เช่น 10.00
        effective_from  DATETIME2(0)  NOT NULL,           -- มีผลกับแผนที่เปิดตั้งแต่เวลานี้ (UTC)
        reason          NVARCHAR(400) NULL,
        is_active    BIT          NOT NULL CONSTRAINT DF_qc_sampling_rates_is_active DEFAULT (1),            -- สถานะ: 1 ใช้งาน / 0 ปิด (ไม่ลบแถวจริง)
        created_at   DATETIME2(0) NOT NULL CONSTRAINT DF_qc_sampling_rates_created_at DEFAULT (SYSUTCDATETIME()),  -- วันที่เพิ่ม (UTC)
        created_by   BIGINT       NULL,                                                              -- ผู้เพิ่ม (users.id)
        updated_at   DATETIME2(0) NOT NULL CONSTRAINT DF_qc_sampling_rates_updated_at DEFAULT (SYSUTCDATETIME()),  -- วันที่แก้ไขล่าสุด (UTC) — แอปตั้งค่าทุกครั้งที่แก้
        updated_by   BIGINT       NULL,                                                              -- ผู้แก้ไขล่าสุด (users.id)
        CONSTRAINT PK_qc_sampling_rates PRIMARY KEY CLUSTERED (id),
        CONSTRAINT CK_qc_sampling_rates_percent CHECK (qc_percent > 0 AND qc_percent <= 100),
        CONSTRAINT FK_qc_sampling_rates_created_by FOREIGN KEY (created_by) REFERENCES dbo.users (id),
        CONSTRAINT FK_qc_sampling_rates_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users (id)
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM dbo.qc_sampling_rates)
    INSERT INTO dbo.qc_sampling_rates (qc_percent, effective_from, reason)
    VALUES (10.00, '2000-01-01', N'ค่าตั้งต้น 10% (BR-02)');
GO

/* เลขรันรายเดือน (BR-10) — ออกใน transaction เดียวกับการเปิดแผน: UPDATE ... WITH (UPDLOCK, HOLDLOCK) */
IF OBJECT_ID(N'dbo.doc_counters', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.doc_counters (
        counter_key  VARCHAR(8)   NOT NULL,               -- QP (แผน) · ต่อไป RW, NCP
        period       CHAR(4)      NOT NULL,               -- YYMM ตามเวลาไทย (BR-19)
        last_no      INT          NOT NULL,
        updated_at   DATETIME2(0) NOT NULL CONSTRAINT DF_doc_counters_updated_at DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT PK_doc_counters PRIMARY KEY CLUSTERED (counter_key, period),
        CONSTRAINT CK_doc_counters_last_no CHECK (last_no >= 0)
    );
END
GO

/* เอกสารรับเข้า: Invoice (ปั๊มนำเข้า) / PO (ปั๊มผลิตเอง) — BR-01
   ไม่ซ้ำ = (ประเภท, เลขที่ normalize แล้ว, Vendor) · ปั๊มผลิตเองใช้แถว Vendor ของโรงงาน (เช่น PUMA) */
IF OBJECT_ID(N'dbo.receipt_docs', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.receipt_docs (
        id                    BIGINT         IDENTITY(1,1) NOT NULL,
        doc_type              VARCHAR(8)     NOT NULL,     -- INVOICE | PO
        doc_no                NVARCHAR(64)   NOT NULL,     -- ตามที่กรอก/สแกน
        doc_no_normalized     NVARCHAR(64)   NOT NULL,     -- ตัดช่องว่างหัวท้าย, ตัวพิมพ์ใหญ่, รวมช่องว่างซ้ำ (แอปคำนวณ)
        vendor_id             INT            NOT NULL,
        origin                VARCHAR(10)    NOT NULL,     -- IMPORTED | DOMESTIC
        department            VARCHAR(8)     NULL,         -- 408 / 409 (PO ปั๊มผลิตเอง)
        invoice_date          DATE           NULL,         -- บังคับเมื่อเป็น Invoice
        doc_date              DATE           NULL,         -- วันที่ PO
        expected_sku_count    INT            NULL,         -- จำนวน SKU ทั้งหมดใน Invoice [A 25:01]
        sku_complete_confirmed_by  BIGINT    NULL,         -- หัวหน้ายืนยัน "เปิดแผนครบทุก SKU แล้ว"
        sku_complete_confirmed_at  DATETIME2(0) NULL,
        qc_deadline           DATE           NULL,         -- invoice_date + invoice_qc_deadline_days (BR-11)
        remarks               NVARCHAR(1000) NULL,
        created_at   DATETIME2(0) NOT NULL CONSTRAINT DF_receipt_docs_created_at DEFAULT (SYSUTCDATETIME()),
        created_by   BIGINT       NULL,
        updated_at   DATETIME2(0) NOT NULL CONSTRAINT DF_receipt_docs_updated_at DEFAULT (SYSUTCDATETIME()),
        updated_by   BIGINT       NULL,
        CONSTRAINT PK_receipt_docs PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_receipt_docs_key UNIQUE (doc_type, doc_no_normalized, vendor_id),
        CONSTRAINT CK_receipt_docs_type CHECK (doc_type IN ('INVOICE', 'PO')),
        CONSTRAINT CK_receipt_docs_origin CHECK (origin IN ('IMPORTED', 'DOMESTIC')),
        CONSTRAINT CK_receipt_docs_invoice_date CHECK (doc_type <> 'INVOICE' OR invoice_date IS NOT NULL),
        CONSTRAINT CK_receipt_docs_sku CHECK (expected_sku_count IS NULL OR expected_sku_count >= 1),
        CONSTRAINT FK_receipt_docs_vendor FOREIGN KEY (vendor_id) REFERENCES dbo.vendors (id),
        CONSTRAINT FK_receipt_docs_sku_confirmed_by FOREIGN KEY (sku_complete_confirmed_by) REFERENCES dbo.users (id),
        CONSTRAINT FK_receipt_docs_created_by FOREIGN KEY (created_by) REFERENCES dbo.users (id),
        CONSTRAINT FK_receipt_docs_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users (id)
    );
END
GO

/* แผนตรวจ: 1 เอกสารรับเข้า × 1 Model (BR-01) — สถานะตาม docs/03 §2.1 */
IF OBJECT_ID(N'dbo.plans', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.plans (
        id                      BIGINT         IDENTITY(1,1) NOT NULL,
        plan_no                 VARCHAR(16)    NOT NULL,   -- QP-YYMM-NNNN
        receipt_doc_id          BIGINT         NOT NULL,
        model_id                INT            NOT NULL,
        description             NVARCHAR(400)  NULL,       -- สำเนาจาก Model ณ วันเปิด (แก้ได้)
        manufacturer            NVARCHAR(200)  NULL,
        lot_qty                 INT            NOT NULL,   -- จำนวนตาม Invoice/PO ทั้งล็อต
        lot_called_total        INT            NOT NULL CONSTRAINT DF_plans_lot_called_total DEFAULT (0),  -- ผลรวม called_qty ของใบงานที่ไม่ยกเลิก
        lot_remaining           AS (lot_qty - lot_called_total),                                            -- ยอดล็อตที่ยังไม่เรียกเข้า
        qc_done_total           INT            NOT NULL CONSTRAINT DF_plans_qc_done_total DEFAULT (0),     -- ยอดตรวจ QC สะสม
        receipt_date            DATE           NULL,       -- วันที่รับสินค้าเข้า
        opened_at               DATETIME2(0)   NOT NULL CONSTRAINT DF_plans_opened_at DEFAULT (SYSUTCDATETIME()),
        opened_by               BIGINT         NOT NULL,
        responsible_qc_id       BIGINT         NULL,       -- FR-PLAN-15
        qc_template_version_id  INT            NULL,       -- ผูก ณ วันเปิด (BR-20)
        qa_template_version_id  INT            NULL,
        qc_percent              DECIMAL(5,2)   NOT NULL,   -- ผูก ณ วันเปิด (qc_sampling_rates)
        qc_required             INT            NOT NULL,   -- BR-02 (+ ยกระดับ BR-02a)
        paper_checked_qty       INT            NULL,       -- ตรวจบนกระดาษแล้ว (ไม่บังคับ)
        escalated               BIT            NOT NULL CONSTRAINT DF_plans_escalated DEFAULT (0),          -- BR-02a
        aql_level               VARCHAR(10)    NULL,       -- R1.1
        qa_required             INT            NULL,
        qa_mode                 VARCHAR(8)     NOT NULL CONSTRAINT DF_plans_qa_mode DEFAULT ('EXTERNAL'),   -- Pilot R1.0 = EXTERNAL
        inspection_cycle        INT            NOT NULL CONSTRAINT DF_plans_inspection_cycle DEFAULT (1),
        status                  VARCHAR(16)    NOT NULL CONSTRAINT DF_plans_status DEFAULT ('OPEN'),        -- สถานะแผน
        waiting_goods           BIT            NOT NULL CONSTRAINT DF_plans_waiting_goods DEFAULT (0),      -- "รอของ" FR-PLAN-17
        due_at                  DATETIME2(0)   NULL,
        force_closed            BIT            NOT NULL CONSTRAINT DF_plans_force_closed DEFAULT (0),
        force_close_reason      NVARCHAR(400)  NULL,
        cancelled_at            DATETIME2(0)   NULL,
        cancelled_by            BIGINT         NULL,
        cancel_reason           NVARCHAR(400)  NULL,
        remarks                 NVARCHAR(1000) NULL,
        created_at   DATETIME2(0) NOT NULL CONSTRAINT DF_plans_created_at DEFAULT (SYSUTCDATETIME()),
        created_by   BIGINT       NULL,
        updated_at   DATETIME2(0) NOT NULL CONSTRAINT DF_plans_updated_at DEFAULT (SYSUTCDATETIME()),
        updated_by   BIGINT       NULL,
        CONSTRAINT PK_plans PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_plans_plan_no UNIQUE (plan_no),
        CONSTRAINT CK_plans_plan_no CHECK (plan_no LIKE 'QP-[0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9]'),
        CONSTRAINT CK_plans_lot_qty CHECK (lot_qty >= 1),
        CONSTRAINT CK_plans_lot_called CHECK (lot_called_total >= 0 AND lot_called_total <= lot_qty),
        CONSTRAINT CK_plans_qc_done CHECK (qc_done_total >= 0),
        CONSTRAINT CK_plans_qc_required CHECK (qc_required >= 1),
        CONSTRAINT CK_plans_qc_percent CHECK (qc_percent > 0 AND qc_percent <= 100),
        CONSTRAINT CK_plans_paper CHECK (paper_checked_qty IS NULL OR paper_checked_qty >= 0),
        CONSTRAINT CK_plans_aql CHECK (aql_level IS NULL OR aql_level IN ('REDUCED', 'NORMAL', 'TIGHTENED')),
        CONSTRAINT CK_plans_qa_mode CHECK (qa_mode IN ('IN_APP', 'EXTERNAL')),
        CONSTRAINT CK_plans_cycle CHECK (inspection_cycle >= 1),
        CONSTRAINT CK_plans_status CHECK (status IN ('OPEN', 'ASSIGNED', 'QC_IN_PROGRESS', 'QC_REVIEW', 'QA_PENDING', 'QA_IN_PROGRESS',
                                                     'ON_HOLD', 'QA_LOT_REJECTED', 'REPORT_REVIEW', 'COMPLETED', 'CANCELLED')),
        CONSTRAINT CK_plans_cancel CHECK (status <> 'CANCELLED' OR (cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL)),
        CONSTRAINT FK_plans_receipt_doc FOREIGN KEY (receipt_doc_id) REFERENCES dbo.receipt_docs (id),
        CONSTRAINT FK_plans_model FOREIGN KEY (model_id) REFERENCES dbo.models (id),
        CONSTRAINT FK_plans_opened_by FOREIGN KEY (opened_by) REFERENCES dbo.users (id),
        CONSTRAINT FK_plans_responsible_qc FOREIGN KEY (responsible_qc_id) REFERENCES dbo.users (id),
        CONSTRAINT FK_plans_qc_template_version FOREIGN KEY (qc_template_version_id) REFERENCES dbo.template_versions (id),
        CONSTRAINT FK_plans_qa_template_version FOREIGN KEY (qa_template_version_id) REFERENCES dbo.template_versions (id),
        CONSTRAINT FK_plans_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES dbo.users (id),
        CONSTRAINT FK_plans_created_by FOREIGN KEY (created_by) REFERENCES dbo.users (id),
        CONSTRAINT FK_plans_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users (id)
    );
END
GO
/* กันแผนซ้ำ: (เอกสารรับเข้า, Model) ไม่นับแผนที่ยกเลิก (BR-01) */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_plans_doc_model' AND object_id = OBJECT_ID(N'dbo.plans'))
    CREATE UNIQUE INDEX UX_plans_doc_model ON dbo.plans (receipt_doc_id, model_id) WHERE status <> 'CANCELLED';
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_plans_status' AND object_id = OBJECT_ID(N'dbo.plans'))
    CREATE INDEX IX_plans_status ON dbo.plans (status, opened_at) INCLUDE (plan_no, model_id, receipt_doc_id);
GO

/* ประวัติสถานะแผน — append-only (SLA/KPI) */
IF OBJECT_ID(N'dbo.plan_status_history', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.plan_status_history (
        id           BIGINT        IDENTITY(1,1) NOT NULL,
        plan_id      BIGINT        NOT NULL,
        from_status  VARCHAR(16)   NULL,                   -- NULL = เปิดแผน
        to_status    VARCHAR(16)   NOT NULL,
        at           DATETIME2(0)  NOT NULL CONSTRAINT DF_plan_status_history_at DEFAULT (SYSUTCDATETIME()),
        by_user_id   BIGINT        NOT NULL,
        reason       NVARCHAR(400) NULL,
        CONSTRAINT PK_plan_status_history PRIMARY KEY CLUSTERED (id),
        CONSTRAINT FK_plan_status_history_plan FOREIGN KEY (plan_id) REFERENCES dbo.plans (id),
        CONSTRAINT FK_plan_status_history_by FOREIGN KEY (by_user_id) REFERENCES dbo.users (id)
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_plan_status_history_plan' AND object_id = OBJECT_ID(N'dbo.plan_status_history'))
    CREATE INDEX IX_plan_status_history_plan ON dbo.plan_status_history (plan_id, at);
GO

/* ใบงาน = การเรียกของเข้า 1 ครั้งของแผน (docs/13, 03 §2.4) — ไม่ต้องกดรับงาน จึงเริ่มที่ IN_PROGRESS
   type ระบบเลือก: QC ถ้ายอดตรวจสะสมยังไม่ครบ qc_required, มิฉะนั้น CALLIN_FIX "เรียกเข้าแก้ไข" (need = 0) */
IF OBJECT_ID(N'dbo.work_orders', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.work_orders (
        id             UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_work_orders_id DEFAULT (NEWSEQUENTIALID()),
        plan_id        BIGINT        NOT NULL,
        seq            INT           NOT NULL,             -- ครั้งที่เรียกเข้า 1, 2, 3, …
        wo_no          VARCHAR(24)   NOT NULL,             -- <plan_no>-<seq> เช่น QP-2610-0001-1
        type           VARCHAR(10)   NOT NULL,             -- QC | CALLIN_FIX
        called_qty     INT           NOT NULL,             -- จำนวนที่เรียกเข้าครั้งนี้
        called_date    DATE          NOT NULL,             -- วันที่เรียกเข้า
        qty_need       INT           NOT NULL,             -- Need (BR-02) — ต้องตรวจ ≥ ค่านี้
        qty_done       INT           NOT NULL CONSTRAINT DF_work_orders_qty_done DEFAULT (0),
        status         VARCHAR(10)   NOT NULL CONSTRAINT DF_work_orders_status DEFAULT ('IN_PROGRESS'),  -- สถานะใบงาน
        waiting_goods  BIT           NOT NULL CONSTRAINT DF_work_orders_waiting_goods DEFAULT (0),
        submitted_at   DATETIME2(0)  NULL,
        cancelled_at   DATETIME2(0)  NULL,
        cancelled_by   BIGINT        NULL,
        cancel_reason  NVARCHAR(400) NULL,
        remarks        NVARCHAR(1000) NULL,
        created_at   DATETIME2(0) NOT NULL CONSTRAINT DF_work_orders_created_at DEFAULT (SYSUTCDATETIME()),
        created_by   BIGINT       NULL,
        updated_at   DATETIME2(0) NOT NULL CONSTRAINT DF_work_orders_updated_at DEFAULT (SYSUTCDATETIME()),
        updated_by   BIGINT       NULL,
        CONSTRAINT PK_work_orders PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_work_orders_plan_seq UNIQUE (plan_id, seq),
        CONSTRAINT UQ_work_orders_wo_no UNIQUE (wo_no),
        CONSTRAINT CK_work_orders_seq CHECK (seq >= 1),
        CONSTRAINT CK_work_orders_type CHECK (type IN ('QC', 'CALLIN_FIX')),
        CONSTRAINT CK_work_orders_called_qty CHECK (called_qty >= 1),
        CONSTRAINT CK_work_orders_need CHECK (qty_need >= 0 AND qty_need <= called_qty AND (type = 'QC' OR qty_need = 0)),
        CONSTRAINT CK_work_orders_done CHECK (qty_done >= 0),
        CONSTRAINT CK_work_orders_status CHECK (status IN ('IN_PROGRESS', 'SUBMITTED', 'RETURNED', 'CLOSED', 'CANCELLED')),
        CONSTRAINT CK_work_orders_cancel CHECK (status <> 'CANCELLED' OR (cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL)),
        CONSTRAINT FK_work_orders_plan FOREIGN KEY (plan_id) REFERENCES dbo.plans (id),
        CONSTRAINT FK_work_orders_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES dbo.users (id),
        CONSTRAINT FK_work_orders_created_by FOREIGN KEY (created_by) REFERENCES dbo.users (id),
        CONSTRAINT FK_work_orders_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users (id)
    );
END
GO

/* ผู้รับผิดชอบใบงาน: 2–5 คนรับผิดชอบร่วม (slot 1–2 บังคับ — ตรวจที่ชั้นแอป) [C 24:36] */
IF OBJECT_ID(N'dbo.work_order_assignees', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.work_order_assignees (
        work_order_id  UNIQUEIDENTIFIER NOT NULL,
        slot           TINYINT       NOT NULL,             -- 1–5
        user_id        BIGINT        NOT NULL,
        assigned_by    BIGINT        NOT NULL,
        assigned_at    DATETIME2(0)  NOT NULL CONSTRAINT DF_work_order_assignees_assigned_at DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT PK_work_order_assignees PRIMARY KEY CLUSTERED (work_order_id, slot),
        CONSTRAINT UQ_work_order_assignees_user UNIQUE (work_order_id, user_id),
        CONSTRAINT CK_work_order_assignees_slot CHECK (slot BETWEEN 1 AND 5),
        CONSTRAINT FK_work_order_assignees_wo FOREIGN KEY (work_order_id) REFERENCES dbo.work_orders (id),
        CONSTRAINT FK_work_order_assignees_user FOREIGN KEY (user_id) REFERENCES dbo.users (id),
        CONSTRAINT FK_work_order_assignees_by FOREIGN KEY (assigned_by) REFERENCES dbo.users (id)
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_work_order_assignees_user' AND object_id = OBJECT_ID(N'dbo.work_order_assignees'))
    CREATE INDEX IX_work_order_assignees_user ON dbo.work_order_assignees (user_id) INCLUDE (work_order_id);
GO
