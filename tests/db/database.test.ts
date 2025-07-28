import { DatabaseConnection } from '../../src/db/database';
import Database from 'better-sqlite3';
import { existsSync, unlinkSync } from 'fs';

describe('DatabaseConnection', () => {
  const testDbPath = 'test-agentic-mcp.db';
  
  beforeAll(() => {
    // Set test database path
    process.env.MCP_DB_PATH = testDbPath;
  });

  afterAll(() => {
    // Clean up
    DatabaseConnection.close();
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
    if (existsSync(testDbPath + '-wal')) {
      unlinkSync(testDbPath + '-wal');
    }
    if (existsSync(testDbPath + '-shm')) {
      unlinkSync(testDbPath + '-shm');
    }
    delete process.env.MCP_DB_PATH;
  });

  test('should create singleton instance', () => {
    const db1 = DatabaseConnection.getInstance();
    const db2 = DatabaseConnection.getInstance();
    
    expect(db1).toBe(db2);
    expect(db1).toBeInstanceOf(Database);
  });

  test('should initialize schema on first connection', () => {
    const db = DatabaseConnection.getInstance();
    
    // Check that all tables exist
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as { name: string }[];
    
    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain('projects');
    expect(tableNames).toContain('tasks');
    expect(tableNames).toContain('agent_sessions');
    expect(tableNames).toContain('workflow_checkpoints');
  });

  test('should enable foreign keys', () => {
    const db = DatabaseConnection.getInstance();
    const result = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
    
    expect(result.foreign_keys).toBe(1);
  });

  test('should use WAL journal mode', () => {
    const db = DatabaseConnection.getInstance();
    const result = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
    
    expect(result.journal_mode).toBe('wal');
  });

  test('should create projects with auto-generated ID', () => {
    const db = DatabaseConnection.getInstance();
    
    const stmt = db.prepare('INSERT INTO projects (name, description) VALUES (?, ?)');
    const info = stmt.run('Test Project', 'Test Description');
    
    expect(info.changes).toBe(1);
    
    const project = db.prepare('SELECT * FROM projects WHERE name = ?').get('Test Project') as any;
    expect(project).toBeDefined();
    expect(project.id).toMatch(/^[a-f0-9]{32}$/); // 32 hex characters
    expect(project.status).toBe('active');
    expect(project.current_phase).toBe('requirements');
  });

  test('should enforce foreign key constraints', () => {
    const db = DatabaseConnection.getInstance();
    
    // Try to insert a task with non-existent project_id
    const stmt = db.prepare('INSERT INTO tasks (project_id, title, phase) VALUES (?, ?, ?)');
    
    expect(() => {
      stmt.run('non-existent-id', 'Test Task', 'requirements');
    }).toThrow(/FOREIGN KEY constraint failed/);
  });

  test('should support transactions', () => {
    const result = DatabaseConnection.transaction((db) => {
      const project = db.prepare('INSERT INTO projects (name) VALUES (?)').run('Transaction Test');
      const task = db.prepare('INSERT INTO tasks (project_id, title, phase) VALUES ((SELECT id FROM projects WHERE name = ?), ?, ?)')
        .run('Transaction Test', 'Task 1', 'requirements');
      
      return { projectChanges: project.changes, taskChanges: task.changes };
    });
    
    expect(result.projectChanges).toBe(1);
    expect(result.taskChanges).toBe(1);
  });

  test('should handle migrations table', async () => {
    await DatabaseConnection.runMigrations();
    
    const db = DatabaseConnection.getInstance();
    const migrations = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'"
    ).get();
    
    expect(migrations).toBeDefined();
  });

  test('should update timestamps on record update', (done) => {
    const db = DatabaseConnection.getInstance();
    
    // Insert a project
    db.prepare('INSERT INTO projects (name) VALUES (?)').run('Timestamp Test');
    
    const project1 = db.prepare('SELECT * FROM projects WHERE name = ?').get('Timestamp Test') as any;
    const initialTimestamp = project1.updated_at;
    
    // Wait a bit and update
    setTimeout(() => {
      db.prepare('UPDATE projects SET description = ? WHERE name = ?').run('Updated', 'Timestamp Test');
      
      const project2 = db.prepare('SELECT * FROM projects WHERE name = ?').get('Timestamp Test') as any;
      expect(project2.updated_at).not.toBe(initialTimestamp);
      done();
    }, 100);
  });
});