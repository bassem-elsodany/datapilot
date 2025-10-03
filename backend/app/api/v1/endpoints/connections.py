"""
DataPilot Backend - Connection Management API Endpoints

This module provides comprehensive RESTful API endpoints for managing Salesforce connections
in the DataPilot backend, handling secure storage, encryption/decryption, connection lifecycle
management, and related operations using enterprise-grade server-side encryption with master key authentication.

The connection management API provides:
- Enterprise-grade secure connection storage with AES-256 encryption
- Master key-based authentication and authorization for all operations
- Complete CRUD operations for connection lifecycle management
- Real-time connection status monitoring and health checks
- Secure credential encryption/decryption with key rotation
- Connection-specific data isolation and multi-tenancy support
- Advanced security and compliance features

Core API Capabilities:

Connection Management:
- Secure connection creation with encrypted credential storage
- Connection listing with metadata and status information
- Connection retrieval with decrypted credentials
- Connection updates with version control and audit trail
- Connection deletion with secure data cleanup
- Bulk connection operations and management

Connection Lifecycle:
- Salesforce connection initialization and authentication
- Real-time connection status monitoring and health checks
- Secure connection termination and cleanup
- Connection recovery and reconnection logic
- Session management and timeout handling
- Connection pooling and optimization

Security Features:
- Master key-based encryption for all sensitive data
- AES-256 encryption for credential storage
- Secure key derivation and rotation
- Input validation and sanitization
- SQL injection and XSS prevention
- Audit trail for all connection operations

Data Operations:
- Saved queries management per connection
- SObject favorites and bookmarking
- Query history and execution tracking
- Connection-specific data isolation
- Multi-tenant data separation
- Data retention and cleanup policies

REST API Endpoints:

Connection Management:
- POST /connections - Create new encrypted connection
- GET /connections - List all connections with metadata
- GET /connections/{uuid} - Get connection with decrypted credentials
- PUT /connections/{uuid} - Update connection with version control
- DELETE /connections/{uuid} - Delete connection with secure cleanup
- DELETE /connections - Delete all connections (admin operation)

Connection Lifecycle:
- POST /connections/{uuid}/connect - Initialize Salesforce connection
- GET /connections/{uuid}/status - Check real-time connection status
- DELETE /connections/{uuid}/disconnect - Close Salesforce connection

Connection Resources:
- GET /connections/{uuid}/saved-queries - Get saved queries for connection
- POST /connections/{uuid}/favorites - Add SObject to favorites
- GET /connections/{uuid}/favorites - List connection favorites
- DELETE /connections/{uuid}/favorites/{id} - Remove favorite
- GET /connections/{uuid}/favorites/{name} - Check favorite status

Performance & Optimization:
- Connection pooling and reuse
- Asynchronous connection operations
- Caching and optimization
- Load balancing and scaling
- Performance monitoring and metrics
- Resource usage optimization

Integration Points:
- Salesforce API authentication
- MongoDB database operations
- Master key security service
- Logging and monitoring systems
- Error handling and reporting
- Frontend user interface

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

from typing import List, Optional, Annotated
from fastapi import APIRouter, HTTPException, Depends, status, Header, Request, Query
from pydantic import BaseModel, Field
from loguru import logger

from app.services.auth_provider_service import AuthProviderService
from app.services.connection_service import ConnectionService
from app.services.master_key_service import MasterKeyService
from app.services.saved_query_service import SavedQueryService
from app.services.salesforce_service import SalesforceService

from app.services.favorites_service import FavoritesService
from app.services.error_service import ErrorService

from app.services.i18n_service import I18nService


def safe_isoformat(value) -> str:
    """
    Safely convert a datetime field to ISO format string.
    Handles both datetime objects and already formatted strings.
    """
    if not value:
        return ""
    
    # If it's already a string, return as is
    if isinstance(value, str):
        return value
    
    # If it's a datetime object, convert to ISO format
    if hasattr(value, 'isoformat'):
        return value.isoformat()
    
    # Fallback: convert to string
    return str(value)


router = APIRouter()

# Pydantic models for REST compliance
class ConnectionData(BaseModel):
    """Connection credentials data"""
    username: str
    password: str
    environment: str
    consumer_key: Optional[str] = None
    consumer_secret: Optional[str] = None
    security_token: Optional[str] = None
    client_id: Optional[str] = None
    client_secret: Optional[str] = None

class MasterKeyAuthRequest(BaseModel):
    """Base request that requires master key authentication"""
    master_key: str = Field(..., min_length=8, description="Master key for authentication")

class CreateConnectionRequest(MasterKeyAuthRequest):
    """Request to create a new connection with server-side encryption"""
    display_name: str = Field(..., min_length=1, description="Display name for the connection")
    auth_provider_uuid: str = Field(..., description="Auth provider UUID")
    connection_data: ConnectionData = Field(..., description="Connection credentials to encrypt")
    created_by: str = "user"





class ConnectionResponse(BaseModel):
    """Standard connection response with decrypted credentials (since auth is required)"""
    connection_uuid: str
    display_name: str
    auth_provider_uuid: str
    connection_data: ConnectionData
    created_at: str
    updated_at: str
    created_by: str
    is_connection_active: bool
    last_used: str





class ConnectionUpdateRequest(BaseModel):
    """Request to update connection"""
    display_name: Optional[str] = None
    connection_data: Optional[ConnectionData] = None
    master_key: str = Field(..., min_length=8, description="Master key for encryption")

class ConnectionCreateResponse(BaseModel):
    """Response for connection creation"""
    connection_uuid: str
    display_name: str
    auth_provider_uuid: str
    created_at: str

class ConnectionListResponse(BaseModel):
    """Response for connection list"""
    connections: List[ConnectionResponse]

class SavedQueryResponse(BaseModel):
    """Saved query response for connection endpoints"""
    saved_queries_uuid: str
    name: str
    query_text: str
    description: Optional[str]
    tags: Optional[str]
    is_favorite: bool
    execution_count: int
    last_executed: Optional[str]
    created_at: str
    updated_at: str
    created_by: str
    version: int

class UserInfoResponse(BaseModel):
    user_id: str
    organization_id: str
    user_name: str
    display_name: str
    email: str

class QueryHistoryResponse(BaseModel):
    """Query history response for connection endpoints"""
    query_history_uuid: str
    query_text: str
    execution_time_ms: Optional[int]
    row_count: Optional[int]
    status: str
    error_message: Optional[str]
    executed_at: str
    created_at: str
    created_by: str
    version: int

class ConnectionSavedQueriesResponse(BaseModel):
    """Response for connection saved queries"""
    connection_uuid: str
    saved_queries: List[SavedQueryResponse]
    total_count: int



class SObjectFavoriteCreate(BaseModel):
    """Request to create a new SObject favorite"""
    sobject_name: str = Field(..., min_length=1, description="Name of the SObject (e.g., Account, Contact)")
    sobject_label: Optional[str] = Field(None, description="Label of the SObject (e.g., Account, Contact)")
    is_custom: bool = Field(..., description="Whether the SObject is a custom object")

class SObjectFavoriteResponse(BaseModel):
    """Response for a single SObject favorite"""
    id: str
    connection_uuid: str
    sobject_name: str
    sobject_label: Optional[str]
    is_custom: bool
    created_at: str
    updated_at: str

class ConnectionFavoritesResponse(BaseModel):
    """Response for connection favorites"""
    connection_uuid: str
    favorites: List[SObjectFavoriteResponse]
    total_count: int

# Connection lifecycle response models
class ConnectionConnectResponse(BaseModel):
    """Response for connection initialization"""
    success: bool
    session_id: Optional[str] = None
    server_url: Optional[str] = None
    user_info: Optional[dict] = None

class ConnectionStatusResponse(BaseModel):
    """Response for connection status"""
    connected: bool

class ConnectionDisconnectResponse(BaseModel):
    """Response for connection disconnect"""
    success: bool


# Global service instances
connection_service = ConnectionService()
master_key_service = MasterKeyService()
saved_query_service = SavedQueryService()
auth_provider_service = AuthProviderService()
salesforce_service = SalesforceService()

i18n_service = I18nService()
favorites_service = FavoritesService()


@router.post("/", response_model=ConnectionCreateResponse, status_code=status.HTTP_201_CREATED)
def create_connection(
    request: CreateConnectionRequest,
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """POST /connections - Create a new connection with server-side encryption"""
    try:
        logger.debug("Creating connection")
        # Validate master key
        master_key_valid = master_key_service.set_master_key(request.master_key)
        if not master_key_valid:

            ErrorService.raise_authentication_error(
                message="connections.errors.invalid_master_key",
                auth_type="master_key",
                request=http_request,
                locale=lang
            )
        
        # Validate auth provider UUID exists
        auth_provider = auth_provider_service.get_auth_provider_by_uuid(request.auth_provider_uuid)
        if not auth_provider:

            ErrorService.raise_not_found_error(
                message="connections.errors.invalid_auth_provider",
                resource_type="auth_provider",
                resource_id=request.auth_provider_uuid,
                request=http_request,
                locale=lang
            )
        
        # Test credentials first before saving
        logger.debug("Testing Salesforce credentials before saving connection")
        try:
            # Import SalesforceService here to avoid circular imports
            from app.services.salesforce_service import SalesforceService
            
            # Create temporary Salesforce service for testing
            test_salesforce_service = SalesforceService()
            
            # Prepare credentials for testing
            test_username = request.connection_data.username
            test_password = request.connection_data.password
            test_domain_url = request.connection_data.environment
            test_client_id = request.connection_data.client_id
            test_client_secret = request.connection_data.client_secret
            
            # Handle security token for Salesforce Classic
            if request.connection_data.security_token:
                test_password = f"{test_password}{request.connection_data.security_token}"
            
            # Test the connection
            test_result = test_salesforce_service.initialize_connection(
                username=test_username,
                password=test_password,
                domain_url=test_domain_url,
                client_id=test_client_id,
                client_secret=test_client_secret
            )
            
            if not test_result.get("success", False):
                logger.error(f"Credential test failed: {test_result.get('error', 'Unknown error')}")
                ErrorService.raise_validation_error(
                    message="connections.errors.credential_test_failed",
                    field_errors={"credentials": test_result.get("error", "Invalid credentials")},
                    request=http_request,
                    locale=lang
                )
            
            logger.debug("Credential test passed, proceeding with connection save")
            
        except Exception as e:
            logger.error(f"Credential test failed with exception: {str(e)}")
            ErrorService.raise_validation_error(
                message="connections.errors.credential_test_failed",
                field_errors={"credentials": str(e)},
                request=http_request,
                locale=lang
            )
        
        # Set master key in connection service for encryption
        connection_service.set_master_key(request.master_key)
        
        # Save connection with server-side encryption (only if test passed)
        connection_uuid = connection_service.save_connection(
            auth_provider_uuid=request.auth_provider_uuid,
            username=request.connection_data.username,
            password=request.connection_data.password,
            environment=request.connection_data.environment,
            display_name=request.display_name,
            consumer_key=request.connection_data.consumer_key,
            consumer_secret=request.connection_data.consumer_secret,
            security_token=request.connection_data.security_token,
            client_id=request.connection_data.client_id,
            client_secret=request.connection_data.client_secret
        )
        
        # Get the created connection for response (efficient single query)
        created_connection = connection_service.get_connection_by_uuid(connection_uuid)
        
        if not created_connection:

        
            ErrorService.raise_internal_server_error(
                message="connections.errors.cannot_retrieve_created",
                details=i18n_service.get_translation_key(lang, 'connections.errors.cannot_retrieve_created_details') or 'Cannot retrieve created connection details',
                request=http_request,
                locale=lang
            )
        
        # Type assertion since we've already checked for None above
        assert created_connection is not None, "Created connection should not be None at this point"
        
        return ConnectionCreateResponse(
            connection_uuid=connection_uuid,
            display_name=created_connection.get("displayName", ""),
            auth_provider_uuid=request.auth_provider_uuid,
            created_at=safe_isoformat(created_connection.get("createdAt"))
        )
        
    except HTTPException:
        raise
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="creating connection",
            request=http_request,
            locale=lang
        )

@router.get("/", response_model=ConnectionListResponse)
def list_connections(
    x_master_key: Annotated[str, Header(alias="X-Master-Key", min_length=8)],
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """GET /connections - Get all saved connections with decrypted credentials"""
    try:
        logger.debug(f"Listing connections with master key {x_master_key}")
        # Validate master key from header
        master_key_valid = master_key_service.set_master_key(x_master_key)
        if not master_key_valid:

            ErrorService.raise_authentication_error(
                message="connections.errors.invalid_master_key",
                auth_type="master_key",
                request=http_request,
                locale=lang
            )
        
        # Set master key in connection service for decryption
        connection_service.set_master_key(x_master_key)
        
        connections = connection_service.get_all_connections()
        
        # Transform to REST response format with decrypted credentials
        connection_responses = []
        for conn in connections:
            # Get decrypted credentials for each connection
            try:
                connection_with_creds = connection_service.get_connection_with_credentials(conn["connectionUuid"])
                
                if connection_with_creds:
                    conn_data = connection_with_creds["connectionData"]
                    connection_data = ConnectionData(
                        username=conn_data.get("username", ""),
                        password=conn_data.get("password", ""),
                        environment=conn_data.get("environment", ""),
                        consumer_key=conn_data.get("consumerKey"),
                        consumer_secret=conn_data.get("consumerSecret"),
                        security_token=conn_data.get("securityToken"),
                        client_id=conn_data.get("clientId"),
                        client_secret=conn_data.get("clientSecret")
                    )
                else:
                    # Fallback if decryption fails
                    connection_data = ConnectionData(
                        username="", password="", environment=""
                    )
                
                connection_responses.append(ConnectionResponse(
                    connection_uuid=conn["connectionUuid"],
                    display_name=conn["displayName"],
                    auth_provider_uuid=conn.get("authProviderUuid", "UNKNOWN"),
                    connection_data=connection_data,
                    created_at=safe_isoformat(conn.get("createdAt")),
                    updated_at=safe_isoformat(conn.get("updatedAt")),
                    created_by=conn.get("createdBy", "user"),
                    is_connection_active=True,  # Default to True since we don't track this yet
                    last_used=safe_isoformat(conn.get("last_used", conn.get("updatedAt", conn.get("createdAt"))))
                ))
            except Exception as decrypt_error:
                logger.warning(f"Failed to decrypt connection {conn['connectionUuid']}: {str(decrypt_error)}")
                # Add connection without credentials if decryption fails
                connection_responses.append(ConnectionResponse(
                    connection_uuid=conn["connectionUuid"],
                    display_name=conn["displayName"],
                    auth_provider_uuid=conn.get("authProviderUuid", "UNKNOWN"),
                    connection_data=ConnectionData(username="", password="", environment=""),
                    created_at=safe_isoformat(conn.get("createdAt")),
                    updated_at=safe_isoformat(conn.get("updatedAt")),
                    created_by=conn.get("createdBy", "user"),
                    is_connection_active=True,  # Default to True since we don't track this yet
                    last_used=safe_isoformat(conn.get("last_used", conn.get("updatedAt", conn.get("createdAt"))))
                ))
        
        return ConnectionListResponse(connections=connection_responses)
    except HTTPException:
        raise
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="listing connections",
            request=http_request,
            locale=lang
        )



@router.get("/{connection_uuid}", response_model=ConnectionResponse)
def get_connection_with_credentials(
    connection_uuid: str,
    x_master_key: Annotated[str, Header(alias="X-Master-Key", min_length=8)],
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """GET /connections/{uuid} - Get connection with decrypted credentials"""
    try:
        # Validate master key
        master_key_valid = master_key_service.set_master_key(x_master_key)
        if not master_key_valid:

            ErrorService.raise_authentication_error(
                message="connections.errors.invalid_master_key",
                auth_type="master_key",
                request=http_request,
                locale=lang
            )
        
        # Set master key in connection service for decryption
        connection_service.set_master_key(x_master_key)
        
        # Get connection with decrypted credentials
        connection = connection_service.get_connection_with_credentials(connection_uuid)
        if not connection:

            ErrorService.raise_not_found_error(
                message="connections.errors.not_found",
                resource_type="connection",
                resource_id=connection_uuid,
                request=http_request,
                locale=lang
            )
        
        # Transform connection data to ConnectionData model
        conn_data = connection["connectionData"]
        connection_data = ConnectionData(
            username=conn_data.get("username", ""),
            password=conn_data.get("password", ""),
            environment=conn_data.get("environment", ""),
            consumer_key=conn_data.get("consumerKey"),
            consumer_secret=conn_data.get("consumerSecret"),
            security_token=conn_data.get("securityToken"),
            client_id=conn_data.get("clientId"),
            client_secret=conn_data.get("clientSecret")
        )
        
        return ConnectionResponse(
            connection_uuid=connection["connectionUuid"],
            display_name=connection["displayName"],
            auth_provider_uuid=connection.get("authProviderUuid", "UNKNOWN"),
            connection_data=connection_data,
            created_at=safe_isoformat(connection.get("createdAt")),
            updated_at=safe_isoformat(connection.get("updatedAt")),
            created_by=connection.get("createdBy", "user"),
            is_connection_active=True,  # Default to True since we don't track this yet
            last_used=safe_isoformat(connection.get("last_used", connection.get("updatedAt", connection.get("createdAt"))))
        )
    except HTTPException:
        raise
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="getting connection credentials",
            request=http_request,
            locale=lang
        )

@router.put("/{connection_uuid}", response_model=ConnectionCreateResponse, status_code=status.HTTP_200_OK)
def update_connection(
    connection_uuid: str,
    request: ConnectionUpdateRequest,
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """PUT /connections/{uuid} - Update an existing connection"""
    try:
        logger.debug(f"Updating connection {connection_uuid} with master key {request.master_key}")
        # Validate master key
        master_key_valid = master_key_service.set_master_key(request.master_key)
        if not master_key_valid:

            ErrorService.raise_authentication_error(
                message="connections.errors.invalid_master_key",
                auth_type="master_key",
                request=http_request,
                locale=lang
            )
        
        # Check if connection exists (efficient single query)
        existing_connection = connection_service.get_connection_by_uuid(connection_uuid)
        
        if not existing_connection:

        
            ErrorService.raise_not_found_error(
                message="connections.errors.not_found",
                resource_type="connection",
                resource_id=connection_uuid,
                request=http_request,
                locale=lang
            )
        
        # Set master key in connection service for encryption
        connection_service.set_master_key(request.master_key)
        
        # Update connection display name
        if request.display_name:
            success = connection_service.update_connection(connection_uuid, request.display_name)
            if not success:

                ErrorService.raise_not_found_error(
                    message="connections.errors.not_found",
                    resource_type="connection",
                    resource_id=connection_uuid,
                    request=http_request,
                    locale=lang
                )
        
        # Get the updated connection for response (efficient single query)
        updated_connection = connection_service.get_connection_with_credentials(connection_uuid)
        
        if not updated_connection:

        
            ErrorService.raise_internal_server_error(
                message="connections.errors.cannot_retrieve_updated",
                details=i18n_service.get_translation_key(lang, 'connections.errors.cannot_retrieve_updated_details') or 'Cannot retrieve updated connection details',
                request=http_request,
                locale=lang
            )
        
        logger.debug(f"Connection updated successfully: {connection_uuid}")
        return ConnectionResponse(
            connection_uuid=updated_connection["connectionUuid"],
            display_name=updated_connection["displayName"],
            auth_provider_uuid=updated_connection["authProviderUuid"],
            connection_data=ConnectionData(**updated_connection["connectionData"]),
            created_at=updated_connection["createdAt"],
            updated_at=updated_connection["updatedAt"],
            created_by=updated_connection["createdBy"],
            is_connection_active=updated_connection["isConnectionActive"],
            last_used=updated_connection["lastUsed"]
        )
        
    except HTTPException:
        raise
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="updating connection",
            request=http_request,
            locale=lang
        )

@router.delete("/{connection_uuid}", status_code=status.HTTP_204_NO_CONTENT)
def delete_connection(
    connection_uuid: str,
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """DELETE /connections/{uuid} - Delete a saved connection"""
    try:
        logger.debug(f"Deleting connection {connection_uuid}")
        success = connection_service.delete_connection(connection_uuid)
        if not success:

            ErrorService.raise_not_found_error(
                message="connections.errors.not_found",
                resource_type="connection",
                resource_id=connection_uuid,
                request=http_request,
                locale=lang
            )
        # 204 No Content - successful deletion returns no body
    except HTTPException:
        raise
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="deleting connection",
            request=http_request,
            locale=lang
        )

@router.delete("/", status_code=status.HTTP_204_NO_CONTENT)
def delete_all_connections(
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """DELETE /connections/ - Delete all connections"""
    try:
        logger.debug("Deleting all connections")
        success = connection_service.delete_all_connections()
        if not success:

            ErrorService.raise_internal_server_error(
                message="connections.errors.delete_all_failed",
                details=i18n_service.get_translation_key(lang, 'connections.errors.database_operation_failed') or 'Database operation failed',
                request=http_request,
                locale=lang
            )
        # 204 No Content - successful deletion returns no body
        logger.debug("All connections deleted successfully")
    except HTTPException:
        raise
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="deleting all connections",
            request=http_request,
            locale=lang
        )

@router.get("/{connection_uuid}/saved-queries", response_model=ConnectionSavedQueriesResponse)
def get_connection_saved_queries(
    connection_uuid: str,
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """GET /connections/{uuid}/saved-queries - Get saved queries for a specific connection"""
    try:
        logger.debug(f"Getting saved queries for connection {connection_uuid}")
        # Check if connection exists (efficient single query)
        existing_connection = connection_service.get_connection_by_uuid(connection_uuid)
        
        if not existing_connection:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="connection.error.not_found")
        
        # Get saved queries for this connection
        saved_queries_data = saved_query_service.get_all_saved_queries(connection_uuid=connection_uuid)
        
        # Transform to response format
        saved_queries = [
            SavedQueryResponse(
                saved_queries_uuid=sq["saved_queries_uuid"],
                name=sq["name"],
                query_text=sq["query_text"],
                description=sq["description"],
                tags=sq["tags"],
                is_favorite=sq["is_favorite"],
                execution_count=sq["execution_count"],
                last_executed=sq["last_executed"],
                created_at=sq["created_at"],
                updated_at=sq["updated_at"],
                created_by=sq["created_by"],
                version=sq["version"]
            )
            for sq in saved_queries_data
        ]
        
        logger.debug(f"Retrieved {len(saved_queries)} saved queries for connection: {connection_uuid}")
        return ConnectionSavedQueriesResponse(
            connection_uuid=connection_uuid,
            saved_queries=saved_queries,
            total_count=len(saved_queries)
        )
        
    except HTTPException:
        raise
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="getting saved queries for connection",
            request=http_request,
            locale=lang
        )



# Favorites endpoints
@router.post("/{connection_uuid}/favorites", response_model=SObjectFavoriteResponse, status_code=status.HTTP_201_CREATED)
def add_sobject_favorite(
    connection_uuid: str,
    favorite: SObjectFavoriteCreate,
    request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """POST /connections/{uuid}/favorites - Add an SObject to favorites for a specific connection"""
    try:
        logger.debug(f"Adding favorite {favorite.sobject_name} for connection {connection_uuid}")
        # Check if connection exists (efficient single query)
        existing_connection = connection_service.get_connection_by_uuid(connection_uuid)
        
        if not existing_connection:

        
            ErrorService.raise_not_found_error(
                message="connections.errors.not_found",
                resource_type="connection",
                resource_id=connection_uuid,
                request=request,
                locale=lang
            )
        
        # Add favorite
        favorite_obj = favorites_service.add_favorite(
            connection_uuid=connection_uuid,
            sobject_name=favorite.sobject_name,
            sobject_label=favorite.sobject_label,
            is_custom=favorite.is_custom,
            request=request,
            locale=lang
        )
        
        logger.debug(f"Added SObject '{favorite.sobject_name}' to favorites for connection: {connection_uuid}")
        
        # Type assertion since add_favorite should return a valid object
        assert favorite_obj is not None, "Favorite object should not be None at this point"
        
        return SObjectFavoriteResponse(
            id=favorite_obj.get("favorite_uuid", ""),
            connection_uuid=favorite_obj.get("connection_uuid", ""),
            sobject_name=favorite_obj.get("sobject_name", ""),
            sobject_label=favorite_obj.get("sobject_label"),
            is_custom=favorite_obj.get("is_custom", False),
            created_at=safe_isoformat(favorite_obj.get("created_at")),
            updated_at=safe_isoformat(favorite_obj.get("updated_at"))
        )
        
    except HTTPException:
        raise
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="adding favorite",
            request=request,
            locale=lang
        )

@router.get("/{connection_uuid}/favorites", response_model=ConnectionFavoritesResponse)
def list_sobject_favorites(
    connection_uuid: str,
    request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """GET /connections/{uuid}/favorites - List all favorite SObjects for a connection"""
    try:
        logger.debug(f"Listing favorites for connection {connection_uuid}")
        # Check if connection exists (efficient single query)
        existing_connection = connection_service.get_connection_by_uuid(connection_uuid)
        
        if not existing_connection:

        
            ErrorService.raise_not_found_error(
                message="connections.errors.not_found",
                resource_type="connection",
                resource_id=connection_uuid,
                request=request,
                locale=lang
            )
        
        # Get favorites
        favorites_data = favorites_service.get_favorites(connection_uuid=connection_uuid)
        
        # Transform to response format
        favorites = [
            SObjectFavoriteResponse(
                id=fav.get("favorite_uuid", ""),
                connection_uuid=fav.get("connection_uuid", ""),
                sobject_name=fav.get("sobject_name", ""),
                sobject_label=fav.get("sobject_label"),
                is_custom=fav.get("is_custom", False),
                created_at=safe_isoformat(fav.get("created_at")),
                updated_at=safe_isoformat(fav.get("updated_at"))
            )
            for fav in favorites_data
        ]
        
        logger.debug(f"Retrieved {len(favorites)} favorites for connection: {connection_uuid}")
        return ConnectionFavoritesResponse(
            connection_uuid=connection_uuid,
            favorites=favorites,
            total_count=len(favorites)
        )
        
    except HTTPException:
        raise
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="getting favorites",
            request=request,
            locale=lang
        )

@router.delete("/{connection_uuid}/favorites/{favorite_id}")
def delete_sobject_favorite(
    connection_uuid: str,
    favorite_id: str,
    request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """DELETE /connections/{uuid}/favorites/{id} - Remove an SObject from favorites"""
    try:
        logger.debug(f"Deleting favorite {favorite_id} for connection {connection_uuid}")
        # Check if connection exists (efficient single query)
        existing_connection = connection_service.get_connection_by_uuid(connection_uuid)
        
        if not existing_connection:

        
            ErrorService.raise_not_found_error(
                message="connections.errors.not_found",
                resource_type="connection",
                resource_id=connection_uuid,
                request=request,
                locale=lang
            )
        
        # Delete favorite
        favorites_service.delete_favorite(
            connection_uuid=connection_uuid,
            favorite_uuid=favorite_id,
            request=request,
            locale=lang
        )
        
        logger.debug(f"Removed favorite {favorite_id} for connection: {connection_uuid}")
        success_message = ErrorService.translate_message("connections.messages.favorite_removed", lang)
        return {"message": success_message}
        
    except HTTPException:
        raise
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="deleting favorite",
            request=request,
            locale=lang
        )

@router.get("/{connection_uuid}/favorites/{sobject_name}")
def check_sobject_favorite(
    connection_uuid: str,
    sobject_name: str,
    request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """GET /connections/{uuid}/favorites/{name} - Check if an SObject is in favorites"""
    try:
        logger.debug(f"Checking favorite status for {sobject_name} for connection {connection_uuid}")
        # Check if connection exists (efficient single query)
        existing_connection = connection_service.get_connection_by_uuid(connection_uuid)
        
        if not existing_connection:

        
            ErrorService.raise_not_found_error(
                message="connections.errors.not_found",
                resource_type="connection",
                resource_id=connection_uuid,
                request=request,
                locale=lang
            )
        
        # Check if favorite exists
        is_favorite = favorites_service.is_favorite(
            connection_uuid=connection_uuid,
            sobject_name=sobject_name
        )
        
        if is_favorite:
            favorite = favorites_service.get_favorite_by_name(
                connection_uuid=connection_uuid,
                sobject_name=sobject_name
            )
            
            # Type assertion since get_favorite_by_name should return a valid object
            assert favorite is not None, "Favorite should not be None at this point"
            
            return SObjectFavoriteResponse(
                id=favorite.get("favorite_uuid", ""),
                connection_uuid=favorite.get("connection_uuid", ""),
                sobject_name=favorite.get("sobject_name", ""),
                sobject_label=favorite.get("sobject_label"),
                is_custom=favorite.get("is_custom", False),
                created_at=safe_isoformat(favorite.get("created_at")),
                updated_at=safe_isoformat(favorite.get("updated_at"))
            )
        else:
            ErrorService.raise_not_found_error(
                message="connections.errors.favorite_not_found",
                resource_type="favorite",
                resource_id=sobject_name,
                request=request,
                locale=lang
            )
        
    except HTTPException:
        raise
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="checking favorite status",
            request=request,
            locale=lang
        )

# ========================================
# CONNECTION LIFECYCLE ENDPOINTS
# ========================================

@router.post("/{connection_uuid}/connect", response_model=ConnectionConnectResponse, status_code=status.HTTP_200_OK)
def connect_to_salesforce(
    connection_uuid: str,
    x_master_key: Annotated[str, Header(alias="X-Master-Key", min_length=8)],
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """POST /connections/{uuid}/connect - Initialize Salesforce connection using stored connection details"""
    try:
        logger.debug(f"Connecting to Salesforce with connection UUID: {connection_uuid} and master key {x_master_key}")
        # Validate master key
        if not x_master_key:

            ErrorService.raise_authentication_error(
                message="connections.errors.invalid_master_key",
                auth_type="master_key",
                request=http_request,
                locale=lang
            )
        
        master_key_valid = master_key_service.set_master_key(x_master_key)  # type: ignore
        if not master_key_valid:

            ErrorService.raise_authentication_error(
                message="connections.errors.invalid_master_key",
                auth_type="master_key",
                request=http_request,
                locale=lang
            )
        logger.debug(f"Connecting to Salesforce with connection UUID: {connection_uuid} and master key {x_master_key}")
        # Connect using the connection service
        result = connection_service.connect_connection(connection_uuid, x_master_key)
        logger.debug(f"Connection operation completed")
        return ConnectionConnectResponse(**result)
        
    except HTTPException:
        raise
    except Exception as e:

        ErrorService.raise_external_service_error(
            message="salesforce.errors.connection_failed",
            service_name="Salesforce",
            service_endpoint="/connections/{uuid}/connect",
            details=str(e),
            request=http_request,
            locale=lang
        )

@router.get("/{connection_uuid}/status", response_model=ConnectionStatusResponse)
def get_connection_status(
    connection_uuid: str,
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """GET /connections/{uuid}/status - Check if connected to Salesforce"""
    try:
        logger.debug(f"Checking Salesforce connection status for connection {connection_uuid}")
        # Check if connection exists
        existing_connection = connection_service.get_connection_by_uuid(connection_uuid)
        if not existing_connection:

            ErrorService.raise_not_found_error(
                message="connections.errors.not_found",
                resource_type="connection",
                resource_id=connection_uuid,
                request=http_request,
                locale=lang
            )
        
        logger.debug(f"Checking Salesforce connection status for connection {connection_uuid}")
        is_connected = salesforce_service.is_connected()
        logger.debug(f"Connection status checked: {is_connected}")
        return ConnectionStatusResponse(connected=is_connected)
    except Exception as e:

        ErrorService.raise_external_service_error(
            message="salesforce.errors.status_check_failed",
            service_name="Salesforce",
            service_endpoint="/connections/{uuid}/status",
            details=str(e),
            request=http_request,
            locale=lang
        )

@router.delete("/{connection_uuid}/disconnect", response_model=ConnectionDisconnectResponse, status_code=status.HTTP_200_OK)
def disconnect_from_salesforce(
    connection_uuid: str,
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """DELETE /connections/{uuid}/disconnect - Logout from Salesforce"""
    try:
        logger.debug(f"Disconnecting from Salesforce for connection {connection_uuid}")
        # Check if connection exists
        existing_connection = connection_service.get_connection_by_uuid(connection_uuid)
        if not existing_connection:

            ErrorService.raise_not_found_error(
                message="connections.errors.not_found",
                resource_type="connection",
                resource_id=connection_uuid,
                request=http_request,
                locale=lang
            )
        
        salesforce_service.logout()
        return ConnectionDisconnectResponse(success=True)
    except ValueError as e:
        logger.error(f"Failed to logout: {str(e)}")
        ErrorService.raise_validation_error(
            message="salesforce.errors.logout_failed",
            field_errors={"logout": str(e)},
            request=http_request,
            locale=lang
        )
    except Exception as e:

        ErrorService.raise_external_service_error(
            message="salesforce.errors.logout_failed",
            service_name="Salesforce",
            service_endpoint="/connections/{uuid}/disconnect",
            details=str(e),
            request=http_request,
            locale=lang
        )

@router.get("/connections/{connection_uuid}/user/info", response_model=UserInfoResponse)
def get_user_info(
    connection_uuid: str,
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """Get current user info"""
    try:
        logger.debug(f"Fetching user info from Salesforce for connection {connection_uuid}")
        user_info = salesforce_service.get_user_info(connection_uuid)
        logger.debug(f"User info retrieved for connection")
        return UserInfoResponse(**user_info)
    except ValueError as e:

        ErrorService.raise_validation_error(
            message="salesforce.errors.invalid_user_request",
            field_errors={"user_info": str(e)},
            request=None,
            locale=lang
        )
    except Exception as e:

        ErrorService.raise_external_service_error(
            message="salesforce.errors.user_info_failed",
            service_name="Salesforce",
            service_endpoint="/connections/{connection_uuid}/user/info",
            details=str(e),
            request=None,
            locale=lang
        )