"""
Saved Apex Service - MongoDB equivalent

This module provides comprehensive management of saved Apex code with debug levels.
It handles CRUD operations, execution tracking, and debug level management for Apex code
using MongoDB instead of SQLAlchemy.

Features:
- Create, read, update, delete saved Apex code
- Debug level configuration and validation
- Execution tracking and statistics
- Connection-specific organization
- Search and filtering capabilities
- Version control and audit trails
- Soft delete functionality

Operations:
- Saved Apex code CRUD operations
- Debug level management and validation
- Execution tracking and statistics
- Search and filtering by various criteria
- Connection-specific data retrieval
- Audit trail management

Author: Bassem Elsodany
GitHub: https://github.com/bassem-elsodany
LinkedIn: https://www.linkedin.com/in/bassem-elsodany/
Version: 1.0.0
License: MIT License
"""

import json
from loguru import logger
from typing import Dict, List, Any, Optional
from datetime import datetime, timezone

from app.core.mongodb import get_database
from app.models.saved_apex import SavedApex, DebugLevels, ApexCodeType, ExecutionStatus
from app.services.salesforce_service import SalesforceService
from app.services.connection_service import ConnectionService


class SavedApexService:
    """Service for managing saved Apex code with debug levels using MongoDB"""
    
    def __init__(self):
        self.salesforce_service = SalesforceService()
        self.connection_service = ConnectionService()
    
    def _validate_connection_uuid(self, connection_uuid: str) -> bool:
        """Validate that a connection UUID exists and is valid"""
        try:
            connections = self.connection_service.get_all_connections()
            return any(conn["connectionUuid"] == connection_uuid for conn in connections)
        except Exception as e:
            logger.error(f"❌ Error validating connection UUID {connection_uuid}: {str(e)}")
            return False

    def create_saved_apex(
        self,
        connection_uuid: str,
        name: str,
        apex_code: str,
        description: Optional[str] = None,
        tags: Optional[str] = None,
        code_type: str = 'anonymous',
        debug_levels: Optional[Dict[str, str]] = None,
        created_by: Optional[str] = None
    ) -> Dict[str, Any]:
        """Create a new saved Apex code entry"""
        try:
            # Validate connection UUID
            if not self._validate_connection_uuid(connection_uuid):
                raise ValueError(f"Invalid or non-existent connection UUID: {connection_uuid}")
            
            # Validate code type
            if not ApexCodeType.validate_code_type(code_type):
                raise ValueError("Invalid Apex code type")
            
            # Set default debug levels if not provided
            if debug_levels is None:
                debug_levels = DebugLevels.get_default_debug_levels()
            else:
                # Validate debug levels
                for component, level in debug_levels.items():
                    if not DebugLevels.validate_debug_level(level):
                        raise ValueError(f"Invalid debug level '{level}' for component '{component}'")
            
            # Create saved Apex document
            saved_apex_doc = {
                "connection_uuid": connection_uuid,
                "name": name,
                "description": description,
                "tags": tags,
                "apex_code": apex_code,
                "code_type": code_type,
                "debug_levels": debug_levels,
                "is_favorite": False,
                "execution_count": 0,
                "last_executed": None,
                "last_execution_status": None,
                "last_execution_time": 0,
                "created_by": created_by or "user",
                "updated_by": created_by or "user",
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
                "version": 1,
                "is_deleted": False
            }
            
            # Save to MongoDB
            db = get_database()
            saved_apex_collection = db.saved_apex
            
            result = saved_apex_collection.insert_one(saved_apex_doc)
            
            logger.info(f"✅ Created saved Apex code: {result.inserted_id}")
            
            return self._format_saved_apex_response(saved_apex_doc, str(result.inserted_id))
            
        except Exception as e:
            logger.error(f"❌ Failed to create saved Apex code: {str(e)}")
            raise
    
    def get_saved_apex_by_uuid(self, saved_apex_uuid: str) -> Optional[Dict[str, Any]]:
        """Get saved Apex code by UUID"""
        try:
            db = get_database()
            saved_apex_collection = db.saved_apex
            
            # Build MongoDB query
            query = {"_id": saved_apex_uuid, "is_deleted": False}
            
            # Execute query
            saved_apex = saved_apex_collection.find_one(query)
            
            if not saved_apex:
                return None
            
            logger.info(f"📖 Retrieved saved Apex code: {saved_apex_uuid}")
            return self._format_saved_apex_response(saved_apex, saved_apex_uuid)
                
        except Exception as e:
            logger.error(f"❌ Failed to get saved Apex code: {str(e)}")
            raise
    
    def get_saved_apex_by_connection(
        self,
        connection_uuid: str,
        limit: int = 100,
        offset: int = 0,
        search: Optional[str] = None,
        code_type: Optional[str] = None,
        is_favorite: Optional[bool] = None
    ) -> Dict[str, Any]:
        """Get saved Apex code by connection UUID with filtering and pagination"""
        try:
            # Validate connection UUID
            if not self._validate_connection_uuid(connection_uuid):
                raise ValueError(f"Invalid or non-existent connection UUID: {connection_uuid}")
            
            db = get_database()
            saved_apex_collection = db.saved_apex
            
            # Build MongoDB query
            query = {"connection_uuid": connection_uuid, "is_deleted": False}
            
            # Apply filters
            if search:
                # MongoDB text search (requires text index)
                query["$text"] = {"$search": search}
            
            if code_type:
                query["code_type"] = code_type
            
            if is_favorite is not None:
                query["is_favorite"] = is_favorite
            
            # Get total count
            total_count = saved_apex_collection.count_documents(query)
            
            # Apply pagination and ordering
            cursor = saved_apex_collection.find(query).sort("updated_at", -1).skip(offset).limit(limit)
            saved_apex_list = list(cursor)
            
            logger.info(f"📖 Retrieved {len(saved_apex_list)} saved Apex codes for connection: {connection_uuid}")
            
            return {
                "saved_apex_list": [self._format_saved_apex_response(apex, str(apex.get("_id"))) for apex in saved_apex_list],
                "total_count": total_count,
                "limit": limit,
                "offset": offset
            }
            
        except Exception as e:
            logger.error(f"❌ Failed to get saved Apex codes: {str(e)}")
            raise
    
    def update_saved_apex(
        self,
        saved_apex_uuid: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        tags: Optional[str] = None,
        apex_code: Optional[str] = None,
        code_type: Optional[str] = None,
        debug_levels: Optional[Dict[str, str]] = None,
        is_favorite: Optional[bool] = None,
        updated_by: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Update saved Apex code"""
        try:
            db = get_database()
            saved_apex_collection = db.saved_apex
            
            # Build MongoDB query
            query = {"_id": saved_apex_uuid, "is_deleted": False}
            
            # Find the saved Apex
            saved_apex = saved_apex_collection.find_one(query)
            
            if not saved_apex:
                return None
            
            # Prepare update data
            update_data = {}
            
            # Update fields if provided
            if name is not None:
                update_data["name"] = name
            if description is not None:
                update_data["description"] = description
            if tags is not None:
                update_data["tags"] = tags
            if apex_code is not None:
                update_data["apex_code"] = apex_code
            if code_type is not None:
                if not ApexCodeType.validate_code_type(code_type):
                    raise ValueError("Invalid Apex code type")
                update_data["code_type"] = code_type
            if debug_levels is not None:
                # Validate debug levels
                for component, level in debug_levels.items():
                    if not DebugLevels.validate_debug_level(level):
                        raise ValueError(f"Invalid debug level '{level}' for component '{component}'")
                update_data["debug_levels"] = debug_levels
            if is_favorite is not None:
                update_data["is_favorite"] = is_favorite
            
            update_data["updated_by"] = updated_by or "user"
            update_data["version"] = saved_apex.get("version", 0) + 1
            update_data["updated_at"] = datetime.now(timezone.utc)
            
            # Update in MongoDB
            saved_apex_collection.update_one(
                {"_id": saved_apex_uuid},
                {"$set": update_data}
            )
            
            # Get updated saved Apex
            updated_saved_apex = saved_apex_collection.find_one({"_id": saved_apex_uuid})
            
            if not updated_saved_apex:
                raise ValueError(f"Failed to retrieve updated saved Apex {saved_apex_uuid}")
            
            logger.info(f"✅ Updated saved Apex code: {saved_apex_uuid}")
            return self._format_saved_apex_response(updated_saved_apex, saved_apex_uuid)
                
        except Exception as e:
            logger.error(f"❌ Failed to update saved Apex code: {str(e)}")
            raise
    
    def delete_saved_apex(self, saved_apex_uuid: str) -> bool:
        """Soft delete saved Apex code"""
        try:
            db = get_database()
            saved_apex_collection = db.saved_apex
            
            # Build MongoDB query
            query = {"_id": saved_apex_uuid, "is_deleted": False}
            
            # Find the saved Apex
            saved_apex = saved_apex_collection.find_one(query)
            
            if not saved_apex:
                return False
            
            # Soft delete
            update_data = {
                "is_deleted": True,
                "deleted_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc)
            }
            
            saved_apex_collection.update_one(
                {"_id": saved_apex_uuid},
                {"$set": update_data}
            )
            
            logger.info(f"🗑️ Deleted saved Apex code: {saved_apex_uuid}")
            return True
                
        except Exception as e:
            logger.error(f"❌ Failed to delete saved Apex code: {str(e)}")
            raise
    
    def execute_saved_apex(
        self,
        saved_apex_uuid: str,
        connection_uuid: str
    ) -> Dict[str, Any]:
        """Execute saved Apex code with its debug levels"""
        try:
            # Validate connection UUID
            if not self._validate_connection_uuid(connection_uuid):
                raise ValueError(f"Invalid or non-existent connection UUID: {connection_uuid}")
            
            # Get saved Apex code
            saved_apex = self.get_saved_apex_by_uuid(saved_apex_uuid)
            if not saved_apex:
                raise ValueError("Saved Apex code not found")
            
            # Verify connection matches
            if saved_apex['connection_uuid'] != connection_uuid:
                raise ValueError("Connection UUID mismatch")
            
            # Execute the Apex code
            execution_start = datetime.now(timezone.utc)
            
            # TODO: Set debug levels in Salesforce connection before execution
            # This would require extending the Salesforce service to support debug levels
            
            # Execute the Apex code
            result = self.salesforce_service.execute_anonymous_apex(saved_apex['apex_code'], connection_uuid)
            
            execution_end = datetime.now(timezone.utc)
            execution_time = int((execution_end - execution_start).total_seconds() * 1000)
            
            # Update execution statistics
            self._update_execution_stats(
                saved_apex_uuid,
                result.get('success', False),
                execution_time,
                result.get('exceptionMessage') or result.get('compileProblem')
            )
            
            logger.info(f"🔧 Executed saved Apex code: {saved_apex_uuid}")
            
            return {
                "saved_apex": saved_apex,
                "execution_result": result,
                "execution_time": execution_time,
                "executed_at": execution_end.isoformat()
            }
            
        except Exception as e:
            logger.error(f"❌ Failed to execute saved Apex code: {str(e)}")
            raise
    
    def toggle_favorite(self, saved_apex_uuid: str) -> Optional[Dict[str, Any]]:
        """Toggle favorite status of saved Apex code"""
        try:
            db = get_database()
            saved_apex_collection = db.saved_apex
            
            # Build MongoDB query
            query = {"_id": saved_apex_uuid, "is_deleted": False}
            
            # Find the saved Apex
            saved_apex = saved_apex_collection.find_one(query)
            
            if not saved_apex:
                return None
            
            # Toggle favorite status
            current_favorite = saved_apex.get("is_favorite", False)
            new_favorite_status = not current_favorite
            
            # Update in MongoDB
            update_data = {
                "is_favorite": new_favorite_status,
                "updated_at": datetime.now(timezone.utc),
                "updated_by": "user"
            }
            
            saved_apex_collection.update_one(
                {"_id": saved_apex_uuid},
                {"$set": update_data}
            )
            
            # Get updated saved Apex
            updated_saved_apex = saved_apex_collection.find_one({"_id": saved_apex_uuid})
            
            if not updated_saved_apex:
                raise ValueError(f"Failed to retrieve updated saved Apex {saved_apex_uuid}")
            
            logger.info(f"⭐ Toggled favorite status for saved Apex code: {saved_apex_uuid}")
            return self._format_saved_apex_response(updated_saved_apex, saved_apex_uuid)
                
        except Exception as e:
            logger.error(f"❌ Failed to toggle favorite: {str(e)}")
            raise
    
    def get_debug_levels_info(self) -> Dict[str, Any]:
        """Get information about available debug levels and components"""
        return {
            "debug_levels": DebugLevels.get_all_levels(),
            "default_debug_levels": DebugLevels.get_default_debug_levels(),
            "components": [
                "DB", "Workflow", "Validation", "Callouts", "Apex_Code", "Apex_Profiling"
            ]
        }
    
    def get_code_types_info(self) -> Dict[str, Any]:
        """Get information about available Apex code types"""
        return {
            "code_types": ApexCodeType.get_all_types(),
            "execution_statuses": ExecutionStatus.get_all_statuses()
        }
    
    def _update_execution_stats(
        self,
        saved_apex_uuid: str,
        success: bool,
        execution_time: int,
        error_message: Optional[str] = None
    ) -> None:
        """Update execution statistics for saved Apex code"""
        try:
            db = get_database()
            saved_apex_collection = db.saved_apex
            
            # Build MongoDB query
            query = {"_id": saved_apex_uuid}
            
            # Find the saved Apex
            saved_apex = saved_apex_collection.find_one(query)
            
            if saved_apex:
                # Prepare update data
                update_data = {
                    "execution_count": saved_apex.get("execution_count", 0) + 1,
                    "last_executed": datetime.now(timezone.utc),
                    "last_execution_time": execution_time,
                    "updated_at": datetime.now(timezone.utc)
                }
                
                if success:
                    update_data["last_execution_status"] = ExecutionStatus.SUCCESS
                else:
                    if error_message and "compile" in error_message.lower():
                        update_data["last_execution_status"] = ExecutionStatus.COMPILATION_ERROR
                    else:
                        update_data["last_execution_status"] = ExecutionStatus.RUNTIME_ERROR
                
                # Update in MongoDB
                saved_apex_collection.update_one(
                    {"_id": saved_apex_uuid},
                    {"$set": update_data}
                )
                    
        except Exception as e:
            logger.error(f"❌ Failed to update execution stats: {str(e)}")
    
    def _format_saved_apex_response(self, saved_apex: Dict[str, Any], saved_apex_uuid: str) -> Dict[str, Any]:
        """Format saved Apex code for API response"""
        return {
            "saved_apex_uuid": saved_apex_uuid,
            "connection_uuid": saved_apex.get("connection_uuid"),
            "name": saved_apex.get("name"),
            "description": saved_apex.get("description"),
            "tags": saved_apex.get("tags"),
            "apex_code": saved_apex.get("apex_code"),
            "code_type": saved_apex.get("code_type"),
            "debug_levels": saved_apex.get("debug_levels", {}),
            "is_favorite": saved_apex.get("is_favorite", False),
            "execution_count": saved_apex.get("execution_count", 0),
            "last_executed": saved_apex.get("last_executed"),
            "last_execution_status": saved_apex.get("last_execution_status"),
            "last_execution_time": saved_apex.get("last_execution_time", 0),
            "created_at": saved_apex.get("created_at"),
            "updated_at": saved_apex.get("updated_at"),
            "created_by": saved_apex.get("created_by"),
            "updated_by": saved_apex.get("updated_by"),
            "version": saved_apex.get("version", 1)
        }
