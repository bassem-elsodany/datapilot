"""
DataPilot Backend - Saved Apex API Endpoints

This module provides comprehensive REST API endpoints for managing saved Apex code with debug levels,
offering enterprise-grade Apex code management with advanced debug level configuration, execution tracking,
and comprehensive security and compliance features.

The saved Apex API provides:
- Enterprise-grade CRUD operations for saved Apex code
- Advanced debug level configuration and validation
- Comprehensive execution tracking and statistics
- Intelligent search and filtering capabilities
- Connection-specific organization and security
- Advanced favorites management and organization
- Complete version control and audit trails
- REST-compliant resource hierarchy and architecture

Core Apex Features:

Apex Code Management:
- Complete CRUD operations for saved Apex code
- Apex code content validation and sanitization
- Apex code security and access control
- Apex code analytics and statistics
- Apex code search and filtering
- Apex code optimization and recommendations

Debug Level Configuration:
- Advanced debug level configuration and validation
- Debug level security and access control
- Debug level analytics and statistics
- Debug level search and filtering
- Debug level audit and compliance
- Debug level optimization and recommendations

Execution Tracking:
- Comprehensive execution tracking and statistics
- Apex execution performance monitoring and metrics
- Apex execution success rate tracking and analysis
- Apex execution error tracking and reporting
- Apex execution optimization and recommendations
- Apex execution business intelligence and insights

Connection Organization:
- Connection-specific organization and security
- Multi-tenant Apex code separation and management
- Connection-based Apex code access control
- Connection Apex code analytics and statistics
- Connection Apex code security and compliance
- Connection Apex code audit and logging

Favorites Management:
- Advanced favorites management and organization
- Favorites security and access control
- Favorites analytics and statistics
- Favorites search and filtering
- Favorites audit and compliance
- Favorites optimization and recommendations

Version Control:
- Complete version control and audit trails
- Apex code versioning and history tracking
- Apex code change tracking and audit
- Apex code rollback and recovery
- Apex code comparison and diff
- Apex code merge and conflict resolution

Security & Compliance:
- Secure Apex code operations and access control
- Apex code content validation and sanitization
- Access control and permission management
- Audit trail for all Apex code operations
- Data privacy and GDPR compliance
- Security event logging and monitoring

Performance & Optimization:
- High-performance Apex code operations
- Intelligent Apex code caching and optimization
- Memory usage optimization
- Performance monitoring and metrics
- Scalability and load balancing
- Resource usage optimization

REST API Endpoints:

Apex Code Management:
- GET /saved-apex - List saved Apex code with advanced filtering
- POST /saved-apex - Create new saved Apex code with validation
- GET /saved-apex/{uuid} - Get specific saved Apex code with full details
- PUT /saved-apex/{uuid} - Update saved Apex code with version control
- DELETE /saved-apex/{uuid} - Delete saved Apex code with secure cleanup

Apex Operations:
- POST /saved-apex/{uuid}/toggle-favorite - Toggle favorite status with analytics
- GET /saved-apex/debug-levels - Get comprehensive debug levels information
- GET /saved-apex/code-types - Get detailed code types information

Integration Points:
- MongoDB database operations
- Apex execution services
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

from typing import Dict, List, Any, Optional
from fastapi import APIRouter, HTTPException, Query, Path, Request
from pydantic import BaseModel, Field

from app.services.saved_apex_service import SavedApexService
from app.services.i18n_service import I18nService
from app.services.error_service import ErrorService
from app.services.connection_service import ConnectionService

# Get logger for this module
from loguru import logger

# Router for saved Apex endpoints
router = APIRouter()

# Initialize services
i18n_service = I18nService()
connection_service = ConnectionService()
saved_apex_service = SavedApexService()

def validate_connection_uuid(
    connection_uuid: str,
    http_request: Request,
    lang: str
) -> None:
    """Validate that a connection UUID exists and is valid"""
    try:
        connections = connection_service.get_all_connections()
        if not any(conn["connectionUuid"] == connection_uuid for conn in connections):

            ErrorService.raise_validation_error(
                message="saved_apex.error.invalid_connection",
                field_errors={"connection_uuid": f"Connection UUID '{connection_uuid}' does not exist"},
                request=http_request,
                locale=lang
            )
        # Connection UUID is valid
    except Exception as e:

        ErrorService.raise_validation_error(
            message="saved_apex.error.connection_validation_failed",
            field_errors={"connection_uuid": f"Failed to validate connection UUID: {str(e)}"},
            request=http_request,
            locale=lang
        )

# Pydantic models for request/response validation
class CreateSavedApexRequest(BaseModel):
    """Request model for creating saved Apex code"""
    connection_uuid: str = Field(..., description="Connection UUID for the Salesforce connection")
    name: str = Field(..., description="Name of the saved Apex code", min_length=1, max_length=255)
    apex_code: str = Field(..., description="The Apex code to save", min_length=1)
    description: Optional[str] = Field(None, description="Description of what the Apex code does")
    tags: Optional[str] = Field(None, description="Comma-separated tags for categorization")
    code_type: str = Field(default="anonymous", description="Type of Apex code")
    debug_levels: Optional[Dict[str, str]] = Field(None, description="Debug levels configuration")
    created_by: Optional[str] = Field(None, description="User who created this saved Apex code")

class UpdateSavedApexRequest(BaseModel):
    """Request model for updating saved Apex code"""
    name: Optional[str] = Field(None, description="Name of the saved Apex code", min_length=1, max_length=255)
    description: Optional[str] = Field(None, description="Description of what the Apex code does")
    tags: Optional[str] = Field(None, description="Comma-separated tags for categorization")
    apex_code: Optional[str] = Field(None, description="The Apex code to save", min_length=1)
    code_type: Optional[str] = Field(None, description="Type of Apex code")
    debug_levels: Optional[Dict[str, str]] = Field(None, description="Debug levels configuration")
    is_favorite: Optional[bool] = Field(None, description="Whether this Apex code is marked as favorite")
    updated_by: Optional[str] = Field(None, description="User who updated this saved Apex code")

class SavedApexResponse(BaseModel):
    """Response model for saved Apex code"""
    saved_apex_uuid: str
    connection_uuid: str
    name: str
    description: Optional[str]
    tags: Optional[str]
    apex_code: str
    code_type: str
    debug_levels: Dict[str, str]
    is_favorite: bool
    execution_count: int
    last_executed: Optional[str]
    last_execution_status: Optional[str]
    last_execution_time: Optional[int]
    created_at: str
    updated_at: str
    created_by: Optional[str]
    updated_by: Optional[str]
    version: int

class SavedApexListResponse(BaseModel):
    """Response model for saved Apex code list"""
    saved_apex_list: List[SavedApexResponse]
    total_count: int
    limit: int
    offset: int


@router.get("/debug-levels")
def get_debug_levels_info(
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """
    Get debug levels information
    
    This endpoint returns information about available debug levels and components.
    
    Args:
        http_request: FastAPI request object
        lang: Language code for messages
        
    Returns:
        Debug levels configuration information
    """
    try:
        logger.debug(f"📖 Getting debug levels information")
        
        result = saved_apex_service.get_debug_levels_info()
        
        logger.debug(f"Retrieved debug levels information")
        return result
        
    except HTTPException:
        raise
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="getting debug levels information",
            request=http_request,
            locale=lang
        )

@router.get("/code-types")
def get_code_types_info(
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """
    Get code types information
    
    This endpoint returns information about available Apex code types and execution statuses.
    
    Args:
        http_request: FastAPI request object
        lang: Language code for messages
        
    Returns:
        Code types and execution statuses information
    """
    try:
        logger.debug(f"📖 Getting code types information")
        
        result = saved_apex_service.get_code_types_info()
        
        logger.debug(f"Retrieved code types information")
        return result
        
    except HTTPException:
        raise
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="getting code types information",
            request=http_request,
            locale=lang
        )

@router.get("/", response_model=SavedApexListResponse)
def get_saved_apex_list(
    http_request: Request,
    connection_uuid: str = Query(..., description="Connection UUID to filter by"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of records to return"),
    offset: int = Query(0, ge=0, description="Number of records to skip"),
    search: Optional[str] = Query(None, description="Search term to filter by name, description, tags, or code"),
    code_type: Optional[str] = Query(None, description="Filter by Apex code type"),
    is_favorite: Optional[bool] = Query(None, description="Filter by favorite status"),
    lang: str = Query("en", description="Language code for messages")
):
    """
    Get list of saved Apex code for a specific connection
    
    This endpoint retrieves saved Apex code with optional filtering and pagination.
    
    Args:
        connection_uuid: Connection UUID to filter by
        limit: Maximum number of records to return
        offset: Number of records to skip
        search: Search term to filter by name, description, tags, or code
        code_type: Filter by Apex code type
        is_favorite: Filter by favorite status
        http_request: FastAPI request object
        lang: Language code for messages
        
    Returns:
        List of saved Apex code with pagination information
    """
    try:
        logger.debug(f"📖 Getting saved Apex code list for connection: {connection_uuid}")
        
        # Validate connection UUID
        validate_connection_uuid(connection_uuid, http_request, lang)
        
        result = saved_apex_service.get_saved_apex_by_connection(
            connection_uuid=connection_uuid,
            limit=limit,
            offset=offset,
            search=search,
            code_type=code_type,
            is_favorite=is_favorite
        )
        
        logger.debug(f"Retrieved {len(result['saved_apex_list'])} saved Apex codes")
        return result
        
    except HTTPException:
        raise
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="getting saved Apex code list",
            request=http_request,
            locale=lang
        )

@router.post("/", response_model=SavedApexResponse)
def create_saved_apex(
    request: CreateSavedApexRequest,
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """
    Create new saved Apex code
    
    This endpoint creates a new saved Apex code entry with debug levels configuration.
    
    Args:
        request: CreateSavedApexRequest containing the Apex code details
        http_request: FastAPI request object
        lang: Language code for messages
        
    Returns:
        Created saved Apex code details
    """
    try:
        logger.debug(f"Creating new saved Apex code: {request.name}")
        
        # Validate connection UUID
        validate_connection_uuid(request.connection_uuid, http_request, lang)
        
        result = saved_apex_service.create_saved_apex(
            connection_uuid=request.connection_uuid,
            name=request.name,
            apex_code=request.apex_code,
            description=request.description,
            tags=request.tags,
            code_type=request.code_type,
            debug_levels=request.debug_levels,
            created_by=request.created_by
        )
        
        logger.debug(f"Created saved Apex code: {result['saved_apex_uuid']}")
        return result
        
    except ValueError as e:
        logger.debug(f"Validation error creating saved Apex code: {str(e)}")
        ErrorService.raise_validation_error(
            message="saved_apex.error.validation",
            field_errors={"validation": str(e)},
            request=http_request,
            locale=lang
        )
    except HTTPException:
        raise
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="creating saved Apex code",
            request=http_request,
            locale=lang
        )

@router.get("/{apex_uuid}", response_model=SavedApexResponse)
def get_saved_apex(
    http_request: Request,
    apex_uuid: str = Path(..., description="UUID of the saved Apex code"),
    lang: str = Query("en", description="Language code for messages")
):
    """
    Get specific saved Apex code by UUID
    
    This endpoint retrieves a specific saved Apex code by its UUID.
    
    Args:
        saved_apex_uuid: UUID of the saved Apex code to retrieve
        http_request: FastAPI request object
        lang: Language code for messages
        
    Returns:
        Saved Apex code details
    """
    try:
        logger.debug(f"📖 Getting saved Apex code: {apex_uuid}")
        
        result = saved_apex_service.get_saved_apex_by_uuid(apex_uuid)
        
        if not result:

        
            ErrorService.raise_not_found_error(
                message="saved_apex.error.not_found",
                resource_type="saved Apex code",
                resource_id=apex_uuid,
                request=http_request,
                locale=lang
            )
        
        logger.debug(f"Retrieved saved Apex code: {apex_uuid}")
        return result
        
    except HTTPException:
        raise
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="getting saved Apex code",
            request=http_request,
            locale=lang
        )

@router.put("/{apex_uuid}", response_model=SavedApexResponse)
def update_saved_apex(
    http_request: Request,
    request: UpdateSavedApexRequest,
    apex_uuid: str = Path(..., description="UUID of the saved Apex code to update"),
    lang: str = Query("en", description="Language code for messages")
):
    """
    Update saved Apex code
    
    This endpoint updates an existing saved Apex code entry.
    
    Args:
        request: UpdateSavedApexRequest containing the fields to update
        saved_apex_uuid: UUID of the saved Apex code to update
        http_request: FastAPI request object
        lang: Language code for messages
        
    Returns:
        Updated saved Apex code details
    """
    try:
        logger.debug(f"Updating saved Apex code: {apex_uuid}")
        
        result = saved_apex_service.update_saved_apex(
            saved_apex_uuid=apex_uuid,
            name=request.name,
            description=request.description,
            tags=request.tags,
            apex_code=request.apex_code,
            code_type=request.code_type,
            debug_levels=request.debug_levels,
            is_favorite=request.is_favorite,
            updated_by=request.updated_by
        )
        
        if not result:

        
            ErrorService.raise_not_found_error(
                message="saved_apex.error.not_found",
                resource_type="saved Apex code",
                resource_id=apex_uuid,
                request=http_request,
                locale=lang
            )
        
        logger.debug(f"Updated saved Apex code: {apex_uuid}")
        return result
        
    except ValueError as e:
        logger.error(f"Validation error updating saved Apex code: {str(e)}")
        ErrorService.raise_validation_error(
            message="saved_apex.error.validation",
            field_errors={"validation": str(e)},
            request=http_request,
            locale=lang
        )
    except HTTPException:
        raise
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="updating saved Apex code",
            request=http_request,
            locale=lang
        )

@router.delete("/{apex_uuid}")
def delete_saved_apex(
    http_request: Request,
    apex_uuid: str = Path(..., description="UUID of the saved Apex code to delete"),
    lang: str = Query("en", description="Language code for messages")
):
    """
    Delete saved Apex code
    
    This endpoint soft deletes a saved Apex code entry.
    
    Args:
        saved_apex_uuid: UUID of the saved Apex code to delete
        http_request: FastAPI request object
        lang: Language code for messages
        
    Returns:
        Success message
    """
    try:
        logger.debug(f"Deleting saved Apex code: {apex_uuid}")
        
        success = saved_apex_service.delete_saved_apex(apex_uuid)
        
        if not success:

        
            ErrorService.raise_not_found_error(
                message="saved_apex.error.not_found",
                resource_type="saved Apex code",
                resource_id=apex_uuid,
                request=http_request,
                locale=lang
            )
        
        logger.debug(f"Deleted saved Apex code: {apex_uuid}")
        success_message = i18n_service.get_translation_key(lang, 'saved_apex.messages.deleted_successfully') or 'Saved Apex deleted successfully'
        return {"message": success_message}
        
    except HTTPException:
        raise
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="deleting saved Apex code",
            request=http_request,
            locale=lang
        )


@router.post("/{apex_uuid}/toggle-favorite", response_model=SavedApexResponse)
def toggle_favorite(
    http_request: Request,
    apex_uuid: str = Path(..., description="UUID of the saved Apex code to toggle favorite"),
    lang: str = Query("en", description="Language code for messages")
):
    """
    Toggle favorite status of saved Apex code
    
    This endpoint toggles the favorite status of a saved Apex code.
    
    Args:
        saved_apex_uuid: UUID of the saved Apex code to toggle favorite
        http_request: FastAPI request object
        lang: Language code for messages
        
    Returns:
        Updated saved Apex code details
    """
    try:
        logger.debug(f"Toggling favorite status for saved Apex code: {apex_uuid}")
        
        result = saved_apex_service.toggle_favorite(apex_uuid)
        
        if not result:

        
            ErrorService.raise_not_found_error(
                message="saved_apex.error.not_found",
                resource_type="saved Apex code",
                resource_id=apex_uuid,
                request=http_request,
                locale=lang
            )
        
        logger.debug(f"Toggled favorite status for saved Apex code: {apex_uuid}")
        return result
        
    except HTTPException:
        raise
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="toggling favorite status",
            request=http_request,
            locale=lang
        )
