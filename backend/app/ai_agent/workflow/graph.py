"""
LangGraph Custom ReAct Agent for Salesforce AI.

This module implements a simple ReAct agent following the LangGraph pattern exactly:
1. Agent (call_model) → Tools → Agent (call_model) → ... → End
2. Simple message-based state
3. Built-in tool calling and routing
"""

from functools import lru_cache
from typing import Dict, Any, Optional
from loguru import logger
from langgraph.graph import StateGraph, START, END  # pyright: ignore[reportMissingImports]

from app.ai_agent.workflow.state import WorkflowState
from app.ai_agent.workflow.nodes.call_model_node import call_model_node
from app.ai_agent.workflow.nodes.tool_node import tool_node
from app.ai_agent.workflow.nodes.should_continue_node import should_continue
from app.ai_agent.workflow.nodes.summary_node import summary_node
from app.core.config import settings
from fastapi import Request
from langgraph.graph.state import CompiledStateGraph  # pyright: ignore[reportMissingImports]

# Global checkpointer - will be set by the lifespan context manager
_global_checkpointer = None

def set_checkpointer(checkpointer):
    """Set the global checkpointer from the lifespan context manager"""
    global _global_checkpointer
    _global_checkpointer = checkpointer
    logger.debug(f"Global checkpointer set: {checkpointer}")


@lru_cache(maxsize=1)
def get_graph() -> CompiledStateGraph:
    """
    Build the LangGraph Custom ReAct Agent for Salesforce AI.
    
    This follows the LangGraph custom ReAct agent pattern exactly:
    1. Agent (call_model) → Tools → Agent (call_model) → ... → End
    2. Simple message-based state with messages and remaining_steps
    3. Built-in tool calling and routing
    
    Returns:
        CompiledStateGraph: The compiled ReAct agent graph
    """
    logger.debug("Building LangGraph Custom ReAct Agent for Salesforce AI")
    
    # Get the checkpointer from global variable
    global _global_checkpointer
    checkpointer = _global_checkpointer
    logger.debug(f"Global checkpointer: {checkpointer}")
    if checkpointer is None:
        # hard fail with a clear message
        logger.error("No checkpointer found in global variable")
        raise RuntimeError(
            "Checkpointer not configured. "
            "Make sure the lifespan context manager is properly set up."
        )
    logger.debug(f"Checkpointer acquired from global: {checkpointer}")

    # Create the state graph
    graph_builder = StateGraph(WorkflowState)
    
    # Add nodes - ReAct loop + summary
    graph_builder.add_node("agent", call_model_node)
    graph_builder.add_node("tools", tool_node)
    graph_builder.add_node("summary", summary_node)
    
    # Set the starting point
    graph_builder.add_edge(START, "agent")
    
    # Agent → Tools or Summary (based on tool calls)
    graph_builder.add_conditional_edges(
        "agent",
        should_continue,
        {
            "continue": "tools",  # Has tool calls, go to tools
            "end": "summary"     # No tool calls, go to summary
        }
    )
    
    # Tools → Agent (always continue the loop)
    graph_builder.add_edge("tools", "agent")
    
    # Summary → End (after creating summary)
    graph_builder.add_edge("summary", END)
    
    logger.debug("LangGraph Custom ReAct Agent with summary node created successfully")
    return graph_builder.compile(checkpointer=checkpointer)