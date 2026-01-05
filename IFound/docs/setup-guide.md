# Setup Guide - I Found!!

This guide will help you set up the I Found!! application for local development.

## Prerequisites

Before you begin, ensure you have the following installed:

### Required Software

1. **Node.js** (v18 or higher)
   - Download from: https://nodejs.org/
   - Verify: `node --version`

2. **PostgreSQL** (v14 or higher)
   - Download from: https://www.postgresql.org/download/
   - Verify: `psql --version`

3. **Redis** (v7 or higher)
   - Download from: https://redis.io/download
   - Verify: `redis-server --version`

4. **Git**
   - Download from: https://git-scm.com/
   - Verify: `git --version`

### For Mobile Development

5. **React Native Development Environment**
   - Follow the official guide: https://reactnative.dev/docs/environment-setup
   - For iOS: Xcode (Mac only)
   - For Android: Android Studio

### Optional (for production features)

6. **AWS Account** (for S3 storage and Rekognition)
7. **Stripe Account** (for payment processing)
8. **Google Cloud Account** (for Maps API)
9. **Firebase Account** (for push notifications)

---

## Backend Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd IFound
```

### 2. Install Backend Dependencies

```bash
cd backend
npm install
```

### 3. Set Up PostgreSQL Database

```bash
# Create PostgreSQL database
psql -U postgres

# In psql shell:
CREATE DATABASE ifound;
CREATE USER ifound_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE ifound TO ifound_user;
\q
```

### 4. Start Redis Server

```bash
# On macOS (with Homebrew)
brew services start redis

# On Linux
sudo systemctl start redis

# On Windows
redis-server
```

### 5. Configure Environment Variables

```bash
# Copy the example env file
cp .env.example .env

# Edit .env with your configuration
nano .env
```

**Required Environment Variables:**

```env
# Server
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL=postgresql://ifound_user:your_secure_password@localhost:5432/ifound

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this
JWT_REFRESH_SECRET=your-refresh-token-secret

# For development, you can skip these initially:
# AWS_ACCESS_KEY_ID=
# AWS_SECRET_ACCESS_KEY=
# STRIPE_SECRET_KEY=
# GOOGLE_MAPS_API_KEY=
```

### 6. Run Database Migrations

```bash
# The app will automatically sync the database in development mode
# When you start the server for the first time
npm run dev
```

### 7. Start the Backend Server

```bash
npm run dev
```

You should see:
```
✅ Database connection established successfully.
✅ Database synchronized successfully.

╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   🔍 I Found!! API Server                                  ║
║                                                            ║
║   Environment: development                                 ║
║   Port: 3000                                               ║
║   API Version: v1                                          ║
║                                                            ║
║   🚀 Server is running and ready to accept connections     ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
```

### 8. Test the API

```bash
# Test health endpoint
curl http://localhost:3000/health

# Expected response:
{
  "success": true,
  "message": "Server is running",
  "timestamp": "2025-11-06T10:00:00.000Z"
}
```

### 9. Create a Test User

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "testPassword123",
    "first_name": "Test",
    "last_name": "User",
    "user_type": "finder"
  }'
```

---

## Frontend Setup (React Native)

### 1. Install Frontend Dependencies

```bash
cd ../frontend
npm install
```

### 2. Configure Environment Variables

```bash
# Create .env file
cp .env.example .env

# Edit with your configuration
nano .env
```

```env
API_URL=http://localhost:3000/api/v1
GOOGLE_MAPS_API_KEY=your_google_maps_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_key
```

### 3. iOS Setup (Mac only)

```bash
cd ios
pod install
cd ..
```

### 4. Run the Mobile App

**For iOS:**
```bash
npm run ios
```

**For Android:**
```bash
# Make sure you have an Android emulator running
npm run android
```

---

## Development Workflow

### Backend Development

1. **Start the backend server:**
   ```bash
   cd backend
   npm run dev
   ```

2. **Run tests:**
   ```bash
   npm test
   ```

3. **Lint code:**
   ```bash
   npm run lint
   npm run lint:fix
   ```

### Frontend Development

1. **Start Metro bundler:**
   ```bash
   cd frontend
   npm start
   ```

2. **Run on iOS:**
   ```bash
   npm run ios
   ```

3. **Run on Android:**
   ```bash
   npm run android
   ```

4. **Run tests:**
   ```bash
   npm test
   ```

---

## Testing the Application

### Backend API Testing

**1. Register a user:**
```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123",
    "first_name": "John",
    "last_name": "Doe"
  }'
```

**2. Login:**
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'
```

Save the token from the response.

**3. Create a case:**
```bash
curl -X POST http://localhost:3000/api/v1/cases \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "case_type": "lost_item",
    "title": "Lost iPhone 15 Pro",
    "description": "Lost my iPhone at Central Park",
    "bounty_amount": 100,
    "item_category": "electronics"
  }'
```

**4. Get all cases:**
```bash
curl http://localhost:3000/api/v1/cases
```

---

## Common Issues and Solutions

### Issue 1: Database Connection Error

**Error:** "Unable to connect to the database"

**Solution:**
- Ensure PostgreSQL is running: `brew services list` or `sudo systemctl status postgresql`
- Check DATABASE_URL in .env is correct
- Verify database exists: `psql -U postgres -c "\l"`

### Issue 2: Redis Connection Error

**Error:** "Redis connection failed"

**Solution:**
- Start Redis: `brew services start redis` or `sudo systemctl start redis`
- Check if Redis is running: `redis-cli ping` (should return "PONG")

### Issue 3: Port Already in Use

**Error:** "Port 3000 is already in use"

**Solution:**
- Change PORT in .env to a different port (e.g., 3001)
- Or kill the process using port 3000:
  ```bash
  lsof -ti:3000 | xargs kill
  ```

### Issue 4: Module Not Found

**Error:** "Cannot find module 'xyz'"

**Solution:**
- Delete node_modules and reinstall:
  ```bash
  rm -rf node_modules
  npm install
  ```

### Issue 5: React Native Build Errors

**Solution:**
- Clean build:
  ```bash
  cd ios && pod install && cd ..
  npx react-native start --reset-cache
  ```

---

## Database Management

### View Database Tables

```bash
psql -U postgres -d ifound

\dt  # List all tables
\d users  # Describe users table
```

### Reset Database

```bash
# Drop and recreate database
psql -U postgres -c "DROP DATABASE ifound;"
psql -U postgres -c "CREATE DATABASE ifound;"

# Restart the server to re-sync tables
npm run dev
```

### Seed Sample Data

```bash
npm run seed
```

---

## Environment-Specific Setup

### Development

- Use `.env` file
- Database auto-sync enabled
- Detailed logging
- CORS enabled for all origins

### Testing

- Use separate test database
- Run: `NODE_ENV=test npm test`

### Production

- Use environment variables (not .env file)
- Disable auto-sync (use migrations)
- Production logging level
- Restrict CORS to specific origins
- Enable HTTPS
- Use connection pooling

---

## Next Steps

After setup:

1. ✅ Verify backend is running at http://localhost:3000
2. ✅ Verify you can register and login
3. ✅ Verify you can create cases
4. ✅ Set up mobile app and test on simulator/emulator
5. 📖 Read [API Documentation](./api-documentation.md)
6. 📖 Read [Database Schema](./database-schema.md)
7. 🚀 Start developing!

---

## Getting Help

- Check the [API Documentation](./api-documentation.md)
- Check the [Database Schema](./database-schema.md)
- Review error logs in console
- Check GitHub issues
- Contact the development team

---

**Document Version:** 1.0
**Last Updated:** November 6, 2025
