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

module.exports = {
  ROLES,
  ORDER_STATUS
};
