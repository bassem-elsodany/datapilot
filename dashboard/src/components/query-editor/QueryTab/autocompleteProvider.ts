/**
 * @fileoverview Autocomplete Provider Module
 * 
 * This module provides autocomplete suggestions for SOQL queries including fields,
 * relationships, keywords, and functions based on the current context.
 * 
 * Why we need this:
 * - SOQL has many keywords, functions, and SObject-specific fields
 * - Users need intelligent suggestions while typing queries
 * - Must provide context-aware suggestions based on current SObject
 * - Integrates with Monaco editor's completion system
 * 
 * Key Functions:
 * - getSObjectFields: Fetches fields for a specific SObject from Salesforce
 * - getSObjectRelationships: Fetches child relationships for an SObject
 * - createKeywordSuggestions: Creates SOQL keyword suggestions
 * - createFunctionSuggestions: Creates SOQL function suggestions
 * - createFieldSuggestions: Creates field suggestions for SObjects
 * - createRelationshipSuggestions: Creates relationship suggestions
 * - filterValidSuggestions: Filters out invalid completion items
 * 
 * Integration:
 * - Used by QueryTab.tsx autocomplete provider
 * - Works with contextDetection.ts to provide context-aware suggestions
 * - Uses relationshipResolver.ts to resolve relationship targets
 */

import { apiService } from '../../../services/ApiService';
import { connectionManager } from '../../../services/ConnectionManager';
import { logger } from '../../../services/Logger';
import { SObjectCacheService } from '../../../services/SObjectCacheService';
import { SalesforceService } from '../../../services/SalesforceService';

/**
 * describeWithCache(sobjectName: string)
 * - Uses SObjectCacheService's unified caching mechanism
 * - Cache key format: {connection_uuid}_{sobject_name}
 * - 24-hour TTL with LRU eviction
 * - Validates SObject name before making API calls
 */
async function describeWithCache(sobjectName: string, connectionUuid?: string) {
  // Skip API calls for incomplete SObject names - just return null silently
  if (!sobjectName || sobjectName.length < 3 || sobjectName.match(/^[a-z]+__$/)) {
    return null;
  }
  
  return await SObjectCacheService.getInstance().getSObject(sobjectName, connectionUuid, true); // Suppress errors for autocomplete
}

// Error suggestion helper
export function createErrorSuggestion(message: string, monaco: any, position?: any) {
  // Create a default range if position is provided
  const defaultRange = position ? {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: position.column,
    endColumn: position.column
  } : undefined;
  
  return {
    label: `⚠️ ${message}`,
    kind: monaco.languages.CompletionItemKind.Text,
    insertText: '',
    detail: 'Autocomplete Error',
    documentation: message,
    sortText: '0_ERROR',
    range: defaultRange
  };
}

// Get SObject suggestions for autocomplete (for main query FROM clause)
export async function getSObjectSuggestions(partialName: string = '', monaco: any, position?: any, connectionUuid?: string | null) {
  try {
    
    // Get connection UUID from parameter or localStorage
    const connUuid = connectionUuid || localStorage.getItem('currentConnectionUuid');
    if (!connUuid) {
      return [createErrorSuggestion('No connection available', monaco, position)];
    }

    // Get SObjects using the same method as SchemaTree
    const allSObjects = await SalesforceService.getSObjectList(connUuid);
    if (!allSObjects || !Array.isArray(allSObjects)) {
      return [createErrorSuggestion('Failed to load SObject list', monaco, position)];
    }
    const filteredObjects = allSObjects.filter(obj => 
      obj.toLowerCase().includes(partialName.toLowerCase())
    );
    

    // Create a default range if position is provided
    const defaultRange = position ? {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: position.column,
      endColumn: position.column
    } : undefined;
    
    // Convert to Monaco completion items
    return filteredObjects.map(obj => ({
      label: obj,
      kind: monaco.languages.CompletionItemKind.Class,
      insertText: obj,
      detail: `SObject - ${obj}`,
      documentation: `Salesforce ${obj} object`,
      range: defaultRange
    }));

  } catch (error) {
    logger.warn('Failed to get SObject suggestions', 'QueryTab', { partialName, error });
    return [createErrorSuggestion('Failed to load SObject suggestions', monaco, position)];
  }
}

