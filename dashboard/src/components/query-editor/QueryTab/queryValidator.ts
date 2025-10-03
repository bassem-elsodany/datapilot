/**
 * @fileoverview Enhanced SOQL Query Validator Module
 * 
 * This module validates SOQL queries for syntax errors and provides feedback
 * to users about query correctness using our local enhanced parser.
 * 
 * Features:
 * - Real-time query validation with immediate feedback
 * - Prevents execution of invalid queries that would fail
 * - Uses our enhanced parser for consistent validation
 * - Provides error messages with line numbers and severity levels
 * 
 * Key Functions:
 * - SOQLValidator.validateQuery: Main validation function
 * - Returns validation results with error details and line numbers
 * 
 * Integration:
 * - Used by QueryTab.tsx for real-time validation
 * - Can be integrated with Monaco editor for visual error indicators
 * - Provides structured error information for user feedback
 */

import { isQueryValid } from '../../soql';

// SOQL Validation utilities using our local enhanced parser
export const SOQLValidator = {
  validateQuery: (query: string): { isValid: boolean; errors: Array<{ line: number; message: string; severity: 'error' | 'warning' }> } => {
    const errors: Array<{ line: number; message: string; severity: 'error' | 'warning' }> = [];
    
    try {
      // Use our local enhanced parser validation
      const isValid = isQueryValid(query);
      
      if (!isValid) {
        // Add a generic error since isQueryValid only returns boolean
        errors.push({
          line: 1,
          message: 'Invalid SOQL syntax',
          severity: 'error'
        });
      }
      
      return { 
        isValid, 
        errors 
      };
    } catch (error) {
      // If the parser itself throws an error, treat it as a validation error
      errors.push({
        line: 1,
        message: `Query validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'error'
      });
      
      return { 
        isValid: false, 
        errors 
      };
    }
  }
};
