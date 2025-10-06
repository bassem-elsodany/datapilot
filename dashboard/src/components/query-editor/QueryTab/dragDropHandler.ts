/**
 * @fileoverview Drag and Drop Handler Module
 * 
 * This module handles drag and drop operations for SObjects and fields from the
 * schema tree into the SOQL query editor, automatically building appropriate queries.
 * 
 * Why we need this:
 * - Users can drag SObjects and fields from the schema tree to build queries
 * - Automatically detects relationships between SObjects and builds subqueries
 * - Handles both simple field drops and complex relationship-based query construction
 * - Provides intelligent query building based on Salesforce metadata
 * 
 * Key Functions:
 * - handleDragDrop: Main entry point for all drag and drop operations
 * - handleFieldDrop: Handles dropping individual fields into queries
 * - handleRelationshipFieldDrop: Handles dropping relationship fields
 * - detectSObjectRelationship: Detects relationships between SObjects using metadata
 * - detectNestedRelationship: Handles nested relationship detection
 * - buildNestedSubquery: Builds subquery strings for relationships
 * 
 * Supported Operations:
 * - Drop SObject: Creates new query or adds subquery if relationship exists
 * - Drop Field: Adds field to existing query or creates new query
 * - Drop Relationship: Builds appropriate subquery based on relationship type
 * - Smart Detection: Automatically detects master-detail, lookup, and nested relationships
 */

import { apiService, getConnectionUuidFromSession } from '../../../services/ApiService';
import { logger } from '../../../services/Logger';
import { parseSoql } from './queryParser';
import { composeQuery } from '../../soql';
import { Query, Field } from '../../../components/soql/api/api-models';
import { notificationService } from '../../../services/NotificationService';
import { i18nService } from '../../../services/I18nService';
import { IconCheck, IconAlertTriangle, IconInfoCircle } from '@tabler/icons-react';
import React from 'react';

/**
 * Convert AST back to SOQL query string
 */
async function convertASTToSOQL(ast: Query): Promise<string> {
  try {
    // Debug: Log the AST structure before conversion
    
    const result = composeQuery(ast, { format: true });
    
    // Debug: Log the result
    
    return result;
  } catch (error) {
    logger.error('Failed to convert AST to SOQL', 'QueryTab', { error });
    throw error;
  }
}

/**
 * Find existing subquery for a given SObject name
 */
function findExistingSubquery(ast: any, sobjectName: string): { relationshipName: string; subquery: any } | null {
  if (!ast.fields) return null;
  
  for (const field of ast.fields) {
    if (field.type === 'FieldSubquery' && field.subquery) {
      // Check if the subquery's sObject matches (case-insensitive)
      if (field.subquery.sObject && 
          field.subquery.sObject.toLowerCase() === sobjectName.toLowerCase()) {
        return {
          relationshipName: field.relationshipName,
          subquery: field.subquery
        };
      }
      
      // Check using the enriched AST data (actualSObjectName from metadata)
      if (field.actualSObjectName && field.actualSObjectName.toLowerCase() === sobjectName.toLowerCase()) {
        return {
          relationshipName: field.relationshipName,
          subquery: field.subquery
        };
      }
      
      // Fallback: Check if the subquery's sObject matches the target SObject
      if (field.subquery && field.subquery.sObject && 
          field.subquery.sObject.toLowerCase() === sobjectName.toLowerCase()) {
        return {
          relationshipName: field.relationshipName,
          subquery: field.subquery
        };
      }
    }
  }
  
  return null;
}

/**
 * AST-based field insertion function
 * Finds the target SObject in the AST and adds the field to it
 */