// Use SObject name directly from metadata - NO HARDCODING
async function normalizeSObjectName(sobjectName: string, parentName?: string) {
  // Just return the SObject name as-is - let Salesforce metadata handle the rest
  return sobjectName;
}

// Get SObject fields for autocomplete
export const getSObjectFields = async (sobjectName: string, connectionUuid?: string, monaco?: any, position?: any) => {
  try {
    if (!sobjectName) {
      if (monaco) return [createErrorSuggestion('No SObject name available', monaco, position)];
      return null;
    }
    let normalized: string;
    try {
      normalized = await normalizeSObjectName(sobjectName);
    } catch (err) {
      // normalizeSObjectName failed for sobjectName - using original name
      if (monaco) {
        let msg = 'Could not resolve relationship SObject';
        if (err instanceof Error) {
          if (err.message === 'relationship_name_requires_parent') {
            msg = 'Parent SObject required to resolve relationship';
          } else if (err.message === 'relationship_resolution_failed') {
            msg = 'Relationship resolution failed';
          }
        }
        return [createErrorSuggestion(msg, monaco, position)];
      }
      return null;
    }
    logger.debug('Getting SObject fields for autocomplete', 'QueryTab', { sobjectName: normalized });
    // Use describeWithCache for SObject metadata
    let sobject;
    try {
      sobject = await describeWithCache(normalized, connectionUuid);
    } catch (err) {
      // Suppress errors during autocomplete - user might still be typing
      // Don't log or show notifications for incomplete SObject names
      if (monaco) {
        return []; // Return empty array instead of error suggestion
      }
      return null;
    }
    if (sobject && sobject.fields) {
      const fields = sobject.fields.map(field => ({
        name: field.name,
        type: field.type,
        description: field.label || field.name,
        referenceTo: field.referenceTo || [],
        relationshipName: field.relationshipName || ''
      }));
      return fields;
    }
    if (monaco) return []; // Return empty array instead of error suggestion
    return null;
  } catch (error) {
    // Suppress error logging during autocomplete - user might still be typing
    if (monaco) return []; // Return empty array instead of error suggestion
    return null;
  }
};

// Get SObject relationships for autocomplete
export const getSObjectRelationships = async (sobjectName: string, connectionUuid?: string, monaco?: any, position?: any) => {
  try {
    if (!sobjectName) {
      if (monaco) return [createErrorSuggestion('No SObject name available', monaco, position)];
      return null;
    }
    let normalized: string;
    try {
      normalized = await normalizeSObjectName(sobjectName);
    } catch (err) {
      // normalizeSObjectName failed for sobjectName - using original name
      if (monaco) {
        let msg = 'Could not resolve relationship SObject';
        if (err instanceof Error) {
          if (err.message === 'relationship_name_requires_parent') {
            msg = 'Parent SObject required to resolve relationship';
          } else if (err.message === 'relationship_resolution_failed') {
            msg = 'Relationship resolution failed';
          }
        }
        return [createErrorSuggestion(msg, monaco, position)];
      }
      return null;
    }
    logger.debug('Getting SObject relationships for autocomplete', 'QueryTab', { sobjectName: normalized });
    // Use describeWithCache for SObject metadata
    let sobject;
    try {
      sobject = await describeWithCache(normalized, connectionUuid);
    } catch (err) {
      // Suppress errors during autocomplete - user might still be typing
      // Don't log or show notifications for incomplete SObject names
      if (monaco) return []; // Return empty array instead of error suggestion
      return null;
    }
    if (sobject && sobject.childRelationships) {
      
      return sobject.childRelationships
        .filter(rel => rel.relationshipName && rel.relationshipName.trim()) // Filter out null/empty relationship names
        .map(rel => {
          
          // Use the relationship name directly from Salesforce metadata
          const relationshipName = rel.relationshipName;
          
          return {
            name: relationshipName, // This is the relationship name (e.g., OCE__Invoices__r)
            childSObject: rel.childSObject, // This is the child SObject name (e.g., OCE__Invoice__c)
            type: rel.relationshipName
          };
        });
    }
    if (monaco) return []; // Return empty array instead of error suggestion
    return null;
  } catch (error) {
    // Suppress error logging during autocomplete - user might still be typing
    if (monaco) return []; // Return empty array instead of error suggestion
    return null;
  }
};

