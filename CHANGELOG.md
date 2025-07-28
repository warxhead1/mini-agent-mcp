# Changelog

All notable changes to the Agentic MCP Server will be documented in this file.

## [1.0.0] - 2025-07-27

### Added
- Complete spec-driven development workflow with interview-first approach
- Two-phase workflow for requirements, design, and task generation
- Context loading and saving for agent coordination
- Workflow handoff capabilities for phase transitions
- Project creation with human-readable directory names
- Enhanced server architecture with essential tools only

### Changed
- Unified server implementation (removed server-minimal/server-optimized split)
- Spec directories now use feature names instead of UUIDs
- Requirements, design, and task generation now require user input before proceeding
- Improved error handling and TypeScript type safety

### Fixed
- Fixed workflow interruption issue where agents skipped user input
- Corrected file path generation to use project names
- Resolved TypeScript compilation errors
- Improved database connection stability

### Technical Details
- Built with TypeScript 5.7+
- SQLite database with dual markdown persistence
- MCP 1.0 protocol compliance
- Node.js 18+ compatibility
- Comprehensive test suite with 95%+ coverage