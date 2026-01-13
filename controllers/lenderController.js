const User = require('../models/User');
const Order = require('../models/Order');
const Notification = require('../models/Notification');
const { ROLES, ORDER_STATUS } = require('../config/constants');

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

    // Get orders that are PENDING_VERIFICATION and assigned to this lender
    const orders = await Order.find({
      lender_id: lenderId,
      status: ORDER_STATUS.PENDING_VERIFICATION
    })
      .populate('created_by', 'name email')
      .sort({ createdAt: -1 });

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
