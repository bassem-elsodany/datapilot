/**
 * @fileoverview Enhanced SOQL Query Parser Module
 * 
 * This module provides enhanced SOQL parsing with precise offset information for
 * context-aware autocomplete in complex nested queries.
 * 
 * Features:
 * - Offset-based parsing for precise cursor position detection
 * - Context-aware autocomplete for nested subqueries
 * - Professional SOQL formatting
 * - Metadata enrichment with actual SObject names
 * 
 * Key Functions:
 * - parseQueryStructure: Main entry point for parsing queries
 * - parseSoql: Enhanced SOQL parsing with offset information and metadata enrichment
 * - formatSOQLQuery: Professional SOQL formatting using local parser
 * - getAutocompleteContext: Context-aware autocomplete using offset-based parsing
 */

// Legacy external library imports removed - using local enhanced parser only
import { 
  parseQuery as parseQueryWithOffsets, 
  findContextAtCursor, 
  ContextInfo,
  formatQuery
} from '../../soql';
import { describeWithCache } from './autocompleteProvider';
import { getConnectionUuidFromSession } from '../../../services/ApiService';

// Parse the entire query structure using our enhanced parser with enrichment
export async function parseQueryStructure(query: string, cursorOffset: number, connectionUuid?: string | null) {
  try {
    // Use our enhanced parser and enrich with metadata
    const enrichedAST = await parseSoql(query, connectionUuid);
    return enrichedAST;
  } catch (error) {
    // Parsing structure error - return null for graceful handling
    return null;
  }
}

// Legacy functions removed - replaced by enhanced offset-based parser

// Legacy buildTreeStructure function removed - replaced by enhanced offset-based parser

// Legacy QueryNode interface removed - no longer needed with enhanced parser

/**
 * Enhanced SOQL parsing with offset information and metadata enrichment.
 * Parses the query and enriches it with actual SObject names from Salesforce metadata.
 */
