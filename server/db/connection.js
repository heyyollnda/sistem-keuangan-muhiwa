import Database from 'better-sqlite3'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, 'sekolah-keuangan.db')
const SCHEMA_PATH = path.join(__dirname, 'schema.sql')

const isFirstRun = !existsSync(DB_PATH)

export const db = new Database(DB_PATH)
db.pragma('foreign_keys = ON')

// schema.sql is entirely CREATE TABLE/INDEX IF NOT EXISTS, so re-running it on every startup
// (not just when the file is missing) is safe and keeps the schema self-healing.
db.exec(readFileSync(SCHEMA_PATH, 'utf-8'))

if (isFirstRun) {
  console.log(`[db] Initialized new database at ${DB_PATH}`)
}
