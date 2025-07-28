import { DatabaseConnection } from '../../src/db/database';
import { ProjectRepository } from '../../src/repositories/ProjectRepository';
import { existsSync, unlinkSync } from 'fs';

describe('ProjectRepository', () => {
  let repo: ProjectRepository;
  const testDbPath = 'test-project-repo.db';

  beforeAll(() => {
    process.env.MCP_DB_PATH = testDbPath;
    repo = new ProjectRepository();
  });

  afterEach(() => {
    // Clean up test data
    const db = DatabaseConnection.getInstance();
    db.prepare('DELETE FROM workflow_checkpoints').run();
    db.prepare('DELETE FROM agent_sessions').run();
    db.prepare('DELETE FROM tasks').run();
    db.prepare('DELETE FROM projects').run();
  });

  afterAll(() => {
    DatabaseConnection.close();
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
    if (existsSync(testDbPath + '-wal')) {
      unlinkSync(testDbPath + '-wal');
    }
    if (existsSync(testDbPath + '-shm')) {
      unlinkSync(testDbPath + '-shm');
    }
    delete process.env.MCP_DB_PATH;
  });

  describe('create', () => {
    test('should create a new project', async () => {
      const project = await repo.create({
        name: 'Test Project',
        description: 'A test project'
      });

      expect(project.id).toMatch(/^[a-f0-9]{32}$/);
      expect(project.name).toBe('Test Project');
      expect(project.description).toBe('A test project');
      expect(project.status).toBe('active');
      expect(project.currentPhase).toBe('requirements');
      expect(project.createdAt).toBeInstanceOf(Date);
      expect(project.updatedAt).toBeInstanceOf(Date);
    });

    test('should create project with minimal data', async () => {
      const project = await repo.create({
        name: 'Minimal Project'
      });

      expect(project.name).toBe('Minimal Project');
      expect(project.description).toBeNull();
      expect(project.status).toBe('active');
      expect(project.currentPhase).toBe('requirements');
    });

    test('should throw error if name is missing', async () => {
      await expect(repo.create({})).rejects.toThrow('Project name is required');
    });

    test('should enforce unique project names', async () => {
      await repo.create({ name: 'Unique Project' });
      
      await expect(repo.create({ name: 'Unique Project' }))
        .rejects.toThrow(/UNIQUE constraint failed/);
    });
  });

  describe('findById', () => {
    test('should find project by id', async () => {
      const created = await repo.create({ name: 'Find Me' });
      const found = await repo.findById(created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.name).toBe('Find Me');
    });

    test('should return null for non-existent id', async () => {
      const found = await repo.findById('non-existent-id');
      expect(found).toBeNull();
    });
  });

  describe('findByName', () => {
    test('should find project by name', async () => {
      await repo.create({ name: 'Unique Name Project' });
      const found = await repo.findByName('Unique Name Project');

      expect(found).not.toBeNull();
      expect(found?.name).toBe('Unique Name Project');
    });

    test('should return null for non-existent name', async () => {
      const found = await repo.findByName('Non Existent');
      expect(found).toBeNull();
    });
  });

  describe('update', () => {
    test('should update project fields', async () => {
      const project = await repo.create({ name: 'Original' });
      
      const updated = await repo.update(project.id, {
        name: 'Updated',
        description: 'Updated description',
        status: 'paused',
        currentPhase: 'design'
      });

      expect(updated).not.toBeNull();
      expect(updated?.name).toBe('Updated');
      expect(updated?.description).toBe('Updated description');
      expect(updated?.status).toBe('paused');
      expect(updated?.currentPhase).toBe('design');
    });

    test('should return null for non-existent project', async () => {
      const updated = await repo.update('non-existent', { name: 'New' });
      expect(updated).toBeNull();
    });

    test('should validate status values', async () => {
      const project = await repo.create({ name: 'Status Test' });
      
      await expect(repo.update(project.id, { status: 'invalid' as any }))
        .rejects.toThrow('Invalid project status: invalid');
    });

    test('should validate phase values', async () => {
      const project = await repo.create({ name: 'Phase Test' });
      
      await expect(repo.update(project.id, { currentPhase: 'invalid' as any }))
        .rejects.toThrow('Invalid project phase: invalid');
    });
  });

  describe('delete', () => {
    test('should delete existing project', async () => {
      const project = await repo.create({ name: 'To Delete' });
      const deleted = await repo.delete(project.id);
      
      expect(deleted).toBe(true);
      
      const found = await repo.findById(project.id);
      expect(found).toBeNull();
    });

    test('should return false for non-existent project', async () => {
      const deleted = await repo.delete('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('list', () => {
    beforeEach(async () => {
      await repo.create({ name: 'Project 1', status: 'active', currentPhase: 'requirements' });
      await repo.create({ name: 'Project 2', status: 'paused', currentPhase: 'design' });
      await repo.create({ name: 'Project 3', status: 'completed', currentPhase: 'execute' });
      await repo.create({ name: 'Another Project', status: 'active', currentPhase: 'tasks' });
    });

    test('should list all projects', async () => {
      const projects = await repo.list();
      expect(projects).toHaveLength(4);
    });

    test('should filter by status', async () => {
      const active = await repo.list({ status: 'active' });
      expect(active).toHaveLength(2);
      expect(active.every(p => p.status === 'active')).toBe(true);
    });

    test('should filter by phase', async () => {
      const design = await repo.list({ phase: 'design' });
      expect(design).toHaveLength(1);
      expect(design[0].currentPhase).toBe('design');
    });

    test('should filter by name pattern', async () => {
      const matching = await repo.list({ name: 'Project' });
      expect(matching).toHaveLength(4);

      const another = await repo.list({ name: 'Another' });
      expect(another).toHaveLength(1);
    });

    test('should combine filters', async () => {
      const filtered = await repo.list({ 
        status: 'active', 
        phase: 'requirements' 
      });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe('Project 1');
    });

    test('should order by created_at DESC', async () => {
      const projects = await repo.list();
      // Last created should be first
      expect(projects[0].name).toBe('Another Project');
      expect(projects[3].name).toBe('Project 1');
    });
  });

  describe('updateStatus', () => {
    test('should update project status', async () => {
      const project = await repo.create({ name: 'Status Update Test' });
      
      await repo.updateStatus(project.id, 'completed');
      
      const updated = await repo.findById(project.id);
      expect(updated?.status).toBe('completed');
    });

    test('should validate status value', async () => {
      const project = await repo.create({ name: 'Invalid Status Test' });
      
      await expect(repo.updateStatus(project.id, 'invalid'))
        .rejects.toThrow('Invalid project status: invalid');
    });

    test('should throw error for non-existent project', async () => {
      await expect(repo.updateStatus('non-existent', 'active'))
        .rejects.toThrow('Project not found: non-existent');
    });
  });
});