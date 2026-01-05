# API Documentation

## Base URL

```
Development: http://localhost:3000/api/v1
Production: https://api.ifound.app/api/v1
```

## Authentication

All protected endpoints require a JWT token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

---

## Authentication Endpoints

### Register User

Create a new user account.

**Endpoint:** `POST /auth/register`

**Access:** Public

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "phone_number": "+1234567890",
  "first_name": "John",
  "last_name": "Doe",
  "user_type": "finder"
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": {
      "id": "uuid",
      "first_name": "John",
      "last_name": "Doe",
      "user_type": "finder",
      "verification_status": "unverified",
      "profile_photo_url": null,
      "reputation_score": 0,
      "total_cases_found": 0
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

---

### Login

Authenticate a user and receive tokens.

**Endpoint:** `POST /auth/login`

**Access:** Public

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "uuid",
      "first_name": "John",
      "last_name": "Doe",
      "user_type": "finder",
      "verification_status": "email_verified",
      "profile_photo_url": null,
      "reputation_score": 85.5,
      "total_cases_found": 5
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

---

### Get Current User

Get the currently authenticated user's information.

**Endpoint:** `GET /auth/me`

**Access:** Private

**Headers:**
```
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "phone_number": "+1234567890",
      "first_name": "John",
      "last_name": "Doe",
      "user_type": "finder",
      "verification_status": "email_verified",
      "profile_photo_url": null,
      "reputation_score": 85.5,
      "total_earnings": 450.00,
      "total_cases_found": 5,
      "settings": {
        "notifications": {
          "push": true,
          "email": true,
          "sms": false
        },
        "privacy": {
          "show_profile": true,
          "share_location": false
        },
        "search_radius": 50,
        "min_bounty_threshold": 0
      }
    }
  }
}
```

---

### Refresh Token

Get a new access token using a refresh token.

**Endpoint:** `POST /auth/refresh`

**Access:** Public

**Request Body:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

---

### Update Profile

Update the current user's profile information.

**Endpoint:** `PUT /auth/profile`

**Access:** Private

**Request Body:**
```json
{
  "first_name": "Jane",
  "last_name": "Smith",
  "phone_number": "+1987654321",
  "settings": {
    "notifications": {
      "push": true,
      "email": false
    }
  }
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "user": {
      "id": "uuid",
      "first_name": "Jane",
      "last_name": "Smith",
      "user_type": "finder",
      "verification_status": "email_verified",
      "profile_photo_url": null,
      "reputation_score": 85.5,
      "total_cases_found": 5
    }
  }
}
```

---

### Change Password

Change the current user's password.

**Endpoint:** `PUT /auth/change-password`

**Access:** Private

**Request Body:**
```json
{
  "currentPassword": "oldPassword123",
  "newPassword": "newSecurePassword456"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

---

## Case Endpoints

### Create Case

Post a new case (missing person, criminal, or lost item).

**Endpoint:** `POST /cases`

**Access:** Private (email_verified users only)

**Request Body:**
```json
{
  "case_type": "missing_person",
  "title": "Missing Person: Sarah Johnson, 16",
  "description": "Sarah went missing from Austin, TX on November 5, 2025. She is 5'6\", blonde hair, blue eyes. Last seen wearing a blue jacket and jeans.",
  "bounty_amount": 5000,
  "priority_level": "high",
  "subject_name": "Sarah Johnson",
  "subject_age": 16,
  "physical_description": {
    "height": "5'6\"",
    "weight": "130 lbs",
    "hair_color": "Blonde",
    "eye_color": "Blue",
    "distinguishing_marks": ["Small birthmark on left cheek"],
    "clothing": "Blue jacket and jeans"
  },
  "last_seen_location": {
    "address": "123 Main St",
    "city": "Austin",
    "state": "TX",
    "country": "USA",
    "latitude": 30.2672,
    "longitude": -97.7431
  },
  "last_seen_date": "2025-11-05T18:30:00Z",
  "search_radius": 100,
  "medical_conditions": "None",
  "special_circumstances": "May be endangered",
  "contact_info": {
    "phone": "+1234567890",
    "email": "parent@example.com"
  }
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "message": "Case created successfully",
  "data": {
    "case": {
      "id": "uuid",
      "poster_id": "uuid",
      "case_type": "missing_person",
      "title": "Missing Person: Sarah Johnson, 16",
      "description": "...",
      "status": "active",
      "priority_level": "high",
      "bounty_amount": 5000,
      "platform_commission": 500,
      "subject_name": "Sarah Johnson",
      "subject_age": 16,
      "physical_description": {...},
      "last_seen_location": {...},
      "last_seen_date": "2025-11-05T18:30:00Z",
      "search_radius": 100,
      "view_count": 0,
      "submission_count": 0,
      "created_at": "2025-11-06T10:00:00Z",
      "updated_at": "2025-11-06T10:00:00Z"
    }
  }
}
```

---

### Get All Cases

Retrieve cases with optional filters.

**Endpoint:** `GET /cases`

**Access:** Public

**Query Parameters:**
- `case_type` (optional): Filter by type (criminal, missing_person, lost_item)
- `status` (optional): Filter by status (active, resolved, expired)
- `priority_level` (optional): Filter by priority (low, medium, high, critical)
- `search` (optional): Search in title, description, and subject name
- `min_bounty` (optional): Minimum bounty amount
- `max_bounty` (optional): Maximum bounty amount
- `page` (optional, default: 1): Page number
- `limit` (optional, default: 20): Items per page
- `sort` (optional, default: created_at): Sort field
- `order` (optional, default: DESC): Sort order

**Example Request:**
```
GET /cases?case_type=missing_person&priority_level=high&page=1&limit=10
```

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "cases": [
      {
        "id": "uuid",
        "poster_id": "uuid",
        "case_type": "missing_person",
        "title": "Missing Person: Sarah Johnson, 16",
        "description": "...",
        "status": "active",
        "priority_level": "high",
        "bounty_amount": 5000,
        "platform_commission": 500,
        "subject_name": "Sarah Johnson",
        "created_at": "2025-11-06T10:00:00Z",
        "photos": [
          {
            "id": "uuid",
            "image_url": "https://...",
            "is_primary": true
          }
        ],
        "poster": {
          "id": "uuid",
          "first_name": "John",
          "last_name": "Doe",
          "user_type": "poster",
          "verification_status": "id_verified"
        }
      }
    ],
    "pagination": {
      "total": 45,
      "page": 1,
      "pages": 5,
      "limit": 10
    }
  }
}
```

