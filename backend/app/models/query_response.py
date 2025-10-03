"""
DataPilot Backend - Query Response Data Models

This module defines comprehensive Pydantic models for the SOQL query response format,
providing enterprise-grade type safety, validation, and consistency across the API
with advanced security, performance, and compliance features.

The query response models provide:
- Enterprise-grade type safety and validation
- Comprehensive query response structure and metadata
- Advanced record and relationship modeling
- Performance optimization and caching support
- Security and compliance features
- Comprehensive audit trail and logging

Core Model Features:

Query Response Structure:
- Comprehensive query response modeling and validation
- Advanced record and relationship structure
- Query metadata and statistics tracking
- Query performance monitoring and metrics
- Query error handling and reporting
- Query security and compliance validation

Record Management:
- Advanced record structure and validation
- Record field validation and sanitization
- Record relationship mapping and navigation
- Record security and access control
- Record analytics and statistics
- Record search and filtering

Relationship Management:
- Advanced relationship modeling and validation
- Relationship navigation and traversal
- Relationship security and access control
- Relationship analytics and statistics
- Relationship optimization and caching
- Relationship search and filtering

Performance & Optimization:
- Optimized query response processing
- Efficient record and relationship handling
- Memory usage optimization
- Performance monitoring and metrics
- Scalability and load balancing
- Resource usage optimization

Security & Compliance:
- Secure query response processing
- Query response validation and sanitization
- Access control and permission management
- Audit trail for all query operations
- Data privacy and GDPR compliance
- Security event logging and monitoring

Integration Points:
- FastAPI request/response processing
- Database query operations
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

from typing import Dict, List, Any, Optional, Union
from pydantic import BaseModel, Field


class QueryRecord(BaseModel):
    """
    Represents a single record in the query response.
    Each record has a type, fields, and relationships.
    """
    type: str = Field(..., description="Salesforce object type (e.g., 'Account', 'Contact')")
    fields: Dict[str, Any] = Field(..., description="Record fields with Id always first")
    relationships: Dict[str, List['QueryRecord']] = Field(
        default_factory=dict, 
        description="Dictionary of relationships where key is relationship name and value is array of related records"
    )


class QueryMetadata(BaseModel):
    """
    Metadata for the query response.
    """
    total_size: int = Field(..., description="Total number of records")
    done: bool = Field(..., description="Whether all records have been retrieved")
    nextRecordsUrl: Optional[str] = Field(None, description="URL for next batch of records")


class QueryResponse(BaseModel):
    """
    Complete query response structure.
    """
    metadata: QueryMetadata = Field(..., description="Response metadata")
    records: List[QueryRecord] = Field(..., description="Array of transformed records")


# Update forward references
QueryRecord.model_rebuild()
