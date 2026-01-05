/**
 * Variation Generator (Strategy 1)
 *
 * Creates match pairs using images from the same specific search query
 * (same object, different angle/photo). Expected similarity: 50-80%.
 */

const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const ImageScraper = require('../scraper/googleImageScraper');
const { VARIATION_QUERIES, PATHS, MATCH_PAIRS_DISTRIBUTION } = require('../config');

/**
 * Generate variation pairs for a category
 * Uses specific queries to find multiple photos of the same type of object
 */
async function generateVariationPairs(category, targetCount, scraper) {
  const queries = VARIATION_QUERIES[category] || [];

  if (queries.length === 0) {
    console.warn(`[Variation] No variation queries for ${category}`);
    return [];
  }

  const pairs = [];
  const pairsPerQuery = Math.ceil(targetCount / queries.length);

  for (const query of queries) {
    if (pairs.length >= targetCount) break;

    console.log(`[Variation] Searching: "${query}"`);

    // Get multiple images for the same specific query
    const imageUrls = await scraper.searchImages(query, pairsPerQuery * 2 + 5);

    if (imageUrls.length < 2) {
      console.warn(`[Variation] Not enough images for "${query}"`);
      continue;
    }

    // Pair consecutive images (they should be visually similar)
    for (let i = 0; i < imageUrls.length - 1 && pairs.length < targetCount; i += 2) {
      const pairId = uuidv4();

      // Download first as "lost"
      const lostFilename = `${category}_lost_var_${pairId}.jpg`;
      const lostPath = path.join(PATHS.lostItems, lostFilename);
      await fs.mkdir(path.dirname(lostPath), { recursive: true });

      const lostSuccess = await scraper.downloadImage(imageUrls[i], lostPath);
      if (!lostSuccess) continue;

      // Download second as "found"
      const foundFilename = `${category}_found_var_${pairId}.jpg`;
      const foundPath = path.join(PATHS.foundItems, foundFilename);

      const foundSuccess = await scraper.downloadImage(imageUrls[i + 1], foundPath);
      if (!foundSuccess) {
        // Clean up lost image
        await fs.unlink(lostPath).catch(() => {});
        continue;
      }

      pairs.push({
        pairId,
        category,
        strategy: 'variation',
        searchQuery: query,
        lostImage: lostFilename,
        foundImage: foundFilename,
        expectedScore: { min: 50, max: 80 },
      });

      console.log(`[Variation] Created pair ${pairs.length}/${targetCount} for ${category}`);
    }

    // Rate limiting
    await new Promise(r => setTimeout(r, 3000));
  }

  return pairs;
}

/**
 * Generate all variation pairs across categories
 */
async function generateAllVariationPairs() {
  console.log('[Variation] Starting variation pair generation...');

  const scraper = new ImageScraper();
  await scraper.init();

  const allPairs = [];

  try {
    // Calculate pairs per category (40 total for variation strategy)
    const totalVariations = 40;
    const totalDistribution = Object.values(MATCH_PAIRS_DISTRIBUTION).reduce((a, b) => a + b, 0);

    for (const [category, count] of Object.entries(MATCH_PAIRS_DISTRIBUTION)) {
      const categoryVariations = Math.round((count / totalDistribution) * totalVariations);

      if (categoryVariations > 0 && VARIATION_QUERIES[category]?.length > 0) {
        console.log(`[Variation] Generating ${categoryVariations} pairs for ${category}`);
        const pairs = await generateVariationPairs(category, categoryVariations, scraper);
        allPairs.push(...pairs);
      }
    }
  } finally {
    await scraper.close();
  }

  console.log(`[Variation] Generated ${allPairs.length} variation pairs`);
  return allPairs;
}

module.exports = {
  generateVariationPairs,
  generateAllVariationPairs,
};
