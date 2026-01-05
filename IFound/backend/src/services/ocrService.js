/**
 * OCR Service - Enhanced Version 3.0
 *
 * Extracts text from images using Tesseract.js with advanced preprocessing
 * and intelligent garbage detection.
 *
 * Key Features:
 * - Multi-pass OCR with different preprocessing
 * - GARBAGE DETECTION - filters out non-text noise
 * - License plate optimized mode
 * - Serial number detection
 * - Smart scoring based on content quality
 * - UID generation for each processed image
 *
 * IMPORTANT: Returns score 0 if no valid text is detected
 */

const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const crypto = require('crypto');
const path = require('path');

// Singleton worker for reuse
let worker = null;
let isInitializing = false;

// OCR Quality thresholds
const QUALITY_THRESHOLDS = {
  EXCELLENT: 85,
  GOOD: 70,
  FAIR: 50,
  POOR: 30,
};

// Minimum requirements for valid OCR output
const VALIDATION = {
  MIN_WORD_LENGTH: 2,              // Minimum characters for a "word"
  MIN_VALID_WORDS: 3,              // Need at least 3 valid words (stricter)
  MIN_WORD_CONFIDENCE: 65,         // Per-word confidence threshold (stricter)
  MIN_ALPHANUMERIC_RATIO: 0.6,     // At least 60% of text should be letters/numbers
  MAX_RANDOM_CHAR_RATIO: 0.25,     // Maximum 25% random/special characters
  MIN_OVERALL_CONFIDENCE: 45,      // Minimum overall confidence
  MAX_SHORT_WORD_RATIO: 0.5,       // Maximum 50% words that are 1-2 chars
  MIN_AVG_WORD_LENGTH: 3.0,        // Minimum average word length
};

// Common English words + document-related words (for validation)
const COMMON_WORDS = new Set([
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
  'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
  'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
  'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what',
  'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me',
  'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take',
  'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other',
  'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also',
  'phone', 'lost', 'found', 'missing', 'help', 'name', 'address', 'contact',
  'serial', 'number', 'model', 'brand', 'color', 'size', 'date', 'location',
  // Document-related words (driver's license, ID cards, etc.)
  'driver', 'licence', 'license', 'permis', 'conduire', 'ontario', 'canada',
  'class', 'exp', 'dob', 'sex', 'height', 'weight', 'eyes', 'hair',
  'issued', 'expires', 'valid', 'birth', 'restriction', 'endorsement',
  'passport', 'identification', 'card', 'province', 'state', 'country',
  'street', 'avenue', 'road', 'drive', 'boulevard', 'city', 'postal',
]);

/**
 * Initialize Tesseract worker
 */
const initializeWorker = async () => {
  if (worker) return worker;
  if (isInitializing) {
    // Wait for initialization to complete
    while (isInitializing) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return worker;
  }

  isInitializing = true;
  try {
    worker = await Tesseract.createWorker('eng', 1, {
      logger: () => {}, // Suppress logging
    });
    return worker;
  } finally {
    isInitializing = false;
  }
};

/**
 * Preprocess image for better OCR results (standard mode)
 * Now includes auto-rotation detection
 *
 * @param {Buffer|string} imageInput - Image buffer or file path
 * @returns {Promise<Buffer>} Preprocessed image buffer
 */
const preprocessImage = async (imageInput) => {
  try {
    // Convert to grayscale, increase contrast, and sharpen
    // Also auto-rotate based on EXIF data
    const processed = await sharp(imageInput)
      .rotate() // Auto-rotate based on EXIF orientation
      .grayscale()
      .normalise() // Enhance contrast
      .sharpen()
      .toBuffer();

    return processed;
  } catch (error) {
    throw new Error(`Image preprocessing failed: ${error.message}`);
  }
};

/**
 * Preprocess with 90-degree rotation (for sideways images)
 */
const preprocessRotated90 = async (imageInput) => {
  try {
    const processed = await sharp(imageInput)
      .rotate(90)
      .grayscale()
      .normalise()
      .sharpen()
      .toBuffer();
    return processed;
  } catch (error) {
    throw new Error(`Rotated preprocessing failed: ${error.message}`);
  }
};

