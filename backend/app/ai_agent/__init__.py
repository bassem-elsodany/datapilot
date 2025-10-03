"""
Enhanced Salesforce AI Agent Package.

This package provides the main Salesforce AI Agent with enhanced LangGraph workflow capabilities,
including Salesforce-specific intelligence, SOQL optimization, and business intelligence analysis.
"""

from app.ai_agent.datapilot_workflow import get_response, get_streaming_response
from app.ai_agent.workflow.graph import get_graph
from app.ai_agent.workflow import StateManager
# Node imports removed - not needed in package __init__

__all__ = [
    "get_response",
    "get_streaming_response", 
    "get_graph",
    "StateManager"
]
