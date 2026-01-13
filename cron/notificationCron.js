// cron/notificationCron.js
// Cron job to process and update notifications

const cron = require('node-cron');
const Notification = require('../models/Notification');
const User = require('../models/User');
const Order = require('../models/Order');
const Milestone = require('../models/Milestone');

// This cron job runs every minute to process notifications (demo: can be 5 min in prod)
cron.schedule('* * * * *', async () => {
  try {
    // Example: Mark all unread notifications older than 1 min as ready (simulate processing)
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    // You can add more complex logic here if needed
    await Notification.updateMany(
      { read: false, createdAt: { $lte: oneMinuteAgo } },
      { $set: { /* can add fields if needed for UI, e.g., ready: true */ } }
    );
    // Optionally, log for debugging
    // console.log('Notification cron ran at', now.toISOString());
  } catch (err) {
    console.error('Notification cron error:', err.message);
  }
});

module.exports = cron;