/**
 * Preprocess with 270-degree rotation (for sideways images)
 */
const preprocessRotated270 = async (imageInput) => {
  try {
    const processed = await sharp(imageInput)
      .rotate(270)
      .grayscale()
      .normalise()
      .sharpen()
      .toBuffer();
    return processed;
  } catch (error) {
    throw new Error(`Rotated preprocessing failed: ${error.message}`);
  }
};

/**
 * Preprocess image specifically for license plates
 * Uses high contrast and binarization for clear text
 *
 * @param {Buffer|string} imageInput - Image buffer or file path
 * @returns {Promise<Buffer>} Preprocessed image buffer
 */
const preprocessForLicensePlate = async (imageInput) => {
  try {
    // First pass: Get image metadata
    const metadata = await sharp(imageInput).metadata();

    // Calculate optimal resize (license plates are usually small text)
    const targetWidth = Math.max(800, Math.min(metadata.width * 2, 1600));

    const processed = await sharp(imageInput)
      .resize(targetWidth, null, { fit: 'inside' })
      .grayscale()
      .linear(1.5, -50) // Increase contrast significantly
      .sharpen({ sigma: 2, m1: 0.5, m2: 0.5 })
      .threshold(140) // Binarize for clear text
      .negate() // Try inverted for dark plates
      .negate() // Revert to test both
      .toBuffer();

    return processed;
  } catch (error) {
    throw new Error(`License plate preprocessing failed: ${error.message}`);
  }
};

/**
 * Preprocess with adaptive thresholding for varying lighting
 */
const preprocessAdaptive = async (imageInput) => {
  try {
    const processed = await sharp(imageInput)
      .grayscale()
      .normalise()
      .modulate({ brightness: 1.1 })
      .sharpen({ sigma: 1.5 })
      .toBuffer();

    return processed;
  } catch (error) {
    throw new Error(`Adaptive preprocessing failed: ${error.message}`);
  }
};

/**
 * Preprocess with high contrast for faded text
 */
const preprocessHighContrast = async (imageInput) => {
  try {
    const processed = await sharp(imageInput)
      .grayscale()
      .linear(2.0, -100) // Very high contrast
      .sharpen({ sigma: 2 })
      .toBuffer();

    return processed;
  } catch (error) {
    throw new Error(`High contrast preprocessing failed: ${error.message}`);
  }
};

/**
 * CRITICAL: Validate if OCR output is real text or garbage
 *
 * STRICT VALIDATION - Returns false for:
 * - Random character sequences like "LAR Eg RE A ET a pe"
 * - Too many short/single character "words"
 * - No recognizable English words
 * - Low confidence OCR output
 * - High gibberish score
 */
