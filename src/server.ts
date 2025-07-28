import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import { ProjectRepository } from './repositories/ProjectRepository.js';
import { TaskRepository } from './repositories/TaskRepository.js';
import { AgentSessionRepository } from './repositories/AgentSessionRepository.js';
import { WorkflowRepository } from './repositories/WorkflowRepository.js';
import { FileSync } from './sync/FileSync.js';
import { SpecHandlers } from './handlers/spec-handlers.js';

/**
 * Minimal Agentic MCP Server - Focus on spec workflow
 */
export class AgenticMCPServer {
  private server: Server;
  private projectRepo: ProjectRepository;
  private taskRepo: TaskRepository;
  private agentSessionRepo: AgentSessionRepository;
  private workflowRepo: WorkflowRepository;
  private fileSync: FileSync;
  private specHandlers: SpecHandlers;

  constructor() {
    this.server = new Server(
      {
        name: 'agentic-mcp-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize repositories
    this.projectRepo = new ProjectRepository();
    this.taskRepo = new TaskRepository();
    this.agentSessionRepo = new AgentSessionRepository();
    this.workflowRepo = new WorkflowRepository();
    this.fileSync = new FileSync();
    
    // Initialize spec handlers
    this.specHandlers = new SpecHandlers(
      this.projectRepo,
      this.taskRepo,
      this.agentSessionRepo,
      this.fileSync
    );

    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.getTools()
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'spec_create':
            return { content: [{ type: 'text', text: JSON.stringify(await this.specHandlers.handleSpecCreate(args || {}), null, 2) }] };
          case 'spec_design':
            return { content: [{ type: 'text', text: JSON.stringify(await this.specHandlers.handleSpecDesign(args || {}), null, 2) }] };
          case 'spec_tasks':
            return { content: [{ type: 'text', text: JSON.stringify(await this.specHandlers.handleSpecTasks(args || {}), null, 2) }] };
          case 'spec_execute':
            return { content: [{ type: 'text', text: JSON.stringify(await this.specHandlers.handleSpecExecute(args || {}), null, 2) }] };
          case 'task_progress':
            return { content: [{ type: 'text', text: JSON.stringify(await this.handleTaskProgress(args || {}), null, 2) }] };
          case 'context_save':
            return { content: [{ type: 'text', text: JSON.stringify(await this.handleContextSave(args || {}), null, 2) }] };
          case 'task_query':
            return { content: [{ type: 'text', text: JSON.stringify(await this.handleTaskQuery(args || {}), null, 2) }] };
          case 'workflow_resume':
            return { content: [{ type: 'text', text: JSON.stringify(await this.handleWorkflowResume(args || {}), null, 2) }] };
          case 'context_load':
            return { content: [{ type: 'text', text: JSON.stringify(await this.handleContextLoad(args || {}), null, 2) }] };
          case 'workflow_handoff':
            return { content: [{ type: 'text', text: JSON.stringify(await this.handleWorkflowHandoff(args || {}), null, 2) }] };
          case 'project_create':
            return { content: [{ type: 'text', text: JSON.stringify(await this.handleProjectCreate(args || {}), null, 2) }] };
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(ErrorCode.InternalError, `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  private getTools(): Tool[] {
    return [
      {
        name: 'spec_create',
        description: 'Create a new feature specification with initial requirements',
        inputSchema: {
          type: 'object',
          properties: {
            featureName: { type: 'string', description: 'Feature name (kebab-case)' },
            description: { type: 'string', description: 'Brief feature description (optional)' }
          },
          required: ['featureName']
        }
      },
      {
        name: 'spec_design',
        description: 'Generate design document based on approved requirements',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'Project ID' }
          },
          required: ['projectId']
        }
      },
      {
        name: 'spec_tasks',
        description: 'Generate implementation task list based on approved design',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'Project ID' }
          },
          required: ['projectId']
        }
      },
      {
        name: 'spec_execute',
        description: 'Execute specific task from the approved task list',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'Project ID' },
            taskId: { type: 'string', description: 'Task ID to execute (optional - will suggest next if omitted)' }
          },
          required: ['projectId']
        }
      },
      {
        name: 'task_progress',
        description: 'Update task progress with detailed notes for the next agent',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Task ID' },
            status: { type: 'string', enum: ['started', 'in_progress', 'blocked', 'completed'], description: 'Task status' },
            notes: { type: 'string', description: 'Progress notes' },
            deliverables: { type: 'object', description: 'What this agent produced' },
            nextSteps: { type: 'string', description: 'Guidance for next agent' }
          },
          required: ['taskId', 'status', 'notes']
        }
      },
      {
        name: 'context_save',
        description: 'Save important context for the next agent working on this project',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'Project ID' },
            agentType: { type: 'string', description: 'Agent type' },
            context: { type: 'object', description: 'Context data to save' },
            summary: { type: 'string', description: 'Human-readable summary' }
          },
          required: ['projectId', 'agentType', 'context', 'summary']
        }
      },
      {
        name: 'task_query',
        description: 'Query tasks with various filters',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'Project ID (optional)' },
            status: { type: 'string', description: 'Task status filter' },
            assigneeType: { type: 'string', description: 'Assignee type filter' },
            phase: { type: 'string', description: 'Task phase filter' },
            includeHierarchy: { type: 'boolean', description: 'Include hierarchical task structure' }
          }
        }
      },
      {
        name: 'workflow_resume',
        description: 'Resume workflow from last checkpoint',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'Project ID' }
          },
          required: ['projectId']
        }
      },
      {
        name: 'context_load',
        description: 'Load all previous agent contexts for a project',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'Project ID' }
          },
          required: ['projectId']
        }
      },
      {
        name: 'workflow_handoff',
        description: 'Complete current phase and prepare handoff to next agent',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'Project ID' },
            currentPhase: { type: 'string', description: 'Current phase name' },
            phaseDeliverables: { type: 'object', description: 'Phase deliverables' },
            handoffNotes: { type: 'string', description: 'Handoff notes for next agent' },
            completedTasks: { 
              type: 'array', 
              items: { type: 'string' },
              description: 'List of completed task IDs (optional)' 
            }
          },
          required: ['projectId', 'currentPhase', 'phaseDeliverables', 'handoffNotes']
        }
      },
      {
        name: 'project_create',
        description: 'Create a new project with tracking',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Project name' },
            description: { type: 'string', description: 'Project description (optional)' }
          },
          required: ['name']
        }
      }
    ];
  }

  private async handleTaskProgress(args: Record<string, any>): Promise<any> {
    const { taskId, status, notes } = args;
    
    await this.taskRepo.update(taskId, {
      status: status === 'started' ? 'in_progress' : status,
      assigneeType: 'implementation' as const,
    });

    return {
      success: true,
      taskId,
      status,
      notes,
      message: 'Task progress updated successfully'
    };
  }

  private async handleContextSave(args: Record<string, any>): Promise<any> {
    const { projectId, agentType, context, summary } = args;

    const session = await this.agentSessionRepo.create({
      projectId,
      agentType: agentType as 'requirements' | 'design' | 'tasks' | 'implementation',
      contextData: context,
    });

    return {
      success: true,
      session: {
        id: session.id,
        projectId: session.projectId,
        agentType: session.agentType,
        summary
      }
    };
  }

  private async handleTaskQuery(args: Record<string, any>): Promise<any> {
    const { projectId, status } = args;
    
    const tasks = projectId 
      ? await this.taskRepo.findByProject(projectId, status ? { status } : {})
      : [];

    return {
      success: true,
      tasks: tasks.map(task => ({
        id: task.id,
        title: task.title,
        status: task.status,
        projectId: task.projectId
      }))
    };
  }

  private async handleWorkflowResume(args: Record<string, any>): Promise<any> {
    const { projectId } = args;
    
    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      throw new McpError(ErrorCode.InvalidParams, `Project not found: ${projectId}`);
    }

    return {
      success: true,
      project: {
        id: project.id,
        name: project.name,
        currentPhase: project.currentPhase,
        status: project.status
      },
      message: 'Workflow resumed successfully'
    };
  }

  private async handleContextLoad(args: Record<string, any>): Promise<any> {
    const { projectId } = args;

    if (!projectId || typeof projectId !== 'string') {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Project ID is required and must be a string'
      );
    }

    try {
      // Check if project exists
      const project = await this.projectRepo.findById(projectId);
      if (!project) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Project not found: ${projectId}`
        );
      }

      // Get all agent sessions for the project
      const sessions = await this.agentSessionRepo.findByProject(projectId);

      // Build context map
      const contexts: Record<string, any> = {};
      for (const session of sessions) {
        contexts[session.agentType] = session.contextData;
      }

      return {
        success: true,
        project: {
          id: project.id,
          name: project.name,
          currentPhase: project.currentPhase,
        },
        contexts,
        sessions: sessions.map(s => ({
          id: s.id,
          agentType: s.agentType,
          lastActive: s.lastActive.toISOString(),
          hasContext: Object.keys(s.contextData).length > 0,
        })),
        message: `Loaded ${sessions.length} agent contexts`
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to load contexts: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async handleWorkflowHandoff(args: Record<string, any>): Promise<any> {
    const { projectId, currentPhase, phaseDeliverables, handoffNotes } = args;

    // Validate required fields
    if (!projectId || typeof projectId !== 'string') {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Project ID is required and must be a string'
      );
    }

    if (!currentPhase || typeof currentPhase !== 'string') {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Current phase is required and must be a string'
      );
    }

    if (!phaseDeliverables || typeof phaseDeliverables !== 'object') {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Phase deliverables are required and must be an object'
      );
    }

    if (!handoffNotes || typeof handoffNotes !== 'string') {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Handoff notes are required and must be a string'
      );
    }

