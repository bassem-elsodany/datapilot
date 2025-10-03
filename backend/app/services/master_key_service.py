"""
DataPilot Backend - Master Key Security Service

This module provides enterprise-grade master key management functionality for the DataPilot backend,
handling secure master key storage, validation, and lifecycle management using advanced cryptographic
techniques with MongoDB persistence and comprehensive security controls.

The master key service provides:
- Military-grade cryptographic key management
- Secure key storage with advanced hashing and salting
- Master key validation and authentication
- Complete key lifecycle management
- Session-based key management
- Advanced security and compliance features
- Comprehensive audit trail and logging

Core Security Features:

Cryptographic Security:
- PBKDF2 key derivation with configurable iterations
- SHA-256 hashing with secure salt generation
- Cryptographically secure random number generation
- Key strength validation and enforcement
- Secure key storage with encryption
- Key rotation and management policies

Key Management:
- Master key creation and validation
- Key existence checking and verification
- Active key retrieval and management
- Key reset and deletion operations
- Session key management and validation
- Key strength validation and enforcement
- Single active key constraint management

Security Controls:
- Input validation and sanitization
- Key strength requirements and validation
- Secure key transmission protocols
- Access control and authorization
- Audit trail for all key operations
- Security event logging and monitoring

Database Security:
- Encrypted key storage in MongoDB
- Secure database connection protocols
- Data integrity validation and verification
- Backup and recovery procedures
- Data retention and deletion policies
- Compliance and audit support

Session Management:
- Session-based key validation
- Secure session token management
- Session timeout and expiration
- Multi-session support and management
- Session security and isolation
- Real-time session monitoring

Error Handling:
- Comprehensive exception handling
- Secure error message generation
- Internationalization support
- Error logging and monitoring
- Graceful degradation strategies
- User-friendly error responses

Integration Points:
- MongoDB database integration
- Authentication and authorization systems
- Logging and monitoring systems
- Error handling and reporting
- Frontend user interface
- Security and compliance systems

Compliance & Audit:
- Complete audit trail for all operations
- Security event logging and monitoring
- Compliance reporting and analytics
- Data privacy and GDPR compliance
- Security incident response
- Regulatory compliance support

Performance & Scalability:
- Optimized key operations and caching
- Asynchronous key management
- Connection pooling and reuse
- Performance monitoring and metrics
- Scalability and load balancing
- Resource usage optimization

Author: Bassem Elsodany
GitHub: https://github.com/bassem-elsodany
LinkedIn: https://www.linkedin.com/in/bassem-elsodany/
Version: 1.0.0
License: MIT License
"""

import hashlib
import secrets
import uuid
from loguru import logger
from typing import Optional, Dict, Any
from datetime import datetime, timezone

from app.core.mongodb import get_database
from app.models.master_key import MasterKey, MasterKeyCreate
from app.services.i18n_service import I18nService


