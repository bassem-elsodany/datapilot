"""
DataPilot Backend - AI Agent Workflow Engine

This module implements the core AI agent workflow for DataPilot, providing intelligent
Salesforce data analysis through advanced LangGraph orchestration, natural language
processing, and real-time conversation management.

The AI agent provides:
- Natural language to SOQL query conversion
- Intelligent data analysis and insights
- Real-time streaming responses
- Conversation context management
- Business intelligence and recommendations
- Secure query validation and execution
- Multi-step workflow orchestration

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

Security & Validation:
- Input sanitization and validation
- SQL injection prevention
- Data privacy and compliance
- Access control and permissions
- Audit trail and logging
- Secure error handling

Workflow Orchestration:
- Multi-step workflow execution
- Conditional logic and branching
- Parallel task execution
- Error recovery and retry logic
- State management and persistence
- Workflow optimization

Integration Points:
- Salesforce API integration
- MongoDB conversation storage
- WebSocket real-time communication
- Frontend user interface
- Logging and monitoring systems
- Error handling and reporting

Performance Features:
- Asynchronous processing
- Connection pooling and reuse
- Caching and optimization
- Memory management
- Scalability and load balancing
- Performance monitoring

Author: Bassem Elsodany
GitHub: https://github.com/bassem-elsodany
LinkedIn: https://www.linkedin.com/in/bassem-elsodany/
Version: 1.0.0
License: MIT License
"""

import asyncio
import json
import uuid
from typing import Dict, List, Any, Optional, AsyncGenerator, Literal, Tuple
from datetime import datetime

from langgraph.graph.state import CompiledStateGraph  # pyright: ignore[reportMissingImports]
from loguru import logger

from app.ai_agent.workflow.state import WorkflowState
from app.core.config import settings
from app.utils import (
    fix_truncated_json, 
    extract_json_block, 
    validate_structured_payload,
    extract_tool_info,
    generate_tool_thought,
    parse_structured_response,
    is_tool_result
)


# Utility functions moved to app.utils


# Import StructuredAIResponse from schemas
from app.ai_agent.workflow.schemas import StructuredAIResponse


