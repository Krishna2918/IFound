#!/usr/bin/env node

/**
 * Generator Orchestration CLI
 *
 * Usage:
 *   node run.js                    - Generate all match pairs
 *   node run.js --strategy augmented - Only augmented pairs
 *   node run.js --strategy variation - Only variation pairs
 *   node run.js --strategy similar   - Only similar pairs
 */

const fs = require('fs').promises;
const path = require('path');

const { generateAllAugmentedPairs } = require('./augmentationGenerator');
const { generateAllVariationPairs } = require('./variationGenerator');
const { generateAllSimilarPairs } = require('./similarItemGenerator');
const { PATHS } = require('../config');

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const strategyIndex = args.indexOf('--strategy');
  const strategy = strategyIndex >= 0 ? args[strategyIndex + 1] : 'all';

  console.log('=== Match Pair Generator ===\n');
  console.log(`Strategy: ${strategy}`);

  let allPairs = [];

  try {
    if (strategy === 'all' || strategy === 'augmented') {
      console.log('\n--- Generating Augmented Pairs (Strategy 3) ---');
      const augmentedPairs = await generateAllAugmentedPairs();
      allPairs.push(...augmentedPairs);
    }

    if (strategy === 'all' || strategy === 'variation') {
      console.log('\n--- Generating Variation Pairs (Strategy 1) ---');
      const variationPairs = await generateAllVariationPairs();
      allPairs.push(...variationPairs);
    }

    if (strategy === 'all' || strategy === 'similar') {
      console.log('\n--- Generating Similar Pairs (Strategy 2) ---');
      const similarPairs = await generateAllSimilarPairs();
      allPairs.push(...similarPairs);
    }

    // Save metadata
    await fs.mkdir(PATHS.metadata, { recursive: true });
    await fs.writeFile(
      PATHS.expectedMatches,
      JSON.stringify(allPairs, null, 2)
    );

    // Print summary
    console.log('\n=== Generation Complete ===');
    console.log(`Total pairs generated: ${allPairs.length}`);

    const byStrategy = {
      augmented: allPairs.filter(p => p.strategy === 'augmented').length,
      variation: allPairs.filter(p => p.strategy === 'variation').length,
      similar: allPairs.filter(p => p.strategy === 'similar').length,
    };

    console.log('\nBy strategy:');
    for (const [strat, count] of Object.entries(byStrategy)) {
      console.log(`  ${strat}: ${count}`);
    }

    const byCategory = {};
    for (const pair of allPairs) {
      byCategory[pair.category] = (byCategory[pair.category] || 0) + 1;
    }

    console.log('\nBy category:');
    for (const [cat, count] of Object.entries(byCategory)) {
      console.log(`  ${cat}: ${count}`);
    }

    console.log(`\nMetadata saved to: ${PATHS.expectedMatches}`);

  } catch (error) {
    console.error('Generator error:', error);
    process.exit(1);
  }
}

main().catch(console.error);
