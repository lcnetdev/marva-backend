/**
 * LD Panel Enrichment Service
 *
 * Proxies requests to the Tsundoku enrichment API,
 * injecting the API key into the request body before forwarding.
 */

const got = require('got').got;
const { config } = require('../config');

/**
 * Post to the enrichment API with the API key injected
 * @param {string} path - API path (appended to base URL)
 * @param {object} body - Client JSON body
 * @returns {Promise<object>} Parsed JSON response from the external API
 */
async function postEnrichment(path, body) {
  const { url, apiKey } = config.ldPanelEnrichment;

  if (!url || !apiKey) {
    throw new Error('LD_PANEL_ENRICHMENT_URL or LD_PANEL_ENRICHMENT_API_KEY is not configured');
  }

  const enrichedBody = {
    ...body,
    api_key: apiKey
  };

  const targetUrl = `${url.replace(/\/+$/, '')}${path}`;

  const response = await got.post(targetUrl, {
    json: enrichedBody,
    responseType: 'json'
  });

  return response.body;
}

module.exports = { postEnrichment };
