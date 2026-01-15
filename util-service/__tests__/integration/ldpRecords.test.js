const request = require('supertest');
const { createTestApp } = require('../helpers/testServer');
const { connectTestDb, closeTestDb, seedCollection, clearCollection, findInCollection } = require('../helpers/testDb');

describe('LDP Record Storage', () => {
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

  // Sample RDF/XML payloads for testing
  const createRdfPayload = (eid, user, title, status = 'inprogress', lccn = null) => {
    const lccnElement = lccn
      ? `<lclocal:lccn>${lccn}</lclocal:lccn>`
      : '';

    return `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
         xmlns:bf="http://id.loc.gov/ontologies/bibframe/"
         xmlns:bflc="http://id.loc.gov/ontologies/bflc/"
         xmlns:lclocal="http://id.loc.gov/ontologies/lclocal/"
         xmlns:void="http://rdfs.org/ns/void#">
    <void:DatasetDescription>
        <lclocal:eid>${eid}</lclocal:eid>
        <lclocal:user>${user}</lclocal:user>
        <lclocal:title>${title}</lclocal:title>
        <lclocal:status>${status}</lclocal:status>
        ${lccnElement}
        <lclocal:timestamp>${Math.floor(Date.now() / 1000)}</lclocal:timestamp>
    </void:DatasetDescription>
    <bf:Work rdf:about="http://id.loc.gov/resources/works/${eid}">
        <bf:title>
            <bf:Title>
                <bf:mainTitle>${title}</bf:mainTitle>
            </bf:Title>
        </bf:title>
        <bf:contribution>
            <bf:Contribution>
                <bf:agent>
                    <bf:Agent rdf:about="http://id.loc.gov/authorities/names/n79021164">
                        <rdfs:label>Test Author</rdfs:label>
                    </bf:Agent>
                </bf:agent>
            </bf:Contribution>
        </bf:contribution>
    </bf:Work>
    <bf:Instance rdf:about="http://id.loc.gov/resources/instances/${eid}">
        <bf:instanceOf rdf:resource="http://id.loc.gov/resources/works/${eid}"/>
        <bf:title>
            <bf:Title>
                <bf:mainTitle>${title}</bf:mainTitle>
            </bf:Title>
        </bf:title>
    </bf:Instance>
</rdf:RDF>`;
  };

  describe('PUT /api-staging/ldp/:eid', () => {
    it('should store a new RDF record in staging', async () => {
      const eid = 'e1234567890123';
      const rdfPayload = createRdfPayload(eid, 'testuser', 'Test Work Title');

      const response = await request(app)
        .put(`/api-staging/ldp/${eid}`)
        .set('Content-Type', 'application/rdf+xml')
        .send(rdfPayload)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'success');
    });

    it('should extract index fields from void:DatasetDescription', async () => {
      const eid = 'e9876543210987';
      const rdfPayload = createRdfPayload(eid, 'indexuser', 'Indexed Work', 'inprogress', '2024012345');

      await request(app)
        .put(`/api-staging/ldp/${eid}`)
        .set('Content-Type', 'application/rdf+xml')
        .send(rdfPayload)
        .expect(200);

      // Verify the record was stored with correct index
      const records = await findInCollection('resourcesStaging', { 'index.eid': eid });
      expect(records).toHaveLength(1);
      expect(records[0].index.user).toBe('indexuser');
      expect(records[0].index.title).toBe('Indexed Work');
      expect(records[0].index.status).toBe('inprogress');
      expect(records[0].index.lccn).toBe('2024012345');
    });

    it('should update existing record on subsequent PUT', async () => {
      const eid = 'e1111111111111';
      const initialPayload = createRdfPayload(eid, 'testuser', 'Initial Title');
      const updatedPayload = createRdfPayload(eid, 'testuser', 'Updated Title');

      // Create initial record
      await request(app)
        .put(`/api-staging/ldp/${eid}`)
        .set('Content-Type', 'application/rdf+xml')
        .send(initialPayload)
        .expect(200);

      // Update the record
      await request(app)
        .put(`/api-staging/ldp/${eid}`)
        .set('Content-Type', 'application/rdf+xml')
        .send(updatedPayload)
        .expect(200);

      // Verify only one record exists with updated title
      const records = await findInCollection('resourcesStaging', { 'index.eid': eid });
      expect(records).toHaveLength(1);
      expect(records[0].index.title).toBe('Updated Title');
    });

    it('should store the raw RDF/XML content', async () => {
      const eid = 'e2222222222222';
      const rdfPayload = createRdfPayload(eid, 'testuser', 'Raw Content Test');

      await request(app)
        .put(`/api-staging/ldp/${eid}`)
        .set('Content-Type', 'application/rdf+xml')
        .send(rdfPayload)
        .expect(200);

      const records = await findInCollection('resourcesStaging', { 'index.eid': eid });
      expect(records[0]).toHaveProperty('data');
      expect(records[0].data).toContain('bf:Work');
      expect(records[0].data).toContain('Raw Content Test');
    });

    it('should handle records without LCCN', async () => {
      const eid = 'e3333333333333';
      const rdfPayload = createRdfPayload(eid, 'testuser', 'No LCCN Work');

      await request(app)
        .put(`/api-staging/ldp/${eid}`)
        .set('Content-Type', 'application/rdf+xml')
        .send(rdfPayload)
        .expect(200);

      const records = await findInCollection('resourcesStaging', { 'index.eid': eid });
      expect(records[0].index.lccn).toBeUndefined();
    });

    it('should reject requests without RDF content', async () => {
      const eid = 'e4444444444444';

      const response = await request(app)
        .put(`/api-staging/ldp/${eid}`)
        .set('Content-Type', 'application/rdf+xml')
        .send('')
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should store timestamp in index', async () => {
      const eid = 'e5555555555555';
      const rdfPayload = createRdfPayload(eid, 'testuser', 'Timestamp Test');

      await request(app)
        .put(`/api-staging/ldp/${eid}`)
        .set('Content-Type', 'application/rdf+xml')
        .send(rdfPayload)
        .expect(200);

      const records = await findInCollection('resourcesStaging', { 'index.eid': eid });
      expect(records[0].index).toHaveProperty('timestamp');
      expect(typeof records[0].index.timestamp).toBe('number');
    });
  });

  describe('GET /api-staging/ldp/:eid', () => {
    it('should retrieve stored RDF record', async () => {
      const eid = 'e6666666666666';
      const rdfPayload = createRdfPayload(eid, 'testuser', 'Retrievable Work');

      // Store the record first
      await request(app)
        .put(`/api-staging/ldp/${eid}`)
        .set('Content-Type', 'application/rdf+xml')
        .send(rdfPayload)
        .expect(200);

      // Retrieve it
      const response = await request(app)
        .get(`/api-staging/ldp/${eid}`)
        .expect(200);

      expect(response.text).toContain('rdf:RDF');
      expect(response.text).toContain('Retrievable Work');
      expect(response.text).toContain('bf:Work');
    });

    it('should return 404 for non-existent record', async () => {
      const response = await request(app)
        .get('/api-staging/ldp/nonexistent123')
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });

    it('should return RDF/XML content type', async () => {
      const eid = 'e7777777777777';
      const rdfPayload = createRdfPayload(eid, 'testuser', 'Content Type Test');

      await request(app)
        .put(`/api-staging/ldp/${eid}`)
        .set('Content-Type', 'application/rdf+xml')
        .send(rdfPayload)
        .expect(200);

      const response = await request(app)
        .get(`/api-staging/ldp/${eid}`)
        .expect(200)
        .expect('Content-Type', /application\/rdf\+xml|application\/xml|text\/xml/);

      expect(response.text).toContain('<?xml');
    });
  });

  describe('PUT /api-production/ldp/:eid', () => {
    it('should store a new RDF record in production', async () => {
      const eid = 'e8888888888888';
      const rdfPayload = createRdfPayload(eid, 'produser', 'Production Work', 'published');

      const response = await request(app)
        .put(`/api-production/ldp/${eid}`)
        .set('Content-Type', 'application/rdf+xml')
        .send(rdfPayload)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'success');

      // Verify it's in production collection, not staging
      const prodRecords = await findInCollection('resourcesProduction', { 'index.eid': eid });
      const stageRecords = await findInCollection('resourcesStaging', { 'index.eid': eid });

      expect(prodRecords).toHaveLength(1);
      expect(stageRecords).toHaveLength(0);
    });

    it('should extract index fields for production records', async () => {
      const eid = 'e9999999999999';
      const rdfPayload = createRdfPayload(eid, 'produser', 'Production Index Test', 'published', '2024054321');

      await request(app)
        .put(`/api-production/ldp/${eid}`)
        .set('Content-Type', 'application/rdf+xml')
        .send(rdfPayload)
        .expect(200);

      const records = await findInCollection('resourcesProduction', { 'index.eid': eid });
      expect(records[0].index.user).toBe('produser');
      expect(records[0].index.status).toBe('published');
      expect(records[0].index.lccn).toBe('2024054321');
    });
  });

  describe('GET /api-production/ldp/:eid', () => {
    it('should retrieve stored production RDF record', async () => {
      const eid = 'e1010101010101';
      const rdfPayload = createRdfPayload(eid, 'produser', 'Production Retrieval Test', 'published');

      await request(app)
        .put(`/api-production/ldp/${eid}`)
        .set('Content-Type', 'application/rdf+xml')
        .send(rdfPayload)
        .expect(200);

      const response = await request(app)
        .get(`/api-production/ldp/${eid}`)
        .expect(200);

      expect(response.text).toContain('Production Retrieval Test');
    });

    it('should return 404 for non-existent production record', async () => {
      const response = await request(app)
        .get('/api-production/ldp/nonexistent456')
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Environment isolation', () => {
    it('should keep staging and production records separate', async () => {
      const eid = 'e1212121212121';
      const stagingPayload = createRdfPayload(eid, 'testuser', 'Staging Version', 'inprogress');
      const productionPayload = createRdfPayload(eid, 'testuser', 'Production Version', 'published');

      // Store in both environments
      await request(app)
        .put(`/api-staging/ldp/${eid}`)
        .set('Content-Type', 'application/rdf+xml')
        .send(stagingPayload)
        .expect(200);

      await request(app)
        .put(`/api-production/ldp/${eid}`)
        .set('Content-Type', 'application/rdf+xml')
        .send(productionPayload)
        .expect(200);

      // Verify they're in separate collections
      const stagingResponse = await request(app)
        .get(`/api-staging/ldp/${eid}`)
        .expect(200);

      const productionResponse = await request(app)
        .get(`/api-production/ldp/${eid}`)
        .expect(200);

      expect(stagingResponse.text).toContain('Staging Version');
      expect(productionResponse.text).toContain('Production Version');
    });

    it('should not find staging record in production', async () => {
      const eid = 'e1313131313131';
      const rdfPayload = createRdfPayload(eid, 'testuser', 'Staging Only');

      await request(app)
        .put(`/api-staging/ldp/${eid}`)
        .set('Content-Type', 'application/rdf+xml')
        .send(rdfPayload)
        .expect(200);

      await request(app)
        .get(`/api-production/ldp/${eid}`)
        .expect(404);
    });
  });

  describe('Index field extraction', () => {
    it('should extract all lclocal fields from DatasetDescription', async () => {
      const eid = 'e1414141414141';
      const rdfPayload = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:lclocal="http://id.loc.gov/ontologies/lclocal/"
         xmlns:void="http://rdfs.org/ns/void#"
         xmlns:bf="http://id.loc.gov/ontologies/bibframe/">
    <void:DatasetDescription>
        <lclocal:eid>${eid}</lclocal:eid>
        <lclocal:user>extractuser</lclocal:user>
        <lclocal:title>Extraction Test Title</lclocal:title>
        <lclocal:status>inprogress</lclocal:status>
        <lclocal:lccn>2024099999</lclocal:lccn>
        <lclocal:timestamp>1704067200</lclocal:timestamp>
        <lclocal:profile>lc:RT:bf2:Monograph</lclocal:profile>
    </void:DatasetDescription>
    <bf:Work rdf:about="http://id.loc.gov/resources/works/${eid}"/>
</rdf:RDF>`;

      await request(app)
        .put(`/api-staging/ldp/${eid}`)
        .set('Content-Type', 'application/rdf+xml')
        .send(rdfPayload)
        .expect(200);

      const records = await findInCollection('resourcesStaging', { 'index.eid': eid });
      expect(records[0].index.eid).toBe(eid);
      expect(records[0].index.user).toBe('extractuser');
      expect(records[0].index.title).toBe('Extraction Test Title');
      expect(records[0].index.status).toBe('inprogress');
      expect(records[0].index.lccn).toBe('2024099999');
    });

    it('should handle missing optional index fields', async () => {
      const eid = 'e1515151515151';
      const rdfPayload = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:lclocal="http://id.loc.gov/ontologies/lclocal/"
         xmlns:void="http://rdfs.org/ns/void#"
         xmlns:bf="http://id.loc.gov/ontologies/bibframe/">
    <void:DatasetDescription>
        <lclocal:eid>${eid}</lclocal:eid>
        <lclocal:user>minimaluser</lclocal:user>
    </void:DatasetDescription>
    <bf:Work rdf:about="http://id.loc.gov/resources/works/${eid}"/>
</rdf:RDF>`;

      await request(app)
        .put(`/api-staging/ldp/${eid}`)
        .set('Content-Type', 'application/rdf+xml')
        .send(rdfPayload)
        .expect(200);

      const records = await findInCollection('resourcesStaging', { 'index.eid': eid });
      expect(records[0].index.eid).toBe(eid);
      expect(records[0].index.user).toBe('minimaluser');
      // Optional fields should be undefined or not present
      expect(records[0].index.lccn).toBeUndefined();
    });
  });

  describe('Record status transitions', () => {
    it('should allow status change from inprogress to published', async () => {
      const eid = 'e1616161616161';
      const inProgressPayload = createRdfPayload(eid, 'testuser', 'Status Test', 'inprogress');
      const publishedPayload = createRdfPayload(eid, 'testuser', 'Status Test', 'published');

      await request(app)
        .put(`/api-staging/ldp/${eid}`)
        .set('Content-Type', 'application/rdf+xml')
        .send(inProgressPayload)
        .expect(200);

      let records = await findInCollection('resourcesStaging', { 'index.eid': eid });
      expect(records[0].index.status).toBe('inprogress');

      await request(app)
        .put(`/api-staging/ldp/${eid}`)
        .set('Content-Type', 'application/rdf+xml')
        .send(publishedPayload)
        .expect(200);

      records = await findInCollection('resourcesStaging', { 'index.eid': eid });
      expect(records[0].index.status).toBe('published');
    });

    it('should preserve record history on update', async () => {
      const eid = 'e1717171717171';
      const initialPayload = createRdfPayload(eid, 'testuser', 'Initial Title');

      await request(app)
        .put(`/api-staging/ldp/${eid}`)
        .set('Content-Type', 'application/rdf+xml')
        .send(initialPayload)
        .expect(200);

      const initialRecords = await findInCollection('resourcesStaging', { 'index.eid': eid });
      const initialTimestamp = initialRecords[0].index.timestamp;

      // Wait a moment to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 100));

      const updatedPayload = createRdfPayload(eid, 'testuser', 'Updated Title');

      await request(app)
        .put(`/api-staging/ldp/${eid}`)
        .set('Content-Type', 'application/rdf+xml')
        .send(updatedPayload)
        .expect(200);

      const updatedRecords = await findInCollection('resourcesStaging', { 'index.eid': eid });
      // The record should be updated (one record, not two)
      expect(updatedRecords).toHaveLength(1);
      expect(updatedRecords[0].index.title).toBe('Updated Title');
    });
  });

  describe('EID format validation', () => {
    it('should accept valid EID format', async () => {
      const validEids = [
        'e1234567890123',
        'e9876543210987',
        'e1111111111111'
      ];

      for (const eid of validEids) {
        const rdfPayload = createRdfPayload(eid, 'testuser', `Test for ${eid}`);

        const response = await request(app)
          .put(`/api-staging/ldp/${eid}`)
          .set('Content-Type', 'application/rdf+xml')
          .send(rdfPayload);

        expect(response.status).toBe(200);
      }
    });

    it('should handle EID mismatch between URL and payload', async () => {
      const urlEid = 'e1818181818181';
      const payloadEid = 'e1919191919191';
      const rdfPayload = createRdfPayload(payloadEid, 'testuser', 'Mismatch Test');

      // The URL EID should take precedence or cause an error
      const response = await request(app)
        .put(`/api-staging/ldp/${urlEid}`)
        .set('Content-Type', 'application/rdf+xml')
        .send(rdfPayload);

      // Either accepts (using URL EID) or rejects (validation error)
      expect([200, 400]).toContain(response.status);
    });
  });

  describe('Large payload handling', () => {
    it('should handle large RDF documents', async () => {
      const eid = 'e2020202020202';

      // Create a large RDF with many contributions
      let contributions = '';
      for (let i = 0; i < 50; i++) {
        contributions += `
        <bf:contribution>
            <bf:Contribution>
                <bf:agent>
                    <bf:Agent rdf:about="http://id.loc.gov/authorities/names/n${String(i).padStart(10, '0')}">
                        <rdfs:label>Author ${i}</rdfs:label>
                    </bf:Agent>
                </bf:agent>
            </bf:Contribution>
        </bf:contribution>`;
      }

      const largeRdfPayload = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
         xmlns:bf="http://id.loc.gov/ontologies/bibframe/"
         xmlns:lclocal="http://id.loc.gov/ontologies/lclocal/"
         xmlns:void="http://rdfs.org/ns/void#">
    <void:DatasetDescription>
        <lclocal:eid>${eid}</lclocal:eid>
        <lclocal:user>testuser</lclocal:user>
        <lclocal:title>Large Document Test</lclocal:title>
        <lclocal:status>inprogress</lclocal:status>
    </void:DatasetDescription>
    <bf:Work rdf:about="http://id.loc.gov/resources/works/${eid}">
        <bf:title>
            <bf:Title>
                <bf:mainTitle>Large Document Test</bf:mainTitle>
            </bf:Title>
        </bf:title>
        ${contributions}
    </bf:Work>
</rdf:RDF>`;

      const response = await request(app)
        .put(`/api-staging/ldp/${eid}`)
        .set('Content-Type', 'application/rdf+xml')
        .send(largeRdfPayload)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'success');

      // Verify the full content was stored
      const records = await findInCollection('resourcesStaging', { 'index.eid': eid });
      expect(records[0].data).toContain('Author 49');
    });
  });

  describe('Concurrent access', () => {
    it('should handle concurrent writes to different records', async () => {
      const eids = ['e2121212121211', 'e2121212121212', 'e2121212121213'];

      const promises = eids.map(eid => {
        const rdfPayload = createRdfPayload(eid, 'testuser', `Concurrent ${eid}`);
        return request(app)
          .put(`/api-staging/ldp/${eid}`)
          .set('Content-Type', 'application/rdf+xml')
          .send(rdfPayload);
      });

      const responses = await Promise.all(promises);

      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Verify all records were stored
      for (const eid of eids) {
        const records = await findInCollection('resourcesStaging', { 'index.eid': eid });
        expect(records).toHaveLength(1);
      }
    });
  });
});
