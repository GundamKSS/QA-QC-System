/*
  QCheck — 025: เกณฑ์แรงดัน Start / Stop และธงอนุโลมของ Model (SQL Server)
  Spec: docs/03 §3.1 (Master data), ข้อสรุปที่ประชุม 13 พ.ย. 2026
  - เพิ่มคอลัมน์สเปกแรงดันใน dbo.models:
    * pressure_start_bar DECIMAL(4,1) NULL
    * pressure_stop_bar  DECIMAL(4,1) NULL
    * is_pressure_concession BIT NOT NULL CONSTRAINT DF_models_is_pressure_concession DEFAULT (0)
  - อัปเดต/เชื่อมโยงข้อมูลสเปกแรงดันของโมเดล 105 รุ่น (Oil-free, Direct Drive, Piston)
  - ไม่แก้ไฟล์ก่อนหน้า · รันซ้ำได้ปลอดภัย (Idempotent)
*/

IF OBJECT_ID(N'dbo.models', N'U') IS NULL
    THROW 51250, '025 needs dbo.models (run 004 first).', 1;
GO

IF COL_LENGTH(N'dbo.models', N'pressure_start_bar') IS NULL
    ALTER TABLE dbo.models ADD pressure_start_bar DECIMAL(4,1) NULL;
GO

IF COL_LENGTH(N'dbo.models', N'pressure_stop_bar') IS NULL
    ALTER TABLE dbo.models ADD pressure_stop_bar DECIMAL(4,1) NULL;
GO

IF COL_LENGTH(N'dbo.models', N'is_pressure_concession') IS NULL
    ALTER TABLE dbo.models ADD is_pressure_concession BIT NOT NULL CONSTRAINT DF_models_is_pressure_concession DEFAULT (0);
GO

/* ตรวจสอบค่าแรงดันต้องไม่ติดลบ */
IF OBJECT_ID(N'dbo.CK_models_pressure', N'C') IS NULL
    ALTER TABLE dbo.models ADD CONSTRAINT CK_models_pressure CHECK (
        (pressure_start_bar IS NULL OR pressure_start_bar >= 0) AND
        (pressure_stop_bar IS NULL OR pressure_stop_bar >= 0)
    );
GO

