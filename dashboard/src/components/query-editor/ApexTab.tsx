import React, { useState, useEffect } from 'react';
import { logger } from '../../services/Logger';
import { Paper, Title, Text, Textarea, Button, Group, Badge, Tabs, TextInput, Switch, Modal, ScrollArea, Flex, ActionIcon, Tooltip, Stack, Alert, Loader } from '@mantine/core';
import { IconCode, IconDatabase, IconFile, IconSearch, IconDownload, IconUpload, IconPlayerPlay, IconStar, IconStarFilled, IconEdit, IconTrash, IconCopy, IconInfoCircle, IconBug, IconPlus, IconRefresh, IconX } from '@tabler/icons-react';
import { useTranslation, i18nService } from '../../services/I18nService';
import { notifications } from '@mantine/notifications';
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
  activeTab: 'saved' | 'classes' | 'triggers';
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

  // Load data on component mount
  useEffect(() => {
    loadSavedApexData();
    // Note: Loading actual Salesforce Apex metadata would require additional API endpoints
    // loadSalesforceApexData();
  }, []);

  // ========================================
  // DATA LOADING FUNCTIONS
  // ========================================

  const loadSavedApexData = async () => {
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      // TODO: Replace with actual API call
      // const response = await fetch('/api/v1/saved-apex?connection_uuid=...');
      // const data = await response.json();
      // setSavedApexList(data.saved_apex_list);

      // Mock data for now
      const mockData: SavedApex[] = [
        {
          saved_apex_uuid: '1',
          connection_uuid: 'conn-1',
          name: 'Account Service Helper',
          description: 'Helper class for Account operations',
          tags: 'account,service,helper',
          apex_code: 'public class AccountServiceHelper {\n  public static void updateAccount(Account acc) {\n    // Implementation\n  }\n}',
          code_type: 'class',
          debug_levels: {
            DB: 'NONE',
            Workflow: 'NONE',
            Validation: 'NONE',
            Callouts: 'NONE',
            Apex_Code: 'DEBUG',
            Apex_Profiling: 'NONE'
          },
          is_favorite: true,
          execution_count: 5,
          last_executed: '2024-01-15T10:30:00Z',
          last_execution_status: 'success',
          last_execution_time: 150,
          created_at: '2024-01-10T09:00:00Z',
          updated_at: '2024-01-15T10:30:00Z',
          created_by: 'admin@example.com',
          updated_by: 'admin@example.com',
          version: 1
        },
        {
          saved_apex_uuid: '2',
          connection_uuid: 'conn-1',
          name: 'Contact Trigger Handler',
          description: 'Trigger handler for Contact operations',
          tags: 'contact,trigger,handler',
          apex_code: 'trigger ContactTrigger on Contact (before insert, before update) {\n  ContactTriggerHandler.handle(Trigger.new, Trigger.oldMap);\n}',
          code_type: 'trigger',
          debug_levels: {
            DB: 'NONE',
            Workflow: 'NONE',
            Validation: 'NONE',
            Callouts: 'NONE',
            Apex_Code: 'INFO',
            Apex_Profiling: 'NONE'
          },
          is_favorite: false,
          execution_count: 3,
          last_executed: '2024-01-12T14:20:00Z',
          last_execution_status: 'success',
          last_execution_time: 200,
          created_at: '2024-01-08T11:00:00Z',
          updated_at: '2024-01-12T14:20:00Z',
          created_by: 'admin@example.com',
          updated_by: 'admin@example.com',
          version: 1
        }
      ];

      setSavedApexList(mockData);
    } catch (error) {
      logger.error('Failed to load saved Apex data', 'ApexTab', null, error as Error);
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
      // TODO: Replace with actual API call
      // const response = await fetch(`/api/v1/saved-apex/${apex.saved_apex_uuid}/execute`, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ connection_uuid: apex.connection_uuid })
      // });
      // const result = await response.json();

      // Mock execution result
      const mockResult: ApexExecutionResponse = {
        success: true,
        compiled: true,
        execution_time: 150,
        cpu_time: 120,
        dml_rows: 0,
        dml_statements: 0,
        soql_queries: 1,
        soql_rows_processed: 5,
        message: 'Apex code executed successfully'
      };

      setState(prev => ({ 
        ...prev, 
        executionResult: mockResult,
        isExecuting: false 
      }));
    } catch (error) {
      logger.error('Failed to execute Apex code', 'ApexTab', null, error as Error);
      setState(prev => ({ 
        ...prev, 
        executionResult: {
          success: false,
          message: 'Failed to execute Apex code'
        },
        isExecuting: false 
      }));
    }
  };

  const handleToggleFavorite = async (apex: SavedApex) => {
    try {
      // TODO: Replace with actual API call
      // await fetch(`/api/v1/saved-apex/${apex.saved_apex_uuid}/toggle-favorite`, {
      //   method: 'POST'
      // });

      // Update local state
      setSavedApexList(prev => prev.map(item => 
        item.saved_apex_uuid === apex.saved_apex_uuid 
          ? { ...item, is_favorite: !item.is_favorite }
          : item
      ));
    } catch (error) {
      logger.error('Failed to toggle favorite', 'ApexTab', null, error as Error);
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
      // TODO: Replace with actual API call
      // const response = await fetch('/api/v1/saved-apex', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     connection_uuid: 'conn-1', // Get from context
      //     ...formData
      //   })
      // });

      // Mock creation
      const newApex: SavedApex = {
        saved_apex_uuid: Date.now().toString(),
        connection_uuid: 'conn-1',
        name: formData.name,
        description: formData.description,
        tags: formData.tags,
        apex_code: formData.apex_code,
        code_type: formData.code_type,
        debug_levels: formData.debug_levels,
        is_favorite: formData.is_favorite,
        execution_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        created_by: 'user',
        updated_by: 'user',
        version: 1
      };

      setSavedApexList(prev => [newApex, ...prev]);
      setState(prev => ({ ...prev, showCreateModal: false }));
      resetForm();

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
        message: 'Failed to create Apex code',
        color: 'red',
        autoClose: 3000,
      });
    }
  };

  const handleUpdateApex = async () => {
    if (!editingApex) return;

    try {
      // TODO: Replace with actual API call
      // const response = await fetch(`/api/v1/saved-apex/${editingApex.saved_apex_uuid}`, {
      //   method: 'PUT',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(formData)
      // });

      // Mock update
      setSavedApexList(prev => prev.map(apex => 
        apex.saved_apex_uuid === editingApex.saved_apex_uuid 
          ? { 
              ...apex, 
              ...formData,
              updated_at: new Date().toISOString(),
              updated_by: 'user',
              version: apex.version + 1
            }
          : apex
      ));

      setState(prev => ({ ...prev, showEditPanel: false }));
      setEditingApex(null);
      resetForm();

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
        message: 'Failed to update Apex code',
        color: 'red',
        autoClose: 3000,
      });
    }
  };

  const handleDeleteApex = async (apex: SavedApex) => {
    try {
      // TODO: Replace with actual API call
      // await fetch(`/api/v1/saved-apex/${apex.saved_apex_uuid}`, {
      //   method: 'DELETE'
      // });

      // Mock deletion
      setSavedApexList(prev => prev.filter(item => item.saved_apex_uuid !== apex.saved_apex_uuid));

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
        message: 'Failed to delete Apex code',
        color: 'red',
        autoClose: 3000,
      });
    }
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
        <Alert 
          color="blue" 
          title={tSync('apex.coming_soon.title', 'Coming in Next Release')}
          icon={<IconInfoCircle size={16} />}
          style={{ marginBottom: '20px' }}
        >
          <Text size="sm">
            {tSync('apex.coming_soon.message', 'The Apex functionality is currently under development and will be available in the next release. This will include Apex code execution, saved Apex management, and Salesforce metadata integration.')}
          </Text>
        </Alert>
        <div className="apex-controls" style={{ opacity: 0.5, pointerEvents: 'none' }}>
          <div className="apex-search">
            <TextInput
              placeholder={tSync('apex.search.placeholder')}
              value={state.searchTerm}
              onChange={(e) => setState(prev => ({ ...prev, searchTerm: e.currentTarget.value }))}
              leftSection={<IconSearch size={16} />}
              size="sm"
              disabled
            />
          </div>
          
          <div className="apex-filters">
            <select
              value={state.filterStatus}
              onChange={(e) => setState(prev => ({ ...prev, filterStatus: e.target.value }))}
              disabled
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
              disabled
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
              disabled
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
              disabled
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
            <Button
              leftSection={<IconUpload size={14} />}
              variant="light"
              size="xs"
              disabled
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
              {tSync('saved_apex.actions.execute')}
            </Button>
            <Button
              leftSection={<IconDownload size={14} />}
              variant="light"
              size="xs"
              disabled
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
              {tSync('common.actions.export')}
            </Button>
          </div>
        </div>

        <div className="apex-main" style={{ opacity: 0.5, pointerEvents: 'none' }}>
          <Tabs value={state.activeTab} onChange={(value) => setState(prev => ({ ...prev, activeTab: value as any || 'saved' }))}>
            <Tabs.List>
              <Tabs.Tab value="saved" leftSection={<IconCode size={16} />} disabled>
                {tSync('saved_apex.tabs.all', { count: filteredSavedApex.length })}
              </Tabs.Tab>
              <Tabs.Tab value="classes" leftSection={<IconFile size={16} />} disabled>
                {tSync('saved_apex.filter.type.class', { count: apexClasses.length })}
              </Tabs.Tab>
              <Tabs.Tab value="triggers" leftSection={<IconCode size={16} />} disabled>
                {tSync('saved_apex.filter.type.trigger', { count: apexTriggers.length })}
              </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="saved" className="apex-panel">
              <div className="apex-list">
                <div className="apex-items">
                  {filteredSavedApex.map(renderSavedApexItem)}
                </div>
                
                {state.showEditPanel && editingApex && (
                  <div className="apex-edit-panel">
                    <div className="apex-edit-header">
                      <Text size="md" fw={600}>Edit Apex Code</Text>
                      <ActionIcon
                        variant="light"
                        color="gray"
                        onClick={() => setState(prev => ({ ...prev, showEditPanel: false }))}
                      >
                        <IconX size={16} />
                      </ActionIcon>
                    </div>
                    
                    <div className="apex-edit-content">
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
                      
                      <div className="apex-edit-code-section">
                        <Text size="sm" fw={500} mb="xs">Apex Code</Text>
                        <Textarea
                          placeholder={tSync('apex.form.codePlaceholder', 'Enter your Apex code here')}
                          value={formData.apex_code}
                          onChange={(e) => setFormData({ ...formData, apex_code: e.target.value })}
                          minRows={20}
                          maxRows={35}
                          styles={{
                            input: {
                              fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                              fontSize: '13px',
                              lineHeight: '1.5',
                              resize: 'vertical',
                              minHeight: '400px'
                            }
                          }}
                        />
                      </div>
                      
                      <Group justify="flex-end" gap="sm">
                        <Button
                          variant="light"
                          size="xs"
                          onClick={() => setState(prev => ({ ...prev, showEditPanel: false }))}
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
                      </Group>
                    </div>
                  </div>
                )}
              </div>
            </Tabs.Panel>

            <Tabs.Panel value="classes" className="apex-panel">
              <div className="apex-list">
                <div className="apex-items">
                  <Text size="sm" c="dimmed" ta="center" py="xl">
                    Salesforce metadata integration coming soon
                  </Text>
                </div>
              </div>
            </Tabs.Panel>

            <Tabs.Panel value="triggers" className="apex-panel">
              <div className="apex-list">
                <div className="apex-items">
                  <Text size="sm" c="dimmed" ta="center" py="xl">
                    Salesforce metadata integration coming soon
                  </Text>
                </div>
              </div>
            </Tabs.Panel>
          </Tabs>
        </div>
      </div>

      {/* Execution Result Modal */}
      <Modal
        opened={state.showExecutionModal}
        onClose={() => setState(prev => ({ ...prev, showExecutionModal: false }))}
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
                  <Text size="sm">{state.executionResult.compile_problem}</Text>
                </Paper>
              )}

              {state.executionResult.exception_message && (
                <Paper p="md" bg="red.0" c="red.7">
                  <Text size="sm" fw={500}>Runtime Error:</Text>
                  <Text size="sm">{state.executionResult.exception_message}</Text>
                </Paper>
              )}

              <Group gap="md">
                {state.executionResult.execution_time && (
                  <Badge size="sm" variant="light">
                    Execution Time: {state.executionResult.execution_time}ms
                  </Badge>
                )}
                {state.executionResult.cpu_time && (
                  <Badge size="sm" variant="light">
                    CPU Time: {state.executionResult.cpu_time}ms
                  </Badge>
                )}
                {state.executionResult.dml_statements && (
                  <Badge size="sm" variant="light">
                    DML Statements: {state.executionResult.dml_statements}
                  </Badge>
                )}
                {state.executionResult.soql_queries && (
                  <Badge size="sm" variant="light">
                    SOQL Queries: {state.executionResult.soql_queries}
                  </Badge>
                )}
              </Group>

              {state.executionResult.debug_info && state.executionResult.debug_info.length > 0 && (
                <div>
                  <Text size="sm" fw={500} mb="xs">Debug Information:</Text>
                  <ScrollArea h={200}>
                    <Stack gap="xs">
                      {state.executionResult.debug_info.map((log, index) => (
                        <Paper key={index} p="xs" withBorder>
                          <Text size="xs" ff="monospace">{log}</Text>
                        </Paper>
                      ))}
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
          
          <Textarea
            label="Apex Code"
            placeholder="Enter your Apex code here"
            value={formData.apex_code}
            onChange={(e) => setFormData({ ...formData, apex_code: e.target.value })}
            minRows={15}
            maxRows={25}
            required
            styles={{
              input: {
                fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                fontSize: '13px',
                lineHeight: '1.5',
                resize: 'vertical'
              }
            }}
          />
          
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


    </div>
  );
};