export async function parseSoql(query: string, connectionUuid?: string | null): Promise<any> {
  let ast: any;
  try {
    // Use our new enhanced parser with offset information
    ast = parseQueryWithOffsets(query, {
      allowPartialQuery: true,
      ignoreParseErrors: true,
      logErrors: false
    });
  } catch (e) {
    // SOQL parsing failed - return null for graceful handling
    return null;
  }
  
  if (!ast) {
    // Parse query returned null/undefined
    return null;
  }
  
  if (!ast.sObject) {
    // Parse query result missing sObject property
    return null;
  }


  // Check if connection UUID exists from parameter or session context
  let connUuid: string | null = connectionUuid || null;
  if (!connUuid) {
    try {
      connUuid = getConnectionUuidFromSession();
    } catch (error) {
      // No connection UUID found in session context - returning basic AST without metadata enrichment
      return ast; // Return original AST if no connection
    }
  } else {
  }

  // Enrich the AST with actual SObject names
  async function enrichAST(astNode: any): Promise<any> {
    // Removed verbose enrichAST start logs
    
    // Get metadata for this SObject to find relationships
    let relationships: any[] = [];
    
    // Only fetch metadata for complete SObject names (at least 3 characters)
    if (astNode.sObject && astNode.sObject.length >= 3) {
      try {
        const metadata = await describeWithCache(astNode.sObject);
        relationships = metadata.childRelationships || [];
      } catch (e) {
        // Failed to get metadata for SObject - continue without enrichment
      }
    } else {
    }

    // Process fields to find subqueries and enrich relationship fields
    if (astNode.fields && Array.isArray(astNode.fields)) {
      for (const field of astNode.fields) {
        if (field.type === "FieldSubquery" && field.subquery) {
          // Find the actual SObject name by matching relationshipName with relationships
          let actualSObjectName = field.subquery.relationshipName; // Default to relationship name
          const relationshipFieldName = field.subquery.relationshipName; // Keep original relationship field name
          
          // Loop over relationship list to find which item relates to this field
          for (const rel of relationships) {
            if (rel.relationshipName === field.subquery.relationshipName) {
              actualSObjectName = rel.childSObject; // Get the actual SObject name
              break;
            }
          }

          // Add relationshipFieldName to the field
          field.relationshipFieldName = relationshipFieldName;
          field.actualSObjectName = actualSObjectName;
          field.relationshipName = relationshipFieldName; // Ensure relationshipName is preserved
          
          // Set the field property for FieldSubquery objects (needed for Graph → AST conversion)
          if (!field.field) {
            field.field = relationshipFieldName;
          }
          

          // Recursively enrich nested subqueries
          if (field.subquery.fields && Array.isArray(field.subquery.fields)) {
            // Create a proper AST structure for the subquery
            const subqueryAST = {
              sObject: actualSObjectName,
              relationshipName: relationshipFieldName, // Preserve the relationship name
              fields: field.subquery.fields
            };
            const enrichedSubquery = await enrichAST(subqueryAST);
            field.subquery = enrichedSubquery;
            
            // Also process any nested FieldSubquery objects within the subquery
            for (const subField of field.subquery.fields) {
              if (subField.type === "FieldSubquery" && subField.subquery) {
        // Removed verbose nested FieldSubquery processing logs
                
                // Set the field property for nested FieldSubquery objects
                if (!subField.field) {
                  subField.field = subField.subquery.relationshipName || subField.relationshipFieldName;
                  // Removed verbose field property setting logs
                }
              }
            }
          }
        } else if (field.type === "FieldRelationship") {
          // Enrich FieldRelationship with metadata
          // The relationship name is the last part of the relationships array
          if (field.relationships && field.relationships.length > 0) {
            const relationshipName = field.relationships[field.relationships.length - 1];
            field.relationshipName = relationshipName;
            field.relationshipFieldName = relationshipName;
            
            // Removed verbose FieldRelationship debug logs
          }
        }
      }
    }

    // Removed verbose enrichAST end logs
    
    // Process top-level subqueries (not just FieldSubquery fields)
    if (astNode.subqueries && Array.isArray(astNode.subqueries)) {
      for (const subquery of astNode.subqueries) {
        if (subquery.relationshipName) {
          // Find the actual SObject name by matching relationshipName with relationships
          let actualSObjectName = subquery.relationshipName; // Default to relationship name
          
          // Loop over relationship list to find which item relates to this subquery
          for (const rel of relationships) {
            if (rel.relationshipName === subquery.relationshipName) {
              actualSObjectName = rel.childSObject; // Get the actual SObject name
              break;
            }
          }
          
          // Update the subquery with the actual SObject name
          subquery.sObject = actualSObjectName;
          
          // Removed verbose subquery debug logs
        }
      }
    }
    
    return astNode;
  }

  const enrichedAST = await enrichAST(ast);
  
  // Removed verbose final enriched AST debug logs
  
  return enrichedAST;
}

// Legacy parsing functions removed - replaced by enhanced offset-based parser

// Professional SOQL formatter using our local enhanced parser
export const formatSOQLQuery = (query: string): string => {
  // Use our local formatQuery with enhanced options
  const formatted = formatQuery(query, {
    // Formatting options for professional SOQL formatting
    numIndent: 1,                           // Use 2 spaces for indentation (more readable)
    fieldMaxLineLength: 1,                // The number of characters that the fields should take up before making a new line. Set this to 1 to have every field on its own line.	
    fieldSubqueryParensOnOwnLine: true,     // Put subquery parentheses on new lines
    whereClauseOperatorsIndented: true,     // Indent operators in WHERE clauses
    newLineAfterKeywords: true,            // Add new lines after keywords
    logging: false                          // Disable debug logging
  }, {
    // Parse options for better formatting
    allowPartialQuery: true,                // Allow incomplete queries
    ignoreParseErrors: true,                // Continue even with syntax errors
    logErrors: false                        // Don't spam console
  });
  return formatted;
};

// Legacy functions removed - not needed with enhanced parser

/**
 * Enhanced context-aware function to get autocomplete context
 * Uses our new offset-based parser for precise cursor detection
 * Updated to fix cursor context detection issues
 */
export async function getAutocompleteContext(model: any, position: any, connectionUuid?: string | null): Promise<{
  context: ContextInfo;
  ast: any;
} | null> {
  const currentQuery = model.getValue();
  const cursorOffset = model.getOffsetAt(position);
  
  // Parse with our enhanced parser - no fallback needed
  const ast = await parseSoql(currentQuery, connectionUuid);
  if (!ast) {
    return null;
  }
  
  // Get context using our cursor mapper
  const context = findContextAtCursor(ast, cursorOffset);
  
  
  return {
    context,
    ast
  };
}
