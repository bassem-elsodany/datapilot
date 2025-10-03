"""
Master Key Model - MongoDB equivalent
"""

from datetime import datetime, timezone
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


class MasterKey(BaseModel):
    """MongoDB model for master encryption keys"""
    
    id: Optional[str] = Field(default=None, alias="_id")
    key_id: str = Field(description="Key identifier")
    key_type: str = Field(description="Type of encryption key")
    encrypted_key: str = Field(description="Encrypted key data")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: Optional[str] = Field(default=None, description="User who created the key")
    updated_by: Optional[str] = Field(default=None, description="User who last updated the key")
    version: int = Field(default=1, description="Key version")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional metadata")
    
    class Config:
        populate_by_name = True
        json_schema_extra = {
            "example": {
                "key_id": "master_key_001",
                "key_type": "aes256",
                "encrypted_key": "encrypted_key_data_here",
                "created_by": "system"
            }
        }


class MasterKeyCreate(BaseModel):
    """Model for creating new master keys"""
    key_id: str = Field(description="Key identifier")
    key_type: str = Field(description="Type of encryption key")
    encrypted_key: str = Field(description="Encrypted key data")
    created_by: Optional[str] = Field(default=None, description="User creating the key")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional metadata")


class MasterKeyUpdate(BaseModel):
    """Model for updating master keys"""
    encrypted_key: Optional[str] = Field(default=None, description="Encrypted key data")
    updated_by: Optional[str] = Field(default=None, description="User updating the key")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Additional metadata")


class MasterKeyResponse(BaseModel):
    """Model for master key responses"""
    id: str = Field(description="Key ID")
    key_id: str = Field(description="Key identifier")
    key_type: str = Field(description="Type of encryption key")
    created_at: datetime = Field(description="Creation timestamp")
    updated_at: datetime = Field(description="Last update timestamp")
    created_by: Optional[str] = Field(description="User who created the key")
    updated_by: Optional[str] = Field(description="User who last updated the key")
    version: int = Field(description="Key version")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional metadata")
