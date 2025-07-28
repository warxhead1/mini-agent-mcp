import { BaseRepository } from './BaseRepository.js';
import {
  AgentSession,
  AgentSessionRow,
  AgentType,
  agentSessionFromRow,
  isValidAgentType
} from '../types/index.js';

export class AgentSessionRepository extends BaseRepository<AgentSession> {
  async create(item: Partial<AgentSession>): Promise<AgentSession> {
    if (!item.projectId || !item.agentType) {
      throw new Error('AgentSession projectId and agentType are required');
    }

    if (!isValidAgentType(item.agentType)) {
      throw new Error(`Invalid agent type: ${item.agentType}`);
    }

    const stmt = this.db.prepare(`
      INSERT INTO agent_sessions (project_id, task_id, agent_type, context_data)
      VALUES (?, ?, ?, ?)
    `);

    const info = stmt.run(
      item.projectId,
      item.taskId || null,
      item.agentType,
      item.contextData ? JSON.stringify(item.contextData) : null
    );

    if (info.changes === 0) {
      throw new Error('Failed to create agent session');
    }

    const row = this.db.prepare('SELECT * FROM agent_sessions WHERE rowid = ?')
      .get(info.lastInsertRowid) as AgentSessionRow;

    return agentSessionFromRow(row);
  }

  async update(id: string, updates: Partial<AgentSession>): Promise<AgentSession | null> {
    const setClauses: string[] = [];
    const values: any[] = [];

    if (updates.contextData !== undefined) {
      setClauses.push('context_data = ?');
      values.push(JSON.stringify(updates.contextData));
    }

    // Always update last_active
    setClauses.push('last_active = CURRENT_TIMESTAMP');

    if (setClauses.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const stmt = this.db.prepare(`
      UPDATE agent_sessions 
      SET ${setClauses.join(', ')}
      WHERE id = ?
    `);

    const info = stmt.run(...values);
    
    if (info.changes === 0) {
      return null;
    }

    return this.findById(id);
  }

  async findById(id: string): Promise<AgentSession | null> {
    const row = this.db.prepare('SELECT * FROM agent_sessions WHERE id = ?')
      .get(id) as AgentSessionRow | undefined;

    return row ? agentSessionFromRow(row) : null;
  }

  async delete(id: string): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM agent_sessions WHERE id = ?');
    const info = stmt.run(id);
    return info.changes > 0;
  }

  async findByProject(projectId: string): Promise<AgentSession[]> {
    const rows = this.db.prepare(`
      SELECT * FROM agent_sessions 
      WHERE project_id = ? 
      ORDER BY last_active DESC
    `).all(projectId) as AgentSessionRow[];

    return rows.map(agentSessionFromRow);
  }

  async findByProjectAndType(projectId: string, agentType: string): Promise<AgentSession | null> {
    const row = this.db.prepare(`
      SELECT * FROM agent_sessions 
      WHERE project_id = ? AND agent_type = ?
      ORDER BY last_active DESC
      LIMIT 1
    `).get(projectId, agentType) as AgentSessionRow | undefined;

    return row ? agentSessionFromRow(row) : null;
  }

  async updateContext(id: string, context: Record<string, any>): Promise<void> {
    const session = await this.findById(id);
    if (!session) {
      throw new Error(`Agent session not found: ${id}`);
    }

    // Merge with existing context
    const updatedContext = { ...session.contextData, ...context };
    
    const stmt = this.db.prepare(`
      UPDATE agent_sessions 
      SET context_data = ?, last_active = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run(JSON.stringify(updatedContext), id);
  }

  async getAllContexts(projectId: string): Promise<Record<string, any>> {
    const sessions = await this.findByProject(projectId);
    const contexts: Record<string, any> = {};

    for (const session of sessions) {
      contexts[session.agentType] = session.contextData;
    }

    return contexts;
  }

  async resumeSession(id: string): Promise<AgentSession> {
    const session = await this.findById(id);
    if (!session) {
      throw new Error(`Agent session not found: ${id}`);
    }

    // Update last_active timestamp
    const stmt = this.db.prepare(`
      UPDATE agent_sessions 
      SET last_active = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run(id);

    return { ...session, lastActive: new Date() };
  }

  async assignAgent(taskId: string, agentType: string): Promise<AgentSession> {
    // Get the task to find project ID
    const taskRow = this.db.prepare('SELECT project_id FROM tasks WHERE id = ?').get(taskId) as { project_id: string } | undefined;
    
    if (!taskRow) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // Check if there's an existing session for this project and agent type
    const existing = await this.findByProjectAndType(taskRow.project_id, agentType);
    
    if (existing) {
      // Update existing session with new task
      const stmt = this.db.prepare(`
        UPDATE agent_sessions 
        SET task_id = ?, last_active = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      stmt.run(taskId, existing.id);
      
      return this.findById(existing.id) as Promise<AgentSession>;
    }

    // Create new session
    return this.create({
      projectId: taskRow.project_id,
      taskId,
      agentType: agentType as AgentType,
      contextData: {}
    });
  }
}