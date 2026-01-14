const express = require('express');
const router = express.Router();
const { recreateMilestones, recreateAllMilestones } = require('../controllers/adminFixController');
const { protect, adminOnly } = require('../middleware/auth');

/**
 * Admin Fix Routes
 * Utility endpoints to fix data issues
 */

// Recreate milestones for a specific order
router.post('/recreate-milestones/:orderId', protect, adminOnly, recreateMilestones);

// Recreate milestones for all approved orders without milestones
router.post('/recreate-all-milestones', protect, adminOnly, recreateAllMilestones);

module.exports = router;
