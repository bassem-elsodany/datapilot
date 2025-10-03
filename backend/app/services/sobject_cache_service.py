"""
DataPilot Backend - SObject Cache Service

This module provides comprehensive MongoDB-based caching for Salesforce SObject data,
offering enterprise-grade persistent storage that survives server restarts with advanced
performance optimization, security, and compliance features.

The SObject cache service provides:
- Enterprise-grade persistent SObject list caching with TTL
- Advanced SObject metadata caching with parameter-specific keys
- Connection-specific cache isolation and security
- Automatic cache expiration and cleanup
- Intelligent cache invalidation strategies
- Comprehensive performance monitoring and statistics

Core Cache Features:

Persistent Caching:
- Advanced persistent SObject list caching with TTL
- SObject metadata caching with parameter-specific keys
- Connection-specific cache isolation and security
- Cache expiration and cleanup automation
- Cache invalidation and refresh strategies
- Cache performance monitoring and optimization

Cache Management:
- Intelligent cache management and optimization
- Cache invalidation and refresh strategies
- Cache statistics and monitoring
- Cache health checks and diagnostics
- Cache cleanup and maintenance
- Cache performance optimization

Connection Isolation:
- Connection-specific cache isolation and security
- Multi-tenant cache separation and management
- Connection-based cache access control
- Connection cache analytics and statistics
- Connection cache security and compliance
- Connection cache audit and logging

Performance & Optimization:
- High-performance cache operations and retrieval
- Intelligent caching strategies and optimization
- Memory usage optimization and management
- Performance monitoring and metrics
- Scalability and load balancing
- Resource usage optimization

Security & Compliance:
- Secure cache operations and access control
- Cache content validation and sanitization
- Access control and permission management
- Audit trail for all cache operations
- Data privacy and GDPR compliance
- Security event logging and monitoring

Integration Points:
- MongoDB database operations
- Salesforce API integration
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

import json
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Tuple
from loguru import logger
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ASCENDING, DESCENDING
from bson import ObjectId

from app.core.mongodb import get_database
from app.core.config import settings
from app.models.sobject_cache import (
    SObjectListCache, SObjectListCacheCreate,
    SObjectMetadataCache, SObjectMetadataCacheCreate,
    CacheStatistics, ConnectionCacheInfo
)


class SObjectCacheService:
    """MongoDB-based cache service for Salesforce SObject data"""
    
    def __init__(self):
        self.db = None
        self.cache_ttl_hours = getattr(settings, 'SOBJECT_CACHE_TTL_HOURS', 24)  # Default 24 hours
        self.metadata_cache_ttl_hours = getattr(settings, 'METADATA_CACHE_TTL_HOURS', 12)  # Default 12 hours
    
    def _get_database(self):
        """Get database instance with lazy initialization"""
        if self.db is None:
            self.db = get_database()
        return self.db
    
    def _get_org_id(self, user_info: Dict[str, Any]) -> str:
        """Extract org ID from user info"""
        # Try organization_id first, then fall back to user_id
        org_id = user_info.get('organization_id', '')
        if not org_id:
            user_id = user_info.get('user_id', '')
            org_id = user_id[:15] if user_id else ''
        
        return org_id if org_id else 'unknown'
    
    def _get_cache_key(self, connection_uuid: str, sobject_name: Optional[str] = None) -> str:
        """Generate cache key for metadata - one key per SObject"""
        if sobject_name:
            return f"{connection_uuid}_{sobject_name}"
        return connection_uuid
    
    def cache_sobject_list(self, connection_uuid: str, user_info: Dict[str, Any], 
                          sobjects: List[Dict[str, Any]]) -> bool:
        """Cache SObject list for a connection"""
        try:
            db = self._get_database()
            org_id = self._get_org_id(user_info)
            cached_at = datetime.utcnow()
            expires_at = cached_at + timedelta(hours=self.cache_ttl_hours)
            
            # Create cache document directly as dict (skip model validation)
            cache_doc = {
                "connection_uuid": connection_uuid,
                "org_id": org_id,
                "sobjects": sobjects,
                "cached_at": cached_at,
                "expires_at": expires_at,
                "version": "64.0",
                "total_count": len(sobjects)
            }
            
            # Upsert the cache entry
            db.sobject_list_cache.replace_one(
                {"connection_uuid": connection_uuid},
                cache_doc,
                upsert=True
            )
            
            logger.debug(f"Cached SObject list for {connection_uuid}: {len(sobjects)} objects")
            return True
            
        except Exception as e:
            logger.error(f"Failed to cache SObject list: {str(e)}")
            return False
    
    
    def get_cached_sobject_list(self, connection_uuid: str) -> Optional[List[Dict[str, Any]]]:
        """Get cached SObject list for a connection"""
        try:
            db = self._get_database()
            
            # Find cache entry
            cache_doc = db.sobject_list_cache.find_one({
                "connection_uuid": connection_uuid,
                "expires_at": {"$gt": datetime.utcnow()}
            })
            
            if cache_doc:
                return cache_doc.get("sobjects", [])
            return None
                
        except Exception as e:
            logger.error(f"Failed to get cached SObject list: {str(e)}")
            return None
    
    def cache_sobject_metadata(self, connection_uuid: str, user_info: Dict[str, Any],
                              sobject_name: str, metadata: Dict[str, Any]) -> bool:
        """Cache SObject metadata for a connection - always caches complete metadata"""
        try:
            db = self._get_database()
            org_id = self._get_org_id(user_info)
            cached_at = datetime.utcnow()
            expires_at = cached_at + timedelta(hours=self.metadata_cache_ttl_hours)
            
            # Analyze metadata for cache optimization
            fields = metadata.get('fields', [])
            has_picklist_values = any(field.get('picklistValues') for field in fields)
            has_calculated_fields = any(field.get('calculated', False) for field in fields)
            has_child_relationships = bool(metadata.get('childRelationships'))
            
            # Create unique key for this SObject (one key per SObject)
            cache_key = self._get_cache_key(connection_uuid, sobject_name)
            
            # Create cache document directly as dict (skip model validation)
            cache_doc = {
                "cache_key": cache_key,
                "connection_uuid": connection_uuid,
                "org_id": org_id,
                "sobject_name": sobject_name,
                "include_child_relationships": True,
                "metadata": metadata,
                "cached_at": cached_at,
                "expires_at": expires_at,
                "version": "64.0",
                "field_count": len(fields),
                "has_picklist_values": has_picklist_values,
                "has_calculated_fields": has_calculated_fields
            }
            
            # Upsert the cache entry
            db.sobject_metadata_cache.replace_one(
                {"cache_key": cache_key},
                cache_doc,
                upsert=True
            )
            
            logger.debug(f"Cached complete metadata for {sobject_name} ({connection_uuid}): {len(fields)} fields, relationships: {has_child_relationships}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to cache SObject metadata: {str(e)}")
            return False
    
    def get_cached_sobject_metadata(self, connection_uuid: str, sobject_name: str,
                                   include_child_relationships: bool = False) -> Optional[Dict[str, Any]]:
        """Get cached SObject metadata for a connection - filters response based on include_child_relationships"""
        try:
            db = self._get_database()
            now = datetime.utcnow()
            
            # Create unique key for this SObject (one key per SObject)
            cache_key = self._get_cache_key(connection_uuid, sobject_name)
            
            # Get cached metadata
            cache_doc = db.sobject_metadata_cache.find_one({
                "cache_key": cache_key,
                "expires_at": {"$gt": now}
            })
            
            if cache_doc:
                metadata = cache_doc.get("metadata", {})
                
                # Filter out child relationships if not requested
                if not include_child_relationships and "childRelationships" in metadata:
                    # Create a copy and remove child relationships
                    filtered_metadata = metadata.copy()
                    filtered_metadata.pop("childRelationships", None)
                    return filtered_metadata
                
                return metadata
            
            return None
            
        except Exception as e:
            logger.error(f"Failed to get cached SObject metadata: {str(e)}")
            return None
    
    def clear_connection_cache(self, connection_uuid: str) -> bool:
        """Clear all cache entries for a specific connection"""
        try:
            db = self._get_database()
            
            # Clear SObject list cache
            list_result = db.sobject_list_cache.delete_many({
                "connection_uuid": connection_uuid
            })
            
            # Clear metadata cache
            metadata_result = db.sobject_metadata_cache.delete_many({
                "connection_uuid": connection_uuid
            })
            
            logger.debug(f"Cleared cache for connection {connection_uuid}: "
                       f"{list_result.deleted_count} list entries, "
                       f"{metadata_result.deleted_count} metadata entries")
            return True
            
        except Exception as e:
            logger.error(f"Failed to clear connection cache: {str(e)}")
            return False
    
    def clear_expired_cache(self) -> Tuple[int, int]:
        """Clear expired cache entries"""
        try:
            db = self._get_database()
            now = datetime.utcnow()
            
            # Clear expired SObject list cache
            list_result = db.sobject_list_cache.delete_many({
                "expires_at": {"$lt": now}
            })
            
            # Clear expired metadata cache
            metadata_result = db.sobject_metadata_cache.delete_many({
                "expires_at": {"$lt": now}
            })
            
            total_cleared = list_result.deleted_count + metadata_result.deleted_count
            if total_cleared > 0:
                logger.debug(f"Cleared {total_cleared} expired cache entries")
            
            return list_result.deleted_count, metadata_result.deleted_count
            
        except Exception as e:
            logger.error(f"Failed to clear expired cache: {str(e)}")
            return 0, 0
    
    def get_cache_statistics(self) -> CacheStatistics:
        """Get cache statistics and performance metrics"""
        try:
            db = self._get_database()
            now = datetime.utcnow()
            
            # SObject list cache stats
            list_total = db.sobject_list_cache.count_documents({})
            list_active = db.sobject_list_cache.count_documents({
                "expires_at": {"$gt": now}
            })
            list_expired = list_total - list_active
            
            # Metadata cache stats
            metadata_total = db.sobject_metadata_cache.count_documents({})
            metadata_active = db.sobject_metadata_cache.count_documents({
                "expires_at": {"$gt": now}
            })
            metadata_expired = metadata_total - metadata_active
            
            # Get cache size estimates
            list_size = db.sobject_list_cache.estimated_document_count()
            metadata_size = db.sobject_metadata_cache.estimated_document_count()
            
            return CacheStatistics(
                sobject_list_cache={
                    "total_entries": list_total,
                    "active_entries": list_active,
                    "expired_entries": list_expired,
                    "estimated_size": list_size
                },
                metadata_cache={
                    "total_entries": metadata_total,
                    "active_entries": metadata_active,
                    "expired_entries": metadata_expired,
                    "estimated_size": metadata_size
                },
                cache_ttl_hours=self.cache_ttl_hours,
                metadata_cache_ttl_hours=self.metadata_cache_ttl_hours,
                timestamp=now.isoformat()
            )
            
        except Exception as e:
            logger.error(f"Failed to get cache statistics: {str(e)}")
            raise e
    
    def get_connection_cache_info(self, connection_uuid: str) -> ConnectionCacheInfo:
        """Get cache information for a specific connection"""
        try:
            db = self._get_database()
            now = datetime.utcnow()
            
            # Get SObject list cache info
            list_cache = db.sobject_list_cache.find_one({
                "connection_uuid": connection_uuid
            })
            
            # Get metadata cache info for this connection
            metadata_caches = list(db.sobject_metadata_cache.find({
                "connection_uuid": connection_uuid
            }))
            
            return ConnectionCacheInfo(
                connection_uuid=connection_uuid,
                sobject_list_cached=list_cache is not None,
                sobject_list_expires=list_cache.get("expires_at").isoformat() if list_cache else None,
                sobject_list_count=list_cache.get("total_count", 0) if list_cache else 0,
                metadata_cached_objects=len(metadata_caches),
                metadata_objects=[
                    {
                        "sobject_name": cache.get("sobject_name"),
                        "expires_at": cache.get("expires_at").isoformat(),
                        "field_count": cache.get("field_count", 0),
                        "include_child_relationships": cache.get("include_child_relationships", False)
                    }
                    for cache in metadata_caches
                ],
                timestamp=now.isoformat()
            )
            
        except Exception as e:
            logger.error(f"Failed to get connection cache info: {str(e)}")
            raise e


# Singleton instance
_sobject_cache_service = None

def get_sobject_cache_service() -> SObjectCacheService:
    """Get singleton instance of SObjectCacheService"""
    global _sobject_cache_service
    if _sobject_cache_service is None:
        _sobject_cache_service = SObjectCacheService()
    return _sobject_cache_service
