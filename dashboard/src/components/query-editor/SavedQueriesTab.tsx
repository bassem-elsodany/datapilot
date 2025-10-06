import React, { useState, useEffect } from 'react';
import { 
  Paper, 
  Text, 
  Button, 
  Group, 
  Stack, 
  Badge, 
  ActionIcon, 
  Loader,
  Alert,
  Collapse,
  ScrollArea,
  TextInput
} from '@mantine/core';
import { 
  IconTrash, 
  IconStar, 
  IconStarFilled,
  IconCopy,
  IconRefresh,
  IconEye,
  IconEyeOff,
  IconEdit,
  IconCheck,
  IconX
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useTranslation } from '../../services/I18nService';
import { apiService } from '../../services/ApiService';
import { logger } from '../../services/Logger';
import '../../assets/css/components/query-editor/SavedQueriesTab.css';

interface SavedQuery {
  saved_queries_uuid: string;
  connection_uuid: string;
  name: string;
  query_text: string;
  description: string;
  tags: string;
  is_favorite: boolean;
  execution_count: number;
  last_executed: string | null;
  created_at: string;
  updated_at: string;
}

interface SavedQueriesTabProps {
  connectionUuid: string | null;
  onLoadQuery: (query: string, queryUuid?: string) => void;
}

export const SavedQueriesTab: React.FC<SavedQueriesTabProps> = ({
  connectionUuid,
  onLoadQuery
}) => {
  const { tSync } = useTranslation();
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedQueries, setExpandedQueries] = useState<Set<string>>(new Set());
  
  // Rename functionality state
  const [editingQueryId, setEditingQueryId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');

  // Load saved queries when connection changes
  useEffect(() => {
    if (connectionUuid) {
      loadSavedQueries();
    } else {
      setSavedQueries([]);
    }
  }, [connectionUuid]);

  const loadSavedQueries = async () => {
    if (!connectionUuid) return;

    setLoading(true);
    try {
      const queries = await apiService.getSavedQueries(connectionUuid);
      setSavedQueries(queries);
      logger.debug('Loaded saved queries', 'SavedQueriesTab', { count: queries.length });
    } catch (error) {
      logger.error('Failed to load saved queries', 'SavedQueriesTab', null, error as Error);
      notifications.show({
        title: tSync('saved_queries.error.load_failed', 'Failed to Load'),
        message: tSync('saved_queries.error.load_failed_message', 'Could not load saved queries'),
        color: 'red',
        autoClose: 3000,
      });
    } finally {
      setLoading(false);
    }
  };



  const handleDeleteQuery = async (queryUuid: string, queryName: string) => {
    try {
      await apiService.deleteSavedQuery(queryUuid);
      loadSavedQueries();

      notifications.show({
        title: tSync('saved_queries.success.deleted', 'Query Deleted'),
        message: tSync('saved_queries.success.deleted_message', { name: queryName }) || `"${queryName}" deleted successfully`,
        color: 'green',
        autoClose: 3000,
      });
    } catch (error) {
      logger.error('Failed to delete saved query', 'SavedQueriesTab', null, error as Error);
      notifications.show({
        title: tSync('saved_queries.error.delete_failed', 'Delete Failed'),
        message: tSync('saved_queries.error.delete_failed_message', 'Failed to delete query'),
        color: 'red',
        autoClose: 3000,
      });
    }
  };

  const handleLoadQuery = (query: SavedQuery) => {
    onLoadQuery(query.query_text, query.saved_queries_uuid);
    notifications.show({
      title: tSync('saved_queries.success.loaded', 'Query Loaded'),
      message: tSync('saved_queries.success.loaded_message', { name: query.name }) || `"${query.name}" loaded into editor`,
      color: 'blue',
      autoClose: 2000,
    });
  };


  const handleCopyQuery = (query: SavedQuery) => {
    navigator.clipboard.writeText(query.query_text);
    notifications.show({
      title: tSync('saved_queries.success.copied', 'Query Copied'),
      message: tSync('saved_queries.success.copied_message', { name: query.name }) || `"${query.name}" copied to clipboard`,
      color: 'blue',
      autoClose: 2000,
    });
  };

  const toggleQueryExpansion = (queryUuid: string) => {
    setExpandedQueries(prev => {
      const newSet = new Set(prev);
      if (newSet.has(queryUuid)) {
        newSet.delete(queryUuid);
      } else {
        newSet.add(queryUuid);
      }
      return newSet;
    });
  };

  const handleToggleFavorite = async (query: SavedQuery) => {
    try {
      await apiService.updateSavedQuery(query.saved_queries_uuid, {
        name: query.name,
        query_text: query.query_text,
        description: query.description,
        tags: query.tags,
        is_favorite: !query.is_favorite,
        updated_by: 'user'
      });

      loadSavedQueries();

      notifications.show({
        title: query.is_favorite 
          ? tSync('saved_queries.favorite.removed', 'Removed from Favorites')
          : tSync('saved_queries.favorite.added', 'Added to Favorites'),
        message: query.is_favorite 
          ? tSync('saved_queries.favorite.removed_message', { name: query.name }) || `"${query.name}" removed from favorites`
          : tSync('saved_queries.favorite.added_message', { name: query.name }) || `"${query.name}" added to favorites`,
        color: query.is_favorite ? 'orange' : 'yellow',
        autoClose: 2000,
      });
    } catch (error) {
      logger.error('Failed to toggle favorite', 'SavedQueriesTab', null, error as Error);
      notifications.show({
        title: tSync('saved_queries.error.update_failed', 'Update Failed'),
        message: tSync('saved_queries.error.update_failed_message', 'Failed to update query'),
        color: 'red',
        autoClose: 3000,
      });
    }
  };

  const handleStartRename = (query: SavedQuery) => {
    setEditingQueryId(query.saved_queries_uuid);
    setEditingName(query.name);
  };

  const handleCancelRename = () => {
    setEditingQueryId(null);
    setEditingName('');
  };

  const handleSaveRename = async (queryUuid: string) => {
    if (!editingName.trim()) {
      notifications.show({
        title: tSync('saved_queries.error.invalid_name', 'Invalid Name'),
        message: tSync('saved_queries.error.invalid_name_message', 'Query name cannot be empty'),
        color: 'red',
        autoClose: 3000,
      });
      return;
    }

    try {
      const query = savedQueries.find(q => q.saved_queries_uuid === queryUuid);
      if (!query) return;

      await apiService.updateSavedQuery(queryUuid, {
        name: editingName.trim(),
        query_text: query.query_text,
        description: query.description,
        tags: query.tags,
        is_favorite: query.is_favorite,
        updated_by: 'user'
      });
      
      loadSavedQueries();
      setEditingQueryId(null);
      setEditingName('');

      notifications.show({
        title: tSync('saved_queries.success.renamed', 'Query Renamed'),
        message: tSync('saved_queries.success.renamed_message', { name: editingName.trim() }) || `"${editingName.trim()}" renamed successfully`,
        color: 'green',
        autoClose: 3000,
      });
    } catch (error) {
      logger.error('Failed to rename query', 'SavedQueriesTab', null, error as Error);
      
      let errorMessage = tSync('saved_queries.error.rename_failed', 'Failed to rename query');
      if (error instanceof Error) {
        if (error.message.includes('saved_query.error.duplicate_name')) {
          errorMessage = tSync('saved_query.error.duplicate_name', 'Query with this name already exists');
        }
      }
      
      notifications.show({
        title: tSync('saved_queries.error.rename_failed', 'Rename Failed'),
        message: errorMessage,
        color: 'red',
        autoClose: 3000,
      });
    }
  };

  if (!connectionUuid) {
    return (
      <Paper p="md" className="saved-queries-tab">
        <Alert color="blue" title={tSync('saved_queries.no_connection', 'No Connection')}>
          {tSync('saved_queries.no_connection_message', 'Please select a connection to view saved queries')}
        </Alert>
      </Paper>
    );
  }

  return (
    <div className="saved-queries-tab">
      <Paper p="xs">
        <Group justify="space-between" mb="xs">
          <Text size="md" fw={600}>
            {tSync('saved_queries.title', 'Saved Queries')}
          </Text>
          <Group gap="xs">
            <Button
              leftSection={<IconRefresh size={14} />}
              variant="light"
              size="xs"
              onClick={loadSavedQueries}
              loading={loading}
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
              {tSync('saved_queries.refresh', 'Refresh')}
            </Button>
          </Group>
        </Group>

        {loading ? (
          <Stack align="center" py="md">
            <Loader size="sm" />
            <Text c="dimmed" size="xs">{tSync('common.loading', 'Loading saved queries...')}</Text>
          </Stack>
        ) : savedQueries.length === 0 ? (
          <Alert color="gray" title={tSync('saved_queries.empty', 'No Saved Queries')}>
            {tSync('saved_queries.empty_message', 'No saved queries found for this connection. Create your first saved query!')}
          </Alert>
        ) : (
          <ScrollArea h={400} scrollbarSize={6} type="auto">
            <Stack gap={2} p="xs">
              {savedQueries.map((query) => {
                const isExpanded = expandedQueries.has(query.saved_queries_uuid);
                return (
                  <Paper key={query.saved_queries_uuid} p="xs" withBorder style={{ minHeight: '32px' }}>
                    <Group justify="space-between" align="center" gap="xs" style={{ minHeight: '20px' }}>
                      <Group gap={4} align="center" style={{ flex: 1, minWidth: 0 }}>
                        <ActionIcon
                          variant="transparent"
                          size="xs"
                          onClick={() => handleToggleFavorite(query)}
                          title={query.is_favorite 
                            ? tSync('saved_queries.favorite.removed', 'Remove from favorites')
                            : tSync('saved_queries.favorite.added', 'Add to favorites')
                          }
                          style={{ 
                            minWidth: '16px', 
                            minHeight: '16px',
                            padding: '2px'
                          }}
                        >
                          {query.is_favorite ? (
                            <IconStarFilled size={12} color="#ffd700" />
                          ) : (
                            <IconStar size={12} color="#ccc" />
                          )}
                        </ActionIcon>
                        {editingQueryId === query.saved_queries_uuid ? (
                          <TextInput
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            size="xs"
                            style={{ flex: 1, minWidth: 0 }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleSaveRename(query.saved_queries_uuid);
                              } else if (e.key === 'Escape') {
                                handleCancelRename();
                              }
                            }}
                            autoFocus
                          />
                        ) : (
                          <Text fw={600} size="xs" style={{ minWidth: 0, flex: 1 }}>
                            {query.name}
                          </Text>
                        )}
                        {query.execution_count > 0 && (
                          <Badge size="xs" variant="light" style={{ fontSize: '9px', padding: '2px 4px' }}>
                            {query.execution_count}
                          </Badge>
                        )}
                      </Group>
                      
                      <Group gap={2}>
                        {editingQueryId === query.saved_queries_uuid ? (
                          <>
                            <ActionIcon
                              variant="light"
                              color="green"
                              size="xs"
                              onClick={() => handleSaveRename(query.saved_queries_uuid)}
                              title={tSync('common.actions.save', 'Save')}
                              style={{ minWidth: '20px', minHeight: '20px' }}
                            >
                              <IconCheck size={10} />
                            </ActionIcon>
                            <ActionIcon
                              variant="light"
                              color="gray"
                              size="xs"
                              onClick={handleCancelRename}
                              title={tSync('common.actions.cancel', 'Cancel')}
                              style={{ minWidth: '20px', minHeight: '20px' }}
                            >
                              <IconX size={10} />
                            </ActionIcon>
                          </>
                        ) : (
                          <>
                            <ActionIcon
                              variant="light"
                              color="gray"
                              size="xs"
                              onClick={() => toggleQueryExpansion(query.saved_queries_uuid)}
                              title={isExpanded 
                                ? tSync('saved_queries.actions.hide_query', 'Hide Query')
                                : tSync('saved_queries.actions.show_query', 'Show Query')
                              }
                              style={{ minWidth: '20px', minHeight: '20px' }}
                            >
                              {isExpanded ? <IconEyeOff size={10} /> : <IconEye size={10} />}
                            </ActionIcon>
                            <ActionIcon
                              variant="light"
                              color="blue"
                              size="xs"
                              onClick={() => handleStartRename(query)}
                              title={tSync('common.actions.rename', 'Rename Query')}
                              style={{ minWidth: '20px', minHeight: '20px' }}
                            >
                              <IconEdit size={10} />
                            </ActionIcon>
                            <Button
                              variant="light"
                              color="blue"
                              size="xs"
                              leftSection={<IconCopy size={10} />}
                              onClick={() => handleLoadQuery(query)}
                              style={{ 
                                padding: '2px 6px', 
                                minHeight: '20px',
                                fontSize: '9px',
                                fontWeight: 500
                              }}
                            >
                              Load
                            </Button>
                            <ActionIcon
                              variant="light"
                              color="red"
                              size="xs"
                              onClick={() => handleDeleteQuery(query.saved_queries_uuid, query.name)}
                              title={tSync('common.actions.delete', 'Delete Query')}
                              style={{ minWidth: '20px', minHeight: '20px' }}
                            >
                              <IconTrash size={10} />
                            </ActionIcon>
                          </>
                        )}
                      </Group>
                    </Group>
                    
                    <Collapse in={isExpanded} transitionDuration={200}>
                      <Stack gap="xs" mt="xs">
                        {query.description && (
                          <Text size="xs" c="dimmed" style={{ fontStyle: 'italic' }}>
                            {query.description}
                          </Text>
                        )}
                        {query.tags && (
                          <Group gap={4}>
                            {query.tags.split(',').map((tag, index) => (
                              <Badge key={index} size="xs" variant="outline" style={{ fontSize: '8px' }}>
                                {tag.trim()}
                              </Badge>
                            ))}
                          </Group>
                        )}
                        <Paper p="xs" bg="gray.0" style={{ 
                          borderRadius: '4px', 
                          border: '1px solid #e9ecef',
                          maxHeight: '200px',
                          overflow: 'auto'
                        }}>
                          <Text size="xs" style={{ 
                            fontFamily: 'monospace', 
                            whiteSpace: 'pre-wrap', 
                            wordBreak: 'break-word',
                            lineHeight: '1.4'
                          }}>
                            {query.query_text}
                          </Text>
                        </Paper>
                      </Stack>
                    </Collapse>
                  </Paper>
                );
              })}
            </Stack>
          </ScrollArea>
        )}
      </Paper>


    </div>
  );
};
