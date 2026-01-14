const Order = require('../models/Order');
const Milestone = require('../models/Milestone');
const { MILESTONE_STATUS } = require('../config/constants');

/**
 * Admin Fix Controller
 * Utility endpoints to fix data issues
 */

/**
 * @desc    Recreate milestones for orders that are approved but have no milestones
 * @route   POST /api/admin/fix/recreate-milestones/:orderId
 * @access  Private (ADMIN only)
 */
exports.recreateMilestones = async (req, res) => {
  try {
    const { orderId } = req.params;

    // Find the order
    const order = await Order.findById(orderId);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if order is approved
    if (order.status !== 'LENDER_APPROVED') {
      return res.status(400).json({
        success: false,
        message: `Order status is ${order.status}. Can only recreate milestones for LENDER_APPROVED orders.`
      });
    }

    // Check if milestones already exist
    const existingMilestones = await Milestone.find({ order_id: order._id });
    if (existingMilestones.length > 0) {
      return res.status(200).json({
        success: true,
        message: 'Milestones already exist for this order',
        milestones_count: existingMilestones.length
      });
    }

    // Check if order has milestone breakdown
    if (!order.milestones || order.milestones.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Order has no milestone breakdown defined. Cannot create milestones.'
      });
    }

    // Create milestones based on order's milestone breakdown
    const milestonesToCreate = [];
    const approvalDate = new Date();

    for (let i = 0; i < order.milestones.length; i++) {
      const orderMilestone = order.milestones[i];
      const amount = (order.value * orderMilestone.percentage) / 100;
      
      // First milestone is PENDING, rest are LOCKED
      const status = i === 0 ? MILESTONE_STATUS.PENDING : MILESTONE_STATUS.LOCKED;

      milestonesToCreate.push({
        order_id: order._id,
        name: orderMilestone.name,
        amount: amount,
        percentage: orderMilestone.percentage,
        order: i + 1, // Sequential order: 1, 2, 3
        status: status,
        createdAt: approvalDate,
        updatedAt: approvalDate
      });
    }

    // Insert milestones into database
    const createdMilestones = await Milestone.insertMany(milestonesToCreate);

    console.log(`[recreateMilestones] Created ${createdMilestones.length} milestones for order ${order.order_id}`);

    res.status(200).json({
      success: true,
      message: `Successfully created ${createdMilestones.length} milestones for order ${order.order_id}`,
      order: {
        id: order._id,
        order_id: order.order_id,
        status: order.status,
        value: order.value
      },
      milestones: createdMilestones.map(m => ({
        id: m._id,
        name: m.name,
        amount: m.amount,
        percentage: m.percentage,
        status: m.status,
        order: m.order
      }))
    });
  } catch (error) {
    console.error('[recreateMilestones] ERROR:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error recreating milestones',
      error: error.message
    });
  }
};

/**
 * @desc    Fix all orders that are approved but have no milestones
 * @route   POST /api/admin/fix/recreate-all-milestones
 * @access  Private (ADMIN only)
 */
exports.recreateAllMilestones = async (req, res) => {
  try {
    // Find all LENDER_APPROVED orders
    const approvedOrders = await Order.find({ status: 'LENDER_APPROVED' });

    const results = {
      total_orders: approvedOrders.length,
      fixed: [],
      skipped: [],
      errors: []
    };

    for (const order of approvedOrders) {
      try {
        // Check if milestones exist
        const existingMilestones = await Milestone.find({ order_id: order._id });
        
        if (existingMilestones.length > 0) {
          results.skipped.push({
            order_id: order.order_id,
            reason: 'Milestones already exist',
            count: existingMilestones.length
          });
          continue;
        }

        // Check if order has milestone breakdown
        if (!order.milestones || order.milestones.length === 0) {
          results.skipped.push({
            order_id: order.order_id,
            reason: 'No milestone breakdown defined'
          });
          continue;
        }

        // Create milestones
        const milestonesToCreate = [];
        const approvalDate = new Date();

        for (let i = 0; i < order.milestones.length; i++) {
          const orderMilestone = order.milestones[i];
          const amount = (order.value * orderMilestone.percentage) / 100;
          const status = i === 0 ? MILESTONE_STATUS.PENDING : MILESTONE_STATUS.LOCKED;

          milestonesToCreate.push({
            order_id: order._id,
            name: orderMilestone.name,
            amount: amount,
            percentage: orderMilestone.percentage,
            order: i + 1,
            status: status,
            createdAt: approvalDate,
            updatedAt: approvalDate
          });
        }

        const createdMilestones = await Milestone.insertMany(milestonesToCreate);

        results.fixed.push({
          order_id: order.order_id,
          milestones_created: createdMilestones.length
        });

        console.log(`[recreateAllMilestones] Fixed order ${order.order_id}: created ${createdMilestones.length} milestones`);
      } catch (error) {
        results.errors.push({
          order_id: order.order_id,
          error: error.message
        });
        console.error(`[recreateAllMilestones] Error fixing order ${order.order_id}:`, error.message);
      }
    }

    res.status(200).json({
      success: true,
      message: `Processed ${results.total_orders} orders. Fixed ${results.fixed.length}, skipped ${results.skipped.length}, errors ${results.errors.length}`,
      results
    });
  } catch (error) {
    console.error('[recreateAllMilestones] ERROR:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error recreating milestones',
      error: error.message
    });
  }
};
