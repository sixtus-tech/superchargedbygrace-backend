const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const db = require('../config/database');

// Calculate charges based on hours
function calculateCharges(hours) {
  let clientCharge, employeePay;
  
  // Client charges
  if (hours <= 8) {
    clientCharge = 140; // Half day
  } else {
    clientCharge = 200; // Full day
  }
  
  // Employee pay
  if (hours <= 8) {
    employeePay = 120; // 8-hour rate
  } else if (hours <= 12) {
    employeePay = 150; // 12-hour rate
  } else {
    // Extended hours - proportional calculation
    employeePay = Math.round((hours / 12) * 150);
  }
  
  const profit = clientCharge - employeePay;
  
  return { clientCharge, employeePay, profit };
}

// Get all timesheets (filtered by employee for non-admins)
router.get('/', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let query = `
      SELECT 
        t.*,
        e.name as employee_name,
        e.role as employee_role
      FROM timesheets t
      JOIN employees e ON t.employee_id = e.id
      WHERE 1=1
    `;
    
    const params = [];
    
    // Filter by employee if not admin
    if (req.user.role !== 'Administrator') {
      query += ' AND t.employee_id = ?';
      params.push(req.user.id);
    }
    
    // Filter by date range if provided
    if (startDate) {
      query += ' AND t.date >= ?';
      params.push(startDate);
    }
    
    if (endDate) {
      query += ' AND t.date <= ?';
      params.push(endDate);
    }
    
    query += ' ORDER BY t.date DESC';
    
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
      'SELECT * FROM timesheets WHERE id = ?',
      [req.params.id]
    );
    
    if (!timesheet) {
      return res.status(404).json({ error: 'Timesheet not found' });
    }
    
    // Check access
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
router.post('/', [
  auth,
  body('date').isISO8601().withMessage('Valid date is required'),
  body('hours').isFloat({ min: 0.5, max: 24 }).withMessage('Hours must be between 0.5 and 24'),
  body('notes').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { date, hours, notes } = req.body;
    const employeeId = req.user.id;
    const employeeName = req.user.name;
    
    // Calculate charges
    const { clientCharge, employeePay, profit } = calculateCharges(parseFloat(hours));
    
    const result = await db.run(
      `INSERT INTO timesheets (
        employee_id, employee_name, date, hours,
        client_charge, employee_pay, profit, notes, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        employeeId,
        employeeName,
        date,
        hours,
        clientCharge,
        employeePay,
        profit,
        notes || null,
        'pending'
      ]
    );
    
    const newTimesheet = await db.get(
      'SELECT * FROM timesheets WHERE id = ?',
      [result.lastID]
    );
    
    res.status(201).json(newTimesheet);
  } catch (error) {
    console.error('Create timesheet error:', error);
    res.status(500).json({ error: 'Failed to create timesheet' });
  }
});

// Update timesheet
router.put('/:id', [
  auth,
  body('date').optional().isISO8601(),
  body('hours').optional().isFloat({ min: 0.5, max: 24 }),
  body('notes').optional().isString(),
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
    if (req.user.role !== 'Administrator' && timesheet.employee_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const { date, hours, notes, status } = req.body;
    
    // Build update query dynamically
    const updates = [];
    const params = [];
    
    if (date !== undefined) {
      updates.push('date = ?');
      params.push(date);
    }
    
    if (hours !== undefined) {
      const { clientCharge, employeePay, profit } = calculateCharges(parseFloat(hours));
      updates.push('hours = ?', 'client_charge = ?', 'employee_pay = ?', 'profit = ?');
      params.push(hours, clientCharge, employeePay, profit);
    }
    
    if (notes !== undefined) {
      updates.push('notes = ?');
      params.push(notes || null);
    }
    
    if (status !== undefined && req.user.role === 'Administrator') {
      updates.push('status = ?');
      params.push(status);
    }
    
    if (updates.length === 0) {
      return res.json(timesheet);
    }
    
    updates.push('updated_at = CURRENT_TIMESTAMP');
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

// Get statistics
router.get('/stats/summary', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let query = `
      SELECT 
        COUNT(*) as total_entries,
        SUM(hours) as total_hours,
        SUM(client_charge) as total_revenue,
        SUM(employee_pay) as total_payroll,
        SUM(profit) as total_profit
      FROM timesheets
      WHERE 1=1
    `;
    
    const params = [];
    
    // Filter by employee if not admin
    if (req.user.role !== 'Administrator') {
      query += ' AND employee_id = ?';
      params.push(req.user.id);
    }
    
    // Filter by date range
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
      total_payroll: stats.total_payroll || 0,
      total_profit: stats.total_profit || 0
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

module.exports = router;
