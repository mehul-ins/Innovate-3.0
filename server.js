// Start notification cron job
require('./cron/notificationCron');
require('dotenv').config();
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { protect, supplierOnly, lenderOnly, adminOnly } = require('./middleware/auth');

/**
 * Express Server Setup
 * Main entry point for the Hackathon Backend API
 */

const app = express();

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // Parse JSON request bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Serve static assets (CSS, client JS, images)
app.use(express.static(path.join(__dirname, 'public')));

// Serve uploaded proof files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/orders', require('./routes/order'));
app.use('/api/milestones', require('./routes/milestone'));
app.use('/api/proofs', require('./routes/proof'));
app.use('/api/transactions', require('./routes/transaction'));
app.use('/api/lenders', require('./routes/lender'));
app.use('/api/notifications', require('./routes/notification'));
app.use('/api/admin/milestones', require('./routes/adminMilestone'));
app.use('/api/admin/fix', require('./routes/adminFix'));

// Server-rendered views
app.get('/', (req, res) => {
  res.render('layout', {
    title: 'Supply Chain Financing - Login',
    view: 'login',
    user: null
  });
});

// Supplier dashboard
app.get('/supplier/dashboard', (req, res) => {
  res.render('layout', {
    title: 'Supplier Dashboard',
    view: 'dashboard',
    role: 'SUPPLIER',
    user: null
  });
});

// Lender dashboard
app.get('/lender/dashboard', (req, res) => {
  res.render('layout', {
    title: 'Lender Dashboard',
    view: 'dashboard',
    role: 'LENDER',
    user: null
  });
});

// Admin dashboard
app.get('/admin/dashboard', (req, res) => {
  res.render('layout', {
    title: 'Admin Dashboard',
    view: 'dashboard',
    role: 'ADMIN',
    user: null
  });
});

// Signup page
app.get('/signup', (req, res) => {
  res.render('layout', {
    title: 'Sign Up - Supply Chain Financing',
    view: 'signup',
    role: null,
    user: null
  });
});

// Test route
app.get('/api', (req, res) => {
  res.json({
    message: 'Hackathon Backend API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      orders: '/api/orders',
      milestones: '/api/milestones',
      transactions: '/api/transactions'
    }
  });
});

// MongoDB Connection
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✓ Connected to MongoDB');
  })
  .catch((error) => {
    console.error('✗ MongoDB connection error:', error.message);
    process.exit(1);
  });

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✓ Server running on port ${PORT}`);
  console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('✗ Unhandled Rejection:', err.message);
  process.exit(1);
});
