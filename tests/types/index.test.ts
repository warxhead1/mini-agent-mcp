import {
  isValidProjectStatus,
  isValidProjectPhase,
  isValidTaskStatus,
  isValidAgentType,
  parseJsonArray,
  parseJsonObject,
  projectFromRow,
  taskFromRow,
  agentSessionFromRow,
  workflowCheckpointFromRow,
  ProjectRow,
  TaskRow,
  AgentSessionRow,
  WorkflowCheckpointRow,
} from '../../src/types';

describe('Type Validation Helpers', () => {
  describe('isValidProjectStatus', () => {
    test('should validate correct project statuses', () => {
      expect(isValidProjectStatus('active')).toBe(true);
      expect(isValidProjectStatus('paused')).toBe(true);
      expect(isValidProjectStatus('completed')).toBe(true);
    });

    test('should reject invalid project statuses', () => {
      expect(isValidProjectStatus('invalid')).toBe(false);
      expect(isValidProjectStatus('')).toBe(false);
      expect(isValidProjectStatus('ACTIVE')).toBe(false);
    });
  });

  describe('isValidProjectPhase', () => {
    test('should validate correct project phases', () => {
      expect(isValidProjectPhase('requirements')).toBe(true);
      expect(isValidProjectPhase('design')).toBe(true);
      expect(isValidProjectPhase('tasks')).toBe(true);
      expect(isValidProjectPhase('execute')).toBe(true);
    });

    test('should reject invalid project phases', () => {
      expect(isValidProjectPhase('planning')).toBe(false);
      expect(isValidProjectPhase('')).toBe(false);
    });
  });

  describe('isValidTaskStatus', () => {
    test('should validate correct task statuses', () => {
      expect(isValidTaskStatus('pending')).toBe(true);
      expect(isValidTaskStatus('in_progress')).toBe(true);
      expect(isValidTaskStatus('blocked')).toBe(true);
      expect(isValidTaskStatus('completed')).toBe(true);
    });

    test('should reject invalid task statuses', () => {
      expect(isValidTaskStatus('done')).toBe(false);
      expect(isValidTaskStatus('in-progress')).toBe(false);
    });
  });

  describe('isValidAgentType', () => {
    test('should validate correct agent types', () => {
      expect(isValidAgentType('requirements')).toBe(true);
      expect(isValidAgentType('design')).toBe(true);
      expect(isValidAgentType('tasks')).toBe(true);
      expect(isValidAgentType('implementation')).toBe(true);
    });

    test('should reject invalid agent types', () => {
      expect(isValidAgentType('developer')).toBe(false);
      expect(isValidAgentType('')).toBe(false);
    });
  });
});

describe('JSON Parsing Helpers', () => {
  describe('parseJsonArray', () => {
    test('should parse valid JSON arrays', () => {
      expect(parseJsonArray('["a", "b", "c"]')).toEqual(['a', 'b', 'c']);
      expect(parseJsonArray('[]')).toEqual([]);
      expect(parseJsonArray('[1, 2, 3]')).toEqual([1, 2, 3]);
    });

    test('should return empty array for invalid input', () => {
      expect(parseJsonArray(null)).toEqual([]);
      expect(parseJsonArray('')).toEqual([]);
      expect(parseJsonArray('invalid')).toEqual([]);
      expect(parseJsonArray('{}')).toEqual([]);
    });
  });

  describe('parseJsonObject', () => {
    test('should parse valid JSON objects', () => {
      expect(parseJsonObject('{"key": "value"}')).toEqual({ key: 'value' });
      expect(parseJsonObject('{}')).toEqual({});
      expect(parseJsonObject('{"nested": {"key": 123}}')).toEqual({ nested: { key: 123 } });
    });

    test('should return empty object for invalid input', () => {
      expect(parseJsonObject(null)).toEqual({});
      expect(parseJsonObject('')).toEqual({});
      expect(parseJsonObject('invalid')).toEqual({});
      expect(parseJsonObject('[]')).toEqual({});
    });
  });
});

