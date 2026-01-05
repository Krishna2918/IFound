#!/usr/bin/env node

/**
 * Scraper CLI Runner
 *
 * Usage:
 *   node run.js              - Scrape all categories
 *   node run.js --category pet - Scrape specific category
 *   node run.js --stats      - Show current statistics
 */

const ImageScraper = require('./googleImageScraper');
const {
  SEARCH_QUERIES,
  CATEGORY_DISTRIBUTION,
  CATEGORIES,
} = require('../config');

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const showStats = args.includes('--stats');
  const categoryIndex = args.indexOf('--category');
  const specificCategory = categoryIndex >= 0 ? args[categoryIndex + 1] : null;

  const scraper = new ImageScraper();

  try {
    await scraper.init();

    if (showStats) {
      const stats = await scraper.getStats();
      console.log('\n=== Current Image Statistics ===');
      let total = 0;
      for (const [category, count] of Object.entries(stats)) {
        console.log(`  ${category}: ${count} images`);
        total += count;
      }
      console.log(`  TOTAL: ${total} images`);
      return;
    }

    if (specificCategory) {
      if (!CATEGORIES.includes(specificCategory)) {
        console.error(`Unknown category: ${specificCategory}`);
        console.error(`Valid categories: ${CATEGORIES.join(', ')}`);
        process.exit(1);
      }

      console.log(`\nScraping category: ${specificCategory}`);
      const queries = SEARCH_QUERIES[specificCategory] || [];
      const target = Math.ceil(CATEGORY_DISTRIBUTION[specificCategory] * 1.2);

      await scraper.scrapeCategory(specificCategory, queries, target);
    } else {
      console.log('\n=== Starting Full Scrape ===');
      console.log('Target distribution:');
      for (const [cat, count] of Object.entries(CATEGORY_DISTRIBUTION)) {
        console.log(`  ${cat}: ${count} (will oversample to ${Math.ceil(count * 1.2)})`);
      }
      console.log('');

      await scraper.scrapeAll(SEARCH_QUERIES, CATEGORY_DISTRIBUTION);
    }

    // Show final stats
    const stats = await scraper.getStats();
    console.log('\n=== Final Statistics ===');
    let total = 0;
    for (const [category, count] of Object.entries(stats)) {
      const target = CATEGORY_DISTRIBUTION[category] || 0;
      const status = count >= target ? 'OK' : 'NEED MORE';
      console.log(`  ${category}: ${count}/${target} [${status}]`);
      total += count;
    }
    console.log(`  TOTAL: ${total}/1000`);

  } catch (error) {
    console.error('Scraper error:', error);
    process.exit(1);
  } finally {
    await scraper.close();
  }
}

main().catch(console.error);
