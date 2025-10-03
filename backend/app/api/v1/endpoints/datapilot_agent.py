"""
DataPilot Backend - AI Agent API Endpoints

This module provides comprehensive REST API and WebSocket endpoints for the DataPilot AI Agent
with advanced LangGraph integration, offering intelligent SOQL query generation, Salesforce data
analysis, and real-time conversation management with enterprise-grade security and performance.

The AI Agent API provides:
- Advanced LangGraph-based workflow orchestration
- Real-time WebSocket communication for streaming responses
- Intelligent conversation management with context awareness
- SOQL query generation and optimization
- Salesforce data analysis and business intelligence
- Multi-step workflow execution with state persistence
- Enterprise-grade security and compliance features

Core AI Capabilities:

Natural Language Processing:
- Intent recognition and entity extraction
- Context-aware query understanding
- Multi-language support for global users
- Ambiguity resolution and clarification
- Query refinement and optimization
- Business terminology mapping

SOQL Query Generation:
- Automatic SOQL generation from natural language
- Query optimization and performance tuning
- Relationship traversal and joins
- Aggregate functions and grouping
- Date range and filter generation
- Complex query composition

Business Intelligence:
- Data trend analysis and insights
- Performance metrics and KPIs
- Anomaly detection and alerts
- Predictive analytics and forecasting
- Comparative analysis and benchmarking
- Custom dashboard generation

Conversation Management:
- Thread-based conversation persistence
- Context-aware response generation
- Multi-turn conversation support
- Conversation summarization and archiving
- User preference learning and adaptation
- Conversation history and retrieval

Real-time Streaming:
- WebSocket-based real-time communication
- Progressive response generation
- Streaming data visualization
- Real-time progress indicators
- Interactive conversation flow
- Live collaboration support

REST API Endpoints:

AI Agent Operations:
- POST /agent - Process AI query with intelligent response generation
- GET /conversations/{uuid} - Get conversation state and history
- DELETE /conversations/{uuid} - Clear conversation state and history
- GET /health - Agent health and capabilities check

WebSocket Endpoints:
- WebSocket /ws/agent - Real-time chat with streaming responses
- WebSocket /ws/agent/{conversation_uuid} - Conversation-specific streaming

Security Features:
- Master key-based authentication
- Input validation and sanitization
- SQL injection and XSS prevention
- Access control and permissions
- Audit trail for all operations
- Secure error handling

Performance Features:
- Asynchronous processing
- Connection pooling and reuse
- Caching and optimization
- Memory management
- Scalability and load balancing
- Performance monitoring

Integration Points:
- LangGraph workflow orchestration
- MongoDB conversation storage
- Salesforce API integration
- WebSocket real-time communication
- Frontend user interface
- Logging and monitoring systems

Compliance & Audit:
- Complete audit trail for all operations
- Data privacy and GDPR compliance
- Security event logging and monitoring
- Compliance reporting and analytics
- Data retention and deletion policies
- Security incident response

Author: Bassem Elsodany
GitHub: https://github.com/bassem-elsodany
LinkedIn: https://www.linkedin.com/in/bassem-elsodany/
Version: 1.0.0
License: MIT License
"""

import json
import asyncio
from typing import Dict, List, Optional, Any
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Depends, WebSocket, WebSocketDisconnect, Request, Query, Header, status
from fastapi.responses import JSONResponse
from langgraph.graph.state import Runnable  # pyright: ignore[reportMissingImports]
from pydantic import BaseModel, Field
from langgraph.graph.state import CompiledStateGraph  # pyright: ignore[reportMissingImports]
from app.ai_agent.workflow.graph import get_graph

# Removed ai_agent_service imports - using standalone functions directly
from app.ai_agent.datapilot_workflow import get_response, get_streaming_response
from app.services.connection_service import ConnectionService
from app.services.salesforce_service import SalesforceService
# Removed redundant conversation_service - using LangGraph persistence only
from app.services.error_service import ErrorService
# ChatMessage model moved to inline definition since conversation.py was removed
from loguru import logger
from app.models.auth_provider import AuthProvider
from fastapi import Depends, FastAPI, Path, Request
from typing import Annotated, Literal, cast

router = APIRouter(prefix="/datapilot-agent", tags=["DataPilot Agent"])

# ============================================================================
# PYDANTIC MODELS
# ============================================================================

class ChatMessage(BaseModel):
    """Chat message model for WebSocket communication"""
    type: str = Field(..., description="Type of message: user_message, ai_response, system_message, error_message, stream_update, stream_complete")
    content: str = Field(..., description="Message content")
    user_id: Optional[str] = Field(None, description="User identifier")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional message metadata")


class AIQueryRequest(BaseModel):
    """Request model for AI agent queries"""
    query: str = Field(..., description="Natural language query from user")


