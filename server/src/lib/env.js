// Loads server/.env before anything else touches process.env — resolved relative to this
// file (not process.cwd()), so it finds server/.env regardless of how/where the server is
// started (npm --prefix, a Windows .bat, launched from a different working directory, ...).
import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.join(__dirname, '../../.env') })
