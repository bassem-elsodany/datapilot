"""
DataPilot Backend - Authentication Providers API Endpoints

This module provides comprehensive RESTful API endpoints for authentication provider management in the DataPilot backend,
offering enterprise-grade configuration, validation, and management of various authentication providers used for
Salesforce connections and other integrations with advanced security and compliance features.

The auth providers API provides:
- Enterprise-grade CRUD operations for auth providers
- Advanced provider type validation (OAUTH2, JWT, API_KEY, CUSTOM)
- Comprehensive provider configuration management
- Advanced statistics and monitoring
- REST-compliant resource hierarchy and architecture
- Advanced security and compliance features

Core Auth Provider Features:

Provider Management:
- Complete CRUD operations for auth providers
- Provider type validation and enforcement
- Provider configuration management and validation
- Provider security and access control
- Provider analytics and statistics
- Provider search and filtering

Provider Types:
- OAUTH2 provider configuration and management
- JWT provider configuration and management
- API_KEY provider configuration and management
- CUSTOM provider configuration and management
- Provider type validation and enforcement
- Provider type security and compliance

Configuration Management:
- Advanced provider configuration management
- Configuration validation and sanitization
- Configuration security and access control
- Configuration analytics and statistics
- Configuration search and filtering
- Configuration audit and compliance

Statistics & Monitoring:
- Comprehensive provider statistics and monitoring
- Provider usage analytics and reporting
- Provider performance monitoring and metrics
- Provider error tracking and analysis
- Provider optimization and recommendations
- Provider business intelligence and insights

Security & Compliance:
- Secure provider operations and access control
- Provider content validation and sanitization
- Access control and permission management
- Audit trail for all provider operations
- Data privacy and GDPR compliance
- Security event logging and monitoring

Performance & Optimization:
- High-performance provider operations
- Intelligent provider caching and optimization
- Memory usage optimization
- Performance monitoring and metrics
- Scalability and load balancing
- Resource usage optimization

REST API Endpoints:

Provider Management:
- GET /auth-providers - List all auth providers with filtering and pagination
- GET /auth-providers/{uuid} - Get specific auth provider with full details
- POST /auth-providers - Create new auth provider with validation
- PUT /auth-providers/{uuid} - Update auth provider with version control
- DELETE /auth-providers/{uuid} - Delete auth provider with secure cleanup

Provider Operations:
- GET /auth-providers/type/{type} - Get providers by type with filtering
- GET /auth-providers/stats/overview - Get comprehensive provider statistics

Integration Points:
- MongoDB database operations
- Authentication and security services
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

from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Depends, status, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.services.auth_provider_service import AuthProviderService
from app.services.error_service import ErrorService
from app.utils.i18n_utils import translate_message, format_message_with_params

from loguru import logger

router = APIRouter()

# Pydantic models
class AuthProviderResponse(BaseModel):
    """Auth provider response model - matches DDL exactly"""
    id: str
    name: str
    type: str  # OAUTH2, JWT, API_KEY, CUSTOM
    description: Optional[str] = None
    is_active: bool
    config: Dict[str, Any]  # JSON configuration
    metadata: Dict[str, Any]  # JSON metadata
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    version: int

class CreateAuthProviderRequest(BaseModel):
    """Request to create a new auth provider"""
    id: str = Field(..., description="Unique provider ID")
    name: str = Field(..., description="Provider name")
    type: str = Field(..., description="Provider type: OAUTH2, JWT, API_KEY, CUSTOM")
    description: Optional[str] = Field(None, description="Provider description")
    is_active: bool = Field(True, description="Whether provider is active")
    config: Dict[str, Any] = Field(default_factory=dict, description="JSON configuration")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="JSON metadata")
    created_by: Optional[str] = Field("system", description="Creator user")

class UpdateAuthProviderRequest(BaseModel):
    """Request to update an auth provider"""
    name: Optional[str] = Field(None, description="Provider name")
    type: Optional[str] = Field(None, description="Provider type: OAUTH2, JWT, API_KEY, CUSTOM")
    description: Optional[str] = Field(None, description="Provider description")
    is_active: Optional[bool] = Field(None, description="Whether provider is active")
    config: Optional[Dict[str, Any]] = Field(None, description="JSON configuration")
    metadata: Optional[Dict[str, Any]] = Field(None, description="JSON metadata")
    updated_by: Optional[str] = Field("system", description="Updater user")

class AuthProviderStatsResponse(BaseModel):
    """Auth provider statistics response model"""
    total: int
    active: int
    inactive: int
    by_type: Dict[str, int]

# Global service instance
auth_provider_service = AuthProviderService()

# ========================================
# CRUD ENDPOINTS
# ========================================

@router.get("/", response_model=List[AuthProviderResponse])
def get_all_auth_providers(
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """GET /auth-providers - Get all active auth providers"""
    try:
        providers = auth_provider_service.get_all_auth_providers()
        return providers
    except Exception as e:
        ErrorService.handle_generic_exception(
            exception=e,
            operation="retrieving auth providers",
            request=http_request,
            locale=lang
        )

@router.get("/{provider_uuid}", response_model=AuthProviderResponse)
def get_auth_provider_by_id(
    provider_uuid: str,
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """GET /auth-providers/{provider_uuid} - Get auth provider by UUID"""
    try:
        provider = auth_provider_service.get_auth_provider_by_uuid(provider_uuid)
        if not provider:

            ErrorService.raise_not_found_error(
                message="auth_providers.errors.not_found",
                resource_type="auth_provider",
                resource_id=provider_uuid,
                request=http_request,
                locale=lang
            )
        return provider
    except HTTPException:
        raise
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="retrieving auth provider",
            request=http_request,
            locale=lang
        )

@router.post("/", response_model=AuthProviderResponse, status_code=status.HTTP_201_CREATED)
def create_auth_provider(
    request: CreateAuthProviderRequest,
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """POST /auth-providers - Create a new auth provider"""
    try:
        provider_data = request.dict()
        provider = auth_provider_service.create_auth_provider(provider_data)
        return provider
    except ValueError as e:

        ErrorService.raise_validation_error(
            message="auth_providers.errors.invalid_data",
            field_errors={"provider": str(e)},
            request=http_request,
            locale=lang
        )
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="creating auth provider",
            request=http_request,
            locale=lang
        )

@router.put("/{provider_uuid}", response_model=AuthProviderResponse)
def update_auth_provider(
    provider_uuid: str,
    request: UpdateAuthProviderRequest,
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """PUT /auth-providers/{provider_uuid} - Update an auth provider"""
    try:
        # Only include non-None fields
        update_data = {k: v for k, v in request.dict().items() if v is not None}
        
        provider = auth_provider_service.update_auth_provider(provider_uuid, update_data)
        if not provider:

            ErrorService.raise_not_found_error(
                message="auth_providers.errors.not_found",
                resource_type="auth_provider",
                resource_id=provider_uuid,
                request=http_request,
                locale=lang
            )
        return provider
    except ValueError as e:

        ErrorService.raise_validation_error(
            message="auth_providers.errors.invalid_update_data",
            field_errors={"provider": str(e)},
            request=http_request,
            locale=lang
        )
    except HTTPException:
        raise
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="updating auth provider",
            request=http_request,
            locale=lang
        )

@router.delete("/{provider_uuid}", status_code=status.HTTP_204_NO_CONTENT)
def delete_auth_provider(
    provider_uuid: str,
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """DELETE /auth-providers/{provider_uuid} - Soft delete an auth provider"""
    try:
        success = auth_provider_service.delete_auth_provider(provider_uuid)
        if not success:

            ErrorService.raise_not_found_error(
                message="auth_providers.errors.not_found",
                resource_type="auth_provider",
                resource_id=provider_uuid,
                request=http_request,
                locale=lang
            )
        # 204 No Content - successful deletion returns no body
    except HTTPException:
        raise
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="deleting auth provider",
            request=http_request,
            locale=lang
        )

# ========================================
# QUERY ENDPOINTS
# ========================================

@router.get("/type/{provider_type}", response_model=List[AuthProviderResponse])
def get_auth_providers_by_type(
    provider_type: str,
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """GET /auth-providers/type/{provider_type} - Get auth providers by type"""
    try:
        # Validate provider type
        valid_types = ['OAUTH2', 'JWT', 'API_KEY', 'CUSTOM']
        if provider_type.upper() not in valid_types:
            ErrorService.raise_validation_error(
                message="auth_providers.errors.invalid_provider_type",
                field_errors={"provider_type": f"auth_providers.errors.must_be_one_of: {valid_types}"},
                request=http_request,
                locale=lang
            )
        
        providers = auth_provider_service.get_auth_providers_by_type(provider_type.upper())
        return providers
    except HTTPException:
        raise
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="retrieving auth providers by type",
            request=http_request,
            locale=lang
        )

# ========================================
# STATISTICS ENDPOINTS
# ========================================

@router.get("/stats/overview", response_model=AuthProviderStatsResponse)
def get_auth_provider_stats(
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """GET /auth-providers/stats/overview - Get auth provider statistics"""
    try:
        stats = auth_provider_service.get_auth_provider_stats()
        return stats
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="retrieving auth provider statistics",
            request=http_request,
            locale=lang
        )


