/**
 * Test Configuration
 *
 * Constants and settings for the neural network test data generation system.
 */

const path = require('path');

// Base paths
const BASE_PATH = path.resolve(__dirname, '../../test-data');
const RAW_PATH = path.join(BASE_PATH, 'raw');
const PROCESSED_PATH = path.join(BASE_PATH, 'processed');
const MATCH_PAIRS_PATH = path.join(BASE_PATH, 'match-pairs');
const METADATA_PATH = path.join(BASE_PATH, 'metadata');

// API Configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001/api/v1';

// Test User Credentials
const TEST_USERS = {
  user1: {
    email: 'user1@ifound.com',
    password: 'password123',
    role: 'found_items', // Will upload found items
  },
  user2: {
    email: 'user2@ifound.com',
    password: 'password123',
    role: 'lost_items', // Will upload lost items
  },
};

// Category Configuration
const CATEGORIES = ['pet', 'jewelry', 'electronics', 'documents', 'vehicle', 'other'];

// Distribution: How many items per category (out of 1000)
const CATEGORY_DISTRIBUTION = {
  pet: 200,
  jewelry: 150,
  electronics: 200,
  documents: 150,
  vehicle: 100,
  other: 200,
};

// Match pairs per category (out of 100 total)
const MATCH_PAIRS_DISTRIBUTION = {
  pet: 20,
  jewelry: 15,
  electronics: 20,
  documents: 15,
  vehicle: 10,
  other: 20,
};

// Search queries for Google Images
const SEARCH_QUERIES = {
  pet: [
    'lost dog photo', 'stray cat', 'missing puppy', 'found kitten',
    'golden retriever', 'tabby cat', 'husky dog', 'persian cat',
    'labrador puppy', 'siamese cat', 'german shepherd', 'maine coon cat',
    'beagle dog', 'ragdoll cat', 'border collie', 'british shorthair'
  ],
  jewelry: [
    'gold ring jewelry', 'silver necklace', 'diamond earring', 'lost bracelet',
    'rolex watch', 'pearl earrings', 'wedding band', 'pendant necklace',
    'charm bracelet', 'stud earrings', 'engagement ring', 'tennis bracelet'
  ],
  electronics: [
    'iphone smartphone', 'macbook laptop', 'airpods case', 'samsung tablet',
    'canon camera', 'sony headphones', 'ipad tablet', 'dell laptop',
    'samsung phone', 'bose earbuds', 'nintendo switch', 'kindle reader'
  ],
  documents: [
    'passport document', 'drivers license', 'id card', 'leather wallet',
    'credit card holder', 'business card case', 'passport holder', 'money clip wallet',
    'cardholder wallet', 'bifold wallet', 'id badge holder', 'travel wallet'
  ],
  vehicle: [
    'car keys fob', 'motorcycle helmet', 'bicycle', 'skateboard',
    'electric scooter', 'bike lock', 'car remote', 'motorcycle keys',
    'longboard skateboard', 'kick scooter', 'bike helmet', 'key fob remote'
  ],
  other: [
    'umbrella black', 'backpack school', 'sunglasses', 'water bottle metal',
    'baseball cap', 'winter jacket', 'tote bag', 'messenger bag',
    'beanie hat', 'scarf wool', 'gloves leather', 'duffel bag'
  ],
};

// Specific queries for same-object variations (Strategy 1)
const VARIATION_QUERIES = {
  pet: [
    'golden retriever puppy sitting',
    'black labrador dog portrait',
    'orange tabby cat face',
    'white persian cat fluffy',
    'german shepherd standing',
  ],
  jewelry: [
    'gold wedding band plain',
    'silver chain necklace',
    'diamond solitaire ring',
    'pearl drop earrings',
    'mens leather watch',
  ],
  electronics: [
    'iphone 14 pro black',
    'macbook pro silver',
    'airpods pro case white',
    'sony wh1000xm4 headphones',
    'ipad pro tablet',
  ],
  documents: [
    'brown leather bifold wallet',
    'black cardholder slim',
    'us passport book',
  ],
  vehicle: [
    'toyota car key fob',
    'mountain bike blue',
  ],
  other: [
    'black north face backpack',
    'ray ban aviator sunglasses',
    'yeti water bottle',
    'nike baseball cap',
  ],
};

// Image augmentation settings
const AUGMENTATION_CONFIG = {
  rotate: { min: -20, max: 20 },
  brightness: { min: 0.8, max: 1.3 },
  saturation: { min: 0.7, max: 1.3 },
  blur: { min: 0.5, max: 2 },
  crop: { percentage: 0.15 }, // Crop 15% from edges
};

// Scraper settings
const SCRAPER_CONFIG = {
  delayBetweenRequests: 2500, // ms
  maxRetries: 3,
  imagesPerQuery: 30,
  minImageWidth: 200,
  minImageHeight: 200,
  maxImageWidth: 2000,
  maxImageHeight: 2000,
  timeout: 30000,
  userAgents: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  ],
};

// Seed script settings
const SEED_CONFIG = {
  batchSize: 50,
  delayBetweenCases: 1000, // ms (increased to avoid overwhelming server)
  checkpointInterval: 100, // Save checkpoint every N items
  maxConcurrent: 5,
};

// Validation thresholds
const VALIDATION_CONFIG = {
  minMatchDetectionRate: 0.8, // 80%
  expectedScores: {
    augmented: { min: 70, max: 95 },
    variations: { min: 50, max: 80 },
    similar: { min: 35, max: 60 },
  },
};

