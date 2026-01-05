/**
 * Universal Matching Service v3.0
 *
 * VISUAL-FIRST matching for ALL types of lost/found items.
 * Dynamically adjusts matching strategy based on what's IN the image.
 *
 * Key Principle: NOT everything has text. A lost dog, keys, or jewelry
 * should match based on VISUAL features, not OCR.
 *
 * DYNAMIC MATCHING:
 * 1. Analyze what features ARE available in the image
 * 2. Auto-detect item category from visual content
 * 3. Dynamically calculate weights based on available features
 * 4. Match using the most relevant features for that item type
 *
 * Feature Types:
 * - COLOR:    Dominant colors, color histogram, color names
 * - PATTERN:  Solid, striped, spotted, checkered, gradient
 * - SHAPE:    Silhouette, aspect ratio, edge density
 * - TEXTURE:  Fur, fabric, metal, leather, plastic
 * - SIZE:     Relative size estimation
 * - TEXT:     OCR (only when text is present)
 * - OBJECTS:  Detected objects (collar, keychain, logo)
 */

const { Op } = require('sequelize');
const { Photo, Case, VisualDNA } = require('../models');
const PhotoMatch = require('../models/PhotoMatch');
const hashingService = require('./hashingService');
const ocrService = require('./ocrService');
const imageDnaService = require('./imageDnaService');
const neuralEmbeddingService = require('./neuralEmbeddingService');
const logger = require('../config/logger');
const geoUtils = require('../utils/geoUtils');

/**
 * Ensure value is a proper flat JavaScript array of floats for Sequelize ARRAY(FLOAT)
 * Handles typed arrays, nested arrays, and ensures parseFloat on all values
 */
const ensureFloatArray = (value) => {
  if (!value) return null;
  if (!Array.isArray(value) && !(value?.length !== undefined)) return null;
  const arr = Array.isArray(value) ? value.flat() : Array.from(value);
  return arr.map(v => {
    const num = parseFloat(v);
    return isNaN(num) ? 0 : num;
  });
};

/**
 * Clamp a value for DECIMAL(5,4) fields - max value is 9.9999, min is -9.9999
 * Returns null for null/undefined, or the clamped value
 */
const clampDecimal54 = (value) => {
  if (value === null || value === undefined) return null;
  const num = parseFloat(value);
  if (isNaN(num)) return null;
  // DECIMAL(5,4) allows -9.9999 to 9.9999
  return Math.max(-9.9999, Math.min(9.9999, num));
};

/**
 * Clamp a value for INTEGER fields - ensure it's a valid integer within range
 */
const clampInt = (value, min = 0, max = 100) => {
  if (value === null || value === undefined) return null;
  const num = parseInt(value, 10);
  if (isNaN(num)) return null;
  return Math.max(min, Math.min(max, num));
};

// Category compatibility matrix (which categories can match)
const CATEGORY_COMPATIBILITY = {
  pet: ['pet'],
  jewelry: ['jewelry', 'other'],
  electronics: ['electronics', 'other'],
  documents: ['documents', 'other'],
  vehicle: ['vehicle'],
  other: ['pet', 'jewelry', 'electronics', 'documents', 'vehicle', 'other'],
};

// Entity type compatibility - Made more lenient for real-world matching
// Items can be misclassified, so allow broader matching
const ENTITY_COMPATIBILITY = {
  person: ['person', 'unknown'],
  pet: ['pet', 'unknown'],
  item: ['item', 'document', 'unknown'],  // Items can be docs too
  vehicle: ['vehicle', 'item', 'unknown'],
  document: ['document', 'item', 'unknown'],
  unknown: ['person', 'pet', 'item', 'vehicle', 'document', 'unknown'],
};

// Matching thresholds - Designed for real-world conditions
// (different angles, lighting, screenshots vs photos, varying quality)
const THRESHOLDS = {
  // Minimum scores to consider a match (lowered for flexibility)
  HASH_SIMILARITY_MIN: 40,    // Lowered from 60 - hashes vary with angle/crop
  COLOR_SIMILARITY_MIN: 35,   // Lowered from 50 - lighting affects colors
  VISUAL_SIMILARITY_MIN: 35,  // Lowered from 55 - allow more candidates
  OCR_SIMILARITY_MIN: 40,     // Lowered from 50 - partial text matches
  OBJECT_SIMILARITY_MIN: 30,  // Lowered from 40 - object detection varies

  // High-value exact matches
  LICENSE_PLATE_EXACT: 85,
  SERIAL_NUMBER_EXACT: 90,

  // Overall match thresholds
  OVERALL_MATCH_MIN: 30,      // Lowered from 55 - show more potential matches
  HIGH_CONFIDENCE: 65,        // Lowered from 75
  VERY_HIGH_CONFIDENCE: 85,   // Lowered from 90
};

// Category-specific weight configurations
const CATEGORY_WEIGHTS = {
  // Pets: Color pattern and breed are most important
  pet: {
    HASH: 0.15,
    COLOR: 0.30,
    SHAPE: 0.10,  // Body shape matters
    VISUAL_FEATURES: 0.25,
    DETECTED_OBJECTS: 0.15,
    OCR: 0.05,
  },

  // Jewelry: Shape and color are key, OCR for engravings
  jewelry: {
    HASH: 0.15,
    COLOR: 0.25,
    SHAPE: 0.25,  // High importance for jewelry shape
    VISUAL_FEATURES: 0.20,
    DETECTED_OBJECTS: 0.05,
    OCR: 0.10,
  },

  // Keys: Shape is extremely important
  keys: {
    HASH: 0.15,
    COLOR: 0.15,
    SHAPE: 0.35,  // Key shape is distinctive
    VISUAL_FEATURES: 0.20,
    DETECTED_OBJECTS: 0.10,
    OCR: 0.05,
  },

  // Bags: Color and shape both important
  bags: {
    HASH: 0.15,
    COLOR: 0.30,
    SHAPE: 0.20,
    VISUAL_FEATURES: 0.20,
    DETECTED_OBJECTS: 0.10,
    OCR: 0.05,
  },

  // Electronics: Serial numbers are gold, but visual matters too
  electronics: {
    HASH: 0.15,
    COLOR: 0.15,
    SHAPE: 0.10,
    VISUAL_FEATURES: 0.15,
    DETECTED_OBJECTS: 0.10,
    OCR: 0.35,  // High weight for serial numbers
  },

  // Documents: OCR is critical
  documents: {
    HASH: 0.10,
    COLOR: 0.05,
    SHAPE: 0.05,
    VISUAL_FEATURES: 0.10,
    DETECTED_OBJECTS: 0.10,
    OCR: 0.60,  // Very high weight for text
  },

  // Vehicles: License plate OCR + color + make
  vehicle: {
    HASH: 0.10,
    COLOR: 0.20,
    SHAPE: 0.10,
    VISUAL_FEATURES: 0.15,
    DETECTED_OBJECTS: 0.05,
    OCR: 0.40,  // License plate
  },

  // Wallets/Cards: Shape less important than visual
  wallet: {
    HASH: 0.15,
    COLOR: 0.25,
    SHAPE: 0.10,
    VISUAL_FEATURES: 0.20,
    DETECTED_OBJECTS: 0.10,
    OCR: 0.20,
  },

  // Books: Cover colors + title text are key identifiers
  books: {
    HASH: 0.10,
    COLOR: 0.30,    // Book covers have distinctive colors
    SHAPE: 0.05,    // All books are rectangular
    VISUAL_FEATURES: 0.15,
    DETECTED_OBJECTS: 0.10,
    OCR: 0.30,      // Title and author text is important
  },

  // Default/Other: Balanced approach
  other: {
    HASH: 0.15,
    COLOR: 0.20,
    SHAPE: 0.15,
    VISUAL_FEATURES: 0.20,
    DETECTED_OBJECTS: 0.15,
    OCR: 0.15,
  },
};

// Pattern types for visual matching
const PATTERN_TYPES = {
  SOLID: 'solid',
  STRIPED: 'striped',
  SPOTTED: 'spotted',
  CHECKERED: 'checkered',
  GRADIENT: 'gradient',
  MIXED: 'mixed',
};

/**
 * Analyze what features are available in the image
 * This determines how matching should be performed
 */
const analyzeAvailableFeatures = (visualDNA) => {
  const ocrText = visualDNA.ocr_text || '';
  const hints = visualDNA.match_hints || {};

  return {
    // Text-based features
    hasText: ocrText.trim().length > 20,
    hasStrongText: ocrText.trim().length > 50 && (visualDNA.ocr_confidence || 0) > 50,
    hasIdentifiers: (
      (hints.licensePlates?.length || 0) > 0 ||
      (hints.serialNumbers?.length || 0) > 0 ||
      (hints.documentIds?.length || 0) > 0
    ),

    // Visual features
    hasStrongColors: (visualDNA.dominant_colors?.length || 0) >= 2,
    hasSingleDominantColor: (visualDNA.dominant_colors?.length || 0) === 1,
    hasColorSignature: !!visualDNA.color_signature,
    hasDistinctiveShape: (visualDNA.shape_data?.edgeDensity || 0) > 0.2,
    hasShapeSignature: !!visualDNA.shape_signature,
    hasPattern: visualDNA.pattern_type && visualDNA.pattern_type !== PATTERN_TYPES.SOLID,

    // Derived category hints
    looksLikePet: detectIfPet(visualDNA),
    looksLikeDocument: detectIfDocument(visualDNA),
    looksLikeVehicle: (hints.licensePlates?.length || 0) > 0,

    // Quality indicators
    colorConfidence: calculateColorConfidence(visualDNA),
    shapeConfidence: calculateShapeConfidence(visualDNA),
    textConfidence: visualDNA.ocr_confidence || 0,
  };
};

/**
 * Detect if the image likely contains a pet
 * Enhanced with fur pattern and marking detection
 */
