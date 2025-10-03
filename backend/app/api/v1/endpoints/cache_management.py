"""
DataPilot Backend - SObject Cache Management API Endpoints

This module provides comprehensive RESTful API endpoints for managing SObject cache data,
including SObject lists, metadata, and cache operations with enterprise-grade performance
optimization, security, and compliance features.

The cache management API provides:
- Enterprise-grade SObject list retrieval and management
- Advanced SObject metadata caching and retrieval
- Connection-specific cache operations with isolation
- Master key authentication for all operations
- Complete REST compliance with proper HTTP methods
- Comprehensive internationalization support
- Production-ready error handling and validation

Core Cache Features:

SObject Management:
- Complete SObject list retrieval and management
- Advanced SObject metadata caching and retrieval
- Connection-specific cache operations and isolation
- SObject schema caching and optimization
- Dynamic SObject operations and updates
- SObject relationship mapping and navigation

Cache Operations:
- Intelligent cache management and optimization
- Cache invalidation and refresh strategies
- Connection-specific cache isolation
- Cache statistics and monitoring
- Cache health checks and diagnostics
- Cache cleanup and maintenance

Performance & Optimization:
- High-performance cache operations
- Intelligent caching strategies
- Memory usage optimization
- Performance monitoring and metrics
- Scalability and load balancing
- Resource usage optimization

Security & Compliance:
- Master key-based authentication
- Secure cache operations and access
- Data privacy and GDPR compliance
- Audit trail for all cache operations
- Security event logging and monitoring
- Compliance reporting and analytics

REST API Endpoints:

SObject Management:
- GET /sobjects?connection_uuid=xxx - Get full SObject list for connection
- GET /sobjects/{sobjectname}?connection_uuid=xxx - Get specific SObject metadata
- DELETE /sobjects?connection_uuid=xxx - Flush all SObjects and metadata for connection

Cache Statistics (Admin):
- GET /cache/statistics - Get comprehensive cache statistics
- GET /cache/health - Get cache health status
- DELETE /cache/expired - Clear all expired cache entries

Integration Points:
- Salesforce API integration
- MongoDB cache storage
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

from typing import Dict, Any, Optional, Annotated
from fastapi import APIRouter, HTTPException, Query, Header, Request, status
from pydantic import BaseModel, Field
from loguru import logger

from app.services.sobject_cache_service import get_sobject_cache_service
from app.services.i18n_service import I18nService
from app.services.master_key_service import MasterKeyService
from app.services.error_service import ErrorService
from app.services.salesforce_service import SalesforceService
from app.models.sobject_cache import CacheStatistics, ConnectionCacheInfo, SObjectInfo, SObjectMetadata

router = APIRouter()

# Global service instances
master_key_service = MasterKeyService()
salesforce_service = SalesforceService()
i18n_service = I18nService()

# Pydantic models for REST compliance
class SObjectListResponse(BaseModel):
    """Response for SObject list"""
    success: bool
    data: Dict[str, Any]
    message: str

class SObjectMetadataResponse(BaseModel):
    """Response for SObject metadata"""
    success: bool
    data: Dict[str, Any]
    message: str

class SObjectFlushResponse(BaseModel):
    """Response for SObject cache flush operation"""
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None

# Admin/Statistics models
class CacheStatisticsResponse(BaseModel):
    """Response for cache statistics"""
    success: bool
    data: Dict[str, Any]
    message: str

class CacheHealthResponse(BaseModel):
    """Response for cache health status"""
    success: bool
    data: Dict[str, Any]
    message: str

class ExpiredCacheClearResponse(BaseModel):
    """Response for clearing expired cache entries"""
    success: bool
    data: Dict[str, Any]
    message: str


# ========================================
# SOBJECT CACHE ENDPOINTS
# ========================================

@router.get("/sobjects", response_model=SObjectListResponse)
def get_sobject_list(
    x_master_key: Annotated[str, Header(alias="X-Master-Key", min_length=8)],
    http_request: Request,
    connection_uuid: str = Query(..., description="Connection UUID"),
    lang: str = Query("en", description="Language code for messages")
):
    """
    GET /sobjects?connection_uuid=xxx - Get full SObject list for connection.
    
    Args:
        connection_uuid: The UUID of the connection to get SObjects for
        
    Returns:
        SObjectListResponse containing the full SObject list
    """
    try:
        # Validate master key
        master_key_valid = master_key_service.set_master_key(x_master_key)
        if not master_key_valid:
            ErrorService.raise_authentication_error(
                message="sobjects.errors.invalid_master_key",
                auth_type="master_key",
                request=http_request,
                locale=lang
            )
        
        # Get SObject list from cache or Salesforce
        cache_service = get_sobject_cache_service()
        sobjects = cache_service.get_cached_sobject_list(connection_uuid)
        
        if sobjects is None:
            # Cache miss - get from Salesforce and cache it
            user_info = salesforce_service.get_user_info(connection_uuid)
            sobjects = salesforce_service.get_sobject_list(connection_uuid)
            
            # Cache the result
            cache_service.cache_sobject_list(connection_uuid, user_info, sobjects)
        
        logger.debug(f"Retrieved {len(sobjects)} SObjects for connection {connection_uuid}")
        return SObjectListResponse(
            success=True,
            data={
                "connection_uuid": connection_uuid,
                "sobjects": sobjects,
                "total_count": len(sobjects)
            },
            message=i18n_service.get_translation_key(lang, 'sobject_cache.messages.retrieved_sobjects_successfully') or f'Retrieved {len(sobjects)} SObjects successfully'
        )
        
    except HTTPException:
        raise
    except Exception as e:
        ErrorService.handle_generic_exception(
            exception=e,
            operation="getting SObject list",
            request=http_request,
            locale=lang
        )


@router.get("/sobjects/{sobject_name}", response_model=SObjectMetadataResponse)
def get_sobject_metadata(
    sobject_name: str,
    x_master_key: Annotated[str, Header(alias="X-Master-Key", min_length=8)],
    http_request: Request,
    connection_uuid: str = Query(..., description="Connection UUID"),
    include_child_relationships: bool = Query(False, description="Include child relationships"),
    lang: str = Query("en", description="Language code for messages")
):
    """
    GET /sobjects/{sobjectname}?connection_uuid=xxx - Get specific SObject metadata.
    
    Args:
        sobject_name: Name of the SObject (e.g., Account, Contact)
        connection_uuid: The UUID of the connection
        include_child_relationships: Whether to include child relationships
        
    Returns:
        SObjectMetadataResponse containing the SObject metadata
    """
    try:
        # Validate master key
        master_key_valid = master_key_service.set_master_key(x_master_key)
        if not master_key_valid:
            ErrorService.raise_authentication_error(
                message="sobjects.errors.invalid_master_key",
                auth_type="master_key",
                request=http_request,
                locale=lang
            )
        
        # Get SObject metadata from cache or Salesforce
        cache_service = get_sobject_cache_service()
        metadata = cache_service.get_cached_sobject_metadata(
            connection_uuid, sobject_name, include_child_relationships
        )
        
        if metadata is None:
            # Cache miss - get from Salesforce and cache it
            user_info = salesforce_service.get_user_info(connection_uuid)
            metadata = salesforce_service.describe_sobject(sobject_name, connection_uuid, include_child_relationships)
            
            # Note: describe_sobject now handles caching internally with complete metadata
        
        field_count = len(metadata.get('fields', []))
        logger.debug(f"Retrieved metadata for {sobject_name} ({connection_uuid}): {field_count} fields")
        return SObjectMetadataResponse(
            success=True,
            data={
                "connection_uuid": connection_uuid,
                "sobject_name": sobject_name,
                "include_child_relationships": include_child_relationships,
                "metadata": metadata,
                "field_count": field_count
            },
            message=i18n_service.get_translation_key(lang, 'sobject_cache.messages.retrieved_metadata_successfully') or f'Retrieved metadata for {sobject_name} successfully'
        )
        
    except HTTPException:
        raise
    except Exception as e:
        ErrorService.handle_generic_exception(
            exception=e,
            operation="getting SObject metadata",
            request=http_request,
            locale=lang
        )


@router.delete("/sobjects", response_model=SObjectFlushResponse, status_code=status.HTTP_200_OK)
def flush_sobject_cache(
    x_master_key: Annotated[str, Header(alias="X-Master-Key", min_length=8)],
    http_request: Request,
    connection_uuid: str = Query(..., description="Connection UUID"),
    lang: str = Query("en", description="Language code for messages")
):
    """
    DELETE /sobjects?connection_uuid=xxx - Flush all SObjects and metadata for connection.
    
    Args:
        connection_uuid: The UUID of the connection to flush cache for
        
    Returns:
        SObjectFlushResponse containing operation result
    """
    try:
        # Validate master key
        master_key_valid = master_key_service.set_master_key(x_master_key)
        if not master_key_valid:
            ErrorService.raise_authentication_error(
                message="sobjects.errors.invalid_master_key",
                auth_type="master_key",
                request=http_request,
                locale=lang
            )
        
        cache_service = get_sobject_cache_service()
        success = cache_service.clear_connection_cache(connection_uuid)
        
        if not success:
        
            ErrorService.raise_internal_server_error(
                message="sobjects.errors.flush_failed",
                details="Failed to flush SObject cache",
                request=http_request,
                locale=lang
            )
        
        logger.debug(f"Flushed SObject cache for connection {connection_uuid}")
        return SObjectFlushResponse(
            success=True,
            message=f"SObject cache flushed successfully for connection {connection_uuid}"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        ErrorService.handle_generic_exception(
            exception=e,
            operation="flushing SObject cache",
            request=http_request,
            locale=lang
        )


# ========================================
# ADMIN/CACHE STATISTICS ENDPOINTS
# ========================================

@router.get("/statistics", response_model=CacheStatisticsResponse)
def get_cache_statistics(
    x_master_key: Annotated[str, Header(alias="X-Master-Key", min_length=8)],
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """
    GET /cache/statistics - Get comprehensive cache statistics and performance metrics.
    
    Returns:
        CacheStatisticsResponse containing cache statistics, performance metrics, and configuration
    """
    try:
        # Validate master key
        master_key_valid = master_key_service.set_master_key(x_master_key)
        if not master_key_valid:
            ErrorService.raise_authentication_error(
                message="cache.errors.invalid_master_key",
                auth_type="master_key",
                request=http_request,
                locale=lang
            )
        
        cache_service = get_sobject_cache_service()
        stats = cache_service.get_cache_statistics()
        
        logger.debug("Retrieved cache statistics")
        return CacheStatisticsResponse(
            success=True,
            data=stats.model_dump(),
            message=i18n_service.get_translation_key(lang, 'sobject_cache.messages.statistics_retrieved_successfully') or 'Statistics retrieved successfully'
        )
        
    except HTTPException:
        raise
    except Exception as e:
        ErrorService.handle_generic_exception(
            exception=e,
            operation="getting cache statistics",
            request=http_request,
            locale=lang
        )




@router.delete("/expired", response_model=ExpiredCacheClearResponse, status_code=status.HTTP_200_OK)
def clear_expired_cache(
    x_master_key: Annotated[str, Header(alias="X-Master-Key", min_length=8)],
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """
    DELETE /cache/expired - Clear all expired cache entries from MongoDB.
    
    Returns:
        ExpiredCacheClearResponse containing operation result and number of entries cleared
    """
    try:
        # Validate master key
        master_key_valid = master_key_service.set_master_key(x_master_key)
        if not master_key_valid:
            ErrorService.raise_authentication_error(
                message="cache.errors.invalid_master_key",
                auth_type="master_key",
                request=http_request,
                locale=lang
            )
        
        cache_service = get_sobject_cache_service()
        list_cleared, metadata_cleared = cache_service.clear_expired_cache()
        total_cleared = list_cleared + metadata_cleared
        
        logger.debug(f"Cleared {total_cleared} expired cache entries")
        return ExpiredCacheClearResponse(
            success=True,
            data={
                "list_entries_cleared": list_cleared,
                "metadata_entries_cleared": metadata_cleared,
                "total_entries_cleared": total_cleared
            },
            message=f"Cleared {total_cleared} expired cache entries"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        ErrorService.handle_generic_exception(
            exception=e,
            operation="clearing expired cache",
            request=http_request,
            locale=lang
        )


@router.get("/health", response_model=CacheHealthResponse)
def get_cache_health(
    x_master_key: Annotated[str, Header(alias="X-Master-Key", min_length=8)],
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """
    GET /cache/health - Get cache health status and basic metrics.
    
    Returns:
        CacheHealthResponse containing cache health information
    """
    try:
        # Validate master key
        master_key_valid = master_key_service.set_master_key(x_master_key)
        if not master_key_valid:
            ErrorService.raise_authentication_error(
                message="cache.errors.invalid_master_key",
                auth_type="master_key",
                request=http_request,
                locale=lang
            )
        
        cache_service = get_sobject_cache_service()
        stats = cache_service.get_cache_statistics()
        
        # Calculate health metrics
        stats_data = stats.model_dump()
        total_entries = stats_data.get("sobject_list_cache", {}).get("total_entries", 0) + \
                       stats_data.get("metadata_cache", {}).get("total_entries", 0)
        active_entries = stats_data.get("sobject_list_cache", {}).get("active_entries", 0) + \
                        stats_data.get("metadata_cache", {}).get("active_entries", 0)
        expired_entries = stats_data.get("sobject_list_cache", {}).get("expired_entries", 0) + \
                         stats_data.get("metadata_cache", {}).get("expired_entries", 0)
        
        # Determine health status
        health_status = "healthy"
        if expired_entries > total_entries * 0.5:  # More than 50% expired
            health_status = "needs_cleanup"
        elif total_entries == 0:
            health_status = "empty"
        
        health_info = {
            "status": health_status,
            "total_entries": total_entries,
            "active_entries": active_entries,
            "expired_entries": expired_entries,
            "cache_ttl_hours": stats_data.get("cache_ttl_hours", 24),
            "metadata_cache_ttl_hours": stats_data.get("metadata_cache_ttl_hours", 12),
            "timestamp": stats_data.get("timestamp")
        }
        
        logger.debug(f"Cache health check: {health_status}")
        return CacheHealthResponse(
            success=True,
            data=health_info,
            message=f"Cache health status: {health_status}"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        ErrorService.handle_generic_exception(
            exception=e,
            operation="getting cache health",
            request=http_request,
            locale=lang
        )


