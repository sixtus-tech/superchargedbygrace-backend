const express = require('express');
const router = express.Router();
const { auth, requireAdmin } = require('../middleware/auth');
const db = require('../config/database');

// Get client invoice
router.get('/client', [auth, requireAdmin], async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let query = `
      SELECT 
        t.*,
        e.name as caregiver
      FROM timesheets t
      JOIN employees e ON t.employee_id = e.id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (startDate) {
      query += ' AND t.date >= ?';
      params.push(startDate);
    }
    
    if (endDate) {
      query += ' AND t.date <= ?';
      params.push(endDate);
    }
    
    query += ' ORDER BY t.date ASC';
    
    const entries = await db.all(query, params);
    
    // Calculate summary
    let fullDays = 0;
    let halfDays = 0;
    
    entries.forEach(entry => {
      if (entry.hours > 8) {
        fullDays++;
      } else {
        halfDays++;
      }
    });
    
    const fullDaysTotal = fullDays * 200;
    const halfDaysTotal = halfDays * 140;
    const totalAmount = fullDaysTotal + halfDaysTotal;
    
    // Format entries for invoice
    const formattedEntries = entries.map(entry => ({
      date: entry.date,
      caregiver: entry.caregiver,
      hours: entry.hours,
      service_type: entry.hours > 8 ? 'Full Day' : 'Half Day',
      charge: entry.client_charge,
      notes: entry.notes
    }));
    
    const invoice = {
      period: {
        start: startDate || 'All time',
        end: endDate || 'Present'
      },
      summary: {
        full_days: fullDays,
        half_days: halfDays,
        full_days_total: fullDaysTotal,
        half_days_total: halfDaysTotal,
        total_amount: totalAmount
      },
      entries: formattedEntries
    };
    
    res.json(invoice);
  } catch (error) {
    console.error('Client invoice error:', error);
    res.status(500).json({ error: 'Failed to generate client invoice' });
  }
});

// Get payroll report
router.get('/payroll', [auth, requireAdmin], async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let query = `
      SELECT 
        t.*,
        e.name as employee
      FROM timesheets t
      JOIN employees e ON t.employee_id = e.id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (startDate) {
      query += ' AND t.date >= ?';
      params.push(startDate);
    }
    
    if (endDate) {
      query += ' AND t.date <= ?';
      params.push(endDate);
    }
    
    query += ' ORDER BY t.date ASC';
    
    const entries = await db.all(query, params);
    
    // Calculate summary
    const totalEntries = entries.length;
    const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
    const totalPayroll = entries.reduce((sum, e) => sum + e.employee_pay, 0);
    
    // Employee breakdown
    const employeeMap = {};
    entries.forEach(entry => {
      if (!employeeMap[entry.employee]) {
        employeeMap[entry.employee] = {
          employee_name: entry.employee,
          total_hours: 0,
          total_pay: 0,
          entries: 0
        };
      }
      employeeMap[entry.employee].total_hours += entry.hours;
      employeeMap[entry.employee].total_pay += entry.employee_pay;
      employeeMap[entry.employee].entries += 1;
    });
    
    const employeeBreakdown = Object.values(employeeMap);
    
    // Format entries
    const formattedEntries = entries.map(entry => {
      let rateType;
      if (entry.hours <= 8) {
        rateType = '8-hour rate ($120)';
      } else if (entry.hours <= 12) {
        rateType = '12-hour rate ($150)';
      } else {
        rateType = 'Extended hours (proportional)';
      }
      
      return {
        date: entry.date,
        employee: entry.employee,
        hours: entry.hours,
        pay: entry.employee_pay,
        rate_type: rateType,
        notes: entry.notes
      };
    });
    
    const report = {
      period: {
        start: startDate || 'All time',
        end: endDate || 'Present'
      },
      summary: {
        total_entries: totalEntries,
        total_hours: totalHours,
        total_payroll: totalPayroll
      },
      employee_breakdown: employeeBreakdown,
      entries: formattedEntries
    };
    
    res.json(report);
  } catch (error) {
    console.error('Payroll report error:', error);
    res.status(500).json({ error: 'Failed to generate payroll report' });
  }
});

// Get comprehensive report
router.get('/comprehensive', [auth, requireAdmin], async (req, res) => {
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
    
    if (startDate) {
      query += ' AND t.date >= ?';
      params.push(startDate);
    }
    
    if (endDate) {
      query += ' AND t.date <= ?';
      params.push(endDate);
    }
    
    query += ' ORDER BY t.date ASC';
    
    const entries = await db.all(query, params);
    
    // Calculate all metrics
    const totalEntries = entries.length;
    const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
    const totalRevenue = entries.reduce((sum, e) => sum + e.client_charge, 0);
    const totalPayroll = entries.reduce((sum, e) => sum + e.employee_pay, 0);
    const totalProfit = entries.reduce((sum, e) => sum + e.profit, 0);
    const profitMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(2) : 0;
    
    // Count service types
    let fullDays = 0;
    let halfDays = 0;
    entries.forEach(entry => {
      if (entry.hours > 8) fullDays++;
      else halfDays++;
    });
    
    const report = {
      period: {
        start: startDate || 'All time',
        end: endDate || 'Present'
      },
      summary: {
        total_entries: totalEntries,
        total_hours: totalHours,
        total_revenue: totalRevenue,
        total_payroll: totalPayroll,
        total_profit: totalProfit,
        profit_margin: profitMargin,
        full_days: fullDays,
        half_days: halfDays
      },
      entries: entries
    };
    
    res.json(report);
  } catch (error) {
    console.error('Comprehensive report error:', error);
    res.status(500).json({ error: 'Failed to generate comprehensive report' });
  }
});

module.exports = router;
