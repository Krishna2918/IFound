/**
 * Business Rules Configuration
 *
 * Centralizes all configurable business rules for the IFound platform.
 * All values can be overridden via environment variables.
 */

module.exports = {
  // Bounty Configuration
  bounty: {
    minAmount: parseInt(process.env.MIN_BOUNTY_AMOUNT) || 10,
    maxAmountBasic: parseInt(process.env.MAX_BOUNTY_AMOUNT_BASIC) || 5000,
    maxAmountVerified: parseInt(process.env.MAX_BOUNTY_AMOUNT_VERIFIED) || 50000,
    maxAmountPremium: parseInt(process.env.MAX_BOUNTY_AMOUNT_PREMIUM) || 100000,
    foundItemMaxBounty: parseInt(process.env.FOUND_ITEM_MAX_BOUNTY) || 50, // CAD, for anti-selling
    platformFee: parseFloat(process.env.PLATFORM_COMMISSION_PERCENTAGE) / 100 || 0.10,
    currency: process.env.DEFAULT_CURRENCY || 'CAD',
  },

  // Case Configuration
  case: {
    expiryDays: {
      basic: parseInt(process.env.CASE_EXPIRY_DAYS_BASIC) || 30,
      premium: parseInt(process.env.CASE_EXPIRY_DAYS_PREMIUM) || 90,
      lawEnforcement: parseInt(process.env.CASE_EXPIRY_DAYS_LE) || 365,
    },
    maxPhotosPerCase: parseInt(process.env.MAX_PHOTOS_PER_CASE) || 10,
    autoArchiveAfterResolution: parseInt(process.env.AUTO_ARCHIVE_DAYS) || 7,
  },

  // Category Visibility (Launch Phase Restrictions)
  categories: {
    enabled: [
      'lost_item',
      'found_item',
      // 'lost_pet' - will be added as sub-category
    ],
    hidden: [
      'missing_person',  // Phase 2 - requires LE partnership
      'criminal',        // Phase 3 - requires legal framework
      'wanted',          // Phase 3 - requires legal framework
    ],
    requiresVerification: {
      missing_person: 'law_enforcement_verified',
      criminal: 'law_enforcement_verified',
      wanted: 'law_enforcement_verified',
    },
  },

  // Case Types Mapping (for display)
  caseTypes: {
    lost_item: { label: 'Lost Item', icon: 'search', color: '#FF6B35' },
    found_item: { label: 'Found Item', icon: 'hand-holding', color: '#4CAF50' },
    lost_pet: { label: 'Lost Pet', icon: 'paw', color: '#FF9800' },
    found_pet: { label: 'Found Pet', icon: 'paw', color: '#8BC34A' },
    missing_person: { label: 'Missing Person', icon: 'user-search', color: '#F44336', hidden: true },
    criminal: { label: 'Criminal', icon: 'alert', color: '#9C27B0', hidden: true },
    wanted: { label: 'Wanted', icon: 'shield-alert', color: '#E91E63', hidden: true },
  },

  // Verification Configuration
  verification: {
    kycThreshold: parseInt(process.env.KYC_THRESHOLD) || 100, // Require ID for payouts > $100
    newAccountPayoutDelay: parseInt(process.env.NEW_ACCOUNT_PAYOUT_DELAY_HOURS) || 48,
    taxReportingThreshold: parseInt(process.env.TAX_REPORTING_THRESHOLD) || 600, // US $600/year
    levels: {
      unverified: { maxBounty: 100, canClaim: true, canPost: true },
      email_verified: { maxBounty: 500, canClaim: true, canPost: true },
      phone_verified: { maxBounty: 2000, canClaim: true, canPost: true },
      id_verified: { maxBounty: 50000, canClaim: true, canPost: true },
      law_enforcement_verified: { maxBounty: 100000, canClaim: true, canPost: true, canAccessRestricted: true },
    },
  },

  // Escrow Configuration
  escrow: {
    holdDuration: parseInt(process.env.ESCROW_HOLD_DURATION_DAYS) || 7, // Days before auto-release
    disputeWindow: parseInt(process.env.DISPUTE_WINDOW_DAYS) || 14, // Days to open dispute
    autoRefundOnExpiry: process.env.AUTO_REFUND_ON_EXPIRY !== 'false',
  },

  // Rate Limiting by Tier
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutes
    tiers: {
      anonymous: { maxRequests: 30, description: 'Non-authenticated users' },
      finder: { maxRequests: 100, description: 'Basic finder accounts' },
      poster: { maxRequests: 200, description: 'Basic poster accounts' },
      premium: { maxRequests: 500, description: 'Premium subscribers' },
      law_enforcement: { maxRequests: 1000, description: 'Verified law enforcement' },
      admin: { maxRequests: Infinity, description: 'Platform administrators' },
    },
  },

  // Reputation Scoring
  reputation: {
    initialScore: 0,
    actions: {
      claimCompleted: 10,
      claimRejected: -5,
      verificationCompleted: 20,
      fraudConfirmed: -50,
      accountAgeMonth: 1,
      fastResponse: 2, // < 1 hour
      positiveReview: 5,
      negativeReview: -10,
    },
    thresholds: {
      trusted: 50,
      verified: 100,
      expert: 500,
    },
  },

  // Fraud Detection
  fraud: {
    maxClaimsPerDay: parseInt(process.env.MAX_CLAIMS_PER_DAY) || 10,
    maxClaimsPerCase: parseInt(process.env.MAX_CLAIMS_PER_CASE) || 3,
    suspiciousIPThreshold: parseInt(process.env.SUSPICIOUS_IP_THRESHOLD) || 5,
    autoSuspendScore: parseInt(process.env.AUTO_SUSPEND_FRAUD_SCORE) || 80,
  },

  // Notifications
  notifications: {
    quietHours: {
      enabled: process.env.QUIET_HOURS_ENABLED !== 'false',
      start: parseInt(process.env.QUIET_HOURS_START) || 22, // 10 PM
      end: parseInt(process.env.QUIET_HOURS_END) || 8, // 8 AM
    },
    maxAlertsPerDay: parseInt(process.env.MAX_ALERTS_PER_DAY) || 10,
    geofenceRadius: parseInt(process.env.GEOFENCE_RADIUS_METERS) || 5000, // 5km
  },

  // Content Moderation
  moderation: {
    sellingKeywords: [
      'for sale', 'selling', 'buy', 'purchase', 'price', '$',
      'payment', 'venmo', 'paypal', 'cash', 'money order',
    ],
    flagThreshold: parseInt(process.env.MODERATION_FLAG_THRESHOLD) || 3,
    blockThreshold: parseInt(process.env.MODERATION_BLOCK_THRESHOLD) || 5,
  },

  // File Upload
  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760, // 10MB
    allowedImageTypes: (process.env.ALLOWED_IMAGE_TYPES || 'image/jpeg,image/png,image/jpg,image/webp').split(','),
    imageResizeWidth: parseInt(process.env.IMAGE_RESIZE_WIDTH) || 1200,
    thumbnailWidth: parseInt(process.env.THUMBNAIL_WIDTH) || 300,
  },

  // Data Retention
  retention: {
    auditLogDays: parseInt(process.env.AUDIT_LOG_RETENTION_DAYS) || 90,
    resolvedCaseDays: parseInt(process.env.RESOLVED_CASE_RETENTION_DAYS) || 365,
    userDataAfterDeletion: parseInt(process.env.USER_DATA_RETENTION_DAYS) || 30,
  },
};
