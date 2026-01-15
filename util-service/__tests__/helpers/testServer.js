const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

/**
 * Create a minimal test Express app with routes that mirror the production server
 * This allows us to test the route logic in isolation with a test database
 */
function createTestApp(mongoUri, options = {}) {
  const app = express();

  app.use(express.json({ limit: '15mb' }));
  app.use(cors({ origin: true }));

  // Store shared state similar to the actual server
  const state = {
    nacoIdObj: options.nacoIdObj || { id: 2025700001 },
    marva001Obj: options.marva001Obj || { id: 1260000000 },
    postLog: [],
    recsStageByEid: {},
    recsProdByEid: {},
    recsStageByUser: {},
    recsProdByUser: {}
  };

  // Helper for basic auth check
  const checkBasicAuth = (req, envVar) => {
    const password = process.env[envVar]?.replace(/"/g, '') || 'testpassword';
    const correctLogin = Buffer.from(`${password}:${password}`).toString('base64');
    return req.headers.authorization === `Basic ${correctLogin}`;
  };

  // Version endpoints
  app.get('/version/editor', (req, res) => {
    res.json({ major: 0, minor: 0, patch: 0 });
  });

  app.get('/version/editor/stage', (req, res) => {
    res.json({ major: 0, minor: 8, patch: 0 });
  });

  // LCCN NACO ID generation
  app.get('/lccnnaco', async (req, res) => {
    state.nacoIdObj.id++;
    res.json(state.nacoIdObj);

    // Update database
    try {
      const client = await MongoClient.connect(mongoUri);
      const db = client.db('bfe2_test');
      if (state.nacoIdObj._id) {
        await db.collection('lccnNACO').updateOne(
          { _id: new ObjectId(state.nacoIdObj._id) },
          { $set: { id: state.nacoIdObj.id } }
        );
      }
      await client.close();
    } catch (err) {
      console.error('Error updating lccnNACO:', err);
    }
  });

  app.get('/lccnnaco/set/:set', (req, res) => {
    if (!checkBasicAuth(req, 'DEPLOYPW')) {
      return res.set('WWW-Authenticate', 'Basic').status(401).send('Authentication required.');
    }

    const setTo = parseInt(req.params.set);
    if (isNaN(setTo)) {
      return res.status(400).send('Invalid value');
    }

    state.nacoIdObj.id = setTo;
    res.status(200).send('Set to:' + setTo);
  });

  // MARVA 001 ID generation
  app.get('/marva001', async (req, res) => {
    let currentNumber = state.marva001Obj.id;
    const month = new Date().getMonth();
    const fullYear = new Date().getFullYear();
    const currentYear = fullYear.toString().slice(-2);
    let recordYear = String(currentNumber).slice(1, 3);

    // Year change handling
    if (month === 1 && recordYear < currentYear) {
      state.marva001Obj.id = currentNumber + 10000000;
      state.marva001Obj.id = Number(String(state.marva001Obj.id).slice(0, 3) + '0000000');
    }

    let number = 'in0' + state.marva001Obj.id;
    state.marva001Obj.id++;

    res.json({ marva001: number });

    // Update database
    try {
      const client = await MongoClient.connect(mongoUri);
      const db = client.db('bfe2_test');
      if (state.marva001Obj._id) {
        await db.collection('marva001').updateOne(
          { _id: new ObjectId(state.marva001Obj._id) },
          { $set: { id: state.marva001Obj.id } }
        );
      }
      await client.close();
    } catch (err) {
      console.error('Error updating marva001:', err);
    }
  });

  app.get('/marva001/set/:set', (req, res) => {
    if (!checkBasicAuth(req, 'DEPLOYPW')) {
      return res.set('WWW-Authenticate', 'Basic').status(401).send('Authentication required.');
    }

    const setTo = parseInt(req.params.set);
    if (isNaN(setTo)) {
      return res.status(400).send('Invalid value');
    }

    state.marva001Obj.id = setTo;
    res.status(200).send('Set "marva001" to:' + setTo);
  });

  // User Preferences
  app.post('/prefs/:user', async (req, res) => {
    const user = req.params.user;
    const newPrefs = req.body;

    try {
      const client = await MongoClient.connect(mongoUri);
      const db = client.db('bfe2_test');
      const doc = await db.collection('userPrefs').findOne({ user });

      if (!doc) {
        await db.collection('userPrefs').insertOne({
          user,
          prefs: JSON.stringify(newPrefs)
        });
        await client.close();
        return res.status(200).json({ msg: 'Success!' });
      } else {
        await db.collection('userPrefs').updateOne(
          { _id: new ObjectId(doc._id) },
          { $set: { prefs: JSON.stringify(newPrefs) } }
        );
        await client.close();
        return res.status(200).json({ msg: 'updated' });
      }
    } catch (err) {
      return res.status(500).json({ msg: 'Error: ' + err.message });
    }
  });

  app.get('/prefs/:user', async (req, res) => {
    const user = req.params.user;

    try {
      const client = await MongoClient.connect(mongoUri);
      const db = client.db('bfe2_test');
      const doc = await db.collection('userPrefs').findOne({ user });
      await client.close();

      if (!doc) {
        return res.status(200).json({ result: {} });
      }

      try {
        const prefs = JSON.parse(doc.prefs);
        return res.status(200).json({ result: prefs });
      } catch (parseErr) {
        return res.status(500).json({ result: 'Failed to parse prefs: ' + parseErr.message });
      }
    } catch (err) {
      return res.status(500).json({ result: 'Error: ' + err.message });
    }
  });

  // Templates
  app.post('/templates', async (req, res) => {
    try {
      const client = await MongoClient.connect(mongoUri);
      const db = client.db('bfe2_test');
      const doc = await db.collection('templates').findOne({ id: req.body.id });

      if (doc) {
        await db.collection('templates').updateOne(
          { _id: new ObjectId(doc._id) },
          { $set: req.body }
        );
      } else {
        await db.collection('templates').insertOne(req.body);
      }

      await client.close();
      return res.status(200).send('yeah :)');
    } catch (err) {
      return res.status(500).send('Error: ' + err.message);
    }
  });

  app.get('/templates/:user', async (req, res) => {
    try {
      const client = await MongoClient.connect(mongoUri);
      const db = client.db('bfe2_test');
      const result = await db.collection('templates').find({ user: req.params.user }).toArray();
      await client.close();
      return res.status(200).json(result);
    } catch (err) {
      return res.status(500).json([]);
    }
  });

  app.get('/copytemplate/:user/:id', async (req, res) => {
    try {
      const client = await MongoClient.connect(mongoUri);
      const db = client.db('bfe2_test');
      const doc = await db.collection('templates').findOne({ id: req.params.id });

      if (!doc) {
        await client.close();
        return res.status(500).send('Could not find that ID to copy');
      }

      delete doc._id;
      doc.id = crypto.createHash('md5').update(`${Date.now()}${req.params.user}`).digest('hex');
      doc.user = req.params.user;
      doc.timestamp = Date.now() / 1000;

      await db.collection('templates').insertOne(doc);
      await client.close();
      return res.status(200).send('Template copied');
    } catch (err) {
      return res.status(500).send('Error: ' + err.message);
    }
  });

  app.delete('/templates/:doc', async (req, res) => {
    try {
      const client = await MongoClient.connect(mongoUri);
      const db = client.db('bfe2_test');
      const doc = await db.collection('templates').findOne({ id: req.params.doc });

      if (doc) {
        await db.collection('templates').deleteOne({ _id: new ObjectId(doc._id) });
      } else {
        await client.close();
        return res.status(500).send('Could not find that ID to remove');
      }

      await client.close();
      return res.status(200).send('yeah :)');
    } catch (err) {
      return res.status(500).send('Error: ' + err.message);
    }
  });

  // Error Reports
  app.post('/error/report', async (req, res) => {
    try {
      const client = await MongoClient.connect(mongoUri);
      const db = client.db('bfe2_test');

      const body = { ...req.body };
      if (body.activeProfile && typeof body.activeProfile === 'object') {
        body.activeProfile = JSON.stringify(body.activeProfile);
      }

      await db.collection('errorReports').insertOne(body);
      await client.close();
      return res.json({ result: true, error: null });
    } catch (err) {
      return res.json({ result: false, error: err.message });
    }
  });

  app.get('/error/report', async (req, res) => {
    try {
      const client = await MongoClient.connect(mongoUri);
      const db = client.db('bfe2_test');
      const results = await db.collection('errorReports').find({}).toArray();
      await client.close();

      const formatted = results.map(doc => ({
        id: doc._id,
        eId: doc.eId,
        desc: doc.desc,
        contact: doc.contact
      }));

      return res.json(formatted.reverse());
    } catch (err) {
      return res.json([]);
    }
  });

  app.get('/error/:errorId', async (req, res) => {
    try {
      new ObjectId(req.params.errorId);
    } catch {
      return res.json(false);
    }

    try {
      const client = await MongoClient.connect(mongoUri);
      const db = client.db('bfe2_test');
      const doc = await db.collection('errorReports').findOne({
        _id: new ObjectId(req.params.errorId)
      });
      await client.close();

      if (!doc) {
        return res.json(false);
      }

      const profile = JSON.parse(doc.activeProfile);
      return res.type('json').send(JSON.stringify(profile, null, 2) + '\n');
    } catch (err) {
      return res.json(false);
    }
  });

  // Records endpoints
  app.get('/myrecords/production/:user', (req, res) => {
    if (req.params.user) {
      res.json(state.recsProdByUser[req.params.user] || {});
    } else {
      res.json({});
    }
  });

  app.get('/myrecords/staging/:user', (req, res) => {
    if (req.params.user) {
      res.json(state.recsStageByUser[req.params.user] || {});
    } else {
      res.json({});
    }
  });

  app.get('/allrecords/production', (req, res) => {
    res.json(state.recsProdByEid);
  });

  app.get('/allrecords/staging', (req, res) => {
    res.json(state.recsStageByEid);
  });

  app.get('/allrecords/production/stats', async (req, res) => {
    try {
      const client = await MongoClient.connect(mongoUri);
      const db = client.db('bfe2_test');

      const results = await db.collection('resourcesProduction').aggregate([
        {
          $facet: {
            totalCount: [{ $count: 'count' }],
            withIndex: [
              { $match: { index: { $exists: true } } },
              { $count: 'count' }
            ],
            byUser: [
              { $match: { 'index.user': { $exists: true } } },
              { $group: { _id: '$index.user', count: { $sum: 1 } } },
              { $sort: { count: -1 } }
            ],
            byStatus: [
              { $match: { 'index.status': { $exists: true } } },
              { $group: { _id: '$index.status', count: { $sum: 1 } } }
            ]
          }
        }
      ]).toArray();

      await client.close();

      const data = results[0] || {};
      const stats = {
        totalRecords: (data.totalCount?.[0]?.count) || 0,
        recordsWithIndex: (data.withIndex?.[0]?.count) || 0,
        users: {},
        statuses: {}
      };

      (data.byUser || []).forEach(u => {
        stats.users[u._id] = u.count;
      });

      (data.byStatus || []).forEach(s => {
        stats.statuses[s._id] = s.count;
      });

      return res.json(stats);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/delete/:stage/:user/:eid', async (req, res) => {
    const { stage, user, eid } = req.params;
    let result = false;

    if (stage === 'staging') {
      if (state.recsStageByUser[user]?.[eid]) {
        state.recsStageByUser[user][eid].status = 'deleted';
        result = true;
      }
      if (state.recsStageByEid[eid]) {
        state.recsStageByEid[eid].status = 'deleted';
        result = true;
      }
    } else {
      if (state.recsProdByUser[user]?.[eid]) {
        state.recsProdByUser[user][eid].status = 'deleted';
        result = true;
      }
      if (state.recsProdByEid[eid]) {
        state.recsProdByEid[eid].status = 'deleted';
        result = true;
      }
    }

    return res.json({ result });
  });

  // Post logs
  app.get('/logs/posts', (req, res) => {
    res.json(state.postLog);
  });

  // Status endpoint
  app.get('/status', (req, res) => {
    res.json({
      status: {
        updates: {
          lastUpdateNames: '2024-01-15T12:00:00Z',
          lastUpdateSubjects: '2024-01-15T11:30:00Z'
        }
      }
    });
  });

  // Cleanup endpoints
  app.get('/cleanup/old-records', (req, res) => {
    if (req.query.confirm !== 'yes-delete-old-records') {
      return res.status(400).json({
        error: 'Missing or invalid confirmation parameter',
        usage: 'GET /cleanup/old-records?confirm=yes-delete-old-records'
      });
    }
    return res.json({ status: 'started', message: 'Cleanup job started' });
  });

  app.get('/cleanup/old-records/status', (req, res) => {
    res.json({ running: false, lastRun: null, lastResult: null });
  });

  // LDP Record Storage endpoints (migrated from ldpjs)
  // Use the same rdfParser as production code
  const { extractIndexFromRdf } = require('../../utils/rdfParser');

  // Raw body parser middleware for RDF/XML
  app.use('/api-staging/ldp', express.text({ type: 'application/rdf+xml', limit: '15mb' }));
  app.use('/api-production/ldp', express.text({ type: 'application/rdf+xml', limit: '15mb' }));

  // PUT /api-staging/ldp/:eid - Store RDF record in staging
  app.put('/api-staging/ldp/:eid', async (req, res) => {
    const eid = req.params.eid;
    const rdfContent = req.body;

    if (!rdfContent || rdfContent.trim() === '') {
      return res.status(400).json({ error: 'Empty RDF content' });
    }

    try {
      const client = await MongoClient.connect(mongoUri);
      const db = client.db('bfe2_test');

      const index = extractIndexFromRdf(rdfContent);
      index.eid = eid; // URL eid takes precedence

      const doc = await db.collection('resourcesStaging').findOne({ 'index.eid': eid });

      if (doc) {
        await db.collection('resourcesStaging').updateOne(
          { _id: new ObjectId(doc._id) },
          { $set: { index, data: rdfContent } }
        );
      } else {
        await db.collection('resourcesStaging').insertOne({ index, data: rdfContent });
      }

      // Update in-memory cache
      state.recsStageByEid[eid] = index;
      if (index.user) {
        if (!state.recsStageByUser[index.user]) {
          state.recsStageByUser[index.user] = {};
        }
        state.recsStageByUser[index.user][eid] = index;
      }

      await client.close();
      return res.json({ status: 'success' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /api-staging/ldp/:eid - Retrieve RDF record from staging
  app.get('/api-staging/ldp/:eid', async (req, res) => {
    const eid = req.params.eid;

    try {
      const client = await MongoClient.connect(mongoUri);
      const db = client.db('bfe2_test');
      const doc = await db.collection('resourcesStaging').findOne({ 'index.eid': eid });
      await client.close();

      if (!doc) {
        return res.status(404).json({ error: 'Record not found' });
      }

      return res.type('application/rdf+xml').send(doc.data);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // PUT /api-production/ldp/:eid - Store RDF record in production
  app.put('/api-production/ldp/:eid', async (req, res) => {
    const eid = req.params.eid;
    const rdfContent = req.body;

    if (!rdfContent || rdfContent.trim() === '') {
      return res.status(400).json({ error: 'Empty RDF content' });
    }

    try {
      const client = await MongoClient.connect(mongoUri);
      const db = client.db('bfe2_test');

      const index = extractIndexFromRdf(rdfContent);
      index.eid = eid; // URL eid takes precedence

      const doc = await db.collection('resourcesProduction').findOne({ 'index.eid': eid });

      if (doc) {
        await db.collection('resourcesProduction').updateOne(
          { _id: new ObjectId(doc._id) },
          { $set: { index, data: rdfContent } }
        );
      } else {
        await db.collection('resourcesProduction').insertOne({ index, data: rdfContent });
      }

      // Update in-memory cache
      state.recsProdByEid[eid] = index;
      if (index.user) {
        if (!state.recsProdByUser[index.user]) {
          state.recsProdByUser[index.user] = {};
        }
        state.recsProdByUser[index.user][eid] = index;
      }

      await client.close();
      return res.json({ status: 'success' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /api-production/ldp/:eid - Retrieve RDF record from production
  app.get('/api-production/ldp/:eid', async (req, res) => {
    const eid = req.params.eid;

    try {
      const client = await MongoClient.connect(mongoUri);
      const db = client.db('bfe2_test');
      const doc = await db.collection('resourcesProduction').findOne({ 'index.eid': eid });
      await client.close();

      if (!doc) {
        return res.status(404).json({ error: 'Record not found' });
      }

      return res.type('application/rdf+xml').send(doc.data);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Expose state for tests
  app._testState = state;

  return app;
}

/**
 * Create basic auth header
 */
function createBasicAuthHeader(username, password) {
  const credentials = Buffer.from(`${username}:${password}`).toString('base64');
  return `Basic ${credentials}`;
}

module.exports = {
  createTestApp,
  createBasicAuthHeader
};
