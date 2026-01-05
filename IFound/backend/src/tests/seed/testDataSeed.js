#!/usr/bin/env node

/**
 * Test Data Seed Script
 *
 * Main orchestration script for seeding test data:
 * 1. Authenticate as User 1 and User 2
 * 2. Create 1000 lost item cases (User 2)
 * 3. Create 1000 found item cases (User 1)
 * 4. Track expected matches from generators
 *
 * Usage:
 *   node testDataSeed.js              - Run full seed
 *   node testDataSeed.js --resume     - Resume from checkpoint
 *   node testDataSeed.js --lost-only  - Only seed lost items
 *   node testDataSeed.js --found-only - Only seed found items
 */

const fs = require('fs').promises;
const path = require('path');
const {
  getUser1Token,
  getUser2Token,
  ensureTestUsersExist,
  clearTokenCache,
} = require('../helpers/authHelper');
const {
  createCaseWithPhoto,
  sleep,
} = require('../helpers/caseCreator');
const {
  PATHS,
  CATEGORY_DISTRIBUTION,
  SEED_CONFIG,
} = require('../config');

// Token refresh tracking
let lastTokenRefresh = Date.now();
const TOKEN_REFRESH_INTERVAL = 45 * 60 * 1000; // Refresh every 45 minutes

// Progress tracking
let checkpoint = {
  lostCreated: 0,
  foundCreated: 0,
  lostItems: [],
  foundItems: [],
  failures: [],
  startedAt: null,
  lastUpdated: null,
};

/**
 * Load checkpoint if exists
 */
