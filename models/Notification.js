const mongoose = require('mongoose');

/**
 * Notification Schema Definition
 * 
 * Tracks notifications for users (primarily lenders) about order funding requests.
 * 
 * Notification Types:
 * - NEW_ORDER_REQUEST: Supplier creates new order (notify lender)
 * - MILESTONE_APPROVED: Lender/admin approves milestone (notify supplier)
 * - NEXT_MILESTONE_UNLOCKED: Next milestone available (notify supplier)
 * - PROOF_SUBMITTED: Supplier submits proof (notify lender/admin)
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
      required: false,
      index: true
    },
    milestone_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Milestone',
      required: false,
      index: true
    },
    type: {
      type: String,
      enum: [
        'NEW_ORDER_REQUEST',
        'MILESTONE_APPROVED',
        'NEXT_MILESTONE_UNLOCKED',
        'PROOF_SUBMITTED'
      ],
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