// File paths
const PATHS = {
  base: BASE_PATH,
  raw: RAW_PATH,
  processed: PROCESSED_PATH,
  matchPairs: MATCH_PAIRS_PATH,
  metadata: METADATA_PATH,
  lostItems: path.join(PROCESSED_PATH, 'lost'),
  foundItems: path.join(PROCESSED_PATH, 'found'),
  augmented: path.join(MATCH_PAIRS_PATH, 'augmented'),
  variations: path.join(MATCH_PAIRS_PATH, 'variations'),
  similar: path.join(MATCH_PAIRS_PATH, 'similar'),
  lostItemsMetadata: path.join(METADATA_PATH, 'lost-items.json'),
  foundItemsMetadata: path.join(METADATA_PATH, 'found-items.json'),
  expectedMatches: path.join(METADATA_PATH, 'expected-matches.json'),
  checkpoint: path.join(METADATA_PATH, 'checkpoint.json'),
  failures: path.join(METADATA_PATH, 'failures.json'),
};

// Generate random location within US
const generateRandomLocation = () => {
  // Major US cities with coordinates
  const cities = [
    { city: 'New York', state: 'NY', lat: 40.7128, lng: -74.0060 },
    { city: 'Los Angeles', state: 'CA', lat: 34.0522, lng: -118.2437 },
    { city: 'Chicago', state: 'IL', lat: 41.8781, lng: -87.6298 },
    { city: 'Houston', state: 'TX', lat: 29.7604, lng: -95.3698 },
    { city: 'Phoenix', state: 'AZ', lat: 33.4484, lng: -112.0740 },
    { city: 'San Francisco', state: 'CA', lat: 37.7749, lng: -122.4194 },
    { city: 'Seattle', state: 'WA', lat: 47.6062, lng: -122.3321 },
    { city: 'Miami', state: 'FL', lat: 25.7617, lng: -80.1918 },
    { city: 'Denver', state: 'CO', lat: 39.7392, lng: -104.9903 },
    { city: 'Boston', state: 'MA', lat: 42.3601, lng: -71.0589 },
  ];

  const baseCity = cities[Math.floor(Math.random() * cities.length)];

  // Add small random offset (within ~10 miles)
  const latOffset = (Math.random() - 0.5) * 0.3;
  const lngOffset = (Math.random() - 0.5) * 0.3;

  return {
    city: baseCity.city,
    state: baseCity.state,
    latitude: baseCity.lat + latOffset,
    longitude: baseCity.lng + lngOffset,
  };
};

// Generate case title based on category
const generateCaseTitle = (category, isLost) => {
  const titles = {
    pet: ['Missing Pet', 'Lost Dog', 'Lost Cat', 'Missing Puppy', 'Found Stray'],
    jewelry: ['Lost Jewelry', 'Missing Ring', 'Lost Necklace', 'Found Bracelet', 'Lost Watch'],
    electronics: ['Lost Phone', 'Missing Laptop', 'Lost Tablet', 'Found Device', 'Lost Camera'],
    documents: ['Lost Wallet', 'Missing ID', 'Lost Passport', 'Found Wallet', 'Lost Cards'],
    vehicle: ['Lost Keys', 'Missing Bike', 'Lost Helmet', 'Found Skateboard', 'Lost Scooter'],
    other: ['Lost Item', 'Missing Bag', 'Lost Umbrella', 'Found Backpack', 'Lost Sunglasses'],
  };

  const categoryTitles = titles[category] || titles.other;
  const prefix = isLost ? 'Lost' : 'Found';
  const randomTitle = categoryTitles[Math.floor(Math.random() * categoryTitles.length)];

  return randomTitle.startsWith(prefix) ? randomTitle : `${prefix} ${randomTitle.replace(/^(Lost|Found|Missing)\s*/i, '')}`;
};

// Generate case description
const generateCaseDescription = (category, isLost, location) => {
  const action = isLost ? 'lost' : 'found';
  const area = `${location.city}, ${location.state}`;

  const templates = {
    pet: [
      `${isLost ? 'Please help! I' : 'I'} ${action} this pet near ${area}. ${isLost ? 'Very missed!' : 'Looking for owner.'}`,
      `${isLost ? 'Missing' : 'Found'} pet in the ${area} area. ${isLost ? 'Reward offered!' : 'Contact if yours.'}`,
    ],
    jewelry: [
      `${isLost ? 'Lost' : 'Found'} this piece of jewelry in ${area}. ${isLost ? 'Sentimental value!' : 'Describe to claim.'}`,
    ],
    electronics: [
      `${isLost ? 'Lost' : 'Found'} electronic device near ${area}. ${isLost ? 'Please contact if found.' : 'Verify ownership to claim.'}`,
    ],
    documents: [
      `${isLost ? 'Lost' : 'Found'} wallet/documents in ${area}. ${isLost ? 'Important documents inside!' : 'Contact to verify and claim.'}`,
    ],
    vehicle: [
      `${isLost ? 'Lost' : 'Found'} this item in ${area}. ${isLost ? 'Need it back urgently!' : 'Describe to claim.'}`,
    ],
    other: [
      `${isLost ? 'Lost' : 'Found'} item near ${area}. ${isLost ? 'Please help!' : 'Contact to claim.'}`,
    ],
  };

  const categoryTemplates = templates[category] || templates.other;
  return categoryTemplates[Math.floor(Math.random() * categoryTemplates.length)];
};

module.exports = {
  API_BASE_URL,
  TEST_USERS,
  CATEGORIES,
  CATEGORY_DISTRIBUTION,
  MATCH_PAIRS_DISTRIBUTION,
  SEARCH_QUERIES,
  VARIATION_QUERIES,
  AUGMENTATION_CONFIG,
  SCRAPER_CONFIG,
  SEED_CONFIG,
  VALIDATION_CONFIG,
  PATHS,
  generateRandomLocation,
  generateCaseTitle,
  generateCaseDescription,
};
