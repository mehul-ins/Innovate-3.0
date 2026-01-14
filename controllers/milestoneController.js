const Milestone = require('../models/Milestone');
const Order = require('../models/Order');
const Transaction = require('../models/Transaction');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { MILESTONE_STATUS, TRANSACTION_TYPE, PRODUCTION_OPERATIONAL_CAP, ROLES } = require('../config/constants');
const fs = require('fs');
const path = require('path');

/**
 * Milestone Controller
 * 
 * Handles milestone retrieval and status tracking.
 * Milestones represent payment stages tied to delivery milestones.
 */

// @desc    Get all milestones for an order
// @route   GET /api/orders/:id/milestones
// @access  Private (Any authenticated user)
exports.getOrderMilestones = async (req, res) => {
  try {
    const { orderId } = req.params;

    // Validate order ID format
    if (!orderId || orderId.length !== 24) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID'
      });
    }

    // Check if order exists
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Retrieve milestones from Milestone collection
    const milestonesFromCollection = await Milestone.find({ order_id: orderId })
      .sort({ order: 1 }); // Sort by milestone sequence

    console.log('\n========== GET ORDER MILESTONES DEBUG ==========');
    console.log('Order ID:', orderId);
    console.log('Order.milestones array length:', order.milestones.length);
    console.log('Milestone collection count:', milestonesFromCollection.length);

    // If no milestones in collection but Order.milestones array has data, use that
    let milestones = milestonesFromCollection;
    if (milestonesFromCollection.length === 0 && order.milestones && order.milestones.length > 0) {
      console.log('Using Order.milestones array (no Milestone documents found)');
      // Convert Order.milestones array to milestone objects
      milestones = order.milestones.map((m, idx) => {
        // Calculate amount if missing (for backward compatibility with existing orders)
        const amount = m.amount || Math.round(order.value * (m.percentage / 100));
        return {
          _id: null,
          order_id: orderId,
          name: m.name,
          amount: amount,
          percentage: m.percentage || 0,
          status: m.status || 'PENDING',
          released_amount: m.released_amount || 0,
          proof: m.proof || null,
          proof_file_path: null,
          proof_verification_status: null,
          proof_verified_at: null,
          proof_verified_by: null,
          order: idx + 1,
          createdAt: new Date()
        };
      });
    }

    if (!milestones || milestones.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No milestones found. Order may not be approved yet.',
        order_id: orderId,
        milestones: []
      });
    }

    // Calculate milestone statistics - need to account for missing amounts
    const totalAmount = milestones.reduce((sum, m) => {
      const amount = m.amount || Math.round(order.value * (m.percentage / 100));
      return sum + (amount || 0);
    }, 0);
    const releasedAmount = milestones.reduce((sum, m) => sum + (m.released_amount || 0), 0);
    const completedMilestones = milestones.filter(m => m.status === 'COMPLETED').length;

    // Debug logging to see proof data
    console.log('Final milestones count:', milestones.length);
    console.log('Completed milestones count:', completedMilestones);
    milestones.forEach((m, idx) => {
      const proof = m.proof;
      const amount = m.amount || Math.round(order.value * (m.percentage / 100));
      console.log(`Milestone ${m.order} (${m.name}): status=${m.status}, amount=${amount}, has proof =`, !!proof, proof ? `status=${proof.status}` : '');
    });
    console.log('================================================\n');

    res.status(200).json({
      success: true,
      order: {
        order_id: order.order_id,
        value: order.value,
        status: order.status,
        funds_locked: order.funds_locked
      },
      milestones: milestones.map((m) => {
        // For Order.milestones array items, proof is already included
        // For Milestone collection items, we need to check for proof in Order.milestones
        let proofData = m.proof;
        if (!proofData && m.order && order.milestones && order.milestones[m.order - 1]) {
          proofData = order.milestones[m.order - 1].proof;
        }
        
        // Calculate amount if missing (for backward compatibility)
        const amount = m.amount || Math.round(order.value * (m.percentage / 100));
        
        return {
          id: m._id || `milestone-${m.order}`,
          name: m.name,
          amount: amount,
          percentage: m.percentage,
          status: m.status,
          released_amount: m.released_amount,
          proof: proofData,
          proof_file_path: m.proof_file_path,
          proof_url: m.proof_file_path ? `/uploads/proofs/${path.basename(m.proof_file_path)}` : null,
          proof_verification_status: m.proof_verification_status,
          proof_verified_at: m.proof_verified_at,
          proof_verified_by: m.proof_verified_by,
          order: m.order,
          createdAt: m.createdAt
        };
      }),
      summary: {
        total_milestones: milestones.length,
        completed: completedMilestones,
        pending: milestones.filter(m => m.status === 'PENDING').length,
        locked: milestones.filter(m => m.status === 'LOCKED').length,
        total_amount: totalAmount,
        released_amount: releasedAmount,
        pending_amount: totalAmount - releasedAmount
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching milestones',
      error: error.message
    });
  }
};

