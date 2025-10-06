"""
Call Model Node for LangGraph-style ReAct Agent.

This node calls the LLM with the current messages and returns the AI response.
Follows the LangGraph custom ReAct agent pattern exactly.
"""

import json
from typing import Dict, Any
from loguru import logger
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from langchain_core.runnables import RunnableConfig

from app.ai_agent.workflow.state import WorkflowState
from app.core.config import settings

# Import tools and chat model at module level for better performance
from app.ai_agent.workflow.tools.salesforce_tools import tools
from app.core.config import get_chat_model




def call_model_node(state: WorkflowState, config: RunnableConfig) -> Dict[str, Any]:
    """
    Call the LLM with current messages and return AI response.
    
    This follows the LangGraph pattern exactly:
    1. Check remaining steps
    2. Get system prompt
    3. Combine with current messages
    4. Call LLM
    5. Return AI message and decrement remaining steps
    
    Args:
        state: Current workflow state
        config: Runnable configuration
        
    Returns:
        Dict with messages list containing the AI response and updated remaining_steps
    """
    logger.debug("Call model node started")
    
    try:
        # Check remaining steps
        remaining_steps = state.get("remaining_steps", 0)
        if remaining_steps <= 0:
            logger.warning("No remaining steps, ending conversation")
            return {
                "messages": [AIMessage(content="I've reached the maximum number of steps. Please try a simpler query.")],
                "remaining_steps": 0
            }
        
        # Get user input from state (only on first call)
        user_input = state.get("request", {}).get("user_input", "")
        existing_messages = state.get("messages", [])
        
        # Get conversation summary for context-aware responses
        conversation_summary = state.get("conversation", {}).get("summary", "")
        
        # Always ensure system prompt and user input are present
        from app.ai_agent.workflow.prompts import AgentPrompts
        confidence_threshold = state.get("meta", {}).get("confidence_threshold", settings.AI_REACT_HIGH_CONFIDENCE_THRESHOLD)
        connection_uuid = state.get("meta", {}).get("connection_uuid") or ""
        
        # Get pagination limits from configuration
        sobject_limit = settings.METADATA_MAX_OBJECTS  # Default SObject search limit
        field_limit = settings.METADATA_MAX_FIELDS_PER_OBJECT    # Default field pagination limit
        query_limit = settings.QUERY_MAX_ROWS   # Default SOQL query limit
        
        system_prompt = SystemMessage(content=AgentPrompts.get_system_prompt(
            confidence_threshold or settings.AI_REACT_HIGH_CONFIDENCE_THRESHOLD, connection_uuid, sobject_limit, field_limit, query_limit, conversation_summary or ""
        ))
        human_message = HumanMessage(content=user_input)
        
        # CLEAN APPROACH: System + User + Current Execution Messages Only
        # Start with system prompt and current user message
        messages = [system_prompt, human_message]
        
        # Add any messages from the current ReAct execution (not old conversations)
        if existing_messages:
            # Only include AI and tool messages from current execution
            for msg in existing_messages:
                if hasattr(msg, 'type') and msg.type in ['ai', 'tool']:
                    # Skip tool definition messages
                    if hasattr(msg, 'content') and isinstance(msg.content, dict):
                        if msg.content.get('type') == 'function':
                            continue
                    messages.append(msg)
        
        
        # Get LLM model (imported at module level)
        chat_model = get_chat_model()
        
        # Bind tools to model (tools imported at module level)
        model_with_tools = chat_model.bind_tools(tools)
        
        # Call LLM
        response = model_with_tools.invoke(messages, config)
        
        # Return AI message and decrement remaining steps
        # Replace messages list to avoid malformed sequences
        return {
            "messages": messages + [response],
            "remaining_steps": remaining_steps - 1
        }
        
    except Exception as e:
        logger.error(f"Error in call model node: {e}")
        
        # Check for specific API key errors and re-raise them so they get caught by the streaming function
        error_message = str(e)
        if "invalid_api_key" in error_message or "Incorrect API key provided" in error_message:
            raise RuntimeError("AI Configuration Error: Your LLM API key is invalid or not configured properly. Check your LLM_PROVIDER setting and LLM_API_KEY configuration.") from e
        elif "rate_limit" in error_message.lower():
            raise RuntimeError("Rate Limit Exceeded: You've exceeded your LLM provider's rate limit. Please wait a moment and try again.") from e
        elif "insufficient_quota" in error_message.lower():
            raise RuntimeError("Insufficient Quota: Your LLM provider account has insufficient credits. Please add credits to your account and try again.") from e
        else:
            raise RuntimeError(f"Error occurred: {str(e)}") from e
