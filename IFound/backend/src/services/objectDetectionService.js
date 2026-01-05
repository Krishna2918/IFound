const sharp = require('sharp');
const Jimp = require('jimp');
const fs = require('fs');

// Try to load TensorFlow (may fail on some systems)
let tf, cocoSsd;
let AI_AVAILABLE = false;

try {
  tf = require('@tensorflow/tfjs-node');
  cocoSsd = require('@tensorflow-models/coco-ssd');
  AI_AVAILABLE = true;
  console.log('Object Detection AI: TensorFlow loaded successfully');
} catch (error) {
  console.warn('Object Detection AI: TensorFlow not available -', error.message);
  console.warn('Object detection features will be disabled.');
}

class ObjectDetectionService {
  constructor() {
    this.model = null;
    this.initialized = false;
    this.available = AI_AVAILABLE;
  }

  /**
   * Initialize COCO-SSD model for object detection
   */
  async initialize() {
    if (this.initialized) return;
    if (!this.available) {
      console.log('Object Detection AI: Skipping initialization (TensorFlow not available)');
      return;
    }

    try {
      console.log('Initializing Object Detection AI...');

      // Load COCO-SSD model (detects 90+ common objects)
      this.model = await cocoSsd.load({
        base: 'mobilenet_v2', // Faster, works well on CPU
      });

      this.initialized = true;
      console.log('Object Detection AI initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Object Detection:', error.message);
    }
  }

  /**
   * Detect objects in an image
   */
  async detectObjects(imagePath) {
    // Return empty result if AI not available
    if (!this.available) {
      return {
        success: false,
        message: 'Object detection not available (TensorFlow not installed)',
        objects: [],
      };
    }

    try {
      if (!this.initialized) {
        await this.initialize();
      }

      if (!this.model) {
        throw new Error('Model not initialized');
      }

      // Load and prepare image
      const imageBuffer = fs.readFileSync(imagePath);
      const image = await Jimp.read(imageBuffer);

      // Convert to tensor
      const { width, height } = image.bitmap;
      const pixels = new Uint8Array(width * height * 3);

      let pixelIndex = 0;
      image.scan(0, 0, width, height, (x, y, idx) => {
        pixels[pixelIndex++] = image.bitmap.data[idx + 0]; // R
        pixels[pixelIndex++] = image.bitmap.data[idx + 1]; // G
        pixels[pixelIndex++] = image.bitmap.data[idx + 2]; // B
      });

      const tensor = tf.tensor3d(pixels, [height, width, 3]);

      // Detect objects
      const predictions = await this.model.detect(tensor);

      // Clean up
      tensor.dispose();

      // Format results
      const objects = predictions.map(pred => ({
        class: pred.class,
        confidence: Math.round(pred.score * 100),
        box: {
          x: Math.round(pred.bbox[0]),
          y: Math.round(pred.bbox[1]),
          width: Math.round(pred.bbox[2]),
          height: Math.round(pred.bbox[3]),
        },
      }));

      return {
        success: true,
        objects,
        count: objects.length,
      };
    } catch (error) {
      console.error('Object detection error:', error);
      return {
        success: false,
        message: error.message,
        objects: [],
      };
    }
  }

  /**
   * Extract dominant colors from image
   */
  async extractColors(imagePath, colorCount = 5) {
    try {
      const image = await Jimp.read(imagePath);

      // Resize for faster processing
      image.resize(100, 100);

      const colorMap = {};
      const pixels = [];

      image.scan(0, 0, image.bitmap.width, image.bitmap.height, (x, y, idx) => {
        const r = image.bitmap.data[idx + 0];
        const g = image.bitmap.data[idx + 1];
        const b = image.bitmap.data[idx + 2];

        // Skip very dark and very light pixels
        const brightness = (r + g + b) / 3;
        if (brightness < 20 || brightness > 235) return;

        const colorKey = `${Math.round(r / 30) * 30},${Math.round(g / 30) * 30},${Math.round(b / 30) * 30}`;
        colorMap[colorKey] = (colorMap[colorKey] || 0) + 1;
        pixels.push({ r, g, b });
      });

      // Get most common colors
      const sortedColors = Object.entries(colorMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, colorCount)
        .map(([color, count]) => {
          const [r, g, b] = color.split(',').map(Number);
          return {
            rgb: { r, g, b },
            hex: this.rgbToHex(r, g, b),
            name: this.getColorName(r, g, b),
            percentage: Math.round((count / pixels.length) * 100),
          };
        });

      return {
        success: true,
        colors: sortedColors,
      };
    } catch (error) {
      console.error('Color extraction error:', error);
      return {
        success: false,
        colors: [],
      };
    }
  }

