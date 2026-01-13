const mongoose = require('mongoose');

/**
 * Notification Schema Definition
 * 
 * Tracks notifications for users (primarily lenders) about order funding requests.
 * 
 * Notification Types:
 * - FUNDING_REQUEST: Supplier requests funding from lender
 * - ORDER_APPROVED: Order approved by admin (future)
 * - MILESTONE_COMPLETED: Milestone completed (future)
 */
const notificationSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true
    },
    order_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: [true, 'Order ID is required'],
      index: true
    },
    type: {
      type: String,
      enum: ['FUNDING_REQUEST', 'ORDER_APPROVED', 'MILESTONE_COMPLETED'],
      default: 'FUNDING_REQUEST',
      required: true
    },
    message: {
      type: String,
      required: [true, 'Notification message is required']
    },
    read: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true // Adds createdAt and updatedAt fields
  }
);

// Compound index for faster queries
notificationSchema.index({ user_id: 1, read: 1 });
notificationSchema.index({ order_id: 1 });

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
