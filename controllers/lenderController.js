const User = require('../models/User');
const Order = require('../models/Order');
const Milestone = require('../models/Milestone');
const Transaction = require('../models/Transaction');
const Notification = require('../models/Notification');
const { ROLES, ORDER_STATUS, TRANSACTION_TYPE, MILESTONE_STATUS } = require('../config/constants');

/**
 * Lender Controller
 * 
 * Handles lender-specific operations:
 * - Get list of all lenders (for supplier selection)
 * - Get pending funding requests for a lender
 */

// @desc    Get all lenders
// @route   GET /api/lenders
// @access  Private (all authenticated users can view lenders)
exports.getLenders = async (req, res) => {
  try {
    const lenders = await User.find({ role: ROLES.LENDER })
      .select('_id name email')
      .sort({ name: 1 });

    res.status(200).json({
      success: true,
      count: lenders.length,
      lenders: lenders.map(lender => ({
        id: lender._id,
        name: lender.name,
        email: lender.email
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching lenders',
      error: error.message
    });
  }
};

// @desc    Get pending funding requests for logged-in lender
// @route   GET /api/lenders/pending-requests
// @access  Private (LENDER only)
exports.getPendingRequests = async (req, res) => {
  try {
    const lenderId = req.user.id;

    // DEBUG: Log role and lender ID
    console.log('=== GET PENDING REQUESTS ===');
    console.log('ROLE:', req.user.role);
    console.log('LENDER ID:', lenderId);

    // Get all unread notifications for this lender
    const notifications = await Notification.find({
      user_id: lenderId,
      read: false,
      type: 'FUNDING_REQUEST'
    })
      .populate({
        path: 'order_id',
        populate: {
          path: 'created_by',
          select: 'name email'
        }
      })
      .sort({ createdAt: -1 });

    // Get orders that are PENDING_LENDER_APPROVAL and assigned to this lender
    const orders = await Order.find({
      lender_id: lenderId,
      status: ORDER_STATUS.PENDING_LENDER_APPROVAL
    })
      .populate('created_by', 'name email')
      .sort({ createdAt: -1 });

    console.log('FOUND', orders.length, 'PENDING_LENDER_APPROVAL orders for this lender');
    orders.forEach(o => {
      console.log('  - Order:', o.order_id, 'Status:', o.status, 'Lender:', o.lender_id.toString());
    });

    res.status(200).json({
      success: true,
      count: orders.length,
      orders: orders.map(order => ({
        id: order._id,
        order_id: order.order_id,
        buyer_name: order.buyer_name,
        value: order.value,
        delivery_date: order.delivery_date,
        status: order.status,
        milestones: order.milestones,
        supplier: order.created_by,
        createdAt: order.createdAt
      })),
      notifications: notifications.map(notif => ({
        id: notif._id,
        message: notif.message,
        order_id: notif.order_id?._id,
        order_order_id: notif.order_id?.order_id,
        createdAt: notif.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching pending requests',
      error: error.message
    });
  }
};

// @desc    Get order details for lender approval
// @route   GET /api/lenders/orders/:id
// @access  Private (LENDER only)
exports.getOrderForApproval = async (req, res) => {
  try {
    const { id } = req.params;
    const lenderId = req.user.id;

    const order = await Order.findById(id)
      .populate('created_by', 'name email')
      .populate('lender_id', 'name email');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Verify this order belongs to the logged-in lender
    if (order.lender_id._id.toString() !== lenderId) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to view this order'
      });
    }

    // Verify order is pending lender approval
    if (order.status !== ORDER_STATUS.PENDING_LENDER_APPROVAL) {
      return res.status(400).json({
        success: false,
        message: `Order is not pending lender approval. Current status: ${order.status}`
      });
    }

    res.status(200).json({
      success: true,
      order: {
        id: order._id,
        order_id: order.order_id,
        buyer_name: order.buyer_name,
        value: order.value,
        delivery_date: order.delivery_date,
        status: order.status,
        lender_approval_status: order.lender_approval_status,
        milestones: order.milestones,
        supplier: order.created_by,
        createdAt: order.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching order details',
      error: error.message
    });
  }
};

// @desc    Approve funding request
// @route   POST /api/lenders/orders/:id/approve
// @access  Private (LENDER only)
exports.approveFunding = async (req, res) => {
  try {
    const { id } = req.params;
    const { milestone_timelines } = req.body;
    const lenderId = req.user.id;

    const order = await Order.findById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.lender_id.toString() !== lenderId) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to approve this order'
      });
    }

    if (order.status !== ORDER_STATUS.PENDING_LENDER_APPROVAL) {
      return res.status(400).json({
        success: false,
        message: `Order cannot be approved. Current status: ${order.status}`
      });
    }

    // Milestone-wise approval: Only create milestone for the ones provided in milestone_timelines
    // This allows lender to approve one milestone at a time
    order.status = ORDER_STATUS.LENDER_APPROVED;
    order.lender_approval_status = 'APPROVED';
    order.lender_approval_date = new Date();
    order.funds_locked = false; // Admin will lock funds separately
    await order.save();

    if (milestone_timelines && Array.isArray(milestone_timelines) && milestone_timelines.length > 0) {
      try {
        const milestones = [];
        const approvalDate = new Date();
        
        // Count how many milestones already exist for this order
        const existingMilestoneCount = await Milestone.countDocuments({ order_id: order._id });
        console.log(`[approveFunding] Existing milestones for order ${order.order_id}:`, existingMilestoneCount);

        // Only create milestones for the ones in milestone_timelines
        for (let i = 0; i < milestone_timelines.length; i++) {
          const timelineItem = milestone_timelines[i];
          console.log(`[approveFunding] Processing milestone ${i}: ${timelineItem.milestone_name}`);
          
          const orderMilestone = order.milestones.find(m => m.name === timelineItem.milestone_name);
          
          if (!orderMilestone) {
            console.warn(`[approveFunding] Milestone ${timelineItem.milestone_name} not found in order`);
            continue;
          }
          
          const amount = (order.value * orderMilestone.percentage) / 100;
          
          let dueDate = null;
          if (timelineItem.timeline_days) {
            dueDate = new Date(approvalDate);
            dueDate.setDate(dueDate.getDate() + timelineItem.timeline_days);
          }
          
          // Calculate proper order number based on existing milestones
          const milestoneOrder = existingMilestoneCount + i + 1;

          milestones.push({
            order_id: order._id,
            name: orderMilestone.name,
            amount: amount,
            percentage: orderMilestone.percentage,
            status: existingMilestoneCount === 0 && i === 0 ? MILESTONE_STATUS.PENDING : MILESTONE_STATUS.LOCKED,
            order: milestoneOrder,
            due_date: dueDate,
            timeline_days: timelineItem.timeline_days
          });
        }

        if (milestones.length > 0) {
          await Milestone.insertMany(milestones);
          console.log(`[approveFunding] Created ${milestones.length} milestone(s) for order ${order.order_id}`);
        }
      } catch (milestoneError) {
        console.error(`[approveFunding] Error creating milestones:`, milestoneError.message);
        return res.status(500).json({
          success: false,
          message: 'Error creating milestones',
          error: milestoneError.message
        });
      }
    }

    // Note: Transaction/LOCK will be created by admin when they lock funds
    // Lender approval does NOT lock funds - admin controls fund locking

    await Notification.updateMany(
      { order_id: order._id, user_id: lenderId, type: 'FUNDING_REQUEST' },
      { read: true }
    );

    res.status(200).json({
      success: true,
      message: 'Funding approved successfully. Awaiting admin to lock funds.',
      order: {
        id: order._id,
        order_id: order.order_id,
        status: order.status,
        lender_approval_status: order.lender_approval_status,
        funds_locked: order.funds_locked,
        lender_approval_date: order.lender_approval_date,
        note: 'Admin must lock funds separately'
      }
    });
  } catch (error) {
    console.error('[approveFunding] ERROR:', error.message);
    console.error('[approveFunding] Stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Error approving funding',
      error: error.message
    });
  }
};

