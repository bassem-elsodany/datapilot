/**
 * Conversation List Component
 * 
 * Displays a list of conversations with filtering and management capabilities.
 */

import React, { useState, useEffect } from 'react';
import { Stack, Text, Group, Button, Select, TextInput, ActionIcon, Tooltip, Loader, Alert } from '@mantine/core';
import { IconPlus, IconSearch, IconFilter, IconRefresh, IconAlertCircle, IconMessage } from '@tabler/icons-react';
import { ConversationItem } from './ConversationItem';
import { Conversation, conversationService } from '../../services/ConversationService';
import { useTranslation } from '../../services/I18nService';
import { logger } from '../../services/Logger';
import { notificationService } from '../../services/NotificationService';
import '../../assets/css/components/conversations/ConversationList.css';

interface ConversationListProps {
  connectionUuid: string;
  onSelectConversation: (conversation: Conversation) => void;
  onEditConversation: (conversation: Conversation) => void;
  onDeleteConversation: (conversation: Conversation) => void;
  onCopyMessage?: (message: string) => void;
  onReuseMessage?: (message: string) => void;
  onCreateConversation: () => void;
  selectedConversationUuid?: string;
  limit?: number;
  refreshTrigger?: number; // Add this to trigger refresh when it changes
  onConversationCountChange?: (count: number) => void; // Callback to report conversation count
}

export const ConversationList: React.FC<ConversationListProps> = ({
  connectionUuid,
  onSelectConversation,
  onEditConversation,
  onDeleteConversation,
  onCopyMessage,
  onReuseMessage,
  onCreateConversation,
  selectedConversationUuid,
  limit = 10,
  refreshTrigger,
  onConversationCountChange
}) => {
  const { tSync } = useTranslation();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const loadConversations = async () => {
    if (!connectionUuid) {
      logger.warn('No connection UUID provided', 'ConversationList');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      logger.debug('Loading conversations', 'ConversationList', { connectionUuid });
      
      const response = await conversationService.getConversations(connectionUuid);
      
      setConversations(response.conversations);
      
      // Report conversation count to parent component
      if (onConversationCountChange) {
        onConversationCountChange(response.conversations.length);
      }
      
      logger.debug('Conversations loaded successfully', 'ConversationList', {
        count: response.conversations.length
      });
    } catch (error: any) {
      logger.error('Failed to load conversations', 'ConversationList', error);
      setError(error.message || 'Failed to load conversations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConversations();
  }, [connectionUuid, refreshTrigger]);

  const filteredConversations = conversations.filter(conversation => {
    if (!searchTerm) return true;
    
    const searchLower = searchTerm.toLowerCase();
    return (
      conversation.title.toLowerCase().includes(searchLower) ||
      conversation.description?.toLowerCase().includes(searchLower) ||
      conversation.tags?.toLowerCase().includes(searchLower)
    );
  });

  const displayedConversations = limit > 0 
    ? filteredConversations.slice(0, limit)
    : filteredConversations;

  const handleRefresh = () => {
    loadConversations();
  };

  const handleDeleteConversation = async (conversation: Conversation) => {
    try {
      // Delegate the actual deletion to the parent component
      onDeleteConversation(conversation);
      
      // Refresh the list after deletion
      await loadConversations();
      
      logger.debug('Conversation deletion delegated to parent', 'ConversationList', {
        conversationUuid: conversation.conversation_uuid
      });
    } catch (error: any) {
      logger.error('Failed to refresh conversations after deletion', 'ConversationList', error);
      setError(error.message || 'Failed to refresh conversations');
    }
  };

  if (error) {
    return (
      <Alert
        icon={<IconAlertCircle size={16} />}
        title={tSync('common.errors.error', 'Error')}
        color="red"
        variant="light"
      >
        <Text size="sm">{error}</Text>
        <Button
          size="xs"
          variant="light"
          color="red"
          mt="xs"
          onClick={handleRefresh}
        >
          {tSync('common.actions.retry', 'Retry')}
        </Button>
      </Alert>
    );
  }


  return (
    <Stack gap="md" className="conversation-list">
      {/* Header */}
      <Group justify="space-between" align="center" className="list-header">
        <Text size="lg" fw={600}>
          {tSync('conversations.title', 'Recent Conversations')}
        </Text>
        <Group gap="xs">
          {!loading && conversations.length > 0 && (
            <Text size="xs" c="dimmed">
              {tSync('conversations.count', '{count} conversations').replace('{count}', conversations.length.toString())}
            </Text>
          )}
          <Tooltip label={tSync('conversations.actions.refresh', 'Refresh')}>
            <ActionIcon
              variant="subtle"
              onClick={handleRefresh}
              loading={loading}
            >
              <IconRefresh size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {/* Search and New Button Row */}
      <Group gap="sm" align="center">
        <TextInput
          placeholder={tSync('conversations.search.placeholder', 'Search conversations...')}
          leftSection={<IconSearch size={16} />}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          size="sm"
          style={{ flex: 1 }}
        />
        <Button
          size="sm"
          variant="light"
          leftSection={<IconPlus size={14} />}
          onClick={onCreateConversation}
        >
          {tSync('conversations.actions.create', 'New')}
        </Button>
      </Group>

      {/* Empty State - Show directly under search */}
      {!loading && displayedConversations.length === 0 && (
        <Stack align="center" py="xl" gap="md">
          {searchTerm ? (
            <>
              <IconSearch size={48} color="var(--mantine-color-gray-4)" />
              <Text size="md" fw={600} c="dark" ta="center">
                {tSync('conversations.empty.search', 'No conversations found')}
              </Text>
              <Text size="sm" c="dimmed" ta="center">
                {tSync('conversations.empty.searchSubtitle', 'Try adjusting your search terms')}
              </Text>
            </>
          ) : (
            <>
              <IconMessage size={48} color="var(--mantine-color-gray-4)" />
              <Text size="md" fw={600} c="dark" ta="center">
                {tSync('conversations.empty.title', 'No conversations yet')}
              </Text>
              <Text size="sm" c="dimmed" ta="center">
                {tSync('conversations.empty.subtitle', 'Start chatting with DataPilot Agent to see your conversations here')}
              </Text>
              <Button
                size="sm"
                variant="light"
                leftSection={<IconPlus size={14} />}
                onClick={onCreateConversation}
              >
                {tSync('conversations.actions.createFirst', 'Create First Conversation')}
              </Button>
            </>
          )}
        </Stack>
      )}

      {/* Conversations List */}
      <div className="conversations-container">
        {loading ? (
          <Group justify="center" py="xl" className="loading-state">
            <Loader size="sm" />
            <Text size="sm" c="dimmed">
              {tSync('conversations.loading', 'Loading conversations...')}
            </Text>
          </Group>
        ) : (
          <Stack gap="xs">
            {displayedConversations.map((conversation, index) => (
              <ConversationItem
                key={conversation.conversation_uuid}
                conversation={conversation}
                onSelect={onSelectConversation}
                onEdit={onEditConversation}
                onDelete={handleDeleteConversation}
                onCopyMessage={onCopyMessage}
                onReuseMessage={onReuseMessage}
                isSelected={conversation.conversation_uuid === selectedConversationUuid}
                index={index}
              />
            ))}
          </Stack>
        )}
      </div>
    </Stack>
  );
};
