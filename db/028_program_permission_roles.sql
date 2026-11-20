/*
  QCheck — 028: program_role on dbo.users (SQL Server)
  - ProgramPermission (Datacenter role_prog) now carries only coarse levels: USER, ADMIN, DEV.
  - Granular QCheck sub-roles live in dbo.user_roles and are managed inside QCheck (never overwritten on login).
  - LOCAL (field F####) users keep program_role = NULL.
  - Idempotent (safe to re-run).
*/

IF OBJECT_ID(N'dbo.users', N'U') IS NULL
    THROW 51001, 'dbo.users not found: run 001_users.sql first in the QCheck database.', 1;
GO

IF COL_LENGTH(N'dbo.users', N'program_role') IS NULL
BEGIN
    ALTER TABLE dbo.users ADD program_role VARCHAR(16) NULL;
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = N'CK_users_program_role'
      AND parent_object_id = OBJECT_ID(N'dbo.users')
)
BEGIN
    ALTER TABLE dbo.users
    ADD CONSTRAINT CK_users_program_role
        CHECK (program_role IS NULL OR program_role IN ('USER', 'ADMIN', 'DEV'));
END
GO

-- Backfill existing CENTRAL users that do not have program_role set yet
UPDATE u
SET program_role = CASE
    WHEN LOWER(u.employee_code) = 'dev' THEN 'DEV'
    WHEN EXISTS (
        SELECT 1 FROM dbo.user_roles r
        WHERE r.user_id = u.id AND r.role = 'ADMIN'
    ) THEN 'ADMIN'
    ELSE 'USER'
END
FROM dbo.users u
WHERE u.source = 'CENTRAL'
  AND u.program_role IS NULL;
GO
