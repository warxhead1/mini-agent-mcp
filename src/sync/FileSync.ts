import { promises as fs } from 'fs';
import path from 'path';
import { AgentUpdate, PhaseCompletion } from '../types/index.js';

export class FileSync {
  private readonly baseDir: string;
  private readonly specDir: string;
  private readonly enabled: boolean;

  constructor(baseDir?: string, specDir?: string, enabled: boolean = true) {
    this.baseDir = baseDir || path.join(process.cwd(), 'projects');
    this.specDir = specDir || path.join(process.cwd(), '.spec');
    this.enabled = enabled;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get the spec directory path for a project
   */
  getSpecPath(projectId: string): string {
    return path.join(this.specDir, projectId);
  }

  /**
   * Write a spec file to the .spec directory
   */
  async writeSpecFile(projectId: string, fileName: string, content: string): Promise<void> {
    if (!this.enabled) return;

    const specProjectDir = path.join(this.specDir, projectId);
    await fs.mkdir(specProjectDir, { recursive: true });
    await fs.writeFile(path.join(specProjectDir, fileName), content);
  }

  /**
   * Create the initial project file structure
   */
  async createProjectFiles(projectId: string, projectName: string, description?: string): Promise<void> {
    if (!this.enabled) return;
    
    const projectDir = path.join(this.baseDir, projectName);
    
    // Create directories
    await fs.mkdir(projectDir, { recursive: true });
    await fs.mkdir(path.join(projectDir, 'implementation'), { recursive: true });
    await fs.mkdir(path.join(projectDir, 'handoffs'), { recursive: true });

    // Create README.md with project overview
    const readmeContent = `# ${projectName}

${description || 'No description provided.'}

## Project Status

- **ID**: ${projectId}
- **Status**: active
- **Current Phase**: requirements
- **Created**: ${new Date().toISOString()}

## Phase Progress

- [ ] Requirements
- [ ] Design
- [ ] Tasks
- [ ] Execute

## Quick Links

- [Requirements](./requirements.md)
- [Design](./design.md)
- [Tasks](./tasks.md)
- [Implementation](./implementation/)
- [Handoffs](./handoffs/)
`;

    await fs.writeFile(path.join(projectDir, 'README.md'), readmeContent);

    // Create empty phase files
    await fs.writeFile(path.join(projectDir, 'requirements.md'), '# Requirements\n\n*Not yet started*\n');
    await fs.writeFile(path.join(projectDir, 'design.md'), '# Design\n\n*Not yet started*\n');
    await fs.writeFile(path.join(projectDir, 'tasks.md'), '# Tasks\n\n*Not yet started*\n');
  }

  /**
   * Create spec files in .spec/ directory for user editing
   */
  async createSpecFiles(projectId: string, projectName: string, description?: string): Promise<void> {
    if (!this.enabled) return;

    const specProjectDir = path.join(this.specDir, projectName);
    
    // Create spec directory
    await fs.mkdir(specProjectDir, { recursive: true });

    // Create spec files that match the existing Claude workflow
    const requirementsContent = `# ${projectName} - Requirements

${description || 'No description provided.'}

## User Stories

*Add user stories here in the format: As a [role], I want [feature], so that [benefit]*

## Acceptance Criteria

*Add acceptance criteria here using EARS format (WHEN/IF/THEN statements)*

## Technical Constraints

*Add any technical constraints or considerations*
`;

    const designContent = `# ${projectName} - Design

## Architecture Overview

*Describe the high-level architecture and design decisions*

## Components

*List and describe the main components*

## Data Models

*Define data structures and relationships*

## API Design

*Specify endpoints, interfaces, or tool definitions*
`;

    const tasksContent = `# ${projectName} - Tasks

## Implementation Plan

*Break down the work into specific, actionable tasks*

### Phase 1: Foundation
- [ ] Task 1: Description
- [ ] Task 2: Description

### Phase 2: Core Features
- [ ] Task 3: Description
- [ ] Task 4: Description

### Phase 3: Testing & Polish
- [ ] Task 5: Description
- [ ] Task 6: Description
`;

    await fs.writeFile(path.join(specProjectDir, 'requirements.md'), requirementsContent);
    await fs.writeFile(path.join(specProjectDir, 'design.md'), designContent);
    await fs.writeFile(path.join(specProjectDir, 'tasks.md'), tasksContent);

    // Create a project metadata file
    const metadataContent = `# Project Metadata

- **ID**: ${projectId}
- **Name**: ${projectName}
- **Created**: ${new Date().toISOString()}
- **Status**: active
- **Current Phase**: requirements

This directory contains the specification files for this project.
Edit these files to update project requirements, design, and tasks.
`;
    await fs.writeFile(path.join(specProjectDir, 'README.md'), metadataContent);
  }

  /**
   * Append an agent update to a task's progress file
   */
  async appendAgentUpdate(projectId: string, taskId: string, update: AgentUpdate): Promise<void> {
    if (!this.enabled) return;
    
    const taskFile = path.join(this.baseDir, projectId, 'implementation', `task-${taskId}.md`);
    
    // Ensure the file exists with a header
    try {
      await fs.access(taskFile);
    } catch {
      const header = `# Task ${taskId}\n\n## Progress Updates\n\n`;
      await fs.writeFile(taskFile, header);
    }

    // Format the update
    const updateContent = `
### ${update.timestamp.toISOString()} - Status: ${update.status}

**Notes:**
${update.notes}

${update.deliverables ? `**Deliverables:**
\`\`\`json
${JSON.stringify(update.deliverables, null, 2)}
\`\`\`
` : ''}

${update.nextSteps ? `**Next Steps:**
${update.nextSteps}
` : ''}

---
`;

    // Append to file
    await fs.appendFile(taskFile, updateContent);
  }

  /**
   * Write agent context to a project file
   */
  async writeAgentContext(projectId: string, agentType: string, context: { summary: string; context: any }): Promise<void> {
    if (!this.enabled) return;
    const contextFile = path.join(this.baseDir, projectId, `${agentType}-context.json`);
    
    const contextData = {
      agentType,
      timestamp: new Date().toISOString(),
      summary: context.summary,
      context: context.context
    };

    await fs.writeFile(contextFile, JSON.stringify(contextData, null, 2));

    // Also update the appropriate phase file with the summary
    const phaseFile = path.join(this.baseDir, projectId, `${agentType}.md`);
    try {
      const existingContent = await fs.readFile(phaseFile, 'utf-8');
      if (existingContent.includes('*Not yet started*')) {
        // Replace placeholder with actual content
        const newContent = `# ${agentType.charAt(0).toUpperCase() + agentType.slice(1)}

## Summary

${context.summary}

## Details

See [${agentType}-context.json](./${agentType}-context.json) for full context.

---

*Last updated: ${new Date().toISOString()}*
`;
        await fs.writeFile(phaseFile, newContent);
      }
    } catch {
      // File doesn't exist or other error, skip
    }
  }

  /**
   * Complete a phase and create handoff document
   */
  async completePhase(projectId: string, phaseData: PhaseCompletion): Promise<void> {
    if (!this.enabled) return;
    const projectDir = path.join(this.baseDir, projectId);
    
    // Determine handoff file name
    const handoffMap: Record<string, string> = {
      'requirements': 'requirements-to-design.md',
      'design': 'design-to-tasks.md',
      'tasks': 'tasks-to-implementation.md'
    };

    const handoffFile = handoffMap[phaseData.phase];
    if (!handoffFile) {
      throw new Error(`Unknown phase: ${phaseData.phase}`);
    }

    const handoffPath = path.join(projectDir, 'handoffs', handoffFile);

    // Create handoff document
    const handoffContent = `# ${phaseData.phase.charAt(0).toUpperCase() + phaseData.phase.slice(1)} Phase Handoff

**Completed**: ${new Date().toISOString()}

## Phase Summary

${phaseData.handoffNotes}

## Deliverables

\`\`\`json
${JSON.stringify(phaseData.deliverables, null, 2)}
\`\`\`

## Key Decisions and Considerations

${this.extractKeyPoints(phaseData.handoffNotes)}

## Next Phase Guidelines

${this.getNextPhaseGuidelines(phaseData.phase)}

---

*This handoff document was automatically generated when the ${phaseData.phase} phase was completed.*
`;

    await fs.writeFile(handoffPath, handoffContent);

    // Update README to mark phase as complete
    await this.updateProjectReadme(projectId, phaseData.phase);
  }

