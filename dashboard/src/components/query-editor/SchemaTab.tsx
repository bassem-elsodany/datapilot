import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Paper, 
  Title, 
  Text, 
  Badge, 
  Group, 
  Button, 
  ActionIcon,
  Modal,
  Stack,
  Divider,
  Tooltip,
  Box,
  ScrollArea,
  TextInput,
  Checkbox,
  Card,
  Flex,
  Grid,
  Chip,
  Collapse,
  Accordion,
  Loader
} from '@mantine/core';
import { useSessionContext } from '../../contexts/SessionContext';
import { useConnectionSessionStorage } from '../../hooks/useSessionStorage';
import { convertASTToGraphData, GraphData } from '../../utils/astToGraphConverter';
import { DataTable, useDataTableColumns } from 'mantine-datatable';
import { 
  IconDatabase, 
  IconTable, 
  IconLink, 
  IconRefresh, 
  IconX,
  IconPlus,
  IconMinus,
  IconListCheck,
  IconSearch,
  IconZoomIn,
  IconZoomOut,
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconInfoCircle,
  IconTrash,
  IconGitBranch,
  IconChevronUp,
  IconChevronDown,
  IconChevronRight,
  IconDownload,
  IconFileExport,
  IconEye,
  IconEyeOff,
  IconCode
} from '@tabler/icons-react';
import { useTranslation } from '../../services/I18nService';
import { logger } from '../../services/Logger';
import { SalesforceService } from '../../services/SalesforceService';
import { SObjectCacheService } from '../../services/SObjectCacheService';
import { notificationService } from '../../services/NotificationService';
import { i18nService } from '../../services/I18nService';
import { composeQuery } from '../soql/composer/composer';
import '../../assets/css/components/query-editor/SchemaTab.css';

// Constants for local storage keys
const SCHEMA_GRAPH_VERSION = '1.0';

// Constants for drag and drop behavior
const DRAG_DROP_CONSTANTS = {
  MIN_NODE_DISTANCE: 250,
  NODE_OFFSET_X: 250,
  NODE_OFFSET_Y: 50,
  INITIAL_FIELDS_COUNT: 5,
  ADDITIONAL_FIELDS_COUNT: 5,
  NOTIFICATION_AUTO_CLOSE_DELAY: 4000,
  ERROR_NOTIFICATION_AUTO_CLOSE_DELAY: 5000,
  ZOOM_INCREMENT: 0.1,
  MIN_ZOOM: 0.5,
  MAX_ZOOM: 2,
  DEFAULT_ZOOM: 1,
  DEFAULT_PAN: { x: 0, y: 0 }
} as const;

// Generate connection-specific storage key
const getSchemaGraphStorageKey = (connectionUuid?: string) => {
  if (!connectionUuid) return 'datapilot-schema-graph-no-connection';
  return `datapilot-schema-graph-${connectionUuid}`;
};

interface SchemaField {
  name: string;
  label: string;
  type: string;
  relationshipName?: string;
  referenceTo?: string[];
  precision?: number;
  scale?: number;
  length?: number;
  picklistValues?: any[];
  required?: boolean;
  nillable?: boolean;
  createable?: boolean;
  updateable?: boolean;
  unique?: boolean;
  calculated?: boolean;
  formula?: string;
}

interface RelationshipRecord {
  objectField: string;
  relationshipName: string;
  cascadeDelete: boolean;
  childSObject: string;
  fieldName: string;
}

interface SchemaObject {
  name: string;
  label: string;
  fields: SchemaField[];
  isCustom: boolean;
  childRelationships?: any[];
}

interface GraphNode {
  id: string;
  name: string;
  label: string;
  x: number;
  y: number;
  fields: SchemaField[];
  isCustom: boolean;
  isExpanded: boolean;
}

interface GraphLink {
  id: string;
  source: string;
  target: string;
  fieldName: string;
  relationshipType: 'master-detail' | 'many-to-many';
  relationshipName?: string;
  field?: string;
}

interface SchemaGraphState {
  nodes: GraphNode[];
  links: GraphLink[];
  selectedNode?: string;
  zoom: number;
  pan: { x: number; y: number };
}

interface SchemaTabProps {
  currentConnectionUuid?: string;
}

// Field Selection Content Component
interface FieldSelectionContentProps {
  fieldSelectionData: {
    node: GraphNode;
    availableFields: any[];
    selectedFields: string[];
  };
  setFieldSelectionData: React.Dispatch<React.SetStateAction<{
    node: GraphNode;
    availableFields: any[];
    selectedFields: string[];
  } | null>>;
  onAddFields: (selectedFields: string[]) => void;
  onCancel: () => void;
}

const FieldSelectionContent: React.FC<FieldSelectionContentProps> = ({
  fieldSelectionData,
  setFieldSelectionData,
  onAddFields,
  onCancel
}) => {
  const { tSync } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFields, setSelectedFields] = useState<string[]>(fieldSelectionData.selectedFields);

  // Filter fields based on search term
  const filteredFields = useMemo(() => {
    if (!searchTerm) return fieldSelectionData.availableFields;
    
    const term = searchTerm.toLowerCase();
    return fieldSelectionData.availableFields.filter(field =>
      field.name.toLowerCase().includes(term) ||
      field.label.toLowerCase().includes(term) ||
      field.type.toLowerCase().includes(term)
    );
  }, [fieldSelectionData.availableFields, searchTerm]);

  const handleFieldToggle = (fieldName: string) => {
    setSelectedFields(prev => 
      prev.includes(fieldName) 
        ? prev.filter(f => f !== fieldName)
        : [...prev, fieldName]
    );
  };

  const handleSelectAll = () => {
    setSelectedFields(filteredFields.map(f => f.name));
  };

  const handleSelectNone = () => {
    setSelectedFields([]);
  };

  const handleAddFields = () => {
    // Check if there are any changes (additions or removals)
    const currentFields = fieldSelectionData.node.fields.map(f => f.name);
    const newFields = selectedFields.filter(fieldName => !currentFields.includes(fieldName));
    const removedFields = currentFields.filter(fieldName => !selectedFields.includes(fieldName));
    
    // Field selection processing
    
    if (newFields.length > 0 || removedFields.length > 0) {
      onAddFields(selectedFields);
    } else {
      // Show a notification if no changes are made
      notificationService.warning({
        title: tSync('schema.fieldSelection.noChanges.title', 'No Changes'),
        message: tSync('schema.fieldSelection.noChanges.message', 'Please select or deselect fields to make changes.'),
      });
    }
  };

  // Calculate new fields count
  const newFieldsCount = useMemo(() => {
    const currentFields = fieldSelectionData.node.fields.map(f => f.name);
    return selectedFields.filter(fieldName => !currentFields.includes(fieldName)).length;
  }, [selectedFields, fieldSelectionData.node.fields]);

  // Calculate removed fields count
  const removedFieldsCount = useMemo(() => {
    const currentFields = fieldSelectionData.node.fields.map(f => f.name);
    return currentFields.filter(fieldName => !selectedFields.includes(fieldName)).length;
  }, [selectedFields, fieldSelectionData.node.fields]);

  // Check if there are any changes (additions or removals)
  const hasChanges = useMemo(() => {
    return newFieldsCount > 0 || removedFieldsCount > 0;
  }, [newFieldsCount, removedFieldsCount]);

  // Calculate display text
  const selectedCountText = useMemo(() => {
    return tSync('schema.fieldSelection.selectedCount', { 
      selected: selectedFields.length, 
      new: newFieldsCount,
      total: filteredFields.length 
    }) || `${selectedFields.length} of ${filteredFields.length} fields selected (${newFieldsCount} new)`;
  }, [selectedFields.length, newFieldsCount, filteredFields.length, tSync]);

  const applyButtonText = useMemo(() => {
    return tSync('schema.fieldSelection.apply', 'Apply');
  }, [tSync]);

  return (
    <Stack gap="md">
      {/* Search and Controls */}
      <Group justify="space-between" align="center">
        <TextInput
          placeholder={tSync('schema.fieldSelection.searchPlaceholder', 'Search fields by name, label, or type...')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ flex: 1 }}
          leftSection={<IconSearch size={16} />}
        />
        <Group gap="xs">
          <Button variant="light" size="xs" onClick={handleSelectAll}>
            {tSync('schema.fieldSelection.selectAll', 'Select All')}
          </Button>
          <Button variant="light" size="xs" onClick={handleSelectNone}>
            {tSync('schema.fieldSelection.selectNone', 'Select None')}
          </Button>
        </Group>
      </Group>

      {/* Selected Count */}
      <Group justify="space-between" align="center">
        <Text size="sm" c="dimmed">
          {selectedCountText}
        </Text>
        <Group gap="xs">
          <Button 
            variant="light" 
            size="sm" 
            onClick={onCancel}
          >
            {tSync('schema.fieldSelection.cancel', 'Cancel')}
          </Button>
        <Button 
          color="blue" 
          size="sm" 
          onClick={handleAddFields}
          style={{
            opacity: !hasChanges ? 0.6 : 1,
            cursor: !hasChanges ? 'not-allowed' : 'pointer',
            color: '#475569'
          }}
        >
          {applyButtonText}
        </Button>
        </Group>
      </Group>

      {/* Fields List */}
      <ScrollArea h={400}>
        <Stack gap="xs">
          {filteredFields.map(field => {
            const currentFields = fieldSelectionData.node.fields.map(f => f.name);
            const isAlreadySelected = currentFields.includes(field.name);
            const isNewlySelected = selectedFields.includes(field.name) && !isAlreadySelected;
            const isSelected = selectedFields.includes(field.name);
            
            return (
              <Paper 
                key={field.name} 
                p="sm" 
                withBorder 
                className={`field-selection-item ${
                  isAlreadySelected 
                    ? 'field-selection-item-already-selected' 
                    : isNewlySelected 
                      ? 'field-selection-item-newly-selected' 
                      : 'field-selection-item-unselected'
                }`}
                style={{ cursor: 'pointer' }}
                onClick={() => handleFieldToggle(field.name)}
              >
              <Group justify="space-between" align="center">
                <div style={{ flex: 1 }}>
                  <Group gap="xs" align="center">
                    <Checkbox 
                      checked={selectedFields.includes(field.name)}
                      onChange={() => handleFieldToggle(field.name)}
                      size="sm"
                    />
                    <div>
                      <Text size="sm" fw={500} ff="monospace">
                        {field.name}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {field.label}
                      </Text>
                    </div>
                  </Group>
                </div>
                <Group gap="xs">
                  {isAlreadySelected && (
                    <Badge size="sm" color="blue" variant="light">
                      {tSync('schema.fieldSelection.alreadySelected', 'Selected')}
                    </Badge>
                  )}
                  <Badge size="sm" color={field.type === 'reference' ? 'purple' : 'gray'}>
                    {field.type}
                  </Badge>
                </Group>
              </Group>
            </Paper>
            );
          })}
        </Stack>
      </ScrollArea>
    </Stack>
  );
};

