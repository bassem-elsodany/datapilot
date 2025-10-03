/**
 * Conversation Service - Frontend API Integration
 * 
 * This service handles conversation management operations with the backend API.
 * It provides CRUD operations for AI agent conversations, message management,
 * and conversation analytics.
 * 
 * Features:
 * - Complete CRUD operations for conversations
 * - Message management within conversations
 * - Conversation summary and analytics
 * - Connection-specific conversation isolation
 * - Message threading and metadata
 * - Performance analytics and insights
 * 
 * Author: Bassem Elsodany
 * GitHub: https://github.com/bassem-elsodany
 * LinkedIn: https://www.linkedin.com/in/bassem-elsodany/
 * Version: 2.1.0
 * License: MIT License
 */

import { apiService } from './ApiService';
import { logger } from './Logger';

// Types for conversation management
export interface ConversationMessage {
  message_id: string;
  conversation_uuid: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  metadata: Record<string, any>;
  message_type: string;
  is_edited: boolean;
  parent_message_id?: string;
}

export interface ConversationSummary {
  summary: string;
  key_topics: string[];
  queries_executed: number;
  insights_generated: string[];
  last_updated: string;
}

export interface Conversation {
  conversation_uuid: string;
  connection_uuid: string;
  agent_name: string;
  title: string;
  description?: string;
  tags?: string;
  message_count: number;
  last_message_at?: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
  summary?: ConversationSummary;
  messages?: ConversationMessage[];
  version: number;
}

export interface ConversationListResponse {
  conversations: Conversation[];
  total_count: number;
}

export interface ConversationAnalytics {
  total_messages: number;
  user_messages: number;
  assistant_messages: number;
  queries_executed: number;
  average_response_time?: number;
  conversation_duration?: number;
  key_topics: string[];
  most_used_features: string[];
}

export interface ConversationStats {
  total_conversations: number;
  active_conversations: number;
  archived_conversations: number;
  total_messages: number;
  average_messages_per_conversation: number;
  most_active_connection?: string;
  recent_activity: Array<{
    _id: string;
    conversation_uuid: string;
    connection_uuid: string;
    title: string;
    updated_at: string;
  }>;
}

export interface CreateConversationRequest {
  connection_uuid: string;
  agent_name?: string;
  title?: string;
  description?: string;
  tags?: string;
  initial_message?: string;
  created_by?: string;
}

export interface UpdateConversationRequest {
  title?: string;
  description?: string;
  tags?: string;
  agent_name?: string;
  updated_by?: string;
}

export interface AddMessageRequest {
  role: 'user' | 'assistant';
  content: string;
  message_type?: string;
  metadata?: Record<string, any>;
  parent_message_id?: string;
}

export interface UpdateSummaryRequest {
  summary: string;
  key_topics: string[];
  queries_executed: number;
  insights_generated: string[];
}

class ConversationService {
  private baseUrl = '/api/v1/conversations';

  /**
   * Create a new conversation
   */
  async createConversation(request: CreateConversationRequest): Promise<Conversation> {
    try {
      logger.debug('Creating new conversation', 'ConversationService', request);
      
      const response = await apiService.post(this.baseUrl, {
        connection_uuid: request.connection_uuid,
        agent_name: request.agent_name || 'datapilot-agent',
        title: request.title,
        description: request.description,
        tags: request.tags,
        initial_message: request.initial_message,
        created_by: request.created_by || 'user'
      });

      logger.debug('Conversation created successfully', 'ConversationService', response.data);
      return response.data;
    } catch (error: any) {
      logger.error('Failed to create conversation', 'ConversationService', {
        error: error.response?.data?.detail || error.message,
        status: error.response?.status
      });
      throw new Error(error.response?.data?.detail || 'Failed to create conversation');
    }
  }

  /**
   * Get all conversations for a connection
   */
  async getConversations(
    connectionUuid: string,
    agentName?: string
  ): Promise<ConversationListResponse> {
    try {
      logger.debug('Getting conversations', 'ConversationService', { connectionUuid, agentName });
      
      const params = new URLSearchParams({
        connection_uuid: connectionUuid,
        lang: 'en'
      });
      
      if (agentName) params.append('agent_name', agentName);

      const response = await apiService.get(`${this.baseUrl}?${params.toString()}`);

      logger.debug('Conversations retrieved successfully', 'ConversationService', {
        count: response.data.total_count
      });
      return response.data;
    } catch (error: any) {
      logger.error('Failed to get conversations', 'ConversationService', {
        error: error.response?.data?.detail || error.message,
        status: error.response?.status
      });
      throw new Error(error.response?.data?.detail || 'Failed to get conversations');
    }
  }

  /**
   * Get a specific conversation by UUID
   */
  async getConversation(conversationUuid: string): Promise<Conversation> {
    try {
      logger.debug('Getting conversation', 'ConversationService', { conversationUuid });
      
      const response = await apiService.get(`${this.baseUrl}/${conversationUuid}?lang=en`);

      logger.debug('Conversation retrieved successfully', 'ConversationService', {
        conversationUuid,
        messageCount: response.data.message_count
      });
      return response.data;
    } catch (error: any) {
      logger.error('Failed to get conversation', 'ConversationService', {
        error: error.response?.data?.detail || error.message,
        status: error.response?.status
      });
      throw new Error(error.response?.data?.detail || 'Failed to get conversation');
    }
  }

