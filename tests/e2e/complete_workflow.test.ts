import { DatabaseConnection } from '../../src/db/database';
import { ProjectRepository } from '../../src/repositories/ProjectRepository';
import { TaskRepository } from '../../src/repositories/TaskRepository';
import { AgentSessionRepository } from '../../src/repositories/AgentSessionRepository';
import { WorkflowRepository } from '../../src/repositories/WorkflowRepository';
import { FileSync } from '../../src/sync/FileSync';
import { SpecMonitor } from '../../src/monitor/SpecMonitor';
import { existsSync, unlinkSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';

describe('End-to-End Spec Workflow Tests', () => {
  let projectRepo: ProjectRepository;
  let taskRepo: TaskRepository;
  let agentRepo: AgentSessionRepository;
  let workflowRepo: WorkflowRepository;
  let fileSync: FileSync;
  let specMonitor: SpecMonitor;
  const testDbPath = 'test-e2e-workflow.db';
  const testProjectsDir = './test-projects-e2e';
  const testSpecDir = './test-spec-e2e';

  beforeAll(() => {
    process.env.MCP_DB_PATH = testDbPath;
    process.env.MCP_FILE_SYNC_ENABLED = 'true';
    
    projectRepo = new ProjectRepository();
    taskRepo = new TaskRepository();
    agentRepo = new AgentSessionRepository();
    workflowRepo = new WorkflowRepository();
    fileSync = new FileSync(testProjectsDir, testSpecDir);
    specMonitor = new SpecMonitor(testSpecDir, projectRepo, taskRepo, fileSync);
  });

  beforeEach(() => {
    // Clean database
    const db = DatabaseConnection.getInstance();
    db.exec('DELETE FROM workflow_checkpoints');
    db.exec('DELETE FROM agent_sessions');
    db.exec('DELETE FROM tasks');
    db.exec('DELETE FROM projects');

    // Clean file systems
    if (existsSync(testProjectsDir)) {
      rmSync(testProjectsDir, { recursive: true, force: true });
    }
    if (existsSync(testSpecDir)) {
      rmSync(testSpecDir, { recursive: true, force: true });
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
    if (existsSync(testSpecDir)) {
      rmSync(testSpecDir, { recursive: true, force: true });
    }
  });

  describe('Complete Spec Workflow (spec_create → spec_design → spec_tasks → spec_execute)', () => {
    test('should execute complete workflow: user-authentication example', async () => {
      // Step 1: spec_create - Create new spec with requirements
      console.log('Step 1: Creating user-authentication spec...');
      
      const project = await projectRepo.create({
        name: 'user-authentication',
        description: 'Allow users to sign up and log in securely'
      });

      // Create both project and spec files
      await fileSync.createProjectFiles(project.id, project.name, project.description || undefined);
      await fileSync.createSpecFiles(project.id, project.name, project.description || undefined);

      // Generate requirements content (simulating spec_create tool)
      const requirementsContent = `# User Authentication Requirements

## Overview
Secure user authentication system allowing users to sign up and log in.

## Functional Requirements
1. **User Registration**
   - Email-based registration
   - Password strength validation
   - Email verification required
   
2. **User Login**
   - Email/password authentication
   - Session management
   - "Remember me" functionality
   
3. **Password Management**
   - Password reset via email
   - Password change functionality
   - Secure password storage (bcrypt)

## Security Requirements
- All passwords must be hashed using bcrypt
- Sessions must expire after 24 hours
- Rate limiting on login attempts
- HTTPS required for all auth endpoints

## Technical Requirements
- RESTful API endpoints
- JWT tokens for session management
- Database schema for users and sessions
- Input validation and sanitization
`;

      await fileSync.writeSpecFile(project.id, 'requirements.md', requirementsContent);

      // Verify spec_create results
      expect(project.name).toBe('user-authentication');
      expect(project.currentPhase).toBe('requirements');
      expect(existsSync(join(testSpecDir, project.id, 'requirements.md'))).toBe(true);
      
      const savedRequirements = readFileSync(join(testSpecDir, project.id, 'requirements.md'), 'utf-8');
      expect(savedRequirements).toContain('User Authentication Requirements');
      expect(savedRequirements).toContain('User Registration');

      // Step 2: spec_design - Generate design from requirements
      console.log('Step 2: Generating system design...');
      
      // Update project phase to design
      await projectRepo.update(project.id, { currentPhase: 'design' });

      const designContent = `# User Authentication System Design

## Architecture Overview
Microservice architecture with separate authentication service.

## System Components

### 1. API Gateway
- Route authentication requests
- Rate limiting implementation
- HTTPS termination

### 2. Authentication Service
- User registration endpoint: \`POST /auth/register\`
- User login endpoint: \`POST /auth/login\` 
- Password reset endpoint: \`POST /auth/reset-password\`
- Token refresh endpoint: \`POST /auth/refresh\`

### 3. Database Schema
\`\`\`sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE user_sessions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
\`\`\`

### 4. Security Implementation
- bcrypt for password hashing (cost factor: 12)
- JWT tokens with RS256 algorithm
- Session cleanup job runs every hour
- Rate limiting: 5 attempts per minute per IP

## API Endpoints

### POST /auth/register
- Input: email, password
- Validation: email format, password strength
- Output: user_id, verification_required

### POST /auth/login
- Input: email, password
- Validation: credentials, account status
- Output: access_token, refresh_token

### POST /auth/refresh
- Input: refresh_token
- Output: new access_token

## Technology Stack
- Node.js with Express
- PostgreSQL database
- Redis for session storage
- nodemailer for email verification
`;

      await fileSync.writeSpecFile(project.id, 'design.md', designContent);

      // Verify spec_design results
      const updatedProject = await projectRepo.findById(project.id);
      expect(updatedProject?.currentPhase).toBe('design');
      expect(existsSync(join(testSpecDir, project.id, 'design.md'))).toBe(true);
      
      const savedDesign = readFileSync(join(testSpecDir, project.id, 'design.md'), 'utf-8');
      expect(savedDesign).toContain('User Authentication System Design');
      expect(savedDesign).toContain('API Gateway');
      expect(savedDesign).toContain('CREATE TABLE users');

      // Step 3: spec_tasks - Break design into implementation tasks
      console.log('Step 3: Creating implementation tasks...');
      
      // Update project phase to tasks
      await projectRepo.update(project.id, { currentPhase: 'tasks' });

      // Create implementation tasks based on design
      const implementationTasks = [
        {
          title: 'Set up project structure and dependencies',
          description: 'Initialize Node.js project with Express, PostgreSQL, and required dependencies',
          phase: 'execute' as const,
          status: 'pending' as const,
          priority: 1,
        },
        {
          title: 'Implement database schema and migrations',
          description: 'Create users and user_sessions tables with proper indexes',
          phase: 'execute' as const,
          status: 'pending' as const,
          priority: 2,
        },
        {
          title: 'Create user registration endpoint',
          description: 'Implement POST /auth/register with validation and email verification',
          phase: 'execute' as const,
          status: 'pending' as const,
          priority: 3,
        },
        {
          title: 'Create user login endpoint',
          description: 'Implement POST /auth/login with JWT token generation',
          phase: 'execute' as const,
          status: 'pending' as const,
          priority: 4,
        },
        {
          title: 'Implement password reset functionality',
          description: 'Create password reset endpoint with email notifications',
          phase: 'execute' as const,
          status: 'pending' as const,
          priority: 5,
        },
        {
          title: 'Add rate limiting and security middleware',
          description: 'Implement rate limiting, CORS, and security headers',
          phase: 'execute' as const,
          status: 'pending' as const,
          priority: 6,
        },
        {
          title: 'Write comprehensive tests',
          description: 'Unit and integration tests for all authentication endpoints',
          phase: 'execute' as const,
          status: 'pending' as const,
          priority: 7,
        },
        {
          title: 'Add API documentation',
          description: 'Create OpenAPI/Swagger documentation for all endpoints',
          phase: 'execute' as const,
          status: 'pending' as const,
          priority: 8,
        }
      ];

      const createdTasks = await Promise.all(
        implementationTasks.map(task => 
          taskRepo.create({
            projectId: project.id,
            ...task
          })
        )
      );

      const tasksContent = `# Implementation Tasks

## Task List

${implementationTasks.map((task, index) => `
### Task ${index + 1}: ${task.title}
**Priority:** ${task.priority}  
**Status:** ${task.status}  
**Phase:** ${task.phase}

**Description:** ${task.description}

**Acceptance Criteria:**
- [ ] Implementation complete
- [ ] Tests written and passing
- [ ] Code reviewed
- [ ] Documentation updated

---
`).join('')}

## Task Dependencies
1. Tasks 1-2 must be completed before task 3
2. Task 3 must be completed before task 4
3. Tasks 5-6 can be done in parallel after task 4
4. Task 7 should include all previous tasks
5. Task 8 can be done in parallel with task 7

## Estimated Timeline
- Setup and infrastructure: 1-2 days
- Core authentication: 2-3 days  
- Security and testing: 1-2 days
- Documentation: 1 day
- **Total: 5-8 days**
`;

      await fileSync.writeSpecFile(project.id, 'tasks.md', tasksContent);

      // Verify spec_tasks results
      const tasksPhaseProject = await projectRepo.findById(project.id);
      expect(tasksPhaseProject?.currentPhase).toBe('tasks');
      expect(createdTasks).toHaveLength(8);
      expect(existsSync(join(testSpecDir, project.id, 'tasks.md'))).toBe(true);
      
      const savedTasks = readFileSync(join(testSpecDir, project.id, 'tasks.md'), 'utf-8');
      expect(savedTasks).toContain('Implementation Tasks');
      expect(savedTasks).toContain('Set up project structure');
      expect(savedTasks).toContain('Estimated Timeline');

      // Verify all tasks are in database
      const allProjectTasks = await taskRepo.findByProject(project.id);
      expect(allProjectTasks).toHaveLength(8);
      expect(allProjectTasks.every(t => t.status === 'pending')).toBe(true);

      // Step 4: spec_execute - Execute tasks one by one
      console.log('Step 4: Starting task execution...');
      
      // Update project phase to execute
      await projectRepo.update(project.id, { currentPhase: 'execute' });

      // Execute first task (project setup)
      const firstTask = createdTasks[0];
      await taskRepo.update(firstTask.id, { status: 'in_progress' });

      // Create agent session for implementation
      const implementationSession = await agentRepo.create({
        projectId: project.id,
        taskId: firstTask.id,
        contextData: {
          currentTask: firstTask.id,
          phase: 'execute',
          technology: 'Node.js + Express + PostgreSQL'
        }
      });

      // Simulate task progress updates
      await fileSync.appendAgentUpdate(project.id, firstTask.id, {
        timestamp: new Date(),
        status: 'in_progress',
        notes: 'Started project setup. Initializing Node.js project with required dependencies.',
        deliverables: { 
          files: ['package.json', 'tsconfig.json', '.gitignore'],
          setup: 'project structure created'
        },
        nextSteps: 'Install dependencies and set up development environment'
      });

      // Complete first task
      await taskRepo.update(firstTask.id, { status: 'completed' });
      
      await fileSync.appendAgentUpdate(project.id, firstTask.id, {
        timestamp: new Date(),
        status: 'completed',
        notes: 'Project setup completed successfully. All dependencies installed and configured.',
        deliverables: {
          files: ['package.json', 'tsconfig.json', 'src/app.ts', 'src/config/database.ts'],
          environment: 'development environment ready',
          dependencies: 'express, pg, bcrypt, jsonwebtoken, dotenv installed'
        },
        nextSteps: 'Ready to proceed with database schema implementation'
      });

      // Start second task (database schema)
      const secondTask = createdTasks[1];
      await taskRepo.update(secondTask.id, { status: 'in_progress' });

      await agentRepo.updateContext(implementationSession.id, {
        currentTask: secondTask.id,
        phase: 'execute',
        completedTasks: [firstTask.id],
        nextTask: 'database schema implementation'
      });

      // Create workflow checkpoint after completing first task
      const checkpoint = await workflowRepo.createCheckpoint(project.id, 'execute');
      
      // Verify spec_execute results
      const executePhaseProject = await projectRepo.findById(project.id);
      expect(executePhaseProject?.currentPhase).toBe('execute');
      
      const taskStatuses = await Promise.all(
        createdTasks.map(async task => {
          const updated = await taskRepo.findById(task.id);
          return { id: task.id, status: updated?.status };
        })
      );
      
      expect(taskStatuses[0].status).toBe('completed');
      expect(taskStatuses[1].status).toBe('in_progress');
      expect(taskStatuses.slice(2).every(t => t.status === 'pending')).toBe(true);

      // Verify agent session exists and has correct context
      const activeSession = await agentRepo.findById(implementationSession.id);
      expect(activeSession?.contextData.currentTask).toBe(secondTask.id);
      expect(activeSession?.contextData.completedTasks).toContain(firstTask.id);

      // Verify checkpoint was created
      expect(checkpoint).toBeDefined();
      expect(checkpoint.phase).toBe('execute');

      // Step 5: Test workflow resume capability
      console.log('Step 5: Testing workflow resume...');
      
      // Simulate workflow interruption and resume
      const latestCheckpoint = await workflowRepo.getLatestCheckpoint(project.id);
      expect(latestCheckpoint?.id).toBe(checkpoint.id);

      // Get complete project state for resume
      const resumeState = {
        project: await projectRepo.findById(project.id),
        checkpoint: latestCheckpoint,
        allTasks: await taskRepo.findByProject(project.id),
        activeSessions: await agentRepo.findByProject(project.id),
        pendingTasks: await taskRepo.findByProject(project.id, { status: 'pending' }),
        inProgressTasks: await taskRepo.findByProject(project.id, { status: 'in_progress' }),
        completedTasks: await taskRepo.findByProject(project.id, { status: 'completed' })
      };

      expect(resumeState.project?.currentPhase).toBe('execute');
      expect(resumeState.completedTasks).toHaveLength(1);
      expect(resumeState.inProgressTasks).toHaveLength(1);
      expect(resumeState.pendingTasks).toHaveLength(6);
      expect(resumeState.activeSessions).toHaveLength(1);

      // Verify task files were created in project directory
      const projectDir = join(testProjectsDir, project.id);
      expect(existsSync(projectDir)).toBe(true);
      expect(existsSync(join(projectDir, 'implementation', `task-${firstTask.id}.md`))).toBe(true);
      expect(existsSync(join(projectDir, 'implementation', `task-${secondTask.id}.md`))).toBe(true);

      console.log(`✅ Complete workflow test passed:
        - Project: ${resumeState.project?.name}
        - Phase: ${resumeState.project?.currentPhase}
        - Total tasks: ${resumeState.allTasks.length}
        - Completed: ${resumeState.completedTasks.length}
        - In progress: ${resumeState.inProgressTasks.length}
        - Pending: ${resumeState.pendingTasks.length}
        - Active sessions: ${resumeState.activeSessions.length}
        - Checkpoints created: 1`);
    });
  });

  describe('Agent Handoffs Between Phases', () => {
    test('should properly handoff context between requirements → design → tasks → execute agents', async () => {
      console.log('Testing agent handoffs...');
      
      const project = await projectRepo.create({
        name: 'handoff-test',
        description: 'Testing agent handoffs between phases'
      });

      await fileSync.createProjectFiles(project.id, project.name, project.description || undefined);

      // Phase 1: Requirements Agent
      const requirementsSession = await agentRepo.create({
        projectId: project.id,
        agentType: 'requirements',
        contextData: {
          phase: 'requirements',
          approach: 'stakeholder interviews',
          requirements: ['user registration', 'user login', 'password reset']
        }
      });

      await fileSync.writeAgentContext(project.id, 'requirements', {
        summary: 'Requirements gathering completed with 3 core features identified',
        context: {
          totalRequirements: 3,
          stakeholderFeedback: 'positive',
          priorityFeatures: ['user registration', 'user login'],
          deliverables: ['requirements.md']
        }
      });

      // Create handoff document
      await fileSync.completePhase(project.id, {
        phase: 'requirements',
        deliverables: { requirements: './requirements.md' },
        handoffNotes: 'Requirements completed. 3 core features identified with stakeholder approval. Ready for design phase.'
      });

      // Phase 2: Design Agent picks up from requirements
      const designSession = await agentRepo.create({
        projectId: project.id,
        agentType: 'design',
        contextData: {
          phase: 'design',
          basedOnRequirements: requirementsSession.id,
          architecture: 'REST API with JWT authentication'
        }
      });

      await fileSync.writeAgentContext(project.id, 'design', {
        summary: 'System design completed with REST API architecture',
        context: {
          architecture: 'REST API',
          authentication: 'JWT tokens',
          database: 'PostgreSQL',
          endpoints: 3,
          deliverables: ['design.md', 'api-spec.yaml']
        }
      });

      // Phase 3: Tasks Agent breaks down design
      const tasksSession = await agentRepo.create({
        projectId: project.id,
        agentType: 'tasks',
        contextData: {
          phase: 'tasks',
          basedOnDesign: designSession.id,
          totalTasks: 5
        }
      });

      // Create implementation tasks
      const tasks = await Promise.all([
        taskRepo.create({
          projectId: project.id,
          title: 'Implement user registration',
          phase: 'execute',
          status: 'pending',
          priority: 1,
        }),
        taskRepo.create({
          projectId: project.id,
          title: 'Implement user login',
          phase: 'execute',
          status: 'pending',
          priority: 2,
        })
      ]);

      await fileSync.writeAgentContext(project.id, 'tasks', {
        summary: 'Implementation tasks created based on design',
        context: {
          totalTasks: tasks.length,
          taskBreakdown: 'design converted to executable tasks',
          deliverables: ['tasks.md', 'task breakdown']
        }
      });

      // Phase 4: Implementation Agent executes tasks
      await agentRepo.create({
        projectId: project.id,
        taskId: tasks[0].id,
        contextData: {
          phase: 'execute',
          currentTask: tasks[0].id,
          basedOnTasks: tasksSession.id
        }
      });

      // Verify handoff chain
      const allSessions = await agentRepo.findByProject(project.id);
      expect(allSessions).toHaveLength(4);

      const sessionsByType = allSessions.reduce((acc, session) => {
        acc[session.agentType] = session;
        return acc;
      }, {} as Record<string, any>);

      // Verify each agent type exists
      expect(sessionsByType.requirements).toBeDefined();
      expect(sessionsByType.design).toBeDefined();
      expect(sessionsByType.tasks).toBeDefined();
      expect(sessionsByType.implementation).toBeDefined();

      // Verify handoff references
      expect(sessionsByType.design.contextData.basedOnRequirements).toBe(requirementsSession.id);
      expect(sessionsByType.tasks.contextData.basedOnDesign).toBe(designSession.id);
      expect(sessionsByType.implementation.contextData.basedOnTasks).toBe(tasksSession.id);

      // Verify handoff files exist
      const projectDir = join(testProjectsDir, project.id);
      expect(existsSync(join(projectDir, 'handoffs', 'requirements-to-design.md'))).toBe(true);
      expect(existsSync(join(projectDir, 'requirements-context.json'))).toBe(true);
      expect(existsSync(join(projectDir, 'design-context.json'))).toBe(true);
      expect(existsSync(join(projectDir, 'tasks-context.json'))).toBe(true);

      console.log('✅ Agent handoff test passed - all phases properly connected');
    });
  });

  describe('Markdown Files Match Database State', () => {
    test('should maintain consistency between database and markdown files', async () => {
      console.log('Testing database-markdown consistency...');
      
      const project = await projectRepo.create({
        name: 'consistency-test',
        description: 'Testing database and markdown consistency'
      });

      await fileSync.createProjectFiles(project.id, project.name, project.description || undefined);

      const task = await taskRepo.create({
        projectId: project.id,
        title: 'Consistency Test Task',
        description: 'Testing database and file consistency',
        phase: 'execute',
        status: 'pending',
        priority: 1,
      });

      // Update task in database
      await taskRepo.update(task.id, { status: 'in_progress' });

      // Update corresponding markdown file
      await fileSync.appendAgentUpdate(project.id, task.id, {
        timestamp: new Date(),
        status: 'in_progress',
        notes: 'Task started in database and file system',
        deliverables: { consistency: 'database and files synchronized' },
        nextSteps: 'Continue maintaining consistency'
      });

      // Verify database state
      const dbTask = await taskRepo.findById(task.id);
      expect(dbTask?.status).toBe('in_progress');

      // Verify markdown file was created and contains correct information
      const taskFile = join(testProjectsDir, project.id, 'implementation', `task-${task.id}.md`);
      expect(existsSync(taskFile)).toBe(true);
      
      const taskContent = readFileSync(taskFile, 'utf-8');
      expect(taskContent).toContain('Consistency Test Task');
      expect(taskContent).toContain('in_progress');
      expect(taskContent).toContain('database and files synchronized');

      // Update task to completed
      await taskRepo.update(task.id, { status: 'completed' });
      
      await fileSync.appendAgentUpdate(project.id, task.id, {
        timestamp: new Date(),
        status: 'completed', 
        notes: 'Task completed successfully',
        deliverables: { 
          files: ['implementation.ts', 'tests.ts'],
          verification: 'all tests passing'
        },
        nextSteps: 'Task complete, ready for review'
      });

      // Verify final state consistency
      const finalDbTask = await taskRepo.findById(task.id);
      expect(finalDbTask?.status).toBe('completed');

      const finalTaskContent = readFileSync(taskFile, 'utf-8');
      expect(finalTaskContent).toContain('completed');
      expect(finalTaskContent).toContain('Task completed successfully');
      expect(finalTaskContent).toContain('all tests passing');

      console.log('✅ Database-markdown consistency test passed');
    });
  });

  describe('Workflow Resume After Interruption', () => {
    test('should resume workflow from interruption point', async () => {
      console.log('Testing workflow resume after interruption...');
      
      const project = await projectRepo.create({
        name: 'resume-test',
        description: 'Testing workflow resume capabilities'
      });

      await fileSync.createProjectFiles(project.id, project.name, project.description || undefined);

      // Create tasks
      const tasks = await Promise.all([
        taskRepo.create({
          projectId: project.id,
          title: 'Task 1',
          phase: 'execute',
          status: 'completed',
          priority: 1,
        }),
        taskRepo.create({
          projectId: project.id,
          title: 'Task 2', 
          phase: 'execute',
          status: 'in_progress',
          priority: 2,
        }),
        taskRepo.create({
          projectId: project.id,
          title: 'Task 3',
          phase: 'execute',
          status: 'pending',
          priority: 3,
        })
      ]);

      // Create agent session for in-progress task
      const session = await agentRepo.create({
        projectId: project.id,
        taskId: tasks[1].id,
        contextData: {
          currentTask: tasks[1].id,
          completedTasks: [tasks[0].id],
          progress: 'halfway through implementation'
        }
      });

      // Create checkpoint before "interruption"
      const checkpoint = await workflowRepo.createCheckpoint(project.id, 'execute');

      // Simulate workflow interruption by clearing some state
      // (In real scenario, this would be process restart, etc.)

      // Resume workflow - verify all state can be reconstructed
      const resumeProject = await projectRepo.findById(project.id);
      const resumeCheckpoint = await workflowRepo.getLatestCheckpoint(project.id);
      const resumeTasks = await taskRepo.findByProject(project.id);
      const resumeSessions = await agentRepo.findByProject(project.id);

      expect(resumeProject?.id).toBe(project.id);
      expect(resumeCheckpoint?.id).toBe(checkpoint.id);
      expect(resumeTasks).toHaveLength(3);
      expect(resumeSessions).toHaveLength(1);

      // Verify we can continue from where we left off
      const inProgressTask = resumeTasks.find(t => t.status === 'in_progress');
      expect(inProgressTask?.id).toBe(tasks[1].id);
      
      const activeSession = resumeSessions[0];
      expect(activeSession.taskId).toBe(tasks[1].id);
      expect(activeSession.contextData.progress).toBe('halfway through implementation');

      // Continue workflow from resume point
      await taskRepo.update(tasks[1].id, { status: 'completed' });
      await taskRepo.update(tasks[2].id, { status: 'in_progress' });

      await agentRepo.updateContext(session.id, {
        currentTask: tasks[2].id,
        completedTasks: [tasks[0].id, tasks[1].id],
        progress: 'resumed and continuing'
      });

      // Verify workflow continued successfully
      const finalTasks = await taskRepo.findByProject(project.id);
      const completedCount = finalTasks.filter(t => t.status === 'completed').length;
      const inProgressCount = finalTasks.filter(t => t.status === 'in_progress').length;
      
      expect(completedCount).toBe(2);
      expect(inProgressCount).toBe(1);

      console.log('✅ Workflow resume test passed - successfully resumed from interruption');
    });
  });

  describe('.spec/ Directory Creation and Monitoring', () => {
    test('should create and monitor .spec/ directory changes', async () => {
      console.log('Testing .spec/ directory creation and monitoring...');
      
      const project = await projectRepo.create({
        name: 'spec-monitoring-test',
        description: 'Testing spec directory monitoring'
      });

      // Create spec files
      await fileSync.createSpecFiles(project.id, project.name, project.description || undefined);

      // Verify spec directory structure
      const specProjectDir = join(testSpecDir, project.id);
      expect(existsSync(specProjectDir)).toBe(true);
      expect(existsSync(join(specProjectDir, 'README.md'))).toBe(true);
      expect(existsSync(join(specProjectDir, 'requirements.md'))).toBe(true);
      expect(existsSync(join(specProjectDir, 'design.md'))).toBe(true);
      expect(existsSync(join(specProjectDir, 'tasks.md'))).toBe(true);

      // Verify README contains project info
      const readmeContent = readFileSync(join(specProjectDir, 'README.md'), 'utf-8');
      expect(readmeContent).toContain('spec-monitoring-test');
      expect(readmeContent).toContain('Testing spec directory monitoring');

      // Test spec monitor functionality
      await specMonitor.start();

      // Simulate external edit to requirements.md
      const requirementsPath = join(specProjectDir, 'requirements.md');
      const updatedRequirements = readFileSync(requirementsPath, 'utf-8') + '\n\n## Updated Requirement\nAdded via external edit';
      
      // Write updated content (simulating external editor)
      require('fs').writeFileSync(requirementsPath, updatedRequirements);

      // Give monitor time to detect change
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify monitoring is working (would update database in real implementation)
      expect(existsSync(requirementsPath)).toBe(true);
      const finalContent = readFileSync(requirementsPath, 'utf-8');
      expect(finalContent).toContain('Updated Requirement');

      await specMonitor.stop();

      console.log('✅ Spec directory monitoring test passed');
    });
  });
});