async def get_response(
    graph: CompiledStateGraph,
    user_message: str,
    connection_uuid: str,
    session_context: Optional[Dict[str, Any]] = None,
    conversation_uuid: Optional[str] = None,
    new_thread: bool = False,
) -> tuple[str, WorkflowState]:
    """Run a query through the DataPilot workflow graph.

    Args:
        agent: LangGraph agent
        user_message: Natural language request (e.g., "Show me all accounts created this month")
        connection_uuid: Optional Salesforce connection identifier
        session_context: Optional session context for personalized responses
        conversation_uuid: Optional conversation UUID for context retrieval and workflow state
        new_thread: Whether to create a new conversation (ignores existing conversation_uuid)
    Returns:
        tuple[str, WorkflowState]: A tuple containing:
            - The response text from the workflow.
            - The final state after running the workflow.

    Raises:
        RuntimeError: If there's an error running the DataPilot workflow.
    """

    from langfuse.langchain import CallbackHandler

    logger.debug(f"Getting response with graph: {graph} and user message: {user_message} and connection UUID: {connection_uuid} and session context: {session_context} and conversation UUID: {conversation_uuid} and new thread: {new_thread}")
    # Use conversation_uuid as the single tracking identifier
    local_conversation_uuid = conversation_uuid
    if not local_conversation_uuid or new_thread:
        local_conversation_uuid = f"conv_{uuid.uuid4()}"
    
    thread_id = local_conversation_uuid  # Use conversation_uuid as thread_id for LangGraph
    
    # Add Langfuse tracing if enabled
    if settings.LANGFUSE_ENABLE_TRACING:
        try:
            import os
            
            # Set environment variables for Langfuse (required for CallbackHandler)
            os.environ["LANGFUSE_SECRET_KEY"] = settings.LANGFUSE_SECRET_API_KEY
            os.environ["LANGFUSE_PUBLIC_KEY"] = settings.LANGFUSE_PUBLIC_API_KEY
            
            if settings.LLM_PROVIDER.lower() == "openai":
                os.environ["OPENAI_API_KEY"] = settings.LLM_API_KEY
            elif settings.LLM_PROVIDER.lower() == "groq":
                os.environ["GROQ_API_KEY"] = settings.LLM_API_KEY
            elif settings.LLM_PROVIDER.lower() == "ollama":
                os.environ["OLLAMA_API_KEY"] = settings.LLM_API_KEY
            else:
                raise ValueError(f"Unsupported LLM provider: {settings.LLM_PROVIDER}")
            os.environ["LANGFUSE_HOST"] = settings.LANGFUSE_SERVER_URL
            
            # Initialize the Langfuse handler (reads from environment variables)
            langfuse_handler = CallbackHandler()

            config = {
                "configurable": {"thread_id": thread_id},
                "callbacks": [langfuse_handler],
                "metadata": {
                    "langfuse_session_id": thread_id
                }
            }  # type: ignore
            logger.debug("Langfuse tracing enabled with proper configuration")
        except Exception as e:
            logger.error(f"Failed to enable Langfuse tracing: {e}")
            
    else:
        config = {
            "configurable": {"thread_id": thread_id}
        }  # type: ignore
    
    # Let LangGraph load existing state first, then only update what we need
    from app.ai_agent.workflow.state import create_state
    confidence_threshold = settings.AI_REACT_HIGH_CONFIDENCE_THRESHOLD
    
    # DEBUG: Check if there's existing state loaded by LangGraph
    try:
        # Try to get existing state from the checkpointer
        existing_state = await graph.aget_state(config)
        if existing_state and existing_state.values:
            logger.debug(f"Found existing state from checkpointer: {list(existing_state.values.keys())}")
            # Use existing state but reset messages for new conversation turn
            initial_state = dict(existing_state.values)
            initial_state.update({
                "request": {
                    "user_input": user_message
                },
                "messages": [],  # Reset messages for new turn - history comes from summary
                "client_results": [],  # Reset client results for new turn
                "remaining_steps": settings.AI_REACT_MAX_STEPS  # Reset steps for new request
            })
            # Historical context comes from conversation.summary, not messages array
            logger.debug(" Updated existing state with new user input and reset remaining steps")
        else:
            logger.debug("No existing state found - this is a new conversation")
            # Create fresh state for new conversation
            initial_state = create_state(
                user_input=user_message,
                connection_uuid=connection_uuid,
                conversation_uuid=local_conversation_uuid,
                locale="en",
                confidence_threshold=confidence_threshold
            )
    except Exception as e:
        logger.debug(f" Could not check existing state: {e}")
        # Fallback to creating fresh state
        initial_state = create_state(
            user_input=user_message,
            connection_uuid=connection_uuid,
            conversation_uuid=local_conversation_uuid,
            locale="en",
            confidence_threshold=confidence_threshold
        )
    
    # Execute workflow
    logger.debug(f"Starting workflow execution...")
    
    output_state = await graph.ainvoke(
        input=WorkflowState(**initial_state),
        config=config,  # type: ignore
    )
    logger.debug(f"Workflow execution completed. Output state keys: {list(output_state.keys())}")
    
    # DEBUG: Check final state for conversation summary
    if 'conversation' in output_state:
        final_summary = output_state.get('conversation', {}).get('summary', '')
        logger.debug(f" Final conversation summary: {final_summary[:200]}...")
    else:
        logger.debug("No conversation in final state")
    
    # Extract final response from the last AI message in messages
    messages = output_state.get("messages", [])
    logger.debug(f"Processing {len(messages)} messages from workflow output")
    response_text = "No response generated"
    structured_response: Optional[Dict[str, Any]] = None
    
    # Find the last AI message (final response)
    for message in reversed(messages):
        if hasattr(message, 'type') and message.type == 'ai' and hasattr(message, 'content') and message.content:
            response_text = message.content
            break
    
    # Try to parse structured JSON from the response_text
    try:
        candidate = extract_json_block(response_text)
        if candidate:
            logger.debug(f"Found JSON candidate: {candidate[:200]}...")
            logger.debug(f"Full JSON candidate length: {len(candidate)} characters")
            logger.debug(f"Full JSON candidate: {candidate}")
            
            # Try to parse the JSON
            try:
                parsed = json.loads(candidate)
                logger.debug(f"Parsed JSON successfully: {parsed.get('response_type', 'unknown')}")
            except json.JSONDecodeError as json_err:
                logger.warning(f"JSON parsing failed, attempting to fix truncated JSON: {json_err}")
                
                # Attempt to fix truncated JSON
                fixed_candidate = fix_truncated_json(candidate)
                if fixed_candidate:
                    try:
                        parsed = json.loads(fixed_candidate)
                        logger.debug(f"Successfully fixed and parsed truncated JSON: {parsed.get('response_type', 'unknown')}")
                    except json.JSONDecodeError as fix_err:
                        logger.error(f"Could not fix truncated JSON: {fix_err}")
                        logger.debug(f"Full response text that failed to parse: {response_text}")
                        parsed = None
                else:
                    logger.error(f"Could not fix truncated JSON")
                    logger.debug(f"Full response text that failed to parse: {response_text}")
                    parsed = None
            
            if parsed and validate_structured_payload(parsed):
                # Validate with Pydantic for stricter typing
                try:
                    validated = StructuredAIResponse.model_validate(parsed)  # type: ignore[attr-defined]
                    structured_response = validated.model_dump()  # type: ignore[attr-defined]
                    logger.debug(f"Structured response validated and stored: {structured_response.get('response_type', 'unknown')}")
                except Exception as pydantic_err:
                    # Log the actual Pydantic validation error
                    logger.error(f"Pydantic validation failed: {pydantic_err}")
                    logger.error(f"Parsed data that failed validation: {parsed}")
                    # If Pydantic isn't available at runtime, fall back to parsed dict
                    structured_response = parsed
                    logger.debug(f"Structured response stored (Pydantic fallback): {structured_response.get('response_type', 'unknown') if structured_response else 'unknown'}")
            else:
                logger.warning("Structured JSON failed validation; keeping text response")
        else:
            logger.debug("No JSON candidate found in response text")
            logger.debug(f"Full response text: {response_text}")
    except Exception as parse_err:
        logger.warning(f"Failed to parse structured JSON from LLM output: {parse_err}")
        logger.debug(f"Full response text that failed to parse: {response_text}")

    # Update the response field in the state
    output_state["response"] = {
        "type": "success",
        "content": response_text,
        "error": None
    }

    # Attach structured response if available
    if structured_response is not None:
        # Map client_results (full data) back to structured response for UI
        if "client_results" in output_state and structured_response.get("response_type") == "data_query":
            # Get the latest tool result (should be execute_soql_query)
            if output_state["client_results"]:
                latest_result = output_state["client_results"][-1].get("result", {})
                if "records" in latest_result:
                    # Replace records_count with actual records in data_summary
                    if "data_summary" in structured_response:
                        structured_response["data_summary"]["records"] = latest_result["records"]
                        # Remove records_count since we now have actual records
                        if "records_count" in structured_response["data_summary"]:
                            del structured_response["data_summary"]["records_count"]
        
        output_state["structured_response"] = structured_response
    
    return response_text, WorkflowState(**output_state)


