// db/connection.ts
import sql from 'mssql';

const config = {
  user: process.env.DB_USER || 'your_sql_username',
  password: process.env.DB_PASSWORD || 'your_sql_password',
  server: process.env.DB_SERVER || 'localhost',
  database: process.env.DB_NAME || 'URSafeApp',
  options: {
    encrypt: false, // Set to true if using Azure
    trustServerCertificate: true, // For local dev
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let poolPromise: Promise<any> | null = null;

export function getConnectionPool() {
  if (!poolPromise) {
    poolPromise = sql.connect(config);
  }
  return poolPromise;
}

export default sql;
