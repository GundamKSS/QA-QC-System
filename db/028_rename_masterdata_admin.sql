/*
  QCheck — 028: rename role MASTER_ADMIN -> MASTERDATA_ADMIN (SQL Server)
  - ลดความสับสนระหว่างคำว่า MASTER_ADMIN กับ Super Admin (ADMIN)
  - MASTERDATA_ADMIN ยาว 16 ตัวอักษร พอดีกับคอลัมน์ role VARCHAR(16) (PK) ไม่ต้องสร้าง PK ใหม่
  - รันซ้ำได้ (idempotent)
*/

IF OBJECT_ID(N'dbo.user_roles', N'U') IS NOT NULL
BEGIN
    IF EXISTS (
        SELECT 1
        FROM sys.check_constraints
        WHERE name = N'CK_user_roles_role'
          AND parent_object_id = OBJECT_ID(N'dbo.user_roles')
    )
    BEGIN
        ALTER TABLE dbo.user_roles DROP CONSTRAINT CK_user_roles_role;
    END

    -- กรณีมีทั้ง MASTER_ADMIN และ MASTERDATA_ADMIN ของ user เดียวกันอยู่แล้ว ให้ลบชื่อเก่าออกก่อน
    DELETE old_r
    FROM dbo.user_roles AS old_r
    WHERE old_r.role = 'MASTER_ADMIN'
      AND EXISTS (
          SELECT 1
          FROM dbo.user_roles AS new_r
          WHERE new_r.user_id = old_r.user_id
            AND new_r.role = 'MASTERDATA_ADMIN'
      );

    -- เปลี่ยนแถว MASTER_ADMIN ที่เหลือเป็น MASTERDATA_ADMIN
    UPDATE dbo.user_roles
    SET role = 'MASTERDATA_ADMIN'
    WHERE role = 'MASTER_ADMIN';

    ALTER TABLE dbo.user_roles
    ADD CONSTRAINT CK_user_roles_role CHECK (role IN (
        'ADMIN', 'QC_HEAD', 'QC_INSPECTOR', 'QA_HEAD', 'QA_INSPECTOR',
        'MASTERDATA_ADMIN', 'PURCHASING', 'MANAGEMENT', 'PM'
    ));
END
GO
