/**
 * Admin Routes
 *
 * Handles administrative endpoints:
 * - /version/* - Editor version management
 * - /status - System status
 * - /cleanup/* - Database cleanup jobs
 * - /logs/posts - Publishing logs
 * - /deploy-* - Deployment endpoints
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { hasDeployAuth, hasStatsAuth } = require('../config');

const DEPLOY_LOG_MAX_LINES = 5000;

const DEPLOY_INFO_PATH = path.join(__dirname, '..', 'deploy-info.json');

function readDeployInfo() {
  try {
    return JSON.parse(fs.readFileSync(DEPLOY_INFO_PATH, 'utf8'));
  } catch (e) {
    return {};
  }
}

function writeDeployInfo(region, branch) {
  const info = readDeployInfo();
  info[region] = { branch, deployedAt: new Date().toISOString() };
  fs.writeFileSync(DEPLOY_INFO_PATH, JSON.stringify(info, null, 2));
}

/**
 * Create admin routes
 * @param {object} options - Configuration options
 * @param {object} options.getEditorVersion - Function to get production version
 * @param {object} options.getEditorVersionStage - Function to get staging version
 * @param {function} options.setEditorVersion - Function to set production version
 * @param {function} options.setEditorVersionStage - Function to set staging version
 * @param {function} options.getPostLog - Function to get post log
 * @param {function} options.getStatus - Function to get system status
 * @returns {Router} Express router
 */
