import mysql from "mysql2/promise";
import { env } from "./env";

export const pool = mysql.createPool({
  host: env.mysqlHost,
  port: env.mysqlPort,
  database: env.mysqlDatabase,
  user: env.mysqlUser,
  password: env.mysqlPassword,
  connectionLimit: 10
});
