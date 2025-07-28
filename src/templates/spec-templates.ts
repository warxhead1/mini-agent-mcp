/**
 * Spec Templates
 * 
 * Templates that guide AI-user collaboration for spec creation
 * These templates provide structure and prompts, not generated content
 */

export const SpecTemplates = {
  requirements: `# {featureName} - Requirements

## Introduction

[AI: Work with the user to define the feature overview, its purpose, and value to users]

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

[AI: Continue adding requirements based on user needs]

## Non-Functional Requirements

### Performance
- [AI: Define performance requirements with user]

### Security
- [AI: Define security requirements with user]

### Reliability
- [AI: Define reliability requirements with user]

### Usability
- [AI: Define usability requirements with user]

---
**Status:** Draft - Awaiting user approval
**Next Step:** Once requirements are approved, proceed to design phase
`,

  design: `# {featureName} - Design

## Overview

[AI: Based on approved requirements, work with user to define technical architecture]

## Architecture

[AI: Create architecture diagram and explain components]

## Components and Interfaces

### Component 1: [Name]
- **Purpose:** [Define with user]
- **Interfaces:** [Define with user]
- **Dependencies:** [Define with user]

[AI: Continue defining components based on requirements]

## Data Models

[AI: Define data structures needed for the feature]

## API Design

[AI: Define API endpoints if applicable]

## Error Handling

[AI: Define error scenarios and handling strategies]

## Testing Strategy

[AI: Define testing approach with user]

## Implementation Notes

[AI: Capture any special considerations or decisions]

---
**Status:** Draft - Awaiting user approval
**Next Step:** Once design is approved, proceed to task breakdown
`,

  tasks: `# {featureName} - Implementation Tasks

## Overview

[AI: Summarize the implementation approach based on approved design]

## Phase 1: [Foundation/Setup Phase Name]

- [ ] 1. [Task Name]
  - [AI: Define specific implementation details]
  - [AI: List subtasks if needed]
  - _Requirements: [Link to relevant requirements]_

- [ ] 2. [Task Name]
  - [AI: Define specific implementation details]
  - _Requirements: [Link to relevant requirements]_

## Phase 2: [Core Implementation Phase Name]

- [ ] 3. [Task Name]
  - [AI: Define specific implementation details]
  - _Requirements: [Link to relevant requirements]_

[AI: Continue breaking down into logical phases and tasks]

## Notes

- Each task should be completable in 1-4 hours
- Tasks should build incrementally
- Include testing and documentation tasks
- Reference requirements for traceability

---
**Status:** Ready for implementation
**Next Step:** Use spec_execute to start implementing tasks
`,

  readme: `# {projectName}

**Project ID:** {projectId}  
**Status:** {status}  
**Current Phase:** {currentPhase}  
**Created:** {createdAt}  
**Last Updated:** {updatedAt}  

## Project Overview

{description}

## Quick Links

- [Requirements](./requirements.md) - Feature requirements and acceptance criteria
- [Design](./design.md) - Technical design and architecture
- [Tasks](./tasks.md) - Implementation task breakdown

## Current Status

[AI will update this section as work progresses]

## Next Steps

[AI will update based on current phase]
`
};

/**
 * Instructions returned to guide AI-user collaboration
 */
export const SpecInstructions = {
  create: `I've created the project structure for '{featureName}'. Now let's work together to define the requirements.

Based on your description: "{description}"

I'll help you create detailed requirements following best practices:
- User stories in "As a [role], I want [feature], so that [benefit]" format
- Acceptance criteria using WHEN/IF/THEN statements
- Consider edge cases, security, and performance

Let's start by identifying the main user stories for this feature. What are the key things users need to be able to do?`,

  design: `Great! Now let's create the technical design for '{featureName}'.

Based on the requirements we've defined, I'll help you:
- Design the system architecture
- Define components and their interfaces
- Create data models
- Plan API endpoints (if needed)
- Define error handling strategies
- Create a testing approach

What technology stack are you planning to use for this feature? This will help guide our design decisions.`,

  tasks: `Excellent! Now let's break down the implementation into manageable tasks.

Based on our design, I'll help you:
- Organize tasks into logical phases
- Ensure each task is 1-4 hours of work
- Create clear implementation steps
- Link tasks to requirements
- Define dependencies between tasks

Let's start with the foundation phase. What setup or infrastructure work needs to be done first?`,

  execute: `I've set up task '{taskTitle}' for implementation.

**Context Available:**
- Requirements: {requirementsSummary}
- Design decisions: {designSummary}
- Previous work: {previousWork}

**Your Task:**
{taskDescription}

**Acceptance Criteria:**
{acceptanceCriteria}

Let me know when you're ready to start implementing this task, and I'll help you through it. When complete, I'll update the task status and track your progress.`
};