/**
 * @desc    Upload proof for milestone
 * @route   POST /api/milestones/:id/upload-proof
 * @access  Private (SUPPLIER only)
 * 
 * Proof Upload Workflow:
 * 1. SUPPLIER uploads proof file (PDF, JPG, PNG, DOC)
 * 2. File stored in uploads/proofs/
 * 3. Milestone proof_file_path updated
 * 4. proof_verification_status set to PENDING
 * 5. Notifications sent to ADMIN and LENDER
 * 
 * Validations:
 * - Only SUPPLIER can upload proof
 * - Milestone must be PENDING status
 * - Cannot upload proof for completed milestones
 * - File type must be PDF, JPG, PNG, DOC, DOCX
 */
exports.uploadProof = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Proof file is required. Please upload a PDF, JPG, PNG, DOC, or DOCX file.'
      });
    }

    // Validate milestone ID format
    if (!id || id.length !== 24) {
      // Delete uploaded file if milestone ID is invalid
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        message: 'Invalid milestone ID'
      });
    }

    // Find milestone with order details
    const milestone = await Milestone.findById(id).populate('order_id', 'order_id lender_id created_by');
    if (!milestone) {
      // Delete uploaded file if milestone not found
      fs.unlinkSync(req.file.path);
      return res.status(404).json({
        success: false,
        message: 'Milestone not found'
      });
    }

    // Verify user is the supplier who created the order
    if (milestone.order_id.created_by.toString() !== req.user.id) {
      fs.unlinkSync(req.file.path);
      return res.status(403).json({
        success: false,
        message: 'Only the supplier who created this order can upload proof'
      });
    }

    // Check if milestone is already completed (immutable)
    if (milestone.status === MILESTONE_STATUS.COMPLETED) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        message: 'Cannot upload proof. Milestone is already completed and immutable.',
        current_status: milestone.status
      });
    }

    // Only PENDING milestones can have proof uploaded
    if (milestone.status !== MILESTONE_STATUS.PENDING) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        message: `Cannot upload proof. Milestone status must be PENDING. Current status: ${milestone.status}`,
        allowed_status: MILESTONE_STATUS.PENDING,
        current_status: milestone.status
      });
    }

    // Delete old proof file if exists
    if (milestone.proof_file_path) {
      const oldFilePath = path.join(__dirname, '..', milestone.proof_file_path);
      if (fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);
      }
    }

    // Update milestone with proof file path
    milestone.proof_file_path = req.file.path;
    milestone.proof_verification_status = 'PENDING';
    milestone.proof_verified_at = null;
    milestone.proof_verified_by = null;
    await milestone.save();

    // Create notifications for ADMIN and LENDER (type: PROOF_SUBMITTED)
    const order = milestone.order_id;
    // Notify all ADMIN users
    const adminUsers = await User.find({ role: ROLES.ADMIN }).select('_id');
    for (const admin of adminUsers) {
      await Notification.create({
        user_id: admin._id,
        order_id: order._id,
        milestone_id: milestone._id,
        type: 'PROOF_SUBMITTED',
        message: `Proof submitted for milestone "${milestone.name}" in order ${order.order_id}. Awaiting verification.`,
        read: false
      });
    }
    // Notify LENDER if exists
    if (order.lender_id) {
      await Notification.create({
        user_id: order.lender_id,
        order_id: order._id,
        milestone_id: milestone._id,
        type: 'PROOF_SUBMITTED',
        message: `Proof submitted for milestone "${milestone.name}" in order ${order.order_id}. Awaiting admin verification.`,
        read: false
      });
    }

    res.status(200).json({
      success: true,
      message: 'Proof uploaded successfully. Awaiting admin verification.',
      milestone: {
        id: milestone._id,
        name: milestone.name,
        proof_file_path: milestone.proof_file_path,
        proof_verification_status: milestone.proof_verification_status,
        proof_url: `/uploads/proofs/${path.basename(milestone.proof_file_path)}`
      }
    });
  } catch (error) {
    // Delete uploaded file on error
    if (req.file && req.file.path) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({
      success: false,
      message: 'Error uploading proof',
      error: error.message
    });
  }
};