const detectIfPet = (visualDNA) => {
  const colors = visualDNA.dominant_colors || [];
  const pattern = visualDNA.match_hints?.pattern || {};
  const shapeData = visualDNA.shape_data || {};

  // Common pet fur colors
  const petColors = [
    'brown', 'black', 'white', 'orange', 'gray', 'golden', 'tan',
    'cream', 'beige', 'ginger', 'chocolate', 'fawn', 'brindle',
    'silver', 'red', 'buff', 'apricot'
  ];

  // Score-based pet detection
  let petScore = 0;

  // Color analysis
  const petColorCount = colors.filter(c => petColors.includes(c.toLowerCase())).length;
  if (petColorCount >= 1) petScore += 15;
  if (petColorCount >= 2) petScore += 20;
  if (petColorCount >= 3) petScore += 10;

  // Multi-color patterns common in pets (e.g., black and white, brown and tan)
  if (colors.length >= 2 && petColorCount >= 2) {
    petScore += 15; // Multi-colored pet pattern
  }

  // Pattern analysis - pets often have distinctive patterns
  if (pattern.type === PATTERN_TYPES.SPOTTED) {
    petScore += 25; // Spotted pattern (dalmatian, leopard cat, etc.)
  } else if (pattern.type === PATTERN_TYPES.STRIPED) {
    petScore += 20; // Striped pattern (tabby cats, tiger stripes)
  } else if (pattern.type === PATTERN_TYPES.MIXED) {
    petScore += 15; // Mixed patterns (calico, tortoiseshell)
  }

  // Shape analysis - pets have organic, non-geometric shapes
  const edgeDensity = shapeData.edgeDensity || 0;
  if (edgeDensity > 0.12 && edgeDensity < 0.45) {
    petScore += 15; // Organic shape (not too smooth, not too sharp)
  }

  // Aspect ratio - many pet photos are roughly square or slightly rectangular
  const aspectRatio = shapeData.aspectRatio || 1;
  if (aspectRatio > 0.6 && aspectRatio < 1.8) {
    petScore += 10;
  }

  // Threshold for pet classification
  return petScore >= 35;
};

/**
 * Extract pet-specific features for better matching
 * Returns detailed pet characteristics
 */
const extractPetFeatures = (visualDNA) => {
  const colors = visualDNA.dominant_colors || [];
  const pattern = visualDNA.match_hints?.pattern || {};

  // Categorize coat type
  let coatType = 'unknown';
  if (pattern.type === PATTERN_TYPES.SOLID) {
    coatType = 'solid';
  } else if (pattern.type === PATTERN_TYPES.SPOTTED) {
    coatType = 'spotted';
  } else if (pattern.type === PATTERN_TYPES.STRIPED) {
    coatType = 'tabby'; // Common striped pattern in cats
  } else if (colors.length >= 3) {
    coatType = 'tricolor'; // e.g., calico cats
  } else if (colors.length === 2) {
    coatType = 'bicolor';
  }

  // Identify primary and secondary colors
  const primaryColor = colors[0] || 'unknown';
  const secondaryColor = colors[1] || null;
  const markingColors = colors.slice(2);

  return {
    coatType,
    primaryColor,
    secondaryColor,
    markingColors,
    hasSpots: pattern.type === PATTERN_TYPES.SPOTTED,
    hasStripes: pattern.type === PATTERN_TYPES.STRIPED,
    isSolidColor: pattern.type === PATTERN_TYPES.SOLID && colors.length === 1,
    colorCount: colors.length,
  };
};

/**
 * Compare two pets based on their visual features
 * Returns a similarity score optimized for pet matching
 */
const comparePetFeatures = (sourcePet, targetPet) => {
  let score = 0;
  let maxScore = 0;

  // 1. Coat type match (very important)
  maxScore += 30;
  if (sourcePet.coatType === targetPet.coatType && sourcePet.coatType !== 'unknown') {
    score += 30;
  } else if (
    (sourcePet.coatType === 'bicolor' && targetPet.coatType === 'tricolor') ||
    (sourcePet.coatType === 'tricolor' && targetPet.coatType === 'bicolor')
  ) {
    score += 15; // Partial match for multi-colored coats
  }

  // 2. Primary color match (critical)
  maxScore += 35;
  if (sourcePet.primaryColor.toLowerCase() === targetPet.primaryColor.toLowerCase()) {
    score += 35;
  } else if (areColorsSimilar(sourcePet.primaryColor, targetPet.primaryColor)) {
    score += 20; // Similar color (e.g., brown vs tan)
  }

  // 3. Secondary color match
  maxScore += 20;
  if (sourcePet.secondaryColor && targetPet.secondaryColor) {
    if (sourcePet.secondaryColor.toLowerCase() === targetPet.secondaryColor.toLowerCase()) {
      score += 20;
    } else if (areColorsSimilar(sourcePet.secondaryColor, targetPet.secondaryColor)) {
      score += 10;
    }
  } else if (!sourcePet.secondaryColor && !targetPet.secondaryColor) {
    score += 15; // Both solid colored
  }

  // 4. Pattern match (spots, stripes)
  maxScore += 15;
  if (sourcePet.hasSpots === targetPet.hasSpots && sourcePet.hasStripes === targetPet.hasStripes) {
    score += 15;
  }

  return Math.round((score / maxScore) * 100);
};

/**
 * Check if two colors are similar (e.g., brown/tan, gray/silver)
 */
const areColorsSimilar = (color1, color2) => {
  const colorGroups = [
    ['brown', 'tan', 'chocolate', 'fawn', 'chestnut'],
    ['black', 'dark', 'charcoal'],
    ['white', 'cream', 'ivory', 'off-white'],
    ['gray', 'grey', 'silver', 'ash'],
    ['orange', 'ginger', 'red', 'rust', 'auburn'],
    ['golden', 'gold', 'yellow', 'buff', 'honey'],
    ['beige', 'sand', 'camel'],
  ];

  const c1 = color1.toLowerCase();
  const c2 = color2.toLowerCase();

  for (const group of colorGroups) {
    if (group.includes(c1) && group.includes(c2)) {
      return true;
    }
  }

  return false;
};

/**
 * Detect if the image likely contains a document
 */
const detectIfDocument = (visualDNA) => {
  const hasText = (visualDNA.ocr_text?.length || 0) > 50;
  const hasHighTextConfidence = (visualDNA.ocr_confidence || 0) > 40;
  const hasRectangularShape = Math.abs((visualDNA.shape_data?.aspectRatio || 1) - 1.5) < 0.5;

  return hasText && hasHighTextConfidence && hasRectangularShape;
};

/**
 * Calculate color matching confidence
 */
const calculateColorConfidence = (visualDNA) => {
  let confidence = 0;

  if (visualDNA.color_signature?.length > 0) confidence += 40;
  if (visualDNA.dominant_colors?.length >= 2) confidence += 30;
  if (visualDNA.dominant_colors?.length >= 3) confidence += 10;
  if (visualDNA.pattern_type) confidence += 20;

  return Math.min(100, confidence);
};

/**
 * Calculate shape matching confidence
 */
const calculateShapeConfidence = (visualDNA) => {
  let confidence = 0;

  if (visualDNA.shape_signature?.length > 0) confidence += 40;
  if (visualDNA.shape_data?.edgeDensity > 0.1) confidence += 20;
  if (visualDNA.shape_data?.aspectRatio) confidence += 20;
  if (visualDNA.shape_data?.contourPoints?.length > 10) confidence += 20;

  return Math.min(100, confidence);
};

/**
 * DYNAMIC WEIGHT CALCULATION
 * Adjusts weights based on what features are actually available
 * This is the key to matching items WITHOUT text!
 */
const calculateDynamicWeights = (features, categoryHint = 'other') => {
  // Start with category-based weights
  let weights = { ...CATEGORY_WEIGHTS[categoryHint] } || { ...CATEGORY_WEIGHTS.other };

  // If NO text/identifiers found, redistribute OCR weight to visual features
  if (!features.hasText && !features.hasIdentifiers) {
    const ocrWeight = weights.OCR || 0.15;
    weights.OCR = 0.02; // Near-zero (still check in case of match)

    // Redistribute to visual features based on what's available
    if (features.hasStrongColors) {
      weights.COLOR = (weights.COLOR || 0.20) + ocrWeight * 0.4;
    }
    if (features.hasDistinctiveShape) {
      weights.SHAPE = (weights.SHAPE || 0.15) + ocrWeight * 0.3;
    }
    weights.VISUAL_FEATURES = (weights.VISUAL_FEATURES || 0.20) + ocrWeight * 0.2;
    weights.HASH = (weights.HASH || 0.15) + ocrWeight * 0.1;

    logger.debug('[DynamicWeights] No text found, redistributed OCR weight to visual features');
  }

  // If it looks like a pet, boost color (fur patterns are distinctive)
  if (features.looksLikePet) {
    weights.COLOR = Math.min(0.45, (weights.COLOR || 0.20) + 0.15);
    weights.SHAPE = Math.max(0.05, (weights.SHAPE || 0.15) - 0.05);
    weights.OCR = 0.02;
    logger.debug('[DynamicWeights] Detected pet, boosted color weight');
  }

  // If it looks like a document, boost OCR
  if (features.looksLikeDocument && features.hasStrongText) {
    weights.OCR = Math.min(0.60, (weights.OCR || 0.15) + 0.30);
    weights.COLOR = Math.max(0.05, (weights.COLOR || 0.20) - 0.10);
    logger.debug('[DynamicWeights] Detected document, boosted OCR weight');
  }

  // If only single color (solid item), boost shape
  if (features.hasSingleDominantColor && !features.hasPattern) {
    weights.SHAPE = Math.min(0.35, (weights.SHAPE || 0.15) + 0.10);
    weights.COLOR = Math.max(0.15, (weights.COLOR || 0.20) - 0.05);
    logger.debug('[DynamicWeights] Solid color item, boosted shape weight');
  }

  // Normalize weights to sum to 1.0
  const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
  for (const key of Object.keys(weights)) {
    weights[key] = weights[key] / total;
  }

  return weights;
};

/**
 * Detect pattern type from image (solid, striped, spotted, etc.)
 * Critical for matching pets, clothing, bags
 */
