/**
 * Spec Workflow Handlers
 * 
 * These handlers facilitate AI-user collaboration for spec-driven development.
 * They create structure and return instructions, not generated content.
 */

import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { ProjectRepository } from '../repositories/ProjectRepository.js';
import { TaskRepository } from '../repositories/TaskRepository.js';
import { AgentSessionRepository } from '../repositories/AgentSessionRepository.js';
import { FileSync } from '../sync/FileSync.js';

export class SpecHandlers {
  constructor(
    private projectRepo: ProjectRepository,
    private taskRepo: TaskRepository,
    private agentSessionRepo: AgentSessionRepository,
    private fileSync: FileSync
  ) {}

  /**
   * Handle spec creation - creates project structure and returns instructions
   */
  async handleSpecCreate(args: Record<string, any>): Promise<any> {
    const { featureName, description } = args;

    // Validate required fields
    if (!featureName || typeof featureName !== 'string') {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Feature name is required and must be a string'
      );
    }

    // Validate kebab-case format
    if (!/^[a-z][a-z0-9-]*[a-z0-9]$/.test(featureName)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Feature name must be in kebab-case format (e.g., user-authentication)'
      );
    }

    try {
      // Create project in database
      const project = await this.projectRepo.create({
        name: featureName,
        description: description || undefined,
      });

      // Create file structure
      await this.fileSync.createProjectFiles(project.id, project.name, project.description || undefined);
      
      // Create spec directory with template files
      if (this.fileSync.isEnabled) {
        await this.fileSync.createSpecFiles(project.id, project.name, project.description || undefined);
        
        // Write initial requirements template
        const requirementsTemplate = this.getRequirementsTemplate(featureName);
        await this.fileSync.writeSpecFile(project.name, 'requirements.md', requirementsTemplate);
      }

      // Save initial context
      await this.agentSessionRepo.create({
        projectId: project.id,
        agentType: 'requirements',
        contextData: {
          featureName,
          description: description || '',
          status: 'awaiting_collaboration'
        }
      });

      return {
        success: true,
        project: {
          id: project.id,
          name: project.name,
          description: project.description,
          status: project.status,
          currentPhase: project.currentPhase,
          createdAt: project.createdAt.toISOString(),
        },
        specDirectory: this.fileSync.isEnabled ? `.spec/${project.name}/` : null,
        instructions: this.getCreateInstructions(featureName, description),
        nextStep: 'collaborate_on_requirements',
        template: {
          type: 'requirements',
          path: `.spec/${project.name}/requirements.md`,
          status: 'ready_for_collaboration'
        }
      };

    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Project with name '${featureName}' already exists`
        );
      }
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to create spec: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Handle design phase - prepares design template and returns instructions
   */
  async handleSpecDesign(args: Record<string, any>): Promise<any> {
    const { projectId } = args;

    if (!projectId || typeof projectId !== 'string') {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Project ID is required and must be a string'
      );
    }

    try {
      // Verify project exists
      const project = await this.projectRepo.findById(projectId);
      if (!project) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Project not found: ${projectId}`
        );
      }

      // Check requirements context
      const requirementsContext = await this.agentSessionRepo.findByProjectAndType(projectId, 'requirements');
      if (!requirementsContext) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Requirements not found. Please complete requirements phase first.'
        );
      }


      // Prepare design template
      const designTemplate = this.getDesignTemplate(project.name);
      if (this.fileSync.isEnabled) {
        await this.fileSync.writeSpecFile(project.name, 'design.md', designTemplate);
      }

      // Update project phase
      await this.projectRepo.update(projectId, {
        currentPhase: 'design'
      });

      // Save design context
      await this.agentSessionRepo.create({
        projectId,
        agentType: 'design',
        contextData: {
          status: 'awaiting_collaboration',
          basedOnRequirements: true
        }
      });

      return {
        success: true,
        project: {
          id: project.id,
          name: project.name,
          currentPhase: 'design'
        },
        instructions: this.getDesignInstructions(project.name, requirementsContext.contextData),
        nextStep: 'collaborate_on_design',
        template: {
          type: 'design',
          path: `.spec/${project.name}/design.md`,
          status: 'ready_for_collaboration'
        },
        context: {
          requirements: requirementsContext.contextData
        }
      };

    } catch (error) {
      if (error instanceof McpError) throw error;
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to generate design: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Handle task breakdown - prepares task template and returns instructions
   */
  async handleSpecTasks(args: Record<string, any>): Promise<any> {
    const { projectId } = args;

    if (!projectId || typeof projectId !== 'string') {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Project ID is required and must be a string'
      );
    }

    try {
      // Verify project exists
      const project = await this.projectRepo.findById(projectId);
      if (!project) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Project not found: ${projectId}`
        );
      }

      // Check design context
      const designContext = await this.agentSessionRepo.findByProjectAndType(projectId, 'design');
      if (!designContext) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Design not found. Please complete design phase first.'
        );
      }


      // Prepare tasks template
      const tasksTemplate = this.getTasksTemplate(project.name);
      if (this.fileSync.isEnabled) {
        await this.fileSync.writeSpecFile(project.name, 'tasks.md', tasksTemplate);
      }

      // Update project phase
      await this.projectRepo.update(projectId, {
        currentPhase: 'tasks'
      });

      // Save tasks context
      await this.agentSessionRepo.create({
        projectId,
        agentType: 'tasks',
        contextData: {
          status: 'awaiting_collaboration',
          basedOnDesign: true
        }
      });

      // Get all contexts for comprehensive instructions
      const requirementsContext = await this.agentSessionRepo.findByProjectAndType(projectId, 'requirements');

      return {
        success: true,
        project: {
          id: project.id,
          name: project.name,
          currentPhase: 'tasks'
        },
        instructions: this.getTasksInstructions(project.name, requirementsContext?.contextData, designContext.contextData),
        nextStep: 'collaborate_on_tasks',
        template: {
          type: 'tasks',
          path: `.spec/${project.name}/tasks.md`,
          status: 'ready_for_collaboration'
        },
        context: {
          requirements: requirementsContext?.contextData,
          design: designContext.contextData
        }
      };

    } catch (error) {
      if (error instanceof McpError) throw error;
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to generate tasks: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Handle task execution - provides context and instructions for implementation
   */
  async handleSpecExecute(args: Record<string, any>): Promise<any> {
    const { projectId, taskId } = args;

    if (!projectId || typeof projectId !== 'string') {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Project ID is required and must be a string'
      );
    }

    try {
      // Verify project exists
      const project = await this.projectRepo.findById(projectId);
      if (!project) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Project not found: ${projectId}`
        );
      }


      // Get or create tasks if needed
      let task;
      if (taskId) {
        task = await this.taskRepo.findById(taskId);
        if (!task || task.projectId !== projectId) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Task not found in project: ${taskId}`
          );
        }
      } else {
        // Find next pending task
        const pendingTasks = await this.taskRepo.findByProject(projectId, { status: 'pending' });
        if (pendingTasks.length === 0) {
          // Check if we need to parse tasks from the tasks.md file
          const tasksContext = await this.agentSessionRepo.findByProjectAndType(projectId, 'tasks');
          if (tasksContext && tasksContext.contextData.status === 'awaiting_collaboration') {
            return {
              success: false,
              message: 'Tasks have not been defined yet. Please complete the task breakdown phase first.',
              nextStep: 'complete_task_breakdown'
            };
          }
          
          return {
            success: false,
            message: 'No pending tasks found. All tasks may be completed or in progress.',
            nextStep: 'check_task_status'
          };
        }
        task = pendingTasks[0];
      }

      // Update task status
      await this.taskRepo.update(task.id, { status: 'in_progress' });

      // Update project phase if needed
      if (project.currentPhase !== 'execute') {
        await this.projectRepo.update(projectId, { currentPhase: 'execute' });
      }

      // Get all contexts
      const contexts: Record<string, any> = {};
      const contextTypes = ['requirements', 'design', 'tasks', 'implementation'];
      
      for (const type of contextTypes) {
        const session = await this.agentSessionRepo.findByProjectAndType(projectId, type);
        if (session) {
          contexts[type] = session.contextData;
        }
      }

      // Get task statistics
      const allTasks = await this.taskRepo.findByProject(projectId);
      const completedTasks = allTasks.filter(t => t.status === 'completed').length;
      const inProgressTasks = allTasks.filter(t => t.status === 'in_progress').length;
      const pendingTasks = allTasks.filter(t => t.status === 'pending').length;

      return {
        success: true,
        project: {
          id: project.id,
          name: project.name,
          currentPhase: 'execute'
        },
        task: {
          id: task.id,
          title: task.title,
          description: task.description,
          status: 'in_progress',
          priority: task.priority,
          phase: task.phase
        },
        instructions: this.getExecuteInstructions(task, contexts, project.name),
        nextStep: 'implement_task',
        context: contexts,
        progress: {
          totalTasks: allTasks.length,
          completedTasks,
          inProgressTasks,
          pendingTasks,
          progressPercent: allTasks.length > 0 ? Math.round((completedTasks / allTasks.length) * 100) : 0
        }
      };

    } catch (error) {
      if (error instanceof McpError) throw error;
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to execute task: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get requirements template
   */
  private getRequirementsTemplate(featureName: string): string {
    const title = featureName.split('-').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');

    return `# ${title} - Requirements

## Introduction

[Work with the AI to define: Brief overview of the feature, its purpose, and value to users]

## Requirements

### Requirement 1: [Core Feature Name]

**User Story:** As a [role], I want [feature], so that [benefit]

#### Acceptance Criteria

1. WHEN [event] THEN the system SHALL [response]
2. IF [precondition] THEN the system SHALL [response]
3. WHEN [event] AND [condition] THEN the system SHALL [response]

### Requirement 2: [Feature Name]

**User Story:** As a [role], I want [feature], so that [benefit]

#### Acceptance Criteria

1. WHEN [event] THEN the system SHALL [response]
2. IF [precondition] THEN the system SHALL [response]

[Continue adding requirements based on user needs]

## Non-Functional Requirements

### Performance
- [Define performance requirements with the AI]

### Security
- [Define security requirements with the AI]

### Reliability
- [Define reliability requirements with the AI]

### Usability
- [Define usability requirements with the AI]

---
**Status:** Draft - Awaiting collaboration
**Next Step:** Work with AI to define specific requirements`;
  }

  /**
   * Get design template
   */
  private getDesignTemplate(projectName: string): string {
    const title = projectName.split('-').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');

    return `# ${title} - Design

## Overview

[Work with the AI to define: Technical approach based on the approved requirements]

## Architecture

[Create architecture description and diagrams with the AI]

## Components and Interfaces

### Component 1: [Name]
- **Purpose:** [Define with AI]
- **Interfaces:** [Define with AI]
- **Dependencies:** [Define with AI]

[Continue defining components based on requirements]

## Data Models

[Define data structures needed for the feature with the AI]

## API Design

[Define API endpoints if applicable with the AI]

## Error Handling

[Define error scenarios and handling strategies with the AI]

## Testing Strategy

[Define testing approach with the AI]

## Implementation Notes

[Capture any special considerations or decisions with the AI]

---
**Status:** Draft - Awaiting collaboration
**Next Step:** Work with AI to create technical design`;
  }

  /**
   * Get tasks template
   */
  private getTasksTemplate(projectName: string): string {
    const title = projectName.split('-').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');

    return `# ${title} - Implementation Tasks

## Overview

[Work with the AI to summarize the implementation approach based on the approved design]

## Phase 1: [Foundation/Setup Phase Name]

- [ ] 1. [Task Name]
  - [Define specific implementation details with AI]
  - [List subtasks if needed]
  - _Requirements: [Link to relevant requirements]_

- [ ] 2. [Task Name]
  - [Define specific implementation details with AI]
  - _Requirements: [Link to relevant requirements]_

## Phase 2: [Core Implementation Phase Name]

- [ ] 3. [Task Name]
  - [Define specific implementation details with AI]
  - _Requirements: [Link to relevant requirements]_

[Continue breaking down into logical phases and tasks with the AI]

## Notes

- Each task should be completable in 1-4 hours
- Tasks should build incrementally
- Include testing and documentation tasks
- Reference requirements for traceability

---
**Status:** Draft - Awaiting collaboration
**Next Step:** Work with AI to break down implementation tasks`;
  }

  /**
   * Get creation instructions
   */
  private getCreateInstructions(featureName: string, description?: string): string {
    return `I've created the project structure for '${featureName}'. 

🎯 **CORE PRINCIPLE**: Plan thoroughly but adapt intelligently. These rules ensure quality while allowing necessary flexibility.

🚨 **TWO-PHASE APPROACH** 🚨

**PHASE 1 - REQUIREMENTS INTERVIEW (DO THIS FIRST!)**
Before writing ANY requirements, you MUST:
1. ASK 3-5 specific clarifying questions about the feature
2. WAIT for the user's responses
3. DO NOT proceed to Phase 2 until you have answers

Example questions to ask:
- What is the primary use case for this feature?
- Who are the main users and what are their goals?
- What are the performance requirements?
- What are the security considerations?
- What existing systems need to integrate with this?

**PHASE 2 - REQUIREMENTS WRITING (ONLY AFTER USER RESPONDS)**
Once you have the user's answers, then write the COMPLETE requirements following these rules:

1. **REQUIREMENTS FORMAT** (follow exactly):
   - Introduction: 2-3 sentences describing purpose and value
   - Each requirement: number, title, user story, 3+ acceptance criteria
   - User story: "As a [specific role], I want [specific feature], so that [measurable benefit]"
   - Acceptance criteria: "WHEN [event] THEN system SHALL [response]"

2. **CRITERIA MUST INCLUDE**:
   - Happy path + error cases + edge cases
   - Testable, measurable outcomes
   - No ambiguous terms ("fast", "easy", "secure")

3. **QUALITY BAR**:
   - ✅ SPECIFIC: metrics, not "improve" 
   - ✅ COMPLETE: all paths covered
   - ❌ NO: assumptions, fluff, or TBDs

4. **REQUIRED SECTIONS**:
   - Introduction (2-3 sentences)
   - Functional Requirements (numbered 1, 2, 3...)
   - Non-Functional Requirements (Performance, Security, Reliability, Usability)
   - Each section MUST have concrete, specific content

🔄 **ITERATIVE REFINEMENT**:
   - Requirements WILL evolve during design/implementation
   - When changes needed:
     1. Note the learning/discovery
     2. Update requirements with "Revision X" notes
     3. Keep change history at bottom
   - Example: "Revision 2: Added rate limiting requirement after security review"

Based on your description: "${description || 'No description provided'}"

The template is at .spec/${featureName}/requirements.md

🛑 **CURRENT ACTION**: You are in PHASE 1. Ask clarifying questions NOW and wait for responses.

📋 OUTPUT: Complete requirements that will drive the design phase.`;
  }

  /**
   * Get design instructions
   */
  private getDesignInstructions(projectName: string, _requirementsContext: any): string {
    return `Time for technical design for '${projectName}'.

🎯 **CORE PRINCIPLE**: Good design anticipates change. Document decisions and rationale for future adaptation.

🚨 **TWO-PHASE APPROACH FOR DESIGN** 🚨

**PHASE 1 - DESIGN INTERVIEW (DO THIS FIRST!)**
Before creating ANY design, you MUST:
1. ASK 3-5 specific technical questions about the implementation
2. WAIT for the user's responses  
3. DO NOT proceed to Phase 2 until you have answers

Example design questions to ask:
- What technology stack/frameworks are preferred?
- Are there existing systems or APIs to integrate with?
- What are the deployment constraints (cloud, on-premise, etc.)?
- What is the expected scale (users, data volume, requests/sec)?
- Are there specific architectural patterns to follow or avoid?

**PHASE 2 - DESIGN CREATION (ONLY AFTER USER RESPONDS)**
Once you have the user's answers, then create the COMPLETE design following these rules:

1. **DESIGN STRUCTURE**:
   - Overview: Technical approach (3-4 sentences)
   - Architecture: System design + Mermaid diagrams
   - Components: purpose, interfaces, dependencies
   - Data Models: types, constraints, relationships
   - API Design: endpoints with request/response
   - Error Handling: all failure scenarios
   - Testing Strategy: approach + coverage targets

2. **COMPONENT SPECIFICATION RULES**:
   - Name: PascalCase, descriptive
   - Purpose: One sentence, specific responsibility
   - Interfaces: Complete method signatures with types
   - Dependencies: Explicit list with versions if external
   - Example:
     UserAuthService: Handles auth lifecycle
     - authenticate(email, password): Promise<AuthResult>
     - logout(sessionId): Promise<void>  
     - Deps: bcrypt@5.x, jsonwebtoken@9.x

3. **DATA MODEL RULES**:
   - MUST include field types, constraints, indexes
   - MUST show relationships clearly
   - MUST include validation rules
   - Example:
     interface User {
       id: string;          // UUID, primary key
       email: string;       // unique, lowercase, valid email
       passwordHash: string; // bcrypt hash
       createdAt: Date;     // auto-generated
       sessions: Session[]; // one-to-many
     }

4. **DESIGN QUALITY**:
   - ✅ Every decision traces to requirements
   - ✅ Technology choices justified
   - ❌ NO: hand-waving, missing sections

🔄 **DESIGN EVOLUTION**:
   - Designs are living documents
   - When implementation reveals issues:
     1. Document the discovery
     2. Propose design changes with impact analysis
     3. Update design with "Design Decision Record"
   - Example: "DDR-1: Switched from REST to GraphQL due to N+1 query issues"

The template is at .spec/${projectName}/design.md

🛑 **CURRENT ACTION**: You are in PHASE 1. Ask technical design questions NOW and wait for responses.

📋 INPUT: Requirements from previous phase
📋 OUTPUT: Technical design that will guide task creation.`;
  }

  /**
   * Get tasks instructions
   */
  private getTasksInstructions(projectName: string, _requirementsContext: any, _designContext: any): string {
    return `Implementation task breakdown for '${projectName}'.

🎯 **CORE PRINCIPLE**: Tasks guide work but don't constrain problem-solving. Adapt tasks as you learn.

🚨 **TWO-PHASE APPROACH FOR TASKS** 🚨

**PHASE 1 - TASK PLANNING INTERVIEW (DO THIS FIRST!)**
Before creating the task list, you MUST:
1. PRESENT a high-level task breakdown (3-5 major phases)
2. ASK for user confirmation on approach and priorities
3. WAIT for feedback before creating detailed tasks

Example of what to present:
"Based on the requirements and design, I propose these implementation phases:
1. Foundation Setup (database, config, dependencies)
2. Core Feature Implementation (main functionality)
3. Integration & Error Handling
4. Testing & Documentation
5. Performance Optimization

Does this approach align with your priorities? Should any phase be adjusted or prioritized differently?"

**PHASE 2 - DETAILED TASK CREATION (ONLY AFTER USER CONFIRMS)**
Once the user approves the approach, create the COMPLETE task list following these rules:

1. **TASK STRUCTURE**:
   - Organize into phases (Setup, Core Implementation, Testing, etc.)
   - Each task: checkbox, number, title, details, requirements link
   - Format:
     ## Phase 1: Foundation Setup
     
     - [ ] 1. Set up database schema for user authentication
       - Create users table with fields from design
       - Add indexes for email uniqueness
       - Create sessions table with foreign key
       - _Requirements: #1 (Core Authentication)_

2. **TASK SIZING RULES**:
   - Each task MUST be 1-4 hours of work
   - If larger, break into subtasks:
     - [ ] 2. Implement authentication API
       - [ ] 2.1. Create login endpoint with validation
       - [ ] 2.2. Implement password hashing with bcrypt  
       - [ ] 2.3. Generate and store JWT tokens
       - [ ] 2.4. Create logout endpoint
       - _Requirements: #1, #3 (Security)_

3. **TASK DETAIL REQUIREMENTS**:
   - MUST specify WHAT to implement (not just "implement X")
   - MUST include HOW (specific approach/library/pattern)
   - MUST link to requirement numbers
   - MUST note dependencies on other tasks

4. **PHASE ORGANIZATION**:
   - Phase 1: Foundation (DB, config)
   - Phase 2: Core Features 
   - Phase 3: Error Handling
   - Phase 4: Testing
   - Phase 5: Integration

5. **TASK QUALITY**:
   - ✅ Independently verifiable
   - ✅ Links to requirements
   - ❌ NO: vague tasks, missing links

🔄 **TASK ADAPTATION**:
   - Tasks may need adjustment during execution
   - When changes needed:
     1. Mark original task with strikethrough
     2. Add revised task with explanation
     3. Update dependencies
   - Example:
     - [ ] ~~2.1 Implement REST API~~ 
     - [ ] 2.1 Implement GraphQL API (revised due to DDR-1)
   - Keep task history for learning

**SPECIAL RULES FOR AGENTIC WORKFLOW**:
- Tasks must be self-contained for sub-agent handoff
- Include context needed for task execution
- Specify deliverables expected from each task

The template is at .spec/${projectName}/tasks.md

🛑 **CURRENT ACTION**: You are in PHASE 1. Present high-level phases and ask for confirmation NOW.

📋 INPUT: Requirements + Design from previous phases  
📋 OUTPUT: Executable task list for implementation.`;
  }

  /**
   * Get execute instructions
   */
  private getExecuteInstructions(task: any, contexts: Record<string, any>, projectName: string): string {
    const hasRequirements = contexts.requirements && contexts.requirements.status !== 'awaiting_collaboration';
    const hasDesign = contexts.design && contexts.design.status !== 'awaiting_collaboration';

    return `Ready to implement: ${task.title}

🎯 **CORE PRINCIPLE**: Implementation reveals truth. When reality conflicts with plan, document and adapt.

⛔ **STUB = FAILURE**: A stub is any code that pretends to work but doesn't:
- throw new Error("TODO")
- return null // TODO: implement
- console.log("Would do X here")
- Empty function bodies
- Mock data when real data needed

🚨 **CRITICAL EXECUTION RULES - MUST FOLLOW EXACTLY** 🚨

1. **IMPLEMENTATION STANDARDS**:
   - Follow the EXACT patterns from the design document
   - Use the SPECIFIED libraries and versions
   - Implement COMPLETE error handling
   - Include unit tests if specified in task
   - NO shortcuts or partial implementations

🔄 **ADAPTATION PROTOCOL**:
When original plan doesn't work:
1. DOCUMENT the issue clearly
2. PROPOSE alternative approach with rationale
3. UPDATE relevant specs if approved
4. TRACK the change in progress notes

Example:
"Discovered that bcrypt is incompatible with our Node version.
Proposing argon2 as alternative (more secure, actively maintained).
Will update design doc if approved."

2. **CODE QUALITY REQUIREMENTS**:
   - ✅ Follow existing codebase conventions
   - ✅ Add JSDoc/comments for complex logic
   - ✅ Handle all error cases from requirements
   - ✅ Validate all inputs as specified
   - ❌ NO console.logs left in code
   - ❌ NO commented-out code
   - ❌ NO TODO comments without issue numbers

3. **TASK COMPLETION CHECKLIST**:
   Before marking complete, verify:
   - [ ] All acceptance criteria met
   - [ ] Error cases handled
   - [ ] Tests pass (if applicable)
   - [ ] Code follows project style
   - [ ] No type errors or lint warnings
   - [ ] NO STUBS - every function has real implementation

4. **PROGRESS UPDATE FORMAT**:
   When updating progress, you MUST provide:
   STATUS: [in_progress|completed|blocked|needs_revision]
   
   IMPLEMENTED:
   - Specific feature/component added
   - Key decisions made
   
   FILES MODIFIED:
   - path/to/file.ts: Added authentication logic
   - path/to/test.ts: Added unit tests
   
   STUB CHECK:
   - ✅ All functions fully implemented
   - ⚠️ Temporary implementation in X (explain why)
   
   DEVIATIONS FROM PLAN (if any):
   - What changed and why
   - Impact on other components
   - Spec updates needed
   
   NEXT STEPS:
   - Specific next task or handoff needs
   
   BLOCKERS (if any):
   - Specific issue preventing completion
   - Proposed solutions

**Task Details:**
${task.description || 'No detailed description available'}

**Available Context:**
${hasRequirements ? '✅ Requirements defined' : '❌ Requirements not yet defined'}
${hasDesign ? '✅ Design documented' : '❌ Design not yet documented'}
${contexts.implementation ? '✅ Previous implementation context available' : '📝 First implementation task'}

**REMINDER**: This is for agentic workflow. Your implementation must be:
- Self-contained and complete
- Well-documented for the next agent
- Properly tested and verified

⚠️ **IMPORTANT**: If you discover issues with the plan:
- DO NOT blindly follow a broken approach
- DO document the issue and propose fixes
- DO update specs/design if changes are needed
- DO communicate clearly for next agent

Better to adapt the plan than stub the implementation.

📝 **TASK TRACKING REMINDER**: When you complete or make progress on this task:
1. Update the checkbox in .spec/${projectName}/tasks.md (mark [x] when done)
2. Add a note about completion/progress next to the task
3. This helps the next agent see what's been done!

Example: 
- [x] 1. Set up database schema ✓ Completed - tables created in schema.sql

🚫 ANTI-STUB QUICK REFERENCE:
❌ NEVER:
- throw Error("TODO") 
- return undefined // implement later
- if (false) { /* actual code */ }

✅ INSTEAD:
- Implement fully OR
- Document blocker with proposed solution
- Request design/requirement clarification`;
  }
}