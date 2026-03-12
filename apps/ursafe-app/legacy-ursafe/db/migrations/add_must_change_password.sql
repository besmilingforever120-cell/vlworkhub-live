USE URSafeApp;
GO

IF COL_LENGTH('Users', 'MustChangePassword') IS NULL
BEGIN
  ALTER TABLE Users ADD MustChangePassword BIT NOT NULL CONSTRAINT DF_Users_MustChangePassword DEFAULT 0;
END
GO

UPDATE Users
SET MustChangePassword = 0
WHERE MustChangePassword IS NULL;
GO