const detectPatternType = async (imagePath) => {
  const sharp = require('sharp');

  try {
    // Analyze image in a grid to detect patterns
    const { data, info } = await sharp(imagePath)
      .resize(32, 32, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const gridSize = 4; // 4x4 grid analysis
    const cellSize = 8; // 32/4 = 8 pixels per cell
    const cellColors = [];

    // Get average color of each cell
    for (let gy = 0; gy < gridSize; gy++) {
      for (let gx = 0; gx < gridSize; gx++) {
        let rSum = 0, gSum = 0, bSum = 0, count = 0;

        for (let y = gy * cellSize; y < (gy + 1) * cellSize; y++) {
          for (let x = gx * cellSize; x < (gx + 1) * cellSize; x++) {
            const idx = (y * 32 + x) * info.channels;
            rSum += data[idx];
            gSum += data[idx + 1];
            bSum += data[idx + 2];
            count++;
          }
        }

        cellColors.push({
          r: Math.round(rSum / count),
          g: Math.round(gSum / count),
          b: Math.round(bSum / count),
          row: gy,
          col: gx,
        });
      }
    }

    // Analyze color variance
    const avgColor = {
      r: cellColors.reduce((s, c) => s + c.r, 0) / cellColors.length,
      g: cellColors.reduce((s, c) => s + c.g, 0) / cellColors.length,
      b: cellColors.reduce((s, c) => s + c.b, 0) / cellColors.length,
    };

    const variance = cellColors.reduce((sum, c) => {
      return sum + Math.sqrt(
        Math.pow(c.r - avgColor.r, 2) +
        Math.pow(c.g - avgColor.g, 2) +
        Math.pow(c.b - avgColor.b, 2)
      );
    }, 0) / cellColors.length;

    // Check for horizontal stripes
    let horizontalVariance = 0;
    for (let row = 0; row < gridSize - 1; row++) {
      const rowColors = cellColors.filter(c => c.row === row);
      const nextRowColors = cellColors.filter(c => c.row === row + 1);
      const rowAvg = rowColors.reduce((s, c) => s + c.r + c.g + c.b, 0) / (rowColors.length * 3);
      const nextRowAvg = nextRowColors.reduce((s, c) => s + c.r + c.g + c.b, 0) / (nextRowColors.length * 3);
      horizontalVariance += Math.abs(rowAvg - nextRowAvg);
    }

    // Check for vertical stripes
    let verticalVariance = 0;
    for (let col = 0; col < gridSize - 1; col++) {
      const colColors = cellColors.filter(c => c.col === col);
      const nextColColors = cellColors.filter(c => c.col === col + 1);
      const colAvg = colColors.reduce((s, c) => s + c.r + c.g + c.b, 0) / (colColors.length * 3);
      const nextColAvg = nextColColors.reduce((s, c) => s + c.r + c.g + c.b, 0) / (nextColColors.length * 3);
      verticalVariance += Math.abs(colAvg - nextColAvg);
    }

    // Determine pattern type
    if (variance < 15) {
      return { type: PATTERN_TYPES.SOLID, confidence: 90, variance };
    }

    const stripeThreshold = 30;
    if (horizontalVariance > stripeThreshold && verticalVariance < stripeThreshold / 2) {
      return { type: PATTERN_TYPES.STRIPED, confidence: 70, direction: 'horizontal', variance };
    }
    if (verticalVariance > stripeThreshold && horizontalVariance < stripeThreshold / 2) {
      return { type: PATTERN_TYPES.STRIPED, confidence: 70, direction: 'vertical', variance };
    }

    // Check for spotted/checkered by looking at neighbor differences
    let spotCount = 0;
    for (let i = 0; i < cellColors.length; i++) {
      const c = cellColors[i];
      const neighbors = cellColors.filter(n =>
        Math.abs(n.row - c.row) <= 1 && Math.abs(n.col - c.col) <= 1 && n !== c
      );

      const avgNeighborBrightness = neighbors.reduce((s, n) => s + n.r + n.g + n.b, 0) / (neighbors.length * 3);
      const cellBrightness = (c.r + c.g + c.b) / 3;

      if (Math.abs(cellBrightness - avgNeighborBrightness) > 40) {
        spotCount++;
      }
    }

    if (spotCount > 4) {
      return { type: PATTERN_TYPES.SPOTTED, confidence: 60, spotCount, variance };
    }

    if (variance > 50) {
      return { type: PATTERN_TYPES.MIXED, confidence: 50, variance };
    }

    return { type: PATTERN_TYPES.GRADIENT, confidence: 40, variance };

  } catch (error) {
    logger.warn('[PatternDetection] Failed:', error.message);
    return { type: PATTERN_TYPES.SOLID, confidence: 0, error: error.message };
  }
};

/**
 * Find potential matches for a newly uploaded photo
 * Uses all available matching strategies based on item category
 */
const findMatchesForPhoto = async (photoId, caseId, imagePath) => {
  const startTime = Date.now();
  logger.info(`[UniversalMatch] Starting match search for photo ${photoId}`);

  try {
    // Get source case and photo details
    const [sourceCase, sourcePhoto] = await Promise.all([
      Case.findByPk(caseId),
      Photo.findByPk(photoId),
    ]);

    if (!sourceCase) {
      throw new Error(`Case not found: ${caseId}`);
    }

    // Get or extract Visual DNA
    let sourceVisualDNA = await VisualDNA.findOne({ where: { photo_id: photoId } });

    if (!sourceVisualDNA || sourceVisualDNA.processing_status !== 'completed') {
      logger.info(`[UniversalMatch] Extracting fingerprints for photo ${photoId}`);
      sourceVisualDNA = await extractComprehensiveFingerprints(photoId, caseId, imagePath);
    }

    // Determine item category - auto-detect if not specified or 'other'
    let itemCategory = sourceCase.item_category || 'other';
    let autoDetectedCategory = null;

    if (itemCategory === 'other' || !itemCategory) {
      const autoCat = autoCategoryFromFeatures(sourceVisualDNA);
      if (autoCat.confidence >= 30) {
        autoDetectedCategory = autoCat;
        itemCategory = autoCat.category;
        logger.info(`[UniversalMatch] Auto-detected category: ${autoCat.category} (${autoCat.confidence}% confidence)`);
      }
    }

    // DYNAMIC WEIGHT CALCULATION - analyze what features are actually available
    const availableFeatures = analyzeAvailableFeatures(sourceVisualDNA);
    const weights = calculateDynamicWeights(availableFeatures, itemCategory);

    logger.info(`[UniversalMatch] Category: ${itemCategory}${autoDetectedCategory ? ' (auto)' : ''}, Entity: ${sourceVisualDNA.entity_type}`);
    logger.info(`[UniversalMatch] Available features: hasText=${availableFeatures.hasText}, hasIdentifiers=${availableFeatures.hasIdentifiers}, hasStrongColors=${availableFeatures.hasStrongColors}, looksLikePet=${availableFeatures.looksLikePet}`);
    logger.info(`[UniversalMatch] Dynamic weights: COLOR=${(weights.COLOR*100).toFixed(0)}%, SHAPE=${(weights.SHAPE*100).toFixed(0)}%, OCR=${(weights.OCR*100).toFixed(0)}%, VISUAL=${(weights.VISUAL_FEATURES*100).toFixed(0)}%`);

    // Get opposite case type to search
    const oppositeType = sourceCase.case_type === 'found_item' ? 'lost_item' : 'found_item';

    // Find candidate photos with category and entity filtering
    const candidatePhotos = await findSmartCandidates(
      oppositeType,
      itemCategory,
      sourceVisualDNA.entity_type,
      sourceVisualDNA
    );

    logger.info(`[UniversalMatch] Found ${candidatePhotos.length} candidates to compare`);

    // Compare each candidate using multi-dimensional matching
    const matches = [];
    for (const candidate of candidatePhotos) {
      const matchResult = await comparePhotosComprehensive(
        sourceVisualDNA,
        candidate,
        weights
      );

      if (matchResult.overallScore >= THRESHOLDS.OVERALL_MATCH_MIN) {
        matches.push({
          targetPhotoId: candidate.photo_id,
          targetCaseId: candidate.case_id,
          ...matchResult,
        });
      }
    }

    // Sort by score
    matches.sort((a, b) => b.overallScore - a.overallScore);

    // Get source case search radius for location boost
    const searchRadius = sourceCase.search_radius || 50;

    // Create match records (top 10 only to avoid noise)
    const createdMatches = [];
    for (const match of matches.slice(0, 10)) {
      try {
        // Get target case for location comparison
        const targetCase = await Case.findByPk(match.targetCaseId);

        // Calculate location distance and boost
        let locationScore = null;
        let distanceMiles = null;
        let locationBoost = 0;
        let locationReason = null;

        if (targetCase) {
          const distanceResult = geoUtils.calculateCaseDistance(sourceCase, targetCase);
          if (distanceResult) {
            distanceMiles = distanceResult.distance;
            locationScore = geoUtils.calculateLocationScore(distanceMiles);
            locationBoost = geoUtils.calculateLocationBoost(distanceMiles, searchRadius);

            // Add location to match reasons if within reasonable distance
            if (distanceMiles <= 100) {
              locationReason = {
                icon: '📍',
                text: geoUtils.formatDistance(distanceMiles),
                score: locationScore,
              };
            }

            logger.debug(`[UniversalMatch] Location: ${distanceMiles.toFixed(1)}mi away, boost: +${locationBoost}pts`);
          }
        }

        // Apply location boost to overall score (cap at 100)
        const boostedScore = Math.min(100, match.overallScore + locationBoost);

        // Combine location reason with other match reasons
        const allMatchReasons = [
          ...(match.matchReasons || []),
          ...(locationReason ? [locationReason] : []),
        ];

        const record = await PhotoMatch.create({
          source_photo_id: photoId,
          source_case_id: caseId,
          target_photo_id: match.targetPhotoId,
          target_case_id: match.targetCaseId,
          overall_score: boostedScore,
          dna_score: match.dnaScore, // NEW: Image DNA score
          hash_score: match.hashScore,
          ocr_score: match.ocrScore,
          color_score: match.colorScore,
          visual_score: match.visualScore,
          shape_score: match.shapeScore,
          location_score: locationScore,
          distance_miles: distanceMiles,
          match_type: match.matchType,
          match_details: {
            ...match.details,
            matchReasons: allMatchReasons, // Human-readable match explanations
            weightsUsed: weights, // Record what weights were used for this match
            autoDetectedCategory: autoDetectedCategory, // Category auto-detection info
            locationBoost: locationBoost, // Track location boost applied
          },
          matched_identifiers: match.matchedIdentifiers,
          status: boostedScore >= THRESHOLDS.HIGH_CONFIDENCE ? 'pending' : 'pending',
        });

        createdMatches.push(record);
        logger.info(`[UniversalMatch] Created match: ${photoId} <-> ${match.targetPhotoId} (${match.matchType}: ${match.overallScore}%${locationBoost > 0 ? ` +${locationBoost}% location` : ''} = ${boostedScore}%)`);
      } catch (err) {
        if (err.name === 'SequelizeUniqueConstraintError') {
          logger.debug(`[UniversalMatch] Match already exists`);
        } else {
          throw err;
        }
      }
    }

    const duration = Date.now() - startTime;
    logger.info(`[UniversalMatch] Completed in ${duration}ms. Found ${createdMatches.length} matches.`);

    return createdMatches;
  } catch (error) {
    logger.error(`[UniversalMatch] Failed for photo ${photoId}:`, error);
    throw error;
  }
};

/**
 * Extract comprehensive fingerprints for matching
 * Includes Image DNA, color, visual features, object detection, and OCR
 */
const extractComprehensiveFingerprints = async (photoId, caseId, imagePath) => {
  const fs = require('fs');
  const sharp = require('sharp');

  if (!fs.existsSync(imagePath)) {
    throw new Error(`Image not found: ${imagePath}`);
  }

  const imageBuffer = fs.readFileSync(imagePath);

  // Extract all features in parallel, including NEW Image DNA v2
  const [neuralFingerprint, imageDNA, hashes, ocrResult, colorData, shapeData, patternData, imageStats] = await Promise.all([
    // NEW v2: Generate neural embeddings with DINOv2
    neuralEmbeddingService.generateNeuralFingerprint(imageBuffer).catch(err => {
      logger.warn('[UniversalMatch] Neural fingerprint generation failed:', err.message);
      return { embedding: null, embeddingHash: null, entityType: 'unknown', entityConfidence: 0 };
    }),

    // NEW v2: Generate comprehensive Image DNA with neural fingerprint
    imageDnaService.generateImageDNA(imageBuffer).catch(err => {
      logger.warn('[UniversalMatch] Image DNA generation failed:', err.message);
      return null;
    }),

    // Perceptual hashes (legacy, for backward compatibility)
    hashingService.computeAllHashes(imageBuffer).catch(err => {
      logger.warn('[UniversalMatch] Hash extraction failed:', err.message);
      return null;
    }),

    // OCR (for text, serial numbers, license plates)
    ocrService.extractText(imagePath).catch(err => {
      logger.warn('[UniversalMatch] OCR extraction failed:', err.message);
      return { text: '', identifiers: {}, confidence: 0 };
    }),

    // Extract color data
    extractColorSignature(imagePath).catch(err => {
      logger.warn('[UniversalMatch] Color extraction failed:', err.message);
      return { signature: null, dominantColors: [] };
    }),

    // Extract shape/silhouette data
    extractShapeSilhouette(imagePath).catch(err => {
      logger.warn('[UniversalMatch] Shape extraction failed:', err.message);
      return { signature: null, aspectRatio: 1, edgeDensity: 0, contourPoints: [] };
    }),

    // Detect pattern type (solid, stripes, spots, etc.)
    detectPatternType(imagePath).catch(err => {
      logger.warn('[UniversalMatch] Pattern detection failed:', err.message);
      return { type: 'unknown', confidence: 0 };
    }),

    // Image metadata/stats
    sharp(imagePath).stats().catch(() => null),
  ]);

  // Log neural fingerprint result
  if (neuralFingerprint?.embeddingHash) {
    logger.info(`[UniversalMatch] Neural fingerprint generated: ${neuralFingerprint.embeddingHash} (entity: ${neuralFingerprint.entityType}, ${(neuralFingerprint.entityConfidence * 100).toFixed(0)}%)`);
  }

  // Generate DNA v2 with neural fingerprint
  let dnaV2 = null;
  try {
    dnaV2 = await imageDnaService.generateImageDNA_v2(imageBuffer, {
      neuralFingerprint: neuralFingerprint,
    });
    logger.info(`[UniversalMatch] Image DNA v2 generated: ${dnaV2.dnaId} (${dnaV2.processingTimeMs}ms)`);
  } catch (err) {
    logger.warn('[UniversalMatch] DNA v2 generation failed:', err.message);
  }

  // Log Image DNA v1 generation result
  if (imageDNA) {
    logger.debug(`[UniversalMatch] Image DNA v1 generated: ${imageDNA.dnaId} (${imageDNA.processingTimeMs}ms)`);
  }

  // Log OCR result - show when garbage is detected
  if (ocrResult) {
    if (ocrResult.score === 0) {
      logger.info(`[UniversalMatch] OCR garbage detected - discarding text. Relying on Image DNA for matching.`);
    } else if (ocrResult.score > 0) {
      logger.info(`[UniversalMatch] Valid OCR text extracted (score: ${ocrResult.score})`);
    }
  }

  // Determine entity type - prefer neural classification over heuristics
  const entityType = neuralFingerprint?.entityType !== 'unknown'
    ? neuralFingerprint.entityType
    : determineEntityType(ocrResult, colorData);

  // Get or create Visual DNA record
  let visualDNA = await VisualDNA.findOne({ where: { photo_id: photoId } });

  const dnaData = {
    // ============================================================
    // DNA v2.0 Fields (NEW - Human-Readable DNA System)
    // ============================================================

    // Human-readable DNA ID: PET-BRN.ORG-VERT-dino7f3a-phash4c2b-Q85
    dna_v2_id: dnaV2?.dnaId || null,

    // DINOv2 neural embedding (384 dimensions)
    neural_embedding: ensureFloatArray(neuralFingerprint?.embedding),
    neural_embedding_hash: neuralFingerprint?.embeddingHash || null,

    // HSV-based color DNA
    color_code: dnaV2?.searchableFields?.colorAbbreviations?.join('.') || null,
    hsv_color_data: dnaV2?.fullDNA?.colorFingerprint?.hsvHistograms || null,

    // Shape DNA
    shape_code: dnaV2?.searchableFields?.shape || null,

    // Searchable fields for fast filtering
    searchable_colors: dnaV2?.searchableFields?.colors || null,
    quality_tier: dnaV2?.searchableFields?.qualityTier || null,

    // Complete DNA v2 object
    dna_v2_full: dnaV2 || null,

    // ============================================================
    // DNA v1.0 Fields (Legacy - for backward compatibility)
    // ============================================================

    // Store complete Image DNA v1
    image_dna_id: imageDNA?.dnaId || null,
    image_dna: imageDNA ? {
      dnaId: imageDNA.dnaId,
      version: imageDNA.version,
      metadata: imageDNA.metadata,
      perceptualHashes: imageDNA.perceptualHashes,
      colorFingerprint: imageDNA.colorFingerprint,
      edgeFingerprint: imageDNA.edgeFingerprint,
      textureFingerprint: imageDNA.textureFingerprint,
    } : null,
    // Legacy hash fields for backward compatibility
    perceptual_hash: imageDNA?.perceptualHashes?.pHash || hashes?.perceptualHash,
    average_hash: imageDNA?.perceptualHashes?.aHash || hashes?.averageHash,
    difference_hash: imageDNA?.perceptualHashes?.dHash || hashes?.differenceHash,
    block_hash: imageDNA?.perceptualHashes?.blockHash || null,
    // ONLY store OCR text if it passed validation (not garbage)
    // Score of 0 means garbage was detected
    ocr_text: (ocrResult?.score > 0) ? ocrResult?.text : null,
    ocr_confidence: clampDecimal54((ocrResult?.score > 0) ? ocrResult?.confidence : 0),
    // Use Image DNA color data if available, fallback to legacy
    color_signature: ensureFloatArray(imageDNA?.colorFingerprint?.colorSignature || colorData?.signature),
    dominant_colors: imageDNA?.colorFingerprint?.dominantColors?.map(c => c.hex) || colorData?.dominantColors,
    average_color: imageDNA?.colorFingerprint?.averageColor || null,
    color_histograms: imageDNA?.colorFingerprint?.histograms || null,
    // Use Image DNA edge data
    edge_fingerprint: imageDNA?.edgeFingerprint || null,
    shape_signature: ensureFloatArray(shapeData?.signature),
    shape_data: {
      aspectRatio: imageDNA?.metadata?.aspectRatio || shapeData?.aspectRatio,
      edgeDensity: imageDNA?.edgeFingerprint?.edgeDensity || shapeData?.edgeDensity,
      contourPoints: shapeData?.contourPoints,
      dominantDirection: imageDNA?.edgeFingerprint?.dominantDirection,
    },
    // Use Image DNA texture data
    texture_fingerprint: imageDNA?.textureFingerprint || null,
    entity_type: entityType,
    entity_confidence: clampDecimal54(neuralFingerprint?.entityConfidence),
    match_hints: {
      // Only include identifiers if OCR was valid (not garbage)
      licensePlates: (ocrResult?.score > 0) ? (ocrResult?.identifiers?.licensePlates || []) : [],
      serialNumbers: (ocrResult?.score > 0) ? (ocrResult?.identifiers?.serialNumbers || []) : [],
      documentIds: (ocrResult?.score > 0) ? (ocrResult?.identifiers?.documentIds || []) : [],
      hasLicensePlate: (ocrResult?.score > 0) && (ocrResult?.identifiers?.licensePlates?.length || 0) > 0,
      hasSerialNumber: (ocrResult?.score > 0) && (ocrResult?.identifiers?.serialNumbers?.length || 0) > 0,
      hasText: (ocrResult?.score > 0) && (ocrResult?.text?.length || 0) > 10,
      // Flag to indicate OCR was garbage
      ocrWasGarbage: (ocrResult?.score === 0),
      colorProfile: imageDNA?.colorFingerprint?.dominantColors?.slice(0, 3)?.map(c => c.hex) || colorData?.dominantColors?.slice(0, 3) || [],
      hasDistinctiveShape: (imageDNA?.edgeFingerprint?.edgeDensity || shapeData?.edgeDensity || 0) > 30,
      // Pattern detection from texture fingerprint
      pattern: {
        type: imageDNA?.textureFingerprint?.patternType || patternData?.type || 'unknown',
        confidence: patternData?.confidence || 0,
        direction: patternData?.direction,
        spotCount: patternData?.spotCount,
        complexity: imageDNA?.textureFingerprint?.complexity,
        uniformity: imageDNA?.textureFingerprint?.uniformity,
      },
    },
    processing_status: 'completed',
    algorithm_version: '4.0.0', // Image DNA v2.0 with neural embeddings
  };

  if (visualDNA) {
    await visualDNA.update(dnaData);
  } else {
    visualDNA = await VisualDNA.create({
      photo_id: photoId,
      case_id: caseId,
      ...dnaData,
    });
  }

  return visualDNA;
};

/**
 * Extract color signature from image
 * Returns both histogram and dominant colors
 */
const extractColorSignature = async (imagePath) => {
  const sharp = require('sharp');
  const Jimp = require('jimp');

  try {
    // Get dominant colors using sharp
    const { dominant } = await sharp(imagePath)
      .resize(100, 100, { fit: 'cover' })
      .stats();

    // Convert image to PNG buffer using sharp (handles webp, avif, etc.)
    // This ensures Jimp can read any format that sharp supports
    const pngBuffer = await sharp(imagePath)
      .resize(32, 32, { fit: 'cover' })
      .png()
      .toBuffer();

    // Build color histogram using Jimp with PNG buffer (already resized by sharp)
    const image = await Jimp.read(pngBuffer);

    const histogram = new Array(64).fill(0); // 4x4x4 RGB bins
    const colorCounts = {};

    image.scan(0, 0, image.bitmap.width, image.bitmap.height, (x, y, idx) => {
      const r = image.bitmap.data[idx + 0];
      const g = image.bitmap.data[idx + 1];
      const b = image.bitmap.data[idx + 2];

      // Histogram bin
      const binR = Math.floor(r / 64);
      const binG = Math.floor(g / 64);
      const binB = Math.floor(b / 64);
      const binIndex = binR * 16 + binG * 4 + binB;
      histogram[binIndex]++;

      // Color name for dominant colors
      const colorName = getColorName(r, g, b);
      colorCounts[colorName] = (colorCounts[colorName] || 0) + 1;
    });

    // Normalize histogram
    const total = image.bitmap.width * image.bitmap.height;
    const normalizedHistogram = histogram.map(count => count / total);

    // Get top dominant colors
    const dominantColors = Object.entries(colorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([color]) => color);

    return {
      signature: normalizedHistogram,
      dominantColors,
      dominant: {
        r: dominant.r,
        g: dominant.g,
        b: dominant.b,
      },
    };
  } catch (error) {
    logger.error('[UniversalMatch] Color extraction error:', error);
    return { signature: null, dominantColors: [] };
  }
};

/**
 * Extract shape/silhouette signature from image
 * Uses edge detection to create a shape fingerprint
 */
const extractShapeSilhouette = async (imagePath) => {
  const sharp = require('sharp');

  try {
    // Convert to grayscale and detect edges
    const edgeBuffer = await sharp(imagePath)
      .resize(64, 64, { fit: 'contain', background: { r: 255, g: 255, b: 255 } })
      .grayscale()
      .normalise()
      .convolve({
        width: 3,
        height: 3,
        kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1], // Laplacian edge detection
      })
      .raw()
      .toBuffer();

    // Create shape signature from edge map
    const shapeSignature = [];
    const gridSize = 8; // 8x8 grid for shape descriptor
    const cellSize = 64 / gridSize;

    for (let gy = 0; gy < gridSize; gy++) {
      for (let gx = 0; gx < gridSize; gx++) {
        let cellSum = 0;
        for (let y = gy * cellSize; y < (gy + 1) * cellSize; y++) {
          for (let x = gx * cellSize; x < (gx + 1) * cellSize; x++) {
            cellSum += edgeBuffer[y * 64 + x] || 0;
          }
        }
        shapeSignature.push(cellSum / (cellSize * cellSize * 255));
      }
    }

    // Calculate aspect ratio and edge density
    const { width, height } = await sharp(imagePath).metadata();
    const aspectRatio = width / height;
    const edgeDensity = edgeBuffer.reduce((sum, v) => sum + v, 0) / (edgeBuffer.length * 255);

    // Get contour points (simplified)
    const contourPoints = extractContourPoints(edgeBuffer, 64, 64);

    return {
      signature: shapeSignature,
      aspectRatio,
      edgeDensity,
      contourPoints,
    };
  } catch (error) {
    logger.warn('[UniversalMatch] Shape extraction error:', error.message);
    return { signature: null, aspectRatio: 1, edgeDensity: 0, contourPoints: [] };
  }
};

