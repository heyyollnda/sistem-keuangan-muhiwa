// Copies the live database into <project-root>/backups/ with a timestamped filename, then
// prunes backups beyond the retention limit. Run automatically by the Jalankan-SIKAS
// launchers (Mac .command / Windows .bat) right before the server starts — also runnable
// directly via `npm run backup`, and importable as a module (createBackup) by other scripts
// that need a one-off checkpoint, e.g. reset-dummy-data.js before it wipes the database.
// A missing database (first run on a fresh machine) or a failed backup is logged and skipped
// rather than blocking startup — this is a best-effort safety net, not a gate the app refuses
// to start without.

import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, 'sekolah-keuangan.db')
const BACKUP_DIR = path.join(__dirname, '../../backups')
const BACKUP_PREFIX = 'sekolah-keuangan-'
const RETENTION_COUNT = 14

// A backup whose filename contains this tag (e.g. "sebelum-reset") marks a deliberate
// checkpoint rather than a routine daily snapshot, and is exempt from the retention prune —
// otherwise routine `npm run backup` calls in the following weeks would eventually delete the
// one backup taken right before a permanent data wipe, defeating its whole purpose.
const PROTECTED_TAG = 'sebelum-reset'

function timestamp() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

/**
 * Copies the live database into backups/. Pass `label` to tag the filename (e.g.
 * `createBackup({ label: 'sebelum-reset' })` → sekolah-keuangan-sebelum-reset-<timestamp>.db)
 * — a label matching PROTECTED_TAG keeps this backup out of the retention prune below.
 * Returns the created backup's filename, or null if there's no database yet to back up.
 */
export function createBackup({ label } = {}) {
  if (!existsSync(DB_PATH)) return null
  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true })

  const tag = label ? `${label}-` : ''
  const backupName = `${BACKUP_PREFIX}${tag}${timestamp()}.db`
  copyFileSync(DB_PATH, path.join(BACKUP_DIR, backupName))
  return backupName
}

/** Deletes backups beyond RETENTION_COUNT (newest kept), skipping PROTECTED_TAG'd ones.
 *  Returns the filenames that were deleted. */
export function pruneOldBackups() {
  if (!existsSync(BACKUP_DIR)) return []

  const files = readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith(BACKUP_PREFIX) && f.endsWith('.db'))
    .filter((f) => !f.includes(PROTECTED_TAG))
    .map((f) => ({ name: f, mtime: statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime) // newest first

  const toDelete = files.slice(RETENTION_COUNT)
  for (const f of toDelete) unlinkSync(path.join(BACKUP_DIR, f.name))
  return toDelete.map((f) => f.name)
}

function main() {
  const backupName = createBackup()
  if (!backupName) {
    console.log(
      '[backup] Belum ada database (server/db/sekolah-keuangan.db) — dilewati. ' +
        'Database baru akan dibuat otomatis saat server pertama kali dijalankan.'
    )
    return
  }
  console.log(`[backup] Backup database berhasil dibuat: backups/${backupName}`)

  for (const deleted of pruneOldBackups()) {
    console.log(`[backup] Menghapus backup lama: ${deleted}`)
  }
}

// Only auto-run when executed directly (`node backup.js` / `npm run backup`) — not when
// imported as a module by another script (e.g. reset-dummy-data.js), which calls
// createBackup() itself with its own label instead.
const isMainModule = path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)
if (isMainModule) {
  try {
    main()
  } catch (err) {
    console.error(`[backup] Gagal membuat backup: ${err.message}`)
    console.error('[backup] Melanjutkan tanpa backup kali ini.')
  }
}
