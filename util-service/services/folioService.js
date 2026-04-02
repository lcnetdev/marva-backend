/**
 * FOLIO Client Service
 *
 * Node.js port of key functionality from the Python FolioClient library.
 * Supports multiple FOLIO instances (e.g. staging + production) with
 * cookie-based authentication, automatic token refresh, retry with
 * backoff, and paginated fetching.
 *
 * Usage:
 *   const { getFolioClient } = require('./services/folioService');
 *   const folio = getFolioClient('staging');   // or 'production'
 *   const instances = await folio.get('/instance-storage/instances', 'instances', { query: 'title="*"', limit: 10 });
 *   for await (const item of folio.getAll('/item-storage/items', 'items')) { ... }
 */

const got = require('got').got;
const { CookieJar } = require('tough-cookie');
const { config } = require('../config');

// ---------------------------------------------------------------------------
// Configuration — reads from environment via the central config object
// ---------------------------------------------------------------------------

/**
 * Each FOLIO environment needs:
 *   FOLIO_<ENV>_URL        – gateway/okapi base URL
 *   FOLIO_<ENV>_TENANT     – tenant id
 *   FOLIO_<ENV>_USERNAME   – login username
 *   FOLIO_<ENV>_PASSWORD   – login password
 */
const FOLIO_ENVS = {
  staging: {
    url:      process.env.FOLIO_STAGING_URL,
    tenant:   process.env.FOLIO_STAGING_TENANT,
    username: process.env.FOLIO_STAGING_USERNAME,
    password: process.env.FOLIO_STAGING_PASSWORD,
  },
  production: {
    url:      process.env.FOLIO_PRODUCTION_URL,
    tenant:   process.env.FOLIO_PRODUCTION_TENANT,
    username: process.env.FOLIO_PRODUCTION_USERNAME,
    password: process.env.FOLIO_PRODUCTION_PASSWORD,
  },
};

const MLC_NUMBER_GENERATOR = 'mlc_2026';

// Token refresh buffer — re-auth when token expires within this many ms
const TOKEN_REFRESH_BUFFER_MS = 60_000;

// Retry settings
const MAX_RETRIES = 3;
const RETRY_STATUS_CODES = [502, 503, 504];

// ---------------------------------------------------------------------------
// FolioClient class
// ---------------------------------------------------------------------------

class FolioClient {
  /**
   * @param {object} opts
   * @param {string} opts.url       – FOLIO gateway base URL
   * @param {string} opts.tenant    – x-okapi-tenant
   * @param {string} opts.username  – login username
   * @param {string} opts.password  – login password
   */
  constructor({ url, tenant, username, password }) {
    if (!url || !tenant || !username || !password) {
      throw new Error('FolioClient requires url, tenant, username, and password');
    }

    this.url = url.replace(/\/+$/, '');
    this.tenant = tenant;
    this.username = username;
    this.password = password;

    // Token state
    this._accessToken = null;
    this._accessTokenExpires = null;
    this._cookieJar = new CookieJar();

    // Shared got instance with retry + cookie support
    this._client = got.extend({
      prefixUrl: this.url,
      cookieJar: this._cookieJar,
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json',
        'x-okapi-tenant': this.tenant,
      },
      retry: {
        limit: MAX_RETRIES,
        statusCodes: RETRY_STATUS_CODES,
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
      },
      hooks: {
        beforeRequest: [
          async (options) => {
            await this._ensureToken();
            // Set cookie header — got's cookieJar handles this, but we also
            // set the token header for APIs that read it from the header
            if (this._accessToken) {
              options.headers['x-okapi-token'] = this._accessToken;
            }
          },
        ],
        afterResponse: [
          async (response, retryWithMergedOptions) => {
            // If we get a 401, refresh token and retry once
            if (response.statusCode === 401) {
              this._accessToken = null;
              this._accessTokenExpires = null;
              await this._login();
              return retryWithMergedOptions({
                headers: {
                  'x-okapi-token': this._accessToken,
                },
              });
            }
            return response;
          },
        ],
      },
    });

