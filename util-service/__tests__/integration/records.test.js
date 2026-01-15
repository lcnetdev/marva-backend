const request = require('supertest');
const { createTestApp } = require('../helpers/testServer');
const { connectTestDb, closeTestDb, seedCollection, clearCollection, findInCollection } = require('../helpers/testDb');
const { resources } = require('../helpers/fixtures');

describe('Record Management', () => {
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

    // Create app with pre-populated state
    app = createTestApp(mongoUri);

    // Set up in-memory state for records tests
    app._testState.recsProdByEid = {
      'eid-001': { eid: 'eid-001', user: 'testuser', status: 'published', title: 'Test 1' },
      'eid-002': { eid: 'eid-002', user: 'testuser', status: 'published', title: 'Test 2' },
      'eid-003': { eid: 'eid-003', user: 'otheruser', status: 'published', title: 'Test 3' }
    };
    app._testState.recsProdByUser = {
      'testuser': {
        'eid-001': { eid: 'eid-001', user: 'testuser', status: 'published', title: 'Test 1' },
        'eid-002': { eid: 'eid-002', user: 'testuser', status: 'published', title: 'Test 2' }
      },
      'otheruser': {
        'eid-003': { eid: 'eid-003', user: 'otheruser', status: 'published', title: 'Test 3' }
      }
    };
    app._testState.recsStageByEid = {
      'stage-eid-001': { eid: 'stage-eid-001', user: 'testuser', status: 'draft', title: 'Staging Test 1' }
    };
    app._testState.recsStageByUser = {
      'testuser': {
        'stage-eid-001': { eid: 'stage-eid-001', user: 'testuser', status: 'draft', title: 'Staging Test 1' }
      }
    };
  });

  describe('GET /myrecords/production/:user', () => {
    it('should return user records from production', async () => {
      const response = await request(app)
        .get('/myrecords/production/testuser')
        .expect(200);

      expect(response.body).toHaveProperty('eid-001');
      expect(response.body).toHaveProperty('eid-002');
      expect(response.body['eid-001'].title).toBe('Test 1');
    });

    it('should return empty object for user with no records', async () => {
      const response = await request(app)
        .get('/myrecords/production/nonexistentuser')
        .expect(200);

      expect(response.body).toEqual({});
    });

    it('should not return other users records', async () => {
      const response = await request(app)
        .get('/myrecords/production/testuser')
        .expect(200);

      expect(response.body).not.toHaveProperty('eid-003');
    });

    it('should include record metadata', async () => {
      const response = await request(app)
        .get('/myrecords/production/testuser')
        .expect(200);

      const record = response.body['eid-001'];
      expect(record).toHaveProperty('eid');
      expect(record).toHaveProperty('user');
      expect(record).toHaveProperty('status');
      expect(record).toHaveProperty('title');
    });
  });

  describe('GET /myrecords/staging/:user', () => {
    it('should return user records from staging', async () => {
      const response = await request(app)
        .get('/myrecords/staging/testuser')
        .expect(200);

      expect(response.body).toHaveProperty('stage-eid-001');
      expect(response.body['stage-eid-001'].status).toBe('draft');
    });

    it('should use separate cache from production', async () => {
      const stagingResponse = await request(app)
        .get('/myrecords/staging/testuser')
        .expect(200);

      const productionResponse = await request(app)
        .get('/myrecords/production/testuser')
        .expect(200);

      // Staging should have different records than production
      expect(Object.keys(stagingResponse.body)).not.toEqual(
        Object.keys(productionResponse.body)
      );
    });

    it('should return empty object for user with no staging records', async () => {
      const response = await request(app)
        .get('/myrecords/staging/otheruser')
        .expect(200);

      expect(response.body).toEqual({});
    });
  });

  describe('GET /allrecords/production', () => {
    it('should return all production records', async () => {
      const response = await request(app)
        .get('/allrecords/production')
        .expect(200);

      expect(response.body).toHaveProperty('eid-001');
      expect(response.body).toHaveProperty('eid-002');
      expect(response.body).toHaveProperty('eid-003');
    });

    it('should return from in-memory cache', async () => {
      // Modify in-memory cache
      app._testState.recsProdByEid['new-eid'] = {
        eid: 'new-eid',
        user: 'newuser',
        status: 'published'
      };

      const response = await request(app)
        .get('/allrecords/production')
        .expect(200);

      expect(response.body).toHaveProperty('new-eid');
    });
  });

  describe('GET /allrecords/staging', () => {
    it('should return all staging records', async () => {
      const response = await request(app)
        .get('/allrecords/staging')
        .expect(200);

      expect(response.body).toHaveProperty('stage-eid-001');
    });
  });

  describe('GET /allrecords/production/stats', () => {
    beforeEach(async () => {
      // Seed some production records for stats
      const records = [
        { index: { user: 'user1', status: 'published' } },
        { index: { user: 'user1', status: 'published' } },
        { index: { user: 'user2', status: 'published' } },
        { index: { user: 'user2', status: 'deleted' } }
      ];
      await seedCollection('resourcesProduction', records);
    });

    it('should return record count statistics', async () => {
      const response = await request(app)
        .get('/allrecords/production/stats')
        .expect(200);

      expect(response.body).toHaveProperty('totalRecords');
      expect(response.body.totalRecords).toBe(4);
    });

    it('should include records with index count', async () => {
      const response = await request(app)
        .get('/allrecords/production/stats')
        .expect(200);

      expect(response.body).toHaveProperty('recordsWithIndex');
      expect(response.body.recordsWithIndex).toBe(4);
    });

    it('should include user counts', async () => {
      const response = await request(app)
        .get('/allrecords/production/stats')
        .expect(200);

      expect(response.body).toHaveProperty('users');
      expect(response.body.users.user1).toBe(2);
      expect(response.body.users.user2).toBe(2);
    });

    it('should include status counts', async () => {
      const response = await request(app)
        .get('/allrecords/production/stats')
        .expect(200);

      expect(response.body).toHaveProperty('statuses');
      expect(response.body.statuses.published).toBe(3);
      expect(response.body.statuses.deleted).toBe(1);
    });

    it('should handle empty collection', async () => {
      await clearCollection('resourcesProduction');

      const response = await request(app)
        .get('/allrecords/production/stats')
        .expect(200);

      expect(response.body.totalRecords).toBe(0);
      expect(response.body.recordsWithIndex).toBe(0);
    });
  });

  describe('POST /delete/:stage/:user/:eid', () => {
    it('should mark production record as deleted', async () => {
      const response = await request(app)
        .post('/delete/production/testuser/eid-001')
        .expect(200);

      expect(response.body.result).toBe(true);

      // Verify in-memory cache was updated
      expect(app._testState.recsProdByEid['eid-001'].status).toBe('deleted');
      expect(app._testState.recsProdByUser['testuser']['eid-001'].status).toBe('deleted');
    });

    it('should mark staging record as deleted', async () => {
      const response = await request(app)
        .post('/delete/staging/testuser/stage-eid-001')
        .expect(200);

      expect(response.body.result).toBe(true);

      // Verify in-memory cache was updated
      expect(app._testState.recsStageByEid['stage-eid-001'].status).toBe('deleted');
    });

    it('should not physically delete record', async () => {
      await request(app)
        .post('/delete/production/testuser/eid-001')
        .expect(200);

      // Record should still exist in cache, just marked as deleted
      expect(app._testState.recsProdByEid['eid-001']).toBeDefined();
    });

    it('should update in-memory cache', async () => {
      expect(app._testState.recsProdByEid['eid-001'].status).toBe('published');

      await request(app)
        .post('/delete/production/testuser/eid-001')
        .expect(200);

      expect(app._testState.recsProdByEid['eid-001'].status).toBe('deleted');
    });

    it('should handle non-existent record', async () => {
      const response = await request(app)
        .post('/delete/production/testuser/nonexistent-eid')
        .expect(200);

      expect(response.body.result).toBe(false);
    });

    it('should handle non-existent user', async () => {
      const response = await request(app)
        .post('/delete/production/nonexistentuser/eid-001')
        .expect(200);

      // Should still mark eid-level as deleted if eid exists
      expect(response.body.result).toBe(true);
    });
  });

  describe('GET /logs/posts', () => {
    it('should return post logs', async () => {
      const response = await request(app)
        .get('/logs/posts')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should return empty array when no posts', async () => {
      const response = await request(app)
        .get('/logs/posts')
        .expect(200);

      expect(response.body).toEqual([]);
    });
  });
});