---

### Get Case by ID

Retrieve detailed information about a specific case.

**Endpoint:** `GET /cases/:id`

**Access:** Public

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "case": {
      "id": "uuid",
      "poster_id": "uuid",
      "case_type": "missing_person",
      "title": "Missing Person: Sarah Johnson, 16",
      "description": "...",
      "status": "active",
      "priority_level": "high",
      "bounty_amount": 5000,
      "platform_commission": 500,
      "subject_name": "Sarah Johnson",
      "subject_age": 16,
      "physical_description": {...},
      "last_seen_location": {...},
      "last_seen_date": "2025-11-05T18:30:00Z",
      "search_radius": 100,
      "view_count": 245,
      "submission_count": 12,
      "created_at": "2025-11-06T10:00:00Z",
      "photos": [
        {
          "id": "uuid",
          "image_url": "https://...",
          "thumbnail_url": "https://...",
          "is_primary": true,
          "caption": "Most recent photo"
        }
      ],
      "poster": {
        "id": "uuid",
        "first_name": "John",
        "last_name": "Doe",
        "user_type": "poster",
        "verification_status": "id_verified",
        "profile_photo_url": "https://..."
      },
      "submissions": [
        {
          "id": "uuid",
          "submission_type": "sighting",
          "verification_status": "verified",
          "created_at": "2025-11-06T12:00:00Z"
        }
      ]
    }
  }
}
```

---

### Update Case

Update an existing case (poster only).

**Endpoint:** `PUT /cases/:id`

**Access:** Private (case poster only)

**Request Body:**
```json
{
  "title": "Updated Title",
  "description": "Updated description",
  "bounty_amount": 6000,
  "priority_level": "critical"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Case updated successfully",
  "data": {
    "case": {
      "id": "uuid",
      "title": "Updated Title",
      "bounty_amount": 6000,
      "platform_commission": 600,
      "updated_at": "2025-11-06T15:00:00Z"
    }
  }
}
```

---

### Delete Case

Delete a case (poster only).

**Endpoint:** `DELETE /cases/:id`

**Access:** Private (case poster only)

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Case deleted successfully"
}
```

---

### Get My Cases

Retrieve all cases posted by the current user.

**Endpoint:** `GET /cases/my/cases`

**Access:** Private

**Query Parameters:**
- `status` (optional): Filter by status
- `page` (optional, default: 1)
- `limit` (optional, default: 20)

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "cases": [...],
    "pagination": {
      "total": 5,
      "page": 1,
      "pages": 1,
      "limit": 20
    }
  }
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "success": false,
  "message": "Error description",
  "errors": [
    {
      "field": "email",
      "message": "Email is required"
    }
  ]
}
```

### Common HTTP Status Codes

- `200 OK` - Request successful
- `201 Created` - Resource created
- `400 Bad Request` - Invalid request data
- `401 Unauthorized` - Authentication required
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `409 Conflict` - Resource already exists
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error

---

## Rate Limiting

- Window: 15 minutes
- Max requests: 100 per window
- Applies to all `/api/*` endpoints

When rate limited, you'll receive:
```json
{
  "success": false,
  "message": "Too many requests from this IP, please try again later."
}
```

---

## Pagination

All list endpoints support pagination with these parameters:
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20, max: 100)

Response includes pagination metadata:
```json
{
  "pagination": {
    "total": 100,
    "page": 2,
    "pages": 5,
    "limit": 20
  }
}
```

---

## Filtering and Sorting

List endpoints support filtering and sorting:

**Filters:**
- Exact match: `?field=value`
- Comparison: `?min_bounty=100&max_bounty=1000`
- Text search: `?search=keyword`

**Sorting:**
- `?sort=created_at&order=DESC`
- `?sort=bounty_amount&order=ASC`

---

**Document Version:** 1.0
**Last Updated:** November 6, 2025
