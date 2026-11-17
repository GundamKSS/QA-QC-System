/*
  QCheck — 008: complete LOCAL-user columns on databases with the earlier PIN schema.
  003 checks pin_hash before adding its column group; an existing pin_hash can
  therefore leave later columns absent. Keep applied files intact and repair here.
  Additive and repeatable: existing users, PIN hashes and roles are preserved.
*/
IF OBJECT_ID(N'dbo.users', N'U') IS NULL
    THROW 51001, 'dbo.users not found: run 001_users.sql first in the QCheck database.', 1;
GO

IF COL_LENGTH(N'dbo.users', N'nickname') IS NULL
    ALTER TABLE dbo.users ADD nickname NVARCHAR(100) NULL;
GO

IF COL_LENGTH(N'dbo.users', N'pin_must_change') IS NULL
    ALTER TABLE dbo.users ADD pin_must_change BIT NOT NULL
        CONSTRAINT DF_users_pin_must_change DEFAULT (0);
GO

IF COL_LENGTH(N'dbo.users', N'updated_by') IS NULL
    ALTER TABLE dbo.users ADD updated_by BIGINT NULL;
GO

IF OBJECT_ID(N'dbo.FK_users_updated_by', N'F') IS NULL
    ALTER TABLE dbo.users ADD CONSTRAINT FK_users_updated_by
        FOREIGN KEY (updated_by) REFERENCES dbo.users (id);
GO
