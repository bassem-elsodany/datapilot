"""
Saved Apex Model - MongoDB equivalent
"""

from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field


class SavedApex(BaseModel):
    """MongoDB model for saved Apex code"""
    
    id: Optional[str] = Field(default=None, alias="_id")
    saved_apex_uuid: str = Field(description="Unique Apex identifier")
    connection_uuid: str = Field(description="Connection identifier")
    name: str = Field(description="Apex name")
    code_text: str = Field(description="Apex code text")
    code_type: str = Field(description="Type of Apex code")
    description: Optional[str] = Field(default=None, description="Code description")
    is_favorite: bool = Field(default=False, description="Is favorite code")
    execution_count: int = Field(default=0, description="Execution count")
    last_executed: Optional[datetime] = Field(default=None, description="Last execution time")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: Optional[str] = Field(default=None, description="User who created the code")
    version: int = Field(default=1, description="Code version")
    is_deleted: bool = Field(default=False, description="Soft delete flag")
    debug_levels: Optional[List[str]] = Field(default_factory=list, description="Debug levels")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional metadata")
    
    class Config:
        populate_by_name = True
        json_schema_extra = {
            "example": {
                "saved_apex_uuid": "770e8400-e29b-41d4-a716-446655440002",
                "connection_uuid": "550e8400-e29b-41d4-a716-446655440000",
                "name": "Account Trigger",
                "code_text": "trigger AccountTrigger on Account (before insert) { ... }",
                "code_type": "trigger",
                "description": "Account trigger for validation",
                "created_by": "user123"
            }
        }


class SavedApexCreate(BaseModel):
    """Model for creating new saved Apex code"""
    connection_uuid: str = Field(description="Connection identifier")
    name: str = Field(description="Apex name")
    code_text: str = Field(description="Apex code text")
    code_type: str = Field(description="Type of Apex code")
    description: Optional[str] = Field(default=None, description="Code description")
    created_by: Optional[str] = Field(default=None, description="User creating the code")
    debug_levels: Optional[List[str]] = Field(default_factory=list, description="Debug levels")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional metadata")


class SavedApexUpdate(BaseModel):
    """Model for updating saved Apex code"""
    name: Optional[str] = Field(default=None, description="Apex name")
    code_text: Optional[str] = Field(default=None, description="Apex code text")
    code_type: Optional[str] = Field(default=None, description="Type of Apex code")
    description: Optional[str] = Field(default=None, description="Code description")
    is_favorite: Optional[bool] = Field(default=None, description="Is favorite code")
    updated_by: Optional[str] = Field(default=None, description="User updating the code")
    debug_levels: Optional[List[str]] = Field(default=None, description="Debug levels")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Additional metadata")


class SavedApexResponse(BaseModel):
    """Model for saved Apex responses"""
    id: str = Field(description="Apex ID")
    saved_apex_uuid: str = Field(description="Unique Apex identifier")
    connection_uuid: str = Field(description="Connection identifier")
    name: str = Field(description="Apex name")
    code_text: str = Field(description="Apex code text")
    code_type: str = Field(description="Type of Apex code")
    description: Optional[str] = Field(default=None, description="Code description")
    is_favorite: bool = Field(description="Is favorite code")
    execution_count: int = Field(description="Execution count")
    last_executed: Optional[datetime] = Field(default=None, description="Last execution time")
    created_at: datetime = Field(description="Creation timestamp")
    updated_at: datetime = Field(description="Last update timestamp")
    created_by: Optional[str] = Field(description="User who created the code")
    version: int = Field(description="Code version")
    debug_levels: Optional[List[str]] = Field(default_factory=list, description="Debug levels")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional metadata")


class DebugLevels:
    """Constants for debug levels"""
    NONE = "NONE"
    ERROR = "ERROR"
    WARN = "WARN"
    INFO = "INFO"
    DEBUG = "DEBUG"
    FINE = "FINE"
    FINER = "FINER"
    FINEST = "FINEST"
    INTERNAL = "INTERNAL"
    
    @classmethod
    def get_all_levels(cls) -> list:
        """Get all available debug levels"""
        return [
            cls.NONE, cls.ERROR, cls.WARN, cls.INFO, cls.DEBUG,
            cls.FINE, cls.FINER, cls.FINEST, cls.INTERNAL
        ]
    
    @classmethod
    def get_default_debug_levels(cls) -> Dict[str, str]:
        """Get default debug levels configuration"""
        return {
            "DB": cls.NONE,
            "Workflow": cls.NONE,
            "Validation": cls.NONE,
            "Callouts": cls.NONE,
            "Apex_Code": cls.NONE,
            "Apex_Profiling": cls.NONE
        }
    
    @classmethod
    def validate_debug_level(cls, level: str) -> bool:
        """Validate if a debug level is valid"""
        return level in cls.get_all_levels()


class ApexCodeType:
    """Constants for Apex code types"""
    ANONYMOUS = "anonymous"
    CLASS = "class"
    TRIGGER = "trigger"
    INTERFACE = "interface"
    ENUM = "enum"
    TEST_CLASS = "test_class"
    
    @classmethod
    def get_all_types(cls) -> list:
        """Get all available Apex code types"""
        return [
            cls.ANONYMOUS, cls.CLASS, cls.TRIGGER, cls.INTERFACE,
            cls.ENUM, cls.TEST_CLASS
        ]
    
    @classmethod
    def validate_code_type(cls, code_type: str) -> bool:
        """Validate if a code type is valid"""
        return code_type in cls.get_all_types()


class ExecutionStatus:
    """Constants for execution status"""
    SUCCESS = "success"
    ERROR = "error"
    COMPILATION_ERROR = "compilation_error"
    RUNTIME_ERROR = "runtime_error"
    TIMEOUT = "timeout"
    LIMIT_EXCEEDED = "limit_exceeded"
    
    @classmethod
    def get_all_statuses(cls) -> list:
        """Get all available execution statuses"""
        return [
            cls.SUCCESS, cls.ERROR, cls.COMPILATION_ERROR,
            cls.RUNTIME_ERROR, cls.TIMEOUT, cls.LIMIT_EXCEEDED
        ]
    
    @classmethod
    def validate_status(cls, status: str) -> bool:
        """Validate if an execution status is valid"""
        return status in cls.get_all_statuses()
