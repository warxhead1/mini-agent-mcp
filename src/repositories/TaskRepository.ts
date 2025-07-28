import { BaseRepository } from './BaseRepository.js';
import {
  Task,
  TaskRow,
  TaskFilter,
  TaskNode,
  taskFromRow,
  isValidTaskStatus,
  isValidTaskPhase
} from '../types/index.js';

export class TaskRepository extends BaseRepository<Task> {
  async create(item: Partial<Task>): Promise<Task> {
    if (!item.projectId || !item.title || !item.phase) {
      throw new Error('Task projectId, title, and phase are required');
    }

    if (!isValidTaskPhase(item.phase)) {
      throw new Error(`Invalid task phase: ${item.phase}`);
    }

    const stmt = this.db.prepare(`
      INSERT INTO tasks (
        project_id, parent_id, title, description, phase, 
        status, assignee_type, priority, requirements_refs, dependencies
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      item.projectId,
      item.parentId || null,
      item.title,
      item.description || null,
      item.phase,
      item.status || 'pending',
      item.assigneeType || null,
      item.priority || 1,
      item.requirementsRefs ? JSON.stringify(item.requirementsRefs) : null,
      item.dependencies ? JSON.stringify(item.dependencies) : null
    );

    if (info.changes === 0) {
      throw new Error('Failed to create task');
    }

    const row = this.db.prepare('SELECT * FROM tasks WHERE rowid = ?')
      .get(info.lastInsertRowid) as TaskRow;

    return taskFromRow(row);
  }

  async update(id: string, updates: Partial<Task>): Promise<Task | null> {
    const setClauses: string[] = [];
    const values: any[] = [];

    if (updates.title !== undefined) {
      setClauses.push('title = ?');
      values.push(updates.title);
    }

    if (updates.description !== undefined) {
      setClauses.push('description = ?');
      values.push(updates.description);
    }

    if (updates.status !== undefined) {
      if (!isValidTaskStatus(updates.status)) {
        throw new Error(`Invalid task status: ${updates.status}`);
      }
      setClauses.push('status = ?');
      values.push(updates.status);
    }

    if (updates.assigneeType !== undefined) {
      setClauses.push('assignee_type = ?');
      values.push(updates.assigneeType);
    }

    if (updates.priority !== undefined) {
      setClauses.push('priority = ?');
      values.push(updates.priority);
    }

    if (updates.requirementsRefs !== undefined) {
      setClauses.push('requirements_refs = ?');
      values.push(JSON.stringify(updates.requirementsRefs));
    }

    if (updates.dependencies !== undefined) {
      setClauses.push('dependencies = ?');
      values.push(JSON.stringify(updates.dependencies));
    }

    if (setClauses.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const stmt = this.db.prepare(`
      UPDATE tasks 
      SET ${setClauses.join(', ')}
      WHERE id = ?
    `);

    const info = stmt.run(...values);
    
    if (info.changes === 0) {
      return null;
    }

    return this.findById(id);
  }

  async findById(id: string): Promise<Task | null> {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?')
      .get(id) as TaskRow | undefined;

    return row ? taskFromRow(row) : null;
  }

  async delete(id: string): Promise<boolean> {
    // Delete all children first (cascade)
    const deleteChildren = this.db.prepare('DELETE FROM tasks WHERE parent_id = ?');
    deleteChildren.run(id);

    const stmt = this.db.prepare('DELETE FROM tasks WHERE id = ?');
    const info = stmt.run(id);
    return info.changes > 0;
  }

  async findByProject(projectId: string, filter?: TaskFilter): Promise<Task[]> {
    let query = 'SELECT * FROM tasks WHERE project_id = ?';
    const params: any[] = [projectId];

    if (filter) {
      if (filter.status) {
        query += ' AND status = ?';
        params.push(filter.status);
      }

      if (filter.phase) {
        query += ' AND phase = ?';
        params.push(filter.phase);
      }

      if (filter.assigneeType) {
        query += ' AND assignee_type = ?';
        params.push(filter.assigneeType);
      }

      if (filter.parentId !== undefined) {
        if (filter.parentId === null) {
          query += ' AND parent_id IS NULL';
        } else {
          query += ' AND parent_id = ?';
          params.push(filter.parentId);
        }
      }
    }

    query += ' ORDER BY priority DESC, created_at ASC';

    const rows = this.db.prepare(query).all(...params) as TaskRow[];
    return rows.map(taskFromRow);
  }

  async getTaskTree(projectId: string): Promise<TaskNode[]> {
    // Get all tasks for the project
    const allTasks = await this.findByProject(projectId);
    
    // Build a map for quick lookup
    const taskMap = new Map<string, TaskNode>();
    const rootTasks: TaskNode[] = [];

    // First pass: create TaskNode objects
    for (const task of allTasks) {
      taskMap.set(task.id, { ...task, children: [] });
    }

    // Second pass: build the tree structure
    for (const task of allTasks) {
      const taskNode = taskMap.get(task.id)!;
      
      if (task.parentId && taskMap.has(task.parentId)) {
        const parent = taskMap.get(task.parentId)!;
        parent.children.push(taskNode);
      } else {
        rootTasks.push(taskNode);
      }
    }

    return rootTasks;
  }

  async checkDependencies(taskId: string): Promise<boolean> {
    const task = await this.findById(taskId);
    if (!task || task.dependencies.length === 0) {
      return true;
    }

    // Check if all dependencies are completed
    const placeholders = task.dependencies.map(() => '?').join(', ');
    const query = `
      SELECT COUNT(*) as incomplete
      FROM tasks 
      WHERE id IN (${placeholders})
      AND status != 'completed'
    `;

    const result = this.db.prepare(query).get(...task.dependencies) as { incomplete: number };
    return result.incomplete === 0;
  }

  async getChildren(parentId: string): Promise<Task[]> {
    const rows = this.db.prepare('SELECT * FROM tasks WHERE parent_id = ?')
      .all(parentId) as TaskRow[];
    return rows.map(taskFromRow);
  }
}