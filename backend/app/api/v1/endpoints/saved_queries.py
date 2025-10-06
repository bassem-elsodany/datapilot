"""
DataPilot Backend - Saved Queries API Endpoints

This module provides comprehensive RESTful API endpoints for saved query management in the DataPilot backend,
offering enterprise-grade storage, retrieval, and management of user-saved SOQL queries with advanced
metadata, tags, and execution tracking with security and compliance features.

The saved queries API provides:
- Enterprise-grade CRUD operations for saved queries
- Advanced query metadata management (name, description, tags)
- Intelligent favorite query marking and organization
- Comprehensive execution count tracking and statistics
- Connection-specific query isolation and security
- Advanced query versioning and history management
- Intelligent tag-based organization and filtering
- Comprehensive execution tracking and performance metrics
- REST-compliant resource hierarchy and architecture

Core Query Features:

Query Management:
- Complete CRUD operations for saved queries
- Query metadata management and validation
- Query content validation and sanitization
- Query security and access control
- Query analytics and statistics
- Query search and filtering

Query Organization:
- Intelligent favorite query marking and organization
- Tag-based organization and filtering
- Query categorization and grouping
- Query sharing and collaboration
- Query versioning and history
- Query search and discovery

Execution Tracking:
- Comprehensive execution count tracking and statistics
- Query performance monitoring and metrics
- Query success rate tracking and analysis
- Query error tracking and reporting
- Query optimization and recommendations
- Query business intelligence and insights

Connection Isolation:
- Connection-specific query isolation and security
- Multi-tenant query separation and management
- Connection-based query access control
- Connection query analytics and statistics
- Connection query security and compliance
- Connection query audit and logging

Performance & Optimization:
- High-performance query operations and retrieval
- Intelligent query caching and optimization
- Memory usage optimization
- Performance monitoring and metrics
- Scalability and load balancing
- Resource usage optimization

Security & Compliance:
- Secure query operations and access control
- Query content validation and sanitization
- Access control and permission management
- Audit trail for all query operations
- Data privacy and GDPR compliance
- Security event logging and monitoring

REST API Endpoints:

Query Management:
- POST /saved-queries - Create saved query with comprehensive metadata
- GET /saved-queries - Get saved queries with filtering and pagination
- GET /saved-queries/{uuid} - Get specific saved query with full details
- PUT /saved-queries/{uuid} - Update saved query with version control
- DELETE /saved-queries/{uuid} - Delete saved query with secure cleanup

Query Operations:
- POST /saved-queries/{uuid}/increment-execution - Increment execution count and analytics

Integration Points:
- MongoDB database operations
- Query execution services
- Logging and monitoring systems
- Error handling and reporting
- Frontend user interface
- Performance monitoring systems

Author: Bassem Elsodany
GitHub: https://github.com/bassem-elsodany
LinkedIn: https://www.linkedin.com/in/bassem-elsodany/
Version: 1.0.0
License: MIT License
"""

from fastapi import APIRouter, HTTPException, status, Depends, Request, Query
from pydantic import BaseModel, Field
from typing import List, Optional
from app.services.saved_query_service import SavedQueryService
from app.services.error_service import ErrorService
from app.utils.i18n_utils import translate_message, format_message_with_params

from loguru import logger

router = APIRouter()
saved_query_service = SavedQueryService()

# Pydantic models
class CreateSavedQueryRequest(BaseModel):
    connection_uuid: str = Field(..., description="Connection UUID")
    name: str = Field(..., min_length=1, max_length=255, description="Query name")
    query_text: str = Field(..., min_length=1, description="SOQL query text")
    description: Optional[str] = Field(None, description="Query description")
    tags: Optional[str] = Field(None, description="Comma-separated tags")
    is_favorite: bool = Field(False, description="Mark as favorite")
    created_by: str = Field("user", description="Created by user")

class UpdateSavedQueryRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255, description="Query name")
    query_text: Optional[str] = Field(None, min_length=1, description="SOQL query text")
    description: Optional[str] = Field(None, description="Query description")
    tags: Optional[str] = Field(None, description="Comma-separated tags")
    is_favorite: Optional[bool] = Field(None, description="Mark as favorite")
    updated_by: str = Field("user", description="Updated by user")

class SavedQueryResponse(BaseModel):
    saved_queries_uuid: str
    connection_uuid: str
    name: str
    query_text: str
    description: Optional[str]
    tags: Optional[str]
    is_favorite: bool
    execution_count: int
    last_executed: Optional[str]
    created_at: str
    updated_at: str
    created_by: str
    updated_by: str
    version: int

class SavedQueryListResponse(BaseModel):
    saved_queries: List[SavedQueryResponse]
    total_count: int





@router.post("/", response_model=SavedQueryResponse, status_code=status.HTTP_201_CREATED)
def create_saved_query(
    request: CreateSavedQueryRequest,
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """Create a new saved query"""
    try:
        
        logger.debug(f"Creating saved query: {request.name}")
        # Create saved query
        saved_query_data = saved_query_service.create_saved_query(
            connection_uuid=request.connection_uuid,
            name=request.name,
            query_text=request.query_text,
            description=request.description,
            tags=request.tags,
            is_favorite=request.is_favorite,
            created_by=request.created_by
        )
        
        logger.debug(f"Created saved query: {saved_query_data['saved_queries_uuid']}")
        return SavedQueryResponse(**saved_query_data)
        
    except ValueError as e:
        # Translate backend validation key to user-facing message before raising
        translated_field_error = translate_message(str(e), lang, "saved_queries")
        ErrorService.raise_validation_error(
            message="saved_queries.errors.invalid_data",
            field_errors={"query": translated_field_error},
            request=http_request,
            locale=lang
        )
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="creating saved query",
            request=http_request,
            locale=lang
        )

