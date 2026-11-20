/*
  QCheck — 027: QA รับงาน / ยืนยันผล (SQL Server)
  - dbo.plans: qa_accepted_by / qa_accepted_at (Head QA กดรับงานจาก QC)
  - dbo.plans: qa_confirmed_by / qa_confirmed_at (Head QA ยืนยันผล QA และปิดแผน)
  - ไม่แก้ไฟล์ก่อนหน้า · รันซ้ำได้ปลอดภัย (Idempotent)
*/

IF OBJECT_ID(N'dbo.plans', N'U') IS NULL
    THROW 51270, '027 needs dbo.plans (run 009 first).', 1;
GO

IF COL_LENGTH(N'dbo.plans', N'qa_accepted_by') IS NULL
    ALTER TABLE dbo.plans ADD qa_accepted_by BIGINT NULL;
GO
IF COL_LENGTH(N'dbo.plans', N'qa_accepted_at') IS NULL
    ALTER TABLE dbo.plans ADD qa_accepted_at DATETIME2(0) NULL;
GO
IF COL_LENGTH(N'dbo.plans', N'qa_confirmed_by') IS NULL
    ALTER TABLE dbo.plans ADD qa_confirmed_by BIGINT NULL;
GO
IF COL_LENGTH(N'dbo.plans', N'qa_confirmed_at') IS NULL
    ALTER TABLE dbo.plans ADD qa_confirmed_at DATETIME2(0) NULL;
GO

IF OBJECT_ID(N'dbo.FK_plans_qa_accepted_by', N'F') IS NULL
    ALTER TABLE dbo.plans ADD CONSTRAINT FK_plans_qa_accepted_by FOREIGN KEY (qa_accepted_by) REFERENCES dbo.users (id);
GO
IF OBJECT_ID(N'dbo.FK_plans_qa_confirmed_by', N'F') IS NULL
    ALTER TABLE dbo.plans ADD CONSTRAINT FK_plans_qa_confirmed_by FOREIGN KEY (qa_confirmed_by) REFERENCES dbo.users (id);
GO

/* แผนที่ QA เคยเริ่มตรวจไปแล้วก่อนมีขั้นตอนรับงาน: ถือว่ารับงานแล้ว ณ เวลาที่เข้าสถานะ QA_IN_PROGRESS */
UPDATE p
   SET qa_accepted_at = COALESCE(h.at, p.updated_at)
  FROM dbo.plans p
  OUTER APPLY (SELECT TOP (1) at FROM dbo.plan_status_history WHERE plan_id = p.id AND to_status = 'QA_IN_PROGRESS' ORDER BY id) h
 WHERE p.status IN ('QA_IN_PROGRESS', 'COMPLETED') AND p.qa_accepted_at IS NULL
   AND EXISTS (SELECT 1 FROM dbo.work_orders w WHERE w.plan_id = p.id AND w.type = 'QA');
GO
