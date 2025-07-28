import { DatabaseConnection } from '../../src/db/database';
import { ProjectRepository } from '../../src/repositories/ProjectRepository';
import { TaskRepository } from '../../src/repositories/TaskRepository';
import { existsSync, unlinkSync } from 'fs';

describe('TaskRepository', () => {
  let taskRepo: TaskRepository;
  let projectRepo: ProjectRepository;
  let projectId: string;
  const testDbPath = 'test-task-repo.db';

  beforeAll(async () => {
    process.env.MCP_DB_PATH = testDbPath;
    taskRepo = new TaskRepository();
    projectRepo = new ProjectRepository();
    
    // Create a test project
    const project = await projectRepo.create({ name: 'Task Test Project' });
    projectId = project.id;
  });

  afterEach(() => {
    // Clean up test data
    const db = DatabaseConnection.getInstance();
    db.prepare('DELETE FROM tasks').run();
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
    test('should create a new task', async () => {
      const task = await taskRepo.create({
        projectId,
        title: 'Test Task',
        description: 'A test task',
        phase: 'requirements'
      });

      expect(task.id).toMatch(/^[a-f0-9]{32}$/);
      expect(task.projectId).toBe(projectId);
      expect(task.title).toBe('Test Task');
      expect(task.description).toBe('A test task');
      expect(task.phase).toBe('requirements');
      expect(task.status).toBe('pending');
      expect(task.priority).toBe(1);
    });

    test('should create task with parent', async () => {
      const parent = await taskRepo.create({
        projectId,
        title: 'Parent Task',
        phase: 'design'
      });

      const child = await taskRepo.create({
        projectId,
        parentId: parent.id,
        title: 'Child Task',
        phase: 'design'
      });

      expect(child.parentId).toBe(parent.id);
    });

    test('should create task with dependencies', async () => {
      const dep1 = await taskRepo.create({
        projectId,
        title: 'Dependency 1',
        phase: 'requirements'
      });

      const dep2 = await taskRepo.create({
        projectId,
        title: 'Dependency 2',
        phase: 'requirements'
      });

      const task = await taskRepo.create({
        projectId,
        title: 'Dependent Task',
        phase: 'requirements',
        dependencies: [dep1.id, dep2.id]
      });

      expect(task.dependencies).toEqual([dep1.id, dep2.id]);
    });

    test('should validate required fields', async () => {
      await expect(taskRepo.create({}))
        .rejects.toThrow('Task projectId, title, and phase are required');
    });

    test('should validate phase value', async () => {
      await expect(taskRepo.create({
        projectId,
        title: 'Invalid Phase',
        phase: 'invalid' as any
      })).rejects.toThrow('Invalid task phase: invalid');
    });
  });

  describe('getTaskTree', () => {
    test('should build hierarchical task tree', async () => {
      // Create parent tasks
      const parent1 = await taskRepo.create({
        projectId,
        title: 'Parent 1',
        phase: 'requirements'
      });

      const parent2 = await taskRepo.create({
        projectId,
        title: 'Parent 2',
        phase: 'requirements'
      });

      // Create children
      await taskRepo.create({
        projectId,
        parentId: parent1.id,
        title: 'Child 1.1',
        phase: 'requirements'
      });

      await taskRepo.create({
        projectId,
        parentId: parent1.id,
        title: 'Child 1.2',
        phase: 'requirements'
      });

      await taskRepo.create({
        projectId,
        parentId: parent2.id,
        title: 'Child 2.1',
        phase: 'requirements'
      });

      const tree = await taskRepo.getTaskTree(projectId);

      expect(tree).toHaveLength(2);
      expect(tree[0].title).toBe('Parent 1');
      expect(tree[0].children).toHaveLength(2);
      expect(tree[0].children[0].title).toBe('Child 1.1');
      expect(tree[0].children[1].title).toBe('Child 1.2');
      expect(tree[1].title).toBe('Parent 2');
      expect(tree[1].children).toHaveLength(1);
    });
  });

  describe('checkDependencies', () => {
    test('should check if all dependencies are completed', async () => {
      const dep1 = await taskRepo.create({
        projectId,
        title: 'Dep 1',
        phase: 'requirements',
        status: 'completed'
      });

      const dep2 = await taskRepo.create({
        projectId,
        title: 'Dep 2',
        phase: 'requirements',
        status: 'pending'
      });

      const task = await taskRepo.create({
        projectId,
        title: 'Main Task',
        phase: 'requirements',
        dependencies: [dep1.id, dep2.id]
      });

      // Should be false because dep2 is not completed
      let canProceed = await taskRepo.checkDependencies(task.id);
      expect(canProceed).toBe(false);

      // Update dep2 to completed
      await taskRepo.update(dep2.id, { status: 'completed' });

      // Now should be true
      canProceed = await taskRepo.checkDependencies(task.id);
      expect(canProceed).toBe(true);
    });

    test('should return true for task with no dependencies', async () => {
      const task = await taskRepo.create({
        projectId,
        title: 'No Deps',
        phase: 'requirements'
      });

      const canProceed = await taskRepo.checkDependencies(task.id);
      expect(canProceed).toBe(true);
    });
  });

  describe('findByProject', () => {
    beforeEach(async () => {
      await taskRepo.create({
        projectId,
        title: 'Task 1',
        phase: 'requirements',
        status: 'pending',
        priority: 1
      });

      await taskRepo.create({
        projectId,
        title: 'Task 2',
        phase: 'design',
        status: 'in_progress',
        assigneeType: 'design',
        priority: 2
      });

      await taskRepo.create({
        projectId,
        title: 'Task 3',
        phase: 'requirements',
        status: 'completed',
        priority: 3
      });
    });

    test('should find all tasks for project', async () => {
      const tasks = await taskRepo.findByProject(projectId);
      expect(tasks).toHaveLength(3);
    });

    test('should filter by status', async () => {
      const pending = await taskRepo.findByProject(projectId, { status: 'pending' });
      expect(pending).toHaveLength(1);
      expect(pending[0].title).toBe('Task 1');
    });

    test('should filter by phase', async () => {
      const requirements = await taskRepo.findByProject(projectId, { phase: 'requirements' });
      expect(requirements).toHaveLength(2);
    });

    test('should order by priority DESC', async () => {
      const tasks = await taskRepo.findByProject(projectId);
      expect(tasks[0].priority).toBe(3);
      expect(tasks[1].priority).toBe(2);
      expect(tasks[2].priority).toBe(1);
    });
  });
});