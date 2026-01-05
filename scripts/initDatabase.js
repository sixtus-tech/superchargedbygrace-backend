const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../database/caretime.db');
const dbDir = path.dirname(dbPath);

// Create database directory if it doesn't exist
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath);

async function initDatabase() {
  console.log('🔧 Initializing database with sample data...');

  return new Promise((resolve, reject) => {
    db.serialize(async () => {
      try {
        // Create employees table
        db.run(`
          CREATE TABLE IF NOT EXISTS employees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'Caregiver',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Create timesheets table (WITHOUT client_name)
        db.run(`
          CREATE TABLE IF NOT EXISTS timesheets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER NOT NULL,
            employee_name TEXT NOT NULL,
            date DATE NOT NULL,
            hours REAL NOT NULL,
            client_charge REAL NOT NULL,
            employee_pay REAL NOT NULL,
            profit REAL NOT NULL,
            notes TEXT,
            status TEXT DEFAULT 'pending',
            submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
          )
        `);

        // Create indexes
        db.run('CREATE INDEX IF NOT EXISTS idx_timesheets_employee ON timesheets(employee_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_timesheets_date ON timesheets(date)');
        db.run('CREATE INDEX IF NOT EXISTS idx_timesheets_status ON timesheets(status)');

        // Clear existing data
        db.run('DELETE FROM timesheets');
        db.run('DELETE FROM employees');

        // Create admin user
        const adminPassword = await bcrypt.hash('admin123', 10);
        const adminResult = await new Promise((resolve, reject) => {
          db.run(
            'INSERT INTO employees (name, email, password, role) VALUES (?, ?, ?, ?)',
            ['Admin User', 'admin@superchargedbygrace.com', adminPassword, 'Administrator'],
            function(err) {
              if (err) reject(err);
              else resolve(this.lastID);
            }
          );
        });
        console.log('✅ Admin user created: admin@superchargedbygrace.com / admin123');

        // Create sample caregivers
        const caregiverPassword = await bcrypt.hash('demo123', 10);
        
        const caregiver1 = await new Promise((resolve, reject) => {
          db.run(
            'INSERT INTO employees (name, email, password, role) VALUES (?, ?, ?, ?)',
            ['Sarah Johnson', 'sarah@superchargedbygrace.com', caregiverPassword, 'Caregiver'],
            function(err) {
              if (err) reject(err);
              else resolve(this.lastID);
            }
          );
        });

        const caregiver2 = await new Promise((resolve, reject) => {
          db.run(
            'INSERT INTO employees (name, email, password, role) VALUES (?, ?, ?, ?)',
            ['Mike Chen', 'mike@superchargedbygrace.com', caregiverPassword, 'Caregiver'],
            function(err) {
              if (err) reject(err);
              else resolve(this.lastID);
            }
          );
        });
        console.log('✅ Sample caregivers created');

        // Create sample timesheets (WITHOUT client_name)
        const sampleTimesheets = [
          { employeeId: caregiver1, employeeName: 'Sarah Johnson', date: '2024-12-15', hours: 6, status: 'approved' },
          { employeeId: caregiver1, employeeName: 'Sarah Johnson', date: '2024-12-16', hours: 8, status: 'approved' },
          { employeeId: caregiver2, employeeName: 'Mike Chen', date: '2024-12-16', hours: 10, status: 'pending' },
          { employeeId: caregiver2, employeeName: 'Mike Chen', date: '2024-12-17', hours: 12, status: 'pending' }
        ];

        for (const ts of sampleTimesheets) {
          let clientCharge, employeePay;
          
          // Calculate charges
          if (ts.hours <= 8) {
            clientCharge = 140;
            employeePay = 120;
          } else if (ts.hours <= 12) {
            clientCharge = 200;
            employeePay = 150;
          } else {
            clientCharge = 200;
            employeePay = Math.round((ts.hours / 12) * 150);
          }
          
          const profit = clientCharge - employeePay;

          await new Promise((resolve, reject) => {
            db.run(
              `INSERT INTO timesheets (
                employee_id, employee_name, date, hours,
                client_charge, employee_pay, profit, status
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                ts.employeeId,
                ts.employeeName,
                ts.date,
                ts.hours,
                clientCharge,
                employeePay,
                profit,
                ts.status
              ],
              function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
              }
            );
          });
        }
        console.log('✅ Sample timesheets created');

        console.log('🎉 Database initialization complete!');
        console.log('📋 Login credentials:');
        console.log('   Admin: admin@superchargedbygrace.com / admin123');
        console.log('   Employee 1: sarah@superchargedbygrace.com / demo123');
        console.log('   Employee 2: mike@superchargedbygrace.com / demo123');

        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}

// Run initialization
initDatabase()
  .then(() => {
    db.close();
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Database initialization failed:', error);
    db.close();
    process.exit(1);
  });
