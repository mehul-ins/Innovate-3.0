const mongoose = require('mongoose');
const { TRANSACTION_TYPE } = require('../config/constants');

/**
 * Transaction Schema Definition
 * 
 * Mock Escrow Ledger System
 * 
 * This tracks all fund movements without real payments:
 * - LOCK transactions: Funds reserved in escrow when order approved
 * - RELEASE transactions: Funds released when milestones completed
 * 
 * The ledger provides:
 * 1. Complete audit trail of all fund movements
 * 2. Real-time escrow balance calculation
 * 3. Transparency for all parties (supplier, admin, lender)
 * 4. No actual payments - purely tracking mechanism
 * 
 * Example Flow:
 * 1. Order for $100k approved
 *    - LOCK transaction: +$100k to escrow
 * 2. First milestone (40%) completed
 *    - RELEASE transaction: -$40k from escrow
 *    - Escrow balance: $60k remaining
 * 3. All milestones completed
 *    - 3x RELEASE transactions total $100k
 *    - Escrow balance: $0
 */
const transactionSchema = new mongoose.Schema(
  {
    order_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: [true, 'Order ID is required'],
      index: true
    },
    milestone_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Milestone',
      default: null,
      index: true,
      description: 'Only set for RELEASE transactions. LOCK transactions have no milestone.'
    },
    type: {
      type: String,
      enum: Object.values(TRANSACTION_TYPE),
      required: [true, 'Transaction type is required']
    },
    amount: {
      type: Number,
      required: [true, 'Transaction amount is required'],
      min: [0, 'Amount must be positive']
    },
    description: {
      type: String,
      description: 'Human-readable transaction description'
    },
    recipient_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      description: 'Recipient of RELEASE transaction. First milestone goes to lender, subsequent to supplier'
    },
    recipient_type: {
      type: String,
      enum: ['LENDER', 'SUPPLIER', null],
      default: null,
      description: 'Type of recipient for RELEASE transactions'
    },
    status: {
      type: String,
      enum: ['RECORDED', 'PROCESSED'],
      default: 'RECORDED',
      description: 'RECORDED = in mock ledger, PROCESSED = would be in real system'
    }
  },
  {
    timestamps: true
  }
);

// Compound index for faster ledger queries
transactionSchema.index({ order_id: 1, type: 1 });
transactionSchema.index({ order_id: 1, createdAt: -1 });

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;
