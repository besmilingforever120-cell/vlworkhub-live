USE URSafeApp;
GO

IF OBJECT_ID('Shifts', 'U') IS NULL
BEGIN
  CREATE TABLE Shifts (
    ShiftId INT IDENTITY(1,1) PRIMARY KEY,
    UserId INT NOT NULL,
    StartTime DATETIME2 NOT NULL,
    EndTime DATETIME2 NULL,
    Status NVARCHAR(32) NOT NULL,
    LastCheckIn DATETIME2 NULL,
    CheckInCount INT NOT NULL DEFAULT 0,
    CurrentLocation NVARCHAR(MAX) NULL,
    ClientName NVARCHAR(255) NULL,
    ClientAddress NVARCHAR(255) NULL,
    ExpectedDuration INT NULL,
    Notes NVARCHAR(MAX) NULL,
    CreatedAt DATETIME2 DEFAULT SYSDATETIME(),
    UpdatedAt DATETIME2 DEFAULT SYSDATETIME(),
    FOREIGN KEY (UserId) REFERENCES Users(UserId)
  );

  CREATE INDEX IX_Shifts_UserId ON Shifts(UserId);
  CREATE INDEX IX_Shifts_Status ON Shifts(Status);
END
GO

IF OBJECT_ID('CheckIns', 'U') IS NULL
BEGIN
  CREATE TABLE CheckIns (
    CheckInId INT IDENTITY(1,1) PRIMARY KEY,
    ShiftId INT NOT NULL,
    UserId INT NOT NULL,
    Timestamp DATETIME2 NOT NULL,
    Location NVARCHAR(MAX) NULL,
    Status NVARCHAR(32) NOT NULL,
    Notes NVARCHAR(MAX) NULL,
    FOREIGN KEY (ShiftId) REFERENCES Shifts(ShiftId),
    FOREIGN KEY (UserId) REFERENCES Users(UserId)
  );

  CREATE INDEX IX_CheckIns_ShiftId ON CheckIns(ShiftId);
END
GO

IF OBJECT_ID('Emergencies', 'U') IS NULL
BEGIN
  CREATE TABLE Emergencies (
    EmergencyId INT IDENTITY(1,1) PRIMARY KEY,
    UserId INT NOT NULL,
    ShiftId INT NULL,
    Type NVARCHAR(32) NOT NULL,
    Location NVARCHAR(MAX) NULL,
    Timestamp DATETIME2 NOT NULL,
    Resolved BIT NOT NULL DEFAULT 0,
    ResolvedAt DATETIME2 NULL,
    ResolvedBy INT NULL,
    Notes NVARCHAR(MAX) NULL,
    FOREIGN KEY (UserId) REFERENCES Users(UserId),
    FOREIGN KEY (ShiftId) REFERENCES Shifts(ShiftId),
    FOREIGN KEY (ResolvedBy) REFERENCES Users(UserId)
  );

  CREATE INDEX IX_Emergencies_UserId ON Emergencies(UserId);
  CREATE INDEX IX_Emergencies_Resolved ON Emergencies(Resolved);
END
GO
