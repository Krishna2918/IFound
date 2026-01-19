/**
 * Search Service - Elasticsearch Integration
 *
 * Provides full-text search, fuzzy matching, and geospatial search capabilities.
 * Falls back to PostgreSQL full-text search when Elasticsearch is unavailable.
 */

const { Client } = require('@elastic/elasticsearch');
const { Case, Photo, User } = require('../models');
const { Op } = require('sequelize');
const logger = require('../config/logger');

class SearchService {
  constructor() {
    this.client = null;
    this.indexName = 'ifound_cases';
    this.available = false;
    this.initialize();
  }

  async initialize() {
    try {
      if (process.env.ELASTICSEARCH_URL) {
        this.client = new Client({
          node: process.env.ELASTICSEARCH_URL,
          auth: process.env.ELASTICSEARCH_API_KEY ? {
            apiKey: process.env.ELASTICSEARCH_API_KEY,
          } : undefined,
        });

        // Test connection
        await this.client.ping();
        this.available = true;
        logger.info('Elasticsearch connected successfully');

        // Create index if doesn't exist
        await this.ensureIndex();
      } else {
        logger.warn('Elasticsearch URL not configured - using PostgreSQL fallback');
      }
    } catch (error) {
      logger.warn('Elasticsearch not available:', error.message);
      this.available = false;
    }
  }

  async ensureIndex() {
    try {
      const exists = await this.client.indices.exists({ index: this.indexName });

      if (!exists) {
        await this.client.indices.create({
          index: this.indexName,
          body: {
            settings: {
              number_of_shards: 1,
              number_of_replicas: 0,
              analysis: {
                analyzer: {
                  case_analyzer: {
                    type: 'custom',
                    tokenizer: 'standard',
                    filter: ['lowercase', 'asciifolding', 'porter_stem'],
                  },
                },
              },
            },
            mappings: {
              properties: {
                id: { type: 'keyword' },
                title: {
                  type: 'text',
                  analyzer: 'case_analyzer',
                  fields: { keyword: { type: 'keyword' } },
                },
                description: { type: 'text', analyzer: 'case_analyzer' },
                case_type: { type: 'keyword' },
                item_category: { type: 'keyword' },
                status: { type: 'keyword' },
                bounty_amount: { type: 'float' },
                location: { type: 'geo_point' },
                location_description: { type: 'text' },
                created_at: { type: 'date' },
                poster_id: { type: 'keyword' },
                tags: { type: 'keyword' },
                photo_urls: { type: 'keyword' },
                priority: { type: 'keyword' },
                view_count: { type: 'integer' },
              },
            },
          },
        });
        logger.info('Elasticsearch index created:', this.indexName);
      }
    } catch (error) {
      logger.error('Failed to create Elasticsearch index:', error);
    }
  }

  /**
   * Index a case document
   */
  async indexCase(caseData) {
    if (!this.available) return;

    try {
      const doc = {
        id: caseData.id,
        title: caseData.title,
        description: caseData.description,
        case_type: caseData.case_type,
        item_category: caseData.item_category,
        status: caseData.status,
        bounty_amount: caseData.bounty_amount,
        location: caseData.latitude && caseData.longitude ? {
          lat: caseData.latitude,
          lon: caseData.longitude,
        } : null,
        location_description: caseData.location_description,
        created_at: caseData.createdAt,
        poster_id: caseData.poster_id,
        tags: caseData.tags || [],
        priority: caseData.priority,
        view_count: caseData.view_count || 0,
      };

      await this.client.index({
        index: this.indexName,
        id: caseData.id,
        body: doc,
        refresh: true,
      });

      logger.debug('Indexed case:', caseData.id);
    } catch (error) {
      logger.error('Failed to index case:', error);
    }
  }

  /**
   * Remove a case from the index
   */
  async removeCase(caseId) {
    if (!this.available) return;

    try {
      await this.client.delete({
        index: this.indexName,
        id: caseId,
        refresh: true,
      });
    } catch (error) {
      if (error.meta?.statusCode !== 404) {
        logger.error('Failed to remove case from index:', error);
      }
    }
  }

