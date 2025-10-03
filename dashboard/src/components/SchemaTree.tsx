import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Tree,
  useTree,
  TreeNodeData,
  RenderTreeNodePayload,
  getTreeExpandedState,
  Group,
  Text,
  Badge,
  ActionIcon,
  TextInput,
  Button,
  Box,
  Stack,
  Paper,
  ScrollArea,
  Tooltip
} from '@mantine/core';
import '../assets/css/components/SchemaTree.css';
import {
  IconDatabase,
  IconFolder,
  IconFolderOpen,
  IconFile,
  IconSearch,
  IconX,
  IconLink,
  IconList,
  IconCheck,
  IconCode,
  IconInfoCircle,
  IconLoader2,
  IconRefreshDot,
  IconRotate,
  IconCloudDown,
  IconHeart,
  IconHeartOff
} from '@tabler/icons-react';

import { SalesforceService, SObjectTreeItem, SObjectField } from '../services/SalesforceService';
import { SObjectCacheService } from '../services/SObjectCacheService';
import { FavoritesService, SObjectFavorite } from '../services/FavoritesService';
import { ApiService } from '../services/ApiService';
import { logger } from '../services/Logger';
import { useTranslation } from '../services/I18nService';
import { useSessionContext } from '../contexts/SessionContext';
import { useCurrentConnection } from '../hooks/useCurrentConnection';

interface SchemaTreeProps {
  isConnected: boolean;
  onSObjectCountChange?: (count: number) => void;
  onFieldClick?: (fieldName: string, sobjectName: string) => void;
  onFieldDataUpdate?: (fieldData: { [sobjectName: string]: string[] }) => void;
  reloadTrigger?: number;
}

interface TreeNode {
  id: string;
  name: string;
  label: string;
  type: 'sobject' | 'field';
  custom: boolean;
  queryable?: boolean;
  required?: boolean;
  fieldType?: string;
  children?: TreeNode[];
  expanded?: boolean;
  picklistValues?: Array<{ value: string; label: string; active: boolean; defaultValue: boolean }>;
  referenceTo?: string[];
}



