const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const db = require('../config/database');
const { auth, requireAdmin } = require('../middleware/auth');

// Get all houses
router.get('/', auth, async (req, res) => {
  try {
    const houses = await db.all('SELECT * FROM houses ORDER BY name');
    res.json(houses);
  } catch (error) {
    console.error('Get houses error:', error);
    res.status(500).json({ error: 'Failed to fetch houses' });
  }
});

// Get single house
router.get('/:id', auth, async (req, res) => {
  try {
    const house = await db.get('SELECT * FROM houses WHERE id = ?', [req.params.id]);
    if (!house) {
      return res.status(404).json({ error: 'House not found' });
    }
    res.json(house);
  } catch (error) {
    console.error('Get house error:', error);
    res.status(500).json({ error: 'Failed to fetch house' });
  }
});

// Create house (admin only)
router.post('/', 
  auth, 
  requireAdmin,
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('employee_pay_per_day').isFloat({ min: 0 }).withMessage('Employee pay must be a positive number'),
    body('client_charge_per_day').isFloat({ min: 0 }).withMessage('Client charge must be a positive number'),
    body('payment_frequency').isIn(['weekly', 'bi-weekly', 'monthly']).withMessage('Invalid payment frequency'),
    body('invoice_style').isIn(['grouped', 'daily']).withMessage('Invalid invoice style')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { name, employee_pay_per_day, client_charge_per_day, payment_frequency, invoice_style, notes } = req.body;
      
      const result = await db.run(
        'INSERT INTO houses (name, employee_pay_per_day, client_charge_per_day, payment_frequency, invoice_style, notes) VALUES (?, ?, ?, ?, ?, ?)',
        [name, employee_pay_per_day, client_charge_per_day, payment_frequency, invoice_style, notes || null]
      );

      const house = await db.get('SELECT * FROM houses WHERE id = ?', [result.lastID]);
      res.status(201).json(house);
    } catch (error) {
      console.error('Create house error:', error);
      if (error.message.includes('UNIQUE constraint')) {
        return res.status(400).json({ error: 'House with this name already exists' });
      }
      res.status(500).json({ error: 'Failed to create house' });
    }
  }
);

// Update house (admin only)
router.put('/:id',
  auth,
  requireAdmin,
  [
    body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
    body('employee_pay_per_day').optional().isFloat({ min: 0 }).withMessage('Employee pay must be a positive number'),
    body('client_charge_per_day').optional().isFloat({ min: 0 }).withMessage('Client charge must be a positive number'),
    body('payment_frequency').optional().isIn(['weekly', 'bi-weekly', 'monthly']).withMessage('Invalid payment frequency'),
    body('invoice_style').optional().isIn(['grouped', 'daily']).withMessage('Invalid invoice style')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { name, employee_pay_per_day, client_charge_per_day, payment_frequency, invoice_style, notes } = req.body;
      
      await db.run(
        'UPDATE houses SET name = COALESCE(?, name), employee_pay_per_day = COALESCE(?, employee_pay_per_day), client_charge_per_day = COALESCE(?, client_charge_per_day), payment_frequency = COALESCE(?, payment_frequency), invoice_style = COALESCE(?, invoice_style), notes = ? WHERE id = ?',
        [name, employee_pay_per_day, client_charge_per_day, payment_frequency, invoice_style, notes, req.params.id]
      );

      const house = await db.get('SELECT * FROM houses WHERE id = ?', [req.params.id]);
      if (!house) {
        return res.status(404).json({ error: 'House not found' });
      }
      
      res.json(house);
    } catch (error) {
      console.error('Update house error:', error);
      if (error.message.includes('UNIQUE constraint')) {
        return res.status(400).json({ error: 'House with this name already exists' });
      }
      res.status(500).json({ error: 'Failed to update house' });
    }
  }
);

// Delete house (admin only)
router.delete('/:id', auth, requireAdmin, async (req, res) => {
  try {
    // Check if house has associated timesheets
    const timesheets = await db.get('SELECT COUNT(*) as count FROM timesheets WHERE house_id = ?', [req.params.id]);
    if (timesheets.count > 0) {
      return res.status(400).json({ error: 'Cannot delete house with existing timesheets' });
    }

    const result = await db.run('DELETE FROM houses WHERE id = ?', [req.params.id]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'House not found' });
    }

    res.json({ message: 'House deleted successfully' });
  } catch (error) {
    console.error('Delete house error:', error);
    res.status(500).json({ error: 'Failed to delete house' });
  }
});

module.exports = router;