export const insertFieldIntoAST = async (
  dragData: { fieldName: string; sobjectName: string }, 
  query: string,
  connectionUuid?: string | null
): Promise<string> => {
  
  // Store the original query to ensure we return it exactly if no changes are made
  const originalQuery = query;
  
  try {
    // Parse the current query to get AST
    const ast = await parseSoql(query, connectionUuid);
    if (!ast) {
      logger.warn('Failed to parse query for AST-based field insertion', 'QueryTab');
      
      // Show error notification
      notificationService.error({
        title: i18nService.tSync('query.dragDrop.parseError.title') || 'Parse Error',
        message: i18nService.tSync('query.dragDrop.parseError.message') || 'Failed to parse query',
        icon: React.createElement(IconAlertTriangle, { size: 16 }),
      });
      
      return originalQuery; // Return original query if parsing fails
    }
    
    // Debug: Log the original AST structure
    
    // Find the target SObject in the AST
    const targetSObject = findSObjectInAST(ast, dragData.sobjectName);
    if (!targetSObject) {
      const availableSObjects = getAllSObjectsFromAST(ast);
      logger.warn('Target SObject not found in AST', 'QueryTab', { 
        targetSObject: dragData.sobjectName,
        availableSObjects: availableSObjects,
        astStructure: {
          mainSObject: ast.sObject,
          fieldsCount: ast.fields?.length || 0,
          fieldTypes: ast.fields?.map(f => f.type) || []
        }
      });
      
      // Try to detect if this could be a related SObject that should be added to an existing subquery
      if (ast.sObject) {
        
        // First, check if there's already a subquery for this SObject
        const existingSubquery = findExistingSubquery(ast, dragData.sobjectName);
        logger.debug('Checking for existing subquery', 'QueryTab', { 
          sobjectName: dragData.sobjectName,
          foundSubquery: !!existingSubquery,
          relationshipName: existingSubquery?.relationshipName
        });
        
        if (existingSubquery) {
          
          // Add the field to the existing subquery
          const updatedAST = JSON.parse(JSON.stringify(ast)); // Deep copy to avoid modifying original AST
          const subqueryField = updatedAST.fields.find(field => 
            field.type === 'FieldSubquery' && 
            field.relationshipName === existingSubquery.relationshipName
          );
          
          if (subqueryField && subqueryField.subquery) {
            if (!subqueryField.subquery.fields) {
              subqueryField.subquery.fields = [];
            }
            
            // Check if field already exists
            const fieldExists = subqueryField.subquery.fields.some(f => 
              f.type === 'Field' && f.field === dragData.fieldName
            );
            
            if (!fieldExists) {
              subqueryField.subquery.fields.push({
                type: 'Field',
                field: dragData.fieldName,
                startOffset: 0,
                endOffset: dragData.fieldName.length
              });
              
              // Debug: Log the AST structure before conversion
              
              // Convert the updated AST back to SOQL
              const updatedQuery = await convertASTToSOQL(updatedAST);
              
              // Show success notification
              notificationService.success({
                title: i18nService.tSync('query.dragDrop.fieldAdded.title') || 'Field Added',
                message: i18nService.tSync('query.dragDrop.fieldAdded.message', { 
                  fieldName: dragData.fieldName,
                  sobjectName: dragData.sobjectName,
                  relationshipName: existingSubquery.relationshipName
                }) || `Added field "${dragData.fieldName}" to existing subquery "${existingSubquery.relationshipName}"`,
                icon: React.createElement(IconCheck, { size: 16 }),
              });
              
              return updatedQuery;
            } else {
              // Field already exists
              notificationService.info({
                title: i18nService.tSync('query.dragDrop.fieldExists.title') || 'Field Already Exists',
                message: i18nService.tSync('query.dragDrop.fieldExists.message', { 
                  fieldName: dragData.fieldName,
                  sobjectName: dragData.sobjectName
                }) || `Field "${dragData.fieldName}" already exists in the query`,
                icon: React.createElement(IconInfoCircle, { size: 16 }),
                autoClose: 3000,
              });
              
              return originalQuery; // Return original query unchanged
            }
          }
        }
        
        // If no existing subquery found, check if there's a relationship to create a new subquery
        const relationshipInfo = await detectSObjectRelationship(ast.sObject, dragData.sobjectName, connectionUuid);
        if (relationshipInfo) {
          
          // Create a subquery for the related SObject
          const subqueryField = {
            type: 'FieldSubquery',
            relationshipName: relationshipInfo.relationshipName,
            subquery: {
              sObject: dragData.sobjectName,
              relationshipName: relationshipInfo.relationshipName, // Add relationshipName to subquery
              fields: [{
                type: 'Field',
                field: dragData.fieldName,
                startOffset: 0,
                endOffset: dragData.fieldName.length
              }]
            },
            startOffset: 0,
            endOffset: 0
          };
          
          // Add the subquery field to the AST
          const updatedAST = JSON.parse(JSON.stringify(ast)); // Deep copy to avoid modifying original AST
          if (!updatedAST.fields) {
            updatedAST.fields = [];
          }
          updatedAST.fields.push(subqueryField);
          
          // Convert the updated AST back to SOQL
          const updatedQuery = await convertASTToSOQL(updatedAST);
          
          // Show success notification
          notificationService.success({
            title: i18nService.tSync('query.dragDrop.subqueryCreated.title') || 'Subquery Created',
            message: i18nService.tSync('query.dragDrop.subqueryCreated.message', { 
              fieldName: dragData.fieldName,
              sobjectName: dragData.sobjectName,
              relationshipName: relationshipInfo.relationshipName
            }) || `Added field "${dragData.fieldName}" from related SObject "${dragData.sobjectName}" as a subquery`,
            icon: React.createElement(IconCheck, { size: 16 }),
          });
          
          return updatedQuery;
        }
      }
      
      // Show warning notification with more detailed information
      notificationService.warning({
        title: i18nService.tSync('query.dragDrop.sobjectNotFound.title'),
        message: i18nService.tSync('query.dragDrop.sobjectNotFound.message', { 
          sobjectName: dragData.sobjectName,
          availableSObjects: availableSObjects.length > 0 ? availableSObjects.join(', ') : 'None found'
        }),
        icon: React.createElement(IconAlertTriangle, { size: 16 }),
      });
      
      return originalQuery; // Return original query if SObject not found
    }
    
    // Check if field already exists
    if (fieldExistsInSObject(targetSObject, dragData.fieldName)) {
      
      // Show info notification
      notificationService.info({
        title: i18nService.tSync('query.dragDrop.fieldExists.title'),
        message: i18nService.tSync('query.dragDrop.fieldExists.message', { 
          fieldName: dragData.fieldName,
          sobjectName: dragData.sobjectName
        }),
        icon: React.createElement(IconInfoCircle, { size: 16 }),
        autoClose: 3000,
      });
      
      return originalQuery; // Return original query if field already exists
    }
    
    // Add the field to the target SObject
    addFieldToSObject(targetSObject, dragData.fieldName);
    
    // Compose the updated query from the modified AST
    const updatedQuery = composeQuery(ast, {
      format: true,
      formatOptions: {
        numIndent: 1,
        fieldMaxLineLength: 1,
        fieldSubqueryParensOnOwnLine: true,
        whereClauseOperatorsIndented: true,
        newLineAfterKeywords: true
      }
    });
    
    
    // Show success notification
    notificationService.success({
      title: i18nService.tSync('query.dragDrop.fieldAdded.title'),
      message: i18nService.tSync('query.dragDrop.fieldAdded.message', { 
        fieldName: dragData.fieldName,
        sobjectName: dragData.sobjectName
      }),
      icon: React.createElement(IconCheck, { size: 16 }),
      autoClose: 3000,
    });
    
    return updatedQuery;
    
  } catch (error) {
    logger.error('Error in AST-based field insertion', 'QueryTab', null, error as Error);
    
    // Show error notification
    notificationService.error({
      title: i18nService.tSync('query.dragDrop.insertionError.title'),
      message: i18nService.tSync('query.dragDrop.insertionError.message', { 
        fieldName: dragData.fieldName,
        sobjectName: dragData.sobjectName
      }),
      icon: React.createElement(IconAlertTriangle, { size: 16 }),
    });
    
    return originalQuery; // Return original query on error
  }
};

