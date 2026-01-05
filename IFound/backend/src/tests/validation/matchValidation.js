#!/usr/bin/env node

/**
 * Match Validation Script
 *
 * Validates the neural network matching system by comparing
 * expected matches (from generators) with actual matches (from database).
 *
 * Usage:
 *   node matchValidation.js           - Run validation
 *   node matchValidation.js --verbose - Show detailed match info
 */

const fs = require('fs').promises;
const path = require('path');
const { Sequelize } = require('sequelize');
const { PATHS, VALIDATION_CONFIG } = require('../config');

// Database connection (reuse from main app)
let sequelize;
let PhotoMatch;

/**
 * Initialize database connection
 */
async function initDatabase() {
  // Try to use existing database config
  try {
    const dbConfig = require('../../config/database');
    sequelize = dbConfig.sequelize;
    PhotoMatch = require('../../models/PhotoMatch');
  } catch (error) {
    // Fallback to environment variables
    sequelize = new Sequelize(
      process.env.DATABASE_URL || 'postgres://ifound:ifound@localhost:5432/ifound',
      {
        logging: false,
        dialect: 'postgres',
      }
    );

    await sequelize.authenticate();
    console.log('[Validation] Database connected');

    // Define minimal PhotoMatch model
    PhotoMatch = sequelize.define('PhotoMatch', {
      id: { type: Sequelize.UUID, primaryKey: true },
      source_photo_id: Sequelize.UUID,
      target_photo_id: Sequelize.UUID,
      overall_score: Sequelize.INTEGER,
      source_feedback: Sequelize.STRING,
      target_feedback: Sequelize.STRING,
      status: Sequelize.STRING,
      match_reasons: Sequelize.JSONB,
    }, {
      tableName: 'photo_matches',
      underscored: true,
    });
  }
}

/**
 * Load expected matches from metadata
 */