    try {
      // Check if project exists
      const project = await this.projectRepo.findById(projectId);
      if (!project) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Project not found: ${projectId}`
        );
      }

      // Create workflow checkpoint
      const checkpoint = await this.workflowRepo.createCheckpoint(projectId, currentPhase);

      // Determine next phase
      const phaseOrder = ['requirements', 'design', 'tasks', 'execute'];
      const currentIndex = phaseOrder.indexOf(currentPhase);
      const nextPhase = currentIndex < phaseOrder.length - 1 
        ? phaseOrder[currentIndex + 1] 
        : 'complete';

      // Update project phase if not complete
      if (nextPhase !== 'complete') {
        await this.projectRepo.update(projectId, {
          currentPhase: nextPhase as any,
        });
      }

      // Create handoff document if sync is enabled
      if (this.fileSync.isEnabled) {
        await this.fileSync.completePhase(projectId, {
          phase: currentPhase,
          deliverables: phaseDeliverables,
          handoffNotes: handoffNotes,
        });
      }

      return {
        success: true,
        checkpoint: {
          id: checkpoint.id,
          phase: checkpoint.phase,
          createdAt: checkpoint.createdAt.toISOString(),
        },
        handoff: {
          fromPhase: currentPhase,
          toPhase: nextPhase,
          deliverables: phaseDeliverables,
          notes: handoffNotes,
        },
        project: {
          id: project.id,
          name: project.name,
          currentPhase: nextPhase,
        },
        message: `Phase '${currentPhase}' completed. ${nextPhase === 'complete' ? 'Project complete!' : `Ready for '${nextPhase}' phase.`}`
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to complete handoff: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async handleProjectCreate(args: Record<string, any>): Promise<any> {
    const { name, description } = args;
    
    if (!name || typeof name !== 'string') {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Project name is required and must be a string'
      );
    }

    try {
      const project = await this.projectRepo.create({
        name,
        description: description || undefined,
      });

      // Create file structure if sync is enabled
      if (this.fileSync.isEnabled) {
        await this.fileSync.createProjectFiles(project.id, project.name, project.description || undefined);
      }

      return {
        success: true,
        project: {
          id: project.id,
          name: project.name,
          description: project.description,
          status: project.status,
          currentPhase: project.currentPhase,
          createdAt: project.createdAt.toISOString(),
          projectPath: this.fileSync.isEnabled ? this.fileSync.getProjectPath(project.id) : null,
        },
        message: `Project '${project.name}' created successfully`,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Project with name '${name}' already exists`
        );
      }
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to create project: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Agentic MCP Server running on stdio');
  }
}

// Start the server if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new AgenticMCPServer();
  server.run().catch(console.error);
}