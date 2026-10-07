/**
 * Workflows Routes
 *
 * Storage for the editor's Workflows feature (spreadsheet-style editing of many records at
 * once). Everything is per user, the user being the username in the JWT; a user only ever sees
 * their own documents. The records themselves are not stored here, they go through the normal
 * record endpoints (ldp), a session only keeps pointers to them.
 *
 * Definitions - the workflows a user has made: which profile, which components (columns), which
 *               enrichments. The built in ones ship with the editor and are not stored.
 *   GET    /workflows/definitions          -> { definitions: [...] }
 *   PUT    /workflows/definitions/:id      -> { definition }   (create or replace)
 *   DELETE /workflows/definitions/:id      -> { deleted: true|false }
 *
 * Sessions - one sheet a user opened from a definition, with the definition snapshot it was
 *            started with, the components hidden in it and the rows (record pointers).
 *   GET    /workflows/sessions             -> { sessions: [...] } newest first
 *   GET    /workflows/sessions/:id         -> { session }
 *   PUT    /workflows/sessions/:id         -> { session }      (create or replace)
 *   DELETE /workflows/sessions/:id         -> { deleted: true|false }
 *
 * Preferences - one document per user: remembered column widths (by kind of column) and the
 *               per workflow choices (which record format to take when a scan matches several).
 *   GET    /workflows/preferences          -> { columnWidths: {}, workflows: {} }
 *   PUT    /workflows/preferences          -> { columnWidths, workflows }  (fields given replace, others kept)
 */

const express = require('express');
const { COLLECTIONS } = require('../db/collections');
const { requireAuth } = require('../middleware/jwtAuth');

// ids are made by the editor (short uuids with a prefix), keep them to something sane
const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

// what a document may contain, anything else sent is dropped
const DEFINITION_FIELDS = ['name', 'description', 'profileId', 'components', 'enrichments', 'created', 'updated'];
const SESSION_FIELDS = ['workflowId', 'name', 'created', 'updated', 'definition', 'hiddenComponents', 'rows'];
const PREFERENCE_FIELDS = ['columnWidths', 'workflows'];

