const request = require('supertest');
const { createTestApp } = require('../helpers/testServer');
const { connectTestDb, closeTestDb, seedCollection, clearCollection, findInCollection } = require('../helpers/testDb');
const { rdfPayloads, resources } = require('../helpers/fixtures');

describe('Publishing Flow E2E', () => {
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

  describe('Complete publishing workflow simulation', () => {
    it('should track record from creation to published state', async () => {
      // Step 1: Check initial state - no records for user
      const initialRecords = await request(app)
        .get('/myrecords/staging/testuser')
        .expect(200);

      expect(initialRecords.body).toEqual({});

      // Step 2: Simulate record creation (add to staging cache)
      app._testState.recsStageByEid['new-record-001'] = {
        eid: 'new-record-001',
        user: 'testuser',
        status: 'draft',
        title: 'New Test Record',
        timestamp: Math.floor(Date.now() / 1000)
      };
      app._testState.recsStageByUser['testuser'] = {
        'new-record-001': app._testState.recsStageByEid['new-record-001']
      };

      // Step 3: Verify record appears in user records
      const stagingRecords = await request(app)
        .get('/myrecords/staging/testuser')
        .expect(200);

      expect(stagingRecords.body).toHaveProperty('new-record-001');
      expect(stagingRecords.body['new-record-001'].status).toBe('draft');

      // Step 4: Verify record appears in all staging records
      const allStaging = await request(app)
        .get('/allrecords/staging')
        .expect(200);

      expect(allStaging.body).toHaveProperty('new-record-001');
    });

    it('should support staging to production promotion flow', async () => {
      // Start with a staging record
      app._testState.recsStageByEid['promoted-record'] = {
        eid: 'promoted-record',
        user: 'testuser',
        status: 'draft',
        title: 'To Be Promoted'
      };
      app._testState.recsStageByUser['testuser'] = {
        'promoted-record': app._testState.recsStageByEid['promoted-record']
      };

      // Verify in staging
      const inStaging = await request(app)
        .get('/myrecords/staging/testuser')
        .expect(200);

      expect(inStaging.body).toHaveProperty('promoted-record');

      // Simulate promotion to production
      app._testState.recsProdByEid['promoted-record'] = {
        ...app._testState.recsStageByEid['promoted-record'],
        status: 'published'
      };
      app._testState.recsProdByUser['testuser'] = {
        'promoted-record': app._testState.recsProdByEid['promoted-record']
      };

      // Verify in production
      const inProduction = await request(app)
        .get('/myrecords/production/testuser')
        .expect(200);

      expect(inProduction.body).toHaveProperty('promoted-record');
      expect(inProduction.body['promoted-record'].status).toBe('published');
    });

    it('should log publish operations', async () => {
      // Initial log should be empty
      const initialLogs = await request(app)
        .get('/logs/posts')
        .expect(200);

      expect(initialLogs.body).toHaveLength(0);

      // Simulate adding a log entry
      app._testState.postLog.push({
        postingDate: new Date(),
        postingEnv: 'staging',
        postingStatus: 'success',
        postingName: 'test-record'
      });

      // Verify log contains the entry
      const updatedLogs = await request(app)
        .get('/logs/posts')
        .expect(200);

      expect(updatedLogs.body).toHaveLength(1);
      expect(updatedLogs.body[0].postingEnv).toBe('staging');
    });
  });

  describe('Record lifecycle', () => {
    it('should handle record creation -> modification -> deletion', async () => {
      const eid = 'lifecycle-test-001';

      // Create
      app._testState.recsProdByEid[eid] = {
        eid,
        user: 'testuser',
        status: 'published',
        title: 'Lifecycle Test'
      };
      app._testState.recsProdByUser['testuser'] = {
        [eid]: app._testState.recsProdByEid[eid]
      };

      // Verify creation
      let records = await request(app)
        .get('/allrecords/production')
        .expect(200);

      expect(records.body[eid].status).toBe('published');

      // Modify (simulate)
      app._testState.recsProdByEid[eid].title = 'Modified Title';

      records = await request(app)
        .get('/allrecords/production')
        .expect(200);

      expect(records.body[eid].title).toBe('Modified Title');

      // Delete
      await request(app)
        .post(`/delete/production/testuser/${eid}`)
        .expect(200);

      records = await request(app)
        .get('/allrecords/production')
        .expect(200);

      expect(records.body[eid].status).toBe('deleted');
    });

    it('should maintain record in allrecords after deletion (soft delete)', async () => {
      const eid = 'soft-delete-test';

      app._testState.recsProdByEid[eid] = {
        eid,
        user: 'testuser',
        status: 'published'
      };
      app._testState.recsProdByUser['testuser'] = {
        [eid]: app._testState.recsProdByEid[eid]
      };

      // Delete
      await request(app)
        .post(`/delete/production/testuser/${eid}`)
        .expect(200);

      // Record should still exist but be marked as deleted
      const records = await request(app)
        .get('/allrecords/production')
        .expect(200);

      expect(records.body).toHaveProperty(eid);
      expect(records.body[eid].status).toBe('deleted');
    });
  });

  describe('Multi-user scenarios', () => {
    it('should isolate records by user', async () => {
      // Create records for multiple users
      app._testState.recsProdByEid['user1-record'] = {
        eid: 'user1-record',
        user: 'user1',
        status: 'published'
      };
      app._testState.recsProdByEid['user2-record'] = {
        eid: 'user2-record',
        user: 'user2',
        status: 'published'
      };

      app._testState.recsProdByUser['user1'] = {
        'user1-record': app._testState.recsProdByEid['user1-record']
      };
      app._testState.recsProdByUser['user2'] = {
        'user2-record': app._testState.recsProdByEid['user2-record']
      };

      // User1's view
      const user1Records = await request(app)
        .get('/myrecords/production/user1')
        .expect(200);

      expect(user1Records.body).toHaveProperty('user1-record');
      expect(user1Records.body).not.toHaveProperty('user2-record');

      // User2's view
      const user2Records = await request(app)
        .get('/myrecords/production/user2')
        .expect(200);

      expect(user2Records.body).toHaveProperty('user2-record');
      expect(user2Records.body).not.toHaveProperty('user1-record');

      // All records view should show both
      const allRecords = await request(app)
        .get('/allrecords/production')
        .expect(200);

      expect(allRecords.body).toHaveProperty('user1-record');
      expect(allRecords.body).toHaveProperty('user2-record');
    });
  });

  describe('RDF payload validation', () => {
    it('should have valid structure for bibframe work', () => {
      const bibRdf = rdfPayloads.validBibRdf;

      expect(bibRdf).toContain('xmlns:rdf');
      expect(bibRdf).toContain('xmlns:bf');
      expect(bibRdf).toContain('bf:Work');
    });

    it('should have valid structure for bibframe hub', () => {
      const hubRdf = rdfPayloads.validHubRdf;

      expect(hubRdf).toContain('xmlns:rdf');
      expect(hubRdf).toContain('bf:Hub');
    });
  });
});
