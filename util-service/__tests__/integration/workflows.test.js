const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { connectTestDb, closeTestDb, clearCollection, getTestDb } = require('../helpers/testDb');
const { createWorkflowsRoutes } = require('../../routes/workflows');
const { ensureIndexes, COLLECTIONS } = require('../../db/collections');
const { config } = require('../../config');

// the real router on a bare express app, so the auth and storage are what production runs
function appFor() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));
  app.use('/', createWorkflowsRoutes({ getDb: () => getTestDb() }));
  return app;
}

function tokenFor(username) {
  return 'Bearer ' + jwt.sign({ username, email: username + '@loc.gov' }, config.jwt.secret, { expiresIn: '1h' });
}

const definition = {
  name: 'My workflow',
  description: 'test',
  profileId: 'lc:RT:bf2:Monograph:Instance',
  components: [{ rt: 'Work', id: 'id_loc_gov_ontologies_bibframe_summary__summary', hiddenColumns: [] }],
  enrichments: ['cip-lookup'],
  created: 1700000000000
};

const session = {
  workflowId: 'wf-abc',
  name: 'My workflow',
  definition: Object.assign({ id: 'wf-abc' }, definition),
  hiddenComponents: ['Work|id_loc_gov_ontologies_bibframe_summary__summary'],
  rows: [{ id: 'r1', eId: 'e123', sourceUrl: 'https://id.loc.gov/resources/instances/1.cbd.rdf', scanned: '123', label: 'A book', lccn: '2025000001', done: false, posted: false, saved: true }]
};

