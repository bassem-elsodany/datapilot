"""
Auth Provider Service - MongoDB equivalent

This module provides business logic for managing authentication providers in the DataPilot backend.
It handles CRUD operations for different authentication methods including OAuth2, JWT, API Key,
and custom authentication providers using MongoDB instead of SQLAlchemy.

Features:
- Complete CRUD operations for authentication providers
- Support for multiple provider types (OAUTH2, JWT, API_KEY, CUSTOM)
- JSON configuration and metadata management
- Provider activation/deactivation
- Type-specific provider operations
- Configuration validation and parsing
- Statistics and reporting functionality
- Provider metadata management

Operations:
- Retrieve all providers with filtering and sorting
- Get providers by ID or type
- Create, update, and delete providers
- Provider configuration management
- Type-specific provider handling
- Statistics generation and reporting
- Configuration validation and parsing

Author: Bassem Elsodany
GitHub: https://github.com/bassem-elsodany
LinkedIn: https://www.linkedin.com/in/bassem-elsodany/
Version: 1.0.0
License: MIT License
"""

import json
import uuid
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from loguru import logger

from app.models.auth_provider import AuthProvider, AuthProviderCreate
from app.core.mongodb import get_database


class AuthProviderService:
    """Service for handling authentication provider operations using MongoDB"""
    
    def __init__(self):
        pass
        
    def get_all_auth_providers(self) -> List[Dict[str, Any]]:
        """Get all auth providers (active and inactive)"""
        try:
            db = get_database()
            providers_collection = db.auth_providers
            
            # Build MongoDB query - only exclude deleted providers
            query = {"is_deleted": False}
            
            # Execute query
            cursor = providers_collection.find(query).sort("name", 1)
            providers = list(cursor)
            
            result = []
            for provider in providers:
                try:
                    # Parse config JSON
                    config_data = json.loads(str(provider.get("config", "{}"))) if provider.get("config") is not None else {}
                    metadata_data = json.loads(str(provider.get("metadata", "{}"))) if provider.get("metadata") is not None else {}
                    
                    result.append({
                        "id": provider.get("id") or provider.get("provider_uuid") or "unknown",
                        "name": provider.get("name") or provider.get("provider_name") or "unknown",
                        "type": provider.get("type") or provider.get("provider_type") or "unknown",
                        "description": provider.get("description"),
                        "is_active": provider.get("is_active", True),
                        "config": config_data,
                        "metadata": metadata_data,
                        "created_at": provider.get("created_at").isoformat() if provider.get("created_at") and hasattr(provider.get("created_at"), 'isoformat') else provider.get("created_at"),
                        "updated_at": provider.get("updated_at").isoformat() if provider.get("updated_at") and hasattr(provider.get("updated_at"), 'isoformat') else provider.get("updated_at"),
                        "created_by": provider.get("created_by"),
                        "updated_by": provider.get("updated_by"),
                        "version": provider.get("version", 1)
                    })
                except json.JSONDecodeError as e:
                    logger.error(f"Failed to parse JSON for auth provider {provider.get('id')}: {str(e)}")
                    continue
            
            logger.debug(f"Retrieved {len(result)} auth providers")
            return result
                
        except Exception as e:
            logger.error(f"Failed to get auth providers: {str(e)}")
            raise
    
    def get_auth_provider_by_uuid(self, provider_uuid: str) -> Optional[Dict[str, Any]]:
        """Get auth provider by UUID"""
        try:
            db = get_database()
            providers_collection = db.auth_providers
            
            # Build MongoDB query - check both provider_uuid and id for backward compatibility
            query = {"$or": [{"provider_uuid": provider_uuid}, {"id": provider_uuid}], "is_active": True, "is_deleted": False}
            
            # Execute query
            provider = providers_collection.find_one(query)
            
            if not provider:
                logger.debug(f"Auth provider not found: {provider_uuid}")
                return None
            
            try:
                # Parse config JSON
                config_data = json.loads(str(provider.get("config", "{}"))) if provider.get("config") is not None else {}
                metadata_data = json.loads(str(provider.get("metadata", "{}"))) if provider.get("metadata") is not None else {}
                
                result = {
                    "id": provider.get("id") or provider.get("provider_uuid") or "unknown",
                    "name": provider.get("name") or provider.get("provider_name") or "unknown",
                    "type": provider.get("type") or provider.get("provider_type") or "unknown",
                    "description": provider.get("description"),
                    "is_active": provider.get("is_active", True),
                    "config": config_data,
                    "metadata": metadata_data,
                                    "created_at": provider.get("created_at").isoformat() if provider.get("created_at") and hasattr(provider.get("created_at"), 'isoformat') else provider.get("created_at"),
                "updated_at": provider.get("updated_at").isoformat() if provider.get("updated_at") and hasattr(provider.get("updated_at"), 'isoformat') else provider.get("updated_at"),
                    "created_by": provider.get("created_by"),
                    "updated_by": provider.get("updated_by"),
                    "version": provider.get("version", 1)
                }
                
                logger.debug(f"Retrieved auth provider: {provider_uuid}")
                return result
                
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse JSON for auth provider {provider.get('id')}: {str(e)}")
                return None
                
        except Exception as e:
            logger.error(f"Failed to get auth provider {provider_uuid}: {str(e)}")
            return None
    
    def get_auth_providers_by_type(self, provider_type: str) -> List[Dict[str, Any]]:
        """Get auth providers by type"""
        try:
            db = get_database()
            providers_collection = db.auth_providers
            
            # Build MongoDB query
            query = {"type": provider_type, "is_active": True, "is_deleted": False}
            
            # Execute query
            cursor = providers_collection.find(query).sort("name", 1)
            providers = list(cursor)
            
            result = []
            for provider in providers:
                try:
                    # Parse config JSON
                    config_data = json.loads(str(provider.get("config", "{}"))) if provider.get("config") is not None else {}
                    metadata_data = json.loads(str(provider.get("metadata", "{}"))) if provider.get("metadata") is not None else {}
                    
                    result.append({
                        "id": provider.get("id") or provider.get("provider_uuid") or "unknown",
                        "name": provider.get("name") or provider.get("provider_name") or "unknown",
                        "type": provider.get("type") or provider.get("provider_type") or "unknown",
                        "description": provider.get("description"),
                        "is_active": provider.get("is_active", True),
                        "config": config_data,
                        "metadata": metadata_data,
                        "created_at": provider.get("created_at").isoformat() if provider.get("created_at") and hasattr(provider.get("created_at"), 'isoformat') else provider.get("created_at"),
                        "updated_at": provider.get("updated_at").isoformat() if provider.get("updated_at") and hasattr(provider.get("updated_at"), 'isoformat') else provider.get("updated_at"),
                        "created_by": provider.get("created_by"),
                        "updated_by": provider.get("updated_by"),
                        "version": provider.get("version", 1)
                    })
                except json.JSONDecodeError as e:
                    logger.error(f"Failed to parse JSON for auth provider {provider.get('id')}: {str(e)}")
                    continue
            
            logger.debug(f"Retrieved {len(result)} auth providers of type: {provider_type}")
            return result
                
        except Exception as e:
            logger.error(f"Failed to get auth providers by type {provider_type}: {str(e)}")
            return []
    
    def create_auth_provider(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new auth provider"""
        try:
            # Validate required fields
            if not data.get("id") or not data.get("name") or not data.get("type"):
                raise ValueError("id, name, and type are required fields")
            
            # Validate type
            valid_types = ['OAUTH2', 'JWT', 'API_KEY', 'CUSTOM']
            if data["type"] not in valid_types:
                raise ValueError(f"type must be one of: {valid_types}")
            
            db = get_database()
            providers_collection = db.auth_providers
            
            # Check if provider already exists (only non-deleted ones)
            existing = providers_collection.find_one({"id": data["id"], "is_deleted": False})
            if existing:
                raise ValueError(f"Auth provider with id {data['id']} already exists")
            
            # Create new provider document
            provider_uuid = str(uuid.uuid4())
            new_provider_doc = {
                "id": data["id"],
                "provider_uuid": provider_uuid,
                "name": data["name"],
                "type": data["type"],
                "description": data.get("description"),
                "is_active": data.get("is_active", True),
                "config": json.dumps(data.get("config", {})),
                "metadata": json.dumps(data.get("metadata", {})),
                "created_by": data.get("created_by", "system"),
                "updated_by": data.get("updated_by", "system"),
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
                "version": 1,
                "is_deleted": False
            }
            
            # Insert into MongoDB
            result = providers_collection.insert_one(new_provider_doc)
            
            # Return the created provider
            result_doc = {
                "id": new_provider_doc["id"],
                "name": new_provider_doc["name"],
                "type": new_provider_doc["type"],
                "description": new_provider_doc["description"],
                "is_active": new_provider_doc["is_active"],
                "config": json.loads(str(new_provider_doc["config"])) if new_provider_doc["config"] is not None else {},
                "metadata": json.loads(str(new_provider_doc["metadata"])) if new_provider_doc["metadata"] is not None else {},
                "created_at": new_provider_doc["created_at"].isoformat() if hasattr(new_provider_doc["created_at"], 'isoformat') else new_provider_doc["created_at"],
                "updated_at": new_provider_doc["updated_at"].isoformat() if hasattr(new_provider_doc["updated_at"], 'isoformat') else new_provider_doc["updated_at"],
                "created_by": new_provider_doc["created_by"],
                "updated_by": new_provider_doc["updated_by"],
                "version": new_provider_doc["version"]
            }
            
            logger.debug(f"Created auth provider: {new_provider_doc['id']}")
            return result_doc
                
        except Exception as e:
            logger.error(f"Failed to create auth provider: {str(e)}")
            raise
    
    def update_auth_provider(self, provider_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update an existing auth provider"""
        try:
            db = get_database()
            providers_collection = db.auth_providers
            
            # Build MongoDB query - check both provider_uuid and id for backward compatibility
            query = {"$or": [{"provider_uuid": provider_id}, {"id": provider_id}], "is_deleted": False}
            
            # Find the provider
            provider = providers_collection.find_one(query)
            
            if not provider:
                logger.warning(f"Auth provider not found for update: {provider_id}")
                return None
            
            # Prepare update data
            update_data = {}
            
            # Update fields if provided
            if "name" in data:
                update_data["name"] = data["name"]
            if "type" in data:
                valid_types = ['OAUTH2', 'JWT', 'API_KEY', 'CUSTOM']
                if data["type"] not in valid_types:
                    raise ValueError(f"type must be one of: {valid_types}")
                update_data["type"] = data["type"]
            if "description" in data:
                update_data["description"] = data["description"]
            if "is_active" in data:
                update_data["is_active"] = data["is_active"]
            if "config" in data:
                update_data["config"] = json.dumps(data["config"])
            if "metadata" in data:
                update_data["metadata"] = json.dumps(data["metadata"])
            
            update_data["updated_by"] = data.get("updated_by", "system")
            update_data["version"] = provider.get("version", 0) + 1
            update_data["updated_at"] = datetime.now(timezone.utc)
            
            # Update in MongoDB - use the same query logic
            providers_collection.update_one(
                query,
                {"$set": update_data}
            )
            
            # Get updated provider - use the same query logic
            updated_provider = providers_collection.find_one(query)
            
            if not updated_provider:
                raise ValueError(f"Failed to retrieve updated provider {provider_id}")
            
            # Return the updated provider
            result = {
                "id": updated_provider.get("id") or updated_provider.get("provider_uuid") or "unknown",
                "name": updated_provider.get("name") or updated_provider.get("provider_name") or "unknown",
                "type": updated_provider.get("type") or updated_provider.get("provider_type") or "unknown",
                "description": updated_provider.get("description"),
                "is_active": updated_provider.get("is_active", True),
                "config": json.loads(str(updated_provider.get("config"))) if updated_provider.get("config") is not None else {},
                "metadata": json.loads(str(updated_provider.get("metadata"))) if updated_provider.get("metadata") is not None else {},
                "created_at": updated_provider.get("created_at").isoformat() if updated_provider.get("created_at") and hasattr(updated_provider.get("created_at"), 'isoformat') else updated_provider.get("created_at"),
                "updated_at": updated_provider.get("updated_at").isoformat() if updated_provider.get("updated_at") and hasattr(updated_provider.get("updated_at"), 'isoformat') else updated_provider.get("updated_at"),
                "created_by": updated_provider.get("created_by"),
                "updated_by": updated_provider.get("updated_by"),
                "version": updated_provider.get("version", 1)
            }
            
            logger.debug(f"Updated auth provider: {provider_id}")
            return result
                
        except Exception as e:
            logger.error(f"Failed to update auth provider {provider_id}: {str(e)}")
            raise
    
    def delete_auth_provider(self, provider_id: str) -> bool:
        """Soft delete an auth provider"""
        try:
            db = get_database()
            providers_collection = db.auth_providers
            
            # Build MongoDB query - check both provider_uuid and id for backward compatibility
            query = {"$or": [{"provider_uuid": provider_id}, {"id": provider_id}], "is_deleted": False}
            
            # Find the provider
            provider = providers_collection.find_one(query)
            
            if not provider:
                logger.warning(f"Auth provider not found for deletion: {provider_id}")
                return False
            
            # Soft delete
            update_data = {
                "is_deleted": True,
                "deleted_at": datetime.now(timezone.utc),
                "updated_by": "system",
                "updated_at": datetime.now(timezone.utc)
            }
            
            providers_collection.update_one(
                query,
                {"$set": update_data}
            )
            
            logger.debug(f"Deleted auth provider: {provider_id}")
            return True
                
        except Exception as e:
            logger.error(f"Failed to delete auth provider {provider_id}: {str(e)}")
            return False
    
    def get_auth_provider_stats(self) -> Dict[str, Any]:
        """Get auth provider statistics"""
        try:
            db = get_database()
            providers_collection = db.auth_providers
            
            # Get total count
            total_count = providers_collection.count_documents({"is_deleted": False})
            
            # Get active count
            active_count = providers_collection.count_documents({"is_active": True, "is_deleted": False})
            
            # Get count by type
            type_counts = {}
            for provider_type in ['OAUTH2', 'JWT', 'API_KEY', 'CUSTOM']:
                count = providers_collection.count_documents({"type": provider_type, "is_deleted": False})
                type_counts[provider_type] = count
            
            stats = {
                "total": total_count,
                "active": active_count,
                "inactive": total_count - active_count,
                "by_type": type_counts
            }
            
            logger.debug(f"Auth provider stats: {stats}")
            return stats
                
        except Exception as e:
            logger.error(f"Failed to get auth provider stats: {str(e)}")
            return {
                "total": 0,
                "active": 0,
                "inactive": 0,
                "by_type": {}
            }
