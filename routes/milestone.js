const express = require('express');
const router = express.Router();
const { getOrderMilestones, uploadProof, verifyProof, completeMilestone, approveMilestone } = require('../controllers/milestoneController');
const { protect, supplierOnly, adminOnly, lenderOnly } = require('../middleware/auth');
const { uploadProof: uploadMiddleware } = require('../middleware/upload');

/**
 * Milestone Routes
 * 
 * Phase 3 Implementation:
 * - GET /api/orders/:id/milestones - Get milestones for an order
 * 
 * Phase 5 Implementation:
 * - PATCH /api/milestones/:id/complete - Complete milestone with proof
 * - POST /api/milestones/:id/approve - Approve milestone (LENDER only, for 2nd+ milestones)
 * 
 * Milestone Lifecycle:
 * 1. First milestone: PENDING (payment can start)
 * 2. Others: LOCKED (waiting for previous to complete)
 * 3. Lender approves (2nd+ milestones): Status changes to PENDING
 * 4. Upon completion: Status changes to COMPLETED, next becomes PENDING
 */

// Get all milestones for an order
router.get('/:orderId', protect, getOrderMilestones);

// Upload proof file for milestone (SUPPLIER only)
router.post('/:id/upload-proof', protect, supplierOnly, uploadMiddleware, uploadProof);

// Verify proof for milestone (ADMIN only)
router.patch('/:id/verify-proof', protect, adminOnly, verifyProof);

// Approve milestone for 2nd+ milestones (LENDER only)
router.post('/:id/approve', protect, lenderOnly, approveMilestone);

// Complete milestone (ADMIN only - after proof verification)
// Creates RELEASE transaction and unlocks next milestone
router.patch('/:id/complete', protect, adminOnly, completeMilestone);

module.exports = router;
