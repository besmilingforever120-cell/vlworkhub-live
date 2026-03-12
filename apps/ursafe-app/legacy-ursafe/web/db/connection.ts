import baseSql from 'mssql';

const server = process.env.DB_SERVER || 'localhost';
const database = process.env.DB_NAME || 'URSafeApp';
const user = process.env.DB_USER;
const password = process.env.DB_PASSWORD;
const connectionString = process.env.DB_CONNECTION_STRING;
const useWindowsAuth = !user || !password;

const sql = (useWindowsAuth || connectionString)
  ? (require('mssql/msnodesqlv8') as typeof baseSql)
  : baseSql;

const baseConfig = {
  connectionTimeout: 5000,
  requestTimeout: 5000,
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

const config: baseSql.config = connectionString
  ? {
      ...baseConfig,
      server,
      connectionString,
      driver: 'msnodesqlv8',
    }
  : useWindowsAuth
  ? {
      ...baseConfig,
      server,
      database,
      driver: 'msnodesqlv8',
      options: {
        trustedConnection: true,
        encrypt: true,
        trustServerCertificate: true,
      },
    }
  : {
      ...baseConfig,
      user,
      password,
      server,
      database,
      options: {
        encrypt: false, // Set to true if using Azure
        trustServerCertificate: true, // For local dev
      },
    };

let poolPromise: Promise<sql.ConnectionPool> | null = null;

export function getConnectionPool() {
  if (!poolPromise) {
    poolPromise = sql.connect(config);
  }
  return poolPromise;
}

export default sql;
