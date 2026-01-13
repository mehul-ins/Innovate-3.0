// User Role Constants
const ROLES = {
  ADMIN: 'ADMIN',
  SUPPLIER: 'SUPPLIER',
  LENDER: 'LENDER'
};

/**
 * Order Status Constants
 * 
 * Order Lifecycle:
 * 1. PENDING_VERIFICATION - Initial state when supplier creates order
 * 2. APPROVED - Admin approves the order (not implemented in Phase 1)
 * 3. COMPLETED - Order is fulfilled and funds released (future phase)
 * 4. CLOSED - Order is closed/cancelled (future phase)
 */
const ORDER_STATUS = {
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  APPROVED: 'APPROVED',
  COMPLETED: 'COMPLETED',
  CLOSED: 'CLOSED'
};

/**
 * Milestone Status Constants
 * 
 * Milestone Lifecycle:
 * 1. LOCKED - Funds for this milestone are reserved but cannot be released yet
 *    - Used to prevent early cash withdrawal
 *    - First milestone starts as PENDING (payment can begin)
 *    - Subsequent milestones locked until previous one completes
 * 2. PENDING - Milestone is ready for completion
 *    - Supplier can submit proof of completion
 *    - Funds can be released upon approval
 * 3. COMPLETED - Milestone completed and funds released
 *    - Supplier received payment
 *    - Next milestone becomes PENDING
 */
const MILESTONE_STATUS = {
  LOCKED: 'LOCKED',
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED'
};

/**
 * Milestone Types & Percentages
 * Must sum to 100%
 */
const MILESTONE_TYPES = [
  {
    name: 'Raw Material',
    percentage: 40
  },
  {
    name: 'Production',
    percentage: 40
  },
  {
    name: 'Delivery',
    percentage: 20
  }
];

module.exports = {
  ROLES,
  ORDER_STATUS,
  MILESTONE_STATUS,
  MILESTONE_TYPES
};