/**
 * @desc    Verify proof for milestone (ADMIN only)
 * @route   PATCH /api/milestones/:id/verify-proof
 * @access  Private (ADMIN only)
 * 
 * Proof Verification Workflow:
 * 1. ADMIN reviews uploaded proof file
 * 2. ADMIN verifies or rejects proof
 * 3. If verified, milestone can be completed
 * 4. If rejected, supplier must upload new proof
 * 
 * Validations:
 * - Only ADMIN can verify proof
 * - Proof must be uploaded (proof_file_path must exist)
 * - Proof must be in PENDING verification status
 */
exports.verifyProof = async (req, res) => {
  try {
    const { id } = req.params;
    const { verified, rejection_reason } = req.body; // verified: true/false

    console.log('[verifyProof] REQUEST - Admin Role:', req.user.role, 'Admin ID:', req.user.id, 'Milestone ID:', id, 'Verified:', verified);

    // Validate milestone ID format
    if (!id || id.length !== 24) {
      console.log('[verifyProof] ERROR - Invalid milestone ID format:', id);
      return res.status(400).json({
        success: false,
        message: 'Invalid milestone ID'
      });
    }

    // Validate verified field
    if (typeof verified !== 'boolean') {
      console.log('[verifyProof] ERROR - Invalid verified field:', verified);
      return res.status(400).json({
        success: false,
        message: 'verified field is required and must be true or false'
      });
    }

    // Find milestone with order details
    const milestone = await Milestone.findById(id).populate('order_id', 'order_id created_by lender_id');
    if (!milestone) {
      console.log('[verifyProof] ERROR - Milestone not found:', id);
      return res.status(404).json({
        success: false,
        message: 'Milestone not found'
      });
    }

    console.log('[verifyProof] MILESTONE FOUND - Name:', milestone.name, 'Status:', milestone.status, 'Proof Status:', milestone.proof_verification_status, 'Has Proof:', !!milestone.proof_file_path);

    // Check if proof has been uploaded
    if (!milestone.proof_file_path) {
      console.log('[verifyProof] ERROR - No proof file uploaded');
      return res.status(400).json({
        success: false,
        message: 'No proof file uploaded for this milestone. Supplier must upload proof first.'
      });
    }

    // Check if proof is already verified
    if (milestone.proof_verification_status === 'VERIFIED') {
      console.log('[verifyProof] ERROR - Proof already verified');
      return res.status(400).json({
        success: false,
        message: 'Proof is already verified for this milestone.'
      });
    }

    // Update verification status
    if (verified) {
      milestone.proof_verification_status = 'VERIFIED';
      milestone.proof_verified_at = new Date();
      milestone.proof_verified_by = req.user.id;
      console.log('[verifyProof] SUCCESS - Proof VERIFIED for milestone:', milestone.name);
    } else {
      milestone.proof_verification_status = 'REJECTED';
      milestone.proof_verified_at = new Date();
      milestone.proof_verified_by = req.user.id;
      console.log('[verifyProof] REJECTED - Proof REJECTED for milestone:', milestone.name, 'Reason:', rejection_reason);
      // Optionally delete rejected proof file
      // For now, we keep it for audit trail
    }

    await milestone.save();

    // Create notification for supplier (type: MILESTONE_APPROVED or rejection)
    await Notification.create({
      user_id: milestone.order_id.created_by,
      order_id: milestone.order_id._id,
      milestone_id: milestone._id,
      type: verified ? 'MILESTONE_APPROVED' : 'MILESTONE_APPROVED',
      message: verified 
        ? `Proof verified for milestone "${milestone.name}" in order ${milestone.order_id.order_id}. You can now complete this milestone.`
        : `Proof rejected for milestone "${milestone.name}" in order ${milestone.order_id.order_id}. ${rejection_reason || 'Please upload a new proof.'}`,
      read: false
    });

    console.log('[verifyProof] NOTIFICATION CREATED for supplier:', milestone.order_id.created_by);

    res.status(200).json({
      success: true,
      message: verified ? 'Proof verified successfully.' : 'Proof rejected.',
      milestone: {
        id: milestone._id,
        name: milestone.name,
        proof_verification_status: milestone.proof_verification_status,
        proof_verified_at: milestone.proof_verified_at,
        proof_verified_by: milestone.proof_verified_by
      }
    });
  } catch (error) {
    console.error('[verifyProof] ERROR:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying proof',
      error: error.message
    });
  }
};

