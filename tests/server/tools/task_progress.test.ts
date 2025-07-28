import { AgenticMCPServer } from '../../../src/server';
import { DatabaseConnection } from '../../../src/db/database';
import { ProjectRepository } from '../../../src/repositories/ProjectRepository';
import { TaskRepository } from '../../../src/repositories/TaskRepository';
import { FileSync } from '../../../src/sync/FileSync';
import { existsSync, rmSync, readFileSync } from 'fs';
import path from 'path';

describe('task_progress tool', () => {
  let server: AgenticMCPServer;
  let projectRepo: ProjectRepository;
  let taskRepo: TaskRepository;
  let fileSync: FileSync;
  const testDbPath = 'test-task-progress.db';
  const testProjectsDir = path.join(process.cwd(), 'test-projects');
  let projectId: string;
  let taskId: string;

  beforeAll(async () => {
    process.env.MCP_DB_PATH = testDbPath;
    server = new AgenticMCPServer();
    projectRepo = new ProjectRepository();
    taskRepo = new TaskRepository();
    fileSync = new FileSync(testProjectsDir);

    // Create a test project and task
    const project = await projectRepo.create({
      name: 'Task Progress Test Project'
    });
    projectId = project.id;

    const task = await taskRepo.create({
      projectId,
      title: 'Test Task',
      phase: 'requirements'
    });
    taskId = task.id;

    // Create project files
    await fileSync.createProjectFiles(projectId, project.name);
  });

  afterEach(async () => {
    // Reset task status
    await taskRepo.update(taskId, { status: 'pending' });
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
    if (existsSync(testProjectsDir)) {
      rmSync(testProjectsDir, { recursive: true, force: true });
    }
    delete process.env.MCP_DB_PATH;
  });

  describe('successful task progress updates', () => {
    test('should update task progress with minimal data', async () => {
      const result = await (server as any).handleTaskProgress({
        taskId,
        status: 'in_progress',
        notes: 'Started working on the task'
      });

      expect(result.success).toBe(true);
      expect(result.task.id).toBe(taskId);
      expect(result.task.status).toBe('in_progress');
      expect(result.update.status).toBe('in_progress');
      expect(result.update.notes).toBe('Started working on the task');
      expect(result.message).toBe('Task progress updated successfully');

      // Verify database update
      const updatedTask = await taskRepo.findById(taskId);
      expect(updatedTask?.status).toBe('in_progress');

      // Verify markdown file update
      const taskFile = path.join(testProjectsDir, projectId, 'implementation', `task-${taskId}.md`);
      expect(existsSync(taskFile)).toBe(true);
      
      const taskContent = readFileSync(taskFile, 'utf-8');
      expect(taskContent).toContain('Started working on the task');
      expect(taskContent).toContain('Status: in_progress');
    });

    test('should update task with deliverables and next steps', async () => {
      const deliverables = {
        files: ['main.ts', 'utils.ts'],
        documentation: 'README.md updated'
      };

      const result = await (server as any).handleTaskProgress({
        taskId,
        status: 'completed',
        notes: 'Task completed successfully',
        deliverables,
        nextSteps: 'Review code and run tests'
      });

      expect(result.success).toBe(true);
      expect(result.update.deliverables).toEqual(deliverables);
      expect(result.update.nextSteps).toBe('Review code and run tests');

      // Verify markdown contains deliverables
      const taskFile = path.join(testProjectsDir, projectId, 'implementation', `task-${taskId}.md`);
      const taskContent = readFileSync(taskFile, 'utf-8');
      expect(taskContent).toContain('main.ts');
      expect(taskContent).toContain('Review code and run tests');
    });

    test('should handle started status mapping', async () => {
      const result = await (server as any).handleTaskProgress({
        taskId,
        status: 'started',
        notes: 'Just began work'
      });

      expect(result.task.status).toBe('in_progress');
      expect(result.update.status).toBe('in_progress');

      // Verify in database
      const updatedTask = await taskRepo.findById(taskId);
      expect(updatedTask?.status).toBe('in_progress');
    });

    test('should handle blocked status', async () => {
      const result = await (server as any).handleTaskProgress({
        taskId,
        status: 'blocked',
        notes: 'Waiting for dependency resolution'
      });

      expect(result.task.status).toBe('blocked');
      expect(result.update.status).toBe('blocked');
    });
  });

  describe('validation errors', () => {
    test('should throw error if taskId is missing', async () => {
      await expect((server as any).handleTaskProgress({
        status: 'in_progress',
        notes: 'Notes'
      })).rejects.toThrow('Task ID is required and must be a string');
    });

    test('should throw error if taskId is not a string', async () => {
      await expect((server as any).handleTaskProgress({
        taskId: 123,
        status: 'in_progress',
        notes: 'Notes'
      })).rejects.toThrow('Task ID is required and must be a string');
    });

    test('should throw error if status is missing', async () => {
      await expect((server as any).handleTaskProgress({
        taskId,
        notes: 'Notes'
      })).rejects.toThrow('Status is required and must be a string');
    });

    test('should throw error if notes are missing', async () => {
      await expect((server as any).handleTaskProgress({
        taskId,
        status: 'in_progress'
      })).rejects.toThrow('Notes are required and must be a string');
    });

    test('should throw error for invalid status', async () => {
      await expect((server as any).handleTaskProgress({
        taskId,
        status: 'invalid_status',
        notes: 'Notes'
      })).rejects.toThrow('Invalid status. Must be one of: started, in_progress, blocked, completed');
    });

    test('should throw error for non-existent task', async () => {
      await expect((server as any).handleTaskProgress({
        taskId: 'non-existent-task',
        status: 'in_progress',
        notes: 'Notes'
      })).rejects.toThrow('Task not found: non-existent-task');
    });
  });

  describe('atomic updates', () => {
    test('should update both database and markdown files', async () => {
      await (server as any).handleTaskProgress({
        taskId,
        status: 'completed',
        notes: 'Final update with atomic test'
      });

      // Check database
      const dbTask = await taskRepo.findById(taskId);
      expect(dbTask?.status).toBe('completed');

      // Check markdown
      const taskFile = path.join(testProjectsDir, projectId, 'implementation', `task-${taskId}.md`);
      const content = readFileSync(taskFile, 'utf-8');
      expect(content).toContain('Final update with atomic test');
      expect(content).toContain('Status: completed');
    });

    test('should handle multiple updates to same task', async () => {
      // First update
      await (server as any).handleTaskProgress({
        taskId,
        status: 'in_progress',
        notes: 'First update'
      });

      // Second update
      await (server as any).handleTaskProgress({
        taskId,
        status: 'completed',
        notes: 'Second update'
      });

      // Verify both updates in markdown
      const taskFile = path.join(testProjectsDir, projectId, 'implementation', `task-${taskId}.md`);
      const content = readFileSync(taskFile, 'utf-8');
      expect(content).toContain('First update');
      expect(content).toContain('Second update');
      expect(content).toContain('Status: in_progress');
      expect(content).toContain('Status: completed');

      // Verify final status in database
      const finalTask = await taskRepo.findById(taskId);
      expect(finalTask?.status).toBe('completed');
    });
  });
});