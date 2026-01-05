/**
 * Test Script for Image DNA v2.0
 *
 * Tests the new DINOv2 neural embeddings and human-readable DNA ID generation.
 *
 * Usage: node src/utils/testDnaV2.js [image_path]
 */

const path = require('path');
const fs = require('fs');

// Set up module paths
const imageDnaService = require('../services/imageDnaService');
const neuralEmbeddingService = require('../services/neuralEmbeddingService');

// Use a sample image or create a test pattern
const createTestImage = async () => {
  const sharp = require('sharp');

  // Create a simple 256x256 test image with colors
  const width = 256;
  const height = 256;

  // Create a gradient image (brown/orange tones like a pet)
  const channels = 3;
  const pixels = Buffer.alloc(width * height * channels);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      // Brown/orange gradient
      pixels[i] = Math.min(255, 139 + Math.floor((x / width) * 50));     // R
      pixels[i + 1] = Math.min(255, 69 + Math.floor((y / height) * 30)); // G
      pixels[i + 2] = 19;                                                  // B
    }
  }

  return await sharp(pixels, {
    raw: {
      width,
      height,
      channels,
    }
  }).jpeg().toBuffer();
};

const testDnaV2 = async (imagePath) => {
  console.log('\n========================================');
  console.log('   Image DNA v2.0 Test Suite');
  console.log('========================================\n');

  let imageBuffer;

  if (imagePath && fs.existsSync(imagePath)) {
    console.log(`Loading image from: ${imagePath}`);
    imageBuffer = fs.readFileSync(imagePath);
  } else {
    console.log('No image provided, creating test image...');
    imageBuffer = await createTestImage();
  }

  console.log(`Image size: ${(imageBuffer.length / 1024).toFixed(2)} KB\n`);

  // Test 1: Neural Embedding Service
  console.log('--- Test 1: Neural Embedding Service ---');
  console.log('Warming up neural models (first run downloads ~84MB)...');

  const warmupStart = Date.now();
  const warmupResult = await neuralEmbeddingService.warmUp();
  console.log(`Warmup complete: ${warmupResult} (${Date.now() - warmupStart}ms)`);

  const modelStatus = neuralEmbeddingService.isReady();
  console.log(`Model status: DINOv2=${modelStatus.dino}, CLIP=${modelStatus.clip}\n`);

  // Test 2: Generate Neural Fingerprint
  console.log('--- Test 2: Generate Neural Fingerprint ---');
  const neuralStart = Date.now();
  const neuralFingerprint = await neuralEmbeddingService.generateNeuralFingerprint(imageBuffer);
  console.log(`Processing time: ${Date.now() - neuralStart}ms`);
  console.log(`Entity Type: ${neuralFingerprint.entityType}`);
  console.log(`Entity Confidence: ${(neuralFingerprint.entityConfidence * 100).toFixed(1)}%`);
  console.log(`Embedding Dimensions: ${neuralFingerprint.dimensions}`);
  console.log(`Embedding Hash: ${neuralFingerprint.embeddingHash}`);
  console.log(`Success: ${neuralFingerprint.success}\n`);

  // Test 3: Generate DNA v2
  console.log('--- Test 3: Generate DNA v2 ---');
  const dnaStart = Date.now();
  const dnaV2 = await imageDnaService.generateImageDNA_v2(imageBuffer, {
    neuralFingerprint: neuralFingerprint,
  });
  console.log(`Processing time: ${Date.now() - dnaStart}ms`);
  console.log(`\n  DNA ID: ${dnaV2.dnaId}`);
  console.log('\n  Interpretation:');
  console.log(`    - Entity: ${dnaV2.interpretation?.entity || 'N/A'}`);
  console.log(`    - Colors: ${dnaV2.interpretation?.colors || 'N/A'}`);
  console.log(`    - Shape: ${dnaV2.interpretation?.shape || 'N/A'}`);
  console.log(`    - Quality: ${dnaV2.interpretation?.quality || 'N/A'}`);
  console.log('\n  Searchable Fields:');
  console.log(`    - Entity: ${dnaV2.searchableFields?.entity || 'N/A'}`);
  console.log(`    - Colors: ${JSON.stringify(dnaV2.searchableFields?.colors || [])}`);
  console.log(`    - Quality Tier: ${dnaV2.searchableFields?.qualityTier || 'N/A'}`);

  // Test 4: Generate Legacy DNA v1 for comparison
  console.log('\n--- Test 4: Legacy DNA v1 (for comparison) ---');
  const dnaV1Start = Date.now();
  const dnaV1 = await imageDnaService.generateImageDNA(imageBuffer);
  console.log(`Processing time: ${Date.now() - dnaV1Start}ms`);
  console.log(`DNA v1 ID: ${dnaV1.dnaId}`);
  console.log(`Hash Components: pHash, aHash, dHash`);

  // Test 5: HSV Color Fingerprint
  console.log('\n--- Test 5: HSV Color Fingerprint ---');
  const hsvStart = Date.now();
  const hsvFingerprint = await imageDnaService.generateHSVColorFingerprint(imageBuffer);
  console.log(`Processing time: ${Date.now() - hsvStart}ms`);
  console.log(`Dominant Colors: ${JSON.stringify(hsvFingerprint.dominantColors)}`);
  console.log(`Color Abbreviations: ${JSON.stringify(hsvFingerprint.colorAbbreviations)}`);
  console.log(`Color Code: ${hsvFingerprint.colorCode}`);

  // Test 6: Cosine Similarity (self-comparison)
  console.log('\n--- Test 6: Embedding Similarity ---');
  if (neuralFingerprint.embedding) {
    const selfSimilarity = neuralEmbeddingService.cosineSimilarity(
      neuralFingerprint.embedding,
      neuralFingerprint.embedding
    );
    console.log(`Self-similarity (should be 1.0): ${selfSimilarity.toFixed(4)}`);

    // Create a slightly modified embedding
    const modifiedEmbedding = neuralFingerprint.embedding.map((v, i) =>
      i < 50 ? v * 0.9 : v
    );
    const modifiedSimilarity = neuralEmbeddingService.cosineSimilarity(
      neuralFingerprint.embedding,
      modifiedEmbedding
    );
    console.log(`Modified similarity (should be < 1.0): ${modifiedSimilarity.toFixed(4)}`);
  }

  console.log('\n========================================');
  console.log('   All Tests Complete!');
  console.log('========================================\n');

  return {
    success: true,
    dnaV2,
    neuralFingerprint,
  };
};

// Run tests
const imagePath = process.argv[2];
testDnaV2(imagePath)
  .then(result => {
    console.log('Final DNA v2 ID:', result.dnaV2.dnaId);
    process.exit(0);
  })
  .catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
