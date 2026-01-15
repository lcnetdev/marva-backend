/**
 * Publishing Routes
 *
 * Handles publishing to MarkLogic:
 * - POST /publish/production - Publish RDF to production
 * - POST /publish/staging - Publish RDF to staging
 * - POST /nacostub/production - Publish NACO stub to production
 * - POST /nacostub/staging - Publish NACO stub to staging
 * - POST /validate/:loc - Validate RDF
 * - POST /copycat/upload/:location - Upload MARC from copycat
 */

const express = require('express');
const got = require('got');
const { config, getMarkLogicConfig } = require('../config');
const { validateBibframe } = require('../services/bfValidationService');

/**
 * Create publishing routes
 * @param {object} options - Configuration options
 * @param {Array} options.postLog - Shared post log array
 * @returns {Router} Express router
 */
function createPublishingRoutes(options) {
  const router = express.Router();
  const { postLog } = options;

  /**
   * Sanitize error string by removing credentials
   * @param {string} errString - Error string to sanitize
   * @param {string} user - Username to remove
   * @param {string} pass - Password to remove
   * @returns {string} Sanitized string
   */
  function sanitizeError(errString, user, pass) {
    let replace = `${user}|${pass}`;
    let re = new RegExp(replace, 'g');
    return errString.replace(re, "'****'");
  }

  /**
   * Add entry to post log with max size limit
   * @param {object} entry - Log entry to add
   */
  function addToPostLog(entry) {
    postLog.push(entry);
    if (postLog.length > 50) {
      postLog.shift();
    }
  }

  // ============================================
  // PUBLISH ENDPOINTS
  // ============================================

  /**
   * POST /publish/production - Publish RDF to production MarkLogic
   */
  router.post('/publish/production', async (req, res) => {
    const name = req.body.name + '.rdf';
    const rdfxml = req.body.rdfxml;
    const mlConfig = getMarkLogicConfig('production');

    let endpoint = '/controllers/ingest/bf-bib.xqy';
    if (req.body.hub === true) {
      endpoint = '/controllers/ingest/bf-hub.xqy';
    }

    const url = 'https://' + mlConfig.postUrl.trim() + endpoint;

    const postLogEntry = {
      postingDate: new Date(),
      postingEnv: 'production',
      postingTo: url,
      postingXML: req.body.rdfxml
    };

    try {
      const postResponse = await got.post(url, {
        body: rdfxml,
        username: mlConfig.user,
        password: mlConfig.pass,
        headers: {
          'Content-type': 'application/xml',
          'user-agent': 'marva-backend'
        }
      });

      postLogEntry.postingStatus = 'success';
      postLogEntry.postingStatusCode = 200;
      postLogEntry.postingBodyResponse = postResponse.body;
      postLogEntry.postingName = req.body.name;
      addToPostLog(postLogEntry);

      let postStatus = { status: 'published' };
      if (postResponse.statusCode != 201 && postResponse.statusCode != 204) {
        postStatus = { status: 'error', server: url, message: postResponse.statusCode };
      }

      let postLocation = null;
      if (postResponse.headers && postResponse.headers.location) {
        postLocation = postResponse.headers.location;
      }

      res.json({
        name: req.body.name,
        publish: postStatus,
        postLocation: postLocation
      });

    } catch (err) {
      postLogEntry.postingStatus = 'error';
      postLogEntry.postingStatusCode = err.response?.statusCode;
      postLogEntry.postingBodyResponse = err.response?.body;
      postLogEntry.postingBodyName = req.body.name;
      postLogEntry.postingEid = req.body.eid;
      addToPostLog(postLogEntry);

      let errString = JSON.stringify(err.response?.body || err.message);
      errString = sanitizeError(errString, mlConfig.user, mlConfig.pass);

      res.status(500).json({
        name: req.body.name,
        objid: 'objid',
        publish: { status: 'error', server: url, message: JSON.parse(errString) }
      });
    }
  });

  /**
   * POST /publish/staging - Publish RDF to staging MarkLogic
   */
  router.post('/publish/staging', async (req, res) => {
    const name = req.body.name + '.rdf';
    const rdfxml = req.body.rdfxml;
    const mlConfig = getMarkLogicConfig('staging');

    let endpoint = '/controllers/ingest/bf-bib.xqy';
    if (req.body.hub === true) {
      endpoint = '/controllers/ingest/bf-hub.xqy';
      console.log('using Hub END POInT');
    }

    const url = 'https://' + mlConfig.postUrl.trim() + endpoint;
    console.log('------');
    console.log(req.body.rdfxml);
    console.log('------');
    console.log('posting to', url);

    const postLogEntry = {
      postingDate: new Date(),
      postingEnv: 'staging',
      postingTo: url,
      postingXML: req.body.rdfxml
    };

    try {
      const postResponse = await got.post(url, {
        body: rdfxml,
        username: mlConfig.user,
        password: mlConfig.pass,
        headers: {
          'Content-type': 'application/xml',
          'user-agent': 'marva-backend'
        }
      });

      postLogEntry.postingStatus = 'success';
      postLogEntry.postingStatusCode = postResponse.statusCode;
      postLogEntry.postingBodyResponse = postResponse.body;
      postLogEntry.postingName = req.body.name;
      addToPostLog(postLogEntry);

      let postStatus = { status: 'published' };
      if (postResponse.statusCode != 201 && postResponse.statusCode != 204) {
        postStatus = { status: 'error', server: url, message: postResponse.statusCode };
      }

      let postLocation = null;
      if (postResponse.headers && postResponse.headers.location) {
        postLocation = postResponse.headers.location;
      }

      res.json({
        name: req.body.name,
        publish: postStatus,
        postLocation: postLocation
      });

    } catch (err) {
      console.error(err);

      let errString = JSON.stringify(err);
      errString = sanitizeError(errString, mlConfig.user, mlConfig.pass);
      const errParsed = JSON.parse(errString);

      console.log('-----errString------');
      console.log(errString);
      console.log('----------------------');
      console.log('ERror code', errParsed.StatusCodeError);

      postLogEntry.postingStatus = 'error';
      postLogEntry.postingStatusCode = errParsed.StatusCodeError;
      postLogEntry.postingBodyResponse = err.response?.body;
      postLogEntry.postingBodyName = req.body.name;
      postLogEntry.postingEid = req.body.eid;
      addToPostLog(postLogEntry);

      res.status(500).json({
        name: req.body.name,
        objid: 'objid',
        publish: { status: 'error', server: url, message: err.response?.body }
      });
    }
  });

  // ============================================
  // NACO STUB ENDPOINTS
  // ============================================

  /**
   * POST /nacostub/staging - Publish NACO stub to staging
   */
  router.post('/nacostub/staging', async (req, res) => {
    const name = req.body.name + '.xml';
    const marcxml = req.body.marcxml;
    const mlConfig = getMarkLogicConfig('staging');

    const endpoint = '/controllers/ingest/marc-auth.xqy';
    const url = 'https://' + mlConfig.nacoStub.trim() + endpoint;

    console.log('------');
    console.log(req.body.marcxml);
    console.log('------');
    console.log('posting to', url);

    const postLogEntry = {
      postingDate: new Date(),
      postingEnv: 'staging',
      postingTo: url,
      postingXML: req.body.marcxml
    };

    try {
      const postResponse = await got.post(url, {
        body: marcxml,
        username: mlConfig.user,
        password: mlConfig.pass,
        headers: {
          'Content-type': 'application/xml',
          'user-agent': 'marva-backend'
        }
      });

      postLogEntry.postingStatus = 'success';
      postLogEntry.postingStatusCode = postResponse.statusCode;
      postLogEntry.postingBodyResponse = postResponse.body;
      addToPostLog(postLogEntry);

      let postStatus = { status: 'published' };
      if (postResponse.statusCode != 201 && postResponse.statusCode != 204) {
        postStatus = { status: 'error', server: url, message: postResponse.statusCode };
      }

      let postLocation = null;
      if (postResponse.headers && postResponse.headers.location) {
        postLocation = postResponse.headers.location;
      }

      res.json({
        publish: postStatus,
        postLocation: postLocation
      });

    } catch (err) {
      console.error(err);

      let errorMessage = 'No Message';
      if (err && err.response) {
        console.log('err response:');
        console.log(err.response);
        if (err.response.body) {
          errorMessage = err.response.body;
        }
      } else {
        console.log('No Error response!');
      }

      let errString = JSON.stringify(err);
      errString = sanitizeError(errString, mlConfig.user, mlConfig.pass);
      const errParsed = JSON.parse(errString);

      console.log('-----errString------');
      console.log(errString);
      console.log('----------------------');
      console.log('ERror code', errParsed.StatusCodeError);

      postLogEntry.postingStatus = 'error';
      postLogEntry.postingStatusCode = errParsed?.StatusCodeError || 'No err.StatusCodeError';
      postLogEntry.postingBodyResponse = err.response?.body || 'no err.response.body';
      addToPostLog(postLogEntry);

      res.status(500).json({
        name: req.body.name,
        objid: 'objid',
        publish: {
          status: 'error',
          server: url,
          message: err.response?.body || 'No body text?',
          errorMessage: errorMessage
        }
      });
    }
  });

  /**
   * POST /nacostub/production - Publish NACO stub to production
   */
  router.post('/nacostub/production', async (req, res) => {
    const name = req.body.name + '.xml';
    const marcxml = req.body.marcxml;
    const mlConfig = getMarkLogicConfig('production');

    const endpoint = '/controllers/ingest/marc-auth.xqy';
    const url = 'https://' + mlConfig.nacoStub.trim() + endpoint;

    console.log('------');
    console.log(req.body.marcxml);
    console.log('------');
    console.log('posting to', url);

    const postLogEntry = {
      postingDate: new Date(),
      postingEnv: 'production',
      postingTo: url,
      postingXML: req.body.marcxml
    };

    try {
      const postResponse = await got.post(url, {
        body: marcxml,
        username: mlConfig.user,
        password: mlConfig.pass,
        headers: {
          'Content-type': 'application/xml',
          'user-agent': 'marva-backend'
        }
      });

      postLogEntry.postingStatus = 'success';
      postLogEntry.postingStatusCode = postResponse.statusCode;
      postLogEntry.postingBodyResponse = postResponse.body;
      addToPostLog(postLogEntry);

      let postStatus = { status: 'published' };
      if (postResponse.statusCode != 201 && postResponse.statusCode != 204) {
        postStatus = { status: 'error', server: url, message: postResponse.statusCode };
      }

      let postLocation = null;
      if (postResponse.headers && postResponse.headers.location) {
        postLocation = postResponse.headers.location;
      }

      res.json({
        publish: postStatus,
        postLocation: postLocation
      });

    } catch (err) {
      console.error(err);

      let errorMessage = 'No Message';
      if (err && err.response) {
        if (err.response.body) {
          errorMessage = err.response.body;
        }
      }

      let errString = JSON.stringify(err);
      errString = sanitizeError(errString, mlConfig.user, mlConfig.pass);
      const errParsed = JSON.parse(errString);

      postLogEntry.postingStatus = 'error';
      postLogEntry.postingStatusCode = errParsed?.StatusCodeError || 'No err.StatusCodeError';
      postLogEntry.postingBodyResponse = err.response?.body || 'no err.response.body';
      addToPostLog(postLogEntry);

      res.status(500).json({
        name: req.body.name,
        objid: 'objid',
        publish: {
          status: 'error',
          server: url,
          message: err.response?.body || 'No body text?',
          errorMessage: errorMessage
        }
      });
    }
  });

  // ============================================
  // VALIDATION ENDPOINT
  // ============================================

  /**
   * POST /validate/:loc - Validate RDF against MarkLogic or locally
   */
  router.post('/validate/:loc', async (req, res) => {
    const rdfxml = req.body.rdfxml;

    // Use local validation if BFORGMODE flag is set
    if (config.features.bfOrgMode) {
      console.log('Using local BIBFRAME validation');
      try {
        const validationMSG = validateBibframe(rdfxml);
        return res.json({
          status: { status: 'validated' },
          validation: validationMSG
        });
      } catch (err) {
        console.error('Local validation error:', err);
        return res.status(500).json({
          validated: { status: 'error', server: 'local', message: err.message }
        });
      }
    }

    // Remote MarkLogic validation
    const mlConfig = getMarkLogicConfig('production');
    const endpoint = '/controllers/xqapi-validate-resource.xqy';
    let url = 'https://' + config.marklogic.validationUrl.trim() + endpoint;

    console.log('validating against: ', url);
    const loc = req.params.loc;
    if (loc == 'stage') {
      url = url.replace('preprod', 'preprod-8299');
    }

    const postLogEntry = {
      postingDate: new Date(),
      postingEnv: 'production',
      postingTo: url,
      postingXML: req.body.rdfxml
    };

    try {
      const postResponse = await got.post(url, {
        body: rdfxml,
        username: mlConfig.user,
        password: mlConfig.pass,
        headers: {
          'Content-type': 'application/xml',
          'user-agent': 'marva-backend'
        }
      });

      postLogEntry.postingStatus = 'success';
      postLogEntry.postingStatusCode = 200;
      postLogEntry.postingBodyResponse = postResponse.body;
      postLogEntry.postingName = req.body.name;
      addToPostLog(postLogEntry);

      let postStatus = { status: 'validated' };
      if (postResponse.statusCode != 200) {
        postStatus = { status: 'error', server: url, message: postResponse.statusCode };
      }

      let data = postResponse.body.replace(/(\r\n|\n|\r)/gm, '');
      const msg = data.replace(/.*<!--(.*?)-->.*/g, '$1');

      let validationMSG = null;
      try {
        validationMSG = JSON.parse(msg);
      } catch (error) {
        if (error instanceof SyntaxError) {
          validationMSG = [{ level: 'SUCCESS', message: 'No issues found.' }];
        } else {
          validationMSG = [{ level: 'ERROR', message: 'Something when wrong: ' + error.message }];
        }
      }

      res.json({
        status: postStatus,
        validation: validationMSG
      });

    } catch (err) {
      console.log('----------------------');
      console.log('Error: ', err);
      console.log('::::::::::::::::::::::');

      postLogEntry.postingStatus = 'error';
      postLogEntry.postingStatusCode = err.code;
      postLogEntry.postingBodyResponse = err.message;
      postLogEntry.postingBodyName = req.body.name;
      postLogEntry.postingEid = req.body.eid;
      addToPostLog(postLogEntry);

      let errString = JSON.stringify(err.message);
      errString = sanitizeError(errString, mlConfig.user, mlConfig.pass);
      const errParsed = JSON.parse(errString);

      res.status(500).json({
        validated: { status: 'error', server: url, message: errParsed }
      });
    }
  });

  // ============================================
  // COPYCAT ENDPOINT
  // ============================================

  /**
   * POST /copycat/upload/:location - Upload MARC from copycat
   */
  router.post('/copycat/upload/:location', async (req, res) => {
    const location = req.params.location;
    const endpoint = '/controllers/ingest/marc-bib.xqy';
    const mlConfig = getMarkLogicConfig(location === 'prod' ? 'production' : 'staging');

    let url = '';
    if (location == 'prod') {
      url = 'https://' + mlConfig.ccUrl.trim() + endpoint;
    } else {
      url = 'https://' + mlConfig.ccUrl.trim() + endpoint;
    }

    const marcxml = req.body.marcxml;

    const postLogEntry = {
      copyCatDate: new Date(),
      copyCatEnv: location,
      copyCatTo: url,
      copyCatXML: req.body.marcxml
    };

    try {
      const postResponse = await got.post(url, {
        body: marcxml,
        username: mlConfig.user,
        password: mlConfig.pass,
        headers: {
          'Content-type': 'application/xml',
          'user-agent': 'marva-backend'
        }
      });

      postLogEntry.copyCatStatus = 'success';
      postLogEntry.copyCatStatusCode = 200;
      postLogEntry.copyCatBodyResponse = postResponse.body;
      postLogEntry.copyCatName = req.body.name;
      addToPostLog(postLogEntry);

      let copyCatStatus = { status: 'published' };
      if (postResponse.statusCode != 201 && postResponse.statusCode != 204) {
        copyCatStatus = { status: 'error', server: url, message: postResponse.statusCode };
      }

      let postLocation = null;
      if (postResponse.headers && postResponse.headers.location) {
        postLocation = postResponse.headers.location;
      }

      res.json({
        name: req.body.name,
        copyCatStat: copyCatStatus,
        postLocation: postLocation
      });

    } catch (err) {
      console.log('err: ', err);

      postLogEntry.postingStatus = 'error';
      postLogEntry.postingStatusCode = err.response?.statusCode;
      postLogEntry.postingBodyResponse = err.response?.body;
      postLogEntry.postingBodyName = req.body.name;
      postLogEntry.postingEid = req.body.eid;
      addToPostLog(postLogEntry);

      let errString = JSON.stringify(err.response?.body || err.message);
      errString = sanitizeError(errString, mlConfig.user, mlConfig.pass);
      const errParsed = JSON.parse(errString);

      res.status(500).json({
        name: req.body.name,
        objid: 'objid',
        publish: { status: 'error', server: url, message: errParsed }
      });
    }
  });

  return router;
}

module.exports = { createPublishingRoutes };
