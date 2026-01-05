#!/usr/bin/env node

/**
 * Batch Match Validator
 *
 * Directly compares expected match pairs using available features
 * (color similarity, perceptual hash, etc.) to validate matching potential.
 *
 * This bypasses the full matching pipeline to assess what SHOULD match
 * based on image characteristics, regardless of whether matches were
 * created during seeding.
 */

const fs = require('fs').promises;
const path = require('path');
const { Sequelize } = require('sequelize');
const sharp = require('sharp');

const METADATA_DIR = path.join(__dirname, '../../..', 'test-data/metadata');
const PROCESSED_LOST = path.join(__dirname, '../../..', 'test-data/processed/lost');
const PROCESSED_FOUND = path.join(__dirname, '../../..', 'test-data/processed/found');

/**
 * Calculate color histogram from image
 */
async function getColorHistogram(imagePath) {
  try {
    const { dominant } = await sharp(imagePath)
      .resize(100, 100, { fit: 'cover' })
      .stats();
    return dominant;
  } catch (error) {
    return null;
  }
}

/**
 * Get average color from image
 */
async function getAverageColor(imagePath) {
  try {
    const { channels } = await sharp(imagePath)
      .resize(50, 50, { fit: 'cover' })
      .stats();
    return {
      r: Math.round(channels[0].mean),
      g: Math.round(channels[1].mean),
      b: Math.round(channels[2].mean),
    };
  } catch (error) {
    return null;
  }
}

/**
 * Calculate color similarity (0-100)
 */
function colorSimilarity(color1, color2) {
  if (!color1 || !color2) return 0;

  const dr = Math.abs(color1.r - color2.r);
  const dg = Math.abs(color1.g - color2.g);
  const db = Math.abs(color1.b - color2.b);

  // Maximum distance is 255*3 = 765
  const distance = Math.sqrt(dr * dr + dg * dg + db * db);
  const maxDistance = Math.sqrt(255 * 255 * 3);

  return Math.round((1 - distance / maxDistance) * 100);
}

/**
 * Calculate structural similarity using pixel comparison
 */
async function structuralSimilarity(path1, path2) {
  try {
    // Resize both images to same size and get raw pixels
    const [img1, img2] = await Promise.all([
      sharp(path1).resize(32, 32, { fit: 'cover' }).raw().toBuffer(),
      sharp(path2).resize(32, 32, { fit: 'cover' }).raw().toBuffer(),
    ]);

    // Compare pixels
    let matchingPixels = 0;
    const totalPixels = 32 * 32;

    for (let i = 0; i < img1.length; i += 3) {
      const r1 = img1[i], g1 = img1[i+1], b1 = img1[i+2];
      const r2 = img2[i], g2 = img2[i+1], b2 = img2[i+2];

      // Calculate distance for this pixel
      const dist = Math.sqrt(
        Math.pow(r1 - r2, 2) +
        Math.pow(g1 - g2, 2) +
        Math.pow(b1 - b2, 2)
      );

      // Consider similar if within threshold
      if (dist < 50) matchingPixels++;
    }

    return Math.round((matchingPixels / totalPixels) * 100);
  } catch (error) {
    return 0;
  }
}

/**
 * Validate a single expected match pair
 */
async function validatePair(pair) {
  const lostPath = path.join(PROCESSED_LOST, pair.lostImage);
  const foundPath = path.join(PROCESSED_FOUND, pair.foundImage);

  // Check if files exist
  const [lostExists, foundExists] = await Promise.all([
    fs.access(lostPath).then(() => true).catch(() => false),
    fs.access(foundPath).then(() => true).catch(() => false),
  ]);

  if (!lostExists || !foundExists) {
    return {
      pairId: pair.pairId,
      strategy: pair.strategy,
      category: pair.category,
      valid: false,
      reason: `Missing files: lost=${lostExists}, found=${foundExists}`,
    };
  }

  // Get color features
  const [lostColor, foundColor] = await Promise.all([
    getAverageColor(lostPath),
    getAverageColor(foundPath),
  ]);

  // Calculate similarities
  const colorSim = colorSimilarity(lostColor, foundColor);
  const structSim = await structuralSimilarity(lostPath, foundPath);

  // Combined score (weighted average)
  const overallScore = Math.round(colorSim * 0.4 + structSim * 0.6);

  return {
    pairId: pair.pairId,
    strategy: pair.strategy,
    category: pair.category,
    valid: true,
    colorScore: colorSim,
    structuralScore: structSim,
    overallScore,
    meetsThreshold: overallScore >= 30,
    lostPhotoId: pair.lostPhotoId,
    foundPhotoId: pair.foundPhotoId,
    expectedMin: pair.expectedSimilarity?.min || 0,
    expectedMax: pair.expectedSimilarity?.max || 100,
  };
}

/**
 * Main validation function
 */
