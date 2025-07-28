export interface Migration {
  version: string;
  description: string;
  sql: string;
}

/**
 * Future migrations would be added here
 * Example:
 * {
 *   version: '001_add_task_metadata',
 *   description: 'Add metadata column to tasks table',
 *   sql: 'ALTER TABLE tasks ADD COLUMN metadata TEXT;'
 * }
 */
export const migrations: Migration[] = [];