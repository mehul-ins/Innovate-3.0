const Milestone = require('../models/Milestone');
const Order = require('../models/Order');
const Transaction = require('../models/Transaction');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { MILESTONE_STATUS, TRANSACTION_TYPE, ORDER_STATUS } = require('../config/constants');

/**
 * Admin Milestone Management Controller
 * 
 * Provides admin-specific milestone management functions:
 * - Pause milestone
 * - Resume milestone
 * - Freeze milestone (suspicious activity)
 * - Unfreeze milestone
 * - Force complete milestone
 * - Release funds to lender (raw materials)
 * - Release funds to supplier (production)
 */

// @desc    Pause milestone (admin only)
// @route   PATCH /api/admin/milestones/:id/pause
// @access  Private (ADMIN only)
exports.pauseMilestone = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const milestone = await Milestone.findById(id).populate('order_id');
    if (!milestone) {
      return res.status(404).json({
        success: false,
        message: 'Milestone not found'
      });
    }

    if (milestone.status === MILESTONE_STATUS.COMPLETED) {
      return res.status(400).json({
        success: false,
        message: 'Cannot pause a completed milestone'
      });
    }

    milestone.status = MILESTONE_STATUS.PAUSED;
    milestone.pause_reason = reason || 'Paused by admin';
    milestone.paused_at = new Date();
    milestone.paused_by = req.user.id;
    await milestone.save();

    // Notify supplier
    await Notification.create({
      user_id: milestone.order_id.created_by,
      order_id: milestone.order_id._id,
      milestone_id: milestone._id,
      type: 'MILESTONE_PAUSED',
      message: `Milestone "${milestone.name}" has been paused. Reason: ${milestone.pause_reason}`,
      read: false
    });

    res.status(200).json({
      success: true,
      message: 'Milestone paused successfully',
      milestone: {
        id: milestone._id,
        name: milestone.name,
        status: milestone.status,
        pause_reason: milestone.pause_reason
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error pausing milestone',
      error: error.message
    });
  }
};

// @desc    Resume paused milestone (admin only)
// @route   PATCH /api/admin/milestones/:id/resume
// @access  Private (ADMIN only)
exports.resumeMilestone = async (req, res) => {
  try {
    const { id } = req.params;

    const milestone = await Milestone.findById(id).populate('order_id');
    if (!milestone) {
      return res.status(404).json({
        success: false,
        message: 'Milestone not found'
      });
    }

    if (milestone.status !== MILESTONE_STATUS.PAUSED) {
      return res.status(400).json({
        success: false,
        message: 'Milestone is not paused'
      });
    }

    milestone.status = MILESTONE_STATUS.PENDING;
    milestone.pause_reason = null;
    milestone.paused_at = null;
    milestone.paused_by = null;
    await milestone.save();

    // Notify supplier
    await Notification.create({
      user_id: milestone.order_id.created_by,
      order_id: milestone.order_id._id,
      milestone_id: milestone._id,
      type: 'MILESTONE_RESUMED',
      message: `Milestone "${milestone.name}" has been resumed. You can continue work.`,
      read: false
    });

    res.status(200).json({
      success: true,
      message: 'Milestone resumed successfully',
      milestone: {
        id: milestone._id,
        name: milestone.name,
        status: milestone.status
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error resuming milestone',
      error: error.message
    });
  }
};

// @desc    Freeze milestone - suspicious activity (admin only)
// @route   PATCH /api/admin/milestones/:id/freeze
// @access  Private (ADMIN only)
exports.freezeMilestone = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const milestone = await Milestone.findById(id).populate('order_id');
    if (!milestone) {
      return res.status(404).json({
        success: false,
        message: 'Milestone not found'
      });
    }

    if (milestone.status === MILESTONE_STATUS.COMPLETED) {
      return res.status(400).json({
        success: false,
        message: 'Cannot freeze a completed milestone'
      });
    }

    milestone.status = MILESTONE_STATUS.FROZEN;
    milestone.freeze_reason = reason || 'Suspicious activity detected';
    milestone.frozen_at = new Date();
    milestone.frozen_by = req.user.id;
    await milestone.save();

    // Notify all parties
    await Notification.create({
      user_id: milestone.order_id.created_by,
      order_id: milestone.order_id._id,
      milestone_id: milestone._id,
      type: 'MILESTONE_FROZEN',
      message: `⚠️ ALERT: Milestone "${milestone.name}" has been FROZEN. Reason: ${milestone.freeze_reason}`,
      read: false
    });

    await Notification.create({
      user_id: milestone.order_id.lender_id,
      order_id: milestone.order_id._id,
      milestone_id: milestone._id,
      type: 'MILESTONE_FROZEN',
      message: `⚠️ ALERT: Milestone "${milestone.name}" for order ${milestone.order_id.order_id} has been FROZEN. Reason: ${milestone.freeze_reason}`,
      read: false
    });

    res.status(200).json({
      success: true,
      message: 'Milestone frozen successfully',
      milestone: {
        id: milestone._id,
        name: milestone.name,
        status: milestone.status,
        freeze_reason: milestone.freeze_reason
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error freezing milestone',
      error: error.message
    });
  }
};

