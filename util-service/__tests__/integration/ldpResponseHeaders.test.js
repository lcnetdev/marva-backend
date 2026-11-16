const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { connectTestDb, closeTestDb, clearCollection, seedCollection, getTestDb } = require('../helpers/testDb');
const { createLdpRoutes } = require('../../routes/ldp');
const { config } = require('../../config');

// the real router on a bare express app, so the headers are what production sends
function appFor() {
  const app = express();
  app.use('/', createLdpRoutes({
    getDb: () => getTestDb(),
    cacheStaging: { byEid: {}, byUser: {} },
    cacheProduction: { byEid: {}, byUser: {} }
  }));
  return app;
}

const token = 'Bearer ' + jwt.sign({ username: 'alice', email: 'alice@loc.gov' }, config.jwt.secret, { expiresIn: '1h' });

// a stored record a browser would execute if it rendered it as a document
const SVG_SCRIPT = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert("Proof of XSS and JS execution.")</script></svg>';

function expectInert(response) {
  const csp = response.headers['content-security-policy'];
  expect(csp).toMatch(/(^|;)\s*sandbox\s*(;|$)/);
  expect(csp).toMatch(/default-src 'none'/);
  expect(response.headers['x-content-type-options']).toBe('nosniff');
}

describe('LDP record responses are served as inert data', () => {
  let app;

  beforeAll(async () => {
    await connectTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await clearCollection('resourcesProduction');
    await clearCollection('resourcesStaging');
    app = appFor();
  });

  // seeded straight into Mongo: the PUT routes no longer accept this, but
  // records stored before that check existed are still there to be served
  it('sandboxes a production record containing an svg script', async () => {
    await seedCollection('resourcesProduction', [
      { index: { eid: 'e1794454507253' }, data: SVG_SCRIPT }
    ]);

    // no Authorization: this is the URL a victim would be sent
    const response = await request(app)
      .get('/api-production/ldp/e1794454507253')
      .expect(200)
      .expect('Content-Type', /application\/rdf\+xml/);

    expectInert(response);
    // the body is untouched: the editor still gets exactly what was stored
    expect(response.text).toBe(SVG_SCRIPT);
  });

  it('sandboxes a staging record containing an svg script', async () => {
    await seedCollection('resourcesStaging', [
      { index: { eid: 'e2222222222222' }, data: SVG_SCRIPT }
    ]);

    const response = await request(app)
      .get('/api-staging/ldp/e2222222222222')
      .set('Authorization', token)
      .expect(200)
      .expect('Content-Type', /application\/rdf\+xml/);

    expectInert(response);
    expect(response.text).toBe(SVG_SCRIPT);
  });

  it('sandboxes records stored in the old ldpjs format', async () => {
    await seedCollection('resourcesProduction', [
      { index: { eid: 'e3333333333333' }, versions: [{ content: SVG_SCRIPT }] }
    ]);

    const response = await request(app)
      .get('/api-production/ldp/e3333333333333')
      .expect(200);

    expectInert(response);
    expect(response.text).toBe(SVG_SCRIPT);
  });
});
