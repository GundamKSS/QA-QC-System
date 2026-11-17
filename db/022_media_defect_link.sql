/*
  QCheck — 022: ผูกรูปภาพเข้ากับ Defect ID และจุดที่พบ (Part/Area) ใน dbo.media (SQL Server)
  Spec: Flow การตรวจ Defect & บังคับถ่ายรูปเฉพาะจุด (เลือก Defect → เลือกจุด Part/Area → บังคับเปิดกล้องถ่ายเฉพาะจุด)
  - เพิ่มคอลัมน์ defect_id ใน dbo.media เพื่อผูกรูปภาพเข้ากับ ID ของ Defect นั้นโดยตรง
  - เพิ่มคอลัมน์ part (จุด/ชิ้นส่วน เช่น ถัง, ฐาน, แขนจับ)
  - เพิ่มคอลัมน์ item_defect_result_id เพื่อผูกกับผลการตรวจของ defect นั้นใน dbo.item_defect_results
  - ไม่แก้ไฟล์ก่อนหน้า · รันซ้ำได้ปลอดภัย
*/

IF OBJECT_ID(N'dbo.media', N'U') IS NULL
    THROW 51022, '022 needs dbo.media (run 017 first).', 1;
GO

IF COL_LENGTH(N'dbo.media', N'defect_id') IS NULL
BEGIN
    ALTER TABLE dbo.media ADD defect_id INT NULL;
END
GO

IF COL_LENGTH(N'dbo.media', N'part') IS NULL
BEGIN
    ALTER TABLE dbo.media ADD part NVARCHAR(100) NULL;
END
GO

IF COL_LENGTH(N'dbo.media', N'item_defect_result_id') IS NULL
BEGIN
    ALTER TABLE dbo.media ADD item_defect_result_id UNIQUEIDENTIFIER NULL;
END
GO

IF NOT EXISTS (
    SELECT 1 
      FROM sys.foreign_keys 
     WHERE name = N'FK_media_defect' 
       AND parent_object_id = OBJECT_ID(N'dbo.media')
)
BEGIN
    ALTER TABLE dbo.media 
      ADD CONSTRAINT FK_media_defect 
      FOREIGN KEY (defect_id) REFERENCES dbo.defects (id);
END
GO

IF NOT EXISTS (
    SELECT 1 
      FROM sys.foreign_keys 
     WHERE name = N'FK_media_item_defect_result' 
       AND parent_object_id = OBJECT_ID(N'dbo.media')
)
BEGIN
    ALTER TABLE dbo.media 
      ADD CONSTRAINT FK_media_item_defect_result 
      FOREIGN KEY (item_defect_result_id) REFERENCES dbo.item_defect_results (id);
END
GO

IF NOT EXISTS (
    SELECT 1 
      FROM sys.indexes 
     WHERE name = N'IX_media_defect' 
       AND object_id = OBJECT_ID(N'dbo.media')
)
BEGIN
    CREATE INDEX IX_media_defect ON dbo.media (owner_id, defect_id);
END
GO
