const express = require('express');
const router = express.Router();
const { getOrderMilestones, uploadProof, verifyProof, completeMilestone } = require('../controllers/milestoneController');
const { protect, supplierOnly, adminOnly } = require('../middleware/auth');
const { uploadProof: uploadMiddleware } = require('../middleware/upload');

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

// Upload proof file for milestone (SUPPLIER only)
router.post('/:id/upload-proof', protect, supplierOnly, uploadMiddleware, uploadProof);

// Verify proof for milestone (ADMIN only)
router.patch('/:id/verify-proof', protect, adminOnly, verifyProof);

// Complete milestone (ADMIN only - after proof verification)
// Creates RELEASE transaction and unlocks next milestone
router.patch('/:id/complete', protect, adminOnly, completeMilestone);

module.exports = router;
