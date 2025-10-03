"""
Schema for structured AI responses.
"""

from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field


class StructuredAIResponse(BaseModel):
    """Minimal, flexible schema for structured AI responses.

    Keeps data_summary open (dict) to avoid over-constraining while still
    guaranteeing core fields and types for the UI.
    """
    response_type: Literal[
        'metadata_query',
        'data_query',
        'clarification_needed',
        'relationship_query',
        'field_details_query',
    ]
    confidence: Optional[float] = Field(default=None)
    confidence_label: Optional[Literal['high', 'medium', 'low', 'unknown']] = Field(default=None)
    intent_understood: Optional[str] = Field(default=None)
    actions_taken: List[str] = Field(default_factory=list)
    data_summary: Optional[Dict[str, Any]] = Field(default=None)
    suggestions: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    
    # Optional fields for clarification_needed responses (from prompt contract)
    candidate_objects: Optional[List[Dict[str, Any]]] = Field(default=None)
    multi_select_allowed: Optional[bool] = Field(default=None)
    instruction: Optional[str] = Field(default=None)
    clarification: Optional[Dict[str, Any]] = Field(default=None)
