# Setting Up Agentic MCP Server with Claude Code

This guide explains how to add the agentic MCP server to Claude Code for use in your projects.

## Prerequisites

1. **Build the server** (if not already built):
   ```bash
   npm install
   npm run build
   ```

2. **Verify the server starts**:
   ```bash
   npm start
   # You should see the server start without errors
   # Press Ctrl+C to stop
   ```

## Adding to Claude Code

### Option 1: Local Development (Recommended for testing)

Add the server to Claude Code using the full path to your development directory:

```bash
# Navigate to your project where you want to use the MCP server
cd /path/to/your/project

# Add the MCP server (replace with your actual path)
claude mcp add agentic-mcp "node" "/home/projects/mini-agent-mcp/dist/server.js"
```

### Option 2: Global Installation

First, create a global npm package:

```bash
# In the mini-agent-mcp directory
npm link

# Now add to Claude Code from anywhere
claude mcp add agentic-mcp "npx" "agentic-mcp-server"
```

### Option 3: With Custom Settings

Add with specific environment variables:

```bash
claude mcp add agentic-mcp "node" "/path/to/mini-agent-mcp/dist/server.js" \
  -e MCP_DB_PATH=/tmp/agentic.db \
  -e MCP_FILE_SYNC_ENABLED=true \
  -e MCP_SPEC_DIR=.spec
```

## Verifying Installation

1. **List configured servers**:
   ```bash
   claude mcp list
   ```
   You should see `agentic-mcp` in the list.

2. **Check server details**:
   ```bash
   claude mcp get agentic-mcp
   ```

3. **Test in Claude Code**:
   Open Claude Code and try using one of the MCP tools:
   ```
   Use the spec_create tool to create a new project called "test-feature"
   ```

## Available MCP Tools

Once configured, you can use these tools in Claude Code:

### Core Tools
- `project_create` - Create a new project
- `task_progress` - Update task progress
- `context_save` - Save agent context
- `context_load` - Load agent context
- `workflow_handoff` - Hand off between phases
- `workflow_resume` - Resume interrupted workflow
- `task_query` - Query tasks

### Spec Workflow Tools
- `spec_create` - Create new spec with requirements
- `spec_design` - Generate design from requirements
- `spec_tasks` - Break design into tasks
- `spec_execute` - Execute implementation tasks

## Example Usage in Claude Code

After setup, you can interact with the tools naturally:

```
Create a new user authentication spec with requirements for secure login and password reset
```

Claude will use the `spec_create` tool automatically.

## Configuration Options

### Environment Variables

- `MCP_DB_PATH` - Database file location (default: `agentic-mcp.db`)
- `MCP_FILE_SYNC_ENABLED` - Enable/disable file sync (default: `true`)
- `MCP_SPEC_DIR` - Spec files directory (default: `.spec`)
- `MCP_PROJECTS_DIR` - Internal projects directory (default: `projects`)

### Scope Options

- `--scope local` - Available only in current directory (default)
- `--scope user` - Available in all your projects
- `--scope project` - Available to all users of current project

## Troubleshooting

### Server doesn't start
```bash
# Check for TypeScript errors
npm run build

# Check Node version (requires 18+)
node --version
```

### Tools not appearing
```bash
# Remove and re-add the server
claude mcp remove agentic-mcp
claude mcp add agentic-mcp "node" "/path/to/server.js"
```

### Database errors
```bash
# Check permissions on database file
ls -la agentic-mcp.db

# Try with a different database path
claude mcp add agentic-mcp "node" "/path/to/server.js" \
  -e MCP_DB_PATH=/tmp/test.db
```

## Removing the Server

If you need to remove the server:

```bash
claude mcp remove agentic-mcp
```

## Advanced: Using with Multiple Projects

To use different configurations per project:

```bash
# Project A - with file sync
cd /path/to/projectA
claude mcp add agentic-mcp "node" "/path/to/server.js" \
  --scope project \
  -e MCP_FILE_SYNC_ENABLED=true

# Project B - database only
cd /path/to/projectB  
claude mcp add agentic-mcp "node" "/path/to/server.js" \
  --scope project \
  -e MCP_FILE_SYNC_ENABLED=false
```