/*
  QCheck — 019: เพิ่มคอลัมน์ animation_type ใน dbo.checklist_items สำหรับแสดงอนิเมชั่นมินิมอลรายขั้นตอนบนมือถือ  (SQL Server)
  Spec: docs/03 §3.1 · FR-QC-03..06 (ผู้ใช้ 10 พ.ย. 2026)
  - เพิ่ม animation_type เพื่อระบุชนิดภาพเคลื่อนไหวเวกเตอร์มินิมอลของแต่ละขั้นตอนการตรวจ
  - ไม่แก้ไฟล์ก่อนหน้า · รันซ้ำได้
*/

IF OBJECT_ID(N'dbo.checklist_items', N'U') IS NULL
    THROW 51190, '019 needs dbo.checklist_items (run 005_master_checklists.sql first).', 1;
GO

IF COL_LENGTH(N'dbo.checklist_items', N'animation_type') IS NULL
    ALTER TABLE dbo.checklist_items ADD animation_type VARCHAR(24) NULL;
GO

IF OBJECT_ID(N'dbo.CK_checklist_items_animation', N'C') IS NULL
    ALTER TABLE dbo.checklist_items
        ADD CONSTRAINT CK_checklist_items_animation
        CHECK (animation_type IS NULL OR animation_type IN (
            'SCAN_PUMP',
            'PISTON_HEAD',
            'MOTOR_BELT',
            'PRESSURE_GAUGE',
            'AIR_TANK',
            'VALVE_LEAK',
            'GENERAL_CHECK'
        ));
GO