describe('Row Converters', () => {
  describe('projectFromRow', () => {
    test('should convert database row to Project', () => {
      const row: ProjectRow = {
        id: 'abc123',
        name: 'Test Project',
        description: 'A test project',
        status: 'active',
        current_phase: 'requirements',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
      };

      const project = projectFromRow(row);
      
      expect(project.id).toBe('abc123');
      expect(project.name).toBe('Test Project');
      expect(project.description).toBe('A test project');
      expect(project.status).toBe('active');
      expect(project.currentPhase).toBe('requirements');
      expect(project.createdAt).toBeInstanceOf(Date);
      expect(project.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('taskFromRow', () => {
    test('should convert database row to Task', () => {
      const row: TaskRow = {
        id: 'task123',
        project_id: 'proj123',
        parent_id: 'parent123',
        title: 'Test Task',
        description: 'Task description',
        phase: 'design',
        status: 'in_progress',
        assignee_type: 'design',
        priority: 2,
        requirements_refs: '["req1", "req2"]',
        dependencies: '["dep1"]',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
      };

      const task = taskFromRow(row);
      
      expect(task.id).toBe('task123');
      expect(task.projectId).toBe('proj123');
      expect(task.parentId).toBe('parent123');
      expect(task.title).toBe('Test Task');
      expect(task.phase).toBe('design');
      expect(task.status).toBe('in_progress');
      expect(task.requirementsRefs).toEqual(['req1', 'req2']);
      expect(task.dependencies).toEqual(['dep1']);
    });

    test('should handle null values correctly', () => {
      const row: TaskRow = {
        id: 'task123',
        project_id: 'proj123',
        parent_id: null,
        title: 'Test Task',
        description: null,
        phase: 'design',
        status: 'pending',
        assignee_type: null,
        priority: 1,
        requirements_refs: null,
        dependencies: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
      };

      const task = taskFromRow(row);
      
      expect(task.parentId).toBeUndefined();
      expect(task.assigneeType).toBeUndefined();
      expect(task.requirementsRefs).toEqual([]);
      expect(task.dependencies).toEqual([]);
    });
  });

  describe('agentSessionFromRow', () => {
    test('should convert database row to AgentSession', () => {
      const row: AgentSessionRow = {
        id: 'session123',
        project_id: 'proj123',
        task_id: 'task123',
        agent_type: 'requirements',
        context_data: '{"key": "value", "count": 42}',
        last_active: '2024-01-01T00:00:00Z',
      };

      const session = agentSessionFromRow(row);
      
      expect(session.id).toBe('session123');
      expect(session.projectId).toBe('proj123');
      expect(session.taskId).toBe('task123');
      expect(session.agentType).toBe('requirements');
      expect(session.contextData).toEqual({ key: 'value', count: 42 });
      expect(session.lastActive).toBeInstanceOf(Date);
    });
  });

  describe('workflowCheckpointFromRow', () => {
    test('should convert database row to WorkflowCheckpoint', () => {
      const row: WorkflowCheckpointRow = {
        id: 'checkpoint123',
        project_id: 'proj123',
        phase: 'design',
        checkpoint_data: JSON.stringify({
          completedTasks: ['task1', 'task2'],
          currentTask: 'task3',
          phaseDeliverables: { doc: 'design.md' },
        }),
        created_at: '2024-01-01T00:00:00Z',
      };

      const checkpoint = workflowCheckpointFromRow(row);
      
      expect(checkpoint.id).toBe('checkpoint123');
      expect(checkpoint.projectId).toBe('proj123');
      expect(checkpoint.phase).toBe('design');
      expect(checkpoint.checkpointData.completedTasks).toEqual(['task1', 'task2']);
      expect(checkpoint.checkpointData.currentTask).toBe('task3');
      expect(checkpoint.checkpointData.phaseDeliverables).toEqual({ doc: 'design.md' });
      expect(checkpoint.createdAt).toBeInstanceOf(Date);
    });
  });
});