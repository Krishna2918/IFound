/**
 * AWS Rekognition Service
 *
 * Production-grade face and object recognition using AWS Rekognition.
 * Provides face matching, object detection, and content moderation.
 */

const logger = require('../config/logger');

let RekognitionClient, DetectFacesCommand, CompareFacesCommand, DetectLabelsCommand, DetectModerationLabelsCommand, IndexFacesCommand, SearchFacesByImageCommand, CreateCollectionCommand, DeleteCollectionCommand;
let S3Client, PutObjectCommand;
let available = false;

try {
  const rekognition = require('@aws-sdk/client-rekognition');
  RekognitionClient = rekognition.RekognitionClient;
  DetectFacesCommand = rekognition.DetectFacesCommand;
  CompareFacesCommand = rekognition.CompareFacesCommand;
  DetectLabelsCommand = rekognition.DetectLabelsCommand;
  DetectModerationLabelsCommand = rekognition.DetectModerationLabelsCommand;
  IndexFacesCommand = rekognition.IndexFacesCommand;
  SearchFacesByImageCommand = rekognition.SearchFacesByImageCommand;
  CreateCollectionCommand = rekognition.CreateCollectionCommand;
  DeleteCollectionCommand = rekognition.DeleteCollectionCommand;

  const s3 = require('@aws-sdk/client-s3');
  S3Client = s3.S3Client;
  PutObjectCommand = s3.PutObjectCommand;
  available = true;
} catch (error) {
  logger.warn('AWS SDK not available:', error.message);
}

class RekognitionService {
  constructor() {
    this.client = null;
    this.s3Client = null;
    this.collectionId = 'ifound-faces';
    this.bucket = process.env.AWS_S3_BUCKET;
    this.available = false;
    this.initialize();
  }

  initialize() {
    if (!available) {
      logger.warn('AWS Rekognition: SDK not installed');
      return;
    }

    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      logger.warn('AWS Rekognition: Credentials not configured');
      return;
    }