/**
 * @desc    Approve milestone (lender approval for 2nd+ milestones)
 * @route   POST /api/milestones/:id/approve
 * @access  Private (LENDER only)
 * 
 * Lender Milestone Approval Workflow:
 * 1. For 2nd+ milestones, lender must approve before execution
 * 2. First milestone (order=1) is already approved with the initial order
 * 3. When approved, milestone becomes PENDING and ready for execution
 * 4. Supplier can then upload proof and complete the milestone
 * 
 * Validations:
 * - Only LOCKED milestones can be approved (order > 1)
 * - Lender must be the order's lender
 * - Previous milestone must be COMPLETED
 */
exports.approveMilestone = async (req, res) => {
  try {
    const { id } = req.params;
    const lenderId = req.user.id;

    const milestone = await Milestone.findById(id)
      .populate('order_id');

    if (!milestone) {
      return res.status(404).json({
        success: false,
        message: 'Milestone not found'
      });
    }

    // Only allow approval for 2nd+ milestones
    if (milestone.order === 1) {
      return res.status(400).json({
        success: false,
        message: 'First milestone is automatically approved with the order. Cannot approve again.'
      });
    }

    // Check if lender owns this order
    if (milestone.order_id.lender_id.toString() !== lenderId) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to approve this milestone'
      });
    }

    // Milestone must be LOCKED to be approved
    if (milestone.status !== MILESTONE_STATUS.LOCKED) {
      return res.status(400).json({
        success: false,
        message: `Milestone status is ${milestone.status}. Only LOCKED milestones can be approved.`
      });
    }

    // Check if previous milestone is completed
    const previousMilestone = await Milestone.findOne({
      order_id: milestone.order_id._id,
      order: milestone.order - 1
    });

    if (previousMilestone && previousMilestone.status !== MILESTONE_STATUS.COMPLETED) {
      return res.status(400).json({
        success: false,
        message: `Cannot approve. Previous milestone (${previousMilestone.name}) is not yet completed.`
      });
    }

    // Approve the milestone (change from LOCKED to PENDING)
    milestone.status = MILESTONE_STATUS.PENDING;
    milestone.lender_approved_at = new Date();
    milestone.lender_approved_by = lenderId;
    await milestone.save();

    // Create notification for supplier
    await Notification.create({
      user_id: milestone.order_id.created_by,
      order_id: milestone.order_id._id,
      milestone_id: milestone._id,
      type: 'MILESTONE_APPROVED',
      message: `Lender approved milestone "${milestone.name}". You can now submit proof and complete this milestone.`,
      read: false
    });

    res.status(200).json({
      success: true,
      message: `Milestone "${milestone.name}" approved successfully`,
      milestone: {
        id: milestone._id,
        name: milestone.name,
        status: milestone.status,
        lender_approved_at: milestone.lender_approved_at
      }
    });
  } catch (error) {
    console.error('[approveMilestone] ERROR:', error);
    res.status(500).json({
      success: false,
      message: 'Error approving milestone',
      error: error.message
    });
  }
};