export const SchemaTab: React.FC<SchemaTabProps> = ({ currentConnectionUuid }) => {
  const { tSync } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Session management
  const { isAuthenticated, destroySession } = useSessionContext();
  // Session-aware state management
  const [graphState, setGraphState] = useConnectionSessionStorage<SchemaGraphState>(
    'schema-graph-state',
    currentConnectionUuid,
    {
      nodes: [],
      links: [],
      zoom: 1,
      pan: { x: 0, y: 0 }
    }
  );
  
  // Keep ref in sync with state
  const graphStateRef = useRef<SchemaGraphState>(graphState);
  graphStateRef.current = graphState;

  // AST state management - SINGLE SOURCE OF TRUTH (session-aware)
  const [astState, setAstState] = useConnectionSessionStorage<any>(
    'ast-state',
    currentConnectionUuid,
    null
  );
  
  // Keep AST ref in sync with state
  const astStateRef = useRef<any>(astState);
  astStateRef.current = astState;
  
  // Session validation - redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      logger.warn('User not authenticated, redirecting to login', 'SchemaTab');
      // You can implement redirect logic here or show a login modal
      // For now, we'll just log the warning
    }
  }, [isAuthenticated]);
  
  // Debug AST state changes (session-aware storage handles persistence automatically)
  useEffect(() => {
    // AST state changes are handled automatically by session-aware storage
  }, [astState, isAuthenticated]);

  // Use the shared convertASTToGraphData utility

  // Convert AST to graph data and render canvas
  const renderCanvasFromAST = useCallback(async (ast: any) => {
    if (!ast) return;
    
    try {
      // Convert AST to graph data directly
      const graphData = await convertASTToGraphData(ast);
      
      if (graphData && graphData.nodes && graphData.links) {
        // Update graph state with AST-generated data
        setGraphState(prev => ({
          ...prev,
          nodes: graphData.nodes,
          links: graphData.links
        }));

        // AST is not persisted - cleared on each connection change
      } else {
        logger.warn('Invalid graph data from AST conversion', 'SchemaTab', { graphData });
      }
    } catch (error) {
      logger.error('Failed to render canvas from AST', 'SchemaTab', { 
        error: error instanceof Error ? error.message : String(error),
        ast
      });
    }
  }, [currentConnectionUuid, convertASTToGraphData]);


  // Add fields to AST
  const replaceFieldsInAST = useCallback(async (ast: any, sobjectName: string, newFields: any[]) => {
    try {

      // Deep clone the AST to avoid mutations
      const updatedAST = JSON.parse(JSON.stringify(ast));
      
      // Find the node in AST and add fields
      const addFieldsToNodeRecursively = (astNode: any): boolean => {
        if (astNode.sObject === sobjectName) {
          // Found the target node, add the new fields
          if (!astNode.fields) {
            astNode.fields = [];
          }
          
          // Replace only the regular fields, preserve subqueries
          const subqueries = astNode.fields.filter(field => field.type === 'FieldSubquery');
          const regularFields = newFields.map(field => ({
            type: 'Field',
            field: field.name,
            startOffset: 0, // These will be updated when converting back to SOQL
            endOffset: 0
          }));
          
          // Combine regular fields with preserved subqueries
          astNode.fields = [...regularFields, ...subqueries];
          
          
          return true;
        }
        
        // Recursively search in subqueries
        if (astNode.fields) {
          for (const field of astNode.fields) {
            if (field.type === 'FieldSubquery' && field.subquery) {
              if (addFieldsToNodeRecursively(field.subquery)) {
                return true;
              }
            }
          }
        }
        
        return false;
      };
      
      const found = addFieldsToNodeRecursively(updatedAST);
      
      if (!found) {
        logger.warn('Target node not found in AST', 'SchemaTab', { sobjectName });
        return null;
      }
      
      return updatedAST;
    } catch (error) {
      logger.error('Failed to add fields to AST', 'SchemaTab', { 
        sobjectName,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }, []);
  
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedNodeDetails, setSelectedNodeDetails] = useState<SchemaObject | null>(null);
  const [showNodeModal, setShowNodeModal] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [isNodeDragging, setIsNodeDragging] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    nodeId: string | null;
  }>({
    visible: false,
    x: 0,
    y: 0,
    nodeId: null
  });
  const [showSchemaReport, setShowSchemaReport] = useState(false);
  const [schemaReportData, setSchemaReportData] = useState<SchemaObject | null>(null);
  const [schemaReportFilter, setSchemaReportFilter] = useState('');
  const [isSchemaReportExpanded, setIsSchemaReportExpanded] = useState(false);
  const [showAllFields, setShowAllFields] = useState(false); // Toggle between selected fields and all metadata fields
  const [completeNodeMetadata, setCompleteNodeMetadata] = useState<any>(null); // Store complete metadata
  const [showPicklistModal, setShowPicklistModal] = useState(false);
  const [currentPicklistData, setCurrentPicklistData] = useState<{ fieldName: string; values: any[] } | null>(null);
  const [picklistFilter, setPicklistFilter] = useState('');
  const [showRelationshipsReport, setShowRelationshipsReport] = useState(false);
  const [relationshipsReportData, setRelationshipsReportData] = useState<any[]>([]);
  const [relationshipsSObjectData, setRelationshipsSObjectData] = useState<{ name: string; label: string } | null>(null);
  const [relationshipsFilter, setRelationshipsFilter] = useState('');
  const [showChildObjectsModal, setShowChildObjectsModal] = useState(false);
  const [childObjectsData, setChildObjectsData] = useState<{
    parentNode: GraphNode;
    childRelationships: Array<{
      childSObject: string;
      relationshipName: string;
      field: string;
      cascadeDelete: boolean;
    }>;
  } | null>(null);
  const [selectedChildObjects, setSelectedChildObjects] = useState<string[]>([]);
  
  // Field selection modal state
  const [showFieldSelectionModal, setShowFieldSelectionModal] = useState(false);
  const [modalMounted, setModalMounted] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [fieldSelectionData, setFieldSelectionData] = useState<{
    node: GraphNode;
    availableFields: any[];
    selectedFields: string[];
  } | null>(null);
  
  // Select master parent submenu state
  const [isSelectMasterParentSubmenuVisible, setIsSelectMasterParentSubmenuVisible] = useState(false);
  const [selectMasterParentSubmenuData, setSelectMasterParentSubmenuData] = useState<{
    childNode: GraphNode;
    currentMasterLink: GraphLink;
    allParentLinks: GraphLink[];
    availableParents: Array<{ nodeId: string; nodeName: string; isCurrentMaster: boolean; link: GraphLink }>;
  } | null>(null);
  const [isChildObjectsSubmenuVisible, setIsChildObjectsSubmenuVisible] = useState(false);
  const [childObjectsSubmenuData, setChildObjectsSubmenuData] = useState<{
    parentNode: GraphNode;
    childRelationships: Array<{
      childSObject: string;
      relationshipName: string;
      field: string;
      cascadeDelete: boolean;
    }>;
  } | null>(null);
  const [loadingChildObjects, setLoadingChildObjects] = useState<Set<string>>(new Set());
  const [addingChildObject, setAddingChildObject] = useState<string | null>(null);
  const [addingNode, setAddingNode] = useState<string | null>(null);
  const [columnWidths, setColumnWidths] = useState({
    name: 200,
    label: 250,
    type: 220,
    properties: 400,
    picklistValues: 200
  });
  
  // Sorting state for relationships report
  const [sortStatus, setSortStatus] = useState<any>(null);
  
  // Sorting state for schema report
  const [schemaSortStatus, setSchemaSortStatus] = useState<any>(null);

  // Canvas dimensions
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  // Debug component mounting and graph state changes
  useEffect(() => {
  }, [graphState.nodes.length, graphState.links.length, canvasSize.width, canvasSize.height]);

  // Generate graph data from AST whenever AST changes
  useEffect(() => {
    if (astState) {
      
      // Convert AST to graph data
      convertASTToGraphData(astState).then(graphData => {
        if (graphData && graphData.nodes && graphData.links) {
          setGraphState(prev => ({
            ...prev,
            nodes: graphData.nodes,
            links: graphData.links
          }));
          
        }
      }).catch(error => {
        logger.error('Failed to convert AST to graph data', 'SchemaTab', { error });
      });
    }
  }, [astState]);


  // Memoize filtered and sorted relationships data for better performance
  const filteredRelationshipsData = useMemo(() => {
    let filtered = relationshipsReportData.filter(rel => 
      !relationshipsFilter || 
      rel.objectField.toLowerCase().includes(relationshipsFilter.toLowerCase()) ||
      rel.relationshipName.toLowerCase().includes(relationshipsFilter.toLowerCase()) ||
      rel.childSObject.toLowerCase().includes(relationshipsFilter.toLowerCase())
    ).map((rel, index) => ({ ...rel, id: `${rel.objectField}-${rel.childSObject}-${index}` }));

    // Apply sorting if sortStatus is set
    if (sortStatus) {
      filtered = filtered.sort((a, b) => {
        const aValue = String(a[sortStatus.columnAccessor] || '');
        const bValue = String(b[sortStatus.columnAccessor] || '');
        
        if (sortStatus.direction === 'asc') {
          return aValue.localeCompare(bValue);
        } else {
          return bValue.localeCompare(aValue);
        }
      });
    }

    return filtered;
  }, [relationshipsReportData, relationshipsFilter, sortStatus]);

  // Trigger canvas rendering when component becomes visible and has graph data
  useEffect(() => {
    if (graphState.nodes.length > 0) {
      // Force a re-render by updating the canvas size (this will trigger the canvas rendering useEffect)
      setTimeout(() => {
        setCanvasSize(prev => ({ ...prev }));
      }, 100);
    }
  }, [graphState.nodes.length, graphState.links.length]);

  // Session-aware storage handles persistence automatically
  // No need for manual localStorage functions

  // Session-aware storage automatically handles loading/saving
  // No need for manual localStorage management

  useEffect(() => {
    const updateCanvasSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setCanvasSize({ width: rect.width, height: rect.height });
      }
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, []);



  // Handle clicking outside context menu to close it
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenu.visible) {
        // Check if click is outside the context menu
        const target = e.target as Element;
        const contextMenuElement = document.querySelector('.schema-context-menu');
        
        if (contextMenuElement && !contextMenuElement.contains(target)) {
            // Also check if click is inside the submenu
            const submenuElement = document.querySelector('.schema-context-submenu');
            if (!submenuElement || !submenuElement.contains(target)) {
              setContextMenu(prev => ({ ...prev, visible: false }));
              // Also close submenus when context menu closes
              setIsChildObjectsSubmenuVisible(false);
              setChildObjectsSubmenuData(null);
              setIsSelectMasterParentSubmenuVisible(false);
              setSelectMasterParentSubmenuData(null);
            }
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (contextMenu.visible && e.key === 'Escape') {
          setContextMenu(prev => ({ ...prev, visible: false }));
          // Also close submenus when context menu closes
          setIsChildObjectsSubmenuVisible(false);
          setChildObjectsSubmenuData(null);
          setIsSelectMasterParentSubmenuVisible(false);
          setSelectMasterParentSubmenuData(null);
      }
    };

    if (contextMenu.visible) {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('click', handleClickOutside);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [contextMenu.visible]);

  // Handle drag and drop from SchemaTree
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'copy';
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      const sobjectName = e.dataTransfer!.getData('text/plain');
      if (sobjectName) {
        // Check if SObject already exists in graph
        const existingNode = graphStateRef.current.nodes.find(n => n.name === sobjectName);
        if (existingNode) {
          return;
        }
        
        addSObjectToGraph(sobjectName, e.clientX, e.clientY);
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('dragover', handleDragOver);
      container.addEventListener('drop', handleDrop);
    }

    return () => {
      if (container) {
        container.removeEventListener('dragover', handleDragOver);
        container.removeEventListener('drop', handleDrop);
      }
    };
  }, []);

  const addSObjectToGraph = useCallback(async (sobjectName: string, x: number, y: number) => {
    setIsLoading(true);
    setAddingNode(sobjectName);
    try {
      // Use cache service to get SObject (includes relationships by default)
      const cacheService = SObjectCacheService.getInstance();
      const sobjectData = await cacheService.getSObject(sobjectName);
      
      // Prepare SObject data for drag and drop
      
      // Position calculation is now handled by the AST to graph conversion
      // No need for manual positioning in the AST-first approach
      
      // Only use first N fields when dragging sObject to canvas
      const initialFields = (sobjectData.fields || []).slice(0, DRAG_DROP_CONSTANTS.INITIAL_FIELDS_COUNT);
      
      // Set initial fields in AST
      
      // Show notification about field limitation
      const totalFields = sobjectData.fields?.length || 0;
      if (totalFields > DRAG_DROP_CONSTANTS.INITIAL_FIELDS_COUNT) {
        notificationService.info({
          title: i18nService.tSync('schema.notifications.sobjectAdded.title') || 'SObject Added to Canvas',
          message: i18nService.tSync('schema.notifications.sobjectAdded.message', {
            sobjectName,
            displayedFields: DRAG_DROP_CONSTANTS.INITIAL_FIELDS_COUNT,
            totalFields,
            hiddenFields: totalFields - DRAG_DROP_CONSTANTS.INITIAL_FIELDS_COUNT
          }) || tSync('schema.sobjectAddedWithFields', '{sobjectName} added with first {initialCount} fields ({hiddenCount} more fields available but not displayed)', { 
            sobjectName, 
            initialCount: DRAG_DROP_CONSTANTS.INITIAL_FIELDS_COUNT, 
            hiddenCount: totalFields - DRAG_DROP_CONSTANTS.INITIAL_FIELDS_COUNT 
          }),
          autoClose: DRAG_DROP_CONSTANTS.NOTIFICATION_AUTO_CLOSE_DELAY
        });
      }

      // All relationship logic is now handled by the AST to graph conversion
      // No need for manual relationship linking in the AST-first approach


      // AST-FIRST APPROACH: Create/update AST first, then re-render canvas
      
      if (!astStateRef.current) {
        // Create new AST if none exists
        const newAST = {
          sObject: sobjectName,
          sObjectLabel: sobjectData.label || sobjectName,
          sObjectMetadata: {
            name: sobjectName,
            label: sobjectData.label || sobjectName,
            isCustom: sobjectData.custom || false
          },
          fields: initialFields.map(field => {
            // Check if this is a relationship field (has dots in the name)
            if (field.name.includes('.')) {
              // This is a relationship field - parse the relationship path
              const parts = field.name.split('.');
              const relationships = parts.slice(0, -1); // All parts except the last one
              const fieldName = parts[parts.length - 1]; // The last part is the actual field name
              
              return {
                type: 'FieldRelationship',
                field: fieldName,
                relationships: relationships,
                fieldLabel: field.label || field.name,
                fieldType: field.type,
                fieldMetadata: {
                  name: field.name,
                  label: field.label || field.name,
                  type: field.type,
                  relationshipName: field.relationshipName,
                  referenceTo: field.referenceTo
                },
                startOffset: 0,
                endOffset: 0
              };
            } else {
              // Regular field
              return {
                type: 'Field',
                field: field.name,
                fieldLabel: field.label || field.name,
                fieldType: field.type,
                fieldMetadata: {
                  name: field.name,
                  label: field.label || field.name,
                  type: field.type,
                  relationshipName: field.relationshipName,
                  referenceTo: field.referenceTo
                },
                startOffset: 0,
                endOffset: 0
              };
            }
          })
        };
        
        setAstState(newAST);
        
        // Render the canvas from the new AST
        await renderCanvasFromAST(newAST);
        
        // Return early after creating new AST - no need for relationship linking
        return;
      } else {
        // Check if the SObject is already the main SObject in the AST
        if (astStateRef.current.sObject === sobjectName) {
          return;
        }
        
        // Check if this SObject is already a subquery in the AST
        const existingSubquery = astStateRef.current.fields?.find(field => 
          field.type === 'FieldSubquery' && field.actualSObjectName === sobjectName
        );
        
        if (existingSubquery) {
          return;
        }
        
        // Add as subquery to existing AST
        const updatedAST = JSON.parse(JSON.stringify(astStateRef.current));
        
        // Check for relationships in both directions and with existing subqueries
        const mainSObjectData = await cacheService.getSObject(astStateRef.current.sObject);
        const draggedSObjectData = await cacheService.getSObject(sobjectName);
        
        // Get all existing SObjects in the AST (main + subqueries)
        const existingSObjects = [
          { name: astStateRef.current.sObject, type: 'main' },
          ...(astStateRef.current.fields || [])
            .filter(field => field.type === 'FieldSubquery')
            .map(field => ({ name: field.actualSObjectName, type: 'subquery' }))
        ];
        
        
        let relationshipField = null;
        let parentSObject = null;
        let parentSObjectType = null;
        
        // Check if dragged SObject can be added to any existing SObject in the AST
        for (const existingSObject of existingSObjects) {
          const existingSObjectData = await cacheService.getSObject(existingSObject.name);
          
          // Check if dragged SObject is a child of this existing SObject
          const foundRelationship = existingSObjectData?.childRelationships?.find(
            (rel: any) => rel.childSObject === sobjectName
          );
          
          if (foundRelationship) {
            relationshipField = foundRelationship;
            parentSObject = existingSObject.name;
            parentSObjectType = existingSObject.type;
            break;
          }
        }
        
        // If not found, check if any existing SObject is a child of dragged SObject (reverse relationship)
        if (!relationshipField) {
          for (const existingSObject of existingSObjects) {
            const foundRelationship = draggedSObjectData?.childRelationships?.find(
              (rel: any) => rel.childSObject === existingSObject.name
            );
            
            if (foundRelationship) {
              relationshipField = foundRelationship;
              parentSObject = existingSObject.name;
              parentSObjectType = existingSObject.type;
              break;
            }
          }
        }
        
        if (!relationshipField) {
          logger.warn('No relationship found between any existing SObject and dragged SObject, skipping subquery creation', 'SchemaTab', { 
            existingSObjects: existingSObjects.map(obj => obj.name),
            draggedSObject: sobjectName
          });
          
          // Show user-friendly notification explaining why the object can't be added
          notificationService.warning({
            title: i18nService.tSync('schema.notifications.noRelationship.title') || 'No Relationship Found',
            message: i18nService.tSync('schema.notifications.noRelationship.message', {
              draggedSObject: sobjectName,
              mainSObject: existingSObjects.map(obj => obj.name).join(', ')
            }) || `Cannot add "${sobjectName}" to the canvas. No relationship exists between any existing SObjects (${existingSObjects.map(obj => obj.name).join(', ')}) and "${sobjectName}". Only related SObjects can be added as subqueries.`,
            autoClose: 5000
          });
          
          return;
        }
        
        const relationshipFieldName = relationshipField.relationshipName;
        
        // Always add as subquery - let user use right-click context menu for correct direction
        
        // Add subquery field to the appropriate parent
        const subqueryField = {
          type: 'FieldSubquery',
          field: relationshipFieldName,
          fieldLabel: relationshipFieldName,
          fieldType: 'reference',
          fieldMetadata: {
            name: relationshipFieldName,
            label: relationshipFieldName,
            type: 'reference',
            required: false,
            unique: false,
            externalId: false,
            calculated: false,
            relationshipName: relationshipFieldName,
            referenceTo: [sobjectName],
            picklistValues: []
          },
          relationshipFieldName: relationshipFieldName,
          actualSObjectName: sobjectName,
          actualSObjectLabel: sobjectData.label || sobjectName,
          startOffset: 0,
          endOffset: 0,
          subquery: {
            sObject: sobjectName,
            relationshipName: relationshipFieldName,
            sObjectLabel: sobjectData.label || sobjectName,
            sObjectMetadata: {
              name: sobjectName,
              label: sobjectData.label || sobjectName,
              isCustom: sobjectData.custom || false,
            },
            fields: initialFields.map(field => ({
              type: 'Field',
              field: field.name,
              fieldLabel: field.label || field.name,
              fieldType: field.type,
              fieldMetadata: {
                name: field.name,
                label: field.label || field.name,
                type: field.type,
                relationshipName: field.relationshipName,
                referenceTo: field.referenceTo,
              },
              startOffset: 0,
              endOffset: 0
            }))
          }
        };
        
        // Add the subquery field to the appropriate parent
        if (parentSObjectType === 'main') {
          // Add to main SObject fields
        if (!updatedAST.fields) {
          updatedAST.fields = [];
        }
        updatedAST.fields.push(subqueryField);
        } else {
          // Add to existing subquery fields
          const parentSubqueryIndex = updatedAST.fields.findIndex(field => 
            field.type === 'FieldSubquery' && field.actualSObjectName === parentSObject
          );
          if (parentSubqueryIndex !== -1) {
            if (!updatedAST.fields[parentSubqueryIndex].subquery) {
              updatedAST.fields[parentSubqueryIndex].subquery = { fields: [] };
            }
            if (!updatedAST.fields[parentSubqueryIndex].subquery.fields) {
              updatedAST.fields[parentSubqueryIndex].subquery.fields = [];
            }
            updatedAST.fields[parentSubqueryIndex].subquery.fields.push(subqueryField);
          }
        }
        
        setAstState(updatedAST);
        
        // Render the canvas from the updated AST
        await renderCanvasFromAST(updatedAST);
        
        // Show notification for reverse relationship
        notificationService.info({
          title: i18nService.tSync('schema.notifications.reverseRelationshipAdded.title') || 'Relationship Added',
          message: i18nService.tSync('schema.notifications.reverseRelationshipAdded.message', {
            sobjectName,
            parentSObject: astStateRef.current.sObject
          }) || `${sobjectName} added as subquery to ${astStateRef.current.sObject}. Use right-click context menu to add correct child if needed.`,
          autoClose: 5000
        });
        
        // Return early after adding subquery to AST - no need for relationship linking
        return;
      }
    } catch (error) {
      logger.error('Failed to add SObject to graph', 'SchemaTab', null, error as Error);
      
      // Show user-friendly error message
      const errorMessage = error instanceof Error ? error.message : tSync('schema.tab.unknownError', 'Unknown error');
      if (errorMessage.includes('no_connection')) {
        // Show notification or alert for connection issue
        logger.warn(tSync('schema.tab.noSalesforceConnection', 'No Salesforce connection available. Please connect to Salesforce first.'), 'SchemaTab');
        // You could add a notification system here to show this to the user
      }
    } finally {
      setIsLoading(false);
      setAddingNode(null);
    }
  }, [setAstState, notificationService, i18nService]);


  const removeNodeFromGraph = (nodeId: string) => {
    setGraphState(prev => ({
      ...prev,
      nodes: prev.nodes.filter(n => n.id !== nodeId),
      links: prev.links.filter(l => l.source !== nodeId && l.target !== nodeId),
      selectedNode: prev.selectedNode === nodeId ? undefined : prev.selectedNode
    }));
  };

  const toggleNodeExpansion = (nodeId: string) => {
    setGraphState(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => 
        n.id === nodeId ? { ...n, isExpanded: !n.isExpanded } : n
      )
    }));
  };

  const handleNodeClick = (nodeId: string) => {
    const node = graphState.nodes.find(n => n.id === nodeId);
    if (node) {
      setSelectedNodeDetails({
        name: node.name,
        label: node.label,
        fields: node.fields,
        isCustom: node.isCustom,
      });
      setShowNodeModal(true);
    }
  };



  // Helper function to build node hierarchy from links
  const buildNodeHierarchy = (nodes: any[], links: any[]) => {
    const hierarchy: { [key: string]: { level: number; children: string[]; parent?: string } } = {};
    
    // Initialize all nodes
    nodes.forEach(node => {
      hierarchy[node.id] = { level: 0, children: [] };
    });
    
    // Build parent-child relationships from links
    links.forEach(link => {
      if (hierarchy[link.source] && hierarchy[link.target]) {
        hierarchy[link.source].children.push(link.target);
        hierarchy[link.target].parent = link.source;
      }
    });
    
    // Calculate levels (BFS from root nodes)
    const queue: string[] = [];
    const visited = new Set<string>();
    
    // Find root nodes (nodes with no parents)
    Object.keys(hierarchy).forEach(nodeId => {
      if (!hierarchy[nodeId].parent) {
        hierarchy[nodeId].level = 0;
        queue.push(nodeId);
        visited.add(nodeId);
      }
    });
    
    // BFS to assign levels
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const currentLevel = hierarchy[currentId].level;
      
      hierarchy[currentId].children.forEach(childId => {
        if (!visited.has(childId)) {
          hierarchy[childId].level = currentLevel + 1;
          visited.add(childId);
          queue.push(childId);
        }
      });
    }
    
    return hierarchy;
  };

  // Helper function to position nodes hierarchically
  const positionNodesHierarchically = (
    nodes: any[], 
    hierarchy: { [key: string]: { level: number; children: string[]; parent?: string } },
    config: { nodeSpacing: number; levelSpacing: number; startX: number; startY: number }
  ) => {
    const { nodeSpacing, levelSpacing, startX, startY } = config;
    
    // Group nodes by level
    const nodesByLevel: { [level: number]: any[] } = {};
    nodes.forEach(node => {
      const level = hierarchy[node.id]?.level || 0;
      if (!nodesByLevel[level]) {
        nodesByLevel[level] = [];
      }
      nodesByLevel[level].push(node);
    });
    
    // Position nodes level by level
    Object.keys(nodesByLevel).forEach(levelStr => {
      const level = parseInt(levelStr);
      const levelNodes = nodesByLevel[level];
      
      // Calculate total width needed for this level
      const totalWidth = (levelNodes.length - 1) * nodeSpacing;
      const startXForLevel = startX - (totalWidth / 2) + (nodeSpacing / 2);
      
      // Position nodes horizontally within the level
      levelNodes.forEach((node, index) => {
        node.x = startXForLevel + (index * nodeSpacing);
        node.y = startY + (level * levelSpacing);
      });
    });
  };

  const clearGraph = () => {
    
    // Clear shared AST state (single source of truth)
    setAstState(null);
    
    // Clear graph state
    setGraphState({
      nodes: [],
      links: [],
      zoom: DRAG_DROP_CONSTANTS.DEFAULT_ZOOM,
      pan: DRAG_DROP_CONSTANTS.DEFAULT_PAN
    });
    
    // Also clear any selected node details and close modals
    setSelectedNodeDetails(null);
    setShowNodeModal(false);
    setContextMenu(prev => ({ ...prev, visible: false }));
    // Also close submenu when context menu closes
    setIsChildObjectsSubmenuVisible(false);
    setChildObjectsSubmenuData(null);
    setShowSchemaReport(false);
    setSchemaReportData(null);
    setSchemaReportFilter('');
    setShowPicklistModal(false);
    setCurrentPicklistData(null);
    
    // Preserve completeNodeMetadata and showAllFields to prevent canvas wipe
    // These states should persist across report open/close cycles
    
  };

  // Session-aware storage handles state clearing automatically

  // Filter schema report fields with toggle support
  const filteredFields = useMemo(() => {
    // Determine which fields to show based on toggle
    let fieldsToShow = [];
    
    logger.debug('FilteredFields calculation', 'SchemaTab', {
      showAllFields,
      hasCompleteMetadata: !!completeNodeMetadata?.fields,
      completeMetadataFieldsCount: completeNodeMetadata?.fields?.length || 0,
      hasSchemaReportData: !!schemaReportData?.fields,
      schemaReportFieldsCount: schemaReportData?.fields?.length || 0
    });
    
    if (showAllFields && completeNodeMetadata?.fields) {
      // Show all metadata fields
      fieldsToShow = completeNodeMetadata.fields;
      logger.debug('Using complete metadata fields', 'SchemaTab', { 
        count: fieldsToShow.length,
        picklistFields: fieldsToShow.filter(f => f.type === 'picklist' || f.type === 'multipicklist').map(f => ({
          name: f.name,
          type: f.type,
          hasPicklistValues: !!f.picklistValues,
          picklistValuesCount: f.picklistValues?.length || 0
        }))
      });
    } else if (schemaReportData?.fields && completeNodeMetadata?.fields) {
      // Show only selected fields from the query, but map them to complete metadata for accurate types
      const selectedFieldNames = schemaReportData.fields.map(field => field.name);
      fieldsToShow = completeNodeMetadata.fields.filter(metadataField => 
        selectedFieldNames.includes(metadataField.name)
      );
      logger.debug('Using selected fields mapped to complete metadata', 'SchemaTab', { 
        selectedCount: schemaReportData.fields.length,
        mappedCount: fieldsToShow.length,
        selectedFieldNames: selectedFieldNames.slice(0, 5), // Show first 5 for debugging
        picklistFields: fieldsToShow.filter(f => f.type === 'picklist' || f.type === 'multipicklist').map(f => ({
          name: f.name,
          type: f.type,
          hasPicklistValues: !!f.picklistValues,
          picklistValuesCount: f.picklistValues?.length || 0
        }))
      });
    } else if (schemaReportData?.fields) {
      // Fallback to selected fields if no complete metadata available
      fieldsToShow = schemaReportData.fields;
      logger.debug('Using selected fields (fallback)', 'SchemaTab', { count: fieldsToShow.length });
    } else {
      logger.debug('No fields available', 'SchemaTab');
      return [];
    }
    
    // Apply filter if provided
    let filtered = fieldsToShow;
    if (schemaReportFilter) {
      const filterLower = schemaReportFilter.toLowerCase();
      filtered = fieldsToShow.filter(field => {
        // Special handling for reference filter - only show fields with type === 'reference'
        if (filterLower === 'reference') {
          return field.type === 'reference';
        }
        
        // Special handling for picklist filter - only show fields with type === 'picklist' or 'multipicklist'
        if (filterLower === 'picklist') {
          return field.type === 'picklist' || field.type === 'multipicklist';
        }
        
        // Check field name and label
        if (field.name.toLowerCase().includes(filterLower) ||
            field.label.toLowerCase().includes(filterLower)) {
          return true;
        }
        
        // Check field type
        if (field.type.toLowerCase().includes(filterLower)) {
          return true;
        }
        
        // Check field properties
        const properties = [];
        if (field.required) properties.push('required');
        if (field.externalId) properties.push('external id');
        if (field.calculated) properties.push('calculated');
        if (field.precision && field.scale) properties.push('decimal');
        if (field.length) properties.push('length');
        
        return properties.some(prop => prop.toLowerCase().includes(filterLower));
      });
    }

    // Apply sorting if schemaSortStatus is set
    if (schemaSortStatus) {
      filtered = filtered.sort((a, b) => {
        const aValue = String(a[schemaSortStatus.columnAccessor] || '');
        const bValue = String(b[schemaSortStatus.columnAccessor] || '');
        
        if (schemaSortStatus.direction === 'asc') {
          return aValue.localeCompare(bValue);
        } else {
          return bValue.localeCompare(aValue);
        }
      });
    }

    return filtered;
  }, [schemaReportData?.fields, completeNodeMetadata, showAllFields, schemaReportFilter, schemaSortStatus]);

  // Debug logging for filteredFields changes
  useEffect(() => {
    logger.debug('FilteredFields updated', 'SchemaTab', {
      filteredFieldsCount: filteredFields.length,
      showAllFields,
      schemaReportFilter,
      firstFewFields: filteredFields.slice(0, 3).map(f => ({ name: f.name, type: f.type }))
    });
  }, [filteredFields, showAllFields, schemaReportFilter]);

  // Handle picklist modal
  const handleShowPicklist = useCallback((fieldName: string, values: any[]) => {
    setCurrentPicklistData({ fieldName, values });
    setPicklistFilter(''); // Reset filter when opening modal
    setShowPicklistModal(true);
  }, []);

  // Define columns with resizable property like ResultsViewPage
  const schemaColumns = useMemo(() => [
    {
      accessor: 'name',
      title: tSync('schema.tab.fieldName', 'Field Name'),
      width: columnWidths.name,
      minWidth: 100,
      ellipsis: true,
      resizable: true,
      sortable: true,
      render: ({ name }: SchemaField) => (
        <Text fw={600} size="sm" ff="monospace" c="dark.7">
          {name}
        </Text>
      )
    },
    {
      accessor: 'label',
      title: tSync('schema.tab.fieldLabel', 'Field Label'),
      width: columnWidths.label,
      minWidth: 150,
      ellipsis: true,
      resizable: true,
      render: ({ label }: SchemaField) => (
        <Text size="sm" c="dark.6">
          {label}
        </Text>
      )
    },
    {
      accessor: 'type',
      title: tSync('schema.tab.type', 'Type'),
      width: columnWidths.type,
      minWidth: 150,
      ellipsis: true,
      resizable: true,
      render: ({ type, referenceTo }: SchemaField) => {
        // For reference fields, show type with object names in parentheses
        if (type === 'reference' && referenceTo && referenceTo.length > 0) {
          const referenceNames = referenceTo.join(', ');
          return (
            <Tooltip label={tSync('schema.tab.referencesTooltip', 'References: {referenceNames}', { referenceNames })}>
              <Badge 
                size="sm" 
                variant="gradient"
                gradient={{ from: getFieldTypeColor(type), to: getFieldTypeColor(type), deg: 45 }}
              >
                {`${type} (${referenceNames})`}
              </Badge>
            </Tooltip>
          );
        }
        
        // For non-reference fields, show just the type
        return (
          <Badge 
            size="sm" 
            variant="gradient"
            gradient={{ from: getFieldTypeColor(type), to: getFieldTypeColor(type), deg: 45 }}
          >
            {type}
          </Badge>
        );
      }
    },
    {
      accessor: 'properties',
      title: tSync('schema.tab.properties', 'Properties & Values'),
      width: columnWidths.properties,
      minWidth: 200,
      ellipsis: true,
      resizable: true,
      render: ({ 
        name, 
        type, 
        referenceTo, 
        precision, 
        scale, 
        length,
      }: SchemaField) => (
        <Flex gap="xs" wrap="wrap" align="center">
          {/* Basic Field Properties */}
          
          
          {/* Length, Precision, Scale */}
          {length !== undefined && (
            <Tooltip label={tSync('schema.tab.lengthTooltip', 'Maximum number of characters allowed: {length}', { length })}>
              <Badge size="xs" color="gray" variant="light">
                Length: {length}
              </Badge>
            </Tooltip>
          )}
          {precision !== undefined && scale !== undefined && (
            <Tooltip label={tSync('schema.tab.precisionTooltip', 'Number format: {precision} total digits, {scale} decimal places', { precision, scale })}>
              <Badge size="xs" color="gray" variant="light">
                {precision},{scale}
              </Badge>
            </Tooltip>
          )}
          
          
          
          {/* Reference information is now shown in the Type column */}
        </Flex>
      )
    },
    {
      accessor: 'picklistValues',
      title: tSync('schema.tab.picklistValues', 'Picklist Values'),
      width: columnWidths.picklistValues || 200,
      minWidth: 150,
      ellipsis: true,
      resizable: true,
      render: ({ name, type, picklistValues }: SchemaField) => {
        // Only show for picklist and multipicklist fields
        if ((type === 'picklist' || type === 'multipicklist') && picklistValues && picklistValues.length > 0) {
          return (
            <Button
              size="xs"
              variant="light"
              color="cyan"
              onClick={() => handleShowPicklist(name, picklistValues)}
              style={{ fontSize: '11px', padding: '2px 8px' }}
            >
              {picklistValues.length} values
            </Button>
          );
        }
        
        // For non-picklist fields or fields without values
        return (
          <Text size="xs" c="dimmed">
            {type === 'picklist' || type === 'multipicklist' ? 'No values' : '-'}
          </Text>
        );
      }
    }
  ], [columnWidths, handleShowPicklist]);



  // Helper function to get color for field types
  const getFieldTypeColor = (type: string): string => {
    switch (type.toLowerCase()) {
      case 'string':
      case 'text':
      case 'textarea':
        return 'blue';
      case 'number':
      case 'int':
      case 'double':
      case 'currency':
        return 'green';
      case 'boolean':
        return 'orange';
      case 'date':
      case 'datetime':
        return 'purple';
      case 'picklist':
      case 'multipicklist':
        return 'cyan';

      case 'reference':
      case 'foreign key':
        return 'violet';
      case 'address':
        return 'gray';
      case 'id':
        return 'red';
      default:
        return 'gray';
    }
  };

  // Mouse event handlers for panning and node dragging
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only hide context menu on left click, not right click
    if (e.button === 0) { // Left click
      setContextMenu(prev => ({ ...prev, visible: false }));
      // Also close submenu when context menu closes
      setIsChildObjectsSubmenuVisible(false);
      setChildObjectsSubmenuData(null);
    }

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Convert mouse position to canvas coordinates
    const canvasX = (mouseX - graphState.pan.x) / graphState.zoom;
    const canvasY = (mouseY - graphState.pan.y) / graphState.zoom;

    // Check if clicking on a node (updated for table dimensions)
    const clickedNode = graphState.nodes.find(node => {
      const headerHeight = 35;
      const rowHeight = 25;
      const maxVisibleRows = 5;
      
      // Get related fields for this node
      const relatedFields = node.fields.filter(field => {
        return graphState.links.some(link => 
          (link.source === node.id && (link.fieldName === field.name || link.field === field.name)) ||
          (link.target === node.id && (link.fieldName === field.name || link.field === field.name))
        );
      });
      
      const idField = node.fields.find(f => f.name === 'Id');
      const fieldsToShow = idField && !relatedFields.find(f => f.name === 'Id') 
        ? [idField, ...relatedFields] 
        : relatedFields;
      
      const totalHeight = headerHeight + (Math.min(fieldsToShow.length, maxVisibleRows) * rowHeight) + 20;
      
      // Calculate header width based on content
      const headerText = `${node.label} (${node.name})`;
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        tempCtx.font = 'bold 14px Inter';
        const headerTextWidth = tempCtx.measureText(headerText).width;
        const nodeWidth = Math.max(250, headerTextWidth + 60);
        
        return canvasX >= node.x && canvasX <= node.x + nodeWidth &&
               canvasY >= node.y && canvasY <= node.y + totalHeight;
      }
      
      // Fallback to fixed width
      return canvasX >= node.x && canvasX <= node.x + 250 &&
             canvasY >= node.y && canvasY <= node.y + totalHeight;
    });

    if (clickedNode && e.button === 0) { // Only start dragging on left click
      // Start node dragging
      setIsNodeDragging(true);
      setDraggedNodeId(clickedNode.id);
      setDragStart({ x: e.clientX, y: e.clientY });
              logger.debug('Started dragging node', 'SchemaTab', { nodeId: clickedNode.id });
    } else if (e.button === 0) { // Only start panning on left click
      // Start canvas panning
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  }, [graphState.nodes, graphState.pan, graphState.zoom]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      // Canvas panning
      setGraphState(prev => ({
        ...prev,
        pan: {
          x: prev.pan.x + (e.clientX - dragStart.x),
          y: prev.pan.y + (e.clientY - dragStart.y)
        }
      }));
      setDragStart({ x: e.clientX, y: e.clientY });
    } else if (isNodeDragging && draggedNodeId) {
      // Node dragging
      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;
      
      setGraphState(prev => ({
        ...prev,
        nodes: prev.nodes.map(node => 
          node.id === draggedNodeId 
            ? { ...node, x: node.x + deltaX / prev.zoom, y: node.y + deltaY / prev.zoom }
            : node
        )
      }));
      
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  }, [isDragging, isNodeDragging, draggedNodeId, dragStart, graphState.zoom]);

  const handleMouseUp = useCallback(() => {

    setIsDragging(false);
    setIsNodeDragging(false);
    setDraggedNodeId(null);
  }, [isNodeDragging, draggedNodeId]);

  // Handle right-click context menu
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
            logger.debug('Right-click detected', 'SchemaTab', { 
      clientX: e.clientX, 
      clientY: e.clientY,
      nodesCount: graphState.nodes.length 
    });
    
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      logger.warn('Container rect not found', 'SchemaTab');
      return;
    }

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Convert mouse position to canvas coordinates
    const canvasX = (mouseX - graphState.pan.x) / graphState.zoom;
    const canvasY = (mouseY - graphState.pan.y) / graphState.zoom;

            logger.debug('Mouse coordinates', 'SchemaTab', { 
      mouseX, mouseY, canvasX, canvasY, 
      pan: graphState.pan, zoom: graphState.zoom 
    });

    // Check if right-clicking on a node
    const clickedNode = graphState.nodes.find(node => {
      // Use the same logic as node rendering to calculate actual node dimensions
      const headerHeight = 40;
      const rowHeight = 20;
      const maxVisibleRows = 5;
      
      // Get fields for this node (same logic as rendering)
      const fieldsToShow = node.fields || [];
      const totalHeight = headerHeight + (Math.min(fieldsToShow.length, maxVisibleRows) * rowHeight) + 20;
      
      // Calculate header width based on content (same logic as rendering)
      const headerText = `${node.label} (${node.name})`;
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        tempCtx.font = 'bold 14px Inter';
        const headerTextWidth = tempCtx.measureText(headerText).width;
        const nodeWidth = Math.max(250, headerTextWidth + 60);
        
        const isInNode = canvasX >= node.x && canvasX <= node.x + nodeWidth &&
                        canvasY >= node.y && canvasY <= node.y + totalHeight;
        
        logger.debug('Checking node with dynamic dimensions', 'SchemaTab', { 
          nodeId: node.id, 
          nodeX: node.x, 
          nodeY: node.y,
          nodeWidth,
          totalHeight,
          canvasX,
          canvasY,
          isInNode 
        });
        return isInNode;
      }
      
      // Fallback to original logic if canvas context creation fails
      const isInNode = canvasX >= node.x && canvasX <= node.x + 200 &&
                      canvasY >= node.y && canvasY <= node.y + 100;
      logger.debug('Checking node with fallback dimensions', 'SchemaTab', { 
        nodeId: node.id, 
        nodeX: node.x, 
        nodeY: node.y, 
        isInNode 
      });
      return isInNode;
    });

    if (clickedNode) {
      setContextMenu({
        visible: true,
        x: e.clientX,
        y: e.clientY,
        nodeId: clickedNode.id
      });
              logger.debug('Right-clicked on node, context menu shown', 'SchemaTab', { 
        nodeId: clickedNode.id,
        menuPosition: { x: e.clientX, y: e.clientY }
      });
    } else {
              logger.debug('Right-clicked on empty space', 'SchemaTab');
    }
  }, [graphState.nodes, graphState.pan, graphState.zoom]);

  // Handle context menu actions
  const handleContextMenuAction = useCallback((action: string) => {
    const currentNodeId = contextMenu.nodeId;
            logger.debug('Context menu action triggered', 'SchemaTab', { 
      action, 
      nodeId: currentNodeId,
      contextMenuState: contextMenu
    });
    
    if (!currentNodeId) {
      logger.warn('No node ID in context menu', 'SchemaTab', { contextMenu });
      return;
    }

    switch (action) {
      case 'delete':

        
        setGraphState(prev => {
          const newState = {
            ...prev,
            nodes: prev.nodes.filter(n => n.id !== currentNodeId),
            links: prev.links.filter(l => l.source !== currentNodeId && l.target !== currentNodeId)
          };
          return newState;
        });
        
        break;
      case 'schema-report':
        logger.debug('Showing schema report', 'SchemaTab', { nodeId: currentNodeId });
        const selectedNode = graphState.nodes.find(n => n.id === currentNodeId);
        if (selectedNode) {
          // Fetch complete metadata for the selected node
          fetchCompleteNodeMetadata(selectedNode);
        } else {
          logger.warn('Selected node not found', 'SchemaTab', { nodeId: currentNodeId });
        }
        break;
      case 'relationships-report':
        const nodeForRelationships = graphState.nodes.find(n => n.id === currentNodeId);
        if (nodeForRelationships) {
          fetchRelationshipsData(nodeForRelationships.name);
          setShowRelationshipsReport(true);
          setRelationshipsFilter('');
        } else {
          logger.warn('Selected node not found for relationships', 'SchemaTab', { nodeId: currentNodeId });
        }
        break;
      case 'add-child-objects':
        const parentNode = graphState.nodes.find(n => n.id === currentNodeId);
        if (parentNode) {
          showChildObjectsSubmenu(parentNode);
        } else {
          logger.warn('Parent node not found for adding child objects', 'SchemaTab', { nodeId: currentNodeId });
        }
        break;
      case 'select-fields':
        const selectNode = graphState.nodes.find(n => n.id === currentNodeId);
        if (selectNode) {
          openFieldSelectionModal(selectNode);
        } else {
          logger.warn('Target node not found for field selection', 'SchemaTab', { nodeId: currentNodeId });
        }
        break;
      default:
        logger.warn('Unknown context menu action', 'SchemaTab', { action });
        break;
    }

    setContextMenu(prev => ({ ...prev, visible: false }));
    // Also close submenu when context menu closes
    setIsChildObjectsSubmenuVisible(false);
    setChildObjectsSubmenuData(null);
  }, [contextMenu.nodeId, graphState.nodes]);

  // Convert existing AST to SOQL query
  const convertGraphToQuery = useCallback(async () => {
    try {
      // Check if we have an AST to convert
      if (!astState) {
        logger.warn('No AST available to convert to SOQL query', 'SchemaTab');
        notificationService.warning({
          title: tSync('schema.tab.noQueryToConvert', 'No Query to Convert'),
          message: tSync('schema.tab.noQueryToConvertMessage', 'Please add SObjects to the canvas first before converting to SOQL query.'),
          autoClose: 3000
        });
        return;
      }


      // Compose query from AST (single source of truth)
      const soqlQuery = composeQuery(astState, {
        format: true,
        formatOptions: {
          numIndent: 1,
          fieldMaxLineLength: 1,
          fieldSubqueryParensOnOwnLine: true
        }
      });

      // Send the query to the QueryTab via custom event
      const event = new CustomEvent('graphToQueryGenerated', {
        detail: { query: soqlQuery }
      });
      window.dispatchEvent(event);

      // Show success notification
      const regularFields = astState.fields?.filter(f => f.type === 'Field').length || 0;
      const subqueries = astState.fields?.filter(f => f.type === 'FieldSubquery').length || 0;
      const totalSObjects = 1 + subqueries; // Main SObject + subqueries
      
      notificationService.success({
        title: i18nService.tSync('schema.graphToQuerySuccess') || 'Graph Converted Successfully',
        message: i18nService.tSync('schema.graphToQuerySuccessMessage', { 
          sobject: astState.sObject,
          fields: regularFields,
          subqueries: subqueries,
          totalObjects: totalSObjects
        }) || `Graph converted to SOQL query with ${totalSObjects} SObjects (${regularFields} fields, ${subqueries} subqueries)`
      });


    } catch (error) {
      logger.error('Failed to convert AST to SOQL query', 'SchemaTab', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      notificationService.error({
        title: i18nService.tSync('schema.graphToQueryError') || 'Graph Conversion Failed',
        message: i18nService.tSync('schema.graphToQueryErrorMessage') || 'Failed to convert graph to SOQL query. Please try again.'
      });
    }
  }, [astState, i18nService, notificationService]);

  // Debug: Log when convertGraphToQuery is called
  logger.debug('convertGraphToQuery function created/updated', 'SchemaTab', {
    hasGraphState: !!graphState,
    graphStateType: typeof graphState,
    hasNodes: !!graphState?.nodes,
    hasLinks: !!graphState?.links
  });

  // Fetch complete metadata for a node
  const fetchCompleteNodeMetadata = useCallback(async (selectedNode: any) => {
    try {
      
      // Use cache service to get complete SObject metadata
      const cacheService = SObjectCacheService.getInstance();
      const completeMetadata = await cacheService.getSObject(selectedNode.name);
      
      if (completeMetadata) {
        // Store complete metadata
        setCompleteNodeMetadata(completeMetadata);
        
        // Set schema report data with selected fields from AST (the existing logic will map them to complete metadata)
        setSchemaReportData({
          name: completeMetadata.name || selectedNode.name,
          label: completeMetadata.label || selectedNode.label,
          fields: selectedNode.fields || [], // Keep selected fields from AST - existing logic will map to complete metadata
          isCustom: completeMetadata.custom || selectedNode.isCustom,
        });
        
        // Reset field view toggle to show selected fields by default
        setShowAllFields(false);
        
        // Show the schema report
        setShowSchemaReport(true);
        
      } else {
        logger.warn('No metadata found for node', 'SchemaTab', { nodeId: selectedNode.id });
        // Fallback to node data if metadata fetch fails
        setSchemaReportData({
          name: selectedNode.name,
          label: selectedNode.label,
          fields: selectedNode.fields, // Fallback to selected fields from query if metadata not available
          isCustom: selectedNode.isCustom,
        });
        setShowSchemaReport(true);
      }
    } catch (error) {
      logger.error('Failed to fetch complete metadata for node', 'SchemaTab', { 
        nodeId: selectedNode.id,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Fallback to node data if metadata fetch fails
      setSchemaReportData({
        name: selectedNode.name,
        label: selectedNode.label,
        fields: selectedNode.fields, // Fallback to selected fields from query if metadata fetch fails
        isCustom: selectedNode.isCustom
      });
      setShowSchemaReport(true);
    }
  }, []);

  // Fetch relationships data for an SObject
  const fetchRelationshipsData = useCallback(async (sObjectName: string) => {
    try {
      
      // Use cache service to get SObject (includes relationships by default)
      const cacheService = SObjectCacheService.getInstance();
      const data = await cacheService.getSObject(sObjectName);
      
      // Extract relationships from the describe result
      const relationships: RelationshipRecord[] = [];
      
      // Process child relationships (where this object is the parent)
      if (data.childRelationships) {
        data.childRelationships.forEach((rel: any) => {
          relationships.push({
            objectField: `${rel.childSObject}.${rel.field}`,
            relationshipName: rel.relationshipName || '',
            cascadeDelete: rel.cascadeDelete || false,
            childSObject: rel.childSObject,
            fieldName: rel.field
          });
        });
      }
      
      // Process parent relationships (where this object references others)
      if (data.fields) {
        data.fields.forEach((field: any) => {
          if (field.type === 'reference' && field.referenceTo && field.referenceTo.length > 0) {
            field.referenceTo.forEach((refSObject: string) => {
              relationships.push({
                objectField: `${sObjectName}.${field.name}`,
                relationshipName: field.relationshipName || '',
                cascadeDelete: false, // Parent relationships don't have cascade delete
                childSObject: sObjectName,
                fieldName: field.name
              });
            });
          }
        });
      }
      
      setRelationshipsReportData(relationships);
      setRelationshipsSObjectData({ name: data.name, label: data.label });
      
    } catch (error) {
      logger.error('Error fetching relationships data', 'SchemaTab', { sObjectName }, error as Error);
      setRelationshipsReportData([]);
    }
  }, []);

  // Add child objects to canvas with relationship links
  const addChildObjectsToCanvas = useCallback(async (parentNode: GraphNode) => {
    try {
      
      // Get the parent SObject data with relationships
      const cacheService = SObjectCacheService.getInstance();
      const parentData = await cacheService.getSObject(parentNode.name);
      
      if (!parentData.childRelationships || parentData.childRelationships.length === 0) {
        return;
      }

      const newNodes: GraphNode[] = [];
      const newLinks: any[] = [];
      let offsetX = 0;

      // Process each child relationship
      for (const relationship of parentData.childRelationships) {
        const childSObjectName = relationship.childSObject;
        
        // Check if child object is already on canvas
        const existingNode = graphState.nodes.find(n => n.id === childSObjectName);
        if (existingNode) {
          logger.debug('Child object already exists on canvas', 'SchemaTab', { childSObjectName });
          continue;
        }

        try {
          // Get child SObject data
          const childData = await cacheService.getSObject(childSObjectName);
          
          // Create new node for child object
          const childNode: GraphNode = {
            id: childSObjectName,
            name: childSObjectName,
            label: childData.label || childSObjectName,
            x: parentNode.x + 300 + offsetX, // Position to the right of parent
            y: parentNode.y + offsetX * 50, // Stagger vertically
            fields: childData.fields || [],
            isCustom: childData.custom || false,
            isExpanded: false
          };
          
          newNodes.push(childNode);
          
          // Check if child already has a parent (single-parent constraint)
          const existingParentLink = graphState.links.find(link => link.target === childSObjectName);
          
          if (existingParentLink) {
            // Child already has a parent - replace the existing parent with the new one
            
            // Remove the old parent link and add the new one
            const link = {
              id: `${parentNode.id}-${childSObjectName}`,
              source: parentNode.id,
              target: childSObjectName,
              fieldName: relationship.field,
              relationshipType: 'master-detail',
              relationshipName: relationship.relationshipName || '',
              field: relationship.field
            };
            
            newLinks.push(link);
          } else {
            // Child doesn't have a parent - create new link
            const link = {
              id: `${parentNode.id}-${childSObjectName}`,
              source: parentNode.id,
              target: childSObjectName,
              fieldName: relationship.field,
              relationshipType: 'master-detail',
              relationshipName: relationship.relationshipName || '',
              field: relationship.field
            };
            
            newLinks.push(link);
          }
          
          offsetX += 50; // Increment offset for next child
          
          logger.debug('Added child object to canvas', 'SchemaTab', { 
            childSObjectName, 
            relationshipName: relationship.relationshipName,
            relationshipType: 'master-detail'
          });
          
        } catch (error) {
          logger.error('Failed to add child object', 'SchemaTab', { childSObjectName }, error as Error);
        }
      }

      // Update graph state with new nodes and links
      if (newNodes.length > 0 || newLinks.length > 0) {
        setGraphState(prev => {
          // Remove any existing parent links for the new child nodes to enforce single-parent constraint
          const childNodeIds = newNodes.map(node => node.id);
          const filteredLinks = prev.links.filter(link => !childNodeIds.includes(link.target));
          
          return {
            ...prev,
            nodes: [...prev.nodes, ...newNodes],
            links: [...filteredLinks, ...newLinks]
          };
        });
        
      } else {
      }
      
    } catch (error) {
      logger.error('Error adding child objects to canvas', 'SchemaTab', { parentNodeName: parentNode.name }, error as Error);
    }
  }, [graphState.nodes, graphState.links]);

  // Show child objects submenu
  const showChildObjectsSubmenu = useCallback(async (parentNode: GraphNode) => {
    try {
      
      // Set loading state for child objects
      const childSObjectNames = new Set<string>();
      
      // Get the parent SObject data with relationships
      const cacheService = SObjectCacheService.getInstance();
      const parentData = await cacheService.getSObject(parentNode.name);
      
      if (!parentData.childRelationships || parentData.childRelationships.length === 0) {
        return;
      }

      // Add child object names to loading set
      parentData.childRelationships.forEach((rel: any) => {
        childSObjectNames.add(rel.childSObject);
      });
      setLoadingChildObjects(childSObjectNames);

      // Deduplicate relationships by childSObject to prevent duplicate entries in submenu
      const uniqueRelationships = new Map<string, any>();
      
      parentData.childRelationships.forEach((rel: any) => {
        const key = rel.childSObject;
        if (!uniqueRelationships.has(key)) {
          uniqueRelationships.set(key, {
            childSObject: rel.childSObject,
            relationshipName: rel.relationshipName || '',
            field: rel.field,
            cascadeDelete: rel.cascadeDelete || false
          });
        }
      });
      
      // Set the submenu data with deduplicated relationships
      setChildObjectsSubmenuData({
        parentNode,
        childRelationships: Array.from(uniqueRelationships.values())
      });
      
      // Show the submenu
      setIsChildObjectsSubmenuVisible(true);
      
      
    } catch (error) {
      logger.error('Error showing child objects submenu', 'SchemaTab', { parentNodeName: parentNode.name }, error as Error);
    } finally {
      // Clear loading state
      setLoadingChildObjects(new Set());
    }
  }, []);

  // Show select master parent submenu
  const showSelectMasterParentSubmenu = useCallback((childNode: GraphNode) => {
    try {
      
      // Find all parent links for this child node
      const allParentLinks = graphState.links.filter(link => link.target === childNode.id);
      
      if (allParentLinks.length <= 1) {
        logger.warn('Child node has only one or no parents, no need for master parent selection', 'SchemaTab', { 
          childNodeName: childNode.name,
          parentCount: allParentLinks.length
        });
        return;
      }
      
      // Find the current master parent (the one that would be used in AST conversion)
      // This is determined by the single-parent constraint logic
      const linksByTarget = new Map<string, any[]>();
      allParentLinks.forEach(link => {
        if (!linksByTarget.has(link.target)) {
          linksByTarget.set(link.target, []);
        }
        linksByTarget.get(link.target)!.push(link);
      });
      
      // Apply the same logic as in convertGraphToQuery to find current master
      const parentNodes = allParentLinks.map(link => {
        const parentNode = graphState.nodes.find(node => node.id === link.source);
        return {
          node: parentNode,
          link: link,
          additionOrder: parentNode ? parentNode.y : 0
        };
      }).filter(item => item.node);
      
      parentNodes.sort((a, b) => b.additionOrder - a.additionOrder);
      const currentMasterLink = parentNodes[0].link;
      
      // Create available parents list
      const availableParents = allParentLinks.map(link => {
        const parentNode = graphState.nodes.find(node => node.id === link.source);
        return {
          nodeId: link.source,
          nodeName: parentNode?.name || link.source,
          isCurrentMaster: link.id === currentMasterLink.id,
          link: link
        };
      });
      
      // Set the submenu data
      setSelectMasterParentSubmenuData({
        childNode,
        currentMasterLink,
        allParentLinks,
        availableParents
      });
      
      // Close child objects submenu if it's open
      setIsChildObjectsSubmenuVisible(false);
      setChildObjectsSubmenuData(null);
      
      // Show the submenu
      setIsSelectMasterParentSubmenuVisible(true);
      
      
    } catch (error) {
      logger.error('Error showing select master parent submenu', 'SchemaTab', { childNodeName: childNode.name }, error as Error);
    }
  }, [graphState.nodes, graphState.links]);

  // Show field selection modal
  const openFieldSelectionModal = useCallback(async (node: GraphNode) => {
    try {
      
      // Get complete SObject metadata
      const cacheService = SObjectCacheService.getInstance();
      const sobjectData = await cacheService.getSObject(node.name);
      
      if (!sobjectData || !sobjectData.fields) {
        logger.warn('No SObject data found for field selection', 'SchemaTab', { nodeName: node.name });
        notificationService.warning({
          title: tSync('schema.notifications.noSObjectData.title', 'No SObject Data'),
          message: tSync('schema.notifications.noSObjectData.message', { sobjectName: node.name }) || `No metadata found for ${node.name}`,
        });
        return;
      }

      // Get currently selected fields
      const currentFields = node.fields.map(f => f.name);
      
      // Get all available fields (including already selected ones)
      const availableFields = sobjectData.fields;
      
      // Set the modal data
      setFieldSelectionData({
        node,
        availableFields,
        selectedFields: currentFields // Initialize with currently selected fields
      });
      
      // Show the modal with animation
      setModalMounted(true);
      setShowFieldSelectionModal(true);
      
      // Trigger animation after DOM is ready
      requestAnimationFrame(() => {
        setModalVisible(true);
      });
      
      
    } catch (error) {
      logger.error('Error opening field selection modal', 'SchemaTab', { nodeName: node.name }, error as Error);
      notificationService.error({
        title: tSync('schema.notifications.fieldSelectionError.title', 'Field Selection Error'),
        message: tSync('schema.notifications.fieldSelectionError.message', 'Failed to load fields for selection. Please try again.'),
      });
    }
  }, []);

  // Close field selection modal
  const closeFieldSelectionModal = useCallback(() => {
    setModalVisible(false);
    setTimeout(() => {
      setShowFieldSelectionModal(false);
      setModalMounted(false);
      setFieldSelectionData(null);
    }, 400); // Match the transition duration
  }, []);

  // Add selected fields to node
  const addSelectedFieldsToNode = useCallback(async (selectedFields: string[]) => {
    if (!fieldSelectionData || selectedFields.length === 0) {
      return;
    }
    
    try {
      const { node } = fieldSelectionData;

      // Get the selected field objects
      const fieldsToAdd = fieldSelectionData.availableFields.filter(field => 
        selectedFields.includes(field.name)
      );
      

      // AST-FIRST APPROACH: Update AST first, then re-render canvas
      if (astState) {
        try {
          const updatedAST = await replaceFieldsInAST(astState, node.name, fieldsToAdd);
          if (updatedAST) {
            setAstState(updatedAST);
            await renderCanvasFromAST(updatedAST);
          }
        } catch (error) {
          logger.error('Failed to update AST with fields', 'SchemaTab', { error: error instanceof Error ? error.message : String(error) });
        }
      }
      
      // Show notification
      notificationService.success({
        title: tSync('schema.notifications.selectedFieldsAdded.title', 'Selected Fields Added'),
        message: tSync('schema.notifications.selectedFieldsAdded.message', {
          sobjectName: node.name,
          addedFields: selectedFields.length
        }) || `Added ${selectedFields.length} selected fields to ${node.name}`,
      });

      // Close the modal with animation
      closeFieldSelectionModal();
      
    } catch (error) {
      logger.error('Error adding selected fields to node', 'SchemaTab', { 
        nodeName: fieldSelectionData?.node.name,
        selectedFields 
      }, error as Error);
      notificationService.error({
        title: tSync('schema.notifications.addSelectedFieldsError.title', 'Add Fields Error'),
        message: tSync('schema.notifications.addSelectedFieldsError.message', 'Failed to add selected fields. Please try again.'),
      });
    }
  }, [fieldSelectionData, astState, setAstState, renderCanvasFromAST, notificationService, i18nService, replaceFieldsInAST]);

  // Handle master parent selection
  const handleMasterParentSelection = useCallback((selectedParentNodeId: string) => {
    if (!selectMasterParentSubmenuData) return;
    
    const { childNode, allParentLinks } = selectMasterParentSubmenuData;
    const selectedLink = allParentLinks.find(link => link.source === selectedParentNodeId);
    
    if (!selectedLink) {
      logger.error('Selected parent link not found', 'SchemaTab', { 
        childNodeName: childNode.name,
        selectedParent: selectedParentNodeId
      });
      return;
    }
    
    
    // Enforce single-parent constraint: remove all other parent links for this child
    setGraphState(prev => {
      // Remove all existing parent links for this child node
      const filteredLinks = prev.links.filter(link => link.target !== childNode.id);
      
      // Add only the selected parent link
      const newLinks = [...filteredLinks, selectedLink];
      
      return {
        ...prev,
        links: newLinks
      };
    });
    
    const newMasterParentNode = graphState.nodes.find(n => n.id === selectedParentNodeId);
    
    // Close the submenu
    setIsSelectMasterParentSubmenuVisible(false);
    setSelectMasterParentSubmenuData(null);
    
    // Show success notification
    notificationService.success({
      title: i18nService.tSync('schema.masterParentSelected') || 'Master Parent Selected',
      message: i18nService.tSync('schema.masterParentSelectedMessage', {
        childNode: childNode.name,
        masterParent: newMasterParentNode?.name || selectedParentNodeId
      }) || `Selected ${newMasterParentNode?.name || selectedParentNodeId} as master parent for ${childNode.name}`
    });
    
  }, [selectMasterParentSubmenuData, graphState.nodes, setGraphState, notificationService, i18nService]);

  // Add single child object to canvas - AST-FIRST APPROACH
  const addSingleChildObjectToCanvas = useCallback(async (childSObjectName: string) => {
    if (!childObjectsSubmenuData) {
      return;
    }

    try {
      // Set loading state for this specific child object
      setAddingChildObject(childSObjectName);

      // Check if child object is already on canvas
      const existingNode = graphState.nodes.find(n => n.id === childSObjectName);
      if (existingNode) {
        logger.debug('Child object already exists on canvas', 'SchemaTab', { childSObjectName });
        return;
      }

      // Get child SObject data from cache (will fetch from API if not cached)
      const cacheService = SObjectCacheService.getInstance();
      logger.debug('Retrieving child SObject data from cache', 'SchemaTab', { childSObjectName });
      
      const childData = await cacheService.getSObject(childSObjectName);
      
      if (!childData) {
        throw new Error(`Failed to retrieve data for SObject: ${childSObjectName}`);
      }

      logger.debug('Successfully retrieved child SObject data', 'SchemaTab', { 
        childSObjectName, 
        hasFields: !!childData.fields,
        fieldCount: childData.fields?.length || 0,
        label: childData.label,
        isCustom: childData.custom
      });
      
      // Find the relationship data
      const relationship = childObjectsSubmenuData.childRelationships.find(rel => rel.childSObject === childSObjectName);
      
      if (!relationship) {
        throw new Error(`Relationship data not found for child object: ${childSObjectName}`);
      }

      // AST-FIRST APPROACH: Modify AST and re-render canvas
      if (!astStateRef.current) {
        // Create new AST if none exists
        const newAST = {
          sObject: childSObjectName,
          sObjectLabel: childData.label || childSObjectName,
          sObjectMetadata: {
            name: childSObjectName,
            label: childData.label || childSObjectName,
            isCustom: childData.custom || false
          },
          fields: (childData.fields || []).slice(0, DRAG_DROP_CONSTANTS.INITIAL_FIELDS_COUNT).map(field => ({
            type: 'Field',
            field: field.name,
            fieldLabel: field.label || field.name,
            fieldType: field.type,
            fieldMetadata: {
              name: field.name,
              label: field.label || field.name,
              type: field.type,
              relationshipName: field.relationshipName,
              referenceTo: field.referenceTo
            },
            startOffset: 0,
            endOffset: 0
          }))
        };
        
        setAstState(newAST);
        await renderCanvasFromAST(newAST);
        return;
      }

      // Add as subquery to existing AST
      const updatedAST = JSON.parse(JSON.stringify(astStateRef.current));
      
      // Only use first N fields when adding child object
      const initialFields = (childData.fields || []).slice(0, DRAG_DROP_CONSTANTS.INITIAL_FIELDS_COUNT);
      
      // Create subquery field for the child object
      const subqueryField = {
        type: 'FieldSubquery',
        field: relationship.relationshipName,
        fieldLabel: relationship.relationshipName,
        fieldType: 'reference',
        fieldMetadata: {
          name: relationship.relationshipName,
          label: relationship.relationshipName,
          type: 'reference',
          required: false,
          unique: false,
          externalId: false,
          calculated: false,
          relationshipName: relationship.relationshipName,
          referenceTo: [childSObjectName],
          picklistValues: []
        },
        relationshipFieldName: relationship.relationshipName,
        actualSObjectName: childSObjectName,
        actualSObjectLabel: childData.label || childSObjectName,
        startOffset: 0,
        endOffset: 0,
        subquery: {
          sObject: childSObjectName,
          relationshipName: relationship.relationshipName,
          sObjectLabel: childData.label || childSObjectName,
          sObjectMetadata: {
            name: childSObjectName,
            label: childData.label || childSObjectName,
            isCustom: childData.custom || false,
          },
          fields: initialFields.map(field => ({
            type: 'Field',
            field: field.name,
            fieldLabel: field.label || field.name,
            fieldType: field.type,
            fieldMetadata: {
              name: field.name,
              label: field.label || field.name,
              type: field.type,
              relationshipName: field.relationshipName,
              referenceTo: field.referenceTo,
            },
            startOffset: 0,
            endOffset: 0
          }))
        }
      };
      
      // Add the subquery field to the main SObject fields
      if (!updatedAST.fields) {
        updatedAST.fields = [];
      }
      updatedAST.fields.push(subqueryField);
      
      // Update AST and re-render canvas
      setAstState(updatedAST);
      await renderCanvasFromAST(updatedAST);
      
      // Show notification about field limitation
      const totalFields = childData.fields?.length || 0;
      if (totalFields > DRAG_DROP_CONSTANTS.INITIAL_FIELDS_COUNT) {
        notificationService.info({
          title: i18nService.tSync('schema.notifications.childObjectAdded.title') || 'Child Object Added',
          message: i18nService.tSync('schema.notifications.childObjectAdded.message', {
            childSObjectName,
            displayedFields: DRAG_DROP_CONSTANTS.INITIAL_FIELDS_COUNT,
            totalFields,
            hiddenFields: totalFields - DRAG_DROP_CONSTANTS.INITIAL_FIELDS_COUNT
          }) || `${childSObjectName} added with first ${DRAG_DROP_CONSTANTS.INITIAL_FIELDS_COUNT} fields (${totalFields - DRAG_DROP_CONSTANTS.INITIAL_FIELDS_COUNT} more fields available but not displayed)`,
          autoClose: DRAG_DROP_CONSTANTS.NOTIFICATION_AUTO_CLOSE_DELAY
        });
      }
      
    } catch (error) {
      logger.error('Error adding single child object to canvas', 'SchemaTab', { childSObjectName }, error as Error);
      // You could add a toast notification here for user feedback
    } finally {
      // Clear loading state
      setAddingChildObject(null);
    }
  }, [childObjectsSubmenuData, graphState.nodes, graphState.links]);



  // Determine relationship type based on Salesforce data
  const getRelationshipType = useCallback((link: GraphLink) => {
    // Master-Detail relationships are always one-to-many
    if (link.relationshipType === 'master-detail') {
      return '1:N'; // One-to-Many (Parent can have many children)
    }
    
    // Only master-detail relationships are supported now
    
    // Many-to-many relationships (Junction objects)
    if (link.relationshipType === 'many-to-many') {
      return 'N:N'; // Many-to-Many
    }
    
    return '1:N'; // Default to one-to-many
  }, []);

  // Zoom functions
  const handleZoom = useCallback((direction: 'in' | 'out') => {
    setGraphState(prev => {
      const increment = direction === 'in' ? 0.1 : -0.1;
      const newZoom = Math.max(0.5, Math.min(2, prev.zoom + increment));
      return { ...prev, zoom: newZoom };
    });
  }, []);

  // Reset view to default
  const resetView = useCallback(() => {
    setGraphState(prev => ({
      ...prev,
      zoom: 1,
      pan: { x: 0, y: 0 }
    }));
  }, []);

  // Fit graph to canvas
  const fitToCanvas = useCallback(() => {
    if (graphState.nodes.length === 0) return;
    
    const bounds = {
      minX: Math.min(...graphState.nodes.map(n => n.x)),
      maxX: Math.max(...graphState.nodes.map(n => n.x)),
      minY: Math.min(...graphState.nodes.map(n => n.y)),
      maxY: Math.max(...graphState.nodes.map(n => n.y))
    };
    
    const graphWidth = bounds.maxX - bounds.minX;
    const graphHeight = bounds.maxY - bounds.minY;
    const centerX = bounds.minX + graphWidth / 2;
    const centerY = bounds.minY + graphHeight / 2;
    
    // Center the graph
    const canvasCenterX = canvasSize.width / 2;
    const canvasCenterY = canvasSize.height / 2;
    
    const offsetX = canvasCenterX - centerX;
    const offsetY = canvasCenterY - centerY;
    
    setGraphState(prev => ({
      ...prev,
      pan: { x: offsetX, y: offsetY },
      zoom: 1
    }));
  }, [graphState.nodes, canvasSize]);

  // Render graph on canvas
  useEffect(() => {
    
    const canvas = canvasRef.current;
    if (!canvas) {
      logger.warn('Canvas ref is null, skipping render', 'SchemaTab');
      return;
    }
    
    // If canvas size is 0, try to get dimensions from container
    let width = canvasSize.width;
    let height = canvasSize.height;
    
    if (width === 0 || height === 0) {
      
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        width = rect.width;
        height = rect.height;
        
        if (width > 0 && height > 0) {
          setCanvasSize({ width, height });
        }
      }
    }
    
    if (width === 0 || height === 0) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Add roundRect polyfill for older browsers
    if (!ctx.roundRect) {
      ctx.roundRect = function(x: number, y: number, width: number, height: number, radius: number) {
        this.beginPath();
        this.moveTo(x + radius, y);
        this.lineTo(x + width - radius, y);
        this.quadraticCurveTo(x + width, y, x + width, y + radius);
        this.lineTo(x + width, y + height - radius);
        this.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        this.lineTo(x + radius, y + height);
        this.quadraticCurveTo(x, y + height, x, y + height - radius);
        this.lineTo(x, y + radius);
        this.quadraticCurveTo(x, y, x + radius, y);
        this.closePath();
      };
    }

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Debug logging
    logger.debug('Rendering graph on canvas', 'SchemaTab', {
      width,
      height,
      nodesCount: graphState.nodes.length,
      linksCount: graphState.links.length,
      pan: graphState.pan,
      zoom: graphState.zoom
    });

    // Background is now blank (grid removed for cleaner appearance)

    // Apply transformations
    ctx.save();
    ctx.translate(graphState.pan.x, graphState.pan.y);
    ctx.scale(graphState.zoom, graphState.zoom);

    // Draw links
    graphState.links.forEach(link => {
      const sourceNode = graphState.nodes.find(n => n.id === link.source);
      const targetNode = graphState.nodes.find(n => n.id === link.target);
      
              logger.debug('Drawing link', 'SchemaTab', {
        linkId: link.id,
        sourceNode: sourceNode?.name,
        targetNode: targetNode?.name,
        sourcePos: sourceNode ? { x: sourceNode.x, y: sourceNode.y } : null,
        targetPos: targetNode ? { x: targetNode.x, y: targetNode.y } : null
      });
      
      if (sourceNode && targetNode) {
        // Calculate source node width
        const sourceHeaderText = `${sourceNode.label} (${sourceNode.name})`;
        ctx.font = 'bold 14px Inter'; // Set font before measuring
        const sourceHeaderTextMetrics = ctx.measureText(sourceHeaderText);
        const sourceNodeWidth = Math.max(250, sourceHeaderTextMetrics.width + 60);
        
        // Find the field position in the source node
        const sourceField = sourceNode.fields.find(f => f.name === link.fieldName || f.name === link.field);
        let sourceX = sourceNode.x + sourceNodeWidth; // Default to right edge
        let sourceY = sourceNode.y + 35 + 12; // Default to header center
        
        if (sourceField) {
          // Get related fields for source node
          const sourceRelatedFields = sourceNode.fields.filter(field => {
            return graphState.links.some(link => 
              (link.source === sourceNode.id && (link.fieldName === field.name || link.field === field.name)) ||
              (link.target === sourceNode.id && (link.fieldName === field.name || link.field === field.name))
            );
          });
          
          const sourceIdField = sourceNode.fields.find(f => f.name === 'Id');
          const sourceFieldsToShow = sourceIdField && !sourceRelatedFields.find(f => f.name === 'Id') 
            ? [sourceIdField, ...sourceRelatedFields] 
            : sourceRelatedFields;
          
          const fieldIndex = sourceFieldsToShow.findIndex(f => f.name === sourceField.name);
          if (fieldIndex >= 0 && fieldIndex < 8) { // Only if field is visible in the table
            sourceY = sourceNode.y + 35 + (fieldIndex * 25) + 12; // Position at the field row
          }
        }
        
        // Calculate target node width
        const targetHeaderText = `${targetNode.label} (${targetNode.name})`;
        ctx.font = 'bold 14px Inter'; // Set font before measuring
        const targetHeaderTextMetrics = ctx.measureText(targetHeaderText);
        const targetNodeWidth = Math.max(250, targetHeaderTextMetrics.width + 60);
        
        // Find the field position in the target node (for incoming relationships)
        const targetField = targetNode.fields.find(f => f.name === link.fieldName || f.name === link.field);
        let targetX = targetNode.x; // Default to left edge
        let targetY = targetNode.y + 35 + 12; // Default to header center
        
        if (targetField) {
          // Get related fields for target node
          const targetRelatedFields = targetNode.fields.filter(field => {
            return graphState.links.some(link => 
              (link.source === targetNode.id && (link.fieldName === field.name || link.field === field.name)) ||
              (link.target === targetNode.id && (link.fieldName === field.name || link.field === field.name))
            );
          });
          
          const targetIdField = targetNode.fields.find(f => f.name === 'Id');
          const targetFieldsToShow = targetIdField && !targetRelatedFields.find(f => f.name === 'Id') 
            ? [targetIdField, ...targetRelatedFields] 
            : targetRelatedFields;
          
          const fieldIndex = targetFieldsToShow.findIndex(f => f.name === targetField.name);
          if (fieldIndex >= 0 && fieldIndex < 8) { // Only if field is visible in the table
            targetY = targetNode.y + 35 + (fieldIndex * 25) + 12; // Position at the field row
          }
        }
        
        // Draw curved/elastic arrow
        ctx.beginPath();
        
        // Calculate control points for a smooth curve
        const dx = targetX - sourceX;
        const dy = targetY - sourceY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Control points for a nice curve
        const controlPoint1X = sourceX + distance * 0.3;
        const controlPoint1Y = sourceY;
        const controlPoint2X = targetX - distance * 0.3;
        const controlPoint2Y = targetY;
        
        // Draw curved path
        ctx.moveTo(sourceX, sourceY);
        ctx.bezierCurveTo(controlPoint1X, controlPoint1Y, controlPoint2X, controlPoint2Y, targetX, targetY);
        
        // Relationship line styling - Simple black arrows like RAG diagram
        ctx.strokeStyle = '#000000'; // Black arrows like RAG diagram
        ctx.lineWidth = 1; // Thin lines like RAG diagram
        
        ctx.stroke();

        // Draw arrowhead at the end of the curve
        // Calculate the tangent angle at the end of the curve
        const tangentX = targetX - controlPoint2X;
        const tangentY = targetY - controlPoint2Y;
        const angle = Math.atan2(tangentY, tangentX);
        
        ctx.save();
        ctx.translate(targetX, targetY);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(-8, -4);
        ctx.lineTo(0, 0);
        ctx.lineTo(-8, 4);
        ctx.stroke();
        ctx.restore();

        // Draw field name and relationship type
        // Calculate position along the relationship line (closer to the middle)
        const lineLength = Math.sqrt(Math.pow(targetX - sourceX, 2) + Math.pow(targetY - sourceY, 2));
        const t = 0.6; // Position at 60% along the line (closer to target)
        const textX = sourceX + (targetX - sourceX) * t;
        const textY = sourceY + (targetY - sourceY) * t;
        
        // Get relationship type
        const relationshipType = getRelationshipType(link);
        
        // Create text with field name, relationship name, and relationship type
        const fieldName = link.fieldName || link.field;
        const relationshipName = link.relationshipName;

        
        // Build text content - prioritize relationship name over field name
        let text = '';
        if (relationshipName) {
          // Show relationship name (this is what we want to display)
          text = `${relationshipName} (${relationshipType})`;
        } else if (fieldName) {
          // Fallback to field name if no relationship name
          text = `${fieldName} (${relationshipType})`;
        } else {
          // Last resort fallback
          text = `rel (${relationshipType})`;
        }
        
        const textMetrics = ctx.measureText(text);
        const textWidth = textMetrics.width;
        const textHeight = 12;
        
        // Draw text - Black text with white highlight/outline
        ctx.font = 'bold 12px Inter'; // Bold and slightly larger for readability
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Draw white outline first
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.strokeText(text, textX, textY);
        
        // Draw black text on top
        ctx.fillStyle = '#000000';
        ctx.fillText(text, textX, textY);
      }
    });

    // Draw nodes as database tables
    graphState.nodes.forEach(node => {
      logger.debug('Drawing node', 'SchemaTab', {
        nodeId: node.id,
        nodeName: node.name,
        position: { x: node.x, y: node.y },
        isCustom: node.isCustom,
        fieldsCount: node.fields.length,
        isDragging: node.id === draggedNodeId
      });

      const headerHeight = 35;
      const rowHeight = 25;
      
      // Check if this is an AST-generated graph (has fields with specific structure)
      const isASTGenerated = node.fields.length > 0 && node.fields.some(field => 
        field.type === 'Field' || field.type === 'reference' || field.type === 'string' || field.type === 'id'
      );
      
      let fieldsToShow = [];
      
      if (isASTGenerated) {
        // For AST-generated graphs, show ALL fields from the query
        fieldsToShow = node.fields;
        logger.debug('AST-generated node - showing all fields', 'SchemaTab', {
          nodeId: node.id,
          nodeName: node.name,
          fieldsCount: node.fields.length,
          fields: node.fields.map(f => ({ name: f.name, type: f.type }))
        });
      } else {
        // For manually created graphs, show only related and unique fields
        const relatedFields = node.fields.filter(field => {
          // Check if this field is used in any relationship with other nodes
          return graphState.links.some(link => 
            (link.source === node.id && (link.fieldName === field.name || link.field === field.name)) ||
            (link.target === node.id && (link.fieldName === field.name || link.field === field.name))
          );
        });
        
        // Get unique fields (removed - no longer available in SchemaField)
        const uniqueFields: any[] = [];
        
        // Always include the Id field if it exists
        const idField = node.fields.find(f => f.name === 'Id');
        
        // Combine all fields: Id + Related + Unique (avoiding duplicates)
        const allFields = [];
        
        // Add Id field first if it exists
        if (idField) {
          allFields.push(idField);
        }
        
        // Add related fields
        relatedFields.forEach(field => {
          if (!allFields.find(f => f.name === field.name)) {
            allFields.push(field);
          }
        });
        
        // Add unique fields
        uniqueFields.forEach(field => {
          if (!allFields.find(f => f.name === field.name)) {
            allFields.push(field);
          }
        });
        
        fieldsToShow = allFields;
      }
      
      const maxVisibleRows = 5; // Show max 5 field rows
      const totalHeight = headerHeight + (Math.min(fieldsToShow.length, maxVisibleRows) * rowHeight) + 20; // +20 for padding
      
      // Calculate header width based on content
      const headerText = `${node.label} (${node.name})`;
      ctx.font = 'bold 14px Inter'; // Set font before measuring
      const headerTextMetrics = ctx.measureText(headerText);
      const headerTextWidth = headerTextMetrics.width;
      const nodeWidth = Math.max(250, headerTextWidth + 60); // Minimum 250px, or content width + padding (increased padding)
      
      // Add shadow for dragged node
      if (node.id === draggedNodeId) {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 5;
        ctx.shadowOffsetY = 5;
      }

      // Draw table header - Clean geometric style like RAG diagram
      if (node.isCustom) {
        // Custom objects: Light orange background (like RAG diagram sections)
        ctx.fillStyle = '#fed7aa'; // Light orange background
        ctx.strokeStyle = '#000000'; // Thin black outline
      } else {
        // Standard objects: Light gray background (like RAG diagram sections)
        ctx.fillStyle = '#f3f4f6'; // Light gray background
        ctx.strokeStyle = '#000000'; // Thin black outline
      }
      
      ctx.lineWidth = 1; // Thin black outline like RAG diagram
      
      ctx.beginPath();
      ctx.roundRect(node.x, node.y, nodeWidth, headerHeight, 2); // Minimal rounding
      ctx.fill();
      ctx.stroke();

      // Draw table body - Clean white background with thin black outline
      ctx.fillStyle = '#ffffff'; // Pure white background
      ctx.strokeStyle = '#000000'; // Thin black outline
      ctx.lineWidth = 1;
      
      ctx.beginPath();
      ctx.roundRect(node.x, node.y + headerHeight, nodeWidth, totalHeight - headerHeight, 2);
      ctx.fill();
      ctx.stroke();

      // Draw header text - Bold black text like RAG diagram
      ctx.fillStyle = '#000000'; // Black text like RAG diagram
      ctx.font = 'bold 14px Inter';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${node.label} (${node.name})`, node.x + nodeWidth/2, node.y + headerHeight/2);

      // Draw field rows (only related fields)
      const visibleFields = fieldsToShow.slice(0, maxVisibleRows);
      visibleFields.forEach((field, index) => {
        const rowY = node.y + headerHeight + (index * rowHeight) + rowHeight/2;
        
        // Field name - Clean black text like RAG diagram
        if (field.name === 'Id' || field.name.toLowerCase().includes('id')) {
          ctx.fillStyle = '#000000'; // Black text for ID fields
          ctx.font = 'bold 12px Inter';
          
          // Draw ID icon (small key symbol)
          ctx.fillStyle = '#dc2626'; // Red color for ID icon
          ctx.font = 'bold 10px Inter';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText('🔑', node.x + 8, rowY); // Key emoji as ID icon
          
          // Draw field name with offset for icon
          ctx.fillStyle = '#000000';
          ctx.font = 'bold 12px Inter';
          ctx.fillText(field.name, node.x + 25, rowY);
        } else if (field.type === 'reference') {
          // Relationship fields - special styling
          ctx.fillStyle = '#7c3aed'; // Purple color for relationship fields
          ctx.font = 'bold 12px Inter';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          
          // Draw relationship icon
          ctx.fillStyle = '#7c3aed'; // Purple color for relationship icon
          ctx.font = 'bold 10px Inter';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText('🔗', node.x + 8, rowY); // Link emoji as relationship icon
          
          // Draw field name with offset for icon
          ctx.fillStyle = '#7c3aed';
          ctx.font = 'bold 12px Inter';
          
          // Truncate field name if too long
          let fieldName = field.name;
          const maxFieldNameWidth = nodeWidth - 80; // Leave space for type and constraints
          const fieldNameMetrics = ctx.measureText(fieldName);
          if (fieldNameMetrics.width > maxFieldNameWidth) {
            while (fieldName.length > 0 && ctx.measureText(fieldName + '...').width > maxFieldNameWidth) {
              fieldName = fieldName.slice(0, -1);
            }
            fieldName += '...';
          }
          
          ctx.fillText(fieldName, node.x + 25, rowY);
        } else {
          ctx.fillStyle = '#000000'; // Black text for regular fields
          ctx.font = '12px Inter';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          
          // Truncate field name if too long
          let fieldName = field.name;
          const maxFieldNameWidth = nodeWidth - 80; // Leave space for type and constraints
          const fieldNameMetrics = ctx.measureText(fieldName);
          if (fieldNameMetrics.width > maxFieldNameWidth) {
            while (fieldName.length > 0 && ctx.measureText(fieldName + '...').width > maxFieldNameWidth) {
              fieldName = fieldName.slice(0, -1);
            }
            fieldName += '...';
          }
          
          ctx.fillText(fieldName, node.x + 25, rowY);
        }

        // Field type - Show "Unique" for unique fields, relationship info for reference fields, otherwise show type
        let typeColor = '#000000'; // Black text like RAG diagram
        ctx.fillStyle = typeColor;
        ctx.font = 'bold 11px Inter';
        ctx.textAlign = 'right';
        
        if (field.type === 'reference' && field.relationship) {
          // Show relationship target for reference fields
          ctx.fillStyle = '#7c3aed'; // Purple color for relationship type
          ctx.fillText(`→ ${field.relationship}`, node.x + nodeWidth - 10, rowY);
        } else {
          ctx.fillStyle = typeColor;
          ctx.fillText(field.type, node.x + nodeWidth - 10, rowY);
        }

        // Draw constraints - Simple black text like RAG diagram
        const constraints = [];
        // Don't show 'U' for unique fields since we're already showing "Unique" as type
        if (field.required) constraints.push('R');
        if (field.externalId) constraints.push('E');
        
        if (constraints.length > 0) {
          // Simple black text for constraints
          ctx.fillStyle = '#000000';
          ctx.font = '11px Inter';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.fillText(constraints.join(','), node.x + nodeWidth - 10, rowY);
        }
        
        // Field highlighting removed - no longer needed

        // Draw row separator - Thin black lines like RAG diagram
        if (index < visibleFields.length - 1) {
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(node.x + 5, node.y + headerHeight + (index + 1) * rowHeight);
          ctx.lineTo(node.x + nodeWidth - 5, node.y + headerHeight + (index + 1) * rowHeight);
          ctx.stroke();
        }
      });

      // Show "..." if there are more fields - Simple black text
      if (fieldsToShow.length > maxVisibleRows) {
        ctx.fillStyle = '#000000';
        ctx.font = '11px Inter';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const moreFieldsText = isASTGenerated 
          ? `... and ${fieldsToShow.length - maxVisibleRows} more query fields`
          : `... and ${fieldsToShow.length - maxVisibleRows} more fields (showing first 5 of ${fieldsToShow.length} total)`;
          
        ctx.fillText(moreFieldsText, 
          node.x + nodeWidth/2, node.y + headerHeight + (maxVisibleRows * rowHeight) + 15);
      }

      // No custom badge - clean like RAG diagram

      // Reset shadow
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    });

    ctx.restore();
  }, [graphState, canvasSize]);

  // Export functions
  const exportAsImage = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      logger.warn('Canvas not available for export', 'SchemaTab');
      return;
    }

    try {
      // Create a temporary canvas with higher resolution for better quality
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) {
        logger.error('Failed to get 2D context for export', 'SchemaTab');
        return;
      }

      // Set higher resolution (2x for better quality)
      const scale = 2;
      tempCanvas.width = canvas.width * scale;
      tempCanvas.height = canvas.height * scale;
      
      // Scale the context
      tempCtx.scale(scale, scale);
      
      // Draw the original canvas content
      tempCtx.drawImage(canvas, 0, 0);
      
      // Convert to blob and download
      tempCanvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `schema-graph-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }
      }, 'image/png', 0.95);
    } catch (error) {
      logger.error('Failed to export as image', 'SchemaTab', error as Error);
    }
  }, []);

  const exportAsPDF = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      logger.warn('Canvas not available for PDF export', 'SchemaTab');
      return;
    }

    setIsExporting(true);
    try {
      // Dynamically import jsPDF to avoid bundle size issues
      const { jsPDF } = await import('jspdf');
      
      // Get canvas data
      const canvasData = canvas.toDataURL('image/png', 0.95);
      
      // Calculate PDF dimensions
      const imgWidth = 210; // A4 width in mm
      const pageHeight = 295; // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      
      // Create PDF
      const pdf = new jsPDF('p', 'mm', 'a4');
      let position = 0;
      
      // Add title
      pdf.setFontSize(16);
      pdf.text('Schema Graph', 20, 20);
      pdf.setFontSize(10);
      pdf.text(`Generated on: ${new Date().toLocaleString()}`, 20, 30);
      pdf.text(`Objects: ${graphState.nodes.length}`, 20, 35);
      
      // Add canvas image
      pdf.addImage(canvasData, 'PNG', 0, 45, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      
      // Add additional pages if needed
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(canvasData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      
      // Save PDF
      pdf.save(`schema-graph-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.pdf`);
    } catch (error) {
      logger.error('Failed to export as PDF', 'SchemaTab', error as Error);
      // Fallback to image export if PDF fails
      exportAsImage();
    } finally {
      setIsExporting(false);
    }
  }, [graphState.nodes.length, exportAsImage]);

  // Export functions for reports
  const exportSchemaReportAsPDF = useCallback(async () => {
    if (!schemaReportData) {
      logger.warn('Schema report data not available for export', 'SchemaTab');
      return;
    }

    try {
      const { jsPDF } = await import('jspdf');
      
      // Create PDF
      const pdf = new jsPDF('l', 'mm', 'a4'); // Landscape orientation for better table fit
      
      // Add title
      pdf.setFontSize(16);
      pdf.text(`Schema Report: ${schemaReportData.label} (${schemaReportData.name})`, 20, 20);
      pdf.setFontSize(10);
      pdf.text(tSync('schema.tab.generatedOn', 'Generated on: {date}', { date: new Date().toLocaleString() }), 20, 30);
      pdf.text(tSync('schema.tab.objectType', 'Object Type: {type}', { type: schemaReportData.isCustom ? tSync('schema.tab.custom', 'Custom') : tSync('schema.tab.standard', 'Standard') }), 20, 35);
      pdf.text(tSync('schema.tab.totalFields', 'Total Fields: {total} | Filtered Fields: {filtered}', { total: schemaReportData.fields.length, filtered: filteredFields.length }), 20, 40);
      
      // Table headers - compact format like UI badges
      const headers = [
        tSync('schema.tab.fieldName', 'Field Name'),
        tSync('schema.tab.type', 'Type'),
        tSync('schema.tab.properties', 'Properties'),
        'Details'
      ];
      const columnWidths = [65, 20, 30, 65]; // Balanced widths, increased Details
      
      let yPosition = 50;
      const pageHeight = 180; // Increased page height, reduced bottom margin
      let currentPage = 1;
      
      // Draw table headers - FORCE VISIBLE
      const drawTableHeaders = (startY: number) => {
        let xPosition = 20;
        
        // Force proper font setup with larger size
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.setFillColor(180, 180, 180); // Even darker gray
        pdf.setTextColor(0, 0, 0);
        
        headers.forEach((header, index) => {
          // Draw header cell with WHITE background and black border
          pdf.setFillColor(255, 255, 255); // WHITE background
          pdf.rect(xPosition, startY, columnWidths[index], 12, 'F'); // Filled white
          pdf.setFillColor(0, 0, 0); // Black border
          pdf.rect(xPosition, startY, columnWidths[index], 12, 'D'); // Draw border only
          
          // Draw header text in BLACK on WHITE background
          pdf.setFontSize(14);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(0, 0, 0); // Black text
          pdf.text(header, xPosition + 4, startY + 8);
          
          xPosition += columnWidths[index];
        });
        
        return startY + 12;
      };
      
      // Draw table row with proper text wrapping - SCHEMA REPORT WITH OPTIMIZED FIELD NAME WIDTH AND CHARACTER CALCULATION AND TEXT WRAPPING AND BETTER SPACING AND IMPROVED READABILITY AND FINAL VERSION AND COMPLETE AND DONE AND FINISHED AND COMPLETE
      const drawTableRow = (field: any, startY: number) => {
        let xPosition = 20;
        let maxRowHeight = 12; // Increased minimum height
        
        const rowData = [
          field.name || 'N/A',
          field.type || 'N/A',
          // Properties column - simplified
          tSync('schema.tab.standard', 'Standard'),
          // Details column - better formatted info
          [
            field.label && `Label: ${field.label}`,
            field.length && `Len: ${field.length}`,
            field.precision && field.scale && `Prec: ${field.precision},${field.scale}`,
            field.referenceTo && field.referenceTo.length > 0 && `Ref: ${field.referenceTo[0]}${field.referenceTo.length > 1 ? '+' : ''}`
          ].filter(Boolean).join(' • ') || 'N/A'
        ];
        
        // First pass: calculate required row height for all columns
        rowData.forEach((value, index) => {
          let displayValue = (value !== null && value !== undefined) ? value.toString() : 'N/A';
          let lines = 1;
          
          // Calculate lines needed for each column - optimized for Field Name
          let maxCharsPerLine = Math.floor(columnWidths[index] / 2.5); // More conservative chars per mm
          if (index === 0) {
            maxCharsPerLine = Math.floor(columnWidths[index] / 2.0); // More characters per mm for Field Name
          }
          if (displayValue.length > maxCharsPerLine) {
            lines = Math.ceil(displayValue.length / maxCharsPerLine);
          }
          
          const rowHeight = lines * 5; // 5mm per line for better spacing
          if (rowHeight > maxRowHeight) {
            maxRowHeight = rowHeight;
          }
        });
        
        // Second pass: draw cells and text
        rowData.forEach((value, index) => {
          // Draw cell border with calculated height
          pdf.rect(xPosition, startY, columnWidths[index], maxRowHeight, 'S');
          
          let displayValue = (value !== null && value !== undefined) ? value.toString() : 'N/A';
          pdf.setFontSize(8); // Slightly larger font
          pdf.setFont('helvetica', 'normal');
          
          // Calculate lines needed for this column - optimized for Field Name
          let maxCharsPerLine = Math.floor(columnWidths[index] / 2.5);
          if (index === 0) {
            maxCharsPerLine = Math.floor(columnWidths[index] / 2.0); // More characters per mm for Field Name
          }
          if (displayValue.length > maxCharsPerLine) {
            // Split text into lines
            const lines = [];
            let currentLine = '';
            const words = displayValue.split(/(?=[A-Z])|_| /); // Split at camelCase, underscores, and spaces
            
            for (const word of words) {
              if ((currentLine + word).length <= maxCharsPerLine) {
                currentLine += word;
              } else {
                if (currentLine) lines.push(currentLine);
                currentLine = word;
              }
            }
            if (currentLine) lines.push(currentLine);
            
            // Draw each line
            lines.forEach((line, lineIndex) => {
              pdf.text(line, xPosition + 2, startY + 4 + (lineIndex * 4));
            });
          } else {
            pdf.text(displayValue, xPosition + 2, startY + 6);
          }
          
          xPosition += columnWidths[index];
        });
        
        return startY + maxRowHeight;
      };
      
      // Start with headers
      yPosition = drawTableHeaders(yPosition);
      
      // Add field data in table format
      filteredFields.forEach((field, index) => {
        if (yPosition > pageHeight) {
          pdf.addPage();
          currentPage++;
          yPosition = 20;
          yPosition = drawTableHeaders(yPosition);
        }
        
        yPosition = drawTableRow(field, yPosition);
      });
      
      // Save PDF
      pdf.save(`schema-report-${schemaReportData.name}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.pdf`);
      
      // Show success notification
      notificationService.success({
        title: i18nService.tSync('schema.notifications.exportSuccess.title') || 'Export Successful',
        message: i18nService.tSync('schema.notifications.exportSuccess.message') || 'Schema report has been exported successfully',
      });
    } catch (error) {
      logger.error('Failed to export schema report as PDF', 'SchemaTab', {
        error: error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        schemaReportData: schemaReportData?.name,
        filteredFieldsLength: filteredFields?.length
      });
      
      // Show user-friendly error notification
      notificationService.error({
        title: i18nService.tSync('schema.notifications.exportError.title') || 'Export Error',
        message: i18nService.tSync('schema.notifications.exportError.message') || 'Failed to export schema report as PDF. Please try again.',
      });
    }
  }, [schemaReportData, filteredFields]);

  const exportRelationshipsReportAsPDF = useCallback(async () => {
    if (!relationshipsSObjectData || !relationshipsReportData.length) {
      logger.warn('Relationships report data not available for export', 'SchemaTab');
      return;
    }

    try {
      const { jsPDF } = await import('jspdf');
      
      // Create PDF
      const pdf = new jsPDF('l', 'mm', 'a4'); // Landscape orientation for better table fit
      
      // Add title
      pdf.setFontSize(16);
      pdf.text(`Relationships Report: ${relationshipsSObjectData.label} (${relationshipsSObjectData.name})`, 20, 20);
      pdf.setFontSize(10);
      pdf.text(tSync('schema.tab.generatedOn', 'Generated on: {date}', { date: new Date().toLocaleString() }), 20, 30);
      pdf.text(tSync('schema.tab.totalRelationships', 'Total Relationships: {count}', { count: relationshipsReportData.length }), 20, 35);
      
      // Table headers - compact format
      const headers = [
        tSync('schema.tab.relationshipName', 'Relationship Name'),
        tSync('schema.tab.type', 'Type'),
        'Field',
        'Child Object',
        tSync('schema.tab.properties', 'Properties')
      ];
      const columnWidths = [45, 20, 35, 45, 35];
      
      let yPosition = 50;
      const pageHeight = 200; // Increased page height, reduced bottom margin
      
      // Draw table headers - FORCE VISIBLE
      const drawTableHeaders = (startY: number) => {
        let xPosition = 20;
        
        // Force proper font setup with larger size
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.setFillColor(180, 180, 180); // Even darker gray
        pdf.setTextColor(0, 0, 0);
        
        headers.forEach((header, index) => {
          // Draw header cell with WHITE background and black border
          pdf.setFillColor(255, 255, 255); // WHITE background
          pdf.rect(xPosition, startY, columnWidths[index], 12, 'F'); // Filled white
          pdf.setFillColor(0, 0, 0); // Black border
          pdf.rect(xPosition, startY, columnWidths[index], 12, 'D'); // Draw border only
          
          // Draw header text in BLACK on WHITE background
          pdf.setFontSize(14);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(0, 0, 0); // Black text
          pdf.text(header, xPosition + 4, startY + 8);
          
          xPosition += columnWidths[index];
        });
        
        return startY + 12;
      };
      
      // Draw table row with proper text wrapping - RELATIONSHIPS REPORT
      const drawTableRow = (relationship: any, startY: number) => {
        let xPosition = 20;
        let maxRowHeight = 12; // Increased minimum height
        
        const rowData = [
          relationship.relationshipName || 'N/A',
          relationship.relationshipType || 'N/A',
          relationship.field || 'N/A',
          relationship.childSObject || 'N/A',
          // Properties column - combine flags like UI badges
          [
            relationship.cascadeDelete && 'Cascade Delete',
            relationship.restrictedDelete && 'Restricted Delete'
          ].filter(Boolean).join(', ') || tSync('schema.tab.standard', 'Standard')
        ];
        
        // First pass: calculate required row height for all columns
        rowData.forEach((value, index) => {
          let displayValue = (value !== null && value !== undefined) ? value.toString() : 'N/A';
          let lines = 1;
          
          // Calculate lines needed for each column
          const maxCharsPerLine = Math.floor(columnWidths[index] / 2.5); // More conservative chars per mm
          if (displayValue.length > maxCharsPerLine) {
            lines = Math.ceil(displayValue.length / maxCharsPerLine);
          }
          
          const rowHeight = lines * 5; // 5mm per line for better spacing
          if (rowHeight > maxRowHeight) {
            maxRowHeight = rowHeight;
          }
        });
        
        // Second pass: draw cells and text
        rowData.forEach((value, index) => {
          // Draw cell border with calculated height
          pdf.rect(xPosition, startY, columnWidths[index], maxRowHeight, 'S');
          
          let displayValue = (value !== null && value !== undefined) ? value.toString() : 'N/A';
          pdf.setFontSize(8); // Slightly larger font
          pdf.setFont('helvetica', 'normal');
          
          // Calculate lines needed for this column
          const maxCharsPerLine = Math.floor(columnWidths[index] / 2.5);
          if (displayValue.length > maxCharsPerLine) {
            // Split text into lines
            const lines = [];
            let currentLine = '';
            const words = displayValue.split(/(?=[A-Z])|_| /); // Split at camelCase, underscores, and spaces
            
            for (const word of words) {
              if ((currentLine + word).length <= maxCharsPerLine) {
                currentLine += word;
              } else {
                if (currentLine) lines.push(currentLine);
                currentLine = word;
              }
            }
            if (currentLine) lines.push(currentLine);
            
            // Draw each line
            lines.forEach((line, lineIndex) => {
              pdf.text(line, xPosition + 2, startY + 4 + (lineIndex * 4));
            });
          } else {
            pdf.text(displayValue, xPosition + 2, startY + 6);
          }
          
          xPosition += columnWidths[index];
        });
        
        return startY + maxRowHeight;
      };
      
      // Start with headers
      yPosition = drawTableHeaders(yPosition);
      
      // Add relationship data in table format
      relationshipsReportData.forEach((relationship, index) => {
        // Debug: Log relationship data to identify undefined values
        if (!relationship.relationshipName || !relationship.relationshipType || !relationship.field || !relationship.childSObject) {
          logger.warn('Relationship data has undefined values', 'SchemaTab', {
            index,
            relationship,
            relationshipName: relationship.relationshipName,
            relationshipType: relationship.relationshipType,
            field: relationship.field,
            childSObject: relationship.childSObject
          });
        }
        
        if (yPosition > pageHeight) {
          pdf.addPage();
          yPosition = 20;
          yPosition = drawTableHeaders(yPosition);
        }
        
        yPosition = drawTableRow(relationship, yPosition);
      });
      
      // Save PDF
      pdf.save(`relationships-report-${relationshipsSObjectData.name}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.pdf`);
      
      // Show success notification
      notificationService.success({
        title: i18nService.tSync('schema.notifications.exportSuccess.title') || 'Export Successful',
        message: i18nService.tSync('schema.notifications.exportSuccess.message') || 'Relationships report has been exported successfully',
      });
    } catch (error) {
      logger.error('Failed to export relationships report as PDF', 'SchemaTab', {
        error: error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        relationshipsSObjectData: relationshipsSObjectData?.name,
        relationshipsReportDataLength: relationshipsReportData?.length
      });
      
      // Show user-friendly error notification
      notificationService.error({
        title: i18nService.tSync('schema.notifications.exportError.title') || 'Export Error',
        message: i18nService.tSync('schema.notifications.exportError.message') || 'Failed to export relationships report as PDF. Please try again.',
      });
    }
  }, [relationshipsSObjectData, relationshipsReportData]);

  return (
    <div className="schema-tab-fullscreen schema-tab-container">

      {/* Graph Canvas */}
      <div 
        ref={containerRef}
        className={`schema-graph-container ${isNodeDragging ? 'dragging-node' : ''}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={handleContextMenu}
        style={{ cursor: isNodeDragging ? 'grabbing' : isDragging ? 'grabbing' : 'grab' }}
      >
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          className="schema-graph-canvas"
        />
        
        {/* Floating Toolbar */}
        <div className="schema-floating-toolbar">
          <Group gap="xs" align="center">
            {/* Zoom Controls */}
            <Tooltip label={tSync('schema.tab.zoomIn', 'Zoom In')}>
              <ActionIcon onClick={() => handleZoom('in')} variant="filled" size="sm" className="toolbar-btn">
                <IconZoomIn size={14} />
              </ActionIcon>
            </Tooltip>
            
            <Tooltip label={tSync('schema.tab.zoomOut', 'Zoom Out')}>
              <ActionIcon onClick={() => handleZoom('out')} variant="filled" size="sm" className="toolbar-btn">
                <IconZoomOut size={14} />
              </ActionIcon>
            </Tooltip>
            
            <Tooltip label={tSync('schema.tab.resetView', 'Reset View')}>
              <ActionIcon onClick={resetView} variant="filled" size="sm" className="toolbar-btn">
                <IconArrowsMaximize size={14} />
              </ActionIcon>
            </Tooltip>
            
            <Tooltip label={tSync('schema.tab.fitToCanvas', 'Fit to Canvas')}>
              <ActionIcon onClick={fitToCanvas} variant="filled" size="sm" className="toolbar-btn">
                <IconArrowsMinimize size={14} />
              </ActionIcon>
            </Tooltip>
            
            {/* Divider */}
            <Divider orientation="vertical" size="xs" />
            
            {/* Export Controls - Only show when there are nodes */}
            {graphState.nodes.length > 0 && (
              <>
                <Tooltip label={tSync('schema.export.image', 'Export as Image')}>
                  <ActionIcon onClick={exportAsImage} variant="filled" size="sm" className="toolbar-btn" data-export="image">
                    <IconDownload size={14} />
                  </ActionIcon>
                </Tooltip>
                
                <Tooltip label={isExporting ? tSync('schema.export.exporting', 'Exporting...') : tSync('schema.export.pdf', 'Export as PDF')}>
                  <ActionIcon 
                    onClick={exportAsPDF} 
                    variant="filled" 
                    size="sm" 
                    className="toolbar-btn"
                    data-export="pdf"
                    loading={isExporting}
                    disabled={isExporting}
                  >
                    <IconFileExport size={14} />
                  </ActionIcon>
                </Tooltip>
                
                <Tooltip label={tSync('schema.graphToQuery', 'Convert Graph to Query')}>
                  <ActionIcon 
                    onClick={convertGraphToQuery} 
                    variant="filled" 
                    color="blue"
                    size="sm"
                    className="toolbar-btn"
                  >
                    <IconCode size={14} />
                  </ActionIcon>
                </Tooltip>
                
                {/* Divider */}
                <Divider orientation="vertical" size="xs" />
              </>
            )}
            
            {/* Clear Graph */}
            <Tooltip label={tSync('schema.tab.clearGraph', 'Clear Graph')}>
              <ActionIcon onClick={clearGraph} variant="filled" color="red" size="sm" className="toolbar-btn">
                <IconTrash size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </div>
        
        {/* Subtitle as canvas overlay */}
        <div className="schema-canvas-subtitle">
          <Text size="xs" c="dimmed" ta="right" lh={1.4}>
            {tSync('schema.graph.subtitle', 'Drag SObjects from the tree to build interactive relationship graphs, generate detailed schema and relationship reports, export diagrams as PDF/Image, convert graphs to SOQL queries, and analyze complex SObject structures with zoom, pan, and filtering capabilities')}
          </Text>
        </div>
        
        {/* Loading overlay when adding a node */}
        {addingNode && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
              backdropFilter: 'blur(1px)'
            }}
          >
            <Card 
              shadow="lg" 
              radius="md" 
              withBorder
              p="lg"
              style={{
                backgroundColor: 'white',
                minWidth: '200px'
              }}
            >
              <Group gap="md" justify="center">
                <Loader size="sm" />
                <div>
                  <Text size="sm" fw={500}>
                    {tSync('schema.tab.addingSObject', 'Adding SObject')}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {addingNode}
                  </Text>
                </div>
              </Group>
            </Card>
          </div>
        )}
        
        {graphState.nodes.length === 0 && !addingNode && (
          <div 
            className="schema-graph-empty"
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              zIndex: 1
            }}
          >
            <IconDatabase size={48} color="dimmed" />
            <Text size="lg" c="dimmed" ta="center" mt="md">
              {tSync('schema.tab.noSObjectsInGraph', 'No SObjects in Schema Graph')}
            </Text>
            <Text size="sm" c="dimmed" ta="center" mt="xs">
              {tSync('schema.tab.noSObjectsInGraphSubtitle', 'Drag SObjects from the tree to start building your relationship graph')}
            </Text>
            <Text size="xs" c="red" ta="center" mt="md" style={{ fontStyle: 'italic' }}>
              {tSync('schema.connectionNote', 'Note: Make sure you have an active Salesforce connection to load SObject details')}
            </Text>
          </div>
        )}

        {isLoading && (
          <div className="schema-graph-loading">
            <div className="loading-spinner"></div>
            <Text size="sm" c="dimmed">{tSync('schema.loadingSObject', 'Loading SObject...')}</Text>
          </div>
        )}



        {/* Context Menu */}
        {contextMenu.visible && (
          <>
            
          <div 
            className="schema-context-menu"
            style={{
              position: 'fixed',
              top: contextMenu.y,
              left: contextMenu.x,
              zIndex: 99999,
              border: '2px solid #e2e8f0',
              backgroundColor: 'white',
              padding: '8px',
              borderRadius: '8px',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
              minWidth: '200px',
              userSelect: 'none'
            }}
          >

            <button
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                logger.debug('Schema report menu item clicked', 'SchemaTab');
                handleContextMenuAction('schema-report');
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
                e.preventDefault();
                handleContextMenuAction('schema-report');
              }}
              style={{ 
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                cursor: 'pointer',
                padding: '8px 12px',
                border: 'none',
                margin: '2px 0',
                borderRadius: '4px',
                backgroundColor: 'transparent',
                fontSize: '14px',
                color: '#374151',
                transition: 'background-color 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f3f4f6';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <IconInfoCircle size={16} style={{ marginRight: '8px', color: '#6b7280' }} />
              <span>{tSync('schema.tab.showSchemaReport', 'Show Schema Report')}</span>
            </button>
            
            <button
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                logger.debug('Relationships report menu item clicked', 'SchemaTab');
                handleContextMenuAction('relationships-report');
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
                e.preventDefault();
                handleContextMenuAction('relationships-report');
              }}
              style={{ 
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                cursor: 'pointer',
                padding: '8px 12px',
                border: 'none',
                margin: '2px 0',
                borderRadius: '4px',
                backgroundColor: 'transparent',
                fontSize: '14px',
                color: '#374151',
                transition: 'background-color 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f3f4f6';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <IconGitBranch size={16} style={{ marginRight: '8px', color: '#6b7280' }} />
              <span>{tSync('schema.tab.showRelationshipsReport', 'Show Relationships Report')}</span>
            </button>
            
            {/* Select Master Parent Option - only show for child nodes with multiple parents */}
            {(() => {
              const currentNode = graphState.nodes.find(n => n.id === contextMenu.nodeId);
              const parentLinks = currentNode ? graphState.links.filter(link => link.target === currentNode.id) : [];
              const hasMultipleParents = parentLinks.length > 1;
              
              if (hasMultipleParents) {
                return (
                  <div
                    style={{ 
                      position: 'relative',
                      width: '100%'
                    }}
                    onMouseEnter={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      
                      // Only show select master parent submenu if child objects submenu is not visible
                      if (!isChildObjectsSubmenuVisible) {
                        const childNode = graphState.nodes.find(n => n.id === contextMenu.nodeId);
                        if (childNode) {
                          showSelectMasterParentSubmenu(childNode);
                        }
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      // Hide the submenu when mouse leaves the container
                      setIsSelectMasterParentSubmenuVisible(false);
                      setSelectMasterParentSubmenuData(null);
                    }}
                  >
                    <button
                      style={{ 
                        display: 'flex',
                        alignItems: 'center',
                        width: '100%',
                        cursor: 'pointer',
                        padding: '8px 12px',
                        border: 'none',
                        margin: '2px 0',
                        borderRadius: '4px',
                        backgroundColor: 'transparent',
                        fontSize: '14px',
                        color: '#7c3aed',
                        transition: 'background-color 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#f3f0ff';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <IconGitBranch size={16} style={{ marginRight: '8px', color: '#7c3aed' }} />
                      <span>{tSync('schema.selectMasterParent', 'Select Master Parent')}</span>
                      <IconChevronRight size={14} style={{ marginLeft: 'auto', color: '#7c3aed' }} />
                    </button>
                    
                    {/* Select Master Parent Submenu */}
                    {isSelectMasterParentSubmenuVisible && selectMasterParentSubmenuData && (
                      <div
                        className="schema-context-submenu"
                        style={{
                          position: 'absolute',
                          left: '100%',
                          top: '0',
                          minWidth: '280px',
                          backgroundColor: 'white',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
                          zIndex: 1001,
                          padding: '8px',
                          maxHeight: '400px',
                          overflowY: 'auto'
                        }}
                        onMouseEnter={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                        }}
                        onMouseLeave={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          // Hide the submenu when mouse leaves the submenu
                          setIsSelectMasterParentSubmenuVisible(false);
                          setSelectMasterParentSubmenuData(null);
                        }}
                      >
                        <div style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0', marginBottom: '8px' }}>
                          <Text size="xs" fw={600} c="dark.8">
                            {tSync('schema.selectMasterParent', 'Select Master Parent')}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {tSync('schema.chooseMasterParentFor', 'Choose master parent for {nodeName}', { nodeName: selectMasterParentSubmenuData.childNode.name })}
                          </Text>
                        </div>
                        
                        {selectMasterParentSubmenuData.availableParents.map((parent) => (
                          <button
                            key={parent.nodeId}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              handleMasterParentSelection(parent.nodeId);
                            }}
                            onTouchStart={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              handleMasterParentSelection(parent.nodeId);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              width: '100%',
                              cursor: 'pointer',
                              padding: '8px 12px',
                              border: parent.isCurrentMaster ? '1px solid #0ea5e9' : '1px solid transparent',
                              margin: '2px 0',
                              borderRadius: '4px',
                              backgroundColor: parent.isCurrentMaster ? '#f0f9ff' : 'transparent',
                              fontSize: '14px',
                              color: parent.isCurrentMaster ? '#0369a1' : '#374151',
                              transition: 'background-color 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                              if (!parent.isCurrentMaster) {
                                e.currentTarget.style.backgroundColor = '#f3f4f6';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!parent.isCurrentMaster) {
                                e.currentTarget.style.backgroundColor = 'transparent';
                              }
                            }}
                          >
                            <IconGitBranch size={16} style={{ marginRight: '8px', color: parent.isCurrentMaster ? '#0369a1' : '#9ca3af' }} />
                            <span>{parent.nodeName}</span>
                            {parent.isCurrentMaster && (
                              <Badge size="xs" color="blue" variant="light" style={{ marginLeft: 'auto' }}>
                                Current
                              </Badge>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }
              return null;
            })()}
            
            <div
              style={{ 
                position: 'relative',
                width: '100%'
              }}
              onMouseEnter={async (e) => {
                e.stopPropagation();
                e.preventDefault();
                const parentNode = graphState.nodes.find(n => n.id === contextMenu.nodeId);
                if (parentNode) {
                  await showChildObjectsSubmenu(parentNode);
                }
              }}
              onMouseLeave={(e) => {
                e.stopPropagation();
                e.preventDefault();
                // Hide the submenu when mouse leaves the container
                setIsChildObjectsSubmenuVisible(false);
                setChildObjectsSubmenuData(null);
              }}
            >
              <button
                style={{ 
                  display: 'flex',
                  alignItems: 'center',
                  width: '100%',
                  cursor: 'pointer',
                  padding: '8px 12px',
                  border: 'none',
                  margin: '2px 0',
                  borderRadius: '4px',
                  backgroundColor: 'transparent',
                  fontSize: '14px',
                  color: '#059669',
                  transition: 'background-color 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#ecfdf5';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <IconPlus size={16} style={{ marginRight: '8px', color: '#059669' }} />
                <span>{tSync('schema.addChildObjects', 'Add Child Objects')}</span>
                <IconChevronRight size={14} style={{ marginLeft: 'auto', color: '#059669' }} />
              </button>
              
              {/* Child Objects Submenu */}
              {isChildObjectsSubmenuVisible && childObjectsSubmenuData && (
                <div
                  className="schema-context-submenu"
                  style={{
                    position: 'absolute',
                    left: '100%',
                    top: '0',
                    minWidth: '280px',
                    backgroundColor: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
                    zIndex: 1001,
                    padding: '8px',
                    maxHeight: '400px',
                    overflowY: 'auto'
                  }}
                  onMouseEnter={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  onMouseLeave={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    // Hide the submenu when mouse leaves the submenu
                    setIsChildObjectsSubmenuVisible(false);
                    setChildObjectsSubmenuData(null);
                  }}
                >
                  <div style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0', marginBottom: '8px' }}>
                    <Text size="xs" fw={600} c="dark.8">
                      {tSync('schema.childObjects', 'Child Objects')}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {loadingChildObjects.size > 0 ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{ 
                            width: '10px', 
                            height: '10px', 
                            border: '1px solid #e5e7eb', 
                            borderTop: '1px solid #059669', 
                            borderRadius: '50%', 
                            animation: 'spin 1s linear infinite' 
                          }} />
                          {tSync('schema.loadingRelationships', 'Loading relationships...')}
                        </span>
                      ) : (
                        tSync('schema.availableCount', '{count} available', { count: childObjectsSubmenuData.childRelationships.length })
                      )}
                    </Text>
                  </div>
                  
                  {childObjectsSubmenuData.childRelationships.map((relationship) => {
                    const isAlreadyOnCanvas = !!graphState.nodes.find(n => n.id === relationship.childSObject);
                    const isLoading = addingChildObject === relationship.childSObject;
                    const isDisabled = isAlreadyOnCanvas || isLoading;
                    
                    return (
                      <button
                        key={relationship.childSObject}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          if (!isDisabled) {
                            addSingleChildObjectToCanvas(relationship.childSObject);
                          }
                        }}
                        onTouchStart={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          if (!isDisabled) {
                            addSingleChildObjectToCanvas(relationship.childSObject);
                          }
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          width: '100%',
                          cursor: isDisabled ? 'not-allowed' : 'pointer',
                          padding: '8px 12px',
                          border: 'none',
                          margin: '2px 0',
                          borderRadius: '4px',
                          backgroundColor: 'transparent',
                          fontSize: '13px',
                          color: isDisabled ? '#9ca3af' : '#374151',
                          opacity: isDisabled ? 0.6 : 1,
                          transition: 'background-color 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          if (!isDisabled) {
                            e.currentTarget.style.backgroundColor = '#f3f4f6';
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <div style={{ flex: 1, textAlign: 'left' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                            {isLoading && (
                              <div style={{ 
                                width: '12px', 
                                height: '12px', 
                                border: '2px solid #e5e7eb', 
                                borderTop: '2px solid #059669', 
                                borderRadius: '50%', 
                                animation: 'spin 1s linear infinite' 
                              }} />
                            )}
                            <Text size="xs" fw={600} c={isDisabled ? "dimmed" : "dark.8"}>
                              {relationship.childSObject}
                            </Text>
                            {relationship.cascadeDelete && (
                              <Badge size="xs" color="red" variant="light">
                                MD
                              </Badge>
                            )}
                            {!relationship.cascadeDelete && (
                              <Badge size="xs" color="blue" variant="light">
                                LK
                              </Badge>
                            )}
                            {isAlreadyOnCanvas && (
                              <Badge size="xs" color="gray" variant="light">
                                ✓
                              </Badge>
                            )}
                            {isLoading && (
                              <Badge size="xs" color="green" variant="light">
                                Adding...
                              </Badge>
                            )}
                          </div>
                          <Text size="xs" c="dimmed" style={{ lineHeight: '1.2' }}>
                            {relationship.field}
                          </Text>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            
            <button
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                logger.debug('Select specific fields menu item clicked', 'SchemaTab', { 
                  nodeId: contextMenu.nodeId,
                  action: 'select-fields'
                });
                handleContextMenuAction('select-fields');
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
                e.preventDefault();
                handleContextMenuAction('select-fields');
              }}
              style={{ 
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                cursor: 'pointer',
                padding: '8px 12px',
                border: 'none',
                margin: '2px 0',
                borderRadius: '4px',
                backgroundColor: 'transparent',
                fontSize: '14px',
                color: '#3b82f6',
                transition: 'background-color 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#eff6ff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <IconListCheck size={16} style={{ marginRight: '8px', color: '#3b82f6' }} />
              <span>{tSync('schema.contextMenu.selectSpecificFields', 'Select Specific Fields')}</span>
            </button>
            
            <button
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                logger.debug('Delete menu item clicked', 'SchemaTab', { 
                  nodeId: contextMenu.nodeId,
                  action: 'delete'
                });
                handleContextMenuAction('delete');
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
                e.preventDefault();
                handleContextMenuAction('delete');
              }}
              style={{ 
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                cursor: 'pointer',
                padding: '8px 12px',
                border: 'none',
                margin: '2px 0',
                borderRadius: '4px',
                backgroundColor: 'transparent',
                fontSize: '14px',
                color: '#dc2626',
                transition: 'background-color 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#fef2f2';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <IconTrash size={16} style={{ marginRight: '8px', color: '#dc2626' }} />
              <span>{tSync('schema.deleteNode', 'Delete Node')}</span>
            </button>
          </div>
          </>
        )}
      </div>

      {/* Schema Report Section */}
      {showSchemaReport && schemaReportData && (
        <>
          {/* Backdrop */}
          <div 
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: '40px', // Leave space for status bar
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              zIndex: 999,
              backdropFilter: 'blur(2px)'
            }}
            onClick={() => {
              // Only close the report, preserve metadata states
              setShowSchemaReport(false);
              setSchemaReportData(null);
              setSchemaReportFilter('');
              // Don't clear completeNodeMetadata or showAllFields to prevent canvas wipe
            }}
          />
          <Card 
            className="schema-report-modern" 
            shadow="lg" 
            radius="md" 
            withBorder
            style={{
              position: 'fixed',
              bottom: '60px', // Position above status bar (40px + 20px margin)
              left: '20px',
              right: '20px',
              zIndex: 1000,
              maxHeight: isSchemaReportExpanded ? 'calc(80vh - 40px)' : 'calc(60vh - 40px)', // Account for status bar
              overflow: 'hidden'
            }}
          >
          {/* Header */}
          <Card.Section withBorder inheritPadding py="md">
            <Flex justify="space-between" align="center">
              <Group gap="md">
                <IconTable size={24} color="#3b82f6" />
                <div>
                  <Title order={3} size="h4" fw={700} c="dark.8">
                    Schema Report: {schemaReportData.label} ({schemaReportData.name})
                  </Title>
                  <Text 
                    size="sm" 
                    c="dimmed" 
                    mt={4}
                    title={showAllFields 
                      ? `Total number of fields in this object: ${completeNodeMetadata?.fields?.length || 0}` 
                      : `Number of fields selected in the query: ${schemaReportData.fields.length}`
                    }
                  >
                    {showAllFields 
                      ? `${filteredFields.length} of ${completeNodeMetadata?.fields?.length || 0} fields (all metadata)`
                      : `${filteredFields.length} of ${schemaReportData.fields.length} fields (selected)`
                    }
                  </Text>
                </div>
                <Badge 
                  size="lg" 
                  variant="gradient" 
                  gradient={{ from: schemaReportData.isCustom ? 'yellow' : 'blue', to: schemaReportData.isCustom ? 'orange' : 'cyan' }}
                  title={schemaReportData.isCustom ? tSync('schema.tab.customObjectTooltip', 'This is a custom Salesforce object') : tSync('schema.tab.standardObjectTooltip', 'This is a standard Salesforce object')}
                >
                  {schemaReportData.isCustom ? tSync('schema.tab.custom', 'Custom') : tSync('schema.tab.standard', 'Standard')}
                </Badge>
              </Group>
              <Group gap="xs">
                <ActionIcon 
                  onClick={exportSchemaReportAsPDF}
                  variant="light"
                  size="lg"
                  color="green"
                  radius="md"
                  title={tSync('schema.report.export.pdf', 'Export as PDF')}
                >
                  <IconFileExport size={20} />
                </ActionIcon>
                <ActionIcon 
                  onClick={() => setIsSchemaReportExpanded(!isSchemaReportExpanded)}
                  variant="light"
                  size="lg"
                  color="blue"
                  radius="md"
                  title={isSchemaReportExpanded ? tSync('schema.tab.collapseReport', 'Collapse Report') : tSync('schema.tab.expandReport', 'Expand Report')}
                >
                  {isSchemaReportExpanded ? <IconChevronUp size={20} /> : <IconChevronDown size={20} />}
                </ActionIcon>
                <ActionIcon 
                  onClick={() => {
                    // Only close the report, preserve metadata states
                    setShowSchemaReport(false);
                    setSchemaReportData(null);
                    setSchemaReportFilter('');
                    // Don't clear completeNodeMetadata or showAllFields to prevent canvas wipe
                  }}
                  variant="light"
                  size="lg"
                  color="gray"
                  radius="md"
                  title={tSync('schema.report.close', 'Close Report')}
                >
                  <IconX size={20} />
                </ActionIcon>
              </Group>
            </Flex>
          </Card.Section>

          {/* Filter Section */}
          <Card.Section withBorder inheritPadding py="md">
            <Grid>
              <Grid.Col span={4}>
                <TextInput
                  placeholder={tSync('schema.tab.filterByName', '🔍 Filter by name, label, type, or properties...')}
                  value={schemaReportFilter}
                  onChange={(e) => setSchemaReportFilter(e.target.value)}
                  leftSection={<IconInfoCircle size={16} />}
                  size="sm"
                  radius="md"
                  styles={{
                    input: {
                      border: '2px solid #e2e8f0',
                      height: '32px',
                      minHeight: '32px',
                      '&:focus': {
                        borderColor: '#3b82f6',
                        boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.1)'
                      }
                    }
                  }}
                />
              </Grid.Col>
              <Grid.Col span={4}>
                <Flex gap="xs" wrap="wrap">
                  <Chip 
                    checked={schemaReportFilter === ''} 
                    onClick={() => setSchemaReportFilter('')}
                    variant="light"
                    color="blue"
                  >
                    All Fields
                  </Chip>
                  <Chip 
                    checked={schemaReportFilter.toLowerCase().includes('picklist')} 
                    onClick={() => setSchemaReportFilter('picklist')}
                    variant="light"
                    color="cyan"
                  >
                    Picklists
                  </Chip>
                  <Chip 
                    checked={schemaReportFilter.toLowerCase().includes('reference')} 
                    onClick={() => setSchemaReportFilter('reference')}
                    variant="light"
                    color="violet"
                  >
                    {tSync('schema.references', 'References')}
                  </Chip>
                </Flex>
              </Grid.Col>
              <Grid.Col span={4}>
                <Flex gap="xs" align="center" justify="flex-end">
                  <Text size="sm" c="dimmed" mr="xs">
                    View:
                  </Text>
                  <Chip 
                    checked={!showAllFields} 
                    onClick={() => {
                      logger.debug('Toggling to Selected fields', 'SchemaTab', {
                        currentShowAllFields: showAllFields,
                        selectedFieldsCount: schemaReportData?.fields?.length || 0
                      });
                      setShowAllFields(false);
                    }}
                    variant="light"
                    color="blue"
                    size="sm"
                  >
                    Selected
                  </Chip>
                  <Chip 
                    checked={showAllFields} 
                    onClick={() => {
                      logger.debug('Toggling to All Metadata fields', 'SchemaTab', {
                        currentShowAllFields: showAllFields,
                        allMetadataFieldsCount: completeNodeMetadata?.fields?.length || 0
                      });
                      setShowAllFields(true);
                    }}
                    variant="light"
                    color="orange"
                    size="sm"
                  >
                    All Metadata
                  </Chip>
                </Flex>
              </Grid.Col>
            </Grid>
            
            {/* Filter Summary */}
            {schemaReportFilter && (
              <Flex justify="space-between" align="center" mt="md">
                <Text size="sm" c="dimmed">
                  {showAllFields 
                    ? tSync('schema.tab.fieldsCountAll', '{filtered} of {total} fields (all metadata)', { 
                        filtered: filteredFields.length, 
                        total: completeNodeMetadata?.fields?.length || 0 
                      })
                    : tSync('schema.tab.fieldsCountSelected', '{filtered} of {total} fields (selected)', { 
                        filtered: filteredFields.length, 
                        total: schemaReportData?.fields?.length || 0 
                      })
                  }
                  {schemaReportFilter && ` ${tSync('schema.tab.matchingFilter', 'matching "{filter}"', { filter: schemaReportFilter })}`}
                </Text>
                <Button 
                  size="xs" 
                  variant="light" 
                  color="blue"
                  onClick={() => setSchemaReportFilter('')}
                  styles={{
                    root: {
                      border: '1px solid #dbeafe',
                      backgroundColor: '#eff6ff',
                      color: '#2563eb',
                      fontWeight: 600,
                      transition: 'all 0.2s ease',
                      padding: '6px 12px',
                      minHeight: '28px',
                      lineHeight: '1.2',
                      '&:hover': {
                        backgroundColor: '#dbeafe',
                        borderColor: '#3b82f6',
                        transform: 'translateY(-1px)',
                        boxShadow: '0 2px 4px rgba(59, 130, 246, 0.2)'
                      }
                    }
                  }}
                >
                  {tSync('schema.tab.clearFilter', 'Clear Filter')}
                </Button>
              </Flex>
            )}
          </Card.Section>

          {/* DataTable */}
          <Card.Section inheritPadding py="md">
            <DataTable
              height={isSchemaReportExpanded ? 600 : 400}
              withColumnBorders
              withTableBorder
              striped
              highlightOnHover
              records={filteredFields.map((field, index) => ({ ...field, id: field.name || `field-${index}` }))}
              columns={schemaColumns}
              noRecordsText={tSync('schema.tab.noFieldsFound', 'No fields found matching your filter')}
              loadingText={tSync('schema.tab.loadingFields', 'Loading fields...')}
              sortStatus={schemaSortStatus}
              onSortStatusChange={setSchemaSortStatus}
              page={1}
              onPageChange={() => {}}
              totalRecords={filteredFields.length}
              recordsPerPage={filteredFields.length}
            />
          </Card.Section>
        </Card>
        </>
      )}

      {/* Relationships Report Section */}
      {showRelationshipsReport && (
        <>
          {/* Backdrop */}
          <div 
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: '40px', // Leave space for status bar
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              zIndex: 999,
              backdropFilter: 'blur(2px)'
            }}
            onClick={() => {
              setShowRelationshipsReport(false);
              setRelationshipsSObjectData(null);
            }}
          />
          <Card 
            className="schema-report-modern" 
            shadow="lg" 
            radius="md" 
            withBorder
            style={{
              position: 'fixed',
              bottom: '60px', // Position above status bar (40px + 20px margin)
              left: '20px',
              right: '20px',
              zIndex: 1000,
              maxHeight: 'calc(70vh - 40px)', // Account for status bar
              overflow: 'hidden'
            }}
          >
          {/* Header */}
          <Card.Section withBorder inheritPadding py="md">
            <Flex justify="space-between" align="center">
              <Group gap="md">
                <IconGitBranch size={24} color="#8b5cf6" />
                <div>
                  <Title order={3} size="h4" fw={700} c="dark.8">
                    Relationships Report: {relationshipsSObjectData?.label} ({relationshipsSObjectData?.name})
                  </Title>
                  <Text 
                    size="sm" 
                    c="dimmed" 
                    mt={4}
                    title={`Total number of relationships found: ${relationshipsReportData.length}`}
                  >
                    {`${relationshipsReportData.length} relationships found`}
                  </Text>
                </div>
              </Group>
              <Group gap="xs">
                <ActionIcon 
                  onClick={exportRelationshipsReportAsPDF}
                  variant="light"
                  size="lg"
                  color="green"
                  radius="md"
                  title={tSync('schema.report.export.pdf', 'Export as PDF')}
                >
                  <IconFileExport size={20} />
                </ActionIcon>
                <ActionIcon 
                  onClick={() => {
                    setShowRelationshipsReport(false);
                    setRelationshipsSObjectData(null);
                  }}
                  variant="light"
                  size="lg"
                  color="gray"
                  radius="md"
                  title={tSync('schema.report.close', 'Close Report')}
                >
                  <IconX size={20} />
                </ActionIcon>
              </Group>
            </Flex>
          </Card.Section>

          {/* Filter Section */}
          <Card.Section withBorder inheritPadding py="md">
            <Grid>
              <Grid.Col span={10}>
                <TextInput
                  placeholder={tSync('schema.tab.filterRelationships', '🔍 Filter relationships by object, field, or relationship name...')}
                  value={relationshipsFilter}
                  onChange={(e) => setRelationshipsFilter(e.target.value)}
                  leftSection={<IconSearch size={16} />}
                  size="md"
                  radius="md"
                  styles={{
                    input: {
                      border: '2px solid #e2e8f0',
                      '&:focus': {
                        borderColor: '#3b82f6',
                        boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.1)'
                      }
                    }
                  }}
                />
              </Grid.Col>
              <Grid.Col span={2}>
                <Flex gap="xs" wrap="wrap">
                  <Chip 
                    checked={relationshipsFilter === ''} 
                    onClick={() => setRelationshipsFilter('')}
                    variant="light"
                    color="blue"
                  >
                    All Relationships
                  </Chip>
                </Flex>
              </Grid.Col>
            </Grid>
            
            {/* Filter Summary */}
            {relationshipsFilter && (
              <Flex justify="space-between" align="center" mt="md">
                <Text size="sm" c="dimmed">
                  Showing {relationshipsReportData.filter(rel => 
                    rel.objectField.toLowerCase().includes(relationshipsFilter.toLowerCase()) ||
                    rel.relationshipName.toLowerCase().includes(relationshipsFilter.toLowerCase()) ||
                    rel.childSObject.toLowerCase().includes(relationshipsFilter.toLowerCase())
                  ).length} of {relationshipsReportData.length} relationships
                  {relationshipsFilter && ` matching "${relationshipsFilter}"`}
                </Text>
                <Button 
                  size="xs" 
                  variant="light" 
                  color="blue"
                  onClick={() => setRelationshipsFilter('')}
                  styles={{
                    root: {
                      border: '1px solid #dbeafe',
                      backgroundColor: '#eff6ff',
                      color: '#2563eb',
                      fontWeight: 600,
                      transition: 'all 0.2s ease',
                      padding: '6px 12px',
                      minHeight: '28px',
                      lineHeight: '1.2',
                      '&:hover': {
                        backgroundColor: '#dbeafe',
                        borderColor: '#3b82f6',
                        transform: 'translateY(-1px)',
                        boxShadow: '0 2px 4px rgba(59, 130, 246, 0.2)'
                      }
                    }
                  }}
                >
                  {tSync('schema.tab.clearFilter', 'Clear Filter')}
                </Button>
              </Flex>
            )}
          </Card.Section>

          {/* DataTable */}
          <Card.Section inheritPadding py="md">
            <DataTable
              height={400}
              withColumnBorders
              withTableBorder
              striped
              highlightOnHover
              records={filteredRelationshipsData}
              noRecordsText={tSync('schema.tab.noRelationshipsFound', 'No relationships found')}
              sortStatus={sortStatus}
              onSortStatusChange={setSortStatus}
              page={1}
              onPageChange={() => {}}
              totalRecords={filteredRelationshipsData.length}
              recordsPerPage={filteredRelationshipsData.length}
              columns={[
                {
                  accessor: 'objectField',
                  title: tSync('schema.tab.objectField', 'Object / Field'),
                  width: 300,
                  ellipsis: true,
                  resizable: true,
                  sortable: true,
                  render: ({ objectField }) => (
                    <Text fw={600} size="sm" ff="monospace" c="dark.7">
                      {objectField}
                    </Text>
                  )
                },
                {
                  accessor: 'relationshipName',
                  title: tSync('schema.tab.relationshipName', 'Relationship Name'),
                  width: 250,
                  ellipsis: true,
                  resizable: true,
                  sortable: true,
                  render: ({ relationshipName }) => (
                    <Text size="sm" c="dark.6">
                      {relationshipName || '-'}
                    </Text>
                  )
                },
                {
                  accessor: 'cascadeDelete',
                  title: tSync('schema.tab.cascadeDelete', 'Cascade Delete'),
                  width: 120,
                  ellipsis: true,
                  resizable: true,
                  sortable: true,
                  render: ({ cascadeDelete }) => (
                    cascadeDelete ? (
                      <Badge size="sm" color="red" variant="light">
                        Yes
                      </Badge>
                    ) : (
                      <Text size="sm" c="dimmed">-</Text>
                    )
                  )
                }
              ]}
              loadingText={tSync('schema.loadingRelationships', 'Loading relationships...')}
            />
          </Card.Section>
        </Card>
        </>
      )}



      {/* Node Details Modal */}
      <Modal
        opened={showNodeModal}
        onClose={() => setShowNodeModal(false)}
        title={selectedNodeDetails?.label}
        size="lg"
      >
        {selectedNodeDetails && (
          <Stack gap="md">
            <Group>
              <Badge color={selectedNodeDetails.isCustom ? 'yellow' : 'blue'}>
                {selectedNodeDetails.isCustom ? tSync('schema.tab.custom', 'Custom') : tSync('schema.tab.standard', 'Standard')}
              </Badge>
              <Badge color="green">{selectedNodeDetails.fields.length} fields</Badge>
            </Group>
            
            <Divider />
            
            <ScrollArea h={400}>
              <Stack gap="xs">
                {selectedNodeDetails.fields.map(field => (
                  <Paper key={field.name} p="xs" withBorder>
                    <Group justify="space-between">
                      <div>
                        <Text size="sm" fw={500}>{field.name}</Text>
                        <Text size="xs" c="dimmed">{field.label}</Text>
                      </div>
                      <Badge size="xs" color={field.type === 'reference' ? 'purple' : 'gray'}>
                        {field.type}
                      </Badge>
                    </Group>
                  </Paper>
                ))}
              </Stack>
            </ScrollArea>
          </Stack>
        )}
      </Modal>

      {/* Picklist Values Modal */}
      {showPicklistModal && currentPicklistData && (
        <>
          {/* Backdrop */}
          <div 
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              zIndex: 999,
              backdropFilter: 'blur(2px)'
            }}
            onClick={() => {
              setShowPicklistModal(false);
              setPicklistFilter('');
            }}
          />
          <Card 
            className="picklist-modal-card" 
            shadow="lg" 
            radius="md" 
            withBorder
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 1000,
              width: '80vw',
              maxWidth: '800px',
              maxHeight: '80vh',
              overflow: 'hidden'
            }}
          >
            {/* Header */}
            <Card.Section withBorder inheritPadding py="md">
              <Flex justify="space-between" align="center">
                <Group gap="md">
                  <IconInfoCircle size={24} color="#3b82f6" />
                  <div>
                    <Title order={3} size="h4" fw={700} c="dark.8">
                      Picklist Values: {currentPicklistData.fieldName}
                    </Title>
                    <Text size="sm" c="dimmed" mt={4}>
                      {(() => {
                        const filteredCount = currentPicklistData.values.filter((value) => {
                          if (!picklistFilter) return true;
                          const filterLower = picklistFilter.toLowerCase();
                          const displayValue = typeof value === 'string' ? value : (value as any).label || (value as any).value || 'Unknown';
                          const valueText = typeof value === 'object' && (value as any).value ? (value as any).value : '';
                          return displayValue.toLowerCase().includes(filterLower) || 
                                 valueText.toLowerCase().includes(filterLower);
                        }).length;
                        return picklistFilter 
                          ? `${filteredCount} of ${currentPicklistData.values.length} values`
                          : `${currentPicklistData.values.length} values`;
                      })()}
                    </Text>
                  </div>
                  <Badge size="lg" variant="gradient" gradient={{ from: 'cyan', to: 'blue' }}>
                    Picklist
                  </Badge>
                </Group>
                <Tooltip label={tSync('schema.modal.close', 'Close Modal')}>
                  <ActionIcon 
                    onClick={() => {
                      setShowPicklistModal(false);
                      setPicklistFilter('');
                    }}
                    variant="light"
                    size="lg"
                    color="gray"
                    radius="md"
                  >
                    <IconX size={20} />
                  </ActionIcon>
                </Tooltip>
              </Flex>
            </Card.Section>

            {/* Filter Section */}
            <Card.Section withBorder inheritPadding py="md">
              <TextInput
                placeholder="Filter picklist values..."
                value={picklistFilter}
                onChange={(e) => setPicklistFilter(e.currentTarget.value)}
                leftSection={<IconSearch size={16} />}
                rightSection={
                  picklistFilter && (
                    <ActionIcon
                      size="sm"
                      variant="transparent"
                      onClick={() => setPicklistFilter('')}
                    >
                      <IconX size={14} />
                    </ActionIcon>
                  )
                }
                size="sm"
              />
            </Card.Section>

            {/* Content */}
            <Card.Section inheritPadding py="md">
              <ScrollArea h={400}>
                {(() => {
                  const filteredValues = currentPicklistData.values.filter((value) => {
                    if (!picklistFilter) return true;
                    const filterLower = picklistFilter.toLowerCase();
                    const displayValue = typeof value === 'string' ? value : (value as any).label || (value as any).value || 'Unknown';
                    const valueText = typeof value === 'object' && (value as any).value ? (value as any).value : '';
                    return displayValue.toLowerCase().includes(filterLower) || 
                           valueText.toLowerCase().includes(filterLower);
                  });

                  if (filteredValues.length === 0 && picklistFilter) {
                    return (
                      <div style={{ textAlign: 'center', padding: '2rem' }}>
                        <Text size="lg" c="dimmed" mb="xs">
                          No values found
                        </Text>
                        <Text size="sm" c="dimmed">
                          Try adjusting your search term
                        </Text>
                      </div>
                    );
                  }

                  return (
                    <div className="picklist-modal-grid">
                      {filteredValues.map((value, index) => (
                        <div key={`${currentPicklistData.fieldName}-${index}`} className="picklist-modal-item">
                          <Text size="sm" fw={500}>
                            {typeof value === 'string' ? value : (value as any).label || (value as any).value || 'Unknown'}
                          </Text>
                          {typeof value === 'object' && (value as any).value && (
                            <Text size="xs" c="dimmed">
                              Value: {(value as any).value}
                            </Text>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </ScrollArea>
            </Card.Section>
          </Card>
        </>
      )}

      {/* Field Selection Modal */}
      {showFieldSelectionModal && modalMounted && fieldSelectionData && (
        <>
          {/* Backdrop */}
          <div 
            className={`field-selection-modal-backdrop ${modalVisible ? 'show' : ''}`}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 99998,
              backdropFilter: 'blur(4px)'
            }}
            onClick={closeFieldSelectionModal}
          />
          
          {/* Modal Card */}
          <Card
            className={`field-selection-modal ${modalVisible ? 'show' : ''}`}
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              width: '90vw',
              maxWidth: '800px',
              maxHeight: '80vh',
              zIndex: 99999,
              borderRadius: '12px'
            }}
          >
            <Card.Section withBorder p="md">
              <Group justify="space-between" align="center">
                <div>
                  <Title order={4} c="dark.7">
                    {tSync('schema.fieldSelection.title', 'Select Fields to Add')}
                  </Title>
                  <Text size="sm" c="dimmed">
                    {tSync('schema.fieldSelection.subtitle', { sobjectName: fieldSelectionData.node.name }) || 
                     `Select fields to add to ${fieldSelectionData.node.name}`}
                  </Text>
                </div>
                <Tooltip label={tSync('schema.modal.close', 'Close Modal')}>
                  <ActionIcon
                    variant="light"
                    color="gray"
                    onClick={closeFieldSelectionModal}
                  >
                    <IconX size={16} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Card.Section>

            <Card.Section p="md" style={{ maxHeight: '60vh', overflow: 'hidden' }}>
              <FieldSelectionContent 
                fieldSelectionData={fieldSelectionData}
                setFieldSelectionData={setFieldSelectionData}
                onAddFields={addSelectedFieldsToNode}
                onCancel={closeFieldSelectionModal}
              />
            </Card.Section>
          </Card>
        </>
      )}
    </div>
  );
};
