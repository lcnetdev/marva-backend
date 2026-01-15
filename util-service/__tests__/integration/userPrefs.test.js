const request = require('supertest');
const { createTestApp } = require('../helpers/testServer');
const { connectTestDb, closeTestDb, seedCollection, clearCollection, findInCollection } = require('../helpers/testDb');
const { userPrefs } = require('../helpers/fixtures');

describe('User Preferences', () => {
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
    await clearCollection('userPrefs');
    app = createTestApp(mongoUri);
  });

  describe('POST /prefs/:user', () => {
    it('should save user preferences', async () => {
      const prefs = {
        prefs: {
          styleDefault: { color: '#000' },
          panelDisplay: { properties: true }
        }
      };

      const response = await request(app)
        .post('/prefs/testuser')
        .send(prefs)
        .expect(200);

      expect(response.body.msg).toMatch(/Success|updated/i);

      // Verify saved
      const saved = await findInCollection('userPrefs', { user: 'testuser' });
      expect(saved).toHaveLength(1);
    });

    it('should create new document for new user', async () => {
      const prefs = { theme: 'dark' };

      await request(app)
        .post('/prefs/newuser')
        .send(prefs)
        .expect(200);

      const saved = await findInCollection('userPrefs', { user: 'newuser' });
      expect(saved).toHaveLength(1);
      expect(saved[0].user).toBe('newuser');
    });

    it('should update existing document', async () => {
      // Create initial prefs
      await request(app)
        .post('/prefs/testuser')
        .send({ version: 1 })
        .expect(200);

      // Update prefs
      await request(app)
        .post('/prefs/testuser')
        .send({ version: 2 })
        .expect(200);

      // Verify only one document exists with updated data
      const saved = await findInCollection('userPrefs', { user: 'testuser' });
      expect(saved).toHaveLength(1);

      const prefs = JSON.parse(saved[0].prefs);
      expect(prefs.version).toBe(2);
    });

    it('should store preferences as JSON string', async () => {
      const prefs = {
        prefs: { setting: 'value' },
        nested: { deep: { data: true } }
      };

      await request(app)
        .post('/prefs/testuser')
        .send(prefs)
        .expect(200);

      const saved = await findInCollection('userPrefs', { user: 'testuser' });
      expect(typeof saved[0].prefs).toBe('string');

      const parsed = JSON.parse(saved[0].prefs);
      expect(parsed.prefs.setting).toBe('value');
      expect(parsed.nested.deep.data).toBe(true);
    });

    it('should return saved preferences message', async () => {
      const response = await request(app)
        .post('/prefs/testuser')
        .send({ test: true })
        .expect(200);

      expect(response.body).toHaveProperty('msg');
      expect(response.body.msg).toMatch(/Success|updated/i);
    });

    it('should handle complex preference structures', async () => {
      const complexPrefs = {
        prefs: {
          styleDefault: {
            '--c-edit-main-splitpane-properties-background-color': { value: '#2a2a2a', type: 'color' },
            '--n-edit-main-splitpane-properties-width': { value: 5, type: 'number', range: [5, 100] }
          },
          panelDisplay: {
            properties: true,
            dualEdit: false,
            opac: true
          }
        },
        scriptShifterOptions: {},
        diacriticUse: ['a', 'b', 'c'],
        marvaComponentLibrary: { component1: { data: 'test' } }
      };

      await request(app)
        .post('/prefs/testuser')
        .send(complexPrefs)
        .expect(200);

      const saved = await findInCollection('userPrefs', { user: 'testuser' });
      const parsed = JSON.parse(saved[0].prefs);

      expect(parsed.prefs.styleDefault).toBeDefined();
      expect(parsed.diacriticUse).toHaveLength(3);
      expect(parsed.marvaComponentLibrary.component1.data).toBe('test');
    });
  });

  describe('GET /prefs/:user', () => {
    it('should return user preferences', async () => {
      const prefs = { theme: 'dark', fontSize: 14 };
      await seedCollection('userPrefs', {
        user: 'testuser',
        prefs: JSON.stringify(prefs)
      });

      const response = await request(app)
        .get('/prefs/testuser')
        .expect(200);

      expect(response.body.result).toEqual(prefs);
    });

    it('should parse stored JSON string', async () => {
      const prefs = {
        prefs: { nested: { deeply: { data: 'value' } } }
      };
      await seedCollection('userPrefs', {
        user: 'testuser',
        prefs: JSON.stringify(prefs)
      });

      const response = await request(app)
        .get('/prefs/testuser')
        .expect(200);

      expect(response.body.result.prefs.nested.deeply.data).toBe('value');
    });

    it('should return empty object for new user', async () => {
      const response = await request(app)
        .get('/prefs/nonexistentuser')
        .expect(200);

      expect(response.body.result).toEqual({});
    });

    it('should handle malformed stored data', async () => {
      await seedCollection('userPrefs', {
        user: 'baduser',
        prefs: 'this is not valid json {'
      });

      const response = await request(app)
        .get('/prefs/baduser')
        .expect(500);

      expect(response.body.result).toContain('Failed');
    });

    it('should return preferences with all field types', async () => {
      const prefs = {
        stringVal: 'test',
        numberVal: 42,
        boolVal: true,
        arrayVal: [1, 2, 3],
        objectVal: { key: 'value' },
        nullVal: null
      };

      await seedCollection('userPrefs', {
        user: 'testuser',
        prefs: JSON.stringify(prefs)
      });

      const response = await request(app)
        .get('/prefs/testuser')
        .expect(200);

      expect(response.body.result.stringVal).toBe('test');
      expect(response.body.result.numberVal).toBe(42);
      expect(response.body.result.boolVal).toBe(true);
      expect(response.body.result.arrayVal).toEqual([1, 2, 3]);
      expect(response.body.result.objectVal).toEqual({ key: 'value' });
      expect(response.body.result.nullVal).toBe(null);
    });
  });

  describe('Preference round-trip', () => {
    it('should preserve preferences through save and load cycle', async () => {
      const originalPrefs = {
        prefs: {
          styleDefault: {
            '--c-edit-main-background-color': { value: '#1a1a1a', type: 'color' }
          },
          panelDisplay: {
            properties: true,
            dualEdit: false
          }
        },
        scriptShifterOptions: { enabled: true },
        diacriticUse: ['accent1', 'accent2'],
        marvaComponentLibrary: {}
      };

      // Save
      await request(app)
        .post('/prefs/roundtrip-user')
        .send(originalPrefs)
        .expect(200);

      // Load
      const response = await request(app)
        .get('/prefs/roundtrip-user')
        .expect(200);

      expect(response.body.result).toEqual(originalPrefs);
    });

    it('should handle special characters in preferences', async () => {
      const prefs = {
        catInitials: '\u00e9\u00e8\u00ea', // French accents
        notes: 'Line1\nLine2\tTabbed',
        unicode: '\u4e2d\u6587' // Chinese characters
      };

      await request(app)
        .post('/prefs/unicode-user')
        .send(prefs)
        .expect(200);

      const response = await request(app)
        .get('/prefs/unicode-user')
        .expect(200);

      expect(response.body.result.catInitials).toBe(prefs.catInitials);
      expect(response.body.result.notes).toBe(prefs.notes);
      expect(response.body.result.unicode).toBe(prefs.unicode);
    });
  });
});
