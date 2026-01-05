require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const employeeRoutes = require('./routes/employees');
const timesheetRoutes = require('./routes/timesheets');
const invoiceRoutes = require('./routes/invoices');

const app = express();
app.set('trust proxy', true);
const PORT = process.env.PORT || 5001;

// Security middleware
app.use(helmet());
// Handle multiple CORS origins
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

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100
});
app.use('/api', limiter);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/init-db-temp', (req, res) => {
  const { exec } = require('child_process');
  exec('node scripts/initDatabase.js', (error, stdout, stderr) => {
    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
    res.json({ success: true, message: 'Database initialized!', output: stdout });
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/timesheets', timesheetRoutes);
app.use('/api/invoices', invoiceRoutes);

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

app.listen(PORT, () => {
  console.log(`⚡ SuperchargedByGrace Backend running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 API available at http://localhost:${PORT}/api`);
});
