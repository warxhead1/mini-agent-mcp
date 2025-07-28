import { AgenticMCPServer } from '../../../src/server';
import { DatabaseConnection } from '../../../src/db/database';
import { ProjectRepository } from '../../../src/repositories/ProjectRepository';
import { FileSync } from '../../../src/sync/FileSync';
import { existsSync, rmSync } from 'fs';
import path from 'path';

describe('project_create tool', () => {
  let server: AgenticMCPServer;
  let projectRepo: ProjectRepository;
  let fileSync: FileSync;
  const testDbPath = 'test-project-create.db';
  const testProjectsDir = path.join(process.cwd(), 'test-projects');

  beforeAll(() => {
    process.env.MCP_DB_PATH = testDbPath;
    server = new AgenticMCPServer();
    projectRepo = new ProjectRepository();
    fileSync = new FileSync(testProjectsDir);
  });

  afterEach(async () => {
    // Clean up test data
    const db = DatabaseConnection.getInstance();
    db.prepare('DELETE FROM workflow_checkpoints').run();
    db.prepare('DELETE FROM agent_sessions').run();
    db.prepare('DELETE FROM tasks').run();
    db.prepare('DELETE FROM projects').run();

    // Clean up test project directories
    if (existsSync(testProjectsDir)) {
      rmSync(testProjectsDir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    DatabaseConnection.close();
    if (existsSync(testDbPath)) {
      rmSync(testDbPath);
    }
    if (existsSync(testDbPath + '-wal')) {
      rmSync(testDbPath + '-wal');
    }
    if (existsSync(testDbPath + '-shm')) {
      rmSync(testDbPath + '-shm');
    }
    delete process.env.MCP_DB_PATH;
  });

  describe('successful project creation', () => {
    test('should create project with name only', async () => {
      // Use reflection to access private method for testing
      const result = await (server as any).handleProjectCreate({
        name: 'Test Project'
      });

      expect(result.success).toBe(true);
      expect(result.project.name).toBe('Test Project');
      expect(result.project.id).toMatch(/^[a-f0-9]{32}$/);
      expect(result.project.status).toBe('active');
      expect(result.project.currentPhase).toBe('requirements');
      expect(result.message).toBe("Project 'Test Project' created successfully");

      // Verify database entry
      const dbProject = await projectRepo.findByName('Test Project');
      expect(dbProject).not.toBeNull();
      expect(dbProject?.id).toBe(result.project.id);

      // Verify file structure
      const projectPath = path.join(testProjectsDir, result.project.id);
      expect(existsSync(projectPath)).toBe(true);
      expect(existsSync(path.join(projectPath, 'README.md'))).toBe(true);
      expect(existsSync(path.join(projectPath, 'requirements.md'))).toBe(true);
      expect(existsSync(path.join(projectPath, 'design.md'))).toBe(true);
      expect(existsSync(path.join(projectPath, 'tasks.md'))).toBe(true);
      expect(existsSync(path.join(projectPath, 'implementation'))).toBe(true);
      expect(existsSync(path.join(projectPath, 'handoffs'))).toBe(true);
    });

    test('should create project with description', async () => {
      const result = await (server as any).handleProjectCreate({
        name: 'Described Project',
        description: 'This is a test project with a description'
      });

      expect(result.success).toBe(true);
      expect(result.project.description).toBe('This is a test project with a description');

      // Verify description in database
      const dbProject = await projectRepo.findById(result.project.id);
      expect(dbProject?.description).toBe('This is a test project with a description');
    });

    test('should return project path', async () => {
      const result = await (server as any).handleProjectCreate({
        name: 'Path Test Project'
      });

      expect(result.project.projectPath).toBe(
        path.join(testProjectsDir, result.project.id)
      );
    });
  });

  describe('error handling', () => {
    test('should throw error if name is missing', async () => {
      await expect((server as any).handleProjectCreate({}))
        .rejects.toThrow('Project name is required and must be a string');
    });

    test('should throw error if name is not a string', async () => {
      await expect((server as any).handleProjectCreate({ name: 123 }))
        .rejects.toThrow('Project name is required and must be a string');
    });

    test('should throw error for duplicate project name', async () => {
      // Create first project
      await (server as any).handleProjectCreate({
        name: 'Unique Project'
      });

      // Try to create duplicate
      await expect((server as any).handleProjectCreate({
        name: 'Unique Project'
      })).rejects.toThrow("Project with name 'Unique Project' already exists");
    });
  });

  describe('transaction integrity', () => {
    test('should rollback if file creation fails', async () => {
      // Mock file creation to fail
      const originalCreateProjectFiles = fileSync.createProjectFiles;
      fileSync.createProjectFiles = jest.fn().mockRejectedValue(
        new Error('File system error')
      );

      try {
        await expect((server as any).handleProjectCreate({
          name: 'Failed Project'
        })).rejects.toThrow('Failed to create project: File system error');

        // Verify project was not saved in database
        const dbProject = await projectRepo.findByName('Failed Project');
        expect(dbProject).toBeNull();
      } finally {
        // Restore original method
        fileSync.createProjectFiles = originalCreateProjectFiles;
      }
    });
  });
});