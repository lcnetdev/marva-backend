/**
 * CIP Lookup Service
 *
 * Calls the cip-lookup container (see ../../cip-lookup/README.md), which finds the
 * OCLC record for a manifestation and returns it as MARC and BIBFRAME, either from
 * an ISBN / inventory barcode (lookup) or from a BIBFRAME record itself (enrich).
 */

const got = require('got').got;
const { config } = require('../config');

const LOOKUP_PARAMS = ['barcode', 'isbn', 'lccn', 'oclcNumber', 'bibframe', 'full'];
const ENRICH_FIELDS = ['rdfxml', 'isbn', 'lccn', 'oclcNumber', 'printOnly', 'bibframe', 'full'];

function baseUrl() {
  return config.cipLookup.url.replace(/\/+$/, '');
}

// not found (404/422) and upstream failures (502) come back as JSON bodies worth passing on
const options = () => ({
  responseType: 'json',
  throwHttpErrors: false,
  retry: { limit: 0 },
  timeout: { request: config.cipLookup.timeout }
});

/**
 * Look up a print book by ISBN, barcode, LCCN or OCLC number
 * @param {object} query - Client query params (barcode, isbn, lccn, oclcNumber, bibframe, full)
 * @returns {Promise<{status: number, body: object}>} cip-lookup's HTTP status and JSON body
 */
async function cipLookup(query) {
  const searchParams = {};
  for (const name of LOOKUP_PARAMS) {
    if (typeof query[name] === 'string' && query[name] !== '') {
      searchParams[name] = query[name];
    }
  }
  const response = await got.get(`${baseUrl()}/lookup`, { searchParams, ...options() });
  return { status: response.statusCode, body: response.body };
}

/**
 * Enrich a BIBFRAME record: find the OCLC record for the same manifestation and convert it
 * @param {object} body - { rdfxml, isbn?, lccn?, oclcNumber?, printOnly?, bibframe?, full? }
 * @returns {Promise<{status: number, body: object}>} cip-lookup's HTTP status and JSON body
 */
async function cipEnrich(body) {
  const json = {};
  for (const name of ENRICH_FIELDS) {
    if (body[name] !== undefined && body[name] !== null && body[name] !== '') {
      json[name] = body[name];
    }
  }
  const response = await got.post(`${baseUrl()}/enrich`, { json, ...options() });
  return { status: response.statusCode, body: response.body };
}

module.exports = { cipLookup, cipEnrich };
