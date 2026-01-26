const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const db = require('../config/database');
const { auth, requireAdmin } = require('../middleware/auth');

// Get all timesheets (filtered by employee if not admin)
router.get('/', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let query = `
      SELECT 
        t.*,
        e.name as employee_name,
        h.name as house_name,
        (t.client_charge - t.employee_pay) as profit
      FROM timesheets t
      LEFT JOIN employees e ON t.employee_id = e.id
      LEFT JOIN houses h ON t.house_id = h.id
      WHERE 1=1
    `;
    
    const params = [];
    
    // Non-admin users only see their own timesheets
    if (req.user.role !== 'Administrator') {
      query += ' AND t.employee_id = ?';
      params.push(req.user.id);
    }
    
    if (startDate) {
      query += ' AND t.date >= ?';
      params.push(startDate);
    }
    
    if (endDate) {
      query += ' AND t.date <= ?';
      params.push(endDate);
    }
    
    query += ' ORDER BY t.date DESC, t.created_at DESC';
    
    const timesheets = await db.all(query, params);
    res.json(timesheets);
  } catch (error) {
    console.error('Get timesheets error:', error);
    res.status(500).json({ error: 'Failed to fetch timesheets' });
  }
});

// Get single timesheet
router.get('/:id', auth, async (req, res) => {
  try {
    const timesheet = await db.get(
      `SELECT 
        t.*,
        e.name as employee_name,
        h.name as house_name,
        (t.client_charge - t.employee_pay) as profit
      FROM timesheets t
      LEFT JOIN employees e ON t.employee_id = e.id
      LEFT JOIN houses h ON t.house_id = h.id
      WHERE t.id = ?`,
      [req.params.id]
    );
    
    if (!timesheet) {
      return res.status(404).json({ error: 'Timesheet not found' });
    }
    
    // Non-admin users can only see their own timesheets
    if (req.user.role !== 'Administrator' && timesheet.employee_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json(timesheet);
  } catch (error) {
    console.error('Get timesheet error:', error);
    res.status(500).json({ error: 'Failed to fetch timesheet' });
  }
});

// Create timesheet
router.post('/',
  auth,
  [
    body('date').isDate().withMessage('Valid date required'),
    body('hours').isFloat({ min: 0 }).withMessage('Hours must be positive'),
    body('entry_type').isIn(['hours', 'days']).withMessage('Entry type must be hours or days'),
    body('client_charge').isFloat({ min: 0 }).withMessage('Client charge must be positive'),
    body('employee_pay').isFloat({ min: 0 }).withMessage('Employee pay must be positive'),
    body('house_id').optional().isInt().withMessage('House ID must be an integer')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { date, hours, entry_type, client_charge, employee_pay, notes, house_id } = req.body;
      
      // Use the authenticated user's ID
      const employee_id = req.user.id;

      const result = await db.run(
        'INSERT INTO timesheets (employee_id, date, hours, entry_type, client_charge, employee_pay, notes, house_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [employee_id, date, hours, entry_type, client_charge, employee_pay, notes || null, house_id || null]
      );

      const newTimesheet = await db.get(
        `SELECT 
          t.*,
          e.name as employee_name,
          h.name as house_name,
          (t.client_charge - t.employee_pay) as profit
        FROM timesheets t
        LEFT JOIN employees e ON t.employee_id = e.id
        LEFT JOIN houses h ON t.house_id = h.id
        WHERE t.id = ?`,
        [result.lastID]
      );

      res.status(201).json(newTimesheet);
    } catch (error) {
      console.error('Create timesheet error:', error);
      res.status(500).json({ error: 'Failed to create timesheet' });
    }
  }
);

// Update timesheet
router.put('/:id',
  auth,
  [
    body('date').optional().isDate().withMessage('Valid date required'),
    body('hours').optional().isFloat({ min: 0 }).withMessage('Hours must be positive'),
    body('entry_type').optional().isIn(['hours', 'days']).withMessage('Entry type must be hours or days'),
    body('client_charge').optional().isFloat({ min: 0 }).withMessage('Client charge must be positive'),
    body('employee_pay').optional().isFloat({ min: 0 }).withMessage('Employee pay must be positive'),
    body('house_id').optional().isInt().withMessage('House ID must be an integer')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      // Check if timesheet exists and user has permission
      const existing = await db.get('SELECT * FROM timesheets WHERE id = ?', [req.params.id]);
      
      if (!existing) {
        return res.status(404).json({ error: 'Timesheet not found' });
      }
      
      if (req.user.role !== 'Administrator' && existing.employee_id !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const { date, hours, entry_type, client_charge, employee_pay, notes, status, house_id } = req.body;
      
      await db.run(
        `UPDATE timesheets 
         SET date = COALESCE(?, date),
             hours = COALESCE(?, hours),
             entry_type = COALESCE(?, entry_type),
             client_charge = COALESCE(?, client_charge),
             employee_pay = COALESCE(?, employee_pay),
             notes = ?,
             status = COALESCE(?, status),
             house_id = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [date, hours, entry_type, client_charge, employee_pay, notes, status, house_id, req.params.id]
      );

      const updated = await db.get(
        `SELECT 
          t.*,
          e.name as employee_name,
          h.name as house_name,
          (t.client_charge - t.employee_pay) as profit
        FROM timesheets t
        LEFT JOIN employees e ON t.employee_id = e.id
        LEFT JOIN houses h ON t.house_id = h.id
        WHERE t.id = ?`,
        [req.params.id]
      );

      res.json(updated);
    } catch (error) {
      console.error('Update timesheet error:', error);
      res.status(500).json({ error: 'Failed to update timesheet' });
    }
  }
);

// Delete timesheet
router.delete('/:id', auth, async (req, res) => {
  try {
    const timesheet = await db.get('SELECT * FROM timesheets WHERE id = ?', [req.params.id]);
    
    if (!timesheet) {
      return res.status(404).json({ error: 'Timesheet not found' });
    }
    
    // Non-admin users can only delete their own timesheets
    if (req.user.role !== 'Administrator' && timesheet.employee_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await db.run('DELETE FROM timesheets WHERE id = ?', [req.params.id]);
    res.json({ message: 'Timesheet deleted successfully' });
  } catch (error) {
    console.error('Delete timesheet error:', error);
    res.status(500).json({ error: 'Failed to delete timesheet' });
  }
});

// Get timesheet summary/stats
router.get('/summary', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let query = `
      SELECT 
        COUNT(*) as total_entries,
        SUM(hours) as total_hours,
        SUM(client_charge) as total_revenue,
        SUM(employee_pay) as total_payroll
      FROM timesheets
      WHERE 1=1
    `;
    
    const params = [];
    
    // Non-admin users only see their own stats
    if (req.user.role !== 'Administrator') {
      query += ' AND employee_id = ?';
      params.push(req.user.id);
    }
    
    if (startDate) {
      query += ' AND date >= ?';
      params.push(startDate);
    }
    
    if (endDate) {
      query += ' AND date <= ?';
      params.push(endDate);
    }
    
    const stats = await db.get(query, params);
    
    res.json({
      total_entries: stats.total_entries || 0,
      total_hours: stats.total_hours || 0,
      total_revenue: stats.total_revenue || 0,
      total_payroll: stats.total_payroll || 0
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

module.exports = router;