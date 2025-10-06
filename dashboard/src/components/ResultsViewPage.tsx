import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Paper, Title, Text, Button, Group, ActionIcon, Badge, Modal, TextInput, Textarea, Stack, ScrollArea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconDownload, IconEdit, IconEye, IconGripVertical, IconChevronDown, IconChevronRight, IconExternalLink, IconColumns } from '@tabler/icons-react';
import { DataTable, DataTableSortStatus, useDataTableColumns } from 'mantine-datatable';
import { useTranslation } from '../services/I18nService';
import { logger } from '../services/Logger';
import { getConnectionUuidFromSession } from '../services/ApiService';
import '../assets/css/components/ResultsViewPage.css';

// New query response structure from backend
interface QueryResponse {
  metadata: {
    total_size: number;
    done: boolean;
    nextRecordsUrl?: string;
  };
  records: QueryRecord[];
}

interface QueryRecord {
  type: string;
  fields: Record<string, any>;
  relationships: Record<string, QueryRecord[]>; // Dictionary structure: key=relationship_name, value=array_of_records
}

// Legacy interface for backward compatibility during transition
interface QueryResult {
  records: any[];
  total_size: number;
  done: boolean;
}

interface DetailRecord {
  parentId: string;
  parentField: string;
  records: any[];
  total_size: number;
  done: boolean;
  sObjectType: string;
}

interface ResultsViewPageProps {
  result: QueryResponse | null;
  onRecordUpdate?: (recordId: string, fieldName: string, newValue: any, record?: any) => Promise<void>;
  onQueryMore?: () => void;
  isLoading?: boolean;
}

// Helper function to validate query response format
const isQueryResponse = (result: any): result is QueryResponse => {
  return result && typeof result === 'object' && 'records' in result && 'metadata' in result;
};

// Simple ID getter - works with tree format only
const getRecordId = (record: any): string => {
  // Tree format: get ID from fields.Id
  if (record.fields && record.fields.Id) {
    return String(record.fields.Id);
  }
  return String(record.Id || record.id || '');
};

// Note: We now work directly with tree structure - no conversion needed!

