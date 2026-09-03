import Database from 'better-sqlite3';
const db = new Database('sekolah-keuangan.db');
const rows = db.prepare("SELECT DISTINCT tahun_ajaran FROM fee_categories ORDER BY tahun_ajaran").all();
console.log('Tahun ajaran yang ada di database:', JSON.stringify(rows, null, 2));

const count2025 = db.prepare("SELECT COUNT(*) as jumlah FROM fee_categories WHERE tahun_ajaran = '2025/2026'").get();
const count2024 = db.prepare("SELECT COUNT(*) as jumlah FROM fee_categories WHERE tahun_ajaran = '2024/2025'").get();
console.log('Jumlah baris 2025/2026:', count2025.jumlah);
console.log('Jumlah baris 2024/2025:', count2024.jumlah);

db.close();