// @desc    Unfreeze milestone (admin only)
// @route   PATCH /api/admin/milestones/:id/unfreeze
// @access  Private (ADMIN only)
exports.unfreezeMilestone = async (req, res) => {
  try {
    const { id } = req.params;

    const milestone = await Milestone.findById(id).populate('order_id');
    if (!milestone) {
      return res.status(404).json({
        success: false,
        message: 'Milestone not found'
      });
    }

    if (milestone.status !== MILESTONE_STATUS.FROZEN) {
      return res.status(400).json({
        success: false,
        message: 'Milestone is not frozen'
      });
    }

    milestone.status = MILESTONE_STATUS.PENDING;
    milestone.freeze_reason = null;
    milestone.frozen_at = null;
    milestone.frozen_by = null;
    await milestone.save();

    // Notify supplier
    await Notification.create({
      user_id: milestone.order_id.created_by,
      order_id: milestone.order_id._id,
      milestone_id: milestone._id,
      type: 'MILESTONE_UNFROZEN',
      message: `Milestone "${milestone.name}" has been unfrozen. You can continue work.`,
      read: false
    });

    res.status(200).json({
      success: true,
      message: 'Milestone unfrozen successfully',
      milestone: {
        id: milestone._id,
        name: milestone.name,
        status: milestone.status
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error unfreezing milestone',
      error: error.message
    });
  }
};

// @desc    Force complete milestone (admin override)
// @route   PATCH /api/admin/milestones/:id/force-complete
// @access  Private (ADMIN only)
exports.forceCompleteMilestone = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const milestone = await Milestone.findById(id).populate('order_id');
    if (!milestone) {
      return res.status(404).json({
        success: false,
        message: 'Milestone not found'
      });
    }

    if (milestone.status === MILESTONE_STATUS.COMPLETED) {
      return res.status(400).json({
        success: false,
        message: 'Milestone is already completed'
      });
    }

    const order = milestone.order_id;

    // Mark milestone as completed
    milestone.status = MILESTONE_STATUS.COMPLETED;
    milestone.released_amount = milestone.amount;
    milestone.completed_at = new Date();
    milestone.force_completed_by = req.user.id;
    milestone.force_completion_reason = reason || 'Admin override';
    await milestone.save();

    // Create release transaction
    await Transaction.create({
      order_id: order._id,
      milestone_id: milestone._id,
      type: TRANSACTION_TYPE.RELEASE,
      amount: milestone.amount,
      description: `Admin forced completion of milestone: ${milestone.name}. Reason: ${reason || 'Admin override'}`,
      status: 'COMPLETED'
    });

    // Unlock next milestone
    const nextMilestone = await Milestone.findOne({
      order_id: order._id,
      order: milestone.order + 1
    });

    if (nextMilestone) {
      nextMilestone.status = MILESTONE_STATUS.PENDING;
      await nextMilestone.save();
    }

    // Notify supplier and lender
    await Notification.create({
      user_id: order.created_by,
      order_id: order._id,
      milestone_id: milestone._id,
      type: 'MILESTONE_COMPLETED',
      message: `Milestone "${milestone.name}" has been completed by admin. Funds released.`,
      read: false
    });

    res.status(200).json({
      success: true,
      message: 'Milestone force completed successfully',
      milestone: {
        id: milestone._id,
        name: milestone.name,
        status: milestone.status,
        released_amount: milestone.released_amount
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error force completing milestone',
      error: error.message
    });
  }
};

