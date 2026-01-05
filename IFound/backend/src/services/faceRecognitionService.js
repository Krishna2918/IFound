const fs = require('fs');
const path = require('path');

// Try to load TensorFlow and face-api (may fail on some systems)
let tf, faceapi, canvas;
let AI_AVAILABLE = false;

try {
  tf = require('@tensorflow/tfjs-node');
  faceapi = require('@vladmandic/face-api');
  canvas = require('canvas');
  const { Canvas, Image, ImageData } = canvas;
  faceapi.env.monkeyPatch({ Canvas, Image, ImageData });
  AI_AVAILABLE = true;
  console.log('Face Recognition AI: TensorFlow loaded successfully');
} catch (error) {
  console.warn('Face Recognition AI: TensorFlow/Canvas not available -', error.message);
  console.warn('Face detection features will be disabled. To enable, install Visual Studio Build Tools.');
}

class FaceRecognitionService {
  constructor() {
    this.initialized = false;
    this.available = AI_AVAILABLE;
    this.modelPath = path.join(__dirname, '../ai-models/face-api');
  }

  /**
   * Initialize face-api models
   */
  async initialize() {
    if (this.initialized) return;
    if (!this.available) {
      console.log('Face Recognition AI: Skipping initialization (TensorFlow not available)');
      return;
    }

    try {
      console.log('Initializing Face Recognition AI...');

      // Create models directory if it doesn't exist
      if (!fs.existsSync(this.modelPath)) {
        fs.mkdirSync(this.modelPath, { recursive: true });
      }

      // Load models (will download on first run)
      await faceapi.nets.ssdMobilenetv1.loadFromDisk(this.modelPath);
      await faceapi.nets.faceLandmark68Net.loadFromDisk(this.modelPath);
      await faceapi.nets.faceRecognitionNet.loadFromDisk(this.modelPath);

      this.initialized = true;
      console.log('Face Recognition AI initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Face Recognition:', error.message);
      console.log('Models will be downloaded on first use');
      // Don't throw - we'll initialize lazily on first use
    }
  }

  /**
   * Detect faces in an image and extract embeddings
   */
  async detectFaces(imagePath) {
    // Return empty result if AI not available
    if (!this.available) {
      return {
        success: false,
        message: 'Face recognition not available (TensorFlow not installed)',
        faces: [],
      };
    }

    try {
      if (!this.initialized) {
        await this.initialize();
      }

      // Load image
      const img = await canvas.loadImage(imagePath);

      // Detect faces with landmarks and descriptors
      const detections = await faceapi
        .detectAllFaces(img)
        .withFaceLandmarks()
        .withFaceDescriptors();

      if (detections.length === 0) {
        return {
          success: false,
          message: 'No faces detected in image',
          faces: [],
        };
      }

      // Extract face data
      const faces = detections.map((detection, index) => ({
        index,
        box: detection.detection.box,
        confidence: detection.detection.score,
        landmarks: detection.landmarks.positions,
        descriptor: Array.from(detection.descriptor), // 128-dimensional face embedding
      }));

      return {
        success: true,
        faces,
        count: faces.length,
      };
    } catch (error) {
      console.error('Face detection error:', error);
      return {
        success: false,
        message: error.message,
        faces: [],
      };
    }
  }

  /**
   * Compare two face descriptors and return similarity score
   */
  compareFaces(descriptor1, descriptor2) {
    if (!descriptor1 || !descriptor2) return 0;
    if (descriptor1.length !== 128 || descriptor2.length !== 128) return 0;

    // Calculate Euclidean distance
    const distance = faceapi.euclideanDistance(descriptor1, descriptor2);

    // Convert distance to similarity (0-100)
    // Distance < 0.6 is considered a match
    const similarity = Math.max(0, Math.min(100, (1 - distance) * 100));

    return similarity;
  }

  /**
   * Find matching faces in a database of face descriptors
   */
  async findMatches(queryDescriptor, database, threshold = 60) {
    if (!queryDescriptor || queryDescriptor.length !== 128) {
      return [];
    }

    const matches = [];

    for (const entry of database) {
      if (!entry.descriptor || entry.descriptor.length !== 128) continue;

      const similarity = this.compareFaces(queryDescriptor, entry.descriptor);

      if (similarity >= threshold) {
        matches.push({
          ...entry,
          similarity,
          isMatch: similarity >= 75, // High confidence match
        });
      }
    }

    // Sort by similarity (highest first)
    matches.sort((a, b) => b.similarity - a.similarity);

    return matches;
  }

  /**
   * Extract the best face descriptor from multiple detections
   */
  getBestDescriptor(faces) {
    if (!faces || faces.length === 0) return null;

    // Return the face with highest confidence
    const bestFace = faces.reduce((best, face) =>
      face.confidence > best.confidence ? face : best
    );

    return bestFace.descriptor;
  }

  /**
   * Process a photo and store face data
   */
  async processPhoto(photoPath) {
    try {
      const result = await this.detectFaces(photoPath);

      if (!result.success || result.faces.length === 0) {
        return {
          success: false,
          message: 'No faces detected',
          faceDetected: false,
        };
      }

      const bestDescriptor = this.getBestDescriptor(result.faces);

      return {
        success: true,
        faceDetected: true,
        facesCount: result.faces.length,
        descriptor: bestDescriptor,
        confidence: result.faces[0].confidence,
        metadata: {
          faces: result.faces.map(f => ({
            box: f.box,
            confidence: f.confidence,
          })),
        },
      };
    } catch (error) {
      console.error('Photo processing error:', error);
      return {
        success: false,
        faceDetected: false,
        message: error.message,
      };
    }
  }

  /**
   * Search for similar faces across all cases
   */
  async searchByFace(queryPhotoPath, allCasePhotos, threshold = 60) {
    try {
      // Process query photo
      const queryResult = await this.processPhoto(queryPhotoPath);

      if (!queryResult.success || !queryResult.descriptor) {
        return {
          success: false,
          message: 'Could not extract face from query image',
          matches: [],
        };
      }

      // Build database of face descriptors
      const database = allCasePhotos
        .filter(photo => photo.face_detected && photo.face_vector)
        .map(photo => ({
          photo_id: photo.id,
          case_id: photo.case_id,
          descriptor: photo.face_vector,
        }));

      // Find matches
      const matches = await this.findMatches(
        queryResult.descriptor,
        database,
        threshold
      );

      return {
        success: true,
        matches,
        queryFaces: queryResult.facesCount,
      };
    } catch (error) {
      console.error('Face search error:', error);
      return {
        success: false,
        message: error.message,
        matches: [],
      };
    }
  }
}

// Singleton instance
const faceRecognitionService = new FaceRecognitionService();

// Initialize on module load (async, non-blocking)
faceRecognitionService.initialize().catch(console.error);

module.exports = faceRecognitionService;
