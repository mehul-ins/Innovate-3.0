const express = require('express');
const router = express.Router();
const { getOrderMilestones } = require('../controllers/milestoneController');
const { protect } = require('../middleware/auth');

/**
 * Milestone Routes
 * 
 * Phase 3 Implementation:
 * - GET /api/orders/:id/milestones - Get milestones for an order
 * 
 * Milestone Lifecycle:
 * 1. First milestone: PENDING (payment can start)
 * 2. Others: LOCKED (waiting for previous to complete)
 * 3. Upon completion: Status changes to COMPLETED, next becomes PENDING
 */

// Get all milestones for an order
router.get('/:orderId', protect, getOrderMilestones);

module.exports = router;
