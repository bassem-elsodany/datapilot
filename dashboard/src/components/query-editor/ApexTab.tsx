import React, { useState, useEffect } from 'react';
import { logger } from '../../services/Logger';
import { Paper, Title, Text, Button, Group, Badge, Tabs, TextInput, Switch, Modal, ScrollArea, Flex, ActionIcon, Tooltip, Stack, Alert, Loader, Select } from '@mantine/core';
import { IconCode, IconDatabase, IconFile, IconSearch, IconDownload, IconUpload, IconPlayerPlay, IconStar, IconStarFilled, IconEdit, IconTrash, IconCopy, IconInfoCircle, IconBug, IconPlus, IconRefresh, IconX } from '@tabler/icons-react';
import { useTranslation, i18nService } from '../../services/I18nService';
import { notifications } from '@mantine/notifications';
import { ApiService } from '../../services/ApiService';
import { useSessionContext } from '../../contexts/SessionContext';
import Editor from '@monaco-editor/react';
import '../../assets/css/components/query-editor/ApexTab.css';

// ========================================
// INTERFACES REFLECTING BACKEND MODELS
// ========================================

// Debug Levels (from backend DebugLevels class)
export interface DebugLevels {
  DB: string;
  Workflow: string;
  Validation: string;
  Callouts: string;
  Apex_Code: string;
  Apex_Profiling: string;
}

// Apex Code Types (from backend ApexCodeType class)
export type ApexCodeType = 'anonymous' | 'class' | 'trigger' | 'interface' | 'enum' | 'test_class';

// Execution Status (from backend ExecutionStatus class)
export type ExecutionStatus = 'success' | 'error' | 'compilation_error' | 'runtime_error' | 'timeout' | 'limit_exceeded';

// Saved Apex Code (from backend SavedApex model)
export interface SavedApex {
  saved_apex_uuid: string;
  connection_uuid: string;
  name: string;
  description?: string;
  tags?: string;
  apex_code: string;
  code_type: ApexCodeType;
  debug_levels: DebugLevels;
  is_favorite: boolean;
  execution_count: number;
  last_executed?: string;
  last_execution_status?: ExecutionStatus;
  last_execution_time?: number;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
  version: number;
}

// Apex Execution Response (from backend ApexExecutionResponse)
export interface ApexExecutionResponse {
  success: boolean;
  compiled?: boolean;
  line?: number;
  column?: number;
  compile_problem?: string;
  exception_message?: string;
  exception_stack_trace?: string;
  debug_info?: any[];
  execution_time?: number;
  cpu_time?: number;
  dml_rows?: number;
  dml_statements?: number;
  soql_queries?: number;
  soql_rows_processed?: number;
  limit_exceptions?: any[];
  message?: string;
}

// Salesforce Apex Metadata (for future implementation)
export interface SalesforceApexClass {
  id: string;
  name: string;
  body: string;
  status: 'Active' | 'Inactive';
  isTest: boolean;
  lastModifiedDate: string;
  createdDate: string;
  createdBy: {
    id: string;
    name: string;
  };
  lastModifiedBy: {
    id: string;
    name: string;
  };
  lengthWithoutComments: number;
  metadata: {
    apiVersion: number;
    status: string;
    description?: string;
  };
}

export interface SalesforceApexTrigger {
  id: string;
  name: string;
  body: string;
  status: 'Active' | 'Inactive';
  tableEnumOrId: string; // The SObject this trigger is for
  usageBeforeInsert: boolean;
  usageAfterInsert: boolean;
  usageBeforeUpdate: boolean;
  usageAfterUpdate: boolean;
  usageBeforeDelete: boolean;
  usageAfterDelete: boolean;
  usageIsBulk: boolean;
  usageIsAfterUndelete: boolean;
  lastModifiedDate: string;
  createdDate: string;
  createdBy: {
    id: string;
    name: string;
  };
  lastModifiedBy: {
    id: string;
    name: string;
  };
  lengthWithoutComments: number;
  metadata: {
    apiVersion: number;
    status: string;
    description?: string;
  };
}

// ========================================
// COMPONENT STATE INTERFACES
// ========================================

interface ApexTabState {
  activeTab: 'saved' | 'classes' | 'triggers' | 'tests';
  selectedClass: SalesforceApexClass | null;
  selectedTrigger: SalesforceApexTrigger | null;
  searchTerm: string;
  filterStatus: string;
  filterCodeType: string;
  showFavoritesOnly: boolean;
  isLoading: boolean;
  isExecuting: boolean;
  executionResult: ApexExecutionResponse | null;
  showExecutionModal: boolean;
  showCreateModal: boolean;
  showEditModal: boolean;
  showEditPanel: boolean;
  isRunningTests: boolean;
  testResults: any;
  showTestResultsModal: boolean;
}

interface ApexFormData {
  name: string;
  description: string;
  tags: string;
  apex_code: string;
  code_type: ApexCodeType;
  debug_levels: DebugLevels;
  is_favorite: boolean;
}

// ========================================
// MAIN COMPONENT
// ========================================

