import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Paper, Title, Text, Textarea, Button, Group, Badge, ActionIcon, Tooltip, Code, Divider, Alert, Stack, Progress, Loader, Timeline, Modal, TextInput } from '@mantine/core';
import { IconBrain, IconDatabase, IconSearch, IconCopy, IconPlayerPlay, IconMessage, IconSparkles, IconHistory, IconWifi, IconWifiOff, IconAlertCircle, IconClock, IconCheck, IconX, IconLoader, IconPlus } from '@tabler/icons-react';
import { useTranslation } from '../../services/I18nService';
import { aiAgentService, AIQueryResponse, AIHealthResponse } from '../../services/AIAgentService';
import { conversationService, Conversation, CreateConversationRequest, ConversationMessage } from '../../services/ConversationService';
import { ConversationList } from '../conversations/ConversationList';
import { SmartResponseRenderer } from '../ai-assistant/SmartResponseRenderer';
import { AIThinkingOverlay } from '../ai-assistant/AIThinkingOverlay';
import { logger } from '../../services/Logger';
import { notificationService } from '../../services/NotificationService';
import '../../assets/css/components/query-editor/AIAssistantTab.css';
import '../../assets/css/components/conversations/CreateConversationModal.css';


interface AIConversation {
  id: string;
  message: string;
  response: string;
  timestamp: string;
  query?: string;
  ai_thinking?: string; // AI thinking process (tool decisions)
  structured_response?: {
    response_type: 'metadata_query' | 'data_query' | 'clarification_needed' | 'relationship_query' | 'mixed_query' | 'field_details_query';
    confidence?: number;
    confidence_label?: 'high' | 'medium' | 'low' | 'unknown';
    intent_understood?: string;
    actions_taken: string[];
    data_summary?: Record<string, any>;
    suggestions: string[];
    metadata: Record<string, any>;
  };
  metadata?: {
    intent?: string;
    intent_understood?: string;
    confidence?: number;
    tools_used?: string[];
    execution_time?: number;
    actions_taken?: string[];
    suggestions?: string[];
    [key: string]: any; // Allow additional metadata fields
  };
}

interface AIAssistantTabProps {
  onConnectionError?: () => void;
  currentConnectionUuid?: string | null;
}

