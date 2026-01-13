const express = require('express');
const router = express.Router();
const { createOrder, getAllOrders, approveOrder, repayOrder } = require('../controllers/orderController');
const { getOrderMilestones } = require('../controllers/milestoneController');
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

// Get all orders - All authenticated users can view
// Phase 8: Frontend dashboard allows all roles to view orders
router.get('/', protect, getAllOrders);

// Approve order - ADMIN only
// Changes status from PENDING_VERIFICATION to APPROVED
// Locks funds to prevent cancellation and enable lender financing
router.patch('/:id/approve', protect, adminOnly, approveOrder);

// Repay order and close - ADMIN only (Phase 7)
// Changes status from COMPLETED to CLOSED
// Marks loan as repaid and prevents further actions
router.patch('/:id/repay', protect, adminOnly, repayOrder);

// Get milestones for order - nested route (Phase 8 - Frontend support)
// GET /api/orders/:id/milestones
router.get('/:orderId/milestones', protect, getOrderMilestones);

module.exports = router;
