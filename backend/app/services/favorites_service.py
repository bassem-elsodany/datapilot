"""
Favorites Service - MongoDB equivalent

This module provides SObject favorites management functionality for the DataPilot backend.
It handles adding, removing, and querying user favorites for Salesforce objects with
connection-specific isolation and proper error handling using MongoDB instead of SQLAlchemy.

Features:
- SObject favorites management per connection
- Favorite addition and removal operations
- Favorite status checking and validation
- Connection-specific favorites isolation
- Error handling and conflict resolution
- Favorite metadata management
- Database integrity and constraint handling
- Internationalization support for errors

Operations:
- Add SObject to favorites
- Remove SObject from favorites
- Check favorite status
- Retrieve favorites by connection
- Get favorite by SObject name
- Favorite validation and conflict resolution
- Database integrity management
- Error handling and internationalization

Author: Bassem Elsodany
GitHub: https://github.com/bassem-elsodany
LinkedIn: https://www.linkedin.com/in/bassem-elsodany/
Version: 1.0.0
License: MIT License
"""

from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from loguru import logger
from app.core.mongodb import get_database
from app.models.sobject_favorite import SObjectFavorite, SObjectFavoriteCreate
from app.services.error_service import ErrorService


class FavoritesService:
    """Service for managing SObject favorites using MongoDB"""
    
    @staticmethod
    def add_favorite(
        connection_uuid: str, 
        sobject_name: str,
        sobject_label: Optional[str] = None,
        is_custom: bool = False,
        request=None,
        locale: str = "en"
    ) -> Optional[Dict[str, Any]]:
        """Add SObject to favorites"""
        try:
            db = get_database()
            favorites_collection = db.sobject_favorites
            
            # Check if favorite already exists
            existing_favorite = favorites_collection.find_one({
                "connection_uuid": connection_uuid,
                "sobject_name": sobject_name
            })
            
            if existing_favorite:
                ErrorService.raise_conflict_error(
                    message="connections.errors.favorite_already_exists",
                    resource_type="favorite",
                    resource_id=sobject_name,
                    conflicting_field="sobject_name",
                    request=request,
                    locale=locale
                )
            
            # Create favorite document
            favorite_doc = {
                "connection_uuid": connection_uuid,
                "sobject_name": sobject_name,
                "sobject_label": sobject_label,
                "is_custom": is_custom,
                "is_active": True,
                "created_by": "user",
                "updated_by": "user",
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
                "version": 1
            }
            
            # Insert into MongoDB
            result = favorites_collection.insert_one(favorite_doc)
            
            logger.debug(f"Added favorite: {sobject_name} for connection: {connection_uuid}")
            
            # Return the created favorite
            return {
                "favorite_uuid": str(result.inserted_id),
                "connection_uuid": favorite_doc["connection_uuid"],
                "sobject_name": favorite_doc["sobject_name"],
                "sobject_label": favorite_doc["sobject_label"],
                "is_custom": favorite_doc["is_custom"],
                "is_active": favorite_doc["is_active"],
                "created_at": favorite_doc["created_at"],
                "updated_at": favorite_doc["updated_at"],
                "created_by": favorite_doc["created_by"],
                "updated_by": favorite_doc["updated_by"],
                "version": favorite_doc["version"]
            }
            
        except Exception as e:
            logger.error(f"Failed to add favorite: {str(e)}")
            raise
    
    @staticmethod
    def get_favorites(connection_uuid: str) -> List[Dict[str, Any]]:
        """Get all favorites for a connection"""
        try:
            db = get_database()
            favorites_collection = db.sobject_favorites
            
            # Build MongoDB query
            query = {"connection_uuid": connection_uuid}
            
            # Execute query
            cursor = favorites_collection.find(query).sort("created_at", -1)
            favorites = list(cursor)
            
            result = []
            for favorite in favorites:
                result.append({
                    "favorite_uuid": str(favorite.get("_id")),
                    "connection_uuid": favorite.get("connection_uuid"),
                    "sobject_name": favorite.get("sobject_name"),
                    "sobject_label": favorite.get("sobject_label"),
                    "is_custom": favorite.get("is_custom"),
                    "is_active": favorite.get("is_active"),
                    "created_at": favorite.get("created_at"),
                    "updated_at": favorite.get("updated_at"),
                    "created_by": favorite.get("created_by"),
                    "updated_by": favorite.get("updated_by"),
                    "version": favorite.get("version")
                })
            
            logger.debug(f"Retrieved {len(result)} favorites for connection: {connection_uuid}")
            return result
            
        except Exception as e:
            logger.error(f"Failed to get favorites: {str(e)}")
            return []
    
    @staticmethod
    def delete_favorite(
        connection_uuid: str, 
        favorite_uuid: str,
        request=None,
        locale: str = "en"
    ) -> bool:
        """Delete a favorite (idempotent - returns True if already deleted)"""
        try:
            from bson import ObjectId
            
            db = get_database()
            favorites_collection = db.sobject_favorites
            
            # Convert string UUID to ObjectId for MongoDB query
            try:
                object_id = ObjectId(favorite_uuid)
            except Exception as e:
                logger.error(f"Invalid ObjectId format: {favorite_uuid} - {str(e)}")
                # If ObjectId conversion fails, treat as success (idempotent)
                return True
            
            # Build MongoDB query
            query = {"_id": object_id, "connection_uuid": connection_uuid}
            
            # Find the favorite
            favorite = favorites_collection.find_one(query)
            
            if not favorite:
                # Favorite not found or already deleted - consider it successful (idempotent)
                logger.debug(f"Favorite {favorite_uuid} not found or already deleted - treating as success")
                return True
            
            # Hard delete - permanently remove from database
            result = favorites_collection.delete_one({"_id": object_id})
            
            if result.deleted_count > 0:
                logger.debug(f"Hard deleted favorite: {favorite_uuid}")
            else:
                logger.debug(f"Favorite {favorite_uuid} was already deleted")
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to delete favorite: {str(e)}")
            raise
    
    @staticmethod
    def is_favorite(connection_uuid: str, sobject_name: str) -> bool:
        """Check if SObject is favorited"""
        try:
            db = get_database()
            favorites_collection = db.sobject_favorites
            
            # Build MongoDB query
            query = {"connection_uuid": connection_uuid, "sobject_name": sobject_name, "is_deleted": False}
            
            # Execute query
            favorite = favorites_collection.find_one(query)
            
            return favorite is not None
            
        except Exception as e:
            logger.error(f"Failed to check favorite status: {str(e)}")
            return False
    
    @staticmethod
    def get_favorite_by_name(connection_uuid: str, sobject_name: str) -> Optional[Dict[str, Any]]:
        """Get favorite by SObject name"""
        try:
            db = get_database()
            favorites_collection = db.sobject_favorites
            
            # Build MongoDB query
            query = {"connection_uuid": connection_uuid, "sobject_name": sobject_name, "is_deleted": False}
            
            # Execute query
            favorite = favorites_collection.find_one(query)
            
            if not favorite:
                return None
            
            return {
                "favorite_uuid": str(favorite.get("_id")),
                "connection_uuid": favorite.get("connection_uuid"),
                "sobject_name": favorite.get("sobject_name"),
                "sobject_label": favorite.get("sobject_label"),
                "is_custom": favorite.get("is_custom"),
                "is_active": favorite.get("is_active"),
                "created_at": favorite.get("created_at"),
                "updated_at": favorite.get("updated_at"),
                "created_by": favorite.get("created_by"),
                "updated_by": favorite.get("updated_by"),
                "version": favorite.get("version")
            }
            
        except Exception as e:
            logger.error(f"Failed to get favorite by name: {str(e)}")
            return None
