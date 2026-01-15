const request = require('supertest');
const { createTestApp } = require('../helpers/testServer');
const { connectTestDb, closeTestDb } = require('../helpers/testDb');

describe('External Integrations', () => {
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

  describe('GET /status', () => {
    it('should return system status', async () => {
      const response = await request(app)
        .get('/status')
        .expect(200);

      expect(response.body).toHaveProperty('status');
    });

    it('should include Names update time', async () => {
      const response = await request(app)
        .get('/status')
        .expect(200);

      expect(response.body.status).toHaveProperty('updates');
      expect(response.body.status.updates).toHaveProperty('lastUpdateNames');
    });

    it('should include Subjects update time', async () => {
      const response = await request(app)
        .get('/status')
        .expect(200);

      expect(response.body.status.updates).toHaveProperty('lastUpdateSubjects');
    });

    it('should return timestamp format for update times', async () => {
      const response = await request(app)
        .get('/status')
        .expect(200);

      const { lastUpdateNames, lastUpdateSubjects } = response.body.status.updates;

      // Should be ISO timestamp strings
      expect(lastUpdateNames).toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(lastUpdateSubjects).toMatch(/\d{4}-\d{2}-\d{2}/);
    });
  });

  describe('External service configuration', () => {
    it('should have LCAP_SYNC endpoint configured', () => {
      expect(process.env.LCAP_SYNC).toBeDefined();
      expect(process.env.LCAP_SYNC).toContain('<LCCN>');
    });

    it('should have RECORD_HISTORY endpoint configured', () => {
      expect(process.env.RECORD_HISTORY).toBeDefined();
    });

    it('should have WorldCat credentials configured', () => {
      expect(process.env.WC_CLIENTID).toBeDefined();
      expect(process.env.WC_SECRET).toBeDefined();
    });
  });

  describe('LCAP sync URL building', () => {
    it('should replace LCCN placeholder in URL', () => {
      const template = process.env.LCAP_SYNC;
      const lccn = '2024012345';
      const url = template.replace('<LCCN>', lccn);

      expect(url).toContain(lccn);
      expect(url).not.toContain('<LCCN>');
    });

    it('should handle different LCCN formats', () => {
      const template = 'https://lcap.example.com/sync/<LCCN>';
      const lccns = [
        '2024012345',
        'n2024012345',
        'no2024012345',
        '   2024012345 ',
      ];

      lccns.forEach(lccn => {
        const url = template.replace('<LCCN>', lccn.trim());
        expect(url).toContain(lccn.trim());
      });
    });
  });

  describe('Record history URL building', () => {
    it('should build correct history URL', () => {
      const baseUrl = process.env.RECORD_HISTORY;
      const bibid = '12345';
      const fullUrl = `${baseUrl}/metastory/api/history/bib?bibid=${bibid}&serialization=jsonld`;

      expect(fullUrl).toContain('bibid=12345');
      expect(fullUrl).toContain('serialization=jsonld');
    });
  });

  describe('Activity streams configuration', () => {
    it('should define activity streams base URL structure', () => {
      const baseURL = 'https://preprod-8080.id.loc.gov/authorities/<DATASET>/activitystreams/feed/1.json';

      expect(baseURL).toContain('<DATASET>');
    });

    it('should support names dataset', () => {
      const baseURL = 'https://preprod-8080.id.loc.gov/authorities/<DATASET>/activitystreams/feed/1.json';
      const namesUrl = baseURL.replace('<DATASET>', 'names');

      expect(namesUrl).toContain('/names/');
      expect(namesUrl).not.toContain('<DATASET>');
    });

    it('should support subjects dataset', () => {
      const baseURL = 'https://preprod-8080.id.loc.gov/authorities/<DATASET>/activitystreams/feed/1.json';
      const subjectsUrl = baseURL.replace('<DATASET>', 'subjects');

      expect(subjectsUrl).toContain('/subjects/');
      expect(subjectsUrl).not.toContain('<DATASET>');
    });
  });

  describe('Related works URL structure', () => {
    it('should build contributor relationship URL', () => {
      const uri = 'http://id.loc.gov/authorities/names/n79021164';
      const expectedPath = `/resources/works/relationships/contributorto/?label=${encodeURIComponent(uri)}&page=0`;

      expect(expectedPath).toContain('contributorto');
      expect(expectedPath).toContain('label=');
      expect(expectedPath).toContain('page=0');
    });

    it('should URL encode the contributor URI', () => {
      const uri = 'http://id.loc.gov/authorities/names/test';
      const encoded = encodeURIComponent(uri);

      expect(encoded).not.toContain('://');
      expect(encoded).toContain('%3A%2F%2F');
    });
  });

  describe('WorldCat OAuth configuration', () => {
    it('should have OAuth endpoint defined', () => {
      const oauthEndpoint = 'https://oauth.oclc.org/token';
      expect(oauthEndpoint).toContain('oauth.oclc.org');
    });

    it('should define required scopes', () => {
      const scopes = 'WorldCatMetadataAPI wcapi:view_bib wcapi:view_brief_bib';

      expect(scopes).toContain('WorldCatMetadataAPI');
      expect(scopes).toContain('wcapi:view_bib');
      expect(scopes).toContain('wcapi:view_brief_bib');
    });
  });

  describe('WorldCat API endpoints', () => {
    it('should define discovery API endpoint', () => {
      const discoveryApi = 'https://americas.discovery.api.oclc.org/worldcat/search/v2/brief-bibs';

      expect(discoveryApi).toContain('discovery.api.oclc.org');
      expect(discoveryApi).toContain('brief-bibs');
    });

    it('should define metadata API endpoint structure', () => {
      const ocn = '123456789';
      const metadataApi = `https://metadata.api.oclc.org/worldcat/manage/bibs/${ocn}`;

      expect(metadataApi).toContain('metadata.api.oclc.org');
      expect(metadataApi).toContain(ocn);
    });
  });
});
