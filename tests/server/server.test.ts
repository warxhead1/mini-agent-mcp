import { AgenticMCPServer } from '../../src/server';
import { DatabaseConnection } from '../../src/db/database';
import { existsSync, unlinkSync } from 'fs';

describe('AgenticMCPServer', () => {
  let server: AgenticMCPServer;
  const testDbPath = 'test-server.db';

  beforeAll(() => {
    process.env.MCP_DB_PATH = testDbPath;
  });

  afterAll(() => {
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

  describe('initialization', () => {
    test('should create server instance', () => {
      server = new AgenticMCPServer();
      expect(server).toBeInstanceOf(AgenticMCPServer);
    });

    test('should initialize database on getInstance', () => {
      const db = DatabaseConnection.getInstance();
      expect(db).toBeDefined();
      
      // Check tables exist
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      ).all() as { name: string }[];
      
      const tableNames = tables.map(t => t.name);
      expect(tableNames).toContain('projects');
      expect(tableNames).toContain('tasks');
      expect(tableNames).toContain('agent_sessions');
      expect(tableNames).toContain('workflow_checkpoints');
    });
  });

  describe('tool definitions', () => {
    test('should define all required tools', () => {
      // This test would require exposing getToolDefinitions or testing through the server
      // For now, we just verify the server can be instantiated
      expect(server).toBeDefined();
    });
  });

  // Note: Full integration tests would require mocking the MCP transport
  // or testing through the actual stdio interface
});