// @desc    Reject funding request
// @route   POST /api/lenders/orders/:id/reject
// @access  Private (LENDER only)
exports.rejectFunding = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejection_reason } = req.body;
    const lenderId = req.user.id;

    const order = await Order.findById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.lender_id.toString() !== lenderId) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to reject this order'
      });
    }

    if (order.status !== ORDER_STATUS.PENDING_LENDER_APPROVAL) {
      return res.status(400).json({
        success: false,
        message: `Order cannot be rejected. Current status: ${order.status}`
      });
    }

    order.status = ORDER_STATUS.LENDER_REJECTED;
    order.lender_approval_status = 'REJECTED';
    order.lender_approval_date = new Date();
    order.lender_rejection_reason = rejection_reason || null;
    await order.save();

    await Notification.updateMany(
      { order_id: order._id, user_id: lenderId, type: 'FUNDING_REQUEST' },
      { read: true }
    );

    res.status(200).json({
      success: true,
      message: 'Funding request rejected',
      order: {
        id: order._id,
        order_id: order.order_id,
        status: order.status,
        lender_approval_status: order.lender_approval_status,
        lender_rejection_reason: order.lender_rejection_reason
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error rejecting funding',
      error: error.message
    });
  }
};

// @desc    Get milestones pending lender approval (2nd milestone onwards)
// @route   GET /api/lenders/pending-milestones
// @access  Private (LENDER only)
exports.getPendingMilestones = async (req, res) => {
  try {
    const lenderId = req.user.id;

    // Get all milestones where:
    // 1. Status is PENDING (not yet started)
    // 2. Order's lender_id matches current lender
    // 3. Milestone.order > 1 (not the first milestone - that's already approved)
    const milestones = await Milestone.find({
      status: MILESTONE_STATUS.PENDING
    })
      .populate({
        path: 'order_id',
        select: 'order_id lender_id created_by value delivery_date status',
        match: { lender_id: lenderId },
        populate: { path: 'created_by', select: 'name email' }
      });

    // Filter out milestones where order didn't match
    const filteredMilestones = milestones.filter(m => m.order_id !== null && m.order > 1);

    // Map to response format
    const pendingMilestones = filteredMilestones.map(m => ({
      id: m._id,
      name: m.name,
      order_id: m.order_id.order_id,
      milestone_number: m.order,
      amount: m.amount,
      percentage: m.percentage,
      timeline_days: m.timeline_days,
      supplier_name: m.order_id.created_by.name,
      proof_verification_status: m.proof_verification_status || 'NOT_UPLOADED'
    }));

    res.status(200).json({
      success: true,
      count: pendingMilestones.length,
      milestones: pendingMilestones
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching pending milestones',
      error: error.message
    });
  }
};
