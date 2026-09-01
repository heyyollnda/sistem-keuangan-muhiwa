import Database from 'better-sqlite3';
const db = new Database('sekolah-keuangan.db');
const rows = db.prepare("SELECT id, grade, program_keahlian, category_id, category_name FROM fee_categories WHERE category_name LIKE '%Registrasi%'").all();
console.log(JSON.stringify(rows, null, 2));
db.close();
