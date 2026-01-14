const express = require('express');
const multer = require('../config/multer');
const { protect, authorize } = require('../middleware/auth');
const {
    uploadProof,
    approveProof,
    rejectProof,
    getProof,
    getDebugMilestoneData
} = require('../controllers/proofController');
const Order = require('../models/Order');

const router = express.Router();

/**
 * Proof Upload Routes
 * Handles supplier proof uploads and admin approval workflow
 */

// DEBUG: Check order milestones proof data
router.get('/debug/:orderId', protect, async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        res.json({
            orderId: order._id,
            orderIdString: order.order_id,
            milestonesCount: order.milestones.length,
            milestones: order.milestones.map((m, idx) => ({
                index: idx,
                name: m.name,
                hasProof: !!m.proof,
                proofStatus: m.proof ? m.proof.status : null,
                proofFile: m.proof ? m.proof.originalname : null
            }))
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Supplier uploads proof for a milestone
// POST /api/proofs/upload/:orderId/:milestoneIndex
router.post(
    '/upload/:orderId/:milestoneIndex',
    protect,
    authorize('SUPPLIER'),
    multer.single('proofFile'),
    uploadProof
);

// Admin approves proof and releases funds
// POST /api/proofs/approve/:orderId/:milestoneIndex
router.post(
    '/approve/:orderId/:milestoneIndex',
    protect,
    authorize('ADMIN'),
    approveProof
);

// Admin rejects proof (supplier needs to resubmit)
// POST /api/proofs/reject/:orderId/:milestoneIndex
router.post(
    '/reject/:orderId/:milestoneIndex',
    protect,
    authorize('ADMIN'),
    rejectProof
);

// View/download proof file
// GET /api/proofs/view/:orderId/:milestoneIndex
router.get(
    '/view/:orderId/:milestoneIndex',
    protect,
    getProof
);

// DEBUG: Get raw milestone data from database (includes approval status)
// GET /api/proofs/dbcheck/:orderId
router.get(
    '/dbcheck/:orderId',
    protect,
    getDebugMilestoneData
);

module.exports = router;