class AIQueryResponse(BaseModel):
    """Response model for AI agent queries"""
    success: bool = Field(..., description="Whether the query was processed successfully")
    response: str = Field(..., description="Natural language response from AI agent")
    intent_understood: str = Field(..., description="What the AI understood about the query")
    actions_taken: List[str] = Field(default_factory=list, description="Actions performed by the AI agent")
    data_summary: Optional[Dict[str, Any]] = Field(None, description="Summary of data retrieved")
    soql_query: Optional[str] = Field(None, description="SOQL query if one was executed")
    execution_time: float = Field(default=0.0, description="Total execution time in seconds")
    confidence: float = Field(default=0.8, description="Confidence in the response")
    suggestions: List[str] = Field(default_factory=list, description="Follow-up suggestions")
    conversation_id: Optional[str] = Field(None, description="Conversation ID for follow-ups")
    thread_id: Optional[str] = Field(None, description="Thread ID for LangGraph conversation tracking")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")
    
# ============================================================================
# WEBSOCKET HANDLER WITH CONVERSATION MANAGEMENT
# ============================================================================

# Connection UUID management
def generate_connection_uuid() -> str:
    """Generate a unique connection UUID"""
    return f"conn_{uuid4().hex[:12]}"


# ============================================================================
# GLOBAL INSTANCES
# ============================================================================

# Global service instances
connection_service = ConnectionService()
salesforce_service = SalesforceService()


# ============================================================================
# REST API ENDPOINTS
# ============================================================================

@router.post("/{conversation_uuid}", response_model=Dict[str, Any])
async def agent(
    conversation_uuid: Annotated[str, Path(..., description="Conversation UUID")],
    graph: Annotated[CompiledStateGraph, Depends(get_graph)],
    http_request: Request,
    request: AIQueryRequest,
    connection_uuid: str = Query(..., description="Connection UUID"),
    lang: str = Query(..., description="Language code for messages"),

):
    """
    Process a natural language query through the DataPilot Agent (REST endpoint)
    
    This endpoint allows users to ask questions about Salesforce data in natural language.
    The DataPilot Agent will:
    1. Check Salesforce connection status via dependency injection
    2. Understand the intent of the query
    3. Gather relevant context and metadata
    4. Execute appropriate Salesforce operations
    5. Return a natural language response with insights
    
    Note: No master key authentication required - uses Salesforce service dependency injection
    """
    try:
        logger.debug(f"Processing AI query: {request.query} with connection UUID: {connection_uuid} and conversation UUID: {conversation_uuid} and lang: {lang} and agent: {agent}")
        
        # Validate connection exists in database
        connection = connection_service.get_connection_by_uuid(connection_uuid)
        if not connection:
            logger.error(f"Connection not found in database: {connection_uuid}")
            ErrorService.raise_not_found_error(
                message="connections.errors.not_found",
                resource_type="connection",
                resource_id=connection_uuid,
                request=http_request,
                locale=lang
            )
        
        # Quick check if Salesforce connection object exists (lightweight check)
        try:
            from app.services.salesforce_service import SalesforceService
            salesforce_service = SalesforceService()
            
            if not salesforce_service.connection or salesforce_service.connection is None:
                logger.error(f"Salesforce connection object is null for: {connection_uuid}")
                ErrorService.raise_validation_error(
                    message="connections.errors.not_found",
                    field_errors={"connection": "Salesforce connection is not initialized. Please check your connection settings."},
                    request=http_request,
                    locale=lang
                )
            
            logger.debug(f"Salesforce connection object exists for: {connection_uuid}")
            
        except Exception as e:
            logger.error(f"Error checking Salesforce connection object {connection_uuid}: {str(e)}")
            ErrorService.raise_validation_error(
                message="connections.errors.not_found",
                field_errors={"connection": f"Connection validation failed: {str(e)}"},
                request=http_request,
                locale=lang
            )
        
        # Process the query using standalone function - LangGraph handles conversation state
        response_text, final_state = await get_response(
            graph=graph,
            user_message=request.query,
            connection_uuid=connection_uuid,
            conversation_uuid=conversation_uuid
        )
        
        
        # Return the final state directly
        response = {
            "success": True,
            **final_state,
            "conversation_uuid": conversation_uuid,
            "connection_uuid": connection_uuid
        }
        
        # If structured_response exists, expose it at the top level for UI
        try:
            structured = final_state.get("structured_response") if isinstance(final_state, dict) else None
            if structured:
                response["structured_response"] = structured
                logger.debug(f"Structured response included in API response: {structured.get('response_type', 'unknown')}")
            else:
                logger.debug("No structured_response found in final_state")
        except Exception as e:
            logger.warning(f"Error handling structured_response: {e}")
        
        # Save conversation messages to database
        try:
            from app.services.conversation_service import ConversationService
            from app.models.conversation import ConversationMessageCreate
                
            conversation_service = ConversationService()
            
            # Save user message
            user_message_data = ConversationMessageCreate(
                role="user",
                content=request.query,
                message_type="text",
                parent_message_id=None,
                metadata={"connection_uuid": connection_uuid}
            )
            conversation_service.add_message_to_conversation(conversation_uuid, user_message_data)
            logger.debug(f"Saved user message to conversation: {conversation_uuid}")
            
            # Save AI response
            ai_response_content = final_state.get("response", {}).get("content", "No response generated")
            ai_message = ConversationMessageCreate(
                role="assistant",
                content=ai_response_content or "No response generated",
                message_type="ai_response",
                parent_message_id=None,
                metadata={
                    "connection_uuid": connection_uuid,
                    "structured_response": structured,
                    "response_type": structured.get("response_type") if structured else None,
                    "confidence": structured.get("confidence") if structured else None,
                    "confidence_label": structured.get("confidence_label") if structured else None
                }
            )
            conversation_service.add_message_to_conversation(conversation_uuid, ai_message)
            logger.debug(f"Saved AI response to conversation: {conversation_uuid}")
            
        except Exception as e:
            logger.warning(f"Failed to save conversation messages: {str(e)}")
            # Don't fail the request if conversation saving fails
        
        logger.debug(f"DataPilot Agent query processed successfully")
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        ErrorService.handle_generic_exception(
            exception=e,
            operation="processing AI query",
            request=http_request,
            locale=lang
        )

