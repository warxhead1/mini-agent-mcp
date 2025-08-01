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

    // Search for existing document first
    const existingPath = await this.findExistingDocument(projectId, fileName);
    if (existingPath) {
      console.log(`Found existing ${fileName} at ${existingPath}, updating instead of creating new`);
      await fs.writeFile(existingPath, content);
      return;
    }

    // Create new if not found
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
    
    // Create directories for tracking only
    await fs.mkdir(projectDir, { recursive: true });
    await fs.mkdir(path.join(projectDir, 'implementation'), { recursive: true });
    await fs.mkdir(path.join(projectDir, 'handoffs'), { recursive: true });

    // Create README.md that points to .spec/ as single source of truth
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

## Specifications (Single Source of Truth)

All project specifications are maintained in the \`.spec/\` directory:

- [Requirements](../.spec/${projectName}/requirements.md) - Feature requirements and acceptance criteria
- [Design](../.spec/${projectName}/design.md) - Technical design and architecture  
- [Tasks](../.spec/${projectName}/tasks.md) - Implementation task breakdown

## Project Tracking

- [Implementation Progress](./implementation/) - Task execution updates
- [Phase Handoffs](./handoffs/) - Inter-phase transition documents

## Notes

This directory contains project tracking and progress files only. 
**All specifications are edited in \`.spec/${projectName}/\`**
`;

    await fs.writeFile(path.join(projectDir, 'README.md'), readmeContent);

    // No longer create duplicate spec files here - .spec/ is the single source
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

    // No longer update duplicate phase files - .spec/ is the single source
    // Context is saved in the tracking directory for agent handoffs only
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
    const specDir = path.join(this.specDir, projectId);
    const history: string[] = [];

    try {
      // Read project README (tracking info)
      const readme = await fs.readFile(path.join(projectDir, 'README.md'), 'utf-8');
      history.push('# Project Overview\n\n' + readme);

      // Read spec files from .spec/ directory (single source of truth)
      for (const phase of ['requirements', 'design', 'tasks']) {
        try {
          const content = await fs.readFile(path.join(specDir, `${phase}.md`), 'utf-8');
          history.push(`\n\n# ${phase.charAt(0).toUpperCase() + phase.slice(1)} Phase\n\n${content}`);
        } catch {
          // Phase file doesn't exist yet
        }
      }

      // Read handoff documents (tracking info)
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

  /**
   * Find existing document in multiple possible locations
   */
  private async findExistingDocument(projectId: string, fileName: string): Promise<string | null> {
    const searchPaths = [
      path.join(this.specDir, projectId, fileName),  // .spec/project/file.md (primary)
      path.join(process.cwd(), fileName),            // current directory
      path.join(process.cwd(), '.spec', projectId, fileName), // relative .spec path
      // Note: removed projects/ path since we no longer duplicate files there
    ];
    
    for (const searchPath of searchPaths) {
      try {
        await fs.access(searchPath);
        return searchPath;
      } catch {
        continue;
      }
    }
    return null;
  }

  /**
   * Validate that a document has been properly updated (not just template)
   * Token-efficient: simple pattern matching, no AI analysis
   */
  async validateDocumentCompletion(projectId: string, fileName: string): Promise<{ isComplete: boolean; reason?: string }> {
    if (!this.enabled) return { isComplete: true };

    try {
      const existingPath = await this.findExistingDocument(projectId, fileName);
      if (!existingPath) {
        return { isComplete: false, reason: `${fileName} not found` };
      }

      const content = await fs.readFile(existingPath, 'utf-8');
      
      // Check for template markers that indicate incomplete work
      const templateMarkers = [
        '[Work with the AI to define',
        '[AI: ',
        '*Not yet started*',
        '*Add user stories here',
        '*Describe the high-level architecture',
        '*Break down the work into specific',
        'WHEN [event] THEN the system SHALL [response]', // Placeholder acceptance criteria
        'As a [role], I want [feature]', // Placeholder user story
      ];

      const foundMarkers = templateMarkers.filter(marker => content.includes(marker));
      
      if (foundMarkers.length > 0) {
        return { 
          isComplete: false, 
          reason: `Document contains template placeholders: ${foundMarkers.slice(0, 2).join(', ')}${foundMarkers.length > 2 ? '...' : ''}` 
        };
      }

      // Check minimum content length (avoid stub documents)
      const contentWithoutHeaders = content.replace(/^#.*$/gm, '').trim();
      if (contentWithoutHeaders.length < 200) {
        return { 
          isComplete: false, 
          reason: `Document too short (${contentWithoutHeaders.length} chars). Needs substantial content.` 
        };
      }

      return { isComplete: true };

    } catch (error) {
      return { isComplete: false, reason: `Error reading ${fileName}: ${error}` };
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