import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button, Paper, Modal, TextInput, Group, ActionIcon, Menu, Tooltip, Text, Badge } from '@mantine/core';
import { IconPlayerPlay, IconDatabase, IconDeviceFloppy, IconCode, IconCheck, IconTrash, IconFileImport, IconArrowBack, IconArrowForward, IconBookmark, IconGitBranch, IconChevronDown, IconChevronUp, IconDownload, IconFileExport } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import Editor from '@monaco-editor/react';
import { useTranslation } from '../../services/I18nService';
import { connectionManager } from '../../services/ConnectionManager';
import { apiService } from '../../services/ApiService';
import { logger } from '../../services/Logger';
import { convertASTToGraphData } from '../../utils/astToGraphConverter';
import { useConnectionSessionStorage } from '../../hooks/useSessionStorage';
import { ResultsViewPage } from '../ResultsViewPage';
import '../../assets/css/components/query-editor/QueryTab.css';
import '../../assets/css/components/query-editor/SaveQueryModal.css';

// Saved Query interface
interface SavedQuery {
  saved_queries_uuid: string;
  name: string;
  query_text: string;
  description?: string;
  tags?: string;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
}

// Import all functionality from the modular structure
import {
  // Query parsing and tree building
  parseQueryStructure,
  formatSOQLQuery,
  getAutocompleteContext,
  parseSoql
} from './QueryTab/queryParser';

// Legacy treeBuilder, contextDetection, and relationshipResolver imports removed - replaced by enhanced parser

import {
  // Autocomplete
  getSObjectFields,
  getSObjectRelationships,
  getSObjectSuggestions,
  createFieldSuggestions,
  createRelationshipSuggestions,
  createNestingLevelSuggestion,
  filterValidSuggestions,
  createErrorSuggestion
} from './QueryTab/autocompleteProvider';

import {
  // Validation
  SOQLValidator
} from './QueryTab/queryValidator';

import {
  // Drag and drop
  handleDragDrop,
  handleFieldDrop,
  handleRelationshipFieldDrop,
  detectSObjectRelationship,
  detectNestedRelationship,
  getMainFromSObject,
  buildNestedSubquery,
  escapeRegExp
} from './QueryTab/dragDropHandler';

interface QueryTabProps {
  onExecuteQuery: () => void;
  onQueryChange: (query: string) => void;
  initialQuery: string;
  isQuerying: boolean;
  currentConnectionUuid?: string | null;
  fieldData?: { [sobjectName: string]: string[] }; // SObject name -> field names mapping
  onTabChange?: (tabName: string) => void; // Function to change tabs
  queryResult?: any; // Query result data
  onRecordUpdate?: (recordId: string, fieldName: string, newValue: any) => Promise<void>;
  onQueryMore?: () => void;
  maxRecordsWarning?: string | null;
  maxRecordsReached?: string | null;
  maxRecordsLimit?: number;
}

