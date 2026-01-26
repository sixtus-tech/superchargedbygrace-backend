const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../database/caretime.db');
const db = new sqlite3.Database(dbPath);

async function runQuery(query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

async function migrate() {
  console.log('🏠 Adding Houses Feature...\n');
  
  try {
    // Create houses table
    await runQuery(`
      CREATE TABLE IF NOT EXISTS houses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        employee_pay_per_day REAL NOT NULL,
        client_charge_per_day REAL NOT NULL,
        payment_frequency TEXT NOT NULL,
        invoice_style TEXT NOT NULL,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Created houses table');
    
    // Add house_id to timesheets
    await runQuery('ALTER TABLE timesheets ADD COLUMN house_id INTEGER REFERENCES houses(id)');
    console.log('✅ Added house_id to timesheets');
    
    // Add house_id to employees
    await runQuery('ALTER TABLE employees ADD COLUMN house_id INTEGER REFERENCES houses(id)');
    console.log('✅ Added house_id to employees');
    
    // Insert the 5 houses
    const houses = [
      { name: 'Frisco', employee_pay: 150, client_charge: 200, frequency: 'weekly', style: 'grouped' },
      { name: 'Plano Ambrosia', employee_pay: 180, client_charge: 205, frequency: 'weekly', style: 'daily' },
      { name: 'Plano Aylesbury', employee_pay: 180, client_charge: 205, frequency: 'weekly', style: 'daily' },
      { name: 'Plano Evergreen', employee_pay: 180, client_charge: 190, frequency: 'bi-weekly', style: 'grouped' }
    ];
    
    for (const house of houses) {
      await runQuery(
        'INSERT INTO houses (name, employee_pay_per_day, client_charge_per_day, payment_frequency, invoice_style) VALUES (?, ?, ?, ?, ?)',
        [house.name, house.employee_pay, house.client_charge, house.frequency, house.style]
      );
      console.log(`✅ Added house: ${house.name}`);
    }
    
    console.log('\n🎉 Houses feature added successfully!');
    db.close();
    
  } catch (error) {
    if (error.message.includes('duplicate column')) {
      console.log('⚠️  Columns already exist, skipping...');
    } else {
      console.error('❌ Error:', error.message);
    }
    db.close();
  }
}

migrate();