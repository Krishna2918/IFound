# Database Schema Documentation

## Overview

The I Found!! platform uses PostgreSQL as its primary database. This document outlines the complete database schema.

## Tables

### 1. Users Table

Stores all user information including finders, posters, and law enforcement.

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  phone_number VARCHAR(50) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  user_type VARCHAR(50) NOT NULL DEFAULT 'finder',
  verification_status VARCHAR(50) NOT NULL DEFAULT 'unverified',
  verification_documents JSONB DEFAULT '{}',
  profile_photo_url VARCHAR(500),
  reputation_score DECIMAL(5,2) DEFAULT 0.00,
  total_earnings DECIMAL(10,2) DEFAULT 0.00,
  total_cases_found INTEGER DEFAULT 0,
  stripe_customer_id VARCHAR(255),
  stripe_account_id VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  is_suspended BOOLEAN DEFAULT false,
  last_login_at TIMESTAMP,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Indexes:**
- `email` (unique)
- `user_type`
- `verification_status`

**Enum Values:**
- `user_type`: 'finder', 'poster', 'law_enforcement', 'admin'
- `verification_status`: 'unverified', 'email_verified', 'id_verified', 'law_enforcement_verified'

---

### 2. Cases Table

Stores all posted cases (criminals, missing persons, lost items).

```sql
CREATE TABLE cases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  poster_id UUID NOT NULL REFERENCES users(id),
  case_type VARCHAR(50) NOT NULL,
  case_number VARCHAR(100) UNIQUE,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  priority_level VARCHAR(50) NOT NULL DEFAULT 'medium',
  bounty_amount DECIMAL(10,2) NOT NULL,
  platform_commission DECIMAL(10,2) DEFAULT 0.00,

  -- Subject information
  subject_name VARCHAR(255),
  subject_aliases TEXT[],
  subject_age INTEGER,
  subject_dob DATE,
  physical_description JSONB,

  -- Location information
  last_seen_location JSONB,
  last_seen_date TIMESTAMP,
  search_radius INTEGER DEFAULT 50,

  -- For criminals
  charges TEXT[],
  danger_level VARCHAR(50),
  jurisdictional_info JSONB,

  -- For lost items
  item_category VARCHAR(50),
  item_value DECIMAL(10,2),
  serial_numbers TEXT[],

  -- Medical/safety
  medical_conditions TEXT,
  special_circumstances TEXT,
  contact_info JSONB,

  -- Metadata
  view_count INTEGER DEFAULT 0,
  share_count INTEGER DEFAULT 0,
  submission_count INTEGER DEFAULT 0,
  is_featured BOOLEAN DEFAULT false,

  expires_at TIMESTAMP,
  resolved_at TIMESTAMP,
  resolved_by UUID REFERENCES users(id),

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Indexes:**
- `poster_id`
- `case_type`
- `status`
- `priority_level`
- `created_at`

**Enum Values:**
- `case_type`: 'criminal', 'missing_person', 'lost_item'
- `status`: 'active', 'resolved', 'expired', 'suspended'
- `priority_level`: 'low', 'medium', 'high', 'critical'
- `danger_level`: 'not_dangerous', 'potentially_dangerous', 'armed_and_dangerous'
- `item_category`: 'pet', 'jewelry', 'electronics', 'documents', 'vehicle', 'other'

---

### 3. Photos Table

Stores photos associated with cases.

```sql
CREATE TABLE photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  image_url VARCHAR(500) NOT NULL,
  thumbnail_url VARCHAR(500),
  image_hash VARCHAR(255),
  file_size INTEGER,
  mime_type VARCHAR(100),
  width INTEGER,
  height INTEGER,
  is_primary BOOLEAN DEFAULT false,
  caption TEXT,

  -- AI/ML data
  face_vector FLOAT[],
  face_detected BOOLEAN DEFAULT false,
  ai_confidence_score DECIMAL(5,4),
  ai_metadata JSONB DEFAULT '{}',

  -- AWS data
  aws_face_id VARCHAR(255),
  aws_s3_key VARCHAR(500),

  upload_status VARCHAR(50) DEFAULT 'pending',
  upload_error TEXT,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Indexes:**
- `case_id`
- `is_primary`
- `face_detected`

**Enum Values:**
- `upload_status`: 'pending', 'processing', 'completed', 'failed'

---

### 4. Submissions Table

Stores tips and information submitted by finders.

