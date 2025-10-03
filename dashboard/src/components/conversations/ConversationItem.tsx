/**
 * Conversation Item Component
 * 
 * Displays a single conversation item in the conversations list.
 * Provides actions for viewing, editing, and managing conversations.
 */

import React from 'react';
import { Paper, Text, Group, Badge, ActionIcon, Tooltip, Stack } from '@mantine/core';
import { IconMessage, IconEdit, IconTrash, IconClock, IconUser, IconRobot, IconCopy, IconPlayerPlay, IconCalendar } from '@tabler/icons-react';
import { Conversation } from '../../services/ConversationService';
import { useTranslation } from '../../services/I18nService';
import { logger } from '../../services/Logger';
import '../../assets/css/components/conversations/ConversationItem.css';

interface ConversationItemProps {
  conversation: Conversation;
  onSelect: (conversation: Conversation) => void;
  onEdit: (conversation: Conversation) => void;
  onDelete: (conversation: Conversation) => void;
  onCopyMessage?: (message: string) => void;
  onReuseMessage?: (message: string) => void;
  isSelected?: boolean;
  index?: number; // Add index for alternating backgrounds
}

export const ConversationItem: React.FC<ConversationItemProps> = ({
  conversation,
  onSelect,
  onEdit,
  onDelete,
  onCopyMessage,
  onReuseMessage,
  isSelected = false,
  index = 0
}) => {
  const { tSync } = useTranslation();

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch (error) {
      logger.warn('Failed to format date', 'ConversationItem', { dateString, error });
      return dateString;
    }
  };

  const getAgentIcon = (agentName: string) => {
    switch (agentName) {
      case 'datapilot-agent':
        return <IconRobot size={16} />;
      case 'salesforce-agent':
        return <IconUser size={16} />;
      default:
        return <IconMessage size={16} />;
    }
  };

  const getAgentColor = (agentName: string) => {
    switch (agentName) {
      case 'datapilot-agent':
        return 'blue';
      case 'salesforce-agent':
        return 'green';
      default:
        return 'gray';
    }
  };


  const handleCopyMessage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onCopyMessage && conversation.messages && conversation.messages.length > 0) {
      const lastUserMessage = conversation.messages
        .filter(msg => msg.role === 'user')
        .pop();
      if (lastUserMessage) {
        onCopyMessage(lastUserMessage.content);
      }
    }
  };

  const handleReuseMessage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onReuseMessage && conversation.messages && conversation.messages.length > 0) {
      const lastUserMessage = conversation.messages
        .filter(msg => msg.role === 'user')
        .pop();
      if (lastUserMessage) {
        onReuseMessage(lastUserMessage.content);
      }
    }
  };

  // Determine background style based on index and selection
  const getBackgroundStyle = () => {
    if (isSelected) {
      return 'var(--mantine-color-blue-0)';
    }
    // Alternate background colors for better navigation
    return index % 2 === 0 ? 'var(--mantine-color-gray-0)' : 'var(--mantine-color-white)';
  };

  return (
    <Paper
      className={`conversation-item ${isSelected ? 'selected' : ''} ${index % 2 === 0 ? 'even' : 'odd'}`}
      shadow="sm"
      radius="md"
      p="md"
      style={{
        cursor: 'pointer',
        border: isSelected ? '2px solid var(--mantine-color-blue-6)' : '1px solid var(--mantine-color-gray-3)',
        backgroundColor: getBackgroundStyle(),
        transition: 'all 0.2s ease'
      }}
      onClick={() => onSelect(conversation)}
    >
      <Stack gap="xs">
        {/* Header */}
        <Group justify="space-between" align="flex-start">
          <Group gap="xs" align="center">
            {getAgentIcon(conversation.agent_name)}
            <Text size="sm" fw={500} lineClamp={2} style={{ flex: 1 }}>
              {conversation.title}
            </Text>
          </Group>
          
          <Group gap="xs">
            <Badge size="xs" color={getAgentColor(conversation.agent_name)}>
              {tSync(`conversations.agents.${conversation.agent_name.replace('-agent', '')}`, conversation.agent_name.replace('-agent', ''))}
            </Badge>
            {/* Subtle position indicator */}
            <Text size="xs" c="dimmed" style={{ opacity: 0.6 }}>
              #{index + 1}
            </Text>
          </Group>
        </Group>

        {/* Description */}
        {conversation.description && (
          <Text size="xs" c="dimmed" lineClamp={2}>
            {conversation.description}
          </Text>
        )}

        {/* Metadata */}
        <Group justify="space-between" align="center">
          <Group gap="xs">
            <Group gap={4}>
              <IconMessage size={12} />
              <Text size="xs" c="dimmed">
                {conversation.message_count}
              </Text>
            </Group>
            
            {conversation.created_at && (
              <Group gap={4}>
                <IconCalendar size={12} />
                <Text size="xs" c="dimmed">
                  {tSync('common.time.created', 'Created at')} {formatDate(conversation.created_at)}
                </Text>
              </Group>
            )}
            
            {conversation.updated_at && (
              <Group gap={4}>
                <IconClock size={12} />
                <Text size="xs" c="dimmed">
                  {tSync('common.time.updated', 'Updated at')} {formatDate(conversation.updated_at)}
                </Text>
              </Group>
            )}
          </Group>

          {/* Actions */}
          <Group gap="xs">
            {onCopyMessage && conversation.messages && conversation.messages.length > 0 && (
              <Tooltip label={tSync('common.actions.copy', 'Copy Message')}>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  onClick={handleCopyMessage}
                >
                  <IconCopy size={14} />
                </ActionIcon>
              </Tooltip>
            )}
            
            {onReuseMessage && conversation.messages && conversation.messages.length > 0 && (
              <Tooltip label={tSync('conversations.actions.reuse', 'Reuse Message')}>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="blue"
                  onClick={handleReuseMessage}
                >
                  <IconPlayerPlay size={14} />
                </ActionIcon>
              </Tooltip>
            )}
            
            <Tooltip label={tSync('common.actions.edit', 'Edit')}>
              <ActionIcon
                size="sm"
                variant="subtle"
                color="orange"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(conversation);
                }}
              >
                <IconEdit size={14} />
              </ActionIcon>
            </Tooltip>
            
            <Tooltip label={tSync('common.actions.delete', 'Delete')}>
              <ActionIcon
                size="sm"
                variant="subtle"
                color="red"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(conversation);
                }}
              >
                <IconTrash size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        {/* Tags */}
        {conversation.tags && (
          <Group gap="xs">
            {conversation.tags.split(',').map((tag, index) => (
              <Badge key={index} size="xs" variant="light" color="gray">
                {tag.trim()}
              </Badge>
            ))}
          </Group>
        )}
      </Stack>
    </Paper>
  );
};
