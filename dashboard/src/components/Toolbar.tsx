import React from 'react';
import { useTranslation } from '../services/I18nService';
import '../assets/css/components/Toolbar.css';

interface ToolbarProps {
  isQuerying: boolean;
  onExecuteQuery: () => void;
  onExecuteQueryAll: () => void;
  onQueryMore: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  isQuerying,
  onExecuteQuery,
  onExecuteQueryAll,
  onQueryMore,
}) => {
  const { tSync } = useTranslation();
  return (
    <div className="toolbar">
      <button
        className="primary"
        onClick={onExecuteQuery}
        disabled={isQuerying}
      >
        {isQuerying ? (
          <>
            <span className="spinner"></span>
            {tSync('toolbar.executing', 'toolbar.executing.fallback')}
          </>
        ) : (
          tSync('toolbar.executeQuery', 'toolbar.executeQuery.fallback')
        )}
      </button>
      
      <button
        onClick={onExecuteQueryAll}
        disabled={isQuerying}
      >
        {tSync('toolbar.executeQueryAll', 'toolbar.executeQueryAll.fallback')}
      </button>
      
      <button
        onClick={onQueryMore}
        disabled={isQuerying}
      >
        {tSync('toolbar.queryMore', 'toolbar.queryMore.fallback')}
      </button>
      
      <div className="spacer"></div>
      
      <div className="status-indicator">
        {isQuerying && (
          <>
            <span className="spinner"></span>
            <span>{tSync('toolbar.querying', 'toolbar.querying.fallback')}</span>
          </>
        )}
      </div>
    </div>
  );
};
