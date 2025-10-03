import React, { useState } from 'react';
import { QueryResult } from '../App';
import { useTranslation } from '../services/I18nService';
import { logger } from '../services/Logger';
import '../assets/css/components/ResultsView.css';

interface ResultsViewProps {
  result: QueryResult | null;
  viewMode: 'table' | 'hierarchical';
  onChildClick?: (record: any) => void;
  isChild?: boolean;
  onRecordUpdate?: (recordId: string, fieldName: string, newValue: any) => Promise<void>;
}

interface EditingCell {
  recordIndex: number;
  fieldName: string;
  originalValue: any;
}

export const ResultsView: React.FC<ResultsViewProps> = ({ 
  result, 
  viewMode, 
  onChildClick,
  isChild = false,
  onRecordUpdate
}) => {
  const { t, tSync } = useTranslation();
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);

  const handleRowClick = (record: any) => {
    if (onChildClick) {
      onChildClick(record);
    }
  };

  // Get all unique field names from all records
  const getAllFields = () => {
    if (!result || !result.records || result.records.length === 0) {
      return [];
    }

    const fieldSet = new Set<string>();
    result.records.forEach(record => {
      Object.keys(record).forEach(key => {
        if (key !== 'attributes') { // Skip Salesforce metadata
          fieldSet.add(key);
        }
      });
    });

    return Array.from(fieldSet).sort();
  };

  const fields = getAllFields();

  const formatCellValue = (value: any): string => {
    if (value === null || value === undefined) {
      return '';
    }
    
    if (typeof value === 'object') {
      // Handle nested objects (like RecordType.Name)
      if (value.Name && typeof value.Name === 'string') return value.Name;
      if (value.Id && typeof value.Id === 'string') return value.Id;
      // For other objects, try to find a displayable string property
      for (const key in value) {
        if (typeof value[key] === 'string' && value[key]) {
          return value[key];
        }
      }
      // If no string property found, stringify the object
      return JSON.stringify(value);
    }
    
    return String(value);
  };

  const isFieldEditable = (fieldName: string, value: any): boolean => {
    // Skip system fields and nested objects for editing
    const nonEditableFields = ['Id', 'CreatedDate', 'LastModifiedDate', 'SystemModstamp', 'attributes'];
    if (nonEditableFields.includes(fieldName)) {
      return false;
    }
    
    // Don't allow editing of nested objects
    if (typeof value === 'object' && value !== null) {
      return false;
    }
    
    return true;
  };

  const handleCellDoubleClick = (recordIndex: number, fieldName: string, value: any) => {
    if (!isFieldEditable(fieldName, value)) {
      return;
    }

    setEditingCell({
      recordIndex,
      fieldName,
      originalValue: value
    });
    setEditValue(formatCellValue(value));
  };

  const handleEditSave = async () => {
    if (!editingCell || !onRecordUpdate || !result?.records) {
      setEditingCell(null);
      return;
    }

    const record = result.records[editingCell.recordIndex];
    const recordId = record.Id;
    
    if (!recordId) {
      logger.error('No record ID found for update', 'ResultsView');
      setEditingCell(null);
      return;
    }

    setIsUpdating(true);
    try {
      await onRecordUpdate(recordId, editingCell.fieldName, editValue);
      // Update the local record data
      result.records[editingCell.recordIndex][editingCell.fieldName] = editValue;
    } catch (error) {
      logger.error('Failed to update record', 'ResultsView', null, error as Error);
      // Could show a toast notification here
    } finally {
      setIsUpdating(false);
      setEditingCell(null);
    }
  };

  const handleEditCancel = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleEditSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleEditCancel();
    }
  };

  const renderCell = (record: any, recordIndex: number, fieldName: string) => {
    const value = record[fieldName];
    const isEditing = editingCell?.recordIndex === recordIndex && editingCell?.fieldName === fieldName;
    const isEditable = isFieldEditable(fieldName, value);

    if (isEditing) {
      return (
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleEditKeyDown}
          onBlur={handleEditSave}
          autoFocus
          className="cell-edit-input"
          disabled={isUpdating}
        />
      );
    }

    return (
      <div 
        className={`cell-content ${isEditable ? 'editable' : ''}`}
        onDoubleClick={() => handleCellDoubleClick(recordIndex, fieldName, value)}
                    title={isEditable ? tSync('results.doubleClickToEditTitle') : ''}
      >
        {formatCellValue(value)}
        {isEditable && <span className="edit-indicator">✏️</span>}
      </div>
    );
  };

  return (
    <div className="results-view">
      <div className="results-header">
        <h3>{tSync('results.title', 'Query Results')}</h3>
        {result && (
          <div className="results-stats">
            <span className="record-count">
              {result.metadata.total_size} {result.metadata.total_size === 1 ? tSync('results.recordsFoundOne', '1 record found') : tSync('results.recordsFoundMany', '{count} records found', { count: result.metadata.total_size })}
            </span>
            {!result.metadata.done && (
              <span className="more-records">{tSync('results.moreRecordsAvailable', 'More records available')}</span>
            )}
            {onRecordUpdate && (
                              <span className="edit-mode-indicator">{tSync('results.editModeEnabled', '✏️ Edit Mode Enabled')}</span>
            )}
          </div>
        )}
      </div>

      <div className="results-table-container">
        {result && result.records && result.records.length > 0 ? (
          <table className="results-table">
            <thead>
              <tr>
                <th className="checkbox-column">
                  <input type="checkbox" />
                </th>
                {fields.map(field => (
                  <th key={field} className="data-column">
                    {tSync('results.field', field, { field: field })}
                    {onRecordUpdate && (
                      <span className="column-edit-indicator">✏️</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.records.map((record, index) => (
                <tr 
                  key={index} 
                  className="data-row"
                  onClick={() => handleRowClick(record)}
                >
                  <td className="checkbox-column">
                    <input type="checkbox" />
                  </td>
                  {fields.map(field => (
                    <td key={field} className="data-cell">
                      {renderCell(record, index, field)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : result && result.records && result.records.length === 0 ? (
          <div className="no-results">
            <div className="no-results-icon">📋</div>
            <h4>{tSync('results.noRecordsFound', 'No Records Found')}</h4>
            <p>{tSync('results.noRecordsFoundSubtitle', 'No records were returned by your query')}</p>
          </div>
        ) : (
          <div className="no-results">
            <div className="no-results-icon">🔍</div>
            <h4>{tSync('results.noQueryResults', 'No Query Results')}</h4>
            <p>{tSync('results.noQueryResultsSubtitle', 'Execute a query to see results here')}</p>
          </div>
        )}
      </div>

      {result && result.records && result.records.length > 0 && (
        <div className="results-footer">
          <div className="results-pagination">
                          <span>{tSync('results.showingRecords', '{current} of {total} records', { current: result.records.length, total: result.metadata.total_size })}</span>
            {!result.metadata.done && (
                              <button className="btn btn-secondary">
                  {tSync('results.loadMoreRecords', 'Load More Records')}
              </button>
            )}
            {onRecordUpdate && (
              <div className="edit-controls">
                <span className="edit-help">{tSync('results.doubleClickToEdit', 'Double-click to edit')}</span>
                                  {isUpdating && <span className="updating-indicator">🔄 {tSync('results.updating')}</span>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
