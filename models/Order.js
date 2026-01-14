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
    // Track which milestone's funds are currently available (stepwise fund release)
    // 0 = no funds released yet, 1 = milestone 1 funds available, 2 = milestone 2 funds available, etc.
    current_unlocked_milestone: {
      type: Number,
      default: 0
    },
    // Lender approval tracking
    lender_approval_status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING'
    },
    lender_approval_date: {
      type: Date,
      default: null
    },
    lender_rejection_reason: {
      type: String,
      default: null,
      trim: true
    },
    // Reference to the supplier who created the order
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    // Reference to the lender selected for funding
    lender_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Lender selection is required'],
      index: true
    },
    // Supplier-defined milestone breakdown (dynamic milestones)
    // Structure: [{ name: string, percentage: number, amount: number, status: string, description: string, proof: {...}, ... }, ...]
    // Percentages are validated against platform rules
    milestones: [
      {
        name: {
          type: String,
          required: [true, 'Milestone name is required']
        },
        percentage: {
          type: Number,
          required: [true, 'Milestone percentage is required'],
          min: [0, 'Percentage must be positive'],
          max: [100, 'Percentage cannot exceed 100']
        },
        // Calculated amount based on order value and percentage
        amount: {
          type: Number,
          default: 0,
          min: [0, 'Amount must be positive']
        },
        // Milestone status: LOCKED (awaiting previous), PENDING (ready for work), COMPLETED (approved)
        status: {
          type: String,
          enum: ['LOCKED', 'PENDING', 'COMPLETED', 'FROZEN', 'PAUSED'],
          default: 'PENDING'
        },
        // Amount released/transferred when milestone completed
        released_amount: {
          type: Number,
          default: 0,
          min: [0, 'Released amount must be positive']
        },
        description: {
          type: String,
          default: ''
        },
        // Proof of completion uploaded by supplier
        proof: {
          filename: String,
          originalname: String,
          mimetype: String,
          size: Number,
          path: String,
          uploadedAt: Date,
          uploadedBy: mongoose.Schema.Types.ObjectId,
          status: {
            type: String,
            enum: ['PENDING_REVIEW', 'APPROVED', 'REJECTED'],
            default: 'PENDING_REVIEW'
          },
          approvedAt: Date,
          approvedBy: mongoose.Schema.Types.ObjectId,
          approvalNotes: String,
          rejectedAt: Date,
          rejectedBy: mongoose.Schema.Types.ObjectId,
          rejectionReason: String
        },
        _id: false // Disable automatic ID for sub-documents
      }
    ]
  },
  {
    timestamps: true // Adds createdAt and updatedAt fields
  }
);

// Index for faster queries
orderSchema.index({ status: 1 });
orderSchema.index({ created_by: 1 });
orderSchema.index({ lender_id: 1 });

const Order = mongoose.model('Order', orderSchema);

/**
 * Validation helper for milestone breakdown
 * Enforces strict platform-controlled risk limits
 */
Order.validateMilestones = function(milestones) {
  // Check if milestones array exists and has at least one milestone
  if (!milestones || !Array.isArray(milestones) || milestones.length === 0) {
    return {
      isValid: false,
      error: 'Milestone breakdown is required. Must provide at least one milestone.'
    };
  }

  let totalPercentage = 0;
  let hasRawMaterial = false;

  for (const milestone of milestones) {
    // Validate milestone name exists
    if (!milestone.name || typeof milestone.name !== 'string' || milestone.name.trim() === '') {
      return {
        isValid: false,
        error: 'Each milestone must have a non-empty name.'
      };
    }

    // Validate percentage is a number
    if (typeof milestone.percentage !== 'number' || milestone.percentage <= 0) {
      return {
        isValid: false,
        error: `Milestone "${milestone.name}" has invalid percentage. Must be a positive number.`
      };
    }

    totalPercentage += milestone.percentage;

    // Check for Raw Material milestone and enforce 40% cap
    if (milestone.name.toLowerCase().includes('raw material')) {
      hasRawMaterial = true;
      if (milestone.percentage > 40) {
        return {
          isValid: false,
          error: 'Raw material milestone cannot exceed 40%. System enforces strict risk controls.'
        };
      }
    }
  }

  // Validate total percentage does not exceed 100%
  if (totalPercentage > 100) {
    return {
      isValid: false,
      error: `Total milestone percentage cannot exceed 100%. Current total: ${totalPercentage}%`
    };
  }

  return {
    isValid: true,
    totalPercentage: totalPercentage,
    error: null
  };
};

module.exports = Order;
