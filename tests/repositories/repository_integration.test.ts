import { DatabaseConnection } from '../../src/db/database';
import { ProjectRepository } from '../../src/repositories/ProjectRepository';
import { TaskRepository } from '../../src/repositories/TaskRepository';
import { AgentSessionRepository } from '../../src/repositories/AgentSessionRepository';
import { WorkflowRepository } from '../../src/repositories/WorkflowRepository';
import { existsSync, unlinkSync } from 'fs';

describe('Repository Integration Tests', () => {
  let projectRepo: ProjectRepository;
  let taskRepo: TaskRepository;
  let agentRepo: AgentSessionRepository;
  let workflowRepo: WorkflowRepository;
  const testDbPath = 'test-repo-integration.db';

  beforeAll(() => {
    process.env.MCP_DB_PATH = testDbPath;
    projectRepo = new ProjectRepository();
    taskRepo = new TaskRepository();
    agentRepo = new AgentSessionRepository();
    workflowRepo = new WorkflowRepository();
  });

  beforeEach(() => {
    // Clean slate for each test
    const db = DatabaseConnection.getInstance();
    db.exec('DELETE FROM workflow_checkpoints');
    db.exec('DELETE FROM agent_sessions');
    db.exec('DELETE FROM tasks');
    db.exec('DELETE FROM projects');
  });

  afterAll(() => {
    DatabaseConnection.close();
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
  });

  describe('Cross-Repository Operations', () => {
    test('should handle complete project lifecycle', async () => {
      // Create project
      const project = await projectRepo.create({
        name: 'Lifecycle Test',
        description: 'Testing complete project lifecycle'
      });
      expect(project.id).toBeDefined();

      // Create tasks for the project
      const task1 = await taskRepo.create({
        projectId: project.id,
        title: 'First Task',
        description: 'Description of first task',
        phase: 'requirements',
        status: 'pending',
        priority: 1,
      });

      const task2 = await taskRepo.create({
        projectId: project.id,
        title: 'Second Task',
        description: 'Description of second task',
        phase: 'design',
        status: 'pending',
        priority: 2,
      });

      // Create agent session
      const session = await agentRepo.create({
        projectId: project.id,
        taskId: task1.id,
        agentType: 'requirements',
        contextData: { phase: 'requirements', progress: 'started' },
      });

      // Create workflow checkpoint
      const checkpoint = await workflowRepo.createCheckpoint(
        project.id,
        'requirements',
        {
          completedTasks: [],
          currentTask: task1.id,
          phaseDeliverables: { requirements: './requirements.md' },
        }
      );

      // Verify all entities exist and are related
      const foundProject = await projectRepo.findById(project.id);
      expect(foundProject).toBeDefined();

      const projectTasks = await taskRepo.findByProject(project.id);
      expect(projectTasks).toHaveLength(2);

      const projectSessions = await agentRepo.findByProject(project.id);
      expect(projectSessions).toHaveLength(1);

      const latestCheckpoint = await workflowRepo.getLatestCheckpoint(project.id);
      expect(latestCheckpoint?.id).toBe(checkpoint.id);

      // Update project status
      await projectRepo.updateStatus(project.id, 'paused');
      const updatedProject = await projectRepo.findById(project.id);
      expect(updatedProject?.status).toBe('paused');

      // Update task
      const updatedTask = await taskRepo.update(task1.id, { status: 'in_progress' });
      expect(updatedTask?.status).toBe('in_progress');

      // Update agent session
      await agentRepo.updateContext(session.id, { phase: 'requirements', progress: 'in_progress' });
      const updatedSession = await agentRepo.findById(session.id);
      expect(updatedSession?.contextData.progress).toBe('in_progress');
    });

    test('should handle task hierarchy correctly', async () => {
      const project = await projectRepo.create({
        name: 'Hierarchy Test',
        description: 'Testing task hierarchy'
      });

      // Create parent task
      const parent = await taskRepo.create({
        projectId: project.id,
        title: 'Parent Task',
        description: 'Parent task description',
        phase: 'design',
        status: 'in_progress',
        priority: 1,
      });

      // Create child tasks
      const child1 = await taskRepo.create({
        projectId: project.id,
        parentId: parent.id,
        title: 'Child Task 1',
        description: 'First child task',
        phase: 'design',
        status: 'pending',
        priority: 1,
      });

      const child2 = await taskRepo.create({
        projectId: project.id,
        parentId: parent.id,
        title: 'Child Task 2',
        description: 'Second child task',
        phase: 'design',
        status: 'completed',
        priority: 2,
      });

      // Test hierarchy queries
      const taskTree = await taskRepo.getTaskTree(project.id);
      expect(taskTree).toHaveLength(1); // One root task
      expect(taskTree[0].id).toBe(parent.id);
      expect(taskTree[0].children).toHaveLength(2);

      const children = await taskRepo.getChildren(parent.id);
      expect(children).toHaveLength(2);
      expect(children.some(t => t.id === child1.id)).toBe(true);
      expect(children.some(t => t.id === child2.id)).toBe(true);
    });

    test('should handle agent sessions and context management', async () => {
      const project = await projectRepo.create({
        name: 'Context Test',
        description: 'Testing context management'
      });

      const task = await taskRepo.create({
        projectId: project.id,
        title: 'Context Task',
        phase: 'implementation',
        status: 'in_progress',
        priority: 1,
      });

      // Create multiple agent sessions for different phases
      const requirementsSession = await agentRepo.create({
        projectId: project.id,
        agentType: 'requirements',
        contextData: { 
          phase: 'requirements',
          completed: true,
          deliverables: ['requirements.md']
        },
      });

      const designSession = await agentRepo.create({
        projectId: project.id,
        agentType: 'design',
        contextData: { 
          phase: 'design',
          architecture: 'microservices',
          components: ['api', 'database', 'frontend']
        },
      });

      const implementationSession = await agentRepo.create({
        projectId: project.id,
        taskId: task.id,
        agentType: 'implementation',
        contextData: { 
          currentTask: task.id,
          progress: 'implementing API endpoints'
        },
      });

      // Query sessions by project
      const allSessions = await agentRepo.findByProject(project.id);
      expect(allSessions).toHaveLength(3);

      // Query sessions by agent type
      const requirementsSessions = await agentRepo.findByAgentType('requirements');
      expect(requirementsSessions.some(s => s.id === requirementsSession.id)).toBe(true);

      // Update context
      await agentRepo.updateContext(implementationSession.id, {
        currentTask: task.id,
        progress: 'completed API endpoints',
        nextStep: 'implement database layer'
      });

      const updatedSession = await agentRepo.findById(implementationSession.id);
      expect(updatedSession?.contextData.progress).toBe('completed API endpoints');
    });

    test('should handle workflow checkpoints and resume', async () => {
      const project = await projectRepo.create({
        name: 'Workflow Test',
        description: 'Testing workflow checkpoints'
      });

      const task1 = await taskRepo.create({
        projectId: project.id,
        title: 'Requirements Task',
        phase: 'requirements',
        status: 'completed',
        priority: 1,
      });

      const task2 = await taskRepo.create({
        projectId: project.id,
        title: 'Design Task',
        phase: 'design',
        status: 'in_progress',
        priority: 2,
      });

      // Create checkpoints for different phases
      const requirementsCheckpoint = await workflowRepo.createCheckpoint(
        project.id,
        'requirements',
        {
          completedTasks: [task1.id],
          phaseDeliverables: { requirements: './requirements.md' },
        }
      );

      // Wait a moment to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      const designCheckpoint = await workflowRepo.createCheckpoint(
        project.id,
        'design',
        {
          completedTasks: [task1.id],
          currentTask: task2.id,
          phaseDeliverables: { 
            requirements: './requirements.md',
            design: './design.md'
          },
        }
      );

      // Get latest checkpoint
      const latest = await workflowRepo.getLatestCheckpoint(project.id);
      expect(latest?.id).toBe(designCheckpoint.id);
      expect(latest?.phase).toBe('design');

      // Get all checkpoints
      const allCheckpoints = await workflowRepo.findByProject(project.id);
      expect(allCheckpoints).toHaveLength(2);
      expect(allCheckpoints.some(c => c.id === requirementsCheckpoint.id)).toBe(true);
      expect(allCheckpoints.some(c => c.id === designCheckpoint.id)).toBe(true);
    });
  });

  describe('Data Integrity and Constraints', () => {
    test('should enforce foreign key constraints', async () => {
      // Task without valid project should fail
      await expect(
        taskRepo.create({
          projectId: 'non-existent-project',
          title: 'Invalid Task',
          phase: 'design',
          status: 'pending',
          priority: 1,
        })
      ).rejects.toThrow();

      // Agent session without valid project should fail
      await expect(
        agentRepo.create({
          projectId: 'non-existent-project',
          agentType: 'requirements',
          contextData: {},
        })
      ).rejects.toThrow();
    });

    test('should handle cascade deletes correctly', async () => {
      const project = await projectRepo.create({
        name: 'Cascade Test',
        description: 'Testing cascade deletes'
      });

      const task = await taskRepo.create({
        projectId: project.id,
        title: 'Task to be deleted',
        phase: 'design',
        status: 'pending',
        priority: 1,
      });

      const session = await agentRepo.create({
        projectId: project.id,
        taskId: task.id,
        agentType: 'requirements',
        contextData: {},
      });

      const checkpoint = await workflowRepo.createCheckpoint(
        project.id,
        'requirements',
        { completedTasks: [] }
      );

      // Verify entities exist
      expect(await taskRepo.findById(task.id)).toBeDefined();
      expect(await agentRepo.findById(session.id)).toBeDefined();
      expect(await workflowRepo.findById(checkpoint.id)).toBeDefined();

      // Delete project
      const deleted = await projectRepo.delete(project.id);
      expect(deleted).toBe(true);

      // Related entities should be cascade deleted
      expect(await taskRepo.findById(task.id)).toBeNull();
      expect(await agentRepo.findById(session.id)).toBeNull();
      expect(await workflowRepo.findById(checkpoint.id)).toBeNull();
    });

    test('should validate required fields', async () => {
      // Project without name should fail
      await expect(
        projectRepo.create({
          description: 'Project without name'
        })
      ).rejects.toThrow('Project name is required');

      // Task without required fields should fail
      await expect(
        taskRepo.create({
          title: 'Task without project ID',
          phase: 'design',
          status: 'pending',
          priority: 1,
        } as any)
      ).rejects.toThrow();
    });

    test('should enforce unique constraints', async () => {
      await projectRepo.create({
        name: 'Unique Project',
        description: 'First project'
      });

      // Duplicate name should fail
      await expect(
        projectRepo.create({
          name: 'Unique Project',
          description: 'Duplicate project'
        })
      ).rejects.toThrow();
    });
  });

  describe('Query Performance and Filtering', () => {
    test('should filter tasks efficiently', async () => {
      const project = await projectRepo.create({
        name: 'Filter Test',
        description: 'Testing task filtering'
      });

      // Create various tasks
      await Promise.all([
        taskRepo.create({
          projectId: project.id,
          title: 'Completed Requirements',
          phase: 'requirements',
          status: 'completed',
          priority: 1,
        }),
        taskRepo.create({
          projectId: project.id,
          title: 'In Progress Design',
          phase: 'design',
          status: 'in_progress',
          priority: 2,
        }),
        taskRepo.create({
          projectId: project.id,
          title: 'Pending Implementation',
          phase: 'execute',
          status: 'pending',
          priority: 3,
        }),
      ]);

      // Test different filters
      const completedTasks = await taskRepo.findByProject(project.id, { status: 'completed' });
      expect(completedTasks).toHaveLength(1);
      expect(completedTasks[0].status).toBe('completed');

      const designTasks = await taskRepo.findByProject(project.id, { phase: 'design' });
      expect(designTasks).toHaveLength(1);
      expect(designTasks[0].phase).toBe('design');

      const highPriorityTasks = await taskRepo.findByProject(project.id, { priority: 3 });
      expect(highPriorityTasks).toHaveLength(1);
      expect(highPriorityTasks[0].priority).toBe(3);

      // Combined filters
      const inProgressDesignTasks = await taskRepo.findByProject(project.id, { 
        status: 'in_progress', 
        phase: 'design' 
      });
      expect(inProgressDesignTasks).toHaveLength(1);
      expect(inProgressDesignTasks[0].status).toBe('in_progress');
      expect(inProgressDesignTasks[0].phase).toBe('design');
    });

    test('should handle project filtering', async () => {
      // Create projects with different statuses
      const activeProject = await projectRepo.create({
        name: 'Active Project',
        description: 'An active project',
        status: 'active'
      });

      const pausedProject = await projectRepo.create({
        name: 'Paused Project',
        description: 'A paused project',
        status: 'paused'
      });

      const completedProject = await projectRepo.create({
        name: 'Completed Project',
        description: 'A completed project',
        status: 'completed'
      });

      // Filter by status
      const activeProjects = await projectRepo.list({ status: 'active' });
      expect(activeProjects).toHaveLength(1);
      expect(activeProjects[0].id).toBe(activeProject.id);

      const pausedProjects = await projectRepo.list({ status: 'paused' });
      expect(pausedProjects).toHaveLength(1);
      expect(pausedProjects[0].id).toBe(pausedProject.id);

      const completedProjects = await projectRepo.list({ status: 'completed' });
      expect(completedProjects).toHaveLength(1);
      expect(completedProjects[0].id).toBe(completedProject.id);

      // List all projects
      const allProjects = await projectRepo.list();
      expect(allProjects).toHaveLength(3);
    });
  });
});