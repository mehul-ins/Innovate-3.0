const Order = require('../models/Order');
const Milestone = require('../models/Milestone');
const Transaction = require('../models/Transaction');
const { MILESTONE_STATUS, MILESTONE_TYPES, ORDER_STATUS, TRANSACTION_TYPE } = require('../config/constants');

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
    const { order_id, buyer_name, value, delivery_date, milestones } = req.body;

    // Validate required fields
    if (!order_id || !buyer_name || !value || !delivery_date) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields: order_id, buyer_name, value, delivery_date'
      });
    }

    // Validate milestone breakdown is provided
    if (!milestones) {
      return res.status(400).json({
        success: false,
        message: 'Milestone breakdown is required. Must provide at least one milestone.'
      });
    }

    // Normalize value
    const numericValue = Number(value);
    if (Number.isNaN(numericValue) || numericValue <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Order value must be a positive number'
      });
    }

    // Validate milestone structure based on amounts and compute percentages
    let totalAmount = 0;
    const processedMilestones = [];

    for (const m of milestones) {
      if (!m.name || typeof m.name !== 'string' || m.name.trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'Each milestone must have a non-empty name.',
          field: 'milestones'
        });
      }

      const amount = Number(m.amount);
      if (Number.isNaN(amount) || amount <= 0) {
        return res.status(400).json({
          success: false,
          message: `Milestone "${m.name}" has invalid amount. Must be a positive number.`,
          field: 'milestones'
        });
      }

      totalAmount += amount;
      const percentage = Number(((amount / numericValue) * 100).toFixed(2));

      processedMilestones.push({
        name: m.name,
        amount,
        percentage
      });
    }

    // Ensure minimum number of milestones (at least 3)
    if (processedMilestones.length < 3) {
      return res.status(400).json({
        success: false,
        message: 'At least three milestones are required.',
        field: 'milestones'
      });
    }

    // Ensure first milestone does not exceed 40% of order value
    const firstMilestone = processedMilestones[0];
    const firstMilestoneMax = numericValue * 0.4;
    if (firstMilestone.amount > firstMilestoneMax) {
      return res.status(400).json({
        success: false,
        message: `The first milestone amount (${firstMilestone.amount}) cannot exceed 40% of the order value (${firstMilestoneMax}).`,
        field: 'milestones'
      });
    }

    // Ensure total milestone amount matches order value
    if (totalAmount !== numericValue) {
      return res.status(400).json({
        success: false,
        message: `Sum of milestone amounts (${totalAmount}) must equal order value (${numericValue}).`,
        field: 'milestones'
      });
    }

    // Validate derived percentages (raw material cap, total must be 100%, etc.)
    const milestonesValidation = Order.validateMilestones(processedMilestones);
    if (!milestonesValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: milestonesValidation.error,
        field: 'milestones'
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
      value: numericValue,
      delivery_date: deliveryDate,
      milestones: processedMilestones,
      created_by: req.user.id, // Set from authenticated user
      status: ORDER_STATUS.PENDING_VERIFICATION,
      funds_locked: false
    });

    res.status(201).json({
      success: true,
      message: 'Order created successfully. Status: PENDING_VERIFICATION. Awaiting admin approval.',
      order: {
        id: order._id,
        order_id: order.order_id,
        buyer_name: order.buyer_name,
        value: order.value,
        delivery_date: order.delivery_date,
        status: order.status,
        funds_locked: order.funds_locked,
        milestones: order.milestones.map(m => ({
          name: m.name,
          amount: m.amount,
          percentage: m.percentage
        })),
        total_milestone_percentage: milestonesValidation.totalPercentage,
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

    // Phase 7: Prevent actions on CLOSED orders
    if (order.status === ORDER_STATUS.CLOSED) {
      return res.status(400).json({
        success: false,
        message: 'Cannot approve order. Order is CLOSED. No further actions allowed.',
        current_status: order.status
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

    // Create LOCK transaction in mock escrow ledger
    // This records that the full order value is now reserved in escrow
    // Mock Escrow: Funds are held by system, not released until milestones completed
    await Transaction.create({
      order_id: order._id,
      milestone_id: null, // LOCK transactions don't associate with a specific milestone
      type: TRANSACTION_TYPE.LOCK,
      amount: order.value,
      description: `Order ${order.order_id} approved. Funds locked in escrow. Total: $${order.value}`,
      status: 'RECORDED'
    });

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

/**
 * @desc    Repay order and close
 * @route   PATCH /api/orders/:id/repay
 * @access  Private (ADMIN only)
 * 
 * Phase 7: Order Closure Logic
 * 
 * Repayment Flow:
 * 1. All milestones must be COMPLETED (order status = COMPLETED)
 * 2. Admin marks loan as REPAID
 * 3. Order status changes to CLOSED
 * 4. Once CLOSED, no further actions allowed on this order
 * 
 * Mock Repayment:
 * - Simulates loan repayment without real financial transactions
 * - Verifies all milestones completed before closure
 * - Prevents premature closure if deliverables not fulfilled
 * 
 * Validations:
 * - Order must be in COMPLETED status (all milestones done)
 * - Cannot repay orders that are not completed
 * - Cannot re-close already closed orders
 * - Immutable once CLOSED
 */
exports.repayOrder = async (req, res) => {
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

    // Check if order is already CLOSED
    if (order.status === ORDER_STATUS.CLOSED) {
      return res.status(400).json({
        success: false,
        message: 'Order is already closed. No further actions allowed.',
        current_status: order.status
      });
    }

    // Check if order is COMPLETED (all milestones done)
    if (order.status !== ORDER_STATUS.COMPLETED) {
      return res.status(400).json({
        success: false,
        message: `Cannot close order. Order status must be COMPLETED (all milestones fulfilled). Current status: ${order.status}`,
        current_status: order.status,
        required_status: ORDER_STATUS.COMPLETED,
        hint: 'Complete all milestones before marking order as repaid.'
      });
    }

    // Verify all milestones are COMPLETED
    const milestones = await Milestone.find({ order_id: order._id });
    const incompleteMilestones = milestones.filter(m => m.status !== MILESTONE_STATUS.COMPLETED);
    
    if (incompleteMilestones.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot close order. Some milestones are not completed.',
        incomplete_milestones: incompleteMilestones.map(m => ({
          name: m.name,
          status: m.status
        }))
      });
    }

    // Mark order as CLOSED (loan repaid)
    // Phase 7: Once CLOSED, order is immutable and archived
    // No further milestone completions, approvals, or modifications allowed
    order.status = ORDER_STATUS.CLOSED;
    await order.save();

    // Get final escrow balance summary
    const transactions = await Transaction.find({ order_id: order._id });
    const totalLocked = transactions
      .filter(t => t.type === TRANSACTION_TYPE.LOCK)
      .reduce((sum, t) => sum + t.amount, 0);
    const totalReleased = transactions
      .filter(t => t.type === TRANSACTION_TYPE.RELEASE)
      .reduce((sum, t) => sum + t.amount, 0);

    res.status(200).json({
      success: true,
      message: 'Order closed successfully. Loan marked as REPAID. No further actions allowed.',
      order: {
        id: order._id,
        order_id: order.order_id,
        buyer_name: order.buyer_name,
        value: order.value,
        status: order.status,
        funds_locked: order.funds_locked,
        closed_at: new Date()
      },
      escrow_summary: {
        total_locked: totalLocked,
        total_released: totalReleased,
        final_balance: totalLocked - totalReleased,
        message: totalLocked === totalReleased 
          ? 'All funds properly accounted for and released.' 
          : `Warning: Escrow imbalance detected. Locked: $${totalLocked}, Released: $${totalReleased}`
      },
      milestones_summary: {
        total_milestones: milestones.length,
        completed: milestones.filter(m => m.status === MILESTONE_STATUS.COMPLETED).length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error closing order',
      error: error.message
    });
  }
};