  /**
   * Read complete project history
   */
  async readProjectHistory(projectId: string): Promise<string> {
    const projectDir = path.join(this.baseDir, projectId);
    const history: string[] = [];

    try {
      // Read README
      const readme = await fs.readFile(path.join(projectDir, 'README.md'), 'utf-8');
      history.push('# Project Overview\n\n' + readme);

      // Read phase files
      for (const phase of ['requirements', 'design', 'tasks']) {
        try {
          const content = await fs.readFile(path.join(projectDir, `${phase}.md`), 'utf-8');
          history.push(`\n\n# ${phase.charAt(0).toUpperCase() + phase.slice(1)} Phase\n\n${content}`);
        } catch {
          // Phase file doesn't exist
        }
      }

      // Read handoff documents
      const handoffDir = path.join(projectDir, 'handoffs');
      try {
        const handoffs = await fs.readdir(handoffDir);
        for (const handoff of handoffs) {
          if (handoff.endsWith('.md')) {
            const content = await fs.readFile(path.join(handoffDir, handoff), 'utf-8');
            history.push(`\n\n# Handoff: ${handoff}\n\n${content}`);
          }
        }
      } catch {
        // No handoffs yet
      }

    } catch (error) {
      return `Error reading project history: ${error}`;
    }

    return history.join('\n');
  }

