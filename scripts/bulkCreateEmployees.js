const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../database/caretime.db');
const db = new sqlite3.Database(dbPath);

const employees = [
  { name: 'Nathan Chitate', email: 'Nchitate@superchargedbygrace.com', password: 'NChitate@987' },
  { name: 'Inos Chibidi', email: 'ichibidi@superchargedbygrace.com', password: 'IChibidi@789' },
  { name: 'Babyna Mulayi', email: 'bmulayi@superchargedbygrace.com', password: 'BMulayi@987' },
  { name: 'Primrose Mbirimi', email: 'pmbirimi@superchargedbygrace.com', password: 'PMbirimi@654' },
  { name: 'Ruvimbo Gavu', email: 'rgavu@superchargedbygrace.com', password: 'RGavu@123' },
  { name: 'Chanda Sampa', email: 'csampa@superchargedbygrace.com', password: 'CSampa@123' },
  { name: 'Addington Muza', email: 'amuza@superchargedbygrace.com', password: 'AMuza@987' },
  { name: 'Heather Makore', email: 'Hmakore@superchargedbygrace.com', password: 'Hmakore@123' },
  { name: 'Tendai Mafuta', email: 'tmafuta@superchargedbygrace.com', password: 'TMafuta@2026' },
  { name: 'Tinotenda Mususa', email: 'tinotendamususa68@gmail.com', password: 'TMususa@321' },
  { name: 'Given Ndlovu', email: 'givengiggs11@gmail.com', password: 'GNdlovu@123' },
  { name: 'Laura Ziani', email: 'Lauraziani732@gmail.com', password: 'LZiani@456' },
  { name: 'Andy Mabika', email: 'amabika@superchargedbygrace.com', password: 'AMabika@456' },
  { name: 'Gabriel Madombwe', email: 'gmadombwe@superchargedbygrace.com', password: 'GMadombwe@123' },
  { name: 'Linet Musungwa', email: 'lmusungwa@superchargedbygrace.com', password: 'LMusungwa@098' },
  { name: 'Charles Mupanduki', email: 'cmupanduki@superchargedbygrace.com', password: 'CMupanduki@2026' },
  { name: 'Caius Jongwe', email: 'cjongwe@superchargedbygrace.com', password: 'CJongwe@123' },
  { name: 'Gorden Jovo', email: 'gjovo@superchargedbygrace.com', password: 'GJovo@2026' },
  { name: 'Benson Chabaputa', email: 'bchabaputa@superchargedbygrace.com', password: 'BChabaputa@789' },
  { name: 'Oswald Dube', email: 'odube@superchargedbygrace.com', password: 'ODube@456' },
  { name: 'Christopher Makore', email: 'amakore@superchargedbygrace.com', password: 'AMakore@890' }
];

async function createEmployees() {
  console.log(`🔧 Creating ${employees.length} employee accounts...`);
  
  for (const emp of employees) {
    try {
      // Check if exists
      const existing = await new Promise((resolve, reject) => {
        db.get('SELECT id FROM employees WHERE LOWER(email) = LOWER(?)', [emp.email], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (existing) {
        console.log(`⚠️  ${emp.name} (${emp.email}) - already exists`);
        continue;
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(emp.password, 10);

      // Insert
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO employees (name, email, password, role) VALUES (?, ?, ?, ?)',
          [emp.name, emp.email, hashedPassword, 'Employee'],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      console.log(`✅ ${emp.name} (${emp.email})`);
    } catch (error) {
      console.error(`❌ Error creating ${emp.name}:`, error.message);
    }
  }

  console.log('\n🎉 Bulk import complete!');
  db.close();
}

createEmployees();