-- Add this to your SQL Server database to support the Settings API
CREATE TABLE Settings (
  Id INT IDENTITY(1,1) PRIMARY KEY,
  RatePerKm FLOAT NOT NULL,
  SmtpEmail NVARCHAR(255) NOT NULL,
  SmtpPassword NVARCHAR(255) NOT NULL,
  SmtpHost NVARCHAR(255) NOT NULL,
  SmtpPort INT NOT NULL,
  LogoData NVARCHAR(MAX) NULL
);
