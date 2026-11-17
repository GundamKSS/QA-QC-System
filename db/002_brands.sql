/*
  QCheck — 002: brands  (SQL Server)
  Spec: docs/03 §3.2 `brands` (name, brand_group PUMA/OTHER) + คอลัมน์มาตรฐานของ Master (วันที่เพิ่ม/แก้ไข/สถานะ)
  ที่มาข้อมูล: ชีต "สินค้า" คอลัมน์ Brand (PUMA, TIGER, JET, ZAPP, ZEED) — ข้อมูลตั้งต้นใส่แยกจากไฟล์นี้
  brand_group ใช้กับกฎ Disposition (docs/03 BR) — ไม่ใช่ origin ของปั๊ม (❓ A16)
*/

IF OBJECT_ID(N'dbo.brands', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.brands (
        id           INT            IDENTITY(1,1) NOT NULL,
        name         NVARCHAR(64)   NOT NULL,             -- เก็บเป็นตัวพิมพ์ตามชีต เช่น PUMA; เทียบแบบไม่สนตัวพิมพ์
        brand_group  VARCHAR(8)     NOT NULL,             -- PUMA | OTHER
        is_active    BIT            NOT NULL CONSTRAINT DF_brands_is_active DEFAULT (1),
        created_at   DATETIME2(0)   NOT NULL CONSTRAINT DF_brands_created_at DEFAULT (SYSUTCDATETIME()),
        updated_at   DATETIME2(0)   NOT NULL CONSTRAINT DF_brands_updated_at DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT PK_brands PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_brands_name UNIQUE (name),           -- collation ของ DB ไม่สนตัวพิมพ์โดยปริยาย
        CONSTRAINT CK_brands_group CHECK (brand_group IN ('PUMA', 'OTHER'))
    );
END
GO
