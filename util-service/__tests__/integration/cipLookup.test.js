const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { config } = require('../../config');

// got is ESM and does not load under jest, so the service that calls the container is mocked;
// the router (auth, validation, status pass-through) is the real one
jest.mock('../../services/cipLookupService', () => ({
  cipLookup: jest.fn(),
  cipEnrich: jest.fn()
}));
const { cipLookup, cipEnrich } = require('../../services/cipLookupService');
const { createCipLookupRoutes } = require('../../routes/cipLookup');

function appFor() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));
  app.use('/', createCipLookupRoutes());
  return app;
}

const auth = 'Bearer ' + jwt.sign({ username: 'alice', email: 'alice@loc.gov' }, config.jwt.secret, { expiresIn: '1h' });
const rdfxml = '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:bf="http://id.loc.gov/ontologies/bibframe/">'
  + '<bf:Instance><bf:identifiedBy><bf:Isbn><rdf:value>9781668072851</rdf:value></bf:Isbn></bf:identifiedBy></bf:Instance></rdf:RDF>';

describe('CIP lookup proxy', () => {
  let app;

  beforeEach(() => {
    app = appFor();
    cipLookup.mockReset();
    cipEnrich.mockReset();
  });

  describe('GET /cip-lookup', () => {
    it('requires a login', async () => {
      await request(app).get('/cip-lookup?isbn=9781668072851').expect(401);
      expect(cipLookup).not.toHaveBeenCalled();
    });

    it('passes the query and the answer through', async () => {
      cipLookup.mockResolvedValue({ status: 200, body: { status: 'ok', oclc: { best: { oclcNumber: '1522761698' } } } });
      const res = await request(app).get('/cip-lookup?isbn=9781668072851&full=true').set('Authorization', auth).expect(200);
      expect(res.body.oclc.best.oclcNumber).toBe('1522761698');
      expect(cipLookup).toHaveBeenCalledWith(expect.objectContaining({ isbn: '9781668072851', full: 'true' }));
    });

    it('passes not-found through with its status', async () => {
      cipLookup.mockResolvedValue({ status: 404, body: { status: 'no_oclc_record', messages: ['none'] } });
      const res = await request(app).get('/cip-lookup?barcode=1').set('Authorization', auth).expect(404);
      expect(res.body.status).toBe('no_oclc_record');
    });

    it('answers 502 when the container is down', async () => {
      cipLookup.mockRejectedValue(new Error('ECONNREFUSED'));
      const res = await request(app).get('/cip-lookup?isbn=1').set('Authorization', auth).expect(502);
      expect(res.body.status).toBe('upstream_error');
    });
  });

  describe('POST /cip-lookup/enrich', () => {
    it('requires a login', async () => {
      await request(app).post('/cip-lookup/enrich').send({ rdfxml }).expect(401);
      expect(cipEnrich).not.toHaveBeenCalled();
    });

    it('rejects a body without the record', async () => {
      const res = await request(app).post('/cip-lookup/enrich').set('Authorization', auth).send({ isbn: '1' }).expect(400);
      expect(res.body.status).toBe('bad_request');
      expect(cipEnrich).not.toHaveBeenCalled();
    });

    it('passes the record and options through and returns the answer', async () => {
      cipEnrich.mockResolvedValue({ status: 200, body: { status: 'ok', oclc: { matchedBy: 'isbn' }, bibframe: { record: {} } } });
      const res = await request(app).post('/cip-lookup/enrich').set('Authorization', auth)
        .send({ rdfxml, full: false }).expect(200);
      expect(res.body.oclc.matchedBy).toBe('isbn');
      expect(cipEnrich).toHaveBeenCalledWith(expect.objectContaining({ rdfxml, full: false }));
    });

    it('passes a record with no identifiers through as 422', async () => {
      cipEnrich.mockResolvedValue({ status: 422, body: { status: 'no_identifiers', messages: ['none'] } });
      const res = await request(app).post('/cip-lookup/enrich').set('Authorization', auth).send({ rdfxml }).expect(422);
      expect(res.body.status).toBe('no_identifiers');
    });

    it('answers 502 when the container is down', async () => {
      cipEnrich.mockRejectedValue(new Error('ECONNREFUSED'));
      const res = await request(app).post('/cip-lookup/enrich').set('Authorization', auth).send({ rdfxml }).expect(502);
      expect(res.body.status).toBe('upstream_error');
    });
  });
});
