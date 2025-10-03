/**
 * AI Agent Service
 * 
 * This service handles communication with the DataPilot AI Agent backend.
 * It provides both REST API and WebSocket functionality for natural language
 * query processing and SOQL generation.
 */

import { logger } from './Logger';
import { apiService } from './ApiService';
import { connectionManager } from './ConnectionManager';
import { configManager } from '../config/app.config';
import { getSessionContextProvider } from '../contexts/SessionContext';

export interface AIQueryRequest {
  query: string;
  session_id?: string;
  context?: Record<string, any>;
}

export interface StructuredAIResponse {
  response_type: 'metadata_query' | 'data_query' | 'clarification_needed' | 'relationship_query' | 'mixed_query' | 'field_details_query';
  confidence?: number;
  intent_understood?: string;
  actions_taken: string[];
  data_summary?: Record<string, any>;
  suggestions: string[];
  metadata: Record<string, any>;
}

export interface AIQueryResponse {
  success: boolean;
  response: string;
  intent_understood: string;
  actions_taken: string[];
  data_summary?: Record<string, any>;
  soql_query?: string;
  execution_time: number;
  confidence: number;
  suggestions: string[];
  conversation_id?: string;
  thread_id?: string;
  status: string;
  interrupt_type?: string;
  interrupt_message?: string;
  interrupt_data?: Record<string, any>;
  metadata: Record<string, any>;
  // New structured response field
  structured_response?: StructuredAIResponse;
  // Legacy fields for backward compatibility
  query?: string;
  session_id?: string;
  conversation_uuid?: string;
}

export interface AIHealthResponse {
  agent_type: string;
  version: string;
  capabilities: {
    salesforce_intelligence: boolean;
    soql_optimization: boolean;
    business_intelligence: boolean;
    conversation_management: boolean;
    query_types: Array<{
      type: string;
      description: string;
      examples: string[];
    }>;
    available_tools: string[];
    features: string[];
    performance: {
      max_query_length: number;
      max_execution_time: number;
      cache_ttl_hours: number;
      session_ttl_hours: number;
      max_conversation_history: number;
    };
  };
  connection_status: string;
  service_status: string;
}

export class AIAgentService {
  private static instance: AIAgentService;
  private wsConnection: WebSocket | null = null;
  private wsReconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  private constructor() {}

  static getInstance(): AIAgentService {
    if (!AIAgentService.instance) {
      AIAgentService.instance = new AIAgentService();
    }
    return AIAgentService.instance;
  }

  /**
   * Get conversation UUID from session context
   */
  private getConversationUuidFromSession(): string | null {
    try {
      const provider = getSessionContextProvider();
      return provider?.()?.getConversationUuid() || null;
    } catch (error) {
      logger.warn('Failed to get conversation UUID from session context', 'AIAgentService', error);
      return null;
    }
  }

  /**
   * Set conversation UUID in session context
   */
  public setConversationUuid(conversationUuid: string | null): void {
    try {
      const provider = getSessionContextProvider();
      if (provider) {
        provider().setConversationUuid(conversationUuid);
      }
    } catch (error) {
      logger.warn('Failed to set conversation UUID in session context', 'AIAgentService', error);
    }
  }

  /**
   * Check AI agent health and capabilities
   */
  async checkHealth(): Promise<AIHealthResponse> {
    try {
      logger.debug('Checking AI agent health...', 'AIAgentService');
      
      const response = await apiService.get(`${configManager.getApiUrl('datapilotAgent')}/health?lang=en`);
      
      logger.debug('AI agent health check successful', 'AIAgentService', response.data);
      return response.data;
    } catch (error: any) {
      logger.error('AI agent health check failed', 'AIAgentService', {
        error: error.response?.data?.detail || error.message,
        status: error.response?.status
      });
      throw new Error(error.response?.data?.detail || 'Failed to check AI agent health');
    }
  }