const validateOCROutput = (result) => {
  if (!result || !result.text) {
    return { isValid: false, reason: 'No text extracted', score: 0, isGarbage: true };
  }

  const text = result.text.trim();
  const words = result.words || [];

  // Check 1: Minimum text length
  if (text.length < 5) {
    return { isValid: false, reason: 'Text too short', score: 0, isGarbage: true };
  }

  // Check 2: Alphanumeric ratio
  const alphanumeric = text.replace(/[^a-zA-Z0-9]/g, '');
  const alphaRatio = alphanumeric.length / text.length;

  if (alphaRatio < VALIDATION.MIN_ALPHANUMERIC_RATIO) {
    return { isValid: false, reason: 'Too many random characters', score: 0, isGarbage: true };
  }

  // Check 3: Look for identifiers FIRST (high value - bypass other checks)
  const identifiers = extractIdentifiers(text);
  const hasIdentifiers = Object.values(identifiers).some(arr => arr?.length > 0);

  if (hasIdentifiers) {
    return {
      isValid: true,
      reason: 'Contains identifiers',
      score: 100,
      identifiers,
      isGarbage: false,
    };
  }

  // Check 4: Split into words and analyze
  const textWords = text.split(/\s+/).filter(w => w.length > 0);

  if (textWords.length === 0) {
    return { isValid: false, reason: 'No words found', score: 0, isGarbage: true };
  }

  // Check 5: SHORT WORD RATIO - garbage OCR has many 1-2 char "words"
  const shortWords = textWords.filter(w => w.length <= 2);
  const shortWordRatio = shortWords.length / textWords.length;

  if (shortWordRatio > VALIDATION.MAX_SHORT_WORD_RATIO) {
    return {
      isValid: false,
      reason: `Too many short words (${Math.round(shortWordRatio * 100)}%)`,
      score: 0,
      isGarbage: true
    };
  }

  // Check 6: AVERAGE WORD LENGTH - garbage has low average
  const avgWordLength = textWords.reduce((sum, w) => sum + w.length, 0) / textWords.length;

  if (avgWordLength < VALIDATION.MIN_AVG_WORD_LENGTH) {
    return {
      isValid: false,
      reason: `Average word length too low (${avgWordLength.toFixed(1)})`,
      score: 0,
      isGarbage: true
    };
  }

  // Check 7: GIBBERISH DETECTION - calculate gibberish score
  const gibberishScore = calculateGibberishScore(text, textWords);

  if (gibberishScore > 60) {
    return {
      isValid: false,
      reason: `High gibberish score (${gibberishScore})`,
      score: 0,
      isGarbage: true
    };
  }

  // Check 8: Count valid words with stricter criteria
  const validWords = words.filter(w =>
    w.text && w.text.length >= VALIDATION.MIN_WORD_LENGTH &&
    w.confidence >= VALIDATION.MIN_WORD_CONFIDENCE &&
    isValidWord(w.text)
  );

  // Check 9: COMMON WORD CHECK - need at least 1 recognizable word
  const commonWordCount = textWords.filter(w =>
    COMMON_WORDS.has(w.toLowerCase())
  ).length;

  // If no common words AND low confidence, it's likely garbage
  if (commonWordCount === 0 && (result.confidence || 0) < 70) {
    // Allow if we have multiple valid words with good patterns
    if (validWords.length < 4) {
      return {
        isValid: false,
        reason: 'No recognizable words',
        score: 0,
        isGarbage: true
      };
    }
  }

  // Check 10: Need minimum valid words
  if (validWords.length < VALIDATION.MIN_VALID_WORDS) {
    return {
      isValid: false,
      reason: `Only ${validWords.length} valid words found (need ${VALIDATION.MIN_VALID_WORDS})`,
      score: Math.min(20, validWords.length * 7),
      isGarbage: true,
    };
  }

  // Check 11: Overall confidence
  if ((result.confidence || 0) < VALIDATION.MIN_OVERALL_CONFIDENCE) {
    return {
      isValid: false,
      reason: 'Low overall confidence',
      score: Math.round((result.confidence || 0) * 0.3),
      isGarbage: true,
    };
  }

  // Check 12: Detect random character sequences
  const randomCharRatio = detectRandomCharRatio(text);
  if (randomCharRatio > VALIDATION.MAX_RANDOM_CHAR_RATIO) {
    return {
      isValid: false,
      reason: 'Appears to be random noise',
      score: Math.round((1 - randomCharRatio) * 30),
      isGarbage: true,
    };
  }

  return {
    isValid: true,
    reason: 'Valid text detected',
    score: Math.min(100, Math.round(result.confidence || 70)),
    validWordCount: validWords.length,
    commonWordCount,
    gibberishScore,
    isGarbage: false,
  };
};

/**
 * Calculate a "gibberish score" (0-100) for text
 * Higher = more likely to be garbage
 */
