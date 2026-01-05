const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../database/caretime.db');
const dbDir = path.dirname(dbPath);

// Create database directory if it doesn't exist
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('✅ Connected to SQLite database');
  }
});

// Promisify database operations
const promisify = (fn) => {
  return function (...args) {
    return new Promise((resolve, reject) => {
      fn.call(this, ...args, function (err, result) {
        if (err) reject(err);
        else resolve(result || this);
      });
    });
  };
};

module.exports = {
  get: promisify(db.get.bind(db)),
  all: promisify(db.all.bind(db)),
  run: promisify(db.run.bind(db)),
  close: () => db.close()
};
