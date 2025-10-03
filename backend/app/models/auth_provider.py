"""
Auth Provider Model - MongoDB equivalent
"""

from datetime import datetime, timezone
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


class AuthProvider(BaseModel):
    """MongoDB model for authentication providers"""
    
    id: Optional[str] = Field(default=None, alias="_id")
    provider_uuid: str = Field(description="Provider UUID identifier")
    provider_type: str = Field(description="Type of authentication provider")
    provider_name: str = Field(description="Provider display name")
    config: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Provider configuration")
    is_active: bool = Field(default=True, description="Is provider active")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: Optional[str] = Field(default=None, description="User who created the provider")
    updated_by: Optional[str] = Field(default=None, description="User who last updated the provider")
    version: int = Field(default=1, description="Provider version")
    is_deleted: bool = Field(default=False, description="Soft delete flag")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional metadata")
    
    class Config:
        populate_by_name = True
        json_schema_extra = {
            "example": {
                "provider_uuid": "550e8400-e29b-41d4-a716-446655440000",
                "provider_type": "oauth2",
                "provider_name": "Salesforce OAuth",
                "config": {"client_id": "example", "client_secret": "secret"},
                "is_active": True,
                "created_by": "system"
            }
        }


class AuthProviderCreate(BaseModel):
    """Model for creating new auth providers"""
    provider_uuid: str = Field(description="Provider UUID identifier")
    provider_type: str = Field(description="Type of authentication provider")
    provider_name: str = Field(description="Provider display name")
    config: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Provider configuration")
    is_active: bool = Field(default=True, description="Is provider active")
    created_by: Optional[str] = Field(default=None, description="User creating the provider")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional metadata")


class AuthProviderUpdate(BaseModel):
    """Model for updating auth providers"""
    provider_name: Optional[str] = Field(default=None, description="Provider display name")
    config: Optional[Dict[str, Any]] = Field(default=None, description="Provider configuration")
    is_active: Optional[bool] = Field(default=None, description="Is provider active")
    updated_by: Optional[str] = Field(default=None, description="User updating the provider")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Additional metadata")


class AuthProviderResponse(BaseModel):
    """Model for auth provider responses"""
    id: str = Field(description="Provider ID")
    provider_uuid: str = Field(description="Provider UUID identifier")
    provider_type: str = Field(description="Type of authentication provider")
    provider_name: str = Field(description="Provider display name")
    config: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Provider configuration")
    is_active: bool = Field(description="Is provider active")
    created_at: datetime = Field(description="Creation timestamp")
    updated_at: datetime = Field(description="Last update timestamp")
    created_by: Optional[str] = Field(description="User who created the provider")
    updated_by: Optional[str] = Field(description="User who last updated the provider")
    version: int = Field(description="Provider version")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional metadata")
