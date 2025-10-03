"""
Schema for structured conversation summary.
"""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class ObjectResolution(BaseModel):
    """Object resolution information."""
    api_names: List[str] = Field(default_factory=list)
    label_mappings: Dict[str, str] = Field(default_factory=dict)
    child_relationships: List[Any] = Field(default_factory=list)  # Allow strings or dicts
    lookup_relationships: List[Any] = Field(default_factory=list)  # Allow strings or dicts


class FieldDiscovery(BaseModel):
    """Field discovery information."""
    object: Optional[str] = None
    field: Optional[str] = None
    type: Optional[str] = None
    required: Optional[bool] = None



class TechnicalContext(BaseModel):
    """Technical context information."""
    successful_queries: List[str] = Field(default_factory=list)
    common_field_combinations: List[Any] = Field(default_factory=list)  # Allow strings or lists
    limitations: List[str] = Field(default_factory=list)


class StructuredConversationSummary(BaseModel):
    """
    Schema for structured conversation summary data.
    
    This schema represents the structured summary of a conversation between the user and the AI agent,
    matching the format expected by the summary prompts.
    """
    
    object_resolution: ObjectResolution = Field(default_factory=ObjectResolution)
    field_discoveries: List[Any] = Field(default_factory=list)  # Allow strings or FieldDiscovery objects
    technical_context: TechnicalContext = Field(default_factory=TechnicalContext)
    
    class Config:
        """Pydantic configuration."""
        json_encoders = {
            # Add any custom encoders if needed
        }
        schema_extra = {
            "example": {
                "object_resolution": {
                    "api_names": ["Account", "Contact"],
                    "label_mappings": {"accounts": "Account", "contacts": "Contact"},
                    "child_relationships": [
                        {"relationship_query_name": "Contacts", "child_object_name": "Contact"}
                    ],
                    "lookup_relationships": [
                        {"field_name": "AccountId", "reference_to_object_name": ["Account"]}
                    ]
                },
                "field_discoveries": [
                    {"object": "Account", "field": "Name", "type": "string", "required": True, "calculated": False},
                    {"object": "Contact", "field": "FirstName", "type": "string", "required": False, "calculated": False}
                ],
                "technical_context": {
                    "successful_queries": ["SELECT Id, Name, (SELECT Id, FirstName FROM Contacts) FROM Account LIMIT 5"],
                    "common_field_combinations": [["Name", "Id"], ["FirstName", "LastName"]],
                    "limitations": ["Need to get metadata before constructing SOQL"]
                }
            }
        }