export const ApexTab: React.FC = () => {
  const { tSync } = useTranslation();
  
  // State management
  const [state, setState] = useState<ApexTabState>({
    activeTab: 'saved',
    selectedClass: null,
    selectedTrigger: null,
    searchTerm: '',
    filterStatus: 'all',
    filterCodeType: 'all',
    showFavoritesOnly: false,
    isLoading: false,
    isExecuting: false,
    executionResult: null,
    showExecutionModal: false,
    showCreateModal: false,
    showEditModal: false,
    showEditPanel: false,
    isRunningTests: false,
    testResults: null,
    showTestResultsModal: false,
  });

  // Data state
  const [savedApexList, setSavedApexList] = useState<SavedApex[]>([]);
  const [apexClasses, setApexClasses] = useState<SalesforceApexClass[]>([]);
  const [apexTriggers, setApexTriggers] = useState<SalesforceApexTrigger[]>([]);
  
  // Form state
  const [formData, setFormData] = useState<ApexFormData>({
    name: '',
    description: '',
    tags: '',
    apex_code: '',
    code_type: 'anonymous',
    debug_levels: {
      DB: 'NONE',
      Workflow: 'NONE',
      Validation: 'NONE',
      Callouts: 'NONE',
      Apex_Code: 'NONE',
      Apex_Profiling: 'NONE'
    },
    is_favorite: false
  });

  const [editingApex, setEditingApex] = useState<SavedApex | null>(null);

  // Debug log viewer state
  const [debugLogSearch, setDebugLogSearch] = useState('');

  // Test runner state
  const [testInput, setTestInput] = useState('');
  const [testRunning, setTestRunning] = useState(false);

  // Load data on component mount
  useEffect(() => {
    loadSavedApexData();
    // Note: Loading actual Salesforce Apex metadata would require additional API endpoints
    // loadSalesforceApexData();
  }, []);

  // Get context
  const { currentConnectionUuid } = useSessionContext();
  const apiService = ApiService.getInstance();

  // ========================================
  // DATA LOADING FUNCTIONS
  // ========================================

  const loadSavedApexData = async () => {
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      if (!currentConnectionUuid) {
        throw new Error('No active connection');
      }

      const apexList = await apiService.getSavedApexList(currentConnectionUuid);
      setSavedApexList(apexList);
    } catch (error) {
      logger.error('Failed to load saved Apex data', 'ApexTab', null, error as Error);
      notifications.show({
        title: 'Failed to load Apex code',
        message: (error as Error).message,
        color: 'red',
        icon: <IconBug size={16} />
      });
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  const loadApexClasses = async () => {
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      if (!currentConnectionUuid) {
        throw new Error('No active connection');
      }

      const response = await apiService.getApexClasses(currentConnectionUuid);
      const classes = response.records || [];

      // Transform the response to match our interface
      const transformedClasses: SalesforceApexClass[] = classes.map((cls: any) => ({
        id: cls.Id,
        name: cls.Name,
        body: cls.Body || '',
        status: cls.Status || 'Active',
        isTest: cls.Body ? cls.Body.toLowerCase().includes('@istest') : false,
        lastModifiedDate: cls.LastModifiedDate,
        createdDate: cls.CreatedDate,
        createdBy: { id: '', name: '' },
        lastModifiedBy: { id: '', name: '' },
        lengthWithoutComments: (cls.Body || '').length,
        metadata: {
          apiVersion: cls.ApiVersion || 64,
          status: cls.Status || 'Active'
        }
      }));

      setApexClasses(transformedClasses);
    } catch (error) {
      logger.error('Failed to load Apex classes', 'ApexTab', null, error as Error);
      notifications.show({
        title: 'Failed to load Apex classes',
        message: (error as Error).message,
        color: 'red',
        icon: <IconBug size={16} />
      });
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  const loadApexTriggers = async () => {
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      if (!currentConnectionUuid) {
        throw new Error('No active connection');
      }

      const response = await apiService.getApexTriggers(currentConnectionUuid);
      const triggers = response.records || [];

      // Transform the response to match our interface
      const transformedTriggers: SalesforceApexTrigger[] = triggers.map((trigger: any) => ({
        id: trigger.Id,
        name: trigger.Name,
        body: trigger.Body || '',
        status: trigger.Status || 'Active',
        tableEnumOrId: trigger.TableEnumOrId || '',
        usageBeforeInsert: trigger.Body ? trigger.Body.toLowerCase().includes('before insert') : false,
        usageAfterInsert: trigger.Body ? trigger.Body.toLowerCase().includes('after insert') : false,
        usageBeforeUpdate: trigger.Body ? trigger.Body.toLowerCase().includes('before update') : false,
        usageAfterUpdate: trigger.Body ? trigger.Body.toLowerCase().includes('after update') : false,
        usageBeforeDelete: trigger.Body ? trigger.Body.toLowerCase().includes('before delete') : false,
        usageAfterDelete: trigger.Body ? trigger.Body.toLowerCase().includes('after delete') : false,
        usageIsBulk: true,
        usageIsAfterUndelete: trigger.Body ? trigger.Body.toLowerCase().includes('after undelete') : false,
        lastModifiedDate: trigger.LastModifiedDate,
        createdDate: trigger.CreatedDate,
        createdBy: { id: '', name: '' },
        lastModifiedBy: { id: '', name: '' },
        lengthWithoutComments: (trigger.Body || '').length,
        metadata: {
          apiVersion: trigger.ApiVersion || 64,
          status: trigger.Status || 'Active'
        }
      }));

      setApexTriggers(transformedTriggers);
    } catch (error) {
      logger.error('Failed to load Apex triggers', 'ApexTab', null, error as Error);
      notifications.show({
        title: 'Failed to load Apex triggers',
        message: (error as Error).message,
        color: 'red',
        icon: <IconBug size={16} />
      });
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  // ========================================
  // FILTERING AND SEARCH
  // ========================================

  const filteredSavedApex = savedApexList.filter(apex => {
    const matchesSearch = apex.name.toLowerCase().includes(state.searchTerm.toLowerCase()) ||
                         apex.description?.toLowerCase().includes(state.searchTerm.toLowerCase()) ||
                         apex.tags?.toLowerCase().includes(state.searchTerm.toLowerCase()) ||
                         apex.apex_code.toLowerCase().includes(state.searchTerm.toLowerCase());
    
    const matchesStatus = state.filterStatus === 'all' || 
                         (state.filterStatus === 'favorite' && apex.is_favorite) ||
                         (state.filterStatus === 'recent' && apex.last_executed);
    
    const matchesCodeType = state.filterCodeType === 'all' || apex.code_type === state.filterCodeType;
    
    return matchesSearch && matchesStatus && matchesCodeType;
  });

  // ========================================
  // ACTION HANDLERS
  // ========================================

  const handleExecuteApex = async (apex: SavedApex) => {
    setState(prev => ({ ...prev, isExecuting: true, showExecutionModal: true }));
    try {
      if (!currentConnectionUuid) {
        throw new Error('No active connection');
      }

      const result = await apiService.executeAnonymousApex(currentConnectionUuid, {
        apex_code: apex.apex_code,
        debug_levels: apex.debug_levels
      });

      setState(prev => ({
        ...prev,
        executionResult: result,
        isExecuting: false
      }));
    } catch (error) {
      logger.error('Failed to execute Apex code', 'ApexTab', null, error as Error);
      setState(prev => ({
        ...prev,
        executionResult: {
          success: false,
          message: (error as Error).message
        },
        isExecuting: false
      }));
    }
  };

  const handleToggleFavorite = async (apex: SavedApex) => {
    try {
      await apiService.toggleApexFavorite(apex.saved_apex_uuid);

      // Update local state optimistically
      setSavedApexList(prev => prev.map(item =>
        item.saved_apex_uuid === apex.saved_apex_uuid
          ? { ...item, is_favorite: !item.is_favorite }
          : item
      ));

      notifications.show({
        title: apex.is_favorite ? 'Removed from favorites' : 'Added to favorites',
        message: `"${apex.name}" ${apex.is_favorite ? 'removed from' : 'added to'} favorites`,
        color: 'green',
        autoClose: 2000,
      });
    } catch (error) {
      logger.error('Failed to toggle favorite', 'ApexTab', null, error as Error);
      notifications.show({
        title: 'Failed',
        message: (error as Error).message,
        color: 'red',
        autoClose: 2000,
      });
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    notifications.show({
      title: 'Code Copied',
      message: 'Apex code copied to clipboard',
      color: 'green',
      autoClose: 2000,
    });
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      tags: '',
      apex_code: '',
      code_type: 'anonymous',
      debug_levels: {
        DB: 'NONE',
        Workflow: 'NONE',
        Validation: 'NONE',
        Callouts: 'NONE',
        Apex_Code: 'NONE',
        Apex_Profiling: 'NONE'
      },
      is_favorite: false
    });
    setEditingApex(null);
  };

  const openCreateModal = () => {
    resetForm();
    setState(prev => ({ ...prev, showCreateModal: true }));
  };

  const openEditModal = (apex: SavedApex) => {
    setFormData({
      name: apex.name,
      description: apex.description || '',
      tags: apex.tags || '',
      apex_code: apex.apex_code,
      code_type: apex.code_type,
      debug_levels: apex.debug_levels,
      is_favorite: apex.is_favorite
    });
    setEditingApex(apex);
    setState(prev => ({ ...prev, showEditPanel: true }));
  };

  const handleCreateApex = async () => {
    try {
      if (!currentConnectionUuid) {
        throw new Error('No active connection');
      }

      if (!formData.name.trim()) {
        notifications.show({
          title: 'Validation Error',
          message: 'Please enter a name for the Apex code',
          color: 'yellow',
          autoClose: 3000,
        });
        return;
      }

      if (!formData.apex_code.trim()) {
        notifications.show({
          title: 'Validation Error',
          message: 'Please enter Apex code',
          color: 'yellow',
          autoClose: 3000,
        });
        return;
      }

      await apiService.createSavedApex({
        connection_uuid: currentConnectionUuid,
        name: formData.name,
        apex_code: formData.apex_code,
        code_type: formData.code_type,
        description: formData.description,
        tags: formData.tags,
        is_favorite: formData.is_favorite,
        debug_levels: formData.debug_levels
      });

      setState(prev => ({ ...prev, showCreateModal: false }));
      resetForm();
      await loadSavedApexData();

      notifications.show({
        title: 'Apex Code Created',
        message: 'Saved Apex code created successfully',
        color: 'green',
        autoClose: 3000,
      });
    } catch (error) {
      logger.error('Failed to create Apex code', 'ApexTab', null, error as Error);
      notifications.show({
        title: 'Creation Failed',
        message: (error as Error).message,
        color: 'red',
        autoClose: 3000,
      });
    }
  };

  const handleUpdateApex = async () => {
    if (!editingApex) return;

    try {
      if (!formData.name.trim()) {
        notifications.show({
          title: 'Validation Error',
          message: 'Please enter a name for the Apex code',
          color: 'yellow',
          autoClose: 3000,
        });
        return;
      }

      if (!formData.apex_code.trim()) {
        notifications.show({
          title: 'Validation Error',
          message: 'Please enter Apex code',
          color: 'yellow',
          autoClose: 3000,
        });
        return;
      }

      await apiService.updateSavedApex(editingApex.saved_apex_uuid, {
        name: formData.name,
        apex_code: formData.apex_code,
        code_type: formData.code_type,
        description: formData.description,
        tags: formData.tags,
        is_favorite: formData.is_favorite,
        debug_levels: formData.debug_levels
      });

      setState(prev => ({ ...prev, showEditPanel: false }));
      setEditingApex(null);
      resetForm();
      await loadSavedApexData();

      notifications.show({
        title: 'Apex Code Updated',
        message: 'Saved Apex code updated successfully',
        color: 'green',
        autoClose: 3000,
      });
    } catch (error) {
      logger.error('Failed to update Apex code', 'ApexTab', null, error as Error);
      notifications.show({
        title: 'Update Failed',
        message: (error as Error).message,
        color: 'red',
        autoClose: 3000,
      });
    }
  };

  const handleDeleteApex = async (apex: SavedApex) => {
    try {
      await apiService.deleteSavedApex(apex.saved_apex_uuid);
      await loadSavedApexData();

      notifications.show({
        title: 'Apex Code Deleted',
        message: `"${apex.name}" deleted successfully`,
        color: 'green',
        autoClose: 3000,
      });
    } catch (error) {
      logger.error('Failed to delete Apex code', 'ApexTab', null, error as Error);
      notifications.show({
        title: 'Deletion Failed',
        message: (error as Error).message,
        color: 'red',
        autoClose: 3000,
      });
    }
  };

  const handleRunTests = async () => {
    try {
      if (!currentConnectionUuid) {
        throw new Error('No active connection');
      }

      if (!testInput.trim()) {
        notifications.show({
          title: 'Validation Error',
          message: 'Please enter test class names (comma-separated)',
          color: 'yellow',
          autoClose: 3000,
        });
        return;
      }

      setTestRunning(true);

      // Parse test class names (comma-separated)
      const testClasses = testInput
        .split(',')
        .map(cls => cls.trim())
        .filter(cls => cls.length > 0);

      const result = await apiService.runApexTests(currentConnectionUuid, {
        test_classes: testClasses
      });

      setState(prev => ({
        ...prev,
        testResults: result,
        showTestResultsModal: true
      }));

      notifications.show({
        title: 'Tests Completed',
        message: 'Test execution completed successfully',
        color: 'green',
        autoClose: 3000,
      });
    } catch (error) {
      logger.error('Failed to run tests', 'ApexTab', null, error as Error);
      notifications.show({
        title: 'Test Execution Failed',
        message: (error as Error).message,
        color: 'red',
        autoClose: 3000,
      });
    } finally {
      setTestRunning(false);
    }
  };

  // ========================================
  // HELPER FUNCTIONS
  // ========================================

  const getFilteredDebugLogs = (): string[] => {
    if (!state.executionResult?.debug_info) return [];

    if (!debugLogSearch.trim()) {
      return state.executionResult.debug_info;
    }

    const searchLower = debugLogSearch.toLowerCase();
    return state.executionResult.debug_info.filter(log =>
      typeof log === 'string' ? log.toLowerCase().includes(searchLower) : JSON.stringify(log).toLowerCase().includes(searchLower)
    );
  };

  // ========================================
  // RENDER FUNCTIONS
  // ========================================

  const renderSavedApexItem = (apex: SavedApex) => (
    <div
      key={apex.saved_apex_uuid}
      className="apex-item"
    >
      <div className="apex-item-row apex-item-row-1">
        <div className="apex-item-info">
          <IconCode size={16} className="apex-item-icon" />
          <div className="apex-item-details">
            <Text size="sm" fw={500}>{apex.name}</Text>
          </div>
        </div>
        <div className="apex-item-badges">
          <Badge size="xs" color={apex.code_type === 'class' ? 'blue' : 'purple'}>
            {apex.code_type}
          </Badge>
          {apex.is_favorite && <Badge size="xs" color="yellow">★</Badge>}
        </div>
      </div>
      
      <div className="apex-item-row apex-item-row-2">
        <div className="apex-item-description">
          <Text size="xs" c="dimmed">{apex.description}</Text>
        </div>
        <div className="apex-item-meta">
          <Badge size="xs" color="gray">{tSync('saved_apex.code.executions', { count: apex.execution_count })}</Badge>
          <Text size="xs" c="dimmed">
            {tSync('saved_apex.code.last_executed', { date: new Date(apex.last_executed || apex.created_at).toLocaleDateString() })}
          </Text>
        </div>
      </div>
      
      <div className="apex-item-row apex-item-row-3">
        <div className="apex-item-actions">
          <ActionIcon
            size="sm"
            variant="subtle"
            onClick={(e) => {
              e.stopPropagation();
              handleToggleFavorite(apex);
            }}
          >
            {apex.is_favorite ? <IconStarFilled size={14} color="#ffd700" /> : <IconStar size={14} />}
          </ActionIcon>
          <ActionIcon
            size="sm"
            variant="subtle"
            onClick={(e) => {
              e.stopPropagation();
              handleExecuteApex(apex);
            }}
          >
            <IconPlayerPlay size={14} />
          </ActionIcon>
          <ActionIcon
            size="sm"
            variant="subtle"
            onClick={(e) => {
              e.stopPropagation();
              handleCopyCode(apex.apex_code);
            }}
          >
            <IconCopy size={14} />
          </ActionIcon>
          <ActionIcon
            size="sm"
            variant="subtle"
            onClick={(e) => {
              e.stopPropagation();
              openEditModal(apex);
            }}
          >
            <IconEdit size={14} />
          </ActionIcon>
          <ActionIcon
            size="sm"
            variant="subtle"
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteApex(apex);
            }}
          >
            <IconTrash size={14} />
          </ActionIcon>
        </div>
      </div>
    </div>
  );



  // ========================================
  // MAIN RENDER
  // ========================================

  return (
    <div className="apex-tab">
      <div className="apex-tab-header">
        <div className="apex-tab-title">
          <IconCode size={20} className="apex-tab-icon" />
          <span>{tSync('apex.title')}</span>
        </div>
        <div className="apex-tab-subtitle">
          {tSync('apex.subtitle')}
        </div>
      </div>

      <div className="apex-tab-content">
        <div className="apex-controls">
          <div className="apex-search">
            <TextInput
              placeholder={tSync('apex.search.placeholder')}
              value={state.searchTerm}
              onChange={(e) => setState(prev => ({ ...prev, searchTerm: e.currentTarget.value }))}
              leftSection={<IconSearch size={16} />}
              size="sm"
            />
          </div>
          
          <div className="apex-filters">
            <select
              value={state.filterStatus}
              onChange={(e) => setState(prev => ({ ...prev, filterStatus: e.target.value }))}
              style={{
                padding: '8px 12px',
                border: '1px solid #ced4da',
                borderRadius: '6px',
                fontSize: '14px',
                backgroundColor: '#f8f9fa',
                minWidth: '150px',
                color: '#6c757d'
              }}
            >
              <option value="all">{tSync('apex.filter.status.all')}</option>
              <option value="favorite">{tSync('saved_apex.tabs.favorites', { count: 0 })}</option>
              <option value="recent">{tSync('saved_apex.tabs.recent', { count: 0 })}</option>
            </select>
            
            <select
              value={state.filterCodeType}
              onChange={(e) => setState(prev => ({ ...prev, filterCodeType: e.target.value }))}
              style={{
                padding: '8px 12px',
                border: '1px solid #ced4da',
                borderRadius: '6px',
                fontSize: '14px',
                backgroundColor: '#f8f9fa',
                minWidth: '150px',
                color: '#6c757d'
              }}
            >
              <option value="all">{tSync('saved_apex.filter.type.all')}</option>
              <option value="anonymous">{tSync('saved_apex.filter.type.anonymous')}</option>
              <option value="class">{tSync('saved_apex.filter.type.class')}</option>
              <option value="trigger">{tSync('saved_apex.filter.type.trigger')}</option>
              <option value="interface">{tSync('saved_apex.filter.type.interface')}</option>
              <option value="enum">{tSync('saved_apex.filter.type.enum')}</option>
              <option value="test_class">{tSync('saved_apex.filter.type.test_class')}</option>
            </select>
          </div>

          <div className="apex-actions">
            <Button
              leftSection={<IconRefresh size={14} />}
              variant="light"
              size="xs"
              onClick={loadSavedApexData}
              loading={state.isLoading}
              className="query-tab-page-button"
              style={{ 
                padding: '6px 12px', 
                minHeight: '28px',
                fontSize: '11px',
                fontWeight: 600,
                borderRadius: '6px',
                transition: 'all 0.2s ease'
              }}
            >
              {tSync('common.actions.refresh', 'Refresh')}
            </Button>
            <Button
              leftSection={<IconPlus size={14} />}
              size="xs"
              onClick={openCreateModal}
              className="query-tab-save-button"
              style={{
                padding: '6px 12px',
                minHeight: '28px',
                fontSize: '11px',
                fontWeight: 600,
                borderRadius: '6px',
                transition: 'all 0.2s ease'
              }}
            >
              {tSync('saved_apex.actions.create', 'Create Apex')}
            </Button>
          </div>
        </div>

        <div className="apex-main">
          <Tabs value={state.activeTab} onChange={(value) => setState(prev => ({ ...prev, activeTab: value as any || 'saved' }))}>
            <Tabs.List>
              <Tabs.Tab value="saved" leftSection={<IconCode size={16} />}>
                {tSync('saved_apex.tabs.all', { count: filteredSavedApex.length })}
              </Tabs.Tab>
              <Tabs.Tab value="classes" leftSection={<IconFile size={16} />}>
                {tSync('saved_apex.filter.type.class', { count: apexClasses.length })}
              </Tabs.Tab>
              <Tabs.Tab value="triggers" leftSection={<IconCode size={16} />}>
                {tSync('saved_apex.filter.type.trigger', { count: apexTriggers.length })}
              </Tabs.Tab>
              <Tabs.Tab value="tests" leftSection={<IconPlayerPlay size={16} />}>
                Test Runner
              </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="saved" className="apex-panel">
              <div className="apex-list">
                <div className="apex-items">
                  {filteredSavedApex.map(renderSavedApexItem)}
                </div>
                
                {state.showEditPanel && (editingApex || state.selectedClass || state.selectedTrigger) && (
                  <div className="apex-edit-panel">
                    <div className="apex-edit-header">
                      <Text size="md" fw={600}>
                        {editingApex ? 'Edit Apex Code' : state.selectedClass ? `View Class: ${state.selectedClass.name}` : `View Trigger: ${state.selectedTrigger?.name}`}
                      </Text>
                      <ActionIcon
                        variant="light"
                        color="gray"
                        onClick={() => setState(prev => ({ ...prev, showEditPanel: false, selectedClass: null, selectedTrigger: null }))}
                      >
                        <IconX size={16} />
                      </ActionIcon>
                    </div>
                    
                    <div className="apex-edit-content">
                      {editingApex && (
                        <div className="apex-edit-compact-fields">
                          <Group gap="md">
                            <TextInput
                              label={tSync('apex.form.name', 'Name')}
                              placeholder={tSync('apex.form.namePlaceholder', 'Enter Apex code name')}
                              value={formData.name}
                              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                              required
                              style={{ flex: 1 }}
                            />

                            <TextInput
                              label={tSync('apex.form.description', 'Description')}
                              placeholder={tSync('apex.form.descriptionPlaceholder', 'Optional description')}
                              value={formData.description}
                              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                              style={{ flex: 1 }}
                            />

                            <TextInput
                              label={tSync('apex.form.tags', 'Tags')}
                              placeholder={tSync('apex.form.tagsPlaceholder', 'Comma-separated tags')}
                              value={formData.tags}
                              onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                              style={{ flex: 1 }}
                            />
                          </Group>

                          <Group gap="md" align="center">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '0 0 120px' }}>
                              <Text size="sm" fw={500} style={{ whiteSpace: 'nowrap' }}>Code Type</Text>
                              <select
                                value={formData.code_type}
                                onChange={(e) => setFormData({ ...formData, code_type: e.target.value as ApexCodeType })}
                                style={{
                                  padding: '8px 12px',
                                  border: '1px solid #ced4da',
                                  borderRadius: '6px',
                                  fontSize: '14px',
                                  backgroundColor: 'white',
                                  flex: 1
                                }}
                              >
                                <option value="anonymous">Anonymous</option>
                                <option value="class">Class</option>
                                <option value="trigger">Trigger</option>
                                <option value="interface">Interface</option>
                                <option value="enum">Enum</option>
                                <option value="test_class">Test Class</option>
                              </select>
                            </div>

                            <Switch
                              label={tSync('apex.form.favorite', 'Favorite')}
                              checked={formData.is_favorite}
                              onChange={(e) => setFormData({ ...formData, is_favorite: e.target.checked })}
                            />
                          </Group>
                        </div>
                      )}

                      {!editingApex && (state.selectedClass || state.selectedTrigger) && (
                        <div className="apex-edit-compact-fields">
                          {state.selectedClass && (
                            <Group gap="md" mb="md">
                              <div style={{ flex: 1 }}>
                                <Text size="sm" fw={500}>Status</Text>
                                <Badge size="sm" variant="light" color={state.selectedClass.status === 'Active' ? 'green' : 'gray'} mt="xs">
                                  {state.selectedClass.status}
                                </Badge>
                              </div>
                              <div style={{ flex: 1 }}>
                                <Text size="sm" fw={500}>API Version</Text>
                                <Text size="sm" mt="xs">{state.selectedClass.metadata.apiVersion}</Text>
                              </div>
                              <div style={{ flex: 1 }}>
                                <Text size="sm" fw={500}>Created</Text>
                                <Text size="xs" mt="xs">{new Date(state.selectedClass.createdDate).toLocaleDateString()}</Text>
                              </div>
                            </Group>
                          )}
                          {state.selectedTrigger && (
                            <Group gap="md" mb="md">
                              <div style={{ flex: 1 }}>
                                <Text size="sm" fw={500}>SObject</Text>
                                <Text size="sm" mt="xs">{state.selectedTrigger.tableEnumOrId}</Text>
                              </div>
                              <div style={{ flex: 1 }}>
                                <Text size="sm" fw={500}>Status</Text>
                                <Badge size="sm" variant="light" color={state.selectedTrigger.status === 'Active' ? 'green' : 'gray'} mt="xs">
                                  {state.selectedTrigger.status}
                                </Badge>
                              </div>
                              <div style={{ flex: 1 }}>
                                <Text size="sm" fw={500}>API Version</Text>
                                <Text size="sm" mt="xs">{state.selectedTrigger.metadata.apiVersion}</Text>
                              </div>
                            </Group>
                          )}
                        </div>
                      )}

                      {editingApex && (
                        <div style={{ borderTop: '1px solid #e9ecef', paddingTop: '12px' }}>
                          <Text size="sm" fw={500} mb="sm">Debug Levels</Text>
                          <Group gap="sm" grow>
                          <div>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, marginBottom: '3px' }}>DB</label>
                            <select
                              value={formData.debug_levels.DB}
                              onChange={(e) => setFormData({ ...formData, debug_levels: { ...formData.debug_levels, DB: e.target.value } })}
                              style={{ width: '100%', padding: '5px 6px', border: '1px solid #ced4da', borderRadius: '3px', fontSize: '11px' }}
                            >
                              <option value="NONE">NONE</option>
                              <option value="ERROR">ERROR</option>
                              <option value="WARN">WARN</option>
                              <option value="INFO">INFO</option>
                              <option value="DEBUG">DEBUG</option>
                              <option value="FINE">FINE</option>
                              <option value="FINER">FINER</option>
                              <option value="FINEST">FINEST</option>
                            </select>
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, marginBottom: '3px' }}>Workflow</label>
                            <select
                              value={formData.debug_levels.Workflow}
                              onChange={(e) => setFormData({ ...formData, debug_levels: { ...formData.debug_levels, Workflow: e.target.value } })}
                              style={{ width: '100%', padding: '5px 6px', border: '1px solid #ced4da', borderRadius: '3px', fontSize: '11px' }}
                            >
                              <option value="NONE">NONE</option>
                              <option value="ERROR">ERROR</option>
                              <option value="WARN">WARN</option>
                              <option value="INFO">INFO</option>
                              <option value="DEBUG">DEBUG</option>
                            </select>
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, marginBottom: '3px' }}>Validation</label>
                            <select
                              value={formData.debug_levels.Validation}
                              onChange={(e) => setFormData({ ...formData, debug_levels: { ...formData.debug_levels, Validation: e.target.value } })}
                              style={{ width: '100%', padding: '5px 6px', border: '1px solid #ced4da', borderRadius: '3px', fontSize: '11px' }}
                            >
                              <option value="NONE">NONE</option>
                              <option value="ERROR">ERROR</option>
                              <option value="WARN">WARN</option>
                              <option value="INFO">INFO</option>
                              <option value="DEBUG">DEBUG</option>
                            </select>
                          </div>
                        </Group>
                        <Group gap="sm" grow mt="xs">
                          <div>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, marginBottom: '3px' }}>Callouts</label>
                            <select
                              value={formData.debug_levels.Callouts}
                              onChange={(e) => setFormData({ ...formData, debug_levels: { ...formData.debug_levels, Callouts: e.target.value } })}
                              style={{ width: '100%', padding: '5px 6px', border: '1px solid #ced4da', borderRadius: '3px', fontSize: '11px' }}
                            >
                              <option value="NONE">NONE</option>
                              <option value="ERROR">ERROR</option>
                              <option value="WARN">WARN</option>
                              <option value="INFO">INFO</option>
                              <option value="DEBUG">DEBUG</option>
                            </select>
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, marginBottom: '3px' }}>Apex Code</label>
                            <select
                              value={formData.debug_levels.Apex_Code}
                              onChange={(e) => setFormData({ ...formData, debug_levels: { ...formData.debug_levels, Apex_Code: e.target.value } })}
                              style={{ width: '100%', padding: '5px 6px', border: '1px solid #ced4da', borderRadius: '3px', fontSize: '11px' }}
                            >
                              <option value="NONE">NONE</option>
                              <option value="ERROR">ERROR</option>
                              <option value="WARN">WARN</option>
                              <option value="INFO">INFO</option>
                              <option value="DEBUG">DEBUG</option>
                              <option value="FINE">FINE</option>
                              <option value="FINER">FINER</option>
                              <option value="FINEST">FINEST</option>
                            </select>
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, marginBottom: '3px' }}>Apex Profiling</label>
                            <select
                              value={formData.debug_levels.Apex_Profiling}
                              onChange={(e) => setFormData({ ...formData, debug_levels: { ...formData.debug_levels, Apex_Profiling: e.target.value } })}
                              style={{ width: '100%', padding: '5px 6px', border: '1px solid #ced4da', borderRadius: '3px', fontSize: '11px' }}
                            >
                              <option value="NONE">NONE</option>
                              <option value="ERROR">ERROR</option>
                              <option value="WARN">WARN</option>
                              <option value="INFO">INFO</option>
                              <option value="DEBUG">DEBUG</option>
                            </select>
                          </div>
                        </Group>
                        </div>
                      )}

                      <div className="apex-edit-code-section">
                        <Text size="sm" fw={500} mb="xs">Apex Code {!editingApex && '(Read-only)'}</Text>
                        <Editor
                          height="400px"
                          defaultLanguage="apex"
                          value={editingApex ? formData.apex_code : (state.selectedClass?.body || state.selectedTrigger?.body || '')}
                          onChange={(value) => editingApex && setFormData({ ...formData, apex_code: value || '' })}
                          options={{
                            minimap: { enabled: false },
                            lineNumbers: 'on',
                            fontSize: 13,
                            fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                            tabSize: 2,
                            wordWrap: 'on',
                            readOnly: !editingApex
                          }}
                        />
                      </div>

                      <Group justify="flex-end" gap="sm">
                        <Button
                          variant="light"
                          size="xs"
                          onClick={() => setState(prev => ({ ...prev, showEditPanel: false, selectedClass: null, selectedTrigger: null }))}
                          style={{
                            padding: '6px 12px',
                            minHeight: '28px',
                            fontSize: '11px',
                            fontWeight: 600,
                            borderRadius: '6px',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          {editingApex ? 'Cancel' : 'Close'}
                        </Button>
                        {editingApex && (
                          <Button
                            size="xs"
                            onClick={handleUpdateApex}
                            className="query-tab-save-button"
                            style={{
                              padding: '6px 12px',
                              minHeight: '28px',
                              fontSize: '11px',
                              fontWeight: 600,
                              borderRadius: '6px',
                              transition: 'all 0.2s ease'
                            }}
                          >
                            Update Apex Code
                          </Button>
                        )}
                      </Group>
                    </div>
                  </div>
                )}
              </div>
            </Tabs.Panel>

            <Tabs.Panel value="classes" className="apex-panel">
              <div className="apex-list">
                <Group justify="space-between" mb="md" px="md" pt="md">
                  <TextInput
                    placeholder="Search classes..."
                    leftSection={<IconSearch size={16} />}
                    value={state.searchTerm}
                    onChange={(e) => setState(prev => ({ ...prev, searchTerm: e.currentTarget.value }))}
                    style={{ flex: 1 }}
                  />
                  <Button
                    onClick={loadApexClasses}
                    loading={state.isLoading}
                    leftSection={<IconRefresh size={16} />}
                    variant="light"
                  >
                    Load Classes
                  </Button>
                </Group>

                {state.isLoading && (
                  <Flex justify="center" align="center" py="xl">
                    <Loader size="sm" />
                  </Flex>
                )}

                {!state.isLoading && apexClasses.length === 0 && (
                  <Text size="sm" c="dimmed" ta="center" py="xl">
                    No Apex classes found. Click "Load Classes" to fetch from your Salesforce org.
                  </Text>
                )}

                <ScrollArea h={600}>
                  <div className="apex-items">
                    {apexClasses
                      .filter(cls =>
                        cls.name.toLowerCase().includes(state.searchTerm.toLowerCase()) ||
                        cls.body.toLowerCase().includes(state.searchTerm.toLowerCase())
                      )
                      .map((apexClass) => (
                        <Paper key={apexClass.id} p="md" mb="sm" className="apex-item" radius="md">
                          <Group justify="space-between" mb="xs">
                            <div>
                              <Text fw={600} size="sm">{apexClass.name}</Text>
                              <Group gap="xs" mt={4}>
                                <Badge size="sm" variant="light" color={apexClass.status === 'Active' ? 'green' : 'gray'}>
                                  {apexClass.status}
                                </Badge>
                                {apexClass.isTest && (
                                  <Badge size="sm" variant="light" color="blue">
                                    Test Class
                                  </Badge>
                                )}
                                <Badge size="sm" variant="light" color="cyan">
                                  {apexClass.lengthWithoutComments} chars
                                </Badge>
                              </Group>
                            </div>
                            <Tooltip label="View code">
                              <ActionIcon
                                variant="light"
                                onClick={() => setState(prev => ({
                                  ...prev,
                                  selectedClass: apexClass,
                                  showEditPanel: true
                                }))}
                              >
                                <IconFile size={16} />
                              </ActionIcon>
                            </Tooltip>
                          </Group>
                          <Text size="xs" c="dimmed">
                            {new Date(apexClass.lastModifiedDate).toLocaleString()}
                          </Text>
                        </Paper>
                      ))}
                  </div>
                </ScrollArea>
              </div>
            </Tabs.Panel>

            <Tabs.Panel value="triggers" className="apex-panel">
              <div className="apex-list">
                <Group justify="space-between" mb="md" px="md" pt="md">
                  <TextInput
                    placeholder="Search triggers..."
                    leftSection={<IconSearch size={16} />}
                    value={state.searchTerm}
                    onChange={(e) => setState(prev => ({ ...prev, searchTerm: e.currentTarget.value }))}
                    style={{ flex: 1 }}
                  />
                  <Button
                    onClick={loadApexTriggers}
                    loading={state.isLoading}
                    leftSection={<IconRefresh size={16} />}
                    variant="light"
                  >
                    Load Triggers
                  </Button>
                </Group>

                {state.isLoading && (
                  <Flex justify="center" align="center" py="xl">
                    <Loader size="sm" />
                  </Flex>
                )}

                {!state.isLoading && apexTriggers.length === 0 && (
                  <Text size="sm" c="dimmed" ta="center" py="xl">
                    No Apex triggers found. Click "Load Triggers" to fetch from your Salesforce org.
                  </Text>
                )}

                <ScrollArea h={600}>
                  <div className="apex-items">
                    {apexTriggers
                      .filter(trigger =>
                        trigger.name.toLowerCase().includes(state.searchTerm.toLowerCase()) ||
                        trigger.tableEnumOrId.toLowerCase().includes(state.searchTerm.toLowerCase()) ||
                        trigger.body.toLowerCase().includes(state.searchTerm.toLowerCase())
                      )
                      .map((trigger) => {
                        const events = [];
                        if (trigger.usageBeforeInsert) events.push('before insert');
                        if (trigger.usageAfterInsert) events.push('after insert');
                        if (trigger.usageBeforeUpdate) events.push('before update');
                        if (trigger.usageAfterUpdate) events.push('after update');
                        if (trigger.usageBeforeDelete) events.push('before delete');
                        if (trigger.usageAfterDelete) events.push('after delete');
                        if (trigger.usageIsAfterUndelete) events.push('after undelete');

                        return (
                          <Paper key={trigger.id} p="md" mb="sm" className="apex-item" radius="md">
                            <Group justify="space-between" mb="xs">
                              <div>
                                <Text fw={600} size="sm">{trigger.name}</Text>
                                <Text size="xs" c="dimmed" mt={2}>
                                  SObject: {trigger.tableEnumOrId}
                                </Text>
                                <Group gap="xs" mt={4}>
                                  <Badge size="sm" variant="light" color={trigger.status === 'Active' ? 'green' : 'gray'}>
                                    {trigger.status}
                                  </Badge>
                                  <Badge size="sm" variant="light" color="violet">
                                    {events.length} events
                                  </Badge>
                                  <Badge size="sm" variant="light" color="cyan">
                                    {trigger.lengthWithoutComments} chars
                                  </Badge>
                                </Group>
                                {events.length > 0 && (
                                  <Text size="xs" c="dimmed" mt={4}>
                                    Events: {events.join(', ')}
                                  </Text>
                                )}
                              </div>
                              <Tooltip label="View code">
                                <ActionIcon
                                  variant="light"
                                  onClick={() => setState(prev => ({
                                    ...prev,
                                    selectedTrigger: trigger,
                                    showEditPanel: true
                                  }))}
                                >
                                  <IconFile size={16} />
                                </ActionIcon>
                              </Tooltip>
                            </Group>
                            <Text size="xs" c="dimmed">
                              {new Date(trigger.lastModifiedDate).toLocaleString()}
                            </Text>
                          </Paper>
                        );
                      })}
                  </div>
                </ScrollArea>
              </div>
            </Tabs.Panel>

            <Tabs.Panel value="tests" className="apex-panel">
              <div className="apex-test-runner" style={{ maxWidth: '800px', margin: '0 auto' }}>
                <Stack gap="md" p="md">
                  <div>
                    <Text size="sm" fw={500} mb="sm">Test Classes (comma-separated)</Text>
                    <textarea
                      placeholder="Example: MyTestClass, AnotherTestClass"
                      value={testInput}
                      onChange={(e) => setTestInput(e.target.value)}
                      style={{
                        width: '100%',
                        minHeight: '100px',
                        padding: '12px',
                        border: '1px solid #ced4da',
                        borderRadius: '6px',
                        fontSize: '14px',
                        fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                        resize: 'vertical'
                      }}
                    />
                  </div>

                  <Button
                    onClick={handleRunTests}
                    loading={testRunning}
                    leftSection={<IconPlayerPlay size={16} />}
                    className="query-tab-save-button"
                    disabled={testRunning || testInput.trim().length === 0}
                  >
                    Run Tests
                  </Button>
                </Stack>
              </div>
            </Tabs.Panel>
          </Tabs>
        </div>
      </div>

      {/* Execution Result Modal */}
      <Modal
        opened={state.showExecutionModal}
        onClose={() => {
          setState(prev => ({ ...prev, showExecutionModal: false }));
          setDebugLogSearch('');
        }}
        title={tSync('apex.execution.results', 'Apex Execution Results')}
        size="lg"
      >
        {state.executionResult && (
          <ScrollArea h={400}>
            <Stack gap="md">
              <Group>
                <Badge 
                  size="lg" 
                  color={state.executionResult.success ? 'green' : 'red'}
                  leftSection={state.executionResult.success ? <IconPlayerPlay size={16} /> : <IconBug size={16} />}
                >
                  {state.executionResult.success ? tSync('apex.success.execution') : tSync('apex.error.execution_failed')}
                </Badge>
              </Group>

              {state.executionResult.message && (
                <Text size="sm">{state.executionResult.message}</Text>
              )}

              {state.executionResult.compile_problem && (
                <Paper p="md" bg="red.0" c="red.7">
                  <Text size="sm" fw={500}>Compilation Error:</Text>
                  {(state.executionResult.line || state.executionResult.column) && (
                    <Text size="sm" c="red.9" fw={600}>
                      Line {state.executionResult.line || '?'}, Column {state.executionResult.column || '?'}
                    </Text>
                  )}
                  <Text size="sm">{state.executionResult.compile_problem}</Text>
                </Paper>
              )}

              {state.executionResult.exception_message && (
                <Paper p="md" bg="red.0" c="red.7">
                  <Text size="sm" fw={500}>Runtime Error:</Text>
                  <Text size="sm">{state.executionResult.exception_message}</Text>
                  {state.executionResult.exception_stack_trace && (
                    <ScrollArea h={150} mt="sm">
                      <Text size="xs" ff="monospace" c="red.8">
                        {state.executionResult.exception_stack_trace}
                      </Text>
                    </ScrollArea>
                  )}
                </Paper>
              )}

              {state.executionResult.limit_exceptions && state.executionResult.limit_exceptions.length > 0 && (
                <Paper p="md" bg="yellow.0" c="yellow.8">
                  <Text size="sm" fw={500}>Governor Limit Warnings:</Text>
                  <Stack gap="xs" mt="sm">
                    {state.executionResult.limit_exceptions.map((limit, index) => (
                      <Text key={index} size="sm">{limit}</Text>
                    ))}
                  </Stack>
                </Paper>
              )}

              <div>
                <Text size="sm" fw={500} mb="sm">Performance Metrics:</Text>
                <Group gap="md" wrap="wrap">
                  {state.executionResult.execution_time !== undefined && (
                    <Badge size="sm" variant="light" color="blue">
                      Execution Time: {state.executionResult.execution_time}ms
                    </Badge>
                  )}
                  {state.executionResult.cpu_time !== undefined && (
                    <Badge size="sm" variant="light" color="blue">
                      CPU Time: {state.executionResult.cpu_time}ms
                    </Badge>
                  )}
                  {state.executionResult.dml_statements !== undefined && (
                    <Badge size="sm" variant="light" color="cyan">
                      DML Statements: {state.executionResult.dml_statements}
                    </Badge>
                  )}
                  {state.executionResult.dml_rows !== undefined && (
                    <Badge size="sm" variant="light" color="cyan">
                      DML Rows: {state.executionResult.dml_rows}
                    </Badge>
                  )}
                  {state.executionResult.soql_queries !== undefined && (
                    <Badge size="sm" variant="light" color="grape">
                      SOQL Queries: {state.executionResult.soql_queries}
                    </Badge>
                  )}
                  {state.executionResult.soql_rows_processed !== undefined && (
                    <Badge size="sm" variant="light" color="grape">
                      SOQL Rows: {state.executionResult.soql_rows_processed}
                    </Badge>
                  )}
                </Group>
              </div>

              {state.executionResult.debug_info && state.executionResult.debug_info.length > 0 && (
                <div>
                  <Group justify="space-between" align="center" mb="sm">
                    <Text size="sm" fw={500}>Debug Information ({getFilteredDebugLogs().length}/{state.executionResult.debug_info.length}):</Text>
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      onClick={() => {
                        const logs = getFilteredDebugLogs().join('\n');
                        navigator.clipboard.writeText(logs);
                        notifications.show({
                          title: 'Logs Copied',
                          message: 'Debug logs copied to clipboard',
                          color: 'green',
                          autoClose: 2000,
                        });
                      }}
                      title="Copy logs to clipboard"
                    >
                      <IconCopy size={14} />
                    </ActionIcon>
                  </Group>

                  <TextInput
                    placeholder="Search logs..."
                    value={debugLogSearch}
                    onChange={(e) => setDebugLogSearch(e.currentTarget.value)}
                    size="xs"
                    mb="sm"
                    leftSection={<IconSearch size={14} />}
                  />

                  <ScrollArea h={250}>
                    <Stack gap="xs">
                      {getFilteredDebugLogs().length > 0 ? (
                        getFilteredDebugLogs().map((log, index) => (
                          <Paper key={index} p="xs" withBorder style={{ backgroundColor: '#f8f9fa' }}>
                            <Text size="xs" ff="monospace" style={{ wordBreak: 'break-all' }}>
                              {typeof log === 'string' ? log : JSON.stringify(log, null, 2)}
                            </Text>
                          </Paper>
                        ))
                      ) : (
                        <Text size="sm" c="dimmed" ta="center" py="md">
                          No debug logs match your search
                        </Text>
                      )}
                    </Stack>
                  </ScrollArea>
                </div>
              )}
            </Stack>
          </ScrollArea>
        )}
      </Modal>

      {/* Create Modal */}
      <Modal
        opened={state.showCreateModal}
        onClose={() => setState(prev => ({ ...prev, showCreateModal: false }))}
        title="Create New Apex Code"
        size="lg"
      >
        <Stack gap="md">
          <TextInput
            label={tSync('apex.form.name', 'Name')}
            placeholder={tSync('apex.form.namePlaceholder', 'Enter Apex code name')}
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
          
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}>
              Apex Code
              <span style={{ color: 'red', marginLeft: '4px' }}>*</span>
            </label>
            <Editor
              height="350px"
              defaultLanguage="apex"
              value={formData.apex_code}
              onChange={(value) => setFormData({ ...formData, apex_code: value || '' })}
              options={{
                minimap: { enabled: false },
                lineNumbers: 'on',
                fontSize: 13,
                fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                tabSize: 2,
                wordWrap: 'on'
              }}
            />
          </div>
          
          <TextInput
            label={tSync('apex.form.description', 'Description')}
            placeholder={tSync('apex.form.descriptionPlaceholder', 'Optional description')}
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />
          
          <TextInput
            label={tSync('apex.form.tags', 'Tags')}
            placeholder={tSync('apex.form.tagsPlaceholder', 'Comma-separated tags')}
            value={formData.tags}
            onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
          />

          {/* Debug Levels Configuration */}
          <div style={{ borderTop: '1px solid #e9ecef', paddingTop: '16px' }}>
            <Text size="sm" fw={500} mb="md">Debug Levels</Text>
            <Group gap="md" grow>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>DB</label>
                <select
                  value={formData.debug_levels.DB}
                  onChange={(e) => setFormData({ ...formData, debug_levels: { ...formData.debug_levels, DB: e.target.value } })}
                  style={{ width: '100%', padding: '6px 8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '12px' }}
                >
                  <option value="NONE">NONE</option>
                  <option value="ERROR">ERROR</option>
                  <option value="WARN">WARN</option>
                  <option value="INFO">INFO</option>
                  <option value="DEBUG">DEBUG</option>
                  <option value="FINE">FINE</option>
                  <option value="FINER">FINER</option>
                  <option value="FINEST">FINEST</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>Workflow</label>
                <select
                  value={formData.debug_levels.Workflow}
                  onChange={(e) => setFormData({ ...formData, debug_levels: { ...formData.debug_levels, Workflow: e.target.value } })}
                  style={{ width: '100%', padding: '6px 8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '12px' }}
                >
                  <option value="NONE">NONE</option>
                  <option value="ERROR">ERROR</option>
                  <option value="WARN">WARN</option>
                  <option value="INFO">INFO</option>
                  <option value="DEBUG">DEBUG</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>Validation</label>
                <select
                  value={formData.debug_levels.Validation}
                  onChange={(e) => setFormData({ ...formData, debug_levels: { ...formData.debug_levels, Validation: e.target.value } })}
                  style={{ width: '100%', padding: '6px 8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '12px' }}
                >
                  <option value="NONE">NONE</option>
                  <option value="ERROR">ERROR</option>
                  <option value="WARN">WARN</option>
                  <option value="INFO">INFO</option>
                  <option value="DEBUG">DEBUG</option>
                </select>
              </div>
            </Group>
            <Group gap="md" grow mt="sm">
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>Callouts</label>
                <select
                  value={formData.debug_levels.Callouts}
                  onChange={(e) => setFormData({ ...formData, debug_levels: { ...formData.debug_levels, Callouts: e.target.value } })}
                  style={{ width: '100%', padding: '6px 8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '12px' }}
                >
                  <option value="NONE">NONE</option>
                  <option value="ERROR">ERROR</option>
                  <option value="WARN">WARN</option>
                  <option value="INFO">INFO</option>
                  <option value="DEBUG">DEBUG</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>Apex Code</label>
                <select
                  value={formData.debug_levels.Apex_Code}
                  onChange={(e) => setFormData({ ...formData, debug_levels: { ...formData.debug_levels, Apex_Code: e.target.value } })}
                  style={{ width: '100%', padding: '6px 8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '12px' }}
                >
                  <option value="NONE">NONE</option>
                  <option value="ERROR">ERROR</option>
                  <option value="WARN">WARN</option>
                  <option value="INFO">INFO</option>
                  <option value="DEBUG">DEBUG</option>
                  <option value="FINE">FINE</option>
                  <option value="FINER">FINER</option>
                  <option value="FINEST">FINEST</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>Apex Profiling</label>
                <select
                  value={formData.debug_levels.Apex_Profiling}
                  onChange={(e) => setFormData({ ...formData, debug_levels: { ...formData.debug_levels, Apex_Profiling: e.target.value } })}
                  style={{ width: '100%', padding: '6px 8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '12px' }}
                >
                  <option value="NONE">NONE</option>
                  <option value="ERROR">ERROR</option>
                  <option value="WARN">WARN</option>
                  <option value="INFO">INFO</option>
                  <option value="DEBUG">DEBUG</option>
                </select>
              </div>
            </Group>
          </div>

          <div>
            <Text size="sm" fw={500} mb="xs">Code Type</Text>
            <select
              value={formData.code_type}
              onChange={(e) => setFormData({ ...formData, code_type: e.target.value as ApexCodeType })}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #ced4da',
                borderRadius: '6px',
                fontSize: '14px',
                backgroundColor: 'white'
              }}
            >
              <option value="anonymous">Anonymous</option>
              <option value="class">Class</option>
              <option value="trigger">Trigger</option>
              <option value="interface">Interface</option>
              <option value="enum">Enum</option>
              <option value="test_class">Test Class</option>
            </select>
          </div>
          
          <Switch
            label="Mark as Favorite"
            checked={formData.is_favorite}
            onChange={(e) => setFormData({ ...formData, is_favorite: e.target.checked })}
          />
          
          <Group justify="flex-end" gap="sm">
            <Button
              variant="light"
              size="xs"
              onClick={() => setState(prev => ({ ...prev, showCreateModal: false }))}
              style={{ 
                padding: '6px 12px', 
                minHeight: '28px',
                fontSize: '11px',
                fontWeight: 600,
                borderRadius: '6px',
                transition: 'all 0.2s ease'
              }}
            >
              Cancel
            </Button>
            <Button
              size="xs"
              onClick={handleCreateApex}
              className="query-tab-save-button"
              style={{ 
                padding: '6px 12px', 
                minHeight: '28px',
                fontSize: '11px',
                fontWeight: 600,
                borderRadius: '6px',
                transition: 'all 0.2s ease'
              }}
            >
              Create Apex Code
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Test Results Modal */}
      <Modal
        opened={state.showTestResultsModal}
        onClose={() => setState(prev => ({ ...prev, showTestResultsModal: false }))}
        title="Test Execution Results"
        size="lg"
      >
        {state.testResults && (
          <ScrollArea h={500}>
            <Stack gap="md">
              {/* Summary */}
              <div>
                <Group mb="md">
                  <Badge
                    size="lg"
                    color={state.testResults.success ? 'green' : 'red'}
                    leftSection={state.testResults.success ? <IconPlayerPlay size={16} /> : <IconBug size={16} />}
                  >
                    {state.testResults.success ? 'Tests Passed' : 'Tests Failed'}
                  </Badge>
                </Group>

                {state.testResults.tests_run !== undefined && (
                  <Group gap="md" mb="md">
                    <Badge size="sm" variant="light" color="blue">
                      Total Tests: {state.testResults.tests_run}
                    </Badge>
                    {state.testResults.tests_passed !== undefined && (
                      <Badge size="sm" variant="light" color="green">
                        Passed: {state.testResults.tests_passed}
                      </Badge>
                    )}
                    {state.testResults.tests_failed !== undefined && (
                      <Badge size="sm" variant="light" color="red">
                        Failed: {state.testResults.tests_failed}
                      </Badge>
                    )}
                  </Group>
                )}

                {state.testResults.code_coverage !== undefined && (
                  <Badge size="sm" variant="light" color="cyan">
                    Code Coverage: {state.testResults.code_coverage}%
                  </Badge>
                )}
              </div>

              {/* Test Details */}
              {state.testResults.test_results && state.testResults.test_results.length > 0 && (
                <div>
                  <Text size="sm" fw={500} mb="xs">Test Details:</Text>
                  <Stack gap="xs">
                    {state.testResults.test_results.map((test: any, index: number) => (
                      <Paper
                        key={index}
                        p="sm"
                        withBorder
                        style={{
                          borderColor: test.outcome === 'Pass' ? '#51cf66' : '#ff6b6b',
                          backgroundColor: test.outcome === 'Pass' ? '#f0fdf4' : '#fef2f2'
                        }}
                      >
                        <Group justify="space-between" align="flex-start" mb="xs">
                          <div>
                            <Text size="sm" fw={500}>{test.method_name || test.name}</Text>
                            {test.class_name && <Text size="xs" c="dimmed">{test.class_name}</Text>}
                          </div>
                          <Badge
                            color={test.outcome === 'Pass' ? 'green' : 'red'}
                            size="sm"
                          >
                            {test.outcome || 'Unknown'}
                          </Badge>
                        </Group>

                        {test.message && (
                          <Text size="xs" c="dimmed">{test.message}</Text>
                        )}

                        {test.stack_trace && (
                          <ScrollArea h={120} mt="xs">
                            <Text size="xs" ff="monospace" c="red">
                              {test.stack_trace}
                            </Text>
                          </ScrollArea>
                        )}
                      </Paper>
                    ))}
                  </Stack>
                </div>
              )}

              {state.testResults.message && (
                <Text size="sm" c="dimmed">{state.testResults.message}</Text>
              )}
            </Stack>
          </ScrollArea>
        )}
      </Modal>

    </div>
  );
};
