/**
 * ID Generation Routes
 *
 * Handles ID generation for:
 * - /lccnnaco - LCCN NACO number generation
 * - /marva001 - MARVA 001 number generation
 */

const express = require('express');
const { hasDeployAuth } = require('../config');
const { COLLECTIONS } = require('../db/collections');

/**
 * Create ID generation routes
 * @param {object} options - Configuration options
 * @param {function} options.getDb - Function to get database instance
 * @param {object} options.mongo - MongoDB module (for ObjectID)
 * @param {function} options.getNacoIdObj - Function to get current NACO ID object
 * @param {function} options.setNacoIdObj - Function to set NACO ID object
 * @param {function} options.getMarva001Obj - Function to get current MARVA001 ID object
 * @param {function} options.setMarva001Obj - Function to set MARVA001 ID object
 * @returns {Router} Express router
 */
function createIdsRoutes(options) {
  const router = express.Router();

  const {
    getDb,
    mongo,
    getNacoIdObj,
    setNacoIdObj,
    getMarva001Obj,
    setMarva001Obj
  } = options;

  // ============================================
  // LCCN NACO ENDPOINTS
  // ============================================

  /**
   * GET /lccnnaco - Get next NACO ID and increment
   */
  router.get('/lccnnaco', async (req, res) => {
    const nacoIdObj = getNacoIdObj();
    if (!nacoIdObj) {
      return res.status(500).json({ error: 'NACO ID not initialized' });
    }

    // Increment and return
    nacoIdObj.id++;
    res.json(nacoIdObj);

    // Update database
    try {
      const db = getDb();
      if (db && nacoIdObj._id) {
        await db.collection(COLLECTIONS.LCCN_NACO).updateOne(
          { _id: new mongo.ObjectId(nacoIdObj._id) },
          { $set: { id: nacoIdObj.id } }
        );
      }
    } catch (err) {
      console.error('Error updating lccnNACO:', err);
    }
  });

  /**
   * GET /lccnnaco/set/:set - Set NACO ID value
   * Requires deploy authentication
   */
  router.get('/lccnnaco/set/:set', (req, res) => {
    if (!hasDeployAuth(req)) {
      return res.set('WWW-Authenticate', 'Basic').status(401).send('Authentication required.');
    }

    const setTo = parseInt(req.params.set, 10);
    if (isNaN(setTo)) {
      return res.status(400).send('Invalid value');
    }

    const nacoIdObj = getNacoIdObj();
    if (nacoIdObj) {
      nacoIdObj.id = setTo;
    }

    res.status(200).send('Set to:' + setTo);
  });

  // ============================================
  // MARVA 001 ENDPOINTS
  // ============================================

  /**
   * GET /marva001 - Get next MARVA001 ID and increment
   */
  router.get('/marva001', async (req, res) => {
    const marva001Obj = getMarva001Obj();
    if (!marva001Obj) {
      return res.status(500).json({ error: 'MARVA001 ID not initialized' });
    }

    let currentNumber = marva001Obj.id;

    // Year change handling
    const month = new Date().getMonth();
    const fullYear = new Date().getFullYear();
    const currentYear = fullYear.toString().slice(-2);
    let recordYear = String(currentNumber).slice(1, 3);

    if (month === 1 && recordYear < currentYear) {
      marva001Obj.id = currentNumber + 10000000;
      marva001Obj.id = Number(String(marva001Obj.id).slice(0, 3) + '0000000');
    }

    // Format with prefix
    let number = 'in0' + marva001Obj.id;
    marva001Obj.id++;

    res.json({ marva001: number });

    // Update database
    try {
      const db = getDb();
      if (db && marva001Obj._id) {
        await db.collection(COLLECTIONS.MARVA_001).updateOne(
          { _id: new mongo.ObjectId(marva001Obj._id) },
          { $set: { id: marva001Obj.id } }
        );
      }
    } catch (err) {
      console.error('Error updating marva001:', err);
    }
  });

  /**
   * GET /marva001/set/:set - Set MARVA001 ID value
   * Requires deploy authentication
   */
  router.get('/marva001/set/:set', (req, res) => {
    if (!hasDeployAuth(req)) {
      return res.set('WWW-Authenticate', 'Basic').status(401).send('Authentication required.');
    }

    const setTo = parseInt(req.params.set, 10);
    if (isNaN(setTo)) {
      return res.status(400).send('Invalid value');
    }

    const marva001Obj = getMarva001Obj();
    if (marva001Obj) {
      marva001Obj.id = setTo;
    }

    res.status(200).send('Set "marva001" to:' + setTo);
  });

  return router;
}

module.exports = { createIdsRoutes };
