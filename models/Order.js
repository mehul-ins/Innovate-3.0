const mongoose = require('mongoose');
const { ORDER_STATUS } = require('../config/constants');

/**
 * Order Schema Definition
 * 
 * Represents a supply chain order in the system.
 * 
 * Order Lifecycle:
 * 1. Supplier creates order → PENDING_VERIFICATION
 * 2. Admin verifies order → APPROVED (Phase 2)
 * 3. Lender locks funds → funds_locked = true (Phase 2)
 * 4. Order fulfilled → COMPLETED (Phase 3)
 * 5. Order closed → CLOSED (Phase 3)
 */
const orderSchema = new mongoose.Schema(
  {
    order_id: {
      type: String,
      required: [true, 'Order ID is required'],
      unique: true,
      trim: true
    },
    buyer_name: {
      type: String,
      required: [true, 'Buyer name is required'],
      trim: true
    },
    value: {
      type: Number,
      required: [true, 'Order value is required'],
      min: [0, 'Order value must be positive']
    },
    delivery_date: {
      type: Date,
      required: [true, 'Delivery date is required']
    },
    status: {
      type: String,
      enum: Object.values(ORDER_STATUS),
      default: ORDER_STATUS.PENDING_VERIFICATION,
      required: true
    },
    funds_locked: {
      type: Boolean,
      default: false
    },
    // Reference to the supplier who created the order
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  {
    timestamps: true // Adds createdAt and updatedAt fields
  }
);

// Index for faster queries
orderSchema.index({ status: 1 });
orderSchema.index({ created_by: 1 });

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
