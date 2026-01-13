const Transaction = require('../models/Transaction');
const Order = require('../models/Order');

/**
 * Transaction Controller
 * 
 * Manages mock escrow ledger and fund tracking.
 * Provides visibility into all fund movements without real payments.
 */

// @desc    Get all transactions for an order (escrow ledger)
// @route   GET /api/transactions/order/:orderId
// @access  Private (Any authenticated user)
exports.getOrderTransactions = async (req, res) => {
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

    // Retrieve all transactions for the order
    const transactions = await Transaction.find({ order_id: orderId })
      .populate('milestone_id', 'name amount percentage status')
      .sort({ createdAt: 1 }); // Chronological order

    if (!transactions || transactions.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No transactions found for this order.',
        order_id: orderId,
        transactions: [],
        summary: {
          total_locked: 0,
          total_released: 0,
          escrow_balance: 0
        }
      });
    }

    // Calculate escrow ledger balance
    let lockedAmount = 0;
    let releasedAmount = 0;

    transactions.forEach(tx => {
      if (tx.type === 'LOCK') {
        lockedAmount += tx.amount;
      } else if (tx.type === 'RELEASE') {
        releasedAmount += tx.amount;
      }
    });

    const escrowBalance = lockedAmount - releasedAmount;

    res.status(200).json({
      success: true,
      order: {
        order_id: order.order_id,
        value: order.value,
        status: order.status,
        funds_locked: order.funds_locked
      },
      transactions: transactions.map(tx => ({
        id: tx._id,
        type: tx.type,
        amount: tx.amount,
        description: tx.description,
        milestone: tx.milestone_id ? {
          name: tx.milestone_id.name,
          amount: tx.milestone_id.amount
        } : null,
        status: tx.status,
        createdAt: tx.createdAt
      })),
      summary: {
        total_locked: lockedAmount,
        total_released: releasedAmount,
        escrow_balance: escrowBalance
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching transactions',
      error: error.message
    });
  }
};
