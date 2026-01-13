const express = require('express');
const router = express.Router();
const { register, login, getMe } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

/**
 * Authentication Routes
 * POST /api/auth/register - Register new user
 * POST /api/auth/login - Login user
 * GET /api/auth/me - Get current user (protected)
 */

router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, getMe);

module.exports = router;
