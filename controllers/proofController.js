const Milestone = require('../models/Milestone');
const Order = require('../models/Order');
const Transaction = require('../models/Transaction');
const Notification = require('../models/Notification');
const { TRANSACTION_TYPE } = require('../config/constants');

/**
 * Proof Upload Controller
 * Handles supplier proof uploads and admin approval
 */

/**
 * @desc    Upload proof for a milestone
 * @route   POST /api/proofs/upload/:orderId/:milestoneIndex
 * @access  Private (SUPPLIER only)
 */
exports.uploadProof = async (req, res) => {
    try {
        console.log('[uploadProof] REQUEST:', {
            file: req.file ? { filename: req.file.filename, size: req.file.size } : null,
            orderId: req.params.orderId,
            milestoneIndex: req.params.milestoneIndex,
            userId: req.user.id
        });

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        const { orderId, milestoneIndex } = req.params;
        const milestoneIdx = parseInt(milestoneIndex);

        // Find the order
        const order = await Order.findById(orderId);
        if (!order) {
            console.log('[uploadProof] Order not found:', orderId);
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        console.log('[uploadProof] Order found:', order.order_id, 'Milestones:', order.milestones.length);

        // Verify supplier owns this order
        if (order.created_by.toString() !== req.user.id) {
            console.log('[uploadProof] Authorization failed:', order.created_by.toString(), 'vs', req.user.id);
            return res.status(403).json({
                success: false,
                message: 'You are not authorized to upload proof for this order'
            });
        }

        // Verify milestone index is valid
        if (milestoneIdx < 0 || milestoneIdx >= order.milestones.length) {
            console.log('[uploadProof] Invalid milestone index:', milestoneIdx, 'Total:', order.milestones.length);
            return res.status(400).json({
                success: false,
                message: 'Invalid milestone index'
            });
        }

        // Store proof file info
        const proofFileInfo = {
            filename: req.file.filename,
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
            path: `/uploads/proofs/${req.file.filename}`,
            uploadedAt: new Date(),
            uploadedBy: req.user.id,
            status: 'PENDING_REVIEW' // Awaiting admin approval
        };

        // Update milestone with proof information - use MongoDB update syntax
        order.milestones[milestoneIdx].proof = proofFileInfo;
        
        // Mark milestones array as modified so Mongoose will save it
        order.markModified('milestones');
        
        console.log('[uploadProof] Proof object to save:', order.milestones[milestoneIdx].proof);
        
        try {
            await order.save();
            console.log('[uploadProof] Order saved successfully');
        } catch (saveError) {
            console.error('[uploadProof] Error saving order:', saveError.message);
            console.error('[uploadProof] Order milestones:', JSON.stringify(order.milestones));
            throw saveError;
        }

        // Note: Admin notifications skipped for now - admins can see proofs in the admin panel
        // Future: Could create system notification or broadcast to admin channel

        res.status(200).json({
            success: true,
            message: 'Proof uploaded successfully. Awaiting admin review.',
            proof: proofFileInfo,
            milestone: {
                name: order.milestones[milestoneIdx].name,
                index: milestoneIdx + 1
            }
        });
    } catch (error) {
        console.error('[uploadProof] FULL ERROR:', error);
        console.error('[uploadProof] Error stack:', error.stack);
        
        // Delete uploaded file if there was an error
        if (req.file) {
            const fs = require('fs');
            fs.unlink(req.file.path, (err) => {
                if (err) console.error('Error deleting file:', err);
            });
        }

        res.status(500).json({
            success: false,
            message: 'Error uploading proof',
            error: error.message
        });
    }
};

/**
 * @desc    Admin approves proof and releases funds
 * @route   POST /api/proofs/approve/:orderId/:milestoneIndex
 * @access  Private (ADMIN only)
 */
exports.approveProof = async (req, res) => {
    try {
        const { orderId, milestoneIndex } = req.params;
        const { approvalNotes } = req.body;
        const milestoneIdx = parseInt(milestoneIndex);

        // Find the order
        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Verify milestone index is valid
        if (milestoneIdx < 0 || milestoneIdx >= order.milestones.length) {
            return res.status(400).json({
                success: false,
                message: 'Invalid milestone index'
            });
        }

        const milestone = order.milestones[milestoneIdx];

        // Check if proof exists
        if (!milestone.proof || !milestone.proof.filename) {
            return res.status(400).json({
                success: false,
                message: 'No proof found for this milestone'
            });
        }

        // Update proof status
        milestone.proof.status = 'APPROVED';
        milestone.proof.approvedAt = new Date();
        milestone.proof.approvedBy = req.user.id;
        milestone.proof.approvalNotes = approvalNotes || '';

        // Mark milestone as completed
        milestone.status = 'COMPLETED';

        // Unlock next milestone for upload (stepwise fund release)
        if (milestoneIdx + 1 < order.milestones.length) {
            if (order.milestones[milestoneIdx + 1].status === 'LOCKED') {
                order.milestones[milestoneIdx + 1].status = 'PENDING';
            }
        }

        // Mark milestones array as modified so Mongoose will save it
        order.markModified('milestones');

        // Use the milestone amount directly (already calculated and stored)
        const milestoneAmount = milestone.amount;

        // Create transaction for fund release
        const transaction = await Transaction.create({
            order_id: order._id,
            type: TRANSACTION_TYPE.RELEASE,
            amount: milestoneAmount,
            description: `Milestone "${milestone.name}" completed and approved. Funds released to supplier.`,
            status: 'RECORDED',
            milestone_index: milestoneIdx
        });

        console.log(`[approveProof] Proof approved and funds released for milestone ${milestoneIdx + 1}`);

        // Save order with updated proof status
        await order.save();

        // Notify supplier that funds are released
        await Notification.create({
            user_id: order.created_by,
            order_id: order._id,
            type: 'PROOF_APPROVED',
            message: `Your proof for milestone "${milestone.name}" has been approved. $${milestoneAmount.toLocaleString()} has been released.`,
            read: false
        });

        // Notify lender
        await Notification.create({
            user_id: order.lender_id,
            order_id: order._id,
            type: 'MILESTONE_COMPLETED',
            message: `Milestone "${milestone.name}" in order ${order.order_id} has been completed and approved. $${milestoneAmount.toLocaleString()} released.`,
            read: false
        });

        res.status(200).json({
            success: true,
            message: `Proof approved. $${milestoneAmount.toLocaleString()} released to supplier for milestone "${milestone.name}".`,
            milestone: {
                name: milestone.name,
                index: milestoneIdx + 1,
                amount: milestoneAmount
            },
            transaction: {
                id: transaction._id,
                type: transaction.type,
                amount: transaction.amount,
                description: transaction.description
            }
        });
    } catch (error) {
        console.error('[approveProof] ERROR:', error.message);
        res.status(500).json({
            success: false,
            message: 'Error approving proof',
            error: error.message
        });
    }
};

/**
 * @desc    Admin rejects proof
 * @route   POST /api/proofs/reject/:orderId/:milestoneIndex
 * @access  Private (ADMIN only)
 */
exports.rejectProof = async (req, res) => {
    try {
        const { orderId, milestoneIndex } = req.params;
        const { rejectionReason } = req.body;
        const milestoneIdx = parseInt(milestoneIndex);

        // Find the order
        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Verify milestone index is valid
        if (milestoneIdx < 0 || milestoneIdx >= order.milestones.length) {
            return res.status(400).json({
                success: false,
                message: 'Invalid milestone index'
            });
        }

        const milestone = order.milestones[milestoneIdx];

        // Update proof status
        if (milestone.proof) {
            milestone.proof.status = 'REJECTED';
            milestone.proof.rejectedAt = new Date();
            milestone.proof.rejectedBy = req.user.id;
            milestone.proof.rejectionReason = rejectionReason || 'No reason provided';
        }

        // Mark milestones array as modified so Mongoose will save it
        order.markModified('milestones');

        await order.save();

        // Notify supplier to resubmit
        await Notification.create({
            user_id: order.created_by,
            order_id: order._id,
            type: 'PROOF_REJECTED',
            message: `Your proof for milestone "${milestone.name}" has been rejected. Reason: ${rejectionReason || 'No reason provided'}. Please resubmit with corrections.`,
            read: false
        });

        console.log(`[rejectProof] Proof rejected for milestone ${milestoneIdx + 1}`);

        res.status(200).json({
            success: true,
            message: `Proof rejected. Supplier has been notified to resubmit.`,
            milestone: {
                name: milestone.name,
                index: milestoneIdx + 1
            }
        });
    } catch (error) {
        console.error('[rejectProof] ERROR:', error.message);
        res.status(500).json({
            success: false,
            message: 'Error rejecting proof',
            error: error.message
        });
    }
};

/**
 * @desc    Get proof file
 * @route   GET /api/proofs/view/:orderId/:milestoneIndex
 * @access  Private
 */
exports.getProof = async (req, res) => {
    try {
        const { orderId, milestoneIndex } = req.params;
        const milestoneIdx = parseInt(milestoneIndex);

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        if (milestoneIdx < 0 || milestoneIdx >= order.milestones.length) {
            return res.status(400).json({
                success: false,
                message: 'Invalid milestone'
            });
        }

        const milestone = order.milestones[milestoneIdx];
        if (!milestone.proof || !milestone.proof.filename) {
            return res.status(404).json({
                success: false,
                message: 'No proof found for this milestone'
            });
        }

        const path = require('path');
        const filePath = path.join(__dirname, `../uploads/proofs/${milestone.proof.filename}`);

        res.download(filePath, milestone.proof.originalname);
    } catch (error) {
        console.error('[getProof] ERROR:', error.message);
        res.status(500).json({
            success: false,
            message: 'Error retrieving proof',
            error: error.message
        });
    }
};