    this._loginPromise = null;
  }

  // -------------------------------------------------------------------------
  // Authentication
  // -------------------------------------------------------------------------

  /**
   * Login to FOLIO and store access/refresh tokens from cookies.
   * Uses /authn/login-with-expiry (modern FOLIO RTR flow).
   */
  async _login() {
    // Deduplicate concurrent login calls
    if (this._loginPromise) return this._loginPromise;

    this._loginPromise = (async () => {
      try {
        // Clear stale cookies so expired refresh tokens don't cause login to 401
        this._cookieJar = new CookieJar();
        this._client = this._client.extend({ cookieJar: this._cookieJar });

        const resp = await got.post(`${this.url}/authn/login-with-expiry`, {
          json: { username: this.username, password: this.password },
          headers: {
            'content-type': 'application/json',
            'accept': 'application/json',
            'x-okapi-tenant': this.tenant,
          },
          cookieJar: this._cookieJar,
          responseType: 'json',
        });

        const body = resp.body;

        // Extract access token from cookie jar
        const cookies = await this._cookieJar.getCookies(this.url);
        const accessCookie = cookies.find(c => c.key === 'folioAccessToken');
        this._accessToken = accessCookie ? accessCookie.value : null;

        // Parse expiry
        if (body.accessTokenExpiration) {
          this._accessTokenExpires = new Date(body.accessTokenExpiration);
        } else {
          // Default to 10 minutes if not provided
          this._accessTokenExpires = new Date(Date.now() + 10 * 60 * 1000);
        }

        console.log(`[FolioClient] Authenticated to ${this.tenant} at ${this.url}`);
      } catch (err) {
        console.error(`[FolioClient] Login failed for ${this.tenant}:`, err.message);
        throw err;
      } finally {
        this._loginPromise = null;
      }
    })();

    return this._loginPromise;
  }

  /**
   * Ensure we have a valid (non-expired) token, refreshing if needed.
   */
  async _ensureToken() {
    if (
      !this._accessToken ||
      !this._accessTokenExpires ||
      Date.now() + TOKEN_REFRESH_BUFFER_MS >= this._accessTokenExpires.getTime()
    ) {
      await this._login();
    }
  }

  // -------------------------------------------------------------------------
  // Core HTTP methods
  // -------------------------------------------------------------------------

  /**
   * GET a FOLIO endpoint.
   *
   * @param {string} path          – e.g. '/instance-storage/instances'
   * @param {string|null} key      – response key containing the results array
   * @param {object|URLSearchParams} [queryParams] – query parameters (query, limit, offset, etc.)
   * @returns {Promise<any>}       – parsed JSON (or the value at `key`)
   */
  async get(path, key = null, queryParams = {}) {
    const searchParams = queryParams instanceof URLSearchParams
      ? queryParams
      : new URLSearchParams(Object.entries(queryParams).map(([k, v]) => [k, String(v)]));
    const resp = await this._client.get(path.replace(/^\//, ''), {
      searchParams,
      responseType: 'json',
    });
    return key ? resp.body[key] : resp.body;
  }

  /**
   * POST to a FOLIO endpoint.
   *
   * @param {string} path          – API path
   * @param {object} payload       – JSON body
   * @param {object} [queryParams] – query parameters
   * @returns {Promise<any>}       – parsed JSON response
   */
  async post(path, payload, queryParams = {}) {
    const resp = await this._client.post(path.replace(/^\//, ''), {
      json: payload,
      searchParams: queryParams,
      responseType: 'json',
    });
    return resp.body;
  }

  /**
   * PUT to a FOLIO endpoint.
   *
   * @param {string} path          – API path
   * @param {object} payload       – JSON body
   * @param {object} [queryParams] – query parameters
   * @returns {Promise<any>}       – parsed JSON response (or null for 204)
   */
  async put(path, payload, queryParams = {}) {
    const resp = await this._client.put(path.replace(/^\//, ''), {
      json: payload,
      searchParams: queryParams,
      responseType: 'json',
    });
    return resp.body;
  }

  /**
   * DELETE a FOLIO resource.
   *
   * @param {string} path          – API path
   * @param {object} [queryParams] – query parameters
   * @returns {Promise<any>}       – parsed JSON response (or null for 204)
   */
  async delete(path, queryParams = {}) {
    const resp = await this._client.delete(path.replace(/^\//, ''), {
      searchParams: queryParams,
    });
    if (resp.statusCode === 204) return null;
    try {
      return JSON.parse(resp.body);
    } catch {
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Pagination
  // -------------------------------------------------------------------------

  /**
   * Async generator that pages through all results for a query.
   *
   * @param {string} path     – API path
   * @param {string} key      – response key for the results array
   * @param {object} [opts]
   * @param {string} [opts.query]  – CQL query string
   * @param {number} [opts.limit]  – page size (default 100)
   * @yields {object} individual records
   *
   * @example
   *   for await (const item of folio.getAll('/item-storage/items', 'items')) {
   *     console.log(item.id);
   *   }
   */
  async *getAll(path, key, { query = 'cql.allRecords=1 sortBy id', limit = 100 } = {}) {
    let offset = 0;

    while (true) {
      const results = await this.get(path, key, { query, limit, offset });

      if (!results || results.length === 0) break;

      for (const record of results) {
        yield record;
      }

      if (results.length < limit) break;

      offset += limit;
    }
  }

  /**
   * Collect all paginated results into an array.
   * Convenience wrapper around getAll for when you want everything in memory.
   *
   * @param {string} path
   * @param {string} key
   * @param {object} [opts]
   * @returns {Promise<Array>}
   */
  async getAllArray(path, key, opts = {}) {
    const results = [];
    for await (const record of this.getAll(path, key, opts)) {
      results.push(record);
    }
    return results;
  }
}

// ---------------------------------------------------------------------------
// Singleton client instances (lazy-initialized)
// ---------------------------------------------------------------------------

const _clients = {};

/**
 * Get (or create) a FolioClient for the given environment.
 *
 * @param {'staging'|'production'} env
 * @returns {FolioClient}
 */
function getFolioClient(env) {
  if (!_clients[env]) {
    const envConfig = FOLIO_ENVS[env];
    if (!envConfig || !envConfig.url) {
      throw new Error(
        `FOLIO ${env} not configured. Set FOLIO_${env.toUpperCase()}_URL, ` +
        `FOLIO_${env.toUpperCase()}_TENANT, FOLIO_${env.toUpperCase()}_USERNAME, ` +
        `FOLIO_${env.toUpperCase()}_PASSWORD in your .env`
      );
    }
    _clients[env] = new FolioClient(envConfig);
  }
  return _clients[env];
}

// ---------------------------------------------------------------------------
// ID (id.loc.gov) helpers
// ---------------------------------------------------------------------------

const ID_BASE_DEFAULT = 'https://preprod-8080.id.loc.gov';

function extractLastModDate(metsXml) {
  const match = metsXml.match(/LASTMODDATE="([^"]+)"/);
  return match ? match[1] : null;
}