  /**
   * Full-text search with filters
   */
  async search({
    query,
    caseType,
    category,
    status = 'active',
    minBounty,
    maxBounty,
    latitude,
    longitude,
    radiusKm = 50,
    page = 1,
    limit = 20,
    sortBy = 'relevance',
  }) {
    // Use Elasticsearch if available
    if (this.available) {
      return this.elasticSearch({
        query, caseType, category, status, minBounty, maxBounty,
        latitude, longitude, radiusKm, page, limit, sortBy,
      });
    }

    // Fallback to PostgreSQL
    return this.postgresSearch({
      query, caseType, category, status, minBounty, maxBounty,
      latitude, longitude, radiusKm, page, limit, sortBy,
    });
  }

  async elasticSearch({
    query, caseType, category, status, minBounty, maxBounty,
    latitude, longitude, radiusKm, page, limit, sortBy,
  }) {
    try {
      const must = [];
      const filter = [];

      // Full-text query
      if (query) {
        must.push({
          multi_match: {
            query,
            fields: ['title^3', 'description^2', 'location_description', 'tags'],
            fuzziness: 'AUTO',
            operator: 'or',
          },
        });
      }

      // Filters
      if (status) filter.push({ term: { status } });
      if (caseType) filter.push({ term: { case_type: caseType } });
      if (category) filter.push({ term: { item_category: category } });

      if (minBounty || maxBounty) {
        filter.push({
          range: {
            bounty_amount: {
              ...(minBounty && { gte: minBounty }),
              ...(maxBounty && { lte: maxBounty }),
            },
          },
        });
      }

      // Geolocation filter
      if (latitude && longitude) {
        filter.push({
          geo_distance: {
            distance: `${radiusKm}km`,
            location: { lat: latitude, lon: longitude },
          },
        });
      }

      // Build sort
      const sort = [];
      if (sortBy === 'bounty') {
        sort.push({ bounty_amount: 'desc' });
      } else if (sortBy === 'date') {
        sort.push({ created_at: 'desc' });
      } else if (sortBy === 'distance' && latitude && longitude) {
        sort.push({
          _geo_distance: {
            location: { lat: latitude, lon: longitude },
            order: 'asc',
            unit: 'km',
          },
        });
      } else if (query) {
        sort.push({ _score: 'desc' });
      }
      sort.push({ created_at: 'desc' });

      const response = await this.client.search({
        index: this.indexName,
        body: {
          from: (page - 1) * limit,
          size: limit,
          query: {
            bool: {
              must: must.length > 0 ? must : [{ match_all: {} }],
              filter,
            },
          },
          sort,
          highlight: {
            fields: {
              title: {},
              description: { fragment_size: 150 },
            },
          },
        },
      });

      const hits = response.hits.hits;
      const total = response.hits.total.value;

      // Fetch full case data from database
      const caseIds = hits.map(h => h._source.id);
      const cases = await Case.findAll({
        where: { id: caseIds },
        include: [
          { model: Photo, as: 'photos', limit: 1 },
          { model: User, as: 'poster', attributes: ['id', 'first_name', 'last_name'] },
        ],
      });

      // Merge with ES results (preserve order and add highlights)
      const caseMap = new Map(cases.map(c => [c.id, c]));
      const results = hits.map(hit => {
        const caseData = caseMap.get(hit._source.id);
        return {
          ...caseData?.toJSON(),
          _score: hit._score,
          _highlights: hit.highlight,
          _distance: hit.sort?.find(s => typeof s === 'number'),
        };
      }).filter(Boolean);

      return {
        success: true,
        data: {
          cases: results,
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
          searchEngine: 'elasticsearch',
        },
      };
    } catch (error) {
      logger.error('Elasticsearch search failed:', error);
      // Fallback to PostgreSQL
      return this.postgresSearch({
        query, caseType, category, status, minBounty, maxBounty,
        latitude, longitude, radiusKm, page, limit, sortBy,
      });
    }
  }

