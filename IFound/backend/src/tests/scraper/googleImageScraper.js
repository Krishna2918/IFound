/**
 * Image Scraper
 *
 * Downloads images from multiple sources:
 * 1. Unsplash API (primary - free, reliable)
 * 2. Pexels API (fallback)
 * 3. Lorem Picsum (fallback for random images)
 */

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const { SCRAPER_CONFIG, PATHS } = require('../config');

// Free API endpoints (no key required for basic usage)
const UNSPLASH_API = 'https://api.unsplash.com/search/photos';
const UNSPLASH_ACCESS_KEY = 'demo'; // Use 'demo' for limited access or set env var

// Fallback: Lorem Picsum for random images
const PICSUM_API = 'https://picsum.photos';

class ImageScraper {
  constructor() {
    this.downloadedCount = 0;
    this.failedCount = 0;
    this.useUnsplash = true;
  }

  /**
   * Sleep for specified milliseconds
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Search images using Unsplash API
   */
  async searchUnsplash(query, count = 30) {
    try {
      const accessKey = process.env.UNSPLASH_ACCESS_KEY || UNSPLASH_ACCESS_KEY;

      const response = await axios.get(UNSPLASH_API, {
        params: {
          query,
          per_page: Math.min(count, 30),
          orientation: 'squarish',
        },
        headers: {
          Authorization: `Client-ID ${accessKey}`,
        },
        timeout: 15000,
      });

      const urls = response.data.results.map(img => ({
        url: img.urls.regular || img.urls.small,
        id: img.id,
      }));

      console.log(`[Scraper] Unsplash found ${urls.length} images for "${query}"`);
      return urls;
    } catch (error) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        console.warn('[Scraper] Unsplash API limit reached, switching to fallback');
        this.useUnsplash = false;
      }
      return [];
    }
  }

  /**
   * Get random images from Lorem Picsum (fallback)
   */
  async getRandomImages(count = 30) {
    const urls = [];

    for (let i = 0; i < count; i++) {
      // Each request gets a different random image
      const seed = uuidv4().substring(0, 8);
      urls.push({
        url: `${PICSUM_API}/seed/${seed}/600/600`,
        id: seed,
      });
    }

    console.log(`[Scraper] Generated ${urls.length} random image URLs`);
    return urls;
  }

  /**
   * Search for images - tries Unsplash first, then fallback
   */
  async searchImages(query, count = 30) {
    console.log(`[Scraper] Searching: "${query}"`);

    // Try Unsplash first
    if (this.useUnsplash) {
      const unsplashResults = await this.searchUnsplash(query, count);
      if (unsplashResults.length > 0) {
        return unsplashResults;
      }
    }

    // Fallback to random images
    console.log(`[Scraper] Using fallback random images for "${query}"`);
    return this.getRandomImages(count);
  }

  /**
   * Download an image to disk
   */
  async downloadImage(imageInfo, outputPath) {
    try {
      const url = typeof imageInfo === 'string' ? imageInfo : imageInfo.url;

      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 20000,
        headers: {
          'User-Agent': SCRAPER_CONFIG.userAgents[0],
          'Accept': 'image/*',
        },
      });

      const contentType = response.headers['content-type'];
      if (!contentType || !contentType.startsWith('image/')) {
        throw new Error('Not an image');
      }

      // Validate and process with Sharp
      const image = sharp(response.data);
      const metadata = await image.metadata();

      // Check dimensions
      if (metadata.width < 100 || metadata.height < 100) {
        throw new Error(`Image too small: ${metadata.width}x${metadata.height}`);
      }

      // Resize to consistent size and convert to JPEG
      await image
        .resize(600, 600, {
          fit: 'cover',
          withoutEnlargement: false,
        })
        .jpeg({ quality: 85 })
        .toFile(outputPath);

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Scrape images for a category
   */
  async scrapeCategory(category, queries, targetCount) {
    const outputDir = path.join(PATHS.raw, category);
    await fs.mkdir(outputDir, { recursive: true });

    // Check existing images
    let existing = [];
    try {
      existing = await fs.readdir(outputDir);
    } catch {}

    let downloaded = existing.filter(f => f.endsWith('.jpg')).length;
    console.log(`[Scraper] Category ${category}: ${downloaded} existing images, target ${targetCount}`);

    if (downloaded >= targetCount) {
      console.log(`[Scraper] Category ${category} already has enough images`);
      return downloaded;
    }

    const remaining = targetCount - downloaded;
    const imagesPerQuery = Math.ceil(remaining / queries.length * 1.5); // Oversample

    for (const query of queries) {
      if (downloaded >= targetCount) break;

      const imageInfos = await this.searchImages(query, imagesPerQuery);

      for (const imageInfo of imageInfos) {
        if (downloaded >= targetCount) break;

        const filename = `${category}_${uuidv4()}.jpg`;
        const outputPath = path.join(outputDir, filename);

        const success = await this.downloadImage(imageInfo, outputPath);
        if (success) {
          downloaded++;
          this.downloadedCount++;
          if (downloaded % 10 === 0) {
            console.log(`[Scraper] ${category}: ${downloaded}/${targetCount}`);
          }
        } else {
          this.failedCount++;
        }

        // Small delay to avoid rate limiting
        await this.sleep(200);
      }

      // Rate limiting between queries
      await this.sleep(SCRAPER_CONFIG.delayBetweenRequests);
    }

    console.log(`[Scraper] Category ${category} complete: ${downloaded} images`);
    return downloaded;
  }

  /**
   * Scrape all categories
   */
  async scrapeAll(searchQueries, distribution) {
    console.log('[Scraper] Starting full scrape...');
    const results = {};

    for (const category of Object.keys(distribution)) {
      const queries = searchQueries[category] || [];
      const target = Math.ceil(distribution[category] * 1.2); // 20% oversample

      results[category] = await this.scrapeCategory(category, queries, target);

      // Delay between categories
      await this.sleep(2000);
    }

    console.log('\n[Scraper] === Scrape Complete ===');
    console.log(`Total downloaded: ${this.downloadedCount}`);
    console.log(`Total failed: ${this.failedCount}`);
    console.log('Results by category:', results);

    return results;
  }

  /**
   * Get statistics about scraped images
   */
  async getStats() {
    const stats = {};

    for (const category of ['pet', 'jewelry', 'electronics', 'documents', 'vehicle', 'other']) {
      const dir = path.join(PATHS.raw, category);
      try {
        const files = await fs.readdir(dir);
        stats[category] = files.filter(f => f.endsWith('.jpg')).length;
      } catch {
        stats[category] = 0;
      }
    }

    return stats;
  }

  // Compatibility methods (no-op for this simpler scraper)
  async init() {
    console.log('[Scraper] Initializing...');
  }

  async close() {
    console.log('[Scraper] Done.');
  }
}

module.exports = ImageScraper;
