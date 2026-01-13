# Innovate Hackathon Backend

A Node.js backend prototype with JWT authentication and role-based access control.

## Features

- JWT Authentication (register/login)
- Role-Based Access Control (ADMIN, SUPPLIER, LENDER)
- MongoDB with Mongoose
- Password hashing with bcryptjs
- Express.js RESTful API

## Project Structure

```
├── config/
│   └── constants.js        # Role constants
├── controllers/
│   └── authController.js   # Authentication logic
├── middleware/
│   └── auth.js            # JWT & role-based middleware
├── models/
│   └── User.js            # User schema
├── routes/
│   └── auth.js            # Auth routes
├── scripts/
│   └── seed.js            # Database seeding
├── .env                   # Environment variables
├── server.js              # Express server entry point
└── package.json
```

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure MongoDB URI:**
   Edit `.env` file and add your MongoDB connection string:
   ```
   MONGODB_URI=your_mongodb_uri_here
   ```

3. **Seed database:**
   ```bash
   npm run seed
   ```

   This creates:
   - Admin: admin@hackathon.com / admin123
   - Supplier: supplier@hackathon.com / supplier123
   - Lender: lender@hackathon.com / lender123

4. **Start server:**
   ```bash
   npm start
   # or for development with auto-reload
   npm run dev
   ```

## API Endpoints

### Authentication

**POST** `/api/auth/register`
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "role": "SUPPLIER"
}
```

**POST** `/api/auth/login`
```json
{
  "email": "john@example.com",
  "password": "password123"
}
```

**GET** `/api/auth/me` (Protected)
- Requires: `Authorization: Bearer <token>`

## Using Role-Based Middleware

```javascript
const { protect, authorize, adminOnly } = require('./middleware/auth');
const { ROLES } = require('./config/constants');

// Protect route (any authenticated user)
router.get('/protected', protect, controller);

// Admin only
router.delete('/users/:id', protect, adminOnly, controller);

// Multiple roles
router.post('/inventory', protect, authorize(ROLES.ADMIN, ROLES.SUPPLIER), controller);
```

## Authentication Flow

1. User registers or logs in → receives JWT token
2. Client stores token (localStorage, cookies, etc.)
3. Client sends token in Authorization header: `Bearer <token>`
4. Server validates token with `protect` middleware
5. Server checks role with `authorize` middleware
6. Request proceeds to controller if authorized

## Environment Variables

```env
MONGODB_URI=mongodb://...
JWT_SECRET=your_secret_key
JWT_EXPIRE=7d
PORT=5000
NODE_ENV=development
```

## Phase 0 Complete ✓

All basic infrastructure is ready. Next phases can include:
- Business logic controllers
- Additional models
- Error handling middleware
- Input validation
- API documentation