/**
 * Extract simplified contour points from edge map
 */
const extractContourPoints = (edgeBuffer, width, height) => {
  const threshold = 128;
  const points = [];
  const step = 4; // Sample every 4 pixels

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = y * width + x;
      if (edgeBuffer[idx] > threshold) {
        points.push({ x: x / width, y: y / height });
      }
    }
  }

  return points.slice(0, 50); // Limit to 50 points
};

/**
 * Compare two shape signatures
 */
const compareShapes = (shape1, shape2) => {
  if (!shape1?.signature || !shape2?.signature) return 0;

  // Compare shape signatures using cosine similarity
  const signatureSim = calculateVectorSimilarity(shape1.signature, shape2.signature);

  // Compare aspect ratios (should be similar)
  const aspectDiff = Math.abs(shape1.aspectRatio - shape2.aspectRatio);
  const aspectSim = Math.max(0, 1 - aspectDiff);

  // Compare edge density (similar shapes have similar edge density)
  const densityDiff = Math.abs(shape1.edgeDensity - shape2.edgeDensity);
  const densitySim = Math.max(0, 1 - densityDiff * 5);

  // Weighted combination
  const totalSim = signatureSim * 0.6 + aspectSim * 0.25 + densitySim * 0.15;

  return totalSim;
};

