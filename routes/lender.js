const express = require('express');
const router = express.Router();
const { getLenders, getPendingRequests, getOrderForApproval, rejectFunding, getPendingMilestones } = require('../controllers/lenderController');
const { protect, lenderOnly } = require('../middleware/auth');

/**
 * Lender Routes
 * 
 * GET /api/lenders - Get all lenders (for supplier selection)
 * GET /api/lenders/pending-requests - Get pending funding requests (LENDER only)
 * GET /api/lenders/pending-milestones - Get milestones pending lender approval (LENDER only)
 * GET /api/lenders/orders/:id - Get order details for approval (LENDER only)
 * POST /api/lenders/orders/:id/reject - Reject funding request (LENDER only)
 * 
 * NOTE: Lender approval is handled by /api/orders/:id/lender-approve (in order.js)
 */

// Get all lenders - any authenticated user can view
router.get('/', protect, getLenders);

// Get pending funding requests - LENDER only
router.get('/pending-requests', protect, lenderOnly, getPendingRequests);

// Get pending milestones for lender approval - LENDER only
router.get('/pending-milestones', protect, lenderOnly, getPendingMilestones);

// Get order details for approval - LENDER only
router.get('/orders/:id', protect, lenderOnly, getOrderForApproval);

// Reject funding request - LENDER only
router.post('/orders/:id/reject', protect, lenderOnly, rejectFunding);

module.exports = router;