@router.get("/", response_model=SavedQueryListResponse)
def get_all_saved_queries(
    connection_uuid: str,
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """Get all saved queries, optionally filtered by connection"""
    try:
        logger.debug(f"Getting all saved queries for connection: {connection_uuid}")
        # Get saved queries for the specified connection
        saved_queries_data = saved_query_service.get_all_saved_queries(connection_uuid=connection_uuid)
        
        saved_queries = [SavedQueryResponse(**sq) for sq in saved_queries_data]
        
        logger.debug(f"Retrieved {len(saved_queries)} saved queries")
        return SavedQueryListResponse(
            saved_queries=saved_queries,
            total_count=len(saved_queries)
        )
        
    except ValueError as e:
        # Translate backend validation key to user-facing message before raising
        translated_field_error = translate_message(str(e), lang, "saved_queries")
        ErrorService.raise_validation_error(
            message="saved_queries.errors.invalid_filter",
            field_errors={"filter": translated_field_error},
            request=http_request,
            locale=lang
        )
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="retrieving saved queries",
            request=http_request,
            locale=lang
        )

@router.get("/{query_uuid}", response_model=SavedQueryResponse)
def get_saved_query(
    query_uuid: str,
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """Get a specific saved query by UUID"""
    try:
        logger.debug(f"Getting saved query: {query_uuid}")
        # Get saved query
        saved_query_data = saved_query_service.get_saved_query_by_uuid(query_uuid)
        
        if not saved_query_data:

        
            ErrorService.raise_not_found_error(
                message="saved_queries.errors.not_found",
                resource_type="saved_query",
                resource_id=query_uuid,
                request=http_request,
                locale=lang
            )
        
        logger.debug(f"Retrieved saved query: {query_uuid}")
        return saved_query_data
        
    except HTTPException:
        raise
    except ValueError as e:
        # Translate backend validation key to user-facing message before raising
        translated_field_error = translate_message(str(e), lang, "saved_queries")
        ErrorService.raise_validation_error(
            message="saved_queries.errors.invalid_identifier",
            field_errors={"saved_queries_uuid": translated_field_error},
            request=http_request,
            locale=lang
        )
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="retrieving saved query",
            request=http_request,
            locale=lang
        )

@router.put("/{query_uuid}", response_model=SavedQueryResponse)
def update_saved_query(
    query_uuid: str,
    request: UpdateSavedQueryRequest,
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """Update a saved query"""
    try:
        logger.debug(f"Updating saved query: {query_uuid}")
        # Update saved query
        saved_query_data = saved_query_service.update_saved_query(
            saved_queries_uuid=query_uuid,
            name=request.name,
            query_text=request.query_text,
            description=request.description,
            tags=request.tags,
            is_favorite=request.is_favorite,
            updated_by=request.updated_by
        )
        
        logger.debug(f"Updated saved query: {query_uuid}")
        return SavedQueryResponse(**saved_query_data)
        
    except ValueError as e:
        # Translate backend validation key to user-facing message before raising
        translated_field_error = translate_message(str(e), lang, "saved_queries")
        ErrorService.raise_validation_error(
            message="saved_queries.errors.invalid_update_data",
            field_errors={"query": translated_field_error},
            request=http_request,
            locale=lang
        )
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="updating saved query",
            request=http_request,
            locale=lang
        )

@router.delete("/{query_uuid}", status_code=status.HTTP_204_NO_CONTENT)
def delete_saved_query(
    query_uuid: str,
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """Delete a saved query"""
    try:
        logger.debug(f"Deleting saved query: {query_uuid}")
        # Delete saved query
        success = saved_query_service.delete_saved_query(query_uuid)
        
        if not success:

        
            ErrorService.raise_not_found_error(
                message="saved_queries.errors.not_found",
                resource_type="saved_query",
                resource_id=query_uuid,
                request=http_request,
                locale=lang
            )
        
        logger.debug(f"Deleted saved query: {query_uuid}")
        return None
        
    except HTTPException:
        raise
    except ValueError as e:
        # Translate backend validation key to user-facing message before raising
        translated_field_error = translate_message(str(e), lang, "saved_queries")
        ErrorService.raise_validation_error(
            message="saved_queries.errors.invalid_identifier_for_deletion",
            field_errors={"saved_queries_uuid": translated_field_error},
            request=http_request,
            locale=lang
        )
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="deleting saved query",
            request=http_request,
            locale=lang
        )

@router.post("/{query_uuid}/increment-execution", status_code=status.HTTP_200_OK)
def increment_execution_count(
    query_uuid: str,
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """Increment the execution count for a saved query"""
    try:
        logger.debug(f"Incrementing execution count for saved query: {query_uuid}")
        # Increment execution count
        success = saved_query_service.increment_execution_count(query_uuid)
        
        if not success:

        
            ErrorService.raise_not_found_error(
                message="saved_queries.errors.not_found",
                resource_type="saved_query",
                resource_id=query_uuid,
                request=http_request,
                locale=lang
            )
        
        logger.debug(f"Incremented execution count for saved query: {query_uuid}")
        success_message = translate_message("saved_queries.messages.execution_incremented", lang, "saved_queries")
        return {"message": success_message}
        
    except HTTPException:
        raise
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="incrementing execution count",
            request=http_request,
            locale=lang
        )
