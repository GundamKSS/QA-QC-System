/*
  QCheck — 026: ตาราง AQL มาตรฐาน, ค่า AQL ตั้งต้นของ Model, และใบงานลูกคนเล็กฝั่ง QA (SQL Server)
  Spec: docs/03 BR-03, §3.1 (Master data: aql_table) · ชีต Google Sheet 'QC26 แผนQC'
  - 1. ขยาย dbo.work_orders ให้รองรับลูกคนเล็กฝั่ง QA (type = 'QA', Need >= 0)
  - 2. Seed ตาราง dbo.aql_table ทั้ง 3 ระดับ (REDUCED, NORMAL, TIGHTENED) ตามตาราง AQL ในชีต QC26
  - 3. อัปเดต default_aql_level ให้ dbo.models ที่มีระบุในชีต 'เคสผ่อนคลาย'
  - ไม่แก้ไฟล์ก่อนหน้า · รันซ้ำได้ปลอดภัย (Idempotent)
*/

IF OBJECT_ID(N'dbo.aql_table', N'U') IS NULL OR OBJECT_ID(N'dbo.work_orders', N'U') IS NULL OR OBJECT_ID(N'dbo.models', N'U') IS NULL
    THROW 51260, '026 needs dbo.aql_table, dbo.work_orders, and dbo.models (run 004, 007, 009 first).', 1;
GO

/* =========================================================================
   1. ขยาย dbo.work_orders ให้รองรับลูกคนเล็ก (type = 'QA')
      - เลขใบงาน QA ใช้รูปแบบ <plan_no>-QA (เช่น QP-2611-0001-QA)
      - type IN ('QC', 'CALLIN_FIX', 'QA')
      - qty_need ของ QA กำหนดตามค่า AQL (<= called_qty)
   ========================================================================= */
IF OBJECT_ID(N'dbo.CK_work_orders_type', N'C') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_work_orders_type' AND definition LIKE N'%''QA''%')
    ALTER TABLE dbo.work_orders DROP CONSTRAINT CK_work_orders_type;
GO

IF OBJECT_ID(N'dbo.CK_work_orders_type', N'C') IS NULL
    ALTER TABLE dbo.work_orders ADD CONSTRAINT CK_work_orders_type
        CHECK (type IN ('QC', 'CALLIN_FIX', 'QA'));
GO

IF OBJECT_ID(N'dbo.CK_work_orders_need', N'C') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_work_orders_need' AND definition LIKE N'%''QA''%')
    ALTER TABLE dbo.work_orders DROP CONSTRAINT CK_work_orders_need;
GO

IF OBJECT_ID(N'dbo.CK_work_orders_need', N'C') IS NULL
    ALTER TABLE dbo.work_orders ADD CONSTRAINT CK_work_orders_need
        CHECK (qty_need >= 0 AND qty_need <= called_qty AND (type IN ('QC', 'QA') OR qty_need = 0));
GO

/* =========================================================================
   2. Seed ข้อมูลตาราง AQL มาตรฐาน (dbo.aql_table) จากชีต 'QC26 แผนQC'
      - REDUCED (AQLผ่อนคลาย)
      - NORMAL (AQLปกติ)
      - TIGHTENED (AQLเคร่งครัด)
   ========================================================================= */