  /**
   * Process a natural language query using REST API
   */
  async processQuery(
    query: string,
    connectionUuid: string,
    conversationUuid?: string
  ): Promise<AIQueryResponse> {
    try {
      // Use the provided connection UUID
      const currentConnectionUuid = connectionUuid;
      
      if (!currentConnectionUuid) {
        throw new Error('No active Salesforce connection found');
      }

      // AI Agent doesn't require master key authentication

      // Get conversation UUID from session context
      const sessionConversationUuid = this.getConversationUuidFromSession();
      const effectiveConversationUuid = conversationUuid || sessionConversationUuid;

      logger.debug('Processing AI query via REST API', 'AIAgentService', { 
        query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
        connectionUuid: currentConnectionUuid,
        conversationUuid: effectiveConversationUuid
      });

      const request: AIQueryRequest = {
        query,
        session_id: effectiveConversationUuid || undefined,
        context: {
          connection_uuid: currentConnectionUuid,
          timestamp: new Date().toISOString()
        }
      };

      // Use conversation_uuid as path parameter if provided, otherwise create new conversation
      const conversationId = effectiveConversationUuid || `conv_${Date.now()}`;
      const endpointUrl = `${configManager.getApiUrl('datapilotAgent')}/${conversationId}?connection_uuid=${currentConnectionUuid}&lang=en`;
      
      const response = await apiService.post(
        endpointUrl,
        request,
        {
          timeout: 120000 // 2 minutes timeout for AI operations
        }
      );

      // Store conversation UUID in session context for future requests (check both field names)
      if (response.data.conversation_id) {
        this.setConversationUuid(response.data.conversation_id);
      } else if (response.data.conversation_uuid) {
        this.setConversationUuid(response.data.conversation_uuid);
      }

      logger.debug('AI query processed successfully', 'AIAgentService', {
        responseLength: response.data.response?.length || 0,
        hasQuery: !!response.data.soql_query,
        conversationId: response.data.conversation_id,
        success: response.data.success,
        intentUnderstood: response.data.intent_understood
      });

      return response.data;
    } catch (error: any) {
      logger.error('Failed to process AI query', 'AIAgentService', {
        error: error.response?.data?.detail || error.message,
        status: error.response?.status,
        query: query.substring(0, 100) + (query.length > 100 ? '...' : '')
      });
      
      // Handle connection validation errors
      if (error.response?.status === 404 && error.response?.data?.detail?.includes('Connection not found')) {
        throw new Error('CONNECTION_NOT_FOUND');
      }
      
      if (error.response?.status === 400 && error.response?.data?.detail?.includes('Invalid Salesforce connection')) {
        throw new Error('INVALID_SALESFORCE_CONNECTION');
      }
      
      // Handle 422 validation errors for connection issues
      if (error.response?.status === 422) {
        const errorDetail = error.response?.data?.detail;
        if (errorDetail?.message === 'Connection not found') {
          throw new Error('CONNECTION_NOT_FOUND');
        }
        if (errorDetail?.field_errors?.connection) {
          throw new Error(errorDetail.field_errors.connection);
        }
      }
      
      // Handle connection object validation errors
      if (error.response?.status === 422 && error.response?.data?.detail?.field_errors?.connection?.includes('Connection object is None')) {
        throw new Error('INVALID_SALESFORCE_CONNECTION');
      }
      
      throw new Error(error.response?.data?.detail || 'Failed to process AI query');
    }
  }

