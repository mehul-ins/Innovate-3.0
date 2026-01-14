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

        console.log(`[approveProof] START - Order ID: ${orderId}, Milestone Index: ${milestoneIdx}`);

        // Find the order
        const order = await Order.findById(orderId);
        if (!order) {
            console.log('[approveProof] ERROR - Order not found');
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        console.log(`[approveProof] Order found: ${order.order_id}, Milestones: ${order.milestones.length}`);

        // Verify milestone index is valid
        if (milestoneIdx < 0 || milestoneIdx >= order.milestones.length) {
            console.log(`[approveProof] ERROR - Invalid milestone index: ${milestoneIdx} (total: ${order.milestones.length})`);
            return res.status(400).json({
                success: false,
                message: 'Invalid milestone index'
            });
        }

        const milestone = order.milestones[milestoneIdx];
        console.log(`[approveProof] Milestone: name=${milestone.name}, status=${milestone.status}, hasProof=${!!milestone.proof}, percentage=${milestone.percentage}, amount=${milestone.amount}`);

        // Check if proof exists
        if (!milestone.proof || !milestone.proof.filename) {
            console.log('[approveProof] ERROR - No proof found for this milestone');
            return res.status(400).json({
                success: false,
                message: 'No proof found for this milestone'
            });
        }

        console.log(`[approveProof] Proof found: filename=${milestone.proof.filename}, status=${milestone.proof.status}`);

        // Update proof status
        milestone.proof.status = 'APPROVED';
        milestone.proof.approvedAt = new Date();
        milestone.proof.approvedBy = req.user.id;
        milestone.proof.approvalNotes = approvalNotes || '';

        // Use the milestone amount directly (already calculated and stored)
        // Fallback: calculate if amount is missing (for old orders)
        const milestoneAmount = milestone.amount || Math.round(order.value * (milestone.percentage / 100));

        // Mark milestone as completed and set released amount
        milestone.status = 'COMPLETED';
        milestone.released_amount = milestoneAmount; // CRITICAL: Set the released amount for UI display

        // Unlock next milestone for upload (stepwise fund release)
        if (milestoneIdx + 1 < order.milestones.length) {
            if (order.milestones[milestoneIdx + 1].status === 'LOCKED') {
                order.milestones[milestoneIdx + 1].status = 'PENDING';
            }
        }

        // Mark milestones array as modified so Mongoose will save it
        order.markModified('milestones');
        
        // DEBUG: Log before save
        console.log(`[approveProof] BEFORE SAVE:`, JSON.stringify({
            orderId: order._id,
            milestoneIdx: milestoneIdx,
            milestoneStatus: order.milestones[milestoneIdx].status,
            proofStatus: order.milestones[milestoneIdx].proof.status,
            releasedAmount: order.milestones[milestoneIdx].released_amount,
            nextMilestoneStatus: milestoneIdx + 1 < order.milestones.length ? order.milestones[milestoneIdx + 1].status : 'N/A'
        }));
        
        console.log(`[approveProof] Creating transaction - amount: ${milestoneAmount}, order_id: ${order._id}, type: ${TRANSACTION_TYPE.RELEASE}`);

        // Create transaction for fund release
        let transaction;
        try {
            transaction = await Transaction.create({
                order_id: order._id,
                type: TRANSACTION_TYPE.RELEASE,
                amount: milestoneAmount,
                description: `Milestone "${milestone.name}" completed and approved. Funds released to supplier.`,
                status: 'RECORDED',
                milestone_index: milestoneIdx
            });
            console.log(`[approveProof] Transaction created successfully: ${transaction._id}`);
        } catch (txError) {
            console.error(`[approveProof] ERROR creating transaction:`, txError.message);
            console.error(`[approveProof] Transaction error stack:`, txError.stack);
            throw txError; // Re-throw to be caught by outer catch
        }

        // Save order with updated proof status
        const savedOrder = await order.save();
        
        // DEBUG: Log after save
        console.log(`[approveProof] AFTER SAVE:`, JSON.stringify({
            orderId: savedOrder._id,
            milestoneIdx: milestoneIdx,
            milestoneStatus: savedOrder.milestones[milestoneIdx].status,
            proofStatus: savedOrder.milestones[milestoneIdx].proof.status,
            releasedAmount: savedOrder.milestones[milestoneIdx].released_amount,
            nextMilestoneStatus: milestoneIdx + 1 < savedOrder.milestones.length ? savedOrder.milestones[milestoneIdx + 1].status : 'N/A',
            transactionId: transaction._id
        }));

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
        console.error('[approveProof] Stack:', error.stack);
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

/**
 * @desc    DEBUG: Get raw milestone data from database
 * @route   GET /api/proofs/debug/:orderId
 * @access  Private (ADMIN only)
 */
exports.getDebugMilestoneData = async (req, res) => {
    try {
        const { orderId } = req.params;

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Return raw milestone data as stored in database
        const debugData = order.milestones.map((m, idx) => ({
            index: idx,
            name: m.name,
            percentage: m.percentage,
            amount: m.amount,
            status: m.status,
            proof: m.proof ? {
                filename: m.proof.filename,
                uploadedAt: m.proof.uploadedAt,
                status: m.proof.status,
                approvedAt: m.proof.approvedAt,
                approvedBy: m.proof.approvedBy
            } : null
        }));

        res.status(200).json({
            success: true,
            orderId: order._id,
            orderValue: order.value,
            milestones: debugData
        });
    } catch (error) {
        console.error('[getDebugMilestoneData] ERROR:', error.message);
        res.status(500).json({
            success: false,
            message: 'Error retrieving debug data',
            error: error.message
        });
    }
};
