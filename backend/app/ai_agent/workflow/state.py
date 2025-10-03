"""
Enhanced state management for the Salesforce AI Agent workflow.

This module defines the state structure and management utilities
for the enhanced LangGraph workflow with Salesforce intelligence.
"""

from typing import Dict, List, Any, Optional, TypedDict
from datetime import datetime
from loguru import logger
from app.core.config import settings


class WorkflowState(TypedDict, total=False):
    """Canonical workflow state container (no versioned prefixes)."""
    # root keys
    meta: "Meta"
    request: "Request"
    messages: List[Any]  # LangGraph messages
    remaining_steps: int  # LangGraph remaining steps
    conversation: "ConversationContext"  # NEW: Conversation context for context awareness
    response: "Response"  # NEW: Final response to user (includes error handling)
    client_results: List[Dict[str, Any]]  # NEW: Full tool results for client (unredacted)

class Meta(TypedDict, total=False):
    workflow_id: str
    version: str
    thread_id: Optional[str]
    started_at: Optional[str]
    current_node: Optional[str]
    status: Optional[str]
    locale: Optional[str]
    connection_uuid: Optional[str]
    confidence_threshold: Optional[float]  # Confidence threshold for object selection


class Request(TypedDict, total=False):
    user_input: str










class Response(TypedDict, total=False):
    """Final response to the user - simple and focused."""
    type: Optional[str]  # "success", "error", "clarification", "partial"
    content: Optional[str]  # The actual response text
    error: Optional[Dict[str, Any]]  # Error details for failure scenarios


class ConversationContext(TypedDict, total=False):
    """Compact conversation context for context-aware processing."""
    summary: Optional[str]  # Current conversation summary


def create_state(
    *,
    user_input: str,
    connection_uuid: Optional[str],
    conversation_uuid: Optional[str],
    locale: Optional[str] = "en",
    workflow_id: Optional[str] = None,
    version: str = "3.0.0",
    confidence_threshold: float,  # Default 70% confidence threshold
) -> WorkflowState:
    """Create a new canonical workflow state (no legacy fields)."""
    from datetime import datetime as _dt
    wid = workflow_id or f"sf_ai_agent_{_dt.now().strftime('%Y%m%d_%H%M%S')}"
    return {
        "meta": {
            "workflow_id": wid,
            "version": version,
            "thread_id": conversation_uuid,
            "started_at": _dt.utcnow().isoformat(),
            "current_node": "start",
            "status": "running",
            "locale": locale,
            "connection_uuid": connection_uuid,
            "confidence_threshold": confidence_threshold,
        },
        "request": {
            "user_input": user_input,
        },
        "messages": [],
        "remaining_steps": settings.AI_REACT_MAX_STEPS,
        "conversation": {
            "summary": None,
        },
        "response": {
            "type": None,
            "content": None,
            "error": None,
        },
    }










class StateManager:
    """
    Simple state management utilities for the Salesforce AI Agent workflow.
    
    Provides basic methods for creating and managing workflow state.
    Most state management is handled by LangGraph itself.
    """
    
    def __init__(self):
        self.workflow_version = "3.0.0"
        self.workflow_id_prefix = "sf_ai_agent"
    
    def create_initial_state(self, user_message: str, confidence_threshold: float, connection_id: Optional[str] = None, session_context: Optional[Dict[str, Any]] = None) -> WorkflowState:
        """
        Create the initial state for the workflow.
        
        Args:
            user_message: The user's input message
            confidence_threshold: Confidence threshold for object selection
            connection_id: Optional Salesforce connection identifier
            session_context: Optional session context information
        
        Returns:
            Initial WorkflowState with all required fields initialized
        """
        from datetime import datetime
        
        return create_state(
            user_input=user_message,
            connection_uuid=connection_id,
            conversation_uuid=session_context.get("conversation_uuid") if session_context else None,
            locale=session_context.get("locale", "en") if session_context else "en",
            workflow_id=f"{self.workflow_id_prefix}_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            confidence_threshold=confidence_threshold
        )


def state_to_str(state: WorkflowState) -> str:
    """
    Convert workflow state to a human-readable string representation.
    
    Args:
        state: The workflow state to convert
        
    Returns:
        Human-readable string representation of the state
    """
    if not isinstance(state, dict):
        return "Invalid state: not a dictionary"
    
    lines = []
    lines.append("=== WORKFLOW STATE ===")
    
    # Meta information
    meta = state.get("meta", {})
    lines.append(f"Workflow ID: {meta.get('workflow_id', 'N/A')}")
    lines.append(f"Version: {meta.get('version', 'N/A')}")
    lines.append(f"Current Node: {meta.get('current_node', 'N/A')}")
    lines.append(f"Status: {meta.get('status', 'N/A')}")
    lines.append(f"Started: {meta.get('started_at', 'N/A')}")
    
    # Request information
    request = state.get("request", {})
    lines.append(f"User Input: {request.get('user_input', 'N/A')}")
    
    # Meta information (moved from request)
    lines.append(f"Locale: {meta.get('locale', 'N/A')}")
    lines.append(f"Connection: {meta.get('connection_uuid', 'N/A')}")
    lines.append(f"Confidence Threshold: {meta.get('confidence_threshold', 'N/A')}")
    
    # Messages
    messages = state.get("messages", [])
    lines.append(f"Messages Count: {len(messages)}")
    if messages:
        lines.append("Recent Messages:")
        for i, msg in enumerate(messages[-3:]):  # Show last 3 messages
            role = getattr(msg, 'type', 'unknown') if hasattr(msg, 'type') else 'unknown'
            content = getattr(msg, 'content', str(msg)) if hasattr(msg, 'content') else str(msg)
            lines.append(f"  {i+1}. [{role}]: {content[:100]}{'...' if len(str(content)) > 100 else ''}")
    
    # Remaining steps
    remaining_steps = state.get("remaining_steps", 0)
    lines.append(f"Remaining Steps: {remaining_steps}")
    
    # Conversation summary
    conversation = state.get("conversation", {})
    if conversation.get("summary"):
        lines.append(f"Conversation Summary: {conversation.get('summary')}")
    
    # Response information
    response = state.get("response", {})
    if response.get("type"):
        lines.append(f"Response Type: {response.get('type')}")
        content = response.get("content")
        if content:
            lines.append(f"Response Content: {content[:200]}{'...' if len(content) > 200 else ''}")
    
    lines.append("=====================")
    return "\n".join(lines)


    def get_state_summary(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """
        Get a summary of the current workflow state.
        
        Args:
            state: Current state dictionary
        
        Returns:
            Summary dictionary with key state information
        """
        if not isinstance(state, dict):
            return {"error": "Invalid state type"}
        
        try:
            summary = {
                "workflow_id": state.get("meta", {}).get("workflow_id"),
                "current_node": state.get("meta", {}).get("current_node"),
                "response_type": state.get("response", {}).get("type"),
                "response_error": state.get("response", {}).get("error"),
                "workflow_version": state.get("meta", {}).get("version"),
                "messages_count": len(state.get("messages", [])),
                "remaining_steps": state.get("remaining_steps", 0),
                "conversation_summary": state.get("conversation", {}).get("summary")
            }
            
            return summary
            
        except Exception as e:
            logger.error(f"Error generating state summary: {e}")
            return {"error": str(e)}
    
    
