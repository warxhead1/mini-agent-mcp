import { AgenticMCPServer } from '../../../src/server';
import { DatabaseConnection } from '../../../src/db/database';
import { ProjectRepository } from '../../../src/repositories/ProjectRepository';
import { TaskRepository } from '../../../src/repositories/TaskRepository';
import { WorkflowRepository } from '../../../src/repositories/WorkflowRepository';
import { FileSync } from '../../../src/sync/FileSync';
import { existsSync, rmSync, readFileSync } from 'fs';
import path from 'path';

describe('workflow_handoff tool', () => {
  let server: AgenticMCPServer;
  let projectRepo: ProjectRepository;
  let taskRepo: TaskRepository;
  let workflowRepo: WorkflowRepository;
  let fileSync: FileSync;
  const testDbPath = 'test-workflow-handoff.db';
  const testProjectsDir = path.join(process.cwd(), 'test-projects');
  let projectId: string;
  let task1Id: string;
  let task2Id: string;

  beforeAll(async () => {
    process.env.MCP_DB_PATH = testDbPath;
    server = new AgenticMCPServer();
    projectRepo = new ProjectRepository();
    taskRepo = new TaskRepository();
    workflowRepo = new WorkflowRepository();
    fileSync = new FileSync(testProjectsDir);

    // Create a test project
    const project = await projectRepo.create({
      name: 'Workflow Handoff Test Project'
    });
    projectId = project.id;

    // Create project files
    await fileSync.createProjectFiles(projectId, project.name);

    // Create some test tasks
    const task1 = await taskRepo.create({
      projectId,
      title: 'Requirements Task 1',
      phase: 'requirements'
    });
    task1Id = task1.id;

    const task2 = await taskRepo.create({
      projectId,
      title: 'Requirements Task 2', 
      phase: 'requirements'
    });
    task2Id = task2.id;
  });

  afterEach(async () => {
    // Reset project phase
    await projectRepo.update(projectId, { 
      currentPhase: 'requirements',
      status: 'active'
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

  describe('successful workflow handoffs', () => {
    test('should handoff from requirements to design', async () => {
      const deliverables = {
        requirements: './requirements.md',
        userStories: ['Login story', 'Register story'],
        acceptanceCriteria: ['Secure auth', 'Password validation']
      };

      const result = await (server as any).handleWorkflowHandoff({
        projectId,
        currentPhase: 'requirements',
        completedTasks: [task1Id, task2Id],
        phaseDeliverables: deliverables,
        handoffNotes: 'Requirements phase completed. Focus on security architecture.'
      });

      expect(result.success).toBe(true);
      expect(result.checkpoint.phase).toBe('requirements');
      expect(result.checkpoint.completedTasks).toEqual([task1Id, task2Id]);
      expect(result.checkpoint.deliverables).toEqual(deliverables);

      expect(result.project.currentPhase).toBe('design');
      expect(result.project.status).toBe('active');

      expect(result.handoff.fromPhase).toBe('requirements');
      expect(result.handoff.toPhase).toBe('design');
      expect(result.handoff.handoffNotes).toBe('Requirements phase completed. Focus on security architecture.');

      expect(result.files.handoffDocument).toBe('handoffs/requirements-to-design.md');
      expect(result.message).toBe("Phase 'requirements' completed. Handoff to 'design' phase created.");

      // Verify database updates
      const updatedProject = await projectRepo.findById(projectId);
      expect(updatedProject?.currentPhase).toBe('design');

      // Verify checkpoint was created
      const checkpoints = await workflowRepo.getCheckpointsByPhase(projectId, 'requirements');
      expect(checkpoints).toHaveLength(1);

      // Verify handoff document was created
      const handoffFile = path.join(testProjectsDir, projectId, 'handoffs', 'requirements-to-design.md');
      expect(existsSync(handoffFile)).toBe(true);
      
      const handoffContent = readFileSync(handoffFile, 'utf-8');
      expect(handoffContent).toContain('Requirements Phase Handoff');
      expect(handoffContent).toContain('Focus on security architecture');
      expect(handoffContent).toContain('Login story');

      // Verify README was updated
      const readmeFile = path.join(testProjectsDir, projectId, 'README.md');
      const readmeContent = readFileSync(readmeFile, 'utf-8');
      expect(readmeContent).toContain('- [x] Requirements');
      expect(readmeContent).toContain('**Current Phase**: design');
    });

    test('should handoff from design to tasks', async () => {
      // First set project to design phase
      await projectRepo.update(projectId, { currentPhase: 'design' });

      const result = await (server as any).handleWorkflowHandoff({
        projectId,
        currentPhase: 'design',
        phaseDeliverables: {
          architecture: 'microservices',
          components: ['API', 'Database', 'Frontend']
        },
        handoffNotes: 'Design complete. Ready for task breakdown.'
      });

      expect(result.success).toBe(true);
      expect(result.project.currentPhase).toBe('tasks');
      expect(result.handoff.fromPhase).toBe('design');
      expect(result.handoff.toPhase).toBe('tasks');
      expect(result.files.handoffDocument).toBe('handoffs/design-to-tasks.md');
    });

    test('should handoff from tasks to execute', async () => {
      // Set project to tasks phase
      await projectRepo.update(projectId, { currentPhase: 'tasks' });

      const result = await (server as any).handleWorkflowHandoff({
        projectId,
        currentPhase: 'tasks',
        phaseDeliverables: {
          taskList: './tasks.md',
          totalTasks: 15
        },
        handoffNotes: 'Task breakdown complete. Implementation can begin.'
      });

      expect(result.success).toBe(true);
      expect(result.project.currentPhase).toBe('execute');
      expect(result.handoff.toPhase).toBe('execute');
    });

    test('should complete project after execute phase', async () => {
      // Set project to execute phase
      await projectRepo.update(projectId, { currentPhase: 'execute' });

      const result = await (server as any).handleWorkflowHandoff({
        projectId,
        currentPhase: 'execute',
        phaseDeliverables: {
          codebase: 'Complete implementation',
          tests: 'All tests passing'
        },
        handoffNotes: 'Implementation complete. Project finished.'
      });

      expect(result.success).toBe(true);
      expect(result.project.status).toBe('completed');
      expect(result.handoff.fromPhase).toBe('execute');
      expect(result.handoff.toPhase).toBe('completed');
      expect(result.message).toBe('Project completed. All phases finished.');

      // Verify project status in database
      const completedProject = await projectRepo.findById(projectId);
      expect(completedProject?.status).toBe('completed');
    });

    test('should work without completed tasks', async () => {
      const result = await (server as any).handleWorkflowHandoff({
        projectId,
        currentPhase: 'requirements',
        phaseDeliverables: { requirements: 'Basic requirements' },
        handoffNotes: 'Phase complete without specific tasks'
      });

      expect(result.success).toBe(true);
      expect(result.checkpoint.completedTasks).toEqual([]);
    });
  });

  describe('validation errors', () => {
    test('should validate required fields', async () => {
      // Missing projectId
      await expect((server as any).handleWorkflowHandoff({
        currentPhase: 'requirements',
        phaseDeliverables: {},
        handoffNotes: 'Notes'
      })).rejects.toThrow('Project ID is required and must be a string');

      // Missing currentPhase
      await expect((server as any).handleWorkflowHandoff({
        projectId,
        phaseDeliverables: {},
        handoffNotes: 'Notes'
      })).rejects.toThrow('Current phase is required and must be a string');

      // Missing phaseDeliverables
      await expect((server as any).handleWorkflowHandoff({
        projectId,
        currentPhase: 'requirements',
        handoffNotes: 'Notes'
      })).rejects.toThrow('Phase deliverables are required and must be an object');

      // Missing handoffNotes
      await expect((server as any).handleWorkflowHandoff({
        projectId,
        currentPhase: 'requirements',
        phaseDeliverables: {}
      })).rejects.toThrow('Handoff notes are required and must be a string');
    });

    test('should validate phase values', async () => {
      await expect((server as any).handleWorkflowHandoff({
        projectId,
        currentPhase: 'invalid_phase',
        phaseDeliverables: {},
        handoffNotes: 'Notes'
      })).rejects.toThrow('Invalid phase. Must be one of: requirements, design, tasks, execute');
    });

    test('should validate completedTasks array', async () => {
      await expect((server as any).handleWorkflowHandoff({
        projectId,
        currentPhase: 'requirements',
        completedTasks: 'not-an-array',
        phaseDeliverables: {},
        handoffNotes: 'Notes'
      })).rejects.toThrow('Completed tasks must be an array of task IDs');
    });

    test('should validate project exists', async () => {
      await expect((server as any).handleWorkflowHandoff({
        projectId: 'non-existent-project',
        currentPhase: 'requirements',
        phaseDeliverables: {},
        handoffNotes: 'Notes'
      })).rejects.toThrow('Project not found: non-existent-project');
    });

    test('should validate completed tasks exist', async () => {
      await expect((server as any).handleWorkflowHandoff({
        projectId,
        currentPhase: 'requirements',
        completedTasks: ['non-existent-task'],
        phaseDeliverables: {},
        handoffNotes: 'Notes'
      })).rejects.toThrow('Task not found: non-existent-task');
    });

    test('should validate tasks belong to project', async () => {
      // Create task in different project
      const otherProject = await projectRepo.create({ name: 'Other Project' });
      const otherTask = await taskRepo.create({
        projectId: otherProject.id,
        title: 'Other Task',
        phase: 'requirements'
      });

      await expect((server as any).handleWorkflowHandoff({
        projectId,
        currentPhase: 'requirements',
        completedTasks: [otherTask.id],
        phaseDeliverables: {},
        handoffNotes: 'Notes'
      })).rejects.toThrow(`Task ${otherTask.id} does not belong to project ${projectId}`);
    });
  });

  describe('workflow state transitions', () => {
    test('should create complete workflow through all phases', async () => {
      // Requirements → Design
      await (server as any).handleWorkflowHandoff({
        projectId,
        currentPhase: 'requirements',
        phaseDeliverables: { requirements: 'done' },
        handoffNotes: 'Requirements to design'
      });

      let project = await projectRepo.findById(projectId);
      expect(project?.currentPhase).toBe('design');

      // Design → Tasks
      await (server as any).handleWorkflowHandoff({
        projectId,
        currentPhase: 'design',
        phaseDeliverables: { design: 'done' },
        handoffNotes: 'Design to tasks'
      });

      project = await projectRepo.findById(projectId);
      expect(project?.currentPhase).toBe('tasks');

      // Tasks → Execute
      await (server as any).handleWorkflowHandoff({
        projectId,
        currentPhase: 'tasks',
        phaseDeliverables: { tasks: 'done' },
        handoffNotes: 'Tasks to execute'
      });

      project = await projectRepo.findById(projectId);
      expect(project?.currentPhase).toBe('execute');

      // Execute → Completed
      await (server as any).handleWorkflowHandoff({
        projectId,
        currentPhase: 'execute',
        phaseDeliverables: { implementation: 'done' },
        handoffNotes: 'Execute to completion'
      });

      project = await projectRepo.findById(projectId);
      expect(project?.status).toBe('completed');

      // Verify all handoff documents exist
      const handoffDir = path.join(testProjectsDir, projectId, 'handoffs');
      expect(existsSync(path.join(handoffDir, 'requirements-to-design.md'))).toBe(true);
      expect(existsSync(path.join(handoffDir, 'design-to-tasks.md'))).toBe(true);
      expect(existsSync(path.join(handoffDir, 'tasks-to-execute.md'))).toBe(true);
    });
  });
});