/**
 * Convert RGB to color name
 */
const getColorName = (r, g, b) => {
  const colors = {
    'black': [0, 0, 0],
    'white': [255, 255, 255],
    'red': [255, 0, 0],
    'green': [0, 128, 0],
    'blue': [0, 0, 255],
    'yellow': [255, 255, 0],
    'orange': [255, 165, 0],
    'purple': [128, 0, 128],
    'pink': [255, 192, 203],
    'brown': [139, 69, 19],
    'gray': [128, 128, 128],
    'silver': [192, 192, 192],
    'gold': [255, 215, 0],
    'beige': [245, 245, 220],
    'navy': [0, 0, 128],
    'teal': [0, 128, 128],
  };

  let closestColor = 'unknown';
  let minDistance = Infinity;

  for (const [name, [cr, cg, cb]] of Object.entries(colors)) {
    const distance = Math.sqrt(
      Math.pow(r - cr, 2) +
      Math.pow(g - cg, 2) +
      Math.pow(b - cb, 2)
    );

    if (distance < minDistance) {
      minDistance = distance;
      closestColor = name;
    }
  }

  return closestColor;
};

/**
 * Determine entity type based on extracted features
 */
const determineEntityType = (ocrResult, colorData) => {
  const identifiers = ocrResult?.identifiers || {};

  // Vehicle indicators
  if (identifiers.licensePlates?.length > 0) {
    return 'vehicle';
  }

  // Document indicators
  if (identifiers.documentIds?.length > 0 ||
      (ocrResult?.text?.length > 100 && ocrResult?.confidence > 60)) {
    return 'document';
  }

  // Electronics indicators (serial numbers)
  if (identifiers.serialNumbers?.length > 0) {
    return 'item';
  }

  // Default to item
  return 'item';
};

/**
 * Auto-detect item category from image features
 * Uses color, shape, pattern, and OCR hints to guess the category
 */
const autoCategoryFromFeatures = (visualDNA) => {
  const hints = visualDNA.match_hints || {};
  const colors = visualDNA.dominant_colors || [];
  const pattern = hints.pattern || {};
  const shapeData = visualDNA.shape_data || {};
  const ocrText = (visualDNA.ocr_text || '').toLowerCase();

  // Category detection heuristics
  const scores = {
    pet: 0,
    jewelry: 0,
    electronics: 0,
    documents: 0,
    vehicle: 0,
    keys: 0,
    bags: 0,
    wallet: 0,
    other: 0,
  };

  // 1. License plates strongly indicate vehicle
  if (hints.licensePlates?.length > 0) {
    scores.vehicle += 90;
  }

  // 2. Document IDs or lots of text indicate documents
  if (hints.documentIds?.length > 0) {
    scores.documents += 80;
  }
  if (ocrText.length > 100) {
    scores.documents += 40;
  }

  // 3. Serial numbers suggest electronics
  if (hints.serialNumbers?.length > 0) {
    scores.electronics += 70;
  }

  // 4. Pet detection based on colors and patterns
  const petColors = ['brown', 'tan', 'beige', 'cream', 'golden', 'black', 'white', 'gray', 'orange', 'ginger'];
  const petColorCount = colors.filter(c => petColors.includes(c.toLowerCase())).length;
  if (petColorCount >= 2) {
    scores.pet += 30;
  }

  // Spotted or striped patterns common in pets
  if (pattern.type === 'spotted' || pattern.type === 'striped') {
    scores.pet += 25;
  }

  // Organic shapes (low edge density) suggest pets
  if (shapeData.edgeDensity && shapeData.edgeDensity < 0.15) {
    scores.pet += 15;
  }

  // 5. Jewelry detection - metallic colors and high edge density
  const metallicColors = ['silver', 'gold', 'rose gold', 'metallic'];
  const hasMetallic = colors.some(c => metallicColors.includes(c.toLowerCase()));
  if (hasMetallic) {
    scores.jewelry += 40;
  }
  if (shapeData.edgeDensity && shapeData.edgeDensity > 0.35) {
    scores.jewelry += 20;
    scores.keys += 20; // High edge density also common for keys
  }

  // 6. Keys - typically metallic with very high edge density
  if (hasMetallic && shapeData.edgeDensity > 0.4) {
    scores.keys += 30;
  }

  // 7. Bags - typically solid colors with medium edge density
  if (pattern.type === 'solid' && shapeData.aspectRatio && shapeData.aspectRatio < 1.5) {
    scores.bags += 25;
  }

  // 8. Text-based hints from OCR
  const docKeywords = ['passport', 'license', 'certificate', 'id card', 'visa', 'permit'];
  const electronicKeywords = ['apple', 'samsung', 'iphone', 'laptop', 'phone', 'tablet', 'model', 'sn:', 'imei'];
  const petKeywords = ['dog', 'cat', 'puppy', 'kitten', 'collar', 'pet'];

  for (const keyword of docKeywords) {
    if (ocrText.includes(keyword)) scores.documents += 30;
  }
  for (const keyword of electronicKeywords) {
    if (ocrText.includes(keyword)) scores.electronics += 25;
  }
  for (const keyword of petKeywords) {
    if (ocrText.includes(keyword)) scores.pet += 30;
  }

  // Find highest scoring category
  let maxScore = 0;
  let detectedCategory = 'other';

  for (const [category, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      detectedCategory = category;
    }
  }

  // Only return if confidence is reasonable (score > 30)
  if (maxScore < 30) {
    return { category: 'other', confidence: 0, scores };
  }

  return {
    category: detectedCategory,
    confidence: Math.min(100, maxScore),
    scores,
  };
};

