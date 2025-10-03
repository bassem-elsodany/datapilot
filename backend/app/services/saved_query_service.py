"""
Saved Query Service - MongoDB equivalent

This module provides saved query management functionality for the DataPilot backend.
It handles storage, retrieval, and management of user-saved SOQL queries with metadata,
tags, execution tracking, and connection-specific isolation using MongoDB instead of SQLAlchemy.

Features:
- Complete CRUD operations for saved queries
- Query metadata management (name, description, tags)
- Favorite query marking and organization
- Execution count tracking and statistics
- Connection-specific query isolation
- Query versioning and history
- Tag-based organization and filtering
- Execution tracking and performance metrics

Operations:
- Saved query creation and validation
- Query retrieval with filtering and sorting
- Query updates and modifications
- Query deletion and cleanup
- Execution count tracking and updates
- Favorite query management
- Tag-based organization and filtering
- Data validation and integrity management

Author: Bassem Elsodany
GitHub: https://github.com/bassem-elsodany
LinkedIn: https://www.linkedin.com/in/bassem-elsodany/
Version: 1.0.0
License: MIT License
"""

import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from loguru import logger

from app.core.mongodb import get_database
from app.models.saved_query import SavedQuery, SavedQueryCreate
from app.services.master_key_service import MasterKeyService
from app.services.i18n_service import I18nService