/**
 * Find SObject in AST (supports nested subqueries and relationship fields)
 */
function findSObjectInAST(ast: Query, targetSObjectName: string): Query | null {
  // Check main query (exact match)
  if (ast.sObject === targetSObjectName) {
    return ast;
  }
  
  // Check main query (case-insensitive match)
  if (ast.sObject && ast.sObject.toLowerCase() === targetSObjectName.toLowerCase()) {
    return ast;
  }
  
  // Check FieldSubqueries recursively (subqueries are represented as FieldSubquery fields)
  if (ast.fields && ast.fields.length > 0) {
    for (const field of ast.fields) {
      if (field.type === 'FieldSubquery' && field.subquery) {
        const found = findSObjectInAST(field.subquery, targetSObjectName);
        if (found) {
          return found;
        }
      }
      
      // Check FieldRelationship fields - they might contain the target SObject
      if (field.type === 'FieldRelationship') {
        const relationshipField = field as any;
        // Check if any of the relationships match the target SObject (exact match)
        if (relationshipField.relationships && relationshipField.relationships.includes(targetSObjectName)) {
          // Create a virtual Query object for this relationship
          return {
            sObject: targetSObjectName,
            fields: [],
            // Add other required properties with defaults
            sObjectStartOffset: relationshipField.startOffset || 0,
            sObjectEndOffset: relationshipField.endOffset || 0
          } as Query;
        }
        
        // Check case-insensitive match for relationships
        if (relationshipField.relationships) {
          const matchingRelationship = relationshipField.relationships.find((rel: string) => 
            rel.toLowerCase() === targetSObjectName.toLowerCase()
          );
          if (matchingRelationship) {
            return {
              sObject: matchingRelationship,
              fields: [],
              sObjectStartOffset: relationshipField.startOffset || 0,
              sObjectEndOffset: relationshipField.endOffset || 0
            } as Query;
          }
        }
      }
      
      // Check FieldRelationshipWithAlias fields
      if ((field as any).type === 'FieldRelationshipWithAlias') {
        const relationshipField = field as any;
        // Exact match
        if (relationshipField.relationships && relationshipField.relationships.includes(targetSObjectName)) {
          return {
            sObject: targetSObjectName,
            fields: [],
            sObjectStartOffset: relationshipField.startOffset || 0,
            sObjectEndOffset: relationshipField.endOffset || 0
          } as Query;
        }
        
        // Case-insensitive match
        if (relationshipField.relationships) {
          const matchingRelationship = relationshipField.relationships.find((rel: string) => 
            rel.toLowerCase() === targetSObjectName.toLowerCase()
          );
          if (matchingRelationship) {
            return {
              sObject: matchingRelationship,
              fields: [],
              sObjectStartOffset: relationshipField.startOffset || 0,
              sObjectEndOffset: relationshipField.endOffset || 0
            } as Query;
          }
        }
      }
    }
  }
  
  return null;
}

/**
 * Get all SObject names from AST (for debugging)
 */
function getAllSObjectsFromAST(ast: Query): string[] {
  const sObjects: string[] = [];
  
  if (ast.sObject) {
    sObjects.push(ast.sObject);
  }
  
  // Check FieldSubqueries recursively (subqueries are represented as FieldSubquery fields)
  if (ast.fields && ast.fields.length > 0) {
    for (const field of ast.fields) {
      if (field.type === 'FieldSubquery' && field.subquery) {
        sObjects.push(...getAllSObjectsFromAST(field.subquery));
      }
      
      // Check FieldRelationship fields for SObject names
      if (field.type === 'FieldRelationship') {
        const relationshipField = field as any;
        if (relationshipField.relationships) {
          sObjects.push(...relationshipField.relationships);
        }
      }
      
      // Check FieldRelationshipWithAlias fields for SObject names
      if ((field as any).type === 'FieldRelationshipWithAlias') {
        const relationshipField = field as any;
        if (relationshipField.relationships) {
          sObjects.push(...relationshipField.relationships);
        }
      }
    }
  }
  
  return sObjects;
}

/**
 * Check if field already exists in SObject
 */
function fieldExistsInSObject(sObject: Query, fieldName: string): boolean {
  if (!sObject.fields || sObject.fields.length === 0) {
    return false;
  }
  
  return sObject.fields.some(field => {
    if (field.type === 'Field' || field.type === 'FieldRelationship') {
      return field.field === fieldName;
    }
    return false;
  });
}

/**
 * Add field to SObject's fields array
 */