  async postgresSearch({
    query, caseType, category, status, minBounty, maxBounty,
    latitude, longitude, radiusKm, page, limit, sortBy,
  }) {
    try {
      const where = {};
      const order = [];

      // Status filter
      if (status) where.status = status;
      if (caseType) where.case_type = caseType;
      if (category) where.item_category = category;

      // Bounty range
      if (minBounty || maxBounty) {
        where.bounty_amount = {};
        if (minBounty) where.bounty_amount[Op.gte] = minBounty;
        if (maxBounty) where.bounty_amount[Op.lte] = maxBounty;
      }

      // Full-text search using ILIKE
      if (query) {
        const searchTerms = query.split(' ').filter(Boolean);
        where[Op.or] = searchTerms.map(term => ({
          [Op.or]: [
            { title: { [Op.iLike]: `%${term}%` } },
            { description: { [Op.iLike]: `%${term}%` } },
            { location_description: { [Op.iLike]: `%${term}%` } },
          ],
        }));
      }

      // Sorting
      if (sortBy === 'bounty') {
        order.push(['bounty_amount', 'DESC']);
      } else if (sortBy === 'date') {
        order.push(['createdAt', 'DESC']);
      } else {
        order.push(['createdAt', 'DESC']);
      }

      const offset = (page - 1) * limit;

      const { count, rows } = await Case.findAndCountAll({
        where,
        include: [
          { model: Photo, as: 'photos', limit: 1 },
          { model: User, as: 'poster', attributes: ['id', 'first_name', 'last_name'] },
        ],
        order,
        limit,
        offset,
      });

      // If geolocation provided, filter by distance (simplified)
      let filteredRows = rows;
      if (latitude && longitude) {
        filteredRows = rows.filter(c => {
          if (!c.latitude || !c.longitude) return true;
          const dist = this.calculateDistance(latitude, longitude, c.latitude, c.longitude);
          c.dataValues._distance = dist;
          return dist <= radiusKm;
        });

        if (sortBy === 'distance') {
          filteredRows.sort((a, b) => (a._distance || 999) - (b._distance || 999));
        }
      }

      return {
        success: true,
        data: {
          cases: filteredRows,
          total: count,
          page,
          limit,
          pages: Math.ceil(count / limit),
          searchEngine: 'postgresql',
        },
      };
    } catch (error) {
      logger.error('PostgreSQL search failed:', error);
      throw error;
    }
  }

  /**
   * Calculate distance between two points (Haversine formula)
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  deg2rad(deg) {
    return deg * (Math.PI / 180);
  }

  /**
   * Get search suggestions (autocomplete)
   */
  async getSuggestions(prefix, limit = 5) {
    if (!this.available || !prefix || prefix.length < 2) {
      return [];
    }

    try {
      const response = await this.client.search({
        index: this.indexName,
        body: {
          size: 0,
          query: {
            bool: {
              must: [
                { match: { status: 'active' } },
                {
                  multi_match: {
                    query: prefix,
                    fields: ['title', 'item_category'],
                    type: 'phrase_prefix',
                  },
                },
              ],
            },
          },
          aggs: {
            suggestions: {
              terms: {
                field: 'title.keyword',
                size: limit,
              },
            },
          },
        },
      });

      return response.aggregations.suggestions.buckets.map(b => b.key);
    } catch (error) {
      logger.error('Suggestions failed:', error);
      return [];
    }
  }

  /**
   * Sync all cases to Elasticsearch
   */
  async syncAllCases() {
    if (!this.available) {
      logger.warn('Cannot sync - Elasticsearch not available');
      return { synced: 0 };
    }

    try {
      const cases = await Case.findAll({
        where: { status: { [Op.ne]: 'deleted' } },
      });

      let synced = 0;
      for (const caseData of cases) {
        await this.indexCase(caseData);
        synced++;
      }

      logger.info(`Synced ${synced} cases to Elasticsearch`);
      return { synced };
    } catch (error) {
      logger.error('Sync failed:', error);
      throw error;
    }
  }
}

module.exports = new SearchService();
