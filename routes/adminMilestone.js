const express = require('express');
const router = express.Router();
const {
  pauseMilestone,
  resumeMilestone,
  freezeMilestone,
  unfreezeMilestone,
  forceCompleteMilestone,
  releaseFundsToLender,
  releaseFundsToSupplier
} = require('../controllers/adminMilestoneController');
const { protect, adminOnly } = require('../middleware/auth');

/**
 * Admin Milestone Management Routes
 * 
 * PATCH /api/admin/milestones/:id/pause - Pause milestone
 * PATCH /api/admin/milestones/:id/resume - Resume paused milestone
 * PATCH /api/admin/milestones/:id/freeze - Freeze milestone (suspicious activity)
 * PATCH /api/admin/milestones/:id/unfreeze - Unfreeze milestone
 * PATCH /api/admin/milestones/:id/force-complete - Force complete milestone
 * POST /api/admin/milestones/:id/release-to-lender - Release funds to lender
 * POST /api/admin/milestones/:id/release-to-supplier - Release funds to supplier
 */

// Pause milestone
router.patch('/:id/pause', protect, adminOnly, pauseMilestone);

// Resume paused milestone
router.patch('/:id/resume', protect, adminOnly, resumeMilestone);

// Freeze milestone
router.patch('/:id/freeze', protect, adminOnly, freezeMilestone);

// Unfreeze milestone
router.patch('/:id/unfreeze', protect, adminOnly, unfreezeMilestone);

// Force complete milestone
router.patch('/:id/force-complete', protect, adminOnly, forceCompleteMilestone);

// Release funds to lender
router.post('/:id/release-to-lender', protect, adminOnly, releaseFundsToLender);

// Release funds to supplier
router.post('/:id/release-to-supplier', protect, adminOnly, releaseFundsToSupplier);

module.exports = router;
