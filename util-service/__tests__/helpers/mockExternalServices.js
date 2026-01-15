const nock = require('nock');

/**
 * Mock MarkLogic publishing endpoint
 */
function mockMarkLogicPublish(options = {}) {
  const {
    env = 'production',
    statusCode = 201,
    responseBody = '',
    location = 'http://id.loc.gov/resources/works/123456'
  } = options;

  const host = env === 'production'
    ? process.env.PRODUCTIONPOSTURL
    : process.env.STAGINGPOSTURL;

  return nock(`https://${host}`)
    .post('/controllers/ingest/bf-bib.xqy')
    .reply(statusCode, responseBody, {
      location: location
    });
}

/**
 * Mock MarkLogic hub publishing endpoint
 */
function mockMarkLogicHubPublish(options = {}) {
  const {
    env = 'production',
    statusCode = 201,
    responseBody = '',
    location = 'http://id.loc.gov/resources/hubs/123456'
  } = options;

  const host = env === 'production'
    ? process.env.PRODUCTIONPOSTURL
    : process.env.STAGINGPOSTURL;

  return nock(`https://${host}`)
    .post('/controllers/ingest/bf-hub.xqy')
    .reply(statusCode, responseBody, {
      location: location
    });
}

/**
 * Mock MarkLogic validation endpoint
 */
function mockMarkLogicValidation(options = {}) {
  const {
    statusCode = 200,
    validationResult = [],
    success = true
  } = options;

  const responseBody = success
    ? '<!-- ' + JSON.stringify(validationResult) + ' -->'
    : '<!-- ' + JSON.stringify([{ level: 'ERROR', message: 'Validation failed' }]) + ' -->';

  return nock(`https://${process.env.VALIDATIONURL}`)
    .post('/controllers/xqapi-validate-resource.xqy')
    .reply(statusCode, responseBody);
}

/**
 * Mock NACO stub endpoint
 */
function mockNacoStub(options = {}) {
  const {
    env = 'production',
    statusCode = 201,
    responseBody = '',
    location = 'http://id.loc.gov/authorities/names/123456'
  } = options;

  const host = env === 'production'
    ? process.env.PRODUCTIONNACOSTUB
    : process.env.STAGINGNACOSTUB;

  return nock(`https://${host}`)
    .post('/controllers/ingest/marc-auth.xqy')
    .reply(statusCode, responseBody, {
      location: location
    });
}

/**
 * Mock WorldCat OAuth token endpoint
 */
function mockWorldCatAuth(options = {}) {
  const {
    statusCode = 200,
    accessToken = 'mock-access-token',
    expiresIn = 3600
  } = options;

  return nock('https://oauth.oclc.org')
    .post('/token')
    .reply(statusCode, {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: expiresIn
    });
}

/**
 * Mock WorldCat search endpoint
 */
function mockWorldCatSearch(options = {}) {
  const {
    statusCode = 200,
    results = [],
    numberOfRecords = 0
  } = options;

  return nock('https://americas.discovery.api.oclc.org')
    .get(/\/worldcat\/search\/v2\/brief-bibs.*/)
    .reply(statusCode, {
      numberOfRecords: numberOfRecords,
      briefRecords: results
    });
}

/**
 * Mock WorldCat metadata endpoint
 */
function mockWorldCatMetadata(options = {}) {
  const {
    statusCode = 200,
    ocn = '123456789',
    marcXml = '<record><leader>00000nam a2200000 i 4500</leader></record>'
  } = options;

  return nock('https://metadata.api.oclc.org')
    .get(`/worldcat/manage/bibs/${ocn}`)
    .reply(statusCode, marcXml, {
      'content-type': 'application/marcxml+xml'
    });
}

/**
 * Mock id.loc.gov related works endpoint
 */
function mockIdLocGovRelatedWorks(options = {}) {
  const {
    statusCode = 200,
    results = []
  } = options;

  return nock('https://id.loc.gov')
    .get(/\/resources\/works\/relationships\/contributorto\/.*/)
    .reply(statusCode, results);
}

/**
 * Mock id.loc.gov activity streams endpoint
 */
function mockActivityStreams(options = {}) {
  const {
    dataset = 'names',
    statusCode = 200,
    lastUpdate = new Date().toISOString()
  } = options;

  return nock('https://preprod-8080.id.loc.gov')
    .get(`/authorities/${dataset}/activitystreams/feed/1.json`)
    .reply(statusCode, {
      orderedItems: [
        {
          published: lastUpdate,
          type: 'Update'
        }
      ]
    });
}

/**
 * Mock LCAP sync endpoint
 */
function mockLcapSync(options = {}) {
  const {
    lccn = '12345678',
    statusCode = 200,
    responseBody = { status: 'synced' }
  } = options;

  const url = process.env.LCAP_SYNC?.replace('<LCCN>', lccn) || `https://lcap.example.com/sync/${lccn}`;
  const urlObj = new URL(url);

  return nock(`${urlObj.protocol}//${urlObj.host}`)
    .get(urlObj.pathname)
    .reply(statusCode, responseBody);
}

/**
 * Mock record history endpoint
 */
function mockRecordHistory(options = {}) {
  const {
    bibid = '12345',
    statusCode = 200,
    history = []
  } = options;

  return nock(process.env.RECORD_HISTORY || 'https://history.example.com')
    .get(`/metastory/api/history/bib`)
    .query({ bibid, serialization: 'jsonld' })
    .reply(statusCode, {
      '@context': 'http://schema.org',
      history: history
    });
}

/**
 * Mock CopyCat upload endpoint
 */
function mockCopyCatUpload(options = {}) {
  const {
    env = 'production',
    statusCode = 201,
    responseBody = ''
  } = options;

  const host = env === 'production'
    ? process.env.PRODUCTIONccURL
    : process.env.STAGGINGccURL;

  return nock(`https://${host}`)
    .post('/controllers/ingest/marc-bib.xqy')
    .reply(statusCode, responseBody);
}

/**
 * Clean all nock interceptors
 */
function cleanAllMocks() {
  nock.cleanAll();
}

/**
 * Check if all mocks have been used
 */
function verifyAllMocksUsed() {
  return nock.isDone();
}

/**
 * Get pending mocks (unused interceptors)
 */
function getPendingMocks() {
  return nock.pendingMocks();
}

module.exports = {
  mockMarkLogicPublish,
  mockMarkLogicHubPublish,
  mockMarkLogicValidation,
  mockNacoStub,
  mockWorldCatAuth,
  mockWorldCatSearch,
  mockWorldCatMetadata,
  mockIdLocGovRelatedWorks,
  mockActivityStreams,
  mockLcapSync,
  mockRecordHistory,
  mockCopyCatUpload,
  cleanAllMocks,
  verifyAllMocksUsed,
  getPendingMocks
};
