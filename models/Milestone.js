const mongoose = require('mongoose');
const { MILESTONE_STATUS } = require('../config/constants');

/**
 * Milestone Schema Definition
 * 
 * Represents a payment milestone within an order.
 * 
 * Milestone Locking Logic:
 * When an order is approved, milestones are auto-generated:
 * 1. First milestone (Raw Material - 40%) → PENDING (payment can start)
 * 2. Second milestone (Production - 40%) → LOCKED (waiting for first to complete)
 * 3. Third milestone (Delivery - 20%) → LOCKED (waiting for previous to complete)
 * 
 * This locking mechanism ensures:
 * - Funds are not released prematurely
 * - Supplier completes work in stages
 * - Lender has visibility into completion progress
 * - Funds flow tied to actual delivery milestones
 */
const milestoneSchema = new mongoose.Schema(
  {
    order_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: [true, 'Order ID is required'],
      index: true
    },
    name: {
      type: String,
      required: [true, 'Milestone name is required'],
      enum: ['Raw Material', 'Production', 'Delivery']
    },
    amount: {
      type: Number,
      required: [true, 'Milestone amount is required'],
      min: [0, 'Amount must be positive']
    },
    percentage: {
      type: Number,
      required: [true, 'Percentage is required'],
      min: [0, 'Percentage must be between 0-100'],
      max: [100, 'Percentage must be between 0-100']
    },
    status: {
      type: String,
      enum: Object.values(MILESTONE_STATUS),
      default: MILESTONE_STATUS.LOCKED,
      required: true
    },
    proof: {
      type: String,
      default: null,
      description: 'URL or reference to completion proof (invoice, delivery note, etc.)'
    },
    released_amount: {
      type: Number,
      default: 0,
      min: [0, 'Released amount must be positive']
    },
    order: {
      type: Number,
      required: true,
      description: 'Sequence order of milestone (1, 2, 3)'
    },
    // Lender-defined timeline for milestone completion
    due_date: {
      type: Date,
      default: null,
      description: 'Lender-defined deadline for milestone completion'
    },
    timeline_days: {
      type: Number,
      default: null,
      min: [1, 'Timeline must be at least 1 day'],
      description: 'Number of days from order approval to milestone due date'
    }
  },
  {
    timestamps: true
  }
);

// Compound index for faster queries
milestoneSchema.index({ order_id: 1, order: 1 });

const Milestone = mongoose.model('Milestone', milestoneSchema);

module.exports = Milestone;
