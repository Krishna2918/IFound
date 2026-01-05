#!/usr/bin/env node

/**
 * Check Photo Data
 * Inspects what AI metadata and features are stored for photos
 */

const { Sequelize } = require('sequelize');

async function main() {
  const sequelize = new Sequelize('postgresql://postgres:postgres@localhost:5433/ifound', {
    logging: false
  });

  try {
    // Check photos with AI metadata
    const [withMeta] = await sequelize.query(`
      SELECT COUNT(*) as count
      FROM photos
      WHERE ai_metadata IS NOT NULL AND ai_metadata != '{}'::jsonb
    `);
    console.log('Photos with AI metadata:', withMeta[0].count);

    // Check photos with image features
    const [withFeatures] = await sequelize.query(`
      SELECT COUNT(*) as count
      FROM photos
      WHERE image_features IS NOT NULL AND array_length(image_features, 1) > 0
    `);
    console.log('Photos with image features:', withFeatures[0].count);

    // Sample AI metadata
    const [sample] = await sequelize.query(`
      SELECT id, ai_metadata, array_length(image_features, 1) as feature_count
      FROM photos
      WHERE ai_metadata IS NOT NULL
      LIMIT 5
    `);
    console.log('\nSample AI metadata:');
    sample.forEach((r, i) => {
      console.log(`\n  Photo ${i+1} (${r.id.slice(0,8)}...):`);
      console.log(`    Features count: ${r.feature_count || 0}`);
      if (r.ai_metadata) {
        const keys = Object.keys(r.ai_metadata);
        console.log(`    Metadata keys: ${keys.join(', ')}`);
        // Show some values
        if (r.ai_metadata.perceptualHash) {
          console.log(`    Perceptual hash: ${r.ai_metadata.perceptualHash.slice(0,16)}...`);
        }
        if (r.ai_metadata.dominantColors) {
          console.log(`    Dominant colors: ${r.ai_metadata.dominantColors.length} colors`);
        }
      }
    });

    // Count matches
    const [matchCount] = await sequelize.query(`SELECT COUNT(*) as count FROM photo_matches`);
    console.log('\n\nTotal matches in database:', matchCount[0].count);

    // Sample matches
    const [matches] = await sequelize.query(`
      SELECT source_photo_id, target_photo_id, overall_score, hash_score, color_score
      FROM photo_matches
      LIMIT 5
    `);
    if (matches.length > 0) {
      console.log('\nSample matches:');
      matches.forEach((m, i) => {
        console.log(`  ${i+1}. Score: ${m.overall_score}, hash: ${m.hash_score}, color: ${m.color_score}`);
      });
    }

  } finally {
    await sequelize.close();
  }
}

main().catch(console.error);