class SavedQueryService:
    """Service for managing saved queries using MongoDB"""
    
    def __init__(self):
        self.master_key_service = MasterKeyService()
        self.i18n_service = I18nService()
    
    def create_saved_query(
        self,
        connection_uuid: str,
        name: str,
        query_text: str,
        description: Optional[str] = None,
        tags: Optional[str] = None,
        is_favorite: bool = False,
        created_by: str = "user"
    ) -> Dict[str, Any]:
        """Create a new saved query"""
        try:
            # Validate inputs
            if not name or not name.strip():
                raise ValueError("saved_query.error.invalid_name")
            
            if not query_text or not query_text.strip():
                raise ValueError("saved_query.error.invalid_query_text")
            
            if not connection_uuid or not connection_uuid.strip():
                raise ValueError("saved_query.error.invalid_connection")
            
            db = get_database()
            connections_collection = db.connections
            saved_queries_collection = db.saved_queries
            
            # Check if connection exists
            connection = connections_collection.find_one({"connection_uuid": connection_uuid})
            if not connection:
                raise ValueError("saved_query.error.invalid_connection")
            
            # Check for duplicate name for the same connection
            existing_query = saved_queries_collection.find_one({
                "connection_uuid": connection_uuid,
                "name": name.strip(),
                "is_deleted": False
            })
            
            if existing_query:
                raise ValueError("saved_query.error.duplicate_name")
            
            # Create new saved query document
            saved_query_doc = {
                "saved_queries_uuid": str(uuid.uuid4()),
                "connection_uuid": connection_uuid,
                "name": name.strip(),
                "query_text": query_text.strip(),
                "description": description.strip() if description else None,
                "tags": tags.strip() if tags else None,
                "is_favorite": is_favorite,
                "execution_count": 0,
                "last_executed": None,
                "created_by": created_by,
                "updated_by": created_by,
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
                "version": 1,
                "is_deleted": False
            }
            
            # Insert into MongoDB
            result = saved_queries_collection.insert_one(saved_query_doc)
            
            logger.info(f"Created saved query: {saved_query_doc['saved_queries_uuid']}")
            
            return {
                "saved_queries_uuid": saved_query_doc["saved_queries_uuid"],
                "connection_uuid": saved_query_doc["connection_uuid"],
                "name": saved_query_doc["name"],
                "query_text": saved_query_doc["query_text"],
                "description": saved_query_doc["description"],
                "tags": saved_query_doc["tags"],
                "is_favorite": saved_query_doc["is_favorite"],
                "execution_count": saved_query_doc["execution_count"],
                "last_executed": saved_query_doc["last_executed"],
                "created_at": saved_query_doc["created_at"].isoformat(),
                "updated_at": saved_query_doc["updated_at"].isoformat(),
                "created_by": saved_query_doc["created_by"],
                "updated_by": saved_query_doc["updated_by"],
                "version": saved_query_doc["version"]
            }
                
        except ValueError as e:
            logger.error(f"Failed to create saved query: {str(e)}")
            raise e
        except Exception as e:
            logger.error(f"Failed to create saved query: {str(e)}")
            raise ValueError("saved_query.error.failed_to_create")
    
    def get_all_saved_queries(self, connection_uuid: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get all saved queries, optionally filtered by connection"""
        try:
            db = get_database()
            saved_queries_collection = db.saved_queries
            
            # Build MongoDB query
            query: Dict[str, Any] = {"is_deleted": False}
            if connection_uuid:
                query["connection_uuid"] = connection_uuid
            
            # Execute query
            cursor = saved_queries_collection.find(query).sort("updated_at", -1)
            saved_queries = list(cursor)
            
            result = []
            for sq in saved_queries:
                result.append({
                    "saved_queries_uuid": sq.get("saved_queries_uuid"),
                    "connection_uuid": sq.get("connection_uuid"),
                    "name": sq.get("name"),
                    "query_text": sq.get("query_text"),
                    "description": sq.get("description"),
                    "tags": sq.get("tags"),
                    "is_favorite": sq.get("is_favorite"),
                    "execution_count": sq.get("execution_count"),
                    "last_executed": sq.get("last_executed").isoformat() if sq.get("last_executed") else None,
                    "created_at": sq.get("created_at").isoformat() if sq.get("created_at") else None,
                    "updated_at": sq.get("updated_at").isoformat() if sq.get("updated_at") else None,
                    "created_by": sq.get("created_by"),
                    "updated_by": sq.get("updated_by") or sq.get("created_by"),
                    "version": sq.get("version")
                })
            
            logger.info(f"Retrieved {len(result)} saved queries")
            return result
                
        except Exception as e:
            logger.error(f"Failed to get saved queries: {str(e)}")
            raise ValueError("saved_query.error.failed_to_get_all")
    
    def get_saved_query_by_uuid(self, saved_queries_uuid: str) -> Optional[Dict[str, Any]]:
        """Get a specific saved query by UUID"""
        try:
            db = get_database()
            saved_queries_collection = db.saved_queries
            
            # Build MongoDB query
            query = {"saved_queries_uuid": saved_queries_uuid, "is_deleted": False}
            
            # Execute query
            saved_query = saved_queries_collection.find_one(query)
            
            if not saved_query:
                return None
            
            return {
                "saved_queries_uuid": saved_query.get("saved_queries_uuid"),
                "connection_uuid": saved_query.get("connection_uuid"),
                "name": saved_query.get("name"),
                "query_text": saved_query.get("query_text"),
                "description": saved_query.get("description"),
                "tags": saved_query.get("tags"),
                "is_favorite": saved_query.get("is_favorite"),
                "execution_count": saved_query.get("execution_count"),
                "last_executed": saved_query.get("last_executed").isoformat() if saved_query.get("last_executed") else None,
                "created_at": saved_query.get("created_at").isoformat() if saved_query.get("created_at") else None,
                "updated_at": saved_query.get("updated_at").isoformat() if saved_query.get("updated_at") else None,
                "created_by": saved_query.get("created_by"),
                "updated_by": saved_query.get("updated_by") or saved_query.get("created_by"),
                "version": saved_query.get("version")
            }
                
        except Exception as e:
            logger.error(f"Failed to get saved query {saved_queries_uuid}: {str(e)}")
            raise ValueError("saved_query.error.not_found")
    
    def update_saved_query(
        self,
        saved_queries_uuid: str,
        name: Optional[str] = None,
        query_text: Optional[str] = None,
        description: Optional[str] = None,
        tags: Optional[str] = None,
        is_favorite: Optional[bool] = None,
        updated_by: str = "user"
    ) -> Dict[str, Any]:
        """Update a saved query"""
        try:
            db = get_database()
            saved_queries_collection = db.saved_queries
            
            # Build MongoDB query
            query = {"saved_queries_uuid": saved_queries_uuid, "is_deleted": False}
            
            # Find the saved query
            saved_query = saved_queries_collection.find_one(query)
            
            if not saved_query:
                raise ValueError("saved_query.error.not_found")
            
            # Check for duplicate name if name is being updated
            if name and name.strip() != saved_query.get("name"):
                existing_query = saved_queries_collection.find_one({
                    "connection_uuid": saved_query.get("connection_uuid"),
                    "name": name.strip(),
                    "saved_queries_uuid": {"$ne": saved_queries_uuid},
                    "is_deleted": False
                })
                
                if existing_query:
                    raise ValueError("saved_query.error.duplicate_name")
            
            # Prepare update data
            update_data = {}
            
            # Update fields if provided
            if name is not None:
                if not name.strip():
                    raise ValueError("saved_query.error.invalid_name")
                update_data["name"] = name.strip()
            
            if query_text is not None:
                if not query_text.strip():
                    raise ValueError("saved_query.error.invalid_query_text")
                update_data["query_text"] = query_text.strip()
            
            if description is not None:
                update_data["description"] = description.strip() if description else None
            
            if tags is not None:
                update_data["tags"] = tags.strip() if tags else None
            
            if is_favorite is not None:
                update_data["is_favorite"] = bool(is_favorite)
            
            update_data["updated_by"] = updated_by
            update_data["version"] = saved_query.get("version", 0) + 1
            update_data["updated_at"] = datetime.now(timezone.utc)
            
            # Update in MongoDB
            saved_queries_collection.update_one(
                {"saved_queries_uuid": saved_queries_uuid},
                {"$set": update_data}
            )
            
            # Get updated saved query
            updated_saved_query = saved_queries_collection.find_one({"saved_queries_uuid": saved_queries_uuid})
            
            if not updated_saved_query:
                raise ValueError(f"Failed to retrieve updated saved query {saved_queries_uuid}")
            
            logger.info(f"Updated saved query: {saved_queries_uuid}")
            
            return {
                "saved_queries_uuid": updated_saved_query.get("saved_queries_uuid"),
                "connection_uuid": updated_saved_query.get("connection_uuid"),
                "name": updated_saved_query.get("name"),
                "query_text": updated_saved_query.get("query_text"),
                "description": updated_saved_query.get("description"),
                "tags": updated_saved_query.get("tags"),
                "is_favorite": updated_saved_query.get("is_favorite"),
                "execution_count": updated_saved_query.get("execution_count"),
                "last_executed": updated_saved_query.get("last_executed").isoformat() if updated_saved_query.get("last_executed") else None,
                "created_at": updated_saved_query.get("created_at").isoformat() if updated_saved_query.get("created_at") else None,
                "updated_at": updated_saved_query.get("updated_at").isoformat() if updated_saved_query.get("updated_at") else None,
                "created_by": updated_saved_query.get("created_by"),
                "updated_by": updated_saved_query.get("updated_by"),
                "version": updated_saved_query.get("version")
            }
                
        except ValueError as e:
            logger.error(f"Failed to update saved query: {str(e)}")
            raise e
        except Exception as e:
            logger.error(f"Failed to update saved query: {str(e)}")
            raise ValueError("saved_query.error.failed_to_update")
    
    def delete_saved_query(self, saved_queries_uuid: str) -> bool:
        """Delete a saved query"""
        try:
            db = get_database()
            saved_queries_collection = db.saved_queries
            
            # Build MongoDB query
            query = {"saved_queries_uuid": saved_queries_uuid, "is_deleted": False}
            
            # Find the saved query
            saved_query = saved_queries_collection.find_one(query)
            
            if not saved_query:
                raise ValueError("saved_query.error.not_found")
            
            # Soft delete
            update_data = {
                "is_deleted": True,
                "deleted_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc)
            }
            
            saved_queries_collection.update_one(
                {"saved_queries_uuid": saved_queries_uuid},
                {"$set": update_data}
            )
            
            logger.info(f"Deleted saved query: {saved_queries_uuid}")
            return True
                
        except ValueError as e:
            logger.error(f"Failed to delete saved query: {str(e)}")
            raise e
        except Exception as e:
            logger.error(f"Failed to delete saved query: {str(e)}")
            raise ValueError("saved_query.error.failed_to_delete")
    
    def increment_execution_count(self, saved_queries_uuid: str) -> bool:
        """Increment the execution count and update last executed timestamp"""
        try:
            db = get_database()
            saved_queries_collection = db.saved_queries
            
            # Build MongoDB query
            query = {"saved_queries_uuid": saved_queries_uuid, "is_deleted": False}
            
            # Find the saved query
            saved_query = saved_queries_collection.find_one(query)
            
            if not saved_query:
                return False
            
            # Prepare update data
            update_data = {
                "execution_count": saved_query.get("execution_count", 0) + 1,
                "last_executed": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc)
            }
            
            # Update in MongoDB
            saved_queries_collection.update_one(
                {"saved_queries_uuid": saved_queries_uuid},
                {"$set": update_data}
            )
            
            logger.info(f"Incremented execution count for saved query: {saved_queries_uuid}")
            return True
                
        except Exception as e:
            logger.error(f"Failed to increment execution count: {str(e)}")
            return False
