const request = require('supertest');
const { createTestApp } = require('../helpers/testServer');
const { connectTestDb, closeTestDb, seedCollection, clearCollection, findInCollection } = require('../helpers/testDb');
const { templates } = require('../helpers/fixtures');

describe('Template Management', () => {
  let app;
  let mongoUri;

  beforeAll(async () => {
    mongoUri = global.__MONGO_URI__;
    await connectTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await clearCollection('templates');
    app = createTestApp(mongoUri);
  });

  describe('POST /templates', () => {
    it('should create new template', async () => {
      const template = { ...templates.validTemplate };

      const response = await request(app)
        .post('/templates')
        .send(template)
        .expect(200);

      expect(response.text).toBe('yeah :)');

      // Verify template was saved
      const saved = await findInCollection('templates', { id: template.id });
      expect(saved).toHaveLength(1);
      expect(saved[0].name).toBe(template.name);
      expect(saved[0].user).toBe(template.user);
    });

    it('should update existing template with same id', async () => {
      const template = { ...templates.validTemplate };

      // Create initial template
      await request(app)
        .post('/templates')
        .send(template)
        .expect(200);

      // Update template
      const updatedTemplate = {
        ...template,
        name: 'Updated Template Name',
        description: 'Updated description'
      };

      await request(app)
        .post('/templates')
        .send(updatedTemplate)
        .expect(200);

      // Verify only one template exists with updated data
      const saved = await findInCollection('templates', { id: template.id });
      expect(saved).toHaveLength(1);
      expect(saved[0].name).toBe('Updated Template Name');
      expect(saved[0].description).toBe('Updated description');
    });

    it('should store timestamp', async () => {
      const template = { ...templates.validTemplate };

      await request(app)
        .post('/templates')
        .send(template)
        .expect(200);

      const saved = await findInCollection('templates', { id: template.id });
      expect(saved[0].timestamp).toBeDefined();
      expect(typeof saved[0].timestamp).toBe('number');
    });

    it('should associate template with user', async () => {
      const template = {
        ...templates.validTemplate,
        user: 'specificuser'
      };

      await request(app)
        .post('/templates')
        .send(template)
        .expect(200);

      const saved = await findInCollection('templates', { user: 'specificuser' });
      expect(saved).toHaveLength(1);
      expect(saved[0].id).toBe(template.id);
    });

    it('should return success response', async () => {
      const response = await request(app)
        .post('/templates')
        .send(templates.minimalTemplate)
        .expect(200);

      expect(response.text).toBe('yeah :)');
    });

    it('should handle template with all fields', async () => {
      const template = { ...templates.templateWithAllFields };

      await request(app)
        .post('/templates')
        .send(template)
        .expect(200);

      const saved = await findInCollection('templates', { id: template.id });
      expect(saved).toHaveLength(1);
      expect(saved[0].data).toEqual(template.data);
      expect(saved[0].metadata).toEqual(template.metadata);
    });
  });

  describe('GET /templates/:user', () => {
    it('should return all templates for user', async () => {
      // Seed multiple templates for same user
      const template1 = { ...templates.validTemplate, id: 'templ-1', user: 'testuser' };
      const template2 = { ...templates.validTemplate, id: 'templ-2', user: 'testuser' };

      await seedCollection('templates', [template1, template2]);

      const response = await request(app)
        .get('/templates/testuser')
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body.map(t => t.id)).toContain('templ-1');
      expect(response.body.map(t => t.id)).toContain('templ-2');
    });

    it('should return empty array for user with no templates', async () => {
      const response = await request(app)
        .get('/templates/nonexistentuser')
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('should not return other users templates', async () => {
      const template1 = { ...templates.validTemplate, id: 'templ-1', user: 'user1' };
      const template2 = { ...templates.validTemplate, id: 'templ-2', user: 'user2' };

      await seedCollection('templates', [template1, template2]);

      const response = await request(app)
        .get('/templates/user1')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].user).toBe('user1');
      expect(response.body[0].id).toBe('templ-1');
    });

    it('should return template with all fields intact', async () => {
      const template = { ...templates.templateWithAllFields, user: 'testuser' };
      await seedCollection('templates', template);

      const response = await request(app)
        .get('/templates/testuser')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].data).toEqual(template.data);
      expect(response.body[0].metadata).toEqual(template.metadata);
    });
  });

  describe('GET /copytemplate/:user/:id', () => {
    it('should copy template to target user', async () => {
      const original = { ...templates.validTemplate, id: 'original-id', user: 'user1' };
      await seedCollection('templates', original);

      const response = await request(app)
        .get('/copytemplate/user2/original-id')
        .expect(200);

      expect(response.text).toBe('Template copied');

      // Verify both templates exist
      const allTemplates = await findInCollection('templates', {});
      expect(allTemplates).toHaveLength(2);
    });

    it('should generate new id for copied template', async () => {
      const original = { ...templates.validTemplate, id: 'original-id', user: 'user1' };
      await seedCollection('templates', original);

      await request(app)
        .get('/copytemplate/user2/original-id')
        .expect(200);

      // Verify the copied template has a different ID
      const user2Templates = await findInCollection('templates', { user: 'user2' });
      expect(user2Templates).toHaveLength(1);
      expect(user2Templates[0].id).not.toBe('original-id');
      expect(user2Templates[0].id).toMatch(/^[a-f0-9]+$/); // MD5 hash format
    });

    it('should preserve template content', async () => {
      const original = { ...templates.templateWithAllFields, id: 'original-id', user: 'user1' };
      await seedCollection('templates', original);

      await request(app)
        .get('/copytemplate/user2/original-id')
        .expect(200);

      const user2Templates = await findInCollection('templates', { user: 'user2' });
      expect(user2Templates[0].data).toEqual(original.data);
      expect(user2Templates[0].name).toBe(original.name);
      expect(user2Templates[0].description).toBe(original.description);
    });

    it('should update user to target user', async () => {
      const original = { ...templates.validTemplate, id: 'original-id', user: 'originaluser' };
      await seedCollection('templates', original);

      await request(app)
        .get('/copytemplate/targetuser/original-id')
        .expect(200);

      const copiedTemplates = await findInCollection('templates', { user: 'targetuser' });
      expect(copiedTemplates).toHaveLength(1);
    });

    it('should update timestamp on copy', async () => {
      const original = {
        ...templates.validTemplate,
        id: 'original-id',
        user: 'user1',
        timestamp: 1000000000 // Old timestamp
      };
      await seedCollection('templates', original);

      await request(app)
        .get('/copytemplate/user2/original-id')
        .expect(200);

      const copiedTemplates = await findInCollection('templates', { user: 'user2' });
      expect(copiedTemplates[0].timestamp).toBeGreaterThan(original.timestamp);
    });

    it('should handle non-existent template', async () => {
      const response = await request(app)
        .get('/copytemplate/user2/nonexistent-id')
        .expect(500);

      expect(response.text).toContain('Could not find');
    });
  });

  describe('DELETE /templates/:doc', () => {
    it('should delete template by id', async () => {
      const template = { ...templates.validTemplate, id: 'to-delete', user: 'testuser' };
      await seedCollection('templates', template);

      // Verify template exists
      let saved = await findInCollection('templates', { id: 'to-delete' });
      expect(saved).toHaveLength(1);

      await request(app)
        .delete('/templates/to-delete')
        .expect(200);

      // Verify template is deleted
      saved = await findInCollection('templates', { id: 'to-delete' });
      expect(saved).toHaveLength(0);
    });

    it('should return success status', async () => {
      const template = { ...templates.validTemplate, id: 'to-delete', user: 'testuser' };
      await seedCollection('templates', template);

      const response = await request(app)
        .delete('/templates/to-delete')
        .expect(200);

      expect(response.text).toBe('yeah :)');
    });

    it('should handle non-existent template', async () => {
      const response = await request(app)
        .delete('/templates/nonexistent-id')
        .expect(500);

      expect(response.text).toContain('Could not find');
    });

    it('should only delete specified template', async () => {
      const template1 = { ...templates.validTemplate, id: 'keep-this', user: 'testuser' };
      const template2 = { ...templates.validTemplate, id: 'delete-this', user: 'testuser' };
      await seedCollection('templates', [template1, template2]);

      await request(app)
        .delete('/templates/delete-this')
        .expect(200);

      // Verify only one template was deleted
      const remaining = await findInCollection('templates', {});
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe('keep-this');
    });
  });
});