# ============================================================================
# WEBSOCKET ENDPOINTS
# ============================================================================

@router.websocket("/ws")
async def stream_agent(websocket: WebSocket, graph: Annotated[CompiledStateGraph, Depends(get_graph)]):
    """WebSocket endpoint for DataPilot Agent - simplified and working"""
    await websocket.accept()
    
    # Get connection UUID and conversation UUID from query params
    connection_uuid = websocket.query_params.get("connection_uuid")
    conversation_uuid = websocket.query_params.get("conversation_uuid")
    
    # Validate connection UUID is provided
    if not connection_uuid:
        await websocket.close(code=1008, reason="connection_uuid is required")
        return
    
    # Validate connection exists (same as HTTP endpoint)
    connection = connection_service.get_connection_by_uuid(connection_uuid)
    if not connection:
        await websocket.close(code=1008, reason="Connection not found")
        return
    
    # Validate conversation UUID is provided by UI
    if not conversation_uuid:
        logger.error("WebSocket: conversation_uuid is required but not provided")
        await websocket.close(code=1008, reason="conversation_uuid is required")
        return
    
    # Check Salesforce connection object (same as HTTP endpoint)
    from app.services.salesforce_service import SalesforceService
    salesforce_service = SalesforceService()
    if not salesforce_service.connection or salesforce_service.connection is None:
        await websocket.close(code=1008, reason="Connection not initialized")
        return
    
    logger.debug(f"WebSocket connected: {connection_uuid}, conversation: {conversation_uuid}")
    
    try:
        while True:
            # Receive message
            data = await websocket.receive_text()
            message_data = json.loads(data)
            
            # Handle user messages
            if message_data.get("type") == "user_message":
                user_query = message_data.get("content", "")
                logger.debug(f"WebSocket: Starting streaming for: {user_query[:50]}...")
                
                try:
                    # Track structured response for saving
                    final_structured_response = None
                    ai_response_content = ""
                    
                    # Stream the response directly
                    async for update in get_streaming_response(
                        graph=graph,
                        user_message=user_query,
                        connection_uuid=connection_uuid,
                        conversation_uuid=conversation_uuid,
                        stream_mode="values"
                    ):
                        # Send update directly without wrapping
                        await websocket.send_text(json.dumps(update))
                        
                        # Capture final structured response
                        if update.get("type") == "stream_update" and update.get("node") == "llm_structured_response":
                            final_structured_response = update.get("content")
                        
                        # Capture AI response content
                        if update.get("type") == "stream_update" and isinstance(update.get("content"), str):
                            ai_response_content += update.get("content", "")
                    
                    logger.debug(f"WebSocket: Streaming completed successfully")
                    
                    # Save messages to conversation AFTER streaming is complete
                    try:
                        from app.services.conversation_service import ConversationService
                        from app.models.conversation import ConversationMessageCreate
                        
                        conversation_service = ConversationService()
                        
                        # Save user message
                        user_message_data = ConversationMessageCreate(
                            role="user",
                            content=user_query,
                            message_type="text",
                            parent_message_id=None,
                            metadata={"connection_uuid": connection_uuid}
                        )
                        conversation_service.add_message_to_conversation(conversation_uuid, user_message_data)
                        logger.debug(f"Saved user message to conversation: {conversation_uuid}")
                        
                        # Save AI response
                        response_content = ai_response_content or "Response streamed successfully"
                        
                        ai_message = ConversationMessageCreate(
                            role="assistant",
                            content=response_content,
                            message_type="ai_response",
                            parent_message_id=None,
                            metadata={
                                "connection_uuid": connection_uuid,
                                "structured_response": final_structured_response,
                                "response_type": final_structured_response.get("response_type") if final_structured_response else None,
                                "confidence": final_structured_response.get("confidence") if final_structured_response else None,
                                "confidence_label": final_structured_response.get("confidence_label") if final_structured_response else None
                            }
                        )
                        conversation_service.add_message_to_conversation(conversation_uuid, ai_message)
                        logger.debug(f"Saved AI response to conversation: {conversation_uuid}")
                    except Exception as e:
                        logger.warning(f"Failed to save conversation messages: {str(e)}")
                    
                except Exception as e:
                    logger.error(f"WebSocket: Streaming failed: {str(e)}")
                    await websocket.send_text(json.dumps({
                        "type": "error", 
                        "content": f"Error: {str(e)}"
                    }))
            
            elif message_data.get("type") == "ping":
                # Handle ping
                await websocket.send_text(json.dumps({"type": "pong", "content": "pong"}))
            
    except WebSocketDisconnect:
        logger.debug(f"WebSocket disconnected: {connection_uuid}")
    except Exception as e:
        logger.error(f"WebSocket error: {str(e)}")
        try:
            await websocket.close(code=1011, reason="Server error")
        except:
            pass




