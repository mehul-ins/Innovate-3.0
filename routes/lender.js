const express = require('express');
const router = express.Router();
const { getLenders, getPendingRequests } = require('../controllers/lenderController');
const { protect, lenderOnly } = require('../middleware/auth');

/**
 * Lender Routes
 * 
 * GET /api/lenders - Get all lenders (for supplier selection)
 * GET /api/lenders/pending-requests - Get pending funding requests (LENDER only)
 */

// Get all lenders - any authenticated user can view
router.get('/', protect, getLenders);

// Get pending funding requests - LENDER only
router.get('/pending-requests', protect, lenderOnly, getPendingRequests);

module.exports = router;
