// server/seed-users.js
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

// Ensure we always read the env file from server/.env
const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '.env') })

import pkg from 'pg'
import bcrypt from 'bcryptjs'

const { Pool } = pkg
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PG_NO_SSL ? false : { rejectUnauthorized: false },
})

const PASSWORD = '12345' // the password you said all seed users should have
const hash = await bcrypt.hash(PASSWORD, 12)

// Ensure table exists (matches your current schema with both columns)
async function ensureUsersTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,           -- plain column (we'll store the HASH here too)
      role TEXT NOT NULL DEFAULT 'Customer',
      branch TEXT,
      password_hash TEXT                -- proper place for the hash
    );
  `)
}

const users = [
  { name: 'Mohamed', email: 'mohamed@othm.com', role: 'Admin', branch: null },
  { name: 'Ferran',  email: 'ferran@othm.com',  role: 'Manager', branch: null },
  { name: 'Mia',     email: 'mia@othm.com',     role: 'AdManager', branch: null },

  { name: 'Omar',  email: 'chefomar.uptown@othm.com',     role: 'Chef', branch: 'Uptown' },
  { name: 'Alex',  email: 'chefalex.downtown@othm.com',   role: 'Chef', branch: 'Downtown' },
  { name: 'Maita', email: 'chefmaita.riverside@othm.com', role: 'Chef', branch: 'Riverside' },

  { name: 'Customer', email: 'customer@othm.com', role: 'Customer', branch: null },
]

// Upsert: write the hash into BOTH columns to satisfy NOT NULL
async function upsertUser(u) {
  const { rows } = await pool.query(
    `
    INSERT INTO users (name, email, password, password_hash, role, branch)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (email)
    DO UPDATE SET
      name = EXCLUDED.name,
      password = EXCLUDED.password,
      password_hash = EXCLUDED.password_hash,
      role = EXCLUDED.role,
      branch = EXCLUDED.branch
    RETURNING id, name, email, role, branch
    `,
    [u.name, u.email, hash, hash, u.role, u.branch]
  )
  return rows[0]
}

async function main() {
  await ensureUsersTable()
  const inserted = []
  for (const u of users) inserted.push(await upsertUser(u))
  console.log('Upserted users:\n', inserted)
}

try {
  await main()
} catch (err) {
  console.error('Seeding failed:', err)
} finally {
  await pool.end()
}
