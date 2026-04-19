// server/db/index.js
import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || undefined,
  // ssl: { rejectUnauthorized: false }, // uncomment when deploying if host requires SSL
});

export function query(text, params) {
  return pool.query(text, params);
}
