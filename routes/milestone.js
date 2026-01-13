const express = require('express');
const router = express.Router();
const { getOrderMilestones, completeMilestone } = require('../controllers/milestoneController');
const { protect } = require('../middleware/auth');

/**
 * Milestone Routes
 * 
 * Phase 3 Implementation:
 * - GET /api/orders/:id/milestones - Get milestones for an order
 * 
 * Phase 5 Implementation:
 * - PATCH /api/milestones/:id/complete - Complete milestone with proof
 * 
 * Milestone Lifecycle:
 * 1. First milestone: PENDING (payment can start)
 * 2. Others: LOCKED (waiting for previous to complete)
 * 3. Upon completion: Status changes to COMPLETED, next becomes PENDING
 */

// Get all milestones for an order
router.get('/:orderId', protect, getOrderMilestones);

// Complete milestone (submit proof and approve)
// Creates RELEASE transaction and unlocks next milestone
router.patch('/:id/complete', protect, completeMilestone);

module.exports = router;
