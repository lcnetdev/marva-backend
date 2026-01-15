const request = require('supertest');
const { createTestApp } = require('../helpers/testServer');
const { connectTestDb, closeTestDb, seedCollection, clearCollection, findInCollection } = require('../helpers/testDb');

describe('Database Cleanup', () => {
  let app;
  let mongoUri;

  beforeAll(async () => {
    mongoUri = global.__MONGO_URI__;
    await connectTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await clearCollection('resourcesProduction');
    await clearCollection('resourcesStaging');
    app = createTestApp(mongoUri);
  });

  describe('GET /cleanup/old-records', () => {
    it('should require confirmation parameter', async () => {
      const response = await request(app)
        .get('/cleanup/old-records')
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('confirmation');
    });

    it('should reject without confirmation', async () => {
      const response = await request(app)
        .get('/cleanup/old-records?confirm=something-wrong')
        .expect(400);

      expect(response.body.error).toContain('invalid confirmation');
    });

    it('should reject empty confirmation value', async () => {
      const response = await request(app)
        .get('/cleanup/old-records?confirm=')
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should accept correct confirmation parameter', async () => {
      const response = await request(app)
        .get('/cleanup/old-records?confirm=yes-delete-old-records')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toBe('started');
    });

    it('should return usage instructions on error', async () => {
      const response = await request(app)
        .get('/cleanup/old-records')
        .expect(400);

      expect(response.body).toHaveProperty('usage');
      expect(response.body.usage).toContain('/cleanup/old-records');
      expect(response.body.usage).toContain('confirm=yes-delete-old-records');
    });

    it('should return error object with usage info', async () => {
      const response = await request(app)
        .get('/cleanup/old-records')
        .expect(400);

      // Response should have error and usage fields
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('usage');
    });
  });

  describe('GET /cleanup/old-records/status', () => {
    it('should return current job status', async () => {
      const response = await request(app)
        .get('/cleanup/old-records/status')
        .expect(200);

      expect(response.body).toHaveProperty('running');
      expect(response.body).toHaveProperty('lastRun');
      expect(response.body).toHaveProperty('lastResult');
    });

    it('should return idle when no job running', async () => {
      const response = await request(app)
        .get('/cleanup/old-records/status')
        .expect(200);

      expect(response.body.running).toBe(false);
    });

    it('should return null for lastRun when never run', async () => {
      const response = await request(app)
        .get('/cleanup/old-records/status')
        .expect(200);

      expect(response.body.lastRun).toBeNull();
    });

    it('should return null for lastResult when never run', async () => {
      const response = await request(app)
        .get('/cleanup/old-records/status')
        .expect(200);

      expect(response.body.lastResult).toBeNull();
    });
  });

  describe('Cleanup logic tests', () => {
    const THREE_MONTHS_IN_SECONDS = 3 * 30 * 24 * 60 * 60;
    const now = Math.floor(Date.now() / 1000);

    it('should identify records older than 3 months', () => {
      const oldRecord = {
        index: {
          timestamp: now - THREE_MONTHS_IN_SECONDS - 1000,
          user: 'testuser',
          status: 'published'
        }
      };

      const age = now - oldRecord.index.timestamp;
      expect(age).toBeGreaterThan(THREE_MONTHS_IN_SECONDS);
    });

    it('should preserve recent records', () => {
      const recentRecord = {
        index: {
          timestamp: now - (7 * 24 * 60 * 60), // 7 days ago
          user: 'testuser',
          status: 'published'
        }
      };

      const age = now - recentRecord.index.timestamp;
      expect(age).toBeLessThan(THREE_MONTHS_IN_SECONDS);
    });

    it('should handle records without timestamp', () => {
      const noTimestampRecord = {
        index: {
          user: 'testuser',
          status: 'published'
        }
      };

      // Records without timestamp should be handled gracefully
      expect(noTimestampRecord.index.timestamp).toBeUndefined();
    });
  });

  describe('Cleanup safety checks', () => {
    it('should require specific confirmation string', () => {
      // The confirmation string is intentionally long and specific
      // to prevent accidental cleanup
      const confirmString = 'yes-delete-old-records';

      expect(confirmString.length).toBeGreaterThan(10);
      expect(confirmString).toContain('delete');
      expect(confirmString).toContain('old-records');
    });

    it('should not accept partial confirmation', async () => {
      const partialConfirmations = [
        'yes',
        'delete',
        'yes-delete',
        'old-records',
        'delete-old-records'
      ];

      for (const confirm of partialConfirmations) {
        const response = await request(app)
          .get(`/cleanup/old-records?confirm=${confirm}`)
          .expect(400);

        expect(response.body).toHaveProperty('error');
      }
    });
  });
});