/* 1. อัปเดตสเปกแรงดันให้โมเดลที่มีอยู่แล้วในระบบ */
UPDATE m
   SET m.pressure_start_bar = s.pressure_start,
       m.pressure_stop_bar = s.pressure_stop,
       m.is_pressure_concession = s.is_concession,
       m.updated_at = SYSUTCDATETIME()
  FROM dbo.models m
  JOIN (VALUES
      -- 1. Oil-Free / เสียงเงียบ (Start 5.0, Stop 7.0 bar)
      (N'FORCE-160 MARK II', 5.0, 7.0, 0),
      (N'FORCE-120 MARK II', 5.0, 7.0, 0),
      (N'FORCE-35 MARK II', 5.0, 7.0, 0),
      (N'FORCE-35 MASK II', 5.0, 7.0, 0),
      (N'FORCE-55 MARK II', 5.0, 7.0, 0),
      (N'FORCE-35', 5.0, 7.0, 0),
      (N'FORCE-55', 5.0, 7.0, 0),
      (N'FORCE-BL', 5.0, 7.0, 0),
      (N'HUSH 25', 5.0, 7.0, 0),
      (N'HUSH 50', 5.0, 7.0, 0),
      (N'HUSH 100', 5.0, 7.0, 0),
      (N'JOS-25', 5.0, 7.0, 0),
      (N'JOS-150', 5.0, 7.0, 0),
      (N'JOS-250', 5.0, 7.0, 0),
      (N'JOS-370', 5.0, 7.0, 0),
      (N'JAGUAR-25', 5.0, 7.0, 0),
      (N'JAGUAR-50', 5.0, 7.0, 0),
      (N'JAGUAR-50-1', 5.0, 7.0, 0),
      (N'JAGUAR-100', 5.0, 7.0, 0),
      (N'JAGUAR-120', 5.0, 7.0, 0),
      (N'JAGUAR-150', 5.0, 7.0, 0),
      (N'HAWK 30', 5.0, 7.0, 0),
      (N'HAWK 50', 5.0, 7.0, 0),
      (N'LYNX 25', 5.0, 7.0, 0),
      (N'LYNX 250', 5.0, 7.0, 0),
      (N'PXO-25', 5.0, 7.0, 0),
      (N'PXO-50', 5.0, 7.0, 0),
      (N'PHO-25', 5.0, 7.0, 0),
      (N'ZP-OF25', 5.0, 7.0, 0),
      (N'ZP-OF50', 5.0, 7.0, 0),
      (N'CLOUD', 5.0, 7.0, 0),

      -- 2. ปั๊มลมขับตรง Direct Drive (Start 6.0, Stop 8.0 bar)
      (N'CM-2525', 6.0, 8.0, 0),
      (N'CM-2550', 6.0, 8.0, 0),
      (N'XM-2525', 6.0, 8.0, 0),
      (N'XM-2550', 6.0, 8.0, 0),
      (N'PXD-25', 6.0, 8.0, 0),
      (N'PXD-50', 6.0, 8.0, 0),
      (N'EAGLE-25', 6.0, 8.0, 0),
      (N'EAGLE-50', 6.0, 8.0, 0),
      (N'CHEETAH-25', 6.0, 8.0, 0),
      (N'CHEETAH-50', 6.0, 8.0, 0),

      -- 3. ปั๊มลมลูกสูบ Piston — ซีรีส์มาตรฐาน (Start 8.0, Stop 10.0 bar)
      (N'OL-10', 8.0, 10.0, 0),
      (N'OL-20', 8.0, 10.0, 0),
      (N'OL-30', 8.0, 10.0, 0),
      (N'OL-50', 8.0, 10.0, 0),
      (N'OL-75', 8.0, 10.0, 0),
      (N'OL-100', 8.0, 10.0, 0),
      (N'OL-150', 8.0, 10.0, 0),
      (N'PP-23', 8.0, 10.0, 0),
      (N'PP-23P', 8.0, 10.0, 0),
      (N'PP-32', 8.0, 10.0, 0),
      (N'PP-35', 8.0, 10.0, 0),
      (N'PP-35P', 8.0, 10.0, 0),
      (N'PP-35A', 8.0, 10.0, 0),
      (N'PP-275', 8.0, 10.0, 0),
      (N'PP-275A', 8.0, 10.0, 0),
      (N'PP-310', 8.0, 10.0, 0),
      (N'PP-310A', 8.0, 10.0, 0),
      (N'PP-310P', 8.0, 10.0, 0),
      (N'PP-315', 8.0, 10.0, 0),
      (N'PP-315A', 8.0, 10.0, 0),
      (N'PP-320', 8.0, 10.0, 0),
      (N'PP-415', 8.0, 10.0, 0),
      (N'PP-415A', 8.0, 10.0, 0),

      -- ปั๊มลูกสูบขนาดเล็ก / แรงดัน 5–8 bar
      (N'PP-1', 5.0, 7.0, 1),     -- อนุโลม (Concession)
      (N'PP-2', 5.0, 7.0, 0),
      (N'PP-2P', 5.0, 7.0, 0),
      (N'PP-21', 6.0, 8.0, 0),
      (N'PP-22', 6.0, 8.0, 0),

      -- ปั๊มลูกสูบแรงดันสูง TPP (Start 16.0, Stop 18.0 bar — ทั้งหมดอนุโลม Concession)
      (N'TPP-30', 16.0, 18.0, 1),
      (N'TPP-50', 16.0, 18.0, 1),
      (N'TPP-50A', 16.0, 18.0, 1),
      (N'TPP-50P', 16.0, 18.0, 1),
      (N'TPP-75', 16.0, 18.0, 1),
      (N'TPP-75A', 16.0, 18.0, 1),
      (N'TPP-75P', 16.0, 18.0, 1),
      (N'TPP-100', 16.0, 18.0, 1),
      (N'TPP-100A', 16.0, 18.0, 1),
      (N'TPP-100P', 16.0, 18.0, 1),
      (N'TPP-150', 16.0, 18.0, 1),

      -- ปั๊มลูกสูบ TK, TGA, FALCON
      (N'TK-310', 6.0, 8.0, 0),
      (N'TK-310T', 6.0, 8.0, 0),
      (N'TGA1-36M', 5.0, 7.0, 0),
      (N'TGA2-58M', 5.0, 7.0, 0),
      (N'TGA2-70M', 5.0, 7.0, 0),
      (N'TGA21-100M', 8.0, 10.0, 0),
      (N'TGA22-100M', 8.0, 10.0, 0),
      (N'TGA22-150M', 8.0, 10.0, 0),
      (N'TGA25-150M', 8.0, 10.0, 0),
      (N'TGA25-270M', 8.0, 10.0, 0),
      (N'TGA25-340M', 8.0, 10.0, 0),
      (N'TGA310-270M', 8.0, 10.0, 0),
      (N'TGA310-340M', 8.0, 10.0, 0),
      (N'TGA310-500M', 8.0, 10.0, 0),
      (N'TGA33-150M', 8.0, 10.0, 0),
      (N'TGA33-270M', 8.0, 10.0, 0),
      (N'TGA315-340M', 8.0, 10.0, 0),
      (N'TGA315-500M', 8.0, 10.0, 0),
      (N'TGA375-270M', 8.0, 10.0, 0),
      (N'TGA375-340M', 8.0, 10.0, 0),
      (N'FALCON-130M', 6.0, 8.0, 0),
      (N'FALCON-260M', 6.0, 8.0, 0),
      (N'FALCON-21100M', 6.0, 8.0, 0),
      (N'FALCON-21150M', 6.0, 8.0, 0),
      (N'FALCON-33200M', 6.0, 8.0, 0)
  ) AS s(code, pressure_start, pressure_stop, is_concession)
    ON m.code = s.code;