```sql
CREATE TABLE submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  finder_id UUID REFERENCES users(id),
  submission_type VARCHAR(50) NOT NULL,
  is_anonymous BOOLEAN DEFAULT false,
  content TEXT,
  media_urls TEXT[],
  location_data JSONB,

  verification_status VARCHAR(50) NOT NULL DEFAULT 'pending',
  verification_level INTEGER DEFAULT 1,
  confidence_score DECIMAL(5,2),
  bounty_percentage DECIMAL(5,2) DEFAULT 0.00,

  reviewer_notes TEXT,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP,

  ip_address INET,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Indexes:**
- `case_id`
- `finder_id`
- `verification_status`
- `created_at`

**Enum Values:**
- `submission_type`: 'tip', 'photo', 'video', 'location', 'sighting'
- `verification_status`: 'pending', 'reviewing', 'verified', 'rejected', 'duplicate'

---

### 5. Transactions Table

Stores all financial transactions including bounty payments.

```sql
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES cases(id),
  submission_id UUID REFERENCES submissions(id),
  finder_id UUID REFERENCES users(id),
  poster_id UUID NOT NULL REFERENCES users(id),

  transaction_type VARCHAR(50) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  platform_commission DECIMAL(10,2) DEFAULT 0.00,
  net_amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',

  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  payment_method VARCHAR(50) DEFAULT 'stripe',

  -- Stripe data
  stripe_payment_intent_id VARCHAR(255),
  stripe_transfer_id VARCHAR(255),
  stripe_payout_id VARCHAR(255),

  -- Timestamps
  escrow_released_at TIMESTAMP,
  completed_at TIMESTAMP,
  failed_at TIMESTAMP,
  failure_reason TEXT,
  refunded_at TIMESTAMP,
  refund_reason TEXT,

  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Indexes:**
- `case_id`
- `finder_id`
- `poster_id`
- `status`
- `transaction_type`
- `created_at`

**Enum Values:**
- `transaction_type`: 'bounty_payment', 'refund', 'commission', 'withdrawal'
- `status`: 'pending', 'escrow', 'processing', 'completed', 'failed', 'refunded', 'cancelled'
- `payment_method`: 'stripe', 'paypal', 'bank_transfer', 'cryptocurrency'

---

## Relationships

### User Relationships
- One User can post many Cases (1:N)
- One User can submit many Submissions (1:N)
- One User can receive many Transactions (1:N)
- One User can make many Transactions as poster (1:N)

### Case Relationships
- One Case belongs to one User (poster) (N:1)
- One Case can have many Photos (1:N)
- One Case can have many Submissions (1:N)
- One Case can have many Transactions (1:N)
- One Case may be resolved by one User (N:1)

### Photo Relationships
- One Photo belongs to one Case (N:1)

### Submission Relationships
- One Submission belongs to one Case (N:1)
- One Submission belongs to one User (finder) (N:1)
- One Submission may be reviewed by one User (N:1)
- One Submission can have many Transactions (1:N)

### Transaction Relationships
- One Transaction belongs to one Case (N:1)
- One Transaction may belong to one Submission (N:1)
- One Transaction belongs to one User (finder) (N:1)
- One Transaction belongs to one User (poster) (N:1)

---

## JSONB Fields Structure

### users.settings
```json
{
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
```

### cases.physical_description
```json
{
  "height": "5'10\"",
  "weight": "170 lbs",
  "hair_color": "Brown",
  "eye_color": "Blue",
  "distinguishing_marks": ["Tattoo on left arm", "Scar on right cheek"],
  "clothing": "Last seen wearing blue jeans and red hoodie"
}
```

### cases.last_seen_location
```json
{
  "address": "123 Main St",
  "city": "New York",
  "state": "NY",
  "country": "USA",
  "latitude": 40.7128,
  "longitude": -74.0060
}
```

### photos.ai_metadata
```json
{
  "labels": ["person", "outdoor", "building"],
  "colors": ["#FF0000", "#00FF00", "#0000FF"],
  "faces_count": 1,
  "objects_detected": ["car", "tree", "sign"]
}
```

### submissions.location_data
```json
{
  "latitude": 40.7128,
  "longitude": -74.0060,
  "address": "123 Main St, New York, NY",
  "accuracy": 10,
  "timestamp": "2025-11-06T10:30:00Z"
}
```

---

## Triggers and Functions

### Update timestamp trigger
```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cases_updated_at BEFORE UPDATE ON cases
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Apply to all tables...
```

---

## Data Migration Notes

1. **Development**: Use Sequelize `sync({ alter: true })` for automatic schema updates
2. **Production**: Use Sequelize migrations for schema changes
3. **Backup**: Always backup before migrations
4. **Rollback**: Keep rollback scripts for all migrations

---

## Performance Considerations

1. **Indexes**: All foreign keys and frequently queried fields are indexed
2. **JSONB**: Used for flexible schema fields that don't need strict validation
3. **Arrays**: Used for simple lists (aliases, charges, etc.)
4. **Partitioning**: Consider partitioning `cases` and `transactions` tables by date in future
5. **Archival**: Consider archiving resolved cases older than 1 year

---

## Security Considerations

1. **Passwords**: Always hashed with bcrypt (10 rounds)
2. **PII**: Encrypt sensitive personal information
3. **Soft Delete**: Consider soft delete instead of hard delete for audit trail
4. **Row-level Security**: Implement RLS for multi-tenant isolation if needed
5. **Audit Logs**: Consider adding audit log table for compliance

---

**Document Version:** 1.0
**Last Updated:** November 6, 2025
