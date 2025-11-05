"""
ASYNC Tool Node for LangGraph-style ReAct Agent.

This node executes tools based on tool calls from the LLM.
Follows the LangGraph custom ReAct agent pattern exactly.

OPTIMIZATIONS:
- Async/await for non-blocking execution
- Parallel tool execution when multiple independent tools are called
- Better performance and scalability
"""

import json
import asyncio
from typing import Dict, Any, Optional, List
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


async def _execute_single_tool(
    tool_call: Dict[str, Any],
    connection_uuid: str,
    config: Optional[RunnableConfig] = None
) -> tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Execute a single tool call asynchronously.

    Args:
        tool_call: Tool call dict with name, id, and args
        connection_uuid: Salesforce connection UUID
        config: Optional runnable config for tracing

    Returns:
        Tuple of (client_result, tool_message_content)
    """
    tool_name = tool_call["name"]
    tool_call_id = tool_call["id"]

    # Add connection_uuid to tool args (required for Salesforce tools)
    tool_args = tool_call["args"].copy()
    tool_args["connection_uuid"] = connection_uuid

    # Execute tool using ainvoke() with config for Langfuse tracing
    logger.debug(f"Executing tool: {tool_name}")
    if config:
        tool_result = await tools_by_name[tool_name].ainvoke(tool_args, config)
    else:
        tool_result = await tools_by_name[tool_name].ainvoke(tool_args)

    # Store full result for client
    client_result = {
        "name": tool_name,
        "tool_call_id": tool_call_id,
        "result": tool_result
    }

    # Create redacted version for LLM
    llm_result = _redact_tool_result(tool_result)

    return client_result, llm_result


async def tool_node(state: WorkflowState, config: Optional[RunnableConfig] = None) -> Dict[str, Any]:
    """
    Execute tools based on tool calls from the LLM (ASYNC with parallel execution).

    This follows the LangGraph reference pattern exactly:
    1. Get tool calls from last AI message
    2. Execute each tool call using tool.ainvoke() (parallel if multiple)
    3. Return tool messages

    OPTIMIZATION: Multiple independent tools are executed in parallel using asyncio.gather()

    Args:
        state: Current workflow state
        config: Optional runnable config

    Returns:
        Dict with messages list containing tool responses
    """
    logger.debug("Tool node started (async)")

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

    tool_calls = last_message.tool_calls
    logger.debug(f"Executing {len(tool_calls)} tool call(s)")

    # OPTIMIZATION: Execute multiple tools in parallel
    if len(tool_calls) > 1:
        logger.debug(f"Executing {len(tool_calls)} tools in parallel")
        # Execute all tools concurrently
        results = await asyncio.gather(*[
            _execute_single_tool(tool_call, connection_uuid, config)
            for tool_call in tool_calls
        ])
    else:
        # Single tool call
        results = [await _execute_single_tool(tool_calls[0], connection_uuid, config)]

    # Process results
    client_results = []
    outputs = []

    for (client_result, llm_result), tool_call in zip(results, tool_calls):
        client_results.append(client_result)

        outputs.append(
            ToolMessage(
                content=json.dumps(llm_result),
                name=tool_call["name"],
                tool_call_id=tool_call["id"],
            )
        )

    logger.debug(f"Tool execution completed: {len(outputs)} result(s)")

    return {
        "messages": messages + outputs,
        "client_results": client_results
    }