export const SchemaTree: React.FC<SchemaTreeProps> = ({ isConnected, onSObjectCountChange, onFieldClick, onFieldDataUpdate, reloadTrigger }) => {
  const { tSync } = useTranslation();
  const { getMasterKey } = useSessionContext();
  const currentConnectionUuid = useCurrentConnection();
  
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'standard' | 'custom' | 'favorites'>('all');
  const [isReloading, setIsReloading] = useState(false); // Flag to prevent multiple reloads
  const fieldDataSentRef = useRef<number>(0); // Track if we've already sent field data for current tree
  const lastReloadTriggerRef = useRef<number>(0); // Track the last reload trigger value to prevent duplicates

  const [expandingNodes, setExpandingNodes] = useState<Set<string>>(new Set());
  const [highlightedNode, setHighlightedNode] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<Set<string>>(new Set());
  const [cacheStats, setCacheStats] = useState<{ size: number; maxSize: number }>({ size: 0, maxSize: 100 });
  const [favorites, setFavorites] = useState<SObjectFavorite[]>([]);
  const [favoritesService] = useState(() => new FavoritesService(ApiService.getInstance()));
  const [isTogglingFavorite, setIsTogglingFavorite] = useState(false);

  // Utility function to format long SObject names with smart wrapping
  const formatSObjectName = (name: string): string => {
    if (name.length <= 30) return name;
    
    // For custom objects, try to break at logical points
    if (name.includes('__')) {
      // Custom objects often have patterns like: MyVeryLongCustomObject__c
      // Try to break at underscores or camelCase boundaries
      return name.replace(/([a-z])([A-Z])/g, '$1\u00A0$2') // Add non-breaking space at camelCase
                 .replace(/(__)/g, '\u00A0$1\u00A0'); // Add spaces around double underscores
    }
    
    // For standard objects, try to break at camelCase boundaries
    return name.replace(/([a-z])([A-Z])/g, '$1\u00A0$2');
  };


  // Load favorites for current connection
  const loadFavorites = useCallback(async () => {
    try {
      if (currentConnectionUuid) {
        const favoritesData = await favoritesService.getFavorites(currentConnectionUuid);
        setFavorites(favoritesData);
      } else {
        logger.warn('No currentConnectionUuid found in session context', 'SchemaTree');
      }
    } catch (error) {
      logger.error('Failed to load favorites', 'SchemaTree', error as Error);
    }
  }, [currentConnectionUuid]);

  // Add/remove from favorites - async UI update
  const toggleFavorite = (sobjectName: string, sobjectLabel?: string, isCustom?: boolean) => {
    // Prevent multiple simultaneous toggles
    if (isTogglingFavorite) {
      logger.debug('Favorite toggle already in progress, ignoring request', 'SchemaTree');
      return;
    }
    
    if (!currentConnectionUuid) {
      logger.warn('No current connection UUID found', 'SchemaTree');
      return;
    }

    const isFavorite = favorites.some(fav => fav.sobject_name === sobjectName);
    
    // Update UI immediately for instant feedback
    if (isFavorite) {
      // Remove from favorites - update UI immediately
      setFavorites(prev => prev.filter(fav => fav.sobject_name !== sobjectName));
    } else {
      // Add to favorites - create optimistic update
      const optimisticFavorite = {
        id: `temp-${Date.now()}`, // Temporary ID
        connection_uuid: currentConnectionUuid,
        sobject_name: sobjectName,
        sobject_label: sobjectLabel || sobjectName,
        is_custom: isCustom || false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      setFavorites(prev => [...prev, optimisticFavorite]);
    }
    
    // Handle API call asynchronously in background
    setIsTogglingFavorite(true);
    
    const performToggle = async () => {
      try {
        if (isFavorite) {
          // Remove from favorites
          const favorite = favorites.find(fav => fav.sobject_name === sobjectName);
          if (favorite) {
            await favoritesService.deleteFavorite(currentConnectionUuid, favorite.id);
          }
        } else {
          // Add to favorites
          const newFavorite = await favoritesService.addFavorite(currentConnectionUuid, {
            sobject_name: sobjectName,
            sobject_label: sobjectLabel || sobjectName,
            is_custom: isCustom || false
          });
          
          // Replace optimistic update with real data
          setFavorites(prev => 
            prev.map(fav => 
              fav.id.startsWith('temp-') ? newFavorite : fav
            ).filter(fav => !fav.id.startsWith('temp-'))
          );
          setFavorites(prev => [...prev, newFavorite]);
        }
      } catch (error) {
        logger.error('Failed to toggle favorite', 'SchemaTree', error as Error);
        // Revert UI changes on error
        await loadFavorites();
      } finally {
        setIsTogglingFavorite(false);
      }
    };
    
    // Start background API call
    performToggle();
  };



  // Helper function to find parent SObject name for a field
  const findParentSObject = (fieldId: string): string | null => {
    for (const sobjectNode of treeData) {
      if (sobjectNode.children) {
        const fieldNode = sobjectNode.children.find(child => child.id === fieldId);
        if (fieldNode) {
          return sobjectNode.name;
        }
      }
    }
    return null;
  };

  const tree = useTree({
    initialExpandedState: {},
    multiple: false,
    onNodeExpand: (value) => {
    },
    onNodeCollapse: (value) => {
    }
  });



  // Extract field data from tree data
  const extractFieldData = (data: TreeNode[]): { [sobjectName: string]: string[] } => {
    const fieldData: { [sobjectName: string]: string[] } = {};
    
    data.forEach(sobjectNode => {
      if (sobjectNode.type === 'sobject' && sobjectNode.children) {
        const fields = sobjectNode.children
          .filter(child => child.type === 'field')
          .map(field => field.name);
        fieldData[sobjectNode.name] = fields;
      }
    });
    
    return fieldData;
  };

  // Update field data when tree data changes - but only once per tree size to prevent loops
  useEffect(() => {
    if (treeData.length > 0 && onFieldDataUpdate) {
      // Prevent duplicate field data updates for the same tree size
      if (fieldDataSentRef.current === treeData.length) {
        logger.debug(` Field data already sent for ${treeData.length} SObjects, skipping duplicate update`, 'SchemaTree');
        return;
      }
      
      // Only send field data if we're not currently reloading
      if (isReloading) {
        logger.debug(` Skipping field data update during reload for ${treeData.length} SObjects`, 'SchemaTree');
        return;
      }
      
      const fieldData = extractFieldData(treeData);
      onFieldDataUpdate(fieldData);
      
      // Mark that we've sent field data for this tree size
      fieldDataSentRef.current = treeData.length;
    }
  }, [treeData.length, isReloading]); // Include isReloading to prevent updates during reload

  // Update cache stats periodically
  useEffect(() => {
    const updateCacheStats = () => {
      const cacheService = SObjectCacheService.getInstance();
      const stats = cacheService.getCacheStats();
      setCacheStats({ size: stats.size, maxSize: stats.maxSize });
    };

    // Update immediately
    updateCacheStats();

    // Update every 5 seconds
    const interval = setInterval(updateCacheStats, 5000);
    return () => clearInterval(interval);
  }, []);

  // Only check connection when actually making API calls, not constantly monitor
  // The tree should stay stable regardless of connection state changes

  // Watch for reload trigger from parent component
  useEffect(() => {
    logger.debug(` SchemaTree reloadTrigger effect - reloadTrigger: ${reloadTrigger}`, 'SchemaTree');
    
    // Prevent multiple reloads for the same trigger value
    if (reloadTrigger && reloadTrigger > 0 && !isReloading && reloadTrigger !== lastReloadTriggerRef.current) {
      logger.debug(' Reload trigger received from parent component, calling handleReloadTree', 'SchemaTree');
      lastReloadTriggerRef.current = reloadTrigger; // Mark this trigger as processed
      handleReloadTree();
    } else if (reloadTrigger && reloadTrigger > 0 && isReloading) {
      logger.debug(' Reload trigger received but reload already in progress, skipping', 'SchemaTree');
    } else if (reloadTrigger && reloadTrigger > 0 && reloadTrigger === lastReloadTriggerRef.current) {
      logger.debug(' Reload trigger already processed, skipping duplicate', 'SchemaTree');
    }
  }, [reloadTrigger, isReloading]);

  const loadSchemaTree = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (!currentConnectionUuid) {
        throw new Error('No connection UUID available');
      }
      
      const sobjectNames = await SalesforceService.getSObjectList(currentConnectionUuid);
      
      // Validate that we got a proper response
      if (!sobjectNames || !Array.isArray(sobjectNames)) {
        throw new Error(`Invalid response from getSObjectList: expected array, got ${typeof sobjectNames}`);
      }
      
      // Notify parent component of SObject count
      if (onSObjectCountChange) {
        onSObjectCountChange(sobjectNames.length);
      } else {
        logger.warn('onSObjectCountChange callback not provided', 'SchemaTree');
      }
      
      // Step 2: Build tree structure with SObjects as parent nodes
      const treeNodes: TreeNode[] = sobjectNames.map(sobjectName => ({
        id: `sobject-${sobjectName}`,
        name: sobjectName,
        label: sobjectName,
        type: 'sobject',
        custom: sobjectName.includes('__c'), // Custom objects end with __c
        queryable: true,
        children: [], // Will be populated when expanded
        expanded: false
      }));

      setTreeData(treeNodes);

    } catch (error) {
      logger.error('❌ Failed to load schema tree', 'SchemaTree', { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }, error as Error);
      setError(error instanceof Error ? error.message : 'Failed to load schema');
    } finally {
      setLoading(false);
    }
  }, [onSObjectCountChange, currentConnectionUuid]);

  // Load schema tree when connected
  useEffect(() => {
    if (isConnected && treeData.length === 0 && !loading && !isReloading) {
      logger.debug(' Loading schema tree - connected and no tree data', 'SchemaTree');
      loadSchemaTree();
    }
  }, [isConnected, treeData.length, loading, isReloading, loadSchemaTree]);

  // Load favorites only when connected and currentConnectionUuid is available
  useEffect(() => {
    if (isConnected && currentConnectionUuid && treeData.length === 0 && !loading && !isReloading) {
      loadFavorites();
    }
  }, [isConnected, currentConnectionUuid, treeData.length, loading, isReloading, loadFavorites]);













  const handleRefresh = async () => {
    setLoading(true);
    setError(null);
    setSearchQuery('');
    // Don't reset filter type to preserve favorites filter
    setSearchResults(new Set());
    
    try {
      // Clear the SObject cache before refreshing
      const cacheService = SObjectCacheService.getInstance();
      cacheService.clearCache();
      
      // Reset tree data to force reload
      setTreeData([]);
      
      await loadSchemaTree();
      
      // Reload favorites after tree is refreshed to maintain state
      loadFavorites();
      
    } catch (error) {
      logger.error('❌ Failed to refresh schema tree', 'SchemaTree', { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }, error as Error);
      setError('Failed to refresh schema tree');
    } finally {
      setLoading(false);
    }
  };

  const handleReloadTree = async () => {
    // Prevent multiple simultaneous reloads
    if (isReloading) {
      logger.debug(' Tree reload already in progress, skipping duplicate request', 'SchemaTree');
      return;
    }
    
    // Prevent reload if tree already has data and we're not explicitly requested to reload
    if (treeData.length > 0 && !reloadTrigger) {
      logger.debug(' Tree already has data and no explicit reload requested, skipping', 'SchemaTree');
      return;
    }
    
    setIsReloading(true);
    setLoading(true);
    setError(null);
    setSearchQuery('');
    // Don't reset filter type to preserve favorites filter
    setSearchResults(new Set());
    
    try {
      // Connection status will be checked by the actual API calls if needed
      
      // Step 1: Clear backend cache first
      if (currentConnectionUuid) {
        logger.debug('🗑️ Clearing backend SObject cache', 'SchemaTree', {
          connectionUuid: currentConnectionUuid,
          hasMasterKey: !!getMasterKey()
        });
        try {
          const result = await ApiService.getInstance().clearBackendSObjectCache(currentConnectionUuid);
          logger.debug('Backend cache cleared successfully', 'SchemaTree', { result });
        } catch (backendCacheError) {
          logger.error('Failed to clear backend cache', 'SchemaTree', {
            error: backendCacheError instanceof Error ? backendCacheError.message : String(backendCacheError),
            connectionUuid: currentConnectionUuid,
            hasMasterKey: !!getMasterKey()
          });
          // Continue with frontend cache clear even if backend cache clear fails
        }
      } else {
        logger.warn('No connection UUID available for backend cache clear', 'SchemaTree');
      }
      
      // Step 2: Clear frontend cache
      const cacheService = SObjectCacheService.getInstance();
      cacheService.clearCache();
      
      // Reset tree data to force complete reload
      setTreeData([]);
      
      // Don't notify parent of 0 count during reload to prevent flickering
      logger.debug(' Skipping SObject count update during reload to prevent flickering', 'SchemaTree');
      
      // Force reload from Salesforce (not from cache)
      logger.debug(' About to call loadSchemaTree()', 'SchemaTree');
      await loadSchemaTree();
      logger.debug('loadSchemaTree() completed successfully', 'SchemaTree');
      
      // Reload favorites after tree is reloaded to maintain state
      loadFavorites();
      
    } catch (error) {
      logger.error('❌ Failed to reload tree from Salesforce', 'SchemaTree', { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }, error as Error);
      setError('Failed to reload tree from Salesforce');
    } finally {
      setLoading(false);
      setIsReloading(false);
    }
  };

  const loadSObjectFields = async (sobjectName: string, nodeId: string) => {
    try {
      
      // Add to expanding nodes set
      setExpandingNodes(prev => new Set(prev).add(nodeId));
      
      // Get detailed field information for this SObject using cache
      const cacheService = SObjectCacheService.getInstance();
      const fields = await cacheService.getSObjectFields(sobjectName, currentConnectionUuid);
      
      // Create field nodes
      const fieldNodes: TreeNode[] = fields.map(field => {

        
        // Build constraints string
        const constraints = [];
        if (field.required) constraints.push('required');
        if (field.custom) constraints.push('custom');
        if (field.type === 'reference') constraints.push('reference');
        
        const constraintsStr = constraints.length > 0 ? ` ${constraints.join(', ')}` : '';
        
        return {
          id: `field-${sobjectName}-${field.name}`,
          name: field.name,
          label: `${field.name} (${field.type})${constraintsStr}`,
          type: 'field',
          custom: field.custom,
          required: field.required,
          fieldType: field.type,
          picklistValues: field.picklistValues,
          referenceTo: field.referenceTo
        };
      });

      // Update tree data with field children
      setTreeData(prevData => 
        prevData.map(node => 
          node.id === nodeId 
            ? { ...node, children: fieldNodes, expanded: true }
            : node
        )
      );


    } catch (error) {
      logger.error(`Failed to load fields for ${sobjectName}`, 'SchemaTree', null, error as Error);
      setError(`Failed to load fields for ${sobjectName}`);
    } finally {
      // Remove from expanding nodes set
      setExpandingNodes(prev => {
        const newSet = new Set(prev);
        newSet.delete(nodeId);
        return newSet;
      });
    }
  };

  // Search functionality
  const performSearch = React.useCallback((query: string) => {
    if (!query.trim()) {
      setSearchResults(new Set());
      return;
    }

    const results = new Set<string>();
    const searchTerm = query.toLowerCase();

    treeData.forEach(sobjectNode => {
      // Search in SObject name
      if (sobjectNode.name.toLowerCase().includes(searchTerm)) {
        results.add(sobjectNode.id);
      }

      // Search in fields if expanded
      if (sobjectNode.children) {
        sobjectNode.children.forEach(fieldNode => {
          if (fieldNode.name.toLowerCase().includes(searchTerm) ||
              fieldNode.fieldType?.toLowerCase().includes(searchTerm)) {
            results.add(sobjectNode.id); // Add parent SObject to results
            results.add(fieldNode.id);
          }
        });
      }
    });

    setSearchResults(results);
  }, [treeData]);

  // Handle search input change
  const handleSearchChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    performSearch(query);
  }, [performSearch]);

  // Clear search
  const clearSearch = React.useCallback(() => {
    setSearchQuery('');
    setSearchResults(new Set());
  }, []);

  // Filter tree data based on filter and search
  const filteredTreeData = useMemo(() => {
    return treeData.filter(node => {
      const matchesFilter = filterType === 'all' || 
                           (filterType === 'custom' && node.custom) ||
                           (filterType === 'standard' && !node.custom) ||
                           (filterType === 'favorites' && favorites.some(fav => fav.sobject_name === node.name));
      
      const matchesSearch = searchQuery === '' || searchResults.has(node.id);
      
      return matchesFilter && matchesSearch;
    });
  }, [treeData, filterType, searchQuery, searchResults, favorites]);



  // Convert to Mantine Tree data format
  const mantineTreeData: TreeNodeData[] = useMemo(() => {
    const convertNode = (node: TreeNode): TreeNodeData => {
      const children: TreeNodeData[] = [];
      
      if (node.children && node.children.length > 0) {
        children.push(...node.children.map(convertNode));
      }
      
      return {
        value: node.id,
        label: node.label || node.name, // Use label if available, fallback to name
        children: node.type === 'sobject' ? (children.length > 0 ? children : []) : undefined
      };
    };
    
    return filteredTreeData.map(convertNode);
  }, [filteredTreeData]);

  // Create a lookup map for tree nodes to avoid find() calls in render
  const treeNodeMap = useMemo(() => {
    const map = new Map<string, TreeNode>();
    const addNodeToMap = (node: TreeNode) => {
      map.set(node.id, node);
      if (node.children) {
        node.children.forEach(addNodeToMap);
      }
    };
    treeData.forEach(addNodeToMap);
    return map;
  }, [treeData]);

  const getFieldTypeColor = (fieldType: string) => {
    switch (fieldType?.toLowerCase()) {
      case 'string':
      case 'textarea':
        return 'var(--mantine-color-emerald-6)';
      case 'number':
      case 'int':
      case 'double':
      case 'currency':
        return 'var(--mantine-color-blue-6)';
      case 'date':
      case 'datetime':
        return 'var(--mantine-color-violet-6)';
      case 'boolean':
        return 'var(--mantine-color-rose-6)';
      case 'picklist':
      case 'multipicklist':
        return 'var(--mantine-color-fuchsia-6)';
      case 'email':
        return 'var(--mantine-color-cyan-6)';
      case 'phone':
        return 'var(--mantine-color-sky-6)';
      case 'url':
        return 'var(--mantine-color-lime-6)';
      case 'reference':
        return 'var(--mantine-color-orange-6)';
      case 'id':
        return 'var(--mantine-color-red-6)';
      default:
        return undefined;
    }
  };

  const getFieldTypeIcon = (fieldType: string) => {
    switch (fieldType?.toLowerCase()) {
      case 'string':
      case 'textarea':
        return <IconFile size={14} stroke={2} />;
      case 'number':
      case 'int':
      case 'double':
      case 'currency':
        return <IconCode size={14} stroke={2} />;
      case 'date':
      case 'datetime':
        return <IconInfoCircle size={14} stroke={2} />;
      case 'boolean':
        return <IconCheck size={14} stroke={2} />;
      case 'picklist':
      case 'multipicklist':
        return <IconList size={14} stroke={2} />;
      case 'email':
        return <IconInfoCircle size={14} stroke={2} />;
      case 'phone':
        return <IconInfoCircle size={14} stroke={2} />;
      case 'url':
        return <IconLink size={14} stroke={2} />;
      case 'reference':
        return <IconLink size={14} stroke={2} />;
      default:
        return <IconFile size={14} stroke={2} />;
    }
  };

  // File icon component exactly like Mantine files tree example
  interface FileIconProps {
    name: string;
    isFolder: boolean;
    expanded: boolean;
    fieldType?: string;
    isLoading?: boolean;
  }

  function FileIcon({ name, isFolder, expanded, fieldType, isLoading }: FileIconProps) {
    // Show loading spinner if node is being expanded
    if (isLoading) {
      return <IconLoader2 size={14} stroke={2} className="schema-tree-page-loading-spinner" />;
    }

    // All SObjects are folders
    if (isFolder) {
      return expanded ? (
        <IconFolderOpen size={14} stroke={2} />
      ) : (
        <IconFolder size={14} stroke={2} />
      );
    }

    // For fields, use field type icons
    return getFieldTypeIcon(fieldType || '');
  }

  // Custom tree node renderer
  const renderCustomTreeNode = (node: TreeNode, level: number = 0) => {
    const isExpanded = node.expanded || false;
    const hasChildren = node.children && node.children.length > 0;
    const isSObject = node.type === 'sobject';
    const isField = node.type === 'field';
    const isLoading = expandingNodes.has(node.id);
    

    


    const handleNodeClick = async (e: React.MouseEvent) => {
      // Don't handle right-clicks
      if (e.button === 2) {
        return;
      }
      
      // Check if the click target is a field
      const target = e.target as HTMLElement;
      const fieldElement = target.closest('.schema-tree-page-field');
      
      // If we clicked on a field, don't handle the click
      if (fieldElement) {
        return;
      }
      
      if (isSObject) {
        // For SObjects: expand/collapse on click
        if (!hasChildren && !expandingNodes.has(node.id)) {
          await loadSObjectFields(node.name, node.id);
          setTreeData(prevData => 
            prevData.map(n => 
              n.id === node.id ? { ...n, expanded: true } : n
            )
          );
        } else if (hasChildren) {
          setTreeData(prevData => 
            prevData.map(n => 
              n.id === node.id ? { ...n, expanded: !isExpanded } : n
            )
          );
        }
      }
      // Fields are now handled by right-click
    };



    // Create picklist tooltip content
    const createPicklistTooltip = () => {
      if (!node.picklistValues || node.picklistValues.length === 0) {
        return null;
      }

      return (
        <div style={{ 
          maxWidth: '320px',
          backgroundColor: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '12px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)'
        }}>
          <div style={{ 
            fontWeight: '600', 
            marginBottom: '10px', 
            fontSize: '13px',
            color: '#6b7280',
            borderBottom: '1px solid #ecf0f1',
            paddingBottom: '6px'
          }}>
            {tSync('schema.picklistValues', 'Picklist Values:')}
          </div>
          <div style={{ 
            maxHeight: '200px', 
            overflowY: 'auto',
            backgroundColor: '#f8f9fa',
            borderRadius: '6px',
            padding: '8px',
            border: '1px solid #e5e7eb'
          }}>
            {node.picklistValues.map((picklistValue, index) => (
              <div key={index} style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                padding: '6px 8px',
                fontSize: '12px',
                backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8f9fa',
                borderRadius: '4px',
                marginBottom: '2px',
                border: '1px solid #f3f4f6'
              }}>
                <span style={{ 
                  fontWeight: '600', 
                  color: '#6b7280',
                  fontFamily: 'monospace',
                  fontSize: '11px',
                  backgroundColor: '#f1f5f9',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  minWidth: '60px',
                  textAlign: 'center'
                }}>
                  {picklistValue.value}
                </span>
                <span style={{ 
                  color: picklistValue.active ? '#6b7280' : '#9ca3af',
                  fontStyle: picklistValue.active ? 'normal' : 'italic',
                  flex: 1,
                  marginLeft: '8px',
                  marginRight: '8px'
                }}>
                  {picklistValue.label}
                </span>
                {picklistValue.defaultValue && (
                  <span style={{ 
                    color: '#ffffff', 
                    fontSize: '10px',
                    fontWeight: '600',
                    backgroundColor: '#28a745',
                    padding: '2px 6px',
                    borderRadius: '10px',
                    whiteSpace: 'nowrap'
                  }}>
                    Default
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      );
    };

    const picklistTooltip = createPicklistTooltip();

    return (
      <div key={node.id} className="schema-tree-page-node">
        {isField && picklistTooltip ? (
          <Tooltip
            label={picklistTooltip}
            position="right"
            withArrow
            multiline
            openDelay={500}
            closeDelay={100}
            styles={{
              tooltip: {
                backgroundColor: 'transparent',
                border: 'none',
                boxShadow: 'none',
                padding: 0
              },
              arrow: {
                backgroundColor: 'transparent',
                border: 'none'
              }
            }}
          >
            <div 
              className={`schema-tree-page-node-content ${isSObject ? 'schema-tree-page-sobject' : 'schema-tree-page-field'}`}
              style={{ 
                paddingLeft: `${level * 16 + 8}px`,
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'nowrap',
                gap: '6px',
                cursor: isField ? 'pointer' : 'pointer'
              }}
              onClick={handleNodeClick}
              draggable={isField}
              onDragStart={(e) => {
                if (isField) {
                  const parentSObject = findParentSObject(node.id);
                  if (parentSObject) {
                    const dragData = {
                      fieldName: node.name,
                      sobjectName: parentSObject,
                      fieldType: node.fieldType
                    };
                    e.dataTransfer.setData('application/json', JSON.stringify(dragData));
                    e.dataTransfer.effectAllowed = 'copy';
                    (e.currentTarget as HTMLElement).style.opacity = '0.5';
                  }
                }
              }}
              onDragEnd={(e) => {
                (e.currentTarget as HTMLElement).style.opacity = '1';
              }}
              title={isSObject ? 
                (isExpanded ? 
                  tSync('schema.tooltip.collapse', { name: node.name }) || `Click to collapse ${node.name}` :
                  tSync('schema.tooltip.expand', { name: node.name }) || `Click to expand ${node.name}`
                ) : 
                tSync('schema.tooltip.dragField', { name: node.name }) || `Drag ${node.name} to add to query`
              }
              data-field-type={isField ? node.fieldType : undefined}
            >
              <div 
                className="schema-tree-page-node-icon" 
                style={{ flexShrink: 0, width: '16px', height: '16px' }}
                data-field-type={isField ? node.fieldType : undefined}
              >
                <FileIcon 
                  name={node.name} 
                  isFolder={isSObject} 
                  expanded={isExpanded}
                  fieldType={node.fieldType}
                  isLoading={isLoading}
                />
              </div>
              
              <div className="schema-tree-page-node-label" style={{ flex: 1, minWidth: 0 }}>
                {isSObject ? formatSObjectName(node.label || node.name) : (node.label || node.name)}
              </div>
              
              {node.custom && (
                <Badge variant="light" size="xs" color="violet" className="schema-tree-page-custom-badge">
                  {tSync('schema.custom', 'Custom')}
                </Badge>
              )}
              {isSObject && (
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  color={favorites.some(fav => fav.sobject_name === node.name) ? "red" : "gray"}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(node.name, node.label, node.custom);
                  }}
                  title={favorites.some(fav => fav.sobject_name === node.name) ? 
                    tSync('schema.removeFromFavorites', 'Remove from favorites') : 
                    tSync('schema.addToFavorites', 'Add to favorites')
                  }
                >
                  {favorites.some(fav => fav.sobject_name === node.name) ? 
                    <IconHeart size={12} /> : 
                    <IconHeartOff size={12} />
                  }
                </ActionIcon>
              )}
            </div>
          </Tooltip>
        ) : (
          <div 
            className={`schema-tree-page-node-content ${isSObject ? 'schema-tree-page-sobject' : 'schema-tree-page-field'}`}
            style={{ 
              paddingLeft: `${level * 16 + 8}px`,
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'nowrap',
              gap: '6px',
              cursor: isField ? 'pointer' : 'pointer'
            }}
            onClick={handleNodeClick}
            draggable={isField || isSObject}
            onDragStart={(e) => {
              if (isField) {
                const parentSObject = findParentSObject(node.id);
                if (parentSObject) {
                  const dragData = {
                    fieldName: node.name,
                    sobjectName: parentSObject,
                    fieldType: node.fieldType
                  };
                  e.dataTransfer.setData('application/json', JSON.stringify(dragData));
                  e.dataTransfer.effectAllowed = 'copy';
                  (e.currentTarget as HTMLElement).style.opacity = '0.5';
                }
              } else if (isSObject) {
                // Add SObject drag support for Schema Graph
                e.dataTransfer.setData('text/plain', node.name);
                e.dataTransfer.setData('application/json', JSON.stringify({
                  sobjectName: node.name,
                  type: 'sobject'
                }));
                e.dataTransfer.effectAllowed = 'copy';
                (e.currentTarget as HTMLElement).style.opacity = '0.5';
              }
            }}
            onDragEnd={(e) => {
              (e.currentTarget as HTMLElement).style.opacity = '1';
              if (isField) {
              } else if (isSObject) {
              }
            }}
            title={isSObject ? 
              (isExpanded ? 
                tSync('schema.tooltip.collapse', { name: node.name }) || `Click to collapse ${node.name}` :
                tSync('schema.tooltip.expand', { name: node.name }) || `Click to expand ${node.name}`
              ) : 
              tSync('schema.tooltip.dragField', { name: node.name }) || `Drag ${node.name} to add to query`
            }
            data-field-type={isField ? node.fieldType : undefined}
          >
            <div 
              className="schema-tree-page-node-icon" 
              style={{ flexShrink: 0, width: '16px', height: '16px' }}
              data-field-type={isField ? node.fieldType : undefined}
            >
              <FileIcon 
                name={node.name} 
                isFolder={isSObject} 
                expanded={isExpanded}
                fieldType={node.fieldType}
                isLoading={isLoading}
              />
            </div>
            
            <div className="schema-tree-page-node-label" style={{ flex: 1, minWidth: 0 }}>
              {isSObject ? formatSObjectName(node.label || node.name) : (node.label || node.name)}
            </div>
            
            {node.custom && (
              <Badge variant="light" size="xs" color="violet" className="schema-tree-page-custom-badge">
                {tSync('schema.custom', 'Custom')}
              </Badge>
            )}
            
            {isSObject && (() => {
              const isFavorite = favorites.some(fav => fav.sobject_name === node.name);
              const isToggling = isTogglingFavorite;
              
              logger.debug('Rendering heart icon', 'SchemaTree', { 
                sobjectName: node.name, 
                isFavorite, 
                favoritesCount: favorites.length,
                isSObject,
                isToggling
              });
              
              return (
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  color={isFavorite ? "red" : "gray"}
                  disabled={isToggling}
                  loading={isToggling}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isToggling) {
                      toggleFavorite(node.name, node.label, node.custom);
                    }
                  }}
                  title={isToggling ? 
                    tSync('schema.togglingFavorite', 'Toggling favorite...') :
                    isFavorite ? 
                      tSync('schema.removeFromFavorites', 'Remove from favorites') : 
                      tSync('schema.addToFavorites', 'Add to favorites')
                  }
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    minWidth: '16px',
                    minHeight: '16px',
                    opacity: isToggling ? 0.6 : 1
                  }}
                >
                  {isToggling ? (
                    <IconLoader2 size={12} className="schema-tree-page-loading-spinner" />
                  ) : isFavorite ? (
                    <IconHeart size={12} fill="currentColor" />
                  ) : (
                    <IconHeartOff size={12} />
                  )}
                </ActionIcon>
              );
            })()}
          </div>
        )}
        
        {isExpanded && hasChildren && (
          <div className="schema-tree-page-node-children">
            {node.children!.map(child => renderCustomTreeNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  if (!isConnected) {
    return (
      <Paper p="md" withBorder>
        <Stack align="center" gap="md">
          <IconDatabase size={48} color="var(--mantine-color-blue-6)" />
          <Text size="lg" fw={600} c="dimmed">
            {tSync('schema.notConnected', 'Not Connected')}
          </Text>
          <Text size="sm" c="dimmed" ta="center">
            {tSync('schema.connectToView', 'Connect to Salesforce to view schema')}
          </Text>
        </Stack>
      </Paper>
    );
  }

  return (
    <Paper p="md" withBorder className="schema-tree-page-container">
      <Stack gap="md" className="schema-tree-page-content">






        {/* Search Row */}
        <div className="schema-tree-page-search-row">
          <div className="schema-tree-page-search-group">
            <div className="schema-tree-page-search-input-wrapper">
              <IconSearch size={16} className="schema-tree-page-search-icon" />
              <input
                type="text"
                placeholder={tSync('schema.searchPlaceholder', 'Search objects and fields...')}
                value={searchQuery}
                onChange={handleSearchChange}
                className="schema-tree-page-search-input-field"
              />
              {searchQuery && (
                <button
                  className="schema-tree-page-clear-search"
                  onClick={clearSearch}
                >
                  <IconX size={14} />
                </button>
              )}
            </div>
            
            {/* Cache Status Indicator */}
            <div className="schema-tree-page-cache-status" title={tSync('schema.cacheStatus', { current: cacheStats.size, max: cacheStats.maxSize }, 'schema.cacheStatus.fallback')}>
              <IconDatabase size={12} />
              <span className="schema-tree-page-cache-count">{cacheStats.size}</span>
            </div>
          </div>
        </div>

        {/* Filter Buttons Row */}
        <div className="schema-tree-page-filter-row">
          <div className="schema-tree-page-filter-buttons">
            <button
              className={`schema-tree-page-filter-btn ${filterType === 'all' ? 'active' : ''}`}
              onClick={() => setFilterType('all')}
            >
              {tSync('schema.all', 'All')}
            </button>
            <button
              className={`schema-tree-page-filter-btn ${filterType === 'standard' ? 'active' : ''}`}
              onClick={() => setFilterType('standard')}
            >
              {tSync('schema.standard', 'Standard')}
            </button>
            <button
              className={`schema-tree-page-filter-btn ${filterType === 'custom' ? 'active' : ''}`}
              onClick={() => setFilterType('custom')}
            >
              {tSync('schema.custom', 'Custom')}
            </button>
            <button
              className={`schema-tree-page-filter-btn ${filterType === 'favorites' ? 'active' : ''}`}
              onClick={() => setFilterType('favorites')}
            >
              {tSync('schema.favorites', 'Favorites')}
            </button>
          </div>
        </div>

        {/* Tree Content */}
        <Box className="schema-tree-page-tree-container">
          {error && (
            <Paper p="sm" withBorder bg="red.0" c="red.7">
              <Group gap="xs">
                <IconX size={16} />
                <Text size="sm">{error}</Text>
              </Group>
            </Paper>
          )}
          
          {loading && treeData.length === 0 ? (
            <Stack align="center" gap="md" py="xl">
              <ActionIcon size="lg" variant="subtle" loading />
              <Text size="sm" c="dimmed">
                {tSync('common.loading', 'Loading...')}
              </Text>
            </Stack>
          ) : (
            <ScrollArea h={500} className="schema-tree-page-scroll">
              {filteredTreeData.length > 0 ? (
                <div className="schema-tree-page-custom-tree">
                  {filteredTreeData.map(node => renderCustomTreeNode(node))}
                </div>
              ) : treeData.length === 0 ? (
                <Stack align="center" gap="md" py="xl">
                  <IconDatabase size={48} color="var(--mantine-color-gray-4)" />
                  <Text size="sm" c="dimmed">
                    {tSync('schema.noData', 'No schema data available')}
                  </Text>
                </Stack>
              ) : (
                <Stack align="center" gap="md" py="xl">
                  <IconSearch size={48} color="var(--mantine-color-gray-4)" />
                  <Text size="sm" c="dimmed">
                    {tSync('schema.noResults', 'No results found')}
                  </Text>
                </Stack>
              )}
            </ScrollArea>
          )}
        </Box>
      </Stack>


    </Paper>
  );
};
