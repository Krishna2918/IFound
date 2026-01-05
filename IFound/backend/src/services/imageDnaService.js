/**
 * Image DNA Service - Comprehensive Image Fingerprinting v2.0
 *
 * Creates a unique "DNA" for each image that can be used for matching.
 * Like a fingerprint, this DNA remains similar for visually similar images
 * even after resizing, cropping, or compression.
 *
 * v2.0 Components:
 * 1. Perceptual Hashes (pHash, dHash, aHash, blockHash) - visual fingerprint
 * 2. HSV Color Fingerprint - perceptually uniform color matching
 * 3. Edge Fingerprint - shape/structure detection
 * 4. Neural Embeddings - DINOv2 deep features (via neuralEmbeddingService)
 * 5. Human-Readable DNA ID - PET-BRN.ORG-VERT-dino7f3a-phash4c2b-Q85
 */

const sharp = require('sharp');
const crypto = require('crypto');
const logger = require('../utils/logger');

// Constants for DNA generation
const DNA_VERSION = '2.0.0';
const HASH_SIZE = 16; // 16x16 = 256 bits for better accuracy
const COLOR_BINS = 8; // Color histogram bins per channel

// Color abbreviation map for human-readable DNA
const COLOR_ABBREVIATIONS = {
  red: 'RED', orange: 'ORG', yellow: 'YEL', lime: 'LIM',
  green: 'GRN', cyan: 'CYN', blue: 'BLU', purple: 'PUR',
  pink: 'PNK', brown: 'BRN', black: 'BLK', white: 'WHT',
  gray: 'GRY', gold: 'GLD', silver: 'SLV', beige: 'BGE',
  maroon: 'MRN', navy: 'NVY', teal: 'TEL', olive: 'OLV',
};

// Entity type abbreviations
const ENTITY_ABBREVIATIONS = {
  pet: 'PET',
  person: 'PER',
  vehicle: 'VEH',
  document: 'DOC',
  item: 'ITM',
  unknown: 'UNK',
};

// Shape code abbreviations
const SHAPE_CODES = {
  vertical: 'VERT',
  horizontal: 'HORZ',
  square: 'SQR',
  portrait: 'PORT',
  landscape: 'LAND',
};

/**
 * Generate comprehensive Image DNA
 *
 * @param {Buffer|string} imageInput - Image buffer or file path
 * @returns {Promise<Object>} Image DNA object
 */
const generateImageDNA = async (imageInput) => {
  const startTime = Date.now();

  try {
    // Load image and get metadata
    const image = sharp(imageInput);
    const metadata = await image.metadata();

    // Generate all fingerprints in parallel for performance
    const [
      perceptualHashes,
      colorFingerprint,
      edgeFingerprint,
      textureFingerprint,
      blurAnalysis,
    ] = await Promise.all([
      generatePerceptualHashes(imageInput),
      generateColorFingerprint(imageInput),
      generateEdgeFingerprint(imageInput),
      generateTextureFingerprint(imageInput),
      analyzeBlurriness(imageInput),
    ]);

    // Calculate overall quality score
    const qualityScore = calculateQualityScore(blurAnalysis, edgeFingerprint, metadata);

    // Combine all components into final DNA
    const dnaComponents = {
      version: DNA_VERSION,
      metadata: {
        width: metadata.width,
        height: metadata.height,
        aspectRatio: (metadata.width / metadata.height).toFixed(3),
        format: metadata.format,
      },
      perceptualHashes,
      colorFingerprint,
      edgeFingerprint,
      textureFingerprint,
      blurAnalysis,
      qualityScore,
    };

    // Generate unique DNA ID from all components
    const dnaId = generateDNAId(dnaComponents);

    return {
      dnaId,
      ...dnaComponents,
      processingTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    throw new Error(`Image DNA generation failed: ${error.message}`);
  }
};

/**
 * Generate multiple perceptual hashes for robust matching
 * Each hash type captures different visual characteristics
 */
const generatePerceptualHashes = async (imageInput) => {
  const [pHash, dHash, aHash, blockHash] = await Promise.all([
    generatePHash(imageInput),
    generateDHash(imageInput),
    generateAHash(imageInput),
    generateBlockHash(imageInput),
  ]);

  return {
    pHash,      // DCT-based, best for overall similarity
    dHash,      // Gradient-based, good for detecting manipulations
    aHash,      // Average-based, fast and robust to color changes
    blockHash,  // Block mean, good for detecting crops
  };
};

/**
 * Perceptual Hash (pHash) - DCT-based
 * Best for: Overall visual similarity, robust to scaling/compression
 *
 * Algorithm:
 * 1. Resize to 32x32
 * 2. Convert to grayscale
 * 3. Apply DCT (Discrete Cosine Transform)
 * 4. Keep top-left 8x8 (low frequencies)
 * 5. Compare to median to generate hash
 */
const generatePHash = async (imageInput) => {
  try {
    // Resize to 32x32 for DCT
    const { data, info } = await sharp(imageInput)
      .resize(32, 32, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Apply simplified DCT-like transform (using block averages as approximation)
    const size = 8;
    const blocks = [];

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let sum = 0;
        const blockSize = 4;
        for (let by = 0; by < blockSize; by++) {
          for (let bx = 0; bx < blockSize; bx++) {
            const idx = (y * blockSize + by) * 32 + (x * blockSize + bx);
            sum += data[idx];
          }
        }
        blocks.push(sum / (blockSize * blockSize));
      }
    }

    // Calculate median
    const sorted = [...blocks].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    // Generate binary hash
    let hash = '';
    for (const val of blocks) {
      hash += val > median ? '1' : '0';
    }

    return binaryToHex(hash);
  } catch (error) {
    console.error('pHash generation failed:', error.message);
    return null;
  }
};

/**
 * Difference Hash (dHash) - Gradient-based
 * Best for: Detecting image manipulations, horizontal gradients
 *
 * Algorithm:
 * 1. Resize to (hash_size+1) x hash_size
 * 2. Convert to grayscale
 * 3. Compare each pixel to the one to its right
 */
