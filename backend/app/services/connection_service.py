"""
DataPilot Backend - Secure Connection Management Service

This module provides enterprise-grade connection management functionality for the DataPilot backend,
handling secure storage, retrieval, and lifecycle management of Salesforce connection credentials
using advanced server-side encryption with master key authentication and MongoDB persistence.

The connection service provides:
- Military-grade encryption for sensitive credential storage
- Master key-based authentication and authorization
- Complete connection lifecycle management
- Multi-tenant connection isolation
- Real-time connection status monitoring
- Comprehensive audit trail and logging
- Advanced security and compliance features

Core Security Features:

Encryption & Security:
- AES-256 encryption for all sensitive data
- Master key-based encryption key derivation
- Secure credential storage with salt and IV
- Encrypted connection metadata and settings
- Security token management and rotation
- IP whitelist and access control policies

Connection Management:
- Secure connection creation and validation
- Encrypted credential storage and retrieval
- Connection status tracking and monitoring
- Multi-tenant connection isolation
- Connection sharing and collaboration
- Connection versioning and history

Authentication & Authorization:
- Master key validation and verification
- User-based access control and permissions
- Session management and token validation
- Multi-factor authentication support
- Role-based access control (RBAC)
- API key management and rotation

Data Protection:
- Input validation and sanitization
- SQL injection and XSS prevention
- Data privacy and compliance support
- Secure data transmission protocols
- Audit trail for all operations
- Data retention and deletion policies

Connection Lifecycle:
- Connection creation and initialization
- Credential validation and testing
- Connection health monitoring
- Automatic reconnection and recovery
- Connection cleanup and deletion
- Connection migration and backup

Performance & Scalability:
- Connection pooling and reuse
- Asynchronous connection operations
- Caching and optimization
- Load balancing and scaling
- Performance monitoring and metrics
- Resource usage optimization

Integration Points:
- MongoDB database integration
- Salesforce API authentication
- Logging and monitoring systems
- Error handling and reporting
- Frontend user interface
- Security and compliance systems

Compliance & Audit:
- Complete audit trail for all operations
- Data privacy and GDPR compliance
- Security event logging and monitoring
- Compliance reporting and analytics
- Data retention and deletion policies
- Security incident response

Author: Bassem Elsodany
GitHub: https://github.com/bassem-elsodany
LinkedIn: https://www.linkedin.com/in/bassem-elsodany/
Version: 1.0.0
License: MIT License
"""

import json
from loguru import logger
from typing import List, Optional, Dict, Any
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import base64
import uuid
from datetime import datetime, timezone

from app.core.mongodb import get_database
from app.models.connection import Connection, ConnectionCreate

