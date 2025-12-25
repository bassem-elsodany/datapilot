import React, { useCallback, useMemo, CSSProperties } from 'react';
import { FixedSizeList as List } from 'react-window';
import { SavedConnection } from '../../domain/models/Connection';
import { ConnectionRow } from './ConnectionRow';
import { logger } from '../../services/Logger';

interface ConnectionsListProps {
  connections: SavedConnection[];
  connectingConnectionId: string | null;
  successfulConnectionId: string | null;
  isRenaming: boolean;
  onConnect: (connection: SavedConnection) => void;
  onRename: (connection: SavedConnection) => void;
  onDelete: (connectionId: string) => void;
  tSync: (key: string, defaultValue?: string) => string;
  isLoading?: boolean;
}

/**
 * Virtualized Connections List Component
 * Uses react-window for efficient rendering of large connection lists
 * Only renders visible rows in the viewport, dramatically improving performance
 */
export const ConnectionsList: React.FC<ConnectionsListProps> = ({
  connections,
  connectingConnectionId,
  successfulConnectionId,
  isRenaming,
  onConnect,
  onRename,
  onDelete,
  tSync,
  isLoading = false,
}) => {
  // Row height in pixels (matches CSS min-height: 60px)
  const ITEM_SIZE = 60;

  // Memoize row render function to avoid recreation on every render
  const Row = useCallback(
    ({ index, style }: { index: number; style: CSSProperties }) => {
      const connection = connections[index];

      if (!connection) {
        return null;
      }

      return (
        <div style={style}>
          <ConnectionRow
            connection={connection}
            connectingConnectionId={connectingConnectionId}
            successfulConnectionId={successfulConnectionId}
            isRenaming={isRenaming}
            onConnect={onConnect}
            onRename={onRename}
            onDelete={onDelete}
            tSync={tSync}
          />
        </div>
      );
    },
    [
      connections,
      connectingConnectionId,
      successfulConnectionId,
      isRenaming,
      onConnect,
      onRename,
      onDelete,
      tSync,
    ]
  );

  // Memoize the list height calculation
  const listHeight = useMemo(() => {
    // Limit visible height to show max 8-10 rows before scrolling
    const maxVisibleRows = 10;
    const maxHeight = ITEM_SIZE * maxVisibleRows;
    const calculatedHeight = Math.min(connections.length * ITEM_SIZE, maxHeight);
    return Math.max(calculatedHeight, ITEM_SIZE); // Minimum of 1 row visible
  }, [connections.length]);

  if (isLoading) {
    return (
      <div className="connections-table-body" style={{ padding: '20px', textAlign: 'center' }}>
        <p>{tSync('connections.loading', 'Loading connections...')}</p>
      </div>
    );
  }

  if (connections.length === 0) {
    return (
      <div className="connections-table-body" style={{ padding: '20px', textAlign: 'center' }}>
        <p>{tSync('connections.noConnections', 'No connections available')}</p>
      </div>
    );
  }

  return (
    <List
      height={listHeight}
      itemCount={connections.length}
      itemSize={ITEM_SIZE}
      width="100%"
      className="connections-virtual-list"
    >
      {Row}
    </List>
  );
};

ConnectionsList.displayName = 'ConnectionsList';