  /**
   * Initialize WebSocket connection for real-time chat
   */
  async initializeWebSocket(
    connectionUuid: string,
    conversationUuid: string,
    onMessage: (data: AIQueryResponse) => void,
    onError: (error: Error) => void,
    onClose: () => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const currentConnectionUuid = connectionUuid;
        
        if (!currentConnectionUuid) {
          throw new Error('No active Salesforce connection found');
        }
        
        if (!conversationUuid) {
          throw new Error('Conversation UUID is required');
        }

        // Build WebSocket URL without master key authentication
        // Convert HTTP base URL to WebSocket URL
        const baseUrl = apiService.getBaseUrl();
        const wsBaseUrl = baseUrl.replace(/^https?:\/\//, 'ws://').replace(/^http:\/\//, 'ws://');
        
        // Get just the path part for WebSocket (not the full URL)
        const appConfig = configManager.getAppConfig();
        const aiAgentsPath = appConfig.api.endpoints.aiAgents;
        const datapilotAgentPath = appConfig.api.endpoints.datapilotAgent;
        const wsPath = `${aiAgentsPath}/${datapilotAgentPath}/ws`;
        
        const wsUrl = `${wsBaseUrl}${wsPath}?connection_uuid=${currentConnectionUuid}&conversation_uuid=${conversationUuid}&lang=en`;
        
        logger.debug(' Initializing WebSocket connection', 'AIAgentService', { wsUrl, conversationUuid });

        this.wsConnection = new WebSocket(wsUrl);

        this.wsConnection.onopen = () => {
          this.wsReconnectAttempts = 0;
          logger.debug('WebSocket connection opened', 'AIAgentService');
          resolve(); // Resolve the promise when connection opens
        };

        this.wsConnection.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            logger.debug('WebSocket message received', 'AIAgentService', data);
            
            // Store conversation UUID in session context if provided in metadata
            if (data.metadata?.conversation_uuid) {
              this.setConversationUuid(data.metadata.conversation_uuid);
            }
            
            onMessage(data);
          } catch (error) {
            logger.error('Failed to parse WebSocket message', 'AIAgentService', { error, rawData: event.data });
            onError(new Error('Failed to parse WebSocket message'));
          }
        };

        this.wsConnection.onerror = (error) => {
          logger.error('WebSocket error', 'AIAgentService', error);
          onError(new Error('WebSocket connection error'));
          reject(new Error('WebSocket connection error'));
        };

        this.wsConnection.onclose = (event) => {
          logger.warn('WebSocket connection closed', 'AIAgentService', { 
            code: event.code, 
            reason: event.reason,
            wasClean: event.wasClean 
          });
          
          this.wsConnection = null;
          
          // Handle connection validation errors
          if (event.code === 1008) { // Policy violation - connection validation failed
            if (event.reason?.includes('Connection not found')) {
              onError(new Error('CONNECTION_NOT_FOUND'));
            } else if (event.reason?.includes('Invalid Salesforce connection')) {
              onError(new Error('INVALID_SALESFORCE_CONNECTION'));
            } else {
              onError(new Error('CONNECTION_VALIDATION_FAILED'));
            }
            onClose();
            return;
          }
          
          onClose();
          
          // Attempt to reconnect if not a clean close and not a connection validation error
          if (!event.wasClean && this.wsReconnectAttempts < this.maxReconnectAttempts && event.code !== 1008) {
            this.wsReconnectAttempts++;
            
          setTimeout(() => {
            this.initializeWebSocket(currentConnectionUuid, conversationUuid, onMessage, onError, onClose);
          }, 2000 * this.wsReconnectAttempts);
          }
        };

      } catch (error) {
        logger.error('Failed to initialize WebSocket', 'AIAgentService', error);
        reject(error);
      }
    });
  }

  /**
   * Send message via WebSocket
   */
  async sendWebSocketMessage(query: string): Promise<void> {
    if (!this.wsConnection || this.wsConnection.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket connection not available');
    }

    const conversationUuid = this.getConversationUuidFromSession();
    
    const message = {
      type: 'user_message',
      content: query,
      user_id: 'client',
      metadata: {
        conversation_uuid: conversationUuid,
        timestamp: new Date().toISOString()
      }
    };

    logger.debug('Sending WebSocket message', 'AIAgentService', { 
      query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
      conversationUuid: conversationUuid
    });

    this.wsConnection.send(JSON.stringify(message));
  }

  /**
   * Close WebSocket connection
   */
  closeWebSocket(): void {
    if (this.wsConnection) {
      logger.debug('Closing WebSocket connection', 'AIAgentService');
      this.wsConnection.close();
      this.wsConnection = null;
    }
  }

  /**
   * Get current conversation UUID from session context
   */
  getConversationUuid(): string | null {
    return this.getConversationUuidFromSession();
  }


  /**
   * Check if WebSocket is connected
   */
  isWebSocketConnected(): boolean {
    return this.wsConnection?.readyState === WebSocket.OPEN;
  }
}

// Export singleton instance
export const aiAgentService = AIAgentService.getInstance();
