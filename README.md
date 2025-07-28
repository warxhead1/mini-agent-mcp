# Agentic MCP Server

A lightweight TypeScript/Node.js Model Context Protocol (MCP) server that provides persistent task management and workflow coordination for spec-driven development. This server enables isolated sub-agents to coordinate through structured updates and resumable workflows.

## Overview

The Agentic MCP Server acts as a "glorified agentic kanban board" that:
- ✅ Provides MCP tools for task tracking and agent coordination
- ✅ Maintains SQLite persistence with human-readable markdown files  
- ✅ Enables resumable workflows across sessions
- ✅ Supports complete spec-driven development workflow
- ✅ Allows isolated sub-agents to communicate through structured updates

**This is a pure toolset server with no AI capabilities** - it simply provides coordination tools for agents.

## Features

### Core MCP Tools
- `project_create` - Create and track projects
- `task_progress` - Update task status with detailed notes
- `context_save/load` - Preserve agent context between sessions
- `workflow_handoff` - Manage phase transitions
- `workflow_resume` - Resume interrupted workflows
- `task_query` - Query and filter tasks

### Complete Spec Workflow Tools  
- `spec_create` - Create projects with requirements generation
- `spec_design` - Generate design documents from requirements
- `spec_tasks` - Break design into implementation tasks
- `spec_execute` - Execute specific tasks from task list

### File System Integration
- Dual persistence: SQLite for queries + Markdown for readability
- Optional `.spec/` directory for user-editable spec files
- Project file structure with agent updates and handoff documents
- Automatic file synchronization and monitoring

## Quick Setup

1. **Clone and build:**
```bash
git clone <repository-url>
cd mini-agent-mcp
npm install
npm run build
```

2. **Add to Claude Code:**

**Command line:**
```bash
# From this repository directory
claude mcp add agentic-mcp "node" "$(pwd)/dist/server.js"

# Or with absolute path
claude mcp add agentic-mcp "node" "/path/to/mini-agent-mcp/dist/server.js"
```

**Project-specific (recommended):**
Create a `.mcp.json` file in your project root:
```json
{
  "mcpServers": {
    "agentic-mcp": {
      "command": "node",
      "args": ["/path/to/mini-agent-mcp/dist/server.js"],
      "transport": "stdio"
    }
  }
}
```

Then enable it in your project:
```bash
claude mcp list  # Should show agentic-mcp as available
```

That's it! The server provides spec-driven development tools for Claude Code.

## Quick Start

### 1. Basic Project Creation
```typescript
// Create a new project
const project = await mcp.use('project_create', {
  name: 'my-project',
  description: 'A sample project for testing'
});
```

### 2. Complete Spec Workflow
```typescript
// Step 1: Create spec with requirements
const createResult = await mcp.use('spec_create', {
  featureName: 'user-authentication',
  description: 'Secure user authentication system'
});

// Step 2: Generate design from requirements  
const designResult = await mcp.use('spec_design', {
  projectId: createResult.project.id
});

// Step 3: Break design into tasks
const tasksResult = await mcp.use('spec_tasks', {
  projectId: createResult.project.id
});

// Step 4: Execute tasks
const executeResult = await mcp.use('spec_execute', {
  projectId: createResult.project.id
  // Automatically picks next pending task
});
```

### 3. Task Progress Tracking
```typescript
// Update task progress with agent notes
await mcp.use('task_progress', {
  taskId: 'task-id',
  status: 'in_progress',
  notes: 'Started implementation of user registration',
  deliverables: { files: ['auth/register.ts'] },
  nextSteps: 'Add input validation and tests'
});
```

### 4. Workflow Resume
```typescript
// Resume interrupted workflow
const resumeState = await mcp.use('workflow_resume', {
  projectId: 'project-id'
});
// Returns: project, checkpoint, allTasks, activeSessions
```

## MCP Tools Reference

### Project Management

#### `project_create`
Create a new project with tracking.

**Parameters:**
- `name` (string, required) - Project name
- `description` (string, optional) - Project description

**Returns:** Project object with ID, timestamps, and initial state

#### `task_query` 
Query and filter tasks across projects.

**Parameters:**
- `projectId` (string, optional) - Filter by project
- `status` (string, optional) - Filter by status: 'pending', 'in_progress', 'blocked', 'completed'
- `phase` (string, optional) - Filter by phase: 'requirements', 'design', 'tasks', 'execute'
- `assigneeType` (string, optional) - Filter by agent type

**Returns:** Array of matching tasks with metadata

### Task Management

#### `task_progress`
Update task progress with detailed agent notes.

**Parameters:**
- `taskId` (string, required) - Task identifier
- `status` (string, required) - New status
- `notes` (string, required) - Progress notes for next agent
- `deliverables` (object, optional) - What this agent produced
- `nextSteps` (string, optional) - Guidance for next agent

**Returns:** Success confirmation

### Context Management

#### `context_save`
Save important context for next agent working on project.

**Parameters:**
- `projectId` (string, required) - Project identifier
- `agentType` (string, required) - Agent type: 'requirements', 'design', 'tasks', 'implementation'
- `context` (object, required) - Context data to preserve
- `summary` (string, required) - Human-readable summary

**Returns:** Success confirmation

#### `context_load`
Load all previous agent contexts for a project.

**Parameters:**
- `projectId` (string, required) - Project identifier

**Returns:** All contexts and markdown history for the project

### Workflow Management

#### `workflow_handoff`
Complete current phase and prepare handoff to next agent.

