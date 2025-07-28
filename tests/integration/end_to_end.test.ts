import { AgenticMCPServer } from '../../src/server';
import { DatabaseConnection } from '../../src/db/database';
import { ProjectRepository } from '../../src/repositories/ProjectRepository';
import { TaskRepository } from '../../src/repositories/TaskRepository';
import { AgentSessionRepository } from '../../src/repositories/AgentSessionRepository';
import { WorkflowRepository } from '../../src/repositories/WorkflowRepository';
import { FileSync } from '../../src/sync/FileSync';
import { existsSync, unlinkSync, rmSync } from 'fs';
import { join } from 'path';

describe('End-to-End Integration Tests', () => {
  let server: AgenticMCPServer;
  let projectRepo: ProjectRepository;
  let taskRepo: TaskRepository;
  let agentRepo: AgentSessionRepository;
  let workflowRepo: WorkflowRepository;
  let fileSync: FileSync;
  const testDbPath = 'test-e2e.db';
  const testProjectsDir = './test-projects-e2e';

  beforeAll(() => {
    process.env.MCP_DB_PATH = testDbPath;
    process.env.MCP_FILE_SYNC_ENABLED = 'true';
    
    server = new AgenticMCPServer();
    projectRepo = new ProjectRepository();
    taskRepo = new TaskRepository();
    agentRepo = new AgentSessionRepository();
    workflowRepo = new WorkflowRepository();
    fileSync = new FileSync(testProjectsDir);
  });

  beforeEach(() => {
    // Clean database
    const db = DatabaseConnection.getInstance();
    db.exec('DELETE FROM workflow_checkpoints');
    db.exec('DELETE FROM agent_sessions');
    db.exec('DELETE FROM tasks');
    db.exec('DELETE FROM projects');

    // Clean file system
    if (existsSync(testProjectsDir)) {
      rmSync(testProjectsDir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    DatabaseConnection.close();
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
    if (existsSync(testProjectsDir)) {
      rmSync(testProjectsDir, { recursive: true, force: true });
    }
  });

  describe('Complete Workflow Simulation', () => {
    test('should simulate complete agentic workflow', async () => {
      // Step 1: Create project
      const project = await projectRepo.create({
        name: 'e2e-test-project',
        description: 'End-to-end testing of agentic workflow'
      });

      // Verify project creation
      expect(project.id).toBeDefined();
      expect(project.name).toBe('e2e-test-project');
      expect(project.status).toBe('active');
      expect(project.currentPhase).toBe('requirements');

      // Create project files
      await fileSync.createProjectFiles(project.id, project.name, project.description);
      
      // Verify files were created
      const projectDir = join(testProjectsDir, project.id);
      expect(existsSync(projectDir)).toBe(true);
      expect(existsSync(join(projectDir, 'README.md'))).toBe(true);

      // Step 2: Requirements Agent - Create and update tasks
      const requirementsTask = await taskRepo.create({
        projectId: project.id,
        title: 'Gather Requirements',
        description: 'Collect and document all project requirements',
        phase: 'requirements',
        status: 'pending',
        priority: 1,
      });

      // Agent starts working on requirements
      const requirementsSession = await agentRepo.create({
        projectId: project.id,
        taskId: requirementsTask.id,
        agentType: 'requirements',
        contextData: {
          phase: 'requirements',
          status: 'started',
          approach: 'stakeholder interviews'
        },
      });

      // Update task progress
      await taskRepo.update(requirementsTask.id, { status: 'in_progress' });

      // Log progress update
      await fileSync.appendAgentUpdate(requirementsTask.id, {
        timestamp: new Date(),
        agentType: 'requirements',
        status: 'in_progress',
        notes: 'Started requirements gathering with stakeholder interviews',
        deliverables: { interviews: 'conducted 5 stakeholder interviews' },
        nextSteps: 'Analyze interview data and create requirements document'
      });

      // Complete requirements phase
      await taskRepo.update(requirementsTask.id, { status: 'completed' });
      
      await agentRepo.updateContext(requirementsSession.id, {
        phase: 'requirements',
        status: 'completed',
        deliverables: ['requirements.md', 'stakeholder-interviews.md']
      });

      await fileSync.writeAgentContext(project.id, 'requirements', {
        summary: 'Requirements gathering completed successfully',
        context: {
          totalRequirements: 15,
          priorityRequirements: 8,
          stakeholders: 5,
          deliverables: ['requirements.md', 'stakeholder-interviews.md']
        }
      });

      // Create handoff to design phase
      await fileSync.completePhase(project.id, {
        phase: 'requirements',
        deliverables: {
          requirements: './requirements.md',
          interviews: './stakeholder-interviews.md'
        },
        handoffNotes: 'Requirements phase completed. 15 requirements identified with 8 high priority items. Ready for design phase.'
      });

      // Create workflow checkpoint
      const requirementsCheckpoint = await workflowRepo.createCheckpoint(
        project.id,
        'requirements',
        {
          completedTasks: [requirementsTask.id],
          phaseDeliverables: {
            requirements: './requirements.md',
            interviews: './stakeholder-interviews.md'
          }
        }
      );

      // Step 3: Design Agent takes over
      const designTask = await taskRepo.create({
        projectId: project.id,
        title: 'Create System Design',
        description: 'Design the system architecture based on requirements',
        phase: 'design',
        status: 'pending',
        priority: 1,
      });

      const designSession = await agentRepo.create({
        projectId: project.id,
        taskId: designTask.id,
        agentType: 'design',
        contextData: {
          phase: 'design',
          basedOnRequirements: requirementsTask.id,
          approach: 'microservices architecture'
        },
      });

      // Design agent reviews previous context
      const previousContexts = await agentRepo.findByProject(project.id);
      expect(previousContexts).toHaveLength(2); // requirements + design sessions

      // Design agent works on the design
      await taskRepo.update(designTask.id, { status: 'in_progress' });

      await fileSync.appendAgentUpdate(designTask.id, {
        timestamp: new Date(),
        agentType: 'design',
        status: 'in_progress',
        notes: 'Created system architecture based on requirements. Chose microservices approach.',
        deliverables: { 
          architecture: 'system-architecture.md',
          diagrams: 'architecture-diagrams.png'
        },
        nextSteps: 'Finalize component designs and create implementation tasks'
      });

      // Complete design phase
      await taskRepo.update(designTask.id, { status: 'completed' });

      await fileSync.writeAgentContext(project.id, 'design', {
        summary: 'System design completed with microservices architecture',
        context: {
          architecture: 'microservices',
          components: ['api-gateway', 'user-service', 'auth-service', 'database'],
          technologies: ['Node.js', 'PostgreSQL', 'Redis'],
          deliverables: ['system-architecture.md', 'component-designs.md']
        }
      });

      // Step 4: Task Planning Agent creates implementation tasks
      const taskPlanningTask = await taskRepo.create({
        projectId: project.id,
        title: 'Create Implementation Tasks',
        description: 'Break down design into implementation tasks',
        phase: 'tasks',
        status: 'in_progress',
        priority: 1,
      });

      const taskPlanningSession = await agentRepo.create({
        projectId: project.id,
        taskId: taskPlanningTask.id,
        agentType: 'tasks',
        contextData: {
          phase: 'tasks',
          basedOnDesign: designTask.id,
          totalTasksPlanned: 12
        },
      });

      // Create implementation tasks
      const implementationTasks = await Promise.all([
        taskRepo.create({
          projectId: project.id,
          parentId: taskPlanningTask.id,
          title: 'Implement API Gateway',
          description: 'Set up API gateway for routing requests',
          phase: 'execute',
          status: 'pending',
          priority: 1,
        }),
        taskRepo.create({
          projectId: project.id,
          parentId: taskPlanningTask.id,
          title: 'Implement User Service',
          description: 'Create user management microservice',
          phase: 'execute',
          status: 'pending',
          priority: 2,
        }),
        taskRepo.create({
          projectId: project.id,
          parentId: taskPlanningTask.id,
          title: 'Implement Auth Service',
          description: 'Create authentication microservice',
          phase: 'execute',
          status: 'pending',
          priority: 3,
        }),
      ]);

      await taskRepo.update(taskPlanningTask.id, { status: 'completed' });

      // Step 5: Implementation Agents work on tasks
      for (const [index, implTask] of implementationTasks.entries()) {
        const implSession = await agentRepo.create({
          projectId: project.id,
          taskId: implTask.id,
          agentType: 'implementation',
          contextData: {
            phase: 'execute',
            taskIndex: index,
            component: implTask.title.split(' ').slice(-2).join(' ') // Extract component name
          },
        });

        await taskRepo.update(implTask.id, { status: 'in_progress' });

        await fileSync.appendAgentUpdate(implTask.id, {
          timestamp: new Date(),
          agentType: 'implementation',
          status: 'in_progress',
          notes: `Started implementation of ${implTask.title}`,
          deliverables: { codeFiles: [`${implTask.title.toLowerCase().replace(/\s+/g, '-')}.ts`] },
          nextSteps: 'Complete implementation and write tests'
        });

        // Simulate completion of first task
        if (index === 0) {
          await taskRepo.update(implTask.id, { status: 'completed' });
          
          await fileSync.appendAgentUpdate(implTask.id, {
            timestamp: new Date(),
            agentType: 'implementation',
            status: 'completed',
            notes: `Completed implementation of ${implTask.title}`,
            deliverables: { 
              codeFiles: [`api-gateway.ts`, `api-gateway.test.ts`],
              documentation: 'api-gateway.md'
            },
            nextSteps: 'Task completed, ready for review'
          });
        }
      }

      // Step 6: Verify complete workflow state
      
      // Check all projects and tasks
      const allProjects = await projectRepo.list();
      expect(allProjects).toHaveLength(1);

      const allTasks = await taskRepo.findByProject(project.id);
      expect(allTasks.length).toBeGreaterThan(3);

      // Check task hierarchy
      const taskTree = await taskRepo.getTaskTree(project.id);
      expect(taskTree.length).toBeGreaterThan(0);

      // Check agent sessions across all phases
      const allSessions = await agentRepo.findByProject(project.id);
      expect(allSessions.length).toBeGreaterThan(3);

      // Verify different agent types worked on the project
      const agentTypes = [...new Set(allSessions.map(s => s.agentType))];
      expect(agentTypes).toContain('requirements');
      expect(agentTypes).toContain('design');
      expect(agentTypes).toContain('tasks');
      expect(agentTypes).toContain('implementation');

      // Check workflow checkpoints
      const allCheckpoints = await workflowRepo.findByProject(project.id);
      expect(allCheckpoints.length).toBeGreaterThan(0);

      const latestCheckpoint = await workflowRepo.getLatestCheckpoint(project.id);
      expect(latestCheckpoint).toBeDefined();

      // Verify file system artifacts
      expect(existsSync(join(testProjectsDir, project.id, 'requirements.md'))).toBe(true);
      expect(existsSync(join(testProjectsDir, project.id, 'handoffs'))).toBe(true);

      // Step 7: Simulate workflow resume
      const resumeState = {
        project: await projectRepo.findById(project.id),
        checkpoint: latestCheckpoint,
        allTasks: await taskRepo.findByProject(project.id),
        activeSessions: await agentRepo.findByProject(project.id),
        taskTree: await taskRepo.getTaskTree(project.id)
      };

      expect(resumeState.project).toBeDefined();
      expect(resumeState.checkpoint).toBeDefined();
      expect(resumeState.allTasks.length).toBeGreaterThan(0);
      expect(resumeState.activeSessions.length).toBeGreaterThan(0);
      expect(resumeState.taskTree.length).toBeGreaterThan(0);

      // Verify we can continue workflow
      const pendingTasks = resumeState.allTasks.filter(t => t.status === 'pending');
      const inProgressTasks = resumeState.allTasks.filter(t => t.status === 'in_progress');
      const completedTasks = resumeState.allTasks.filter(t => t.status === 'completed');

      expect(pendingTasks.length).toBeGreaterThan(0);
      expect(inProgressTasks.length).toBeGreaterThan(0);
      expect(completedTasks.length).toBeGreaterThan(0);

      console.log(`Workflow simulation completed:
        - Project: ${resumeState.project?.name}
        - Total tasks: ${resumeState.allTasks.length}
        - Completed: ${completedTasks.length}
        - In progress: ${inProgressTasks.length}  
        - Pending: ${pendingTasks.length}
        - Agent sessions: ${resumeState.activeSessions.length}
        - Checkpoints: ${allCheckpoints.length}`);
    });
  });

  describe('Error Recovery and Resilience', () => {
    test('should handle interrupted workflows gracefully', async () => {
      // Create project and some initial state
      const project = await projectRepo.create({
        name: 'interrupted-project',
        description: 'Testing interrupted workflow recovery'
      });

      const task = await taskRepo.create({
        projectId: project.id,
        title: 'Interrupted Task',
        phase: 'design',
        status: 'in_progress',
        priority: 1,
      });

      const session = await agentRepo.create({
        projectId: project.id,
        taskId: task.id,
        agentType: 'design',
        contextData: { progress: 'partially completed' },
      });

      // Simulate recovery - should be able to find and resume
      const recoveredProject = await projectRepo.findById(project.id);
      const recoveredTasks = await taskRepo.findByProject(project.id);
      const recoveredSessions = await agentRepo.findByProject(project.id);

      expect(recoveredProject).toBeDefined();
      expect(recoveredTasks).toHaveLength(1);
      expect(recoveredSessions).toHaveLength(1);
      expect(recoveredTasks[0].status).toBe('in_progress');

      // Should be able to continue workflow
      await taskRepo.update(task.id, { status: 'completed' });
      const updatedTask = await taskRepo.findById(task.id);
      expect(updatedTask?.status).toBe('completed');
    });

    test('should maintain data consistency across repositories', async () => {
      const project = await projectRepo.create({
        name: 'consistency-test',
        description: 'Testing data consistency'
      });

      // Create related entities
      const task = await taskRepo.create({
        projectId: project.id,
        title: 'Consistency Task',
        phase: 'execute',
        status: 'in_progress',
        priority: 1,
      });

      const session = await agentRepo.create({
        projectId: project.id,
        taskId: task.id,
        agentType: 'implementation',
        contextData: { consistency: 'testing' },
      });

      const checkpoint = await workflowRepo.createCheckpoint(
        project.id,
        'execute',
        {
          completedTasks: [],
          currentTask: task.id,
          phaseDeliverables: { code: './src/' }
        }
      );

      // Verify all entities reference each other correctly
      const foundProject = await projectRepo.findById(project.id);
      const foundTask = await taskRepo.findById(task.id);
      const foundSession = await agentRepo.findById(session.id);
      const foundCheckpoint = await workflowRepo.findById(checkpoint.id);

      expect(foundTask?.projectId).toBe(project.id);
      expect(foundSession?.projectId).toBe(project.id);
      expect(foundSession?.taskId).toBe(task.id);
      expect(foundCheckpoint?.projectId).toBe(project.id);

      // Verify queries work correctly
      const projectTasks = await taskRepo.findByProject(project.id);
      const projectSessions = await agentRepo.findByProject(project.id);
      const projectCheckpoints = await workflowRepo.findByProject(project.id);

      expect(projectTasks.some(t => t.id === task.id)).toBe(true);
      expect(projectSessions.some(s => s.id === session.id)).toBe(true);
      expect(projectCheckpoints.some(c => c.id === checkpoint.id)).toBe(true);
    });
  });
});