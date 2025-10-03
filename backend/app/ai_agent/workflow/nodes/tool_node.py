"""
Tool Node for LangGraph-style ReAct Agent.

This node executes tools based on tool calls from the LLM.
Follows the LangGraph custom ReAct agent pattern exactly.
"""

import json
from typing import Dict, Any, Optional
from loguru import logger
from langchain_core.messages import ToolMessage
from langchain_core.runnables import RunnableConfig

from app.ai_agent.workflow.state import WorkflowState
from app.ai_agent.workflow.tools.salesforce_tools import tools_by_name


def _redact_tool_result(tool_result: Dict[str, Any]) -> Dict[str, Any]:
    """
    Create redacted version of tool result for LLM to save tokens.
    Only redacts 'records' arrays, preserves all other data.
    
    Args:
        tool_result: Full tool result
        
    Returns:
        Redacted result with records removed and counts added
    """
    if not isinstance(tool_result, dict):
        return tool_result
    
    redacted = tool_result.copy()
    
    # Only redact 'records' arrays
    if "records" in redacted and isinstance(redacted["records"], list):
        redacted["records_count"] = len(redacted["records"])
        del redacted["records"]
    
    # Add redaction note
    redacted["_llm_redaction"] = "Records removed for token optimization. Full data available in client_results."
    
    return redacted


def tool_node(state: WorkflowState, config: Optional[RunnableConfig] = None) -> Dict[str, Any]:
    """
    Execute tools based on tool calls from the LLM.
    
    This follows the LangGraph reference pattern exactly:
    1. Get tool calls from last AI message
    2. Execute each tool call using tool.invoke()
    3. Return tool messages
    
    Args:
        state: Current workflow state
        
    Returns:
        Dict with messages list containing tool responses
    """
    
    # Get connection UUID from state
    connection_uuid = state.get("meta", {}).get("connection_uuid")
    if not connection_uuid:
        logger.error("No connection_uuid found in state")
        return {"messages": []}
    
    # Get messages from state
    messages = state.get("messages", [])
    if not messages:
        logger.error("No messages found in state")
        return {"messages": []}
    
    last_message = messages[-1]
    
    if not hasattr(last_message, 'tool_calls') or not last_message.tool_calls:
        logger.error("Last message has no tool calls")
        return {"messages": []}
    
    
    outputs = []
    client_results = []
    
    for tool_call in last_message.tool_calls:
        # Add connection_uuid to tool args (required for Salesforce tools)
        tool_args = tool_call["args"].copy()
        tool_args["connection_uuid"] = connection_uuid
        
        # Execute tool using invoke() with config for Langfuse tracing
        if config:
            tool_result = tools_by_name[tool_call["name"]].invoke(tool_args, config)
        else:
            tool_result = tools_by_name[tool_call["name"]].invoke(tool_args)
        
        # Store full result for client
        client_results.append({
            "name": tool_call["name"],
            "tool_call_id": tool_call["id"],
            "result": tool_result
        })
        
        # Create redacted version for LLM
        llm_result = _redact_tool_result(tool_result)
        
        outputs.append(
            ToolMessage(
                content=json.dumps(llm_result),
                name=tool_call["name"],
                tool_call_id=tool_call["id"],
            )
        )
    
    return {
        "messages": messages + outputs,
        "client_results": client_results
    }