async function getIdBibLastModDate(idBase, lccn) {
  const lookupUrl = `${idBase}/resources/instances/identifier/${encodeURIComponent(lccn)}`;
  const lookupRes = await got(lookupUrl, { followRedirect: false, throwHttpErrors: false });

  let instancePath;
  if (lookupRes.statusCode >= 300 && lookupRes.statusCode < 400 && lookupRes.headers.location) {
    const loc = lookupRes.headers.location;
    const idMatch = loc.match(/\/(resources\/instances\/[^/\s?]+)/);
    if (!idMatch) throw new Error(`Could not parse instance path from Location: ${loc}`);
    instancePath = idMatch[1];
  } else if (lookupRes.statusCode === 200) {
    const idMatch = lookupRes.body.match(/\/(resources\/instances\/(in\d+))/);
    if (!idMatch) throw new Error(`LCCN "${lccn}" not found in ID (status ${lookupRes.statusCode})`);
    instancePath = idMatch[1];
  } else {
    throw new Error(`ID lookup for bib LCCN "${lccn}" failed (${lookupRes.statusCode}): ${lookupRes.body.slice(0, 200)}`);
  }

  const instanceId = instancePath.split('/').pop();
  const metsUrl = `${idBase}/${instancePath}.mets.xml`;
  const metsRes = await got(metsUrl, { followRedirect: true, throwHttpErrors: false });
  if (metsRes.statusCode >= 400) {
    throw new Error(`GET ${metsUrl} failed (${metsRes.statusCode})`);
  }
  const lastModDate = extractLastModDate(metsRes.body);
  return { instanceId, lastModDate };
}

async function getIdAuthLastModDate(idBase, lccn) {
  const metsUrl = `${idBase}/authorities/names/${encodeURIComponent(lccn)}.mets.xml`;
  const metsRes = await got(metsUrl, { followRedirect: true, throwHttpErrors: false });
  if (metsRes.statusCode >= 400) {
    throw new Error(`GET ${metsUrl} failed (${metsRes.statusCode})`);
  }
  const lastModDate = extractLastModDate(metsRes.body);
  return { lastModDate };
}

// ---------------------------------------------------------------------------
// FOLIO last-updated lookups
// ---------------------------------------------------------------------------