function addFieldToSObject(sObject: Query, fieldName: string): void {
  if (!sObject.fields) {
    sObject.fields = [];
  }
  
  // Create a new field
  const newField: Field = {
    type: 'Field',
    field: fieldName,
    startOffset: 0, // Will be updated by composer
    endOffset: 0    // Will be updated by composer
  };
  
  // Add field to the end of the fields array
  sObject.fields.push(newField);
  
  logger.debug('Added field to SObject', 'QueryTab', { 
    fieldName, 
    sObjectName: sObject.sObject,
    totalFields: sObject.fields.length
  });
}

// Handle field drops using AST-based approach
export const handleFieldDrop = async (dragData: { fieldName: string; sobjectName: string }, query: string, handleQueryChange: (query: string) => void, connectionUuid?: string | null) => {
  const currentQuery = query.trim();
  
  if (!currentQuery) {
    // Empty query, create a new one
    const newQuery = `SELECT ${dragData.fieldName} FROM ${dragData.sobjectName} LIMIT 10`;
    handleQueryChange(newQuery);
    
    // Show success notification for new query creation
    notificationService.success({
      title: i18nService.tSync('query.dragDrop.newQueryCreated.title'),
      message: i18nService.tSync('query.dragDrop.newQueryCreated.message', { 
        fieldName: dragData.fieldName,
        sobjectName: dragData.sobjectName
      }),
      icon: React.createElement(IconCheck, { size: 16 }),
      autoClose: 3000,
    });
    return;
  }
  
  // Try AST-based field insertion first
  try {
    const updatedQuery = await insertFieldIntoAST(dragData, currentQuery, connectionUuid);
    
    // Only update the query if it actually changed (field was added)
    // If field already exists, insertFieldIntoAST returns the original query unchanged
    if (updatedQuery !== currentQuery) {
      // AST-based insertion was successful - field was added
      handleQueryChange(updatedQuery);
      return;
    } else {
      // Field already exists or no changes made - don't update the query
      // The notification was already shown by insertFieldIntoAST
      return;
    }
  } catch (error) {
    logger.warn('AST-based field insertion failed, falling back to string manipulation', 'QueryTab', { error: error instanceof Error ? error.message : String(error) });
    
    // Show warning notification about fallback
    notificationService.warning({
      title: i18nService.tSync('query.dragDrop.fallbackMethod.title'),
      message: i18nService.tSync('query.dragDrop.fallbackMethod.message', { 
        fieldName: dragData.fieldName,
        sobjectName: dragData.sobjectName
      }),
      icon: React.createElement(IconAlertTriangle, { size: 16 }),
      autoClose: 3000,
    });
  }
  
  // Fallback to original string-based approach if AST method fails
  
  const fromIndex = currentQuery.toUpperCase().indexOf(' FROM ');
  
  if (fromIndex === -1) {
    // No FROM clause found, create a new query with the field
    const newQuery = `SELECT ${dragData.fieldName} FROM ${dragData.sobjectName} LIMIT 10`;
    handleQueryChange(newQuery);
    
    // Show success notification for new query creation (fallback)
    notificationService.success({
      title: i18nService.tSync('query.dragDrop.newQueryCreatedFallback.title'),
      message: i18nService.tSync('query.dragDrop.newQueryCreatedFallback.message', { 
        fieldName: dragData.fieldName,
        sobjectName: dragData.sobjectName
      }),
      icon: React.createElement(IconCheck, { size: 16 }),
      autoClose: 3000,
    });
    return;
  }
  
  // Extract the SELECT part and FROM part
  const selectPart = currentQuery.substring(0, fromIndex).trim();
  const fromPart = currentQuery.substring(fromIndex).trim();
  
  // Check if the FROM clause has the same SObject
  const fromClause = fromPart.toUpperCase();
  const targetSObject = dragData.sobjectName.toUpperCase();
  
  logger.debug('FROM clause', 'QueryTab', { fromClause, targetSObject, currentQuery });
  
  // Extract SObject name from FROM clause
  const fromMatch = fromClause.match(/FROM\s+(\w+)/);
  const currentSObject = fromMatch ? fromMatch[1] : '';
  
  logger.debug('SObject comparison', 'QueryTab', { currentSObject, targetSObject, match: currentSObject === targetSObject });
  
  if (currentSObject !== targetSObject) {
    // Different SObject, create a new query specific to this SObject
    logger.debug('Different SObject - creating new query', 'QueryTab');
    const newQuery = `SELECT ${dragData.fieldName} FROM ${dragData.sobjectName} LIMIT 10`;
    handleQueryChange(newQuery);
    
    // Show info notification for different SObject
    notificationService.info({
      title: i18nService.tSync('query.dragDrop.differentSObject.title'),
      message: i18nService.tSync('query.dragDrop.differentSObject.message', { 
        sobjectName: dragData.sobjectName,
        fieldName: dragData.fieldName
      }),
      icon: React.createElement(IconInfoCircle, { size: 16 }),
      autoClose: 3000,
    });
    return;
  }
  
  // Same SObject, append the field to the SELECT clause
  logger.debug('Same SObject - appending field', 'QueryTab');
  let newSelectPart: string;
  
  if (selectPart.toUpperCase().startsWith('SELECT ')) {
    // Remove 'SELECT ' prefix
    const fieldsPart = selectPart.substring(7).trim();
    logger.debug('Existing fields part', 'QueryTab', { fieldsPart });
    
    if (fieldsPart === '*') {
      // If SELECT *, replace with the new field
      newSelectPart = `SELECT ${dragData.fieldName}`;
      logger.debug('SELECT * - replacing with new field', 'QueryTab');
    } else {
      // Check if field already exists to avoid duplicates
      const existingFields = fieldsPart.split(',').map(f => f.trim());
      logger.debug('Field comparison', 'QueryTab', { existingFields, newField: dragData.fieldName });
      
      if (!existingFields.includes(dragData.fieldName)) {
        // Add field to existing list
        newSelectPart = `SELECT ${fieldsPart}, ${dragData.fieldName}`;
        logger.debug('Adding field to existing list', 'QueryTab');
      } else {
        // Field already exists, don't change the query
        logger.debug('Field already exists - no change', 'QueryTab');
        
        // Show info notification for duplicate field
        notificationService.info({
          title: i18nService.tSync('query.dragDrop.fieldExistsFallback.title'),
          message: i18nService.tSync('query.dragDrop.fieldExistsFallback.message', { 
            fieldName: dragData.fieldName,
            sobjectName: dragData.sobjectName
          }),
          icon: React.createElement(IconInfoCircle, { size: 16 }),
          autoClose: 3000,
        });
        return;
      }
    }
  } else {
    // No SELECT clause, create one
    newSelectPart = `SELECT ${dragData.fieldName}`;
    logger.debug('No SELECT clause - creating new one', 'QueryTab');
  }
  
  const newQuery = `${newSelectPart} ${fromPart}`;
  logger.debug('Final new query', 'QueryTab', { newQuery });
  handleQueryChange(newQuery);
  
  // Show success notification for field addition (fallback)
  notificationService.success({
    title: i18nService.tSync('query.dragDrop.fieldAddedFallback.title'),
    message: i18nService.tSync('query.dragDrop.fieldAddedFallback.message', { 
      fieldName: dragData.fieldName,
      sobjectName: dragData.sobjectName
    }),
    icon: React.createElement(IconCheck, { size: 16 }),
    autoClose: 3000,
  });
};