MERGE dbo.aql_table AS target
USING (VALUES
    -- 1. REDUCED (ผ่อนคลาย)
    ('REDUCED',   1,    1,    'A', 1,   0, 1),
    ('REDUCED',   2,    8,    'A', 2,   0, 1),
    ('REDUCED',   9,    15,   'B', 2,   0, 1),
    ('REDUCED',   16,   25,   'C', 2,   0, 1),
    ('REDUCED',   26,   50,   'D', 3,   0, 1),
    ('REDUCED',   51,   90,   'E', 5,   0, 1),
    ('REDUCED',   91,   150,  'F', 8,   0, 1),
    ('REDUCED',   151,  280,  'G', 13,  0, 1),
    ('REDUCED',   281,  500,  'H', 20,  1, 2),
    ('REDUCED',   501,  1200, 'J', 32,  1, 2),
    ('REDUCED',   1201, 3200, 'K', 50,  2, 3),

    -- 2. NORMAL (ปกติ)
    ('NORMAL',    1,    1,    'A', 1,   0, 1),
    ('NORMAL',    2,    8,    'A', 2,   0, 1),
    ('NORMAL',    9,    15,   'B', 3,   0, 1),
    ('NORMAL',    16,   25,   'C', 5,   0, 1),
    ('NORMAL',    26,   50,   'D', 8,   0, 1),
    ('NORMAL',    51,   90,   'E', 13,  0, 1),
    ('NORMAL',    91,   150,  'F', 20,  1, 2),
    ('NORMAL',    151,  280,  'G', 32,  1, 2),
    ('NORMAL',    281,  500,  'H', 50,  2, 3),
    ('NORMAL',    501,  1200, 'J', 80,  3, 4),
    ('NORMAL',    1201, 3200, 'K', 125, 5, 6),

    -- 3. TIGHTENED (เคร่งครัด)
    ('TIGHTENED', 1,    1,    'A', 1,   0, 1),
    ('TIGHTENED', 2,    8,    'A', 2,   0, 1),
    ('TIGHTENED', 9,    15,   'B', 3,   0, 1),
    ('TIGHTENED', 16,   25,   'C', 5,   0, 1),
    ('TIGHTENED', 26,   50,   'D', 8,   0, 1),
    ('TIGHTENED', 51,   90,   'E', 13,  0, 1),
    ('TIGHTENED', 91,   150,  'F', 20,  0, 1),
    ('TIGHTENED', 151,  280,  'G', 32,  1, 2),
    ('TIGHTENED', 281,  500,  'H', 50,  1, 2),
    ('TIGHTENED', 501,  1200, 'J', 80,  2, 3),
    ('TIGHTENED', 1201, 3200, 'K', 125, 3, 4)
) AS source (level, lot_min, lot_max, code_letter, sample_size, ac, re)
ON (target.level = source.level AND target.lot_min = source.lot_min)
WHEN MATCHED THEN
    UPDATE SET
        target.lot_max = source.lot_max,
        target.code_letter = source.code_letter,
        target.sample_size = source.sample_size,
        target.ac = source.ac,
        target.re = source.re,
        target.is_active = 1,
        target.updated_at = SYSUTCDATETIME()
WHEN NOT MATCHED THEN
    INSERT (level, lot_min, lot_max, code_letter, sample_size, ac, re, is_active)
    VALUES (source.level, source.lot_min, source.lot_max, source.code_letter, source.sample_size, source.ac, source.re, 1);
GO

/* =========================================================================
   3. อัปเดตค่า default_aql_level ให้ dbo.models ตามชีต 'เคสผ่อนคลาย'
      (อัปเดตเฉพาะรุ่นที่ยังเป็น NULL เพื่อไม่ทับค่าที่ผู้ใช้ตั้งเองภายหลัง)
   ========================================================================= */