async function loadCheckpoint() {
  try {
    const data = await fs.readFile(PATHS.checkpoint, 'utf8');
    checkpoint = JSON.parse(data);
    console.log(`[Seed] Loaded checkpoint: ${checkpoint.lostCreated} lost, ${checkpoint.foundCreated} found`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Save checkpoint
 */
async function saveCheckpoint() {
  checkpoint.lastUpdated = new Date().toISOString();
  await fs.mkdir(path.dirname(PATHS.checkpoint), { recursive: true });
  await fs.writeFile(PATHS.checkpoint, JSON.stringify(checkpoint, null, 2));
}

/**
 * Get images to seed for a type (lost or found)
 */
async function getImagesToSeed(type) {
  const dir = type === 'lost' ? PATHS.lostItems : PATHS.foundItems;
  const items = [];

  try {
    const files = await fs.readdir(dir);
    const jpgFiles = files.filter(f => f.endsWith('.jpg'));

    for (const filename of jpgFiles) {
      // Extract category from filename (format: category_type_id.jpg)
      const parts = filename.split('_');
      const category = parts[0];

      items.push({
        filename,
        imagePath: path.join(dir, filename),
        category,
        pairId: parts.slice(2).join('_').replace('.jpg', ''),
      });
    }
  } catch (error) {
    console.error(`[Seed] Error reading ${dir}:`, error.message);
  }

  return items;
}

/**
 * Get remaining raw images to fill quota
 */
async function getRemainingImages(type, alreadySeeded) {
  const items = [];
  const seededFilenames = new Set(alreadySeeded.map(i => i.originalFilename || i.filename));

  // Calculate how many we need per category
  const totalNeeded = 1000;
  const alreadyCount = alreadySeeded.length;
  const remaining = Math.max(0, totalNeeded - alreadyCount);

  if (remaining === 0) {
    return items;
  }

  console.log(`[Seed] Need ${remaining} more ${type} items to reach 1000`);

  // Get from raw images
  for (const [category, target] of Object.entries(CATEGORY_DISTRIBUTION)) {
    const catSeeded = alreadySeeded.filter(i => i.category === category).length;
    const catNeeded = Math.max(0, target - catSeeded);

    if (catNeeded === 0) continue;

    const categoryDir = path.join(PATHS.raw, category);
    try {
      const files = await fs.readdir(categoryDir);
      const jpgFiles = files.filter(f => f.endsWith('.jpg') && !seededFilenames.has(f));

      const shuffled = jpgFiles.sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, catNeeded);

      for (const filename of selected) {
        items.push({
          filename,
          imagePath: path.join(categoryDir, filename),
          category,
          pairId: null,
        });
      }
    } catch {
      console.warn(`[Seed] No raw images for category ${category}`);
    }
  }

  return items;
}

/**
 * Get fresh token, refreshing if needed
 */
async function getFreshToken(type) {
  const now = Date.now();

  // Check if we need to refresh
  if (now - lastTokenRefresh > TOKEN_REFRESH_INTERVAL) {
    console.log('[Seed] Refreshing authentication tokens...');
    clearTokenCache();
    lastTokenRefresh = now;
  }

  return type === 'lost' ? getUser2Token() : getUser1Token();
}

/**
 * Seed items of a specific type
 */
async function seedItems(type) {
  const isLost = type === 'lost';
  const checkpointKey = isLost ? 'lostItems' : 'foundItems';
  const createdKey = isLost ? 'lostCreated' : 'foundCreated';

  console.log(`\n=== Seeding ${type.toUpperCase()} Items ===`);

  // Get images from processed directory (match pairs)
  const processedItems = await getImagesToSeed(type);
  console.log(`[Seed] Found ${processedItems.length} processed ${type} items`);

  // Get remaining images to fill quota
  const remainingItems = await getRemainingImages(type, [
    ...checkpoint[checkpointKey],
    ...processedItems,
  ]);
  console.log(`[Seed] Found ${remainingItems.length} additional raw items`);

  // Combine and filter already seeded
  const seededFilenames = new Set(checkpoint[checkpointKey].map(i => i.originalFilename));
  const allItems = [...processedItems, ...remainingItems]
    .filter(i => !seededFilenames.has(i.filename));

  console.log(`[Seed] ${allItems.length} items to seed for ${type}`);

  if (allItems.length === 0) {
    console.log(`[Seed] All ${type} items already seeded`);
    return;
  }

  // Seed items
  let created = 0;
  let failed = 0;

  for (let i = 0; i < allItems.length; i++) {
    const item = allItems[i];

    try {
      // Get fresh token (will refresh if needed)
      const token = await getFreshToken(type);

      const result = await createCaseWithPhoto(token, {
        imagePath: item.imagePath,
        category: item.category,
        type,
      });

      checkpoint[checkpointKey].push({
        ...result,
        originalFilename: item.filename,
        pairId: item.pairId,
      });

      checkpoint[createdKey]++;
      created++;

      // Progress
      if (created % 10 === 0) {
        console.log(`[Seed] ${type}: ${created}/${allItems.length} created (total: ${checkpoint[createdKey]})`);
      }

      // Checkpoint every N items
      if (created % SEED_CONFIG.checkpointInterval === 0) {
        await saveCheckpoint();
        console.log(`[Seed] Checkpoint saved`);
      }
    } catch (error) {
      failed++;
      checkpoint.failures.push({
        type,
        filename: item.filename,
        error: error.message,
        timestamp: new Date().toISOString(),
      });

      console.error(`[Seed] Failed to create ${type} case for ${item.filename}: ${error.message}`);

      // If we get a 401, force token refresh and retry once
      if (error.message.includes('401')) {
        console.log('[Seed] Got 401, forcing token refresh...');
        clearTokenCache();
        lastTokenRefresh = Date.now();
      }
    }

    await sleep(SEED_CONFIG.delayBetweenCases);
  }

  // Final checkpoint
  await saveCheckpoint();

  console.log(`\n[Seed] ${type.toUpperCase()} seeding complete:`);
  console.log(`  Created: ${created}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total: ${checkpoint[createdKey]}`);
}

/**
 * Generate match metadata linking lost and found items
 */
async function generateMatchMetadata() {
  console.log('\n=== Generating Match Metadata ===');

  // Load expected matches from generators
  let expectedMatches = [];
  try {
    const data = await fs.readFile(PATHS.expectedMatches, 'utf8');
    expectedMatches = JSON.parse(data);
  } catch {
    console.log('[Seed] No expected matches file found');
  }

  // Link with created items
  const linkedMatches = [];

  for (const match of expectedMatches) {
    const lostItem = checkpoint.lostItems.find(i =>
      i.originalFilename === match.lostImage ||
      i.pairId === match.pairId
    );

    const foundItem = checkpoint.foundItems.find(i =>
      i.originalFilename === match.foundImage ||
      i.pairId === match.pairId
    );

    if (lostItem && foundItem) {
      linkedMatches.push({
        ...match,
        lostCaseId: lostItem.caseId,
        lostPhotoId: lostItem.photoId,
        foundCaseId: foundItem.caseId,
        foundPhotoId: foundItem.photoId,
      });
    }
  }

  console.log(`[Seed] Linked ${linkedMatches.length}/${expectedMatches.length} expected matches`);

  // Save updated metadata
  await fs.writeFile(
    PATHS.expectedMatches,
    JSON.stringify(linkedMatches, null, 2)
  );

  return linkedMatches;
}

/**
 * Save final metadata files
 */
async function saveFinalMetadata() {
  console.log('\n=== Saving Final Metadata ===');

  // Save lost items metadata
  await fs.writeFile(
    PATHS.lostItemsMetadata,
    JSON.stringify(checkpoint.lostItems, null, 2)
  );
  console.log(`[Seed] Saved ${checkpoint.lostItems.length} lost items metadata`);

  // Save found items metadata
  await fs.writeFile(
    PATHS.foundItemsMetadata,
    JSON.stringify(checkpoint.foundItems, null, 2)
  );
  console.log(`[Seed] Saved ${checkpoint.foundItems.length} found items metadata`);

  // Save failures
  if (checkpoint.failures.length > 0) {
    await fs.writeFile(
      PATHS.failures,
      JSON.stringify(checkpoint.failures, null, 2)
    );
    console.log(`[Seed] Saved ${checkpoint.failures.length} failures`);
  }
}

/**
 * Main seed function
 */
async function main() {
  const args = process.argv.slice(2);
  const resumeMode = args.includes('--resume');
  const lostOnly = args.includes('--lost-only');
  const foundOnly = args.includes('--found-only');

  console.log('=== Test Data Seed ===\n');
  console.log(`Mode: ${resumeMode ? 'Resume' : 'Fresh'}`);
  console.log(`Scope: ${lostOnly ? 'Lost only' : foundOnly ? 'Found only' : 'All'}`);

  // Load or initialize checkpoint
  if (resumeMode) {
    const loaded = await loadCheckpoint();
    if (!loaded) {
      console.log('[Seed] No checkpoint found, starting fresh');
    }
  } else {
    checkpoint = {
      lostCreated: 0,
      foundCreated: 0,
      lostItems: [],
      foundItems: [],
      failures: [],
      startedAt: new Date().toISOString(),
      lastUpdated: null,
    };
  }

  try {
    // Ensure test users exist
    await ensureTestUsersExist();

    // Seed lost items (User 2) - tokens are fetched and refreshed automatically
    if (!foundOnly) {
      await seedItems('lost');
    }

    // Seed found items (User 1) - tokens are fetched and refreshed automatically
    if (!lostOnly) {
      await seedItems('found');
    }

    // Generate match metadata
    await generateMatchMetadata();

    // Save final metadata
    await saveFinalMetadata();

    // Summary
    console.log('\n=== Seed Complete ===');
    console.log(`Lost items created: ${checkpoint.lostCreated}`);
    console.log(`Found items created: ${checkpoint.foundCreated}`);
    console.log(`Total failures: ${checkpoint.failures.length}`);
    console.log(`\nMetadata saved to: ${PATHS.metadata}`);

  } catch (error) {
    console.error('\n[Seed] Fatal error:', error);
    await saveCheckpoint();
    process.exit(1);
  }
}

main().catch(console.error);