// Detect relationship between two SObjects using actual Salesforce metadata
export const detectSObjectRelationship = async (sourceSObject: string, targetSObject: string, connectionUuid?: string | null) => {
  logger.debug('Detecting relationship between SObjects using Salesforce metadata', 'QueryTab', { 
    sourceSObject, 
    targetSObject,
    hasConnectionUuid: !!connectionUuid,
    connectionUuid: connectionUuid ? connectionUuid.substring(0, 8) + '...' : 'null'
  });
  
  try {
    // Use provided connectionUuid or try to get from session context
    let connUuid: string | null = connectionUuid || null;
    if (!connUuid) {
      try {
        connUuid = getConnectionUuidFromSession();
      } catch (error) {
        logger.warn('No connection UUID found in session context for relationship detection', 'QueryTab');
        return null;
      }
    }
    const sourceData = await apiService.describeSObject(sourceSObject, connUuid, true);
    if (sourceData && sourceData.childRelationships) {
      // Check if source has a child relationship to target
      const childRelationship = sourceData.childRelationships.find(rel => 
        rel.childSObject === targetSObject
      );
      
      if (childRelationship) {
        
        return {
          type: 'master-detail',
          direction: 'forward',
          field: childRelationship.field,
          relationshipName: childRelationship.relationshipName,
          source: sourceSObject,
          target: targetSObject,
          isCustom: false, // Will be determined by metadata
          cascadeDelete: childRelationship.cascadeDelete
        };
      }
    }
    
    // Get the target SObject metadata to check for parent relationships
    const targetData = await apiService.describeSObject(targetSObject, connUuid, true);
    if (targetData && targetData.fields) {
      // Check if target has a lookup/master-detail field to source
      const parentRelationship = targetData.fields.find(field => 
        field.type === 'reference' && 
        field.referenceTo && 
        field.referenceTo.includes(sourceSObject)
      );
      
      if (parentRelationship) {
        
        return {
          type: parentRelationship.relationshipName ? 'master-detail' : 'lookup',
          direction: 'reverse',
          field: parentRelationship.name,
          relationshipName: parentRelationship.relationshipName || parentRelationship.name,
          source: sourceSObject,
          target: targetSObject,
          isCustom: false // Will be determined by metadata
        };
      }
    }
    
    logger.debug('No relationship found between SObjects', 'QueryTab', { sourceSObject, targetSObject });
    return null;
    
    } catch (error) {
    logger.warn('Failed to detect relationship using Salesforce metadata', 'QueryTab', { 
      sourceSObject, 
      targetSObject, 
      error: error instanceof Error ? error.message : String(error) 
    });
    return null;
  }
};

