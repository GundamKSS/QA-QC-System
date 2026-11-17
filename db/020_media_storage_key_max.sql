/*
  QCheck — 020: ขยายขนาดคอลัมน์ storage_key ใน dbo.media ให้รองรับ data URL / รูปภาพแบบละเอียด (SQL Server)
*/

IF OBJECT_ID(N'dbo.media', N'U') IS NOT NULL
BEGIN
    IF EXISTS (
        SELECT 1 
          FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_NAME = N'media' 
           AND COLUMN_NAME = N'storage_key' 
           AND CHARACTER_MAXIMUM_LENGTH <> -1
    )
    BEGIN
        ALTER TABLE dbo.media ALTER COLUMN storage_key NVARCHAR(MAX) NOT NULL;
    END
END
GO