export const QueryTab: React.FC<QueryTabProps> = ({
  onExecuteQuery,
  onQueryChange,
  initialQuery,
  isQuerying,
  currentConnectionUuid,
  fieldData = {},
  onTabChange,
  queryResult,
  onRecordUpdate,
  onQueryMore,
  maxRecordsWarning,
  maxRecordsReached,
  maxRecordsLimit = 1000
}) => {
  const { tSync } = useTranslation();
  
  // Results section state management
  const [resultsState, setResultsState] = useState<'collapsed' | 'expanded'>('collapsed');
  const [resultsHeight, setResultsHeight] = useState(300); // Default height for results section
  
  // Function to toggle between collapsed and expanded
  const toggleResultsState = () => {
    setResultsState(prev => prev === 'collapsed' ? 'expanded' : 'collapsed');
  };

  // Drag separator functionality
  const [isDragging, setIsDragging] = useState(false);
  
  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragMove = (e: MouseEvent) => {
    if (!isDragging) return;
    
    // Get the current viewport height and calculate available space
    const viewportHeight = window.innerHeight;
    const headerHeight = 50; // App header height
    const statusBarHeight = 40; // Status bar height
    const availableHeight = viewportHeight - headerHeight - statusBarHeight - 20; // Extra padding
    
    // Calculate new height based on mouse position from bottom
    const newHeight = viewportHeight - e.clientY - statusBarHeight;
    const minHeight = 100; // Minimum results height
    const maxHeight = availableHeight - 150; // Leave minimum space for query editor
    
    console.log('Drag Debug:', {
      clientY: e.clientY,
      viewportHeight,
      newHeight,
      minHeight,
      maxHeight,
      availableHeight,
      queryEditorMinHeight: availableHeight - newHeight
    });
    
    if (newHeight >= minHeight && newHeight <= maxHeight) {
      setResultsHeight(newHeight);
    }
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  // Add event listeners for dragging
  React.useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleDragMove);
      document.addEventListener('mouseup', handleDragEnd);
      
      return () => {
        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('mouseup', handleDragEnd);
      };
    }
  }, [isDragging]);

  // Auto-expand results when query is executed
  useEffect(() => {
    if (queryResult && isQuerying === false) {
      // Query execution completed, auto-expand results
      setResultsState('expanded');
    }
  }, [queryResult, isQuerying]);
  
  const [query, setQuery] = useState(initialQuery);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveQueryName, setSaveQueryName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [isLoadingSavedQueries, setIsLoadingSavedQueries] = useState(false);

  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const connectionUuidRef = useRef<string | null>(null);
  const providerRef = useRef<any>(null);
  
  // Session-aware AST storage (shared with SchemaTab) - SINGLE SOURCE OF TRUTH
  const [astState, setAstState] = useConnectionSessionStorage<any>(
    'ast-state',
    currentConnectionUuid,
    null
  );
  
  // Removed AST caching - causing issues with duplicates

  // Update connection UUID ref whenever it changes
  useEffect(() => {
    connectionUuidRef.current = currentConnectionUuid;
  }, [currentConnectionUuid]);

  // Debug initialQuery changes
  useEffect(() => {
    // Update local state when initialQuery changes
    setQuery(initialQuery);
  }, [initialQuery]);

  // Load saved queries when connection changes
  useEffect(() => {
    if (currentConnectionUuid) {
      loadSavedQueries();
    }
  }, [currentConnectionUuid]);

  // Handle editor mount
  const handleEditorDidMount = useCallback((editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    
    // Configure SOQL language features with enhanced nested query autocomplete
    
    // CRITICAL: Dispose any existing providers to prevent duplicates
    if (providerRef.current) {
      providerRef.current.dispose();
      providerRef.current = null;
    }
    
    // Register completion provider for SQL language
    const provider = monaco.languages.registerCompletionItemProvider('sql', {
      provideCompletionItems: async (model: any, position: any) => {
        try {
        // CRITICAL: Always start with a fresh suggestions array
        const suggestions = [];
        const currentQuery = model.getValue();
        
        // STEP 1: Parse query directly - parser will tell us if there are errors
        const connectionUuid = connectionUuidRef.current;
        const autocompleteContext = await getAutocompleteContext(model, position, connectionUuid);
        
        // If parsing failed, no autocomplete
        if (!autocompleteContext) {
          return { suggestions: [] };
        }
        
        const { context, ast } = autocompleteContext;
        
        // Calculate the proper range for text replacement
        const word = model.getWordAtPosition(position);
        const range = word ? {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn
        } : {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: position.column,
          endColumn: position.column
        };
        
        if (autocompleteContext) {
          // RULE 1: SObject suggestions when cursor is in SObject context (SELECT * FROM)
          if (context.nodeType === 'sobject') {
            // Get partial SObject name from AST context
            const currentQuery = model.getValue();
            const cursorOffset = model.getOffsetAt(position);
            const partialSObjectName = currentQuery.substring(context.startOffset || cursorOffset, cursorOffset);
            
            const sobjectSuggestions = await getSObjectSuggestions(partialSObjectName, monaco, position, connectionUuid);
            // Ensure SObject suggestions use the calculated range
            const sobjectSuggestionsWithRange = sobjectSuggestions.map(s => ({ ...s, range }));
            suggestions.push(...sobjectSuggestionsWithRange);
            
            const validSuggestions = filterValidSuggestions(suggestions);
            return { suggestions: validSuggestions };
          }
        
        // RULE 3: Field suggestions when cursor is in field context (using AST data structure)
        
        // Get the correct SObject for autocomplete
        let parentSObjectName = null;
          
          // For fields within subqueries, use the subquery's SObject
          if (context.isInSubquery && context.sObject) {
            parentSObjectName = context.sObject;
          } else if (context.nodeType === 'subquery' && context.sObject) {
            parentSObjectName = context.sObject;
          } else if ('sObject' in ast && ast.sObject) {
            // For regular fields, use the parent SObject
            parentSObjectName = ast.sObject;
          }
          
          if (parentSObjectName) {
            // Get fields for the parent SObject (metadata is cached per connection per object)
            const fields = await getSObjectFields(parentSObjectName, connectionUuid, monaco, position);
            
            if (fields && Array.isArray(fields)) {
              if (fields.length === 1 && fields[0] && fields[0].label && typeof fields[0].label === 'string' && fields[0].label.startsWith('⚠️')) {
                // Ensure error suggestions use the calculated range
                const errorSuggestion = { ...fields[0], range };
                suggestions.push(errorSuggestion);
              } else {
                const fieldSuggestions = createFieldSuggestions(fields, parentSObjectName, monaco, position);
                // Ensure all field suggestions use the calculated range
                const fieldSuggestionsWithRange = fieldSuggestions.map(s => ({ ...s, range }));
                suggestions.push(...fieldSuggestionsWithRange);
              }
            }
            
            // Get relationships for the parent SObject
            const relationships = await getSObjectRelationships(parentSObjectName, connectionUuid, monaco, position);
            if (relationships && Array.isArray(relationships)) {
              if (relationships.length === 1 && relationships[0] && relationships[0].label && typeof relationships[0].label === 'string' && relationships[0].label.startsWith('⚠️')) {
                // Ensure error relationship suggestions use the calculated range
                const errorSuggestion = { ...relationships[0], range };
                suggestions.push(errorSuggestion);
              } else {
                const relationshipSuggestions = createRelationshipSuggestions(relationships, monaco, position);
                // Ensure all relationship suggestions use the calculated range
                const relationshipSuggestionsWithRange = relationshipSuggestions.map(s => ({ ...s, range }));
                suggestions.push(...relationshipSuggestionsWithRange);
              }
            }
          }
        }
        
        
        // Final validation: filter out any completion items with invalid properties
        const validSuggestions = filterValidSuggestions(suggestions);
        
        // CRITICAL: Always return a fresh array to prevent Monaco from merging suggestions
        // Remove duplicates based on label AND insertText to catch more cases
        const uniqueSuggestions = validSuggestions.filter((suggestion, index, self) => 
          index === self.findIndex(s => 
            s.label === suggestion.label && 
            s.insertText === suggestion.insertText
          )
        );
        
        return { suggestions: uniqueSuggestions };
        } catch (error) {
          logger.error('Error in autocomplete provider', 'QueryTab', error);
          return { suggestions: [] };
        }
      }
    });
    
    // Store provider reference for cleanup
    providerRef.current = provider;
    
    // Add keyboard shortcut to manually trigger completion
    editor.addCommand(monaco.KeyCode.F1, () => {
      editor.trigger('manual', 'editor.action.triggerSuggest', {});
    });
    
    // Add Ctrl+Space shortcut to manually trigger completion
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space, () => {
      editor.trigger('manual', 'editor.action.triggerSuggest', {});
    });
    
    // Define custom theme with clean selection colors
    monaco.editor.defineTheme('custom-sql-theme', {
      base: 'vs',
      inherit: true,
      rules: [],
      colors: {
        'editor.selectionBackground': 'rgba(59, 130, 246, 0.2)',
        'editor.selectionHighlightBackground': 'rgba(59, 130, 246, 0.1)',
        'editor.inactiveSelectionBackground': 'rgba(59, 130, 246, 0.1)',
        'editor.selectionForeground': '#000000',
        'editorCursor.foreground': '#000000',
        'editor.lineHighlightBackground': '#f8fafc',
        'editor.background': '#ffffff',
        'editor.foreground': '#1e293b'
      }
    });
    
    // Monaco Editor setup completed
    
    // Set editor options - disable Monaco's theme handling
    editor.updateOptions({
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 14,
      fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
      lineNumbers: 'on',
      roundedSelection: false,
      automaticLayout: true,
      wordWrap: 'on',
      folding: true,
      foldingStrategy: 'indentation',
      showFoldingControls: 'always',
      acceptSuggestionOnEnter: 'on',
      tabCompletion: 'on',
      wordBasedSuggestions: 'off', // Disable to prevent conflicts
      // Enable parameter hints
      parameterHints: {
        enabled: true
      },
      // Use custom theme to fix selection colors
      theme: 'custom-sql-theme',
      // Force clean selection colors
      selectionHighlight: false,
      occurrencesHighlight: false,
      // Completely disable Monaco's selection rendering
      renderLineHighlight: 'none',
      renderWhitespace: 'none',
      renderControlCharacters: false,
      // Disable all selection-related features
      selectOnLineNumbers: false,
      scrollbar: {
        vertical: 'visible',
        horizontal: 'visible',
        useShadows: false
      },
      // Fix tooltip visibility issues
      hover: {
        enabled: true,
        delay: 300,
        sticky: false
      },
      // Enable autocomplete suggestions
      suggest: {
        showKeywords: true,
        showSnippets: true,
        showClasses: true,
        showFunctions: true,
        showVariables: true,
        showConstants: true,
        showFields: true,
        showWords: true,
        showMethods: true,
        showProperties: true,
        showEvents: true,
        showOperators: true,
        showUnits: true,
        showValues: true,
        showEnums: true,
        showEnumsMembers: true,
        showUsers: true,
        showIssues: true,
        triggerCharacters: ['.', ' ', '(', ',', '=', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'],
        showOther: true
      },
      // Enable quick suggestions for autocomplete
      quickSuggestions: {
        other: true,
        comments: false,
        strings: false
      },
      // Enable suggestions on trigger characters
      suggestOnTriggerCharacters: true,
      // Enable suggestions on typing
      suggestOnType: true,
      // Enable suggestions on focus
      suggestOnFocus: true,
      // Enable suggestions on selection
      suggestOnSelection: true,
      // Enable suggestions on hover
      suggestOnHover: true,
      // Keep Problems panel disabled since we have custom tooltips
      problems: {
        enabled: false
      },
      // Disable Monaco's built-in drop handling to prevent conflicts
      dropIntoEditor: {
        enabled: false
      },
      // Enable Monaco's visual validation (squiggly lines, line markers)
      renderValidationDecorations: 'on',
      // Enable Monaco's validation UI for visual feedback
      validation: {
        enabled: true
      },
      // Enable Monaco's built-in SQL formatting
      formatOnPaste: true,
      formatOnType: false,
      // Enable SQL-specific formatting options
      insertSpaces: true,
      tabSize: 4,
      detectIndentation: false
    });

    // Add keyboard shortcut for formatting (Shift+Alt+F)
    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF, () => {
      try {
        // Use our local enhanced parser for professional SOQL formatting
        const currentQuery = editor.getValue();
        const formatted = formatSOQLQuery(currentQuery);
        if (formatted !== currentQuery) {
          editor.setValue(formatted);
        }
      } catch (error) {
        logger.error('Keyboard shortcut formatting error', 'QueryTab', error);
      }
    });

    // Add context menu for formatting
    editor.addAction({
      id: 'format-soql-query',
      label: 'Format SOQL Query',
      contextMenuGroupId: '1_modification',
      contextMenuOrder: 1.5,
      run: () => {
        try {
          // Use our local enhanced parser for professional SOQL formatting
          const currentQuery = editor.getValue();
          const formatted = formatSOQLQuery(currentQuery);
          if (formatted !== currentQuery) {
            editor.setValue(formatted);
          }
        } catch (error) {
          logger.error('Context menu formatting error', 'QueryTab', error);
        }
      }
    });
    
    // Configure undo/redo functionality
    editor.addAction({
      id: 'undo',
      label: 'Undo',
      keybindings: [
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyZ
      ],
      run: function(ed) {
        ed.getModel()?.undo();
      }
    });

    editor.addAction({
      id: 'redo',
      label: 'Redo',
      keybindings: [
        monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyZ
      ],
      run: function(ed) {
        ed.getModel()?.redo();
      }
    });
    
  }, [fieldData]);

  // Cleanup provider on unmount
  useEffect(() => {
    return () => {
      if (providerRef.current) {
        providerRef.current.dispose();
        providerRef.current = null;
      }
    };
  }, []);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    onQueryChange(value);
  };

  const handleExecute = () => {
    onExecuteQuery();
  };

  const handleClearQuery = () => {
    handleQueryChange('');
  };

  // Convert AST to Graph data
  const convertASTToGraph = async () => {
    try {
      if (!query.trim()) {
        notifications.show({
          title: tSync('query.editor.astToGraph.error.title', 'No Query'),
          message: tSync('query.editor.astToGraph.error.noQuery', 'Please enter a query to convert to graph'),
          color: 'orange',
          icon: <IconGitBranch size={16} />,
          autoClose: 3000,
        });
        return;
      }

      // Parse the query to AST
      const ast = await parseSoql(query, currentConnectionUuid);
      
      // Store the AST in shared session storage for SchemaTab to access
      setAstState(ast);
      
      
      if (!ast) {
        notifications.show({
          title: tSync('query.editor.astToGraph.error.title', 'Invalid Query'),
          message: tSync('query.editor.astToGraph.error.invalidQuery', 'Unable to parse the query. Please check the syntax.'),
          color: 'red',
          icon: <IconGitBranch size={16} />,
          autoClose: 3000,
        });
        return;
      }

      // Switch to schema tab - SchemaTab will generate graph data from AST
      if (onTabChange) {
        onTabChange('schema');
      }

      notifications.show({
        title: tSync('query.editor.astToGraph.success.title', 'Graph Generated'),
        message: tSync('query.editor.astToGraph.success.message', 'Successfully converted query to graph visualization'),
        color: 'green',
        icon: <IconGitBranch size={16} />,
        autoClose: 3000,
      });

    } catch (error) {
      logger.error('Failed to convert AST to graph', 'QueryTab', { error: String(error) });
      notifications.show({
        title: tSync('query.editor.astToGraph.error.title', 'Conversion Failed'),
        message: tSync('query.editor.astToGraph.error.conversionFailed', 'Failed to convert query to graph. Please try again.'),
        color: 'red',
        icon: <IconGitBranch size={16} />,
        autoClose: 3000,
      });
    }
  };

  // Note: convertASTToGraphData function removed - now using SchemaTab's version
  const handleUndo = () => {
    if (editorRef.current) {
      editorRef.current.getModel()?.undo();
    }
  };

  const handleRedo = () => {
    if (editorRef.current) {
      editorRef.current.getModel()?.redo();
    }
  };

  const loadSavedQueries = async () => {
    if (!currentConnectionUuid) {
      return;
    }
    
    setIsLoadingSavedQueries(true);
    
    // Add timeout to prevent stuck loading state
    const timeoutId = setTimeout(() => {
      setIsLoadingSavedQueries(false);
    }, 10000); // 10 second timeout
    
    try {
      const response = await apiService.getSavedQueries(currentConnectionUuid);
      
      // Handle different response structures
      let queries = [];
      if (Array.isArray(response)) {
        queries = response;
      } else if (response && (response as any).saved_queries_list) {
        queries = (response as any).saved_queries_list;
      } else if (response && (response as any).queries) {
        queries = (response as any).queries;
      } else if (response && (response as any).data) {
        queries = (response as any).data;
      }
      
      setSavedQueries(queries);
    } catch (error) {
      logger.error('Failed to load saved queries', 'QueryTab', null, error as Error);
      notifications.show({
        title: tSync('saved_queries.error.load_failed', 'Load Failed'),
        message: tSync('saved_queries.error.load_failed_message', 'Failed to load saved queries'),
        color: 'red',
        autoClose: 3000,
      });
    } finally {
      clearTimeout(timeoutId);
      setIsLoadingSavedQueries(false);
    }
  };

  const handleQuickLoadQuery = (queryUuid: string | null) => {
    if (!queryUuid) return;
    
    const selectedQuery = savedQueries.find(q => q.saved_queries_uuid === queryUuid);
    if (selectedQuery) {
      handleQueryChange(selectedQuery.query_text);
      notifications.show({
        title: tSync('saved_queries.success.loaded', 'Query Loaded'),
        message: tSync('saved_queries.success.loaded_message', { name: selectedQuery.name }) || `"${selectedQuery.name}" loaded successfully`,
        color: 'green',
        autoClose: 2000,
      });
    }
  };



  const handleFormatQuery = () => {
    if (editorRef.current) {
      try {
        // Use our local enhanced parser for professional SOQL formatting
        const currentQuery = editorRef.current.getValue();        
        const formatted = formatSOQLQuery(currentQuery);
        
        // Only update if formatting actually changed something
        if (formatted !== currentQuery) {
          editorRef.current.setValue(formatted);
          notifications.show({
            title: tSync('query.format.success.title', 'Query Formatted'),
            message: tSync('query.format.success.message', 'Your SOQL query has been formatted successfully'),
            color: 'green',
            icon: <IconCode size={16} />,
            autoClose: 2000,
          });
        } else {
          notifications.show({
            title: tSync('query.format.already.title', 'Query Already Formatted'),
            message: tSync('query.format.already.message', 'Your SOQL query is already properly formatted'),
            color: 'blue',
            icon: <IconCheck size={16} />,
            autoClose: 2000,
          });
        }
      } catch (error) {
        logger.error('SOQL formatting error', 'QueryTab', error);
        notifications.show({
          title: tSync('query.format.error.title', 'Formatting Failed'),
          message: tSync('query.format.error.message', 'Failed to format SOQL query. Please check syntax.'),
          color: 'red',
          icon: <IconCode size={16} />,
          autoClose: 3000,
        });
      }
    }
  };

  const handleSaveQuery = async () => {
    if (!currentConnectionUuid || !saveQueryName.trim()) {
      // Show error notification for invalid input
      notifications.show({
        title: tSync('query.editor.save.error.title', 'Save Failed'),
        message: !currentConnectionUuid 
          ? tSync('query.editor.save.error.no_connection', 'No active connection. Please connect to Salesforce first.')
          : tSync('query.editor.save.error.invalid', 'Please provide a valid query name'),
        color: 'red',
        autoClose: 3000,
      });
      return;
    }

    try {
      setIsSaving(true);
      
      // Save the query using REST API
      await apiService.createSavedQuery({
        connection_uuid: currentConnectionUuid!,
        name: saveQueryName.trim(),
        query_text: query.trim(),
        description: '',
        tags: '',
        is_favorite: false,
        created_by: 'user'
      });
      
      // Reset form and close modal
      setSaveQueryName('');
      setShowSaveModal(false);
      
      // Show success notification
      const title = tSync('query.editor.save.success.title', 'Query Saved');
      const message = tSync('query.editor.save.success.message', { name: saveQueryName.trim() }) || `"${saveQueryName.trim()}" has been saved successfully`;
      
      notifications.show({
        title: title,
        message: message,
        color: 'green',
        icon: <IconDeviceFloppy size={16} />,
        autoClose: 3000,
      });
      
    } catch (error) {
      logger.error('Failed to save query', 'QueryTab', null, error as Error);
      
      // Show error notification
      notifications.show({
        title: tSync('query.editor.save.error.title', 'Save Failed'),
        message: tSync('query.editor.save.error.message', 'Failed to save the query. Please try again.'),
        color: 'red',
        autoClose: 3000,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const openSaveModal = () => {
    // Set default name based on query content
    const defaultName = query.length > 30 
      ? `${query.substring(0, 30)}...` 
      : query || tSync('query.editor.untitled', 'Untitled Query');
    setSaveQueryName(defaultName);
    setShowSaveModal(true);
  };

  return (
    <div className="query-tab-page" style={{ 
      height: '100%',
      display: 'flex',
      flexDirection: 'column'
    }}>
        <Paper 
          className={`query-tab-page-input-container ${isDragOver ? 'drag-over' : ''}`}
          shadow="sm" 
          radius="md"
          style={{ 
            position: 'relative',
            flex: 1,
            minHeight: resultsState === 'expanded' ? '150px' : 'auto',
            maxHeight: resultsState === 'expanded' ? `calc(100vh - ${resultsHeight}px - 200px)` : 'none',
            overflow: 'hidden'
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            setIsDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation(); // Prevent event bubbling to Monaco Editor
            setIsDragOver(false);
            try {
              const dragData = JSON.parse(e.dataTransfer.getData('application/json'));
              // Use enhanced drag and drop handler
              handleDragDrop(dragData, query, handleQueryChange, currentConnectionUuid).catch(error => {
                logger.error('Failed to handle drag drop', 'QueryTab', { error: error instanceof Error ? error.message : String(error) });
              });
            } catch (error) {
              logger.error('Failed to parse drag data', 'QueryTab', { error: error instanceof Error ? error.message : String(error) });
            }
          }}
        >
          <div className="query-tab-page-input-header" style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0' }}>
            <div className="query-tab-page-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>

              {/* Left Side - Editor Actions Group */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {/* Undo/Redo Group */}
                <Group gap="4px" style={{ padding: '2px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <Button
                    size="xs"
                    variant="filled"
                    color="blue"
                    onClick={handleUndo}
                    leftSection={<IconArrowBack size={12} />}
                    style={{ 
                      padding: '4px 8px', 
                      minHeight: '24px',
                      fontSize: '11px',
                      fontWeight: 500,
                      borderRadius: '6px',
                      backgroundColor: '#3b82f6',
                      border: '1px solid #3b82f6'
                    }}
                  >
                    {tSync('query.editor.undo', 'Undo')}
                  </Button>
                  
                  <Button
                    size="xs"
                    variant="filled"
                    color="blue"
                    onClick={handleRedo}
                    leftSection={<IconArrowForward size={12} />}
                    style={{ 
                      padding: '4px 8px', 
                      minHeight: '24px',
                      fontSize: '11px',
                      fontWeight: 500,
                      borderRadius: '6px',
                      backgroundColor: '#3b82f6',
                      border: '1px solid #3b82f6'
                    }}
                  >
                    {tSync('query.editor.redo', 'Redo')}
                  </Button>
                </Group>
                
                {/* Format/Clear Group */}
                <Group gap="4px" style={{ padding: '2px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <Button
                    size="xs"
                    variant="filled"
                    color="blue"
                    onClick={handleFormatQuery}
                    disabled={!query.trim()}
                    leftSection={<IconCode size={12} />}
                    style={{ 
                      padding: '4px 8px', 
                      minHeight: '24px',
                      fontSize: '11px',
                      fontWeight: 500,
                      borderRadius: '6px',
                      backgroundColor: '#3b82f6',
                      border: '1px solid #3b82f6'
                    }}
                  >
                    {tSync('query.editor.format', 'Format')}
                  </Button>
                  
                  <Button
                    size="xs"
                    variant="filled"
                    color="red"
                    onClick={handleClearQuery}
                    disabled={!query.trim()}
                    leftSection={<IconTrash size={12} />}
                    style={{ 
                      padding: '4px 8px', 
                      minHeight: '24px',
                      fontSize: '11px',
                      fontWeight: 500,
                      borderRadius: '6px',
                      backgroundColor: '#dc2626',
                      border: '1px solid #dc2626'
                    }}
                  >
                    {tSync('query.editor.clear', 'Clear')}
                  </Button>
                </Group>
              </div>

              {/* Right Side - Execution and Management Actions */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginLeft: 'auto' }}>
                {/* Quick Load Saved Queries */}
                {currentConnectionUuid && (
                  <div style={{ position: 'relative', minWidth: '180px' }}>
                    <IconBookmark 
                      size={12} 
                      style={{ 
                        position: 'absolute', 
                        left: '8px', 
                        top: '50%', 
                        transform: 'translateY(-50%)', 
                        color: '#6b7280',
                        pointerEvents: 'none',
                        zIndex: 1
                      }} 
                    />
                    <select
                      onChange={(e) => handleQuickLoadQuery(e.target.value || null)}
                      disabled={isLoadingSavedQueries}
                      style={{
                        width: '100%',
                        height: '28px',
                        fontSize: '14px',
                        padding: '0 8px 0 28px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                        cursor: isLoadingSavedQueries ? 'not-allowed' : 'pointer',
                        backgroundPosition: 'right 8px center',
                        backgroundRepeat: 'no-repeat',
                        backgroundSize: '16px'
                      }}
                    >
                      <option value="">
                        {isLoadingSavedQueries 
                          ? tSync('query.editor.quickLoad.loading', 'Loading...')
                          : savedQueries.length === 0
                          ? tSync('query.editor.quickLoad.noQueries', 'No Saved Queries')
                          : tSync('query.editor.quickLoad.placeholder', 'Load Saved Query')
                        }
                      </option>
                      {savedQueries.map(query => (
                        <option 
                          key={query.saved_queries_uuid} 
                          value={query.saved_queries_uuid}
                        >
                          {query.is_favorite ? '★ ' : ''}{query.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Execution Actions Group */}
                <Group gap="4px" style={{ padding: '2px', backgroundColor: '#f0f9ff', borderRadius: '8px', border: '1px solid #bae6fd' }}>
                  <Button
                    size="xs"
                  variant="filled"
                  color="blue"
                  onClick={handleExecute}
                  disabled={!query.trim() || isQuerying}
                  loading={isQuerying}
                    leftSection={<IconPlayerPlay size={12} />}
                  style={{ 
                      padding: '4px 8px', 
                      minHeight: '24px',
                    fontSize: '11px',
                      fontWeight: 500,
                    borderRadius: '6px',
                      backgroundColor: '#3b82f6',
                      border: '1px solid #3b82f6'
                  }}
                >
                    {tSync('query.editor.execute', 'Run')}
                </Button>
                
                <Button
                  size="xs"
                  variant="filled"
                  color="purple"
                  onClick={convertASTToGraph}
                  disabled={!query.trim()}
                  leftSection={<IconGitBranch size={12} />}
                  style={{ 
                    padding: '4px 8px', 
                    minHeight: '24px',
                    fontSize: '11px',
                    fontWeight: 500,
                    borderRadius: '6px',
                    backgroundColor: '#8b5cf6',
                    border: '1px solid #8b5cf6'
                  }}
                >
                  {tSync('query.editor.astToGraph', 'AST → Graph')}
                </Button>
                </Group>

                {/* Query Management Group */}
                <Group gap="4px" style={{ padding: '2px', backgroundColor: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                <Button
                    size="xs"
                  variant="filled"
                  color="blue"
                  onClick={openSaveModal}
                  disabled={!query.trim() || !currentConnectionUuid}
                    leftSection={<IconDeviceFloppy size={12} />}
                  style={{ 
                      padding: '4px 8px', 
                      minHeight: '24px',
                    fontSize: '11px',
                      fontWeight: 500,
                    borderRadius: '6px',
                      backgroundColor: '#3b82f6',
                      border: '1px solid #3b82f6'
                  }}
                >
                  {tSync('query.editor.saveQuery', 'Save')}
                </Button>
                  
                  <Button
                    size="xs"
                    variant="filled"
                    color="green"
                    onClick={() => document.getElementById('query-file-input')?.click()}
                    disabled={false}
                    leftSection={<IconFileImport size={12} />}
                    style={{ 
                      padding: '4px 8px', 
                      minHeight: '24px',
                      fontSize: '11px',
                      fontWeight: 500,
                      borderRadius: '6px',
                      backgroundColor: '#059669',
                      border: '1px solid #059669'
                    }}
                  >
                    {tSync('query.editor.import', 'Import')}
                  </Button>
                </Group>
              </div>
            </div>
            
            {/* Hidden file input for importing queries */}
            <input
              id="query-file-input"
              type="file"
              accept=".sql,.soql,.txt,.json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (event) => {
                    const content = event.target?.result as string;
                    if (content) {
                      handleQueryChange(content);
                      
                      // Show success notification
                      notifications.show({
                        title: tSync('query.editor.import.success.title', 'Query Imported'),
                        message: tSync('query.editor.import.success.message', { fileName: file.name }) || `Successfully imported query from "${file.name}"`,
                        color: 'green',
                        icon: <IconFileImport size={16} />,
                        autoClose: 3000,
                      });
                      
                      // Reset file input
                      e.target.value = '';
                    }
                  };
                  reader.onerror = () => {
                    notifications.show({
                      title: tSync('query.editor.import.error.title', 'Import Failed'),
                      message: tSync('query.editor.import.error.message', 'Failed to read the selected file'),
                      color: 'red',
                      autoClose: 3000,
                    });
                    e.target.value = '';
                  };
                  reader.readAsText(file);
                }
              }}
            />
          </div>
          
          <div 
            className={`monaco-editor-container ${isDragOver ? 'drag-over' : ''}`}
              style={{ 
              height: '350px', 
              border: 'none',
              borderTop: '1px solid #e2e8f0'
            }}
          >
            <Editor
              height="100%"
              defaultLanguage="sql"
              value={query}
              onChange={handleQueryChange}
              onMount={handleEditorDidMount}
              options={{
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontSize: 12,
                fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                lineNumbers: 'on',
                roundedSelection: false,
                automaticLayout: true,
                wordWrap: 'on',
                folding: true,
                foldingStrategy: 'indentation',
                showFoldingControls: 'always',
                suggestOnTriggerCharacters: true,
                acceptSuggestionOnEnter: 'on',
                tabCompletion: 'on',
                wordBasedSuggestions: 'off',
                padding: { top: 8, bottom: 8 }
              }}

            />
      </div>
        </Paper>

      {/* Save Query Modal */}
      {showSaveModal && (
        <div className="save-query-modal-overlay" onClick={() => {
          setShowSaveModal(false);
          setSaveQueryName('');
        }}>
          <div className="save-query-modal" onClick={(e) => e.stopPropagation()}>
            <div className="save-query-modal-header">
              <h3>{tSync('query.editor.saveModal.title')}</h3>
              <button 
                className="save-query-modal-close"
                onClick={() => {
                  setShowSaveModal(false);
                  setSaveQueryName('');
                }}
              >
                ×
              </button>
            </div>
            
            <div className="save-query-modal-content">
              <div className="save-query-modal-input-group">
                <label>{tSync('query.editor.saveModal.name.label')}</label>
                <input
                  type="text"
                  placeholder={tSync('query.editor.saveModal.name.placeholder')}
                  value={saveQueryName}
                  onChange={(e) => setSaveQueryName(e.target.value)}
                  required
                />
                <small>{tSync('query.editor.saveModal.name.description')}</small>
              </div>
              
              <div className="save-query-modal-actions">
                <button 
                  className="save-query-modal-button cancel"
                  onClick={() => {
                    setShowSaveModal(false);
                    setSaveQueryName('');
                  }}
                >
                  {tSync('common.cancel')}
                </button>
                <button 
                  className="save-query-modal-button save"
                  onClick={handleSaveQuery}
                  disabled={!saveQueryName.trim() || isSaving}
                >
                  {isSaving ? 'Saving...' : tSync('query.editor.saveModal.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Draggable Separator */}
      {queryResult && resultsState === 'expanded' && (
        <div 
          className={`results-separator ${isDragging ? 'dragging' : ''}`}
          onMouseDown={handleDragStart}
          style={{
            height: '8px',
            backgroundColor: '#e5e7eb',
            cursor: 'row-resize',
            position: 'relative',
            borderTop: '1px solid #d1d5db',
            borderBottom: '1px solid #d1d5db',
            transition: 'background-color 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#3b82f6';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#e5e7eb';
          }}
        >
          <div style={{
            width: '40px',
            height: '4px',
            backgroundColor: '#9ca3af',
            borderRadius: '2px',
            transition: 'background-color 0.2s ease'
          }} />
        </div>
      )}

      {/* Query Results Section - Only show when there are results */}
      {queryResult && (
        <div 
          className={`results-section ${resultsState === 'collapsed' ? 'collapsed' : ''}`}
          style={{ 
            marginTop: '16px',
            flex: 1,
            overflow: 'hidden',
            minHeight: resultsState === 'collapsed' ? '30px' : '200px',
            maxHeight: resultsState === 'collapsed' ? '30px' : `${resultsHeight}px`,
            height: resultsState === 'collapsed' ? '30px' : `${resultsHeight}px`,
            transition: resultsState === 'collapsed' ? 'height 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94), flex 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)' : 'none',
            position: 'relative',
            zIndex: 1
          }}
        >
          {resultsState === 'collapsed' ? (
            <div style={{ 
              height: '30px',
              display: 'flex',
              alignItems: 'center',
              padding: '0 8px',
              borderBottom: '1px solid #e5e7eb',
              backgroundColor: '#f8fafc'
            }}>
              <Group gap={4}>
                  <ActionIcon 
                    variant="filled" 
                    size="sm" 
                    onClick={toggleResultsState}
                    style={{ 
                      cursor: 'pointer',
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)'
                    }}
                    title={tSync('app.expandResults', 'Expand Results')}
                  >
                    <IconChevronUp size={16} />
                  </ActionIcon>
                <Text size="xs" fw={500} c="dimmed">
                  {tSync('results.title', 'Results')}
                </Text>
                {queryResult && (
                  <Badge size="xs" variant="light" color="blue">
                    {queryResult.metadata?.total_size || 0} {tSync('app.records', 'records')}
                  </Badge>
                )}
              </Group>
            </div>
          ) : (
            <>
              <div style={{ 
                height: '30px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 16px',
                borderBottom: '1px solid #e5e7eb',
                backgroundColor: '#f8fafc'
              }}>
                <Group gap={8}>
                  <ActionIcon 
                    variant="filled" 
                    size="sm" 
                    onClick={toggleResultsState}
                    style={{ 
                      cursor: 'pointer',
                      backgroundColor: resultsState === 'expanded' ? '#ef4444' : '#10b981',
                      color: 'white',
                      boxShadow: resultsState === 'expanded' ? '0 2px 8px rgba(239, 68, 68, 0.3)' : '0 2px 8px rgba(16, 185, 129, 0.3)'
                    }}
                    title={resultsState === 'expanded' ? tSync('app.collapseResults', 'Collapse Results') : tSync('app.expandResults', 'Expand Results')}
                  >
                    {resultsState === 'expanded' ? <IconChevronDown size={16} /> : <IconChevronUp size={16} />}
                  </ActionIcon>
                  <Text size="sm" fw={600} c="dark">
                    {tSync('app.queryResults', 'Query Results')}
                  </Text>
                  {queryResult && (
                    <Badge size="sm" variant="light" color="blue">
                      {queryResult.records?.length || 0} {tSync('app.records', 'records')}
                    </Badge>
                  )}
                  {maxRecordsWarning && (
                    <Text size="xs" c="orange" fw={500} style={{ 
                      padding: '2px 6px',
                      backgroundColor: '#fff3cd',
                      border: '1px solid #ffeaa7',
                      borderRadius: '4px',
                      fontSize: '10px'
                    }}>
                      ⚠️ {maxRecordsWarning}
                    </Text>
                  )}
                  {maxRecordsReached && (
                    <Text size="xs" c="red" fw={500} style={{ 
                      padding: '2px 6px',
                      backgroundColor: '#fef2f2',
                      border: '1px solid #fecaca',
                      borderRadius: '4px',
                      fontSize: '10px'
                    }}>
                      🚫 {maxRecordsReached}
                    </Text>
                  )}
                </Group>
                <Group gap="xs">
                  {/* Export Button - Exact copy from original App.tsx */}
                  {queryResult && queryResult.records && queryResult.records.length > 0 && (
                    <Button 
                      variant="filled"
                      color="gray"
                      size="compact-xs" 
                      onClick={() => {
                        // Export functionality - exact copy from original
                        const event = new CustomEvent('exportData', { detail: { format: 'json' } });
                        window.dispatchEvent(event);
                      }}
                      leftSection={<IconDownload size={10} />}
                      style={{ 
                        padding: '2px 6px', 
                        minHeight: '20px',
                        fontSize: '10px',
                        fontWeight: 500,
                        borderRadius: '4px',
                        backgroundColor: '#6b7280',
                        border: '1px solid #6b7280'
                      }}
                    >
                      Export
                    </Button>
                  )}
                  
                  {/* Query More Button - Always show when there are results */}
                  {queryResult && queryResult.records && queryResult.records.length > 0 && (
                    <Button 
                      variant="filled"
                      color="blue"
                      size="compact-xs" 
                      onClick={onQueryMore}
                      disabled={isQuerying || (queryResult.records?.length || 0) >= maxRecordsLimit || !queryResult.metadata?.nextRecordsUrl}
                      leftSection={<IconChevronDown size={10} />}
                      style={{ 
                        padding: '2px 6px', 
                        minHeight: '20px',
                        fontSize: '10px',
                        fontWeight: 500,
                        borderRadius: '4px',
                        backgroundColor: (isQuerying || (queryResult.records?.length || 0) >= maxRecordsLimit || !queryResult.metadata?.nextRecordsUrl) ? '#94a3b8' : '#3b82f6',
                        border: `1px solid ${(isQuerying || (queryResult.records?.length || 0) >= maxRecordsLimit || !queryResult.metadata?.nextRecordsUrl) ? '#94a3b8' : '#3b82f6'}`
                      }}
                    >
                      {isQuerying ? tSync('common.loading', 'Loading...') : 
                       (queryResult.records?.length || 0) >= maxRecordsLimit ? tSync('results.maxReached', 'Max Reached') :
                       !queryResult.metadata?.nextRecordsUrl ? tSync('results.noMoreRecords', 'No More Records') : tSync('results.loadMore', 'Load More')}
                    </Button>
                  )}
                  
                </Group>
              </div>
              <div style={{ 
                height: 'calc(100% - 30px)',
                overflow: 'hidden' 
              }}>
                <ResultsViewPage
                  result={queryResult}
                  onRecordUpdate={onRecordUpdate}
                  onQueryMore={onQueryMore}
                  isLoading={isQuerying}
                />
              </div>
            </>
          )}
        </div>
      )}

    </div>
  );
};