/**
 * Find smart candidates using category and entity filtering
 */
const findSmartCandidates = async (caseType, itemCategory, entityType, sourceVisualDNA) => {
  // Get compatible categories
  const compatibleCategories = CATEGORY_COMPATIBILITY[itemCategory] || CATEGORY_COMPATIBILITY.other;
  const compatibleEntities = ENTITY_COMPATIBILITY[entityType] || ENTITY_COMPATIBILITY.unknown;

  // Build case query
  const caseWhere = {
    case_type: caseType,
    status: 'active',
  };

  // Only filter by category if we have a specific one
  if (itemCategory !== 'other') {
    caseWhere.item_category = { [Op.in]: compatibleCategories };
  }

  const cases = await Case.findAll({
    where: caseWhere,
    attributes: ['id'],
  });

  const caseIds = cases.map(c => c.id);

  if (caseIds.length === 0) {
    return [];
  }

  // Get Visual DNA records
  const dnaWhere = {
    case_id: { [Op.in]: caseIds },
    processing_status: 'completed',
  };

  // Filter by entity type if specific
  if (entityType !== 'unknown') {
    dnaWhere.entity_type = { [Op.in]: compatibleEntities };
  }

  const candidates = await VisualDNA.findAll({ where: dnaWhere });

  // Smart pre-sorting based on source features
  const sourceHints = sourceVisualDNA.match_hints || {};

  // Priority sorting:
  // 1. Same color profile
  // 2. Has matching identifier types
  // 3. Recent items first
  return candidates.sort((a, b) => {
    let scoreA = 0;
    let scoreB = 0;

    const hintsA = a.match_hints || {};
    const hintsB = b.match_hints || {};

    // Color match priority
    const sourceColors = sourceHints.colorProfile || [];
    const colorsA = hintsA.colorProfile || [];
    const colorsB = hintsB.colorProfile || [];

    const colorMatchA = sourceColors.filter(c => colorsA.includes(c)).length;
    const colorMatchB = sourceColors.filter(c => colorsB.includes(c)).length;
    scoreA += colorMatchA * 10;
    scoreB += colorMatchB * 10;

    // Identifier type match priority
    if (sourceHints.hasLicensePlate && hintsA.hasLicensePlate) scoreA += 50;
    if (sourceHints.hasLicensePlate && hintsB.hasLicensePlate) scoreB += 50;
    if (sourceHints.hasSerialNumber && hintsA.hasSerialNumber) scoreA += 40;
    if (sourceHints.hasSerialNumber && hintsB.hasSerialNumber) scoreB += 40;

    return scoreB - scoreA;
  });
};

/**
 * Comprehensive photo comparison using all available features
 * Now includes Image DNA comparison for enhanced matching
 */
