import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { PerformanceConfig, getOptimizedDbOptions } from '../config/performance.js';

// Handle __dirname for both ESM and CommonJS environments
let __dirname: string;
try {
  if (typeof import.meta !== 'undefined') {
    __dirname = dirname(fileURLToPath(import.meta.url));
  } else {
    // Fallback for test environment
    __dirname = join(process.cwd(), 'src', 'db');
  }
} catch {
  __dirname = join(process.cwd(), 'src', 'db');
}

export class DatabaseConnection {
  private static instance: Database.Database | null = null;
  private static readonly DB_PATH = process.env.MCP_DB_PATH || '.spec/agentic-mcp.db';

  private constructor() {}

  /**
   * Get singleton database instance with performance optimizations
   */
  static getInstance(): Database.Database {
    if (!this.instance) {
      // Ensure .spec directory exists
      const dbDir = dirname(this.DB_PATH);
      mkdirSync(dbDir, { recursive: true });
      
      this.instance = new Database(this.DB_PATH, getOptimizedDbOptions());
      
      // Apply performance optimizations
      PerformanceConfig.database.pragmas.forEach(pragma => {
        try {
          this.instance!.pragma(pragma.replace('PRAGMA ', ''));
        } catch (err) {
          // Some pragmas might not be available in all SQLite versions
          if (process.env.NODE_ENV !== 'production') {
            console.warn(`Failed to apply pragma: ${pragma}`, err);
          }
        }
      });
      
      this.initializeSchema();
    }
    return this.instance;
  }

  /**
   * Initialize database schema if tables don't exist
   */
  private static initializeSchema(): void {
    const db = this.instance!;
    
    // Check if schema is already initialized
    const tableCount = db.prepare(
      "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name IN ('projects', 'tasks', 'agent_sessions', 'workflow_checkpoints')"
    ).get() as { count: number };

    if (tableCount.count < 4) {
      console.log('Initializing database schema...');
      const schema = readFileSync(join(__dirname, 'init.sql'), 'utf-8');
      db.exec(schema);
      console.log('Database schema initialized successfully');
    }
  }

  /**
   * Close database connection
   */
  static close(): void {
    if (this.instance) {
      this.instance.close();
      this.instance = null;
    }
  }

  /**
   * Run migrations if needed (for future updates)
   */
  static async runMigrations(): Promise<void> {
    const db = this.getInstance();
    
    // Create migrations table if it doesn't exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT NOT NULL UNIQUE,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Future migrations would be applied here
    // Example:
    // const appliedMigrations = db.prepare('SELECT version FROM migrations').all();
    // for (const migration of pendingMigrations) {
    //   if (!appliedMigrations.find(m => m.version === migration.version)) {
    //     db.exec(migration.sql);
    //     db.prepare('INSERT INTO migrations (version) VALUES (?)').run(migration.version);
    //   }
    // }
  }

  /**
   * Helper to run database operations in a transaction
   */
  static transaction<T>(fn: (db: Database.Database) => T): T {
    const db = this.getInstance();
    return db.transaction(fn)(db);
  }
}