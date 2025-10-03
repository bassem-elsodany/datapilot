import React, { useState, useEffect } from 'react';
import { QueryTab } from './QueryTab';
import { SchemaTab } from './SchemaTab';
import { ApexTab } from './ApexTab';
import { AIAssistantTab } from './AIAssistantTab';
import { SavedQueriesTab } from './SavedQueriesTab';
import { connectionManager } from '../../services/ConnectionManager';
import { useTranslation } from '../../services/I18nService';
import { logger } from '../../services/Logger';
import '../../assets/css/components/query-editor/QueryEditorPage.css';

interface QueryEditorPageProps {
  onExecuteQuery: () => void;
  onQueryChange: (query: string) => void;
  initialQuery: string;
  isQuerying: boolean;
  currentConnectionUuid?: string | null;
  fieldData?: { [sobjectName: string]: string[] };
  onSchemaTabChange?: (isActive: boolean) => void;
  onSavedQueryTabChange?: (isActive: boolean) => void;
  queryResult?: any;
  onRecordUpdate?: (recordId: string, fieldName: string, newValue: any) => Promise<void>;
  onQueryMore?: () => void;
  maxRecordsWarning?: string | null;
  maxRecordsReached?: string | null;
  maxRecordsLimit?: number;
}

export const QueryEditorPage: React.FC<QueryEditorPageProps> = ({
  onExecuteQuery, onQueryChange, initialQuery, isQuerying, currentConnectionUuid, fieldData = {}, onSchemaTabChange, onSavedQueryTabChange, queryResult, onRecordUpdate, onQueryMore, maxRecordsWarning, maxRecordsReached, maxRecordsLimit
}) => {
  const { tSync } = useTranslation();
  const [activeTab, setActiveTab] = useState<string>('schema');

  // Handle graph-to-query conversion
  useEffect(() => {
    const handleGraphToQuery = (event: CustomEvent) => {
      const { query } = event.detail;
      
      // Update the query in the editor
      onQueryChange(query);
      
      // Switch to the query tab to show the generated query
      setActiveTab('query');
      
      // Notify parent about tab change
      if (onSchemaTabChange) {
        onSchemaTabChange(false); // Schema tab is no longer active
      }
    };

    // Add event listener for graph-to-query conversion
    window.addEventListener('graphToQueryGenerated', handleGraphToQuery as EventListener);

    return () => {
      window.removeEventListener('graphToQueryGenerated', handleGraphToQuery as EventListener);
    };
  }, [onQueryChange, onSchemaTabChange, activeTab]);

  const handleTabChange = (tabName: string) => {
    setActiveTab(tabName);
    
    // Notify parent about schema tab state - hide results for schema, apex, and ai-assistant tabs
    if (onSchemaTabChange) {
      onSchemaTabChange(tabName === 'schema' || tabName === 'apex' || tabName === 'ai-assistant');
    }
    
    // Notify parent about saved query tab state - hide results for saved-queries tab
    if (onSavedQueryTabChange) {
      onSavedQueryTabChange(tabName === 'saved-queries');
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'query':
        return (
          <QueryTab
            onExecuteQuery={onExecuteQuery}
            onQueryChange={onQueryChange}
            initialQuery={initialQuery}
            isQuerying={isQuerying}
            currentConnectionUuid={currentConnectionUuid}
            fieldData={fieldData}
            onTabChange={handleTabChange}
            queryResult={queryResult}
            onRecordUpdate={onRecordUpdate}
            onQueryMore={onQueryMore}
            maxRecordsWarning={maxRecordsWarning}
            maxRecordsReached={maxRecordsReached}
            maxRecordsLimit={maxRecordsLimit}
          />
        );
          case 'schema':
      return <SchemaTab currentConnectionUuid={currentConnectionUuid} />;
      case 'apex':
        return <ApexTab />;

      case 'ai-assistant':
        return <AIAssistantTab currentConnectionUuid={currentConnectionUuid} />;
      case 'saved-queries':
        return (
          <SavedQueriesTab 
            connectionUuid={currentConnectionUuid}
            onLoadQuery={onQueryChange}
          />
        );
      default:
        return (
          <QueryTab
            onExecuteQuery={onExecuteQuery}
            onQueryChange={onQueryChange}
            initialQuery={initialQuery}
            isQuerying={isQuerying}
            currentConnectionUuid={currentConnectionUuid}
            fieldData={fieldData}
            onTabChange={handleTabChange}
            queryResult={queryResult}
            onRecordUpdate={onRecordUpdate}
            onQueryMore={onQueryMore}
            maxRecordsWarning={maxRecordsWarning}
            maxRecordsReached={maxRecordsReached}
            maxRecordsLimit={maxRecordsLimit}
          />
        );
    }
  };

  return (
    <div className="query-editor-page">
      <div className="query-tabs">
        <div 
          className={`tab ${activeTab === 'schema' ? 'active' : ''}`}
          onClick={() => handleTabChange('schema')}
        >
          {tSync('query.editor.tabs.schema', 'Schema')}
        </div>
        <div 
          className={`tab ${activeTab === 'query' ? 'active' : ''}`}
          onClick={() => handleTabChange('query')}
        >
          {tSync('query.editor.tabs.query', 'Query')}
        </div>

        <div 
          className={`tab ${activeTab === 'saved-queries' ? 'active' : ''}`}
          onClick={() => handleTabChange('saved-queries')}
        >
          {tSync('query.editor.tabs.savedQueries', 'Saved Queries')}
        </div>
        <div 
          className={`tab ${activeTab === 'apex' ? 'active' : ''}`}
          onClick={() => handleTabChange('apex')}
        >
          {tSync('query.editor.tabs.apex', 'Apex')}
        </div>
        <div 
          className={`tab ${activeTab === 'ai-assistant' ? 'active' : ''}`}
          onClick={() => handleTabChange('ai-assistant')}
        >
          {tSync('query.editor.tabs.aiAssistant', 'AI Assistant')}
        </div>
      </div>

      <div className="query-editor-content">
        {renderTabContent()}
      </div>
    </div>
  );
};
