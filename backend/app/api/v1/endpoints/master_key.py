"""
DataPilot Backend - Master Key API Endpoints

This module provides comprehensive RESTful API endpoints for master key management in the DataPilot backend,
offering enterprise-grade secure storage, validation, and management of master encryption keys used for
protecting sensitive connection data and credentials with advanced security and compliance features.

The master key API provides:
- Enterprise-grade secure master key storage with hashing and salting
- Advanced master key validation and authentication
- Comprehensive key creation, update, and deletion operations
- Secure connection data encryption/decryption
- REST-compliant resource design and architecture
- Advanced security and compliance features

Core Master Key Features:

Key Management:
- Secure master key storage with hashing and salting
- Master key validation and authentication
- Key creation, update, and deletion operations
- Key strength validation and enforcement
- Key security and integrity checking
- Key audit and compliance support

Encryption/Decryption:
- Secure connection data encryption/decryption
- Advanced encryption key management
- Encryption performance optimization
- Encryption security and compliance
- Encryption audit and logging
- Encryption error handling and recovery

Security & Compliance:
- Advanced security controls and validation
- Access control and permission management
- Audit trail for all key operations
- Data privacy and GDPR compliance
- Security event logging and monitoring
- Compliance reporting and analytics

Performance & Optimization:
- High-performance key operations
- Intelligent key caching and optimization
- Memory usage optimization
- Performance monitoring and metrics
- Scalability and load balancing
- Resource usage optimization

REST API Endpoints:

Master Key Operations:
- GET /master-key - Get master key status and information
- POST /master-key - Create/validate master key with security validation
- PUT /master-key - Update master key with version control
- DELETE /master-key - Delete master key and connections with secure cleanup

Integration Points:
- Master key security service
- Connection management services
- Logging and monitoring systems
- Error handling and reporting
- Frontend user interface
- Security and compliance systems

Author: Bassem Elsodany
GitHub: https://github.com/bassem-elsodany
LinkedIn: https://www.linkedin.com/in/bassem-elsodany/
Version: 1.0.0
License: MIT License
"""

from fastapi import APIRouter, HTTPException, Depends, status, Request, Query
from pydantic import BaseModel, Field
from typing import Optional
from loguru import logger

from app.services.master_key_service import MasterKeyService
from app.services.error_service import ErrorService
from app.services.i18n_service import I18nService


def safe_isoformat(value) -> str:
    """
    Safely convert a datetime field to ISO format string.
    Handles both datetime objects and already formatted strings.
    """
    if not value:
        return ""
    
    # If it's already a string, return as is
    if isinstance(value, str):
        return value
    
    # If it's a datetime object, convert to ISO format
    if hasattr(value, 'isoformat'):
        return value.isoformat()
    
    # Fallback: convert to string
    return str(value)


router = APIRouter()

# Pydantic models for REST compliance
class MasterKeyCreateRequest(BaseModel):
    """Request to create/set a new master key"""
    master_key: str = Field(..., min_length=8, description="Master key must be at least 8 characters")

class MasterKeyUpdateRequest(BaseModel):
    """Request to update/reset an existing master key"""
    new_master_key: str = Field(..., min_length=8, description="New master key must be at least 8 characters")

class MasterKeyResponse(BaseModel):
    """Standard master key response"""
    master_key_uuid: str
    created_at: str
    updated_at: str

class MasterKeyStatusResponse(BaseModel):
    """Master key status response"""
    exists: bool
    is_session_active: bool
    active_key_uuid: Optional[str] = None

class MasterKeyCreateResponse(BaseModel):
    """Response for master key creation"""
    master_key_uuid: str
    is_first_time: bool
    created_at: str

class ErrorResponse(BaseModel):
    """Standard error response"""
    detail: str
    error_code: Optional[str] = None

class DeleteMasterKeyResponse(BaseModel):
    """Response for master key deletion"""
    success: bool
    message: str

# Global service instances
master_key_service = MasterKeyService()
i18n_service = I18nService()

