const request = require('supertest');
const { createTestApp, createBasicAuthHeader } = require('../helpers/testServer');
const { connectTestDb, closeTestDb, seedCollection, clearCollection } = require('../helpers/testDb');
const { idGeneration } = require('../helpers/fixtures');

describe('ID Generation', () => {
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
    await clearCollection('lccnNACO');
    await clearCollection('marva001');
    app = createTestApp(mongoUri);
  });

  describe('LCCN NACO ID Generation', () => {
    describe('GET /lccnnaco', () => {
      it('should return ID and increment on call', async () => {
        const response = await request(app)
          .get('/lccnnaco')
          .expect(200);

        expect(response.body).toHaveProperty('id');
        expect(typeof response.body.id).toBe('number');
      });

      it('should increment ID on subsequent calls', async () => {
        const response1 = await request(app).get('/lccnnaco').expect(200);
        const response2 = await request(app).get('/lccnnaco').expect(200);

        expect(response2.body.id).toBe(response1.body.id + 1);
      });

      it('should handle concurrent requests correctly', async () => {
        const requests = Array(5).fill().map(() =>
          request(app).get('/lccnnaco')
        );

        const responses = await Promise.all(requests);
        const ids = responses.map(r => r.body.id);

        // All IDs should be unique
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(5);
      });

      it('should return sequential IDs', async () => {
        const ids = [];
        for (let i = 0; i < 5; i++) {
          const response = await request(app).get('/lccnnaco').expect(200);
          ids.push(response.body.id);
        }

        // Verify sequential increment
        for (let i = 1; i < ids.length; i++) {
          expect(ids[i]).toBe(ids[i - 1] + 1);
        }
      });
    });

    describe('GET /lccnnaco/set/:set', () => {
      it('should require basic authentication', async () => {
        const response = await request(app)
          .get('/lccnnaco/set/2025800001')
          .expect(401);

        expect(response.text).toContain('Authentication required');
      });

      it('should reject invalid credentials', async () => {
        const response = await request(app)
          .get('/lccnnaco/set/2025800001')
          .set('Authorization', createBasicAuthHeader('wrong', 'credentials'))
          .expect(401);

        expect(response.text).toContain('Authentication required');
      });

      it('should set ID to specified value with valid credentials', async () => {
        const password = process.env.DEPLOYPW.replace(/"/g, '');

        const setResponse = await request(app)
          .get('/lccnnaco/set/2025800001')
          .set('Authorization', createBasicAuthHeader(password, password))
          .expect(200);

        expect(setResponse.text).toContain('Set to:2025800001');

        // Verify the ID was set
        const getResponse = await request(app).get('/lccnnaco').expect(200);
        expect(getResponse.body.id).toBe(2025800002); // +1 because GET increments
      });

      it('should handle non-numeric values gracefully', async () => {
        const password = process.env.DEPLOYPW.replace(/"/g, '');

        const response = await request(app)
          .get('/lccnnaco/set/notanumber')
          .set('Authorization', createBasicAuthHeader(password, password))
          .expect(400);

        expect(response.text).toContain('Invalid');
      });
    });
  });

  describe('MARVA 001 ID Generation', () => {
    describe('GET /marva001', () => {
      it('should return ID with "in0" prefix', async () => {
        const response = await request(app)
          .get('/marva001')
          .expect(200);

        expect(response.body).toHaveProperty('marva001');
        expect(response.body.marva001).toMatch(/^in0\d+$/);
      });

      it('should increment ID on subsequent calls', async () => {
        const response1 = await request(app).get('/marva001').expect(200);
        const response2 = await request(app).get('/marva001').expect(200);

        // Extract numeric part after 'in0'
        const num1 = parseInt(response1.body.marva001.replace('in0', ''));
        const num2 = parseInt(response2.body.marva001.replace('in0', ''));

        expect(num2).toBe(num1 + 1);
      });

      it('should return sequential IDs', async () => {
        const ids = [];
        for (let i = 0; i < 5; i++) {
          const response = await request(app).get('/marva001').expect(200);
          ids.push(parseInt(response.body.marva001.replace('in0', '')));
        }

        // Verify sequential increment
        for (let i = 1; i < ids.length; i++) {
          expect(ids[i]).toBe(ids[i - 1] + 1);
        }
      });

      it('should handle concurrent requests', async () => {
        const requests = Array(5).fill().map(() =>
          request(app).get('/marva001')
        );

        const responses = await Promise.all(requests);
        const ids = responses.map(r => parseInt(r.body.marva001.replace('in0', '')));

        // All IDs should be unique
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(5);
      });
    });

    describe('GET /marva001/set/:set', () => {
      it('should require basic authentication', async () => {
        const response = await request(app)
          .get('/marva001/set/1270000001')
          .expect(401);

        expect(response.text).toContain('Authentication required');
      });

      it('should reject invalid credentials', async () => {
        const response = await request(app)
          .get('/marva001/set/1270000001')
          .set('Authorization', createBasicAuthHeader('wrong', 'credentials'))
          .expect(401);

        expect(response.text).toContain('Authentication required');
      });

      it('should set ID to specified value with valid credentials', async () => {
        const password = process.env.DEPLOYPW.replace(/"/g, '');

        const setResponse = await request(app)
          .get('/marva001/set/1270000001')
          .set('Authorization', createBasicAuthHeader(password, password))
          .expect(200);

        expect(setResponse.text).toContain('Set "marva001" to:1270000001');

        // Verify the ID was set
        const getResponse = await request(app).get('/marva001').expect(200);
        expect(getResponse.body.marva001).toBe('in01270000001');
      });
    });
  });
});
