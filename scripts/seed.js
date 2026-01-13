require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const { ROLES } = require('../config/constants');

/**
 * Seed Script
 * 
 * Creates initial users in the database:
 * - 1 Admin
 * - 1 Supplier
 * - 1 Lender
 * 
 * Run with: npm run seed
 */

const users = [
  {
    name: 'Admin User',
    email: 'admin@hackathon.com',
    password: 'admin123',
    role: ROLES.ADMIN
  },
  {
    name: 'Supplier User',
    email: 'supplier@hackathon.com',
    password: 'supplier123',
    role: ROLES.SUPPLIER
  },
  {
    name: 'Lender User',
    email: 'lender@hackathon.com',
    password: 'lender123',
    role: ROLES.LENDER
  }
];

const seedDatabase = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB');

    // Clear existing users (optional - remove if you want to keep existing users)
    await User.deleteMany({});
    console.log('✓ Cleared existing users');

    // Insert seed users
    const createdUsers = await User.insertMany(users);
    console.log('✓ Successfully created users:');
    
    createdUsers.forEach(user => {
      console.log(`  - ${user.role}: ${user.email} (password: ${users.find(u => u.email === user.email).password})`);
    });

    console.log('\n✓ Database seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('✗ Error seeding database:', error.message);
    process.exit(1);
  }
};

seedDatabase();
