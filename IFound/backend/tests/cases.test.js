const request = require('supertest');
const app = require('../src/server');
const { User, Case, sequelize } = require('../src/models');

describe('Cases API', () => {
  let token;
  let userId;

  beforeAll(async () => {
    await sequelize.sync({ force: true });

    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'case@example.com',
        password: 'password123',
        first_name: 'Case',
        last_name: 'User',
      });

    token = response.body.data.token;
    userId = response.body.data.user.id;
  });

  afterAll(async () => {
    await sequelize.close();
  });

  describe('POST /api/v1/cases', () => {
    it('should create a new case', async () => {
      const response = await request(app)
        .post('/api/v1/cases')
        .set('Authorization', `Bearer ${token}`)
        .send({
          case_type: 'lost_item',
          title: 'Lost iPhone 15',
          description: 'Lost my iPhone at Central Park',
          bounty_amount: 100,
          item_category: 'electronics',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.case).toHaveProperty('id');
      expect(response.body.data.case.bounty_amount).toBe('100.00');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/v1/cases')
        .send({
          case_type: 'lost_item',
          title: 'Test Case',
          description: 'Test',
          bounty_amount: 50,
        });

      expect(response.status).toBe(401);
    });

    it('should validate minimum bounty', async () => {
      const response = await request(app)
        .post('/api/v1/cases')
        .set('Authorization', `Bearer ${token}`)
        .send({
          case_type: 'lost_item',
          title: 'Test Case',
          description: 'Test',
          bounty_amount: 5, // Below minimum
        });

      expect(response.status).toBe(400);
    });

    it('should require all required fields', async () => {
      const response = await request(app)
        .post('/api/v1/cases')
        .set('Authorization', `Bearer ${token}`)
        .send({
          case_type: 'lost_item',
          title: 'Test Case',
          // Missing description and bounty
        });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/v1/cases', () => {
    beforeEach(async () => {
      await Case.create({
        poster_id: userId,
        case_type: 'lost_item',
        title: 'Test Case 1',
        description: 'Test Description',
        bounty_amount: 100,
        status: 'active',
      });
    });

    it('should get all active cases', async () => {
      const response = await request(app).get('/api/v1/cases');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.cases)).toBe(true);
      expect(response.body.data.cases.length).toBeGreaterThan(0);
    });

    it('should filter by case_type', async () => {
      const response = await request(app)
        .get('/api/v1/cases')
        .query({ case_type: 'lost_item' });

      expect(response.status).toBe(200);
      expect(response.body.data.cases.every(c => c.case_type === 'lost_item')).toBe(true);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/v1/cases')
        .query({ page: 1, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.data.pagination).toHaveProperty('page', 1);
      expect(response.body.data.pagination).toHaveProperty('limit', 10);
    });
  });

  describe('GET /api/v1/cases/:id', () => {
    let caseId;

    beforeEach(async () => {
      const caseData = await Case.create({
        poster_id: userId,
        case_type: 'lost_item',
        title: 'Detail Test Case',
        description: 'Test Description',
        bounty_amount: 100,
        status: 'active',
      });
      caseId = caseData.id;
    });

    it('should get case by ID', async () => {
      const response = await request(app).get(`/api/v1/cases/${caseId}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.case.id).toBe(caseId);
    });

    it('should return 404 for non-existent case', async () => {
      const response = await request(app).get('/api/v1/cases/99999999-9999-9999-9999-999999999999');

      expect(response.status).toBe(404);
    });
  });

  describe('PUT /api/v1/cases/:id', () => {
    let caseId;

    beforeEach(async () => {
      const caseData = await Case.create({
        poster_id: userId,
        case_type: 'lost_item',
        title: 'Update Test Case',
        description: 'Test Description',
        bounty_amount: 100,
        status: 'active',
      });
      caseId = caseData.id;
    });

    it('should update own case', async () => {
      const response = await request(app)
        .put(`/api/v1/cases/${caseId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Updated Title',
          bounty_amount: 150,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.case.title).toBe('Updated Title');
    });

    it('should not update others\' cases', async () => {
      const otherUser = await User.create({
        email: 'other@example.com',
        password_hash: 'password123',
        first_name: 'Other',
        last_name: 'User',
      });

      const otherCase = await Case.create({
        poster_id: otherUser.id,
        case_type: 'lost_item',
        title: 'Other Case',
        description: 'Test',
        bounty_amount: 100,
      });

      const response = await request(app)
        .put(`/api/v1/cases/${otherCase.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Hacked',
        });

      expect(response.status).toBe(403);
    });
  });

  describe('DELETE /api/v1/cases/:id', () => {
    let caseId;

    beforeEach(async () => {
      const caseData = await Case.create({
        poster_id: userId,
        case_type: 'lost_item',
        title: 'Delete Test Case',
        description: 'Test Description',
        bounty_amount: 100,
        status: 'active',
      });
      caseId = caseData.id;
    });

    it('should delete own case', async () => {
      const response = await request(app)
        .delete(`/api/v1/cases/${caseId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should not delete already resolved cases', async () => {
      await Case.update({ status: 'resolved' }, { where: { id: caseId } });

      const response = await request(app)
        .delete(`/api/v1/cases/${caseId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
    });
  });
});
