const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../database/caretime.db');
const db = new sqlite3.Database(dbPath);

console.log('🔧 Adding entry_type column to timesheets table...');

db.run(`
  ALTER TABLE timesheets 
  ADD COLUMN entry_type TEXT DEFAULT 'hours'
`, (err) => {
  if (err) {
    if (err.message.includes('duplicate column name')) {
      console.log('✅ Column already exists');
    } else {
      console.error('❌ Error:', err.message);
    }
  } else {
    console.log('✅ Added entry_type column successfully!');
  }
  db.close();
});