/**
 * External API Routes
 *
 * Handles external API integrations:
 * - POST /worldcat/search/ - Search WorldCat
 * - GET /worldcat/relatedmeta/:isbn - Get related metadata by ISBN
 * - POST /related/works/contributor/ - Get related works by contributor
 * - GET /lcap/sync/lccn/:lccn - Sync with LCAP
 * - GET /history/:bibid - Get record history
 * - GET /status - Get system status
 */

const express = require('express');
const got = require('got').got;
const NodeCache = require('node-cache');
const marcjs = require('marcjs');
const Marc = marcjs.Marc;
const { ClientCredentials } = require('simple-oauth2');
const { config } = require('../config');

// WorldCat MARC cache
const wcMarcCache = new NodeCache();
const cacheTTL = config.cache.worldcatTtl;

// Status tracking
let lastUpdateNames = '';
let lastUpdateSubjects = '';

/**
 * Create external API routes
 * @returns {Router} Express router
 */
function createExternalRoutes() {
  const router = express.Router();

  /**
   * Get WorldCat authentication token
   * @returns {Promise<string>} WorldCat token
   */
  async function worldCatAuthToken() {
    const credentials = {
      client: {
        id: config.worldcat.clientId,
        secret: config.worldcat.secret
      },
      auth: {
        tokenHost: 'https://oauth.oclc.org',
        tokenPath: '/token'
      }
    };

    const scopes = 'WorldCatMetadataAPI wcapi:view_bib wcapi:view_brief_bib';
    const oauth2 = new ClientCredentials(credentials);
    const tokenConfig = { scope: scopes };

    async function getToken() {
      try {
        let httpOptions = { Accept: 'application/json' };
        let accessToken = await oauth2.getToken(tokenConfig, httpOptions);
        console.log('Access Token: ', accessToken);
        return accessToken;
      } catch (error) {
        console.error('Error getting token: ', error);
        return error;
      }
    }

    const now = new Date();

    if (process.env.WC_EXPIRES && (Date.parse(process.env.WC_EXPIRES) - now > 1000)) {
      // Use existing token
    } else {
      const token = await getToken();
      console.log('New token: ', token);
      process.env.WC_TOKEN = token.token.access_token;
      process.env.WC_EXPIRES = token.token.expires_at;
    }

    return process.env.WC_TOKEN;
  }

  /**
   * Search WorldCat API
   * @param {string} token - WorldCat token
   * @param {string} query - Search query
   * @param {string} itemType - Item type filter
   * @param {number} offset - Results offset
   * @param {number} limit - Results limit
   * @returns {Promise<object>} Search results
   */
  async function worldCatSearchApi(token, query, itemType, offset, limit) {
    const URL = 'https://americas.discovery.api.oclc.org/worldcat/search/v2/brief-bibs';

    let queryParams = {};
    if (itemType == 'book') {
      queryParams = {
        q: query,
        itemSubType: 'book-printbook',
        offset: offset,
        limit: limit
      };
    } else if (itemType == 'ebook') {
      queryParams = {
        q: query,
        itemSubType: 'book-digital',
        offset: offset,
        limit: limit
      };
    } else {
      queryParams = {
        q: query,
        itemType: itemType,
        offset: offset,
        limit: limit
      };
    }

    try {
      const resp = await got(URL, {
        searchParams: queryParams,
        headers: {
          Authorization: 'Bearer ' + token,
          Accept: 'application/json',
          'User-Agent': 'marva-backend/ndmso@loc.gov'
        }
      });

      const data = JSON.parse(resp.body);
      return {
        status: { status: 'success' },
        results: data
      };
    } catch (error) {
      return {
        status: { status: 'error' },
        error: error
      };
    }
  }

  /**
   * Get WorldCat metadata
   * @param {string} token - WorldCat token
   * @param {string} ocn - OCLC number
   * @returns {Promise<object>} Metadata results
   */
  async function worldCatMetadataApi(token, ocn) {
    const cachedValue = wcMarcCache.get(ocn);
    if (typeof cachedValue != 'undefined') {
      return {
        status: { status: 'success' },
        results: cachedValue.marc
      };
    }

    const URL = 'https://metadata.api.oclc.org/worldcat/manage/bibs/' + ocn;

    try {
      const resp = await got(URL, {
        headers: {
          Authorization: 'Bearer ' + token,
          Accept: 'application/marcxml+xml',
          'User-Agent': 'marva-backend/ndmso@loc.gov'
        }
      });

      const data = resp.body;
      wcMarcCache.set(ocn, { marc: data }, cacheTTL);
      return {
        status: { status: 'success' },
        results: data
      };
    } catch (error) {
      return {
        status: { status: 'error' },
        error: error
      };
    }
  }

  /**
   * Format MARC record as HTML
   * @param {object} data - MARC record data
   * @returns {string} HTML formatted MARC
   */
  function marcRecordHtmlify(data) {
    let formattedMarcRecord = ["<div class='marc record'>"];
    let leader = "<div class='marc leader'>" + data['leader'].replace(/ /g, '&nbsp;') + '</div>';
    formattedMarcRecord.push(leader);

    let fields = data['fields'];
    for (let field of fields) {
      let tag;
      let value = null;
      let indicators = null;
      let subfields = [];

      for (let el in field) {
        if (el == 0) {
          tag = field[el];
        } else if (field.length == 2) {
          value = field[el];
        } else if (el == 1 && field.length > 2) {
          indicators = [field[el][0], field[el][1]];
        } else {
          if ((el % 2) == 0 && field.length > 2) {
            subfields.push([field[el], field[Number(el) + 1]]);
          }
        }
      }

      if (value) {
        tag = "<span class='marc tag tag-" + tag + "'>" + tag + '</span>';
        value = " <span class='marc value'>" + value + '</span>';
        formattedMarcRecord.push("<div class='marc field'>" + tag + value + '</div>');
      } else {
        subfields = subfields.map((subfield) =>
          "<span class='marc subfield subfield-" + subfield[0] + "'><span class='marc subfield subfield-label'>$" + subfield[0] + "</span> <span class='marc subfield subfield-value'>" + subfield[1] + '</span></span>'
        );
        indicators = "<span class='marc indicators'><span class='marc indicators indicator-1'>" + indicators[0] + "</span><span class='marc indicators indicator-2'>" + indicators[1] + '</span></span>';
        tag = "<span class='marc tag tag-" + tag + "'>" + tag + '</span>';
        formattedMarcRecord.push("<div class='marc field'>" + tag + ' ' + indicators + ' ' + subfields.join(' ') + '</div>');
      }
    }
    formattedMarcRecord.push('</div>');

    return formattedMarcRecord.join('\r\n');
  }

  // ============================================
  // WORLDCAT ENDPOINTS
  // ============================================

  /**
   * POST /worldcat/search/ - Search WorldCat
   */
  router.post('/worldcat/search/', async (req, res) => {
    console.log('searching worldcat');

    const wcQuery = req.body.query;
    const wcIndex = req.body.index;
    const wcType = req.body.type;
    const wcOffset = req.body.offset;
    const wcLimit = req.body.limit;
    const marc = req.body.marc;

    const token = await worldCatAuthToken();

    let resp_data;
    if (!marc) {
      resp_data = await worldCatSearchApi(token, wcIndex + ': ' + wcQuery, wcType, wcOffset, wcLimit);

      if (resp_data.results && resp_data.results.numberOfRecords > 0) {
        for (let record of resp_data.results.briefRecords) {
          const marc_data = await worldCatMetadataApi(token, record.oclcNumber);
          const marcRecord = Marc.parse(marc_data.results, 'marcxml');
          const marcText = Marc.format(marcRecord, 'Text');

          record.marcXML = marcRecord.as('marcxml');
          record.marcRaw = marcRecord;
          record.marcJSON = JSON.parse(marcRecord.as('mij'));
          record.marcHTML = marcRecordHtmlify(marcRecord);
          record.rawResult = marc_data.results;
        }
      }
    } else {
      resp_data = await worldCatMetadataApi(token, req.body.ocn);
    }

    res.json(resp_data);
  });

  /**
   * GET /worldcat/relatedmeta/:isbn - Get related metadata by ISBN
   */
  router.get('/worldcat/relatedmeta/:isbn', async (req, res) => {
    if (!config.worldcat.clientId || !config.worldcat.secret) {
      return res.status(500).json({
        status: { status: 'error' },
        error: 'WorldCat client ID and secret not set in environment variables.',
        results: { isbns: [], records: [] }
      });
    }

    const token = await worldCatAuthToken();
    const URL = 'https://americas.discovery.api.oclc.org/worldcat/search/v2/brief-bibs';

    const queryParams = {
      q: 'bn:' + req.params.isbn
    };

    try {
      const resp = await got(URL, {
        searchParams: queryParams,
        headers: {
          Authorization: 'Bearer ' + token,
          Accept: 'application/json',
          'User-Agent': 'marva-backend/ndmso@loc.gov'
        }
      });

      const data = JSON.parse(resp.body);
      const resp_data = {
        status: { status: 'success' },
        results: { isbns: [], records: [] }
      };

      if (data && data.numberOfRecords > 0) {
        let isbns = [];
        for (let record of data.briefRecords) {
          if (record.isbns && record.isbns.length > 0) {
            for (let isbn of record.isbns) {
              if (isbns.indexOf(isbn) == -1) {
                isbns.push(isbn);
              }
            }
          }

          const marc_data = await worldCatMetadataApi(token, record.oclcNumber);
          const marcRecord = Marc.parse(marc_data.results, 'marcxml');

          record.marcJSON = JSON.parse(marcRecord.as('mij'));
          resp_data.results.records.push(record);
        }
        resp_data.results.isbns = isbns;
      }

      res.json(resp_data);
    } catch (error) {
      console.error('Error Response Body:', error.response?.body);
      res.status(500).send(error.response?.body || 'Error fetching from WorldCat');
    }
  });

  // ============================================
  // RELATED WORKS ENDPOINT
  // ============================================

  /**
   * POST /related/works/contributor/ - Get related works by contributor
   */
  router.post('/related/works/contributor/', async (req, res) => {
    const uris = req.body.uris;
    console.log('uris: ', uris);
    const results = {};

    if (uris) {
      for (let uri of uris) {
        try {
          const uriResult = await fetch(
            `https://id.loc.gov/resources/works/relationships/contributorto/?label=${uri}&page=0`,
            {
              headers: {
                accept: '*/*',
                'accept-language': 'en-US,en;q=0.9,ru;q=0.8',
                'cache-control': 'no-cache',
                'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'Referrer-Policy': 'strict-origin-when-cross-origin'
              },
              method: 'GET'
            }
          );

          const uriResultJson = await uriResult.json();
          results[uri] = uriResultJson;
        } catch (error) {
          console.error('Error fetching or parsing JSON for URI:', uri, error);
          continue;
        }
      }
    }

    res.json(results);
  });

  // ============================================
  // LCAP ENDPOINT
  // ============================================

  /**
   * GET /lcap/sync/lccn/:lccn - Sync with LCAP
   */
  router.get('/lcap/sync/lccn/:lccn', async (req, res) => {
    if (!config.external.lcapSync) {
      return res.status(500).send('LCAP_SYNC environment variable not set.');
    }

    const url = config.external.lcapSync.replace('<LCCN>', req.params.lccn);

    try {
      const lcapResponse = await got(url).json();
      res.json(lcapResponse);
    } catch (error) {
      console.error('LCAP Sync Error:', error);
      const errorBody = error.response ? error.response.body : 'Error fetching from LCAP sync endpoint.';
      res.status(500).send(errorBody);
    }
  });

  // ============================================
  // HISTORY ENDPOINT
  // ============================================

  /**
   * GET /history/:bibid - Get record history
   */
  router.get('/history/:bibid', async (req, res) => {
    const base = config.external.recordHistory?.trim();
    if (!base) {
      return res.status(500).json({ error: 'RECORD_HISTORY not configured' });
    }

    const url = 'https://' + base + '/metastory/api/history/bib?bibid=' + req.params.bibid + '&serialization=jsonld';

    try {
      const resp = await fetch(url, {
        headers: {
          'Content-type': 'application/xml',
          'user-agent': 'marva-backend'
        }
      });

      if (resp.status == 500) {
        return res.status(500).json({ error: 'Failed to fetch history' });
      }

      const history = await resp.text();
      res.json({ history: history });
    } catch (err) {
      res.status(500).json({ result: 'Failed to get status: ' + err });
    }
  });

  return router;
}

module.exports = { createExternalRoutes };
