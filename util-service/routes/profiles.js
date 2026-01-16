/**
 * Profiles Routes
 *
 * Handles profile management for the editor:
 * - GET /profiles/bootstrap - Bootstrap profiles from external source
 * - GET /profiles/:doc - Get profile document
 * - PUT /profiles/:doc - Update profile document
 * - DELETE /profiles/:doc - Delete profile document
 * - GET /profiles/:doc/:env - Get profile for specific environment
 * - POST /profiles/save/:doc/:env - Save profile
 * - GET /whichrt - Get resource template
 */

const express = require('express');
const fs = require('fs');
const got = require('got').got;
const simpleGit = require('simple-git').simpleGit();
const { config } = require('../config');
const { COLLECTIONS } = require('../db/collections');

/**
 * Create profiles routes
 * @param {object} options - Configuration options
 * @param {function} options.getDb - Function to get database instance
 * @param {object} options.mongo - MongoDB module (for ObjectID)
 * @returns {Router} Express router
 */
function createProfilesRoutes(options) {
  const router = express.Router();
  const { getDb, mongo } = options;

  /**
   * Push profile changes to git
   * @param {string} docName - Document name
   * @param {string} env - Environment (stage/prod)
   * @param {object} jsonPayload - Profile data
   */
  async function updateGit(docName, env, jsonPayload) {
    // Load the local deploy options
    let utilConfig;
    try {
      utilConfig = JSON.parse(fs.readFileSync('util_config.json', 'utf8'));
    } catch {
      return;
    }

    if (!utilConfig.profileEditPushGit) {
      return;
    }

    fs.rmSync('/tmp/profiles/', { recursive: true, force: true });

    await fs.promises.mkdir('/tmp/profiles/');
    await fs.promises.mkdir('/tmp/profiles/' + `${docName}-${env}`);
    await fs.promises.mkdir('/tmp/profiles/' + `${docName}-${env}/src`);

    let gitConfig;
    try {
      gitConfig = JSON.parse(fs.readFileSync('gitconfig.json', 'utf8'));
    } catch {
      console.log('gitconfig.json not found');
      return;
    }

    const userName = gitConfig.userName;
    const password = gitConfig.password;
    const org = gitConfig.org;
    const repo = gitConfig.repo;

    const gitHubUrl = `https://${userName}:${password}@github.com/${org}/${repo}`;

    await simpleGit.cwd({ path: '/tmp/profiles/', root: true });
    await simpleGit.init();
    await simpleGit.addRemote('origin', gitHubUrl);
    await simpleGit.addConfig('user.email', 'ndmso@loc.gov');
    await simpleGit.addConfig('user.name', 'NDMSO');
    await simpleGit.pull('origin', 'main');
    await simpleGit.checkout('main');

    // Write out the file
    fs.writeFileSync(`/tmp/profiles/${docName}-${env}/data.json`, JSON.stringify(jsonPayload, null, 2));

    if (docName == 'profile' && jsonPayload) {
      for (let p of jsonPayload) {
        if (p.json && p.json.Profile) {
          fs.writeFileSync(`/tmp/profiles/${docName}-${env}/src/${p.json.Profile.id}.json`, JSON.stringify(p.json.Profile, null, 2));
        }

        if (p.json && p.json.Profile && p.json.Profile.resourceTemplates) {
          for (let rt of p.json.Profile.resourceTemplates) {
            fs.writeFileSync(`/tmp/profiles/${docName}-${env}/src/${rt.id}.json`, JSON.stringify(rt, null, 2));
          }
        }
      }
    }

    simpleGit.add('.')
      .then((addSuccess) => {
        simpleGit.commit(`${docName}-${env} change`)
          .then((successCommit) => {
            simpleGit.push('origin', 'main')
              .then((success) => {
                console.log('repo successfully pushed');
              }, (failed) => {
                console.log(failed);
                console.log('repo push failed');
              });
          }, (failed) => {
            console.log(failed);
            console.log('failed commit');
          });
      }, (failedAdd) => {
        console.log(failedAdd);
        console.log('adding files failed');
      });
  }

  // ============================================
  // PROFILE ENDPOINTS
  // ============================================

  /**
   * GET /profiles/bootstrap - Bootstrap profiles from external source
   */
  router.get('/profiles/bootstrap', async (req, res) => {
    const db = getDb();
    if (!db) {
      return res.status(500).json({ error: 'Database not connected' });
    }

    let utilConfig;
    try {
      utilConfig = JSON.parse(fs.readFileSync('util_config.json', 'utf8'));
    } catch {
      return res.status(500).send('Could not read util_config.json');
    }

    if (!utilConfig.bootstrapLinks) {
      return res.status(500).send('The bootstrap links were not found');
    }

    try {
      for (let id in utilConfig.bootstrapLinks) {
        const options = {
          headers: {
            'user-agent': 'MARVA EDITOR'
          }
        };

        const r = await got(utilConfig.bootstrapLinks[id], options).json();

        const doc = await db.collection(COLLECTIONS.PROFILES).findOne({ type: id });
        if (doc) {
          await db.collection(COLLECTIONS.PROFILES).updateOne(
            { _id: new mongo.ObjectId(doc._id) },
            { $set: { type: id, data: r } }
          );
        } else {
          await db.collection(COLLECTIONS.PROFILES).insertOne({ type: id, data: r });
        }
      }

      res.status(200).send('Updated from bootstrap source.');
    } catch (err) {
      console.error('Bootstrap error:', err);
      res.status(500).send('Error bootstrapping profiles: ' + err.message);
    }
  });

  /**
   * GET /profiles/:doc - Get profile document
   */
  router.get('/profiles/:doc', async (req, res) => {
    const db = getDb();
    if (!db) {
      return res.status(500).json({ error: 'Database not connected' });
    }

    let env = 'prod';
    if (req.headers.referer && req.headers.referer.toLowerCase().indexOf('profile-editor-stage') > -1) {
      env = 'stage';
    }

    let docName = req.params.doc;
    if (docName == 'index.resourceType:profile') {
      docName = 'profile';
    }

    const id = `${docName}-${env}`;

    try {
      const doc = await db.collection(COLLECTIONS.PROFILES).findOne({ type: id });
      if (doc) {
        res.json(doc.data);
      } else {
        res.status(404).json(null);
      }
    } catch (err) {
      console.error('Error getting profile:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * PUT /profiles/:doc - Update profile document
   */
  router.put('/profiles/:doc', async (req, res) => {
    const db = getDb();
    if (!db) {
      return res.status(500).json({ error: 'Database not connected' });
    }

    const docName = req.params.doc;

    let env = 'prod';
    if (req.headers.referer && req.headers.referer.toLowerCase().indexOf('profile-editor-stage') > -1) {
      env = 'stage';
    }

    const id = `${docName}-${env}`;

    try {
      const doc = await db.collection(COLLECTIONS.PROFILES).findOne({ type: id });

      if (doc) {
        // Update existing document
        await db.collection(COLLECTIONS.PROFILES).updateOne(
          { _id: new mongo.ObjectId(doc._id) },
          { $set: { type: id, data: req.body } }
        );

        // Update the main profile document
        const profileId = `profile-${env}`;
        const docMain = await db.collection(COLLECTIONS.PROFILES).findOne({ type: profileId });

        if (docMain) {
          for (let x in docMain.data) {
            if (docMain.data[x].id == docName) {
              docMain.data[x] = req.body;
            }
          }

          await db.collection(COLLECTIONS.PROFILES).updateOne(
            { _id: new mongo.ObjectId(docMain._id) },
            { $set: { type: profileId, data: docMain.data } }
          );

          await updateGit('profile', env, docMain.data);
          res.status(200).send('Updated :)');
        } else {
          res.status(500).send('Could not the main profile to update');
        }
      } else {
        // Insert new document
        await db.collection(COLLECTIONS.PROFILES).insertOne({ type: id, data: req.body });

        // Update the main profile document
        const profileId = `profile-${env}`;
        const docMain = await db.collection(COLLECTIONS.PROFILES).findOne({ type: profileId });

        if (docMain) {
          docMain.data.push(req.body);

          await db.collection(COLLECTIONS.PROFILES).updateOne(
            { _id: new mongo.ObjectId(docMain._id) },
            { $set: { type: profileId, data: docMain.data } }
          );

          await updateGit('profile', env, docMain.data);
          res.status(200).send('Updated :)');
        } else {
          res.status(500).send('Could not find main profile');
        }
      }
    } catch (err) {
      console.error('Error updating profile:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * DELETE /profiles/:doc - Delete profile document
   */
  router.delete('/profiles/:doc', async (req, res) => {
    if (config.features.bfOrgMode) {
      return res.status(403).send();
    }

    const db = getDb();
    if (!db) {
      return res.status(500).json({ error: 'Database not connected' });
    }

    const docName = req.params.doc;

    let env = 'prod';
    if (req.headers.referer && req.headers.referer.toLowerCase().indexOf('profile-editor-stage') > -1) {
      env = 'stage';
    }

    const id = `${docName}-${env}`;

    try {
      const doc = await db.collection(COLLECTIONS.PROFILES).findOne({ type: id });

      if (doc) {
        // Remove the piece of the profile
        await db.collection(COLLECTIONS.PROFILES).deleteOne({ _id: new mongo.ObjectId(doc._id) });

        // Update the main profile document
        const profileId = `profile-${env}`;
        const docMain = await db.collection(COLLECTIONS.PROFILES).findOne({ type: profileId });

        if (docMain) {
          docMain.data = docMain.data.filter((x) => x.id != docName);

          await db.collection(COLLECTIONS.PROFILES).updateOne(
            { _id: new mongo.ObjectId(docMain._id) },
            { $set: { type: profileId, data: docMain.data } }
          );

          await updateGit('profile', env, docMain.data);
        } else {
          return res.status(500).send('Could not the main profile to update');
        }
      } else {
        return res.status(500).send('Could not find that ID to update');
      }

      res.status(200).send('yeah :)');
    } catch (err) {
      console.error('Error deleting profile:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /profiles/:doc/:env - Get profile for specific environment
   */
  router.get('/profiles/:doc/:env', async (req, res) => {
    const db = getDb();
    if (!db) {
      return res.status(500).json({ error: 'Database not connected' });
    }

    const id = `${req.params.doc}-${req.params.env}`;

    try {
      const doc = await db.collection(COLLECTIONS.PROFILES).findOne({ type: id });
      if (doc) {
        res.json(doc.data);
      } else {
        res.json(null);
      }
    } catch (err) {
      console.error('Error getting profile:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /profiles/save/:doc/:env - Save profile
   */
  router.post('/profiles/save/:doc/:env', async (req, res) => {
    const db = getDb();
    if (!db) {
      return res.status(500).json({ error: 'Database not connected' });
    }

    let env = 'stage';
    let docName = 'profile';

    if (req.params.env && req.params.env == 'prod') {
      env = 'prod';
    }
    if (req.params.env && req.params.env != 'profile') {
      docName = req.params.doc;
    }

    const id = `${docName}-${env}`;

    try {
      // Find the key to update
      const doc = await db.collection(COLLECTIONS.PROFILES).findOne({ type: id });

      if (doc) {
        await db.collection(COLLECTIONS.PROFILES).updateOne(
          { _id: new mongo.ObjectId(doc._id) },
          { $set: { type: id, data: req.body } }
        );
      } else {
        await db.collection(COLLECTIONS.PROFILES).insertOne({ type: id, data: req.body });
      }

      // Populate individual profiles from the main blob on initial load
      if (docName === 'profile') {
        for (let p of req.body) {
          const id_sub = `${p.id}-${env}`;
          const subDoc = await db.collection(COLLECTIONS.PROFILES).findOne({ type: id_sub });

          if (subDoc) {
            await db.collection(COLLECTIONS.PROFILES).updateOne(
              { _id: new mongo.ObjectId(subDoc._id) },
              { $set: { type: id_sub, data: p } }
            );
          } else {
            await db.collection(COLLECTIONS.PROFILES).insertOne({ type: id_sub, data: p });
          }
        }
      }

      // Do the git stuff
      await updateGit(docName, env, req.body);

      res.status(200).send('yeah :)');
    } catch (err) {
      console.error('Error saving profile:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================
  // WHICHRT ENDPOINT
  // ============================================

  /**
   * GET /whichrt - Get resource template
   */
  router.get('/whichrt', async (req, res) => {
    if (config.features.bfOrgMode) {
      return res.status(403).send();
    }

    const uri = req.query.uri;

    if (uri.indexOf('bibframe.example.org') > 0) {
      return res.status(404).send();
    }

    const options = {
      headers: {
        'user-agent': 'MARVA EDITOR'
      }
    };

    try {
      const r = await got(uri, options);
      res.status(200).send(r.body);
    } catch {
      res.status(500).send('Error fetching resource via whichrt.');
    }
  });

  return router;
}

module.exports = { createProfilesRoutes };