// Detect nested relationships (e.g., Account.Contacts.Opportunities)
export const detectNestedRelationship = async (sourceSObject: string, targetSObject: string, connectionUuid?: string | null) => {
  logger.debug('Detecting nested relationship between SObjects', 'QueryTab', { sourceSObject, targetSObject });
  
  try {
    // Use provided connectionUuid or try to get from session context
    let connUuid: string | null = connectionUuid || null;
    if (!connUuid) {
      try {
        connUuid = getConnectionUuidFromSession();
      } catch (error) {
        logger.warn('No connection UUID found in session context for nested relationship detection', 'QueryTab');
        return null;
      }
    }
    const sourceData = await apiService.describeSObject(sourceSObject, connUuid, true);
    
    if (sourceData && sourceData.childRelationships) {
      // Check if source has a child relationship to target
      const childRelationship = sourceData.childRelationships.find(rel => 
        rel.childSObject === targetSObject
      );
      
      if (childRelationship) {
        
        return {
          type: 'master-detail',
          direction: 'forward',
          field: childRelationship.field,
          relationshipName: childRelationship.relationshipName,
          source: sourceSObject,
          target: targetSObject,
          isCustom: false, // Will be determined by metadata
          cascadeDelete: childRelationship.cascadeDelete,
          path: [childRelationship.relationshipName], // Use the actual relationship name
          depth: 1
        };
      }
    }
    
    // Check reverse relationships (lookup fields)
    if (sourceData && sourceData.fields) {
      for (const field of sourceData.fields) {
        if (field.referenceTo && field.referenceTo.includes(targetSObject)) {
          return {
            type: 'lookup',
            direction: 'reverse',
            field: field.name,
            relationshipName: field.name,
            source: sourceSObject,
            target: targetSObject,
            isCustom: false, // Will be determined by metadata
            cascadeDelete: false,
            path: [field.name], // Use the actual field name
            depth: 1
          };
        }
      }
    }
    
    return null;
  } catch (error) {
    logger.error('Error detecting nested relationship', 'QueryTab', { 
      sourceSObject, 
      targetSObject, 
      error: error instanceof Error ? error.message : String(error) 
    });
    return null;
  }
};

// Get the parent SObject of a given SObject (e.g., Account.Contacts -> Account)
export const getParentSObject = async (sobjectName: string, connectionUuid?: string | null): Promise<string | null> => {
  logger.debug('Finding parent SObject for', 'QueryTab', { sobjectName });
  let connUuid: string | null = connectionUuid || null;
  if (!connUuid) {
    try {
      connUuid = getConnectionUuidFromSession();
    } catch (error) {
      logger.warn('No connection UUID found in session context for parent SObject detection', 'QueryTab');
      return null;
    }
  }
  const sobjectData = await apiService.describeSObject(sobjectName, connUuid, true);

  if (sobjectData && sobjectData.fields) {
    const parentField = sobjectData.fields.find(field => 
      field.type === 'reference' && 
      field.referenceTo && 
      field.referenceTo.length === 1 && 
      field.referenceTo[0] === sobjectName // This is the child SObject
    );

    if (parentField) {
      logger.debug('Found parent field', 'QueryTab', { sobjectName, parentField });
      return parentField.referenceTo[0];
    }
  }
  logger.debug('No parent SObject found', 'QueryTab', { sobjectName });
  return null;
};

// Build a nested subquery string using relationship names from Salesforce metadata
export const buildNestedSubquery = (path: string[]): string => {
  if (path.length === 0) return '';
  
  // For now, we only support single-level relationships
  // The path contains the relationship name (e.g., "OCE__MeetingMember__r")
  const relationshipName = path[0];
  
  // Build the subquery using the actual relationship name
  return `(SELECT Id FROM ${relationshipName})`;
};

// Utility: escape string for safe use in RegExp
export const escapeRegExp = (input: string): string => input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Utility: get the main FROM clause SObject (ignores FROMs inside parentheses)
export const getMainFromSObject = (queryText: string): { fromIndex: number; sobject: string } => {
  const text = queryText;
  let depth = 0;
  let i = 0;
  const upper = text.toUpperCase();
  while (i < upper.length) {
    const ch = upper[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      // Look for ' FROM '
      if (upper.startsWith(' FROM ', i) || (i === 0 && upper.startsWith('FROM ', i))) {
        const start = upper.indexOf('FROM', i);
        if (start !== -1) {
          // Skip 'FROM' and whitespace
          let j = start + 4;
          while (j < upper.length && /\s/.test(upper[j])) j++;
          // Capture identifier [A-Za-z0-9_.$]+
          const idStart = j;
          while (j < text.length && /[A-Za-z0-9_.$]/.test(text[j])) j++;
          const identifier = text.slice(idStart, j);
          return { fromIndex: start, sobject: identifier };
        }
      }
    }
    i++;
  }
  return { fromIndex: -1, sobject: '' };
};

// Handle dropping an SObject that has a relationship with existing SObject
export const handleRelationshipSObjectDrop = (droppedSObject: any, existingSObject: string, relationshipInfo: any, currentQuery: string, handleQueryChange: (query: string) => void) => {
  
  const fromIndex = currentQuery.toUpperCase().indexOf(' FROM ');
  if (fromIndex === -1) return;
  
  const selectPart = currentQuery.substring(0, fromIndex).trim();
  const fromPart = currentQuery.substring(fromIndex).trim();
  
  let newQuery = '';
  
  if (relationshipInfo.type === 'master-detail') {
    if (relationshipInfo.direction === 'forward') {
      // Existing SObject is master, dropped SObject is detail
      // Add subquery to existing SELECT
      {
        // Prevent duplicate by checking for FROM <relationshipName>
        const relRegex = new RegExp(`\\bFROM\\s+${escapeRegExp(relationshipInfo.relationshipName)}\\b`, 'i');
        if (relRegex.test(currentQuery)) {
          // Subquery already exists, don't duplicate
          return;
        }
        // Use the exact relationship name from Salesforce metadata
        newQuery = `${selectPart}, (SELECT Id FROM ${relationshipInfo.relationshipName}) ${fromPart}`;
      }
      } else {
      // Existing SObject is detail, dropped SObject is master
      // This would require a different approach since we can't easily go "up" in SOQL
      // For now, create a new query from the master object
      newQuery = `SELECT Id, (SELECT Id FROM ${relationshipInfo.relationshipName}) FROM ${droppedSObject.sobjectName} LIMIT 10`;
    }
  } else if (relationshipInfo.type === 'lookup') {
    if (relationshipInfo.direction === 'forward') {
      // Existing SObject has lookup to dropped SObject
      // Add lookup field to SELECT
      if (!currentQuery.includes(relationshipInfo.relationshipName)) {
        newQuery = `${selectPart}, ${relationshipInfo.relationshipName}.Name ${fromPart}`;
      } else {
        // Lookup already exists, don't duplicate
        return;
      }
    } else {
      // Dropped SObject has lookup to existing SObject
      // This would require a different approach
      newQuery = `SELECT Id, ${relationshipInfo.relationshipName}.Id FROM ${droppedSObject.sobjectName} LIMIT 10`;
    }
  } else if (relationshipInfo.type === 'one-to-one') {
    // Handle one-to-one relationships similar to lookups
    if (!currentQuery.includes(relationshipInfo.relationshipName)) {
      newQuery = `${selectPart}, ${relationshipInfo.relationshipName}.Name ${fromPart}`;
    } else {
      return;
    }
  }
  
  if (newQuery) {
    handleQueryChange(newQuery);
  }
};