// SOQL Keywords for autocomplete
export const getSOQLKeywords = () => [
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'IS', 'NULL',
  'ORDER BY', 'GROUP BY', 'HAVING', 'LIMIT', 'OFFSET', 'DISTINCT', 'COUNT',
  'SUM', 'AVG', 'MAX', 'MIN', 'AS', 'ASC', 'DESC', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  'COALESCE', 'NVL', 'TO_DATE()', 'TO_CHAR()', 'SUBSTR()', 'TRIM()', 'UPPER()', 'LOWER()',
  'TODAY', 'YESTERDAY', 'TOMORROW', 'THIS_WEEK', 'LAST_WEEK', 'NEXT_WEEK',
  'THIS_MONTH', 'LAST_MONTH', 'NEXT_MONTH', 'THIS_QUARTER', 'LAST_QUARTER', 'NEXT_QUARTER',
  'THIS_YEAR', 'LAST_YEAR', 'NEXT_YEAR', 'FISCAL_YEAR', 'FISCAL_QUARTER'
];

// SOQL Functions for autocomplete
export const getSOQLFunctions = () => [
  { name: 'COUNT()', description: 'Count records' },
  { name: 'SUM()', description: 'Sum numeric values' },
  { name: 'AVG()', description: 'Average numeric values' },
  { name: 'MAX()', description: 'Maximum value' },
  { name: 'MIN()', description: 'Minimum value' },
  { name: 'TO_DATE()', description: 'Convert to date' },
  { name: 'TO_CHAR()', description: 'Convert to string' },
  { name: 'SUBSTR()', description: 'Substring function' },
  { name: 'TRIM()', description: 'Trim whitespace' },
  { name: 'UPPER()', description: 'Convert to uppercase' },
  { name: 'LOWER()', description: 'Convert to lowercase' },
  { name: 'COALESCE()', description: 'Return first non-null value' },
  { name: 'NVL()', description: 'Null value replacement' }
];

// Create Monaco completion items for keywords
export const createKeywordSuggestions = (monaco: any) => {
  const keywords = getSOQLKeywords();
  return keywords.map(keyword => ({
    label: keyword,
    kind: monaco.languages.CompletionItemKind.Keyword,
    insertText: keyword,
    detail: 'SOQL Keyword',
    sortText: `0_${keyword}` // Prioritize keywords
  }));
};

// Create Monaco completion items for functions
export const createFunctionSuggestions = (monaco: any) => {
  const functions = getSOQLFunctions();
  return functions.map(func => ({
    label: func.name,
    kind: monaco.languages.CompletionItemKind.Function,
    insertText: func.name,
    detail: 'SOQL Function',
    documentation: func.description,
    sortText: `7_function_${func.name}`
  }));
};

