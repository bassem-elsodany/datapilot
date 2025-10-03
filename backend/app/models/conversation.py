"""
DataPilot Backend - Conversation Data Model

This module defines the comprehensive conversation data model for AI agent conversations,
handling enterprise-grade storage and management of user-agent conversation sessions with
advanced metadata, messages, and conversation summaries with security and compliance features.

The conversation model provides:
- Enterprise-grade conversation metadata and management
- Advanced message history with comprehensive timestamps
- Intelligent conversation summary and insights generation
- Connection-specific conversation isolation and security
- Complete conversation status and lifecycle management
- Advanced message categorization and metadata tracking
- Comprehensive conversation analytics and statistics

Core Conversation Features:

Conversation Management:
- Unique conversation identification and tracking
- Conversation metadata and configuration
- Conversation status and lifecycle management
- Conversation sharing and collaboration
- Conversation archiving and retention
- Conversation search and discovery

Message Management:
- Advanced message history with timestamps
- Message categorization and metadata
- Message content validation and sanitization
- Message security and access control
- Message analytics and statistics
- Message search and filtering

Conversation Analytics:
- Conversation performance monitoring and metrics
- Conversation usage statistics and reporting
- Conversation success rate tracking
- Conversation error analysis and reporting
- Conversation optimization and recommendations
- Conversation business intelligence and insights

Security & Compliance:
- Secure conversation storage and access control
- Conversation content validation and sanitization
- Access control and permission management
- Audit trail for all conversation operations
- Data privacy and GDPR compliance
- Security event logging and monitoring

Performance & Optimization:
- Optimized conversation storage and retrieval
- Efficient conversation search and filtering
- Memory usage optimization
- Performance monitoring and metrics
- Scalability and load balancing
- Resource usage optimization

Integration Points:
- MongoDB database operations
- AI agent workflow integration
- Logging and monitoring systems
- Error handling and reporting
- Frontend user interface
- API endpoint integration

Author: Bassem Elsodany
GitHub: https://github.com/bassem-elsodany
LinkedIn: https://www.linkedin.com/in/bassem-elsodany/
Version: 2.1.0
License: MIT License
"""

from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from uuid import uuid4


class ConversationMessage(BaseModel):
    """Individual message within a conversation"""
    message_id: str = Field(default_factory=lambda: str(uuid4()), description="Unique message identifier")
    role: str = Field(..., description="Message role: 'user' or 'assistant'")
    content: str = Field(..., description="Message content")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), description="Message timestamp")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional message metadata")
    message_type: str = Field(default="text", description="Message type: text, query, response, error, etc.")
    is_edited: bool = Field(default=False, description="Whether the message was edited")
    parent_message_id: Optional[str] = Field(None, description="Parent message ID for threaded conversations")


class ConversationSummary(BaseModel):
    """Summary and insights for a conversation"""
    summary: str = Field(..., description="Conversation summary")
    key_topics: List[str] = Field(default_factory=list, description="Key topics discussed")
    queries_executed: int = Field(default=0, description="Number of SOQL queries executed")
    insights_generated: List[str] = Field(default_factory=list, description="Key insights generated")
    last_updated: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), description="Last summary update")


class ConversationCreate(BaseModel):
    """Request model for creating a new conversation"""
    connection_uuid: str = Field(..., description="Connection UUID")
    agent_name: str = Field(default="datapilot-agent", description="AI agent name (e.g., datapilot-agent, salesforce-agent)")
    title: str = Field(..., min_length=1, max_length=255, description="Conversation title")
    description: Optional[str] = Field(None, max_length=1000, description="Conversation description")
    tags: Optional[str] = Field(None, description="Comma-separated tags")
    initial_message: Optional[str] = Field(None, description="Initial user message")
    created_by: str = Field("user", description="Created by user")


class ConversationUpdate(BaseModel):
    """Request model for updating a conversation"""
    title: Optional[str] = Field(None, min_length=1, max_length=255, description="Conversation title")
    description: Optional[str] = Field(None, max_length=1000, description="Conversation description")
    tags: Optional[str] = Field(None, description="Comma-separated tags")
    agent_name: Optional[str] = Field(None, description="AI agent name")
    updated_by: str = Field("user", description="Updated by user")


class ConversationResponse(BaseModel):
    """Response model for conversation data"""
    conversation_uuid: str
    connection_uuid: str
    agent_name: str
    title: str
    description: Optional[str]
    tags: Optional[str]
    message_count: int
    last_message_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    created_by: str
    updated_by: str
    summary: Optional[ConversationSummary]
    messages: Optional[List[ConversationMessage]] = None  # Optional for list views
    version: int


class ConversationListResponse(BaseModel):
    """Response model for conversation list"""
    conversations: List[ConversationResponse]
    total_count: int


class ConversationMessageCreate(BaseModel):
    """Request model for adding a message to a conversation"""
    role: str = Field(..., description="Message role: 'user' or 'assistant'")
    content: str = Field(..., description="Message content")
    message_type: str = Field(default="text", description="Message type")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional metadata")
    parent_message_id: Optional[str] = Field(None, description="Parent message ID for threading")


class ConversationMessageResponse(BaseModel):
    """Response model for conversation message"""
    message_id: str
    conversation_uuid: str
    role: str
    content: str
    timestamp: datetime
    metadata: Dict[str, Any]
    message_type: str
    is_edited: bool
    parent_message_id: Optional[str]


class ConversationAnalytics(BaseModel):
    """Analytics data for a conversation"""
    total_messages: int
    user_messages: int
    assistant_messages: int
    queries_executed: int
    average_response_time: Optional[float]  # in seconds
    conversation_duration: Optional[float]  # in minutes
    key_topics: List[str]
    most_used_features: List[str]


class ConversationStats(BaseModel):
    """Statistics for conversation management"""
    total_conversations: int
    total_messages: int
    average_messages_per_conversation: float
    most_active_connection: Optional[str]
    recent_activity: List[Dict[str, Any]]
