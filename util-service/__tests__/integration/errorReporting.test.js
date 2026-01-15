const request = require('supertest');
const { createTestApp } = require('../helpers/testServer');
const { connectTestDb, closeTestDb, seedCollection, clearCollection, findInCollection } = require('../helpers/testDb');
const { errorReports } = require('../helpers/fixtures');

describe('Error Reporting', () => {
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
    await clearCollection('errorReports');
    app = createTestApp(mongoUri);
  });

  describe('POST /error/report', () => {
    it('should save error report to database', async () => {
      const report = {
        eId: 'error-test-001',
        desc: 'Test error description',
        contact: 'test@example.com',
        activeProfile: {
          resourceType: 'bf:Work',
          title: 'Test Title'
        }
      };

      const response = await request(app)
        .post('/error/report')
        .send(report)
        .expect(200);

      expect(response.body.result).toBe(true);

      // Verify saved
      const saved = await findInCollection('errorReports', { eId: 'error-test-001' });
      expect(saved).toHaveLength(1);
      expect(saved[0].desc).toBe('Test error description');
    });

    it('should generate unique error ID (MongoDB _id)', async () => {
      const report = { ...errorReports.validErrorReport };

      await request(app)
        .post('/error/report')
        .send(report)
        .expect(200);

      const saved = await findInCollection('errorReports', {});
      expect(saved[0]._id).toBeDefined();
      expect(saved[0]._id.toString()).toMatch(/^[a-f0-9]{24}$/); // MongoDB ObjectId format
    });

    it('should store description, contact, activeProfile', async () => {
      const report = {
        eId: 'error-001',
        desc: 'Detailed error description',
        contact: 'user@test.com',
        activeProfile: {
          type: 'bf:Instance',
          data: { field: 'value' }
        }
      };

      await request(app)
        .post('/error/report')
        .send(report)
        .expect(200);

      const saved = await findInCollection('errorReports', { eId: 'error-001' });
      expect(saved[0].desc).toBe('Detailed error description');
      expect(saved[0].contact).toBe('user@test.com');
      expect(saved[0].activeProfile).toBeDefined();
    });

    it('should stringify activeProfile object', async () => {
      const report = {
        eId: 'error-stringify',
        desc: 'Test',
        contact: 'test@test.com',
        activeProfile: {
          nested: { data: 'value' }
        }
      };

      await request(app)
        .post('/error/report')
        .send(report)
        .expect(200);

      const saved = await findInCollection('errorReports', { eId: 'error-stringify' });
      expect(typeof saved[0].activeProfile).toBe('string');

      const parsed = JSON.parse(saved[0].activeProfile);
      expect(parsed.nested.data).toBe('value');
    });

    it('should return success result', async () => {
      const response = await request(app)
        .post('/error/report')
        .send({ eId: 'test', desc: 'test', contact: 'test' })
        .expect(200);

      expect(response.body.result).toBe(true);
      expect(response.body.error).toBeNull();
    });
  });

  describe('GET /error/report', () => {
    it('should return all error reports', async () => {
      const reports = [
        { eId: 'err-1', desc: 'Error 1', contact: 'a@b.com', activeProfile: '{}' },
        { eId: 'err-2', desc: 'Error 2', contact: 'c@d.com', activeProfile: '{}' }
      ];
      await seedCollection('errorReports', reports);

      const response = await request(app)
        .get('/error/report')
        .expect(200);

      expect(response.body).toHaveLength(2);
    });

    it('should return reports in reverse order (newest first)', async () => {
      const reports = [
        { eId: 'err-first', desc: 'First', contact: 'a@b.com', activeProfile: '{}' },
        { eId: 'err-second', desc: 'Second', contact: 'c@d.com', activeProfile: '{}' }
      ];
      await seedCollection('errorReports', reports);

      const response = await request(app)
        .get('/error/report')
        .expect(200);

      // Reversed order - second inserted should be first
      expect(response.body[0].eId).toBe('err-second');
      expect(response.body[1].eId).toBe('err-first');
    });

    it('should include error ID in response', async () => {
      await seedCollection('errorReports', {
        eId: 'test-error',
        desc: 'Description',
        contact: 'email@test.com',
        activeProfile: '{}'
      });

      const response = await request(app)
        .get('/error/report')
        .expect(200);

      expect(response.body[0]).toHaveProperty('id');
      expect(response.body[0]).toHaveProperty('eId');
      expect(response.body[0]).toHaveProperty('desc');
      expect(response.body[0]).toHaveProperty('contact');
    });

    it('should return empty array when no reports exist', async () => {
      const response = await request(app)
        .get('/error/report')
        .expect(200);

      expect(response.body).toEqual([]);
    });
  });

  describe('GET /error/:errorId', () => {
    it('should return specific error report', async () => {
      const profileData = { resourceType: 'bf:Work', title: 'Test' };
      await seedCollection('errorReports', {
        eId: 'specific-error',
        desc: 'Specific description',
        contact: 'contact@email.com',
        activeProfile: JSON.stringify(profileData)
      });

      // Get the error ID from the list
      const listResponse = await request(app)
        .get('/error/report')
        .expect(200);

      const errorId = listResponse.body[0].id;

      const response = await request(app)
        .get(`/error/${errorId}`)
        .expect(200);

      expect(response.body.resourceType).toBe('bf:Work');
      expect(response.body.title).toBe('Test');
    });

    it('should return false for non-existent error', async () => {
      const response = await request(app)
        .get('/error/507f1f77bcf86cd799439011') // Valid but non-existent ObjectId
        .expect(200);

      expect(response.body).toBe(false);
    });

    it('should return false for invalid error ID format', async () => {
      const response = await request(app)
        .get('/error/invalid-id')
        .expect(200);

      expect(response.body).toBe(false);
    });

    it('should parse and return the activeProfile', async () => {
      const complexProfile = {
        resourceType: 'bf:Instance',
        data: {
          work: { title: 'Work Title' },
          instance: { isbn: '123456789' }
        },
        metadata: {
          created: '2024-01-15',
          user: 'testuser'
        }
      };

      await seedCollection('errorReports', {
        eId: 'complex-profile',
        desc: 'Complex profile error',
        contact: 'test@test.com',
        activeProfile: JSON.stringify(complexProfile)
      });

      const listResponse = await request(app)
        .get('/error/report')
        .expect(200);

      const errorId = listResponse.body[0].id;

      const response = await request(app)
        .get(`/error/${errorId}`)
        .expect(200);

      expect(response.body.resourceType).toBe('bf:Instance');
      expect(response.body.data.work.title).toBe('Work Title');
      expect(response.body.metadata.user).toBe('testuser');
    });
  });

  describe('Error report round-trip', () => {
    it('should preserve all data through create and retrieve cycle', async () => {
      const originalReport = {
        eId: 'roundtrip-test',
        desc: 'Full round-trip test error',
        contact: 'roundtrip@test.com',
        activeProfile: {
          resourceType: 'bf:Work',
          workData: {
            title: 'Test Title',
            contributors: ['Author 1', 'Author 2']
          },
          instanceData: {
            isbn: '9780123456789',
            publisher: 'Test Publisher'
          }
        }
      };

      // Create
      await request(app)
        .post('/error/report')
        .send(originalReport)
        .expect(200);

      // List
      const listResponse = await request(app)
        .get('/error/report')
        .expect(200);

      expect(listResponse.body[0].eId).toBe('roundtrip-test');
      expect(listResponse.body[0].desc).toBe('Full round-trip test error');

      // Get specific
      const errorId = listResponse.body[0].id;
      const detailResponse = await request(app)
        .get(`/error/${errorId}`)
        .expect(200);

      expect(detailResponse.body.resourceType).toBe('bf:Work');
      expect(detailResponse.body.workData.title).toBe('Test Title');
      expect(detailResponse.body.workData.contributors).toHaveLength(2);
    });
  });
});