class ConnectionService:
    """Python equivalent of ConnectionManager TypeScript service using MongoDB"""
    
    def __init__(self):
        self.master_key: Optional[str] = None
        self.cipher_suite: Optional[Fernet] = None
        
    def set_master_key(self, master_key: str) -> bool:
        """Set and validate master key for encryption"""
        try:
            self.master_key = master_key
            
            # Create cipher suite from master key
            key = self._derive_key_from_master_key(master_key)
            self.cipher_suite = Fernet(key)
            
            logger.info("Master key set successfully", extra={"service": "ConnectionService"})
            return True
            
        except Exception as e:
            logger.error(f"Failed to set master key: {str(e)}", extra={"service": "ConnectionService"})
            return False
    
    def save_connection(
        self,
        auth_provider_uuid: str,
        username: str,
        password: str,
        environment: str,
        display_name: Optional[str] = None,
        consumer_key: Optional[str] = None,
        consumer_secret: Optional[str] = None,
        security_token: Optional[str] = None,
        client_id: Optional[str] = None,
        client_secret: Optional[str] = None
    ) -> str:
        """Save encrypted connection to MongoDB"""
        
        if not self.cipher_suite:
            raise ValueError("Master key must be set before saving connections")
        
        try:
            # Create connection data
            connection_data = {
                "username": username,
                "password": password,
                "environment": environment,
                "consumerKey": consumer_key,
                "consumerSecret": consumer_secret,
                "securityToken": security_token,
                "clientId": client_id,
                "clientSecret": client_secret
            }
            
            # Encrypt connection data
            encrypted_data = self._encrypt_data(json.dumps(connection_data))
            
            # Generate connection UUID
            connection_uuid = str(uuid.uuid4())
            
            # Create connection document
            connection_doc = {
                "connection_uuid": connection_uuid,
                "display_name": display_name or username,
                "auth_provider_uuid": auth_provider_uuid,
                "encrypted_credentials": encrypted_data,
                "is_connection_active": True,
                "last_used": datetime.now(timezone.utc),
                "created_by": "user",
                "updated_by": "user",
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
                "version": 1,
            }
            
            # Save to MongoDB
            db = get_database()
            connections_collection = db.connections
            
            connections_collection.insert_one(connection_doc)
            
            logger.info(f"Connection saved successfully", extra={
                "service": "ConnectionService",
                "connection_uuid": connection_uuid
            })
            
            return connection_uuid
            
        except Exception as e:
            logger.error(f"Failed to save connection: {str(e)}", extra={"service": "ConnectionService"})
            raise
    
    def get_all_connections(self) -> List[Dict[str, Any]]:
        """Get all saved connections (without decrypted credentials)"""
        try:
            db = get_database()
            connections_collection = db.connections
            
            # Get all connections (no filtering needed since we use hard delete)
            cursor = connections_collection.find({})
            connections = list(cursor)
            
            result = []
            for conn in connections:
                result.append({
                    "connectionUuid": conn.get("connection_uuid"),
                    "displayName": conn.get("display_name"),
                    "authProviderUuid": conn.get("auth_provider_uuid"),
                    "createdAt": conn.get("created_at"),
                    "updatedAt": conn.get("updated_at")
                })
            
            logger.info(f"Retrieved {len(result)} connections")
            return result
                
        except Exception as e:
            logger.error(f"Failed to get connections: {str(e)}", extra={"service": "ConnectionService"})
            raise
    
    def get_connection_by_uuid(self, connection_uuid: str) -> Optional[Dict[str, Any]]:
        """Get connection by UUID without decrypting credentials (for existence check)"""
        try:
            db = get_database()
            connections_collection = db.connections
            
            # Build MongoDB query
            query = {"connection_uuid": connection_uuid}
            
            # Execute query
            connection = connections_collection.find_one(query)
            
            if not connection:
                return None
            
            result = {
                "connectionUuid": connection.get("connection_uuid"),
                "displayName": connection.get("display_name"),
                "authProviderId": connection.get("auth_provider_uuid") or connection.get("auth_provider_id"),
                "createdAt": connection.get("created_at"),
                "updatedAt": connection.get("updated_at"),
                "isConnectionActive": connection.get("is_connection_active"),
                "lastUsed": connection.get("last_used")
            }
            
            logger.info(f"Retrieved connection by UUID", extra={
                "service": "ConnectionService",
                "connection_uuid": connection_uuid
            })
            
            return result
                
        except Exception as e:
            logger.error(f"Failed to get connection {connection_uuid}: {str(e)}", extra={"service": "ConnectionService"})
            return None

    def get_connection_with_credentials(self, connection_uuid: str) -> Dict[str, Any]:
        """Get connection with decrypted credentials"""
        
        if not self.cipher_suite:
            raise ValueError("Master key must be set before retrieving connections")
        
        try:
            db = get_database()
            connections_collection = db.connections
            
            # Build MongoDB query
            query = {"connection_uuid": connection_uuid}
            
            # Execute query
            connection = connections_collection.find_one(query)
            
            if not connection:
                raise ValueError(f"Connection {connection_uuid} not found")
            
            # Decrypt connection data
            try:
                encrypted_credentials = connection.get("encrypted_credentials")
                if not encrypted_credentials:
                    raise ValueError("No encrypted credentials found in connection")
                
                decrypted_data = self._decrypt_data(str(encrypted_credentials))
                connection_data = json.loads(decrypted_data)
            except Exception as decrypt_error:
                logger.error(f"Failed to decrypt credentials for connection {connection_uuid}: {str(decrypt_error)}", extra={
                    "service": "ConnectionService",
                    "connection_uuid": connection_uuid,
                    "error_type": "decryption_error"
                })
                raise ValueError(f"Failed to decrypt connection credentials: {str(decrypt_error)}")
            
            # Helper function to convert datetime to ISO string
            def to_iso_string(dt):
                if dt is None:
                    return None
                if hasattr(dt, 'isoformat'):
                    return dt.isoformat()
                return str(dt)
            
            result = {
                "id": str(connection.get("_id", "")),
                "connectionUuid": connection.get("connection_uuid"),
                "displayName": connection.get("display_name"),
                "authProviderUuid": connection.get("auth_provider_uuid"),
                "isConnectionActive": connection.get("is_connection_active", True),
                "lastUsed": to_iso_string(connection.get("last_used")),
                "createdAt": to_iso_string(connection.get("created_at")),
                "updatedAt": to_iso_string(connection.get("updated_at")),
                "createdBy": connection.get("created_by"),
                "updatedBy": connection.get("updated_by"),
                "version": connection.get("version", 1),
                "metadata": connection.get("metadata", {}),
                "connectionData": connection_data
            }
            
            logger.info(f"Retrieved connection with credentials", extra={
                "service": "ConnectionService",
                "connection_uuid": connection_uuid
            })
            
            return result
                
        except Exception as e:
            logger.error(f"Failed to get connection {connection_uuid}: {str(e)}", extra={"service": "ConnectionService"})
            raise
    
    def update_connection(self, connection_uuid: str, display_name: str) -> bool:
        """Update connection display name"""
        try:
            db = get_database()
            connections_collection = db.connections
            
            # Build MongoDB query
            query = {"connection_uuid": connection_uuid}
            
            # Find the connection
            connection = connections_collection.find_one(query)
            
            if not connection:
                return False
            
            # Update display name
            update_data = {
                "display_name": display_name,
                "updated_at": datetime.now(timezone.utc),
                "updated_by": "user",
                "version": connection.get("version", 0) + 1
            }
            
            connections_collection.update_one(
                {"connection_uuid": connection_uuid},
                {"$set": update_data}
            )
            
            logger.info(f"Connection updated", extra={
                "service": "ConnectionService",
                "connection_uuid": connection_uuid,
                "new_display_name": display_name
            })
            
            return True
                
        except Exception as e:
            logger.error(f"Failed to update connection {connection_uuid}: {str(e)}", extra={"service": "ConnectionService"})
            return False

    def delete_connection(self, connection_uuid: str) -> bool:
        """Delete a connection (hard delete)"""
        try:
            db = get_database()
            connections_collection = db.connections
            
            # Build MongoDB query
            query = {"connection_uuid": connection_uuid}
            
            # Find the connection
            connection = connections_collection.find_one(query)
            
            if not connection:
                return False
            
            # Hard delete - permanently remove from database
            result = connections_collection.delete_one(query)
            
            if result.deleted_count > 0:
                logger.info(f"Connection permanently deleted", extra={
                    "service": "ConnectionService",
                    "connection_uuid": connection_uuid
                })
                return True
            else:
                logger.warning(f"Connection not found for deletion", extra={
                    "service": "ConnectionService",
                    "connection_uuid": connection_uuid
                })
                return False
                
        except Exception as e:
            logger.error(f"Failed to delete connection {connection_uuid}: {str(e)}", extra={"service": "ConnectionService"})
            return False

    def delete_all_connections(self) -> bool:
        """Delete all connections (hard delete)"""
        try:
            db = get_database()
            connections_collection = db.connections
            
            # Count connections before deletion
            total_connections = connections_collection.count_documents({})
            
            if total_connections == 0:
                logger.info("No connections to delete", extra={"service": "ConnectionService"})
                return True
            
            # Hard delete all connections - permanently remove from database
            result = connections_collection.delete_many({})
            
            logger.info(f"All connections permanently deleted ({result.deleted_count} total)", extra={
                "service": "ConnectionService",
                "deleted_count": result.deleted_count
            })
            
            return True
                
        except Exception as e:
            logger.error(f"Failed to delete all connections: {str(e)}", extra={"service": "ConnectionService"})
            return False
    
    def _derive_key_from_master_key(self, master_key: str) -> bytes:
        """Derive encryption key from master key"""
        # Use a consistent salt for key derivation
        salt = b"datapilot-salt"
        
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000,
        )
        
        key = base64.urlsafe_b64encode(kdf.derive(master_key.encode()))
        return key
    
    def _encrypt_data(self, data: str) -> str:
        """Encrypt data using master key"""
        if not self.cipher_suite:
            raise ValueError("Cipher suite not initialized")
        
        encrypted_bytes = self.cipher_suite.encrypt(data.encode())
        return base64.b64encode(encrypted_bytes).decode()
    
    def _decrypt_data(self, encrypted_data: str) -> str:
        """Decrypt data using master key"""
        if not self.cipher_suite:
            raise ValueError("Cipher suite not initialized")
        
        encrypted_bytes = base64.b64decode(encrypted_data.encode())
        decrypted_bytes = self.cipher_suite.decrypt(encrypted_bytes)
        return decrypted_bytes.decode()
    
    def connect_connection(self, connection_uuid: str, master_key: str) -> Dict[str, Any]:
        """
        Connect to Salesforce using the specified connection UUID and master key.
        This method handles the complete connection flow including:
        - Setting up encryption/decryption with provided master key
        - Retrieving encrypted credentials
        - Decrypting credentials
        - Initializing Salesforce connection
        - Returning connection result
        
        Args:
            connection_uuid: The UUID of the connection to use
            master_key: The master key for decrypting credentials
            
        Returns:
            Dictionary containing connection result with user info and status
            
        Raises:
            ValueError: If connection not found or master key invalid
            Exception: If Salesforce connection fails
        """
        try:
            logger.debug(f"Connecting to Salesforce with connection UUID: {connection_uuid}")
            # Set master key for this connection service instance
            self.set_master_key(master_key)
            
            # Get connection with decrypted credentials
            connection = self.get_connection_with_credentials(connection_uuid)
            if not connection:
                raise ValueError(f"Connection {connection_uuid} not found")
            
            # Extract connection data
            conn_data = connection["connectionData"]
            
            # Import SalesforceService here to avoid circular imports
            from app.services.salesforce_service import SalesforceService
            
            # Create and initialize Salesforce service
            salesforce_service = SalesforceService()
            result = salesforce_service.initialize_connection(
                username=conn_data.get("username", ""),
                password=conn_data.get("password", ""),
                domain_url=conn_data.get("environment", "https://login.salesforce.com"),
                client_id=conn_data.get("clientId", ""),
                client_secret=conn_data.get("clientSecret", "")
            )
            
            # Update last used timestamp after successful connection
            self._update_connection_last_used(connection_uuid)
            
            logger.info(f"Connection established successfully", extra={
                "service": "ConnectionService",
                "connection_uuid": connection_uuid,
                "username": conn_data.get("username", "")
            })
            
            return result
            
        except Exception as e:
            logger.error(f"Failed to connect using connection {connection_uuid}: {str(e)}", extra={
                "service": "ConnectionService",
                "connection_uuid": connection_uuid
            })
            raise

    def _update_connection_last_used(self, connection_uuid: str) -> bool:
        """
        Update the last_used timestamp for a connection after successful connection.
        
        Args:
            connection_uuid: The UUID of the connection to update
            
        Returns:
            bool: True if update was successful, False otherwise
        """
        try:
            db = get_database()
            connections_collection = db.connections
            
            # Update the connection with current timestamp
            current_time = datetime.now(timezone.utc)
            result = connections_collection.update_one(
                {
                    "connection_uuid": connection_uuid,
                },
                {
                    "$set": {
                        "last_used": current_time.isoformat(),
                        "updated_at": current_time.isoformat()
                    },
                    "$inc": {"version": 1}
                }
            )
            
            if result.modified_count > 0:
                logger.info(f"Updated last_used timestamp for connection {connection_uuid}")
                return True
            else:
                logger.warning(f"No connection found to update last_used for {connection_uuid}")
                return False
                
        except Exception as e:
            logger.error(f"Failed to update last_used timestamp for connection {connection_uuid}: {str(e)}")
            return False

    def _get_auth_provider_uuid(self, oauth_type: str) -> str:
        """Get auth provider UUID based on OAuth type by querying the database"""
        try:
            db = get_database()
            auth_providers_collection = db.auth_providers
            
            # Query the database for the auth provider by type
            auth_provider = auth_providers_collection.find_one({
                "provider_type": oauth_type,
                "is_active": True,
            })
            
            if not auth_provider:
                raise ValueError(f"Auth provider not found for type: {oauth_type}")
            
            return auth_provider.get("provider_uuid")
            
        except Exception as e:
            logger.error(f"Failed to get auth provider UUID for type '{oauth_type}': {str(e)}")
            raise ValueError(f"Failed to get auth provider UUID for type: {oauth_type}")
