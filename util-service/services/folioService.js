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

module.exports = { FolioClient, getFolioClient, MLC_NUMBER_GENERATOR };