// @desc    Release funds to lender (for raw materials milestone)
// @route   POST /api/admin/milestones/:id/release-to-lender
// @access  Private (ADMIN only)
exports.releaseFundsToLender = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, reason } = req.body;

    const milestone = await Milestone.findById(id).populate('order_id');
    if (!milestone) {
      return res.status(404).json({
        success: false,
        message: 'Milestone not found'
      });
    }

    const order = milestone.order_id;

    // Validate amount
    const releaseAmount = amount || milestone.amount;
    if (releaseAmount > milestone.amount) {
      return res.status(400).json({
        success: false,
        message: 'Release amount cannot exceed milestone amount'
      });
    }

    // Create transaction
    await Transaction.create({
      order_id: order._id,
      milestone_id: milestone._id,
      type: 'RELEASE_TO_LENDER',
      amount: releaseAmount,
      description: reason || `Funds released to lender for ${milestone.name} milestone`,
      status: 'COMPLETED',
      recipient_type: 'LENDER',
      recipient_id: order.lender_id
    });

    // Notify lender
    await Notification.create({
      user_id: order.lender_id,
      order_id: order._id,
      milestone_id: milestone._id,
      type: 'FUNDS_RELEASED',
      message: `Funds of $${releaseAmount.toLocaleString()} released to you for ${milestone.name} milestone.`,
      read: false
    });

    res.status(200).json({
      success: true,
      message: 'Funds released to lender successfully',
      transaction: {
        amount: releaseAmount,
        recipient: 'LENDER',
        milestone: milestone.name
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error releasing funds to lender',
      error: error.message
    });
  }
};

// @desc    Release funds to supplier (for production milestone)
// @route   POST /api/admin/milestones/:id/release-to-supplier
// @access  Private (ADMIN only)
exports.releaseFundsToSupplier = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, reason } = req.body;

    const milestone = await Milestone.findById(id).populate('order_id');
    if (!milestone) {
      return res.status(404).json({
        success: false,
        message: 'Milestone not found'
      });
    }

    const order = milestone.order_id;

    // Validate amount
    const releaseAmount = amount || milestone.amount;
    if (releaseAmount > milestone.amount) {
      return res.status(400).json({
        success: false,
        message: 'Release amount cannot exceed milestone amount'
      });
    }

    // Update milestone
    milestone.released_amount = (milestone.released_amount || 0) + releaseAmount;
    await milestone.save();

    // Create transaction
    await Transaction.create({
      order_id: order._id,
      milestone_id: milestone._id,
      type: 'RELEASE_TO_SUPPLIER',
      amount: releaseAmount,
      description: reason || `Funds released to supplier for ${milestone.name} milestone`,
      status: 'COMPLETED',
      recipient_type: 'SUPPLIER',
      recipient_id: order.created_by
    });

    // Notify supplier
    await Notification.create({
      user_id: order.created_by,
      order_id: order._id,
      milestone_id: milestone._id,
      type: 'FUNDS_RELEASED',
      message: `Funds of $${releaseAmount.toLocaleString()} released to you for ${milestone.name} milestone.`,
      read: false
    });

    res.status(200).json({
      success: true,
      message: 'Funds released to supplier successfully',
      transaction: {
        amount: releaseAmount,
        recipient: 'SUPPLIER',
        milestone: milestone.name,
        total_released: milestone.released_amount
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error releasing funds to supplier',
      error: error.message
    });
  }
};

module.exports = {
  pauseMilestone: exports.pauseMilestone,
  resumeMilestone: exports.resumeMilestone,
  freezeMilestone: exports.freezeMilestone,
  unfreezeMilestone: exports.unfreezeMilestone,
  forceCompleteMilestone: exports.forceCompleteMilestone,
  releaseFundsToLender: exports.releaseFundsToLender,
  releaseFundsToSupplier: exports.releaseFundsToSupplier
};
