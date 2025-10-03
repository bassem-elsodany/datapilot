"""
Conversation Service - MongoDB Implementation

This service handles conversation management operations using MongoDB.
It provides CRUD operations for AI agent conversations, message management,
and conversation analytics.

Features:
- Complete CRUD operations for conversations
- Message management within conversations
- Conversation summary and analytics
- Connection-specific conversation isolation
- Conversation status management
- Message threading and metadata
- Performance analytics and insights

Author: Bassem Elsodany
GitHub: https://github.com/bassem-elsodany
LinkedIn: https://www.linkedin.com/in/bassem-elsodany/
Version: 2.1.0
License: MIT License
"""

from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from uuid import uuid4
import random
from loguru import logger
from bson import ObjectId

from app.core.mongodb import get_database
from app.models.conversation import (
    ConversationCreate, ConversationUpdate, ConversationResponse,
    ConversationMessageCreate, ConversationMessageResponse,
    ConversationSummary, ConversationAnalytics, ConversationStats
)


class ConversationService:
    """Service for handling conversation operations using MongoDB"""
    
    def __init__(self):
        self.db = get_database()
        self.conversations_collection = self.db.conversations
        self.messages_collection = self.db.conversation_messages
    
    def _convert_objectid_to_str(self, obj):
        """Convert ObjectId fields to strings for JSON serialization"""
        if isinstance(obj, dict):
            return {k: self._convert_objectid_to_str(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [self._convert_objectid_to_str(item) for item in obj]
        elif isinstance(obj, ObjectId):
            return str(obj)
        else:
            return obj
    
    def create_conversation(self, conversation_data: ConversationCreate) -> Dict[str, Any]:
        """Create a new conversation"""
        try:
            conversation_uuid = str(uuid4())
            now = datetime.now(timezone.utc)
            
            # Create conversation document
            conversation_doc = {
                "conversation_uuid": conversation_uuid,
                "connection_uuid": conversation_data.connection_uuid,
                "agent_name": conversation_data.agent_name,
                "title": conversation_data.title,
                "description": conversation_data.description,
                "tags": conversation_data.tags,
                "message_count": 0,
                "last_message_at": None,
                "created_at": now,
                "updated_at": now,
                "created_by": conversation_data.created_by,
                "updated_by": conversation_data.created_by,
                "version": 1
            }
            
            # Insert conversation
            result = self.conversations_collection.insert_one(conversation_doc)
            
            if not result.inserted_id:
                raise ValueError("Failed to create conversation")
            
            # Add initial message if provided
            if conversation_data.initial_message:
                self.add_message_to_conversation(
                    conversation_uuid=conversation_uuid,
                    message_data=ConversationMessageCreate(
                        role="user",
                        content=conversation_data.initial_message,
                        message_type="text"
                    )
                )
            
            logger.info(f"Created conversation: {conversation_uuid}")
            return self._format_conversation_response(conversation_doc)
            
        except Exception as e:
            logger.error(f"Failed to create conversation: {str(e)}")
            raise ValueError(f"Failed to create conversation: {str(e)}")
    
    def get_all_conversations(self, connection_uuid: str, agent_name: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get all conversations for a connection, optionally filtered by agent"""
        try:
            # Build query
            query = {
                "connection_uuid": connection_uuid
            }
            
            if agent_name:
                query["agent_name"] = agent_name
            
            # Execute query
            cursor = self.conversations_collection.find(query).sort("updated_at", -1)
            conversations = list(cursor)
            
            # Format responses
            formatted_conversations = []
            for conv in conversations:
                formatted_conversations.append(self._format_conversation_response(conv))
            
            logger.info(f"Retrieved {len(formatted_conversations)} conversations for connection {connection_uuid}")
            return formatted_conversations
            
        except Exception as e:
            logger.error(f"Failed to get conversations: {str(e)}")
            raise ValueError(f"Failed to get conversations: {str(e)}")
    
    def get_conversation_by_uuid(self, conversation_uuid: str) -> Optional[Dict[str, Any]]:
        """Get a specific conversation by UUID"""
        try:
            conversation = self.conversations_collection.find_one({
                "conversation_uuid": conversation_uuid
            })
            
            if not conversation:
                return None
            
            # Get messages for this conversation
            messages = self.get_conversation_messages(conversation_uuid)
            conversation["messages"] = messages
            
            logger.info(f"Retrieved conversation: {conversation_uuid}")
            return self._format_conversation_response(conversation)
            
        except Exception as e:
            logger.error(f"Failed to get conversation: {str(e)}")
            raise ValueError(f"Failed to get conversation: {str(e)}")
    
    def update_conversation(self, conversation_uuid: str, update_data: ConversationUpdate) -> Dict[str, Any]:
        """Update a conversation"""
        try:
            # Build update document
            update_doc = {
                "updated_at": datetime.now(timezone.utc),
                "updated_by": update_data.updated_by
            }
            
            if update_data.title is not None:
                update_doc["title"] = update_data.title
            if update_data.description is not None:
                update_doc["description"] = update_data.description
            if update_data.tags is not None:
                update_doc["tags"] = update_data.tags
            if update_data.agent_name is not None:
                update_doc["agent_name"] = update_data.agent_name
            
            # Get current conversation to handle version increment
            current_conversation = self.conversations_collection.find_one({
                "conversation_uuid": conversation_uuid
            })
            
            if not current_conversation:
                raise ValueError("Conversation not found")
            
            # Increment version
            current_version = current_conversation.get("version", 1)
            if not isinstance(current_version, int):
                current_version = 1
            update_doc["version"] = current_version + 1
            
            # Update conversation
            result = self.conversations_collection.update_one(
                {"conversation_uuid": conversation_uuid},
                {"$set": update_doc}
            )
            
            if result.matched_count == 0:
                raise ValueError("Conversation not found")
            
            # Get updated conversation
            updated_conversation = self.conversations_collection.find_one({
                "conversation_uuid": conversation_uuid
            })
            
            logger.info(f"Updated conversation: {conversation_uuid}")
            return self._format_conversation_response(updated_conversation)
            
        except Exception as e:
            logger.error(f"Failed to update conversation: {str(e)}")
            raise ValueError(f"Failed to update conversation: {str(e)}")
    
    def delete_conversation(self, conversation_uuid: str) -> bool:
        """Delete a conversation (hard delete)"""
        try:
            # First check if conversation exists
            existing_conversation = self.conversations_collection.find_one(
                {"conversation_uuid": conversation_uuid}
            )
            
            if not existing_conversation:
                logger.warning(f"⚠️ Conversation not found for deletion: {conversation_uuid}")
                return False
            
            # Hard delete conversation
            result = self.conversations_collection.delete_one(
                {"conversation_uuid": conversation_uuid}
            )
            
            if result.deleted_count == 0:
                logger.warning(f"⚠️ Failed to delete conversation: {conversation_uuid}")
                return False
            
            # Also hard delete all messages in this conversation
            messages_result = self.messages_collection.delete_many(
                {"conversation_uuid": conversation_uuid}
            )
            
            logger.info(f"Deleted conversation: {conversation_uuid} and {messages_result.deleted_count} messages")
            return True
            
        except Exception as e:
            logger.error(f"Failed to delete conversation: {str(e)}")
            raise ValueError(f"Failed to delete conversation: {str(e)}")
    
    def add_message_to_conversation(self, conversation_uuid: str, message_data: ConversationMessageCreate) -> Dict[str, Any]:
        """Add a message to a conversation"""
        try:
            message_id = str(uuid4())
            now = datetime.now(timezone.utc)
            
            # Create message document
            message_doc = {
                "message_id": message_id,
                "conversation_uuid": conversation_uuid,
                "role": message_data.role,
                "content": message_data.content,
                "timestamp": now,
                "metadata": message_data.metadata or {},
                "message_type": message_data.message_type,
                "is_edited": False,
                "parent_message_id": message_data.parent_message_id,
                "created_at": now,
                "updated_at": now
            }
            
            # Insert message
            result = self.messages_collection.insert_one(message_doc)
            
            if not result.inserted_id:
                raise ValueError("Failed to add message to conversation")
            
            # Update conversation metadata
            self.conversations_collection.update_one(
                {"conversation_uuid": conversation_uuid},
                {
                    "$inc": {"message_count": 1},
                    "$set": {
                        "last_message_at": now,
                        "updated_at": now
                    }
                }
            )
            
            logger.info(f"Added message to conversation: {conversation_uuid}")
            return self._format_message_response(message_doc)
            
        except Exception as e:
            logger.error(f"Failed to add message to conversation: {str(e)}")
            raise ValueError(f"Failed to add message to conversation: {str(e)}")
    
    def get_conversation_messages(self, conversation_uuid: str, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        """Get all messages for a conversation"""
        try:
            query = {
                "conversation_uuid": conversation_uuid
            }
            
            cursor = self.messages_collection.find(query).sort("timestamp", 1)
            
            if limit:
                cursor = cursor.limit(limit)
            
            messages = list(cursor)
            
            # Format responses
            formatted_messages = []
            for msg in messages:
                formatted_messages.append(self._format_message_response(msg))
            
            logger.info(f"Retrieved {len(formatted_messages)} messages for conversation {conversation_uuid}")
            return formatted_messages
            
        except Exception as e:
            logger.error(f"Failed to get conversation messages: {str(e)}")
            raise ValueError(f"Failed to get conversation messages: {str(e)}")
    
    def update_conversation_summary(self, conversation_uuid: str, summary_data: ConversationSummary) -> bool:
        """Update conversation summary"""
        try:
            result = self.conversations_collection.update_one(
                {"conversation_uuid": conversation_uuid},
                {
                    "$set": {
                        "summary": summary_data.dict(),
                        "updated_at": datetime.now(timezone.utc)
                    }
                }
            )
            
            if result.matched_count == 0:
                return False
            
            logger.info(f"Updated conversation summary: {conversation_uuid}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to update conversation summary: {str(e)}")
            raise ValueError(f"Failed to update conversation summary: {str(e)}")
    
    def get_conversation_analytics(self, conversation_uuid: str) -> Optional[Dict[str, Any]]:
        """Get analytics for a conversation"""
        try:
            # Get conversation
            conversation = self.conversations_collection.find_one({
                "conversation_uuid": conversation_uuid
            })
            
            if not conversation:
                return None
            
            # Get messages
            messages = list(self.messages_collection.find({
                "conversation_uuid": conversation_uuid
            }))
            
            # Calculate analytics
            total_messages = len(messages)
            user_messages = len([m for m in messages if m["role"] == "user"])
            assistant_messages = len([m for m in messages if m["role"] == "assistant"])
            
            # Count queries executed
            queries_executed = len([m for m in messages if m.get("message_type") == "query"])
            
            # Calculate duration
            if messages:
                first_message = min(messages, key=lambda x: x["timestamp"])
                last_message = max(messages, key=lambda x: x["timestamp"])
                duration = (last_message["timestamp"] - first_message["timestamp"]).total_seconds() / 60
            else:
                duration = None
            
            analytics = {
                "total_messages": total_messages,
                "user_messages": user_messages,
                "assistant_messages": assistant_messages,
                "queries_executed": queries_executed,
                "average_response_time": None,  # Could be calculated from metadata
                "conversation_duration": duration,
                "key_topics": conversation.get("summary", {}).get("key_topics", []),
                "most_used_features": []  # Could be calculated from message metadata
            }
            
            logger.info(f"Generated analytics for conversation: {conversation_uuid}")
            return analytics
            
        except Exception as e:
            logger.error(f"Failed to get conversation analytics: {str(e)}")
            raise ValueError(f"Failed to get conversation analytics: {str(e)}")
    
    def get_conversation_stats(self, connection_uuid: Optional[str] = None, agent_name: Optional[str] = None) -> Dict[str, Any]:
        """Get conversation statistics"""
        try:
            # Build base query
            base_query = {}
            if connection_uuid:
                base_query["connection_uuid"] = connection_uuid
            if agent_name:
                base_query["agent_name"] = agent_name
            
            # Get conversation counts
            total_conversations = self.conversations_collection.count_documents(base_query)
            
            # Get total messages
            message_query = {}
            if connection_uuid:
                # Get conversation UUIDs for this connection
                conv_uuids = [conv["conversation_uuid"] for conv in self.conversations_collection.find(
                    {"connection_uuid": connection_uuid},
                    {"conversation_uuid": 1}
                )]
                message_query["conversation_uuid"] = {"$in": conv_uuids}
            
            total_messages = self.messages_collection.count_documents(message_query)
            
            # Calculate average messages per conversation
            avg_messages = total_messages / total_conversations if total_conversations > 0 else 0
            
            # Get most active connection
            pipeline = [
                {"$group": {"_id": "$connection_uuid", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}},
                {"$limit": 1}
            ]
            
            most_active = list(self.conversations_collection.aggregate(pipeline))
            most_active_connection = most_active[0]["_id"] if most_active else None
            
            # Get recent activity
            recent_activity = list(self.conversations_collection.find(
                base_query,
                {"conversation_uuid": 1, "title": 1, "updated_at": 1, "connection_uuid": 1}
            ).sort("updated_at", -1).limit(5))
            
            # Convert ObjectIds to strings
            recent_activity = self._convert_objectid_to_str(recent_activity)
            
            stats = {
                "total_conversations": total_conversations,
                "total_messages": total_messages,
                "average_messages_per_conversation": round(avg_messages, 2),
                "most_active_connection": most_active_connection,
                "recent_activity": recent_activity
            }
            
            logger.info(f"Generated conversation stats")
            return stats
            
        except Exception as e:
            logger.error(f"Failed to get conversation stats: {str(e)}")
            raise ValueError(f"Failed to get conversation stats: {str(e)}")
    
    def _format_conversation_response(self, conversation_doc: Dict[str, Any]) -> Dict[str, Any]:
        """Format conversation document for response"""
        return {
            "conversation_uuid": conversation_doc["conversation_uuid"],
            "connection_uuid": conversation_doc["connection_uuid"],
            "agent_name": conversation_doc.get("agent_name", "datapilot-agent"),  # Default for backward compatibility
            "title": conversation_doc["title"],
            "description": conversation_doc.get("description"),
            "tags": conversation_doc.get("tags"),
            "message_count": conversation_doc["message_count"],
            "last_message_at": conversation_doc.get("last_message_at"),
            "created_at": conversation_doc["created_at"],
            "updated_at": conversation_doc["updated_at"],
            "created_by": conversation_doc["created_by"],
            "updated_by": conversation_doc["updated_by"],
            "summary": conversation_doc.get("summary"),
            "messages": conversation_doc.get("messages"),
            "version": conversation_doc["version"]
        }
    
    def _format_message_response(self, message_doc: Dict[str, Any]) -> Dict[str, Any]:
        """Format message document for response"""
        return {
            "message_id": message_doc["message_id"],
            "conversation_uuid": message_doc["conversation_uuid"],
            "role": message_doc["role"],
            "content": message_doc["content"],
            "timestamp": message_doc["timestamp"],
            "metadata": message_doc.get("metadata", {}),
            "message_type": message_doc["message_type"],
            "is_edited": message_doc.get("is_edited", False),
            "parent_message_id": message_doc.get("parent_message_id")
        }
    
    def get_connection_name(self, connection_uuid: str) -> str:
        """Get connection name by UUID"""
        try:
            connection = self.connections_collection.find_one(
                {"connection_uuid": connection_uuid},
                {"name": 1}
            )
            if connection:
                return connection.get("name", "Unknown Connection")
            return "Unknown Connection"
        except Exception as e:
            logger.warning(f"Failed to get connection name for {connection_uuid}: {e}")
            return "Unknown Connection"
    
    def generate_conversation_title(self, connection_name: str) -> str:
        """Generate a conversation title with connection name and random number"""
        try:
            # Clean connection name for title
            clean_name = connection_name.replace(" ", "_").replace("-", "_")
            # Generate random number between 1000-9999
            random_number = random.randint(1000, 9999)
            return f"{clean_name}_{random_number}"
        except Exception as e:
            logger.warning(f"Failed to generate conversation title: {e}")
            # Fallback title
            random_number = random.randint(1000, 9999)
            return f"SFConnection_{random_number}"
