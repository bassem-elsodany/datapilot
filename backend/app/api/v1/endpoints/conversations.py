"""
Conversations API Endpoints - REST Compliant

This module provides RESTful API endpoints for conversation management in the DataPilot backend.
It handles storage, retrieval, and management of AI agent conversations with metadata,
messages, and conversation analytics.

Features:
- Complete CRUD operations for conversations
- Message management within conversations
- Conversation summary and analytics
- Connection-specific conversation isolation
- Conversation status management
- Message threading and metadata
- Performance analytics and insights
- REST-compliant resource hierarchy

REST-Compliant Endpoints:
- POST /conversations - Create conversation
- GET /conversations - Get conversations
- GET /conversations/{uuid} - Get specific conversation
- PUT /conversations/{uuid} - Update conversation
- DELETE /conversations/{uuid} - Delete conversation
- POST /conversations/{uuid}/messages - Add message to conversation
- GET /conversations/{uuid}/messages - Get conversation messages
- GET /conversations/{uuid}/analytics - Get conversation analytics
- GET /conversations/stats - Get conversation statistics

Author: Bassem Elsodany
GitHub: https://github.com/bassem-elsodany
LinkedIn: https://www.linkedin.com/in/bassem-elsodany/
Version: 1.0.0
License: MIT License
"""

from fastapi import APIRouter, HTTPException, status, Depends, Request, Query
from pydantic import BaseModel, Field
from typing import List, Optional
from app.services.conversation_service import ConversationService
from app.services.error_service import ErrorService
from app.services.i18n_service import I18nService
from app.models.conversation import (
    ConversationCreate, ConversationUpdate, ConversationResponse,
    ConversationListResponse, ConversationMessageCreate, ConversationMessageResponse,
    ConversationAnalytics, ConversationStats
)

from loguru import logger

router = APIRouter()
conversation_service = ConversationService()
i18n_service = I18nService()

# Pydantic models for REST compliance
class ConversationCreateRequest(BaseModel):
    """Request to create a new conversation"""
    connection_uuid: str = Field(..., description="Connection UUID")
    agent_name: str = Field(default="datapilot-agent", description="AI agent name (e.g., datapilot-agent, salesforce-agent)")
    title: Optional[str] = Field(None, max_length=255, description="Conversation title (auto-generated if not provided)")
    description: Optional[str] = Field(None, max_length=1000, description="Conversation description")
    tags: Optional[str] = Field(None, description="Comma-separated tags")
    initial_message: Optional[str] = Field(None, description="Initial user message")
    created_by: str = Field("user", description="Created by user")

class ConversationUpdateRequest(BaseModel):
    """Request to update an existing conversation"""
    title: Optional[str] = Field(None, min_length=1, max_length=255, description="Conversation title")
    description: Optional[str] = Field(None, max_length=1000, description="Conversation description")
    tags: Optional[str] = Field(None, description="Comma-separated tags")
    agent_name: Optional[str] = Field(None, description="AI agent name")
    updated_by: str = Field("user", description="Updated by user")

class ConversationMessageRequest(BaseModel):
    """Request to add a message to a conversation"""
    role: str = Field(..., description="Message role: 'user' or 'assistant'")
    content: str = Field(..., description="Message content")
    message_type: str = Field(default="text", description="Message type")
    metadata: Optional[dict] = Field(default_factory=dict, description="Additional metadata")
    parent_message_id: Optional[str] = Field(None, description="Parent message ID for threading")

class ConversationSummaryRequest(BaseModel):
    """Request to update conversation summary"""
    summary: str = Field(..., description="Conversation summary")
    key_topics: List[str] = Field(default_factory=list, description="Key topics discussed")
    queries_executed: int = Field(default=0, description="Number of SOQL queries executed")
    insights_generated: List[str] = Field(default_factory=list, description="Key insights generated")

class ErrorResponse(BaseModel):
    """Standard error response"""
    detail: str
    error_code: Optional[str] = None

# REST Compliant Endpoints

