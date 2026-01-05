/**
 * Similar Item Generator (Strategy 2)
 *
 * Creates match pairs from items that are visually similar but not the same.
 * Uses color and category matching. Expected similarity: 35-60%.
 */

const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const { PATHS, MATCH_PAIRS_DISTRIBUTION } = require('../config');

/**
 * Extract dominant color from an image
 */
async function extractDominantColor(imagePath) {
  try {
    const { dominant } = await sharp(imagePath)
      .resize(50, 50, { fit: 'cover' })
      .stats();

    return {
      r: Math.round(dominant.r),
      g: Math.round(dominant.g),
      b: Math.round(dominant.b),
    };
  } catch (error) {
    return null;
  }
}

/**
 * Calculate color distance (Euclidean)
 */
function colorDistance(color1, color2) {
  if (!color1 || !color2) return Infinity;

  const rDiff = color1.r - color2.r;
  const gDiff = color1.g - color2.g;
  const bDiff = color1.b - color2.b;

  return Math.sqrt(rDiff * rDiff + gDiff * gDiff + bDiff * bDiff);
}

/**
 * Find similar images within a category based on color
 */
async function findSimilarImages(category, sourceImages, targetCount) {
  const sourceDir = path.join(PATHS.raw, category);

  // Extract colors for all images
  const imagesWithColors = [];

  for (const filename of sourceImages) {
    const imagePath = path.join(sourceDir, filename);
    const color = await extractDominantColor(imagePath);

    if (color) {
      imagesWithColors.push({ filename, color, path: imagePath });
    }
  }

  console.log(`[Similar] ${category}: Analyzed ${imagesWithColors.length} images for color`);

  // Find pairs with similar but not identical colors
  const pairs = [];
  const used = new Set();

  // Sort by color brightness for better matching
  imagesWithColors.sort((a, b) => {
    const brightnessA = (a.color.r + a.color.g + a.color.b) / 3;
    const brightnessB = (b.color.r + b.color.g + b.color.b) / 3;
    return brightnessA - brightnessB;
  });

  for (let i = 0; i < imagesWithColors.length && pairs.length < targetCount; i++) {
    if (used.has(i)) continue;

    const img1 = imagesWithColors[i];

    // Find a similar but not identical color match
    for (let j = i + 1; j < imagesWithColors.length && pairs.length < targetCount; j++) {
      if (used.has(j)) continue;

      const img2 = imagesWithColors[j];
      const distance = colorDistance(img1.color, img2.color);

      // Look for similar colors (distance between 20-100)
      // Too close = might be same image, too far = not similar
      if (distance >= 20 && distance <= 100) {
        pairs.push({
          lost: img1,
          found: img2,
          colorDistance: distance,
        });

        used.add(i);
        used.add(j);
        break;
      }
    }
  }

  return pairs;
}

/**
 * Generate similar item pairs for a category
 */
async function generateSimilarPairs(category, targetCount) {
  const sourceDir = path.join(PATHS.raw, category);

  // Get source images
  let sourceImages;
  try {
    const files = await fs.readdir(sourceDir);
    sourceImages = files.filter(f => f.endsWith('.jpg'));
  } catch {
    console.error(`[Similar] No images found in ${sourceDir}`);
    return [];
  }

  if (sourceImages.length < targetCount * 2) {
    console.warn(`[Similar] ${category}: Only ${sourceImages.length} images, need ${targetCount * 2}`);
  }

  // Find similar pairs
  const similarPairs = await findSimilarImages(category, sourceImages, targetCount);

  const pairs = [];

  for (const { lost, found, colorDistance: dist } of similarPairs) {
    const pairId = uuidv4();

    // Copy lost image
    const lostFilename = `${category}_lost_sim_${pairId}.jpg`;
    const lostPath = path.join(PATHS.lostItems, lostFilename);
    await fs.mkdir(path.dirname(lostPath), { recursive: true });
    await fs.copyFile(lost.path, lostPath);

    // Copy found image
    const foundFilename = `${category}_found_sim_${pairId}.jpg`;
    const foundPath = path.join(PATHS.foundItems, foundFilename);
    await fs.mkdir(path.dirname(foundPath), { recursive: true });
    await fs.copyFile(found.path, foundPath);

    pairs.push({
      pairId,
      category,
      strategy: 'similar',
      lostImage: lostFilename,
      foundImage: foundFilename,
      lostColor: lost.color,
      foundColor: found.color,
      colorDistance: dist,
      expectedScore: { min: 35, max: 60 },
    });

    console.log(`[Similar] Created pair ${pairs.length}/${targetCount} for ${category} (color dist: ${Math.round(dist)})`);
  }

  return pairs;
}

/**
 * Generate all similar pairs across categories
 */
async function generateAllSimilarPairs() {
  console.log('[Similar] Starting similar pair generation...');

  const allPairs = [];

  // Calculate pairs per category (30 total for similar strategy)
  const totalSimilar = 30;
  const totalDistribution = Object.values(MATCH_PAIRS_DISTRIBUTION).reduce((a, b) => a + b, 0);

  for (const [category, count] of Object.entries(MATCH_PAIRS_DISTRIBUTION)) {
    const categorySimilar = Math.round((count / totalDistribution) * totalSimilar);

    if (categorySimilar > 0) {
      console.log(`[Similar] Generating ${categorySimilar} pairs for ${category}`);
      const pairs = await generateSimilarPairs(category, categorySimilar);
      allPairs.push(...pairs);
    }
  }

  console.log(`[Similar] Generated ${allPairs.length} similar pairs`);
  return allPairs;
}

module.exports = {
  extractDominantColor,
  colorDistance,
  generateSimilarPairs,
  generateAllSimilarPairs,
};
