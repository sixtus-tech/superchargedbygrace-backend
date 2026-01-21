const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const employeeRoutes = require('./routes/employees');
const timesheetRoutes = require('./routes/timesheets');
const invoiceRoutes = require('./routes/invoices');

const app = express();
app.set('trust proxy', 1);

// Multiple CORS origins support
const allowedOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
  : ['http://localhost:3000'];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(helmet());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// ONE-TIME admin creator - REMOVE AFTER USE
app.get('/api/create-admin-once', async (req, res) => {
  const db = require('./config/database');
  const bcrypt = require('bcryptjs');
  
  try {
    // Check if admin exists
    const existing = await db.get('SELECT id FROM employees WHERE email = ?', ['admin@superchargedbygrace.com']);
    
    if (existing && existing.id) {
      return res.json({ success: false, message: 'Admin already exists' });
    }
    
    // Create admin
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await db.run(
      'INSERT INTO employees (name, email, password, role) VALUES (?, ?, ?, ?)',
      ['Admin User', 'admin@superchargedbygrace.com', hashedPassword, 'Administrator']
    );
    
    res.json({ success: true, message: 'Admin created! Email: admin@superchargedbygrace.com, Password: admin123' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ONE-TIME migration - REMOVE AFTER USE
app.get('/api/migrate-entry-type-once', async (req, res) => {
  const db = require('./config/database');
  
  try {
    await db.run('ALTER TABLE timesheets ADD COLUMN entry_type TEXT DEFAULT "hours"');
    res.json({ success: true, message: 'entry_type column added successfully!' });
  } catch (error) {
    if (error.message.includes('duplicate column')) {
      res.json({ success: true, message: 'Column already exists' });
    } else {
      res.status(500).json({ success: false, error: error.message });
    }
  }
});

// ONE-TIME fix employee_name column
app.get('/api/fix-employee-name-column', async (req, res) => {
  const db = require('./config/database');
  
  try {
    // Check if column exists
    const tableInfo = await db.all('PRAGMA table_info(timesheets)');
    const hasEmployeeName = tableInfo.some(col => col.name === 'employee_name');
    
    if (!hasEmployeeName) {
      return res.json({ success: true, message: 'Column does not exist - no fix needed' });
    }
    
    // SQLite doesn't support DROP COLUMN easily, so we need to recreate the table
    await db.run('BEGIN TRANSACTION');
    
    // Create new table without employee_name
    await db.run(`
      CREATE TABLE timesheets_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER NOT NULL,
        date DATE NOT NULL,
        hours REAL NOT NULL,
        entry_type TEXT DEFAULT 'hours',
        client_charge REAL NOT NULL,
        employee_pay REAL NOT NULL,
        notes TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_id) REFERENCES employees(id)
      )
    `);
    
    // Copy data (excluding employee_name)
    await db.run(`
      INSERT INTO timesheets_new 
      SELECT id, employee_id, date, hours, entry_type, client_charge, employee_pay, notes, status, created_at, updated_at
      FROM timesheets
    `);
    
    // Drop old table and rename new one
    await db.run('DROP TABLE timesheets');
    await db.run('ALTER TABLE timesheets_new RENAME TO timesheets');
    
    await db.run('COMMIT');
    
    res.json({ success: true, message: 'Fixed employee_name column issue!' });
  } catch (error) {
    try {
      await db.run('ROLLBACK');
    } catch (e) {
      // Ignore rollback errors
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// ONE-TIME bulk employee import
app.get('/api/bulk-import-employees', async (req, res) => {
  const db = require('./config/database');
  const bcrypt = require('bcryptjs');
  
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
  
  try {
    const results = [];
    
    for (const emp of employees) {
      try {
        const existing = await db.get('SELECT id FROM employees WHERE LOWER(email) = LOWER(?)', [emp.email]);
        
        if (existing && existing.id) {
          results.push({ name: emp.name, email: emp.email, status: 'already exists' });
          continue;
        }
        
        const hashedPassword = await bcrypt.hash(emp.password, 10);
        await db.run(
          'INSERT INTO employees (name, email, password, role) VALUES (?, ?, ?, ?)',
          [emp.name, emp.email, hashedPassword, 'Employee']
        );
        
        results.push({ name: emp.name, email: emp.email, status: 'created ✅' });
      } catch (error) {
        results.push({ name: emp.name, email: emp.email, status: 'error', error: error.message });
      }
    }
    
    res.json({ success: true, message: `Bulk import complete! Created ${results.filter(r => r.status.includes('created')).length} employees.`, results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ONE-TIME database backup
app.get('/api/backup-database', async (req, res) => {
  const db = require('./config/database');
  
  try {
    const [employees, timesheets] = await Promise.all([
      db.all('SELECT id, name, email, role, created_at FROM employees'),
      db.all('SELECT * FROM timesheets')
    ]);
    
    const backup = {
      timestamp: new Date().toISOString(),
      employees: employees,
      timesheets: timesheets,
      counts: {
        employees: employees.length,
        timesheets: timesheets.length
      }
    };
    
    res.json(backup);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/timesheets', timesheetRoutes);
app.use('/api/invoices', invoiceRoutes);

// Root endpoint for Railway health checks
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Caregiving API is running' });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message 
  });
});

const PORT = process.env.PORT || 5001;

// Start server - bind to 0.0.0.0 for Railway
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🔗 Server running on port ${PORT}`);
  console.log(`✅ API available at http://0.0.0.0:${PORT}/api`);
  
  // Test database connection after server starts
  const db = require('./config/database');
  db.get('SELECT 1', (err) => {
    if (err) {
      console.error('❌ Database connection failed:', err);
    } else {
      console.log('✅ Connected to SQLite database');
    }
  });
});