import "dotenv/config";

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.API_PORT || 8080),
  jwtSecret: process.env.JWT_SECRET || "change-me",
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  allowedOrigins: (process.env.ALLOWED_ORIGINS ||
    "http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:3003")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  mysqlHost: process.env.MYSQL_HOST || "localhost",
  mysqlPort: Number(process.env.MYSQL_PORT || 3306),
  mysqlDatabase: process.env.MYSQL_DATABASE || "vlworkhub",
  mysqlUser: process.env.MYSQL_USER || "vlworkhub",
  mysqlPassword: process.env.MYSQL_PASSWORD || "vlworkhub"
};
