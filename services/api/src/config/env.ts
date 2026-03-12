import "dotenv/config";

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.API_PORT || 8080),
  jwtSecret: process.env.JWT_SECRET || "change-me",
  cookieDomain: process.env.COOKIE_DOMAIN,
  mysqlHost: process.env.MYSQL_HOST || "localhost",
  mysqlPort: Number(process.env.MYSQL_PORT || 3306),
  mysqlDatabase: process.env.MYSQL_DATABASE || "vlworkhub",
  mysqlUser: process.env.MYSQL_USER || "vlworkhub",
  mysqlPassword: process.env.MYSQL_PASSWORD || "vlworkhub"
};