  /**
   * Read all updates for a specific task
   */
  async readTaskUpdates(projectId: string, taskId: string): Promise<AgentUpdate[]> {
    const taskFile = path.join(this.baseDir, projectId, 'implementation', `task-${taskId}.md`);
    
    try {
      const content = await fs.readFile(taskFile, 'utf-8');
      // Parse the markdown to extract updates
      return this.parseTaskUpdates(content);
    } catch {
      return [];
    }
  }

  /**
   * Get the project directory path
   */
  getProjectPath(projectId: string): string {
    return path.join(this.baseDir, projectId);
  }

  /**
   * Check if a project directory exists
   */
  async projectExists(projectId: string): Promise<boolean> {
    try {
      await fs.access(path.join(this.baseDir, projectId));
      return true;
    } catch {
      return false;
    }
  }

  // Helper methods

  private extractKeyPoints(handoffNotes: string): string {
    // Simple extraction - in a real implementation, this could use NLP
    const lines = handoffNotes.split('\n');
    const keyPoints = lines
      .filter(line => line.includes('Note:') || line.includes('Important:') || line.includes('Decision:'))
      .map(line => `- ${line.trim()}`)
      .join('\n');

    return keyPoints || '- No specific key points identified';
  }

  private getNextPhaseGuidelines(currentPhase: string): string {
    const guidelines: Record<string, string> = {
      'requirements': `The design phase should:
- Create detailed technical architecture based on these requirements
- Define all interfaces and data models
- Plan for scalability and maintainability
- Consider all acceptance criteria from requirements`,
      
      'design': `The tasks phase should:
- Break down the design into implementable units
- Create clear, atomic tasks with dependencies
- Ensure each task maps to specific requirements
- Plan the implementation order carefully`,
      
      'tasks': `The implementation phase should:
- Execute tasks in the planned order
- Update task status as work progresses
- Document any deviations from the plan
- Ensure all tests pass before marking complete`
    };

    return guidelines[currentPhase] || 'Proceed with standard workflow practices.';
  }

  private async updateProjectReadme(projectId: string, completedPhase: string): Promise<void> {
    const readmePath = path.join(this.baseDir, projectId, 'README.md');
    
    try {
      let content = await fs.readFile(readmePath, 'utf-8');
      
      // Update phase checklist
      const phaseMap: Record<string, string> = {
        'requirements': '- [x] Requirements',
        'design': '- [x] Design',
        'tasks': '- [x] Tasks',
        'execute': '- [x] Execute'
      };

      if (phaseMap[completedPhase]) {
        content = content.replace(
          `- [ ] ${completedPhase.charAt(0).toUpperCase() + completedPhase.slice(1)}`,
          phaseMap[completedPhase]
        );
      }

      // Update current phase
      const nextPhase: Record<string, string> = {
        'requirements': 'design',
        'design': 'tasks',
        'tasks': 'execute',
        'execute': 'completed'
      };

      if (nextPhase[completedPhase]) {
        content = content.replace(
          /\*\*Current Phase\*\*: \w+/,
          `**Current Phase**: ${nextPhase[completedPhase]}`
        );
      }

      await fs.writeFile(readmePath, content);
    } catch {
      // Error updating README, continue anyway
    }
  }

  private parseTaskUpdates(content: string): AgentUpdate[] {
    const updates: AgentUpdate[] = [];
    const updateRegex = /### (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z) - Status: (\w+)\n\n\*\*Notes:\*\*\n([\s\S]*?)(?=\n\n###|\n\n---|$)/g;
    
    let match;
    while ((match = updateRegex.exec(content)) !== null) {
      const [, timestamp, status, notes] = match;
      updates.push({
        timestamp: new Date(timestamp),
        status: status as any,
        notes: notes.trim(),
        // TODO: Parse deliverables and nextSteps from the content
      });
    }

    return updates;
  }
}