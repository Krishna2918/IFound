/**
 * Smart Pricing Service
 *
 * Provides intelligent bounty pricing suggestions based on:
 * - Item category and estimated value
 * - Historical resolution rates
 * - Location demand
 * - Time sensitivity
 */

const { Case, Transaction } = require('../models');
const { Op } = require('sequelize');
const logger = require('../config/logger');

class SmartPricingService {
  constructor() {
    // Base bounty recommendations by category
    this.categoryBasePricing = {
      pet: { min: 50, suggested: 200, max: 1000, urgencyMultiplier: 1.5 },
      electronics: { min: 20, suggested: 100, max: 500, urgencyMultiplier: 1.2 },
      jewelry: { min: 50, suggested: 200, max: 2000, urgencyMultiplier: 1.1 },
      documents: { min: 25, suggested: 75, max: 300, urgencyMultiplier: 2.0 },
      keys: { min: 10, suggested: 30, max: 100, urgencyMultiplier: 1.5 },
      wallet: { min: 20, suggested: 50, max: 200, urgencyMultiplier: 1.3 },
      vehicle: { min: 100, suggested: 500, max: 5000, urgencyMultiplier: 1.0 },
      other: { min: 10, suggested: 50, max: 500, urgencyMultiplier: 1.0 },
    };

    // Resolution rate factors
    this.resolutionRates = {};
    this.lastCacheUpdate = null;
    this.cacheLifetimeMs = 3600000; // 1 hour
  }

  /**
   * Get bounty pricing suggestion
   */
  async getSuggestion({
    category,
    estimatedValue = null,
    location = null,
    isUrgent = false,
    lostDate = null,
  }) {
    try {
      // Get base pricing for category
      const basePricing = this.categoryBasePricing[category] || this.categoryBasePricing.other;

      // Start with suggested base
      let suggestion = basePricing.suggested;

      // Adjust for estimated item value
      if (estimatedValue) {
        const valueRatio = Math.min(estimatedValue * 0.15, basePricing.max);
        suggestion = Math.max(suggestion, valueRatio);
      }

      // Adjust for urgency
      if (isUrgent) {
        suggestion *= basePricing.urgencyMultiplier;
      }

      // Adjust for time since lost (older = lower chance, might need higher bounty)
      if (lostDate) {
        const daysSinceLost = Math.floor((Date.now() - new Date(lostDate)) / (1000 * 60 * 60 * 24));
        if (daysSinceLost > 7) {
          suggestion *= 1.1; // 10% increase
        }
        if (daysSinceLost > 30) {
          suggestion *= 1.2; // Additional 20% increase
        }
      }

      // Get historical data
      const historicalData = await this.getHistoricalData(category, location);

      // Adjust based on resolution success rates
      if (historicalData.avgSuccessfulBounty > 0) {
        suggestion = (suggestion + historicalData.avgSuccessfulBounty) / 2;
      }

      // Calculate tiers
      const minBounty = Math.max(basePricing.min, Math.floor(suggestion * 0.5));
      const maxBounty = Math.min(basePricing.max, Math.ceil(suggestion * 2));
      const suggestedBounty = Math.round(suggestion / 5) * 5; // Round to nearest $5

      return {
        success: true,
        pricing: {
          suggested: suggestedBounty,
          minimum: minBounty,
          maximum: maxBounty,
          tiers: {
            low: minBounty,
            medium: suggestedBounty,
            high: Math.round((suggestedBounty + maxBounty) / 2),
            premium: maxBounty,
          },
        },
        factors: {
          category,
          estimatedValue,
          isUrgent,
          daysSinceLost: lostDate ? Math.floor((Date.now() - new Date(lostDate)) / (1000 * 60 * 60 * 24)) : null,
          historicalResolutionRate: historicalData.resolutionRate,
          avgSuccessfulBounty: historicalData.avgSuccessfulBounty,
        },
        recommendations: this.generateRecommendations(suggestedBounty, historicalData),
      };
    } catch (error) {
      logger.error('Smart pricing error:', error);
      return {
        success: false,
        pricing: {
          suggested: 50,
          minimum: 10,
          maximum: 500,
        },
        error: error.message,
      };
    }
  }

