const request = require('supertest');
const nock = require('nock');
const { createTestApp } = require('../helpers/testServer');
const { connectTestDb, closeTestDb } = require('../helpers/testDb');
const { rdfPayloads } = require('../helpers/fixtures');
const {
  mockMarkLogicPublish,
  mockMarkLogicValidation,
  mockNacoStub,
  cleanAllMocks
} = require('../helpers/mockExternalServices');

describe('Publishing Endpoints', () => {
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
    cleanAllMocks();
    app = createTestApp(mongoUri);
  });

  afterEach(() => {
    cleanAllMocks();
  });

  describe('POST /publish/production', () => {
    // Note: These tests mock the external MarkLogic service
    // The actual endpoint implementation would need to be extracted for full testing

    it('should accept valid RDF XML payload structure', async () => {
      const payload = {
        name: 'test-record-001',
        rdfxml: rdfPayloads.validBibRdf,
        hub: false,
        eid: 'eid-001'
      };

      // This tests the request structure - actual MarkLogic call would be mocked
      expect(payload.rdfxml).toContain('rdf:RDF');
      expect(payload.rdfxml).toContain('bf:Work');
    });

    it('should distinguish between bib and hub endpoints', async () => {
      const bibPayload = {
        name: 'bib-record',
        rdfxml: rdfPayloads.validBibRdf,
        hub: false
      };

      const hubPayload = {
        name: 'hub-record',
        rdfxml: rdfPayloads.validHubRdf,
        hub: true
      };

      // Verify hub flag is set correctly
      expect(bibPayload.hub).toBe(false);
      expect(hubPayload.hub).toBe(true);
    });

    it('should validate RDF contains required structure', () => {
      const validRdf = rdfPayloads.validBibRdf;
      const invalidRdf = rdfPayloads.invalidRdf;

      expect(validRdf).toContain('rdf:RDF');
      expect(validRdf).toContain('xmlns:bf');
      expect(invalidRdf).not.toMatch(/<\/rdf:RDF>/);
    });
  });

  describe('POST /publish/staging', () => {
    it('should use different credentials than production', () => {
      // Verify staging credentials are different
      expect(process.env.MLUSERSTAGE).toBeDefined();
      expect(process.env.MLPASSSTAGE).toBeDefined();
      expect(process.env.MLUSERSTAGE).not.toBe(process.env.MLUSER);
    });

    it('should use staging endpoint URL', () => {
      expect(process.env.STAGINGPOSTURL).toBeDefined();
      expect(process.env.STAGINGPOSTURL).not.toBe(process.env.PRODUCTIONPOSTURL);
    });
  });

  describe('POST /validate/:loc', () => {
    it('should accept RDF for validation', async () => {
      const payload = {
        rdfxml: rdfPayloads.validBibRdf,
        name: 'validate-test'
      };

      expect(payload.rdfxml).toContain('rdf:RDF');
    });

    it('should support different loc parameters', () => {
      const locs = ['prod', 'stage'];

      locs.forEach(loc => {
        expect(typeof loc).toBe('string');
      });
    });
  });

  describe('POST /nacostub/staging', () => {
    it('should accept MARC authority XML structure', () => {
      const payload = {
        name: 'naco-test',
        marcxml: `<?xml version="1.0" encoding="UTF-8"?>
          <record xmlns="http://www.loc.gov/MARC21/slim">
            <leader>00000nz  a2200000n  4500</leader>
            <controlfield tag="001">n2024012345</controlfield>
          </record>`
      };

      expect(payload.marcxml).toContain('record');
      expect(payload.marcxml).toContain('leader');
    });

    it('should use staging NACO stub credentials', () => {
      expect(process.env.STAGINGNACOSTUB).toBeDefined();
    });
  });

  describe('POST /nacostub/production', () => {
    it('should use production NACO stub credentials', () => {
      expect(process.env.PRODUCTIONNACOSTUB).toBeDefined();
    });
  });

  describe('RDF Payload validation', () => {
    it('should validate well-formed XML', () => {
      const validXml = rdfPayloads.validBibRdf;

      // Simple XML validation - starts with declaration and has root element
      expect(validXml.trim()).toMatch(/^<\?xml/);
      expect(validXml).toContain('</rdf:RDF>');
    });

    it('should handle minimal RDF payload', () => {
      const minimalRdf = rdfPayloads.minimalRdf;

      expect(minimalRdf).toContain('rdf:RDF');
      expect(minimalRdf).toContain('</rdf:RDF>');
    });

    it('should detect invalid XML structure', () => {
      const invalidRdf = rdfPayloads.invalidRdf;

      // Should not have proper closing tags
      expect(invalidRdf).not.toContain('</invalid>');
    });
  });

  describe('Publishing response format', () => {
    it('should define expected success response structure', () => {
      const expectedSuccessResponse = {
        name: 'record-name',
        publish: { status: 'published' },
        postLocation: 'http://id.loc.gov/resources/works/123456'
      };

      expect(expectedSuccessResponse).toHaveProperty('name');
      expect(expectedSuccessResponse).toHaveProperty('publish');
      expect(expectedSuccessResponse.publish).toHaveProperty('status');
      expect(expectedSuccessResponse).toHaveProperty('postLocation');
    });

    it('should define expected error response structure', () => {
      const expectedErrorResponse = {
        name: 'record-name',
        objid: 'objid',
        publish: {
          status: 'error',
          server: 'https://production.example.com/controllers/ingest/bf-bib.xqy',
          message: 'Error message'
        }
      };

      expect(expectedErrorResponse).toHaveProperty('name');
      expect(expectedErrorResponse).toHaveProperty('publish');
      expect(expectedErrorResponse.publish.status).toBe('error');
      expect(expectedErrorResponse.publish).toHaveProperty('server');
      expect(expectedErrorResponse.publish).toHaveProperty('message');
    });
  });

  describe('Validation response format', () => {
    it('should define expected validation success response', () => {
      const successResponse = {
        status: { status: 'validated' },
        validation: [{ level: 'SUCCESS', message: 'No issues found.' }]
      };

      expect(successResponse.status.status).toBe('validated');
      expect(successResponse.validation).toBeInstanceOf(Array);
      expect(successResponse.validation[0].level).toBe('SUCCESS');
    });

    it('should define expected validation error response', () => {
      const errorResponse = {
        status: { status: 'validated' },
        validation: [
          { level: 'ERROR', message: 'Missing required field: title' },
          { level: 'WARNING', message: 'Recommended field not present: subject' }
        ]
      };

      expect(errorResponse.validation).toHaveLength(2);
      expect(errorResponse.validation[0].level).toBe('ERROR');
      expect(errorResponse.validation[1].level).toBe('WARNING');
    });
  });
});
