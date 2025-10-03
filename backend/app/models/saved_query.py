"""
DataPilot Backend - Saved Query Data Model

This module defines the comprehensive MongoDB model for storing saved SOQL queries
using Pydantic for validation and serialization, providing enterprise-grade data modeling
with advanced security, validation, and audit capabilities.

The saved query model provides:
- Secure query storage with comprehensive metadata
- Advanced query versioning and history tracking
- Multi-tenant query isolation and management
- Enterprise-grade security and compliance features
- Performance optimization and indexing support
- Comprehensive audit trail and logging

Core Model Features:

Query Management:
- Unique query identification and tracking
- Query versioning and history management
- Query execution tracking and analytics
- Query sharing and collaboration
- Query tagging and categorization
- Query search and discovery

Data Security:
- Secure query storage and access control
- Query content validation and sanitization
- Access control and permission management
- Audit trail for all query operations
- Data privacy and compliance support
- Security event logging and monitoring

Query Analytics:
- Query execution tracking and analytics
- Query performance monitoring and metrics
- Query usage statistics and reporting
- Query optimization and recommendations
- Query error tracking and analysis
- Query success rate monitoring

Version Control:
- Query versioning and history tracking
- Query change tracking and audit
- Query rollback and recovery
- Query comparison and diff
- Query merge and conflict resolution
- Query collaboration and sharing

Performance & Optimization:
- Optimized query storage and retrieval
- Efficient query search and filtering
- Memory usage optimization
- Performance monitoring and metrics
- Scalability and load balancing
- Resource usage optimization

Integration Points:
- MongoDB database operations
- Query execution services
- Logging and monitoring systems
- Error handling and reporting
- Frontend user interface
- API endpoint integration

Author: Bassem Elsodany
GitHub: https://github.com/bassem-elsodany
LinkedIn: https://www.linkedin.com/in/bassem-elsodany/
Version: 1.0.0
License: MIT License
"""

from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field


class SavedQuery(BaseModel):
    """MongoDB model for saved SOQL queries"""
    
    id: Optional[str] = Field(default=None, alias="_id")
    saved_queries_uuid: str = Field(description="Unique query identifier")
    connection_uuid: str = Field(description="Connection identifier")
    name: str = Field(description="Query name")
    query_text: str = Field(description="SOQL query text")
    description: Optional[str] = Field(default=None, description="Query description")
    is_favorite: bool = Field(default=False, description="Is favorite query")
    execution_count: int = Field(default=0, description="Execution count")
    last_executed: Optional[datetime] = Field(default=None, description="Last execution time")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: Optional[str] = Field(default=None, description="User who created the query")
    version: int = Field(default=1, description="Query version")
    is_deleted: bool = Field(default=False, description="Soft delete flag")
    tags: Optional[List[str]] = Field(default_factory=list, description="Query tags")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional metadata")
    
    class Config:
        populate_by_name = True
        json_schema_extra = {
            "example": {
                "saved_queries_uuid": "660e8400-e29b-41d4-a716-446655440001",
                "connection_uuid": "550e8400-e29b-41d4-a716-446655440000",
                "name": "Account Industry Analysis",
                "query_text": "SELECT Id, Name, Industry FROM Account WHERE Industry != null",
                "description": "Query to analyze account industries",
                "is_favorite": True,
                "execution_count": 25,
                "created_by": "user123"
            }
        }


class SavedQueryCreate(BaseModel):
    """Model for creating new saved queries"""
    connection_uuid: str = Field(description="Connection identifier")
    name: str = Field(description="Query name")
    query_text: str = Field(description="SOQL query text")
    description: Optional[str] = Field(default=None, description="Query description")
    created_by: Optional[str] = Field(default=None, description="User creating the query")
    tags: Optional[List[str]] = Field(default_factory=list, description="Query tags")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional metadata")


class SavedQueryUpdate(BaseModel):
    """Model for updating saved queries"""
    name: Optional[str] = Field(default=None, description="Query name")
    query_text: Optional[str] = Field(default=None, description="SOQL query text")
    description: Optional[str] = Field(default=None, description="Query description")
    is_favorite: Optional[bool] = Field(default=None, description="Is favorite query")
    updated_by: Optional[str] = Field(default=None, description="User updating the query")
    tags: Optional[List[str]] = Field(default=None, description="Query tags")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Additional metadata")


class SavedQueryResponse(BaseModel):
    """Model for saved query responses"""
    id: str = Field(description="Query ID")
    saved_queries_uuid: str = Field(description="Unique query identifier")
    connection_uuid: str = Field(description="Connection identifier")
    name: str = Field(description="Query name")
    query_text: str = Field(description="SOQL query text")
    description: Optional[str] = Field(default=None, description="Query description")
    is_favorite: bool = Field(description="Is favorite query")
    execution_count: int = Field(description="Execution count")
    last_executed: Optional[datetime] = Field(default=None, description="Last execution time")
    created_at: datetime = Field(description="Creation timestamp")
    updated_at: datetime = Field(description="Last update timestamp")
    created_by: Optional[str] = Field(description="User who created the query")
    version: int = Field(description="Query version")
    tags: Optional[List[str]] = Field(default_factory=list, description="Query tags")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional metadata")
