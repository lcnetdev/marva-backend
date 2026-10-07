/**
 * CIP Lookup Service
 *
 * Calls the cip-lookup container (see ../../cip-lookup/README.md), which resolves
 * an ISBN or inventory barcode to the best OCLC record as MARC and BIBFRAME.
 */

const got = require('got').got;
const { config } = require('../config');

const ALLOWED_PARAMS = ['barcode', 'isbn', 'lccn', 'bibframe', 'full'];

/**
 * Look up a print book by ISBN or barcode
 * @param {object} query - Client query params (barcode, isbn, lccn, bibframe, full)
 * @returns {Promise<{status: number, body: object}>} cip-lookup's HTTP status and JSON body
 */
async function cipLookup(query) {
  const searchParams = {};
  for (const name of ALLOWED_PARAMS) {
    if (typeof query[name] === 'string' && query[name] !== '') {
      searchParams[name] = query[name];
    }
  }

  // not found (404) and upstream failures (502) come back as JSON bodies worth passing on
  const response = await got.get(`${config.cipLookup.url.replace(/\/+$/, '')}/lookup`, {
    searchParams,
    responseType: 'json',
    throwHttpErrors: false,
    retry: { limit: 0 },
    timeout: { request: config.cipLookup.timeout }
  });

  return { status: response.statusCode, body: response.body };
}

module.exports = { cipLookup };
