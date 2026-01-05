#!/usr/bin/env node

/**
 * Download AI models for face recognition
 * Run this after npm install to download required models
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const MODEL_DIR = path.join(__dirname, '../src/ai-models/face-api');
const BASE_URL = 'https://raw.githubusercontent.com/vladmandic/face-api/master/model';

const models = [
  'ssd_mobilenetv1_model-weights_manifest.json',
  'ssd_mobilenetv1_model-shard1',
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model-shard1',
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model-shard1',
  'face_recognition_model-shard2',
];

// Create model directory
if (!fs.existsSync(MODEL_DIR)) {
  fs.mkdirSync(MODEL_DIR, { recursive: true });
  console.log(`📁 Created directory: ${MODEL_DIR}`);
}

// Download a file
function downloadFile(filename) {
  return new Promise((resolve, reject) => {
    const filePath = path.join(MODEL_DIR, filename);

    // Skip if already exists
    if (fs.existsSync(filePath)) {
      console.log(`✅ Already exists: ${filename}`);
      return resolve();
    }

    const url = `${BASE_URL}/${filename}`;
    console.log(`⬇️  Downloading: ${filename}...`);

    const file = fs.createWriteStream(filePath);

    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${filename}: ${response.statusCode}`));
        return;
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log(`✅ Downloaded: ${filename}`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(filePath, () => {});
      reject(err);
    });
  });
}

// Download all models
async function downloadAllModels() {
  console.log('🤖 Downloading AI models for face recognition...\n');

  try {
    for (const model of models) {
      await downloadFile(model);
    }

    console.log('\n✅ All models downloaded successfully!');
    console.log('💡 Face recognition AI is ready to use.\n');
  } catch (error) {
    console.error('\n❌ Error downloading models:', error.message);
    console.log('💡 Models will be downloaded automatically on first use.\n');
    process.exit(0); // Don't fail the install
  }
}

downloadAllModels();