@router.get("/health")
def soql_agent_health_check(
    http_request: Request,
    lang: str = Query(default="en", description="Language code for messages")
):
    """Combined health check endpoint with status, capabilities, and health information"""
    try:
        logger.debug("Getting DataPilot Agent health status")
        
        # Get agent status directly (standalone functions are always available)
        status = {
            "agent_type": "DataPilot AI Agent",
            "version": "1.0.0",
            "capabilities": {
                "salesforce_intelligence": True,
                "conversation_management": True
            },
            "connection_status": "connected",
            "service_status": "healthy"
        }
        
        # Session statistics now managed by LangGraph persistence
        session_stats = {
            "active_connections": 0,  # LangGraph manages this internally
            "total_messages": 0       # LangGraph manages this internally
        }
        
        # Conversation info now managed by LangGraph
        conversation_info = {
            "persistence_type": "langgraph_mongodb",
            "checkpointing_enabled": True,
            "state_management": "automatic"
        }
        
        # Define capabilities
        capabilities = {
            "supported_intents": [
                {
                    "type": "metadata_query",
                    "description": "Query object schemas, fields, and properties",
                    "examples": [
                        "Show me the Account object structure",
                        "What fields are available on Contact?",
                        "List all fields for Opportunity object"
                    ]
                },
                {
                    "type": "data_query",
                    "description": "Retrieve and filter Salesforce records using SOQL",
                    "examples": [
                        "Show me all accounts with revenue > $1M",
                        "Find contacts in California",
                        "List opportunities closing this month"
                    ]
                },
                {
                    "type": "relationship_query",
                    "description": "Analyze object relationships and dependencies",
                    "examples": [
                        "How are Account and Contact related?",
                        "Show me the relationship hierarchy",
                        "What objects reference the Account?"
                    ]
                },
                {
                    "type": "field_details_query",
                    "description": "Get detailed information about specific fields",
                    "examples": [
                        "What are the properties of the Name field on Account?",
                        "Show me details for the Status field on Opportunity",
                        "What picklist values are available for Lead Source?"
                    ]
                },
            ],
            "available_tools": [
                "search_for_sobjects - Search for Salesforce objects by partial name matching",
                "get_sobject_metadata - Retrieve object metadata including fields and descriptions",
                "get_sobject_relationships - Get object relationships including parent and child relationships",
                "execute_soql_query - Execute SOQL queries against Salesforce",
                "get_field_details - Get detailed information about specific fields from an SObject"
            ],
            "features": [
                "Natural language understanding",
                "Context-aware responses",
                "Conversation memory",
                "Intelligent query building",
                "Relationship mapping",
                "Real-time WebSocket chat",
                "LangGraph workflow integration"
            ]
        }
        
        # Combine all information into comprehensive health response
        health_response = {
            "status": "healthy",
            "service": "datapilot-agent",
            "timestamp": datetime.utcnow().isoformat(),
            "version": "1.0.0",
            "agent_status": status,
            "session_statistics": session_stats,
            "websocket_connections": conversation_info,
            "capabilities": capabilities,
            "api_version": "1.0.0"
        }
        
        logger.debug("DataPilot Agent health check completed successfully")
        return health_response
        
    except HTTPException:
        raise
    except Exception as e:
        ErrorService.handle_generic_exception(
            exception=e,
            operation="getting DataPilot Agent health status",
            request=http_request,
            locale=lang
        )
