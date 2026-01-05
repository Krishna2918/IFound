#!/usr/bin/env node

/**
 * Rebuild Expected Matches
 *
 * Scans the lost-items.json and found-items.json metadata files
 * to find all items with matching pairIds and creates a proper
 * expected-matches.json file with actual photo IDs.
 */

const fs = require('fs').promises;
const path = require('path');

const METADATA_DIR = path.join(__dirname, '../../..', 'test-data/metadata');

async function rebuildExpectedMatches() {
  console.log('=== Rebuilding Expected Matches ===\n');

  // Load lost and found items metadata
  const lostItemsPath = path.join(METADATA_DIR, 'lost-items.json');
  const foundItemsPath = path.join(METADATA_DIR, 'found-items.json');
  const expectedMatchesPath = path.join(METADATA_DIR, 'expected-matches.json');

  let lostItems, foundItems;

  try {
    const lostData = await fs.readFile(lostItemsPath, 'utf8');
    lostItems = JSON.parse(lostData);
    console.log(`Loaded ${lostItems.length} lost items`);
  } catch (error) {
    console.error('Failed to load lost items:', error.message);
    return;
  }

  try {
    const foundData = await fs.readFile(foundItemsPath, 'utf8');
    foundItems = JSON.parse(foundData);
    console.log(`Loaded ${foundItems.length} found items`);
  } catch (error) {
    console.error('Failed to load found items:', error.message);
    return;
  }

  // Create a map of found items by pairId for faster lookup
  const foundByPairId = new Map();
  for (const item of foundItems) {
    if (item.pairId) {
      foundByPairId.set(item.pairId, item);
    }
  }

  // Find all matching pairs
  const expectedMatches = [];
  const stats = {
    augmented: 0,  // Strategy 3: augmented duplicates (should have high similarity)
    similar: 0,    // Strategy 2: similar items (_sim_)
    variation: 0,  // Strategy 1: variations (_var_)
    standard: 0,   // Regular pair matches
  };

  for (const lostItem of lostItems) {
    if (!lostItem.pairId) continue;

    const foundItem = foundByPairId.get(lostItem.pairId);
    if (!foundItem) continue;

    // Determine match strategy based on pairId pattern
    let strategy = 'standard';
    let expectedSimilarity = { min: 0.30, max: 0.70 };

    if (lostItem.pairId.startsWith('sim_')) {
      strategy = 'similar';
      expectedSimilarity = { min: 0.35, max: 0.60 };
      stats.similar++;
    } else if (lostItem.pairId.startsWith('var_')) {
      strategy = 'variation';
      expectedSimilarity = { min: 0.50, max: 0.80 };
      stats.variation++;
    } else if (lostItem.pairId.startsWith('aug_')) {
      strategy = 'augmented';
      expectedSimilarity = { min: 0.70, max: 0.95 };
      stats.augmented++;
    } else {
      // Standard pairs (augmented duplicates from same image)
      // These should have high similarity since they're the same image with modifications
      strategy = 'augmented';
      expectedSimilarity = { min: 0.60, max: 0.95 };
      stats.standard++;
    }

    expectedMatches.push({
      pairId: lostItem.pairId,
      strategy,
      category: lostItem.category,
      lostCaseId: lostItem.caseId,
      lostPhotoId: lostItem.photoId,
      lostImage: lostItem.originalFilename,
      foundCaseId: foundItem.caseId,
      foundPhotoId: foundItem.photoId,
      foundImage: foundItem.originalFilename,
      expectedSimilarity,
    });
  }

  console.log(`\nFound ${expectedMatches.length} matching pairs:`);
  console.log(`  - Augmented (high similarity): ${stats.augmented + stats.standard}`);
  console.log(`  - Similar items (_sim_): ${stats.similar}`);
  console.log(`  - Variations (_var_): ${stats.variation}`);

  // Save expected matches
  await fs.writeFile(expectedMatchesPath, JSON.stringify(expectedMatches, null, 2));
  console.log(`\nSaved expected matches to: ${expectedMatchesPath}`);

  // Show breakdown by category
  const byCategory = {};
  for (const match of expectedMatches) {
    byCategory[match.category] = (byCategory[match.category] || 0) + 1;
  }
  console.log('\nBreakdown by category:');
  for (const [cat, count] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${count}`);
  }

  return expectedMatches;
}

// Run if called directly
if (require.main === module) {
  rebuildExpectedMatches().catch(console.error);
}

module.exports = { rebuildExpectedMatches };
