# Quick Start Guide - I Found!!

Get up and running with I Found!! in 5 minutes.

## Prerequisites

- Node.js v18+
- PostgreSQL v14+
- Redis v7+

## Backend Setup (2 minutes)

```bash
# 1. Navigate to backend
cd IFound/backend

# 2. Install dependencies
npm install

# 3. Create database
psql -U postgres -c "CREATE DATABASE ifound;"

# 4. Copy environment file
cp .env.example .env

# 5. Edit .env with your database credentials
# Minimum required:
# DATABASE_URL=postgresql://postgres:your_password@localhost:5432/ifound
# JWT_SECRET=your-secret-key

# 6. Start Redis (if not running)
# macOS: brew services start redis
# Linux: sudo systemctl start redis

# 7. Start the server
npm run dev
```

Server will start at http://localhost:3000

## Test the API (1 minute)

```bash
# 1. Register a user
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","first_name":"Test","last_name":"User"}'

# 2. Copy the token from the response

# 3. Create a case (replace YOUR_TOKEN with the token from step 2)
curl -X POST http://localhost:3000/api/v1/cases \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"case_type":"lost_item","title":"Lost iPhone","description":"Lost at park","bounty_amount":100,"item_category":"electronics"}'

# 4. View all cases
curl http://localhost:3000/api/v1/cases
```

## Frontend Setup (React Native)

```bash
# 1. Navigate to frontend
cd ../frontend

# 2. Install dependencies
npm install

# 3. Copy environment file
cp .env.example .env

# 4. For iOS (Mac only)
cd ios && pod install && cd ..
npm run ios

# 5. For Android
npm run android
```

## What's Included

✅ **Backend:**
- User authentication (register, login, JWT)
- Case management (create, read, update, delete)
- Database models (User, Case, Photo, Submission, Transaction)
- API documentation

✅ **Frontend:**
- React Native project structure
- Package dependencies configured

## Next Steps

1. Read the [Setup Guide](docs/setup-guide.md) for detailed information
2. Check the [API Documentation](docs/api-documentation.md)
3. Review the [Database Schema](docs/database-schema.md)
4. Start building features!

## Common Commands

```bash
# Backend
npm run dev         # Start development server
npm test            # Run tests
npm run lint        # Lint code

# Frontend
npm start           # Start Metro bundler
npm run ios         # Run on iOS simulator
npm run android     # Run on Android emulator
npm test            # Run tests
```

## Troubleshooting

**Database connection error?**
- Check PostgreSQL is running: `pg_isready`
- Verify DATABASE_URL in .env

**Redis connection error?**
- Check Redis is running: `redis-cli ping`
- Should return "PONG"

**Port already in use?**
- Change PORT in .env to a different port

## Need Help?

- 📖 [Full Setup Guide](docs/setup-guide.md)
- 📖 [API Documentation](docs/api-documentation.md)
- 📖 [Database Schema](docs/database-schema.md)

---

**Happy Coding! 🚀**
