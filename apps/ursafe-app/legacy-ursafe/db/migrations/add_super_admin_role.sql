USE URSafeApp;
GO

IF OBJECT_ID('Roles', 'U') IS NOT NULL
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM Roles
    WHERE LOWER(Name) IN ('super admin', 'super_admin', 'superadmin')
  )
  BEGIN
    INSERT INTO Roles (Name) VALUES ('Super Admin');
  END
END
GO
