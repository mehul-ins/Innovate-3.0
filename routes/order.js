const express = require('express');
const router = express.Router();
const { createOrder, getAllOrders, approveOrder, repayOrder } = require('../controllers/orderController');
const { protect, supplierOnly, adminOnly } = require('../middleware/auth');

/**
 * Order Routes
 * 
 * Phase 1 Implementation:
 * - POST /api/orders - Create order (SUPPLIER only)
 * - GET /api/orders - List all orders (ADMIN only)
 * 
 * Phase 2 Implementation:
 * - PATCH /api/orders/:id/approve - Approve order (ADMIN only)
 * 
 * Note: Order completion is NOT implemented until Phase 3
 */

// Create new order - SUPPLIER only
// When a supplier creates an order, it starts with PENDING_VERIFICATION status
router.post('/', protect, supplierOnly, createOrder);

// Get all orders - ADMIN only
// Admin can view all orders to prepare for approval
router.get('/', protect, adminOnly, getAllOrders);

// Approve order - ADMIN only
// Changes status from PENDING_VERIFICATION to APPROVED
// Locks funds to prevent cancellation and enable lender financing
router.patch('/:id/approve', protect, adminOnly, approveOrder);

// Repay order and close - ADMIN only (Phase 7)
// Changes status from COMPLETED to CLOSED
// Marks loan as repaid and prevents further actions
router.patch('/:id/repay', protect, adminOnly, repayOrder);

module.exports = router;