# REST Compliant Endpoints

@router.get("/", response_model=MasterKeyStatusResponse, status_code=status.HTTP_200_OK)
def get_master_key_status(
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """GET /master-key - Get master key status and information"""
    try:
        logger.debug("Getting master key status")
        exists = master_key_service.is_master_key_exists()
        is_session_active = master_key_service.is_master_key_set()
        
        active_key_uuid = None
        if exists:
            active_key = master_key_service.get_active_master_key()
            if active_key:
                active_key_uuid = active_key["master_key_uuid"]
        
        return MasterKeyStatusResponse(
            exists=exists,
            is_session_active=is_session_active,
            active_key_uuid=active_key_uuid
        )
        
    except Exception as e:

        
        ErrorService.handle_generic_exception(
            exception=e,
            operation="retrieving master key status",
            request=http_request,
            locale=lang
        )

@router.post("/", response_model=MasterKeyCreateResponse, status_code=status.HTTP_201_CREATED)
def create_master_key(
    request: MasterKeyCreateRequest,
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """POST /master-key - Create/Set a new master key or validate existing one"""
    try:
        # Check if this is first time setup
        logger.debug("Creating master key with request {request}")
        is_first_time = not master_key_service.is_master_key_exists()
        
        if is_first_time:
            logger.debug("First time setup - creating new master key")
        else:
            logger.debug("Master key exists - validating provided key")
        
        # Set/validate the master key
        try:
            logger.debug("Setting master key")
            success = master_key_service.set_master_key(request.master_key)
            
            if not success:
                if is_first_time:
                    ErrorService.raise_validation_error(
                        message="master_key.errors.create_failed",
                        field_errors={"master_key": "master_key.errors.invalid_key"},
                        request=http_request,
                        locale=lang
                    )
                else:
                    ErrorService.raise_validation_error(
                        message="master_key.errors.invalid_key_provided",
                        field_errors={"master_key": "master_key.errors.key_validation_failed"},
                        request=http_request,
                        locale=lang
                    )
        except ValueError as e:
            # Handle validation errors from master_key_service
            if is_first_time:
                ErrorService.raise_validation_error(
                    message="master_key.errors.create_failed",
                    field_errors={"master_key": str(e)},
                    request=http_request,
                    locale=lang
                )
            else:
                # Map specific validation errors to enhanced error messages
                if "does not match" in str(e):
                    ErrorService.raise_validation_error(
                        message="master_key.errors.key_mismatch",
                        field_errors={"master_key": "master_key.errors.key_does_not_match"},
                        request=http_request,
                        locale=lang
                    )
                elif "at least 8 characters" in str(e):
                    ErrorService.raise_validation_error(
                        message="master_key.errors.key_too_short",
                        field_errors={"master_key": "master_key.errors.min_length_required"},
                        request=http_request,
                        locale=lang
                    )
                else:
                    ErrorService.raise_validation_error(
                        message="master_key.errors.invalid_key",
                        field_errors={"master_key": str(e)},
                        request=http_request,
                        locale=lang
                    )
        
        # Get the key info
        active_key = master_key_service.get_active_master_key()
        if not active_key:

            ErrorService.raise_internal_server_error(
                message="master_key.errors.cannot_retrieve_info",
                details="Failed to get active master key after creation",
                request=http_request,
                locale=lang
            )
        
        if is_first_time:
            logger.debug("New master key created successfully")
        else:
            logger.debug("Existing master key validated successfully")
        
        # Type assertion since we've already checked for None above
        assert active_key is not None, "Active key should not be None at this point"
            
        return MasterKeyCreateResponse(
            master_key_uuid=active_key.get("master_key_uuid", ""),
            is_first_time=is_first_time,
            created_at=safe_isoformat(active_key.get("created_at"))
        )
        
    except ValueError as e:

        
        ErrorService.raise_validation_error(
            message="master_key.errors.validation_failed",
            field_errors={"master_key": str(e)},
            request=http_request,
            locale=lang
        )
    except HTTPException:
        raise
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="processing master key",
            request=http_request,
            locale=lang
        )

@router.put("/", response_model=MasterKeyCreateResponse, status_code=status.HTTP_200_OK)
def update_master_key(
    request: MasterKeyUpdateRequest,
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """PUT /master-key - Update/Reset existing master key"""
    try:
        logger.debug("Updating master key with request {request}")
        # Check if master key exists
        exists = master_key_service.is_master_key_exists()
        if not exists:

            ErrorService.raise_not_found_error(
                message="Master key not found",
                resource_type="master_key",
                resource_id="active",
                request=http_request,
                locale=lang
            )
        
        # Reset the master key (this will delete all existing connections)
        logger.debug("Resetting master key")
        logger.warning("RESETTING MASTER KEY - This will permanently delete all saved connections")
        success = master_key_service.reset_master_key(request.new_master_key)
        
        if not success:

        
            ErrorService.raise_validation_error(
                message="master_key.errors.update_failed",
                field_errors={"new_master_key": "master_key.errors.invalid_or_weak_key"},
                request=http_request,
                locale=lang
            )
        
        # Get the updated key info
        active_key = master_key_service.get_active_master_key()
        if not active_key:

            ErrorService.raise_internal_server_error(
                message="master_key.errors.cannot_retrieve_info",
                details="Failed to get active master key after update",
                request=http_request,
                locale=lang
            )
        
        logger.debug("Master key reset successfully")
        logger.warning("🔄 Master key reset successfully - all connections deleted")
        
        # Type assertion since we've already checked for None above
        assert active_key is not None, "Active key should not be None at this point"
        
        return MasterKeyCreateResponse(
            master_key_uuid=active_key.get("master_key_uuid", ""),
            is_first_time=False,
            created_at=safe_isoformat(active_key.get("created_at"))
        )
        
    except ValueError as e:

        
        ErrorService.raise_validation_error(
            message="master_key.errors.invalid_new_key",
            field_errors={"new_master_key": str(e)},
            request=http_request,
            locale=lang
        )
    except HTTPException:
        raise
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="updating master key",
            request=http_request,
            locale=lang
        )

@router.delete("/", response_model=DeleteMasterKeyResponse, status_code=status.HTTP_200_OK)
def delete_master_key_and_connections(
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """DELETE /master-key - Hard delete master key and ALL related data (PERMANENT)
    
    This will permanently delete:
    - Master keys
    - Connections (encrypted with master key)
    - Saved queries (encrypted with master key)
    - Saved apex (encrypted with master key)
    - SObject favorites (related to connections)
    """
    try:
        logger.debug("Deleting master key and connections")
        # Check if master key exists
        exists = master_key_service.is_master_key_exists()
        
        if not exists:

        
            ErrorService.raise_not_found_error(
                message="Master key not found",
                resource_type="master_key",
                resource_id="active",
                request=http_request,
                locale=lang
            )
        
        # Hard delete master key and all connections (no validation needed)
        success = master_key_service.delete_master_key_and_connections()
        
        if not success:

        
            ErrorService.raise_validation_error(
                message="master_key.errors.delete_failed",
                field_errors={"master_key": "master_key.errors.invalid_key_for_deletion"},
                request=http_request,
                locale=lang
            )
        
        logger.debug("Master key and connections deleted successfully")
        logger.warning("MASTER KEY AND ALL RELATED DATA PERMANENTLY DELETED")
        success_message = i18n_service.get_translation_key(lang, 'master_key.messages.deleted_permanently') or 'Master key and all related data permanently deleted'
        return DeleteMasterKeyResponse(
            success=True,
            message=success_message
        )
        
    except ValueError as e:

        
        ErrorService.raise_validation_error(
            message="master_key.errors.invalid_key_for_deletion",
            field_errors={"master_key": str(e)},
            request=http_request,
            locale=lang
        )
    except HTTPException:
        raise
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="deleting master key",
            request=http_request,
            locale=lang
        )
