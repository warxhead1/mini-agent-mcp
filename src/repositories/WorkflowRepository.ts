import { BaseRepository } from './BaseRepository.js';
import {
  WorkflowCheckpoint,
  WorkflowCheckpointRow,
  WorkflowState,
  workflowCheckpointFromRow
} from '../types/index.js';
import { ProjectRepository } from './ProjectRepository.js';
import { TaskRepository } from './TaskRepository.js';

export class WorkflowRepository extends BaseRepository<WorkflowCheckpoint> {
  private projectRepo: ProjectRepository;
  private taskRepo: TaskRepository;

  constructor() {
    super();
    this.projectRepo = new ProjectRepository();
    this.taskRepo = new TaskRepository();
  }

  async create(item: Partial<WorkflowCheckpoint>): Promise<WorkflowCheckpoint> {
    if (!item.projectId || !item.phase || !item.checkpointData) {
      throw new Error('WorkflowCheckpoint projectId, phase, and checkpointData are required');
    }

    const stmt = this.db.prepare(`
      INSERT INTO workflow_checkpoints (project_id, phase, checkpoint_data)
      VALUES (?, ?, ?)
    `);

    const info = stmt.run(
      item.projectId,
      item.phase,
      JSON.stringify(item.checkpointData)
    );

    if (info.changes === 0) {
      throw new Error('Failed to create workflow checkpoint');
    }

    const row = this.db.prepare('SELECT * FROM workflow_checkpoints WHERE rowid = ?')
      .get(info.lastInsertRowid) as WorkflowCheckpointRow;

    return workflowCheckpointFromRow(row);
  }

  async update(_id: string, _updates: Partial<WorkflowCheckpoint>): Promise<WorkflowCheckpoint | null> {
    // Workflow checkpoints are immutable - we don't update them
    throw new Error('Workflow checkpoints cannot be updated');
  }

  async findById(id: string): Promise<WorkflowCheckpoint | null> {
    const row = this.db.prepare('SELECT * FROM workflow_checkpoints WHERE id = ?')
      .get(id) as WorkflowCheckpointRow | undefined;

    return row ? workflowCheckpointFromRow(row) : null;
  }

  async delete(id: string): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM workflow_checkpoints WHERE id = ?');
    const info = stmt.run(id);
    return info.changes > 0;
  }

  async createCheckpoint(projectId: string, phase: string): Promise<WorkflowCheckpoint> {
    // Get completed tasks for this phase
    const completedTasks = await this.taskRepo.findByProject(projectId, {
      phase: phase as any,
      status: 'completed'
    });

    // Get current in-progress task
    const inProgressTasks = await this.taskRepo.findByProject(projectId, {
      phase: phase as any,
      status: 'in_progress'
    });

    const checkpointData = {
      completedTasks: completedTasks.map(t => t.id),
      currentTask: inProgressTasks.length > 0 ? inProgressTasks[0].id : undefined,
      phaseDeliverables: {} // This would be populated by the calling code
    };

    return this.create({
      projectId,
      phase,
      checkpointData
    });
  }

  async getLatestCheckpoint(projectId: string): Promise<WorkflowCheckpoint | null> {
    const row = this.db.prepare(`
      SELECT * FROM workflow_checkpoints 
      WHERE project_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(projectId) as WorkflowCheckpointRow | undefined;

    return row ? workflowCheckpointFromRow(row) : null;
  }

  async getCheckpointsByPhase(projectId: string, phase: string): Promise<WorkflowCheckpoint[]> {
    const rows = this.db.prepare(`
      SELECT * FROM workflow_checkpoints 
      WHERE project_id = ? AND phase = ?
      ORDER BY created_at DESC
    `).all(projectId, phase) as WorkflowCheckpointRow[];

    return rows.map(workflowCheckpointFromRow);
  }

  async getCheckpoints(projectId: string): Promise<WorkflowCheckpoint[]> {
    const rows = this.db.prepare(`
      SELECT * FROM workflow_checkpoints 
      WHERE project_id = ?
      ORDER BY created_at ASC
    `).all(projectId) as WorkflowCheckpointRow[];

    return rows.map(workflowCheckpointFromRow);
  }

  async resumeWorkflow(projectId: string): Promise<WorkflowState> {
    // Get the project
    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    // Get latest checkpoint
    const checkpoint = await this.getLatestCheckpoint(projectId);

    // Get all tasks for the current phase
    const allTasks = await this.taskRepo.findByProject(projectId, {
      phase: project.currentPhase
    });

    // Separate completed and pending tasks
    const completedTasks = allTasks.filter(t => t.status === 'completed');
    const pendingTasks = allTasks.filter(t => t.status !== 'completed');

    return {
      project,
      currentPhase: project.currentPhase,
      checkpoint,
      pendingTasks,
      completedTasks
    };
  }

  async deleteProjectCheckpoints(projectId: string): Promise<number> {
    const stmt = this.db.prepare('DELETE FROM workflow_checkpoints WHERE project_id = ?');
    const info = stmt.run(projectId);
    return info.changes;
  }
}