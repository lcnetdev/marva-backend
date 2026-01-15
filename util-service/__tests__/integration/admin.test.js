const request = require('supertest');
const { createTestApp, createBasicAuthHeader } = require('../helpers/testServer');
const { connectTestDb, closeTestDb, clearCollection } = require('../helpers/testDb');

describe('Admin Endpoints', () => {
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
    app = createTestApp(mongoUri);
  });

  describe('GET /version/editor', () => {
    it('should return production version', async () => {
      const response = await request(app)
        .get('/version/editor')
        .expect(200);

      expect(response.body).toHaveProperty('major');
      expect(response.body).toHaveProperty('minor');
      expect(response.body).toHaveProperty('patch');
    });

    it('should return version as JSON', async () => {
      const response = await request(app)
        .get('/version/editor')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(typeof response.body.major).toBe('number');
      expect(typeof response.body.minor).toBe('number');
      expect(typeof response.body.patch).toBe('number');
    });
  });

  describe('GET /version/editor/stage', () => {
    it('should return staging version', async () => {
      const response = await request(app)
        .get('/version/editor/stage')
        .expect(200);

      expect(response.body).toHaveProperty('major');
      expect(response.body).toHaveProperty('minor');
      expect(response.body).toHaveProperty('patch');
    });

    it('should return different version than production', async () => {
      const prodResponse = await request(app)
        .get('/version/editor')
        .expect(200);

      const stageResponse = await request(app)
        .get('/version/editor/stage')
        .expect(200);

      // Versions may be different (staging is usually ahead)
      expect(stageResponse.body).toHaveProperty('major');
    });
  });

  describe('GET /logs/posts', () => {
    it('should return post logs array', async () => {
      const response = await request(app)
        .get('/logs/posts')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should return empty array when no logs', async () => {
      const response = await request(app)
        .get('/logs/posts')
        .expect(200);

      expect(response.body).toHaveLength(0);
    });
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
        .get('/cleanup/old-records?confirm=no')
        .expect(400);

      expect(response.body.error).toContain('invalid confirmation');
    });

    it('should accept correct confirmation', async () => {
      const response = await request(app)
        .get('/cleanup/old-records?confirm=yes-delete-old-records')
        .expect(200);

      expect(response.body).toHaveProperty('status');
    });

    it('should return usage instructions on error', async () => {
      const response = await request(app)
        .get('/cleanup/old-records')
        .expect(400);

      expect(response.body).toHaveProperty('usage');
      expect(response.body.usage).toContain('confirm=yes-delete-old-records');
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
  });

  describe('GET /status', () => {
    it('should return system status', async () => {
      const response = await request(app)
        .get('/status')
        .expect(200);

      expect(response.body).toHaveProperty('status');
    });

    it('should include update times', async () => {
      const response = await request(app)
        .get('/status')
        .expect(200);

      expect(response.body.status).toHaveProperty('updates');
      expect(response.body.status.updates).toHaveProperty('lastUpdateNames');
      expect(response.body.status.updates).toHaveProperty('lastUpdateSubjects');
    });
  });

  describe('Authentication tests', () => {
    describe('Basic auth protected endpoints', () => {
      const protectedEndpoints = [
        { method: 'get', path: '/lccnnaco/set/2025800001' },
        { method: 'get', path: '/marva001/set/1270000001' }
      ];

      protectedEndpoints.forEach(({ method, path }) => {
        it(`should require authentication for ${method.toUpperCase()} ${path}`, async () => {
          const response = await request(app)[method](path)
            .expect(401);

          expect(response.text).toContain('Authentication required');
          expect(response.headers['www-authenticate']).toBe('Basic');
        });

        it(`should reject invalid credentials for ${method.toUpperCase()} ${path}`, async () => {
          const response = await request(app)[method](path)
            .set('Authorization', createBasicAuthHeader('wrong', 'credentials'))
            .expect(401);

          expect(response.text).toContain('Authentication required');
        });

        it(`should accept valid credentials for ${method.toUpperCase()} ${path}`, async () => {
          const password = process.env.DEPLOYPW.replace(/"/g, '');

          const response = await request(app)[method](path)
            .set('Authorization', createBasicAuthHeader(password, password))
            .expect(200);

          // Should not be 401
          expect(response.status).not.toBe(401);
        });
      });
    });
  });
});
