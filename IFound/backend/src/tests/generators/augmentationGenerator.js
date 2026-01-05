/**
 * Augmentation Generator (Strategy 3)
 *
 * Creates match pairs by applying image transformations to create
 * "found" versions of "lost" items. These should have high similarity (70-95%).
 */

const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const { AUGMENTATION_CONFIG, PATHS, MATCH_PAIRS_DISTRIBUTION } = require('../config');

/**
 * Random number in range
 */
function randomInRange(min, max) {
  return Math.random() * (max - min) + min;
}

/**
 * Apply random rotation
 */
function applyRotation(image) {
  const angle = randomInRange(
    AUGMENTATION_CONFIG.rotate.min,
    AUGMENTATION_CONFIG.rotate.max
  );
  return image.rotate(angle, { background: { r: 255, g: 255, b: 255 } });
}

/**
 * Apply brightness/contrast adjustment
 */
function applyBrightness(image) {
  const brightness = randomInRange(
    AUGMENTATION_CONFIG.brightness.min,
    AUGMENTATION_CONFIG.brightness.max
  );
  const saturation = randomInRange(
    AUGMENTATION_CONFIG.saturation.min,
    AUGMENTATION_CONFIG.saturation.max
  );
  return image.modulate({ brightness, saturation });
}

/**
 * Apply horizontal flip
 */
function applyFlip(image) {
  return image.flop();
}

/**
 * Apply blur
 */
function applyBlur(image) {
  const sigma = randomInRange(
    AUGMENTATION_CONFIG.blur.min,
    AUGMENTATION_CONFIG.blur.max
  );
  return image.blur(sigma);
}

/**
 * Apply crop (center crop with padding)
 */
async function applyCrop(image) {
  const metadata = await image.metadata();
  const percentage = AUGMENTATION_CONFIG.crop.percentage;

  const cropX = Math.floor(metadata.width * percentage);
  const cropY = Math.floor(metadata.height * percentage);
  const newWidth = metadata.width - (cropX * 2);
  const newHeight = metadata.height - (cropY * 2);

  return image.extract({
    left: cropX,
    top: cropY,
    width: Math.max(newWidth, 100),
    height: Math.max(newHeight, 100),
  });
}

// Available augmentations
const AUGMENTATIONS = [
  { name: 'rotate', fn: applyRotation, async: false },
  { name: 'brightness', fn: applyBrightness, async: false },
  { name: 'flip', fn: applyFlip, async: false },
  { name: 'blur', fn: applyBlur, async: false },
  { name: 'crop', fn: applyCrop, async: true },
];

/**
 * Apply random augmentations to an image
 */
async function augmentImage(inputPath, outputPath, numAugmentations = 2) {
  try {
    let image = sharp(inputPath);

    // Select random augmentations
    const shuffled = [...AUGMENTATIONS].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, numAugmentations);

    const appliedAugmentations = [];

    for (const aug of selected) {
      if (aug.async) {
        image = await aug.fn(image);
      } else {
        image = aug.fn(image);
      }
      appliedAugmentations.push(aug.name);
    }

    // Save result
    await image.jpeg({ quality: 85 }).toFile(outputPath);

    return appliedAugmentations;
  } catch (error) {
    console.error(`[Augmentation] Error processing ${inputPath}:`, error.message);
    return null;
  }
}

/**
 * Generate augmented pairs for a category
 */
async function generateAugmentedPairs(category, targetCount) {
  const sourceDir = path.join(PATHS.raw, category);
  const outputDir = PATHS.augmented;

  await fs.mkdir(outputDir, { recursive: true });

  // Get source images
  let sourceImages;
  try {
    const files = await fs.readdir(sourceDir);
    sourceImages = files.filter(f => f.endsWith('.jpg'));
  } catch {
    console.error(`[Augmentation] No images found in ${sourceDir}`);
    return [];
  }

  if (sourceImages.length < targetCount) {
    console.warn(`[Augmentation] ${category}: Only ${sourceImages.length} images available, need ${targetCount}`);
  }

  // Shuffle and select
  const shuffled = [...sourceImages].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, targetCount);

  const pairs = [];

  for (const sourceFile of selected) {
    const sourcePath = path.join(sourceDir, sourceFile);
    const pairId = uuidv4();

    // Copy original as "lost" item
    const lostFilename = `${category}_lost_${pairId}.jpg`;
    const lostPath = path.join(PATHS.lostItems, lostFilename);
    await fs.mkdir(path.dirname(lostPath), { recursive: true });
    await fs.copyFile(sourcePath, lostPath);

    // Create augmented version as "found" item
    const foundFilename = `${category}_found_${pairId}.jpg`;
    const foundPath = path.join(PATHS.foundItems, foundFilename);
    await fs.mkdir(path.dirname(foundPath), { recursive: true });

    const numAugmentations = Math.floor(Math.random() * 2) + 2; // 2-3 augmentations
    const appliedAugs = await augmentImage(sourcePath, foundPath, numAugmentations);

    if (appliedAugs) {
      pairs.push({
        pairId,
        category,
        strategy: 'augmented',
        lostImage: lostFilename,
        foundImage: foundFilename,
        augmentations: appliedAugs,
        expectedScore: { min: 70, max: 95 },
      });

      console.log(`[Augmentation] Created pair ${pairs.length}/${targetCount} for ${category}`);
    }
  }

  return pairs;
}

/**
 * Generate all augmented pairs across categories
 */
async function generateAllAugmentedPairs() {
  console.log('[Augmentation] Starting augmented pair generation...');

  const allPairs = [];

  // Calculate pairs per category (30 total for augmented strategy)
  // Distribution proportional to MATCH_PAIRS_DISTRIBUTION
  const totalAugmented = 30;
  const totalDistribution = Object.values(MATCH_PAIRS_DISTRIBUTION).reduce((a, b) => a + b, 0);

  for (const [category, count] of Object.entries(MATCH_PAIRS_DISTRIBUTION)) {
    const categoryAugmented = Math.round((count / totalDistribution) * totalAugmented);

    if (categoryAugmented > 0) {
      console.log(`[Augmentation] Generating ${categoryAugmented} pairs for ${category}`);
      const pairs = await generateAugmentedPairs(category, categoryAugmented);
      allPairs.push(...pairs);
    }
  }

  console.log(`[Augmentation] Generated ${allPairs.length} augmented pairs`);
  return allPairs;
}

module.exports = {
  augmentImage,
  generateAugmentedPairs,
  generateAllAugmentedPairs,
  AUGMENTATIONS,
};
