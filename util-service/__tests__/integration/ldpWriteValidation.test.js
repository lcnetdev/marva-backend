const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { connectTestDb, closeTestDb, clearCollection, findInCollection, getTestDb } = require('../helpers/testDb');
const { createLdpRoutes } = require('../../routes/ldp');
const { config } = require('../../config');

// the real router behind the same body parsers app.js mounts ahead of it
function appFor() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));
  app.use('/', createLdpRoutes({
    getDb: () => getTestDb(),
    cacheStaging: { byEid: {}, byUser: {} },
    cacheProduction: { byEid: {}, byUser: {} }
  }));
  return app;
}

const token = 'Bearer ' + jwt.sign({ username: 'alice', email: 'alice@loc.gov' }, config.jwt.secret, { expiresIn: '1h' });

const RDF_NS = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';

// what the editor sends: XMLSerializer output of an rdf:RDF element, no XML declaration
const record = (title = 'A Work') =>
  `<rdf:RDF xmlns:rdf="${RDF_NS}" xmlns:bf="http://id.loc.gov/ontologies/bibframe/" xmlns:void="http://rdfs.org/ns/void#" xmlns:lclocal="http://id.loc.gov/ontologies/lclocal/">` +
  '<bf:Work rdf:about="http://id.loc.gov/resources/works/e5555555555555"/>' +
  `<void:DatasetDescription><lclocal:title>${title}</lclocal:title><lclocal:user>alice</lclocal:user><lclocal:status>inprogress</lclocal:status></void:DatasetDescription>` +
  '</rdf:RDF>';

const put = (app, env, eid, body, type = 'application/xml') =>
  request(app)
    .put(`/api-${env}/ldp/${eid}`)
    .set('Authorization', token)
    .set('Content-Type', type)
    .send(body);

describe('LDP writes accept only RDF/XML', () => {
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

  describe('accepted', () => {
    it.each([
      ['what the editor sends', record()],
      ['with an XML declaration', '<?xml version="1.0" encoding="UTF-8"?>\n' + record()],
      ['with a comment and DOCTYPE before the root', `<?xml version="1.0"?>\n<!-- exported -->\n<!DOCTYPE rdf:RDF [<!ENTITY xsd "http://www.w3.org/2001/XMLSchema#">]>\n` + record()],
      ['with RDF as the default namespace', `<RDF xmlns="${RDF_NS}"><Description about="http://example.org/a"/></RDF>`],
      ['with the RDF namespace on another prefix', `<r:RDF xmlns:r="${RDF_NS}"><r:Description r:about="http://example.org/a"/></r:RDF>`],
      ['an rdf:RDF with no DatasetDescription', `<rdf:RDF xmlns:rdf="${RDF_NS}"/>`]
    ])('%s', async (_name, body) => {
      await put(app, 'production', 'e5555555555555', body).expect(200);

      const docs = await findInCollection('resourcesProduction', { 'index.eid': 'e5555555555555' });
      expect(docs).toHaveLength(1);
      expect(docs[0].data).toBe(body);
    });

    it('still indexes the record', async () => {
      await put(app, 'staging', 'e5555555555555', record('Indexed Title')).expect(200);

      const docs = await findInCollection('resourcesStaging', { 'index.eid': 'e5555555555555' });
      expect(docs[0].index).toMatchObject({ eid: 'e5555555555555', title: 'Indexed Title', user: 'alice', status: 'inprogress' });
    });
  });

  describe('rejected', () => {
    const rejected = [
      ['an svg document', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert("Proof of XSS and JS execution.")</script></svg>'],
      ['an xhtml document', '<html xmlns="http://www.w3.org/1999/xhtml"><body><script>alert(1)</script></body></html>'],
      ['rdf:RDF bound to another namespace', '<rdf:RDF xmlns:rdf="http://www.w3.org/2000/svg"><rdf:script>alert(1)</rdf:script></rdf:RDF>'],
      ['rdf:RDF with no namespace declared', '<rdf:RDF><a/></rdf:RDF>'],
      ['an xml-stylesheet instruction ahead of the root', '<?xml version="1.0"?><?xml-stylesheet type="text/xsl" href="https://example.org/x.xsl"?>' + record()],
      ['a second root element', record() + '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
      ['text before the root', 'junk ' + record()],
      ['an unclosed document', `<rdf:RDF xmlns:rdf="${RDF_NS}"><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script>`],
      ['plain text', 'not xml at all']
    ];

    it.each(rejected)('%s', async (_name, body) => {
      const response = await put(app, 'production', 'e6666666666666', body).expect(400);

      expect(response.body.error).toMatch(/^Not an RDF\/XML document: /);
      expect(await findInCollection('resourcesProduction', {})).toHaveLength(0);
    });

    it.each(rejected)('%s (staging)', async (_name, body) => {
      await put(app, 'staging', 'e6666666666666', body).expect(400);

      expect(await findInCollection('resourcesStaging', {})).toHaveLength(0);
    });

    it('a JSON body', async () => {
      await put(app, 'production', 'e6666666666666', JSON.stringify({ data: record() }), 'application/json').expect(400);

      expect(await findInCollection('resourcesProduction', {})).toHaveLength(0);
    });

    it('leaves the existing record alone', async () => {
      await put(app, 'production', 'e7777777777777', record('Original')).expect(200);
      await put(app, 'production', 'e7777777777777', '<svg xmlns="http://www.w3.org/2000/svg"/>').expect(400);

      const docs = await findInCollection('resourcesProduction', { 'index.eid': 'e7777777777777' });
      expect(docs).toHaveLength(1);
      expect(docs[0].data).toBe(record('Original'));
      expect(docs[0].index.title).toBe('Original');
    });
  });
});
