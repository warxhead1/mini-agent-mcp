/**
 * Core types for the Agentic MCP Server
 */

// Project types
export type ProjectStatus = 'active' | 'paused' | 'completed';
export type ProjectPhase = 'requirements' | 'design' | 'tasks' | 'execute';

export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  currentPhase: ProjectPhase;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectFilter {
  status?: ProjectStatus;
  phase?: ProjectPhase;
  name?: string;
}

// Task types
export type TaskStatus = 'pending' | 'in_progress' | 'blocked' | 'completed';
export type TaskPhase = 'requirements' | 'design' | 'tasks' | 'execute';

export interface Task {
  id: string;
  projectId: string;
  parentId?: string;
  title: string;
  description: string | null;
  phase: TaskPhase;
  status: TaskStatus;
  assigneeType?: string;
  priority: number;
  requirementsRefs: string[];
  dependencies: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskFilter {
  projectId?: string;
  status?: TaskStatus;
  phase?: TaskPhase;
  assigneeType?: string;
  parentId?: string | null;
}

export interface TaskNode extends Task {
  children: TaskNode[];
}

// Agent types
export type AgentType = 'requirements' | 'design' | 'tasks' | 'implementation';

export interface AgentSession {
  id: string;
  projectId: string;
  taskId?: string;
  agentType: AgentType;
  contextData: Record<string, any>;
  lastActive: Date;
}

// Workflow types
export interface WorkflowCheckpoint {
  id: string;
  projectId: string;
  phase: string;
  checkpointData: {
    completedTasks: string[];
    currentTask?: string;
    phaseDeliverables: Record<string, any>;
  };
  createdAt: Date;
}

export interface WorkflowState {
  project: Project;
  currentPhase: ProjectPhase;
  checkpoint: WorkflowCheckpoint | null;
  pendingTasks: Task[];
  completedTasks: Task[];
}

// MCP types
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  handler: (params: any) => Promise<any>;
}

export interface MCPRequest {
  method: string;
  params?: any;
  id?: string | number;
}

export interface MCPResponse {
  result?: any;
  error?: MCPError;
  id?: string | number;
}

export interface MCPError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

// File sync types
export interface AgentUpdate {
  timestamp: Date;
  status: TaskStatus;
  notes: string;
  deliverables?: Record<string, any>;
  nextSteps?: string;
}

export interface PhaseCompletion {
  phase: string;
  deliverables: Record<string, any>;
  handoffNotes: string;
}

// Validation helpers
export function isValidProjectStatus(status: string): status is ProjectStatus {
  return ['active', 'paused', 'completed'].includes(status);
}

export function isValidProjectPhase(phase: string): phase is ProjectPhase {
  return ['requirements', 'design', 'tasks', 'execute'].includes(phase);
}

export function isValidTaskStatus(status: string): status is TaskStatus {
  return ['pending', 'in_progress', 'blocked', 'completed'].includes(status);
}

export function isValidTaskPhase(phase: string): phase is TaskPhase {
  return ['requirements', 'design', 'tasks', 'execute'].includes(phase);
}

export function isValidAgentType(type: string): type is AgentType {
  return ['requirements', 'design', 'tasks', 'implementation'].includes(type);
}

// JSON parsing helpers
export function parseJsonArray(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function parseJsonObject(json: string | null): Record<string, any> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// Database row type mappings
export interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  current_phase: string;
  created_at: string;
  updated_at: string;
}

export interface TaskRow {
  id: string;
  project_id: string;
  parent_id: string | null;
  title: string;
  description: string | null;
  phase: string;
  status: string;
  assignee_type: string | null;
  priority: number;
  requirements_refs: string | null;
  dependencies: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentSessionRow {
  id: string;
  project_id: string;
  task_id: string | null;
  agent_type: string;
  context_data: string | null;
  last_active: string;
}

export interface WorkflowCheckpointRow {
  id: string;
  project_id: string;
  phase: string;
  checkpoint_data: string;
  created_at: string;
}

// Converter functions
export function projectFromRow(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status as ProjectStatus,
    currentPhase: row.current_phase as ProjectPhase,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function taskFromRow(row: TaskRow): Task {
  return {
    id: row.id,
    projectId: row.project_id,
    parentId: row.parent_id || undefined,
    title: row.title,
    description: row.description,
    phase: row.phase as TaskPhase,
    status: row.status as TaskStatus,
    assigneeType: row.assignee_type || undefined,
    priority: row.priority,
    requirementsRefs: parseJsonArray(row.requirements_refs),
    dependencies: parseJsonArray(row.dependencies),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function agentSessionFromRow(row: AgentSessionRow): AgentSession {
  return {
    id: row.id,
    projectId: row.project_id,
    taskId: row.task_id || undefined,
    agentType: row.agent_type as AgentType,
    contextData: parseJsonObject(row.context_data),
    lastActive: new Date(row.last_active),
  };
}

export function workflowCheckpointFromRow(row: WorkflowCheckpointRow): WorkflowCheckpoint {
  return {
    id: row.id,
    projectId: row.project_id,
    phase: row.phase,
    checkpointData: parseJsonObject(row.checkpoint_data) as WorkflowCheckpoint['checkpointData'],
    createdAt: new Date(row.created_at),
  };
}