function createAdminRoutes(options) {
  const router = express.Router();

  const {
    getEditorVersion,
    getEditorVersionStage,
    setEditorVersion,
    setEditorVersionStage,
    getPostLog,
    getStatus,
    getCleanupStatus,
    startCleanup,
    getDb
  } = options;

  // Cached username → full name map for recent-events enrichment
  let adminUserNameMap = null;
  let adminUserNameMapAge = 0;

  // ============================================
  // ROOT / DEPLOY DASHBOARD
  // ============================================

  /**
   * GET / - Deploy dashboard (index.ejs)
   * Requires deploy authentication
   */
  router.get('/', (req, res) => {
    if (!hasDeployAuth(req)) {
      return res.set('WWW-Authenticate', 'Basic').status(401).send('Authentication required.');
    }

    const config = JSON.parse(fs.readFileSync('util_config.json', 'utf8'));
    res.render('index', {
      editorVersionStage: getEditorVersionStage(),
      editorVersion: getEditorVersion(),
      config: config,
      deployInfo: readDeployInfo()
    });
  });

  // ============================================
  // ACTIVE USERS
  // ============================================

  /**
   * GET /active-users - Users who logged in within the last hour
   * Requires deploy authentication (same as index.ejs)
   */
  router.get('/active-users', async (req, res) => {
    if (!hasDeployAuth(req)) {
      return res.set('WWW-Authenticate', 'Basic').status(401).send('Authentication required.');
    }
    try {
      const db = getDb ? getDb() : null;
      if (!db) return res.status(500).json({ error: 'Database not connected' });

      const { COLLECTIONS } = require('../db/collections');
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const users = await db.collection(COLLECTIONS.USERS)
        .find(
          { lastLogin: { $gte: oneHourAgo } },
          { projection: { _id: 0, username: 1, name: 1, email: 1, lastLogin: 1, catId: 1 } }
        )
        .sort({ lastLogin: -1 })
        .toArray();

      return res.json({ count: users.length, users });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ============================================
  // RECENT EVENTS
  // ============================================

  /**
   * GET /recent-events - Most recent 500 events from the event log
   * Requires deploy authentication (same as index.ejs)
   */
  router.get('/recent-events', async (req, res) => {
    if (!hasDeployAuth(req)) {
      return res.set('WWW-Authenticate', 'Basic').status(401).send('Authentication required.');
    }
    try {
      const db = getDb ? getDb() : null;
      if (!db) return res.status(500).json({ error: 'Database not connected' });

      const { COLLECTIONS } = require('../db/collections');
      const regionParam = (req.query.region || '').toLowerCase().trim();
      const query = {};
      if (regionParam && regionParam !== 'all') {
        query.region = regionParam;
      }

      const events = await db.collection(COLLECTIONS.EVENT_LOG)
        .find(query, { projection: { _id: 0 } })
        .sort({ timestamp: -1 })
        .limit(500)
        .toArray();

      // Enrich with full names from users collection (cached)
      if (!adminUserNameMap || (Date.now() - adminUserNameMapAge) >= 60 * 60 * 1000) {
        try {
          const users = await db.collection(COLLECTIONS.USERS)
            .find({}, { projection: { _id: 0, username: 1, name: 1 } })
            .toArray();
          adminUserNameMap = {};
          for (const u of users) {
            if (u.username) adminUserNameMap[u.username] = u.name || '';
          }
          adminUserNameMapAge = Date.now();
        } catch (e) {
          if (!adminUserNameMap) adminUserNameMap = {};
        }
      }
      for (const evt of events) {
        if (evt.username && adminUserNameMap[evt.username]) {
          evt.name = adminUserNameMap[evt.username];
        }
        if (Array.isArray(evt.metadata)) {
          for (const m of evt.metadata) {
            if (m.user && adminUserNameMap[m.user]) {
              m.name = adminUserNameMap[m.user];
            }
          }
        }
      }

      return res.json({ count: events.length, events });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ============================================
  // VERSION ENDPOINTS
  // ============================================

  /**
   * GET /version/editor - Get production editor version
   */
  router.get('/version/editor', (req, res) => {
    res.json(getEditorVersion());
  });

  /**
   * GET /version/editor/stage - Get staging editor version
   */
  router.get('/version/editor/stage', (req, res) => {
    res.json(getEditorVersionStage());
  });

  /**
   * GET /version/set/:env/:major/:minor/:patch - Set editor version
   * Requires deploy authentication
   */
  router.get('/version/set/:env/:major/:minor/:patch', (req, res) => {
    if (!hasDeployAuth(req)) {
      return res.set('WWW-Authenticate', 'Basic').status(401).send('Authentication required.');
    }

    const ver = {
      major: parseInt(req.params.major, 10),
      minor: parseInt(req.params.minor, 10),
      patch: parseInt(req.params.patch, 10)
    };

    if (req.params.env === 'staging') {
      fs.writeFileSync('ver_stage.json', JSON.stringify(ver));
      setEditorVersionStage(ver);
    } else {
      fs.writeFileSync('ver_prod.json', JSON.stringify(ver));
      setEditorVersion(ver);
    }

    res.json({});
  });

  // ============================================
  // STATUS ENDPOINTS
  // ============================================

  /**
   * GET /status - Get system status
   */
  router.get('/status', (req, res) => {
    res.json({ status: getStatus() });
  });

  // ============================================
  // LOGS ENDPOINTS
  // ============================================

  /**
   * GET /logs/posts - Get publishing logs
   */
  router.get('/logs/posts', (req, res) => {
    res.json(getPostLog());
  });

  // ============================================
  // CLEANUP ENDPOINTS
  // ============================================

  /**
   * GET /cleanup/old-records - Start cleanup job
   * Requires confirmation parameter
   */
  router.get('/cleanup/old-records', (req, res) => {
    if (req.query.confirm !== 'yes-delete-old-records') {
      return res.status(400).json({
        error: req.query.confirm
          ? 'invalid confirmation value'
          : 'Missing confirmation parameter',
        usage: 'GET /cleanup/old-records?confirm=yes-delete-old-records'
      });
    }

    startCleanup();
    res.json({ status: 'started', message: 'Cleanup job started' });
  });

  /**
   * GET /cleanup/old-records/status - Get cleanup job status
   */
  router.get('/cleanup/old-records/status', (req, res) => {
    res.json(getCleanupStatus());
  });

  // ============================================
  // DEPLOY ENDPOINTS
  // ============================================

  // Single in-flight deploy job. Older finished jobs are kept here briefly so
  // the UI can fetch their tail log after the page reloads, but only one job
  // can be `running` at a time. SSE subscribers are stored on the job itself.
  let currentDeployJob = null;
  const finishedDeployJobs = new Map();
  const FINISHED_JOB_RETAIN_MS = 30 * 60 * 1000;

  function pruneFinishedJobs() {
    const cutoff = Date.now() - FINISHED_JOB_RETAIN_MS;
    for (const [id, job] of finishedDeployJobs) {
      if (job.finishedAt && new Date(job.finishedAt).getTime() < cutoff) {
        finishedDeployJobs.delete(id);
      }
    }
  }

  function getJob(jobId) {
    if (currentDeployJob && currentDeployJob.jobId === jobId) return currentDeployJob;
    return finishedDeployJobs.get(jobId) || null;
  }

  function pushLogLine(job, stream, line) {
    const entry = { t: Date.now(), stream, line };
    job.log.push(entry);
    if (job.log.length > DEPLOY_LOG_MAX_LINES) {
      job.log.splice(0, job.log.length - DEPLOY_LOG_MAX_LINES);
      if (!job.logTruncated) job.logTruncated = true;
    }
    for (const sub of job.subscribers) {
      try {
        sub.write(`event: log\ndata: ${JSON.stringify(entry)}\n\n`);
      } catch (_) { /* subscriber gone; close handler removes it */ }
    }
  }

  /**
   * Start a deploy job by spawning a shell script. Returns the job object.
   * Throws if another deploy is already in flight.
   */
  function startDeployJob({ target, script, args = [], branch = null, onSuccess = null }) {
    if (currentDeployJob && currentDeployJob.status === 'running') {
      const err = new Error('Deploy already in progress');
      err.code = 'DEPLOY_BUSY';
      err.runningJob = describeJob(currentDeployJob);
      throw err;
    }

    const jobId = `${target}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const job = {
      jobId,
      target,
      branch,
      script,
      args,
      status: 'running',
      exitCode: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      log: [],
      logTruncated: false,
      subscribers: new Set(),
      child: null
    };

    const child = spawn(script, args, {
      cwd: path.join(__dirname, '..'),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    job.child = child;
    job.pid = child.pid;
    currentDeployJob = job;

    const wireStream = (stream, name) => {
      let buf = '';
      stream.setEncoding('utf8');
      stream.on('data', chunk => {
        buf += chunk;
        let idx;
        while ((idx = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, idx);
          buf = buf.slice(idx + 1);
          pushLogLine(job, name, line);
        }
      });
      stream.on('end', () => {
        if (buf.length) {
          pushLogLine(job, name, buf);
          buf = '';
        }
      });
    };
    wireStream(child.stdout, 'stdout');
    wireStream(child.stderr, 'stderr');

    child.on('error', err => {
      pushLogLine(job, 'stderr', `[spawn error] ${err.message}`);
    });

    child.on('close', code => {
      job.exitCode = code;
      job.status = code === 0 ? 'done' : 'failed';
      job.finishedAt = new Date().toISOString();
      job.child = null;
      if (code === 0 && typeof onSuccess === 'function') {
        try { onSuccess(); } catch (e) {
          pushLogLine(job, 'stderr', `[post-deploy hook error] ${e.message}`);
        }
      }
      const summary = describeJob(job);
      for (const sub of job.subscribers) {
        try {
          sub.write(`event: done\ndata: ${JSON.stringify(summary)}\n\n`);
          sub.end();
        } catch (_) { /* ignore */ }
      }
      job.subscribers.clear();
      finishedDeployJobs.set(jobId, job);
      if (currentDeployJob && currentDeployJob.jobId === jobId) {
        currentDeployJob = null;
      }
      pruneFinishedJobs();
    });

    return job;
  }

  function describeJob(job) {
    if (!job) return null;
    return {
      jobId: job.jobId,
      target: job.target,
      branch: job.branch,
      status: job.status,
      exitCode: job.exitCode,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      logTruncated: !!job.logTruncated,
      logLines: job.log.length
    };
  }

  /**
   * Express helper: kick off a deploy script and return JSON. Handles 401 +
   * 409 (busy) responses uniformly.
   */
  function handleDeployRequest(req, res, { target, script, args = [], branch = null, onSuccess = null }) {
    if (!hasDeployAuth(req)) {
      return res.set('WWW-Authenticate', 'Basic').status(401).send('Authentication required.');
    }
    try {
      const job = startDeployJob({ target, script, args, branch, onSuccess });
      res.status(200).json(describeJob(job));
    } catch (err) {
      if (err.code === 'DEPLOY_BUSY') {
        return res.status(409).json({
          error: 'Another deploy is already running',
          running: err.runningJob
        });
      }
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * GET /deploy-production - Deploy production MARVA (async)
   * Requires deploy authentication. Returns { jobId, ... } immediately.
   */
  router.get('/deploy-production', (req, res) => {
    handleDeployRequest(req, res, {
      target: 'prod-marva',
      script: './scripts/deploy-production.sh'
    });
  });

  /**
   * GET /deploy-production-quartz - Deploy production Quartz (async)
   * Requires deploy authentication. Optional query param: ?branch=branch-name
   */
  router.get('/deploy-production-quartz', (req, res) => {
    const branch = req.query.branch || 'main';
    handleDeployRequest(req, res, {
      target: 'prod-quartz',
      script: './scripts/deploy-production-quartz.sh',
      args: [branch],
      branch,
      onSuccess: () => writeDeployInfo('prod-quartz', branch)
    });
  });

  /**
   * GET /deploy-staging - Deploy staging MARVA (async)
   * Requires deploy authentication.
   */
  router.get('/deploy-staging', (req, res) => {
    handleDeployRequest(req, res, {
      target: 'stage-marva',
      script: './scripts/deploy-staging.sh'
    });
  });

  /**
   * GET /deploy-staging-quartz - Deploy staging Quartz (async)
   * Requires deploy authentication. Optional query param: ?branch=branch-name
   */
  router.get('/deploy-staging-quartz', (req, res) => {
    const branch = req.query.branch || 'main';
    handleDeployRequest(req, res, {
      target: 'stage-quartz',
      script: './scripts/deploy-staging-quartz.sh',
      args: [branch],
      branch,
      onSuccess: () => writeDeployInfo('stage-quartz', branch)
    });
  });

  /**
   * GET /deploy-current - Returns the in-flight deploy job (or null).
   * Used by the UI on page load to reattach to a running deploy.
   */
  router.get('/deploy-current', (req, res) => {
    if (!hasDeployAuth(req)) {
      return res.set('WWW-Authenticate', 'Basic').status(401).send('Authentication required.');
    }
    res.json(describeJob(currentDeployJob));
  });

  /**
   * GET /deploy-log/:jobId - SSE stream of a deploy job's stdout/stderr.
   * Replays the buffered log on connect, streams new lines as they arrive,
   * sends a final `done` event with the exit code, then closes.
   */
  router.get('/deploy-log/:jobId', (req, res) => {
    if (!hasDeployAuth(req)) {
      return res.set('WWW-Authenticate', 'Basic').status(401).send('Authentication required.');
    }
    const job = getJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: 'Unknown jobId' });
    }

    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.flushHeaders();

    res.write(`event: meta\ndata: ${JSON.stringify(describeJob(job))}\n\n`);
    for (const entry of job.log) {
      res.write(`event: log\ndata: ${JSON.stringify(entry)}\n\n`);
    }

    if (job.status !== 'running') {
      res.write(`event: done\ndata: ${JSON.stringify(describeJob(job))}\n\n`);
      return res.end();
    }

    job.subscribers.add(res);
    const keepAlive = setInterval(() => {
      try { res.write(': keep-alive\n\n'); } catch (_) {}
    }, 15000);

    req.on('close', () => {
      clearInterval(keepAlive);
      job.subscribers.delete(res);
    });
  });

  /**
   * GET /quartz-branches - Proxy to GitHub for active branches
   * Requires deploy authentication
   */
  router.get('/quartz-branches', async (req, res) => {
    if (!hasDeployAuth(req)) {
      return res.set('WWW-Authenticate', 'Basic').status(401).send('Authentication required.');
    }
    try {
      const resp = await fetch('https://github.com/lcnetdev/marva-quartz/branches/active.json');
      const data = await resp.json();
      const payload = data.payload || data;
      const branchNames = (payload.branches || []).map(b => b.name).filter(n => n !== 'main');
      const branches = ['main', ...branchNames];
      res.json(branches);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch branches' });
    }
  });

  /**
   * GET /deploy-info - Get last deploy info for quartz regions
   */
  router.get('/deploy-info', (req, res) => {
    res.json(readDeployInfo());
  });

  /**
   * GET /deploy-profile-editor - Deploy profile editor (async)
   * No authentication required (matches original behavior). Returns
   * { jobId, ... } immediately; tail via /deploy-log/:jobId.
   */
  router.get('/deploy-profile-editor', (req, res) => {
    try {
      const job = startDeployJob({
        target: 'profile-editor',
        script: './scripts/deploy-profile-editor.sh'
      });
      res.status(200).json(describeJob(job));
    } catch (err) {
      if (err.code === 'DEPLOY_BUSY') {
        return res.status(409).json({
          error: 'Another deploy is already running',
          running: err.runningJob
        });
      }
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = { createAdminRoutes };
