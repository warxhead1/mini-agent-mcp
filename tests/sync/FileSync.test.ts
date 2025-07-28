import { FileSync } from '../../src/sync/FileSync';
import { AgentUpdate, PhaseCompletion } from '../../src/types';
import { promises as fs } from 'fs';
import path from 'path';
import { existsSync } from 'fs';

describe('FileSync', () => {
  let fileSync: FileSync;
  const testBaseDir = path.join(process.cwd(), 'test-projects');
  const testProjectId = 'test-project-123';

  beforeAll(() => {
    fileSync = new FileSync(testBaseDir);
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testBaseDir, { recursive: true, force: true });
    } catch {
      // Directory doesn't exist
    }
  });

  describe('createProjectFiles', () => {
    test('should create complete project structure', async () => {
      await fileSync.createProjectFiles(testProjectId, 'Test Project', 'A test project description');

      // Check directories exist
      expect(existsSync(path.join(testBaseDir, testProjectId))).toBe(true);
      expect(existsSync(path.join(testBaseDir, testProjectId, 'implementation'))).toBe(true);
      expect(existsSync(path.join(testBaseDir, testProjectId, 'handoffs'))).toBe(true);

      // Check files exist
      expect(existsSync(path.join(testBaseDir, testProjectId, 'README.md'))).toBe(true);
      expect(existsSync(path.join(testBaseDir, testProjectId, 'requirements.md'))).toBe(true);
      expect(existsSync(path.join(testBaseDir, testProjectId, 'design.md'))).toBe(true);
      expect(existsSync(path.join(testBaseDir, testProjectId, 'tasks.md'))).toBe(true);
    });

    test('should create README with project info', async () => {
      await fileSync.createProjectFiles(testProjectId, 'Test Project', 'Test description');

      const readme = await fs.readFile(
        path.join(testBaseDir, testProjectId, 'README.md'),
        'utf-8'
      );

      expect(readme).toContain('# Test Project');
      expect(readme).toContain('Test description');
      expect(readme).toContain(`**ID**: ${testProjectId}`);
      expect(readme).toContain('**Status**: active');
      expect(readme).toContain('**Current Phase**: requirements');
    });

    test('should handle missing description', async () => {
      await fileSync.createProjectFiles(testProjectId, 'Test Project');

      const readme = await fs.readFile(
        path.join(testBaseDir, testProjectId, 'README.md'),
        'utf-8'
      );

      expect(readme).toContain('No description provided.');
    });
  });

  describe('appendAgentUpdate', () => {
    beforeEach(async () => {
      await fileSync.createProjectFiles(testProjectId, 'Test Project');
    });

    test('should create task file and append update', async () => {
      const update: AgentUpdate = {
        timestamp: new Date('2024-01-01T12:00:00Z'),
        status: 'in_progress',
        notes: 'Started working on the task',
        deliverables: { code: 'main.ts' },
        nextSteps: 'Add unit tests'
      };

      await fileSync.appendAgentUpdate(testProjectId, 'task-001', update);

      const taskFile = await fs.readFile(
        path.join(testBaseDir, testProjectId, 'implementation', 'task-task-001.md'),
        'utf-8'
      );

      expect(taskFile).toContain('# Task task-001');
      expect(taskFile).toContain('2024-01-01T12:00:00.000Z - Status: in_progress');
      expect(taskFile).toContain('Started working on the task');
      expect(taskFile).toContain('"code": "main.ts"');
      expect(taskFile).toContain('Add unit tests');
    });

    test('should append multiple updates to same file', async () => {
      const update1: AgentUpdate = {
        timestamp: new Date('2024-01-01T12:00:00Z'),
        status: 'in_progress',
        notes: 'First update'
      };

      const update2: AgentUpdate = {
        timestamp: new Date('2024-01-01T13:00:00Z'),
        status: 'completed',
        notes: 'Second update'
      };

      await fileSync.appendAgentUpdate(testProjectId, 'task-001', update1);
      await fileSync.appendAgentUpdate(testProjectId, 'task-001', update2);

      const taskFile = await fs.readFile(
        path.join(testBaseDir, testProjectId, 'implementation', 'task-task-001.md'),
        'utf-8'
      );

      expect(taskFile).toContain('First update');
      expect(taskFile).toContain('Second update');
      expect(taskFile).toContain('Status: in_progress');
      expect(taskFile).toContain('Status: completed');
    });
  });

  describe('writeAgentContext', () => {
    beforeEach(async () => {
      await fileSync.createProjectFiles(testProjectId, 'Test Project');
    });

    test('should write context file and update phase file', async () => {
      const context = {
        summary: 'Completed requirements gathering',
        context: {
          userStories: ['Story 1', 'Story 2'],
          constraints: ['Must be secure']
        }
      };

      await fileSync.writeAgentContext(testProjectId, 'requirements', context);

      // Check context file
      const contextFile = await fs.readFile(
        path.join(testBaseDir, testProjectId, 'requirements-context.json'),
        'utf-8'
      );
      const contextData = JSON.parse(contextFile);

      expect(contextData.agentType).toBe('requirements');
      expect(contextData.summary).toBe('Completed requirements gathering');
      expect(contextData.context.userStories).toEqual(['Story 1', 'Story 2']);

      // Check phase file was updated
      const phaseFile = await fs.readFile(
        path.join(testBaseDir, testProjectId, 'requirements.md'),
        'utf-8'
      );

      expect(phaseFile).toContain('Completed requirements gathering');
      expect(phaseFile).not.toContain('*Not yet started*');
    });
  });

  describe('completePhase', () => {
    beforeEach(async () => {
      await fileSync.createProjectFiles(testProjectId, 'Test Project');
    });

    test('should create handoff document', async () => {
      const phaseData: PhaseCompletion = {
        phase: 'requirements',
        deliverables: {
          requirements: './requirements.md',
          userStories: ['Story 1', 'Story 2']
        },
        handoffNotes: 'Requirements complete. Note: Focus on security. Important: Use OAuth2.'
      };

      await fileSync.completePhase(testProjectId, phaseData);

      const handoffFile = await fs.readFile(
        path.join(testBaseDir, testProjectId, 'handoffs', 'requirements-to-design.md'),
        'utf-8'
      );

      expect(handoffFile).toContain('# Requirements Phase Handoff');
      expect(handoffFile).toContain('Requirements complete');
      expect(handoffFile).toContain('"userStories": [');
      expect(handoffFile).toContain('- Requirements complete. Note: Focus on security. Important: Use OAuth2.');
    });

    test('should update README phase checklist', async () => {
      const phaseData: PhaseCompletion = {
        phase: 'requirements',
        deliverables: {},
        handoffNotes: 'Phase complete'
      };

      await fileSync.completePhase(testProjectId, phaseData);

      const readme = await fs.readFile(
        path.join(testBaseDir, testProjectId, 'README.md'),
        'utf-8'
      );

      expect(readme).toContain('- [x] Requirements');
      expect(readme).toContain('**Current Phase**: design');
    });

    test('should throw error for unknown phase', async () => {
      const phaseData: PhaseCompletion = {
        phase: 'unknown',
        deliverables: {},
        handoffNotes: 'Test'
      };

      await expect(fileSync.completePhase(testProjectId, phaseData))
        .rejects.toThrow('Unknown phase: unknown');
    });
  });

  describe('readProjectHistory', () => {
    beforeEach(async () => {
      await fileSync.createProjectFiles(testProjectId, 'Test Project', 'Test description');
      
      // Add some content
      await fileSync.writeAgentContext(testProjectId, 'requirements', {
        summary: 'Requirements done',
        context: {}
      });

      await fileSync.completePhase(testProjectId, {
        phase: 'requirements',
        deliverables: { doc: 'requirements.md' },
        handoffNotes: 'Moving to design'
      });
    });

    test('should compile complete project history', async () => {
      const history = await fileSync.readProjectHistory(testProjectId);

      expect(history).toContain('# Project Overview');
      expect(history).toContain('Test Project');
      expect(history).toContain('Test description');
      expect(history).toContain('# Requirements Phase');
      expect(history).toContain('Requirements done');
      expect(history).toContain('# Handoff: requirements-to-design.md');
      expect(history).toContain('Moving to design');
    });

    test('should handle missing project gracefully', async () => {
      const history = await fileSync.readProjectHistory('non-existent');
      expect(history).toContain('Error reading project history');
    });
  });

  describe('readTaskUpdates', () => {
    beforeEach(async () => {
      await fileSync.createProjectFiles(testProjectId, 'Test Project');
    });

    test('should parse task updates from markdown', async () => {
      // Create some updates
      const update1: AgentUpdate = {
        timestamp: new Date('2024-01-01T12:00:00Z'),
        status: 'in_progress',
        notes: 'First update'
      };

      const update2: AgentUpdate = {
        timestamp: new Date('2024-01-01T13:00:00Z'),
        status: 'completed',
        notes: 'Second update'
      };

      await fileSync.appendAgentUpdate(testProjectId, 'task-001', update1);
      await fileSync.appendAgentUpdate(testProjectId, 'task-001', update2);

      const updates = await fileSync.readTaskUpdates(testProjectId, 'task-001');

      expect(updates).toHaveLength(2);
      expect(updates[0].status).toBe('in_progress');
      expect(updates[0].notes).toBe('First update');
      expect(updates[1].status).toBe('completed');
      expect(updates[1].notes).toBe('Second update');
    });

    test('should return empty array for non-existent task', async () => {
      const updates = await fileSync.readTaskUpdates(testProjectId, 'non-existent');
      expect(updates).toEqual([]);
    });
  });

  describe('utility methods', () => {
    test('getProjectPath should return correct path', () => {
      const projectPath = fileSync.getProjectPath(testProjectId);
      expect(projectPath).toBe(path.join(testBaseDir, testProjectId));
    });

    test('projectExists should check directory existence', async () => {
      expect(await fileSync.projectExists(testProjectId)).toBe(false);
      
      await fileSync.createProjectFiles(testProjectId, 'Test Project');
      
      expect(await fileSync.projectExists(testProjectId)).toBe(true);
    });
  });
});