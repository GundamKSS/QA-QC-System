/*
  QCheck — 021: Vendor ตั้งต้นของ Model (models.vendor_id)  (SQL Server)
  - ผู้ใช้ 11 พ.ย. 2026: ผูก Vendor กับ Model — ตอนเปิดแผนเลือก Model แล้วระบบเติม Vendor ให้ก่อน (เปลี่ยนเองได้)
  - เว้นว่างได้ (Model ที่ยังไม่ผูก Vendor ก็เลือกเองตอนเปิดแผน) · ไม่แก้ไฟล์ 004 · รันซ้ำได้
*/

IF OBJECT_ID(N'dbo.models', N'U') IS NULL OR OBJECT_ID(N'dbo.vendors', N'U') IS NULL
    THROW 51210, '021 needs dbo.models and dbo.vendors (run 004 first).', 1;
GO

IF COL_LENGTH(N'dbo.models', N'vendor_id') IS NULL
    ALTER TABLE dbo.models ADD vendor_id INT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_models_vendor')
    ALTER TABLE dbo.models ADD CONSTRAINT FK_models_vendor FOREIGN KEY (vendor_id) REFERENCES dbo.vendors (id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_models_vendor' AND object_id = OBJECT_ID(N'dbo.models'))
    CREATE INDEX IX_models_vendor ON dbo.models (vendor_id);
GO
