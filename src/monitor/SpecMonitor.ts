import { watch, FSWatcher } from 'fs';
import { promises as fs } from 'fs';
import path from 'path';
import { ProjectRepository } from '../repositories/ProjectRepository.js';
import { TaskRepository } from '../repositories/TaskRepository.js';
import { FileSync } from '../sync/FileSync.js';

export interface SpecProject {
  id: string;
  name: string;
  description?: string;
  path: string;
}

/**
 * Monitors .spec/ directory for changes and syncs with MCP database
 */
export class SpecMonitor {
  private readonly specDir: string;
  private readonly projectRepo: ProjectRepository;
  private readonly taskRepo: TaskRepository;
  private readonly fileSync: FileSync;
  private readonly enabled: boolean;
  private watcher?: FSWatcher;
  private readonly trackedProjects: Map<string, SpecProject> = new Map();

  constructor(
    specDir?: string, 
    projectRepo?: ProjectRepository,
    taskRepo?: TaskRepository,
    fileSync?: FileSync,
    enabled: boolean = true
  ) {
    this.specDir = specDir || path.join(process.cwd(), '.spec');
    this.projectRepo = projectRepo || new ProjectRepository();
    this.taskRepo = taskRepo || new TaskRepository();
    this.fileSync = fileSync || new FileSync();
    this.enabled = enabled;
  }

