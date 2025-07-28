import { AgenticMCPServer } from '../../../src/server';
import { DatabaseConnection } from '../../../src/db/database';
import { ProjectRepository } from '../../../src/repositories/ProjectRepository';
import { TaskRepository } from '../../../src/repositories/TaskRepository';
import { WorkflowRepository } from '../../../src/repositories/WorkflowRepository';
import { AgentSessionRepository } from '../../../src/repositories/AgentSessionRepository';
import { FileSync } from '../../../src/sync/FileSync';
import { existsSync, rmSync } from 'fs';
import path from 'path';

describe('workflow_resume tool', () => {
  let server: AgenticMCPServer;
  let projectRepo: ProjectRepository;
  let taskRepo: TaskRepository;
  let workflowRepo: WorkflowRepository;
  let agentSessionRepo: AgentSessionRepository;
  let fileSync: FileSync;
  const testDbPath = 'test-workflow-resume.db';
  const testProjectsDir = path.join(process.cwd(), 'test-projects');
  let projectId: string;
  let taskIds: string[] = [];

  beforeAll(async () => {
    process.env.MCP_DB_PATH = testDbPath;
    server = new AgenticMCPServer();
    projectRepo = new ProjectRepository();
    taskRepo = new TaskRepository();
    workflowRepo = new WorkflowRepository();
    agentSessionRepo = new AgentSessionRepository();
    fileSync = new FileSync(testProjectsDir);

    // Create a test project
    const project = await projectRepo.create({
      name: 'Resume Test Project',
      description: 'Test project for workflow resume functionality'
    });
    projectId = project.id;

    // Create project files
    await fileSync.createProjectFiles(projectId, project.name, project.description || undefined);

    // Create test tasks across different phases and statuses
    const tasksData = [
      { title: 'Requirements Task 1', phase: 'requirements', status: 'completed' },
      { title: 'Requirements Task 2', phase: 'requirements', status: 'completed' },
      { title: 'Design Task 1', phase: 'design', status: 'in_progress' },
      { title: 'Design Task 2', phase: 'design', status: 'pending' },
      { title: 'Design Task 3', phase: 'design', status: 'blocked' },
      { title: 'Implementation Task 1', phase: 'execute', status: 'pending' },
    ];

    for (const taskData of tasksData) {
      const task = await taskRepo.create({
        projectId,
        title: taskData.title,
        phase: taskData.phase as any,
        status: taskData.status as any,
        priority: 1
      });
      taskIds.push(task.id);
    }

    // Create some workflow checkpoints
    await workflowRepo.createCheckpoint(projectId, 'requirements');
    
    // Create agent sessions with context
    await agentSessionRepo.create({
      projectId,
      agentType: 'requirements',
      contextData: {
        requirements: 'User authentication and dashboard',
        focus: 'Security and user experience'
      }
    });

    await agentSessionRepo.create({
      projectId,
      agentType: 'design',
      contextData: {
        architecture: 'microservices',
        database: 'PostgreSQL',
        frontend: 'React'
      }
    });
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

  describe('successful workflow resume', () => {
    test('should resume workflow with complete state', async () => {
      const result = await (server as any).handleWorkflowResume({
        projectId
      });

      expect(result.success).toBe(true);
      expect(result.project.id).toBe(projectId);
      expect(result.project.name).toBe('Resume Test Project');
      expect(result.project.description).toBe('Test project for workflow resume functionality');

      // Check project status
      expect(result.project.status).toBeDefined();
      expect(result.project.currentPhase).toBeDefined();

      // Check checkpoint information
      expect(result.checkpoint).toBeDefined();
      expect(result.checkpoint.phase).toBe('requirements');
      expect(result.checkpoint.id).toBeDefined();

      // Check workflow history
      expect(result.workflow.totalCheckpoints).toBe(1);
      expect(result.workflow.checkpointHistory).toHaveLength(1);
      expect(result.workflow.phases.requirements.completed).toBe(true);

      // Check task statistics
      expect(result.tasks.total).toBe(6);
      expect(result.tasks.completed).toBe(2);
      expect(result.tasks.inProgress).toBe(1);
      expect(result.tasks.pending).toBe(2);
      expect(result.tasks.blocked).toBe(1);
      expect(result.tasks.progressPercent).toBe(33); // 2/6 * 100 rounded

      // Check task breakdown by phase
      expect(result.tasks.byPhase.requirements).toBe(2);
      expect(result.tasks.byPhase.design).toBe(3);
      expect(result.tasks.byPhase.execute).toBe(1);

      // Check task hierarchy
      expect(result.tasks.hierarchy).toBeDefined();
      expect(Array.isArray(result.tasks.hierarchy)).toBe(true);

      // Check contexts
      expect(result.contexts.available).toContain('requirements');
      expect(result.contexts.available).toContain('design');
      expect(result.contexts.sessions).toHaveLength(2);

      // Check recommendations
      expect(result.recommendations.nextActions).toBeDefined();
      expect(Array.isArray(result.recommendations.nextActions)).toBe(true);
      
      // Should recommend unblocking first (high priority)
      const unblockAction = result.recommendations.nextActions.find((a: any) => a.type === 'unblock');
      expect(unblockAction).toBeDefined();
      expect(unblockAction.priority).toBe('high');
      expect(unblockAction.tasks).toHaveLength(1);

      // Should recommend continuing in-progress tasks
      const continueAction = result.recommendations.nextActions.find((a: any) => a.type === 'continue');
      expect(continueAction).toBeDefined();
      expect(continueAction.priority).toBe('medium');
      expect(continueAction.tasks).toHaveLength(1);

      // Should recommend starting pending tasks
      const startAction = result.recommendations.nextActions.find((a: any) => a.type === 'start');
      expect(startAction).toBeDefined();
      expect(startAction.tasks).toHaveLength(2);

      // Check priority tasks
      expect(result.recommendations.priorityTasks).toBeDefined();
      expect(result.recommendations.priorityTasks.length).toBeGreaterThan(0);

      // Check file structure
      expect(result.files.projectPath).toContain(projectId);
      expect(result.files.structure.readme).toBe('README.md');
      expect(result.files.structure.contexts).toBe('contexts/');

      // Check metadata
      expect(result.metadata.resumeTimestamp).toBeDefined();
      expect(result.metadata.lastCheckpoint).toBeDefined();
      expect(typeof result.metadata.lastActivity).toBe('number');

      // Check message
      expect(result.message).toContain('resumed from requirements checkpoint');
      expect(result.message).toContain('recommended actions');
    });

    test('should detect when phase is complete and ready for handoff', async () => {
      // Mark all design tasks as completed
      await taskRepo.update(taskIds[2], { status: 'completed' }); // Design Task 1
      await taskRepo.update(taskIds[3], { status: 'completed' }); // Design Task 2  
      await taskRepo.update(taskIds[4], { status: 'completed' }); // Design Task 3

      // Set project to design phase
      await projectRepo.update(projectId, { currentPhase: 'design' });

      const result = await (server as any).handleWorkflowResume({
        projectId
      });

      expect(result.success).toBe(true);
      expect(result.recommendations.phaseComplete).toBe(true);
      expect(result.recommendations.readyForHandoff).toBe(true);

      // Should have handoff as the first (highest priority) recommendation
      expect(result.recommendations.nextActions[0].type).toBe('handoff');
      expect(result.recommendations.nextActions[0].priority).toBe('high');
      expect(result.recommendations.nextActions[0].phaseComplete).toBe(true);
    });

    test('should work with project without checkpoints', async () => {
      // Create a new project without checkpoints
      const newProject = await projectRepo.create({
        name: 'No Checkpoints Project'
      });

      const result = await (server as any).handleWorkflowResume({
        projectId: newProject.id
      });

      expect(result.success).toBe(true);
      expect(result.checkpoint).toBeNull();
      expect(result.workflow.totalCheckpoints).toBe(0);
      expect(result.tasks.total).toBe(0);
      expect(result.message).toContain('Project is in requirements phase');
    });

    test('should include markdown history when available', async () => {
      // Create some agent context in markdown
      await fileSync.writeAgentContext(projectId, 'design', {
        summary: 'Design phase progress',
        context: { architecture: 'microservices' }
      });

      const result = await (server as any).handleWorkflowResume({
        projectId
      });

      expect(result.success).toBe(true);
      expect(result.files.markdownHistory).toBeDefined();
    });
  });

  describe('validation and error handling', () => {
    test('should validate required fields', async () => {
      // Missing projectId
      await expect((server as any).handleWorkflowResume({}))
        .rejects.toThrow('Project ID is required and must be a string');

      // Invalid projectId type
      await expect((server as any).handleWorkflowResume({
        projectId: 123
      })).rejects.toThrow('Project ID is required and must be a string');
    });

    test('should validate project exists', async () => {
      await expect((server as any).handleWorkflowResume({
        projectId: 'non-existent-project'
      })).rejects.toThrow('Project not found: non-existent-project');
    });
  });

  describe('different project states', () => {
    test('should handle empty project', async () => {
      const emptyProject = await projectRepo.create({
        name: 'Empty Project'
      });

      const result = await (server as any).handleWorkflowResume({
        projectId: emptyProject.id
      });

      expect(result.success).toBe(true);
      expect(result.tasks.total).toBe(0);
      expect(result.tasks.progressPercent).toBe(0);
      expect(result.recommendations.nextActions).toHaveLength(0);
      expect(result.contexts.available).toHaveLength(0);
    });

    test('should handle project with only completed tasks', async () => {
      const completedProject = await projectRepo.create({
        name: 'Completed Project'
      });

      // Create completed tasks
      await taskRepo.create({
        projectId: completedProject.id,
        title: 'Completed Task',
        phase: 'requirements',
        status: 'completed'
      });

      const result = await (server as any).handleWorkflowResume({
        projectId: completedProject.id
      });

      expect(result.success).toBe(true);
      expect(result.tasks.completed).toBe(1);
      expect(result.tasks.progressPercent).toBe(100);
      expect(result.recommendations.phaseComplete).toBe(true);
    });

    test('should calculate active agents correctly', async () => {
      // Create recent agent session (within 24h)
      await agentSessionRepo.create({
        projectId,
        agentType: 'implementation',
        contextData: { recent: 'activity' }
      });

      const result = await (server as any).handleWorkflowResume({
        projectId
      });

      expect(result.metadata.activeAgents).toBeGreaterThan(0);
    });
  });

  describe('response structure validation', () => {
    test('should return comprehensive state structure', async () => {
      const result = await (server as any).handleWorkflowResume({
        projectId
      });

      // Validate main structure
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('project');
      expect(result).toHaveProperty('checkpoint');
      expect(result).toHaveProperty('workflow');
      expect(result).toHaveProperty('tasks');
      expect(result).toHaveProperty('contexts');
      expect(result).toHaveProperty('files');
      expect(result).toHaveProperty('recommendations');
      expect(result).toHaveProperty('metadata');
      expect(result).toHaveProperty('message');

      // Validate project structure
      expect(result.project).toHaveProperty('id');
      expect(result.project).toHaveProperty('name');
      expect(result.project).toHaveProperty('status');
      expect(result.project).toHaveProperty('currentPhase');

      // Validate workflow structure
      expect(result.workflow).toHaveProperty('totalCheckpoints');
      expect(result.workflow).toHaveProperty('checkpointHistory');
      expect(result.workflow).toHaveProperty('phases');

      // Validate tasks structure
      expect(result.tasks).toHaveProperty('total');
      expect(result.tasks).toHaveProperty('completed');
      expect(result.tasks).toHaveProperty('progressPercent');
      expect(result.tasks).toHaveProperty('hierarchy');
      expect(result.tasks).toHaveProperty('byPhase');

      // Validate recommendations structure
      expect(result.recommendations).toHaveProperty('nextActions');
      expect(result.recommendations).toHaveProperty('priorityTasks');
      expect(result.recommendations).toHaveProperty('phaseComplete');
      expect(result.recommendations).toHaveProperty('readyForHandoff');
    });
  });
});