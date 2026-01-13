const Order = require('../models/Order');
const Milestone = require('../models/Milestone');
const { MILESTONE_STATUS, MILESTONE_TYPES } = require('../config/constants');
const { ORDER_STATUS } = require('../config/constants');

/**
 * Order Controller
 * 
 * Handles order creation and retrieval.
 * 
 * Phase 1 Restrictions:
 * - Only SUPPLIER can create orders
 * - Only ADMIN can view all orders
 * - Order approval is NOT implemented yet (Phase 2)
 */

// @desc    Create new order
// @route   POST /api/orders
// @access  Private (SUPPLIER only)
exports.createOrder = async (req, res) => {
  try {
    const { order_id, buyer_name, value, delivery_date } = req.body;

    // Validate required fields
    if (!order_id || !buyer_name || !value || !delivery_date) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields: order_id, buyer_name, value, delivery_date'
      });
    }

    // Check if order_id already exists
    const existingOrder = await Order.findOne({ order_id });
    if (existingOrder) {
      return res.status(400).json({
        success: false,
        message: 'Order with this order_id already exists'
      });
    }

    // Validate delivery date is in the future
    const deliveryDate = new Date(delivery_date);
    if (deliveryDate < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Delivery date must be in the future'
      });
    }

    // Create order with PENDING_VERIFICATION status
    // Note: status defaults to PENDING_VERIFICATION in the model
    const order = await Order.create({
      order_id,
      buyer_name,
      value,
      delivery_date: deliveryDate,
      created_by: req.user.id, // Set from authenticated user
      status: ORDER_STATUS.PENDING_VERIFICATION,
      funds_locked: false
    });

    res.status(201).json({
      success: true,
      message: 'Order created successfully. Status: PENDING_VERIFICATION',
      order: {
        id: order._id,
        order_id: order.order_id,
        buyer_name: order.buyer_name,
        value: order.value,
        delivery_date: order.delivery_date,
        status: order.status,
        funds_locked: order.funds_locked,
        created_by: order.created_by,
        createdAt: order.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating order',
      error: error.message
    });
  }
};

// @desc    Get all orders
// @route   GET /api/orders
// @access  Private (ADMIN only)
exports.getAllOrders = async (req, res) => {
  try {
    // Retrieve all orders and populate supplier information
    const orders = await Order.find()
      .populate('created_by', 'name email role')
      .sort({ createdAt: -1 }); // Most recent first

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
        funds_locked: order.funds_locked,
        created_by: order.created_by,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching orders',
      error: error.message
    });
  }
};

/**
 * @desc    Approve order
 * @route   PATCH /api/orders/:id/approve
 * @access  Private (ADMIN only)
 * 
 * Approval Flow:
 * 1. Admin reviews order (status = PENDING_VERIFICATION)
 * 2. Admin approves → status changes to APPROVED
 * 3. Funds are locked (funds_locked = true)
 * 4. Locked funds prevent cancellation or modification (future phases)
 * 5. Lender can now process the financing
 * 
 * Validations:
 * - Only PENDING_VERIFICATION orders can be approved
 * - Prevent re-approval of already approved orders
 * - Reject invalid order states
 */
exports.approveOrder = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate order ID format
    if (!id || id.length !== 24) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID'
      });
    }

    // Find order
    const order = await Order.findById(id).populate('created_by', 'name email');
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if order is in PENDING_VERIFICATION state
    if (order.status !== ORDER_STATUS.PENDING_VERIFICATION) {
      return res.status(400).json({
        success: false,
        message: `Cannot approve order. Current status: ${order.status}. Only PENDING_VERIFICATION orders can be approved.`,
        currentStatus: order.status,
        allowedStatus: ORDER_STATUS.PENDING_VERIFICATION
      });
    }

    // Update order status to APPROVED and lock funds
    // Funds locked means:
    // - Supplier cannot cancel the order
    // - Supplier cannot modify the order
    // - Lender can now lock these funds for financing
    // - Once locked, funds are reserved until order completion or closure
    order.status = ORDER_STATUS.APPROVED;
    order.funds_locked = true;
    await order.save();

    // Auto-generate milestones when order is approved
    // This ensures transparent payment flow tied to deliverables
    const milestones = [];
    MILESTONE_TYPES.forEach((milestone, index) => {
      const amount = (order.value * milestone.percentage) / 100;
      milestones.push({
        order_id: order._id,
        name: milestone.name,
        amount: amount,
        percentage: milestone.percentage,
        // First milestone is PENDING (payment can start immediately)
        // Subsequent milestones are LOCKED (waiting for previous to complete)
        status: index === 0 ? MILESTONE_STATUS.PENDING : MILESTONE_STATUS.LOCKED,
        order: index + 1
      });
    });

    // Insert all milestones
    await Milestone.insertMany(milestones);

    res.status(200).json({
      success: true,
      message: 'Order approved successfully. Funds locked for financing. Milestones generated.',
      order: {
        id: order._id,
        order_id: order.order_id,
        buyer_name: order.buyer_name,
        value: order.value,
        delivery_date: order.delivery_date,
        status: order.status,
        funds_locked: order.funds_locked,
        approved_at: new Date(),
        created_by: order.created_by,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt
      },
      milestones: milestones.map(m => ({
        name: m.name,
        amount: m.amount,
        percentage: m.percentage,
        status: m.status
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error approving order',
      error: error.message
    });
  }
};