async def get_streaming_response(
    graph: CompiledStateGraph,
    user_message: str,
    connection_uuid: str,
    session_context: Optional[Dict[str, Any]] = None,
    conversation_uuid: Optional[str] = None,
    stream_mode: str = "messages",
    new_thread: bool = False,

) -> AsyncGenerator[Dict[str, Any], None]:
    """Run a query through the DataPilot workflow graph with streaming.
        
        Args:
            agent: LangGraph agent
            user_message: Natural language request (e.g., "Show me all accounts created this month")
            connection_uuid: Optional Salesforce connection identifier
            session_context: Optional session context for personalized responses
            conversation_uuid: Optional conversation UUID for context retrieval and workflow state
            stream_mode: Streaming mode - "messages", "values", "updates", or "debug"
            new_thread: Whether to create a new conversation (ignores existing conversation_uuid)
        
        Yields:
            Streaming updates as dictionaries containing:
            - type: str - Type of update ("message", "state", "metadata", "error")
            - content: str - The actual content being streamed
            - node: str - Current workflow node
            - timestamp: str - ISO timestamp
            - metadata: dict - Additional metadata for the update
        
    Raises:
        RuntimeError: If there's an error running the DataPilot workflow.
    """
    from langfuse.langchain import CallbackHandler

    # Use conversation_uuid as the single tracking identifier
    local_conversation_uuid = conversation_uuid
    if not local_conversation_uuid or new_thread:
        local_conversation_uuid = f"conv_{uuid.uuid4()}"
    
    thread_id = local_conversation_uuid  # Use conversation_uuid as thread_id for LangGraph
    
    # Add Langfuse tracing if enabled
    langfuse_handler = None
    if settings.LANGFUSE_ENABLE_TRACING:
        try:
            import os
            
            # Set environment variables for Langfuse (required for CallbackHandler)
            os.environ["LANGFUSE_SECRET_KEY"] = settings.LANGFUSE_SECRET_API_KEY
            os.environ["LANGFUSE_PUBLIC_KEY"] = settings.LANGFUSE_PUBLIC_API_KEY
            
            if settings.LLM_PROVIDER.lower() == "openai":
                os.environ["OPENAI_API_KEY"] = settings.LLM_API_KEY
            elif settings.LLM_PROVIDER.lower() == "groq":
                os.environ["GROQ_API_KEY"] = settings.LLM_API_KEY
            elif settings.LLM_PROVIDER.lower() == "ollama":
                os.environ["OLLAMA_API_KEY"] = settings.LLM_API_KEY
            else:
                raise ValueError(f"Unsupported LLM provider: {settings.LLM_PROVIDER}")
            os.environ["LANGFUSE_HOST"] = settings.LANGFUSE_SERVER_URL
            
            # Initialize the Langfuse handler (reads from environment variables)
            langfuse_handler = CallbackHandler()
            config = {
                "configurable": {"thread_id": thread_id},
                "callbacks": [langfuse_handler],
                "metadata": {
                    "langfuse_session_id": thread_id
                }
            }  # type: ignore
            logger.debug("Langfuse tracing enabled with proper configuration")
        except Exception as e:
            logger.error(f"Failed to enable Langfuse tracing: {e}")
    else:
        config = {
            "configurable": {"thread_id": thread_id}
        }  # type: ignore
    
    
    # Let LangGraph load existing state first, then only update what we need
    from app.ai_agent.workflow.state import create_state
    confidence_threshold = settings.AI_REACT_HIGH_CONFIDENCE_THRESHOLD
    
    # DEBUG: Check if there's existing state loaded by LangGraph
    try:
        # Try to get existing state from the checkpointer
        existing_state = await graph.aget_state(config)
        if existing_state and existing_state.values:
            logger.debug(f" Found existing state from checkpointer: {list(existing_state.values.keys())}")
            
            existing_summary = existing_state.values.get('conversation', {}).get('summary', '')
            logger.debug(f" Existing conversation summary: {str(existing_summary)[:10000]}...")    
            # Use existing state but reset messages for new conversation turn
            initial_state = dict(existing_state.values)
            initial_state.update({
                "request": {
                    "user_input": user_message
                },
                "messages": [],  # Reset messages for new turn - history comes from summary
                "client_results": [],  # Reset client results for new turn
                "remaining_steps": settings.AI_REACT_MAX_STEPS  # Reset steps for new request
            })
            # Historical context comes from conversation.summary, not messages array
            logger.debug(" Updated existing state with new user input and reset remaining steps")
        else:
            logger.debug(" No existing state found - this is a new conversation")
            # Create fresh state for new conversation
            initial_state = create_state(
                user_input=user_message,
                connection_uuid=connection_uuid,
                conversation_uuid=local_conversation_uuid,
                locale="en",
                confidence_threshold=confidence_threshold
            )
    except Exception as e:
        logger.debug(f" Could not check existing state: {e}")
        # Fallback to creating fresh state
        initial_state = create_state(
            user_input=user_message,
            connection_uuid=connection_uuid,
            conversation_uuid=local_conversation_uuid,
            locale="en",
            confidence_threshold=confidence_threshold
        )
    
    # Stream the workflow execution with timeout
    try:
        # Create the async iterator
        stream_iterator = graph.astream(
            input=WorkflowState(**initial_state),
            config=config,  # type: ignore
            stream_mode=["values"],  # Use values for processing
        )
        
        # Stream processing with clean logic
        start_time = asyncio.get_event_loop().time()
        processed_tool_calls = set()
        
        chunk_count = 0
        summary_started = False
        async for stream_mode, chunk in stream_iterator:
            chunk_count += 1
            
            # Check timeout
            if asyncio.get_event_loop().time() - start_time > settings.TASK_TIMEOUT_SECONDS:
                logger.warning(f"Streaming timeout after {settings.TASK_TIMEOUT_SECONDS} seconds")
                break
            
            try:
                # Only process "values" mode with messages
                if stream_mode == "values" and isinstance(chunk, dict) and 'messages' in chunk:
                    for message in chunk['messages']:
                        if not hasattr(message, '__class__') or 'AI' not in message.__class__.__name__:
                            continue
                        
                        # 1. Process tool calls for "AI Thinking" messages
                        tool_calls = getattr(message, 'tool_calls', None) or message.additional_kwargs.get('tool_calls', []) if hasattr(message, 'additional_kwargs') else []
                        logger.debug(f"Processing AI message with {len(tool_calls)} tool calls")
                        
                        for tool_call in tool_calls:
                            tool_call_id = tool_call.get('id', f"{tool_call.get('name', 'unknown')}_{hash(str(tool_call))}")
                            
                            if tool_call_id in processed_tool_calls:
                                continue
                            
                            processed_tool_calls.add(tool_call_id)
                            
                            # Extract tool info
                            tool_name, tool_args = extract_tool_info(tool_call)
                            thought = generate_tool_thought(tool_name, tool_args)
                            
                            # Yield tool decision
                            yield {
                                "type": "stream_update",
                                "content": {
                                    "thought": thought,
                                    "response_type": "thinking",
                                    "confidence": 0.9,
                                    "confidence_label": "high",
                                    "intent_understood": f"Calling {tool_name} tool",
                                    "actions_taken": [f"Calling {tool_name}"],
                                    "data_summary": {},
                                    "suggestions": [],
                                    "metadata": {
                                        "tool_name": tool_name,
                                        "tool_args": tool_args
                                    }
                                },
                                "node": "tool_decision",
                                "timestamp": datetime.now().isoformat(),
                                "metadata": {
                                    "update_type": "tool_decision",
                                    "thread_id": thread_id
                                }
                            }
                        
                        # 2. Process AI message content
                        content = getattr(message, 'content', '')
                        if not content or not content.strip():
                            continue
                        
                        # Try to parse as structured response
                        structured_response = parse_structured_response(content)
                        if structured_response:
                            # Map client_results (full data) back to structured response for UI
                            if "client_results" in chunk and structured_response.get("response_type") == "data_query":
                                if chunk["client_results"]:
                                    latest_result = chunk["client_results"][-1].get("result", {})
                                    if "records" in latest_result:
                                        # Replace records_count with actual records in data_summary
                                        if "data_summary" in structured_response:
                                            structured_response["data_summary"]["records"] = latest_result["records"]
                                            # Remove records_count since we now have actual records
                                            if "records_count" in structured_response["data_summary"]:
                                                del structured_response["data_summary"]["records_count"]
                            
                            yield {
                                "type": "stream_update",
                                "content": structured_response,
                                "node": "llm_structured_response",
                                "timestamp": datetime.now().isoformat(),
                                "metadata": {
                                    "update_type": "structured_response",
                                    "thread_id": thread_id
                                }
                            }
                        else:
                            # Filter out tool results (JSON without response_type)
                            if not is_tool_result(content):
                                yield {
                                    "type": "stream_update",
                                    "content": content,
                                    "node": "llm_text",
                                    "timestamp": datetime.now().isoformat(),
                                    "metadata": {
                                        "thread_id": thread_id
                                    }
                                }
                else:
                    # Default: stream any content
                    yield {
                        "type": "content",
                        "content": str(chunk),
                        "node": "workflow_step",
                        "timestamp": datetime.now().isoformat(),
                        "metadata": {
                            "chunk_type": type(chunk).__name__,
                            "thread_id": thread_id
                        }
                    }
            except Exception as e:
                logger.warning(f"Error processing stream chunk: {e}")
                yield {
                    "type": "error",
                    "content": f"Stream processing error: {str(e)}",
                    "node": "stream_processing",
                    "timestamp": datetime.now().isoformat(),
                    "metadata": {"error": str(e), "thread_id": thread_id}
                }
        
        # Send completion message
        completion_reason = "summary node detected" if summary_started else "normal completion"
        yield {
            "type": "stream_complete",
            "content": f"Streaming completed successfully ({completion_reason}, processed {chunk_count} chunks)",
            "node": "completion",
            "timestamp": datetime.now().isoformat(),
            "metadata": {
                "thread_id": thread_id,
                "conversation_uuid": local_conversation_uuid,
                "chunks_processed": chunk_count,
                "summary_started": summary_started
            }
        }
        
    except asyncio.TimeoutError:
        logger.error(f"Streaming operation timed out after {settings.TASK_TIMEOUT_SECONDS} seconds")
        yield {
            "type": "error",
            "content": f"Operation timed out after {settings.TASK_TIMEOUT_SECONDS} seconds",
            "node": "timeout",
            "timestamp": datetime.now().isoformat(),
            "metadata": {"timeout": True}
        }
            
    except Exception as e:
        # Check for specific API key errors and yield error messages instead of raising
        error_message = str(e)
        if "invalid_api_key" in error_message or "Incorrect API key provided" in error_message:
            yield {
                "type": "error_message",
                "content": "**AI Configuration Error**\n\nYour LLM API key is invalid or not configured properly.\n\n**To fix this:**\n1. Check your `LLM_PROVIDER` setting (openai, groq, ollama)\n2. Get a valid API key from your LLM provider\n3. Update the `LLM_API_KEY` in your environment configuration\n4. Restart the application\n\n**Note:** AI features are optional. You can still use Schema Explorer, Query Editor, and Saved Queries without AI.",
                "node": "error",
                "timestamp": datetime.now().isoformat(),
                "metadata": {"error_type": "api_key_error"}
            }
        elif "rate_limit" in error_message.lower():
            yield {
                "type": "error_message",
                "content": "**Rate Limit Exceeded**\n\nYou've exceeded your LLM provider's rate limit. Please wait a moment and try again.",
                "node": "error",
                "timestamp": datetime.now().isoformat(),
                "metadata": {"error_type": "rate_limit"}
            }
        elif "insufficient_quota" in error_message.lower():
            yield {
                "type": "error_message",
                "content": "**Insufficient Quota**\n\nYour LLM provider account has insufficient credits. Please add credits to your account and try again.",
                "node": "error",
                "timestamp": datetime.now().isoformat(),
                "metadata": {"error_type": "quota_error"}
            }
        else:
            yield {
                "type": "error_message",
                "content": f"**Error occurred:** {str(e)}",
                "node": "error",
                "timestamp": datetime.now().isoformat(),
                "metadata": {"error_type": "generic"}
            }