async function getFolioBibUpdatedDate(folio, lccn) {
  const searchResult = await folio.get('search/instances', null, { query: `lccn="${lccn}"` });
  const instances = searchResult.instances || [];
  if (instances.length === 0) return null;

  const instanceId = instances[0].id;
  const instance = await folio.get(`instance-storage/instances/${instanceId}`);
  return {
    id: instanceId,
    hrid: instance.hrid || null,
    updatedDate: (instance.metadata && instance.metadata.updatedDate) || null,
  };
}

async function getFolioAuthorityUpdatedDate(folio, lccn) {
  const cleanLccn = lccn.replace(/\s+/g, '');
  const searchResult = await folio.get('search/authorities', null, { query: `naturalId="${cleanLccn}"` });
  const authorities = searchResult.authorities || [];
  if (authorities.length === 0) return null;

  const authId = authorities[0].id;
  const authority = await folio.get(`authority-storage/authorities/${authId}`);
  return {
    id: authId,
    naturalId: authority.naturalId || null,
    updatedDate: authority.updatedDate || (authority.metadata && authority.metadata.updatedDate) || null,
  };
}

// ---------------------------------------------------------------------------
// Comparison helpers
// ---------------------------------------------------------------------------

function timeAgo(date) {
  const now = new Date();
  const diffMs = now - date;
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ago`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return `${seconds}s ago`;
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function compareResults(folioDate, idDate) {
  const folio = folioDate ? new Date(folioDate) : null;
  const id = idDate ? new Date(idDate) : null;

  const result = {};
  if (folio) {
    result.folio = { date: folioDate, ago: timeAgo(folio) };
  } else {
    result.folio = { error: 'not found' };
  }
  if (id) {
    result.id = { date: idDate, ago: timeAgo(id) };
  } else {
    result.id = { error: 'not found' };
  }

  if (folio && id) {
    if (folio > id) {
      result.newerIn = 'FOLIO';
      result.difference = formatDuration(folio - id);
    } else if (id > folio) {
      result.newerIn = 'ID';
      result.difference = formatDuration(id - folio);
    } else {
      result.newerIn = 'same';
      result.difference = '0s';
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// High-level last-updated function
// ---------------------------------------------------------------------------

/**
 * Compare last-updated dates for bib and/or authority records between FOLIO and ID.
 *
 * @param {string} env           – 'staging' or 'production'
 * @param {object} opts
 * @param {string} [opts.bibLccn]  – bib LCCN to look up
 * @param {string} [opts.authLccn] – authority LCCN to look up
 * @param {string} [opts.idBase]   – override id.loc.gov base URL
 * @returns {Promise<object>}
 */
async function getLastUpdatedComparison(env, { bibLccn, authLccn, idBase } = {}) {
  const folio = getFolioClient(env);
  const base = (idBase || ID_BASE_DEFAULT).replace(/\/+$/, '');
  const output = {};

  if (bibLccn) {
    const [folioBib, idBib] = await Promise.all([
      getFolioBibUpdatedDate(folio, bibLccn).catch(e => ({ error: e.message })),
      getIdBibLastModDate(base, bibLccn).catch(e => ({ error: e.message })),
    ]);

    const folioDate = folioBib && !folioBib.error ? folioBib.updatedDate : null;
    const idDate = idBib && !idBib.error ? idBib.lastModDate : null;

    output.bib = {
      lccn: bibLccn,
      folio: folioBib && !folioBib.error ? folioBib : { error: folioBib?.error || `No instance found for LCCN "${bibLccn}"` },
      id: idBib && !idBib.error ? idBib : { error: idBib?.error || 'Not found in ID' },
      comparison: compareResults(folioDate, idDate),
    };
  }

  if (authLccn) {
    const [folioAuth, idAuth] = await Promise.all([
      getFolioAuthorityUpdatedDate(folio, authLccn).catch(e => ({ error: e.message })),
      getIdAuthLastModDate(base, authLccn).catch(e => ({ error: e.message })),
    ]);

    const folioDate = folioAuth && !folioAuth.error ? folioAuth.updatedDate : null;
    const idDate = idAuth && !idAuth.error ? idAuth.lastModDate : null;

    output.authority = {
      lccn: authLccn,
      folio: folioAuth && !folioAuth.error ? folioAuth : { error: folioAuth?.error || `No authority found for LCCN "${authLccn}"` },
      id: idAuth && !idAuth.error ? idAuth : { error: idAuth?.error || 'Not found in ID' },
      comparison: compareResults(folioDate, idDate),
    };
  }

  return output;
}

module.exports = { FolioClient, getFolioClient, MLC_NUMBER_GENERATOR, getLastUpdatedComparison };