UPDATE m
   SET m.default_aql_level = s.aql_level,
       m.updated_at = SYSUTCDATETIME()
  FROM dbo.models m
  JOIN (VALUES
      -- ผ่อนคลาย (REDUCED)
      (N'FALCON-130M',       'REDUCED'),
      (N'FALCON-21100M',     'REDUCED'),
      (N'FALCON-22150M',     'REDUCED'),
      (N'FALCON-21150M',     'REDUCED'),
      (N'TGA1-36M',          'REDUCED'),
      (N'TGA21-100M',        'REDUCED'),
      (N'TGA22-100M',        'REDUCED'),
      (N'TGA22-150M',        'REDUCED'),
      (N'TGA-22-150N',       'REDUCED'),
      (N'TGA25-340M',        'REDUCED'),
      (N'TGA2-58M',          'REDUCED'),
      (N'TGA2-70M',          'REDUCED'),
      (N'TGA33-150M',        'REDUCED'),
      (N'TGA33-270M',        'REDUCED'),
      (N'TGA25-150M',        'REDUCED'),
      (N'TGA25-270M',        'REDUCED'),
      (N'TGA310-270M',       'REDUCED'),
      (N'TGA310-340M',       'REDUCED'),
      (N'TGA310-500M',       'REDUCED'),
      (N'TGA315-340M',       'REDUCED'),
      (N'TGA315-500M',       'REDUCED'),
      (N'TGA375-270M',       'REDUCED'),
      (N'TGA375-340M',       'REDUCED'),
      (N'HUSH-25',           'REDUCED'),
      (N'HUSH 25',           'REDUCED'),
      (N'HUSH-50',           'REDUCED'),
      (N'HUSH 50',           'REDUCED'),
      (N'HUSH-100',          'REDUCED'),
      (N'HUSH 100',          'REDUCED'),
      (N'FORCE-35',          'REDUCED'),
      (N'FORCE 35',          'REDUCED'),
      (N'FORCE-55',          'REDUCED'),
      (N'FORCE 55',          'REDUCED'),
      (N'FORCE-120',         'REDUCED'),
      (N'FORCE 120',         'REDUCED'),
      (N'FORCE-160',         'REDUCED'),
      (N'FORCE 160',         'REDUCED'),
      (N'FORCE-BL',          'REDUCED'),
      (N'FORCE-35 MARK II',  'REDUCED'),
      (N'FORCE-35 MASK II',  'REDUCED'),
      (N'FORCE-55 MARK II',  'REDUCED'),
      (N'FORCE-120 MARK II', 'REDUCED'),
      (N'FORCE-160 MARK II', 'REDUCED'),
      (N'JAGUAR-25',         'REDUCED'),
      (N'JAGUAR-50',         'REDUCED'),
      (N'JAGUAR-50-1',       'REDUCED'),
      (N'JAGUAR-100',        'REDUCED'),
      (N'JAGUAR-120',        'REDUCED'),
      (N'JAGUAR-150',        'REDUCED'),
      (N'JOS-09',            'REDUCED'),
      (N'JOS-25',            'REDUCED'),
      (N'JOS-150',           'REDUCED'),
      (N'JOS-250',           'REDUCED'),
      (N'HAWK-30',           'REDUCED'),
      (N'HAWK 30',           'REDUCED'),
      (N'HAWK-50',           'REDUCED'),
      (N'HAWK 50',           'REDUCED'),
      (N'HAWK-250',          'REDUCED'),
      (N'HAWK 250',          'REDUCED'),
      (N'LYNX-25',           'REDUCED'),
      (N'LYNX 25',           'REDUCED'),
      (N'PXO-25',            'REDUCED'),
      (N'PXO-50',            'REDUCED'),
      (N'CHEETAH-50',        'REDUCED'),
      (N'CHEETAH-25',        'REDUCED'),
      (N'EAGLE-25',          'REDUCED'),
      (N'PXD-50',            'REDUCED'),
      (N'OL-50',             'REDUCED'),

      -- ปกติ (NORMAL)
      (N'FALCON-260M',       'NORMAL'),
      (N'FALCON-33200M',     'NORMAL'),
      (N'EAGLE-50',          'NORMAL'),
      (N'BF100-300',         'NORMAL'),
      (N'BF20-100',          'NORMAL'),
      (N'BF50-160',          'NORMAL'),
      (N'OL-10',             'NORMAL'),
      (N'OL-20',             'NORMAL'),
      (N'OL-30',             'NORMAL'),
      (N'OL-75',             'NORMAL'),
      (N'OL-100',            'NORMAL'),
      (N'OL-150',            'NORMAL'),
      (N'PP-1',              'NORMAL'),
      (N'PP-2',              'NORMAL'),
      (N'PP-2P',             'NORMAL'),
      (N'PP-21',             'NORMAL'),
      (N'PP-22',             'NORMAL'),
      (N'PP-23',             'NORMAL'),
      (N'PP-23P',            'NORMAL'),
      (N'PP-275',            'NORMAL'),
      (N'PP-275A',           'NORMAL'),
      (N'PP-310',            'NORMAL'),
      (N'PP-310A',           'NORMAL'),
      (N'PP-310P',           'NORMAL'),
      (N'PP-315',            'NORMAL'),
      (N'PP-315A',           'NORMAL'),
      (N'PP-315P',           'NORMAL'),
      (N'PP-32',             'NORMAL'),
      (N'PP-320',            'NORMAL'),
      (N'PP-35',             'NORMAL'),
      (N'PP-35A',            'NORMAL'),
      (N'PP-35P',            'NORMAL'),
      (N'PP-415',            'NORMAL'),
      (N'PP-415A',           'NORMAL'),
      (N'PP-430',            'NORMAL'),
      (N'TPP-30',            'NORMAL'),
      (N'TPP-30P',           'NORMAL'),
      (N'TPP-50',            'NORMAL'),
      (N'TPP-50A',           'NORMAL'),
      (N'TPP-50P',           'NORMAL'),
      (N'TPP-75',            'NORMAL'),
      (N'TPP-75A',           'NORMAL'),
      (N'TPP-75P',           'NORMAL'),
      (N'TPP-100',           'NORMAL'),
      (N'TPP-100A',          'NORMAL'),
      (N'TPP-100P',          'NORMAL'),
      (N'TPP-150',           'NORMAL'),
      (N'JOS-370',           'NORMAL'),
      (N'OF - 2550V',        'NORMAL'),
      (N'LYNX-250',          'NORMAL'),
      (N'LYNX 250',          'NORMAL'),
      (N'ZOS-50',            'NORMAL'),
      (N'CM-2525',           'NORMAL'),
      (N'CX-2525H',          'NORMAL'),
      (N'CM-2550',           'NORMAL'),
      (N'CX-2540',           'NORMAL'),
      (N'CX-2550H',          'NORMAL'),
      (N'PXD-25',            'NORMAL'),
      (N'XM-2525',           'NORMAL'),
      (N'XM2525',            'NORMAL'),
      (N'XM-2530',           'NORMAL'),
      (N'XM-2540',           'NORMAL'),
      (N'XM-2550',           'NORMAL')
  ) AS s(code, aql_level)
    ON m.code = s.code
 WHERE m.default_aql_level IS NULL;
GO