async function loadExpectedMatches() {
  try {
    const data = await fs.readFile(PATHS.expectedMatches, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('[Validation] Failed to load expected matches:', error.message);
    return [];
  }
}

/**
 * Get actual matches from database
 */
async function getActualMatches(photoIds) {
  const matches = await PhotoMatch.findAll({
    where: {
      [Sequelize.Op.or]: [
        { source_photo_id: { [Sequelize.Op.in]: photoIds } },
        { target_photo_id: { [Sequelize.Op.in]: photoIds } },
      ],
    },
    raw: true,
  });

  return matches;
}

/**
 * Check if an expected match was found
 */
function findActualMatch(expected, actualMatches) {
  // Look for match in either direction
  const match = actualMatches.find(m =>
    (m.source_photo_id === expected.lostPhotoId && m.target_photo_id === expected.foundPhotoId) ||
    (m.source_photo_id === expected.foundPhotoId && m.target_photo_id === expected.lostPhotoId)
  );

  return match;
}

/**
 * Calculate validation metrics
 */
function calculateMetrics(results) {
  const total = results.length;
  const detected = results.filter(r => r.detected).length;
  const missed = total - detected;

  // True positives = detected expected matches
  const truePositives = detected;

  // False negatives = missed expected matches
  const falseNegatives = missed;

  // Calculate rates
  const recall = total > 0 ? truePositives / total : 0;

  // Group by strategy
  const byStrategy = {};
  for (const result of results) {
    const strategy = result.expected.strategy;
    if (!byStrategy[strategy]) {
      byStrategy[strategy] = { total: 0, detected: 0, scores: [] };
    }
    byStrategy[strategy].total++;
    if (result.detected) {
      byStrategy[strategy].detected++;
      byStrategy[strategy].scores.push(result.actualScore);
    }
  }

  // Group by category
  const byCategory = {};
  for (const result of results) {
    const category = result.expected.category;
    if (!byCategory[category]) {
      byCategory[category] = { total: 0, detected: 0, scores: [] };
    }
    byCategory[category].total++;
    if (result.detected) {
      byCategory[category].detected++;
      byCategory[category].scores.push(result.actualScore);
    }
  }

  // Calculate average scores
  const allScores = results.filter(r => r.detected).map(r => r.actualScore);
  const avgScore = allScores.length > 0
    ? allScores.reduce((a, b) => a + b, 0) / allScores.length
    : 0;

  // Score distribution
  const scoreDistribution = {
    '0-30': allScores.filter(s => s >= 0 && s < 30).length,
    '30-50': allScores.filter(s => s >= 30 && s < 50).length,
    '50-70': allScores.filter(s => s >= 50 && s < 70).length,
    '70-90': allScores.filter(s => s >= 70 && s < 90).length,
    '90-100': allScores.filter(s => s >= 90 && s <= 100).length,
  };

  return {
    total,
    detected,
    missed,
    truePositives,
    falseNegatives,
    recall,
    matchDetectionRate: recall,
    avgScore: Math.round(avgScore * 10) / 10,
    scoreDistribution,
    byStrategy,
    byCategory,
  };
}

/**
 * Validate score ranges
 */
function validateScoreRanges(results) {
  const issues = [];

  for (const result of results) {
    if (!result.detected) continue;

    const expected = result.expected.expectedScore;
    const actual = result.actualScore;

    if (actual < expected.min) {
      issues.push({
        pairId: result.expected.pairId,
        strategy: result.expected.strategy,
        issue: 'Score too low',
        expected: `${expected.min}-${expected.max}`,
        actual,
      });
    } else if (actual > expected.max) {
      issues.push({
        pairId: result.expected.pairId,
        strategy: result.expected.strategy,
        issue: 'Score too high',
        expected: `${expected.min}-${expected.max}`,
        actual,
      });
    }
  }

  return issues;
}

/**
 * Run validation
 */
async function runValidation(verbose = false) {
  console.log('=== Match Validation ===\n');

  // Initialize database
  await initDatabase();

  // Load expected matches
  const expectedMatches = await loadExpectedMatches();
  console.log(`[Validation] Loaded ${expectedMatches.length} expected matches`);

  if (expectedMatches.length === 0) {
    console.log('[Validation] No expected matches to validate');
    return null;
  }

  // Get photo IDs
  const photoIds = [
    ...expectedMatches.map(m => m.lostPhotoId).filter(Boolean),
    ...expectedMatches.map(m => m.foundPhotoId).filter(Boolean),
  ];

  // Get actual matches
  const actualMatches = await getActualMatches(photoIds);
  console.log(`[Validation] Found ${actualMatches.length} actual matches in database`);

  // Compare expected vs actual
  const results = [];

  for (const expected of expectedMatches) {
    if (!expected.lostPhotoId || !expected.foundPhotoId) {
      results.push({
        expected,
        detected: false,
        actualScore: null,
        reason: 'Missing photo IDs',
      });
      continue;
    }

    const actual = findActualMatch(expected, actualMatches);

    results.push({
      expected,
      detected: !!actual,
      actualScore: actual?.overall_score || null,
      actualMatch: actual,
      reason: actual ? null : 'Not detected',
    });
  }

  // Calculate metrics
  const metrics = calculateMetrics(results);

  // Validate score ranges
  const scoreIssues = validateScoreRanges(results);

  // Build report
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalExpected: metrics.total,
      detected: metrics.detected,
      missed: metrics.missed,
      matchDetectionRate: `${(metrics.matchDetectionRate * 100).toFixed(1)}%`,
      avgMatchScore: metrics.avgScore,
      passesThreshold: metrics.matchDetectionRate >= VALIDATION_CONFIG.minMatchDetectionRate,
    },
    scoreDistribution: metrics.scoreDistribution,
    byStrategy: Object.fromEntries(
      Object.entries(metrics.byStrategy).map(([strategy, data]) => [
        strategy,
        {
          total: data.total,
          detected: data.detected,
          rate: `${((data.detected / data.total) * 100).toFixed(1)}%`,
          avgScore: data.scores.length > 0
            ? Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length)
            : null,
        },
      ])
    ),
    byCategory: Object.fromEntries(
      Object.entries(metrics.byCategory).map(([category, data]) => [
        category,
        {
          total: data.total,
          detected: data.detected,
          rate: `${((data.detected / data.total) * 100).toFixed(1)}%`,
          avgScore: data.scores.length > 0
            ? Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length)
            : null,
        },
      ])
    ),
    scoreIssues: scoreIssues.length,
    scoreIssueDetails: verbose ? scoreIssues : scoreIssues.slice(0, 5),
    missedMatches: verbose
      ? results.filter(r => !r.detected).map(r => ({
          pairId: r.expected.pairId,
          strategy: r.expected.strategy,
          category: r.expected.category,
          reason: r.reason,
        }))
      : results.filter(r => !r.detected).slice(0, 10).map(r => ({
          pairId: r.expected.pairId,
          strategy: r.expected.strategy,
        })),
  };

  return report;
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');

  try {
    const report = await runValidation(verbose);

    if (!report) {
      process.exit(0);
    }

    // Print summary
    console.log('\n=== Validation Results ===\n');
    console.log('Summary:');
    console.log(`  Total expected matches: ${report.summary.totalExpected}`);
    console.log(`  Detected: ${report.summary.detected}`);
    console.log(`  Missed: ${report.summary.missed}`);
    console.log(`  Detection rate: ${report.summary.matchDetectionRate}`);
    console.log(`  Average score: ${report.summary.avgMatchScore}%`);
    console.log(`  Passes threshold: ${report.summary.passesThreshold ? 'YES' : 'NO'}`);

    console.log('\nBy Strategy:');
    for (const [strategy, data] of Object.entries(report.byStrategy)) {
      console.log(`  ${strategy}: ${data.detected}/${data.total} (${data.rate}), avg score: ${data.avgScore || 'N/A'}`);
    }

    console.log('\nBy Category:');
    for (const [category, data] of Object.entries(report.byCategory)) {
      console.log(`  ${category}: ${data.detected}/${data.total} (${data.rate})`);
    }

    console.log('\nScore Distribution:');
    for (const [range, count] of Object.entries(report.scoreDistribution)) {
      console.log(`  ${range}%: ${count} matches`);
    }

    if (report.scoreIssues > 0) {
      console.log(`\nScore Issues: ${report.scoreIssues}`);
      for (const issue of report.scoreIssueDetails) {
        console.log(`  - ${issue.strategy}/${issue.pairId}: ${issue.issue} (expected ${issue.expected}, got ${issue.actual})`);
      }
    }

    if (report.missedMatches.length > 0) {
      console.log(`\nMissed Matches (${report.summary.missed} total):`);
      for (const missed of report.missedMatches.slice(0, 10)) {
        console.log(`  - ${missed.strategy}/${missed.pairId} (${missed.category})`);
      }
      if (report.summary.missed > 10) {
        console.log(`  ... and ${report.summary.missed - 10} more`);
      }
    }

    // Save report
    const reportPath = path.join(PATHS.metadata, 'validation-report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nReport saved to: ${reportPath}`);

    // Exit with error if below threshold
    if (!report.summary.passesThreshold) {
      console.log('\n[FAIL] Detection rate below threshold!');
      process.exit(1);
    }

    console.log('\n[PASS] Validation complete!');

  } catch (error) {
    console.error('[Validation] Error:', error);
    process.exit(1);
  } finally {
    if (sequelize) {
      await sequelize.close();
    }
  }
}

module.exports = { runValidation };

if (require.main === module) {
  main().catch(console.error);
}
