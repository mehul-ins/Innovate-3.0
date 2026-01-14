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
  PENDING_LENDER_APPROVAL: 'PENDING_LENDER_APPROVAL',
  LENDER_APPROVED: 'LENDER_APPROVED',
  LENDER_REJECTED: 'LENDER_REJECTED',
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
 * 4. PAUSED - Admin has paused this milestone
 *    - No actions allowed until resumed
 * 5. FROZEN - Admin has frozen all activities (suspicious activity detected)
 *    - Requires admin intervention to unfreeze
 */
const MILESTONE_STATUS = {
  LOCKED: 'LOCKED',
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  PAUSED: 'PAUSED',
  FROZEN: 'FROZEN'
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

/**
 * Transaction Types
 * 
 * Mock Escrow Ledger Tracking:
 * Every fund movement is recorded as a transaction for audit trail.
 * 
 * LOCK: Funds placed in escrow (held, not released)
 *   - Created when order is approved
 *   - Amount: Full order value
 *   - Purpose: Reserve funds with lender/bank
 *   - Effect: Funds available but not released until milestone completion
 * 
 * RELEASE: Funds released from escrow to supplier
 *   - Created when milestone is completed
 *   - Amount: Milestone amount
 *   - Purpose: Pay supplier for completed work
 *   - Effect: Funds transferred from escrow to supplier account
 * 
 * Ledger ensures full visibility into fund flow without real payments.
 */
const TRANSACTION_TYPE = {
  LOCK: 'LOCK',
  RELEASE: 'RELEASE'
};

/**
 * Production Milestone Operational Release Control
 * 
 * Exposure Control Mechanism:
 * For the Production milestone, not all funds are released immediately upon completion.
 * This is a risk management strategy to limit financial exposure.
 * 
 * Scenario:
 * - Production Milestone allocated: $40,000 (40% of $100k order)
 * - Operational cap: 75% of milestone amount = $30,000
 * - Holdback: 25% = $10,000
 * 
 * Why this matters:
 * 1. Risk Management: Hold back funds until full delivery to ensure performance
 * 2. Quality Control: Supplier has incentive to complete delivery before receiving final payment
 * 3. Working Capital: Supplier gets $30k for production operations
 * 4. Safety Buffer: $10k held until delivery completion ensures supplier commitment
 * 
 * One-time Release:
 * - Production milestone can only release operational amount ONCE
 * - Prevents double-counting or multiple releases
 * - Remaining holdback released only when final delivery milestone completes
 */
const PRODUCTION_OPERATIONAL_CAP = 0.75; // 75% of production milestone amount can be released

module.exports = {
  ROLES,
  ORDER_STATUS,
  MILESTONE_STATUS,
  MILESTONE_TYPES,
  TRANSACTION_TYPE,
  PRODUCTION_OPERATIONAL_CAP
};