const calculateGibberishScore = (text, words) => {
  let score = 0;

  // Factor 1: Single letter words (except a, i, o)
  const singleLetters = words.filter(w =>
    w.length === 1 && !/^[aioAIO0-9]$/.test(w)
  );
  score += (singleLetters.length / words.length) * 30;

  // Factor 2: All-caps short words (like "LAR", "RE", "ET")
  const capsShortWords = words.filter(w =>
    w.length <= 3 && /^[A-Z]+$/.test(w) && !['THE', 'AND', 'FOR', 'NOT', 'BUT', 'YOU', 'ALL', 'CAN', 'HAD', 'HER', 'WAS', 'ONE', 'OUR', 'OUT', 'DAY', 'GET', 'HAS', 'HIM', 'HIS', 'HOW', 'ITS', 'MAY', 'NEW', 'NOW', 'OLD', 'SEE', 'TWO', 'WAY', 'WHO', 'BOY', 'DID', 'OWN', 'SAY', 'SHE', 'TOO', 'USE'].includes(w)
  );
  score += (capsShortWords.length / words.length) * 25;

  // Factor 3: Words with unusual character patterns
  const weirdWords = words.filter(w =>
    // Mixed case in weird ways (like "Eg" or "pE")
    (/[a-z][A-Z]/.test(w) && w.length <= 3) ||
    // Repeated patterns
    /^(.)\1+$/.test(w) ||
    // Just punctuation mixed with letters
    /^[^a-zA-Z0-9]*[a-zA-Z][^a-zA-Z0-9]*$/.test(w)
  );
  score += (weirdWords.length / words.length) * 20;

  // Factor 4: Very low ratio of common words
  const commonCount = words.filter(w => COMMON_WORDS.has(w.toLowerCase())).length;
  const commonRatio = commonCount / words.length;
  if (commonRatio < 0.1 && words.length > 5) {
    score += 15;
  }

  // Factor 5: Unusual word length distribution
  const wordLengths = words.map(w => w.length);
  const variance = calculateVariance(wordLengths);
  // Very high variance in word lengths is suspicious
  if (variance > 10) {
    score += 10;
  }

  return Math.min(100, Math.round(score));
};

/**
 * Calculate variance of an array of numbers
 */
const calculateVariance = (numbers) => {
  if (numbers.length === 0) return 0;
  const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
  const squaredDiffs = numbers.map(n => Math.pow(n - mean, 2));
  return squaredDiffs.reduce((a, b) => a + b, 0) / numbers.length;
};

/**
 * Check if a word looks like a real word (not garbage)
 */
const isValidWord = (word) => {
  if (!word || word.length < 2) return false;

  // All single characters except common ones
  if (word.length === 1 && !/[AaIiOo0-9]/.test(word)) return false;

  // Check for consonant-only or vowel-only strings (likely garbage)
  const vowels = word.match(/[aeiouAEIOU]/g) || [];
  const consonants = word.match(/[bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ]/g) || [];

  // Pure number is valid
  if (/^\d+$/.test(word)) return true;

  // Alphanumeric identifiers are valid
  if (/^[A-Z0-9]{2,}$/i.test(word)) return true;

  // Check vowel/consonant ratio for words
  if (word.length >= 4) {
    const letters = vowels.length + consonants.length;
    if (letters > 0) {
      const vowelRatio = vowels.length / letters;
      // English words typically have 30-50% vowels
      if (vowelRatio < 0.1 || vowelRatio > 0.8) return false;
    }
  }

  // Check for excessive repeated characters (like "aaaa" or "xxxx")
  if (/(.)\1{3,}/.test(word)) return false;

  // Check for alternating random pattern (like "xYxYxY")
  if (/^(.)(.)(\1\2)+$/.test(word)) return false;

  return true;
};

/**
 * Detect ratio of random-looking character sequences
 */