/**
 * @desc    Complete milestone (only after proof verification)
 * @route   PATCH /api/milestones/:id/complete
 * @access  Private (ADMIN only - after proof verification)
 * 
 * Milestone Completion Workflow:
 * 1. SUPPLIER submits proof of completion (invoice, delivery note, etc.)
 * 2. ADMIN reviews and approves
 * 3. Milestone marked as COMPLETED
 * 4. RELEASE transaction created (funds transferred from escrow)
 * 5. Next milestone automatically unlocked
 * 
 * Validations:
 * - Cannot skip milestones (only PENDING can be completed)
 * - Cannot re-complete (immutable once COMPLETED)
 * - Cannot complete LOCKED milestones
 * - Proof is required
 * 
 * Fund Release:
 * - Creates mock RELEASE transaction
 * - Updates milestone released_amount
 * - Next milestone becomes PENDING (if exists)
 */
exports.completeMilestone = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate milestone ID format
    if (!id || id.length !== 24) {
      return res.status(400).json({
        success: false,
        message: 'Invalid milestone ID'
      });
    }

    // Find milestone with order details
    const milestone = await Milestone.findById(id).populate('order_id', 'order_id value status');
    if (!milestone) {
      return res.status(404).json({
        success: false,
        message: 'Milestone not found'
      });
    }

    // Phase 7: Prevent actions on CLOSED orders
    if (milestone.order_id.status === ORDER_STATUS.CLOSED) {
      return res.status(400).json({
        success: false,
        message: 'Cannot complete milestone. Order is CLOSED. No further actions allowed.',
        order_status: milestone.order_id.status
      });
    }

    // Check if milestone is already completed (immutable)
    if (milestone.status === MILESTONE_STATUS.COMPLETED) {
      return res.status(400).json({
        success: false,
        message: 'Milestone is already completed and immutable',
        current_status: milestone.status
      });
    }

    // Prevent skipping milestones - only PENDING can be completed
    if (milestone.status !== MILESTONE_STATUS.PENDING) {
      return res.status(400).json({
        success: false,
        message: `Cannot complete milestone. Current status: ${milestone.status}. Only PENDING milestones can be completed.`,
        allowed_status: MILESTONE_STATUS.PENDING,
        current_status: milestone.status
      });
    }

    // Require proof verification before completion
    if (!milestone.proof_file_path) {
      return res.status(400).json({
        success: false,
        message: 'Cannot complete milestone. Proof file must be uploaded first.'
      });
    }

    if (milestone.proof_verification_status !== 'VERIFIED') {
      return res.status(400).json({
        success: false,
        message: `Cannot complete milestone. Proof must be verified by admin first. Current verification status: ${milestone.proof_verification_status || 'PENDING'}`,
        proof_verification_status: milestone.proof_verification_status
      });
    }

    // Determine release amount based on milestone type
    // Production milestone has operational cap to limit financial exposure
    let releaseAmount = milestone.amount;
    let holdbackAmount = 0;

    if (milestone.name === 'Production') {
      // Exposure Control: For Production milestone, only release operational amount
      // This holds back funds until final delivery to ensure supplier commitment
      // Example: $40k production milestone releases only $30k (75%), holds back $10k
      releaseAmount = milestone.amount * PRODUCTION_OPERATIONAL_CAP;
      holdbackAmount = milestone.amount - releaseAmount;
    }

    // Update milestone to COMPLETED and add proof
    milestone.status = MILESTONE_STATUS.COMPLETED;
    milestone.proof = proof;
    milestone.released_amount = releaseAmount; // Amount released (may be partial for Production)
    await milestone.save();

    // Determine recipient based on milestone order
    // First milestone (order === 1): Funds go to LENDER (they provided the capital)
    // Subsequent milestones (order > 1): Funds go to SUPPLIER (direct payment)
    const order = await Order.findById(milestone.order_id._id)
      .populate('created_by', 'name email')
      .populate('lender_id', 'name email');
    
    let recipientId = null;
    let recipientType = null;
    let recipientName = '';
    
    if (milestone.order === 1) {
      // First milestone: Pay lender
      recipientId = order.lender_id._id;
      recipientType = 'LENDER';
      recipientName = order.lender_id.name;
    } else {
      // Subsequent milestones: Pay supplier
      recipientId = order.created_by._id;
      recipientType = 'SUPPLIER';
      recipientName = order.created_by.name;
    }

    // Create RELEASE transaction in mock escrow ledger
    // This records that funds are being released from escrow
    // Recipient varies: First milestone to lender, subsequent to supplier
    await Transaction.create({
      order_id: milestone.order_id._id,
      milestone_id: milestone._id,
      type: TRANSACTION_TYPE.RELEASE,
      amount: releaseAmount,
      recipient_id: recipientId,
      recipient_type: recipientType,
      description: holdbackAmount > 0 
        ? `Milestone "${milestone.name}" completed. Operational release: $${releaseAmount} to ${recipientType} (${recipientName}). Holdback: $${holdbackAmount}` 
        : `Milestone "${milestone.name}" completed. Funds released: $${releaseAmount} to ${recipientType} (${recipientName})`,
      status: 'RECORDED'
    });


    // Enforce only one PENDING milestone at a time
    // Find next milestone by order sequence
    const nextMilestone = await Milestone.findOne({
      order_id: milestone.order_id._id,
      order: milestone.order + 1
    });

    let orderCompletionMessage = '';
    let loanRepaid = false;

    if (nextMilestone) {
      // Only unlock if all previous are COMPLETED (should always be true here)
      // Set next milestone to PENDING, all others remain LOCKED/COMPLETED
      nextMilestone.status = MILESTONE_STATUS.PENDING;
      await nextMilestone.save();
      
      // Update order to reflect next milestone's funds are now unlocked (stepwise release)
      const order = await Order.findById(milestone.order_id._id);
      order.current_unlocked_milestone = nextMilestone.order;
      await order.save();
      
      // Notify supplier: next milestone unlocked
      await Notification.create({
        user_id: order.created_by,
        order_id: order._id,
        milestone_id: nextMilestone._id,
        type: 'NEXT_MILESTONE_UNLOCKED',
        message: `Next milestone "${nextMilestone.name}" unlocked for order ${order.order_id}. Funds now available for milestone ${nextMilestone.order}.`,
        read: false
      });
    } else {
      // No more milestones: mark order as COMPLETED and REPAID, then close
      const order = await Order.findById(milestone.order_id._id);
      if (order && (order.status === ORDER_STATUS.APPROVED || order.status === ORDER_STATUS.LENDER_APPROVED)) {
        order.status = ORDER_STATUS.COMPLETED;
        order.current_unlocked_milestone = milestone.order; // All funds released
        await order.save();
        // Mock loan repayment transaction
        await Transaction.create({
          order_id: order._id,
          type: TRANSACTION_TYPE.RELEASE,
          amount: order.value,
          description: 'Loan repaid in full. Order closed.',
          status: 'RECORDED'
        });
        // Mark order as CLOSED
        order.status = ORDER_STATUS.CLOSED;
        await order.save();
        orderCompletionMessage = 'All milestones completed. Order marked as COMPLETED and loan REPAID. Order is now CLOSED.';
        loanRepaid = true;
      }
    }

    res.status(200).json({
      success: true,
      message: loanRepaid
        ? 'Final milestone completed. Order is now CLOSED and loan is REPAID.'
        : 'Milestone completed successfully. Funds released from escrow.',
      milestone: {
        id: milestone._id,
        name: milestone.name,
        amount: milestone.amount,
        status: milestone.status,
        released_amount: milestone.released_amount,
        proof: milestone.proof,
        completed_at: new Date()
      },
      next_milestone: nextMilestone ? {
        id: nextMilestone._id,
        name: nextMilestone.name,
        status: nextMilestone.status,
        message: (nextMilestone.name + ' milestone is now PENDING and ready for completion')
      } : {
        message: orderCompletionMessage || 'All milestones completed. Order fulfillment complete.'
      },
      transaction: {
        type: TRANSACTION_TYPE.RELEASE,
        amount: milestone.amount,
        description: 'Funds released for milestone: ' + milestone.name
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error completing milestone',
      error: error.message
    });
  }
};