export const AIAssistantTab: React.FC<AIAssistantTabProps> = ({ onConnectionError, currentConnectionUuid }) => {
  const { tSync } = useTranslation();
  const [userInput, setUserInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const conversationsEndRef = useRef<HTMLDivElement>(null);
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  
  // Smooth scroll to bottom of conversations
  const scrollToBottom = useCallback(() => {
    if (conversationsEndRef.current) {
      conversationsEndRef.current.scrollIntoView({ 
        behavior: 'smooth',
        block: 'end'
      });
    }
  }, []);
  
  // Auto-scroll to bottom when conversations change
  useEffect(() => {
    if (conversations.length > 0) {
      // Small delay to ensure DOM is updated
      setTimeout(scrollToBottom, 100);
    }
  }, [conversations, scrollToBottom]);
  
  // Conversation management state
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [showCreateConversationModal, setShowCreateConversationModal] = useState(false);
  const [showEditConversationModal, setShowEditConversationModal] = useState(false);
  const [isModalClosing, setIsModalClosing] = useState(false);
  const [newConversationTitle, setNewConversationTitle] = useState('');
  const [newConversationDescription, setNewConversationDescription] = useState('');
  const [newConversationTags, setNewConversationTags] = useState('');
  const [editConversationTitle, setEditConversationTitle] = useState('');
  const [editConversationTags, setEditConversationTags] = useState('');
  const [editingConversation, setEditingConversation] = useState<Conversation | null>(null);
  const [conversationListRefreshTrigger, setConversationListRefreshTrigger] = useState(0);
  const [availableConversationCount, setAvailableConversationCount] = useState(0);
  
  // AI Agent integration state
  const [aiHealth, setAiHealth] = useState<AIHealthResponse | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  
  // Track if component is mounted to prevent state updates after unmount
  const isMountedRef = useRef(true);
  const structuredResponseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Enhanced interactivity state
  const [currentStreamingResponse, setCurrentStreamingResponse] = useState<string>('');
  const [currentStructuredResponse, setCurrentStructuredResponse] = useState<any>(null);
  const [processingSteps, setProcessingSteps] = useState<Array<{id: string, step: string, status: 'pending' | 'processing' | 'completed' | 'error', timestamp: Date}>>([]);
  
  // AI Thinking overlay state
  const [showThinkingOverlay, setShowThinkingOverlay] = useState(false);
  const [thinkingText, setThinkingText] = useState('');
  
  // Auto-scroll to bottom when structured response updates (not streaming response)
  useEffect(() => {
    if (currentStructuredResponse) {
      // Small delay to ensure DOM is updated
      setTimeout(scrollToBottom, 50);
    }
  }, [currentStructuredResponse, scrollToBottom]);
  
  // Auto-scroll to bottom when processing steps update
  useEffect(() => {
    if (processingSteps.length > 0) {
      // Small delay to ensure DOM is updated
      setTimeout(scrollToBottom, 50);
    }
  }, [processingSteps, scrollToBottom]);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'reconnecting'>('disconnected');
  const [lastActivity, setLastActivity] = useState<Date | null>(null);
  const [operationTimeout, setOperationTimeout] = useState<NodeJS.Timeout | null>(null);

  // Helper function to safely render metadata values
  const renderMetadataValue = useCallback((value: any): string => {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (Array.isArray(value)) {
      return value.map(item => renderMetadataValue(item)).join(', ');
    }
    if (typeof value === 'object' && value !== null) {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return '[Object]';
      }
    }
    return String(value);
  }, []);

  // Helper functions for interactive state management
  const addProcessingStep = (step: string, status: 'pending' | 'processing' | 'completed' | 'error' = 'pending') => {
    const id = `${Date.now()}-${Math.random()}`;
    setProcessingSteps(prev => [...prev, { id, step, status, timestamp: new Date() }]);
    return id;
  };

  const updateProcessingStep = (id: string, status: 'pending' | 'processing' | 'completed' | 'error') => {
    setProcessingSteps(prev => prev.map(step => 
      step.id === id ? { ...step, status } : step
    ));
  };

  const clearProcessingSteps = () => {
    setProcessingSteps([]);
  };

  const updateLastActivity = () => {
    setLastActivity(new Date());
  };

  const startOperationTimeout = () => {
    if (operationTimeout) {
      clearTimeout(operationTimeout);
    }
    const timeout = setTimeout(() => {
      // Only set error if component is still mounted and generating
      if (isMountedRef.current && isGenerating) {
        setAiError(tSync('aiAssistant.errors.timeout', 'Operation timed out. Please try again.'));
        setIsGenerating(false);
        clearProcessingSteps();
      }
    }, 300000); // 5 minutes timeout for complex AI operations
    setOperationTimeout(timeout);
  };

  const clearOperationTimeout = () => {
    if (operationTimeout) {
      clearTimeout(operationTimeout);
      setOperationTimeout(null);
    }
  };

  // Initialize AI agent on component mount
  useEffect(() => {
    // Mark component as mounted
    isMountedRef.current = true;
    
    // Clear any existing timeouts from previous sessions
    clearOperationTimeout();
    
    // Reset all AI-related state to prevent stale data
    setAiError(null);
    setIsGenerating(false);
    clearProcessingSteps();
    
    initializeAIAgent();
    
    return () => {
      // Mark component as unmounted
      isMountedRef.current = false;
      
      // Cleanup WebSocket connection and timeouts on unmount
      clearOperationTimeout();
      if (structuredResponseTimeoutRef.current) {
        clearTimeout(structuredResponseTimeoutRef.current);
      }
      // Always close WebSocket on unmount
      aiAgentService.closeWebSocket();
    };
  }, []);

  // Clear error state when component becomes visible or when switching tabs
  useEffect(() => {
    // Clear any stale error state when the component is mounted/visible
    setAiError(null);
  }, []);

  // Auto-scroll to bottom when new conversations are added
  useEffect(() => {
    conversationsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversations]);

  // Initialize AI agent health check
  const initializeAIAgent = async () => {
    try {
      logger.debug('Initializing AI agent', 'AIAssistantTab');
      const health = await aiAgentService.checkHealth();
      setAiHealth(health);
      setAiError(null);
    } catch (error) {
      logger.error('Failed to initialize AI agent', 'AIAssistantTab', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to initialize AI agent';
      setAiError(errorMessage);
      
      // Check if this is a connection-related error and trigger navigation to saved connections
      if (errorMessage.includes('No active Salesforce connection') || 
          errorMessage.includes('Master key not set') ||
          errorMessage.includes('connection')) {
        logger.warn(' Connection error detected, redirecting to saved connections', 'AIAssistantTab');
        onConnectionError?.();
      }
    }
  };

  // WebSocket message handler
  const handleWebSocketMessage = useCallback((data: any) => {
    logger.debug('WebSocket message received', 'AIAssistantTab', { messageType: data.type });
    updateLastActivity();
    
    // Handle different message types from backend
    if (data.type === 'stream_update') {
      // Handle streaming updates with real-time feedback
      logger.debug('Stream update received', 'AIAssistantTab', { updateType: data.update_type });
      
      // Check if this is a structured response
      if (data.content && typeof data.content === 'object' && data.content.response_type) {
        // Check if this is a "thinking" response (AI Thinking messages)
        if (data.content.response_type === 'thinking') {
          // This is an AI Thinking message - show it in the overlay
          logger.debug('AI Thinking message received', 'AIAssistantTab', { contentLength: data.content?.length });
          
          const thought = data.content.thought || tSync('aiAssistant.thinkingOverlay.thinking', 'Thinking');
          
          // Show the thinking overlay and update the text
          setShowThinkingOverlay(true);
          setThinkingText(prev => {
            const separator = prev ? '\n' : '';
            return prev + separator + thought;
          });
          
          // Start tool selection process if this is the first thinking message
          if (!thinkingText) {
            // Reset tool selection state for new query
            setTimeout(() => {
              // This will trigger the tool selection animation in AIThinkingOverlay
            }, 500);
          }
        } else {
          // This is a structured response - store it for SmartResponseRenderer with animation
          logger.debug('Structured response received in stream', 'AIAssistantTab', { responseType: data.content?.response_type });
          // Store the structured response for rendering with fade-in animation
          setCurrentStructuredResponse(data.content);
          // DON'T clear the text response - we want to keep AI Thinking messages visible
          // setCurrentStreamingResponse(''); // REMOVED - keep AI Thinking messages
        }
      } else if (data.content && typeof data.content === 'string') {
        // Regular text content - only show if we don't have structured response
        setCurrentStreamingResponse(prev => {
          // Only accumulate text if we don't have a structured response
          if (currentStructuredResponse) {
            return prev; // Don't update text if we have structured response
          }
          // Don't show raw JSON chunks
          if (data.content.startsWith('{') && data.content.endsWith('}')) {
            try {
              JSON.parse(data.content);
              // It's valid JSON, don't show it
              return prev;
            } catch {
              // Not valid JSON, show it
              return prev + data.content;
            }
          }
          return prev + data.content;
        });
      }
      
      // Update processing steps based on stream data
      if (data.metadata?.current_step) {
        const stepId = addProcessingStep(data.metadata.current_step, 'processing');
        if (data.metadata.tool_used) {
          updateProcessingStep(stepId, 'completed');
        }
      }
      
    } else if (data.type === 'ai_response' || data.type === 'stream_complete') {
      // Handle final AI response
      // Hide the thinking overlay when final response is ready
      setShowThinkingOverlay(false);
      
      // IMPORTANT: Capture state values immediately before any async updates
      setCurrentStreamingResponse(capturedStreamingResponse => {
        setCurrentStructuredResponse(capturedStructuredResponse => {
          const responseContent = data.content?.content || data.content || '';
          const responseType = data.content?.type || 'success';
          
          // Complete all processing steps
          setProcessingSteps(prev => prev.map(step => ({ ...step, status: 'completed' as const })));
          
          const newConversation: AIConversation = {
            id: Date.now().toString(),
            message: userInput,
            response: '', // Not used when we have structured_response
            timestamp: new Date().toLocaleString(),
            query: userInput,
            ai_thinking: capturedStreamingResponse || undefined, // Use captured value
            structured_response: capturedStructuredResponse || data.metadata?.structured_response, // Use captured value
            metadata: {
              ...data.metadata,
              response_type: responseType
            }
          };
          
          setConversations(prev => [...prev, newConversation]);
          setUserInput('');
          clearProcessingSteps();
          clearOperationTimeout();
          setIsGenerating(false);
          
          // Close WebSocket connection after receiving final response
          if (wsConnected) {
            aiAgentService.closeWebSocket();
            setWsConnected(false);
            setConnectionStatus('disconnected');
          }
          
          // Refresh the conversation list to show updated message counts
          setConversationListRefreshTrigger(prev => prev + 1);
          
          // Return empty to clear the state
          return null;
        });
        
        // Return empty to clear the state
        return '';
      });
      
    } else if (data.type === 'system_message') {
      // Handle system messages (like welcome messages)
      logger.debug('System message received', 'AIAssistantTab', { messageType: data.type });
      if (data.content) {
        setCurrentStreamingResponse(prev => prev + (typeof data.content === 'string' ? data.content : renderMetadataValue(data.content)));
      }
      
    } else if (data.type === 'error_message') {
      // Handle error messages
      logger.error('Error message received', 'AIAssistantTab', data);
      const errorContent = data.content?.content || data.content?.error || data.content || '';
      setAiError(typeof errorContent === 'string' ? errorContent : renderMetadataValue(errorContent));
      setIsGenerating(false);
      setCurrentStreamingResponse('');
      setCurrentStructuredResponse(null);
      setShowThinkingOverlay(false);
      setThinkingText('');
      clearProcessingSteps();
      clearOperationTimeout();
      
    } else if (data.type === 'processing_step') {
      // Handle explicit processing step updates
      if (data.step) {
        const stepId = addProcessingStep(data.step, data.status || 'processing');
        if (data.status === 'completed' || data.status === 'error') {
          updateProcessingStep(stepId, data.status);
        }
      }
      
    } else if (data.type === 'tool_usage') {
      // Handle tool usage notifications
      if (data.tool_name) {
        addProcessingStep(`Using tool: ${data.tool_name}`, 'processing');
      }
    }
  }, [userInput, currentStreamingResponse]);

  // WebSocket error handler
  const handleWebSocketError = useCallback((error: Error) => {
    logger.error('WebSocket error', 'AIAssistantTab', error);
    
    // Handle connection validation errors
    if (error.message === 'CONNECTION_NOT_FOUND' || error.message === 'INVALID_SALESFORCE_CONNECTION' || error.message === 'CONNECTION_VALIDATION_FAILED') {
      logger.warn('WebSocket connection validation failed, redirecting to saved connections', 'AIAssistantTab');
      // Redirect to saved connections page
      window.location.href = '/connections';
      return;
    }
    
    setAiError(error.message);
    setIsGenerating(false);
    setShowThinkingOverlay(false); // Hide thinking overlay on WebSocket error
    setConnectionStatus('disconnected');
    clearProcessingSteps();
    clearOperationTimeout();
  }, []);

  // WebSocket close handler
  const handleWebSocketClose = useCallback(() => {
    logger.warn(' WebSocket connection closed', 'AIAssistantTab');
    setWsConnected(false);
    setIsGenerating(false);
    setShowThinkingOverlay(false); // Hide thinking overlay on WebSocket close
    setConnectionStatus('disconnected');
    clearProcessingSteps();
    clearOperationTimeout();
  }, []);


  // WebSocket is always enabled - no toggle needed


  const handleGenerateQuery = useCallback(async () => {
    if (!userInput.trim()) return;
    
    // Validate conversation selection
    if (!currentConversation) {
      // Check if there are any conversations available
      if (availableConversationCount === 0) {
        notificationService.warning({
          title: tSync('aiAssistant.notifications.noConversations.title', 'No Conversations'),
          message: tSync('aiAssistant.notifications.noConversations.message', 'No conversations available')
        });
        return;
      } else {
        notificationService.warning({
          title: tSync('aiAssistant.notifications.noConversationSelected.title', 'No Conversation Selected'),
          message: tSync('aiAssistant.notifications.noConversationSelected.message', 'Please select a conversation first')
        });
        return;
      }
    }
    
    setIsGenerating(true);
    setAiError(null);
    setCurrentStreamingResponse('');
    setCurrentStructuredResponse(null);
    
    // Show thinking overlay immediately - don't wait for backend response
    setShowThinkingOverlay(true);
    setThinkingText(''); // Reset thinking text to trigger simulation mode
    
    clearProcessingSteps();
    startOperationTimeout();
    updateLastActivity();
    
    try {
      logger.debug('🤖 Processing AI query', 'AIAssistantTab', { 
        query: userInput.substring(0, 100) + (userInput.length > 100 ? '...' : ''),
        wsConnected
      });

      // Always use WebSocket
        // Validate conversation is selected
        if (!currentConversation?.conversation_uuid) {
          setAiError(tSync('aiAssistant.errors.noConversationSelected', 'Please select a conversation before asking a question'));
          setIsGenerating(false);
          clearProcessingSteps();
          return;
        }
        
        // Open WebSocket connection for this query
        addProcessingStep(tSync('aiAssistant.processingSteps.connecting', 'Connecting to AI Agent...'), 'processing');
        
        await aiAgentService.initializeWebSocket(
          currentConnectionUuid || '',
          currentConversation.conversation_uuid,
          handleWebSocketMessage,
          handleWebSocketError,
          handleWebSocketClose
        );
        
        setWsConnected(true);
        setConnectionStatus('connected');
        updateProcessingStep(processingSteps[processingSteps.length - 1]?.id || '', 'completed');
        
        // Send message via WebSocket
        addProcessingStep(tSync('aiAssistant.processingSteps.sending', 'Sending message to AI Agent...'), 'processing');
        await aiAgentService.sendWebSocketMessage(userInput);
        updateProcessingStep(processingSteps[processingSteps.length - 1]?.id || '', 'completed');
        addProcessingStep(tSync('aiAssistant.processingSteps.waiting', 'Waiting for AI response...'), 'processing');
        // Response will be handled by handleWebSocketMessage
    } catch (error) {
      logger.error('Failed to process AI query', 'AIAssistantTab', error);
      
      // Handle connection validation errors
      if (error instanceof Error) {
        if (error.message === 'CONNECTION_NOT_FOUND' || error.message === 'INVALID_SALESFORCE_CONNECTION') {
          logger.warn('Connection validation failed, redirecting to saved connections', 'AIAssistantTab');
          // Redirect to saved connections page
          window.location.href = '/connections';
          return;
        }
      }
      
      setAiError(error instanceof Error ? error.message : tSync('aiAssistant.errors.processFailed', 'Failed to process query'));
      setIsGenerating(false);
      setShowThinkingOverlay(false); // Hide thinking overlay on error
      clearProcessingSteps();
      clearOperationTimeout();
    }
  }, [userInput, currentConversation, availableConversationCount, wsConnected, currentConnectionUuid, processingSteps, aiHealth, isGenerating]);

  // Memoized callback functions to prevent unnecessary re-renders
  const handleSuggestionClick = useCallback((suggestion: string) => {
    setUserInput(suggestion);
    // Auto-submit suggestion
    setTimeout(() => {
      if (aiHealth && !isGenerating) {
        handleGenerateQuery();
      }
    }, 100);
  }, [aiHealth, isGenerating, handleGenerateQuery]);

  const handleObjectSelect = useCallback((objectName: string) => {
    setUserInput(`Show me ${objectName} fields`);
    // Auto-submit object selection
    setTimeout(() => {
      if (aiHealth && !isGenerating) {
        handleGenerateQuery();
      }
    }, 100);
  }, [aiHealth, isGenerating, handleGenerateQuery]);

  const handleFieldClick = useCallback((fieldName: string, objectName: string) => {
    setUserInput(`Show me the ${fieldName} field in ${objectName}`);
    // Auto-submit field query
    setTimeout(() => {
      if (aiHealth && !isGenerating) {
        handleGenerateQuery();
      }
    }, 100);
  }, [aiHealth, isGenerating, handleGenerateQuery]);

  const handleShowMoreClick = useCallback((objectName: string, nextOffset: number) => {
    // Generate simple "show more" query without field offset
    setUserInput(`Show me more fields from ${objectName}`);
    // Auto-submit show more click
    setTimeout(() => {
      if (aiHealth && !isGenerating) {
        handleGenerateQuery();
      }
    }, 100);
  }, [aiHealth, isGenerating, handleGenerateQuery]);

  const handleCopyQuery = useCallback((query: string) => {
    navigator.clipboard.writeText(query);
  }, []);


  // Conversation management functions
  const handleCreateConversation = async () => {
    if (!currentConnectionUuid) return;

    try {
      const request: CreateConversationRequest = {
        connection_uuid: currentConnectionUuid,
        agent_name: 'datapilot-agent',
        title: newConversationTitle.trim() || undefined, // Let backend generate if empty
        description: newConversationDescription.trim() || undefined,
        tags: newConversationTags.trim() || undefined,
        initial_message: userInput.trim() || undefined,
        created_by: 'user'
      };

      const conversation = await conversationService.createConversation(request);
      setCurrentConversation(conversation);
      handleCloseModal();
      
      // Refresh the conversation list to show the new conversation
      setConversationListRefreshTrigger(prev => prev + 1);
      
      // Show success notification
      notificationService.success({
        title: tSync('conversations.notifications.created.title', 'Conversation Created'),
        message: tSync('conversations.notifications.created.message', 'New conversation "{title}" has been created successfully').replace('{title}', conversation.title),
        autoClose: 4000
      });
      
      logger.debug('Conversation created successfully', 'AIAssistantTab', {
        conversationUuid: conversation.conversation_uuid
      });
    } catch (error: any) {
      logger.error('Failed to create conversation', 'AIAssistantTab', error);
      
      // Show error notification
      notificationService.error({
        title: tSync('conversations.notifications.error.create.title', 'Create Conversation Failed'),
        message: tSync('conversations.notifications.error.create.message', 'Failed to create conversation. Please try again'),
        autoClose: 6000
      });
    }
  };

  const handleSelectConversation = async (conversation: Conversation) => {
    setCurrentConversation(conversation);
    
    // Set conversation UUID in AIAgentService session for WebSocket communication
    aiAgentService.setConversationUuid(conversation.conversation_uuid);
    
    logger.debug('Conversation selected', 'AIAssistantTab', {
      conversationUuid: conversation.conversation_uuid
    });
    
    // Load conversation messages
    await loadConversationMessages(conversation.conversation_uuid);
  };

  const loadConversationMessages = async (conversationUuid: string) => {
    try {
      logger.debug('Loading conversation messages', 'AIAssistantTab', { conversationUuid });
      const messages = await conversationService.getMessages(conversationUuid);
      
      // Convert ConversationMessage[] to AIConversation[]
      const aiConversations: AIConversation[] = [];
      let currentUserMessage: ConversationMessage | null = null;
      
      for (const message of messages) {
        if (message.role === 'user') {
          currentUserMessage = message;
        } else if (message.role === 'assistant' && currentUserMessage) {
          // Create AIConversation from user message and AI response
          const aiConversation: AIConversation = {
            id: message.message_id,
            message: currentUserMessage.content,
            response: message.content,
            timestamp: message.timestamp,
            query: currentUserMessage.content,
            structured_response: message.metadata?.structured_response,
            metadata: {
              ...message.metadata,
              response_type: message.metadata?.response_type || 'success'
            }
          };
          
          
          
          aiConversations.push(aiConversation);
          currentUserMessage = null; // Reset for next pair
        }
      }
      
      setConversations(aiConversations);
      logger.debug('✅ Loaded conversation messages', 'AIAssistantTab', { 
        conversationUuid, 
        messageCount: messages.length,
        aiConversationCount: aiConversations.length 
      });
    } catch (error) {
      logger.error('Failed to load conversation messages', 'AIAssistantTab', { 
        conversationUuid, 
        error: error instanceof Error ? error.message : String(error) 
      });
      notificationService.error({
        title: tSync('aiAssistant.errors.loadMessages.title', 'Error Loading Messages'),
        message: tSync('aiAssistant.errors.loadMessages.message', 'Failed to load conversation messages. Please try again.'),
        autoClose: 5000
      });
    }
  };

  const handleEditConversation = (conversation: Conversation) => {
    setEditingConversation(conversation);
    setEditConversationTitle(conversation.title);
    setEditConversationTags(conversation.tags || '');
    setShowEditConversationModal(true);
    
    logger.debug('Edit conversation requested', 'AIAssistantTab', {
      conversationUuid: conversation.conversation_uuid
    });
  };

  const handleUpdateConversation = async () => {
    if (!editingConversation) return;

    try {
      const updatedConversation = await conversationService.updateConversation(
        editingConversation.conversation_uuid,
        {
          title: editConversationTitle.trim() || editingConversation.title,
          tags: editConversationTags.trim() || undefined,
          updated_by: 'user'
        }
      );

      // Update current conversation if it's the one being edited
      if (currentConversation?.conversation_uuid === editingConversation.conversation_uuid) {
        setCurrentConversation(updatedConversation);
      }

      // Refresh the conversation list
      setConversationListRefreshTrigger(prev => prev + 1);
      
      // Close the modal
      setShowEditConversationModal(false);
      setEditingConversation(null);
      
      // Show success notification
      notificationService.success({
        title: tSync('conversations.notifications.updated.title', 'Conversation Updated'),
        message: tSync('conversations.notifications.updated.message', 'Conversation "{title}" has been updated successfully').replace('{title}', updatedConversation.title),
        autoClose: 4000
      });
      
      logger.debug('Conversation updated successfully', 'AIAssistantTab', {
        conversationUuid: editingConversation.conversation_uuid
      });
    } catch (error: any) {
      logger.error('Failed to update conversation', 'AIAssistantTab', error);
      
      // Show error notification
      notificationService.error({
        title: tSync('conversations.notifications.error.update.title', 'Update Conversation Failed'),
        message: tSync('conversations.notifications.error.update.message', 'Failed to update conversation. Please try again'),
        autoClose: 6000
      });
    }
  };

  const handleCloseEditModal = () => {
    setShowEditConversationModal(false);
    setEditingConversation(null);
    setEditConversationTitle('');
  };

  const handleDeleteConversation = async (conversation: Conversation) => {
    try {
      // Call the conversation service to delete the conversation
      await conversationService.deleteConversation(conversation.conversation_uuid);
      
      // Clear current conversation if it's the one being deleted
      if (currentConversation?.conversation_uuid === conversation.conversation_uuid) {
        setCurrentConversation(null);
        // Clear all chat messages when the current conversation is deleted
        setConversations([]);
        setCurrentStreamingResponse('');
        setCurrentStructuredResponse(null);
        setShowThinkingOverlay(false);
        setThinkingText('');
        setProcessingSteps([]);
      }
      
      // Refresh the conversation list to reflect the deletion
      setConversationListRefreshTrigger(prev => prev + 1);
      
      // Show success notification
      notificationService.success({
        title: tSync('conversations.notifications.deleted.title', 'Conversation Deleted'),
        message: tSync('conversations.notifications.deleted.message', 'Conversation "{title}" has been deleted successfully').replace('{title}', conversation.title),
        autoClose: 4000
      });
      
      logger.debug('Conversation deleted successfully', 'AIAssistantTab', {
        conversationUuid: conversation.conversation_uuid
      });
    } catch (error: any) {
      logger.error('Failed to delete conversation', 'AIAssistantTab', error);
      
      // Show error notification
      notificationService.error({
        title: tSync('conversations.notifications.error.delete.title', 'Delete Conversation Failed'),
        message: tSync('conversations.notifications.error.delete.message', 'Failed to delete conversation. Please try again'),
        autoClose: 6000
      });
    }
  };

  const handleCopyMessage = useCallback((message: string) => {
    handleCopyQuery(message);
  }, [handleCopyQuery]);

  const handleReuseMessage = useCallback((message: string) => {
    setUserInput(message);
  }, []);

  // Memoized function to parse and render conversation response
  const renderConversationResponse = useCallback((conversation: AIConversation) => {
    // Check if response contains JSON that should be parsed
    const responseText = typeof conversation.response === 'string' ? conversation.response : renderMetadataValue(conversation.response);
    
    // Try to parse as JSON if it looks like JSON
    if (typeof responseText === 'string' && responseText.trim().startsWith('{') && responseText.trim().endsWith('}')) {
      try {
        const parsedJson = JSON.parse(responseText);
        
        // Check if it has the expected structure
        const supportedResponseTypes = ['metadata_query', 'data_query', 'relationship_query', 'field_details_query', 'mixed_query', 'clarification_needed'];
        if (parsedJson.response_type && supportedResponseTypes.includes(parsedJson.response_type)) {
          return (
            <SmartResponseRenderer
              structuredResponse={parsedJson}
              onSuggestionClick={handleSuggestionClick}
              onObjectSelect={handleObjectSelect}
              onFieldClick={handleFieldClick}
              onShowMoreClick={handleShowMoreClick}
            />
          );
        }
      } catch (e) {
        // JSON parsing failed, fall back to text rendering
      }
    }
    
    return responseText;
  }, [renderMetadataValue, handleSuggestionClick, handleObjectSelect, handleFieldClick, handleShowMoreClick]);


  const handleConversationCountChange = (count: number) => {
    setAvailableConversationCount(count);
  };

  const handleCloseModal = () => {
    setIsModalClosing(true);
    setTimeout(() => {
      setShowCreateConversationModal(false);
      setIsModalClosing(false);
      setNewConversationTitle('');
      setNewConversationDescription('');
      setNewConversationTags('');
    }, 300); // Match animation duration
  };

  return (
    <div className="ai-assistant-tab">
      {/* AI Thinking Overlay */}
      <AIThinkingOverlay
        isVisible={showThinkingOverlay}
        thinkingText={thinkingText}
        onComplete={() => {
          // Optional: Add any completion logic here
        }}
        onClose={() => {
          // Manual close in case WebSocket gets stuck
          setShowThinkingOverlay(false);
          setThinkingText('');
          setIsGenerating(false);
        }}
      />
      
      <div className="ai-assistant-tab-header">
        <div className="ai-assistant-tab-title">
          <IconBrain size={20} className="ai-assistant-tab-icon" />
          <span>{tSync('aiAssistant.tab.title', 'AI Assistant')}</span>
          {aiHealth && (
            <Badge color="green" size="sm" ml="xs">
              {aiHealth.version}
            </Badge>
          )}
        </div>
        <div className="ai-assistant-tab-subtitle">
          {tSync('aiAssistant.tab.subtitle', 'Chat with DataPilot Agent')}
        </div>
        
        {/* AI Agent Status - WebSocket always enabled */}
        
        {/* Error Display */}
        {aiError && (
          <Alert
            icon={<IconAlertCircle size={16} />}
            title={tSync('aiAssistant.status.error.title', 'AI Agent Error')}
            color="red"
            variant="light"
            mt="md"
            onClose={() => setAiError(null)}
            withCloseButton
          >
            {aiError}
          </Alert>
        )}

      </div>

      <div className="ai-assistant-tab-content">
        <div className="ai-assistant-main">
          <div className="ai-assistant-left">
            {/* Conversation History - Now at the top */}
            <div className="ai-conversations">
              {conversations.length === 0 ? (
                <Paper className="empty-conversations" shadow="sm" radius="md">
                  <IconMessage size={48} className="empty-icon" />
                  <Text size="lg" fw={500}>{tSync('aiAssistant.conversations.empty.title', 'No Conversations Yet')}</Text>
                  <Text size="sm" c="dimmed">
                    {tSync('aiAssistant.conversations.empty.description', 'Start a conversation to see your chat history here')}
                  </Text>
                </Paper>
              ) : (
                <div className="conversations-list chat-style">
                  {conversations.map((conversation, index) => (
                    <div key={conversation.id} className="chat-conversation">
                      {/* Human Message - Right Side */}
                      <div className="chat-message human-message">
                        <div className="message-bubble human-bubble">
                          <div className="message-header">
                            <Text size="xs" c="dimmed" mb="xs">
                              {tSync('aiAssistant.chat.you', 'You')} • {conversation.timestamp}
                            </Text>
                          </div>
                          <Text size="sm">{conversation.message}</Text>
                        </div>
                      </div>

                      {/* AI Response - Left Side */}
                      <div className="chat-message ai-message">
                        <div className="message-bubble ai-bubble">
                          <div className="message-header">
                            <Group gap="xs" mb="xs">
                              <Text size="xs" c="dimmed">
                                {tSync('aiAssistant.chat.ai', 'AI Assistant')}
                              </Text>
                              {conversation.metadata?.response_type && (
                                <Badge 
                                  size="xs" 
                                  color={conversation.metadata.response_type === 'success' ? 'green' : 
                                         conversation.metadata.response_type === 'error' ? 'red' : 'blue'}
                                >
                                  {conversation.metadata.response_type}
                                </Badge>
                              )}
                            </Group>
                          </div>
                          {/* Render structured response if available, otherwise fall back to text */}
                          {conversation.structured_response ? (
                            <SmartResponseRenderer
                              structuredResponse={conversation.structured_response}
                              onSuggestionClick={handleSuggestionClick}
                              onObjectSelect={handleObjectSelect}
                              onFieldClick={handleFieldClick}
                              onShowMoreClick={handleShowMoreClick}
                            />
                          ) : (
                            <div>
                              {(() => {
                                const response = renderConversationResponse(conversation);
                                // If it's a string, wrap it in Text component, otherwise it's already a component
                                return typeof response === 'string' ? (
                                  <Text size="sm" style={{ whiteSpace: 'pre-line' }}>
                                    {response}
                                  </Text>
                                ) : response;
                              })()}
                            </div>
                          )}
                        
                          {/* Show AI metadata if available */}
                          {conversation.metadata && (
                            <div className="message-metadata" style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--mantine-color-gray-2)' }}>
                              <Group gap="xs" mb="xs">
                                {conversation.metadata.intent && typeof conversation.metadata.intent === 'string' && (
                                  <Badge size="xs" color="blue">
                                    {tSync('aiAssistant.metadata.intent')} {conversation.metadata.intent}
                                  </Badge>
                                )}
                                {conversation.metadata.intent_understood && typeof conversation.metadata.intent_understood === 'string' && (
                                  <Badge size="xs" color="blue">
                                    {tSync('aiAssistant.metadata.understood')} {conversation.metadata.intent_understood}
                                  </Badge>
                                )}
                                {conversation.metadata.confidence && typeof conversation.metadata.confidence === 'number' && (
                                  <Badge size="xs" color="green">
                                    {tSync('aiAssistant.metadata.confidence')} {Math.round(conversation.metadata.confidence * 100)}%
                                  </Badge>
                                )}
                                {conversation.metadata.execution_time && typeof conversation.metadata.execution_time === 'number' && (
                                  <Badge size="xs" color="gray">
                                    {conversation.metadata.execution_time}{tSync('aiAssistant.metadata.execution_time')}
                                  </Badge>
                                )}
                              </Group>
                              {conversation.metadata.tools_used && Array.isArray(conversation.metadata.tools_used) && conversation.metadata.tools_used.length > 0 && (
                                <Text size="xs" c="dimmed">
                                  {tSync('aiAssistant.metadata.tools_used')} {conversation.metadata.tools_used.join(', ')}
                                </Text>
                              )}
                              {conversation.metadata.actions_taken && Array.isArray(conversation.metadata.actions_taken) && conversation.metadata.actions_taken.length > 0 && (
                                <Text size="xs" c="dimmed">
                                  {tSync('aiAssistant.metadata.actions')} {conversation.metadata.actions_taken.join(', ')}
                                </Text>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={conversationsEndRef} />
                </div>
              )}
            </div>

            {/* Streaming response is now handled by the overlay - no container needed */}

            {/* Input Section - Now at the bottom */}
            <div className="ai-input-section">
              <Paper className="ai-input-container" shadow="sm" radius="md">
                <div className="ai-input-header">
                  <Title order={4}>{tSync('aiAssistant.input.title')}</Title>
                  <Text size="sm" c="dimmed">
                    {wsConnected 
                      ? tSync('aiAssistant.status.websocket.chat', 'Chat')
                      : tSync('aiAssistant.status.websocket.connecting.chat', 'Connecting to chat...')
                    }
                  </Text>
                </div>
                
                <div className="ai-input-area">
                  {/* Conversation Selection Status */}
                  {!currentConversation && (
                    <Alert 
                      icon={<IconAlertCircle size={16} />} 
                      title={availableConversationCount === 0 ? tSync('aiAssistant.notifications.noConversations.title') : tSync('aiAssistant.notifications.noConversationSelected.title')}
                      color="yellow"
                      variant="light"
                      mb="md"
                    >
                      {availableConversationCount === 0 
                        ? tSync('aiAssistant.notifications.noConversations.message', 'No conversations available')
                        : tSync('aiAssistant.notifications.noConversationSelected.message', 'Please select a conversation first')
                      }
                    </Alert>
                  )}
                  
                  
                  <Textarea
                    placeholder={aiHealth ? tSync('aiAssistant.input.placeholder') : tSync('aiAssistant.status.unavailable')}
                    value={userInput}
                    onChange={(e) => setUserInput(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (userInput.trim() && aiHealth && !isGenerating && currentConversation) {
                          handleGenerateQuery();
                        }
                      }
                    }}
                    minRows={3}
                    maxRows={6}
                    autosize
                    disabled={!aiHealth || isGenerating || !currentConversation}
                  />
                  
                  <Button
                    onClick={handleGenerateQuery}
                    loading={isGenerating}
                    disabled={!userInput.trim() || !aiHealth || !currentConversation}
                    leftSection={<IconSparkles size={16} />}
                    fullWidth
                    mt="md"
                  >
                    {isGenerating 
                      ? (wsConnected ? tSync('aiAssistant.status.sending') : tSync('aiAssistant.input.generating'))
                      : tSync('aiAssistant.input.generate', 'Generate')
                    }
                  </Button>
                </div>
              </Paper>
            </div>
          </div>

          <div className="ai-assistant-right">
            <div className="ai-suggestions">
              <ConversationList
                connectionUuid={currentConnectionUuid || 'empty-connection'}
                onSelectConversation={handleSelectConversation}
                onEditConversation={handleEditConversation}
                onDeleteConversation={handleDeleteConversation}
                onCopyMessage={handleCopyMessage}
                onReuseMessage={handleReuseMessage}
                onCreateConversation={() => setShowCreateConversationModal(true)}
                selectedConversationUuid={currentConversation?.conversation_uuid}
                limit={5}
                refreshTrigger={conversationListRefreshTrigger}
                onConversationCountChange={handleConversationCountChange}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Create Conversation Modal - Custom Implementation */}
      {showCreateConversationModal && (
        <div 
          className={`create-conversation-modal-overlay ${isModalClosing ? 'closing' : ''}`} 
          onClick={handleCloseModal}
        >
          <div 
            className={`create-conversation-modal ${isModalClosing ? 'closing' : ''}`} 
            onClick={(e) => e.stopPropagation()}
          >
            <div className="create-conversation-modal-header">
              <h3>{tSync('conversations.create.title')}</h3>
              <button 
                className="create-conversation-modal-close"
                onClick={handleCloseModal}
              >
                ×
              </button>
            </div>
            
            <div className="create-conversation-modal-content">
              <div className="create-conversation-modal-input-group">
                <label>{tSync('conversations.create.titleLabel')}</label>
                <input
                  type="text"
                  placeholder={tSync('conversations.create.titlePlaceholder')}
                  value={newConversationTitle}
                  onChange={(e) => setNewConversationTitle(e.target.value)}
                />
              </div>
              
              <div className="create-conversation-modal-input-group">
                <label>{tSync('conversations.create.descriptionLabel')}</label>
                <textarea
                  placeholder={tSync('conversations.create.descriptionPlaceholder')}
                  value={newConversationDescription}
                  onChange={(e) => setNewConversationDescription(e.target.value)}
                />
              </div>
              
              <div className="create-conversation-modal-input-group">
                <label>{tSync('conversations.create.tagsLabel')}</label>
                <input
                  type="text"
                  placeholder={tSync('conversations.create.tagsPlaceholder')}
                  value={newConversationTags}
                  onChange={(e) => setNewConversationTags(e.target.value)}
                />
              </div>
              
              {userInput.trim() && (
                <div className="create-conversation-modal-initial-message">
                  <div className="create-conversation-modal-initial-message-label">
                    {tSync('conversations.create.initialMessage')}
                  </div>
                  <div className="create-conversation-modal-initial-message-content">
                    {userInput}
                  </div>
                </div>
              )}
              
              <div className="create-conversation-modal-actions">
                <button
                  className="create-conversation-modal-button cancel"
                  onClick={handleCloseModal}
                >
                  {tSync('common.cancel', 'Cancel')}
                </button>
                <button
                  className="create-conversation-modal-button create"
                  onClick={handleCreateConversation}
                >
                  {tSync('conversations.create.create')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Conversation Modal */}
      {showEditConversationModal && editingConversation && (
        <div
          className="create-conversation-modal-overlay"
          onClick={handleCloseEditModal}
        >
          <div
            className={`create-conversation-modal ${isModalClosing ? 'closing' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="create-conversation-modal-header">
              <h3>{tSync('conversations.edit.title')}</h3>
              <button
                className="create-conversation-modal-close"
                onClick={handleCloseEditModal}
              >
                ×
              </button>
            </div>
            
            <div className="create-conversation-modal-content">
              <div className="create-conversation-modal-input-group">
                <label>{tSync('conversations.create.titleLabel')}</label>
                <input
                  type="text"
                  placeholder={tSync('conversations.create.titlePlaceholder')}
                  value={editConversationTitle}
                  onChange={(e) => setEditConversationTitle(e.target.value)}
                />
              </div>
              
              <div className="create-conversation-modal-input-group">
                <label>{tSync('conversations.create.tagsLabel')}</label>
                <input
                  type="text"
                  placeholder={tSync('conversations.create.tagsPlaceholder')}
                  value={editConversationTags}
                  onChange={(e) => setEditConversationTags(e.target.value)}
                />
              </div>
              
              <div className="create-conversation-modal-actions">
                <button
                  className="create-conversation-modal-button cancel"
                  onClick={handleCloseEditModal}
                >
                  {tSync('common.cancel', 'Cancel')}
                </button>
                <button
                  className="create-conversation-modal-button create"
                  onClick={handleUpdateConversation}
                >
                  {tSync('conversations.edit.update')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
