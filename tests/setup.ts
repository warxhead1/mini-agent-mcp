// Global test setup
beforeAll(() => {
  // Ensure we're using test environment
  if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = 'test';
  }
  
  // Disable file sync by default in tests to avoid filesystem pollution
  process.env.MCP_FILE_SYNC_ENABLED = 'false';
});

// Cleanup after all tests
afterAll(() => {
  // Clean up any global state
  delete process.env.MCP_DB_PATH;
  delete process.env.MCP_FILE_SYNC_ENABLED;
});