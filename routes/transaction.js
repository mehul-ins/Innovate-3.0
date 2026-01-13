const express = require('express');
const router = express.Router();
const { getOrderTransactions } = require('../controllers/transactionController');
const { protect } = require('../middleware/auth');

/**
 * Transaction Routes (Mock Escrow Ledger)
 * 
 * Phase 4 Implementation:
 * - GET /api/transactions/order/:orderId - Get escrow ledger for order
 * 
 * Mock Escrow Ledger Records:
 * 1. LOCK transactions: When order is approved, full amount locked
 * 2. RELEASE transactions: When milestones completed, amounts released
 * 
 * Provides complete audit trail of all fund movements.
 */

// Get escrow ledger for an order
router.get('/order/:orderId', protect, getOrderTransactions);

module.exports = router;
