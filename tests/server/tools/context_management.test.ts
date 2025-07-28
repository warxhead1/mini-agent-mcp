import { AgenticMCPServer } from '../../../src/server';
import { DatabaseConnection } from '../../../src/db/database';
import { ProjectRepository } from '../../../src/repositories/ProjectRepository';
import { AgentSessionRepository } from '../../../src/repositories/AgentSessionRepository';
import { FileSync } from '../../../src/sync/FileSync';
import { existsSync, rmSync, readFileSync } from 'fs';
import path from 'path';

describe('context management tools', () => {
  let server: AgenticMCPServer;
  let projectRepo: ProjectRepository;
  let agentSessionRepo: AgentSessionRepository;
  let fileSync: FileSync;
  const testDbPath = 'test-context-mgmt.db';
  const testProjectsDir = path.join(process.cwd(), 'test-projects');
  let projectId: string;

  beforeAll(async () => {
    process.env.MCP_DB_PATH = testDbPath;
    server = new AgenticMCPServer();
    projectRepo = new ProjectRepository();
    agentSessionRepo = new AgentSessionRepository();
    fileSync = new FileSync(testProjectsDir);

    // Create a test project
    const project = await projectRepo.create({
      name: 'Context Management Test Project'
    });
    projectId = project.id;

    // Create project files
    await fileSync.createProjectFiles(projectId, project.name);
  });

  afterEach(async () => {
    // Clean up agent sessions
    const db = DatabaseConnection.getInstance();
    db.prepare('DELETE FROM agent_sessions WHERE project_id = ?').run(projectId);
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

  describe('context_save tool', () => {
    test('should save context for new agent session', async () => {
      const contextData = {
        userStories: ['As a user, I want to login', 'As an admin, I want to manage users'],
        requirements: ['Must be secure', 'Must be fast'],
        decisions: ['Use OAuth2', 'Use JWT tokens']
      };

      const result = await (server as any).handleContextSave({
        projectId,
        agentType: 'requirements',
        context: contextData,
        summary: 'Completed requirements gathering for authentication system'
      });

      expect(result.success).toBe(true);
      expect(result.session.agentType).toBe('requirements');
      expect(result.session.projectId).toBe(projectId);
      expect(result.context.summary).toBe('Completed requirements gathering for authentication system');
      expect(result.context.saved).toBe(3); // Three keys in context
      expect(result.message).toBe('Context saved for requirements agent');

      // Verify database session was created
      const session = await agentSessionRepo.findByProjectAndType(projectId, 'requirements');
      expect(session).not.toBeNull();
      expect(session?.contextData.userStories).toEqual(contextData.userStories);

      // Verify markdown files were created
      const contextFile = path.join(testProjectsDir, projectId, 'requirements-context.json');
      expect(existsSync(contextFile)).toBe(true);
      
      const contextFileContent = JSON.parse(readFileSync(contextFile, 'utf-8'));
      expect(contextFileContent.summary).toBe('Completed requirements gathering for authentication system');
      expect(contextFileContent.context).toEqual(contextData);

      // Verify phase file was updated
      const phaseFile = path.join(testProjectsDir, projectId, 'requirements.md');
      const phaseContent = readFileSync(phaseFile, 'utf-8');
      expect(phaseContent).toContain('Completed requirements gathering for authentication system');
    });

    test('should update existing agent session context', async () => {
      // First save
      await (server as any).handleContextSave({
        projectId,
        agentType: 'design',
        context: { architecture: 'microservices' },
        summary: 'Initial design decisions'
      });

      // Second save (update)
      const result = await (server as any).handleContextSave({
        projectId,
        agentType: 'design',
        context: { patterns: 'MVC', database: 'PostgreSQL' },
        summary: 'Updated design with technical details'
      });

      expect(result.success).toBe(true);

      // Verify context was merged
      const session = await agentSessionRepo.findByProjectAndType(projectId, 'design');
      expect(session?.contextData.architecture).toBe('microservices');
      expect(session?.contextData.patterns).toBe('MVC');
      expect(session?.contextData.database).toBe('PostgreSQL');
    });

    test('should validate required fields', async () => {
      // Missing projectId
      await expect((server as any).handleContextSave({
        agentType: 'requirements',
        context: {},
        summary: 'Test'
      })).rejects.toThrow('Project ID is required and must be a string');

      // Missing agentType
      await expect((server as any).handleContextSave({
        projectId,
        context: {},
        summary: 'Test'
      })).rejects.toThrow('Agent type is required and must be a string');

      // Missing context
      await expect((server as any).handleContextSave({
        projectId,
        agentType: 'requirements',
        summary: 'Test'
      })).rejects.toThrow('Context is required and must be an object');

      // Missing summary
      await expect((server as any).handleContextSave({
        projectId,
        agentType: 'requirements',
        context: {}
      })).rejects.toThrow('Summary is required and must be a string');
    });

    test('should validate agent type', async () => {
      await expect((server as any).handleContextSave({
        projectId,
        agentType: 'invalid_agent',
        context: {},
        summary: 'Test'
      })).rejects.toThrow('Invalid agent type. Must be one of: requirements, design, tasks, implementation');
    });

    test('should validate project exists', async () => {
      await expect((server as any).handleContextSave({
        projectId: 'non-existent-project',
        agentType: 'requirements',
        context: {},
        summary: 'Test'
      })).rejects.toThrow('Project not found: non-existent-project');
    });
  });

  describe('context_load tool', () => {
    beforeEach(async () => {
      // Set up some test contexts
      await (server as any).handleContextSave({
        projectId,
        agentType: 'requirements',
        context: { 
          userStories: ['Story 1', 'Story 2'],
          constraints: ['Security', 'Performance'] 
        },
        summary: 'Requirements phase completed'
      });

      await (server as any).handleContextSave({
        projectId,
        agentType: 'design',
        context: { 
          architecture: 'layered',
          components: ['API', 'Database', 'Frontend'] 
        },
        summary: 'Design phase completed'
      });
    });

    test('should load all contexts for a project', async () => {
      const result = await (server as any).handleContextLoad({
        projectId
      });

      expect(result.success).toBe(true);
      expect(result.project.id).toBe(projectId);
      expect(result.project.name).toBe('Context Management Test Project');

      // Should have contexts for both agents
      expect(result.contexts.requirements).toBeDefined();
      expect(result.contexts.design).toBeDefined();
      expect(result.contexts.requirements.userStories).toEqual(['Story 1', 'Story 2']);
      expect(result.contexts.design.architecture).toBe('layered');

      // Should have session metadata
      expect(result.sessions).toHaveLength(2);
      expect(result.sessions[0].agentType).toMatch(/^(requirements|design)$/);
      expect(result.sessions[0].hasContext).toBe(true);

      // Should have markdown history
      expect(result.markdownHistory).toContain('Context Management Test Project');

      // Should have metadata
      expect(result.metadata.totalSessions).toBe(2);
      expect(result.metadata.activeAgentTypes).toContain('requirements');
      expect(result.metadata.activeAgentTypes).toContain('design');
      expect(result.metadata.lastUpdated).toBeTruthy();

      expect(result.message).toBe('Loaded contexts for 2 agent types');
    });

    test('should return empty contexts for project with no sessions', async () => {
      // Create a new project with no sessions
      const newProject = await projectRepo.create({
        name: 'Empty Project'
      });

      const result = await (server as any).handleContextLoad({
        projectId: newProject.id
      });

      expect(result.success).toBe(true);
      expect(result.contexts).toEqual({});
      expect(result.sessions).toHaveLength(0);
      expect(result.metadata.totalSessions).toBe(0);
      expect(result.message).toBe('Loaded contexts for 0 agent types');
    });

    test('should validate project ID', async () => {
      // Missing projectId
      await expect((server as any).handleContextLoad({}))
        .rejects.toThrow('Project ID is required and must be a string');

      // Invalid projectId type
      await expect((server as any).handleContextLoad({ projectId: 123 }))
        .rejects.toThrow('Project ID is required and must be a string');
    });

    test('should validate project exists', async () => {
      await expect((server as any).handleContextLoad({
        projectId: 'non-existent-project'
      })).rejects.toThrow('Project not found: non-existent-project');
    });
  });

  describe('integration between save and load', () => {
    test('should maintain context consistency across save and load operations', async () => {
      const contexts = {
        requirements: {
          userStories: ['Login story', 'Register story'],
          acceptanceCriteria: ['Secure authentication', 'Password validation']
        },
        design: {
          architecture: 'microservices',
          technologies: ['Node.js', 'PostgreSQL', 'React']
        }
      };

      // Save contexts for different agents
      await (server as any).handleContextSave({
        projectId,
        agentType: 'requirements',
        context: contexts.requirements,
        summary: 'Requirements gathered and analyzed'
      });

      await (server as any).handleContextSave({
        projectId,
        agentType: 'design',
        context: contexts.design,
        summary: 'System architecture designed'
      });

      // Load and verify
      const result = await (server as any).handleContextLoad({ projectId });

      expect(result.contexts.requirements).toEqual(contexts.requirements);
      expect(result.contexts.design).toEqual(contexts.design);
      expect(result.sessions).toHaveLength(2);

      // Verify markdown files exist
      expect(existsSync(path.join(testProjectsDir, projectId, 'requirements-context.json'))).toBe(true);
      expect(existsSync(path.join(testProjectsDir, projectId, 'design-context.json'))).toBe(true);
    });
  });
});