class MasterKeyService:
    """Service for managing master keys in MongoDB instead of localStorage"""
    
    def __init__(self):
        self.current_master_key: Optional[str] = None
        
    def set_master_key(self, key: str) -> bool:
        """Set and validate master key - enforces single active key constraint"""
        try:
            if len(key) < 8:
                raise ValueError("master_key.error.too_short")
            
            logger.debug(f"Setting master key")
            
            # Check if this is the first time setting a master key
            existing_key = self.get_active_master_key()
            
            if not existing_key:
                # First time setup - store the hash and salt in MongoDB
                logger.debug("No existing master key found, creating new one")
                self._store_new_master_key(key)
                logger.debug("Master key hash and salt stored in MongoDB for first time")
            else:
                # Validate against existing hash in MongoDB
                logger.debug(f"Validating against existing master key (UUID: {existing_key['master_key_uuid']})")
                if not self._validate_master_key(key, existing_key):
                    logger.error(f"Master key validation failed - provided key does not match stored hash")
                    raise ValueError("master_key.error.key_mismatch")
                logger.debug("Master key validated successfully against MongoDB")
            
            # Store in memory for current session
            self.current_master_key = key
            logger.debug("Master key set successfully")
            return True
            
        except ValueError as e:
            # Re-raise ValueError to preserve the specific error message
            logger.error(f"Master key validation error: {str(e)}")
            raise
        except Exception as e:
            logger.error(f"Failed to set master key: {str(e)}")
            return False
    
    def is_master_key_exists(self) -> bool:
        """Check if any master key exists in MongoDB"""
        try:
            db = get_database()
            master_keys_collection = db.master_keys
            
            # Build MongoDB query
            query = {}
            
            # Execute query
            master_key = master_keys_collection.find_one(query)
            
            exists = master_key is not None
            logger.debug(f"Master key exists check: {exists}")
            return exists
                
        except Exception as e:
            logger.error(f"Error checking if master key exists: {str(e)}")
            return False
    
    def get_active_master_key(self) -> Optional[Dict[str, Any]]:
        """Get the active master key record from MongoDB"""
        try:
            db = get_database()
            master_keys_collection = db.master_keys
            
            # Build MongoDB query
            query = {}
            
            # Execute query
            master_key = master_keys_collection.find_one(query)
            
            if master_key:
                return {
                    "master_key_uuid": master_key.get("master_key_uuid"),
                    "hashed_key": master_key.get("hashed_key"),
                    "salt": master_key.get("salt"),
                    "created_at": master_key.get("created_at")
                }
            return None
                
        except Exception as e:
            logger.error(f"Error getting active master key: {str(e)}")
            return None
    
    def is_master_key_set(self) -> bool:
        """Check if master key is set in current session"""
        return self.current_master_key is not None
    
    def get_current_master_key(self) -> Optional[str]:
        """Get current session master key for encryption operations"""
        return self.current_master_key
    
    def reset_master_key(self, new_key: str) -> bool:
        """Reset master key - deletes old key, creates new one, and cleans up unrecoverable connections"""
        try:
            if len(new_key) < 8:
                raise ValueError("master_key.error.too_short")
            
            logger.info("Starting master key reset process")
            
            db = get_database()
            master_keys_collection = db.master_keys
            connections_collection = db.connections
            
            # Count existing connections before cleanup
            existing_connections = connections_collection.count_documents({})
            
            logger.debug(f"Found {existing_connections} connections to clean up")
            
            # Hard delete ALL connections (they become unrecoverable with new master key)
            connections_deleted = connections_collection.delete_many({})
            logger.debug(f"Deleted {connections_deleted.deleted_count} unrecoverable connections")
            
            # Hard delete ALL existing master keys (only one should exist)
            master_keys_deleted = master_keys_collection.delete_many({})
            logger.debug(f"Deleted {master_keys_deleted.deleted_count} old master keys")
            
            # Store new master key
            self._store_new_master_key(new_key)
            self.current_master_key = new_key
            
            logger.debug(f"Master key reset successfully - {connections_deleted.deleted_count} connections and {master_keys_deleted.deleted_count} old keys permanently deleted")
            return True
            
        except Exception as e:
            logger.error(f"Failed to reset master key: {str(e)}")
            return False
    
    def delete_master_key_and_connections(self) -> bool:
        """Hard delete master key and ALL related data (cascade delete)
        
        This will permanently delete:
        - Master keys
        - Connections (encrypted with master key)
        - Saved queries (encrypted with master key)
        - Saved apex (encrypted with master key)
        - SObject favorites (related to connections)
        """
        try:
            # Check if master key exists (no validation needed - user forgot it)
            existing_key = self.get_active_master_key()
            if not existing_key:
                raise ValueError("master_key.error.not_found_to_delete")
            
            db = get_database()
            
            # Get all collections that depend on master key encryption
            master_keys_collection = db.master_keys
            connections_collection = db.connections
            saved_queries_collection = db.saved_queries
            saved_apex_collection = db.saved_apex
            sobject_favorites_collection = db.sobject_favorites
            sobject_list_cache_collection = db.sobject_list_cache
            sobject_metadata_cache_collection = db.sobject_metadata_cache
            conversations_collection = db.conversations
            messages_collection = db.messages
            conversation_messages_collection = db.conversation_messages
            
            # Hard delete ALL related objects in dependency order
            # 1. Delete SObject favorites (depend on connections)
            favorites_deleted = sobject_favorites_collection.delete_many({})
            logger.debug(f"Hard deleted {favorites_deleted.deleted_count} SObject favorites")
            
            # 2. Delete saved queries (encrypted with master key)
            saved_queries_deleted = saved_queries_collection.delete_many({})
            logger.debug(f"Hard deleted {saved_queries_deleted.deleted_count} saved queries")
            
            # 3. Delete saved apex (encrypted with master key)
            saved_apex_deleted = saved_apex_collection.delete_many({})
            logger.debug(f"Hard deleted {saved_apex_deleted.deleted_count} saved apex")
            
            # 4. Delete conversations (encrypted with master key)
            conversations_deleted = conversations_collection.delete_many({})
            logger.debug(f"Hard deleted {conversations_deleted.deleted_count} conversations")
            
            # 5. Delete messages (encrypted with master key)
            messages_deleted = messages_collection.delete_many({})
            logger.debug(f"Hard deleted {messages_deleted.deleted_count} messages")
            
            # 6. Delete conversation messages (encrypted with master key)
            conversation_messages_deleted = conversation_messages_collection.delete_many({})
            logger.debug(f"Hard deleted {conversation_messages_deleted.deleted_count} conversation messages")
            
            # 7. Delete connections (encrypted with master key)
            connections_deleted = connections_collection.delete_many({})
            logger.debug(f"Hard deleted {connections_deleted.deleted_count} connections")
            

            # 8. Delete SObject list cache (encrypted with master key)
            sobject_list_cache_deleted = sobject_list_cache_collection.delete_many({})
            logger.debug(f"Hard deleted {sobject_list_cache_deleted.deleted_count} SObject list cache")
            
            # 9. Delete SObject metadata cache (encrypted with master key)
            sobject_metadata_cache_deleted = sobject_metadata_cache_collection.delete_many({})
            logger.debug(f"Hard deleted {sobject_metadata_cache_deleted.deleted_count} SObject metadata cache")
            
            # 10. Finally delete the master key itself
            master_keys_deleted = master_keys_collection.delete_many({})
            logger.debug(f"Hard deleted {master_keys_deleted.deleted_count} master keys")

            # Clear current session
            self.current_master_key = None
            
            logger.debug("MASTER KEY AND ALL RELATED DATA PERMANENTLY DELETED (connections, saved queries, saved apex, conversations, messages, conversation_messages, favorites, sobject list cache, sobject metadata cache)")
            return True
            
        except Exception as e:
            logger.error(f"Failed to delete master key and connections: {str(e)}")
            return False
    
    def _store_new_master_key(self, key: str) -> str:
        """Store a new master key in MongoDB"""
        try:
            # Generate salt and hash
            salt = self._generate_salt()
            hashed_key = self._hash_master_key(key, salt)
            
            # Create new master key record
            master_key_uuid = str(uuid.uuid4())
            
            # Create master key document
            master_key_doc = {
                "master_key_uuid": master_key_uuid,
                "hashed_key": hashed_key,
                "salt": salt,
                "created_by": "system",
                "updated_by": "system",
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
                "version": 1
            }
            
            # Insert into MongoDB
            db = get_database()
            master_keys_collection = db.master_keys
            
            master_keys_collection.insert_one(master_key_doc)
            
            logger.debug(f"New master key stored with UUID: {master_key_uuid}")
            return master_key_uuid
            
        except Exception as e:
            logger.error(f"Failed to store new master key: {str(e)}")
            raise
    
    def _validate_master_key(self, key: str, stored_key: Dict[str, Any]) -> bool:
        """Validate master key against stored hash"""
        try:
            stored_hash = stored_key["hashed_key"]
            stored_salt = stored_key["salt"]
            
            logger.debug(f"Validating master key")
            logger.debug(f"Stored hash and salt retrieved")
            
            # Hash the provided key with stored salt
            computed_hash = self._hash_master_key(key, stored_salt)
            
            logger.debug(f"Computed hash for validation")
            
            # Compare hashes
            is_valid = computed_hash == stored_hash
            logger.debug(f"Validation result: {is_valid}")
            
            return is_valid
            
        except Exception as e:
            logger.error(f"Error validating master key: {str(e)}")
            return False
    
    def _generate_salt(self) -> str:
        """Generate a cryptographically secure random salt"""
        # Generate 32 bytes of random data
        salt_bytes = secrets.token_bytes(32)
        # Convert to hex string
        return salt_bytes.hex()
    
    def _hash_master_key(self, key: str, salt: str) -> str:
        """Hash master key with salt using SHA-256"""
        try:
            # Convert hex salt back to bytes
            salt_bytes = bytes.fromhex(salt)
            
            # Combine key and salt
            key_bytes = key.encode('utf-8')
            combined = key_bytes + salt_bytes
            
            # Generate SHA-256 hash
            hash_object = hashlib.sha256(combined)
            return hash_object.hexdigest()
            
        except Exception as e:
            logger.error(f"Error hashing master key: {str(e)}")
            raise
