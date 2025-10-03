"""
SObject Favorite Model - MongoDB equivalent
"""

from datetime import datetime, timezone
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


class SObjectFavorite(BaseModel):
    """MongoDB model for SObject favorites"""
    
    id: Optional[str] = Field(default=None, alias="_id")
    user_id: str = Field(description="User identifier")
    sobject_name: str = Field(description="SObject name")
    connection_uuid: str = Field(description="Connection identifier")
    is_active: bool = Field(default=True, description="Is favorite active")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: Optional[str] = Field(default=None, description="User who created the favorite")
    updated_by: Optional[str] = Field(default=None, description="User who last updated the favorite")
    version: int = Field(default=1, description="Favorite version")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional metadata")
    
    class Config:
        populate_by_name = True
        json_schema_extra = {
            "example": {
                "user_id": "user123",
                "sobject_name": "Account",
                "connection_uuid": "550e8400-e29b-41d4-a716-446655440000",
                "is_active": True,
                "created_by": "user123"
            }
        }


class SObjectFavoriteCreate(BaseModel):
    """Model for creating new SObject favorites"""
    user_id: str = Field(description="User identifier")
    sobject_name: str = Field(description="SObject name")
    connection_uuid: str = Field(description="Connection identifier")
    is_active: bool = Field(default=True, description="Is favorite active")
    created_by: Optional[str] = Field(default=None, description="User creating the favorite")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional metadata")


class SObjectFavoriteUpdate(BaseModel):
    """Model for updating SObject favorites"""
    is_active: Optional[bool] = Field(default=None, description="Is favorite active")
    updated_by: Optional[str] = Field(default=None, description="User updating the favorite")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Additional metadata")


class SObjectFavoriteResponse(BaseModel):
    """Model for SObject favorite responses"""
    id: str = Field(description="Favorite ID")
    user_id: str = Field(description="User identifier")
    sobject_name: str = Field(description="SObject name")
    connection_uuid: str = Field(description="Connection identifier")
    is_active: bool = Field(description="Is favorite active")
    created_at: datetime = Field(description="Creation timestamp")
    updated_at: datetime = Field(description="Last update timestamp")
    created_by: Optional[str] = Field(description="User who created the favorite")
    updated_by: Optional[str] = Field(description="User who last updated the favorite")
    version: int = Field(description="Favorite version")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional metadata")
