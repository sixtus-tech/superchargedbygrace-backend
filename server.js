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

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/timesheets', timesheetRoutes);
app.use('/api/invoices', invoiceRoutes);

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
app.listen(PORT, () => {
  console.log(`🔗 API available at http://localhost:${PORT}/api`);
});

// Database connection test
const db = require('./config/database');
db.get('SELECT 1', (err) => {
  if (err) {
    console.error('❌ Database connection failed:', err);
  } else {
    console.log('✅ Connected to SQLite database');
  }
});