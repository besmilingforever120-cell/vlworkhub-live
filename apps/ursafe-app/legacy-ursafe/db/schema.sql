-- schema.sql for URSafe App (SQL Server 2022)
USE URSafeApp;
GO
-- Roles table
IF OBJECT_ID('Roles', 'U') IS NOT NULL
    DROP TABLE Roles;
CREATE TABLE Roles (
    RoleId INT IDENTITY(1,1) PRIMARY KEY,
    Name NVARCHAR(32) NOT NULL UNIQUE
);

-- Users table
IF OBJECT_ID('Users', 'U') IS NOT NULL
    DROP TABLE Users;
CREATE TABLE Users (
    UserId INT IDENTITY(1,1) PRIMARY KEY,
    Email NVARCHAR(255) NOT NULL UNIQUE,
    PasswordHash NVARCHAR(255) NOT NULL,
    FullName NVARCHAR(100) NOT NULL,
    RoleId INT NOT NULL,
    ManagerId INT NULL,
    MustChangePassword BIT NOT NULL DEFAULT 0,
    CreatedAt DATETIME2 DEFAULT SYSDATETIME(),
    FOREIGN KEY (RoleId) REFERENCES Roles(RoleId),
    FOREIGN KEY (ManagerId) REFERENCES Users(UserId)
);

-- Trips table
IF OBJECT_ID('Trips', 'U') IS NOT NULL
    DROP TABLE Trips;
CREATE TABLE Trips (
    TripId INT IDENTITY(1,1) PRIMARY KEY,
    UserId INT NOT NULL,
    StartTime DATETIME2 NOT NULL,
    EndTime DATETIME2 NOT NULL,
    StartLatitude FLOAT NOT NULL,
    StartLongitude FLOAT NOT NULL,
    EndLatitude FLOAT NOT NULL,
    EndLongitude FLOAT NOT NULL,
    DistanceKm FLOAT NOT NULL,
    Category NVARCHAR(32) NOT NULL,
    Purpose NVARCHAR(255),
    Notes NVARCHAR(255),
    Status NVARCHAR(32) DEFAULT 'PENDING_APPROVAL',
    CreatedAt DATETIME2 DEFAULT SYSDATETIME(),
    FOREIGN KEY (UserId) REFERENCES Users(UserId)
);

-- TripRoutePoints table (optional: for storing full route)
IF OBJECT_ID('TripRoutePoints', 'U') IS NOT NULL
    DROP TABLE TripRoutePoints;
CREATE TABLE TripRoutePoints (
    RoutePointId INT IDENTITY(1,1) PRIMARY KEY,
    TripId INT NOT NULL,
    Latitude FLOAT NOT NULL,
    Longitude FLOAT NOT NULL,
    Timestamp DATETIME2 NOT NULL,
    FOREIGN KEY (TripId) REFERENCES Trips(TripId)
);

CREATE INDEX IX_Trips_UserId ON Trips(UserId);
CREATE INDEX IX_Users_ManagerId ON Users(ManagerId);
CREATE INDEX IX_TripRoutePoints_TripId ON TripRoutePoints(TripId);

-- ActiveUserSessions table (for live tracking)
IF OBJECT_ID('ActiveUserSessions', 'U') IS NOT NULL
    DROP TABLE ActiveUserSessions;
CREATE TABLE ActiveUserSessions (
    SessionId INT IDENTITY(1,1) PRIMARY KEY,
    UserId INT NOT NULL,
    Status NVARCHAR(32) NOT NULL,
    DeviceName NVARCHAR(255),
    Platform NVARCHAR(64),
    StartedAt DATETIME2 NOT NULL,
    LastSeenAt DATETIME2 NOT NULL,
    Location NVARCHAR(MAX),
    LastKnownActivity NVARCHAR(255),
    BatteryLevel FLOAT,
    Notes NVARCHAR(255),
    FOREIGN KEY (UserId) REFERENCES Users(UserId)
);

INSERT INTO Roles (Name) VALUES ('Super Admin'), ('Admin'), ('Manager'), ('Employee');