  /**
   * Get historical resolution data
   */
  async getHistoricalData(category, location) {
    try {
      // Check cache
      const cacheKey = `${category}-${location?.city || 'global'}`;
      if (this.resolutionRates[cacheKey] && this.lastCacheUpdate &&
          Date.now() - this.lastCacheUpdate < this.cacheLifetimeMs) {
        return this.resolutionRates[cacheKey];
      }

      // Query resolved cases in this category
      const where = {
        status: { [Op.in]: ['resolved', 'archived'] },
        bounty_amount: { [Op.gt]: 0 },
      };

      if (category && category !== 'other') {
        where.item_category = category;
      }

      const resolvedCases = await Case.findAll({
        where,
        attributes: ['id', 'bounty_amount'],
        limit: 100,
        order: [['resolved_at', 'DESC']],
      });

      const totalCases = await Case.count({
        where: {
          item_category: category !== 'other' ? category : { [Op.ne]: null },
          createdAt: { [Op.gte]: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
        },
      });

      const resolvedCount = resolvedCases.length;
      const avgBounty = resolvedCount > 0
        ? resolvedCases.reduce((sum, c) => sum + parseFloat(c.bounty_amount), 0) / resolvedCount
        : 0;

      const data = {
        resolutionRate: totalCases > 0 ? (resolvedCount / totalCases * 100).toFixed(1) : 0,
        avgSuccessfulBounty: Math.round(avgBounty),
        sampleSize: resolvedCount,
      };

      // Cache the result
      this.resolutionRates[cacheKey] = data;
      this.lastCacheUpdate = Date.now();

      return data;
    } catch (error) {
      logger.error('Historical data fetch error:', error);
      return { resolutionRate: 0, avgSuccessfulBounty: 0, sampleSize: 0 };
    }
  }

  /**
   * Generate pricing recommendations
   */
  generateRecommendations(suggestedBounty, historicalData) {
    const recommendations = [];

    if (historicalData.resolutionRate >= 50) {
      recommendations.push({
        type: 'positive',
        message: `This category has a ${historicalData.resolutionRate}% resolution rate. Good chances of recovery!`,
      });
    }

    if (suggestedBounty < historicalData.avgSuccessfulBounty * 0.8) {
      recommendations.push({
        type: 'suggestion',
        message: `Consider increasing the bounty. Successful cases average $${historicalData.avgSuccessfulBounty}.`,
      });
    }

    if (suggestedBounty > historicalData.avgSuccessfulBounty * 1.5) {
      recommendations.push({
        type: 'info',
        message: 'Your bounty is higher than average, which may attract more finders.',
      });
    }

    recommendations.push({
      type: 'tip',
      message: 'Adding clear photos increases resolution chances by 40%.',
    });

    return recommendations;
  }

  /**
   * Estimate item value based on description
   */
  estimateItemValue(description, category) {
    const estimates = {
      pet: 500, // Emotional value, not monetary
      electronics: {
        'iphone': 800,
        'samsung': 600,
        'macbook': 1500,
        'laptop': 800,
        'airpods': 200,
        'ipad': 600,
        'apple watch': 400,
        'camera': 500,
        default: 300,
      },
      jewelry: {
        'diamond': 2000,
        'gold': 500,
        'silver': 200,
        'engagement': 3000,
        'wedding': 2000,
        'rolex': 5000,
        default: 300,
      },
      documents: 100, // Replacement cost + hassle
      keys: 50,
      wallet: 100,
      vehicle: 5000,
      other: 100,
    };

    const lowercaseDesc = (description || '').toLowerCase();

    if (typeof estimates[category] === 'object') {
      for (const [keyword, value] of Object.entries(estimates[category])) {
        if (lowercaseDesc.includes(keyword)) {
          return value;
        }
      }
      return estimates[category].default || 100;
    }

    return estimates[category] || 100;
  }

  /**
   * Get market demand score for a location
   */
  async getLocationDemand(latitude, longitude, radiusKm = 25) {
    try {
      // Count active cases in the area
      const activeCases = await Case.count({
        where: {
          status: 'active',
          latitude: { [Op.between]: [latitude - radiusKm / 111, latitude + radiusKm / 111] },
          longitude: { [Op.between]: [longitude - radiusKm / 111, longitude + radiusKm / 111] },
        },
      });

      // Demand score: lower active cases = higher demand for finders
      // More cases = more competition for attention
      if (activeCases < 5) return { score: 'high', activeCasesNearby: activeCases };
      if (activeCases < 20) return { score: 'medium', activeCasesNearby: activeCases };
      return { score: 'low', activeCasesNearby: activeCases };
    } catch (error) {
      return { score: 'unknown', activeCasesNearby: 0 };
    }
  }
}

module.exports = new SmartPricingService();
