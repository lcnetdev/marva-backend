const express = require('express');
const request = require('supertest');
const { createActivityStreamsRoutes } = require('../../routes/activityStreams');
const { connectTestDb, closeTestDb, seedCollection, clearCollection } = require('../helpers/testDb');

/**
 * These tests mount the REAL activity streams router factory against the
 * in-memory test database, so they exercise the production route code directly.
 */
describe('Activity Streams', () => {
  let app;
  let db;

  // Build a resource doc with the index sub-fields the feed reads.
  const rec = (overrides = {}) => ({
    index: {
      eid: 'e1',
      timestamp: 1000,
      time: '2026-01-01:00:00:00',
      status: 'published',
      title: 'A title',
      lccn: '2020123456',
      user: 'jdoe (mm1)',
      profiletypes: ['Work'],
      externalid: ['http://id.loc.gov/resources/works/1'],
      ...overrides
    }
  });

  beforeAll(async () => {
    db = await connectTestDb();
    app = express();
    app.use('/', createActivityStreamsRoutes({ getDb: () => db }));
  });

  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await clearCollection('resourcesStaging');
    await clearCollection('resourcesProduction');
  });

  describe('GET /activitystreams/:env (OrderedCollection)', () => {
    it('reports totalItems for published records only and computes last page', async () => {
      await seedCollection('resourcesStaging', [
        rec({ eid: 'a', timestamp: 3 }),
        rec({ eid: 'b', timestamp: 2 }),
        rec({ eid: 'c', timestamp: 1, status: 'unposted' }) // excluded
      ]);

      const res = await request(app).get('/activitystreams/staging').expect(200);

      expect(res.body.type).toBe('OrderedCollection');
      expect(res.body.totalItems).toBe(2);
      expect(res.body.id).toBe('/marva/util/activitystreams/staging');
      expect(res.body.first).toBe('/marva/util/activitystreams/staging/1');
      expect(res.body.last).toBe('/marva/util/activitystreams/staging/1');
      expect(res.body['@context']).toEqual(expect.arrayContaining([
        'https://www.w3.org/ns/activitystreams#',
        'https://emm-spec.org/0.1/context.json'
      ]));
    });

    it('handles an empty collection', async () => {
      const res = await request(app).get('/activitystreams/production').expect(200);
      expect(res.body.totalItems).toBe(0);
      expect(res.body.last).toBe('/marva/util/activitystreams/production/1');
    });
  });

  describe('GET /activitystreams/:env/:page (OrderedCollectionPage)', () => {
    it('returns published items newest-first and excludes non-published', async () => {
      // externalid: [] so object.id falls back to eid, keeping the assertion simple.
      await seedCollection('resourcesStaging', [
        rec({ eid: 'old', timestamp: 100, externalid: [] }),
        rec({ eid: 'new', timestamp: 300, externalid: [] }),
        rec({ eid: 'mid', timestamp: 200, externalid: [] }),
        rec({ eid: 'draft', timestamp: 999, status: 'unposted', externalid: [] })
      ]);

      const res = await request(app).get('/activitystreams/staging/1').expect(200);

      expect(res.body.type).toBe('OrderedCollectionPage');
      expect(res.body.partOf).toBe('/marva/util/activitystreams/staging');
      expect(res.body.startIndex).toBe(0);
      const ids = res.body.orderedItems.map(i => i.object.id);
      expect(ids).toEqual(['new', 'mid', 'old']); // timestamp desc, draft excluded
    });

    it('maps index fields into the ActivityStreams item shape', async () => {
      await seedCollection('resourcesStaging', [
        rec({
          eid: 'e1782',
          timestamp: 1000000000, // 2001-09-09T01:46:40Z
          user: 'wj06',
          title: 'Example title',
          lccn: '2025335901',
          profiletypes: ['Work', 'Instance'],
          externalid: [
            'http://id.loc.gov/resources/works/in001',
            'http://id.loc.gov/resources/instances/in001'
          ]
        })
      ]);

      const res = await request(app).get('/activitystreams/staging/1').expect(200);
      const item = res.body.orderedItems[0];

      expect(item.type).toBe('Update');
      expect(item.published).toBe('2001-09-09T01:46:40Z');
      expect(item.actor).toBe('wj06');
      expect(item.object.id).toBe('http://id.loc.gov/resources/works/in001');
      expect(item.object.title).toBe('Example title');
      expect(item.object.updated).toBe('2001-09-09T01:46:40Z');
      expect(item.object.type).toEqual(['bf:Work', 'bf:Instance']);
      expect(item.object.url).toEqual([
        { type: 'Link', href: 'http://id.loc.gov/resources/works/in001.rdf', mediaType: 'application/rdf+xml' },
        { type: 'Link', href: 'http://id.loc.gov/resources/instances/in001.rdf', mediaType: 'application/rdf+xml' }
      ]);
      expect(item.object['bf:identifiedBy']).toEqual([{ type: 'bf:Lccn', value: '2025335901' }]);
    });

    it('omits bf:identifiedBy when there is no lccn', async () => {
      await seedCollection('resourcesStaging', [rec({ lccn: undefined })]);
      const res = await request(app).get('/activitystreams/staging/1').expect(200);
      expect(res.body.orderedItems[0].object).not.toHaveProperty('bf:identifiedBy');
    });

    it('uses the Work URI as object.id, ignoring instance/item URIs', async () => {
      await seedCollection('resourcesStaging', [
        rec({
          eid: 'e-should-not-win',
          externalid: [
            'http://id.loc.gov/resources/instances/99',
            'http://id.loc.gov/resources/works/42',
            'http://id.loc.gov/resources/items/77'
          ]
        })
      ]);
      const res = await request(app).get('/activitystreams/staging/1').expect(200);
      expect(res.body.orderedItems[0].object.id).toBe('http://id.loc.gov/resources/works/42');
    });

    it('falls back to eid when there is no Work URI (e.g. hub-only record)', async () => {
      await seedCollection('resourcesStaging', [
        rec({
          eid: 'e-fallback',
          profiletypes: ['Hub'],
          externalid: ['http://id.loc.gov/resources/hubs/abc']
        })
      ]);
      const res = await request(app).get('/activitystreams/staging/1').expect(200);
      expect(res.body.orderedItems[0].object.id).toBe('e-fallback');
    });

    it('paginates with next/prev links and a 100-item page size', async () => {
      const docs = [];
      for (let i = 0; i < 150; i++) {
        // externalid: [] so object.id falls back to eid for the ordering assertion.
        docs.push(rec({ eid: `e${i}`, timestamp: i, externalid: [] })); // ascending ts; page 1 = highest
      }
      await seedCollection('resourcesStaging', docs);

      const page1 = await request(app).get('/activitystreams/staging/1').expect(200);
      expect(page1.body.orderedItems).toHaveLength(100);
      expect(page1.body.next).toBe('/marva/util/activitystreams/staging/2');
      expect(page1.body).not.toHaveProperty('prev');
      expect(page1.body.orderedItems[0].object.id).toBe('e149'); // newest

      const page2 = await request(app).get('/activitystreams/staging/2').expect(200);
      expect(page2.body.orderedItems).toHaveLength(50);
      expect(page2.body.prev).toBe('/marva/util/activitystreams/staging/1');
      expect(page2.body).not.toHaveProperty('next');
      expect(page2.body.startIndex).toBe(100);
    });

    it('returns an empty page beyond the last page', async () => {
      await seedCollection('resourcesStaging', [rec()]);
      const res = await request(app).get('/activitystreams/staging/50').expect(200);
      expect(res.body.orderedItems).toHaveLength(0);
      expect(res.body).not.toHaveProperty('next');
    });
  });

  describe('validation', () => {
    it('404s on an unknown environment', async () => {
      await request(app).get('/activitystreams/bogus').expect(404);
      await request(app).get('/activitystreams/bogus/1').expect(404);
    });

    it('404s on a non-positive-integer page', async () => {
      await request(app).get('/activitystreams/staging/0').expect(404);
      await request(app).get('/activitystreams/staging/abc').expect(404);
      await request(app).get('/activitystreams/staging/-1').expect(404);
    });
  });
});