  /**
   * Update a conversation
   */
  async updateConversation(
    conversationUuid: string,
    request: UpdateConversationRequest
  ): Promise<Conversation> {
    try {
      logger.debug('Updating conversation', 'ConversationService', { conversationUuid, request });
      
      const response = await apiService.put(`${this.baseUrl}/${conversationUuid}`, {
        title: request.title,
        description: request.description,
        tags: request.tags,
        agent_name: request.agent_name,
        updated_by: request.updated_by || 'user'
      });

      logger.debug('Conversation updated successfully', 'ConversationService', {
        conversationUuid,
        version: response.data.version
      });
      return response.data;
    } catch (error: any) {
      logger.error('Failed to update conversation', 'ConversationService', {
        error: error.response?.data?.detail || error.message,
        status: error.response?.status
      });
      throw new Error(error.response?.data?.detail || 'Failed to update conversation');
    }
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(conversationUuid: string): Promise<void> {
    try {
      logger.debug('Deleting conversation', 'ConversationService', { conversationUuid });
      
      await apiService.delete(`${this.baseUrl}/${conversationUuid}?lang=en`);

      logger.debug('Conversation deleted successfully', 'ConversationService', { conversationUuid });
    } catch (error: any) {
      logger.error('Failed to delete conversation', 'ConversationService', {
        error: error.response?.data?.detail || error.message,
        status: error.response?.status
      });
      throw new Error(error.response?.data?.detail || 'Failed to delete conversation');
    }
  }

  /**
   * Add a message to a conversation
   */
  async addMessage(
    conversationUuid: string,
    request: AddMessageRequest
  ): Promise<ConversationMessage> {
    try {
      logger.debug('Adding message to conversation', 'ConversationService', { conversationUuid, request });
      
      const response = await apiService.post(`${this.baseUrl}/${conversationUuid}/messages`, {
        role: request.role,
        content: request.content,
        message_type: request.message_type || 'text',
        metadata: request.metadata || {},
        parent_message_id: request.parent_message_id
      });

      logger.debug('Message added successfully', 'ConversationService', {
        conversationUuid,
        messageId: response.data.message_id
      });
      return response.data;
    } catch (error: any) {
      logger.error('Failed to add message', 'ConversationService', {
        error: error.response?.data?.detail || error.message,
        status: error.response?.status
      });
      throw new Error(error.response?.data?.detail || 'Failed to add message');
    }
  }

  /**
   * Get messages for a conversation
   */
  async getMessages(
    conversationUuid: string,
    limit?: number
  ): Promise<ConversationMessage[]> {
    try {
      logger.debug('Getting conversation messages', 'ConversationService', { conversationUuid, limit });
      
      const params = new URLSearchParams({ lang: 'en' });
      if (limit) params.append('limit', limit.toString());

      const response = await apiService.get(`${this.baseUrl}/${conversationUuid}/messages?${params.toString()}`);

      logger.debug('Messages retrieved successfully', 'ConversationService', {
        conversationUuid,
        messageCount: response.data.length
      });
      return response.data;
    } catch (error: any) {
      logger.error('Failed to get messages', 'ConversationService', {
        error: error.response?.data?.detail || error.message,
        status: error.response?.status
      });
      throw new Error(error.response?.data?.detail || 'Failed to get messages');
    }
  }

  /**
   * Get conversation analytics
   */
  async getAnalytics(conversationUuid: string): Promise<ConversationAnalytics> {
    try {
      logger.debug('Getting conversation analytics', 'ConversationService', { conversationUuid });
      
      const response = await apiService.get(`${this.baseUrl}/${conversationUuid}/analytics?lang=en`);

      logger.debug('Analytics retrieved successfully', 'ConversationService', {
        conversationUuid,
        totalMessages: response.data.total_messages
      });
      return response.data;
    } catch (error: any) {
      logger.error('Failed to get analytics', 'ConversationService', {
        error: error.response?.data?.detail || error.message,
        status: error.response?.status
      });
      throw new Error(error.response?.data?.detail || 'Failed to get analytics');
    }
  }

  /**
   * Update conversation summary
   */
  async updateSummary(
    conversationUuid: string,
    request: UpdateSummaryRequest
  ): Promise<{ message: string }> {
    try {
      logger.debug('Updating conversation summary', 'ConversationService', { conversationUuid, request });
      
      const response = await apiService.post(`${this.baseUrl}/${conversationUuid}/summary`, {
        summary: request.summary,
        key_topics: request.key_topics,
        queries_executed: request.queries_executed,
        insights_generated: request.insights_generated
      });

      logger.debug('Summary updated successfully', 'ConversationService', { conversationUuid });
      return response.data;
    } catch (error: any) {
      logger.error('Failed to update summary', 'ConversationService', {
        error: error.response?.data?.detail || error.message,
        status: error.response?.status
      });
      throw new Error(error.response?.data?.detail || 'Failed to update summary');
    }
  }

  /**
   * Get conversation statistics
   */
  async getStats(
    connectionUuid?: string,
    agentName?: string
  ): Promise<ConversationStats> {
    try {
      logger.debug('Getting conversation stats', 'ConversationService', { connectionUuid, agentName });
      
      const params = new URLSearchParams({ lang: 'en' });
      if (connectionUuid) params.append('connection_uuid', connectionUuid);
      if (agentName) params.append('agent_name', agentName);

      const response = await apiService.get(`${this.baseUrl}/stats?${params.toString()}`);

      logger.debug('Stats retrieved successfully', 'ConversationService', {
        totalConversations: response.data.total_conversations
      });
      return response.data;
    } catch (error: any) {
      logger.error('Failed to get stats', 'ConversationService', {
        error: error.response?.data?.detail || error.message,
        status: error.response?.status
      });
      throw new Error(error.response?.data?.detail || 'Failed to get stats');
    }
  }
}

// Export singleton instance
export const conversationService = new ConversationService();