    try {
      const config = {
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      };

      this.client = new RekognitionClient(config);
      this.s3Client = new S3Client(config);
      this.available = true;
      logger.info('AWS Rekognition initialized');

      // Ensure face collection exists
      this.ensureCollection();
    } catch (error) {
      logger.error('Failed to initialize Rekognition:', error);
    }
  }

  async ensureCollection() {
    if (!this.available) return;

    try {
      await this.client.send(new CreateCollectionCommand({
        CollectionId: this.collectionId,
      }));
      logger.info('Created Rekognition collection:', this.collectionId);
    } catch (error) {
      if (error.name !== 'ResourceAlreadyExistsException') {
        logger.error('Failed to create collection:', error);
      }
    }
  }

  /**
   * Detect faces in an image
   */
  async detectFaces(imageBuffer) {
    if (!this.available) {
      return { success: false, message: 'Rekognition not available', faces: [] };
    }

    try {
      const command = new DetectFacesCommand({
        Image: { Bytes: imageBuffer },
        Attributes: ['ALL'],
      });

      const response = await this.client.send(command);

      const faces = response.FaceDetails.map((face, index) => ({
        index,
        confidence: face.Confidence,
        boundingBox: face.BoundingBox,
        ageRange: face.AgeRange,
        gender: face.Gender,
        emotions: face.Emotions?.sort((a, b) => b.Confidence - a.Confidence).slice(0, 3),
        eyeglasses: face.Eyeglasses?.Value,
        sunglasses: face.Sunglasses?.Value,
        beard: face.Beard?.Value,
        mustache: face.Mustache?.Value,
        smile: face.Smile?.Value,
        eyesOpen: face.EyesOpen?.Value,
        landmarks: face.Landmarks,
        pose: face.Pose,
        quality: face.Quality,
      }));

      return {
        success: true,
        faces,
        count: faces.length,
        orientation: response.OrientationCorrection,
      };
    } catch (error) {
      logger.error('Rekognition detectFaces error:', error);
      return { success: false, message: error.message, faces: [] };
    }
  }

  /**
   * Compare two faces
   */
  async compareFaces(sourceBuffer, targetBuffer, similarityThreshold = 70) {
    if (!this.available) {
      return { success: false, message: 'Rekognition not available', match: false };
    }

    try {
      const command = new CompareFacesCommand({
        SourceImage: { Bytes: sourceBuffer },
        TargetImage: { Bytes: targetBuffer },
        SimilarityThreshold: similarityThreshold,
      });

      const response = await this.client.send(command);

      const matches = response.FaceMatches.map(match => ({
        similarity: match.Similarity,
        boundingBox: match.Face.BoundingBox,
        confidence: match.Face.Confidence,
      }));

      return {
        success: true,
        match: matches.length > 0,
        matches,
        unmatchedFaces: response.UnmatchedFaces?.length || 0,
        bestMatch: matches[0] || null,
      };
    } catch (error) {
      logger.error('Rekognition compareFaces error:', error);
      return { success: false, message: error.message, match: false };
    }
  }

  /**
   * Index a face for later searching
   */
  async indexFace(imageBuffer, externalId) {
    if (!this.available) {
      return { success: false, message: 'Rekognition not available' };
    }

    try {
      const command = new IndexFacesCommand({
        CollectionId: this.collectionId,
        Image: { Bytes: imageBuffer },
        ExternalImageId: externalId,
        DetectionAttributes: ['ALL'],
        MaxFaces: 1,
        QualityFilter: 'AUTO',
      });

      const response = await this.client.send(command);

      if (response.FaceRecords.length === 0) {
        return { success: false, message: 'No face detected in image' };
      }

      return {
        success: true,
        faceId: response.FaceRecords[0].Face.FaceId,
        externalId,
        confidence: response.FaceRecords[0].Face.Confidence,
        boundingBox: response.FaceRecords[0].Face.BoundingBox,
      };
    } catch (error) {
      logger.error('Rekognition indexFace error:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Search for matching faces in the collection
   */
  async searchFaces(imageBuffer, maxFaces = 10, threshold = 70) {
    if (!this.available) {
      return { success: false, message: 'Rekognition not available', matches: [] };
    }

    try {
      const command = new SearchFacesByImageCommand({
        CollectionId: this.collectionId,
        Image: { Bytes: imageBuffer },
        MaxFaces: maxFaces,
        FaceMatchThreshold: threshold,
      });

      const response = await this.client.send(command);

      const matches = response.FaceMatches.map(match => ({
        faceId: match.Face.FaceId,
        externalId: match.Face.ExternalImageId,
        similarity: match.Similarity,
        confidence: match.Face.Confidence,
      }));

      return {
        success: true,
        matches,
        searchedFace: response.SearchedFaceBoundingBox,
        searchedFaceConfidence: response.SearchedFaceConfidence,
      };
    } catch (error) {
      if (error.name === 'InvalidParameterException' && error.message.includes('no faces')) {
        return { success: false, message: 'No face detected in search image', matches: [] };
      }
      logger.error('Rekognition searchFaces error:', error);
      return { success: false, message: error.message, matches: [] };
    }
  }

  /**
   * Detect objects and labels in an image
   */
  async detectLabels(imageBuffer, maxLabels = 20, minConfidence = 70) {
    if (!this.available) {
      return { success: false, message: 'Rekognition not available', labels: [] };
    }

    try {
      const command = new DetectLabelsCommand({
        Image: { Bytes: imageBuffer },
        MaxLabels: maxLabels,
        MinConfidence: minConfidence,
      });

      const response = await this.client.send(command);

      const labels = response.Labels.map(label => ({
        name: label.Name,
        confidence: label.Confidence,
        parents: label.Parents?.map(p => p.Name) || [],
        instances: label.Instances?.map(i => ({
          boundingBox: i.BoundingBox,
          confidence: i.Confidence,
        })) || [],
      }));

      return {
        success: true,
        labels,
        count: labels.length,
      };
    } catch (error) {
      logger.error('Rekognition detectLabels error:', error);
      return { success: false, message: error.message, labels: [] };
    }
  }

  /**
   * Auto-categorize a photo based on detected labels
   */
  async categorizePhoto(imageBuffer) {
    const result = await this.detectLabels(imageBuffer, 30, 60);

    if (!result.success) {
      return { success: false, category: 'other', confidence: 0 };
    }

    const labelNames = result.labels.map(l => l.name.toLowerCase());

    // Category detection rules
    const categories = {
      pet: ['dog', 'cat', 'pet', 'animal', 'puppy', 'kitten', 'bird', 'rabbit'],
      electronics: ['phone', 'laptop', 'computer', 'tablet', 'camera', 'electronics', 'device', 'gadget', 'headphones', 'watch', 'smartwatch'],
      jewelry: ['jewelry', 'ring', 'necklace', 'bracelet', 'earring', 'gold', 'silver', 'diamond', 'gem'],
      documents: ['document', 'paper', 'passport', 'id card', 'license', 'card', 'certificate', 'book'],
      vehicle: ['car', 'vehicle', 'motorcycle', 'bicycle', 'bike', 'scooter', 'truck'],
      keys: ['key', 'keychain', 'keys'],
      wallet: ['wallet', 'purse', 'bag', 'handbag', 'backpack'],
      person: ['person', 'human', 'face', 'man', 'woman', 'child', 'people'],
    };

    let bestCategory = 'other';
    let bestConfidence = 0;

    for (const [category, keywords] of Object.entries(categories)) {
      for (const keyword of keywords) {
        const matchingLabel = result.labels.find(l =>
          l.name.toLowerCase().includes(keyword)
        );
        if (matchingLabel && matchingLabel.confidence > bestConfidence) {
          bestCategory = category;
          bestConfidence = matchingLabel.confidence;
        }
      }
    }

    return {
      success: true,
      category: bestCategory,
      confidence: bestConfidence,
      allLabels: result.labels.slice(0, 10),
      suggestedTags: result.labels.slice(0, 5).map(l => l.name),
    };
  }

  /**
   * Check for inappropriate content
   */
  async moderateContent(imageBuffer) {
    if (!this.available) {
      return { success: false, safe: true, message: 'Moderation not available' };
    }

    try {
      const command = new DetectModerationLabelsCommand({
        Image: { Bytes: imageBuffer },
        MinConfidence: 50,
      });

      const response = await this.client.send(command);

      const labels = response.ModerationLabels.map(label => ({
        name: label.Name,
        confidence: label.Confidence,
        parentName: label.ParentName,
      }));

      const unsafeLabels = labels.filter(l => l.confidence >= 70);

      return {
        success: true,
        safe: unsafeLabels.length === 0,
        moderationLabels: labels,
        unsafeLabels,
        shouldBlock: unsafeLabels.some(l =>
          ['Explicit Nudity', 'Violence', 'Drugs', 'Hate Symbols'].includes(l.name) ||
          ['Explicit Nudity', 'Violence', 'Drugs', 'Hate Symbols'].includes(l.parentName)
        ),
      };
    } catch (error) {
      logger.error('Rekognition moderateContent error:', error);
      return { success: false, safe: true, message: error.message };
    }
  }

  /**
   * Check for duplicate images (visual similarity)
   */
  async checkDuplicate(imageBuffer, existingPhotos) {
    if (!this.available || !existingPhotos || existingPhotos.length === 0) {
      return { isDuplicate: false, matches: [] };
    }

    const matches = [];

    for (const photo of existingPhotos) {
      if (!photo.s3_url) continue;

      try {
        // Fetch existing photo from S3
        const existingBuffer = await this.fetchFromS3(photo.s3_url);
        if (!existingBuffer) continue;

        // Compare faces if present
        const comparison = await this.compareFaces(imageBuffer, existingBuffer, 90);

        if (comparison.match && comparison.bestMatch?.similarity >= 95) {
          matches.push({
            photoId: photo.id,
            caseId: photo.case_id,
            similarity: comparison.bestMatch.similarity,
          });
        }
      } catch (error) {
        // Continue with other photos
      }
    }

    return {
      isDuplicate: matches.length > 0,
      matches: matches.sort((a, b) => b.similarity - a.similarity),
    };
  }

  async fetchFromS3(url) {
    // Simplified - in production, use S3 GetObjectCommand
    try {
      const https = require('https');
      return new Promise((resolve, reject) => {
        https.get(url, (res) => {
          const chunks = [];
          res.on('data', chunk => chunks.push(chunk));
          res.on('end', () => resolve(Buffer.concat(chunks)));
          res.on('error', reject);
        }).on('error', reject);
      });
    } catch {
      return null;
    }
  }
}

module.exports = new RekognitionService();
