/**
 * @fileoverview QueryTab Module Index
 * 
 * This is the main entry point for the QueryTab module, which provides a complete
 * SOQL query editing experience with intelligent autocomplete, relationship resolution,
 * and drag-and-drop functionality.
 * 
 * Module Architecture:
 * 
 * 1. queryParser.ts - Enhanced SOQL parsing with offset information and metadata enrichment
 * 2. autocompleteProvider.ts - Provides intelligent autocomplete suggestions
 * 3. queryValidator.ts - Validates SOQL syntax using local enhanced parser
 * 4. dragDropHandler.ts - Handles drag-and-drop operations from schema tree
 * 
 * Data Flow:
 * User types in Monaco Editor
 * ↓
 * queryParser.ts parses query and determines context with offset information
 * ↓
 * autocompleteProvider.ts fetches fields/relationships for suggestions
 * ↓
 * Monaco Editor displays context-aware autocomplete
 * 
 * Why This Architecture:
 * - Separation of concerns: Each module has a single responsibility
 * - Maintainability: Easy to modify individual components
 * - Testability: Each module can be unit tested independently
 * - Reusability: Modules can be used in other parts of the application
 * - Scalability: Easy to add new features without affecting existing code
 */

// Main exports for the queryTab module
export * from './queryParser';
export * from './autocompleteProvider';
export * from './queryValidator';
export * from './dragDropHandler';
