const Milestone = require('../models/Milestone');
const Order = require('../models/Order');
const Transaction = require('../models/Transaction');
const { MILESTONE_STATUS, TRANSACTION_TYPE, PRODUCTION_OPERATIONAL_CAP } = require('../config/constants');

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

    // Retrieve all milestones for the order
    const milestones = await Milestone.find({ order_id: orderId })
      .sort({ order: 1 }); // Sort by milestone sequence

    if (!milestones || milestones.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No milestones found. Order may not be approved yet.',
        order_id: orderId,
        milestones: []
      });
    }

    // Calculate milestone statistics
    const totalAmount = milestones.reduce((sum, m) => sum + m.amount, 0);
    const releasedAmount = milestones.reduce((sum, m) => sum + m.released_amount, 0);
    const completedMilestones = milestones.filter(m => m.status === 'COMPLETED').length;

    res.status(200).json({
      success: true,
      order: {
        order_id: order.order_id,
        value: order.value,
        status: order.status,
        funds_locked: order.funds_locked
      },
      milestones: milestones.map(m => ({
        id: m._id,
        name: m.name,
        amount: m.amount,
        percentage: m.percentage,
        status: m.status,
        released_amount: m.released_amount,
        proof: m.proof,
        order: m.order,
        createdAt: m.createdAt
      })),
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
 * @desc    Complete milestone
 * @route   PATCH /api/milestones/:id/complete
 * @access  Private (SUPPLIER submits proof, ADMIN approves)
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
    const { proof, approved_by } = req.body;

    // Validate milestone ID format
    if (!id || id.length !== 24) {
      return res.status(400).json({
        success: false,
        message: 'Invalid milestone ID'
      });
    }

    // Validate required fields
    if (!proof) {
      return res.status(400).json({
        success: false,
        message: 'Proof of completion is required (invoice, delivery note, etc.)'
      });
    }

    // Find milestone with order details
    const milestone = await Milestone.findById(id).populate('order_id', 'order_id value');
    if (!milestone) {
      return res.status(404).json({
        success: false,
        message: 'Milestone not found'
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

    // Create RELEASE transaction in mock escrow ledger
    // This records that funds are being released from escrow to supplier
    // For Production: Only operational amount is released; rest held back
    await Transaction.create({
      order_id: milestone.order_id._id,
      milestone_id: milestone._id,
      type: TRANSACTION_TYPE.RELEASE,
      amount: releaseAmount,
      description: holdbackAmount > 0 
        ? `Milestone "${milestone.name}" completed. Operational release: $${releaseAmount}. Holdback: $${holdbackAmount}` 
        : `Milestone "${milestone.name}" completed and approved. Funds released: $${releaseAmount}`,
      status: 'RECORDED'
    });

    // Find and unlock next milestone (if exists)
    const nextMilestone = await Milestone.findOne({
      order_id: milestone.order_id._id,
      order: milestone.order + 1
    });

    if (nextMilestone) {
      // Unlock the next milestone by changing status from LOCKED to PENDING
      nextMilestone.status = MILESTONE_STATUS.PENDING;
      await nextMilestone.save();
    }

    res.status(200).json({
      success: true,
      message: 'Milestone completed successfully. Funds released from escrow.',
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
        message: `${nextMilestone.name} milestone is now PENDING and ready for completion`
      } : {
        message: 'All milestones completed. Order fulfillment complete.'
      },
      transaction: {
        type: TRANSACTION_TYPE.RELEASE,
        amount: milestone.amount,
        description: `Funds released for milestone: ${milestone.name}`
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