export const ResultsViewPage: React.FC<ResultsViewPageProps> = ({
  result,
  onRecordUpdate,
  onQueryMore,
  isLoading = false
}) => {
  const { tSync } = useTranslation();
  
  
  const [editingRecord, setEditingRecord] = useState<{ id: string; field: string; value: any } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [inlineEditing, setInlineEditing] = useState<{ id: string; field: string; value: any } | null>(null);
  const [inlineEditValue, setInlineEditValue] = useState('');
  const [columnWidths, setColumnWidths] = useState<{ [key: string]: number }>({});
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeColumn, setResizeColumn] = useState<string | null>(null);
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  
  // DataTable specific state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedRecords, setSelectedRecords] = useState<any[]>([]);
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus>({ columnAccessor: 'Id', direction: 'asc' });
  const [records, setRecords] = useState<any[]>([]);
  const [paginatedRecords, setPaginatedRecords] = useState<any[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  
  // Pagination options
  const pageSizeOptions = [10, 25, 50, 100];

  useEffect(() => {
    setIsMounted(true);
  }, []);
  
  // New state for hierarchical data - supports up to 4 levels of nesting
  // Level 1: Master records
  // Level 2: Detail records from master
  // Level 3: Detail records from level 2 details
  // Level 4: Detail records from level 3 details
  const [expandedDetailFields, setExpandedDetailFields] = useState<Map<string, Set<string>>>(new Map());
  const [detailRecords, setDetailRecords] = useState<Map<string, DetailRecord>>(new Map());
  
  // Track nested detail expansions (up to 4 levels)
  const [nestedExpansions, setNestedExpansions] = useState<Map<string, Map<string, Set<string>>>>(new Map());
  
  // State for expanding rows functionality
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [expandedDetailTypes, setExpandedDetailTypes] = useState<Map<string, Set<string>>>(new Map());
  const [detailTypeColors, setDetailTypeColors] = useState<Map<string, { color: string; bg: string; border: string }>>(new Map());
  
  // Predefined color schemes for relationship badges
  const colorSchemes = [
    { color: 'blue', bg: '#e3f2fd', border: '#2196f3' },
    { color: 'green', bg: '#e8f5e8', border: '#4caf50' },
    { color: 'orange', bg: '#fff3e0', border: '#ff9800' },
    { color: 'purple', bg: '#f3e5f5', border: '#9c27b0' },
    { color: 'red', bg: '#ffebee', border: '#f44336' },
    { color: 'teal', bg: '#e0f2f1', border: '#009688' },
    { color: 'indigo', bg: '#e8eaf6', border: '#3f51b5' },
    { color: 'pink', bg: '#fce4ec', border: '#e91e63' },
    { color: 'cyan', bg: '#e0f7fa', border: '#00bcd4' },
    { color: 'amber', bg: '#fff8e1', border: '#ffc107' },
    { color: 'lime', bg: '#f1f8e9', border: '#8bc34a' },
    { color: 'deep-orange', bg: '#fbe9e7', border: '#ff5722' }
  ];
  
  // Function to get or assign a color for a relationship type
  const getRelationshipColor = useCallback((relationshipType: string): { color: string; bg: string; border: string } => {
    if (detailTypeColors.has(relationshipType)) {
      return detailTypeColors.get(relationshipType)!;
    }
    
    // Assign a new color based on the current number of assigned colors
    const colorIndex = detailTypeColors.size % colorSchemes.length;
    const colorScheme = colorSchemes[colorIndex];
    
    // Store the color for this relationship type asynchronously to avoid setState during render
    setTimeout(() => {
      setDetailTypeColors(prev => {
        const newMap = new Map(prev);
        newMap.set(relationshipType, colorScheme);
        return newMap;
      });
    }, 0);
    
    return colorScheme;
  }, [detailTypeColors, colorSchemes]);
  
  
  // State to force complete re-render when query is executed
  const [queryExecutionKey, setQueryExecutionKey] = useState<number>(0);
  
  // State for dynamic table sizing
  const [mainPanelWidth, setMainPanelWidth] = useState<number>(0);
  const [availableHeight, setAvailableHeight] = useState<number>(600);
  const mainPanelRef = useRef<HTMLDivElement>(null);

  const totalRecords = result ? result.metadata.total_size : 0;

  // ResizeObserver to track main panel width and height changes
  useEffect(() => {
    if (!mainPanelRef.current) {
      return;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setMainPanelWidth(width);
        // Use the actual container height minus some padding for UI elements
        const reservedHeight = 50; // Reserve space for loading indicator, padding, etc.
        const newHeight = Math.max(400, height - reservedHeight);
        setAvailableHeight(newHeight);
      }
    });

    resizeObserver.observe(mainPanelRef.current);

    // Fallback: Also listen to window resize and try to get container height
    const handleResize = () => {
      if (mainPanelRef.current) {
        const rect = mainPanelRef.current.getBoundingClientRect();
        const newHeight = Math.max(400, rect.height - 50);
        setAvailableHeight(newHeight);
      }
    };

    window.addEventListener('resize', handleResize);
    // Initial calculation
    setTimeout(handleResize, 100);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Helper function to calculate optimal table and column widths based on main panel width
  const getOptimalTableWidth = (): number => {
    // Use the full main panel width minus some padding
    const padding = 40; // 20px on each side
    return Math.max(mainPanelWidth - padding, 400); // Minimum 400px width
  };

  const getOptimalColumnWidth = (columnCount: number, columnName?: string): number => {
    if (columnCount === 0) return 200;
    
    // Set specific widths for common column types
    if (columnName) {
      const lowerName = columnName.toLowerCase();
      
      // ID columns - always wide enough to show full IDs
      if (lowerName === 'id' || lowerName.endsWith('id')) {
        return 180;
      }
      
      // Name columns - wider for readability
      if (lowerName === 'name' || lowerName.endsWith('name')) {
        return 200;
      }
      
      // Email columns - standard email width
      if (lowerName.includes('email')) {
        return 220;
      }
      
      // Date columns - standard date width
      if (lowerName.includes('date') || lowerName.includes('time')) {
        return 150;
      }
      
      // Status/Type columns - shorter
      if (lowerName.includes('status') || lowerName.includes('type')) {
        return 120;
      }
      
      // Phone columns
      if (lowerName.includes('phone')) {
        return 140;
      }
    }
    
    const tableWidth = getOptimalTableWidth();
    
    // Calculate width per column based on table width
    const widthPerColumn = tableWidth / columnCount;
    
    // Improved width calculation with better min/max values
    const minWidth = 120; // Increased from 100
    const maxWidth = 300; // Increased from 250
    
    // For many columns, ensure minimum usable width
    if (columnCount > 10) {
      return Math.max(minWidth, Math.min(200, widthPerColumn));
    } else if (columnCount > 5) {
      return Math.max(minWidth, Math.min(250, widthPerColumn));
    } else {
      return Math.max(minWidth, Math.min(maxWidth, widthPerColumn));
    }
  };

  // Memoized wrapper to keep a stable function identity for width calculation
  const computeOptimalColumnWidth = useCallback(
    (columnCount: number, columnName?: string) => {
      // Prefer wider defaults to avoid squeezing
      const name = (columnName || '').toLowerCase();
      if (name === 'id' || name.endsWith('id')) return 220;
      if (name === 'name' || name.endsWith('name')) return 240;
      if (name.includes('email')) return 240;
      if (name.includes('phone')) return 180;
      if (name.includes('date') || name.includes('time')) return 170;
      if (name.includes('status') || name.includes('type')) return 150;
      if (name.includes('description') || name.includes('body') || name.includes('content')) return 260;

      const base = getOptimalColumnWidth(columnCount, columnName);
      // Increase the floor and slightly raise the cap
      const min = 160;
      const max = 300;
      const manyColsFloor = columnCount > 12 ? 180 : columnCount > 8 ? 170 : min;
      return Math.max(manyColsFloor, Math.min(max, base));
    },
    [mainPanelWidth]
  );

  // Helper function to get detail fields for a record (query format only)
  const getRecordDetailFields = (record: any): string[] => {
    const detailFields: string[] = [];
    
    // Check relationships dictionary for detail relationships
    if (record.relationships && typeof record.relationships === 'object') {
      Object.keys(record.relationships).forEach((relationshipName: string) => {
        const relationshipRecords = record.relationships[relationshipName];
        if (relationshipRecords && Array.isArray(relationshipRecords) && relationshipRecords.length > 0) {
          detailFields.push(relationshipName);
        }
      });
    }
    
    return detailFields;
  };

  // Helper function to get the count of records for a specific detail type (query format only)
  const getRecordDetailCount = (record: Record<string, unknown>, detailType: string): number => {
    // Check relationships dictionary for detail relationships
    if (record.relationships && typeof record.relationships === 'object') {
      const relationshipRecords = record.relationships[detailType];
      if (relationshipRecords && Array.isArray(relationshipRecords)) {
        return relationshipRecords.length;
      }
    }
    return 0;
  };

  // Helper function to convert detail columns to DataTable format
  const getDetailColumnsForTable = (detailRecord: DetailRecord): any[] => {
    const columns = getDetailColumns(detailRecord.records, detailRecord.parentField);
    if (!columns || columns.length === 0) {
      return [];
    }
    const columnCount = columns.length;
    
    
    // For detail tables, use wider columns to ensure horizontal scroll
    const detailTableWidth = getOptimalTableWidth();
    const columnWidth = Math.max(200, detailTableWidth / columnCount); // Wider columns for detail tables
    
    return columns.map((column, index) => ({
      accessor: column,
      title: column,
      width: column === 'Id' || column === 'id' ? 200 : columnWidth, // Fixed 200px width for ID column
      minWidth: column === 'Id' || column === 'id' ? 200 : 200, // Fixed 200px min width for ID column
      ellipsis: true,
      resizable: column !== 'Id' && column !== 'id', // Only allow resizing for non-ID columns
      textAlign: 'left', // Align all content to the left
      noWrap: false, // Allow text wrapping
      render: (record: Record<string, unknown>) => {
        // Get field value from record.fields[column]
        const fieldValue = record.fields && record.fields[column] ? record.fields[column] : '';
        const stringValue = typeof fieldValue === 'string' ? fieldValue : String(fieldValue || '');
        
        // Get ID - backend always provides Id as first field
        const recordIdStr = getRecordId(record);
        
        // For the first column (ID), add relationship badges
        if (index === 0 && (column === 'Id' || column === 'id')) {
          const detailFields = getRecordDetailFields(record);
          const hasDetails = detailFields.length > 0;
          
          if (hasDetails) {
            return (
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '4px',
                alignItems: 'flex-start'
              }}>
                <div style={{ fontWeight: 600, fontSize: '12px' }}>
                  {getFieldDisplayValue(record, column)}
                </div>
                <div style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '2px',
                  alignItems: 'flex-start'
                }}>
                  {detailFields.map((detailType, idx) => {
                    const recordCount = getRecordDetailCount(record, detailType);
                    const colorScheme = getRelationshipColor(detailType);
                    
                    
                    return (
                      <Badge 
                        key={idx}
                        size="xs" 
                        variant="light" 
                        style={{
                          backgroundColor: colorScheme.bg,
                          color: colorScheme.color,
                          border: `1px solid ${colorScheme.border}`,
                          cursor: 'pointer',
                          fontSize: '10px',
                          fontWeight: 600,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          
                          
                          // Use the same expansion mechanism as master table
                          const currentExpanded = expandedDetailTypes.get(recordIdStr) || new Set();
                          const newExpanded = new Set(currentExpanded);
                          
                          
                          if (newExpanded.has(detailType)) {
                            newExpanded.delete(detailType);
                          } else {
                            newExpanded.add(detailType);
                          }
                          
                          
                          setExpandedDetailTypes(prev => {
                            const updated = new Map(prev);
                            if (newExpanded.size === 0) {
                              updated.delete(recordIdStr);
                            } else {
                              updated.set(recordIdStr, newExpanded);
                            }
                            return updated;
                          });
                        }}
                      >
                        {detailType} ({recordCount})
                      </Badge>
                    );
                  })}
                </div>
              </div>
            );
          }
        }
        
        // For other columns, render normally
        const cellStyle = getCellStyle(column, stringValue);
        return <div id={`cell-basic-${column}-${recordIdStr}`} style={cellStyle}>{stringValue}</div>;
      }
    }));
  };
  const hasMoreRecords = result && !result.metadata.done;

  // Update records when result changes - handles both tree and legacy response formats
  useEffect(() => {
    logger.debug('🔍 ResultsViewPage - Result prop changed', 'ResultsViewPage', {
      resultExists: !!result,
      resultRecordsCount: result?.records?.length || 0,
      resultMetadata: result?.metadata,
      resultDone: result?.metadata?.done,
      resultNextUrl: result?.metadata?.nextRecordsUrl
    });

    
    
  // Process the tree response
  if (!isQueryResponse(result)) {
    logger.error('Expected QueryResponse format but got invalid result', 'ResultsViewPage', { result });
    return;
  }
  
  const resultRecords = result.records;
    
    if (resultRecords && resultRecords.length > 0) {
      // Log the full first record before setting state
      const firstRecord = resultRecords[0];
      logger.debug('🔍 MAIN: ResultsViewPage - Setting records', 'ResultsViewPage', { 
        count: resultRecords.length, 
        firstRecord: firstRecord,
        firstRecordKeys: Object.keys(firstRecord),
        firstRecordFull: JSON.stringify(firstRecord, null, 2),
        allRecordsKeys: resultRecords.map((record, index) => ({
          recordIndex: index,
          keys: Object.keys(record),
          keyCount: Object.keys(record).length
        }))
      });
      setRecords(resultRecords);
      setPage(1); // Reset to first page when new data arrives
      // Reset all expansions when new query is executed
      setExpandedDetailFields(new Map());
      setNestedExpansions(new Map());
      setExpandedDetailTypes(new Map());
      // Force complete re-render by updating the query execution key
      setQueryExecutionKey(prev => prev + 1);
    } else if (result && (!resultRecords || resultRecords.length === 0)) {
      logger.debug('MAIN: ResultsViewPage - Result exists but no records', 'ResultsViewPage');
      setRecords([]);
      // Force re-render even for empty results
      setQueryExecutionKey(prev => prev + 1);
    } else if (!result) {
      logger.debug('MAIN: ResultsViewPage - No result provided', 'ResultsViewPage');
      // Don't clear records if no result is provided - keep existing data
    }
  }, [result, isLoading]);

  // Handle loading state changes
  useEffect(() => {
    if (isLoading) {
      // Optionally clear records when loading starts to show fresh state
      // setRecords([]);
    } else {
    }
  }, [isLoading]);


  // Handle sorting + pagination (v8 pattern)
  useEffect(() => {
    if (records.length > 0) {
      // Sort records if sortStatus is set
      let working = [...records];
      if (sortStatus && sortStatus.columnAccessor) {
        const accessor = String(sortStatus.columnAccessor);
        working.sort((a, b) => {
          const av = getFieldValue(a, accessor);
          const bv = getFieldValue(b, accessor);
          // Try numeric compare first
          const an = Number(av);
          const bn = Number(bv);
          const bothNumeric = !isNaN(an) && !isNaN(bn);
          if (bothNumeric) {
            return an - bn;
          }
          // Fallback to string compare
          return String(av).localeCompare(String(bv), undefined, { sensitivity: 'base' });
        });
        if (sortStatus.direction === 'desc') working.reverse();
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize;
      setPaginatedRecords(working.slice(from, to));
    } else {
      setPaginatedRecords([]);
    }
  }, [records, page, pageSize, sortStatus]);

  // Handle page size change
  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    setPage(1); // Reset to first page when page size changes
  };

  // Detect detail record fields in the data
  const detectDetailFields = (records: any[]): string[] => {
    if (records.length === 0) return [];
    
    const detailFields: string[] = [];
    const firstRecord = records[0];
    
    // Check relationships dictionary for detail relationships
    if (firstRecord.relationships && typeof firstRecord.relationships === 'object') {
      Object.keys(firstRecord.relationships).forEach((relationshipName: string) => {
        const relationshipRecords = firstRecord.relationships[relationshipName];
        if (relationshipRecords && Array.isArray(relationshipRecords) && relationshipRecords.length > 0) {
          detailFields.push(relationshipName);
          // logger.info(`🔍 Detected detail field: ${relationshipName}`, 'ResultsViewPage', {
          //   type: relationshipName,
          //   recordCount: relationshipRecords.length,
          //   hasFields: !!relationshipRecords[0]?.fields,
          //   hasRelationships: !!relationshipRecords[0]?.relationships
          // });
        }
      });
    }
    
    return detailFields;
  };

  const detailFields = detectDetailFields(records);

  // Component for expand details summary in detail tables
  const DetailExpandSummary: React.FC<{ record: any; recordId: string; level: number; parentRecordId?: string; parentField?: string }> = ({ record, recordId, level, parentRecordId, parentField }) => {
    // Detect detail fields for THIS specific record
    const getRecordDetailFields = (record: any): string[] => {
      const detailFields: string[] = [];
      
      // Check relationships dictionary for detail relationships
      if (record.relationships && typeof record.relationships === 'object') {
        Object.keys(record.relationships).forEach((relationshipName: string) => {
          const relationshipRecords = record.relationships[relationshipName];
          if (relationshipRecords && Array.isArray(relationshipRecords) && relationshipRecords.length > 0) {
            detailFields.push(relationshipName);
          }
        });
      }
      
      return detailFields;
    };
    
    const recordDetailFields = getRecordDetailFields(record);
    
    const toggleDetailType = (detailType: string, colorScheme: any) => {
      if (!parentRecordId || !parentField) return;
      
      const newNestedExpansions = new Map(nestedExpansions);
      const parentKey = `${parentRecordId}:${parentField}`;
      const parentExpansions = new Map(newNestedExpansions.get(parentKey) || new Map());
      const recordExpansions = new Set(parentExpansions.get(recordId) || []);
      
      if (recordExpansions.has(detailType)) {
        recordExpansions.delete(detailType);
      } else {
        recordExpansions.add(detailType);
        // Store the color scheme for this detail type
        const colorKey = `${recordId}_${detailType}_color`;
        localStorage.setItem(colorKey, JSON.stringify(colorScheme));
      }
      
      if (recordExpansions.size === 0) {
        parentExpansions.delete(recordId);
      } else {
        parentExpansions.set(recordId, recordExpansions);
      }
      
      if (parentExpansions.size === 0) {
        newNestedExpansions.delete(parentKey);
      } else {
        newNestedExpansions.set(parentKey, parentExpansions);
      }
      
      setNestedExpansions(newNestedExpansions);
    };
    
    const getDetailCount = (detailType: string) => {
      const detailData = record[detailType];
      if (detailData && detailData.records && Array.isArray(detailData.records)) {
        return detailData.records.length;
      }
      return 0;
    };
    
    const getDetailTypeName = (detailType: string) => {
      // Convert field name to readable name - remove common prefixes and make readable
      return detailType
        .replace(/^[A-Z_]+__/, '') // Remove common prefixes like OCE__, etc.
        .replace(/[A-Z]/g, ' $&') // Add space before capital letters
        .trim();
    };
    
    // Don't show expand details if no detail fields exist for this record
    if (recordDetailFields.length === 0) {
      return null;
    }
    
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <span style={{ 
          fontSize: '12px',
          fontWeight: 600,
          color: '#6c757d',
          marginRight: '8px',
          fontFamily: 'monospace',
          letterSpacing: '0.5px'
        }}>
          📋 {tSync('results.details.label')}:
        </span>
        
        {recordDetailFields.map((detailType, index) => {
          const count = getDetailCount(detailType);
          const isExpanded = parentRecordId && parentField 
            ? isNestedDetailFieldExpanded(parentRecordId, parentField, recordId, detailType)
            : false;
          const typeName = getDetailTypeName(detailType);
          
          // Color palette for different detail types
          const colors = [
            { bg: '#e8f5e8', border: '#4caf50', text: '#2e7d32', hover: '#c8e6c9', count: '#4caf50' }, // Green
            { bg: '#e3f2fd', border: '#2196f3', text: '#1976d2', hover: '#bbdefb', count: '#2196f3' }, // Blue
            { bg: '#fce4ec', border: '#e91e63', text: '#c2185b', hover: '#f8bbd9', count: '#e91e63' }, // Pink
            { bg: '#fff3e0', border: '#ff9800', text: '#f57c00', hover: '#ffcc02', count: '#ff9800' }, // Orange
            { bg: '#f3e5f5', border: '#9c27b0', text: '#7b1fa2', hover: '#e1bee7', count: '#9c27b0' }, // Purple
            { bg: '#e0f2f1', border: '#009688', text: '#00695c', hover: '#b2dfdb', count: '#009688' }, // Teal
          ];
          
          const colorScheme = colors[index % colors.length];
          
          return (
            <div
              key={detailType}
              onClick={() => toggleDetailType(detailType, colorScheme)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                backgroundColor: isExpanded ? colorScheme.bg : colorScheme.bg,
                border: `1px solid ${isExpanded ? colorScheme.border : colorScheme.border}`,
                borderRadius: '12px',
                fontSize: '11px',
                fontWeight: 500,
                color: isExpanded ? colorScheme.text : colorScheme.text,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                userSelect: 'none',
                boxShadow: isExpanded ? `0 2px 4px ${colorScheme.border}20` : '0 1px 2px rgba(0,0,0,0.1)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = colorScheme.hover;
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = `0 4px 8px ${colorScheme.border}30`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = colorScheme.bg;
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = `0 2px 4px ${colorScheme.border}20`;
              }}
            >
              {isExpanded ? <IconChevronDown size={10} /> : <IconChevronRight size={10} />}
              <span>{typeName}</span>
              <span style={{
                backgroundColor: colorScheme.count,
                color: 'white',
                borderRadius: '8px',
                padding: '1px 6px',
                fontSize: '9px',
                fontWeight: 600,
                minWidth: '16px',
                textAlign: 'center',
                boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
              }}>
                {count}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  // Component for expand details summary
  const ExpandDetailsSummary: React.FC<{ record: any; recordId: string }> = ({ record, recordId }) => {
    const expandedTypes = expandedDetailTypes.get(recordId) || new Set();
    
    const recordDetailFields = getRecordDetailFields(record);
    
    // Debug: Log what detail fields were detected for this record
    
    
    const toggleDetailType = (detailType: string, colorScheme: any) => {
      const newExpandedDetailTypes = new Map(expandedDetailTypes);
      const currentExpanded = new Set(expandedDetailTypes.get(recordId) || []);
      
      if (currentExpanded.has(detailType)) {
        currentExpanded.delete(detailType);
      } else {
        currentExpanded.add(detailType);
        // Store the color scheme for this detail type
        const colorKey = `${recordId}_${detailType}_color`;
        localStorage.setItem(colorKey, JSON.stringify(colorScheme));
      }
      
      if (currentExpanded.size === 0) {
        newExpandedDetailTypes.delete(recordId);
      } else {
        newExpandedDetailTypes.set(recordId, currentExpanded);
      }
      
      setExpandedDetailTypes(newExpandedDetailTypes);
    };
    
    const getDetailCount = (detailType: string) => {
      const detailData = record[detailType];
      if (detailData && detailData.records && Array.isArray(detailData.records)) {
        return detailData.records.length;
      }
      return 0;
    };
    
    const getDetailTypeName = (detailType: string) => {
      // Convert field name to readable name - remove common prefixes and make readable
      return detailType
        .replace(/^[A-Z_]+__/, '') // Remove common prefixes like OCE__, etc.
        .replace(/[A-Z]/g, ' $&') // Add space before capital letters
        .trim();
    };
    
    // Don't show expand details if no detail fields exist for this record
    if (recordDetailFields.length === 0) {
      return null;
    }
    
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <span style={{ 
          fontSize: '12px',
          fontWeight: 600,
          color: '#6c757d',
          marginRight: '8px',
          fontFamily: 'monospace',
          letterSpacing: '0.5px'
        }}>
          📋 {tSync('results.details.label')}:
        </span>
        
        {recordDetailFields.map((detailType, index) => {
          const count = getDetailCount(detailType);
          const isExpanded = expandedTypes.has(detailType);
          const typeName = getDetailTypeName(detailType);
          
          // Color palette for different detail types
          const colors = [
            { bg: '#e8f5e8', border: '#4caf50', text: '#2e7d32', hover: '#c8e6c9', count: '#4caf50' }, // Green
            { bg: '#e3f2fd', border: '#2196f3', text: '#1976d2', hover: '#bbdefb', count: '#2196f3' }, // Blue
            { bg: '#fce4ec', border: '#e91e63', text: '#c2185b', hover: '#f8bbd9', count: '#e91e63' }, // Pink
            { bg: '#fff3e0', border: '#ff9800', text: '#f57c00', hover: '#ffcc02', count: '#ff9800' }, // Orange
            { bg: '#f3e5f5', border: '#9c27b0', text: '#7b1fa2', hover: '#e1bee7', count: '#9c27b0' }, // Purple
            { bg: '#e0f2f1', border: '#009688', text: '#00695c', hover: '#b2dfdb', count: '#009688' }, // Teal
          ];
          
          const colorScheme = colors[index % colors.length];
          
          return (
            <div
              key={detailType}
              onClick={() => toggleDetailType(detailType, colorScheme)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                backgroundColor: isExpanded ? colorScheme.bg : colorScheme.bg,
                border: `1px solid ${isExpanded ? colorScheme.border : colorScheme.border}`,
                borderRadius: '12px',
                fontSize: '11px',
                fontWeight: 500,
                color: isExpanded ? colorScheme.text : colorScheme.text,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                userSelect: 'none',
                boxShadow: isExpanded ? `0 2px 4px ${colorScheme.border}20` : '0 1px 2px rgba(0,0,0,0.1)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = colorScheme.hover;
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = `0 4px 8px ${colorScheme.border}30`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = colorScheme.bg;
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = `0 2px 4px ${colorScheme.border}20`;
              }}
            >
              {isExpanded ? <IconChevronDown size={10} /> : <IconChevronRight size={10} />}
              <span>{typeName}</span>
              <span style={{
                backgroundColor: colorScheme.count,
                color: 'white',
                borderRadius: '8px',
                padding: '1px 6px',
                fontSize: '9px',
                fontWeight: 600,
                minWidth: '16px',
                textAlign: 'center',
                boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
              }}>
                {count}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  // Recursive function to extract all nested columns up to 4 levels deep
  const extractNestedColumns = (obj: any, prefix: string = '', level: number = 0, relationshipFields: string[] = []): string[] => {
    const columns: string[] = [];
    
    // Prevent infinite recursion - limit to 4 levels
    if (level >= 4) {
      return columns;
    }
    
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return columns;
    }
    
    // Debug: Log all keys at this level
    const allKeys = Object.keys(obj);
    // console.log(`🔍 extractNestedColumns level ${level} - Processing keys:`, {
    //   level,
    //   prefix,
    //   allKeys,
    //   allKeysCount: allKeys.length,
    //   objType: typeof obj,
    //   isArray: Array.isArray(obj)
    // });
    
    Object.keys(obj).forEach(key => {
      if (key === 'attributes') return; // Skip attributes at any level
      
      // Skip relationship fields - they should only appear as badges, not columns
      if (relationshipFields.includes(key)) {
        return;
      }
      
      const value = obj[key];
      const columnName = prefix ? `${prefix}.${key}` : key;
      
      // Debug: Log every key being processed
      // console.log(`🔍 Processing key "${key}" at level ${level}:`, {
      //   key,
      //   level,
      //   prefix,
      //   columnName,
      //   valueType: typeof value,
      //   isArray: Array.isArray(value),
      //   hasValue: value !== null && value !== undefined,
      //   valueKeys: value && typeof value === 'object' ? Object.keys(value) : 'N/A'
      // });
      
      // Check if this is a nested object
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        // Log nested object detection
        // console.log(`🔍 Found nested object at level ${level}: ${columnName}`, {
        //   objectKeys: Object.keys(value),
        //   level,
        //   prefix
        // });
        
        // For tree format, we don't need to check for detail fields here
        // Detail fields are in the relationships section, not in fields
        // Just recursively extract columns from nested object
        const nestedColumns = extractNestedColumns(value, columnName, level + 1, relationshipFields);
        columns.push(...nestedColumns);
      } else {
        // Regular field
        columns.push(columnName);
        // console.log(`🔍 Adding column at level ${level}: ${columnName}`, {
        //   level,
        //   value,
        //   valueType: typeof value,
        //   isArray: Array.isArray(value),
        //   hasRecords: value?.records ? 'YES' : 'NO',
        //   valueKeys: value && typeof value === 'object' ? Object.keys(value) : 'N/A'
        // });
      }
    });
    
    return columns;
  };

  // Get ordered columns - ensure we have columns even if columnOrder is empty
  const getOrderedColumns = useCallback(() => {
    
    if (columnOrder.length > 0) {
      // Check all records to identify detail fields (not just the first record)
      const allDetailFields = new Set<string>();
      records.forEach((record, index) => {
        Object.keys(record).forEach(key => {
          if (key === 'attributes') return;
          
          const value = record[key];
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            // Check if this object has a 'records' array (master-detail relationship)
            if (value.records && Array.isArray(value.records)) {
              allDetailFields.add(key);
            }
          }
        });
      });
      
      // Filter out detail fields from existing columnOrder using the comprehensive detail field detection
      const filteredColumns = columnOrder.filter(col => {
        // Check if this column represents a detail field by examining all records
        const isDetailField = allDetailFields.has(col);
        
        if (isDetailField) {
        }
        
        return !isDetailField;
      });
      
      // Always ensure ID is the first column
      const finalColumns = [];
      if (!filteredColumns.includes('Id') && !filteredColumns.includes('id')) {
        finalColumns.push('Id'); // Add Id as first column if not present
      }
      finalColumns.push(...filteredColumns); // Add all other columns
      
      logger.debug('🔍 Using filtered columnOrder with ID first', 'ResultsViewPage', { 
        originalColumnOrder: columnOrder,
        filteredColumns,
        finalColumns,
        allDetailFields: Array.from(allDetailFields),
        filteredOut: columnOrder.filter(col => allDetailFields.has(col))
      });
      return finalColumns;
    }
    
    // Fallback: generate columns from records if available
    if (records.length > 0) {
      const first = records[0];
      const columns: string[] = [];
      
      logger.debug('🔍 FALLBACK: Generating columns from first record in getOrderedColumns', 'ResultsViewPage', { 
        first, 
        keys: Object.keys(first), 
        fullStructure: JSON.stringify(first, null, 2), 
        attributes: first.attributes,
        keysCount: Object.keys(first).length,
        keysExcludingAttributes: Object.keys(first).filter(key => key !== 'attributes')
      });
      
      // Use the same recursive logic for fallback columns - extract from fields for tree format
      // But exclude any fields that are also in relationships (they should only be badges)
      const relationshipFields = first.relationships && typeof first.relationships === 'object' 
        ? Object.keys(first.relationships)
        : [];
      const fallbackColumns = extractNestedColumns(first.fields, '', 0, []);
      
      // Always ensure ID is the first column
      const finalColumns = [];
      if (!fallbackColumns.includes('Id') && !fallbackColumns.includes('id')) {
        finalColumns.push('Id'); // Add Id as first column if not present
      }
      finalColumns.push(...fallbackColumns); // Add all other columns
      
      logger.debug('🔍 FALLBACK: Generated columns with ID first', 'ResultsViewPage', { 
        fallbackColumns,
        finalColumns,
        columnsCount: finalColumns.length,
        allKeys: Object.keys(first),
        keysExcludingAttributes: Object.keys(first).filter(key => key !== 'attributes')
      });
      return finalColumns;
    }
    
    logger.debug('No records available for column generation', 'ResultsViewPage');
    return [];
  }, [columnOrder, records]);

  const orderedColumns = useMemo(() => {
    return getOrderedColumns();
  }, [getOrderedColumns, columnOrder, records]);
  
  // Define columns exactly like the working example
  const props = useMemo(() => ({
    resizable: true,
    sortable: false,
    toggleable: false,
    draggable: false,
  }), []);



  
  // Ensure we always have valid arrays to prevent filter errors
  const safeRecords = (records || []).filter(record => record != null);
  
  // Check if any detail fields are expanded (including nested)
  const isAnyDetailOpen = expandedDetailFields.size > 0 || nestedExpansions.size > 0;
  

  // Initialize column order when records first arrive
  useEffect(() => {
    if (records.length > 0) {
      const first = records[0];
      const columns: string[] = [];

      logger.debug('🔍 ResultsViewPage - Processing first record for column generation', 'ResultsViewPage', { 
        first, 
        keys: Object.keys(first), 
        fullStructure: JSON.stringify(first, null, 2), 
        attributes: first.attributes,
        currentColumnOrder: columnOrder,
        currentColumnOrderLength: columnOrder.length
      });

      // Get all keys except attributes (Salesforce metadata)
      // Use the same recursive logic for main table columns
      
      // For tree format, detail fields are in the relationships section
      const allDetailFields = new Set<string>();
      records.forEach((record, index) => {
        if (record.relationships) {
          Object.keys(record.relationships).forEach(key => {
            const rel = record.relationships[key];
            if (rel && Array.isArray(rel) && rel.length > 0) {
              allDetailFields.add(key);
            }
          });
        }
      });
      
      
      // Get relationship fields to exclude from columns
      const relationshipFields = first.relationships && typeof first.relationships === 'object' 
        ? Object.keys(first.relationships)
        : [];
      
      // Create a custom extractNestedColumns that knows about all detail fields
      const extractNestedColumnsWithDetailFields = (obj: any, prefix: string = '', level: number = 0, relationshipFields: string[] = []): string[] => {
        const columns: string[] = [];
        
        if (level >= 4) {
          return columns;
        }
        
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
          return columns;
        }
        
        Object.keys(obj).forEach(key => {
          if (key === 'attributes') return;
          
          // Skip relationship fields - they should only appear as badges, not columns
          if (relationshipFields.includes(key)) {
            return;
          }
          
          const value = obj[key];
          const columnName = prefix ? `${prefix}.${key}` : key;
          
          // Check if this is a nested object
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            // For tree format, just recursively extract columns from nested object
            const nestedColumns = extractNestedColumnsWithDetailFields(value, columnName, level + 1, relationshipFields);
            columns.push(...nestedColumns);
          } else {
            // Regular field
            columns.push(columnName);
          }
        });
        
        return columns;
      };
      
      const mainColumns = extractNestedColumnsWithDetailFields(first.fields, '', 0, []);
      columns.push(...mainColumns);
      
      
      setColumnOrder(columns);
    }
  }, [records]);





  // Log the Salesforce query response to file for investigation (only when result changes)

  // Listen for custom events from App.tsx control buttons
  useEffect(() => {

    const handleExportDataEvent = (event: CustomEvent) => {
      const format = event.detail?.format || 'json';
      handleExportData(format);
    };

    window.addEventListener('exportData', handleExportDataEvent as EventListener);

    return () => {
      window.removeEventListener('exportData', handleExportDataEvent as EventListener);
    };
  }, [result]); // Add result as dependency so the event handler gets the latest result

  // Handle expanding/collapsing detail fields for a specific record
  const toggleDetailField = (recordId: string, detailField: string) => {
    const newExpandedFields = new Map(expandedDetailFields);
    const recordExpandedFields = new Set(newExpandedFields.get(recordId) || []);
    
    if (recordExpandedFields.has(detailField)) {
      recordExpandedFields.delete(detailField);
    } else {
      recordExpandedFields.add(detailField);
    }
    
    if (recordExpandedFields.size === 0) {
      newExpandedFields.delete(recordId);
    } else {
      newExpandedFields.set(recordId, recordExpandedFields);
    }
    
    setExpandedDetailFields(newExpandedFields);
  };

  // Handle nested detail field expansion (for levels 2-4)
  const toggleNestedDetailField = (parentRecordId: string, parentField: string, detailRecordId: string, detailField: string) => {
    
    const newNestedExpansions = new Map(nestedExpansions);
    const parentKey = `${parentRecordId}:${parentField}`;
    const parentExpansions = new Map(newNestedExpansions.get(parentKey) || new Map());
    const recordExpansions = new Set(parentExpansions.get(detailRecordId) || []);
    
    
    if (recordExpansions.has(detailField)) {
      recordExpansions.delete(detailField);
    } else {
      recordExpansions.add(detailField);
    }
    
    if (recordExpansions.size === 0) {
      parentExpansions.delete(detailRecordId);
    } else {
      parentExpansions.set(detailRecordId, recordExpansions);
    }
    
    if (parentExpansions.size === 0) {
      newNestedExpansions.delete(parentKey);
    } else {
      newNestedExpansions.set(parentKey, parentExpansions);
    }
    
    setNestedExpansions(newNestedExpansions);
  };

  // Check if a nested detail field is expanded
  const isNestedDetailFieldExpanded = (parentRecordId: string, parentField: string, detailRecordId: string, detailField: string): boolean => {
    const parentKey = `${parentRecordId}:${parentField}`;
    const parentExpansions = nestedExpansions.get(parentKey);
    if (!parentExpansions) return false;
    
    const recordExpansions = parentExpansions.get(detailRecordId);
    return recordExpansions ? recordExpansions.has(detailField) : false;
  };

  // Check if a specific detail field is expanded for a record
  const isDetailFieldExpanded = (recordId: string, detailField: string): boolean => {
    const recordExpandedFields = expandedDetailFields.get(recordId);
    return recordExpandedFields ? recordExpandedFields.has(detailField) : false;
  };

  // Get detail records for a specific record and field (query format only)
  const getDetailRecords = (record: any, detailField: string): DetailRecord | null => {
    // Get parent ID - backend always provides Id as first field
    const parentId = getRecordId(record);
    
    // Check relationships dictionary for detail relationships
    if (record.relationships && typeof record.relationships === 'object') {
      const relationshipRecords = record.relationships[detailField];
      if (relationshipRecords && Array.isArray(relationshipRecords) && relationshipRecords.length > 0) {
        return {
          parentId: parentId,
          parentField: detailField,
          records: relationshipRecords,
          total_size: relationshipRecords.length,
          done: true,
          sObjectType: detailField
        };
      }
    }
    
    return null;
  };

  // Check if a field has detail data (query format only)
  const hasDetailData = (record: any, fieldName: string): boolean => {
    // Check relationships dictionary for detail relationships
    if (record.relationships && typeof record.relationships === 'object') {
      const relationshipRecords = record.relationships[fieldName];
      return relationshipRecords && Array.isArray(relationshipRecords) && relationshipRecords.length > 0;
    }
    
    return false;
  };

  // Get the display value for a field (tree format only)
  const getFieldDisplayValue = (record: any, fieldName: string) => {
    // For tree format, get value from fields
    if (record.fields && record.fields[fieldName] !== undefined) {
      return record.fields[fieldName];
    }
    
    // Fallback for direct field access
    return record[fieldName] || '';
  };

  // Calculate optimal column width based on content
  const calculateColumnWidth = (columnName: string, records: any[]): number => {
    const baseWidth = 120; // Minimum width
    const padding = 16; // Cell padding
    const headerPadding = 20; // Header padding
    
    // Get all values for this column
    const values = records.map(record => {
      const value = getFieldDisplayValue(record, columnName);
      return typeof value === 'string' ? value : String(value);
    });
    
    // Add header title to the list
    values.push(columnName);
    
    // Calculate max content width
    const maxContentLength = Math.max(...values.map(v => v.length));
    
    // Estimate width based on character count (rough estimate: 8px per character)
    const estimatedWidth = maxContentLength * 8 + padding;
    
    // Apply dynamic width adjustments based on content type
    let finalWidth = Math.max(baseWidth, estimatedWidth);
    
    // Dynamic width adjustments based on field patterns
    if (columnName.toLowerCase().includes('id')) {
      finalWidth = Math.max(70, estimatedWidth); // IDs are usually longer
    } else if (columnName.toLowerCase().includes('email')) {
      finalWidth = Math.max(100, estimatedWidth); // Emails need more space
    } else if (columnName.toLowerCase().includes('website') || columnName.toLowerCase().includes('url')) {
      finalWidth = Math.max(90, estimatedWidth); // URLs need more space
    } else if (columnName.toLowerCase().includes('description')) {
      finalWidth = Math.max(120, estimatedWidth); // Descriptions need more space
    } else if (columnName.toLowerCase().includes('amount') || columnName.toLowerCase().includes('revenue')) {
      finalWidth = Math.max(70, estimatedWidth); // Numbers need consistent space
    } else if (columnName.toLowerCase().includes('date')) {
      finalWidth = Math.max(70, estimatedWidth); // Dates need consistent space
    } else if (columnName.toLowerCase().includes('name')) {
      finalWidth = Math.max(80, estimatedWidth); // Names need more space
    } else if (columnName.toLowerCase().includes('phone')) {
      finalWidth = Math.max(60, estimatedWidth); // Phone numbers need consistent space
    }
    
    // Cap maximum width to prevent extremely wide columns
    return Math.min(finalWidth, 400);
  };

  // Get columns for detail records

  const getDetailColumns = (detailRecords: any[], parentField?: string): string[] => {
    if (detailRecords.length === 0) return [];
    
    // Instead of using just the first record, collect all unique fields from ALL records
    const allFields = new Set<string>();
    
    detailRecords.forEach((record, index) => {
      // Extract columns from record.fields, not the entire record
      const recordColumns = record.fields ? Object.keys(record.fields) : [];
      recordColumns.forEach(col => allFields.add(col));
      
      if (index === 0) {
        // console.log('🔍 DETAIL COLUMN GENERATION: First record structure', {
        //   record,
        //   keys: Object.keys(record),
        //   extractedColumns: recordColumns,
        //   parentField
        // });
        
        // Log the full structure separately to avoid truncation
        // console.log('🔍 FULL RECORD STRUCTURE:', JSON.stringify(record, null, 2));
      }
    });
    
    // Check all records to identify detail fields (not just the first record)
    const allDetailFields = new Set<string>();
    detailRecords.forEach((record, index) => {
      Object.keys(record).forEach(key => {
        if (key === 'attributes') return;
        
        const value = record[key];
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          // Check if this object has a 'records' array (master-detail relationship)
          if (value.records && Array.isArray(value.records)) {
            allDetailFields.add(key);
          }
        }
      });
    });
    
    // Filter out detail fields from existing columns using the comprehensive detail field detection
    const filteredColumns = Array.from(allFields).filter(col => {
      // Check if this column represents a detail field by examining all records
      const isDetailField = allDetailFields.has(col);
      
      if (isDetailField) {
      }
      
      return !isDetailField;
    }).sort();
    
    // Always ensure ID is the first column for detail tables
    const finalColumns = [];
    
    // Remove Id/id from filtered columns if present
    const idColumn = filteredColumns.find(col => col === 'Id' || col === 'id');
    const otherColumns = filteredColumns.filter(col => col !== 'Id' && col !== 'id');
    
    // Add Id as first column (use the actual column name found, or default to 'Id')
    if (idColumn) {
      finalColumns.push(idColumn);
    } else {
      finalColumns.push('Id'); // Add Id as first column if not present
    }
    
    // Add all other columns
    finalColumns.push(...otherColumns);
    
    
    // console.log('🔍 DETAIL COLUMN GENERATION: Final detail columns with ID first (from all records)', {
    //   totalRecords: detailRecords.length,
    //   filteredColumns,
    //   finalColumns,
    //   columnsCount: finalColumns.length,
    //   sampleColumns: finalColumns.slice(0, 10),
    //   parentField,
    //   allDetailFields: Array.from(allDetailFields),
    //   filteredOut: Array.from(allFields).filter(col => allDetailFields.has(col))
    // });
    
    return finalColumns;
  };

  const handleExportData = (format: 'csv' | 'json' | 'excel') => {
    // Use result.records directly since it's always up-to-date with all loaded records
    const recordsToExport = result?.records || [];
    
    if (!recordsToExport || recordsToExport.length === 0) {
      logger.warn('No records available for export', 'ResultsViewPage', { 
        recordsCount: recordsToExport.length,
        hasRecords: !!recordsToExport,
        resultExists: !!result,
        resultRecordsCount: result?.records?.length || 0
      });
      notifications.show({
        title: tSync('results.export.noData.title', 'No Data to Export'),
        message: tSync('results.export.noData.message', 'There are no records to export'),
        color: 'yellow',
        autoClose: 3000,
      });
      return;
    }

    try {
      // Log detailed export information
      logger.debug('Starting export with records', 'ResultsViewPage', {
        totalRecordsToExport: recordsToExport.length,
        firstRecordId: recordsToExport[0] ? getRecordId(recordsToExport[0]) : tSync('results.noId', 'No ID'),
        lastRecordId: recordsToExport[recordsToExport.length - 1] ? getRecordId(recordsToExport[recordsToExport.length - 1]) : tSync('results.noId', 'No ID'),
        format: format,
        resultMetadata: result?.metadata
      });
      
      let dataToExport: string;
      let filename: string;
      let mimeType: string;

      if (format === 'json') {
        // Recursively clean up records by removing ALL Salesforce attributes at any level
        const cleanAttributes = (obj: any): any => {
          if (obj === null || obj === undefined) {
            return obj;
          }
          
          if (Array.isArray(obj)) {
            return obj.map(item => cleanAttributes(item));
          }
          
          if (typeof obj === 'object') {
            const cleaned: any = {};
            Object.keys(obj).forEach(key => {
              if (key !== 'attributes') {
                cleaned[key] = cleanAttributes(obj[key]);
              }
            });
            return cleaned;
          }
          
          return obj;
        };

        const cleanedRecords = recordsToExport.map(record => cleanAttributes(record));
        
        dataToExport = JSON.stringify(cleanedRecords, null, 2);
        filename = `soql-results-${new Date().toISOString().split('T')[0]}.json`;
        mimeType = 'application/json';
      } else if (format === 'csv') {
        // Recursively clean up records by removing ALL Salesforce attributes at any level
        const cleanAttributes = (obj: any): any => {
          if (obj === null || obj === undefined) {
            return obj;
          }
          
          if (Array.isArray(obj)) {
            return obj.map(item => cleanAttributes(item));
          }
          
          if (typeof obj === 'object') {
            const cleaned: any = {};
            Object.keys(obj).forEach(key => {
              if (key !== 'attributes') {
                cleaned[key] = cleanAttributes(obj[key]);
              }
            });
            return cleaned;
          }
          
          return obj;
        };

        const cleanedRecords = recordsToExport.map(record => cleanAttributes(record));
        
        // Convert to CSV
        const headers = Object.keys(cleanedRecords[0]);
        const csvContent = [
          headers.join(','),
          ...cleanedRecords.map(record => 
            headers.map(header => {
              const value = record[header];
              // Handle objects and arrays by converting to JSON string
              if (value && typeof value === 'object') {
                return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
              }
              // Handle strings with commas or quotes
              if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                return `"${value.replace(/"/g, '""')}"`;
              }
              return value || '';
            }).join(',')
          )
        ].join('\n');
        dataToExport = csvContent;
        filename = `soql-results-${new Date().toISOString().split('T')[0]}.csv`;
        mimeType = 'text/csv';
      } else {
        // Recursively clean up records by removing ALL Salesforce attributes at any level
        const cleanAttributes = (obj: any): any => {
          if (obj === null || obj === undefined) {
            return obj;
          }
          
          if (Array.isArray(obj)) {
            return obj.map(item => cleanAttributes(item));
          }
          
          if (typeof obj === 'object') {
            const cleaned: any = {};
            Object.keys(obj).forEach(key => {
              if (key !== 'attributes') {
                cleaned[key] = cleanAttributes(obj[key]);
              }
            });
            return cleaned;
          }
          
          return obj;
        };

        const cleanedRecords = recordsToExport.map(record => cleanAttributes(record));
        
        // Excel format (basic CSV with .xlsx extension)
        const headers = Object.keys(cleanedRecords[0]);
        const csvContent = [
          headers.join('\t'),
          ...cleanedRecords.map(record => 
            headers.map(header => {
              const value = record[header];
              if (value && typeof value === 'object') {
                return JSON.stringify(value);
              }
              return value || '';
            }).join('\t')
          )
        ].join('\n');
        dataToExport = csvContent;
        filename = `soql-results-${new Date().toISOString().split('T')[0]}.xlsx`;
        mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      }

      // Create and download the file
      const blob = new Blob([dataToExport], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      notifications.show({
        title: tSync('results.export.success.title', 'Export Successful'),
        message: tSync('results.export.success.message', {
          format: format.toUpperCase(),
          count: recordsToExport.length
        }) || `Data exported as ${format.toUpperCase()} with ${recordsToExport.length} records`,
        color: 'green',
        autoClose: 3000,
      });

      logger.debug(`Successfully exported ${recordsToExport.length} records in ${format} format`, 'ResultsViewPage');
    } catch (error) {
      logger.error('Failed to export data', 'ResultsViewPage', null, error as Error);
      notifications.show({
        title: tSync('results.export.failed.title', 'Export Failed'),
        message: tSync('results.export.failed.message', 'Failed to export data. Please try again.'),
        color: 'red',
        autoClose: 5000,
      });
    }
  };



  const handleEditRecord = (recordId: string, fieldName: string, currentValue: any) => {
    setEditingRecord({ id: recordId, field: fieldName, value: currentValue });
    setEditValue(String(currentValue || ''));
  };

  const handleSaveEdit = async () => {
    if (editingRecord && onRecordUpdate) {
      try {
        await onRecordUpdate(editingRecord.id, editingRecord.field, editValue);
        setEditingRecord(null);
        setEditValue('');
      } catch (error) {
        logger.error('Failed to update record', 'ResultsViewPage', null, error as Error);
      }
    }
  };

  const handleCancelEdit = () => {
    setEditingRecord(null);
    setEditValue('');
  };

  // Inline editing handlers
  const handleInlineEdit = (recordId: string, fieldName: string, currentValue: any) => {
    setInlineEditing({ id: recordId, field: fieldName, value: currentValue });
    setInlineEditValue(String(currentValue || ''));
  };

  const handleInlineSave = async () => {
    if (inlineEditing && onRecordUpdate) {
      try {
        // Find the record to get its attributes for SObject name
        const record = records?.find(r => String(r.Id) === inlineEditing.id);
        await onRecordUpdate(inlineEditing.id, inlineEditing.field, inlineEditValue, record);
        setInlineEditing(null);
        setInlineEditValue('');
      } catch (error) {
        logger.error('Failed to update record inline', 'ResultsViewPage', null, error as Error);
        const errorMessage = error instanceof Error ? error.message : tSync('results.updateRecordFailed', 'Failed to update the record. Please try again.');
        notifications.show({
          title: tSync('results.update.failed.title', 'Update Failed'),
          message: errorMessage,
          color: 'red',
        });
      }
    }
  };

  const handleInlineCancel = () => {
    setInlineEditing(null);
    setInlineEditValue('');
  };

  const handleInlineKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleInlineSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleInlineCancel();
    }
  };

  // Helper function to determine if a field is editable
  const isFieldEditable = (fieldName: string, record: any) => {
    // Don't allow editing of Id fields
    if (fieldName.toLowerCase() === 'id') return false;
    
    // Don't allow editing of reference fields (fields containing . or that are objects)
    if (fieldName.includes('.')) return false;
    
    // Don't allow editing of system fields
    const systemFields = ['createddate', 'createdbyid', 'lastmodifieddate', 'lastmodifiedbyid', 'systemmodstamp'];
    if (systemFields.includes(fieldName.toLowerCase())) return false;
    
    // Don't allow editing if the field has detail data (it's a relationship)
    if (hasDetailData(record, fieldName)) return false;
    
    return true;
  };

  // Cache for SObject metadata to avoid repeated API calls
  const [sobjectMetadataCache, setSObjectMetadataCache] = useState<Map<string, any>>(new Map());

  // Preload metadata for all SObjects in the current results
  useEffect(() => {
    const preloadMetadata = async () => {
      if (!records || records.length === 0) return;

      // Get unique SObject names from records
      const sobjectNames = new Set<string>();
      records.forEach(record => {
        if (record?.attributes?.type) {
          sobjectNames.add(record.attributes.type);
        }
      });

      // Load metadata for each SObject that's not already cached
      for (const sobjectName of sobjectNames) {
        if (!sobjectMetadataCache.has(sobjectName)) {
          try {
            const { SalesforceService } = await import('../services/SalesforceService');
            const connectionUuid = getConnectionUuidFromSession();
            const metadata = await SalesforceService.getSObjectFields(sobjectName, connectionUuid);
            setSObjectMetadataCache(prev => new Map(prev).set(sobjectName, { fields: metadata }));
          } catch (error) {
            logger.warn(`Failed to preload metadata for ${sobjectName}`, 'ResultsViewPage');
          }
        }
      }
    };

    preloadMetadata();
  }, [records, sobjectMetadataCache]);

  // Helper function to get field type from SObject metadata
  const getFieldType = async (fieldName: string, record: any): Promise<string> => {
    try {
      // Get SObject name from record attributes
      const sobjectName = record?.attributes?.type;
      if (!sobjectName) return tSync('results.unknown', 'Unknown');

      // Check if we have cached metadata for this SObject
      if (sobjectMetadataCache.has(sobjectName)) {
        const metadata = sobjectMetadataCache.get(sobjectName);
        const field = metadata.fields?.find((f: any) => f.name === fieldName);
        return field?.type || tSync('results.unknown', 'Unknown');
      }

      // Fetch SObject metadata if not cached
      try {
        const { SalesforceService } = await import('../services/SalesforceService');
        const connectionUuid = getConnectionUuidFromSession();
        const metadata = await SalesforceService.getSObjectFields(sobjectName, connectionUuid);
        
        // Cache the metadata
        setSObjectMetadataCache(prev => new Map(prev).set(sobjectName, { fields: metadata }));
        
        // Find the field type
        const field = metadata.find((f: any) => f.name === fieldName);
        return field?.type || tSync('results.unknown', 'Unknown');
      } catch (error) {
        logger.warn(`Failed to fetch metadata for ${sobjectName}`, 'ResultsViewPage');
        return tSync('results.unknown', 'Unknown');
      }
    } catch (error) {
      return tSync('results.unknown', 'Unknown');
    }
  };

  // Synchronous version for tooltip (returns cached type or 'Unknown')
  const getFieldTypeSync = (fieldName: string, record: any): string => {
    const sobjectName = record?.attributes?.type;
    if (!sobjectName) return tSync('results.unknown', 'Unknown');

    const metadata = sobjectMetadataCache.get(sobjectName);
    if (metadata?.fields) {
      const field = metadata.fields.find((f: any) => f.name === fieldName);
      return field?.type || tSync('results.unknown', 'Unknown');
    }

    return tSync('results.unknown', 'Unknown');
  };

  // Column reordering handlers
  const handleColumnDragStart = useCallback((e: React.DragEvent, columnName: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', columnName);
    setDraggedColumn(columnName);
  }, []);

  const handleColumnDragOver = useCallback((e: React.DragEvent, columnName: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedColumn && draggedColumn !== columnName) {
      setDragOverColumn(columnName);
    }
  }, [draggedColumn]);

  const handleColumnDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOverColumn(null);
  }, []);

  const handleColumnDrop = useCallback((e: React.DragEvent, targetColumn: string) => {
    e.preventDefault();
    const draggedColumnName = e.dataTransfer.getData('text/plain');
    
    if (draggedColumnName && draggedColumnName !== targetColumn) {
      const newOrder = [...columnOrder];
      const draggedIndex = newOrder.indexOf(draggedColumnName);
      const targetIndex = newOrder.indexOf(targetColumn);
      
      if (draggedIndex !== -1 && targetIndex !== -1) {
        // Remove dragged column from its current position
        newOrder.splice(draggedIndex, 1);
        // Insert it at the target position
        newOrder.splice(targetIndex, 0, draggedColumnName);
        setColumnOrder(newOrder);
      }
    }
    
    setDraggedColumn(null);
    setDragOverColumn(null);
  }, [columnOrder]);

  const handleResizeStart = useCallback((e: React.MouseEvent, columnName: string) => {
    e.preventDefault();
    setIsResizing(true);
    setResizeColumn(columnName);
    setResizeStartX(e.clientX);
  }, []);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!isResizing || !resizeColumn) return;
    
    const deltaX = e.clientX - resizeStartX;
    setColumnWidths(prev => ({
      ...prev,
      [resizeColumn]: Math.max(50, (prev[resizeColumn] || 150) + deltaX)
    }));
    setResizeStartX(e.clientX);
  }, [isResizing, resizeColumn, resizeStartX]);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
    setResizeColumn(null);
  }, []);

  React.useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
      return () => {
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [isResizing, handleResizeMove, handleResizeEnd]);

  const getFieldValue = (record: any, field: string) => {
    // For tree format, get value from fields
    if (record.fields && record.fields[field] !== undefined) {
      const value = record.fields[field];
      if (value === null || value === undefined) {
        return '';
      }
      if (typeof value === 'object') {
        return JSON.stringify(value);
      }
      return String(value);
    }
    
    // Support flattened dot-paths for nested field access
    if (field.includes('.')) {
      const parts = field.split('.');
      let current = record.fields || record;
      
      // Navigate through the nested structure
      for (let i = 0; i < parts.length; i++) {
        if (current && typeof current === 'object' && !Array.isArray(current)) {
          current = current[parts[i]];
        } else {
          // If we can't navigate further, return empty string
          return ''; // Return empty string for missing nested fields
        }
      }
      
      if (current === null || current === undefined) {
        return ''; // Return empty string for null/undefined values
      }
      if (typeof current === 'object') {
        // Fallback to stringifying if still an object
        return JSON.stringify(current);
      }
      return String(current);
    }

    // Fallback for direct field access
    const value = record[field];
    if (value === null || value === undefined) {
      return ''; // Return empty string for null/undefined values
    }
    
    if (typeof value === 'object') {
      // Handle nested objects - try to get the most relevant field
      if (value.Name) return String(value.Name);
      if (value.Id) return String(value.Id);
      if (value.CaseNumber) return String(value.CaseNumber);
      if (value.Email) return String(value.Email);
      if (value.Phone) return String(value.Phone);
      if (value.Number) return String(value.Number);
      if (value.Code) return String(value.Code);
      if (value.Value) return String(value.Value);
      if (value.Label) return String(value.Label);
      if (value.Description) return String(value.Description);
      
      // If no common field found, show a summary
      const keys = Object.keys(value).filter(key => key !== 'attributes');
      if (keys.length > 0) {
        return keys.length === 1 ? String(value[keys[0]]) : `${keys.length} fields`;
      }
      
      return JSON.stringify(value);
    }
    return String(value);
  };


  const getCellStyle = (fieldName: string, value: string): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      padding: '4px 6px',
      fontSize: '12px',
      lineHeight: '1.2',
      overflow: 'visible', // Allow content to wrap
      textOverflow: 'initial', // Remove ellipsis
      whiteSpace: 'normal', // Allow text wrapping
      wordWrap: 'break-word', // Break long words
      wordBreak: 'break-word', // Break at any character if needed
      color: '#1a1a1a', // Darker, more readable text
    };

    // Dynamic styling based on field patterns and content
    if (fieldName.toLowerCase().includes('stage') && (value.includes(tSync('results.closedWon', 'Closed Won')) || value.includes(tSync('results.closedLost', 'Closed Lost')))) {
      return {
        ...baseStyle,
        backgroundColor: value.includes(tSync('results.closedWon', 'Closed Won')) ? '#f0fff0' : '#fff0f0',
        color: value.includes(tSync('results.closedWon', 'Closed Won')) ? '#006600' : '#cc0000',
        fontWeight: 600,
      };
    }

    if (fieldName.toLowerCase().includes('status') && (value.includes(tSync('results.open', 'Open')) || value.includes(tSync('results.closed', 'Closed')))) {
      return {
        ...baseStyle,
        backgroundColor: value.includes(tSync('results.open', 'Open')) ? '#fff8f0' : '#f0fff0',
        color: value.includes(tSync('results.open', 'Open')) ? '#cc6600' : '#006600',
        fontWeight: 600,
      };
    }

    if (fieldName.toLowerCase().includes('priority') && value.includes(tSync('results.high', 'High'))) {
      return {
        ...baseStyle,
        backgroundColor: '#fff0f0',
        color: '#cc0000',
        fontWeight: 600,
      };
    }

    if (fieldName.toLowerCase().includes('rating') && value.includes(tSync('results.hot', 'Hot'))) {
      return {
        ...baseStyle,
        backgroundColor: '#fff0f0',
        color: '#cc0000',
        fontWeight: 600,
      };
    }

    if (fieldName.toLowerCase().includes('amount') || fieldName.toLowerCase().includes('revenue')) {
      return {
        ...baseStyle,
        fontFamily: 'SF Mono, Monaco, Inconsolata, monospace',
        fontWeight: 600,
      };
    }

    if (fieldName.toLowerCase().includes('date')) {
      return {
        ...baseStyle,
        fontFamily: 'SF Mono, Monaco, Inconsolata, monospace',
        fontSize: '11px',
        color: '#2d3748',
      };
    }

    if (fieldName.toLowerCase().includes('id')) {
      return {
        ...baseStyle,
        fontFamily: 'SF Mono, Monaco, Inconsolata, monospace',
        fontSize: '10px',
        color: '#2d3748',
      };
    }

    if (fieldName.toLowerCase().includes('email')) {
      return {
        ...baseStyle,
        textDecoration: 'underline',
        color: '#0066cc',
      };
    }

    if (fieldName.toLowerCase().includes('website') || fieldName.toLowerCase().includes('url')) {
      return {
        ...baseStyle,
        textDecoration: 'underline',
        color: '#006600',
      };
    }

    if (fieldName.toLowerCase().includes('description')) {
      return {
        ...baseStyle,
        fontStyle: 'italic',
        fontSize: '11px',
        whiteSpace: 'normal',
        maxWidth: '300px',
        color: '#2d3748',
      };
    }

    // Default styling for all other fields - clean and simple
    return {
      ...baseStyle,
      color: '#1a1a1a', // Darker, more readable text
    };
  };

  // Define base columns for useDataTableColumns hook
  const baseColumns = useMemo(() => {
    logger.debug('🔍 Creating baseColumns for useDataTableColumns', 'ResultsViewPage', {
      orderedColumns,
      orderedColumnsLength: orderedColumns?.length || 0,
      orderedColumnsContent: orderedColumns
    });
    
    if (!orderedColumns || !Array.isArray(orderedColumns) || orderedColumns.length === 0) {
      return [];
    }
    
    const columnCount = orderedColumns.length;
    return orderedColumns.map((column, index) => {
      const columnWidth = computeOptimalColumnWidth(columnCount, column);
      const isIdCol = column.toLowerCase() === 'id' || column.toLowerCase().endsWith('id');
      const hardMin = isIdCol ? 300 : 250;
      
      return {
        accessor: column,
        title: (
          <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={column}>
            {column}
          </div>
        ),
        width: Math.max(hardMin, columnWidth),
        minWidth: Math.max(hardMin, columnWidth),
        ellipsis: true, // Enable ellipsis to prevent text wrapping in headers
        textAlign: 'left' as const,
        sortable: true,
        resizable: true,
        // Enable drag-and-drop reordering and toggling for most columns
        draggable: column.toLowerCase() !== 'id',
        toggleable: column.toLowerCase() !== 'id',
        render: (record: Record<string, unknown>) => {
        try {
          // Handle regular data rows
          const value = getFieldDisplayValue(record, column);
          // Ensure value is always a string for React rendering
          const stringValue = typeof value === 'string' ? value : String(value || '');
          const cellStyle = getCellStyle(column, stringValue);
          const recordId = getRecordId(record);
          
          // Add detail relationship indicators to the first column
          if (index === 0) {
            const detailFields = getRecordDetailFields(record);
            const hasDetails = detailFields.length > 0;
            
            
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={cellStyle}>{stringValue}</div>
                {hasDetails && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {detailFields.map((detailType, idx) => {
                      const detailRecord = getDetailRecords(record, detailType);
                      const recordCount = detailRecord?.records.length || 0;
                      
                      
                      // Get consistent color for this relationship type
                      const colorScheme = getRelationshipColor(detailType);
                      const color = colorScheme.color;
                      
                      return (
                        <Badge 
                          key={idx}
                          size="xs" 
                          variant="light" 
                          color={color}
                          title={`Click to expand ${detailType} details (${recordCount} records)`}
                          style={{ alignSelf: 'flex-start', cursor: 'pointer' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            const newExpandedDetailTypes = new Map(expandedDetailTypes);
                            const currentExpanded = new Set(expandedDetailTypes.get(String(recordId)) || []);
                            
                            if (currentExpanded.has(detailType)) {
                              currentExpanded.delete(detailType);
                            } else {
                              currentExpanded.add(detailType);
                              
                              // Get consistent color for this relationship type
                              getRelationshipColor(detailType);
                            }
                            
                            newExpandedDetailTypes.set(String(recordId), currentExpanded);
                            setExpandedDetailTypes(newExpandedDetailTypes);
                          }}
                        >
                          {detailType} ({recordCount})
                        </Badge>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }
          
          // Check if this field has detail data (for backward compatibility)
          if (hasDetailData(record, column)) {
            const isExpanded = isDetailFieldExpanded(String(recordId), column);
            return (
              <div style={cellStyle}>
                <Group gap="xs" style={{ cursor: 'pointer' }} onClick={() => toggleDetailField(String(recordId), column)}>
                  {isExpanded ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                  <span>{stringValue}</span>
                </Group>
              </div>
            );
          }
          
          // Check if this field is currently being edited inline
          const isCurrentlyEditing = inlineEditing && 
            inlineEditing.id === String(recordId) && 
            inlineEditing.field === column;
          
          if (isCurrentlyEditing) {
            return (
              <div style={cellStyle}>
                <TextInput
                  value={inlineEditValue}
                  onChange={(e) => setInlineEditValue(e.target.value)}
                  onKeyDown={handleInlineKeyDown}
                  onBlur={handleInlineSave}
                  autoFocus
                  size="xs"
                  styles={{
                    input: {
                      fontSize: '11px',
                      padding: '2px 4px',
                      minHeight: '20px',
                      height: '20px',
                    }
                  }}
                />
              </div>
            );
          }
          
          // Check if this field is editable
          const editable = isFieldEditable(column, record);
          
          if (editable) {
            return (
              <div 
                style={{
                  ...cellStyle,
                  cursor: 'default',
                  position: 'relative'
                }}
              >
                <span>{stringValue}</span>
              </div>
            );
          }
          
          return (
            <div style={cellStyle}>
              {stringValue}
            </div>
          );
        } catch (error) {
          logger.error('Error rendering field', 'ResultsViewPage', { column }, error as Error);
          return String(record?.[column] || '');
        }
      },
      };
    });
  }, [orderedColumns, props, hasDetailData, isDetailFieldExpanded, toggleDetailField, getFieldDisplayValue, getCellStyle, computeOptimalColumnWidth]);

  // Column resizing per Mantine DataTable v8: use the provided hook and a storage key
  const columnsKey = 'results-view-main';
  const { effectiveColumns, resetColumnsWidth } = useDataTableColumns<Record<string, unknown>>({
    key: columnsKey,
    columns: isMounted ? baseColumns : [],
  });

  // Compute total minimum width required by columns to avoid squeezing
  const totalMinWidthMainTable = useMemo(() => {
    try {
      if (!Array.isArray(effectiveColumns) || effectiveColumns.length === 0) return getOptimalTableWidth();
      const sum = (effectiveColumns || []).reduce((acc: number, col: any) => {
        const w = typeof col?.width === 'number' ? col.width : undefined;
        const mw = typeof col?.minWidth === 'number' ? col.minWidth : 150;
        return acc + (w || mw || 150);
      }, 0);
      // Ensure at least the container optimal width
      return Math.max(getOptimalTableWidth(), sum);
    } catch {
      return getOptimalTableWidth();
    }
  }, [effectiveColumns, getOptimalTableWidth]);

  // Handle resetting column widths to optimal defaults
  const handleResetColumnWidths = () => {
    try {
      resetColumnsWidth();
      notifications.show({
        title: tSync('results.columnWidthsReset', 'Column Widths Reset'),
        message: tSync('results.columnWidthsResetMessage', 'Column widths have been reset to optimal defaults'),
        color: 'green',
        autoClose: 3000,
      });
    } catch (error) {
      logger.error('Failed to reset column widths', 'ResultsViewPage', error);
      notifications.show({
        title: tSync('results.columnWidthsResetError', 'Reset Failed'),
        message: tSync('results.columnWidthsResetErrorMessage', 'Failed to reset column widths'),
        color: 'red',
        autoClose: 5000,
      });
    }
  };
  

  // Debug: Log the effective columns to see if resizing is properly configured
  // console.log('🔍 Effective columns for resizing:', effectiveColumns.map(col => ({
  //   accessor: col.accessor,
  //   resizable: col.resizable,
  //   width: col.width
  // })));
  


  // Extract column names for list/grid views
  const columnNames = (effectiveColumns || []).map(col => col.accessor as string);

  // Render detail records grid
  const renderDetailGrid = (detailRecord: DetailRecord, level: number = 1, parentRecordId?: string, parentField?: string) => {
    const detailColumns = getDetailColumns(detailRecord.records, detailRecord.parentField);
    
    // Create enhanced columns that support nested detail expansion
    if (!detailColumns || detailColumns.length === 0) {
      return <div>No columns available</div>;
    }
    
    const columnCount = detailColumns.length;
    const detailTableWidth = getOptimalTableWidth();
    const columnWidth = Math.max(200, detailTableWidth / columnCount); // Wider columns for detail tables
    
    const enhancedColumns = (detailColumns || []).map((column, index) => {
      const colWidth = getOptimalColumnWidth(detailColumns.length, column);
      const minWidth = column.toLowerCase() === 'id' ? 150 : 120;
      
      return {
        accessor: column,
        title: (
          <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={column}>
            {column}
          </div>
        ),
        width: colWidth,
        minWidth: minWidth,
        ellipsis: true,
        sortable: true,
        resizable: true, // Allow resizing for all columns
      render: (record: Record<string, unknown>) => {
        try {
          const value = getFieldValue(record, column);
          
          // Get ID - backend always provides Id as first field
          const recordIdStr = getRecordId(record);
          const recordId = recordIdStr; // For compatibility with existing code
          
          // Add detail relationship indicators to the first column
          if (index === 0) {
            const detailFields = getRecordDetailFields(record);
            const hasDetails = detailFields.length > 0;
            
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ textAlign: 'left', verticalAlign: 'top' }}>{String(value || '')}</div>
                {hasDetails && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {detailFields.map((detailType, idx) => {
                      const detailRecord = getDetailRecords(record, detailType);
                      const recordCount = detailRecord?.records.length || 0;
                      
                      // Get consistent color for this relationship type
                      const colorScheme = getRelationshipColor(detailType);
                      const color = colorScheme.color;
                      
                      return (
                        <Badge 
                          key={idx}
                          size="xs" 
                          variant="light" 
                          color={color}
                          title={`Click to expand ${detailType} details (${recordCount} records)`}
                          style={{ alignSelf: 'flex-start', cursor: 'pointer' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            
                            // Use the same expansion mechanism as master table
                            const currentExpanded = expandedDetailTypes.get(recordIdStr) || new Set();
                            const newExpanded = new Set(currentExpanded);
                            
                            if (newExpanded.has(detailType)) {
                              newExpanded.delete(detailType);
                            } else {
                              newExpanded.add(detailType);
                              
                              // Get consistent color for this relationship type
                              getRelationshipColor(detailType);
                            }
                            
                            setExpandedDetailTypes(prev => {
                              const updated = new Map(prev);
                              if (newExpanded.size === 0) {
                                updated.delete(recordIdStr);
                              } else {
                                updated.set(recordIdStr, newExpanded);
                              }
                              return updated;
                            });
                          }}
                        >
                          {detailType} ({recordCount})
                        </Badge>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }
          
          // Check if this field is currently being edited inline
          const isCurrentlyEditing = inlineEditing && 
            inlineEditing.id === String(recordId) && 
            inlineEditing.field === column;
          
          if (isCurrentlyEditing) {
            return (
              <TextInput
                value={inlineEditValue}
                onChange={(e) => setInlineEditValue(e.target.value)}
                onKeyDown={handleInlineKeyDown}
                onBlur={handleInlineSave}
                autoFocus
                size="xs"
                styles={{
                  input: {
                    fontSize: '11px',
                    padding: '2px 4px',
                    minHeight: '20px',
                    height: '20px',
                  }
                }}
              />
            );
          }
          
          // Check if this field is editable
          const editable = isFieldEditable(column, record);
          const stringValue = typeof value === 'string' ? value : String(value || '');
          
          if (editable) {
            return (
              <div 
                style={{
                  cursor: 'pointer',
                  position: 'relative'
                }}
                onDoubleClick={() => handleInlineEdit(String(recordId), column, value)}
                title={`Double-click to edit (${getFieldTypeSync(column, record)})`}
              >
                <span>{stringValue}</span>
                <div 
                  style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    width: '4px',
                    height: '100%',
                    backgroundColor: 'transparent',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#e3f2fd';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                />
              </div>
            );
          }
          
          // Field rendering
          
          // Check if this field has detail data (for nested details)
          if (hasDetailData(record, column)) {
            const isExpanded = parentRecordId && parentField 
              ? isNestedDetailFieldExpanded(parentRecordId, parentField, String(recordId), column)
              : false;
            
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Group gap="xs" style={{ cursor: 'pointer' }} onClick={() => {
                  if (parentRecordId && parentField) {
                    toggleNestedDetailField(parentRecordId, parentField, String(recordId), column);
                  }
                }}>
                  {isExpanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                  <span>{getFieldDisplayValue(record, column)}</span>
                </Group>
              </div>
            );
          }
          
          // Regular field rendering
          
          // Regular field rendering
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            const objValue = value as any;
            
            // Handle Salesforce relationship objects
            if (objValue.attributes || objValue.Id || objValue.Name) {
              // Try to find the most meaningful field to display
              const displayValue = objValue.Name || 
                                 objValue.Id || 
                                 objValue.DeveloperName || 
                                 objValue.Label ||
                                 objValue.Type ||
                                 tSync('results.object', 'Object');
              return String(displayValue);
            }
            
            // Handle other object types - try to extract meaningful data
            const keys = Object.keys(objValue);
            if (keys.length > 0) {
              // Look for common Salesforce field patterns
              const meaningfulFields = [tSync('results.name', 'Name'), tSync('results.id', 'Id'), tSync('results.developerName', 'DeveloperName'), tSync('results.label', 'Label'), tSync('results.type', 'Type'), tSync('results.value', 'Value'), tSync('results.text', 'Text')];
              for (const field of meaningfulFields) {
                if (objValue[field] !== undefined && objValue[field] !== null) {
                  return String(objValue[field]);
                }
              }
              
              // If no meaningful field found, show first non-null value
              for (const key of keys) {
                if (objValue[key] !== undefined && objValue[key] !== null && typeof objValue[key] !== 'object') {
                  return `${key}: ${String(objValue[key])}`;
                }
              }
            }
            
            return '[Object]';
          }
          return String(value || '');
        } catch (error) {
          logger.error('Error rendering detail field', 'ResultsViewPage', { column }, error as Error);
          return String(record?.[column] || '');
        }
      },
      };
    });
    
    return (
      <div className="results-view-page-detail-grid" style={{ marginLeft: `${level * 20}px` }}>
        <div className="results-view-page-detail-header">
          <Text size="sm" fw={500} c="dimmed">
            {detailRecord.sObjectType} ({detailRecord.records.length} records)
            {level > 1 && <span style={{ marginLeft: '8px', fontSize: '10px', opacity: 0.7 }}>Level {level}</span>}
          </Text>
        </div>
        <div className="results-view-page-detail-table-container">
            {Array.isArray(enhancedColumns) && enhancedColumns.length > 0 ? (
              <DataTable
            className="results-view-page-detail-datatable-compact results-view-page-datatable-with-spanning-rows"
            pinFirstColumn
            highlightOnHover
            records={detailRecord.records.flatMap((record, index) => {
              // Extract ID from multiple sources
              const finalId = getRecordId(record);
              
              const mainRecord = {
                ...record,
                id: finalId,
                key: finalId,
                _metadata: {
                  parentRecordId: detailRecord.parentId,
                  parentField: detailRecord.parentField,
                  isMainRecord: true
                }
              };
              
              const result = [mainRecord];
              
              // Add expand details summary row for this detail record
              result.push({
                id: `${finalId}_expand_summary`,
                _metadata: {
                  isExpandSummary: true,
                  parentRecordId: finalId,
                  parentRecord: record,
                  level: level
                }
              });
              
              // Add nested detail tables if any detail types are expanded
              const expandedTypes = nestedExpansions.get(`${parentRecordId}:${parentField}`)?.get(String(finalId)) || new Set();
              expandedTypes.forEach(detailType => {
                const nestedDetailRecord = getDetailRecords(record, detailType);
                if (nestedDetailRecord) {
                  result.push({
                    id: `${finalId}_detail_${detailType}`,
                    _metadata: {
                      isDetailTable: true,
                      parentRecordId: finalId,
                      detailType: detailType,
                      detailRecord: nestedDetailRecord,
                      level: level + 1
                    }
                  });
                }
              });
              
              return result;
            })}
            columns={(enhancedColumns || []).map((column, index) => ({
              ...column,
              render: (record: Record<string, unknown>) => {
                try {
                  const metadata = (record as any)._metadata;
                  
                  // Handle expand summary row for detail records
                  if (metadata?.isExpandSummary) {
                    if (column.accessor === enhancedColumns[0].accessor) { // Only render in first column
                      return (
                        <div style={{ 
                          position: 'relative',
                          margin: '-8px -12px',
                          padding: '8px 12px',
                          backgroundColor: '#f8f9fa',
                          borderTop: '1px solid #e9ecef',
                          width: 'calc(100vw - 150px)',
                          zIndex: 10
                        }}>
                          <DetailExpandSummary record={metadata.parentRecord} recordId={metadata.parentRecordId} level={metadata.level} parentRecordId={parentRecordId} parentField={parentField} />
                        </div>
                      );
                    }
                    return <div style={{ display: 'none' }} />; // Hidden cell for other columns
                  }
                  
                  // Handle nested detail table row
                  if (metadata?.isDetailTable) {
                    if (column.accessor === enhancedColumns[0].accessor) { // Only render in first column
                      const nestedDetailRecord = metadata.detailRecord;
                      const detailType = metadata.detailType;
                      const nestedParentRecordId = metadata.parentRecordId;
                      
                      // Get the color scheme for this detail type
                      const colorKey = `${nestedParentRecordId}_${detailType}_color`;
                      const storedColorScheme = localStorage.getItem(colorKey);
                      let backgroundColor = '#f8f9fa';
                      let borderColor = '#e9ecef';
                      
                      if (storedColorScheme) {
                        try {
                          const colorScheme = JSON.parse(storedColorScheme);
                          backgroundColor = colorScheme.bg;
                          borderColor = colorScheme.border;
                        } catch (e) {
                          // Fallback to default colors if parsing fails
                        }
                      }
                      
                      return (
                        <div style={{ 
                          position: 'relative',
                          margin: '-8px -12px',
                          padding: '12px',
                          backgroundColor: backgroundColor,
                          borderTop: `1px solid ${borderColor}`,
                          width: 'calc(100% - 100px)',
                          zIndex: 10
                        }}>
                          {renderDetailGrid(nestedDetailRecord, metadata.level, nestedParentRecordId, detailType)}
                        </div>
                      );
                    }
                    return <div style={{ display: 'none' }} />; // Hidden cell for other columns
                  }
                  
                  // Handle regular data rows
                  return column.render(record);
                } catch (error) {
                  logger.error('Error rendering detail column', 'ResultsViewPage', { column: column.accessor }, error as Error);
                  return String(record?.[column.accessor] || '');
                }
              }
            }))}
            striped
            noRecordsText={tSync('resultsViewPage.noDetailRecords', 'No detail records found')}
            minHeight={100}
            styles={{
              table: {
                fontSize: '11px',
                minWidth: '100%',
                width: '100%',
                tableLayout: 'auto',
              },
              header: {
                fontSize: '10px',
                fontWeight: 600,
              },
              pagination: {
                fontSize: '10px',
              },
            }}
            style={{
              width: '2000px', // Force wide table to trigger horizontal scroll
              tableLayout: 'fixed'
            }}
            />
            ) : (
              <div style={{ padding: '8px', color: '#666' }}>No columns available</div>
            )}
        </div>
        
        {/* Render nested details if level < 4 */}
        {level < 4 && detailRecord.records.map((record, index) => {
          const recordId = getRecordId(record);
          if (!parentRecordId || !parentField) return null;
          
          const recordExpansions = nestedExpansions.get(`${parentRecordId}:${parentField}`)?.get(String(recordId));
          if (!recordExpansions || recordExpansions.size === 0) return null;
          
          return Array.from(recordExpansions).map((fieldName) => {
            const nestedDetailRecord = getDetailRecords(record, fieldName);
            if (!nestedDetailRecord) return null;
            
            return (
              <div key={`nested-${recordId}-${fieldName}`} style={{ marginTop: '16px' }}>
                {renderDetailGrid(nestedDetailRecord, level + 1, String(recordId), fieldName)}
              </div>
            );
          });
        })}
      </div>
    );
  };

  return (
    <div ref={mainPanelRef} style={{ maxWidth: '100%', height: '100%', minHeight: '400px' }}>
            {(() => {
              // Debug the render condition
              logger.debug('🔍 Render condition check', 'ResultsViewPage', {
                hasPaginatedRecords: !!paginatedRecords,
                paginatedRecordsLength: paginatedRecords?.length || 0,
                hasEffectiveColumns: !!effectiveColumns,
                effectiveColumnsLength: effectiveColumns?.length || 0,
                condition: !!(paginatedRecords && paginatedRecords.length > 0 && effectiveColumns && effectiveColumns.length > 0),
                records: records?.length || 0,
                columnOrder: columnOrder?.length || 0,
                orderedColumns: orderedColumns?.length || 0
              });
              return null;
            })()}
            
            {isLoading && (
              <div 
                id="loading-indicator"
                style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  background: '#4dabf7',
                  color: 'white',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  zIndex: 10
                }}>
                {tSync('results.loading', 'Loading...')}
              </div>
            )}
            {(Array.isArray(paginatedRecords) && paginatedRecords.length > 0 && Array.isArray(effectiveColumns) && effectiveColumns.length > 0) && !isAnyDetailOpen ? (
              (() => {
                    try {
                      logger.debug('🔍 About to render DataTable', 'ResultsViewPage', {
                        recordsCount: paginatedRecords.length,
                        totalRecords: records.length,
                        page: page,
                        pageSize: pageSize,
                        columnsCount: effectiveColumns.length,
                        columns: effectiveColumns,
                        firstRecord: paginatedRecords[0]
                      });
                      
                      return (
                        <DataTable withTableBorder={false}
                      key={`datatable-${queryExecutionKey}`}
                      className="results-view-page-datatable-compact"
                      horizontalSpacing="xs"
                      verticalSpacing="xs"
                      pinFirstColumn
                      shadow="sm"
                      fz="sm"
                      borderRadius="md"
                      verticalAlign="top"
                      highlightOnHover
                          storeColumnsKey={columnsKey}
                      records={paginatedRecords || []}
                      columns={effectiveColumns || []}
                                        idAccessor={(record) => getRecordId(record)}
                          sortStatus={sortStatus || undefined}
                          onSortStatusChange={setSortStatus as any}
                          height={availableHeight}
                          scrollAreaProps={{ type: 'auto', offsetScrollbars: true, scrollbarSize: 10 }}
                      style={{
                        border: isLoading ? '2px solid #4dabf7' : '2px solid #e2e8f0',
                        backgroundColor: isLoading ? '#f8f9ff' : 'white',
                        borderRadius: '12px',
                        padding: '16px',
                        boxShadow: isLoading ? '0 4px 16px rgba(77, 171, 247, 0.2)' : '0 4px 16px rgba(0, 0, 0, 0.1)',
                                position: 'relative'
                      }}

                      rowExpansion={{
                        allowMultiple: true,
                        expandable: (record) => {
                          const detailFields = getRecordDetailFields(record);
                          return detailFields.length > 0;
                        },
                        expanded: {
                          recordIds: Array.from(expandedDetailTypes.keys()).filter(recordId => {
                            const expandedTypes = expandedDetailTypes.get(recordId);
                            return expandedTypes && expandedTypes.size > 0;
                          }),
                          onRecordIdsChange: (newRecordIds) => {
                            // Clear all expanded types
                            const newExpandedDetailTypes = new Map();
                            
                            // Set expanded types for the new record IDs
                            newRecordIds.forEach(recordId => {
                              const currentExpanded = expandedDetailTypes.get(recordId);
                              if (currentExpanded && currentExpanded.size > 0) {
                                newExpandedDetailTypes.set(recordId, currentExpanded);
                              }
                            });
                            
                            setExpandedDetailTypes(newExpandedDetailTypes);
                          }
                        },
                        content: ({ record }) => {
                          // Get ID - backend always provides Id as first field
                          const recordIdStr = getRecordId(record);
                          const expandedTypes = expandedDetailTypes.get(recordIdStr) || new Set();
                          
                          
                          if (expandedTypes.size === 0) {
                            return (
                              <div 
                                id="no-details-message"
                                style={{ padding: '16px', textAlign: 'center', color: '#666' }}
                              >
                                {tSync('results.rightClickForDetails', 'Right-click on this row to see available detail options')}
                              </div>
                            );
                          }
                          
                          return (
                            <div 
                              id={`expandable-content-${recordIdStr}`}
                              className="results-view-page-expandable-content" 
                              style={{ 
                                padding: '16px',
                                overflowX: 'auto',
                                overflowY: 'visible'
                              }}
                            >
                              {Array.from(expandedTypes).map(detailType => {
                                const detailRecord = getDetailRecords(record, detailType);
                                if (!detailRecord) {
                                  return null;
                                }
                                
                                // Get the color scheme for this detail type
                                const colorScheme = getRelationshipColor(detailType);
                                const backgroundColor = colorScheme.bg;
                                const borderColor = colorScheme.border;
                                
                                return (
                                  <div 
                                    id={`detail-section-${recordIdStr}-${detailType}`}
                                    key={detailType} 
                                    style={{ 
                                      marginBottom: '16px',
                                      backgroundColor: backgroundColor,
                                      border: `1px solid ${borderColor}`,
                                      borderRadius: '8px',
                                      padding: '12px'
                                    }}
                                  >
                                    <div 
                                      id={`detail-header-${recordIdStr}-${detailType}`}
                                      style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', gap: '8px' }}
                                    >
                                      <button
                                        onClick={() => {
                                          const newExpandedDetailTypes = new Map(expandedDetailTypes);
                                          const currentExpanded = new Set(expandedDetailTypes.get(String(recordIdStr)) || []);
                                          currentExpanded.delete(detailType);
                                          newExpandedDetailTypes.set(String(recordIdStr), currentExpanded);
                                          setExpandedDetailTypes(newExpandedDetailTypes);
                                        }}
                                        style={{
                                          background: 'none',
                                          border: 'none',
                                          color: colorScheme?.border || '#495057',
                                          cursor: 'pointer',
                                          padding: '4px',
                                          borderRadius: '4px',
                                          fontSize: '14px',
                                          fontWeight: 'bold',
                                          flexShrink: 0
                                        }}
                                        title={tSync('results.closeDetailTable', 'Close this detail table')}
                                      >
                                        ✕
                                      </button>
                                      
                                      
                                      <Text size="sm" fw={600} c={colorScheme?.border || '#495057'}>
                                        {detailType} ({detailRecord.records.length} records)
                                      </Text>
                                    </div>
                                    <div 
                                      id={`detail-table-container-${recordIdStr}-${detailType}`}
                                      className="results-view-page-detail-table-container"
                                      style={{
                                        overflowX: 'auto',
                                        overflowY: 'visible',
                                        width: `${getOptimalTableWidth() * 0.95}px`, // 95% of main panel width
                                        maxWidth: `${getOptimalTableWidth() * 0.95}px`
                                      }}
                                    >
                                      <DataTable
                                        className="results-view-page-detail-datatable-compact"
                                        pinFirstColumn
                                        highlightOnHover
                                        records={detailRecord.records}
                                        columns={getDetailColumnsForTable(detailRecord) || []}
                                        idAccessor={(record) => getRecordId(record)}
                                        minHeight={100}
                                        verticalAlign="top"
                                        shadow="sm"
                                        fz="sm"
                                        borderRadius="md"
                                        withTableBorder={false}
                                        style={{ 
                                          width: `${getOptimalTableWidth() * 3}px`, // Force wide table to trigger horizontal scroll
                                          tableLayout: 'auto'
                                        }}
                                        rowExpansion={{
                                          allowMultiple: true,
                                          expandable: (record) => {
                                            // Get ID - backend always provides Id as first field
                                            const recordId = getRecordId(record);
                                            
                                            // Skip records without a proper ID (likely summary/metadata rows)
                                            if (!recordId) {
                                              return false;
                                            }
                                            
                                            const detailFields = getRecordDetailFields(record);
                                            const hasDetails = detailFields.length > 0;
                                            return hasDetails;
                                          },
                                          expanded: {
                                            recordIds: Array.from(expandedDetailTypes.keys()).filter(recordId => {
                                              const expandedTypes = expandedDetailTypes.get(recordId);
                                              return expandedTypes && expandedTypes.size > 0;
                                            }),
                                            onRecordIdsChange: (newRecordIds) => {
                                              // Clear all expanded types
                                              const newExpandedDetailTypes = new Map();
                                              
                                              // Set expanded types for the new record IDs
                                              newRecordIds.forEach(recordId => {
                                                const currentExpanded = expandedDetailTypes.get(recordId);
                                                if (currentExpanded && currentExpanded.size > 0) {
                                                  newExpandedDetailTypes.set(recordId, currentExpanded);
                                                }
                                              });
                                              
                                              setExpandedDetailTypes(newExpandedDetailTypes);
                                            }
                                          },
                                          content: ({ record }) => {
                                            // Get ID - backend always provides Id as first field
                                            const recordId = getRecordId(record);
                                            const recordIdStr = String(recordId || '');
                                            const expandedTypes = expandedDetailTypes.get(recordIdStr) || new Set();
                                            
                                            
                                            if (expandedTypes.size === 0) {
                                              return (
                                                <div 
                                                  id="no-details-message"
                                                  style={{ 
                                                    padding: '16px', 
                                                    textAlign: 'center', 
                                                    color: '#666',
                                                    fontStyle: 'italic'
                                                  }}
                                                >
                                                  {tSync('results.noDetailRelationships', 'No detail relationships expanded')}
                                                </div>
                                              );
                                            }
                                            
                                            return (
                                              <div 
                                                id={`expandable-content-${recordIdStr}`}
                                                className="results-view-page-expandable-content" 
                                                style={{ 
                                                  padding: '16px',
                                                  overflowX: 'auto',
                                                  overflowY: 'visible'
                                                }}
                                              >
                                                {Array.from(expandedTypes).map(detailType => {
                                                  const nestedDetailRecord = getDetailRecords(record, detailType);
                                                  if (!nestedDetailRecord) return null;
                                                  
                                                  // Get the color scheme for this detail type
                                                  const colorScheme = getRelationshipColor(detailType);
                                                  
                                                  return (
                                                    <div key={`${recordIdStr}-${detailType}`} style={{ marginBottom: '16px' }}>
                                                      <div 
                                                        id={`detail-header-${recordIdStr}-${detailType}`}
                                                        style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', gap: '8px' }}
                                                      >
                                                        <button
                                                          onClick={() => {
                                                            const newExpandedDetailTypes = new Map(expandedDetailTypes);
                                                            const currentExpanded = new Set(expandedDetailTypes.get(recordIdStr) || []);
                                                            currentExpanded.delete(detailType);
                                                            newExpandedDetailTypes.set(recordIdStr, currentExpanded);
                                                            setExpandedDetailTypes(newExpandedDetailTypes);
                                                          }}
                                                          style={{
                                                            background: 'none',
                                                            border: 'none',
                                                            color: colorScheme?.border || '#495057',
                                                            cursor: 'pointer',
                                                            fontSize: '16px',
                                                            fontWeight: 'bold',
                                                            padding: '4px 8px',
                                                            borderRadius: '4px',
                                                            transition: 'background-color 0.2s'
                                                          }}
                                                          title={tSync('results.closeDetailTable', 'Close this detail table')}
                                                        >
                                                          ✕
                                                        </button>
                                                        
                                                        
                                                        <Text size="sm" fw={600} c={colorScheme?.border || '#495057'}>
                                                          {detailType} ({nestedDetailRecord.records.length} records)
                                                        </Text>
                                                      </div>
                                                      <div 
                                                        id={`detail-table-container-${recordIdStr}-${detailType}`}
                                                        className="results-view-page-detail-table-container"
                                                        style={{
                                                          backgroundColor: colorScheme?.bg || '#f8f9fa',
                                                          border: `1px solid ${colorScheme?.border || '#e9ecef'}`,
                                                          borderRadius: '8px',
                                                          padding: '12px',
                                                          marginBottom: '8px',
                                                          overflowX: 'auto',
                                                          overflowY: 'visible',
                                                          width: `${getOptimalTableWidth() * 0.95}px`, // 95% of main panel width
                                                          maxWidth: `${getOptimalTableWidth() * 0.95}px`
                                                        }}
                                                      >
                                                        <DataTable
                                                          className="results-view-page-detail-datatable-compact"
                                                          pinFirstColumn
                                                          highlightOnHover
                                                          records={nestedDetailRecord.records}
                                                          columns={getDetailColumnsForTable(nestedDetailRecord) || []}
                                                          idAccessor={(record) => {
                                                                  // Get ID - backend always provides Id as first field
                                                                  const recordId = getRecordId(record);
                                                            return String(recordId || '');
                                                          }}
                                                          minHeight={100}
                                                          verticalAlign="top"
                                                          shadow="sm"
                                                          fz="sm"
                                                          borderRadius="md"
                                                          withTableBorder={false}
                                                          style={{ 
                                                            width: `${getOptimalTableWidth() * 3}px`, // Force wide table to trigger horizontal scroll
                                                            tableLayout: 'auto'
                                                          }}
                                                          rowExpansion={{
                                                            allowMultiple: true,
                                                            expandable: (record) => {
                                                              // Get ID - backend always provides Id as first field
                                                              const recordIdStr = getRecordId(record);
                                                              const detailFields = getRecordDetailFields(record);
                                                              const hasDetails = detailFields.length > 0;
                                                              return hasDetails;
                                                            },
                                                            expanded: {
                                                              recordIds: Array.from(expandedDetailTypes.keys()).filter(recordId => {
                                                                const expandedTypes = expandedDetailTypes.get(recordId);
                                                                return expandedTypes && expandedTypes.size > 0;
                                                              }),
                                                              onRecordIdsChange: (newRecordIds) => {
                                                                // Clear all expanded types
                                                                const newExpandedDetailTypes = new Map();
                                                                
                                                                // Set expanded types for the new record IDs
                                                                newRecordIds.forEach(recordId => {
                                                                  const currentExpanded = expandedDetailTypes.get(recordId);
                                                                  if (currentExpanded && currentExpanded.size > 0) {
                                                                    newExpandedDetailTypes.set(recordId, currentExpanded);
                                                                  }
                                                                });
                                                                
                                                                setExpandedDetailTypes(newExpandedDetailTypes);
                                                              }
                                                            },
                                                            content: ({ record }) => {
                                                              // Get ID - backend always provides Id as first field
                                                              const recordId = getRecordId(record);
                                                              const recordIdStr = String(recordId || '');
                                                              const expandedTypes = expandedDetailTypes.get(recordIdStr) || new Set();
                                                              
                                                              if (expandedTypes.size === 0) {
                                                                return (
                                                                  <div 
                                                                    id="no-details-message"
                                                                    style={{ 
                                                                      padding: '16px', 
                                                                      textAlign: 'center', 
                                                                      color: '#666',
                                                                      fontStyle: 'italic'
                                                                    }}
                                                                  >
                                                                    {tSync('results.noDetailRelationships', 'No detail relationships expanded')}
                                                                  </div>
                                                                );
                                                              }
                                                              
                                                              return (
                                                                <div 
                                                                  id={`expandable-content-${recordIdStr}`}
                                                                  className="results-view-page-expandable-content" 
                                                                  style={{ 
                                                                    padding: '16px',
                                                                    overflowX: 'auto',
                                                                    overflowY: 'visible'
                                                                  }}
                                                                >
                                                                  {Array.from(expandedTypes).map(detailType => {
                                                                    const nestedDetailRecord = getDetailRecords(record, detailType);
                                                                    if (!nestedDetailRecord) return null;
                                                                    
                                                                    // Get the color scheme for this detail type
                                                                    const colorScheme = getRelationshipColor(detailType);
                                                                    const backgroundColor = colorScheme.bg;
                                                                    const borderColor = colorScheme.border;
                                                                    
                                                                    return (
                                                                      <div 
                                                                        id={`detail-section-${recordIdStr}-${detailType}`}
                                                                        key={detailType} 
                                                                        style={{ 
                                                                          marginBottom: '16px',
                                                                          backgroundColor: backgroundColor,
                                                                          border: `1px solid ${borderColor}`,
                                                                          borderRadius: '8px',
                                                                          padding: '12px'
                                                                        }}
                                                                      >
                                                                        <div style={{ 
                                                                          display: 'flex', 
                                                                          justifyContent: 'space-between', 
                                                                          alignItems: 'center',
                                                                          marginBottom: '12px'
                                                                        }}>
                                                                          <button
                                                                            onClick={() => {
                                                                              const currentExpanded = expandedDetailTypes.get(recordIdStr) || new Set();
                                                                              const newExpanded = new Set(currentExpanded);
                                                                              newExpanded.delete(detailType);
                                                                              
                                                                              setExpandedDetailTypes(prev => {
                                                                                const updated = new Map(prev);
                                                                                if (newExpanded.size === 0) {
                                                                                  updated.delete(recordIdStr);
                                                                                } else {
                                                                                  updated.set(recordIdStr, newExpanded);
                                                                                }
                                                                                return updated;
                                                                              });
                                                                            }}
                                                                            style={{
                                                                              background: 'none',
                                                                              border: 'none',
                                                                              cursor: 'pointer',
                                                                              fontSize: '16px',
                                                                              color: '#666',
                                                                              padding: '4px'
                                                                            }}
                                                                          >
                                                                            ✕
                                                                          </button>
                                                                          
                                                                          <Text size="sm" fw={600} c={colorScheme?.border || '#495057'}>
                                                                            {detailType} ({nestedDetailRecord.records.length} records)
                                                                          </Text>
                                                                        </div>
                                                                        <div 
                                                                          id={`detail-table-container-${recordIdStr}-${detailType}`}
                                                                          className="results-view-page-detail-table-container"
                                                                          style={{
                                                                            backgroundColor: colorScheme?.bg || '#f8f9fa',
                                                                            border: `1px solid ${colorScheme?.border || '#e9ecef'}`,
                                                                            borderRadius: '8px',
                                                                            padding: '12px',
                                                                            marginBottom: '8px',
                                                                            overflowX: 'auto',
                                                                            overflowY: 'visible',
                                                                            width: `${getOptimalTableWidth() * 0.95}px`, // 95% of main panel width
                                                                            maxWidth: `${getOptimalTableWidth() * 0.95}px`
                                                                          }}
                                                                        >
                                                                          <DataTable
                                                                            className="results-view-page-detail-datatable-compact"
                                                                            pinFirstColumn
                                                                            highlightOnHover
                                                                            records={nestedDetailRecord.records}
                                                                            columns={getDetailColumnsForTable(nestedDetailRecord) || []}
                                                                            idAccessor={(record) => {
                                                                  // Get ID - backend always provides Id as first field
                                                                  const recordId = getRecordId(record);
                                                                              return String(recordId || '');
                                                                            }}
                                                                            minHeight={100}
                                                                            verticalAlign="top"
                                                                            shadow="sm"
                                                                            fz="sm"
                                                                            borderRadius="md"
                                                                            withTableBorder={false}
                                                                            style={{ 
                                                                              width: `${getOptimalTableWidth() * 3}px`, // Force wide table to trigger horizontal scroll
                                                                              tableLayout: 'auto'
                                                                            }}
                                                                          />
                                                                        </div>
                                                                      </div>
                                                                    );
                                                                  })}
                                                                </div>
                                                              );
                                                            }
                                                          }}
                                                        />
                                                      </div>
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            );
                                          }
                                        }}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        }
                      }}

                      striped
                      fetching={isLoading}
                      noRecordsText={tSync('resultsViewPage.noRecords', 'No records found')}
                      page={page}
                      onPageChange={setPage}
                      totalRecords={records.length}
                      recordsPerPage={pageSize}
                      recordsPerPageOptions={pageSizeOptions}
                      onRecordsPerPageChange={handlePageSizeChange}
                      recordsPerPageLabel={tSync('resultsViewPage.pagination.recordsPerPage', 'Records per page')}
                      paginationText={({ from, to, totalRecords }) => 
                        tSync('resultsViewPage.pagination.text', { from, to, totalRecords }) || `${from} - ${to} of ${totalRecords} records`
                      }
                      paginationSize="sm"
                      paginationActiveBackgroundColor="blue"
                      paginationActiveTextColor="white"
                      getPaginationControlProps={(control) => {
                        if (control === 'previous') {
                          const title = tSync('results.goToPreviousPage', 'Go to previous page');
                          return { title, 'aria-label': title };
                        } else if (control === 'next') {
                          const title = tSync('results.goToNextPage', 'Go to next page');
                          return { title, 'aria-label': title };
                        }
                        return {};
                      }}
                      styles={{
                        root: {
                          fontSize: '12px',
                          overflow: 'visible',
                          width: '100%',
                          height: '100%',
                        },
                        table: {
                          fontSize: '12px',
                          minWidth: `${totalMinWidthMainTable}px`,
                          width: '100%',
                          tableLayout: 'auto',
                        },
                        header: {
                          fontSize: '11px',
                          fontWeight: 600,
                        },
                        pagination: {
                          fontSize: '11px',
                        },
                      }}
                    />
                      );
                    } catch (error) {
                      logger.error(' Error rendering DataTable', 'ResultsViewPage', error as Error);
                      return (
                        <div 
                          id="datatable-error"
                          style={{ padding: '40px', textAlign: 'center', color: '#ff0000' }}
                        >
                          Error rendering table: {String(error)}
                        </div>
                      );
                    }
                  })()
            ) : (
              (() => {
                // Debug why table is not rendering
                logger.debug('🔍 Table not rendering - showing fallback', 'ResultsViewPage', {
                  hasRecords: !!records,
                  recordsLength: records?.length || 0,
                  hasPaginatedRecords: !!paginatedRecords,
                  paginatedRecordsLength: paginatedRecords?.length || 0,
                  hasEffectiveColumns: !!effectiveColumns,
                  effectiveColumnsLength: effectiveColumns?.length || 0,
                  message: !records || records.length === 0 ? 'noRecordsAvailable' : 'loadingColumns'
                });
                return (
                  <div 
                    id="no-records-fallback"
                    style={{ padding: '40px', textAlign: 'center', color: '#666' }}
                  >
                    {!records || records.length === 0 ? tSync('resultsViewPage.noRecordsAvailable') : tSync('resultsViewPage.loadingColumns')}
                  </div>
                );
              })()
            )}
            
            {/* Back to Master button - only show when details are expanded */}
            {isAnyDetailOpen && (
              <div 
                id="back-to-master-section"
                style={{ 
                  marginBottom: '16px', 
                  padding: '12px', 
                  backgroundColor: '#f8f9fa', 
                  borderRadius: '8px',
                  border: '1px solid #e9ecef'
                }}
              >
                <Group gap="sm">
                  <Button
                    variant="light"
                    size="sm"
                    leftSection={<IconChevronRight size={16} style={{ transform: 'rotate(180deg)' }} />}
                    onClick={() => {
                      // Collapse all expanded detail fields and nested expansions
                      setExpandedDetailFields(new Map());
                      setNestedExpansions(new Map());
                    }}
                  >
                    {tSync('results.backToMasterTable', 'Back to Master Table')}
                  </Button>
                  <Button
                    variant="light"
                    size="sm"
                    leftSection={<IconColumns size={16} />}
                    onClick={handleResetColumnWidths}
                    title={tSync('results.resetColumnWidthsTooltip', 'Reset column widths to optimal defaults')}
                  >
                    {tSync('results.resetColumns', 'Reset Columns')}
                  </Button>
                  <Text size="sm" c="dimmed">
                    {tSync('results.detailFieldsExpanded', '{count} detail field{plural} expanded', { 
                      count: expandedDetailFields.size, 
                      plural: expandedDetailFields.size > 1 ? 's' : '' 
                    })}
                  </Text>
                </Group>
              </div>
            )}

            {/* Render detail records for expanded fields */}
            {(records || []).map((record) => {
              if (!record) return null;
              
              const recordId = getRecordId(record);
              const recordExpandedFields = expandedDetailFields.get(recordId);
              
              if (!recordExpandedFields || recordExpandedFields.size === 0) {
                return null;
              }
              
              return (
                <div key={`detail-${recordId}`} className="results-view-page-detail-section">
                  {Array.from(recordExpandedFields).map((fieldName) => {
                    const detailRecord = getDetailRecords(record, fieldName);
                    if (!detailRecord) return null;
                    
                    return (
                      <div key={`${recordId}-${fieldName}`} className="results-view-page-detail-container">
                        {renderDetailGrid(detailRecord, 2, String(recordId), fieldName)}
                      </div>
                    );
                  })}
                </div>
              );
            }).filter(Boolean)}

      {/* Edit Modal */}
      <Modal
        opened={!!editingRecord}
        onClose={handleCancelEdit}
        title={tSync('resultsViewPage.edit.title', 'Edit Record')}
        size="md"
      >
        <div className="results-view-page-edit-modal-compact">
          <TextInput
            label={tSync('resultsViewPage.edit.field', 'Field')}
            value={editingRecord?.field || ''}
            disabled
            mb="md"
          />
          <Textarea
            label={tSync('resultsViewPage.edit.value', 'Value')}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            minRows={3}
            mb="md"
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={handleCancelEdit}>
              {tSync('common.cancel', 'Cancel')}
            </Button>
            <Button onClick={handleSaveEdit}>
              {tSync('common.save', 'Save')}
            </Button>
          </Group>
        </div>
      </Modal>
    </div>
  );
};