GO

/* 2. หากยังไม่มีโมเดลเหล่านี้ในระบบ ให้สร้างเป็น Master Model ตั้งต้น (อิงแบรนด์ PUMA) */
DECLARE @puma_id INT = (SELECT TOP 1 id FROM dbo.brands WHERE name = N'PUMA');
DECLARE @piston_id INT = (SELECT TOP 1 id FROM dbo.pump_types WHERE code = 'PISTON');
DECLARE @oil_free_id INT = (SELECT TOP 1 id FROM dbo.pump_types WHERE code = 'OIL_FREE');

IF @puma_id IS NOT NULL
BEGIN
    INSERT INTO dbo.models (code, description, brand_id, pump_type_id, origin, pressure_start_bar, pressure_stop_bar, is_pressure_concession)
    SELECT s.code,
           CONCAT(N'ปั๊มลมรุ่น ', s.code),
           @puma_id,
           CASE WHEN s.pump_type = 'OIL_FREE' THEN @oil_free_id ELSE @piston_id END,
           'DOMESTIC',
           s.pressure_start,
           s.pressure_stop,
           s.is_concession
      FROM (VALUES
          (N'FORCE-160 MARK II', 'OIL_FREE', 5.0, 7.0, 0),
          (N'FORCE-120 MARK II', 'OIL_FREE', 5.0, 7.0, 0),
          (N'FORCE-35 MARK II', 'OIL_FREE', 5.0, 7.0, 0),
          (N'FORCE-35 MASK II', 'OIL_FREE', 5.0, 7.0, 0),
          (N'FORCE-55 MARK II', 'OIL_FREE', 5.0, 7.0, 0),
          (N'FORCE-35', 'OIL_FREE', 5.0, 7.0, 0),
          (N'FORCE-55', 'OIL_FREE', 5.0, 7.0, 0),
          (N'FORCE-BL', 'OIL_FREE', 5.0, 7.0, 0),
          (N'HUSH 25', 'OIL_FREE', 5.0, 7.0, 0),
          (N'HUSH 50', 'OIL_FREE', 5.0, 7.0, 0),
          (N'HUSH 100', 'OIL_FREE', 5.0, 7.0, 0),
          (N'JOS-25', 'OIL_FREE', 5.0, 7.0, 0),
          (N'JOS-150', 'OIL_FREE', 5.0, 7.0, 0),
          (N'JOS-250', 'OIL_FREE', 5.0, 7.0, 0),
          (N'JOS-370', 'OIL_FREE', 5.0, 7.0, 0),
          (N'JAGUAR-25', 'OIL_FREE', 5.0, 7.0, 0),
          (N'JAGUAR-50', 'OIL_FREE', 5.0, 7.0, 0),
          (N'JAGUAR-50-1', 'OIL_FREE', 5.0, 7.0, 0),
          (N'JAGUAR-100', 'OIL_FREE', 5.0, 7.0, 0),
          (N'JAGUAR-120', 'OIL_FREE', 5.0, 7.0, 0),
          (N'JAGUAR-150', 'OIL_FREE', 5.0, 7.0, 0),
          (N'HAWK 30', 'OIL_FREE', 5.0, 7.0, 0),
          (N'HAWK 50', 'OIL_FREE', 5.0, 7.0, 0),
          (N'LYNX 25', 'OIL_FREE', 5.0, 7.0, 0),
          (N'LYNX 250', 'OIL_FREE', 5.0, 7.0, 0),
          (N'PXO-25', 'OIL_FREE', 5.0, 7.0, 0),
          (N'PXO-50', 'OIL_FREE', 5.0, 7.0, 0),
          (N'PHO-25', 'OIL_FREE', 5.0, 7.0, 0),
          (N'ZP-OF25', 'OIL_FREE', 5.0, 7.0, 0),
          (N'ZP-OF50', 'OIL_FREE', 5.0, 7.0, 0),
          (N'CLOUD', 'OIL_FREE', 5.0, 7.0, 0),
          (N'CM-2525', 'PISTON', 6.0, 8.0, 0),
          (N'CM-2550', 'PISTON', 6.0, 8.0, 0),
          (N'XM-2525', 'PISTON', 6.0, 8.0, 0),
          (N'XM-2550', 'PISTON', 6.0, 8.0, 0),
          (N'PXD-25', 'PISTON', 6.0, 8.0, 0),
          (N'PXD-50', 'PISTON', 6.0, 8.0, 0),
          (N'EAGLE-25', 'PISTON', 6.0, 8.0, 0),
          (N'EAGLE-50', 'PISTON', 6.0, 8.0, 0),
          (N'CHEETAH-25', 'PISTON', 6.0, 8.0, 0),
          (N'CHEETAH-50', 'PISTON', 6.0, 8.0, 0),
          (N'OL-10', 'PISTON', 8.0, 10.0, 0),
          (N'OL-20', 'PISTON', 8.0, 10.0, 0),
          (N'OL-30', 'PISTON', 8.0, 10.0, 0),
          (N'OL-50', 'PISTON', 8.0, 10.0, 0),
          (N'OL-75', 'PISTON', 8.0, 10.0, 0),
          (N'OL-100', 'PISTON', 8.0, 10.0, 0),
          (N'OL-150', 'PISTON', 8.0, 10.0, 0),
          (N'PP-23', 'PISTON', 8.0, 10.0, 0),
          (N'PP-23P', 'PISTON', 8.0, 10.0, 0),
          (N'PP-32', 'PISTON', 8.0, 10.0, 0),
          (N'PP-35', 'PISTON', 8.0, 10.0, 0),
          (N'PP-35P', 'PISTON', 8.0, 10.0, 0),
          (N'PP-35A', 'PISTON', 8.0, 10.0, 0),
          (N'PP-275', 'PISTON', 8.0, 10.0, 0),
          (N'PP-275A', 'PISTON', 8.0, 10.0, 0),
          (N'PP-310', 'PISTON', 8.0, 10.0, 0),
          (N'PP-310A', 'PISTON', 8.0, 10.0, 0),
          (N'PP-310P', 'PISTON', 8.0, 10.0, 0),
          (N'PP-315', 'PISTON', 8.0, 10.0, 0),
          (N'PP-315A', 'PISTON', 8.0, 10.0, 0),
          (N'PP-320', 'PISTON', 8.0, 10.0, 0),
          (N'PP-415', 'PISTON', 8.0, 10.0, 0),
          (N'PP-415A', 'PISTON', 8.0, 10.0, 0),
          (N'PP-1', 'PISTON', 5.0, 7.0, 1),
          (N'PP-2', 'PISTON', 5.0, 7.0, 0),
          (N'PP-2P', 'PISTON', 5.0, 7.0, 0),
          (N'PP-21', 'PISTON', 6.0, 8.0, 0),
          (N'PP-22', 'PISTON', 6.0, 8.0, 0),
          (N'TPP-30', 'PISTON', 16.0, 18.0, 1),
          (N'TPP-50', 'PISTON', 16.0, 18.0, 1),
          (N'TPP-50A', 'PISTON', 16.0, 18.0, 1),
          (N'TPP-50P', 'PISTON', 16.0, 18.0, 1),
          (N'TPP-75', 'PISTON', 16.0, 18.0, 1),
          (N'TPP-75A', 'PISTON', 16.0, 18.0, 1),
          (N'TPP-75P', 'PISTON', 16.0, 18.0, 1),
          (N'TPP-100', 'PISTON', 16.0, 18.0, 1),
          (N'TPP-100A', 'PISTON', 16.0, 18.0, 1),
          (N'TPP-100P', 'PISTON', 16.0, 18.0, 1),
          (N'TPP-150', 'PISTON', 16.0, 18.0, 1),
          (N'TK-310', 'PISTON', 6.0, 8.0, 0),
          (N'TK-310T', 'PISTON', 6.0, 8.0, 0),
          (N'TGA1-36M', 'PISTON', 5.0, 7.0, 0),
          (N'TGA2-58M', 'PISTON', 5.0, 7.0, 0),
          (N'TGA2-70M', 'PISTON', 5.0, 7.0, 0),
          (N'TGA21-100M', 'PISTON', 8.0, 10.0, 0),
          (N'TGA22-100M', 'PISTON', 8.0, 10.0, 0),
          (N'TGA22-150M', 'PISTON', 8.0, 10.0, 0),
          (N'TGA25-150M', 'PISTON', 8.0, 10.0, 0),
          (N'TGA25-270M', 'PISTON', 8.0, 10.0, 0),
          (N'TGA25-340M', 'PISTON', 8.0, 10.0, 0),
          (N'TGA310-270M', 'PISTON', 8.0, 10.0, 0),
          (N'TGA310-340M', 'PISTON', 8.0, 10.0, 0),
          (N'TGA310-500M', 'PISTON', 8.0, 10.0, 0),
          (N'TGA33-150M', 'PISTON', 8.0, 10.0, 0),
          (N'TGA33-270M', 'PISTON', 8.0, 10.0, 0),
          (N'TGA315-340M', 'PISTON', 8.0, 10.0, 0),
          (N'TGA315-500M', 'PISTON', 8.0, 10.0, 0),
          (N'TGA375-270M', 'PISTON', 8.0, 10.0, 0),
          (N'TGA375-340M', 'PISTON', 8.0, 10.0, 0),
          (N'FALCON-130M', 'PISTON', 6.0, 8.0, 0),
          (N'FALCON-260M', 'PISTON', 6.0, 8.0, 0),
          (N'FALCON-21100M', 'PISTON', 6.0, 8.0, 0),
          (N'FALCON-21150M', 'PISTON', 6.0, 8.0, 0),
          (N'FALCON-33200M', 'PISTON', 6.0, 8.0, 0)
      ) AS s(code, pump_type, pressure_start, pressure_stop, is_concession)
     WHERE NOT EXISTS (SELECT 1 FROM dbo.models m WHERE m.code = s.code);
END
GO
