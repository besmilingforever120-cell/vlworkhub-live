import { Pool } from "pg";
import { env } from "./env";

if (!env.databaseUrl) {
  throw new Error("DATABASE_URL is required. Configure it in the environment before starting the API.");
}

export const pool = new Pool({
  connectionString: env.databaseUrl
});

export async function verifyDatabaseConnection() {
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
  } finally {
    client.release();
  }
}
