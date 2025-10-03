"""
SObject Cache Models - MongoDB equivalent

This module defines MongoDB models for SObject cache data structures
using Pydantic for validation and serialization.
"""

from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field


class SObjectField(BaseModel):
    """Model for SObject field metadata"""
    name: str = Field(description="Field name")
    label: str = Field(description="Field label")
    type: str = Field(description="Field type")
    length: Optional[int] = Field(default=None, description="Field length")
    precision: Optional[int] = Field(default=None, description="Field precision")
    scale: Optional[int] = Field(default=None, description="Field scale")
    createable: bool = Field(description="Is field createable")
    updateable: bool = Field(description="Is field updateable")
    nillable: bool = Field(description="Is field nillable")
    unique: bool = Field(description="Is field unique")
    picklistValues: List[Dict[str, Any]] = Field(default_factory=list, description="Picklist values")
    calculated: bool = Field(default=False, description="Is calculated field")
    formula: Optional[str] = Field(default=None, description="Formula expression")
    formulaTreatNullNumberAsZero: bool = Field(default=False, description="Formula null handling")


class SObjectInfo(BaseModel):
    """Model for SObject basic information"""
    name: str = Field(description="SObject name")
    label: str = Field(description="SObject label")
    labelPlural: str = Field(description="SObject plural label")
    keyPrefix: Optional[str] = Field(default=None, description="Key prefix")
    custom: bool = Field(description="Is custom object")
    createable: bool = Field(description="Is createable")
    deletable: bool = Field(description="Is deletable")
    updateable: bool = Field(description="Is updateable")
    queryable: bool = Field(description="Is queryable")


class SObjectMetadata(BaseModel):
    """Model for complete SObject metadata"""
    name: str = Field(description="SObject name")
    label: str = Field(description="SObject label")
    custom: bool = Field(description="Is custom object")
    fields: List[SObjectField] = Field(description="SObject fields")
    createable: bool = Field(description="Is createable")
    deletable: bool = Field(description="Is deletable")
    updateable: bool = Field(description="Is updateable")
    queryable: bool = Field(description="Is queryable")
    childRelationships: Optional[List[Dict[str, Any]]] = Field(default=None, description="Child relationships")


class SObjectListCache(BaseModel):
    """MongoDB model for SObject list cache document"""
    
    id: Optional[str] = Field(default=None, alias="_id")
    connection_uuid: str = Field(description="Connection UUID")
    org_id: str = Field(description="Organization ID")
    sobjects: List[SObjectInfo] = Field(description="List of SObjects")
    cached_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), description="Cache timestamp")
    expires_at: datetime = Field(description="Expiration timestamp")
    version: str = Field(default="64.0", description="Salesforce API version")
    total_count: int = Field(description="Total SObject count")
    
    class Config:
        populate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
        json_schema_extra = {
            "example": {
                "connection_uuid": "550e8400-e29b-41d4-a716-446655440000",
                "org_id": "00D000000000000",
                "sobjects": [
                    {
                        "name": "Account",
                        "label": "Account",
                        "labelPlural": "Accounts",
                        "custom": False,
                        "createable": True,
                        "deletable": True,
                        "updateable": True,
                        "queryable": True
                    }
                ],
                "total_count": 150
            }
        }


class SObjectMetadataCache(BaseModel):
    """MongoDB model for SObject metadata cache document"""
    
    id: Optional[str] = Field(default=None, alias="_id")
    cache_key: str = Field(description="Unique cache key")
    connection_uuid: str = Field(description="Connection UUID")
    org_id: str = Field(description="Organization ID")
    sobject_name: str = Field(description="SObject name")
    include_child_relationships: bool = Field(default=False, description="Include child relationships")
    metadata: SObjectMetadata = Field(description="SObject metadata")
    cached_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), description="Cache timestamp")
    expires_at: datetime = Field(description="Expiration timestamp")
    version: str = Field(default="64.0", description="Salesforce API version")
    field_count: int = Field(description="Field count")
    has_picklist_values: bool = Field(default=False, description="Has picklist values")
    has_calculated_fields: bool = Field(default=False, description="Has calculated fields")
    
    class Config:
        populate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
        json_schema_extra = {
            "example": {
                "cache_key": "conn_123_Account_false",
                "connection_uuid": "550e8400-e29b-41d4-a716-446655440000",
                "org_id": "00D000000000000",
                "sobject_name": "Account",
                "include_child_relationships": False,
                "field_count": 45,
                "has_picklist_values": True,
                "has_calculated_fields": False
            }
        }


