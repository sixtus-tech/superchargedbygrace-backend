const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { auth, requireAdmin } = require('../middleware/auth');
const db = require('../config/database');

// Get all employees (admin only)
router.get('/', [auth, requireAdmin], async (req, res) => {
  try {
    const employees = await db.all(
      'SELECT id, name, email, role, created_at FROM employees ORDER BY created_at DESC'
    );
    res.json(employees);
  } catch (error) {
    console.error('Get employees error:', error);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

// Get single employee
router.get('/:id', auth, async (req, res) => {
  try {
    const employee = await db.get(
      'SELECT id, name, email, role, created_at FROM employees WHERE id = ?',
      [req.params.id]
    );

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Check access - users can view their own profile, admins can view all
    if (req.user.role !== 'Administrator' && req.user.id !== employee.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(employee);
  } catch (error) {
    console.error('Get employee error:', error);
    res.status(500).json({ error: 'Failed to fetch employee' });
  }
});

// Create employee (admin only)
router.post('/', [
  auth,
  requireAdmin,
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').optional().isIn(['Caregiver', 'Administrator']).withMessage('Invalid role')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password, role = 'Caregiver' } = req.body;

    console.log('🔍 Attempting to create employee with email:', email.toLowerCase());

    // Check if email already exists
    const existing = await db.get(
      'SELECT id FROM employees WHERE LOWER(email) = LOWER(?)',
      [email]
    );

    console.log('🔍 Database check result:', existing);
    console.log('🔍 Existing is truthy?', !!existing);
    console.log('🔍 Existing value:', JSON.stringify(existing));

    if (existing) {
      console.log('❌ Email already exists! Existing employee ID:', existing.id);
      return res.status(400).json({ error: 'Email already exists' });
    }

    console.log('✅ Email is available, proceeding to create employee...');

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create employee
    const result = await db.run(
      'INSERT INTO employees (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email.toLowerCase(), hashedPassword, role]
    );

    console.log('✅ Employee created with ID:', result.lastID);

    const employee = await db.get(
      'SELECT id, name, email, role, created_at FROM employees WHERE id = ?',
      [result.lastID]
    );

    res.status(201).json(employee);
  } catch (error) {
    console.error('Create employee error:', error);
    res.status(500).json({ error: 'Failed to create employee' });
  }
});

// Update employee
router.put('/:id', [
  auth,
  body('name').optional().trim().notEmpty(),
  body('email').optional().isEmail(),
  body('password').optional().isLength({ min: 6 }),
  body('role').optional().isIn(['Caregiver', 'Administrator'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const employee = await db.get(
      'SELECT * FROM employees WHERE id = ?',
      [req.params.id]
    );

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Check access
    if (req.user.role !== 'Administrator' && req.user.id !== employee.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { name, email, password, role } = req.body;
    const updates = [];
    const params = [];

    if (name) {
      updates.push('name = ?');
      params.push(name);
    }

    if (email) {
      // Check if new email is already taken
      const existing = await db.get(
        'SELECT id FROM employees WHERE LOWER(email) = LOWER(?) AND id != ?',
        [email, req.params.id]
      );

      if (existing) {
        return res.status(400).json({ error: 'Email already exists' });
      }

      updates.push('email = ?');
      params.push(email.toLowerCase());
    }

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updates.push('password = ?');
      params.push(hashedPassword);
    }

    if (role && req.user.role === 'Administrator') {
      updates.push('role = ?');
      params.push(role);
    }

    if (updates.length === 0) {
      return res.json(employee);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(req.params.id);

    await db.run(
      `UPDATE employees SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    const updated = await db.get(
      'SELECT id, name, email, role, created_at FROM employees WHERE id = ?',
      [req.params.id]
    );

    res.json(updated);
  } catch (error) {
    console.error('Update employee error:', error);
    res.status(500).json({ error: 'Failed to update employee' });
  }
});

// Delete employee (admin only)
router.delete('/:id', [auth, requireAdmin], async (req, res) => {
  try {
    const employee = await db.get(
      'SELECT * FROM employees WHERE id = ?',
      [req.params.id]
    );

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Prevent deleting yourself
    if (req.user.id === employee.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    await db.run('DELETE FROM employees WHERE id = ?', [req.params.id]);

    res.json({ message: 'Employee deleted successfully' });
  } catch (error) {
    console.error('Delete employee error:', error);
    res.status(500).json({ error: 'Failed to delete employee' });
  }
});

// Get employee statistics
router.get('/:id/stats', auth, async (req, res) => {
  try {
    const employee = await db.get(
      'SELECT id FROM employees WHERE id = ?',
      [req.params.id]
    );

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Check access
    if (req.user.role !== 'Administrator' && req.user.id !== employee.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const stats = await db.get(
      `SELECT 
        COUNT(*) as total_entries,
        SUM(hours) as total_hours,
        SUM(employee_pay) as total_pay
      FROM timesheets
      WHERE employee_id = ?`,
      [req.params.id]
    );

    res.json({
      total_entries: stats.total_entries || 0,
      total_hours: stats.total_hours || 0,
      total_pay: stats.total_pay || 0
    });
  } catch (error) {
    console.error('Get employee stats error:', error);
    res.status(500).json({ error: 'Failed to fetch employee statistics' });
  }
});

module.exports = router;