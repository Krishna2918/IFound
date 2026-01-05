/**
 * Perceptual Hashing Service
 *
 * Implements three types of perceptual hashes:
 * - pHash (Perceptual Hash): DCT-based, robust to scaling/compression
 * - aHash (Average Hash): Simple average-based, fast
 * - dHash (Difference Hash): Gradient-based, resistant to brightness changes
 *
 * These hashes enable fast similarity matching via Hamming distance.
 */

const sharp = require('sharp');
const crypto = require('crypto');

const HASH_SIZE = 8; // 8x8 = 64 bits per hash

/**
 * Compute Average Hash (aHash)
 * Simple but effective for near-duplicate detection
 *
 * @param {Buffer|string} imageInput - Image buffer or file path
 * @returns {Promise<string>} 64-character hex hash
 */
const computeAverageHash = async (imageInput) => {
  try {
    // Resize to 8x8 grayscale
    const { data, info } = await sharp(imageInput)
      .resize(HASH_SIZE, HASH_SIZE, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Calculate average pixel value
    const pixels = [...data];
    const average = pixels.reduce((sum, val) => sum + val, 0) / pixels.length;

    // Generate hash: 1 if pixel > average, 0 otherwise
    let hash = '';
    for (let i = 0; i < pixels.length; i++) {
      hash += pixels[i] > average ? '1' : '0';
    }

    // Convert binary to hex
    return binaryToHex(hash);
  } catch (error) {
    throw new Error(`Average hash computation failed: ${error.message}`);
  }
};

/**
 * Compute Difference Hash (dHash)
 * Compares adjacent pixels for gradient-based hashing
 *
 * @param {Buffer|string} imageInput - Image buffer or file path
 * @returns {Promise<string>} 64-character hex hash
 */
const computeDifferenceHash = async (imageInput) => {
  try {
    // Resize to 9x8 (extra column for comparison)
    const { data } = await sharp(imageInput)
      .resize(HASH_SIZE + 1, HASH_SIZE, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = [...data];
    let hash = '';

    // Compare each pixel with its right neighbor
    for (let y = 0; y < HASH_SIZE; y++) {
      for (let x = 0; x < HASH_SIZE; x++) {
        const idx = y * (HASH_SIZE + 1) + x;
        const left = pixels[idx];
        const right = pixels[idx + 1];
        hash += left > right ? '1' : '0';
      }
    }

    return binaryToHex(hash);
  } catch (error) {
    throw new Error(`Difference hash computation failed: ${error.message}`);
  }
};

/**
 * Compute Perceptual Hash (pHash)
 * Uses simplified DCT for robust matching
 *
 * @param {Buffer|string} imageInput - Image buffer or file path
 * @returns {Promise<string>} 64-character hex hash
 */
const computePerceptualHash = async (imageInput) => {
  try {
    // Use larger size for better frequency analysis
    const size = 32;
    const { data } = await sharp(imageInput)
      .resize(size, size, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = [...data];

    // Create 2D array
    const matrix = [];
    for (let y = 0; y < size; y++) {
      matrix[y] = [];
      for (let x = 0; x < size; x++) {
        matrix[y][x] = pixels[y * size + x];
      }
    }

    // Apply simplified DCT
    const dct = computeDCT(matrix);

    // Extract top-left 8x8 (low frequency components)
    const lowFreq = [];
    for (let y = 0; y < HASH_SIZE; y++) {
      for (let x = 0; x < HASH_SIZE; x++) {
        // Skip DC component (0,0)
        if (y === 0 && x === 0) continue;
        lowFreq.push(dct[y][x]);
      }
    }

    // Calculate median (more robust than average)
    const sorted = [...lowFreq].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    // Generate hash
    let hash = '';
    for (let y = 0; y < HASH_SIZE; y++) {
      for (let x = 0; x < HASH_SIZE; x++) {
        if (y === 0 && x === 0) {
          hash += '0'; // DC component always 0
        } else {
          hash += dct[y][x] > median ? '1' : '0';
        }
      }
    }

    return binaryToHex(hash);
  } catch (error) {
    throw new Error(`Perceptual hash computation failed: ${error.message}`);
  }
};

/**
 * Simplified 2D DCT (Discrete Cosine Transform)
 */
const computeDCT = (matrix) => {
  const N = matrix.length;
  const dct = [];

  for (let u = 0; u < N; u++) {
    dct[u] = [];
    for (let v = 0; v < N; v++) {
      let sum = 0;

      for (let x = 0; x < N; x++) {
        for (let y = 0; y < N; y++) {
          sum += matrix[x][y] *
            Math.cos((2 * x + 1) * u * Math.PI / (2 * N)) *
            Math.cos((2 * y + 1) * v * Math.PI / (2 * N));
        }
      }

      const cu = u === 0 ? 1 / Math.sqrt(2) : 1;
      const cv = v === 0 ? 1 / Math.sqrt(2) : 1;
      dct[u][v] = (2 / N) * cu * cv * sum;
    }
  }

  return dct;
};

/**
 * Compute all three hashes in parallel
 *
 * @param {Buffer|string} imageInput - Image buffer or file path
 * @returns {Promise<Object>} Object with all three hashes
 */
const computeAllHashes = async (imageInput) => {
  const [perceptualHash, averageHash, differenceHash] = await Promise.all([
    computePerceptualHash(imageInput),
    computeAverageHash(imageInput),
    computeDifferenceHash(imageInput),
  ]);

  return {
    perceptualHash,
    averageHash,
    differenceHash,
    computedAt: new Date().toISOString(),
  };
};

/**
 * Calculate Hamming distance between two hashes
 * Lower distance = more similar images
 *
 * @param {string} hash1 - First hash (hex)
 * @param {string} hash2 - Second hash (hex)
 * @returns {number} Hamming distance (0 = identical)
 */
const hammingDistance = (hash1, hash2) => {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) {
    return Infinity;
  }

  // Convert hex to binary
  const bin1 = hexToBinary(hash1);
  const bin2 = hexToBinary(hash2);

  let distance = 0;
  for (let i = 0; i < bin1.length; i++) {
    if (bin1[i] !== bin2[i]) {
      distance++;
    }
  }

  return distance;
};

/**
 * Calculate similarity percentage from Hamming distance
 *
 * @param {string} hash1 - First hash (hex)
 * @param {string} hash2 - Second hash (hex)
 * @returns {number} Similarity percentage (0-100)
 */
const hashSimilarity = (hash1, hash2) => {
  const maxBits = 64; // 64 bits per hash
  const distance = hammingDistance(hash1, hash2);

  if (distance === Infinity) return 0;

  return Math.round(((maxBits - distance) / maxBits) * 100);
};

/**
 * Check if two hashes are similar within threshold
 *
 * @param {string} hash1 - First hash
 * @param {string} hash2 - Second hash
 * @param {number} threshold - Maximum Hamming distance (default: 10)
 * @returns {boolean} True if similar
 */
const areHashesSimilar = (hash1, hash2, threshold = 10) => {
  return hammingDistance(hash1, hash2) <= threshold;
};

/**
 * Extract dominant colors from image
 *
 * @param {Buffer|string} imageInput - Image buffer or file path
 * @param {number} numColors - Number of colors to extract
 * @returns {Promise<Array>} Array of hex color strings
 */
const extractDominantColors = async (imageInput, numColors = 5) => {
  try {
    // Resize for faster processing
    const { data, info } = await sharp(imageInput)
      .resize(100, 100, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Simple color quantization using k-means-like clustering
    const pixels = [];
    for (let i = 0; i < data.length; i += 3) {
      pixels.push({
        r: data[i],
        g: data[i + 1],
        b: data[i + 2],
      });
    }

    // Use color bucketing for simplicity
    const colorBuckets = {};
    for (const pixel of pixels) {
      // Quantize to reduce color space
      const r = Math.floor(pixel.r / 32) * 32;
      const g = Math.floor(pixel.g / 32) * 32;
      const b = Math.floor(pixel.b / 32) * 32;
      const key = `${r},${g},${b}`;

      colorBuckets[key] = (colorBuckets[key] || 0) + 1;
    }

    // Sort by frequency and take top colors
    const sortedColors = Object.entries(colorBuckets)
      .sort((a, b) => b[1] - a[1])
      .slice(0, numColors)
      .map(([key]) => {
        const [r, g, b] = key.split(',').map(Number);
        return rgbToHex(r, g, b);
      });

    return sortedColors;
  } catch (error) {
    throw new Error(`Color extraction failed: ${error.message}`);
  }
};

/**
 * Compute color histogram as feature vector
 *
 * @param {Buffer|string} imageInput - Image buffer or file path
 * @returns {Promise<Array>} 64-dimensional color histogram
 */
const computeColorHistogram = async (imageInput) => {
  try {
    const { data } = await sharp(imageInput)
      .resize(100, 100, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Create 4x4x4 color histogram (64 bins)
    const bins = 4;
    const histogram = new Array(bins * bins * bins).fill(0);

    for (let i = 0; i < data.length; i += 3) {
      const rBin = Math.floor(data[i] / 64);
      const gBin = Math.floor(data[i + 1] / 64);
      const bBin = Math.floor(data[i + 2] / 64);

      const idx = rBin * bins * bins + gBin * bins + bBin;
      histogram[idx]++;
    }

    // Normalize
    const total = histogram.reduce((sum, val) => sum + val, 0);
    return histogram.map(val => val / total);
  } catch (error) {
    throw new Error(`Color histogram computation failed: ${error.message}`);
  }
};

/**
 * Assess image quality
 *
 * @param {Buffer|string} imageInput - Image buffer or file path
 * @returns {Promise<Object>} Quality metrics
 */
const assessImageQuality = async (imageInput) => {
  try {
    const metadata = await sharp(imageInput).metadata();

    // Calculate quality score based on multiple factors
    let score = 100;

    // Resolution factor
    const pixels = metadata.width * metadata.height;
    if (pixels < 100000) score -= 30; // Less than 100K pixels
    else if (pixels < 500000) score -= 15;
    else if (pixels < 1000000) score -= 5;

    // Check for very small dimensions
    if (metadata.width < 200 || metadata.height < 200) {
      score -= 20;
    }

    // Format penalty (JPEG artifacts more likely)
    if (metadata.format === 'jpeg' && metadata.quality && metadata.quality < 70) {
      score -= 15;
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      hasAlpha: metadata.hasAlpha,
    };
  } catch (error) {
    throw new Error(`Quality assessment failed: ${error.message}`);
  }
};

// Utility functions
const binaryToHex = (binary) => {
  let hex = '';
  for (let i = 0; i < binary.length; i += 4) {
    const chunk = binary.slice(i, i + 4);
    hex += parseInt(chunk, 2).toString(16);
  }
  return hex;
};

const hexToBinary = (hex) => {
  let binary = '';
  for (let i = 0; i < hex.length; i++) {
    binary += parseInt(hex[i], 16).toString(2).padStart(4, '0');
  }
  return binary;
};

const rgbToHex = (r, g, b) => {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
};

module.exports = {
  computePerceptualHash,
  computeAverageHash,
  computeDifferenceHash,
  computeAllHashes,
  hammingDistance,
  hashSimilarity,
  areHashesSimilar,
  extractDominantColors,
  computeColorHistogram,
  assessImageQuality,
  HASH_SIZE,
};
