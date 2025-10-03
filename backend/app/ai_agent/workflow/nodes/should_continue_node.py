"""
Should Continue Node for LangGraph-style ReAct Agent.

This node determines whether to continue with tools or end the conversation.
Follows the LangGraph custom ReAct agent pattern exactly.
"""

from typing import Literal
from loguru import logger

from app.ai_agent.workflow.state import WorkflowState


def should_continue(state: WorkflowState) -> Literal["continue", "end"]:
    """
    Determine whether to continue with tools or end the conversation.
    
    This follows the LangGraph pattern exactly:
    1. Check remaining steps
    2. Get last message
    3. Check if it has tool calls
    4. Return "continue" if tool calls exist and steps remain, "end" otherwise
    
    Args:
        state: Current workflow state
        
    Returns:
        "continue" if tool calls exist and steps remain, "end" otherwise
    """
    logger.debug("Should continue check started")
    
    try:
        # Check remaining steps first
        remaining_steps = state.get("remaining_steps", 0)
        if remaining_steps <= 0:
            logger.warning("No remaining steps, ending conversation")
            return "end"
        
        # Get messages from state
        messages = state.get("messages", [])
        if not messages:
            logger.warning("No messages found, ending conversation")
            return "end"
        
        # Get last message
        last_message = messages[-1]
        
        # DEBUG: Log last message details
        if hasattr(last_message, 'type'):
            logger.debug(f"🔍 SHOULD CONTINUE: Last message type: {last_message.type}")
            if hasattr(last_message, 'content'):
                logger.debug(f"🔍 SHOULD CONTINUE: Last message content preview: {str(last_message.content)[:100]}...")
        
        # Check if last message has tool calls
        if hasattr(last_message, 'tool_calls') and last_message.tool_calls:
            logger.debug(f"Tool calls found: {[tc['name'] for tc in last_message.tool_calls]}, remaining steps: {remaining_steps}")
            return "continue"
        else:
            logger.debug("No tool calls found, ending conversation")
            return "end"
            
    except Exception as e:
        logger.error(f"Error in should continue check: {e}")
        return "end"
