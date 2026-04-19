import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pkg from 'pg'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const { Client } = pkg
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.PG_NO_SSL ? false : { rejectUnauthorized: false } })
async function run(){
  const schema = fs.readFileSync(path.join(__dirname,'../db/schema.sql'),'utf8')
  const seed = fs.readFileSync(path.join(__dirname,'../db/seed.sql'),'utf8')
  await client.connect()
  await client.query(schema)
  await client.query(seed)
  await client.end()
  console.log('DB initialized')
}
run().catch(e=>{ console.error(e); process.exit(1) })
