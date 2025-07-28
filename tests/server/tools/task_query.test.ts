import { AgenticMCPServer } from '../../../src/server';
import { DatabaseConnection } from '../../../src/db/database';
import { ProjectRepository } from '../../../src/repositories/ProjectRepository';
import { TaskRepository } from '../../../src/repositories/TaskRepository';
import { FileSync } from '../../../src/sync/FileSync';
import { existsSync, rmSync } from 'fs';
import path from 'path';

describe('task_query tool', () => {
  let server: AgenticMCPServer;
  let projectRepo: ProjectRepository;
  let taskRepo: TaskRepository;
  let fileSync: FileSync;
  const testDbPath = 'test-task-query.db';
  const testProjectsDir = path.join(process.cwd(), 'test-projects');
  let project1Id: string;
  let project2Id: string;
  let task1Id: string;
  let task2Id: string;
  let task3Id: string;
  let task4Id: string;

  beforeAll(async () => {
    process.env.MCP_DB_PATH = testDbPath;
    server = new AgenticMCPServer();
    projectRepo = new ProjectRepository();
    taskRepo = new TaskRepository();
    fileSync = new FileSync(testProjectsDir);

    // Create test projects
    const project1 = await projectRepo.create({
      name: 'Query Test Project 1'
    });
    project1Id = project1.id;

    const project2 = await projectRepo.create({
      name: 'Query Test Project 2'
    });
    project2Id = project2.id;

    // Create project files
    await fileSync.createProjectFiles(project1Id, project1.name);
    await fileSync.createProjectFiles(project2Id, project2.name);

    // Create test tasks with different attributes
    const task1 = await taskRepo.create({
      projectId: project1Id,
      title: 'Requirements Task',
      phase: 'requirements',
      status: 'pending',
      assigneeType: 'requirements',
      priority: 1
    });
    task1Id = task1.id;

    const task2 = await taskRepo.create({
      projectId: project1Id,
      title: 'Design Task',
      phase: 'design',
      status: 'in_progress',
      assigneeType: 'design',
      priority: 2
    });
    task2Id = task2.id;

    const task3 = await taskRepo.create({
      projectId: project1Id,
      parentId: task2Id,
      title: 'Design Subtask',
      phase: 'design',
      status: 'completed',
      assigneeType: 'design',
      priority: 1
    });
    task3Id = task3.id;

    const task4 = await taskRepo.create({
      projectId: project2Id,
      title: 'Implementation Task',
      phase: 'execute',
      status: 'blocked',
      assigneeType: 'implementation',
      priority: 3
    });
    task4Id = task4.id;
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

  describe('project-specific queries', () => {
    test('should query all tasks for a specific project', async () => {
      const result = await (server as any).handleTaskQuery({
        projectId: project1Id
      });

      expect(result.success).toBe(true);
      expect(result.totalTasks).toBe(3);
      expect(result.tasks).toHaveLength(3);
      expect(result.project.id).toBe(project1Id);
      expect(result.project.name).toBe('Query Test Project 1');

      // Verify all tasks belong to project1
      expect(result.tasks.every((task: any) => task.projectId === project1Id)).toBe(true);

      // Verify task metadata
      const task1 = result.tasks.find((t: any) => t.id === task1Id);
      expect(task1.title).toBe('Requirements Task');
      expect(task1.phase).toBe('requirements');
      expect(task1.status).toBe('pending');
      expect(task1.files.progressFile).toBe(`implementation/task-${task1Id}.md`);

      // Verify summary statistics
      expect(result.summary.statusBreakdown.pending).toBe(1);
      expect(result.summary.statusBreakdown.in_progress).toBe(1);
      expect(result.summary.statusBreakdown.completed).toBe(1);
      expect(result.summary.phaseBreakdown.requirements).toBe(1);
      expect(result.summary.phaseBreakdown.design).toBe(2);
    });

    test('should filter tasks by status', async () => {
      const result = await (server as any).handleTaskQuery({
        projectId: project1Id,
        status: 'in_progress'
      });

      expect(result.success).toBe(true);
      expect(result.totalTasks).toBe(1);
      expect(result.tasks[0].id).toBe(task2Id);
      expect(result.tasks[0].status).toBe('in_progress');
      expect(result.query.filters.status).toBe('in_progress');
    });

    test('should filter tasks by phase', async () => {
      const result = await (server as any).handleTaskQuery({
        projectId: project1Id,
        phase: 'design'
      });

      expect(result.success).toBe(true);
      expect(result.totalTasks).toBe(2);
      expect(result.tasks.every((task: any) => task.phase === 'design')).toBe(true);
      expect(result.query.filters.phase).toBe('design');
    });

    test('should filter tasks by assignee type', async () => {
      const result = await (server as any).handleTaskQuery({
        projectId: project1Id,
        assigneeType: 'design'
      });

      expect(result.success).toBe(true);
      expect(result.totalTasks).toBe(2);
      expect(result.tasks.every((task: any) => task.assigneeType === 'design')).toBe(true);
    });

    test('should combine multiple filters', async () => {
      const result = await (server as any).handleTaskQuery({
        projectId: project1Id,
        phase: 'design',
        status: 'completed'
      });

      expect(result.success).toBe(true);
      expect(result.totalTasks).toBe(1);
      expect(result.tasks[0].id).toBe(task3Id);
      expect(result.tasks[0].phase).toBe('design');
      expect(result.tasks[0].status).toBe('completed');
    });

    test('should include hierarchical structure when requested', async () => {
      const result = await (server as any).handleTaskQuery({
        projectId: project1Id,
        includeHierarchy: true
      });

      expect(result.success).toBe(true);
      expect(result.hierarchy).toBeDefined();
      expect(Array.isArray(result.hierarchy)).toBe(true);

      // Find parent task in hierarchy
      const parentTask = result.hierarchy.find((task: any) => task.id === task2Id);
      expect(parentTask).toBeDefined();
      expect(parentTask.children).toHaveLength(1);
      expect(parentTask.children[0].id).toBe(task3Id);
    });
  });

  describe('cross-project queries', () => {
    test('should query tasks across all projects', async () => {
      const result = await (server as any).handleTaskQuery({});

      expect(result.success).toBe(true);
      expect(result.totalTasks).toBe(4);
      expect(result.projectCount).toBe(2);
      expect(result.projects).toBeDefined();

      // Verify both projects are included
      expect(result.projects[project1Id]).toBeDefined();
      expect(result.projects[project2Id]).toBeDefined();
      expect(result.projects[project1Id].tasks).toHaveLength(3);
      expect(result.projects[project2Id].tasks).toHaveLength(1);

      // Verify project metadata
      expect(result.projects[project1Id].project.name).toBe('Query Test Project 1');
      expect(result.projects[project2Id].project.name).toBe('Query Test Project 2');
    });

    test('should filter across all projects by status', async () => {
      const result = await (server as any).handleTaskQuery({
        status: 'blocked'
      });

      expect(result.success).toBe(true);
      expect(result.totalTasks).toBe(1);
      expect(result.projectCount).toBe(1);
      expect(result.projects[project2Id].tasks[0].id).toBe(task4Id);
      expect(result.projects[project2Id].tasks[0].status).toBe('blocked');
    });

    test('should filter across all projects by phase', async () => {
      const result = await (server as any).handleTaskQuery({
        phase: 'design'
      });

      expect(result.success).toBe(true);
      expect(result.totalTasks).toBe(2);
      expect(result.projectCount).toBe(1);
      expect(result.projects[project1Id]).toBeDefined();
      expect(result.projects[project2Id]).toBeUndefined();
    });

    test('should filter across all projects by assignee type', async () => {
      const result = await (server as any).handleTaskQuery({
        assigneeType: 'implementation'
      });

      expect(result.success).toBe(true);
      expect(result.totalTasks).toBe(1);
      expect(result.projects[project2Id].tasks[0].assigneeType).toBe('implementation');
    });
  });

  describe('validation and error handling', () => {
    test('should validate field types', async () => {
      // Invalid projectId type
      await expect((server as any).handleTaskQuery({
        projectId: 123
      })).rejects.toThrow('Project ID must be a string if provided');

      // Invalid status type
      await expect((server as any).handleTaskQuery({
        status: 123
      })).rejects.toThrow('Status must be a string if provided');

      // Invalid phase type
      await expect((server as any).handleTaskQuery({
        phase: 123
      })).rejects.toThrow('Phase must be a string if provided');

      // Invalid assigneeType type
      await expect((server as any).handleTaskQuery({
        assigneeType: 123
      })).rejects.toThrow('Assignee type must be a string if provided');
    });

    test('should validate enum values', async () => {
      // Invalid status value
      await expect((server as any).handleTaskQuery({
        status: 'invalid_status'
      })).rejects.toThrow('Invalid status. Must be one of: pending, in_progress, blocked, completed');

      // Invalid phase value
      await expect((server as any).handleTaskQuery({
        phase: 'invalid_phase'
      })).rejects.toThrow('Invalid phase. Must be one of: requirements, design, tasks, execute');

      // Invalid assignee type value
      await expect((server as any).handleTaskQuery({
        assigneeType: 'invalid_type'
      })).rejects.toThrow('Invalid assignee type. Must be one of: requirements, design, tasks, implementation');
    });

    test('should validate project exists', async () => {
      await expect((server as any).handleTaskQuery({
        projectId: 'non-existent-project'
      })).rejects.toThrow('Project not found: non-existent-project');
    });

    test('should return empty results for no matches', async () => {
      const result = await (server as any).handleTaskQuery({
        projectId: project1Id,
        status: 'blocked'
      });

      expect(result.success).toBe(true);
      expect(result.totalTasks).toBe(0);
      expect(result.tasks).toHaveLength(0);
      expect(result.summary.statusBreakdown).toEqual({});
    });
  });

  describe('response structure and metadata', () => {
    test('should include file paths and metadata', async () => {
      const result = await (server as any).handleTaskQuery({
        projectId: project1Id
      });

      const task = result.tasks[0];
      expect(task.files).toBeDefined();
      expect(task.files.progressFile).toBe(`implementation/task-${task.id}.md`);
      expect(task.files.progressPath).toContain(`test-projects/${project1Id}/implementation/task-${task.id}.md`);
      expect(typeof task.files.hasProgressFile).toBe('boolean');
    });

    test('should include comprehensive summary statistics', async () => {
      const result = await (server as any).handleTaskQuery({
        projectId: project1Id
      });

      expect(result.summary).toBeDefined();
      expect(result.summary.statusBreakdown).toEqual({
        pending: 1,
        in_progress: 1,
        completed: 1
      });
      expect(result.summary.phaseBreakdown).toEqual({
        requirements: 1,
        design: 2
      });
      expect(typeof result.summary.hasProgressFiles).toBe('number');
    });

    test('should include query metadata', async () => {
      const result = await (server as any).handleTaskQuery({
        projectId: project1Id,
        status: 'pending',
        includeHierarchy: true
      });

      expect(result.query).toEqual({
        projectId: project1Id,
        filters: {
          status: 'pending',
          phase: 'any',
          assigneeType: 'any'
        },
        includeHierarchy: true
      });
    });
  });
});