const detectRandomCharRatio = (text) => {
  const words = text.split(/\s+/);
  let randomCount = 0;

  for (const word of words) {
    // Check for patterns that indicate random noise
    const isRandom =
      // Very short fragments with special chars
      (word.length <= 2 && /[^a-zA-Z0-9]/.test(word)) ||
      // Alternating case that's not an acronym
      (/^[a-z][A-Z][a-z][A-Z]/.test(word)) ||
      // Multiple consecutive consonants (>4)
      (/[bcdfghjklmnpqrstvwxyz]{5,}/i.test(word)) ||
      // Random punctuation in middle of word
      (/[a-zA-Z][^a-zA-Z0-9\s'][a-zA-Z]/.test(word));

    if (isRandom) randomCount++;
  }

  return words.length > 0 ? randomCount / words.length : 1;
};

/**
 * Generate a unique identifier (UID) for processed content
 */
const generateContentUID = (text, identifiers) => {
  const content = JSON.stringify({
    text: (text || '').trim().substring(0, 500),
    identifiers: identifiers || {},
    timestamp: Date.now(),
  });

  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 32);
};

/**
 * Extract text from image using multi-pass OCR
 *
 * @param {Buffer|string} imageInput - Image buffer or file path
 * @param {Object} options - OCR options
 * @returns {Promise<Object>} Extracted text and metadata with UID
 */
const extractText = async (imageInput, options = {}) => {
  const startTime = Date.now();

  try {
    const ocrWorker = await initializeWorker();

    // Multi-pass OCR with different preprocessing for best results
    const passes = [];

    // Pass 1: Standard preprocessing (with auto EXIF rotation)
    try {
      const standardImage = await preprocessImage(imageInput);
      const result1 = await ocrWorker.recognize(standardImage);
      if (result1.data?.text) {
        passes.push({
          name: 'standard',
          text: result1.data.text,
          confidence: result1.data.confidence || 0,
          words: result1.data.words || [],
          lines: result1.data.lines || [],
        });
      }
    } catch (e) { /* Continue with other passes */ }

    // Pass 2: Rotated 90 degrees (for sideways images like ID cards held vertically)
    try {
      const rotated90Image = await preprocessRotated90(imageInput);
      const result90 = await ocrWorker.recognize(rotated90Image);
      if (result90.data?.text && result90.data.confidence > 30) {
        passes.push({
          name: 'rotated90',
          text: result90.data.text,
          confidence: result90.data.confidence || 0,
          words: result90.data.words || [],
          lines: result90.data.lines || [],
        });
      }
    } catch (e) { /* Continue with other passes */ }

    // Pass 3: Rotated 270 degrees (opposite rotation)
    try {
      const rotated270Image = await preprocessRotated270(imageInput);
      const result270 = await ocrWorker.recognize(rotated270Image);
      if (result270.data?.text && result270.data.confidence > 30) {
        passes.push({
          name: 'rotated270',
          text: result270.data.text,
          confidence: result270.data.confidence || 0,
          words: result270.data.words || [],
          lines: result270.data.lines || [],
        });
      }
    } catch (e) { /* Continue with other passes */ }

    // Pass 4: High contrast (for faded text)
    try {
      const highContrastImage = await preprocessHighContrast(imageInput);
      const result2 = await ocrWorker.recognize(highContrastImage);
      if (result2.data?.text && result2.data.confidence > 30) {
        passes.push({
          name: 'highContrast',
          text: result2.data.text,
          confidence: result2.data.confidence || 0,
          words: result2.data.words || [],
          lines: result2.data.lines || [],
        });
      }
    } catch (e) { /* Continue with other passes */ }

    // Pass 5: License plate optimized (if identifiers expected)
    try {
      const plateImage = await preprocessForLicensePlate(imageInput);
      const result3 = await ocrWorker.recognize(plateImage);
      if (result3.data?.text) {
        passes.push({
          name: 'licensePlate',
          text: result3.data.text,
          confidence: result3.data.confidence || 0,
          words: result3.data.words || [],
          lines: result3.data.lines || [],
        });
      }
    } catch (e) { /* Continue */ }

    // Handle case where all passes failed
    if (passes.length === 0) {
      const uid = generateContentUID('', {});
      return {
        uid,
        text: '',
        confidence: 0,
        words: [],
        lines: [],
        identifiers: extractIdentifiers(''),
        processingTimeMs: Date.now() - startTime,
        passesUsed: 0,
        score: 0,
      };
    }

    // Select best pass based on confidence and identifier detection
    let bestPass = passes[0];
    let bestScore = 0;

    for (const pass of passes) {
      const identifiers = extractIdentifiers(pass.text);
      const hasIdentifiers = Object.values(identifiers).some(arr => arr?.length > 0);

      // Score this pass
      let passScore = pass.confidence;

      // Bonus for detecting identifiers
      if (identifiers.licensePlates?.length > 0) passScore += 30;
      if (identifiers.serialNumbers?.length > 0) passScore += 25;
      if (identifiers.documentIds?.length > 0) passScore += 20;

      // Bonus for text length (more text = more reliable)
      if (pass.text.length > 10) passScore += 5;
      if (pass.text.length > 50) passScore += 5;

      if (passScore > bestScore) {
        bestScore = passScore;
        bestPass = pass;
      }
    }

    // Extract identifiers from best pass
    const identifiers = extractIdentifiers(bestPass.text);

    // Also check other passes for additional identifiers
    for (const pass of passes) {
      if (pass.name !== bestPass.name) {
        const additionalIds = extractIdentifiers(pass.text);

        // Merge unique identifiers
        for (const key of Object.keys(additionalIds)) {
          const existing = new Set(identifiers[key] || []);
          for (const id of (additionalIds[key] || [])) {
            if (!existing.has(id)) {
              identifiers[key] = identifiers[key] || [];
              identifiers[key].push(id);
            }
          }
        }
      }
    }

    // Filter words by confidence
    const minConfidence = options.minConfidence || 50;
    const filteredWords = (bestPass.words || []).filter(w => w.confidence >= minConfidence);

    // Generate UID for this content
    const uid = generateContentUID(bestPass.text, identifiers);

    // Calculate enhanced score
    const score = calculateEnhancedOCRScore({
      text: bestPass.text,
      confidence: bestPass.confidence,
      identifiers,
      passesUsed: passes.length,
    });

    return {
      uid,
      text: bestPass.text.trim(),
      confidence: bestPass.confidence,
      words: filteredWords.map(w => ({
        text: w.text,
        confidence: w.confidence,
        bbox: w.bbox,
      })),
      lines: (bestPass.lines || []).map(l => ({
        text: l.text,
        confidence: l.confidence,
      })),
      identifiers,
      processingTimeMs: Date.now() - startTime,
      passesUsed: passes.length,
      bestPassName: bestPass.name,
      score,
    };
  } catch (error) {
    throw new Error(`OCR extraction failed: ${error.message}`);
  }
};

/**
 * Calculate enhanced OCR score (0-100)
 * NOW WITH GARBAGE DETECTION - returns 0 for invalid/garbage text
 */
const calculateEnhancedOCRScore = (result) => {
  // FIRST: Validate the OCR output
  const validation = validateOCROutput(result);

  // If text is garbage, return 0
  if (!validation.isValid) {
    console.log(`OCR validation failed: ${validation.reason}`);
    return 0;
  }

  let score = 0;

  // Base confidence score (0-35 points)
  // Scale confidence more fairly
  const confidence = result.confidence || 0;
  if (confidence >= 90) score += 35;
  else if (confidence >= 80) score += 30;
  else if (confidence >= 70) score += 25;
  else if (confidence >= 60) score += 20;
  else if (confidence >= 50) score += 15;
  else if (confidence >= 40) score += 10;
  else score += Math.max(0, confidence * 0.2);

  // Identifier detection bonus (0-45 points) - HIGH VALUE
  const identifiers = result.identifiers || {};

  // License plates - most valuable for vehicle matching
  if (identifiers.licensePlates?.length > 0) {
    // Validate license plate format
    const validPlates = identifiers.licensePlates.filter(p =>
      p.length >= 5 && p.length <= 10 && /^[A-Z0-9\s-]+$/i.test(p)
    );
    if (validPlates.length > 0) {
      score += 25;
      // Additional points for clear plates
      if (validPlates.some(p => p.replace(/\s/g, '').length >= 6)) score += 10;
    }
  }

  // Serial numbers - valuable for electronics
  if (identifiers.serialNumbers?.length > 0) {
    // Validate serial number format
    const validSerials = identifiers.serialNumbers.filter(s =>
      s.length >= 6 && /[A-Z0-9]{6,}/i.test(s)
    );
    if (validSerials.length > 0) score += 20;
  }

  // Document IDs
  if (identifiers.documentIds?.length > 0) {
    score += 15;
  }

  // Contact info (less valuable but useful)
  if (identifiers.emails?.length > 0) score += 5;
  if (identifiers.phones?.length > 0) score += 5;

  // Text quality bonus (0-15 points) - BUT ONLY FOR VALID TEXT
  const text = (result.text || '').trim();
  const validWordCount = text.split(/\s+/).filter(w => isValidWord(w)).length;

  if (validWordCount >= 20) score += 15;
  else if (validWordCount >= 10) score += 12;
  else if (validWordCount >= 5) score += 8;
  else if (validWordCount >= 3) score += 5;
  else if (validWordCount >= 2) score += 2;

  // Multi-pass bonus (0-5 points)
  if (result.passesUsed >= 3) score += 5;
  else if (result.passesUsed >= 2) score += 3;

  return Math.min(100, Math.round(score));
};

/**
 * Extract potential identifiers from text
 * (serial numbers, license plates, document IDs)
 *
 * @param {string} text - Raw OCR text
 * @returns {Object} Categorized identifiers
 */
const extractIdentifiers = (text) => {
  const identifiers = {
    serialNumbers: [],
    licensePlates: [],
    documentIds: [],
    emails: [],
    phones: [],
    urls: [],
  };

  if (!text) return identifiers;

  // Clean text
  const cleanText = text.replace(/\n/g, ' ').replace(/\s+/g, ' ');

  // Common words to exclude from serial numbers (addresses, place names, etc.)
  const excludeWords = new Set([
    'brantford', 'toronto', 'ontario', 'canada', 'street', 'avenue',
    'boulevard', 'driver', 'licence', 'license', 'address', 'province',
    'sleethst', 'mississauga', 'scarborough', 'brampton', 'hamilton',
    'kitchener', 'waterloo', 'cambridge', 'guelph', 'barrie', 'kingston',
  ]);

  // Serial number patterns (alphanumeric with specific formats)
  const serialPatterns = [
    /\b[A-Z]{2,3}-?\d{5,10}\b/gi,           // XX-12345 or XXX12345
    /\b\d{2,4}-\d{4,6}-\d{2,4}\b/g,          // 12-3456-78
    /\bS\/?N[:\s]*([A-Z0-9-]+)\b/gi,         // S/N: XXXX or SN: XXXX
    /\bSerial[:\s]*([A-Z0-9-]+)\b/gi,        // Serial: XXXX
  ];

  // Pattern for mixed alphanumeric (must have BOTH letters AND numbers)
  const mixedAlphanumericPattern = /\b(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]{8,15}\b/gi;

  serialPatterns.forEach(pattern => {
    const matches = cleanText.match(pattern);
    if (matches) {
      const filtered = matches
        .map(m => m.trim())
        .filter(m => !excludeWords.has(m.toLowerCase()));
      identifiers.serialNumbers.push(...filtered);
    }
  });

  // Add mixed alphanumeric matches (e.g., HV1912577)
  const mixedMatches = cleanText.match(mixedAlphanumericPattern);
  if (mixedMatches) {
    const filtered = mixedMatches
      .map(m => m.trim())
      .filter(m => !excludeWords.has(m.toLowerCase()))
      .filter(m => !identifiers.serialNumbers.includes(m)); // Avoid duplicates
    identifiers.serialNumbers.push(...filtered);
  }

  // License plate patterns (various countries) - stricter matching
  // Minimum 5 characters to avoid false positives like "AB 1"
  const platePatterns = [
    /\b[A-Z]{2,3}\s?[A-Z]?\s?\d{3,4}\b/g,       // US: ABC 1234, AB 123
    /\b[A-Z]{3}\s?\d{4}\b/g,                     // US standard: ABC 1234
    /\b\d{3}\s?[A-Z]{3}\b/g,                     // US: 123 ABC
    /\b[A-Z]{1,2}\d{2}\s?[A-Z]{3}\b/g,           // UK: AB12 XYZ
    /\b[A-Z]{2}\s?\d{4}\s?[A-Z]{2}\b/g,          // European: AB 1234 CD
    /\b[A-Z]{4}\s?\d{3}\b/g,                     // Ontario: ABCD 123
    /\b\d{1,4}[\s-]?[A-Z]{2,3}[\s-]?\d{1,4}\b/g, // Various: 123-AB-456
  ];

  platePatterns.forEach(pattern => {
    const matches = cleanText.match(pattern);
    if (matches) {
      // Filter out matches shorter than 5 characters (too likely false positives)
      const validMatches = matches.filter(m => m.replace(/\s/g, '').length >= 5);
      identifiers.licensePlates.push(...validMatches.map(m => m.trim()));
    }
  });

  // Remove duplicates from license plates
  identifiers.licensePlates = [...new Set(identifiers.licensePlates)];

  // Document ID patterns
  const docPatterns = [
    /\bID[:\s]*([A-Z0-9-]+)\b/gi,
    /\b\d{3}-\d{2}-\d{4}\b/g,                  // SSN format (masked)
    /\b[A-Z]{1,2}\d{6,9}\b/g,                  // Passport/ID number
    /\b[A-Z]?\d{4,5}[\s-]+\d{4,5}[\s-]+\d{4,5}\b/g, // Ontario DL: D6155-43709-80830
    /\bD\d{4}\s?-?\s?\d{5}\s?-?\s?\d{5}\b/gi,  // Ontario specific: D6155 - 43709 - 80830
  ];

  docPatterns.forEach(pattern => {
    const matches = cleanText.match(pattern);
    if (matches) {
      identifiers.documentIds.push(...matches.map(m => m.trim()));
    }
  });

  // Email addresses
  const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const emails = cleanText.match(emailPattern);
  if (emails) {
    identifiers.emails.push(...emails);
  }

  // Phone numbers
  const phonePatterns = [
    /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g,     // 123-456-7890
    /\b\(\d{3}\)\s?\d{3}[-.\s]?\d{4}\b/g,     // (123) 456-7890
    /\b\+\d{1,3}[-.\s]?\d{8,12}\b/g,          // +1 1234567890
  ];

  phonePatterns.forEach(pattern => {
    const matches = cleanText.match(pattern);
    if (matches) {
      identifiers.phones.push(...matches.map(m => m.trim()));
    }
  });

  // Deduplicate
  Object.keys(identifiers).forEach(key => {
    identifiers[key] = [...new Set(identifiers[key])];
  });

  return identifiers;
};

/**
 * Extract text optimized for license plates
 *
 * @param {Buffer|string} imageInput - Image buffer or file path
 * @returns {Promise<Object>} License plate text and confidence
 */
const extractLicensePlate = async (imageInput) => {
  try {
    // Preprocess for license plates (high contrast, large text)
    const processed = await sharp(imageInput)
      .grayscale()
      .threshold(128)
      .sharpen({ sigma: 2 })
      .toBuffer();

    const ocrWorker = await initializeWorker();

    // Configure for single line, alphanumeric
    await ocrWorker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -',
      tessedit_pageseg_mode: '7', // Single line
    });

    const result = await ocrWorker.recognize(processed);

    // Reset parameters
    await ocrWorker.setParameters({
      tessedit_char_whitelist: '',
      tessedit_pageseg_mode: '3', // Auto
    });

    // Clean result
    const plateText = result.data.text
      .replace(/[^A-Z0-9 -]/g, '')
      .trim();

    return {
      text: plateText,
      confidence: result.data.confidence,
      isValid: plateText.length >= 4 && plateText.length <= 10,
    };
  } catch (error) {
    throw new Error(`License plate extraction failed: ${error.message}`);
  }
};

/**
 * Extract text optimized for serial numbers
 *
 * @param {Buffer|string} imageInput - Image buffer or file path
 * @returns {Promise<Object>} Serial number text and confidence
 */
const extractSerialNumber = async (imageInput) => {
  try {
    const processed = await sharp(imageInput)
      .grayscale()
      .normalise()
      .sharpen({ sigma: 1.5 })
      .toBuffer();

    const result = await extractText(processed, { preprocess: false });

    // Look for serial number patterns in extracted text
    const serialNumbers = result.identifiers.serialNumbers;

    return {
      serialNumbers,
      rawText: result.text,
      confidence: result.confidence,
      found: serialNumbers.length > 0,
    };
  } catch (error) {
    throw new Error(`Serial number extraction failed: ${error.message}`);
  }
};

/**
 * Cleanup worker on shutdown
 */
const cleanup = async () => {
  if (worker) {
    await worker.terminate();
    worker = null;
  }
};

// Handle process shutdown
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

module.exports = {
  extractText,
  extractIdentifiers,
  extractLicensePlate,
  extractSerialNumber,
  preprocessImage,
  validateOCROutput,
  isValidWord,
  calculateGibberishScore,
  calculateVariance,
  cleanup,
};
