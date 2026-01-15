/**
 * Templates Routes
 *
 * Handles template management:
 * - POST /templates - Create/update template
 * - GET /templates/:user - Get user's templates
 * - GET /copytemplate/:user/:id - Copy template to user
 * - DELETE /templates/:doc - Delete template
 */

const express = require('express');
const crypto = require('crypto');
const { COLLECTIONS } = require('../db/collections');

/**
 * Create templates routes
 * @param {object} options - Configuration options
 * @param {function} options.getDb - Function to get database instance
 * @param {object} options.mongo - MongoDB module (for ObjectID)
 * @returns {Router} Express router
 */
function createTemplatesRoutes(options) {
  const router = express.Router();
  const { getDb, mongo } = options;

  /**
   * POST /templates - Create or update a template
   */
  router.post('/templates', async (req, res) => {
    try {
      const db = getDb();
      if (!db) {
        return res.status(500).send('Database not connected');
      }

      const doc = await db.collection(COLLECTIONS.TEMPLATES).findOne({ id: req.body.id });

      if (doc) {
        await db.collection(COLLECTIONS.TEMPLATES).updateOne(
          { _id: new mongo.ObjectId(doc._id) },
          { $set: req.body }
        );
      } else {
        await db.collection(COLLECTIONS.TEMPLATES).insertOne(req.body);
      }

      res.status(200).send('yeah :)');
    } catch (err) {
      res.status(500).send('Error: ' + err.message);
    }
  });

  /**
   * GET /templates/:user - Get all templates for a user
   */
  router.get('/templates/:user', async (req, res) => {
    try {
      const db = getDb();
      if (!db) {
        return res.status(500).json([]);
      }

      const result = await db.collection(COLLECTIONS.TEMPLATES)
        .find({ user: req.params.user })
        .toArray();

      res.status(200).json(result);
    } catch (err) {
      res.status(500).json([]);
    }
  });

  /**
   * GET /copytemplate/:user/:id - Copy a template to another user
   */
  router.get('/copytemplate/:user/:id', async (req, res) => {
    try {
      const db = getDb();
      if (!db) {
        return res.status(500).send('Database not connected');
      }

      const doc = await db.collection(COLLECTIONS.TEMPLATES).findOne({ id: req.params.id });

      if (!doc) {
        return res.status(500).send('Could not find that ID to copy');
      }

      // Create a copy with new id and user
      delete doc._id;
      doc.id = crypto.createHash('md5')
        .update(`${Date.now()}${req.params.user}`)
        .digest('hex');
      doc.user = req.params.user;
      doc.timestamp = Date.now() / 1000;

      await db.collection(COLLECTIONS.TEMPLATES).insertOne(doc);

      res.status(200).send('Template copied');
    } catch (err) {
      res.status(500).send('Error: ' + err.message);
    }
  });

  /**
   * DELETE /templates/:doc - Delete a template by id
   */
  router.delete('/templates/:doc', async (req, res) => {
    try {
      const db = getDb();
      if (!db) {
        return res.status(500).send('Database not connected');
      }

      const doc = await db.collection(COLLECTIONS.TEMPLATES).findOne({ id: req.params.doc });

      if (!doc) {
        return res.status(500).send('Could not find that ID to remove');
      }

      await db.collection(COLLECTIONS.TEMPLATES).deleteOne({ _id: new mongo.ObjectId(doc._id) });

      res.status(200).send('yeah :)');
    } catch (err) {
      res.status(500).send('Error: ' + err.message);
    }
  });

  return router;
}

module.exports = { createTemplatesRoutes };