  /**
   * Convert RGB to Hex
   */
  rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => {
      const hex = x.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
  }

  /**
   * Get human-readable color name
   */
  getColorName(r, g, b) {
    const hsl = this.rgbToHsl(r, g, b);

    // Grayscale
    if (hsl.s < 10) {
      if (hsl.l < 20) return 'Black';
      if (hsl.l < 40) return 'Dark Gray';
      if (hsl.l < 60) return 'Gray';
      if (hsl.l < 80) return 'Light Gray';
      return 'White';
    }

    // Colors
    const h = hsl.h;
    if (h < 15 || h >= 345) return 'Red';
    if (h < 45) return 'Orange';
    if (h < 75) return 'Yellow';
    if (h < 165) return 'Green';
    if (h < 255) return 'Blue';
    if (h < 285) return 'Purple';
    if (h < 345) return 'Pink';

    return 'Unknown';
  }

  /**
   * Convert RGB to HSL
   */
  rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }

    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100),
    };
  }

  /**
   * Process a photo for object detection and metadata
   */
  async processPhoto(photoPath) {
    try {
      // Run object detection and color extraction in parallel
      const [objectResult, colorResult] = await Promise.all([
        this.detectObjects(photoPath),
        this.extractColors(photoPath),
      ]);

      // Extract primary object (highest confidence)
      const primaryObject = objectResult.objects.length > 0
        ? objectResult.objects.reduce((best, obj) =>
          obj.confidence > best.confidence ? obj : best
        )
        : null;

      return {
        success: true,
        objects: objectResult.objects,
        objectsCount: objectResult.objects.length,
        primaryObject: primaryObject ? primaryObject.class : null,
        colors: colorResult.colors,
        dominantColor: colorResult.colors[0]?.name || null,
        metadata: {
          detectedObjects: objectResult.objects.map(o => o.class),
          colorPalette: colorResult.colors.map(c => c.hex),
        },
      };
    } catch (error) {
      console.error('Photo processing error:', error);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  /**
   * Search for similar objects
   */
  async searchByObject(queryPhotoPath, allCasePhotos, threshold = 50) {
    try {
      // Process query photo
      const queryResult = await this.processPhoto(queryPhotoPath);

      if (!queryResult.success || !queryResult.primaryObject) {
        return {
          success: false,
          message: 'Could not detect objects in query image',
          matches: [],
        };
      }

      const queryObjects = queryResult.objects.map(o => o.class);
      const queryColors = queryResult.colors.map(c => c.name);

      // Find similar cases
      const matches = [];

      for (const photo of allCasePhotos) {
        if (!photo.ai_metadata || !photo.ai_metadata.detectedObjects) continue;

        const photoObjects = photo.ai_metadata.detectedObjects || [];

        // Calculate object similarity
        const commonObjects = queryObjects.filter(obj =>
          photoObjects.includes(obj)
        );

        const objectSimilarity = photoObjects.length > 0
          ? (commonObjects.length / Math.max(queryObjects.length, photoObjects.length)) * 100
          : 0;

        if (objectSimilarity >= threshold) {
          matches.push({
            photo_id: photo.id,
            case_id: photo.case_id,
            similarity: Math.round(objectSimilarity),
            matchingObjects: commonObjects,
            allObjects: photoObjects,
          });
        }
      }

      // Sort by similarity
      matches.sort((a, b) => b.similarity - a.similarity);

      return {
        success: true,
        matches,
        queryObjects: queryResult.objects,
      };
    } catch (error) {
      console.error('Object search error:', error);
      return {
        success: false,
        message: error.message,
        matches: [],
      };
    }
  }

  /**
   * Categorize item based on detected objects
   */
  categorizeItem(objects) {
    if (!objects || objects.length === 0) return 'other';

    const categories = {
      pet: ['dog', 'cat', 'bird', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe'],
      electronics: ['cell phone', 'laptop', 'keyboard', 'mouse', 'remote', 'tv', 'clock'],
      jewelry: ['tie', 'handbag', 'suitcase', 'backpack'],
      vehicle: ['car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat', 'bicycle'],
      documents: ['book', 'scissors'],
    };

    const detectedClasses = objects.map(o => o.class.toLowerCase());

    for (const [category, keywords] of Object.entries(categories)) {
      for (const keyword of keywords) {
        if (detectedClasses.some(cls => cls.includes(keyword))) {
          return category;
        }
      }
    }

    return 'other';
  }
}

// Singleton instance
const objectDetectionService = new ObjectDetectionService();

// Initialize on module load
objectDetectionService.initialize().catch(console.error);

module.exports = objectDetectionService;
