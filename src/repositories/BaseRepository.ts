import Database from 'better-sqlite3';
import { DatabaseConnection } from '../db/database.js';

/**
 * Base repository class providing common database operations
 */
export abstract class BaseRepository<T> {
  protected db: Database.Database;

  constructor() {
    this.db = DatabaseConnection.getInstance();
  }

  /**
   * Run a database operation within a transaction
   */
  protected transaction<R>(fn: (db: Database.Database) => R): R {
    return DatabaseConnection.transaction(fn);
  }

  /**
   * Generate a new unique ID (32 char hex string)
   */
  protected generateId(): string {
    // This will be handled by SQLite default value, but useful for tests
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  abstract create(item: Partial<T>): Promise<T>;
  abstract update(id: string, updates: Partial<T>): Promise<T | null>;
  abstract findById(id: string): Promise<T | null>;
  abstract delete(id: string): Promise<boolean>;
}