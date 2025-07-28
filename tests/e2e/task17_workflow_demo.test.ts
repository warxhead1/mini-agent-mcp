import { DatabaseConnection } from '../../src/db/database';
import { ProjectRepository } from '../../src/repositories/ProjectRepository';
import { TaskRepository } from '../../src/repositories/TaskRepository';
import { AgentSessionRepository } from '../../src/repositories/AgentSessionRepository';
import { WorkflowRepository } from '../../src/repositories/WorkflowRepository';
import { FileSync } from '../../src/sync/FileSync';
import { existsSync, unlinkSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';

describe('Task 17: End-to-End Workflow Tests', () => {
  let projectRepo: ProjectRepository;
  let taskRepo: TaskRepository;
  let agentRepo: AgentSessionRepository;
  let workflowRepo: WorkflowRepository;
  let fileSync: FileSync;
  const testDbPath = 'test-task17.db';
  const testProjectsDir = './test-projects-task17';
  const testSpecDir = './test-spec-task17';

  beforeAll(() => {
    process.env.MCP_DB_PATH = testDbPath;
    projectRepo = new ProjectRepository();
    taskRepo = new TaskRepository();
    agentRepo = new AgentSessionRepository();
    workflowRepo = new WorkflowRepository();
    fileSync = new FileSync(testProjectsDir, testSpecDir);
  });

  beforeEach(() => {
    // Clean database
    const db = DatabaseConnection.getInstance();
    db.exec('DELETE FROM workflow_checkpoints');
    db.exec('DELETE FROM agent_sessions');
    db.exec('DELETE FROM tasks');
    db.exec('DELETE FROM projects');

    // Clean file systems
    [testProjectsDir, testSpecDir].forEach(dir => {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  afterAll(() => {
    DatabaseConnection.close();
    [testDbPath, testProjectsDir, testSpecDir].forEach(path => {
      if (existsSync(path)) {
        if (path.endsWith('.db')) {
          unlinkSync(path);
        } else {
          rmSync(path, { recursive: true, force: true });
        }
      }
    });
  });

  test('Complete Spec Workflow: spec_create → spec_design → spec_tasks → spec_execute', async () => {
    console.log('Testing complete spec workflow...');
    
    // STEP 1: spec_create simulation
    const project = await projectRepo.create({
      name: 'user-auth-demo',
      description: 'User authentication system for demo'
    });

    await fileSync.createProjectFiles(project.id, project.name, project.description || '');
    await fileSync.createSpecFiles(project.id, project.name, project.description || '');

    const requirementsContent = `# User Authentication Requirements
## Core Features
1. User registration with email validation
2. Secure login with JWT tokens
3. Password reset functionality`;

    await fileSync.writeSpecFile(project.id, 'requirements.md', requirementsContent);

    // Verify spec_create results
    expect(project.currentPhase).toBe('requirements');
    expect(existsSync(join(testSpecDir, project.id, 'requirements.md'))).toBe(true);

    // STEP 2: spec_design simulation
    await projectRepo.update(project.id, { currentPhase: 'design' });

    const designContent = `# System Design
## Architecture: REST API with JWT
## Endpoints:
- POST /auth/register
- POST /auth/login
- POST /auth/reset`;

    await fileSync.writeSpecFile(project.id, 'design.md', designContent);

    const designProject = await projectRepo.findById(project.id);
    expect(designProject?.currentPhase).toBe('design');
    expect(existsSync(join(testSpecDir, project.id, 'design.md'))).toBe(true);

    // STEP 3: spec_tasks simulation
    await projectRepo.update(project.id, { currentPhase: 'tasks' });

    const implementationTasks = await Promise.all([
      taskRepo.create({
        projectId: project.id,
        title: 'Implement user registration',
        description: 'Create registration endpoint with validation',
        phase: 'execute',
        status: 'pending',
        priority: 1,
      }),
      taskRepo.create({
        projectId: project.id,
        title: 'Implement user login',
        description: 'Create login endpoint with JWT',
        phase: 'execute',
        status: 'pending',
        priority: 2,
      })
    ]);

    const tasksContent = `# Implementation Tasks
1. Implement user registration
2. Implement user login`;

    await fileSync.writeSpecFile(project.id, 'tasks.md', tasksContent);

    const tasksProject = await projectRepo.findById(project.id);
    expect(tasksProject?.currentPhase).toBe('tasks');
    expect(implementationTasks).toHaveLength(2);
    expect(existsSync(join(testSpecDir, project.id, 'tasks.md'))).toBe(true);

    // STEP 4: spec_execute simulation
    await projectRepo.update(project.id, { currentPhase: 'execute' });

    // Start executing first task
    const firstTask = implementationTasks[0];
    await taskRepo.update(firstTask.id, { status: 'in_progress' });

    await agentRepo.create({
      projectId: project.id,
      taskId: firstTask.id,
      agentType: 'implementation',
      contextData: { currentTask: firstTask.id, phase: 'execute' }
    });

    // Log task progress
    await fileSync.appendAgentUpdate(project.id, firstTask.id, {
      timestamp: new Date(),
      status: 'in_progress',
      notes: 'Started implementing user registration endpoint',
      deliverables: { files: ['auth/register.ts'] },
      nextSteps: 'Complete validation and testing'
    });

    // Complete first task
    await taskRepo.update(firstTask.id, { status: 'completed' });
    
    await fileSync.appendAgentUpdate(project.id, firstTask.id, {
      timestamp: new Date(),
      status: 'completed',
      notes: 'User registration endpoint completed with validation',
      deliverables: { 
        files: ['auth/register.ts', 'auth/register.test.ts'],
        endpoints: 'POST /auth/register'
      },
      nextSteps: 'Proceed to login implementation'
    });

    // Create workflow checkpoint
    const checkpoint = await workflowRepo.createCheckpoint(project.id, 'execute');

    // VERIFICATION: Complete workflow state
    const finalProject = await projectRepo.findById(project.id);
    const allTasks = await taskRepo.findByProject(project.id);
    const allSessions = await agentRepo.findByProject(project.id);
    const latestCheckpoint = await workflowRepo.getLatestCheckpoint(project.id);

    expect(finalProject?.currentPhase).toBe('execute');
    expect(allTasks).toHaveLength(2);
    expect(allTasks[0].status).toBe('completed');
    expect(allTasks[1].status).toBe('pending');
    expect(allSessions).toHaveLength(1);
    expect(latestCheckpoint?.id).toBe(checkpoint.id);

    // Verify all spec files exist
    const specDir = join(testSpecDir, project.id);
    expect(existsSync(join(specDir, 'requirements.md'))).toBe(true);
    expect(existsSync(join(specDir, 'design.md'))).toBe(true);
    expect(existsSync(join(specDir, 'tasks.md'))).toBe(true);

    // Verify task tracking files exist
    const projectDir = join(testProjectsDir, project.id);
    expect(existsSync(join(projectDir, 'implementation', `task-${firstTask.id}.md`))).toBe(true);

    console.log('✅ Complete spec workflow test PASSED');
  });

  test('Agent Handoffs Between Phases', async () => {
    console.log('Testing agent handoffs...');
    
    const project = await projectRepo.create({
      name: 'handoff-demo',
      description: 'Testing agent handoffs'
    });

    await fileSync.createProjectFiles(project.id, project.name, project.description || '');

    // Requirements Agent
    const reqSession = await agentRepo.create({
      projectId: project.id,
      agentType: 'requirements',
      contextData: { phase: 'requirements', features: ['auth', 'users'] }
    });

    await fileSync.writeAgentContext(project.id, 'requirements', {
      summary: 'Requirements completed',
      context: { totalFeatures: 2, deliverables: ['requirements.md'] }
    });

    // Design Agent (references requirements)
    const designSession = await agentRepo.create({
      projectId: project.id,
      agentType: 'design',
      contextData: { 
        phase: 'design', 
        basedOnRequirements: reqSession.id,
        architecture: 'REST API'
      }
    });

    await fileSync.writeAgentContext(project.id, 'design', {
      summary: 'System design completed',
      context: { architecture: 'REST API', endpoints: 3 }
    });

    // Tasks Agent (references design)
    const tasksSession = await agentRepo.create({
      projectId: project.id,
      agentType: 'tasks',
      contextData: { 
        phase: 'tasks',
        basedOnDesign: designSession.id,
        totalTasks: 3
      }
    });

    // Implementation Agent (references tasks)
    const task = await taskRepo.create({
      projectId: project.id,
      title: 'Implementation Task',
      phase: 'execute',
      status: 'pending',
      priority: 1,
    });

    await agentRepo.create({
      projectId: project.id,
      taskId: task.id,
      agentType: 'implementation',
      contextData: { 
        phase: 'execute',
        basedOnTasks: tasksSession.id,
        currentTask: task.id
      }
    });

    // Verify handoff chain
    const allSessions = await agentRepo.findByProject(project.id);
    expect(allSessions).toHaveLength(4);

    const sessionsByType = allSessions.reduce((acc, session) => {
      acc[session.agentType] = session;
      return acc;
    }, {} as Record<string, any>);

    expect(sessionsByType.requirements).toBeDefined();
    expect(sessionsByType.design).toBeDefined();
    expect(sessionsByType.tasks).toBeDefined();
    expect(sessionsByType.implementation).toBeDefined();

    // Verify references between agents
    expect(sessionsByType.design.contextData.basedOnRequirements).toBe(reqSession.id);
    expect(sessionsByType.tasks.contextData.basedOnDesign).toBe(designSession.id);
    expect(sessionsByType.implementation.contextData.basedOnTasks).toBe(tasksSession.id);

    console.log('✅ Agent handoffs test PASSED');
  });

  test('Markdown Files Match Database State', async () => {
    console.log('Testing database-markdown consistency...');
    
    const project = await projectRepo.create({
      name: 'consistency-demo',
      description: 'Testing consistency'
    });

    await fileSync.createProjectFiles(project.id, project.name, project.description || '');

    const task = await taskRepo.create({
      projectId: project.id,
      title: 'Consistency Task',
      phase: 'execute',
      status: 'pending',
      priority: 1,
    });

    // Update database
    await taskRepo.update(task.id, { status: 'in_progress' });

    // Update markdown
    await fileSync.appendAgentUpdate(project.id, task.id, {
      timestamp: new Date(),
      status: 'in_progress',
      notes: 'Task in progress - testing consistency',
      deliverables: { consistency: 'verified' }
    });

    // Verify database state
    const dbTask = await taskRepo.findById(task.id);
    expect(dbTask?.status).toBe('in_progress');

    // Verify markdown file
    const taskFile = join(testProjectsDir, project.id, 'implementation', `task-${task.id}.md`);
    expect(existsSync(taskFile)).toBe(true);
    
    const taskContent = readFileSync(taskFile, 'utf-8');
    expect(taskContent).toContain('Consistency Task');
    expect(taskContent).toContain('in_progress');
    expect(taskContent).toContain('testing consistency');

    console.log('✅ Database-markdown consistency test PASSED');
  });

  test('Workflow Resume After Interruption', async () => {
    console.log('Testing workflow resume...');
    
    const project = await projectRepo.create({
      name: 'resume-demo',
      description: 'Testing resume capabilities'
    });

    const tasks = await Promise.all([
      taskRepo.create({
        projectId: project.id,
        title: 'Completed Task',
        phase: 'execute',
        status: 'completed',
        priority: 1,
      }),
      taskRepo.create({
        projectId: project.id,
        title: 'In Progress Task',
        phase: 'execute',
        status: 'in_progress',
        priority: 2,
      }),
      taskRepo.create({
        projectId: project.id,
        title: 'Pending Task',
        phase: 'execute',
        status: 'pending',
        priority: 3,
      })
    ]);

    await agentRepo.create({
      projectId: project.id,
      taskId: tasks[1].id,
      agentType: 'implementation',
      contextData: { 
        currentTask: tasks[1].id,
        completedTasks: [tasks[0].id]
      }
    });

    const checkpoint = await workflowRepo.createCheckpoint(project.id, 'execute');

    // Simulate resume
    const resumeProject = await projectRepo.findById(project.id);
    const resumeCheckpoint = await workflowRepo.getLatestCheckpoint(project.id);
    const resumeTasks = await taskRepo.findByProject(project.id);
    const resumeSessions = await agentRepo.findByProject(project.id);

    expect(resumeProject?.id).toBe(project.id);
    expect(resumeCheckpoint?.id).toBe(checkpoint.id);
    expect(resumeTasks).toHaveLength(3);
    expect(resumeSessions).toHaveLength(1);

    const completedTasks = resumeTasks.filter(t => t.status === 'completed');
    const inProgressTasks = resumeTasks.filter(t => t.status === 'in_progress');
    const pendingTasks = resumeTasks.filter(t => t.status === 'pending');

    expect(completedTasks).toHaveLength(1);
    expect(inProgressTasks).toHaveLength(1);
    expect(pendingTasks).toHaveLength(1);

    console.log('✅ Workflow resume test PASSED');
  });

  test('.spec/ Directory Creation and Monitoring', async () => {
    console.log('Testing .spec/ directory...');
    
    const project = await projectRepo.create({
      name: 'spec-dir-demo',
      description: 'Testing spec directory'
    });

    // Create spec files
    await fileSync.createSpecFiles(project.id, project.name, project.description || '');

    // Verify spec directory structure
    const specProjectDir = join(testSpecDir, project.id);
    expect(existsSync(specProjectDir)).toBe(true);
    expect(existsSync(join(specProjectDir, 'README.md'))).toBe(true);
    expect(existsSync(join(specProjectDir, 'requirements.md'))).toBe(true);
    expect(existsSync(join(specProjectDir, 'design.md'))).toBe(true);
    expect(existsSync(join(specProjectDir, 'tasks.md'))).toBe(true);

    // Verify README contains project info
    const readmeContent = readFileSync(join(specProjectDir, 'README.md'), 'utf-8');
    expect(readmeContent).toContain('spec-dir-demo');
    expect(readmeContent).toContain('Testing spec directory');

    console.log('✅ Spec directory test PASSED');
  });
});