**Parameters:**
- `projectId` (string, required) - Project identifier
- `currentPhase` (string, required) - Current workflow phase
- `completedTasks` (array, optional) - List of completed task IDs
- `phaseDeliverables` (object, required) - Deliverables from this phase
- `handoffNotes` (string, required) - Notes for next agent

**Returns:** Success confirmation

#### `workflow_resume`
Resume workflow from last checkpoint.

**Parameters:**
- `projectId` (string, required) - Project identifier

**Returns:** Complete workflow state including project, checkpoint, tasks, and sessions

### Spec Workflow Tools

#### `spec_create`
Create a new feature specification with initial requirements.

**Parameters:**
- `featureName` (string, required) - Feature name in kebab-case
- `description` (string, optional) - Feature description

**Returns:** Project object, generated requirements, and spec directory path

#### `spec_design`
Generate design document based on approved requirements.

**Parameters:**
- `projectId` (string, required) - Project identifier

**Returns:** Generated design document with approval flag

#### `spec_tasks`
Generate implementation task list based on approved design.

**Parameters:**
- `projectId` (string, required) - Project identifier

**Returns:** Task count and list of created task IDs

#### `spec_execute`
Execute specific task from the approved task list.

**Parameters:**
- `projectId` (string, required) - Project identifier
- `taskId` (string, optional) - Specific task ID (picks next pending if omitted)

**Returns:** Task details, context from previous phases, and progress information

## File Structure

The server creates and manages two directory structures:

### `.spec/` Directory (User-Editable)
```
.spec/
├── agentic-mcp.db     # SQLite database
└── {feature-name}/
    ├── requirements.md # Generated by spec_create
    ├── design.md      # Generated by spec_design  
    └── tasks.md       # Generated by spec_tasks
```

### Internal Project Tracking
```
projects/{feature-name}/
├── README.md                        # Project overview
├── requirements.md                  # Requirements agent output
├── design.md                       # Design agent output
├── tasks.md                        # Task planning agent output
├── implementation/                  # Implementation tracking
│   └── task-{id}.md                # Individual task progress
└── handoffs/                       # Inter-agent communication
    ├── requirements-to-design.md
    ├── design-to-tasks.md
    └── tasks-to-implementation.md
```

## Configuration

The server works out of the box with sensible defaults. It creates a `.spec/` directory in your project containing the SQLite database and generated spec files, plus a `projects/` directory for internal tracking.

## Agent Coordination Pattern

The server enables isolated sub-agents to coordinate through these patterns:

### 1. Agent Isolation
- Each agent operates in complete isolation
- No shared memory between agents
- All communication through MCP tools

### 2. Structured Handoffs
```typescript
// Agent completes work and hands off
await mcp.use('workflow_handoff', {
  projectId: 'proj-123',
  currentPhase: 'requirements',
  phaseDeliverables: { requirements: './requirements.md' },
  handoffNotes: 'Requirements complete. Ready for design phase.'
});

// Next agent resumes workflow
const state = await mcp.use('workflow_resume', {
  projectId: 'proj-123'
});
```

### 3. Context Preservation
```typescript
// Save important context for future agents
await mcp.use('context_save', {
  projectId: 'proj-123',
  agentType: 'requirements',
  context: { totalFeatures: 5, priority: 'high' },
  summary: 'Identified 5 high-priority features'
});

// Load all previous context
const contexts = await mcp.use('context_load', {
  projectId: 'proj-123'
});
```

## Development

### Running Tests
```bash
# Run all tests
npm test

# Run specific test categories
npm test -- --testPathPattern=types
npm test -- --testPathPattern=repositories
npm test -- --testPathPattern=e2e
```

### Building
```bash
# Build TypeScript to JavaScript
npm run build

# Development mode with auto-rebuild
npm run dev
```

### Database Management
```bash
# View database schema
sqlite3 agentic-mcp.db ".schema"

# Check data
sqlite3 agentic-mcp.db "SELECT * FROM projects;"
```

## Architecture Details

### Core Principles
1. **Agent Isolation** - Agents communicate only through MCP tools
2. **Dual Persistence** - SQLite for queries, Markdown for readability
3. **Workflow Resumability** - Any workflow can be resumed from interruption
4. **Minimal Dependencies** - Only essential packages included
5. **Lightweight Operation** - Fast startup, minimal resource usage

### Key Components
- **MCP Server** - Exposes tools via Model Context Protocol
- **Repository Layer** - Data access abstraction over SQLite
- **File Sync** - Maintains markdown files synchronized with database
- **Workflow Manager** - Handles checkpoints and phase transitions
- **Spec Monitor** - Watches for external file changes

## Troubleshooting

### Common Issues

- **Database locked error**: Stop other server instances and restart
- **MCP tools not found**: Verify the server path in your Claude Code config
- **File sync issues**: Check directory permissions for `.spec/` and `projects/`

For detailed debugging, check the console output when running the server.

## Contributing

### Code Style
- Follow existing TypeScript patterns
- Use meaningful variable names
- Add JSDoc comments for public APIs
- Include error handling for all operations

### Testing Requirements
- Unit tests for all repository methods
- Integration tests for MCP tool handlers  
- End-to-end tests for complete workflows
- Error scenario testing

### Pull Request Process
1. Fork the repository
2. Create feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Update documentation
6. Submit pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
- GitHub Issues: [Report bugs and feature requests]
- Documentation: This README and inline code comments
- Examples: See `examples/` directory for usage patterns