// Handle relationship field drops (extracted from main function)
export const handleRelationshipFieldDrop = (dragData: any, query: string, handleQueryChange: (query: string) => void) => {
  const currentQuery = query.trim();
  if (!currentQuery) {
    // Empty query, create new one with relationship
    const newQuery = `SELECT Id, (SELECT Id FROM ${dragData.relatedSObject}) FROM ${dragData.sobjectName} LIMIT 10`;
    handleQueryChange(newQuery);
  } else {
    // Add relationship subquery to existing query
    const { fromIndex: mainFromIndex } = getMainFromSObject(currentQuery);
    if (mainFromIndex !== -1) {
      const selectPart = currentQuery.substring(0, mainFromIndex).trim();
      const fromPart = currentQuery.substring(mainFromIndex).trim();
      
      // Check if relationship subquery already exists
      const relRegex = new RegExp(`\\bFROM\\s+${escapeRegExp(dragData.relatedSObject)}\\b`, 'i');
      if (relRegex.test(currentQuery)) {
        return;
      }
      
      const newQuery = `${selectPart}, (SELECT Id FROM ${dragData.relatedSObject}) ${fromPart}`;
      handleQueryChange(newQuery);
    }
  }
};

// Enhanced drag and drop handler for both SObjects and fields
export const handleDragDrop = async (dragData: any, query: string, handleQueryChange: (query: string) => void, connectionUuid?: string | null) => {
  
  // Debug: Log the exact structure of drag data
  logger.debug('Drag data structure', 'QueryTab', {
    hasSObjectName: !!dragData.sobjectName,
    hasFieldName: !!dragData.fieldName,
    sobjectName: dragData.sobjectName,
    fieldName: dragData.fieldName,
    dragDataType: dragData.dragType || 'unknown'
  });
  
  // Check if it's an SObject drop (has sobjectName but no fieldName)
  if (dragData.sobjectName && !dragData.fieldName) {
    logger.debug('Processing SObject drop', 'QueryTab', { 
      sobjectName: dragData.sobjectName, 
      currentQuery: query.trim(),
      hasFieldName: !!dragData.fieldName 
    });
    
    // Check if there's an existing query to determine relationship handling
    const currentQuery = query.trim();
    
    if (!currentQuery) {
      // Empty query - create default query with Id
      const defaultQuery = `SELECT Id FROM ${dragData.sobjectName} LIMIT 10`;
      handleQueryChange(defaultQuery);
      
      // Notify user about the new query creation
      notificationService.info({
        title: i18nService.tSync('query.dragDrop.newQuery.title') || 'New Query Created',
        message: i18nService.tSync('query.dragDrop.newQuery.message', { 
          sobjectName: dragData.sobjectName 
        }) || `Created a new query for SObject "${dragData.sobjectName}" since the query editor was empty.`,
        icon: React.createElement(IconInfoCircle, { size: 16 }),
      });
      
      return;
    }
    
    // Check if the dropped SObject has a relationship with existing SObject
    const { fromIndex, sobject: existingSObject } = getMainFromSObject(currentQuery);
    if (fromIndex !== -1 && existingSObject) {
      const fromPart = currentQuery.substring(fromIndex).trim();
      
      logger.debug('Checking for relationships', 'QueryTab', { 
        existingSObject, 
        droppedSObject: dragData.sobjectName,
        fromPart,
        fromMatch: existingSObject
      });
      
      if (existingSObject && existingSObject !== dragData.sobjectName) {
        // Check if there's a relationship between these SObjects (including nested)
        const nestedRelationship = await detectNestedRelationship(existingSObject, dragData.sobjectName);
        
        logger.debug('Nested relationship detection result', 'QueryTab', { 
          existingSObject, 
          droppedSObject: dragData.sobjectName,
          nestedRelationship 
        });
        
        if (nestedRelationship) {
          // Handle nested relationship-based query construction
          
          // Build nested subquery
          const nestedSubquery = buildNestedSubquery(nestedRelationship.path);
          
          // Add to existing SELECT clause
          const { fromIndex: mainFromIndex } = getMainFromSObject(currentQuery);
          if (mainFromIndex !== -1) {
            const selectPart = currentQuery.substring(0, mainFromIndex).trim();
            const fromPart = currentQuery.substring(mainFromIndex);
            
            // Prevent duplicate subqueries for the same relationship
            const relationshipName = nestedRelationship.path[0];
            const relRegex = new RegExp(`\\bFROM\\s+${escapeRegExp(relationshipName)}\\b`, 'i');
            if (relRegex.test(currentQuery)) {
              return;
            }
            
            // Check if SELECT clause already has a comma
            const hasComma = selectPart.endsWith(',');
            const newSelectPart = hasComma 
              ? `${selectPart} ${nestedSubquery}`
              : `${selectPart}, ${nestedSubquery}`;
            
            const newQuery = `${newSelectPart} ${fromPart}`;
            handleQueryChange(newQuery);
            
          }
          return;
        } else {
          // No relationship - create new query
          const newQuery = `SELECT Id FROM ${dragData.sobjectName} LIMIT 10`;
          handleQueryChange(newQuery);
          
          // Notify user about the new query creation
          notificationService.info({
            title: i18nService.tSync('query.dragDrop.defaultQuery.title') || 'New Query Created',
            message: i18nService.tSync('query.dragDrop.defaultQuery.message', { 
              sobjectName: dragData.sobjectName 
            }) || `Created a new query for SObject "${dragData.sobjectName}" since no relationship was detected with the current query.`,
            icon: React.createElement(IconInfoCircle, { size: 16 }),
          });
          
          return;
        }
      } else {
        logger.debug('Same SObject or no existing SObject detected', 'QueryTab', { 
          existingSObject, 
          droppedSObject: dragData.sobjectName,
          isSame: existingSObject === dragData.sobjectName
        });
      }
    }
    
    // Same SObject or no relationship - create default query
    const defaultQuery = `SELECT Id FROM ${dragData.sobjectName} LIMIT 10`;
    handleQueryChange(defaultQuery);
    
    // Notify user about the fallback behavior
    notificationService.info({
      title: i18nService.tSync('query.dragDrop.defaultQuery.title') || 'New Query Created',
      message: i18nService.tSync('query.dragDrop.defaultQuery.message', { 
        sobjectName: dragData.sobjectName 
      }) || `Created a new query for SObject "${dragData.sobjectName}" since no relationship was detected with the current query.`,
      icon: React.createElement(IconInfoCircle, { size: 16 }),
    });
    
    return;
  }
  
  // Check if it's a field drop (has both sobjectName and fieldName)
  // But also check if it's actually an SObject drop that got misclassified
  if (dragData.fieldName && dragData.sobjectName) {
    // Check if this might actually be an SObject drop (fieldName might be the same as sobjectName)
    if (dragData.fieldName === dragData.sobjectName || dragData.type === 'sobject' || dragData.dragType === 'sobject') {
      // This is actually an SObject drop, not a field drop
      logger.debug('Reclassifying as SObject drop', 'QueryTab', { dragData });
      
      // Handle SObject drop directly instead of recursive call
      const currentQuery = query.trim();
      
      if (!currentQuery) {
        // Empty query - create default query with Id
        const defaultQuery = `SELECT Id FROM ${dragData.sobjectName} LIMIT 10`;
        handleQueryChange(defaultQuery);
        return;
      }
      
      // Check if the dropped SObject has a relationship with existing SObject
      const { fromIndex, sobject: existingSObject } = getMainFromSObject(currentQuery);
      if (fromIndex !== -1 && existingSObject) {
        const fromPart = currentQuery.substring(fromIndex).trim();
        const fromMatch = fromPart.match(/FROM\s+(\w+)/);
        const existingSObject = fromMatch ? fromMatch[1] : '';
        
        if (existingSObject && existingSObject !== dragData.sobjectName) {
          // Check if there's a relationship between these SObjects
          // Try both directions to see which makes more sense
          let relationshipInfo = await detectSObjectRelationship(existingSObject, dragData.sobjectName);
          
          // If no relationship found in forward direction, try reverse
          if (!relationshipInfo) {
            relationshipInfo = await detectSObjectRelationship(dragData.sobjectName, existingSObject);
            if (relationshipInfo) {
              // Swap the relationship direction since we're looking at it from the other side
              relationshipInfo = {
                ...relationshipInfo,
                direction: relationshipInfo.direction === 'forward' ? 'reverse' : 'forward',
                source: existingSObject,
                target: dragData.sobjectName
              };
            }
          }
          
          if (relationshipInfo) {
            // Handle relationship-based query construction
            handleRelationshipSObjectDrop(dragData, existingSObject, relationshipInfo, currentQuery, handleQueryChange);
            return;
          } else {
            // No relationship - create new query
            const newQuery = `SELECT Id FROM ${dragData.sobjectName} LIMIT 10`;
            handleQueryChange(newQuery);
            return;
          }
        }
      }
      
      // Same SObject or no relationship - create default query
      const defaultQuery = `SELECT Id FROM ${dragData.sobjectName} LIMIT 10`;
      handleQueryChange(defaultQuery);
      return;
    }
    
    // It's a genuine field drop
    handleFieldDrop(dragData, query, handleQueryChange, connectionUuid);
    return;
  }
  
  // Check if it's a relationship field drop (has relationship info)
  if (dragData.relationshipType && dragData.relatedSObject) {
    handleRelationshipFieldDrop(dragData, query, handleQueryChange);
    return;
  }
  
  logger.warn('Unknown drag data format', 'QueryTab', { dragData });
};
