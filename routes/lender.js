const express = require('express');
const router = express.Router();
const { getLenders, getPendingRequests, getOrderForApproval, approveFunding, rejectFunding } = require('../controllers/lenderController');
const { protect, lenderOnly } = require('../middleware/auth');

/**
 * Lender Routes
 * 
 * GET /api/lenders - Get all lenders (for supplier selection)
 * GET /api/lenders/pending-requests - Get pending funding requests (LENDER only)
 * GET /api/lenders/orders/:id - Get order details for approval (LENDER only)
 * POST /api/lenders/orders/:id/approve - Approve funding request (LENDER only)
 * POST /api/lenders/orders/:id/reject - Reject funding request (LENDER only)
 */

// Get all lenders - any authenticated user can view
router.get('/', protect, getLenders);

// Get pending funding requests - LENDER only
router.get('/pending-requests', protect, lenderOnly, getPendingRequests);

// Get order details for approval - LENDER only
router.get('/orders/:id', protect, lenderOnly, getOrderForApproval);

// Approve funding request - LENDER only
router.post('/orders/:id/approve', protect, lenderOnly, approveFunding);

// Reject funding request - LENDER only
router.post('/orders/:id/reject', protect, lenderOnly, rejectFunding);

module.exports = router;
