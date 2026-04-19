// server/scripts/seed-users.js
import 'dotenv/config'
import pkg from 'pg'
import bcrypt from 'bcryptjs'

const { Pool } = pkg
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PG_NO_SSL ? false : { rejectUnauthorized: false }
})

const PASSWORD = '12345' // your chosen password for all users
const hash = await bcrypt.hash(PASSWORD, 12)

const users = [
  { name: 'Mohamed', email: 'mohamed@othm.com', role: 'Admin', branch: null },
  { name: 'Ferran',  email: 'ferran@othm.com',  role: 'Manager', branch: null },
  { name: 'Mia',     email: 'mia@othm.com',     role: 'AdManager', branch: null },

  { name: 'Omar',    email: 'chefomar.uptown@othm.com',    role: 'Chef', branch: 'Uptown' },
  { name: 'Alex',    email: 'chefalex.downtown@othm.com',  role: 'Chef', branch: 'Downtown' },
  { name: 'Maita',   email: 'chefmaita.riverside@othm.com',role: 'Chef', branch: 'Riverside' },

  { name: 'Customer', email: 'customer@othm.com', role: 'Customer', branch: null },
]

async function upsertUser(u) {
  const { rows } = await pool.query(
    `INSERT INTO users (name,email,password_hash,role,branch)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (email)
     DO UPDATE SET
       name = EXCLUDED.name,
       password_hash = EXCLUDED.password_hash,
       role = EXCLUDED.role,
       branch = EXCLUDED.branch
     RETURNING id, name, email, role, branch`,
    [u.name, u.email, hash, u.role, u.branch]
  )
  return rows[0]
}

try {
  const inserted = []
  for (const u of users) {
    inserted.push(await upsertUser(u))
  }
  console.log('Upserted users:\n', inserted)
} finally {
  await pool.end()
}