class CacheStatistics(BaseModel):
    """Model for cache statistics"""
    sobject_list_cache: Dict[str, Any] = Field(description="SObject list cache statistics")
    metadata_cache: Dict[str, Any] = Field(description="Metadata cache statistics")
    cache_ttl_hours: int = Field(description="Cache TTL in hours")
    metadata_cache_ttl_hours: int = Field(description="Metadata cache TTL in hours")
    timestamp: str = Field(description="Statistics timestamp")
    
    class Config:
        json_schema_extra = {
            "example": {
                "sobject_list_cache": {
                    "total_entries": 10,
                    "active_entries": 8,
                    "expired_entries": 2,
                    "estimated_size": 10
                },
                "metadata_cache": {
                    "total_entries": 50,
                    "active_entries": 45,
                    "expired_entries": 5,
                    "estimated_size": 50
                },
                "cache_ttl_hours": 24,
                "metadata_cache_ttl_hours": 12
            }
        }


class ConnectionCacheInfo(BaseModel):
    """Model for connection-specific cache information"""
    connection_uuid: str = Field(description="Connection UUID")
    sobject_list_cached: bool = Field(description="SObject list is cached")
    sobject_list_expires: Optional[str] = Field(default=None, description="SObject list expiration")
    sobject_list_count: int = Field(default=0, description="SObject count")
    metadata_cached_objects: int = Field(default=0, description="Number of cached metadata objects")
    metadata_objects: List[Dict[str, Any]] = Field(default_factory=list, description="Metadata objects info")
    timestamp: str = Field(description="Info timestamp")
    
    class Config:
        json_schema_extra = {
            "example": {
                "connection_uuid": "550e8400-e29b-41d4-a716-446655440000",
                "sobject_list_cached": True,
                "sobject_list_expires": "2024-01-02T00:00:00Z",
                "sobject_list_count": 150,
                "metadata_cached_objects": 5,
                "metadata_objects": [
                    {
                        "sobject_name": "Account",
                        "expires_at": "2024-01-01T12:00:00Z",
                        "field_count": 45,
                        "include_child_relationships": False
                    }
                ]
            }
        }


# ============================================================================
# CREATE/UPDATE/RESPONSE MODELS
# ============================================================================

class SObjectListCacheCreate(BaseModel):
    """Model for creating SObject list cache"""
    connection_uuid: str = Field(description="Connection UUID")
    org_id: str = Field(description="Organization ID")
    sobjects: List[SObjectInfo] = Field(description="List of SObjects")
    expires_at: datetime = Field(description="Expiration timestamp")
    version: str = Field(default="64.0", description="Salesforce API version")
    total_count: int = Field(description="Total SObject count")


class SObjectMetadataCacheCreate(BaseModel):
    """Model for creating SObject metadata cache"""
    cache_key: str = Field(description="Unique cache key")
    connection_uuid: str = Field(description="Connection UUID")
    org_id: str = Field(description="Organization ID")
    sobject_name: str = Field(description="SObject name")
    include_child_relationships: bool = Field(default=False, description="Include child relationships")
    metadata: SObjectMetadata = Field(description="SObject metadata")
    expires_at: datetime = Field(description="Expiration timestamp")
    version: str = Field(default="64.0", description="Salesforce API version")
    field_count: int = Field(description="Field count")
    has_picklist_values: bool = Field(default=False, description="Has picklist values")
    has_calculated_fields: bool = Field(default=False, description="Has calculated fields")


class SObjectListCacheResponse(BaseModel):
    """Model for SObject list cache responses"""
    id: str = Field(description="Cache document ID")
    connection_uuid: str = Field(description="Connection UUID")
    org_id: str = Field(description="Organization ID")
    sobjects: List[SObjectInfo] = Field(description="List of SObjects")
    cached_at: datetime = Field(description="Cache timestamp")
    expires_at: datetime = Field(description="Expiration timestamp")
    version: str = Field(description="Salesforce API version")
    total_count: int = Field(description="Total SObject count")
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class SObjectMetadataCacheResponse(BaseModel):
    """Model for SObject metadata cache responses"""
    id: str = Field(description="Cache document ID")
    cache_key: str = Field(description="Unique cache key")
    connection_uuid: str = Field(description="Connection UUID")
    org_id: str = Field(description="Organization ID")
    sobject_name: str = Field(description="SObject name")
    include_child_relationships: bool = Field(description="Include child relationships")
    metadata: SObjectMetadata = Field(description="SObject metadata")
    cached_at: datetime = Field(description="Cache timestamp")
    expires_at: datetime = Field(description="Expiration timestamp")
    version: str = Field(description="Salesforce API version")
    field_count: int = Field(description="Field count")
    has_picklist_values: bool = Field(description="Has picklist values")
    has_calculated_fields: bool = Field(description="Has calculated fields")
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