@router.get("/stats", response_model=ConversationStats)
def get_conversation_stats(
    connection_uuid: Optional[str] = Query(None, description="Filter stats by connection UUID"),
    agent_name: Optional[str] = Query(None, description="Filter stats by agent name"),
    http_request: Request = None,
    lang: str = Query("en", description="Language code for messages")
):
    """GET /conversations/stats - Get conversation statistics"""
    try:
        logger.debug("Getting conversation statistics")
        
        # Get stats
        stats_data = conversation_service.get_conversation_stats(connection_uuid, agent_name)
        
        logger.info("✅ Retrieved conversation statistics")
        return ConversationStats(**stats_data)
        
    except ValueError as e:
        logger.error(f"Validation error getting stats: {str(e)}")
        ErrorService.raise_validation_error(
            message="conversations.errors.invalid_filter",
            field_errors={"filter": str(e)},
            request=http_request,
            locale=lang
        )
    except Exception as e:
        logger.error(f"Failed to get stats: {str(e)}")
        ErrorService.handle_generic_exception(
            exception=e,
            operation="retrieving conversation statistics",
            request=http_request,
            locale=lang
        )

@router.post("/", response_model=ConversationResponse, status_code=status.HTTP_201_CREATED)
def create_conversation(
    request: ConversationCreateRequest,
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """POST /conversations - Create a new conversation"""
    try:
        logger.debug("Creating conversation with request {request}")
        
        # Generate title if not provided
        title = request.title
        if not title:
            # Get connection name for title generation
            connection_name = conversation_service.get_connection_name(request.connection_uuid)
            title = conversation_service.generate_conversation_title(connection_name)
        
        # Create conversation
        conversation_data = ConversationCreate(
            connection_uuid=request.connection_uuid,
            agent_name=request.agent_name,
            title=title,
            description=request.description,
            tags=request.tags,
            initial_message=request.initial_message,
            created_by=request.created_by
        )
        
        saved_conversation = conversation_service.create_conversation(conversation_data)
        
        logger.info(f"✅ Created conversation: {saved_conversation['conversation_uuid']}")
        return ConversationResponse(**saved_conversation)
        
    except ValueError as e:
        logger.error(f"Validation error creating conversation: {str(e)}")
        ErrorService.raise_validation_error(
            message="conversations.errors.invalid_data",
            field_errors={"conversation": str(e)},
            request=http_request,
            locale=lang
        )
    except Exception as e:
        logger.error(f"Failed to create conversation: {str(e)}")
        ErrorService.handle_generic_exception(
            exception=e,
            operation="creating conversation",
            request=http_request,
            locale=lang
        )

@router.get("/", response_model=ConversationListResponse)
def get_all_conversations(
    connection_uuid: str,
    agent_name: Optional[str] = Query(None, description="Filter by agent name"),
    http_request: Request = None,
    lang: str = Query("en", description="Language code for messages")
):
    """GET /conversations - Get all conversations, optionally filtered by connection and agent"""
    try:
        logger.debug(f"Getting conversations for connection {connection_uuid}")
        
        # Get conversations for the specified connection
        conversations_data = conversation_service.get_all_conversations(
            connection_uuid=connection_uuid,
            agent_name=agent_name
        )
        
        conversations = [ConversationResponse(**conv) for conv in conversations_data]
        
        logger.info(f"Retrieved {len(conversations)} conversations")
        return ConversationListResponse(
            conversations=conversations,
            total_count=len(conversations)
        )
        
    except ValueError as e:
        logger.error(f"Validation error getting conversations: {str(e)}")
        ErrorService.raise_validation_error(
            message="conversations.errors.invalid_filter",
            field_errors={"filter": str(e)},
            request=http_request,
            locale=lang
        )
    except Exception as e:
        logger.error(f"Failed to get conversations: {str(e)}")
        ErrorService.handle_generic_exception(
            exception=e,
            operation="retrieving conversations",
            request=http_request,
            locale=lang
        )

@router.get("/{conversation_uuid}", response_model=ConversationResponse)
def get_conversation(
    conversation_uuid: str,
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """GET /conversations/{uuid} - Get a specific conversation by UUID"""
    try:
        logger.debug(f"Getting conversation: {conversation_uuid}")
        
        # Get conversation
        conversation_data = conversation_service.get_conversation_by_uuid(conversation_uuid)
        
        if not conversation_data:
            logger.warning(f"⚠️ Conversation not found: {conversation_uuid}")
            ErrorService.raise_not_found_error(
                message="conversations.errors.not_found",
                resource_type="conversation",
                resource_id=conversation_uuid,
                request=http_request,
                locale=lang
            )
        
        logger.info(f"✅ Retrieved conversation: {conversation_uuid}")
        return ConversationResponse(**conversation_data)
        
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"❌ Validation error getting conversation: {str(e)}")
        ErrorService.raise_validation_error(
            message="conversations.errors.invalid_identifier",
            field_errors={"conversation_uuid": str(e)},
            request=http_request,
            locale=lang
        )
    except Exception as e:
        logger.error(f"❌ Failed to get conversation: {str(e)}")
        ErrorService.handle_generic_exception(
            exception=e,
            operation="retrieving conversation",
            request=http_request,
            locale=lang
        )

@router.put("/{conversation_uuid}", response_model=ConversationResponse)
def update_conversation(
    conversation_uuid: str,
    request: ConversationUpdateRequest,
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """PUT /conversations/{uuid} - Update a conversation"""
    try:
        logger.debug(f"Updating conversation: {conversation_uuid}")
        
        # Update conversation
        update_data = ConversationUpdate(
            title=request.title,
            description=request.description,
            tags=request.tags,
            agent_name=request.agent_name,
            updated_by=request.updated_by
        )
        
        updated_conversation = conversation_service.update_conversation(conversation_uuid, update_data)
        
        logger.info(f"✅ Updated conversation: {conversation_uuid}")
        return ConversationResponse(**updated_conversation)
        
    except ValueError as e:
        logger.error(f"❌ Validation error updating conversation: {str(e)}")
        ErrorService.raise_validation_error(
            message="conversations.errors.invalid_update_data",
            field_errors={"conversation": str(e)},
            request=http_request,
            locale=lang
        )
    except Exception as e:
        logger.error(f"❌ Failed to update conversation: {str(e)}")
        ErrorService.handle_generic_exception(
            exception=e,
            operation="updating conversation",
            request=http_request,
            locale=lang
        )

@router.delete("/{conversation_uuid}", status_code=status.HTTP_204_NO_CONTENT)
def delete_conversation(
    conversation_uuid: str,
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """DELETE /conversations/{uuid} - Delete a conversation"""
    try:
        logger.debug(f"Deleting conversation: {conversation_uuid}")
        
        # Delete conversation
        success = conversation_service.delete_conversation(conversation_uuid)
        
        if not success:
            logger.warning(f"⚠️ Conversation not found for deletion: {conversation_uuid}")
            ErrorService.raise_not_found_error(
                message="conversations.errors.not_found",
                resource_type="conversation",
                resource_id=conversation_uuid,
                request=http_request,
                locale=lang
            )
        
        logger.info(f"✅ Deleted conversation: {conversation_uuid}")
        return None
        
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"❌ Validation error deleting conversation: {str(e)}")
        ErrorService.raise_validation_error(
            message="conversations.errors.invalid_identifier_for_deletion",
            field_errors={"conversation_uuid": str(e)},
            request=http_request,
            locale=lang
        )
    except Exception as e:
        logger.error(f"❌ Failed to delete conversation: {str(e)}")
        ErrorService.handle_generic_exception(
            exception=e,
            operation="deleting conversation",
            request=http_request,
            locale=lang
        )

@router.post("/{conversation_uuid}/messages", response_model=ConversationMessageResponse, status_code=status.HTTP_201_CREATED)
def add_message_to_conversation(
    conversation_uuid: str,
    request: ConversationMessageRequest,
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """POST /conversations/{uuid}/messages - Add a message to a conversation"""
    try:
        logger.debug(f"Adding message to conversation: {conversation_uuid}")
        
        # Create message
        message_data = ConversationMessageCreate(
            role=request.role,
            content=request.content,
            message_type=request.message_type,
            metadata=request.metadata,
            parent_message_id=request.parent_message_id
        )
        
        message = conversation_service.add_message_to_conversation(conversation_uuid, message_data)
        
        logger.info(f"✅ Added message to conversation: {conversation_uuid}")
        return ConversationMessageResponse(**message)
        
    except ValueError as e:
        logger.error(f"❌ Validation error adding message: {str(e)}")
        ErrorService.raise_validation_error(
            message="conversations.errors.invalid_message_data",
            field_errors={"message": str(e)},
            request=http_request,
            locale=lang
        )
    except Exception as e:
        logger.error(f"❌ Failed to add message: {str(e)}")
        ErrorService.handle_generic_exception(
            exception=e,
            operation="adding message to conversation",
            request=http_request,
            locale=lang
        )

@router.get("/{conversation_uuid}/messages", response_model=List[ConversationMessageResponse])
def get_conversation_messages(
    conversation_uuid: str,
    limit: Optional[int] = Query(None, description="Limit number of messages returned"),
    http_request: Request = None,
    lang: str = Query("en", description="Language code for messages")
):
    """GET /conversations/{uuid}/messages - Get all messages for a conversation"""
    try:
        logger.debug(f"Getting messages for conversation: {conversation_uuid}")
        
        # Get messages
        messages_data = conversation_service.get_conversation_messages(conversation_uuid, limit)
        
        messages = [ConversationMessageResponse(**msg) for msg in messages_data]
        
        logger.info(f"✅ Retrieved {len(messages)} messages for conversation: {conversation_uuid}")
        return messages
        
    except ValueError as e:
        logger.error(f"❌ Validation error getting messages: {str(e)}")
        ErrorService.raise_validation_error(
            message="conversations.errors.invalid_identifier",
            field_errors={"conversation_uuid": str(e)},
            request=http_request,
            locale=lang
        )
    except Exception as e:
        logger.error(f"❌ Failed to get messages: {str(e)}")
        ErrorService.handle_generic_exception(
            exception=e,
            operation="retrieving conversation messages",
            request=http_request,
            locale=lang
        )

@router.get("/{conversation_uuid}/analytics", response_model=ConversationAnalytics)
def get_conversation_analytics(
    conversation_uuid: str,
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """GET /conversations/{uuid}/analytics - Get analytics for a conversation"""
    try:
        logger.debug(f"Getting analytics for conversation: {conversation_uuid}")
        
        # Get analytics
        analytics_data = conversation_service.get_conversation_analytics(conversation_uuid)
        
        if not analytics_data:
            logger.warning(f"⚠️ Conversation not found for analytics: {conversation_uuid}")
            ErrorService.raise_not_found_error(
                message="conversations.errors.not_found",
                resource_type="conversation",
                resource_id=conversation_uuid,
                request=http_request,
                locale=lang
            )
        
        logger.info(f"✅ Retrieved analytics for conversation: {conversation_uuid}")
        return ConversationAnalytics(**analytics_data)
        
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"❌ Validation error getting analytics: {str(e)}")
        ErrorService.raise_validation_error(
            message="conversations.errors.invalid_identifier",
            field_errors={"conversation_uuid": str(e)},
            request=http_request,
            locale=lang
        )
    except Exception as e:
        logger.error(f"❌ Failed to get analytics: {str(e)}")
        ErrorService.handle_generic_exception(
            exception=e,
            operation="retrieving conversation analytics",
            request=http_request,
            locale=lang
        )

@router.post("/{conversation_uuid}/summary", status_code=status.HTTP_200_OK)
def update_conversation_summary(
    conversation_uuid: str,
    request: ConversationSummaryRequest,
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """POST /conversations/{uuid}/summary - Update conversation summary"""
    try:
        logger.debug(f"Updating summary for conversation: {conversation_uuid}")
        
        # Update summary
        from app.models.conversation import ConversationSummary
        summary_data = ConversationSummary(
            summary=request.summary,
            key_topics=request.key_topics,
            queries_executed=request.queries_executed,
            insights_generated=request.insights_generated
        )
        
        success = conversation_service.update_conversation_summary(conversation_uuid, summary_data)
        
        if not success:
            logger.warning(f"⚠️ Conversation not found for summary update: {conversation_uuid}")
            ErrorService.raise_not_found_error(
                message="conversations.errors.not_found",
                resource_type="conversation",
                resource_id=conversation_uuid,
                request=http_request,
                locale=lang
            )
        
        logger.info(f"✅ Updated summary for conversation: {conversation_uuid}")
        success_message = i18n_service.get_translation_key(lang, 'conversations.messages.summary_updated') or 'Conversation summary updated successfully'
        return {"message": success_message}
        
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"❌ Validation error updating summary: {str(e)}")
        ErrorService.raise_validation_error(
            message="conversations.errors.invalid_summary_data",
            field_errors={"summary": str(e)},
            request=http_request,
            locale=lang
        )
    except Exception as e:
        logger.error(f"❌ Failed to update summary: {str(e)}")
        ErrorService.handle_generic_exception(
            exception=e,
            operation="updating conversation summary",
            request=http_request,
            locale=lang
        )
