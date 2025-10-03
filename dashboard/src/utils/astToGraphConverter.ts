import { logger } from '../services/Logger';

// Graph node and link types
export interface GraphNode {
  id: string;
  name: string;
  label: string;
  x: number;
  y: number;
  fields: any[];
  isCustom: boolean;
  isExpanded: boolean;
}

export interface GraphLink {
  id: string;
  source: string;
  target: string;
  fieldName: string;
  relationshipType: 'master-detail' | 'many-to-many';
  relationshipName?: string;
  field?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

// Convert AST to graph data
export const convertASTToGraphData = async (ast: any): Promise<GraphData> => {
  try {

    const graphData: GraphData = {
      nodes: [],
      links: []
    };

    // Helper function to add a node
    const addNode = (sobjectName: string, x: number = 0, y: number = 0, fields: any[] = [], label?: string) => {
      const existingNode = graphData.nodes.find(n => n.name === sobjectName);
      if (!existingNode) {
        graphData.nodes.push({
          id: sobjectName,
          name: sobjectName,
          label: label || sobjectName,
          x,
          y,
          fields: fields,
          isCustom: sobjectName.includes('__c'),
          isExpanded: false
        });
      }
    };

    // Helper function to add a link
    const addLink = (source: string, target: string, fieldName: string, relationshipName: string) => {
      const linkId = `${source}-${target}-${fieldName}`;
      const existingLink = graphData.links.find(l => l.id === linkId);
      if (!existingLink) {
        graphData.links.push({
          id: linkId,
          source,
          target,
          fieldName,
          relationshipType: 'master-detail' as const,
          relationshipName,
          field: fieldName
        });
      }
    };

    // Helper function to add fields to a node
    const addFieldsToNode = (sobjectName: string, fields: any[]) => {
      const node = graphData.nodes.find(n => n.name === sobjectName);
      if (node) {
        node.fields = [...(node.fields || []), ...fields];
      }
    };

    // Track nodes by level for proper positioning
    const nodesByLevel: { [level: number]: string[] } = {};
    
    // Process AST recursively
    const processASTRecursively = (astNode: any, parentSObject: string | null = null, level: number = 1) => {
      if (!astNode || !astNode.sObject) return;

      const sobjectName = astNode.sObject;

      // Track this node for level-based positioning
      if (!nodesByLevel[level]) {
        nodesByLevel[level] = [];
      }
      nodesByLevel[level].push(sobjectName);

      // Add the node with temporary position (will be repositioned later)
      const nodeLabel = astNode.sObjectLabel || sobjectName;
      addNode(sobjectName, 0, 0, [], nodeLabel);

      // Process fields
      if (astNode.fields && Array.isArray(astNode.fields)) {
        
        const regularFields: any[] = [];
        const relationshipFields: any[] = [];
        const subqueryFields: any[] = [];

        for (const field of astNode.fields) {
          if (field.type === 'Field') {
            // Use enriched field metadata
            const enrichedField = {
              name: field.field || field.name,
              label: field.fieldLabel || field.field || field.name,
              type: field.fieldType || 'string',
              relationshipName: field.fieldMetadata?.relationshipName,
              referenceTo: field.fieldMetadata?.referenceTo,
            };
            regularFields.push(enrichedField);
          } else if (field.type === 'FieldRelationship') {
            // For FieldRelationship, we need to reconstruct the full field name from relationships + field
            const relationships = field.relationships || [];
            const fieldName = field.field || field.name;
            const fullFieldName = relationships.length > 0 ? `${relationships.join('.')}.${fieldName}` : fieldName;
            
            const enrichedField = {
              name: fullFieldName,
              label: field.fieldLabel || fullFieldName,
              type: field.fieldType || 'string',
              relationshipName: field.fieldMetadata?.relationshipName,
              referenceTo: field.fieldMetadata?.referenceTo,
            };
            relationshipFields.push(enrichedField);
          } else if (field.type === 'FieldSubquery') {
            subqueryFields.push(field);
          }
        }

        // Add regular fields to the node
        if (regularFields.length > 0) {
          addFieldsToNode(sobjectName, regularFields);
        }

        // Add relationship fields to the node
        if (relationshipFields.length > 0) {
          addFieldsToNode(sobjectName, relationshipFields);
        }

        // Process subqueries
        for (const subqueryField of subqueryFields) {
          const relationshipName = subqueryField.relationshipFieldName || subqueryField.field;
          const targetSObject = subqueryField.actualSObjectName || subqueryField.subquery?.sObject;
          
          if (targetSObject && relationshipName) {
            
            // Add link
            addLink(sobjectName, targetSObject, relationshipName, relationshipName);
            
            // Process the subquery recursively
            if (subqueryField.subquery) {
              processASTRecursively(subqueryField.subquery, sobjectName, level + 1);
            }
          }
        }
      }

      // Add link to parent if this is a subquery
      if (parentSObject) {
        const relationshipName = astNode.relationshipName || astNode.relationshipFieldName;
        if (relationshipName) {
          addLink(parentSObject, sobjectName, relationshipName, relationshipName);
        }
      }
    };

    // Start processing from the main AST
    processASTRecursively(ast);

    // Position nodes properly to avoid overlapping
    const nodeSpacing = 400; // Horizontal spacing between nodes
    const levelSpacing = 300; // Vertical spacing between levels
    const startX = 200; // Starting X position
    const startY = 200; // Starting Y position

    // Position nodes level by level
    Object.keys(nodesByLevel).forEach(levelStr => {
      const level = parseInt(levelStr);
      const levelNodes = nodesByLevel[level];
      
      // Calculate total width needed for this level
      const totalWidth = (levelNodes.length - 1) * nodeSpacing;
      const startXForLevel = startX - (totalWidth / 2) + (nodeSpacing / 2);
      
      // Position nodes horizontally within the level
      levelNodes.forEach((nodeName, index) => {
        const node = graphData.nodes.find(n => n.name === nodeName);
        if (node) {
          node.x = startXForLevel + (index * nodeSpacing);
          node.y = startY + (level - 1) * levelSpacing;
        }
      });
    });

    // Auto-fit the graph to center it
    if (graphData.nodes.length > 0) {
      const bounds = {
        minX: Math.min(...graphData.nodes.map(n => n.x)),
        maxX: Math.max(...graphData.nodes.map(n => n.x)),
        minY: Math.min(...graphData.nodes.map(n => n.y)),
        maxY: Math.max(...graphData.nodes.map(n => n.y))
      };
      
      const graphWidth = bounds.maxX - bounds.minX;
      const graphHeight = bounds.maxY - bounds.minY;
      const centerX = bounds.minX + graphWidth / 2;
      const centerY = bounds.minY + graphHeight / 2;
      
      // Center the graph (assuming canvas size of ~1800x500)
      const canvasCenterX = 900;
      const canvasCenterY = 250;
      
      const offsetX = canvasCenterX - centerX;
      const offsetY = canvasCenterY - centerY;
      
      // Apply offset to all nodes
      graphData.nodes.forEach(node => {
        node.x += offsetX;
        node.y += offsetY;
      });
    }


    return graphData;
  } catch (error) {
    logger.error('Error in convertASTToGraphData', 'ASTToGraphConverter', { error: String(error), ast });
    throw error;
  }
};
