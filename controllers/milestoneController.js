const Milestone = require('../models/Milestone');
const Order = require('../models/Order');

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