const comparePhotosComprehensive = async (source, target, weights) => {
  const scores = {
    hashScore: 0,
    colorScore: 0,
    shapeScore: 0,
    visualScore: 0,
    ocrScore: 0,
    objectScore: 0,
    dnaScore: 0, // NEW: Image DNA score
  };

  const details = {};
  const matchedIdentifiers = {
    licensePlates: [],
    serialNumbers: [],
    documentIds: [],
    colors: [],
    shapeMatch: null,
    imageDnaMatch: null, // NEW
  };

  let matchType = 'visual';
  let hasHighValueMatch = false;

  // DNA v2.0 Comparison (most comprehensive) - Use neural embeddings if available
  if (source.dna_v2_full && target.dna_v2_full) {
    try {
      const dnaComparison = imageDnaService.compareDNA_v2(source.dna_v2_full, target.dna_v2_full);
      scores.dnaScore = dnaComparison.overall || 0;

      // Also compare neural embeddings for semantic similarity
      let neuralScore = 0;
      if (source.neural_embedding && target.neural_embedding) {
        neuralScore = Math.round(neuralEmbeddingService.cosineSimilarity(
          source.neural_embedding,
          target.neural_embedding
        ) * 100);

        // Blend neural score with DNA score (neural captures semantic similarity)
        scores.dnaScore = Math.round(scores.dnaScore * 0.6 + neuralScore * 0.4);
      }

      details.imageDnaComparison = {
        overall: dnaComparison.overall,
        neuralScore,
        pHash: dnaComparison.pHash,
        dHash: dnaComparison.dHash,
        aHash: dnaComparison.aHash,
        blockHash: dnaComparison.blockHash,
        color: dnaComparison.color,
        edge: dnaComparison.edge,
        texture: dnaComparison.texture,
        entityMatch: dnaComparison.entityMatch,
        version: 'v2',
      };

      matchedIdentifiers.imageDnaMatch = {
        sourceDnaId: source.dna_v2_id || source.image_dna_id,
        targetDnaId: target.dna_v2_id || target.image_dna_id,
        similarity: scores.dnaScore,
        neuralScore,
        components: dnaComparison,
      };

      logger.debug(`[UniversalMatch] DNA v2 comparison: ${scores.dnaScore}% (neural:${neuralScore}, p:${dnaComparison.pHash}, c:${dnaComparison.color})`);

      // If DNA match is very high, it's a strong visual match
      if (scores.dnaScore >= 85) {
        matchType = 'image_dna';
        hasHighValueMatch = true;
      }
    } catch (err) {
      logger.warn('[UniversalMatch] DNA v2 comparison failed:', err.message);
    }
  }
  // Fallback to DNA v1 comparison
  else if (source.image_dna && target.image_dna) {
    try {
      const dnaComparison = imageDnaService.compareDNA(source.image_dna, target.image_dna);
      scores.dnaScore = dnaComparison.overall || 0;

      details.imageDnaComparison = {
        overall: dnaComparison.overall,
        pHash: dnaComparison.pHash,
        dHash: dnaComparison.dHash,
        aHash: dnaComparison.aHash,
        blockHash: dnaComparison.blockHash,
        color: dnaComparison.color,
        edge: dnaComparison.edge,
        texture: dnaComparison.texture,
        version: 'v1',
      };

      matchedIdentifiers.imageDnaMatch = {
        sourceDnaId: source.image_dna_id,
        targetDnaId: target.image_dna_id,
        similarity: dnaComparison.overall,
        components: dnaComparison,
      };

      logger.debug(`[UniversalMatch] DNA v1 comparison: ${dnaComparison.overall}% (p:${dnaComparison.pHash}, c:${dnaComparison.color}, e:${dnaComparison.edge})`);

      // If DNA match is very high, it's a strong visual match
      if (dnaComparison.overall >= 85) {
        matchType = 'image_dna';
        hasHighValueMatch = true;
      }
    } catch (err) {
      logger.warn('[UniversalMatch] DNA comparison failed:', err.message);
    }
  }

  // 1. Hash Similarity (use DNA hashes if available, fallback to legacy)
  if (source.perceptual_hash && target.perceptual_hash) {
    // Use Image DNA hash scores if available
    if (details.imageDnaComparison) {
      const dnaHashes = details.imageDnaComparison;
      scores.hashScore = Math.round(
        (dnaHashes.pHash || 0) * 0.4 +
        (dnaHashes.dHash || 0) * 0.25 +
        (dnaHashes.aHash || 0) * 0.20 +
        (dnaHashes.blockHash || 0) * 0.15
      );
      details.hashSimilarity = {
        perceptual: dnaHashes.pHash,
        average: dnaHashes.aHash,
        difference: dnaHashes.dHash,
        block: dnaHashes.blockHash,
        source: 'image_dna',
      };
    } else {
      // Legacy hash comparison
      const pHashSim = hashingService.hashSimilarity(source.perceptual_hash, target.perceptual_hash);
      const aHashSim = hashingService.hashSimilarity(source.average_hash || '', target.average_hash || '');
      const dHashSim = hashingService.hashSimilarity(source.difference_hash || '', target.difference_hash || '');

      scores.hashScore = Math.round(pHashSim * 0.5 + aHashSim * 0.25 + dHashSim * 0.25);
      details.hashSimilarity = { perceptual: pHashSim, average: aHashSim, difference: dHashSim, source: 'legacy' };
    }
  }

  // 2. Color Similarity (very important for visual items)
  if (source.color_signature && target.color_signature) {
    const colorSim = calculateVectorSimilarity(source.color_signature, target.color_signature);
    scores.colorScore = Math.round(colorSim * 100);
    details.colorSimilarity = colorSim;

    // Also check dominant colors
    const sourceColors = source.dominant_colors || [];
    const targetColors = target.dominant_colors || [];
    const commonColors = sourceColors.filter(c => targetColors.includes(c));

    if (commonColors.length > 0) {
      matchedIdentifiers.colors = commonColors;
      details.matchingColors = commonColors;

      // Boost color score for exact color matches
      scores.colorScore = Math.min(100, scores.colorScore + commonColors.length * 10);
    }
  }

  // 3. Shape/Silhouette Similarity (important for keys, jewelry, bags)
  if (source.shape_signature && target.shape_signature) {
    const sourceShape = {
      signature: source.shape_signature,
      aspectRatio: source.shape_data?.aspectRatio || 1,
      edgeDensity: source.shape_data?.edgeDensity || 0,
    };
    const targetShape = {
      signature: target.shape_signature,
      aspectRatio: target.shape_data?.aspectRatio || 1,
      edgeDensity: target.shape_data?.edgeDensity || 0,
    };

    const shapeSim = compareShapes(sourceShape, targetShape);
    scores.shapeScore = Math.round(shapeSim * 100);
    details.shapeSimilarity = shapeSim;
    details.shapeDetails = {
      sourceAspectRatio: sourceShape.aspectRatio,
      targetAspectRatio: targetShape.aspectRatio,
      sourceEdgeDensity: sourceShape.edgeDensity,
      targetEdgeDensity: targetShape.edgeDensity,
    };

    if (scores.shapeScore >= 70) {
      matchedIdentifiers.shapeMatch = {
        similarity: scores.shapeScore,
        aspectRatioMatch: Math.abs(sourceShape.aspectRatio - targetShape.aspectRatio) < 0.2,
      };
    }
  }

  // 4. License Plate Matching (vehicles)
  const sourcePlates = source.match_hints?.licensePlates || [];
  const targetPlates = target.match_hints?.licensePlates || [];

  if (sourcePlates.length > 0 && targetPlates.length > 0) {
    const plateMatch = findBestMatch(sourcePlates, targetPlates);
    if (plateMatch.similarity >= THRESHOLDS.LICENSE_PLATE_EXACT) {
      scores.ocrScore = 100;
      matchedIdentifiers.licensePlates.push({
        source: plateMatch.source,
        target: plateMatch.target,
        similarity: plateMatch.similarity,
      });
      matchType = 'license_plate';
      hasHighValueMatch = true;
      details.licensePlateMatch = plateMatch;
    }
  }

  // 4. Serial Number Matching (electronics)
  const sourceSerials = source.match_hints?.serialNumbers || [];
  const targetSerials = target.match_hints?.serialNumbers || [];

  if (sourceSerials.length > 0 && targetSerials.length > 0) {
    const serialMatch = findBestMatch(sourceSerials, targetSerials);
    if (serialMatch.similarity >= THRESHOLDS.SERIAL_NUMBER_EXACT) {
      scores.ocrScore = Math.max(scores.ocrScore, 100);
      matchedIdentifiers.serialNumbers.push({
        source: serialMatch.source,
        target: serialMatch.target,
        similarity: serialMatch.similarity,
      });
      matchType = hasHighValueMatch ? 'combined' : 'serial_number';
      hasHighValueMatch = true;
      details.serialNumberMatch = serialMatch;
    }
  }

  // 5. General OCR Text Similarity (for text-heavy items)
  if (!hasHighValueMatch && source.ocr_text && target.ocr_text) {
    const textSim = calculateTextSimilarity(source.ocr_text, target.ocr_text);
    scores.ocrScore = Math.max(scores.ocrScore, Math.round(textSim * 100));
    details.textSimilarity = textSim;

    if (scores.ocrScore >= THRESHOLDS.OCR_SIMILARITY_MIN) {
      matchType = 'text';
    }
  }

  // 5b. ASYMMETRIC OCR HANDLING
  // When one image has text but the other doesn't, don't penalize the match
  // Instead, rely on visual features (hash, color, shape)
  const sourceHasText = (source.ocr_text?.length || 0) > 20;
  const targetHasText = (target.ocr_text?.length || 0) > 20;
  const isAsymmetricOCR = (sourceHasText && !targetHasText) || (!sourceHasText && targetHasText);

  if (isAsymmetricOCR) {
    // One has text, one doesn't - this is common (e.g., screenshot vs photo of same item)
    // Redistribute OCR weight to visual features for fairer comparison
    const ocrWeight = weights.OCR || 0.15;
    weights.OCR = 0.05; // Minimal weight since we can't compare

    // Boost visual features that ARE comparable
    weights.HASH = (weights.HASH || 0.15) + ocrWeight * 0.35;
    weights.COLOR = (weights.COLOR || 0.20) + ocrWeight * 0.35;
    weights.VISUAL_FEATURES = (weights.VISUAL_FEATURES || 0.20) + ocrWeight * 0.20;
    weights.SHAPE = (weights.SHAPE || 0.15) + ocrWeight * 0.10;

    details.asymmetricOCR = {
      sourceHasText,
      targetHasText,
      weightsRedistributed: true,
    };

    logger.debug(`[UniversalMatch] Asymmetric OCR detected - redistributed weights to visual features`);
  }

  // 6. Detected Objects Similarity
  const sourceObjects = source.detected_objects || [];
  const targetObjects = target.detected_objects || [];

  if (sourceObjects.length > 0 && targetObjects.length > 0) {
    const objectSim = calculateObjectSimilarity(sourceObjects, targetObjects);
    scores.objectScore = Math.round(objectSim * 100);
    details.objectSimilarity = objectSim;
  }

  // 7. Visual Feature Similarity (deep features if available)
  if (source.object_features && target.object_features) {
    const visualSim = calculateVectorSimilarity(source.object_features, target.object_features);
    scores.visualScore = Math.round(visualSim * 100);
    details.visualFeatureSimilarity = visualSim;
  }

  // 8. Pattern Matching (stripes, spots, solid - important for pets and fabric)
  const sourcePattern = source.match_hints?.pattern;
  const targetPattern = target.match_hints?.pattern;

  if (sourcePattern?.type && targetPattern?.type && sourcePattern.type !== 'unknown' && targetPattern.type !== 'unknown') {
    if (sourcePattern.type === targetPattern.type) {
      // Same pattern type - boost visual score
      const patternBoost = Math.min(sourcePattern.confidence, targetPattern.confidence) / 5;
      scores.visualScore = Math.min(100, scores.visualScore + patternBoost);
      details.patternMatch = {
        type: sourcePattern.type,
        match: true,
        sourceConfidence: sourcePattern.confidence,
        targetConfidence: targetPattern.confidence,
      };

      // Extra boost for striped patterns with same direction
      if (sourcePattern.type === 'striped' && sourcePattern.direction === targetPattern.direction) {
        scores.visualScore = Math.min(100, scores.visualScore + 5);
      }
    } else {
      // Different pattern types - slight penalty
      details.patternMatch = {
        sourceType: sourcePattern.type,
        targetType: targetPattern.type,
        match: false,
      };
    }
  }

  // 9. Pet-Specific Matching (when both appear to be pets)
  const sourceIsPet = detectIfPet(source);
  const targetIsPet = detectIfPet(target);

  if (sourceIsPet && targetIsPet) {
    const sourcePetFeatures = extractPetFeatures(source);
    const targetPetFeatures = extractPetFeatures(target);
    const petScore = comparePetFeatures(sourcePetFeatures, targetPetFeatures);

    details.petMatch = {
      isPetMatch: true,
      petScore,
      sourceFeatures: sourcePetFeatures,
      targetFeatures: targetPetFeatures,
    };

    // Boost color and visual scores based on pet matching
    if (petScore >= 70) {
      scores.colorScore = Math.min(100, scores.colorScore + 15);
      scores.visualScore = Math.min(100, scores.visualScore + 10);
      matchType = 'pet';
    } else if (petScore >= 50) {
      scores.colorScore = Math.min(100, scores.colorScore + 8);
    }
  }

  // Calculate overall score using category-specific weights
  let overallScore;

  // NEW: If we have a high DNA score, use it as the primary indicator
  if (scores.dnaScore >= 85) {
    // Image DNA is highly reliable - use it as primary score
    overallScore = Math.round(
      scores.dnaScore * 0.50 +
      scores.hashScore * 0.15 +
      scores.colorScore * 0.15 +
      scores.shapeScore * 0.10 +
      scores.visualScore * 0.10
    );
    matchType = 'image_dna';
  } else if (hasHighValueMatch && matchType !== 'image_dna') {
    // High-value matches (license plate, serial) get boosted
    overallScore = Math.min(100, Math.round(
      scores.hashScore * 0.1 +
      scores.colorScore * 0.1 +
      scores.shapeScore * 0.05 +
      scores.ocrScore * 0.55 +
      scores.visualScore * 0.1 +
      scores.objectScore * 0.1
    ));
  } else if (scores.dnaScore > 0) {
    // Blend DNA score with category-specific weights
    overallScore = Math.round(
      scores.dnaScore * 0.30 + // DNA gets significant weight
      scores.hashScore * (weights.HASH || 0.15) * 0.70 +
      scores.colorScore * (weights.COLOR || 0.20) * 0.70 +
      scores.shapeScore * (weights.SHAPE || 0.15) * 0.70 +
      scores.ocrScore * (weights.OCR || 0.15) * 0.70 +
      scores.visualScore * (weights.VISUAL_FEATURES || 0.20) * 0.70 +
      scores.objectScore * (weights.DETECTED_OBJECTS || 0.15) * 0.70
    );
  } else {
    // No DNA available - use category-specific weights
    overallScore = Math.round(
      scores.hashScore * (weights.HASH || 0.15) +
      scores.colorScore * (weights.COLOR || 0.20) +
      scores.shapeScore * (weights.SHAPE || 0.15) +
      scores.ocrScore * (weights.OCR || 0.15) +
      scores.visualScore * (weights.VISUAL_FEATURES || 0.20) +
      scores.objectScore * (weights.DETECTED_OBJECTS || 0.15)
    );
  }

  // Determine match type if not already set
  if (!hasHighValueMatch) {
    if (scores.colorScore >= 70 && scores.hashScore >= 60) {
      matchType = 'visual';
    } else if (scores.shapeScore >= 75) {
      matchType = 'shape';
    } else if (scores.colorScore >= 80) {
      matchType = 'color';
    } else if (scores.visualScore >= 70) {
      matchType = 'visual_features';
    }
  }

  // Generate human-readable match reasons for the frontend
  const matchReasons = [];

  // NEW: Image DNA match reason (most important)
  if (scores.dnaScore >= 70) {
    const dnaDetails = details.imageDnaComparison || {};
    matchReasons.push({
      type: 'image_dna',
      icon: '🧬',
      text: `Image DNA match (${scores.dnaScore}% fingerprint similarity)`,
      score: scores.dnaScore,
      dnaDetails: {
        pHash: dnaDetails.pHash,
        color: dnaDetails.color,
        edge: dnaDetails.edge,
        texture: dnaDetails.texture,
      },
    });
  }

  if (hasHighValueMatch && matchedIdentifiers.licensePlates.length > 0) {
    matchReasons.push({
      type: 'license_plate',
      icon: '🚗',
      text: `License plate match: ${matchedIdentifiers.licensePlates[0].source}`,
      score: scores.ocrScore,
    });
  }

  if (hasHighValueMatch && matchedIdentifiers.serialNumbers.length > 0) {
    matchReasons.push({
      type: 'serial_number',
      icon: '🔢',
      text: `Serial number match: ${matchedIdentifiers.serialNumbers[0].source}`,
      score: scores.ocrScore,
    });
  }

  if (scores.colorScore >= 60 && matchedIdentifiers.colors.length > 0) {
    matchReasons.push({
      type: 'color',
      icon: '🎨',
      text: `Matching colors: ${matchedIdentifiers.colors.slice(0, 3).join(', ')}`,
      score: scores.colorScore,
      colors: matchedIdentifiers.colors,
    });
  }

  if (scores.shapeScore >= 60) {
    matchReasons.push({
      type: 'shape',
      icon: '📐',
      text: `Similar shape/silhouette (${scores.shapeScore}% match)`,
      score: scores.shapeScore,
    });
  }

  // Pattern match reason (stripes, spots, solid)
  if (details.patternMatch?.match && details.patternMatch.type !== 'unknown') {
    const patternLabels = {
      solid: 'Solid color pattern',
      striped: 'Striped pattern',
      spotted: 'Spotted/dotted pattern',
      checkered: 'Checkered pattern',
      gradient: 'Gradient pattern',
      mixed: 'Mixed pattern',
    };
    matchReasons.push({
      type: 'pattern',
      icon: '🔲',
      text: `${patternLabels[details.patternMatch.type] || 'Similar pattern'} match`,
      score: Math.min(details.patternMatch.sourceConfidence, details.patternMatch.targetConfidence),
      patternType: details.patternMatch.type,
    });
  }

  // Pet match reason
  if (details.petMatch?.isPetMatch && details.petMatch.petScore >= 50) {
    const petFeatures = details.petMatch.sourceFeatures;
    let petDescription = petFeatures.coatType !== 'unknown' ? petFeatures.coatType : '';
    if (petFeatures.primaryColor) {
      petDescription = petFeatures.primaryColor + (petDescription ? ` ${petDescription}` : '');
    }
    matchReasons.push({
      type: 'pet',
      icon: '🐾',
      text: `Pet match: ${petDescription || 'similar appearance'} (${details.petMatch.petScore}% match)`,
      score: details.petMatch.petScore,
      petFeatures: petFeatures,
    });
  }

  if (scores.hashScore >= 70) {
    matchReasons.push({
      type: 'visual',
      icon: '👁️',
      text: `Visually similar appearance (${scores.hashScore}% match)`,
      score: scores.hashScore,
    });
  }

  if (scores.ocrScore >= 50 && !hasHighValueMatch) {
    matchReasons.push({
      type: 'text',
      icon: '📝',
      text: `Similar text content detected`,
      score: scores.ocrScore,
    });
  }

  // Sort reasons by score
  matchReasons.sort((a, b) => b.score - a.score);

  return {
    overallScore: Math.min(100, Math.max(0, overallScore)),
    dnaScore: scores.dnaScore, // NEW: Image DNA score
    hashScore: scores.hashScore,
    colorScore: scores.colorScore,
    shapeScore: scores.shapeScore,
    ocrScore: scores.ocrScore,
    visualScore: scores.visualScore,
    objectScore: scores.objectScore,
    matchType,
    matchReasons, // Human-readable reasons why items matched
    details,
    matchedIdentifiers,
  };
};