  /**
   * Start monitoring the .spec directory
   */
  async start(): Promise<void> {
    if (!this.enabled) {
      console.log('SpecMonitor: File sync disabled, monitoring not started');
      return;
    }

    try {
      // Ensure .spec directory exists
      await fs.mkdir(this.specDir, { recursive: true });
      
      // Scan for existing projects
      await this.scanExistingProjects();
      
      // Start watching for changes
      this.watcher = watch(
        this.specDir,
        { recursive: true },
        (eventType, filename) => {
          if (filename) {
            this.handleFileChange(eventType, filename);
          }
        }
      );
      
      console.log(`SpecMonitor: Watching ${this.specDir} for changes`);
    } catch (error) {
      console.error('SpecMonitor: Failed to start monitoring:', error);
    }
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = undefined;
      console.log('SpecMonitor: Stopped monitoring');
    }
  }

  /**
   * Scan for existing projects in .spec directory
   */
  private async scanExistingProjects(): Promise<void> {
    try {
      const entries = await fs.readdir(this.specDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const projectPath = path.join(this.specDir, entry.name);
          await this.processProjectDirectory(entry.name, projectPath);
        }
      }
    } catch (error) {
      // .spec directory doesn't exist yet, that's fine
    }
  }

  /**
   * Process a project directory and sync with database
   */
  private async processProjectDirectory(dirName: string, projectPath: string): Promise<void> {
    try {
      // Check if this looks like a valid spec project
      const hasRequirements = await this.fileExists(path.join(projectPath, 'requirements.md'));
      const hasDesign = await this.fileExists(path.join(projectPath, 'design.md'));
      const hasTasks = await this.fileExists(path.join(projectPath, 'tasks.md'));
      
      if (!hasRequirements && !hasDesign && !hasTasks) {
        // Not a spec project directory
        return;
      }

      // Try to read project metadata
      let projectName = dirName;
      let description: string | undefined;
      
      const metadataPath = path.join(projectPath, 'README.md');
      if (await this.fileExists(metadataPath)) {
        const metadata = await fs.readFile(metadataPath, 'utf-8');
        const nameMatch = metadata.match(/- \*\*Name\*\*: (.+)/);
        if (nameMatch) {
          projectName = nameMatch[1];
        }
      }

      // Check if project already exists in database
      let project = await this.projectRepo.findByName(projectName);
      
      if (!project) {
        // Create new project in database
        console.log(`SpecMonitor: Creating project for spec directory: ${dirName}`);
        project = await this.projectRepo.create({
          name: projectName,
          description
        });

        // Create internal project files (not in .spec)
        await this.fileSync.createProjectFiles(project.id, project.name, project.description || undefined);
      }

      // Track this project
      this.trackedProjects.set(dirName, {
        id: project.id,
        name: project.name,
        description: project.description || undefined,
        path: projectPath
      });

      console.log(`SpecMonitor: Tracking project ${project.name} (${dirName})`);
    } catch (error) {
      console.error(`SpecMonitor: Error processing project directory ${dirName}:`, error);
    }
  }

  /**
   * Handle file system changes
   */
  private async handleFileChange(eventType: string, filename: string): Promise<void> {
    try {
      const fullPath = path.join(this.specDir, filename);
      const segments = filename.split(path.sep);
      
      if (segments.length < 2) {
        // Top-level change, might be new directory
        if (eventType === 'rename') {
          await this.handleDirectoryChange(segments[0]);
        }
        return;
      }

      const dirName = segments[0];
      const filePath = segments.slice(1).join(path.sep);

      // Check if this is a spec file change
      if (filePath.endsWith('.md') && ['requirements.md', 'design.md', 'tasks.md'].includes(filePath)) {
        await this.handleSpecFileChange(dirName, filePath, fullPath, eventType);
      }
    } catch (error) {
      console.error('SpecMonitor: Error handling file change:', error);
    }
  }

  /**
   * Handle directory changes (new projects)
   */
  private async handleDirectoryChange(dirName: string): Promise<void> {
    const projectPath = path.join(this.specDir, dirName);
    
    try {
      const stat = await fs.stat(projectPath);
      if (stat.isDirectory() && !this.trackedProjects.has(dirName)) {
        // New directory, check if it becomes a spec project
        setTimeout(() => {
          this.processProjectDirectory(dirName, projectPath);
        }, 1000); // Wait a bit for files to be created
      }
    } catch (error) {
      // Directory might have been deleted
      if (this.trackedProjects.has(dirName)) {
        console.log(`SpecMonitor: Project directory deleted: ${dirName}`);
        this.trackedProjects.delete(dirName);
      }
    }
  }

  /**
   * Handle spec file changes
   */
  private async handleSpecFileChange(
    dirName: string, 
    fileName: string, 
    fullPath: string, 
    eventType: string
  ): Promise<void> {
    const project = this.trackedProjects.get(dirName);
    if (!project) {
      return; // Not tracking this project yet
    }

    console.log(`SpecMonitor: Spec file ${fileName} changed in ${dirName} (${eventType})`);

    try {
      if (eventType === 'change' && await this.fileExists(fullPath)) {
        // File was modified, sync changes
        await this.syncSpecFileToDatabase(project, fileName, fullPath);
      }
    } catch (error) {
      console.error(`SpecMonitor: Error syncing spec file ${fileName}:`, error);
    }
  }

  /**
   * Sync spec file changes to database
   */
  private async syncSpecFileToDatabase(
    project: SpecProject, 
    fileName: string, 
    filePath: string
  ): Promise<void> {
    const content = await fs.readFile(filePath, 'utf-8');
    
    // For now, we'll just log the change
    // In a full implementation, you might:
    // - Parse tasks from tasks.md and sync to database
    // - Update project phase based on file content
    // - Extract requirements or design changes
    
    console.log(`SpecMonitor: Syncing ${fileName} for project ${project.name}`);
    
    if (fileName === 'tasks.md') {
      // Simple task parsing - look for checklist items
      await this.parseAndSyncTasks(project, content);
    }
  }

  /**
   * Parse tasks from tasks.md and sync to database
   */
  private async parseAndSyncTasks(project: SpecProject, content: string): Promise<void> {
    const lines = content.split('\n');
    const taskPattern = /^- \[([ x])\] (.+)/;
    
    for (const line of lines) {
      const match = line.match(taskPattern);
      if (match) {
        const [, completed, title] = match;
        const isCompleted = completed === 'x';
        
        // Check if task already exists
        const existingTasks = await this.taskRepo.findByProject(project.id);
        const existingTask = existingTasks.find(t => t.title === title.trim());
        
        if (!existingTask) {
          // Create new task
          await this.taskRepo.create({
            projectId: project.id,
            title: title.trim(),
            phase: 'tasks', // Default phase
            status: isCompleted ? 'completed' : 'pending',
            priority: 1
          });
          console.log(`SpecMonitor: Created task "${title.trim()}" (${isCompleted ? 'completed' : 'pending'})`);
        } else if (existingTask.status !== (isCompleted ? 'completed' : 'pending')) {
          // Update task status
          await this.taskRepo.update(existingTask.id, {
            status: isCompleted ? 'completed' : 'pending'
          });
          console.log(`SpecMonitor: Updated task "${title.trim()}" to ${isCompleted ? 'completed' : 'pending'}`);
        }
      }
    }
  }

  /**
   * Check if file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get all tracked projects
   */
  getTrackedProjects(): SpecProject[] {
    return Array.from(this.trackedProjects.values());
  }

  /**
   * Manually sync a project directory
   */
  async syncProject(dirName: string): Promise<void> {
    const projectPath = path.join(this.specDir, dirName);
    await this.processProjectDirectory(dirName, projectPath);
  }
}