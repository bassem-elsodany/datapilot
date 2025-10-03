"""
Language Model - MongoDB equivalent
"""

from datetime import datetime, timezone
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


class Language(BaseModel):
    """MongoDB model for languages"""
    
    id: Optional[str] = Field(default=None, alias="_id")
    language_uuid: str = Field(description="Unique language identifier")
    language_code: str = Field(description="Language code (e.g., 'en')")
    language_name: str = Field(description="Language name in English")
    native_name: str = Field(description="Language name in native script")
    direction: str = Field(default="ltr", description="Text direction (ltr/rtl)")
    is_active: bool = Field(default=True, description="Is language active")
    is_default: bool = Field(default=False, description="Is default language")
    is_system: bool = Field(default=False, description="Is system language")
    metadata_json: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional metadata")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: Optional[str] = Field(default=None, description="User who created the language")
    updated_by: Optional[str] = Field(default=None, description="User who last updated the language")
    version: int = Field(default=1, description="Language version")
    is_deleted: bool = Field(default=False, description="Soft delete flag")
    
    class Config:
        populate_by_name = True
        json_schema_extra = {
            "example": {
                "language_uuid": "en-US",
                "language_code": "en",
                "language_name": "English",
                "native_name": "English",
                "direction": "ltr",
                "is_active": True,
                "is_default": True,
                "created_by": "system"
            }
        }


class LanguageCreate(BaseModel):
    """Model for creating new languages"""
    language_code: str = Field(description="Language code")
    language_name: str = Field(description="Language name in English")
    native_name: str = Field(description="Language name in native script")
    direction: str = Field(default="ltr", description="Text direction")
    is_active: bool = Field(default=True, description="Is language active")
    is_default: bool = Field(default=False, description="Is default language")
    created_by: Optional[str] = Field(default=None, description="User creating the language")
    metadata_json: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional metadata")


class LanguageUpdate(BaseModel):
    """Model for updating languages"""
    language_name: Optional[str] = Field(default=None, description="Language name in English")
    native_name: Optional[str] = Field(default=None, description="Language name in native script")
    direction: Optional[str] = Field(default=None, description="Text direction")
    is_active: Optional[bool] = Field(default=None, description="Is language active")
    is_default: Optional[bool] = Field(default=None, description="Is default language")
    updated_by: Optional[str] = Field(default=None, description="User updating the language")
    metadata_json: Optional[Dict[str, Any]] = Field(default=None, description="Additional metadata")


class LanguageResponse(BaseModel):
    """Model for language responses"""
    id: str = Field(description="Language ID")
    language_uuid: str = Field(description="Unique language identifier")
    language_code: str = Field(description="Language code")
    language_name: str = Field(description="Language name in English")
    native_name: str = Field(description="Language name in native script")
    direction: str = Field(description="Text direction")
    is_active: bool = Field(description="Is language active")
    is_default: bool = Field(description="Is default language")
    is_system: bool = Field(description="Is system language")
    metadata_json: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional metadata")
    created_at: datetime = Field(description="Creation timestamp")
    updated_at: datetime = Field(description="Last update timestamp")
    created_by: Optional[str] = Field(description="User who created the language")
    updated_by: Optional[str] = Field(description="User who last updated the language")
    version: int = Field(description="Language version")