describe('Workflows storage', () => {
  let app;
  const alice = tokenFor('alice');
  const bob = tokenFor('bob');

  beforeAll(async () => {
    await connectTestDb();
    for (const c of [COLLECTIONS.WORKFLOW_DEFINITIONS, COLLECTIONS.WORKFLOW_SESSIONS, COLLECTIONS.WORKFLOW_PREFERENCES]) {
      await ensureIndexes(getTestDb(), c);
    }
  });

  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await clearCollection(COLLECTIONS.WORKFLOW_DEFINITIONS);
    await clearCollection(COLLECTIONS.WORKFLOW_SESSIONS);
    await clearCollection(COLLECTIONS.WORKFLOW_PREFERENCES);
    app = appFor();
  });

  describe('auth', () => {
    it('rejects requests without a token', async () => {
      await request(app).get('/workflows/definitions').expect(401);
      await request(app).put('/workflows/sessions/ws-1').send(session).expect(401);
      await request(app).get('/workflows/preferences').expect(401);
    });

    it('rejects a bad token', async () => {
      await request(app).get('/workflows/definitions').set('Authorization', 'Bearer nope').expect(401);
    });
  });

  describe('definitions', () => {
    it('starts empty', async () => {
      const res = await request(app).get('/workflows/definitions').set('Authorization', alice).expect(200);
      expect(res.body.definitions).toEqual([]);
    });

    it('saves, lists, replaces and deletes a definition for the user only', async () => {
      const saved = await request(app).put('/workflows/definitions/wf-abc').set('Authorization', alice).send(definition).expect(200);
      expect(saved.body.definition.id).toBe('wf-abc');
      expect(saved.body.definition.name).toBe('My workflow');
      expect(saved.body.definition.created).toBe(1700000000000);
      expect(saved.body.definition.updated).toBeGreaterThan(0);
      expect(saved.body.definition.user).toBeUndefined();
      expect(saved.body.definition._id).toBeUndefined();

      // alice sees it, bob does not
      const mine = await request(app).get('/workflows/definitions').set('Authorization', alice).expect(200);
      expect(mine.body.definitions).toHaveLength(1);
      const theirs = await request(app).get('/workflows/definitions').set('Authorization', bob).expect(200);
      expect(theirs.body.definitions).toHaveLength(0);

      // a second put with the same id replaces, it does not add
      await request(app).put('/workflows/definitions/wf-abc').set('Authorization', alice)
        .send(Object.assign({}, definition, { name: 'Renamed', junk: 'dropped' })).expect(200);
      const after = await request(app).get('/workflows/definitions').set('Authorization', alice).expect(200);
      expect(after.body.definitions).toHaveLength(1);
      expect(after.body.definitions[0].name).toBe('Renamed');
      expect(after.body.definitions[0].junk).toBeUndefined();

      // bob can not delete alice's
      const notMine = await request(app).delete('/workflows/definitions/wf-abc').set('Authorization', bob).expect(200);
      expect(notMine.body.deleted).toBe(false);
      const gone = await request(app).delete('/workflows/definitions/wf-abc').set('Authorization', alice).expect(200);
      expect(gone.body.deleted).toBe(true);
      const none = await request(app).get('/workflows/definitions').set('Authorization', alice).expect(200);
      expect(none.body.definitions).toHaveLength(0);
    });

    it('two users can use the same id', async () => {
      await request(app).put('/workflows/definitions/wf-abc').set('Authorization', alice).send(definition).expect(200);
      await request(app).put('/workflows/definitions/wf-abc').set('Authorization', bob).send(Object.assign({}, definition, { name: 'Bobs' })).expect(200);
      const bobs = await request(app).get('/workflows/definitions').set('Authorization', bob).expect(200);
      expect(bobs.body.definitions[0].name).toBe('Bobs');
    });

    it('validates the body and the id', async () => {
      await request(app).put('/workflows/definitions/wf-abc').set('Authorization', alice).send({ profileId: 'x', components: [] }).expect(400);
      await request(app).put('/workflows/definitions/wf-abc').set('Authorization', alice).send({ name: 'n', components: [] }).expect(400);
      await request(app).put('/workflows/definitions/wf-abc').set('Authorization', alice).send({ name: 'n', profileId: 'x', components: 'nope' }).expect(400);
      await request(app).put('/workflows/definitions/bad%20id!').set('Authorization', alice).send(definition).expect(400);
    });
  });

  describe('sessions', () => {
    it('saves, gets, lists newest first, and deletes, per user', async () => {
      await request(app).put('/workflows/sessions/ws-1').set('Authorization', alice).send(session).expect(200);
      await new Promise((r) => setTimeout(r, 5));
      await request(app).put('/workflows/sessions/ws-2').set('Authorization', alice).send(Object.assign({}, session, { name: 'Second' })).expect(200);

      const list = await request(app).get('/workflows/sessions').set('Authorization', alice).expect(200);
      expect(list.body.sessions.map((s) => s.id)).toEqual(['ws-2', 'ws-1']);
      expect(list.body.sessions[1].rows[0].eId).toBe('e123');
      expect(list.body.sessions[1].hiddenComponents).toHaveLength(1);

      const one = await request(app).get('/workflows/sessions/ws-1').set('Authorization', alice).expect(200);
      expect(one.body.session.definition.components).toHaveLength(1);

      await request(app).get('/workflows/sessions/ws-1').set('Authorization', bob).expect(404);
      await request(app).get('/workflows/sessions/nope').set('Authorization', alice).expect(404);

      const del = await request(app).delete('/workflows/sessions/ws-1').set('Authorization', alice).expect(200);
      expect(del.body.deleted).toBe(true);
      await request(app).get('/workflows/sessions/ws-1').set('Authorization', alice).expect(404);
    });

    it('replaces on a second put and fills defaults', async () => {
      await request(app).put('/workflows/sessions/ws-1').set('Authorization', alice)
        .send({ workflowId: 'wf-abc', definition: { name: 'From def' } }).expect(200);
      const one = await request(app).get('/workflows/sessions/ws-1').set('Authorization', alice).expect(200);
      expect(one.body.session.rows).toEqual([]);
      expect(one.body.session.hiddenComponents).toEqual([]);
      expect(one.body.session.name).toBe('From def');
    });

    it('validates the body', async () => {
      await request(app).put('/workflows/sessions/ws-1').set('Authorization', alice).send({ definition: {} }).expect(400);
      await request(app).put('/workflows/sessions/ws-1').set('Authorization', alice).send({ workflowId: 'x' }).expect(400);
      await request(app).put('/workflows/sessions/ws-1').set('Authorization', alice).send({ workflowId: 'x', definition: {}, rows: 'nope' }).expect(400);
    });
  });

  describe('preferences', () => {
    it('is empty to start, merges fields, and is per user', async () => {
      const empty = await request(app).get('/workflows/preferences').set('Authorization', alice).expect(200);
      expect(empty.body).toEqual({ columnWidths: {}, workflows: {} });

      await request(app).put('/workflows/preferences').set('Authorization', alice).send({ columnWidths: { 'a|b': 200 } }).expect(200);
      const withWidths = await request(app).put('/workflows/preferences').set('Authorization', alice).send({ workflows: { 'wf-abc': { autoFormat: 'print' } } }).expect(200);
      // the earlier field is kept when another is set
      expect(withWidths.body.columnWidths).toEqual({ 'a|b': 200 });
      expect(withWidths.body.workflows).toEqual({ 'wf-abc': { autoFormat: 'print' } });

      const bobs = await request(app).get('/workflows/preferences').set('Authorization', bob).expect(200);
      expect(bobs.body).toEqual({ columnWidths: {}, workflows: {} });
    });

    it('validates the body', async () => {
      await request(app).put('/workflows/preferences').set('Authorization', alice).send({ columnWidths: [1, 2] }).expect(400);
      await request(app).put('/workflows/preferences').set('Authorization', alice).send('nope').expect(400);
    });
  });
});