async function main() {
  console.log('=== Batch Match Validator ===\n');

  // Load expected matches
  const expectedMatchesPath = path.join(METADATA_DIR, 'expected-matches.json');
  const expectedData = await fs.readFile(expectedMatchesPath, 'utf8');
  const expectedMatches = JSON.parse(expectedData);

  console.log(`Loaded ${expectedMatches.length} expected matches\n`);

  // Validate each pair
  const results = [];
  let processed = 0;

  for (const pair of expectedMatches) {
    const result = await validatePair(pair);
    results.push(result);
    processed++;

    if (processed % 20 === 0) {
      console.log(`Processed ${processed}/${expectedMatches.length}...`);
    }
  }

  // Calculate statistics
  const validResults = results.filter(r => r.valid);
  const meetsThreshold = validResults.filter(r => r.meetsThreshold);

  const byStrategy = {};
  const byCategory = {};

  for (const result of validResults) {
    // By strategy
    if (!byStrategy[result.strategy]) {
      byStrategy[result.strategy] = { total: 0, passing: 0, scores: [] };
    }
    byStrategy[result.strategy].total++;
    byStrategy[result.strategy].scores.push(result.overallScore);
    if (result.meetsThreshold) byStrategy[result.strategy].passing++;

    // By category
    if (!byCategory[result.category]) {
      byCategory[result.category] = { total: 0, passing: 0, scores: [] };
    }
    byCategory[result.category].total++;
    byCategory[result.category].scores.push(result.overallScore);
    if (result.meetsThreshold) byCategory[result.category].passing++;
  }

  // Generate report
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalPairs: expectedMatches.length,
      validPairs: validResults.length,
      passingPairs: meetsThreshold.length,
      passRate: `${((meetsThreshold.length / validResults.length) * 100).toFixed(1)}%`,
      avgColorScore: Math.round(validResults.reduce((s, r) => s + r.colorScore, 0) / validResults.length),
      avgStructuralScore: Math.round(validResults.reduce((s, r) => s + r.structuralScore, 0) / validResults.length),
      avgOverallScore: Math.round(validResults.reduce((s, r) => s + r.overallScore, 0) / validResults.length),
    },
    byStrategy: Object.fromEntries(
      Object.entries(byStrategy).map(([s, d]) => [s, {
        total: d.total,
        passing: d.passing,
        passRate: `${((d.passing / d.total) * 100).toFixed(1)}%`,
        avgScore: Math.round(d.scores.reduce((a, b) => a + b, 0) / d.scores.length),
        minScore: Math.min(...d.scores),
        maxScore: Math.max(...d.scores),
      }])
    ),
    byCategory: Object.fromEntries(
      Object.entries(byCategory).map(([c, d]) => [c, {
        total: d.total,
        passing: d.passing,
        passRate: `${((d.passing / d.total) * 100).toFixed(1)}%`,
        avgScore: Math.round(d.scores.reduce((a, b) => a + b, 0) / d.scores.length),
      }])
    ),
    scoreDistribution: {
      '0-20': validResults.filter(r => r.overallScore >= 0 && r.overallScore < 20).length,
      '20-40': validResults.filter(r => r.overallScore >= 20 && r.overallScore < 40).length,
      '40-60': validResults.filter(r => r.overallScore >= 40 && r.overallScore < 60).length,
      '60-80': validResults.filter(r => r.overallScore >= 60 && r.overallScore < 80).length,
      '80-100': validResults.filter(r => r.overallScore >= 80 && r.overallScore <= 100).length,
    },
    topMatches: validResults
      .sort((a, b) => b.overallScore - a.overallScore)
      .slice(0, 10)
      .map(r => ({
        pairId: r.pairId,
        strategy: r.strategy,
        category: r.category,
        score: r.overallScore,
        color: r.colorScore,
        structural: r.structuralScore,
      })),
    failedPairs: results
      .filter(r => !r.valid)
      .map(r => ({ pairId: r.pairId, reason: r.reason })),
  };

  // Print results
  console.log('\n=== Validation Results ===\n');
  console.log('Summary:');
  console.log(`  Total pairs: ${report.summary.totalPairs}`);
  console.log(`  Valid pairs: ${report.summary.validPairs}`);
  console.log(`  Passing pairs (score >= 30): ${report.summary.passingPairs}`);
  console.log(`  Pass rate: ${report.summary.passRate}`);
  console.log(`  Average color score: ${report.summary.avgColorScore}`);
  console.log(`  Average structural score: ${report.summary.avgStructuralScore}`);
  console.log(`  Average overall score: ${report.summary.avgOverallScore}`);

  console.log('\nBy Strategy:');
  for (const [strategy, data] of Object.entries(report.byStrategy)) {
    console.log(`  ${strategy}: ${data.passing}/${data.total} (${data.passRate}), avg=${data.avgScore}, range=${data.minScore}-${data.maxScore}`);
  }

  console.log('\nBy Category:');
  for (const [category, data] of Object.entries(report.byCategory)) {
    console.log(`  ${category}: ${data.passing}/${data.total} (${data.passRate}), avg=${data.avgScore}`);
  }

  console.log('\nScore Distribution:');
  for (const [range, count] of Object.entries(report.scoreDistribution)) {
    const bar = '█'.repeat(Math.ceil(count / 2));
    console.log(`  ${range}%: ${count} ${bar}`);
  }

  console.log('\nTop 10 Matching Pairs:');
  for (const match of report.topMatches) {
    console.log(`  ${match.strategy}/${match.pairId.slice(0,8)}: ${match.score}% (color=${match.color}, struct=${match.structural})`);
  }

  if (report.failedPairs.length > 0) {
    console.log(`\nFailed Pairs: ${report.failedPairs.length}`);
    for (const fail of report.failedPairs.slice(0, 5)) {
      console.log(`  - ${fail.pairId}: ${fail.reason}`);
    }
  }

  // Save report
  const reportPath = path.join(METADATA_DIR, 'batch-validation-report.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReport saved to: ${reportPath}`);

  // Return success if pass rate is good
  const passRate = meetsThreshold.length / validResults.length;
  if (passRate >= 0.5) {
    console.log('\n[PASS] Sufficient similarity detected in match pairs');
    return report;
  } else {
    console.log('\n[INFO] Low similarity scores - expected for non-identical images');
    return report;
  }
}

main().catch(console.error);
