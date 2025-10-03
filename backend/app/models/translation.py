"""
Translation Model - MongoDB equivalent
"""

from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field


class Translation(BaseModel):
    """MongoDB model for translations"""
    
    id: Optional[str] = Field(default=None, alias="_id")
    language_uuid: str = Field(description="Language UUID reference")
    page_name: str = Field(description="Page name (e.g., 'app', 'connections')")
    translations_data: List[Dict[str, str]] = Field(description="Array of translation key-value objects for this page")
    description: Optional[str] = Field(default=None, description="Translation description")
    is_active: bool = Field(default=True, description="Is translation active")
    is_system: bool = Field(default=False, description="Is system translation")
    metadata_json: Optional[str] = Field(default=None, description="Additional metadata as JSON string")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: Optional[str] = Field(default=None, description="User who created the translation")
    updated_by: Optional[str] = Field(default=None, description="User who last updated the translation")
    version: int = Field(default=1, description="Translation version")
    is_deleted: bool = Field(default=False, description="Soft delete flag")
    
    class Config:
        populate_by_name = True
        json_schema_extra = {
            "example": {
                "language_uuid": "550e8400-e29b-41d4-a716-446655440000",
                "page_name": "app",
                "translations_data": [
                    {"key": "welcome_message", "value": "Welcome to DataPilot"},
                    {"key": "app_name", "value": "DataPilot"}
                ],
                "description": "Application translations",
                "created_by": "system"
            }
        }


class TranslationCreate(BaseModel):
    """Model for creating new translations"""
    language_uuid: str = Field(description="Language UUID reference")
    page_name: str = Field(description="Page name (e.g., 'app', 'connections')")
    translations_data: List[Dict[str, str]] = Field(description="Array of translation key-value objects for this page")
    description: Optional[str] = Field(default=None, description="Translation description")
    is_system: bool = Field(default=False, description="Is system translation")
    metadata_json: Optional[str] = Field(default=None, description="Additional metadata as JSON string")
    created_by: Optional[str] = Field(default=None, description="User creating the translation")


class TranslationUpdate(BaseModel):
    """Model for updating translations"""
    translations_data: Optional[List[Dict[str, str]]] = Field(default=None, description="Array of translation key-value objects for this page")
    description: Optional[str] = Field(default=None, description="Translation description")
    is_active: Optional[bool] = Field(default=None, description="Is translation active")
    is_system: Optional[bool] = Field(default=None, description="Is system translation")
    metadata_json: Optional[str] = Field(default=None, description="Additional metadata as JSON string")
    updated_by: Optional[str] = Field(default=None, description="User updating the translation")


class TranslationResponse(BaseModel):
    """Model for translation responses"""
    id: str = Field(description="Translation ID")
    language_uuid: str = Field(description="Language UUID reference")
    page_name: str = Field(description="Page name (e.g., 'app', 'connections')")
    translations_data: List[Dict[str, str]] = Field(description="Array of translation key-value objects for this page")
    description: Optional[str] = Field(default=None, description="Translation description")
    is_active: bool = Field(description="Is translation active")
    is_system: bool = Field(description="Is system translation")
    metadata_json: Optional[str] = Field(default=None, description="Additional metadata as JSON string")
    created_at: datetime = Field(description="Creation timestamp")
    updated_at: datetime = Field(description="Last update timestamp")
    created_by: Optional[str] = Field(description="User who created the translation")
    updated_by: Optional[str] = Field(description="User who last updated the translation")
    version: int = Field(description="Translation version")
