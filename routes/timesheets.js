const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { auth, requireAdmin } = require('../middleware/auth');
const db = require('../config/database');

// Pricing logic
function calculatePricing(hours) {
  let clientCharge, employeePay;

  if (hours <= 8) {
    clientCharge = 140;
    employeePay = 120;
  } else if (hours <= 12) {
    clientCharge = 200;
    employeePay = 150;
  } else {
    clientCharge = 200 + ((hours - 12) * 15);
    employeePay = 150 + ((hours - 12) * 12);
  }

  return { clientCharge, employeePay };
}

// Get all timesheets
router.get('/', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let query = `
      SELECT 
        t.*,
        e.name as employee_name,
        (t.client_charge - t.employee_pay) as profit
      FROM timesheets t
      JOIN employees e ON t.employee_id = e.id
    `;
    const params = [];

    if (req.user.role !== 'Administrator') {
      query += ' WHERE t.employee_id = ?';
      params.push(req.user.id);
    }

    if (startDate && endDate) {
      query += req.user.role === 'Administrator' ? ' WHERE ' : ' AND ';
      query += 't.date BETWEEN ? AND ?';
      params.push(startDate, endDate);
    }

    query += ' ORDER BY t.date DESC';

    const timesheets = await db.all(query, params);
    
    // Set default entry_type for old records
    timesheets.forEach(ts => {
      if (!ts.entry_type) ts.entry_type = 'hours';
    });
    
    res.json(timesheets);
  } catch (error) {
    console.error('Get timesheets error:', error);
    res.status(500).json({ error: 'Failed to fetch timesheets' });
  }
});

// Get timesheet statistics
router.get('/stats', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let query = `
      SELECT 
        COUNT(*) as total_entries,
        SUM(hours) as total_hours,
        SUM(client_charge) as total_revenue,
        SUM(employee_pay) as total_payroll
      FROM timesheets
    `;
    const params = [];

    if (req.user.role !== 'Administrator') {
      query += ' WHERE employee_id = ?';
      params.push(req.user.id);
    }

    if (startDate && endDate) {
      query += req.user.role === 'Administrator' ? ' WHERE ' : ' AND ';
      query += 'date BETWEEN ? AND ?';
      params.push(startDate, endDate);
    }

    const stats = await db.get(query, params);
    res.json(stats);
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Get summary data (for admin dashboard)
router.get('/summary', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let query = `
      SELECT 
        COUNT(*) as total_entries,
        SUM(hours) as total_hours,
        SUM(client_charge) as total_revenue,
        SUM(employee_pay) as total_payroll,
        SUM(client_charge - employee_pay) as total_profit
      FROM timesheets
    `;
    const params = [];

    if (startDate && endDate) {
      query += ' WHERE date BETWEEN ? AND ?';
      params.push(startDate, endDate);
    }

    const summary = await db.get(query, params);
    res.json(summary);
  } catch (error) {
    console.error('Get summary error:', error);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// Create timesheet
router.post('/', [
  auth,
  body('date').isISO8601().withMessage('Valid date required'),
  body('hours').isFloat({ min: 0.5, max: 24 }).withMessage('Hours must be between 0.5 and 24'),
  body('entry_type').optional().isIn(['hours', 'days']).withMessage('Entry type must be hours or days'),
  body('notes').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { date, hours, entry_type = 'hours', notes } = req.body;

    // Calculate pricing based on hours
    const { clientCharge, employeePay } = calculatePricing(hours);

    const result = await db.run(
      `INSERT INTO timesheets (employee_id, date, hours, entry_type, client_charge, employee_pay, notes, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [req.user.id, date, hours, entry_type, clientCharge, employeePay, notes || null]
    );

    const timesheet = await db.get(
      'SELECT * FROM timesheets WHERE id = ?',
      [result.lastID]
    );

    res.status(201).json(timesheet);
  } catch (error) {
    console.error('Create timesheet error:', error);
    res.status(500).json({ error: 'Failed to create timesheet: ' + error.message });
  }
});

// Update timesheet
router.put('/:id', [
  auth,
  body('date').optional().isISO8601(),
  body('hours').optional().isFloat({ min: 0.5, max: 24 }),
  body('entry_type').optional().isIn(['hours', 'days']),
  body('notes').optional().trim(),
  body('status').optional().isIn(['pending', 'approved', 'paid'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const timesheet = await db.get(
      'SELECT * FROM timesheets WHERE id = ?',
      [req.params.id]
    );

    if (!timesheet) {
      return res.status(404).json({ error: 'Timesheet not found' });
    }

    // Check access
    if (req.user.role !== 'Administrator' && req.user.id !== timesheet.employee_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { date, hours, entry_type, notes, status } = req.body;
    const updates = [];
    const params = [];

    if (date) {
      updates.push('date = ?');
      params.push(date);
    }

    if (hours !== undefined) {
      const { clientCharge, employeePay } = calculatePricing(hours);
      updates.push('hours = ?', 'client_charge = ?', 'employee_pay = ?');
      params.push(hours, clientCharge, employeePay);
    }

    if (entry_type) {
      updates.push('entry_type = ?');
      params.push(entry_type);
    }

    if (notes !== undefined) {
      updates.push('notes = ?');
      params.push(notes || null);
    }

    if (status && req.user.role === 'Administrator') {
      updates.push('status = ?');
      params.push(status);
    }

    if (updates.length === 0) {
      return res.json(timesheet);
    }

    params.push(req.params.id);

    await db.run(
      `UPDATE timesheets SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    const updated = await db.get(
      'SELECT * FROM timesheets WHERE id = ?',
      [req.params.id]
    );

    res.json(updated);
  } catch (error) {
    console.error('Update timesheet error:', error);
    res.status(500).json({ error: 'Failed to update timesheet' });
  }
});

// Delete timesheet
router.delete('/:id', auth, async (req, res) => {
  try {
    const timesheet = await db.get(
      'SELECT * FROM timesheets WHERE id = ?',
      [req.params.id]
    );

    if (!timesheet) {
      return res.status(404).json({ error: 'Timesheet not found' });
    }

    // Check access
    if (req.user.role !== 'Administrator' && req.user.id !== timesheet.employee_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await db.run('DELETE FROM timesheets WHERE id = ?', [req.params.id]);

    res.json({ message: 'Timesheet deleted successfully' });
  } catch (error) {
    console.error('Delete timesheet error:', error);
    res.status(500).json({ error: 'Failed to delete timesheet' });
  }
});

module.exports = router;