/**
 * Find best matching string between two arrays
 */
const findBestMatch = (sourceArray, targetArray) => {
  let bestMatch = { source: '', target: '', similarity: 0 };

  for (const source of sourceArray) {
    for (const target of targetArray) {
      const similarity = calculateStringSimilarity(
        normalizeIdentifier(source),
        normalizeIdentifier(target)
      );

      if (similarity > bestMatch.similarity) {
        bestMatch = { source, target, similarity };
      }
    }
  }

  return bestMatch;
};

/**
 * Normalize identifier for comparison
 */
const normalizeIdentifier = (str) => {
  return str
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();
};

/**
 * Calculate string similarity (Levenshtein)
 */
const calculateStringSimilarity = (str1, str2) => {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 100;

  const len1 = str1.length;
  const len2 = str2.length;
  const maxLen = Math.max(len1, len2);

  if (maxLen === 0) return 100;

  const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));

  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return Math.round(((maxLen - matrix[len1][len2]) / maxLen) * 100);
};

/**
 * Calculate text similarity (word overlap)
 */
const calculateTextSimilarity = (text1, text2) => {
  if (!text1 || !text2) return 0;

  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 2));

  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = [...words1].filter(w => words2.has(w)).length;
  const union = new Set([...words1, ...words2]).size;

  return intersection / union;
};

/**
 * Calculate vector similarity (cosine)
 */
const calculateVectorSimilarity = (vec1, vec2) => {
  if (!vec1 || !vec2 || vec1.length !== vec2.length) return 0;

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }

  const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
};

/**
 * Calculate object detection similarity
 */
const calculateObjectSimilarity = (objects1, objects2) => {
  if (!objects1?.length || !objects2?.length) return 0;

  // Extract class names
  const classes1 = new Set(objects1.map(o => (o.class || o.label || '').toLowerCase()));
  const classes2 = new Set(objects2.map(o => (o.class || o.label || '').toLowerCase()));

  if (classes1.size === 0 || classes2.size === 0) return 0;

  const intersection = [...classes1].filter(c => classes2.has(c)).length;
  const union = new Set([...classes1, ...classes2]).size;

  return intersection / union;
};

/**
 * Get matches for a case
 */
const getMatchesForCase = async (caseId) => {
  const matches = await PhotoMatch.findAll({
    where: {
      [Op.or]: [
        { source_case_id: caseId },
        { target_case_id: caseId },
      ],
      overall_score: { [Op.gte]: THRESHOLDS.OVERALL_MATCH_MIN },
    },
    order: [['overall_score', 'DESC'], ['created_at', 'DESC']],
    include: [
      {
        model: Photo,
        as: 'sourcePhoto',
        attributes: ['id', 'image_url', 'case_id'],
      },
      {
        model: Photo,
        as: 'targetPhoto',
        attributes: ['id', 'image_url', 'case_id'],
      },
    ],
  });

  return matches;
};

/**
 * Get pending matches for a user
 */
const getPendingMatchesForUser = async (userId) => {
  const userCases = await Case.findAll({
    where: { poster_id: userId },
    attributes: ['id'],
  });

  const caseIds = userCases.map(c => c.id);

  if (caseIds.length === 0) {
    return [];
  }

  return PhotoMatch.findAll({
    where: {
      [Op.or]: [
        { source_case_id: { [Op.in]: caseIds } },
        { target_case_id: { [Op.in]: caseIds } },
      ],
      status: { [Op.in]: ['pending', 'notified'] },
      overall_score: { [Op.gte]: THRESHOLDS.OVERALL_MATCH_MIN },
    },
    order: [['overall_score', 'DESC'], ['created_at', 'DESC']],
  });
};

/**
 * Submit match feedback with optional rejection reasons
 * @param {string} matchId - The match ID
 * @param {string} userId - The user submitting feedback
 * @param {string} feedback - 'confirmed', 'rejected', or 'unsure'
 * @param {boolean} isSourceUser - Whether the user is the source case owner
 * @param {Array} rejectionReasons - Array of rejection reason codes (for rejected feedback)
 * @param {string} rejectionDetails - Free-text explanation (for rejected feedback)
 */
const submitMatchFeedback = async (matchId, userId, feedback, isSourceUser, rejectionReasons = null, rejectionDetails = null) => {
  const match = await PhotoMatch.findByPk(matchId);
  if (!match) return null;

  if (isSourceUser) {
    match.source_user_feedback = feedback;
    if (feedback === 'rejected') {
      match.source_rejection_reasons = rejectionReasons;
      match.source_rejection_details = rejectionDetails;
    }
  } else {
    match.target_user_feedback = feedback;
    if (feedback === 'rejected') {
      match.target_rejection_reasons = rejectionReasons;
      match.target_rejection_details = rejectionDetails;
    }
  }

  if (match.source_user_feedback === 'confirmed' && match.target_user_feedback === 'confirmed') {
    match.status = 'confirmed';
    match.resolved_at = new Date();
  } else if (feedback === 'rejected') {
    match.status = 'rejected';
    match.resolved_at = new Date();
  }

  await match.save();

  // Log feedback for ML training purposes
  logger.info(`[MatchFeedback] Match ${matchId} received ${feedback} from ${isSourceUser ? 'source' : 'target'} user`, {
    matchId,
    feedback,
    rejectionReasons,
    hasDetails: !!rejectionDetails,
  });

  // Create training pair for ML improvement (async, don't block response)
  try {
    const trainingDataService = require('./trainingDataService');
    trainingDataService.createTrainingPairFromFeedback(
      matchId,
      userId,
      feedback,
      isSourceUser,
      rejectionReasons,
      rejectionDetails
    ).catch(err => {
      logger.warn('[MatchFeedback] Failed to create training pair:', err.message);
    });
  } catch (err) {
    logger.warn('[MatchFeedback] Training data service unavailable:', err.message);
  }

  return match;
};

module.exports = {
  findMatchesForPhoto,
  getMatchesForCase,
  getPendingMatchesForUser,
  submitMatchFeedback,
  extractComprehensiveFingerprints,
  THRESHOLDS,
  CATEGORY_WEIGHTS,
};