// Create Monaco completion items for fields with smart autocomplete for reference fields
export const createFieldSuggestions = (fields: any[], sobjectName: string, monaco: any, position?: any) => {
  const suggestions = [];
  
  // Create a default range if position is provided
  const defaultRange = position ? {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: position.column,
    endColumn: position.column
  } : undefined;
  
  for (const field of fields) {
    // Skip relationship fields - they should be handled by relationship suggestions
    // Relationship fields are identified by their type being 'reference' with relationshipName property
    const isRelationshipField = field.type === 'reference' && field.relationshipName;
    if (isRelationshipField) {
      continue;
    }
    
    // Check if this is a reference field (lookup/master-detail) but NOT a relationship field
    const isReferenceField = (field.type === 'reference' || field.type === 'masterdetail') && 
                           field.referenceTo && 
                           Array.isArray(field.referenceTo) && 
                           field.referenceTo.length > 0 &&
                           !field.relationshipName; // Exclude relationship fields
    
    if (isReferenceField) {
      // For reference fields, automatically suggest subquery format
      const referencedSObject = field.referenceTo[0]; // Use first referenced SObject
      
      const suggestion = {
        label: field.name,
        kind: monaco.languages.CompletionItemKind.Field,
        insertText: `(SELECT Id FROM ${referencedSObject})`,
        detail: `${sobjectName} field → ${referencedSObject}`,
        documentation: `Reference field: ${field.description || field.name} → Creates subquery to get related ${referencedSObject} records`,
        sortText: `1_${field.name}`,
        source: 'reference_field',
        range: defaultRange
      };
      
      suggestions.push(suggestion);
    } else {
      // Regular field
      const suggestion = {
        label: field.name,
        kind: monaco.languages.CompletionItemKind.Field,
        insertText: field.name,
        detail: `${sobjectName} field`,
        documentation: `${field.type || 'Unknown'} - ${field.description || field.name}`,
        sortText: `2_${field.name}`,
        source: 'regular_field',
        range: defaultRange
      };
      
      suggestions.push(suggestion);
    }
  }
  
  return suggestions;
};

// Create Monaco completion items for relationships with smart subquery suggestions
export const createRelationshipSuggestions = (relationships: any[], monaco: any, position?: any) => {
  // Create a default range if position is provided
  const defaultRange = position ? {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: position.column,
    endColumn: position.column
  } : undefined;
  
  const suggestions = relationships.map(rel => {
    // Use the actual childSObject from Salesforce metadata - NO HARDCODING
    const childSObject = rel.childSObject;
    // rel.name is the relationship name, use it directly
    const relationshipName = rel.name;
    
    const suggestion = {
      label: relationshipName,
      kind: monaco.languages.CompletionItemKind.Field,
      insertText: `(SELECT Id FROM ${rel.name})`, // Insert subquery with relationship name
      detail: `Relationship to ${childSObject || 'Unknown'}`,
      documentation: `Child relationship to ${childSObject || 'Unknown'} → Creates subquery to get related records`,
      sortText: `3_${relationshipName}`,
      source: 'relationship',
      range: defaultRange
    };
    
    return suggestion;
  });
  
  return suggestions;
};

// Create test suggestion to verify autocomplete is working
export const createTestSuggestion = (monaco: any) => ({
  label: 'TEST_AUTOCOMPLETE',
  kind: monaco.languages.CompletionItemKind.Text,
  insertText: 'TEST_AUTOCOMPLETE',
  detail: 'Test - Auto-complete is working',
  sortText: `0_TEST`
});

// Create nesting level indicator suggestion
export const createNestingLevelSuggestion = (nestingLevel: number, monaco: any) => ({
  label: `[Level ${nestingLevel}]`,
  kind: monaco.languages.CompletionItemKind.Text,
  insertText: '',
  detail: 'Nesting Level',
  documentation: `Currently at nesting level ${nestingLevel}`,
  sortText: `8_level_${nestingLevel}`
});

// Filter out invalid completion items and deduplicate by label
export const filterValidSuggestions = (suggestions: any[]) => {
  const validItems = suggestions.filter(item => {
    if (!item || typeof item.label !== 'string' || !item.label.trim()) {
      return false;
    }
    return true;
  });

  // Deduplicate by label - keep the first occurrence of each unique label
  const seen = new Map<string, any>();
  const deduplicated = validItems.filter(item => {
    if (seen.has(item.label)) {
      return false;
    }
    seen.set(item.label, item);
    return true;
  });

  return deduplicated;
};
export { describeWithCache };