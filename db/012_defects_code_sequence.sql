/*
  QCheck — 012: รหัสอาการ (defects.code) รันเลขอัตโนมัติ DEF00001, DEF00002, …  (SQL Server)
  - ผู้ใช้ขอ 22 ต.ค. 2026: หน้า Master อาการไม่ต้องให้กรอกรหัสเอง
  - ใช้ SEQUENCE + DEFAULT constraint: ฐานข้อมูลออกเลขเองตอน INSERT จึงไม่ชนกันแม้บันทึกพร้อมกัน
    (ไม่ใช้ MAX + 1 ฝั่งแอป เพราะสองคนกดบันทึกพร้อมกันจะได้เลขเดียวกัน)
  - เลขเริ่มต่อจากรหัสรูปแบบ DEF + 5 หลักที่มีอยู่แล้ว · รหัสเดิมที่กรอกมือไม่ถูกแก้
  - เลขอาจข้ามได้ถ้าการบันทึกล้มเหลว (ปกติของ SEQUENCE) · สูงสุด DEF99999
  - ไม่แก้ไฟล์ 006 · รันซ้ำได้
*/

IF OBJECT_ID(N'dbo.defects', N'U') IS NULL
    THROW 51120, '012 needs dbo.defects (run 006 first).', 1;
GO

IF OBJECT_ID(N'dbo.seq_defect_code', N'SO') IS NULL
BEGIN
    DECLARE @start INT = 1 + ISNULL((
        SELECT MAX(CAST(SUBSTRING(code, 4, 5) AS INT))
        FROM dbo.defects
        WHERE code LIKE 'DEF[0-9][0-9][0-9][0-9][0-9]' AND LEN(code) = 8
    ), 0);
    DECLARE @create NVARCHAR(400) = N'CREATE SEQUENCE dbo.seq_defect_code AS INT START WITH ' + CAST(@start AS NVARCHAR(10))
        + N' INCREMENT BY 1 MINVALUE 1 MAXVALUE 99999 NO CYCLE CACHE 20;';
    EXEC sys.sp_executesql @create;
END
GO

IF OBJECT_ID(N'dbo.DF_defects_code', N'D') IS NULL
    ALTER TABLE dbo.defects ADD CONSTRAINT DF_defects_code
        DEFAULT ('DEF' + RIGHT('00000' + CAST(NEXT VALUE FOR dbo.seq_defect_code AS VARCHAR(5)), 5)) FOR code;
GO
