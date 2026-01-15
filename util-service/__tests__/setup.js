const { MongoMemoryServer } = require('mongodb-memory-server');
const nock = require('nock');

let mongod;

// Store original env vars
const originalEnv = { ...process.env };

beforeAll(async () => {
  // Start in-memory MongoDB
  mongod = await MongoMemoryServer.create();
  const mongoUri = mongod.getUri();

  // Set test environment variables
  process.env.MODE = '1'; // dev mode
  process.env.DEPLOYPW = 'testpassword';
  process.env.STATSPW = 'statspassword';
  process.env.MLUSER = 'testuser';
  process.env.MLPASS = 'testpass';
  process.env.MLUSERSTAGE = 'stageuser';
  process.env.MLPASSSTAGE = 'stagepass';
  process.env.STAGINGPOSTURL = 'staging.example.com';
  process.env.PRODUCTIONPOSTURL = 'production.example.com';
  process.env.VALIDATIONURL = 'validation.example.com';
  process.env.STAGINGNACOSTUB = 'stagingnaco.example.com';
  process.env.PRODUCTIONNACOSTUB = 'productionnaco.example.com';
  process.env.STAGGINGccURL = 'stagingcc.example.com';
  process.env.PRODUCTIONccURL = 'productioncc.example.com';
  process.env.WC_CLIENTID = 'test-client-id';
  process.env.WC_SECRET = 'test-secret';
  process.env.LCAP_SYNC = 'https://lcap.example.com/sync/<LCCN>';
  process.env.RECORD_HISTORY = 'https://history.example.com';

  // Store the URI for tests to use
  global.__MONGO_URI__ = mongoUri;
  global.__MONGOD__ = mongod;
});

afterAll(async () => {
  // Stop MongoDB
  if (mongod) {
    await mongod.stop();
  }

  // Restore original env
  process.env = originalEnv;

  // Clean up nock
  nock.cleanAll();
  nock.restore();
});

beforeEach(() => {
  // Clean up any nock interceptors between tests
  nock.cleanAll();
});

// Increase timeout for tests that need database operations
jest.setTimeout(30000);