function pick(body, fields) {
  const out = {};
  for (const f of fields) {
    if (Object.prototype.hasOwnProperty.call(body, f)) out[f] = body[f];
  }
  return out;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Strip the storage fields before a document goes back to the client
 */
function publicDoc(doc) {
  if (!doc) return null;
  const { _id, user, ...rest } = doc;
  return rest;
}

/**
 * Create workflows routes
 * @param {object} options - Configuration options
 * @param {function} options.getDb - Function to get database instance
 * @returns {Router} Express router
 */
function createWorkflowsRoutes(options) {
  const router = express.Router();
  const { getDb } = options;

  // every route needs a login and a database
  router.use('/workflows', requireAuth, (req, res, next) => {
    if (!getDb()) {
      return res.status(500).json({ error: 'Database not connected' });
    }
    if (!req.user || !req.user.username) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    req.workflowUser = String(req.user.username).toLowerCase();
    next();
  });

  function checkId(req, res) {
    if (!ID_PATTERN.test(req.params.id || '')) {
      res.status(400).json({ error: 'Invalid id' });
      return false;
    }
    return true;
  }

  // ------------------------------------------------------------------ definitions

  router.get('/workflows/definitions', async (req, res) => {
    try {
      const docs = await getDb().collection(COLLECTIONS.WORKFLOW_DEFINITIONS)
        .find({ user: req.workflowUser })
        .sort({ updated: -1 })
        .toArray();
      res.json({ definitions: docs.map(publicDoc) });
    } catch (err) {
      res.status(500).json({ error: 'Error: ' + err.message });
    }
  });

  router.put('/workflows/definitions/:id', async (req, res) => {
    if (!checkId(req, res)) return;
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'A definition object is required' });
    }
    const definition = pick(req.body, DEFINITION_FIELDS);
    if (typeof definition.name !== 'string' || definition.name.trim() === '') {
      return res.status(400).json({ error: 'A definition needs a name' });
    }
    if (typeof definition.profileId !== 'string' || definition.profileId === '') {
      return res.status(400).json({ error: 'A definition needs a profileId' });
    }
    if (!Array.isArray(definition.components)) {
      return res.status(400).json({ error: 'A definition needs a components array' });
    }
    if (definition.enrichments !== undefined && !Array.isArray(definition.enrichments)) {
      return res.status(400).json({ error: 'enrichments must be an array' });
    }
    const now = Date.now();
    definition.id = req.params.id;
    definition.user = req.workflowUser;
    definition.updated = now;
    if (typeof definition.created !== 'number') definition.created = now;

    try {
      await getDb().collection(COLLECTIONS.WORKFLOW_DEFINITIONS).replaceOne(
        { user: req.workflowUser, id: req.params.id },
        definition,
        { upsert: true }
      );
      res.json({ definition: publicDoc(definition) });
    } catch (err) {
      res.status(500).json({ error: 'Error: ' + err.message });
    }
  });

  router.delete('/workflows/definitions/:id', async (req, res) => {
    if (!checkId(req, res)) return;
    try {
      const result = await getDb().collection(COLLECTIONS.WORKFLOW_DEFINITIONS)
        .deleteOne({ user: req.workflowUser, id: req.params.id });
      res.json({ deleted: result.deletedCount > 0 });
    } catch (err) {
      res.status(500).json({ error: 'Error: ' + err.message });
    }
  });

  // ------------------------------------------------------------------ sessions

  router.get('/workflows/sessions', async (req, res) => {
    try {
      const docs = await getDb().collection(COLLECTIONS.WORKFLOW_SESSIONS)
        .find({ user: req.workflowUser })
        .sort({ updated: -1 })
        .toArray();
      res.json({ sessions: docs.map(publicDoc) });
    } catch (err) {
      res.status(500).json({ error: 'Error: ' + err.message });
    }
  });

  router.get('/workflows/sessions/:id', async (req, res) => {
    if (!checkId(req, res)) return;
    try {
      const doc = await getDb().collection(COLLECTIONS.WORKFLOW_SESSIONS)
        .findOne({ user: req.workflowUser, id: req.params.id });
      if (!doc) {
        return res.status(404).json({ error: 'No such session' });
      }
      res.json({ session: publicDoc(doc) });
    } catch (err) {
      res.status(500).json({ error: 'Error: ' + err.message });
    }
  });

  router.put('/workflows/sessions/:id', async (req, res) => {
    if (!checkId(req, res)) return;
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'A session object is required' });
    }
    const session = pick(req.body, SESSION_FIELDS);
    if (typeof session.workflowId !== 'string' || session.workflowId === '') {
      return res.status(400).json({ error: 'A session needs a workflowId' });
    }
    if (!isPlainObject(session.definition)) {
      return res.status(400).json({ error: 'A session needs its definition' });
    }
    if (session.rows !== undefined && !Array.isArray(session.rows)) {
      return res.status(400).json({ error: 'rows must be an array' });
    }
    if (session.hiddenComponents !== undefined && !Array.isArray(session.hiddenComponents)) {
      return res.status(400).json({ error: 'hiddenComponents must be an array' });
    }
    const now = Date.now();
    session.id = req.params.id;
    session.user = req.workflowUser;
    session.updated = now;
    if (typeof session.created !== 'number') session.created = now;
    if (!session.rows) session.rows = [];
    if (!session.hiddenComponents) session.hiddenComponents = [];
    if (typeof session.name !== 'string') session.name = session.definition.name || '';

    try {
      await getDb().collection(COLLECTIONS.WORKFLOW_SESSIONS).replaceOne(
        { user: req.workflowUser, id: req.params.id },
        session,
        { upsert: true }
      );
      res.json({ session: publicDoc(session) });
    } catch (err) {
      res.status(500).json({ error: 'Error: ' + err.message });
    }
  });

  router.delete('/workflows/sessions/:id', async (req, res) => {
    if (!checkId(req, res)) return;
    try {
      const result = await getDb().collection(COLLECTIONS.WORKFLOW_SESSIONS)
        .deleteOne({ user: req.workflowUser, id: req.params.id });
      res.json({ deleted: result.deletedCount > 0 });
    } catch (err) {
      res.status(500).json({ error: 'Error: ' + err.message });
    }
  });

  // ------------------------------------------------------------------ preferences

  router.get('/workflows/preferences', async (req, res) => {
    try {
      const doc = await getDb().collection(COLLECTIONS.WORKFLOW_PREFERENCES)
        .findOne({ user: req.workflowUser });
      res.json({
        columnWidths: (doc && isPlainObject(doc.columnWidths)) ? doc.columnWidths : {},
        workflows: (doc && isPlainObject(doc.workflows)) ? doc.workflows : {}
      });
    } catch (err) {
      res.status(500).json({ error: 'Error: ' + err.message });
    }
  });

  router.put('/workflows/preferences', async (req, res) => {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'A preferences object is required' });
    }
    const update = pick(req.body, PREFERENCE_FIELDS);
    for (const f of Object.keys(update)) {
      if (!isPlainObject(update[f])) {
        return res.status(400).json({ error: f + ' must be an object' });
      }
    }
    try {
      const collection = getDb().collection(COLLECTIONS.WORKFLOW_PREFERENCES);
      await collection.updateOne(
        { user: req.workflowUser },
        { $set: Object.assign({ user: req.workflowUser, updated: Date.now() }, update) },
        { upsert: true }
      );
      const doc = await collection.findOne({ user: req.workflowUser });
      res.json({
        columnWidths: isPlainObject(doc.columnWidths) ? doc.columnWidths : {},
        workflows: isPlainObject(doc.workflows) ? doc.workflows : {}
      });
    } catch (err) {
      res.status(500).json({ error: 'Error: ' + err.message });
    }
  });

  return router;
}

module.exports = { createWorkflowsRoutes };