const generateDHash = async (imageInput) => {
  try {
    const size = HASH_SIZE;
    const { data } = await sharp(imageInput)
      .resize(size + 1, size, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let hash = '';
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = y * (size + 1) + x;
        hash += data[idx] < data[idx + 1] ? '1' : '0';
      }
    }

    return binaryToHex(hash);
  } catch (error) {
    console.error('dHash generation failed:', error.message);
    return null;
  }
};

/**
 * Average Hash (aHash) - Mean comparison
 * Best for: Fast comparison, color-invariant matching
 *
 * Algorithm:
 * 1. Resize to hash_size x hash_size
 * 2. Convert to grayscale
 * 3. Calculate average brightness
 * 4. Compare each pixel to average
 */
const generateAHash = async (imageInput) => {
  try {
    const size = HASH_SIZE;
    const { data } = await sharp(imageInput)
      .resize(size, size, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Calculate average
    const total = data.reduce((sum, val) => sum + val, 0);
    const avg = total / data.length;

    // Generate hash
    let hash = '';
    for (const val of data) {
      hash += val > avg ? '1' : '0';
    }

    return binaryToHex(hash);
  } catch (error) {
    console.error('aHash generation failed:', error.message);
    return null;
  }
};

/**
 * Block Hash - Block mean value based
 * Best for: Detecting cropped images, robust to local changes
 *
 * Based on "Block Mean Value Based Image Perceptual Hashing"
 */
const generateBlockHash = async (imageInput) => {
  try {
    const blocks = 8;
    const { data, info } = await sharp(imageInput)
      .resize(blocks * 8, blocks * 8, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const blockSize = 8;
    const blockMeans = [];

    // Calculate mean for each block
    for (let by = 0; by < blocks; by++) {
      for (let bx = 0; bx < blocks; bx++) {
        let sum = 0;
        for (let y = 0; y < blockSize; y++) {
          for (let x = 0; x < blockSize; x++) {
            const idx = (by * blockSize + y) * (blocks * blockSize) + (bx * blockSize + x);
            sum += data[idx];
          }
        }
        blockMeans.push(sum / (blockSize * blockSize));
      }
    }

    // Calculate median of block means
    const sorted = [...blockMeans].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    // Generate hash
    let hash = '';
    for (const mean of blockMeans) {
      hash += mean > median ? '1' : '0';
    }

    return binaryToHex(hash);
  } catch (error) {
    console.error('blockHash generation failed:', error.message);
    return null;
  }
};

/**
 * Generate Color Fingerprint
 * Captures color distribution and dominant colors
 */
const generateColorFingerprint = async (imageInput) => {
  try {
    // Resize for consistent analysis
    const { data, info } = await sharp(imageInput)
      .resize(64, 64, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const channels = info.channels;
    const pixelCount = data.length / channels;

    // Initialize histograms
    const histograms = {
      r: new Array(COLOR_BINS).fill(0),
      g: new Array(COLOR_BINS).fill(0),
      b: new Array(COLOR_BINS).fill(0),
    };

    // Color statistics
    let totalR = 0, totalG = 0, totalB = 0;
    const colorCounts = {};

    // Process pixels
    for (let i = 0; i < data.length; i += channels) {
      const r = data[i];
      const g = data[i + 1] || 0;
      const b = data[i + 2] || 0;

      // Update histograms
      histograms.r[Math.floor(r / (256 / COLOR_BINS))]++;
      histograms.g[Math.floor(g / (256 / COLOR_BINS))]++;
      histograms.b[Math.floor(b / (256 / COLOR_BINS))]++;

      // Accumulate for averages
      totalR += r;
      totalG += g;
      totalB += b;

      // Quantize color for dominant color detection
      const qR = Math.floor(r / 32) * 32;
      const qG = Math.floor(g / 32) * 32;
      const qB = Math.floor(b / 32) * 32;
      const colorKey = `${qR},${qG},${qB}`;
      colorCounts[colorKey] = (colorCounts[colorKey] || 0) + 1;
    }

    // Normalize histograms
    for (const channel of ['r', 'g', 'b']) {
      histograms[channel] = histograms[channel].map(v =>
        Math.round((v / pixelCount) * 100)
      );
    }

    // Find dominant colors
    const dominantColors = Object.entries(colorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([color, count]) => ({
        rgb: color.split(',').map(Number),
        percentage: Math.round((count / pixelCount) * 100),
        hex: rgbToHex(...color.split(',').map(Number)),
      }));

    // Average color
    const avgColor = {
      r: Math.round(totalR / pixelCount),
      g: Math.round(totalG / pixelCount),
      b: Math.round(totalB / pixelCount),
    };
    avgColor.hex = rgbToHex(avgColor.r, avgColor.g, avgColor.b);

    // Generate color signature hash
    const colorSignature = generateColorSignature(histograms, dominantColors);

    return {
      histograms,
      dominantColors,
      averageColor: avgColor,
      colorSignature,
    };
  } catch (error) {
    console.error('Color fingerprint failed:', error.message);
    return null;
  }
};

/**
 * Generate Edge Fingerprint
 * Detects shapes and structure using Sobel-like edge detection
 */
const generateEdgeFingerprint = async (imageInput) => {
  try {
    const size = 32;
    const { data } = await sharp(imageInput)
      .resize(size, size, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Simplified Sobel edge detection
    const edgeData = [];
    const horizontalEdges = [];
    const verticalEdges = [];

    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const idx = y * size + x;

        // Horizontal gradient (Sobel X)
        const gx =
          -data[(y-1) * size + (x-1)] - 2*data[y * size + (x-1)] - data[(y+1) * size + (x-1)] +
          data[(y-1) * size + (x+1)] + 2*data[y * size + (x+1)] + data[(y+1) * size + (x+1)];

        // Vertical gradient (Sobel Y)
        const gy =
          -data[(y-1) * size + (x-1)] - 2*data[(y-1) * size + x] - data[(y-1) * size + (x+1)] +
          data[(y+1) * size + (x-1)] + 2*data[(y+1) * size + x] + data[(y+1) * size + (x+1)];

        const magnitude = Math.sqrt(gx * gx + gy * gy);
        edgeData.push(magnitude);

        // Track directional edges
        if (Math.abs(gx) > 30) verticalEdges.push(1);
        if (Math.abs(gy) > 30) horizontalEdges.push(1);
      }
    }

    // Calculate edge statistics
    const maxEdge = Math.max(...edgeData);
    const avgEdge = edgeData.reduce((a, b) => a + b, 0) / edgeData.length;
    const edgeThreshold = avgEdge * 1.5;

    // Generate edge hash
    let edgeHash = '';
    for (const edge of edgeData) {
      edgeHash += edge > edgeThreshold ? '1' : '0';
    }

    // Calculate edge density (how much of the image has edges)
    const edgeDensity = edgeData.filter(e => e > edgeThreshold).length / edgeData.length;

    return {
      edgeHash: binaryToHex(edgeHash.substring(0, 64)),
      edgeDensity: Math.round(edgeDensity * 100),
      horizontalEdgeCount: horizontalEdges.length,
      verticalEdgeCount: verticalEdges.length,
      dominantDirection: horizontalEdges.length > verticalEdges.length ? 'horizontal' : 'vertical',
    };
  } catch (error) {
    console.error('Edge fingerprint failed:', error.message);
    return null;
  }
};

/**
 * Generate Texture Fingerprint
 * Detects patterns like stripes, spots, solid colors
 */
const generateTextureFingerprint = async (imageInput) => {
  try {
    const size = 32;
    const { data } = await sharp(imageInput)
      .resize(size, size, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Calculate local variance (texture complexity)
    const variances = [];
    const blockSize = 4;

    for (let by = 0; by < size; by += blockSize) {
      for (let bx = 0; bx < size; bx += blockSize) {
        const block = [];
        for (let y = 0; y < blockSize && by + y < size; y++) {
          for (let x = 0; x < blockSize && bx + x < size; x++) {
            block.push(data[(by + y) * size + (bx + x)]);
          }
        }
        const mean = block.reduce((a, b) => a + b, 0) / block.length;
        const variance = block.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / block.length;
        variances.push(variance);
      }
    }

    const avgVariance = variances.reduce((a, b) => a + b, 0) / variances.length;
    const maxVariance = Math.max(...variances);

    // Detect pattern type
    let patternType = 'unknown';
    if (avgVariance < 100) {
      patternType = 'solid';
    } else if (avgVariance < 500) {
      patternType = 'smooth';
    } else if (avgVariance < 2000) {
      patternType = 'textured';
    } else {
      patternType = 'complex';
    }

    // Check for regular patterns (stripes/spots)
    const horizontalPattern = detectHorizontalPattern(data, size);
    const verticalPattern = detectVerticalPattern(data, size);

    if (horizontalPattern > 0.3) patternType = 'horizontal_stripes';
    if (verticalPattern > 0.3) patternType = 'vertical_stripes';

    // Generate texture hash
    const sorted = [...variances].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    let textureHash = '';
    for (const v of variances) {
      textureHash += v > median ? '1' : '0';
    }

    return {
      textureHash: binaryToHex(textureHash),
      complexity: Math.round(avgVariance),
      patternType,
      uniformity: Math.round((1 - (maxVariance - avgVariance) / (maxVariance + 1)) * 100),
    };
  } catch (error) {
    console.error('Texture fingerprint failed:', error.message);
    return null;
  }
};

/**
 * Detect horizontal stripe patterns
 */
const detectHorizontalPattern = (data, size) => {
  let patternScore = 0;
  const rowAverages = [];

  for (let y = 0; y < size; y++) {
    let sum = 0;
    for (let x = 0; x < size; x++) {
      sum += data[y * size + x];
    }
    rowAverages.push(sum / size);
  }

  // Check for alternating pattern
  for (let i = 2; i < rowAverages.length; i++) {
    const diff1 = Math.abs(rowAverages[i] - rowAverages[i-1]);
    const diff2 = Math.abs(rowAverages[i-1] - rowAverages[i-2]);
    if (diff1 > 20 && diff2 > 20 && Math.sign(rowAverages[i] - rowAverages[i-1]) !== Math.sign(rowAverages[i-1] - rowAverages[i-2])) {
      patternScore++;
    }
  }

  return patternScore / (size - 2);
};

/**
 * Detect vertical stripe patterns
 */
const detectVerticalPattern = (data, size) => {
  let patternScore = 0;
  const colAverages = [];

  for (let x = 0; x < size; x++) {
    let sum = 0;
    for (let y = 0; y < size; y++) {
      sum += data[y * size + x];
    }
    colAverages.push(sum / size);
  }

  // Check for alternating pattern
  for (let i = 2; i < colAverages.length; i++) {
    const diff1 = Math.abs(colAverages[i] - colAverages[i-1]);
    const diff2 = Math.abs(colAverages[i-1] - colAverages[i-2]);
    if (diff1 > 20 && diff2 > 20 && Math.sign(colAverages[i] - colAverages[i-1]) !== Math.sign(colAverages[i-1] - colAverages[i-2])) {
      patternScore++;
    }
  }

  return patternScore / (size - 2);
};

/**
 * Generate color signature hash from histograms
 */
const generateColorSignature = (histograms, dominantColors) => {
  // Create a compact representation
  const sig = [
    ...histograms.r,
    ...histograms.g,
    ...histograms.b,
    ...dominantColors.slice(0, 3).flatMap(c => c.rgb),
  ];

  return crypto.createHash('md5')
    .update(sig.join(','))
    .digest('hex')
    .substring(0, 16);
};

/**
 * Generate unique DNA ID from all components
 */
const generateDNAId = (components) => {
  const hashInput = JSON.stringify({
    p: components.perceptualHashes?.pHash,
    d: components.perceptualHashes?.dHash,
    a: components.perceptualHashes?.aHash,
    c: components.colorFingerprint?.colorSignature,
    e: components.edgeFingerprint?.edgeHash,
    t: components.textureFingerprint?.textureHash,
  });

  return crypto.createHash('sha256')
    .update(hashInput)
    .digest('hex')
    .substring(0, 32);
};

/**
 * Compare two Image DNAs and return similarity scores
 *
 * @param {Object} dna1 - First image DNA
 * @param {Object} dna2 - Second image DNA
 * @returns {Object} Similarity scores (0-100)
 */
const compareDNA = (dna1, dna2) => {
  const scores = {};

  // Compare perceptual hashes
  if (dna1.perceptualHashes && dna2.perceptualHashes) {
    scores.pHash = calculateHashSimilarity(
      dna1.perceptualHashes.pHash,
      dna2.perceptualHashes.pHash
    );
    scores.dHash = calculateHashSimilarity(
      dna1.perceptualHashes.dHash,
      dna2.perceptualHashes.dHash
    );
    scores.aHash = calculateHashSimilarity(
      dna1.perceptualHashes.aHash,
      dna2.perceptualHashes.aHash
    );
    scores.blockHash = calculateHashSimilarity(
      dna1.perceptualHashes.blockHash,
      dna2.perceptualHashes.blockHash
    );
  }

  // Compare color fingerprints
  if (dna1.colorFingerprint && dna2.colorFingerprint) {
    scores.color = compareColorFingerprints(
      dna1.colorFingerprint,
      dna2.colorFingerprint
    );
  }

  // Compare edge fingerprints
  if (dna1.edgeFingerprint && dna2.edgeFingerprint) {
    scores.edge = calculateHashSimilarity(
      dna1.edgeFingerprint.edgeHash,
      dna2.edgeFingerprint.edgeHash
    );
  }

  // Compare texture fingerprints
  if (dna1.textureFingerprint && dna2.textureFingerprint) {
    scores.texture = calculateHashSimilarity(
      dna1.textureFingerprint.textureHash,
      dna2.textureFingerprint.textureHash
    );
  }

  // Calculate overall similarity (weighted average)
  const weights = {
    pHash: 0.25,
    dHash: 0.15,
    aHash: 0.10,
    blockHash: 0.10,
    color: 0.20,
    edge: 0.10,
    texture: 0.10,
  };

  let totalWeight = 0;
  let weightedSum = 0;

  for (const [key, weight] of Object.entries(weights)) {
    if (scores[key] !== undefined && scores[key] !== null) {
      weightedSum += scores[key] * weight;
      totalWeight += weight;
    }
  }

  scores.overall = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

  return scores;
};

/**
 * Calculate similarity between two hex hashes using Hamming distance
 */
const calculateHashSimilarity = (hash1, hash2) => {
  if (!hash1 || !hash2) return null;

  // Convert to binary
  const bin1 = hexToBinary(hash1);
  const bin2 = hexToBinary(hash2);

  // Pad to same length
  const maxLen = Math.max(bin1.length, bin2.length);
  const padded1 = bin1.padStart(maxLen, '0');
  const padded2 = bin2.padStart(maxLen, '0');

  // Calculate Hamming distance
  let distance = 0;
  for (let i = 0; i < maxLen; i++) {
    if (padded1[i] !== padded2[i]) {
      distance++;
    }
  }

  // Convert to similarity percentage
  return Math.round((1 - distance / maxLen) * 100);
};

/**
 * Compare color fingerprints
 */
const compareColorFingerprints = (cf1, cf2) => {
  if (!cf1 || !cf2) return null;

  let similarity = 0;

  // Compare histograms (chi-square distance)
  if (cf1.histograms && cf2.histograms) {
    let histDiff = 0;
    for (const channel of ['r', 'g', 'b']) {
      for (let i = 0; i < COLOR_BINS; i++) {
        const v1 = cf1.histograms[channel][i] || 0;
        const v2 = cf2.histograms[channel][i] || 0;
        if (v1 + v2 > 0) {
          histDiff += Math.pow(v1 - v2, 2) / (v1 + v2);
        }
      }
    }
    // Normalize to 0-100
    similarity += Math.max(0, 100 - histDiff);
  }

  // Compare dominant colors
  if (cf1.dominantColors && cf2.dominantColors && cf1.dominantColors.length && cf2.dominantColors.length) {
    const colorDist = calculateColorDistance(
      cf1.dominantColors[0].rgb,
      cf2.dominantColors[0].rgb
    );
    // Max distance is sqrt(3 * 255^2) ≈ 441
    const colorSim = Math.max(0, 100 - (colorDist / 441) * 100);
    similarity = (similarity + colorSim) / 2;
  }

  return Math.round(similarity);
};

/**
 * Calculate Euclidean distance between two RGB colors
 */
const calculateColorDistance = (rgb1, rgb2) => {
  return Math.sqrt(
    Math.pow(rgb1[0] - rgb2[0], 2) +
    Math.pow(rgb1[1] - rgb2[1], 2) +
    Math.pow(rgb1[2] - rgb2[2], 2)
  );
};

// Utility functions
const binaryToHex = (binary) => {
  // Pad to multiple of 4
  const padded = binary.padEnd(Math.ceil(binary.length / 4) * 4, '0');
  let hex = '';
  for (let i = 0; i < padded.length; i += 4) {
    hex += parseInt(padded.substr(i, 4), 2).toString(16);
  }
  return hex;
};

const hexToBinary = (hex) => {
  let binary = '';
  for (const char of hex) {
    binary += parseInt(char, 16).toString(2).padStart(4, '0');
  }
  return binary;
};

const rgbToHex = (r, g, b) => {
  return '#' + [r, g, b].map(x => {
    const hex = Math.max(0, Math.min(255, Math.round(x))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
};

/**
 * Analyze image blurriness using Laplacian variance
 * Lower variance = more blur
 *
 * Algorithm:
 * 1. Convert to grayscale
 * 2. Apply Laplacian filter (edge detection)
 * 3. Calculate variance of the result
 * 4. High variance = sharp edges = not blurry
 */
const analyzeBlurriness = async (imageInput) => {
  try {
    const size = 64;
    const { data } = await sharp(imageInput)
      .resize(size, size, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Apply Laplacian kernel for edge detection
    // Kernel: [0, 1, 0], [1, -4, 1], [0, 1, 0]
    const laplacianValues = [];

    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const idx = y * size + x;
        const laplacian =
          data[(y - 1) * size + x] +     // top
          data[(y + 1) * size + x] +     // bottom
          data[y * size + (x - 1)] +     // left
          data[y * size + (x + 1)] -     // right
          4 * data[idx];                  // center * -4

        laplacianValues.push(Math.abs(laplacian));
      }
    }

    // Calculate variance of Laplacian
    const mean = laplacianValues.reduce((a, b) => a + b, 0) / laplacianValues.length;
    const variance = laplacianValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / laplacianValues.length;

    // Calculate max for range analysis
    const maxLaplacian = Math.max(...laplacianValues);

    // Determine blur level based on variance
    // Thresholds based on typical image analysis
    let blurLevel;
    let isBlurry;

    if (variance < 100) {
      blurLevel = 'very_blurry';
      isBlurry = true;
    } else if (variance < 300) {
      blurLevel = 'blurry';
      isBlurry = true;
    } else if (variance < 500) {
      blurLevel = 'slightly_blurry';
      isBlurry = false;
    } else if (variance < 1000) {
      blurLevel = 'acceptable';
      isBlurry = false;
    } else {
      blurLevel = 'sharp';
      isBlurry = false;
    }

    // Calculate sharpness score (0-100, higher = sharper)
    // Normalize variance to 0-100 scale (cap at 2000 for max sharpness)
    const sharpnessScore = Math.min(100, Math.round((variance / 2000) * 100));

    return {
      variance: Math.round(variance),
      mean: Math.round(mean),
      maxLaplacian: Math.round(maxLaplacian),
      sharpnessScore,
      blurLevel,
      isBlurry,
      confidence: variance > 50 ? 'high' : 'low', // Low variance means low confidence in blur detection
    };
  } catch (error) {
    console.error('Blur analysis failed:', error.message);
    return {
      variance: 0,
      sharpnessScore: 50, // Default middle score
      blurLevel: 'unknown',
      isBlurry: false,
      error: error.message,
    };
  }
};

/**
 * Calculate overall image quality score
 * Combines blur analysis, edge density, and resolution
 */
const calculateQualityScore = (blurAnalysis, edgeFingerprint, metadata) => {
  let score = 0;
  const factors = {};

  // 1. Sharpness (40% of score)
  const sharpnessWeight = 0.40;
  const sharpnessScore = blurAnalysis?.sharpnessScore || 50;
  score += sharpnessScore * sharpnessWeight;
  factors.sharpness = sharpnessScore;

  // 2. Edge density (20% of score) - indicates detail level
  const edgeWeight = 0.20;
  const edgeDensity = edgeFingerprint?.edgeDensity || 50;
  score += edgeDensity * edgeWeight;
  factors.edgeDensity = edgeDensity;

  // 3. Resolution (25% of score)
  const resolutionWeight = 0.25;
  const pixels = (metadata?.width || 100) * (metadata?.height || 100);
  // Scale: 0-100 based on megapixels (0.1MP = low, 2MP+ = high)
  const resolutionScore = Math.min(100, Math.round((pixels / 2000000) * 100));
  score += resolutionScore * resolutionWeight;
  factors.resolution = resolutionScore;

  // 4. Aspect ratio normality (15% of score)
  const aspectWeight = 0.15;
  const aspectRatio = metadata?.width / metadata?.height || 1;
  // Common ratios: 1:1, 4:3, 16:9, 3:2
  const commonRatios = [1, 1.33, 1.5, 1.78, 0.75, 0.67, 0.56];
  const closestRatio = commonRatios.reduce((closest, ratio) =>
    Math.abs(aspectRatio - ratio) < Math.abs(aspectRatio - closest) ? ratio : closest
  );
  const aspectDiff = Math.abs(aspectRatio - closestRatio);
  const aspectScore = Math.max(0, 100 - aspectDiff * 100);
  score += aspectScore * aspectWeight;
  factors.aspectRatio = Math.round(aspectScore);

  // Determine quality level
  let qualityLevel;
  if (score >= 80) qualityLevel = 'excellent';
  else if (score >= 60) qualityLevel = 'good';
  else if (score >= 40) qualityLevel = 'acceptable';
  else if (score >= 20) qualityLevel = 'poor';
  else qualityLevel = 'very_poor';

  // Apply penalty for very blurry images
  if (blurAnalysis?.isBlurry && blurAnalysis?.blurLevel === 'very_blurry') {
    score = Math.max(0, score - 20);
    qualityLevel = 'poor';
  }

  return {
    overall: Math.round(score),
    qualityLevel,
    factors,
    isUsable: score >= 30 && !blurAnalysis?.isBlurry,
    warnings: generateQualityWarnings(blurAnalysis, edgeFingerprint, metadata, score),
  };
};

/**
 * Generate warnings about image quality issues
 */
const generateQualityWarnings = (blurAnalysis, edgeFingerprint, metadata, score) => {
  const warnings = [];

  if (blurAnalysis?.isBlurry) {
    warnings.push({
      type: 'blur',
      severity: blurAnalysis.blurLevel === 'very_blurry' ? 'high' : 'medium',
      message: `Image appears ${blurAnalysis.blurLevel.replace('_', ' ')}. Matching accuracy may be reduced.`,
    });
  }

  const pixels = (metadata?.width || 0) * (metadata?.height || 0);
  if (pixels < 100000) { // Less than 0.1MP
    warnings.push({
      type: 'resolution',
      severity: 'high',
      message: 'Image resolution is very low. Consider uploading a higher resolution image.',
    });
  } else if (pixels < 500000) { // Less than 0.5MP
    warnings.push({
      type: 'resolution',
      severity: 'medium',
      message: 'Image resolution is low. A higher resolution image may improve matching.',
    });
  }

  const edgeDensity = edgeFingerprint?.edgeDensity || 0;
  if (edgeDensity < 10) {
    warnings.push({
      type: 'detail',
      severity: 'medium',
      message: 'Image has very few distinguishing features. Matching may be less accurate.',
    });
  }

  if (score < 30) {
    warnings.push({
      type: 'overall',
      severity: 'high',
      message: 'Overall image quality is poor. Consider uploading a clearer photo.',
    });
  }

  return warnings;
};

/**
 * Quick hash comparison without full DNA generation
 * Useful for fast duplicate detection
 */
const quickCompare = async (image1, image2) => {
  const [hash1, hash2] = await Promise.all([
    generatePHash(image1),
    generateDHash(image1),
  ]);

  const [hash1b, hash2b] = await Promise.all([
    generatePHash(image2),
    generateDHash(image2),
  ]);

  const pSim = calculateHashSimilarity(hash1, hash1b);
  const dSim = calculateHashSimilarity(hash2, hash2b);

  return {
    similarity: Math.round((pSim + dSim) / 2),
    isProbableDuplicate: pSim > 90 && dSim > 90,
  };
};

// ============================================================================
// IMAGE DNA v2.0 - HUMAN-READABLE DNA WITH HSV COLOR SPACE
// ============================================================================

/**
 * Convert RGB to HSV color space
 * HSV is perceptually uniform - better for color matching
 *
 * @param {number} r - Red (0-255)
 * @param {number} g - Green (0-255)
 * @param {number} b - Blue (0-255)
 * @returns {Object} {h: 0-360, s: 0-100, v: 0-100}
 */
const rgbToHsv = (r, g, b) => {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;

  let h = 0;
  let s = max === 0 ? 0 : (diff / max) * 100;
  let v = max * 100;

  if (diff !== 0) {
    switch (max) {
      case r:
        h = 60 * (((g - b) / diff) % 6);
        break;
      case g:
        h = 60 * ((b - r) / diff + 2);
        break;
      case b:
        h = 60 * ((r - g) / diff + 4);
        break;
    }
  }

  if (h < 0) h += 360;

  return {
    h: Math.round(h),
    s: Math.round(s),
    v: Math.round(v),
  };
};

/**
 * Classify HSV color to named color
 * Based on hue ranges and saturation/value levels
 */
const classifyColor = (h, s, v) => {
  // Handle achromatic colors first (low saturation)
  if (s < 15) {
    if (v < 20) return 'black';
    if (v < 50) return 'gray';
    if (v < 85) return 'gray';
    return 'white';
  }

  // Handle low value (dark colors)
  if (v < 20) return 'black';

  // Color wheel classification based on hue
  if (h < 15 || h >= 345) {
    if (s < 40 && v < 50) return 'maroon';
    return 'red';
  }
  if (h < 30) {
    if (v < 60) return 'brown';
    return 'orange';
  }
  if (h < 45) {
    if (s < 50) return 'beige';
    if (v > 80) return 'gold';
    return 'orange';
  }
  if (h < 70) return 'yellow';
  if (h < 90) return 'lime';
  if (h < 150) {
    if (v < 40) return 'olive';
    return 'green';
  }
  if (h < 180) {
    if (v < 50) return 'teal';
    return 'cyan';
  }
  if (h < 210) return 'cyan';
  if (h < 250) {
    if (v < 40) return 'navy';
    return 'blue';
  }
  if (h < 280) return 'purple';
  if (h < 320) {
    if (s < 40) return 'pink';
    return 'purple';
  }
  if (h < 345) return 'pink';

  return 'red';
};

/**
 * Generate HSV-based color fingerprint
 * More perceptually accurate than RGB
 */
const generateHSVColorFingerprint = async (imageInput) => {
  try {
    // Resize for consistent analysis
    const { data, info } = await sharp(imageInput)
      .resize(64, 64, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const channels = info.channels;
    const pixelCount = data.length / channels;

    // HSV histograms
    const hueHistogram = new Array(36).fill(0);  // 10-degree bins
    const satHistogram = new Array(10).fill(0);  // 10% bins
    const valHistogram = new Array(10).fill(0);  // 10% bins

    // Color name counts
    const colorCounts = {};

    // RGB statistics for backwards compatibility
    const rgbHistograms = {
      r: new Array(COLOR_BINS).fill(0),
      g: new Array(COLOR_BINS).fill(0),
      b: new Array(COLOR_BINS).fill(0),
    };
    let totalR = 0, totalG = 0, totalB = 0;

    // Process pixels
    for (let i = 0; i < data.length; i += channels) {
      const r = data[i];
      const g = data[i + 1] || 0;
      const b = data[i + 2] || 0;

      // RGB histograms
      rgbHistograms.r[Math.floor(r / (256 / COLOR_BINS))]++;
      rgbHistograms.g[Math.floor(g / (256 / COLOR_BINS))]++;
      rgbHistograms.b[Math.floor(b / (256 / COLOR_BINS))]++;
      totalR += r;
      totalG += g;
      totalB += b;

      // Convert to HSV
      const hsv = rgbToHsv(r, g, b);

      // Update HSV histograms
      hueHistogram[Math.floor(hsv.h / 10) % 36]++;
      satHistogram[Math.min(9, Math.floor(hsv.s / 10))]++;
      valHistogram[Math.min(9, Math.floor(hsv.v / 10))]++;

      // Classify and count colors
      const colorName = classifyColor(hsv.h, hsv.s, hsv.v);
      colorCounts[colorName] = (colorCounts[colorName] || 0) + 1;
    }

    // Normalize histograms
    for (const channel of ['r', 'g', 'b']) {
      rgbHistograms[channel] = rgbHistograms[channel].map(v =>
        Math.round((v / pixelCount) * 100)
      );
    }
    const normalizedHue = hueHistogram.map(v => Math.round((v / pixelCount) * 100));
    const normalizedSat = satHistogram.map(v => Math.round((v / pixelCount) * 100));
    const normalizedVal = valHistogram.map(v => Math.round((v / pixelCount) * 100));

    // Get dominant colors sorted by frequency
    const dominantColors = Object.entries(colorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({
        name,
        abbreviation: COLOR_ABBREVIATIONS[name] || name.substring(0, 3).toUpperCase(),
        percentage: Math.round((count / pixelCount) * 100),
      }));

    // Generate color code (top 2 colors)
    const colorCode = dominantColors.slice(0, 2)
      .map(c => c.abbreviation)
      .join('.');

    // Average color
    const avgColor = {
      r: Math.round(totalR / pixelCount),
      g: Math.round(totalG / pixelCount),
      b: Math.round(totalB / pixelCount),
    };
    const avgHsv = rgbToHsv(avgColor.r, avgColor.g, avgColor.b);
    avgColor.hex = rgbToHex(avgColor.r, avgColor.g, avgColor.b);
    avgColor.hsv = avgHsv;
    avgColor.colorName = classifyColor(avgHsv.h, avgHsv.s, avgHsv.v);

    // Generate color signature hash
    const colorSignature = crypto.createHash('md5')
      .update([
        ...normalizedHue,
        ...normalizedSat,
        ...normalizedVal,
        ...dominantColors.map(c => c.name),
      ].join(','))
      .digest('hex')
      .substring(0, 16);

    return {
      // HSV-based (new)
      hsvHistograms: {
        hue: normalizedHue,
        saturation: normalizedSat,
        value: normalizedVal,
      },
      dominantColors,
      colorCode,
      // RGB-based (backwards compatible)
      histograms: rgbHistograms,
      averageColor: avgColor,
      colorSignature,
    };
  } catch (error) {
    console.error('HSV Color fingerprint failed:', error.message);
    return null;
  }
};

/**
 * Determine shape code based on aspect ratio and edge patterns
 */
const determineShapeCode = (metadata, edgeFingerprint) => {
  const aspectRatio = metadata.width / metadata.height;

  // Determine orientation
  if (aspectRatio > 1.3) {
    return SHAPE_CODES.horizontal;  // HORZ
  } else if (aspectRatio < 0.77) {
    return SHAPE_CODES.vertical;    // VERT
  } else {
    return SHAPE_CODES.square;      // SQR
  }
};

/**
 * Generate Image DNA v2 with human-readable ID
 *
 * Format: [ENTITY]-[COLORS]-[SHAPE]-[NEURAL]-[HASH]-Q[QUALITY]
 * Example: PET-BRN.ORG-VERT-dino7f3a-phash4c2b-Q85
 *
 * @param {Buffer|string} imageInput - Image buffer or file path
 * @param {Object} options - Optional configuration
 * @param {Object} options.neuralFingerprint - Pre-computed neural fingerprint
 * @returns {Promise<Object>} Image DNA v2 object
 */
const generateImageDNA_v2 = async (imageInput, options = {}) => {
  const startTime = Date.now();

  try {
    // Load image and get metadata
    const image = sharp(imageInput);
    const metadata = await image.metadata();

    // Generate all fingerprints in parallel
    const [
      perceptualHashes,
      colorFingerprint,
      edgeFingerprint,
      textureFingerprint,
      blurAnalysis,
    ] = await Promise.all([
      generatePerceptualHashes(imageInput),
      generateHSVColorFingerprint(imageInput),
      generateEdgeFingerprint(imageInput),
      generateTextureFingerprint(imageInput),
      analyzeBlurriness(imageInput),
    ]);

    // Calculate quality score
    const qualityScore = calculateQualityScore(blurAnalysis, edgeFingerprint, metadata);

    // Get neural fingerprint (from options or generate placeholder)
    const neuralFingerprint = options.neuralFingerprint || {
      embeddingHash: null,
      entityType: 'unknown',
      entityConfidence: 0,
    };

    // Determine components for human-readable DNA ID
    const entityCode = ENTITY_ABBREVIATIONS[neuralFingerprint.entityType] || 'UNK';
    const colorCode = colorFingerprint?.colorCode || 'UNK';
    const shapeCode = determineShapeCode(metadata, edgeFingerprint);
    const neuralHash = neuralFingerprint.embeddingHash?.substring(0, 8) || 'noml0000';
    const perceptualHash = perceptualHashes?.pHash?.substring(0, 8) || '00000000';
    const quality = qualityScore?.overall || 50;

    // Generate human-readable DNA ID
    const humanReadableDnaId = `${entityCode}-${colorCode}-${shapeCode}-${neuralHash}-${perceptualHash}-Q${quality}`;

    // Generate machine-comparable DNA hash (for exact matching)
    const machineHash = generateDNAId({
      perceptualHashes,
      colorFingerprint,
      edgeFingerprint,
      textureFingerprint,
    });

    // Compile full DNA v2 object
    const dna = {
      version: DNA_VERSION,
      dnaId: humanReadableDnaId,
      machineHash,

      // Human-readable breakdown
      interpretation: {
        entity: `${entityCode} (${neuralFingerprint.entityType})`,
        entityConfidence: neuralFingerprint.entityConfidence,
        colors: colorFingerprint?.dominantColors?.slice(0, 3).map(c => c.name).join(', ') || 'unknown',
        colorCode,
        shape: shapeCode,
        quality: `${quality}/100 (${qualityScore?.qualityLevel || 'unknown'})`,
      },

      // Searchable fields for filtering
      searchableFields: {
        entity: neuralFingerprint.entityType,
        entityCode,
        colors: colorFingerprint?.dominantColors?.slice(0, 3).map(c => c.name) || [],
        colorAbbreviations: colorFingerprint?.dominantColors?.slice(0, 3).map(c => c.abbreviation) || [],
        shape: shapeCode,
        qualityTier: quality >= 70 ? 'high' : quality >= 40 ? 'medium' : 'low',
        isBlurry: blurAnalysis?.isBlurry || false,
      },

      // Full fingerprint data (for matching)
      fullDNA: {
        perceptualHashes,
        colorFingerprint,
        edgeFingerprint,
        textureFingerprint,
        blurAnalysis,
        qualityScore,
        neuralFingerprint: {
          embeddingHash: neuralFingerprint.embeddingHash,
          entityType: neuralFingerprint.entityType,
          entityConfidence: neuralFingerprint.entityConfidence,
          // Don't include full embedding here - stored separately
        },
      },

      // Metadata
      metadata: {
        width: metadata.width,
        height: metadata.height,
        aspectRatio: (metadata.width / metadata.height).toFixed(3),
        format: metadata.format,
      },

      // Match capabilities
      matchCapabilities: {
        canMatchRotated: true,      // Via blockHash
        canMatchCropped: true,      // Via blockHash
        canMatchRecolored: false,   // Color is a key feature
        canMatchCompressed: true,   // Perceptual hashes robust
        canMatchSemantic: !!neuralFingerprint.embeddingHash,  // If neural embedding exists
      },

      processingTimeMs: Date.now() - startTime,
    };

    return dna;
  } catch (error) {
    logger.error(`[ImageDNA v2] Generation failed: ${error.message}`);
    throw new Error(`Image DNA v2 generation failed: ${error.message}`);
  }
};

/**
 * Compare two HSV color fingerprints
 * More accurate than RGB comparison
 */
const compareHSVColors = (cf1, cf2) => {
  if (!cf1?.hsvHistograms || !cf2?.hsvHistograms) {
    // Fall back to RGB comparison
    return compareColorFingerprints(cf1, cf2);
  }

  let similarity = 0;
  let weights = { hue: 0.5, saturation: 0.25, value: 0.25 };

  // Compare hue histogram (most important)
  const hueSim = compareHistograms(cf1.hsvHistograms.hue, cf2.hsvHistograms.hue);
  similarity += hueSim * weights.hue;

  // Compare saturation histogram
  const satSim = compareHistograms(cf1.hsvHistograms.saturation, cf2.hsvHistograms.saturation);
  similarity += satSim * weights.saturation;

  // Compare value histogram
  const valSim = compareHistograms(cf1.hsvHistograms.value, cf2.hsvHistograms.value);
  similarity += valSim * weights.value;

  // Bonus for matching dominant colors
  if (cf1.dominantColors && cf2.dominantColors) {
    const colors1 = new Set(cf1.dominantColors.slice(0, 3).map(c => c.name));
    const colors2 = new Set(cf2.dominantColors.slice(0, 3).map(c => c.name));
    const intersection = [...colors1].filter(c => colors2.has(c)).length;
    const bonus = (intersection / 3) * 10;  // Up to 10 point bonus
    similarity = Math.min(100, similarity + bonus);
  }

  return Math.round(similarity);
};

/**
 * Compare two histograms using chi-square distance
 */
const compareHistograms = (hist1, hist2) => {
  if (!hist1 || !hist2 || hist1.length !== hist2.length) return 50;

  let chiSquare = 0;
  for (let i = 0; i < hist1.length; i++) {
    const sum = hist1[i] + hist2[i];
    if (sum > 0) {
      chiSquare += Math.pow(hist1[i] - hist2[i], 2) / sum;
    }
  }

  // Normalize to 0-100 (lower chi-square = more similar)
  return Math.max(0, 100 - chiSquare);
};

/**
 * Compare two DNA v2 objects
 */
const compareDNA_v2 = (dna1, dna2) => {
  const scores = {};

  // Compare perceptual hashes
  if (dna1.fullDNA?.perceptualHashes && dna2.fullDNA?.perceptualHashes) {
    scores.pHash = calculateHashSimilarity(
      dna1.fullDNA.perceptualHashes.pHash,
      dna2.fullDNA.perceptualHashes.pHash
    );
    scores.dHash = calculateHashSimilarity(
      dna1.fullDNA.perceptualHashes.dHash,
      dna2.fullDNA.perceptualHashes.dHash
    );
    scores.aHash = calculateHashSimilarity(
      dna1.fullDNA.perceptualHashes.aHash,
      dna2.fullDNA.perceptualHashes.aHash
    );
    scores.blockHash = calculateHashSimilarity(
      dna1.fullDNA.perceptualHashes.blockHash,
      dna2.fullDNA.perceptualHashes.blockHash
    );
  }

  // Compare HSV color fingerprints
  if (dna1.fullDNA?.colorFingerprint && dna2.fullDNA?.colorFingerprint) {
    scores.color = compareHSVColors(
      dna1.fullDNA.colorFingerprint,
      dna2.fullDNA.colorFingerprint
    );
  }

  // Compare edge fingerprints
  if (dna1.fullDNA?.edgeFingerprint && dna2.fullDNA?.edgeFingerprint) {
    scores.edge = calculateHashSimilarity(
      dna1.fullDNA.edgeFingerprint.edgeHash,
      dna2.fullDNA.edgeFingerprint.edgeHash
    );
  }

  // Compare texture fingerprints
  if (dna1.fullDNA?.textureFingerprint && dna2.fullDNA?.textureFingerprint) {
    scores.texture = calculateHashSimilarity(
      dna1.fullDNA.textureFingerprint.textureHash,
      dna2.fullDNA.textureFingerprint.textureHash
    );
  }

  // Entity match bonus/penalty
  scores.entityMatch = dna1.searchableFields?.entity === dna2.searchableFields?.entity;

  // Calculate weighted overall score
  const weights = {
    pHash: 0.20,
    dHash: 0.10,
    aHash: 0.08,
    blockHash: 0.12,
    color: 0.25,
    edge: 0.15,
    texture: 0.10,
  };

  let totalWeight = 0;
  let weightedSum = 0;

  for (const [key, weight] of Object.entries(weights)) {
    if (scores[key] !== undefined && scores[key] !== null && typeof scores[key] === 'number') {
      weightedSum += scores[key] * weight;
      totalWeight += weight;
    }
  }

  scores.overall = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

  // Apply entity match modifier
  if (scores.entityMatch === false &&
      dna1.searchableFields?.entity !== 'unknown' &&
      dna2.searchableFields?.entity !== 'unknown') {
    scores.overall = Math.round(scores.overall * 0.7);  // 30% penalty for entity mismatch
  }

  return scores;
};

module.exports = {
  // v1.0 exports (backwards compatible)
  generateImageDNA,
  compareDNA,
  quickCompare,
  // Export individual generators for flexibility
  generatePerceptualHashes,
  generatePHash,
  generateDHash,
  generateAHash,
  generateBlockHash,
  generateColorFingerprint,
  generateEdgeFingerprint,
  generateTextureFingerprint,
  // Blur and quality analysis
  analyzeBlurriness,
  calculateQualityScore,
  // Utility exports
  calculateHashSimilarity,
  binaryToHex,
  hexToBinary,

  // v2.0 exports (new)
  generateImageDNA_v2,
  compareDNA_v2,
  generateHSVColorFingerprint,
  compareHSVColors,
  rgbToHsv,
  classifyColor,
  determineShapeCode,
  COLOR_ABBREVIATIONS,
  ENTITY_ABBREVIATIONS,
  SHAPE_CODES,
  DNA_VERSION,
};
