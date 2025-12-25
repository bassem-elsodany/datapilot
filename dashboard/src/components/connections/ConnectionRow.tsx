import React, { useCallback, useMemo } from 'react';
import { IconLink, IconEdit, IconTrash, IconCheck } from '@tabler/icons-react';
import { SavedConnection } from '../../domain/models/Connection';
import { logger } from '../../services/Logger';

interface ConnectionRowProps {
  connection: SavedConnection;
  connectingConnectionId: string | null;
  successfulConnectionId: string | null;
  isRenaming: boolean;
  onConnect: (connection: SavedConnection) => void;
  onRename: (connection: SavedConnection) => void;
  onDelete: (connectionId: string) => void;
  tSync: (key: string, defaultValue?: string) => string;
}

/**
 * Memoized ConnectionRow Component
 * Renders a single connection in the list without re-rendering unnecessary rows
 * Each row manages its own state and only re-renders if its props change
 */
export const ConnectionRow = React.memo<ConnectionRowProps>(
  ({
    connection,
    connectingConnectionId,
    successfulConnectionId,
    isRenaming,
    onConnect,
    onRename,
    onDelete,
    tSync,
  }) => {
    // Memoize the connect button state to avoid re-rendering on parent state changes
    const isConnecting = useMemo(
      () => connectingConnectionId === connection.id,
      [connectingConnectionId, connection.id]
    );

    const isSuccessful = useMemo(
      () => successfulConnectionId === connection.id,
      [successfulConnectionId, connection.id]
    );

    // Memoize button classes to avoid string concatenation on every render
    const connectButtonClass = useMemo(() => {
      let className = 'btn btn-primary btn-sm';
      if (isConnecting) className += ' loading';
      if (isSuccessful) className += ' success';
      return className;
    }, [isConnecting, isSuccessful]);

    // Memoize event handlers with useCallback to prevent function recreation
    const handleConnect = useCallback(() => {
      logger.debug('Connect button clicked for connection', 'ConnectionRow', { connectionId: connection.id });
      onConnect(connection);
    }, [connection, onConnect]);

    const handleRename = useCallback(() => {
      logger.debug('Rename button clicked for connection', 'ConnectionRow', { connectionId: connection.id });
      onRename(connection);
    }, [connection, onRename]);

    const handleDelete = useCallback(() => {
      logger.debug('Delete button clicked for connection', 'ConnectionRow', { connectionId: connection.id });
      onDelete(connection.id);
    }, [connection.id, onDelete]);

    // Memoize button disabled state
    const isActionDisabled = useMemo(
      () => isConnecting || isSuccessful || isRenaming,
      [isConnecting, isSuccessful, isRenaming]
    );

    return (
      <div className="connection-row">
        <div className="connection-name">
          <div className="connection-name-text">{connection.displayName || connection.username}</div>
        </div>

        <div className="connection-username">{connection.username}</div>

        <div className="connection-environment">
          <span className={`environment-badge ${connection.environment}`}>
            {connection.environment === 'sandbox' ? 'Sandbox' : 'Production'}
          </span>
        </div>

        <div className="connection-last-used">
          {/* Date is already pre-formatted from backend as YYYY-MM-DD */}
          {new Date(connection.lastUsed).toLocaleDateString()}
        </div>

        <div className="connection-actions">
          <button
            className={connectButtonClass}
            onClick={handleConnect}
            disabled={isActionDisabled}
            title={tSync('connections.quickConnect')}
            aria-label={tSync('connections.aria.connect')}
          >
            {isConnecting ? (
              <>
                <div className="loading-spinner"></div>
                {tSync('connections.connecting')}
              </>
            ) : isSuccessful ? (
              <>
                <IconCheck size={14} />
                {tSync('connections.connected')}
              </>
            ) : (
              <>
                <IconLink size={14} />
                {tSync('connections.quickConnect')}
              </>
            )}
          </button>

          <button
            className="btn btn-icon-only btn-secondary btn-sm"
            onClick={handleRename}
            title={tSync('connections.renameConnection', 'Rename Connection')}
            disabled={isActionDisabled}
            aria-label={tSync('connections.aria.rename')}
          >
            <IconEdit size={14} />
          </button>

          <button
            className="btn btn-icon-only btn-danger btn-sm"
            onClick={handleDelete}
            title={tSync('connections.removeConnection')}
            disabled={isActionDisabled}
            aria-label={tSync('connections.aria.delete')}
          >
            <IconTrash size={14} />
          </button>
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison for memoization
    // Only re-render if relevant props change
    return (
      prevProps.connection.id === nextProps.connection.id &&
      prevProps.connection.displayName === nextProps.connection.displayName &&
      prevProps.connection.username === nextProps.connection.username &&
      prevProps.connection.environment === nextProps.connection.environment &&
      prevProps.connection.lastUsed === nextProps.connection.lastUsed &&
      prevProps.connectingConnectionId === nextProps.connectingConnectionId &&
      prevProps.successfulConnectionId === nextProps.successfulConnectionId &&
      prevProps.isRenaming === nextProps.isRenaming &&
      prevProps.onConnect === nextProps.onConnect &&
      prevProps.onRename === nextProps.onRename &&
      prevProps.onDelete === nextProps.onDelete &&
      prevProps.tSync === nextProps.tSync
    );
  }
);

ConnectionRow.displayName = 'ConnectionRow';
