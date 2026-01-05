export const API_URL = process.env.API_URL || 'http://localhost:3000/api/v1';
export const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';
export const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY || '';

// Platform fee configuration (must match backend PLATFORM_COMMISSION_PERCENTAGE)
export const PLATFORM_FEE_PERCENT = 2.5;
export const MIN_BOUNTY = 10;
export const MAX_BOUNTY = 50; // Matches backend MAX_BOUNTY_AMOUNT

export const CASE_TYPES = {
  CRIMINAL: 'criminal',
  MISSING_PERSON: 'missing_person',
  LOST_ITEM: 'lost_item',
  FOUND_ITEM: 'found_item',
};

export const SUBMISSION_TYPES = {
  TIP: 'tip',
  PHOTO: 'photo',
  VIDEO: 'video',
  LOCATION: 'location',
  SIGHTING: 'sighting',
};

export const VERIFICATION_STATUS = {
  PENDING: 'pending',
  REVIEWING: 'reviewing',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
};

export const CASE_STATUS = {
  ACTIVE: 'active',
  RESOLVED: 'resolved',
  EXPIRED: 'expired',
  SUSPENDED: 'suspended',
};

export const PRIORITY_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
};

export const ITEM_CATEGORIES = {
  PET: 'pet',
  JEWELRY: 'jewelry',
  ELECTRONICS: 'electronics',
  DOCUMENTS: 'documents',
  VEHICLE: 'vehicle',
  OTHER: 'other',
};

export const USER_TYPES = {
  FINDER: 'finder',
  POSTER: 'poster',
  LAW_ENFORCEMENT: 'law_enforcement',
  ADMIN: 'admin',
};
