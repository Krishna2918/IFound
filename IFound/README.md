# I Found!! - Crowdsourced Finding Platform

A mobile-first platform that connects people who have lost something with a global network of users who can help locate them, operating on a bounty-based reward system.

## Overview

**I Found!!** is a comprehensive app that helps:
- Law enforcement find wanted criminals
- Families locate missing persons
- Individuals recover lost items

The platform uses AI-powered photo recognition, location-based search, and verified bounty payments to incentivize community participation.

## Project Structure

```
IFound/
├── backend/              # Node.js/Express API server
│   ├── src/
│   │   ├── config/      # Configuration files
│   │   ├── controllers/ # Route controllers
│   │   ├── models/      # Database models
│   │   ├── routes/      # API routes
│   │   ├── middleware/  # Custom middleware
│   │   ├── services/    # Business logic
│   │   └── utils/       # Utility functions
│   └── tests/           # Backend tests
│
├── frontend/            # React Native mobile app
│   ├── src/
│   │   ├── screens/     # App screens
│   │   ├── components/  # Reusable components
│   │   ├── navigation/  # Navigation config
│   │   ├── services/    # API services
│   │   ├── utils/       # Utility functions
│   │   ├── assets/      # Images, fonts, etc.
│   │   └── config/      # App configuration
│   └── __tests__/       # Frontend tests
│
├── docs/                # Documentation
└── scripts/             # Build and deployment scripts
```

## Tech Stack

### Backend
- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** PostgreSQL
- **Cache:** Redis
- **Search:** Elasticsearch (optional)
- **Authentication:** JWT
- **Payment:** Stripe Connect
- **AI/ML:** AWS Rekognition / Google Cloud Vision
- **Storage:** AWS S3 / Local storage (development)

### Frontend
- **Framework:** React Native
- **State Management:** Redux Toolkit / Context API
- **Navigation:** React Navigation
- **UI Components:** React Native Paper / Native Base
- **Maps:** React Native Maps (Google Maps)
- **Push Notifications:** Firebase Cloud Messaging
- **Image Handling:** React Native Image Picker

### DevOps
- **Cloud:** AWS / Google Cloud Platform
- **Container:** Docker
- **CI/CD:** GitHub Actions
- **Monitoring:** Sentry

## Features

### Phase 1 - MVP
- ✅ User registration and authentication
- ✅ Multi-tier user types (finders, posters, law enforcement)
- ✅ Case posting (criminals, missing persons, lost items)
- ✅ Photo upload and management
- ✅ Basic search functionality
- ✅ Submission system for tips
- ✅ Bounty management
- ✅ Payment escrow system
- ✅ Location-based features
- ✅ Push notifications

### Phase 2 - Enhanced Features
- ⏳ AI face recognition
- ⏳ Object detection for items
- ⏳ Advanced search filters
- ⏳ Real-time updates
- ⏳ In-app messaging
- ⏳ Analytics dashboard
- ⏳ Content moderation tools

### Phase 3 - Scale Features
- ⏳ International expansion
- ⏳ Multiple payment methods
- ⏳ Premium subscriptions
- ⏳ API for third-party integrations
- ⏳ Advanced AI capabilities

## Getting Started

### Prerequisites
- Node.js (v18+)
- PostgreSQL (v14+)
- Redis (v7+)
- React Native development environment
- Stripe account (for payments)
- AWS account (for S3 and Rekognition)

### Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your configuration
npm run migrate
npm run dev
```

### Frontend Setup

```bash
cd frontend
npm install
# For iOS
cd ios && pod install && cd ..
npm run ios

# For Android
npm run android
```

## Environment Variables

### Backend (.env)
```
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/ifound
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key
STRIPE_SECRET_KEY=sk_test_...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=ifound-uploads
```

### Frontend (.env)
```
API_URL=http://localhost:3000/api
GOOGLE_MAPS_API_KEY=...
STRIPE_PUBLISHABLE_KEY=pk_test_...
```

## API Documentation

API documentation is available at `/api/docs` when running the backend server in development mode.

## Database Schema

See `docs/database-schema.md` for detailed database structure.

## Security Considerations

- All passwords are hashed using bcrypt
- JWT tokens for authentication
- Rate limiting on all endpoints
- Input validation and sanitization
- HTTPS only in production
- Data encryption at rest and in transit
- GDPR and CCPA compliant

## Testing

```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test
```

## Deployment

See `docs/deployment.md` for deployment instructions.

## Contributing

This is a private project. For internal team members, please:
1. Create a feature branch
2. Make your changes
3. Submit a pull request
4. Wait for code review

## Legal

- See `docs/terms-of-service.md`
- See `docs/privacy-policy.md`
- See `docs/community-guidelines.md`

## Support

For questions or issues:
- Email: support@ifound.app
- Documentation: docs/
- Internal wiki: [Link to wiki]

## License

Proprietary - All Rights Reserved

## Roadmap

See `docs/roadmap.md` for detailed development timeline.

---

**Version:** 1.0.0
**Last Updated:** November 6, 2025
**Status:** In Development
