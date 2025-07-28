import { BaseRepository } from './BaseRepository.js';
import { 
  Project, 
  ProjectRow, 
  ProjectFilter,
  projectFromRow,
  isValidProjectStatus,
  isValidProjectPhase
} from '../types/index.js';

export class ProjectRepository extends BaseRepository<Project> {
  async create(item: Partial<Project>): Promise<Project> {
    if (!item.name) {
      throw new Error('Project name is required');
    }

    const stmt = this.db.prepare(`
      INSERT INTO projects (name, description, status, current_phase)
      VALUES (?, ?, ?, ?)
    `);

    const info = stmt.run(
      item.name,
      item.description || null,
      item.status || 'active',
      item.currentPhase || 'requirements'
    );

    if (info.changes === 0) {
      throw new Error('Failed to create project');
    }

    // Retrieve the created project
    const row = this.db.prepare('SELECT * FROM projects WHERE rowid = ?')
      .get(info.lastInsertRowid) as ProjectRow;

    return projectFromRow(row);
  }

  async update(id: string, updates: Partial<Project>): Promise<Project | null> {
    const setClauses: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      setClauses.push('name = ?');
      values.push(updates.name);
    }

    if (updates.description !== undefined) {
      setClauses.push('description = ?');
      values.push(updates.description);
    }

    if (updates.status !== undefined) {
      if (!isValidProjectStatus(updates.status)) {
        throw new Error(`Invalid project status: ${updates.status}`);
      }
      setClauses.push('status = ?');
      values.push(updates.status);
    }

    if (updates.currentPhase !== undefined) {
      if (!isValidProjectPhase(updates.currentPhase)) {
        throw new Error(`Invalid project phase: ${updates.currentPhase}`);
      }
      setClauses.push('current_phase = ?');
      values.push(updates.currentPhase);
    }

    if (setClauses.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const stmt = this.db.prepare(`
      UPDATE projects 
      SET ${setClauses.join(', ')}
      WHERE id = ?
    `);

    const info = stmt.run(...values);
    
    if (info.changes === 0) {
      return null;
    }

    return this.findById(id);
  }

  async findById(id: string): Promise<Project | null> {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?')
      .get(id) as ProjectRow | undefined;

    return row ? projectFromRow(row) : null;
  }

  async findByName(name: string): Promise<Project | null> {
    const row = this.db.prepare('SELECT * FROM projects WHERE name = ?')
      .get(name) as ProjectRow | undefined;

    return row ? projectFromRow(row) : null;
  }

  async delete(id: string): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM projects WHERE id = ?');
    const info = stmt.run(id);
    return info.changes > 0;
  }

  async list(filter?: ProjectFilter): Promise<Project[]> {
    let query = 'SELECT * FROM projects WHERE 1=1';
    const params: any[] = [];

    if (filter) {
      if (filter.status) {
        query += ' AND status = ?';
        params.push(filter.status);
      }

      if (filter.phase) {
        query += ' AND current_phase = ?';
        params.push(filter.phase);
      }

      if (filter.name) {
        query += ' AND name LIKE ?';
        params.push(`%${filter.name}%`);
      }
    }

    query += ' ORDER BY created_at DESC';

    const rows = this.db.prepare(query).all(...params) as ProjectRow[];
    return rows.map(projectFromRow);
  }

  async updateStatus(id: string, status: string): Promise<void> {
    if (!isValidProjectStatus(status)) {
      throw new Error(`Invalid project status: ${status}`);
    }

    const stmt = this.db.prepare('UPDATE projects SET status = ? WHERE id = ?');
    const info = stmt.run(status, id);

    if (info.changes === 0) {
      throw new Error(`Project not found: ${id}`);
    }
  }
}