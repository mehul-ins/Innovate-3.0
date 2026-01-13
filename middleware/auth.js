const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { ROLES } = require('../config/constants');

/**
 * Authentication Middleware
 * 
 * Flow:
 * 1. Client sends request with JWT token in Authorization header
 * 2. Middleware extracts and verifies the token
 * 3. If valid, user info is attached to req.user
 * 4. Request proceeds to next middleware/controller
 */

// Protect routes - verify JWT token
exports.protect = async (req, res, next) => {
  try {
    let token;

    // Check if authorization header exists and starts with 'Bearer'
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      // Extract token from "Bearer <token>"
      token = req.headers.authorization.split(' ')[1];
    }

    // Check if token exists
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route. No token provided.'
      });
    }

    try {
      // Verify token and decode payload
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Attach user to request object (exclude password)
      req.user = await User.findById(decoded.id).select('-password');

      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'User not found'
        });
      }

      next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized. Invalid token.'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error in authentication',
      error: error.message
    });
  }
};

/**
 * Role-Based Access Control Middleware
 * 
 * Usage: authorize(ROLES.ADMIN, ROLES.SUPPLIER)
 * 
 * Flow:
 * 1. Receives allowed roles as parameters
 * 2. Checks if logged-in user's role matches any allowed role
 * 3. If yes, proceeds to next middleware/controller
 * 4. If no, returns 403 Forbidden
 */
exports.authorize = (...roles) => {
  return (req, res, next) => {
    // Check if user's role is in the allowed roles array
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role '${req.user.role}' is not authorized to access this route`
      });
    }
    next();
  };
};

// Convenience middleware for specific roles
exports.adminOnly = exports.authorize(ROLES.ADMIN);
exports.supplierOnly = exports.authorize(ROLES.SUPPLIER);
exports.lenderOnly = exports.authorize(ROLES.LENDER);
exports.adminOrSupplier = exports.authorize(ROLES.ADMIN, ROLES.SUPPLIER);
exports.adminOrLender = exports.authorize(ROLES.ADMIN, ROLES.LENDER);
