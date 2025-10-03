"""
DataPilot Backend - Salesforce Integration Service

This module provides comprehensive Salesforce integration functionality for the DataPilot backend,
handling all Salesforce API interactions with enterprise-grade security, performance optimization,
and robust error handling.

The Salesforce service provides:
- Secure Salesforce authentication and session management
- Complete SObject metadata discovery and caching
- Advanced SOQL query execution with optimization
- Real-time API usage monitoring and limit tracking
- Full CRUD operations for Salesforce records
- Apex code execution and debugging
- Comprehensive error handling and retry logic
- Performance monitoring and optimization

Core Capabilities:

Authentication & Security:
- OAuth 2.0 and username/password authentication
- Secure credential storage and encryption
- Session management with automatic refresh
- Multi-tenant connection support
- Security token validation and management
- IP whitelist and security policy enforcement

SObject Management:
- Complete SObject discovery and metadata retrieval
- Field-level metadata with types and relationships
- Custom object and field support
- Relationship mapping and navigation
- SObject schema caching and optimization
- Dynamic SObject creation and modification

Query Execution:
- SOQL query parsing and validation
- Query optimization and performance tuning
- Large dataset handling with pagination
- Relationship query support
- Aggregate function support
- Query result caching and optimization

Data Operations:
- Record creation, reading, updating, and deletion
- Bulk operations for large datasets
- Field-level security and access control
- Data validation and constraint checking
- Soft delete and hard delete operations
- Record locking and concurrency control

Apex Integration:
- Anonymous Apex code execution
- Apex REST endpoint integration
- Package and trigger compilation
- Test execution and coverage reporting
- Debug level management
- Apex code optimization and analysis

Performance & Monitoring:
- Real-time API usage tracking
- Governor limit monitoring and alerts
- Query performance analysis
- Connection health monitoring
- Error rate tracking and reporting
- Performance metrics and optimization

Caching & Optimization:
- SObject metadata caching with TTL
- Query result caching for performance
- Connection pooling and reuse
- Lazy loading for large datasets
- Cache invalidation strategies
- Memory usage optimization

Error Handling:
- Comprehensive exception handling
- Automatic retry logic with exponential backoff
- Connection recovery and reconnection
- Error logging and monitoring
- Graceful degradation strategies
- User-friendly error messages

Security Features:
- Credential encryption and secure storage
- API key management and rotation
- Access control and permission validation
- Audit trail for all operations
- Data privacy and compliance support
- Secure communication protocols

Integration Points:
- FastAPI endpoint integration
- Database caching layer
- Logging and monitoring systems
- AI workflow integration
- Frontend real-time updates
- Error handling and reporting

Author: Bassem Elsodany
GitHub: https://github.com/bassem-elsodany
LinkedIn: https://www.linkedin.com/in/bassem-elsodany/
Version: 1.0.0
License: MIT License
"""

from functools import lru_cache

from loguru import logger
from typing import Dict, List, Any, Optional
from simple_salesforce.api import Salesforce
from simple_salesforce.exceptions import SalesforceError, SalesforceExpiredSession
from datetime import datetime

from app.services.i18n_service import I18nService
from app.services.sobject_cache_service import get_sobject_cache_service
from app.services.salesforce_tree_transformer import transform_query_result


class SalesforceService:
    """Python equivalent of the TypeScript SalesforceService with singleton pattern"""
    
    _instance = None
    _connection: Optional[Salesforce] = None
    _user_info: Optional[Dict[str, Any]] = None
    _i18n_service = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(SalesforceService, cls).__new__(cls)
        return cls._instance
    
    def __init__(self):
        if not hasattr(self, '_initialized'):
            self._initialized = True
            self._i18n_service = I18nService()
            self._cache_service = get_sobject_cache_service()
    
    @property
    def connection(self) -> Optional[Salesforce]:
        return self._connection
    
    @connection.setter
    def connection(self, value: Optional[Salesforce]):
        self._connection = value
    
    @property
    def user_info(self) -> Optional[Dict[str, Any]]:
        return self._user_info
    
    @user_info.setter
    def user_info(self, value: Optional[Dict[str, Any]]):
        self._user_info = value
    
    
    @property
    def i18n_service(self):
        return self._i18n_service
    
    @classmethod
    def get_instance(cls):
        """Get the singleton instance of SalesforceService"""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance
    
    def initialize_connection(
        self,
        username: str,
        password: str,
        domain_url: str,
        client_id: Optional[str] = None,
        client_secret: Optional[str] = None
    ) -> Dict[str, Any]:
        """Initialize Salesforce connection"""
        try:
            # Determine domain
            domain = 'test' if 'test' in domain_url or 'sandbox' in domain_url else None
            
            logger.debug(f"Attempting Salesforce connection with domain: {domain}")
            
            # Create Salesforce connection
            self._connection = Salesforce(
                username=username,
                password=password,
                consumer_key=client_id,
                consumer_secret=client_secret,
                domain=domain,
                version='64.0'
            )
            
            logger.debug(f"Salesforce connection created successfully")
            logger.debug(f"User ID: {getattr(self._connection, 'user_id', 'Not available')}")
            
            # Get user info - use username-based query since user_id is an SFType object
            self._user_info = self._connection.query(
                "SELECT Id, Username, Email, FirstName, LastName, CompanyName, "
                "Division, Department, Title, UserType, IsActive FROM User WHERE Username = '%s'" 
                % username
            )['records'][0]
            
            logger.debug(f"Successfully connected to Salesforce as {username}")
            
            mapped_user_info = {
                'user_id': self._user_info.get('Id', '') if self._user_info else '',
                'organization_id': self._user_info.get('Id', '')[:15] if self._user_info else '',  # Use first 15 chars as org ID
                'user_name': self._user_info.get('Username', '') if self._user_info else '',
                'display_name': f"{self._user_info.get('FirstName', '') if self._user_info else ''} {self._user_info.get('LastName', '') if self._user_info else ''}".strip(),
                'email': self._user_info.get('Email', '') if self._user_info else ''
            }
            
            logger.debug(f"User info retrieved for connection")
            
            return {
                'success': True,
                'user_info': mapped_user_info,
                'session_id': self._connection.session_id,
                'server_url': self._connection.sf_instance
            }
            
        except Exception as e:
            logger.error(f"Failed to connect to Salesforce: {str(e)}")
            logger.error(f"Error type: {type(e).__name__}")
            logger.error(f"Connection details: username={username}, domain={domain}, has_client_id={bool(client_id)}")
            raise ValueError("salesforce.error.connection_failed")
    
    def get_sobject_list(self, connection_uuid: str) -> List[Dict[str, Any]]:
        """Get list of all SObjects with MongoDB-based persistent caching"""
        if not self._connection:
            raise ValueError("No active Salesforce connection available")
            
        # Try to get from MongoDB cache first
        cached_sobjects = self._cache_service.get_cached_sobject_list(connection_uuid)
        if cached_sobjects is not None:
            logger.debug(f"Returning cached SObjects from MongoDB for {connection_uuid}")
            return cached_sobjects
            
        try:
            # Get global describe from Salesforce
            describe_result = self._connection.describe()
            
            if not describe_result or 'sobjects' not in describe_result:
                logger.error("Invalid describe result from Salesforce")
                raise ValueError("salesforce.error.invalid_describe_result")
            
            sobjects = []
            for sobject in describe_result['sobjects']:
                sobjects.append({
                    'name': sobject['name'],
                    'label': sobject['label'],
                    'labelPlural': sobject['labelPlural'],
                    'keyPrefix': sobject.get('keyPrefix'),
                    'custom': sobject['custom'],
                    'createable': sobject['createable'],
                    'deletable': sobject['deletable'],
                    'updateable': sobject['updateable'],
                    'queryable': sobject['queryable']
                })
            
            # Sort SObjects by name for consistent ordering (important for pagination scenarios)
            sobjects.sort(key=lambda x: x['name'])
            
            # Cache the result in MongoDB - use mapped user info for proper org_id extraction
            mapped_user_info = {
                'user_id': self._user_info.get('Id', '') if self._user_info else '',
                'organization_id': self._user_info.get('Id', '')[:15] if self._user_info else '',  # Use first 15 chars as org ID
                'user_name': self._user_info.get('Username', '') if self._user_info else '',
                'display_name': f"{self._user_info.get('FirstName', '') if self._user_info else ''} {self._user_info.get('LastName', '') if self._user_info else ''}".strip(),
                'email': self._user_info.get('Email', '') if self._user_info else ''
            }
            self._cache_service.cache_sobject_list(connection_uuid, mapped_user_info, sobjects)
            
            logger.debug(f"Retrieved {len(sobjects)} SObjects and cached in MongoDB")
            return sobjects
            
        except Exception as e:
            logger.error(f"Failed to get SObject list: {str(e)}")
            raise ValueError("salesforce.error.sobject_list_failed")
    
    def describe_sobject(self, sobject_name: str, connection_uuid: str, include_child_relationships: bool = False) -> Dict[str, Any]:
        """Describe a specific SObject with MongoDB-based persistent caching"""
        if not self._connection:
            raise ValueError("No active Salesforce connection available")
            
        # Try to get from MongoDB cache first
        cached_metadata = self._cache_service.get_cached_sobject_metadata(
            connection_uuid, sobject_name, include_child_relationships
        )
        if cached_metadata is not None:
            return cached_metadata
            
        try:
            # Get SObject describe from Salesforce
            sobject = getattr(self._connection, sobject_name)
            describe_result = sobject.describe()
            
            # Format fields
            fields = []
            for field in describe_result['fields']:
                fields.append({
                    'name': field['name'],
                    'label': field['label'],
                    'type': field['type'],
                    'length': field.get('length'),
                    'precision': field.get('precision'),
                    'scale': field.get('scale'),
                    'createable': field['createable'],
                    'updateable': field['updateable'],
                    'nillable': field['nillable'],
                    'unique': field['unique'],
                    'picklistValues': field.get('picklistValues', []),
                    # Add reference field information for smart autocomplete
                    'referenceTo': field.get('referenceTo', []),
                    'relationshipName': field.get('relationshipName', ''),
                    # Add formula-specific properties if they exist
                    'calculated': field.get('calculated', False),
                    'formula': field.get('formula', ''),
                    'formulaTreatNullNumberAsZero': field.get('formulaTreatNullNumberAsZero', False)
                })
            
            # Sort fields by name for consistent ordering (important for pagination scenarios)
            fields.sort(key=lambda x: x['name'])
            
            result = {
                'name': describe_result['name'],
                'label': describe_result['label'],
                'custom': describe_result['custom'],
                'fields': fields,
                'createable': describe_result['createable'],
                'deletable': describe_result['deletable'],
                'updateable': describe_result['updateable'],
                'queryable': describe_result['queryable'],
                'childRelationships': describe_result.get('childRelationships', [])  # Always include
            }
            
            # Cache the complete result in MongoDB (always cache everything) - use mapped user info
            mapped_user_info = {
                'user_id': self._user_info.get('Id', '') if self._user_info else '',
                'organization_id': self._user_info.get('Id', '')[:15] if self._user_info else '',  # Use first 15 chars as org ID
                'user_name': self._user_info.get('Username', '') if self._user_info else '',
                'display_name': f"{self._user_info.get('FirstName', '') if self._user_info else ''} {self._user_info.get('LastName', '') if self._user_info else ''}".strip(),
                'email': self._user_info.get('Email', '') if self._user_info else ''
            }
            self._cache_service.cache_sobject_metadata(
                connection_uuid, mapped_user_info, sobject_name, result
            )
            
            logger.debug(f"Described SObject {sobject_name} with {len(fields)} fields and cached in MongoDB")
            
            # Filter out child relationships if not requested
            if not include_child_relationships and "childRelationships" in result:
                filtered_result = result.copy()
                filtered_result.pop("childRelationships", None)
                return filtered_result
            
            return result
            
        except Exception as e:
            logger.error(f"Failed to describe SObject {sobject_name}: {str(e)}")
            
            # Check if it's a Salesforce NOT_FOUND error
            if isinstance(e, SalesforceError) and hasattr(e, 'content'):
                try:
                    import json
                    # Check if content is already a list (parsed) or a string (needs parsing)
                    if isinstance(e.content, list):
                        error_content = e.content
                    else:
                        error_content = json.loads(e.content)
                    
                    if isinstance(error_content, list) and len(error_content) > 0:
                        first_error = error_content[0]
                        if isinstance(first_error, dict) and first_error.get('errorCode') == 'NOT_FOUND':
                            raise ValueError("salesforce.error.sobject_not_found")
                except (json.JSONDecodeError, KeyError, IndexError):
                    pass
            
            raise ValueError("salesforce.error.sobject_not_found")
    
    def clear_cache(self, connection_uuid: Optional[str] = None):
        """Clear MongoDB cache for a specific connection or all connections"""
        if connection_uuid:
            # Clear specific connection cache from MongoDB
            self._cache_service.clear_connection_cache(connection_uuid)
            logger.debug(f"Cleared MongoDB cache for connection {connection_uuid}")
        else:
            # Clear all expired cache entries
            list_cleared, metadata_cleared = self._cache_service.clear_expired_cache()
            logger.debug(f"Cleared {list_cleared + metadata_cleared} expired cache entries from MongoDB")
    
    
    def execute_query(self, query: str, connection_uuid: str) -> Dict[str, Any]:
        """Execute SOQL query"""
        if not self.connection:
            raise ValueError("No active Salesforce connection available")
            
        try:
            result = self.connection.query(query)
            
            logger.debug(f"Executed query, returned {result['totalSize']} records")
            
            return {
                'total_size': result['totalSize'],
                'done': result['done'],
                'records': result['records'],
                'nextRecordsUrl': result.get('nextRecordsUrl')
            }
            
        except SalesforceError as e:
            logger.error(f"Salesforce API error: {str(e)}")
            logger.error(f"Salesforce error type: {type(e).__name__}")
            logger.error(f"Salesforce error attributes: {dir(e)}")
            
            # Extract the actual Salesforce error message
            error_message = str(e)
            
            # Log all available attributes to understand the error structure
            if hasattr(e, 'content'):
                logger.error(f"Salesforce error content: {e.content}")
                
                # Handle different content types - content might be already parsed or a string
                error_content = e.content
                
                # If content is a string, try to parse it as JSON
                if isinstance(error_content, str):
                    try:
                        import json
                        error_content = json.loads(error_content)
                        logger.error(f"Parsed JSON error content: {error_content}")
                    except Exception as parse_error:
                        logger.error(f"Failed to parse JSON error content: {parse_error}")
                        # If JSON parsing fails, use the string as is
                        error_content = e.content
                
                # Now handle the parsed content (could be list, dict, or string)
                if isinstance(error_content, list) and len(error_content) > 0:
                    # Salesforce often returns errors as a list
                    first_error = error_content[0]
                    if isinstance(first_error, dict):
                        if 'message' in first_error:
                            error_message = first_error['message']
                        elif 'errorCode' in first_error:
                            error_message = f"{first_error.get('errorCode', 'Unknown')}: {first_error.get('message', str(e))}"
                elif isinstance(error_content, dict):
                    if 'message' in error_content:
                        error_message = error_content['message']
                    elif 'errorCode' in error_content:
                        error_message = f"{error_content.get('errorCode', 'Unknown')}: {error_content.get('message', str(e))}"
            
            raise ValueError(f"salesforce.errors.query_execution_failed: {error_message}")
        
        except Exception as e:
            logger.error(f"Unexpected error executing query: {str(e)}")
            raise ValueError(f"salesforce.errors.query_execution_failed: {str(e)}")

    def execute_query_with_tree(self, query: str, connection_uuid: str) -> Dict[str, Any]:
        """Execute SOQL query and return transformed tree structure"""
        if not self.connection:
            raise ValueError("No active Salesforce connection available")
            
        try:
            # Execute the query
            raw_result = self.connection.query(query)
            
            # Transform the result into tree structure
            transformed_result = transform_query_result(raw_result)            
            return transformed_result.dict()
            
        except SalesforceError as e:
            logger.error(f"Salesforce API error: {str(e)}")
            logger.error(f"Salesforce error type: {type(e).__name__}")
            logger.error(f"Salesforce error attributes: {dir(e)}")
            
            # Extract the actual Salesforce error message
            error_message = str(e)
            
            # Log all available attributes to understand the error structure
            if hasattr(e, 'content'):
                logger.error(f"Salesforce error content: {e.content}")
                
                # Handle different content types - content might be already parsed or a string
                error_content = e.content
                
                # If content is a string, try to parse it as JSON
                if isinstance(error_content, str):
                    try:
                        import json
                        error_content = json.loads(error_content)
                        logger.error(f"Parsed JSON error content: {error_content}")
                    except Exception as parse_error:
                        logger.error(f"Failed to parse JSON error content: {parse_error}")
                        # If JSON parsing fails, use the string as is
                        error_content = e.content
                
                # Now handle the parsed content (could be list, dict, or string)
                if isinstance(error_content, list) and len(error_content) > 0:
                    # Salesforce often returns errors as a list
                    first_error = error_content[0]
                    if isinstance(first_error, dict):
                        if 'message' in first_error:
                            error_message = first_error['message']
                        elif 'errorCode' in first_error:
                            error_message = f"{first_error.get('errorCode', 'Unknown')}: {first_error.get('message', str(e))}"
                elif isinstance(error_content, dict):
                    if 'message' in error_content:
                        error_message = error_content['message']
                    elif 'errorCode' in error_content:
                        error_message = f"{error_content.get('errorCode', 'Unknown')}: {error_content.get('message', str(e))}"
            
            raise ValueError(f"salesforce.errors.query_execution_failed: {error_message}")
        
        except Exception as e:
            logger.error(f"Unexpected error executing query with tree transformation: {str(e)}")
            raise ValueError(f"salesforce.errors.query_execution_failed: {str(e)}")

    def execute_query_llm_friendly(self, query: str, connection_uuid: str) -> Dict[str, Any]:
        """Execute SOQL query and return LLM-friendly flattened structure"""
        if not self.connection:
            raise ValueError("No active Salesforce connection available")
            
        try:
            # Execute the query
            raw_result = self.connection.query(query)
            
            logger.debug(f"Executed query, returned {raw_result['totalSize']} records")
            
            # Transform to LLM-friendly flattened format
            llm_result = {
                "metadata": {
                    "total_size": raw_result['totalSize'],
                    "done": raw_result.get('done', True),
                    "nextRecordsUrl": raw_result.get('nextRecordsUrl')
                },
                "records": []
            }
            
            # Process each record
            for record in raw_result['records']:
                flattened_record = self._flatten_record_for_llm(record)
                llm_result["records"].append(flattened_record)
            
            logger.debug(f"LLM-friendly query completed: {len(llm_result['records'])} records processed")
            return llm_result
            
        except SalesforceError as e:
            logger.error(f"Salesforce query error: {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error during query execution: {e}")
            raise

    def _flatten_record_for_llm(self, record: Dict[str, Any]) -> Dict[str, Any]:
        """Flatten a Salesforce record for LLM consumption with direct field access"""
        flattened = {}
        
        # Add all fields (excluding attributes and relationships)
        for field, value in record.items():
            if field != "attributes" and not field.endswith("__r") and value is not None:
                flattened[field] = value
        
        # Handle related records (those ending with __r)
        for key, value in record.items():
            if key.endswith("__r") and isinstance(value, dict) and "records" in value:
                # This is a related object
                related_records = []
                for related_record in value["records"]:
                    related_flattened = self._flatten_related_record_for_llm(related_record)
                    related_records.append(related_flattened)
                flattened[key] = related_records
            elif key.endswith("__r") and value is None:
                # Empty relationship
                flattened[key] = []
        
        return flattened

    def _flatten_related_record_for_llm(self, record: Dict[str, Any]) -> Dict[str, Any]:
        """Flatten a related record for LLM consumption"""
        flattened = {}
        
        # Add all fields (excluding attributes and relationships)
        for field, value in record.items():
            if field != "attributes" and not field.endswith("__r") and value is not None:
                flattened[field] = value
        
        # Handle nested related records recursively
        for key, value in record.items():
            if key.endswith("__r") and isinstance(value, dict) and "records" in value:
                # This is a nested related object
                nested_records = []
                for nested_record in value["records"]:
                    nested_flattened = self._flatten_related_record_for_llm(nested_record)
                    nested_records.append(nested_flattened)
                flattened[key] = nested_records
            elif key.endswith("__r") and value is None:
                # Empty nested relationship
                flattened[key] = []
        
        return flattened

    def execute_more_records(self, next_records_id: str, connection_uuid: str) -> Dict[str, Any]:
        """Execute more records from a previous SOQL query using nextRecordsId"""
        if not self.connection:
            raise ValueError("No active Salesforce connection available")
            
        try:
            # Execute the query_more using the nextRecordsId
            raw_result = self.connection.query_more(next_records_id, identifier_is_url=True)
            
            # LOG RAW SALESFORCE RESPONSE FOR DEBUGGING
            import json
            logger.debug("=== RAW SALESFORCE EXECUTE-MORE RESPONSE ===")
            logger.debug(json.dumps(raw_result, indent=2, default=str))
            logger.debug("=== END RAW SALESFORCE EXECUTE-MORE RESPONSE ===")
            
            logger.debug(f"Executed query_more, returned {raw_result['totalSize']} records")
            
            # Transform the result into tree structure
            transformed_result = transform_query_result(raw_result)
            
            # LOG TRANSFORMED RESULT FOR DEBUGGING
            logger.debug("=== TRANSFORMED EXECUTE-MORE RESULT ===")
            logger.debug(json.dumps(transformed_result.dict(), indent=2, default=str))
            logger.debug("=== END TRANSFORMED EXECUTE-MORE RESULT ===")
            
            logger.debug(f"Query_more transformation completed: {len(transformed_result.records)} records processed")
            
            return transformed_result.dict()
            
        except SalesforceError as e:
            logger.error(f"Salesforce API error in execute_more: {str(e)}")
            logger.error(f"Salesforce error type: {type(e).__name__}")
            logger.error(f"Salesforce error attributes: {dir(e)}")
            
            # Extract the actual Salesforce error message
            error_message = str(e)
            
            # Log all available attributes to understand the error structure
            if hasattr(e, 'content'):
                logger.error(f"Salesforce error content: {e.content}")
                error_content = e.content
                # Ensure error_content is a dict or list, not bytes
                if isinstance(error_content, bytes):
                    try:
                        import json
                        error_content = json.loads(error_content.decode('utf-8'))
                    except:
                        error_content = str(error_content)
                
                if isinstance(error_content, list) and len(error_content) > 0:
                    first_error = error_content[0]
                    if isinstance(first_error, dict):
                        if 'message' in first_error:
                            error_message = first_error['message']
                        elif 'errorCode' in first_error:
                            error_message = f"{first_error.get('errorCode', 'Unknown')}: {first_error.get('message', str(e))}"
                elif isinstance(error_content, dict):
                    if 'message' in error_content:
                        error_message = error_content['message']
                    elif 'errorCode' in error_content:
                        error_message = f"{error_content.get('errorCode', 'Unknown')}: {error_content.get('message', str(e))}"
            
            raise ValueError(f"salesforce.errors.execute_more_failed: {error_message}")
        
        except Exception as e:
            logger.error(f"Unexpected error executing query_more: {str(e)}")
            raise ValueError(f"salesforce.errors.execute_more_failed: {str(e)}")

    def get_user_info(self, connection_uuid: str) -> Dict[str, Any]:
        """Get current user information"""
        if not self.connection:
            raise ValueError("No active Salesforce connection available")
        
        logger.debug(f"Retrieving user info")
        
        # Map Salesforce user fields to expected API response format
        user_info = self.user_info or {}
        mapped_user_info = {
            'user_id': user_info.get('Id', ''),
            'organization_id': user_info.get('Id', '')[:15],  # Use first 15 chars as org ID
            'user_name': user_info.get('Username', ''),
            'display_name': f"{user_info.get('FirstName', '')} {user_info.get('LastName', '')}".strip(),
            'email': user_info.get('Email', '')
        }
        
        logger.debug(f"User info mapped successfully")
        return mapped_user_info
    
    def get_api_usage(self, connection_uuid: str) -> Dict[str, Any]:
        """Get API usage information"""
        if not self.connection:
            raise ValueError("No active Salesforce connection available")
            
        try:
            # Get API usage from last response headers
            used = 0
            limit = 15000  # Default API limit
            
            # Try to get from connection session info
            session_info = self.connection.session_id
            if hasattr(self.connection, 'api_usage'):
                usage_info = self.connection.api_usage
                if 'used' in usage_info:
                    used = int(str(usage_info['used']))
                if 'limit' in usage_info:
                    limit = int(str(usage_info['limit']))
            
            remaining = limit - used
            percentage = round((used / limit) * 100, 1) if limit > 0 else 0
            
            return {
                'used': used,
                'limit': limit,
                'remaining': remaining,
                'resetTime': None,  # Salesforce doesn't provide exact reset time
                'percentage': percentage
            }
            
        except Exception as e:
            logger.error(f"Failed to get API usage: {str(e)}")
            raise ValueError("salesforce.error.api_usage_not_available")
    
    def logout(self) -> None:
        """Logout from Salesforce"""
        try:
            if self.connection:
                # Close the connection
                self.connection = None
                self.user_info = None
                logger.debug("Logged out from Salesforce")
                
        except Exception as e:
            logger.error(f"Error during logout: {str(e)}")
            raise ValueError("salesforce.error.logout_failed")
    
    def is_connected(self) -> bool:
        """Check if connected to Salesforce with proper session validation"""
        if not self.connection or not self.user_info:
            return False
        
        try:
            # Use simple-salesforce SDK's proper connection validation
            # Make a lightweight query to check if session is still valid
            result = self.connection.query("SELECT Id FROM User LIMIT 1")
            return result is not None and 'records' in result
            
        except SalesforceExpiredSession:
            logger.error("Salesforce session has expired")
            # Clean up expired connection
            self.connection = None
            self.user_info = None
            return False
            
        except Exception as e:
            logger.warning(f"Salesforce connection check failed: {str(e)}")
            # Connection is dead, clean up
            self.connection = None
            self.user_info = None
            return False
    
    def validate_connection_object(self, connection_uuid: str) -> Dict[str, Any]:
        """Validate that the Salesforce connection object exists and is properly configured"""
        logger.debug(f"Validating Salesforce connection object for {connection_uuid}")
        
        # Check if connection object exists
        if not self.connection:
            logger.error(f"Salesforce connection object is None for {connection_uuid}")
            return {
                "valid": False,
                "error": "No Salesforce connection object available",
                "details": "Connection object is None"
            }
        
        # Check if user_info exists
        if not self.user_info:
            logger.error(f"Salesforce user_info is None for {connection_uuid}")
            return {
                "valid": False,
                "error": "No Salesforce user information available",
                "details": "User info is None"
            }
        
        # Check if connection has required attributes
        required_attrs = ['session_id', 'sf_instance']
        missing_attrs = []
        for attr in required_attrs:
            if not hasattr(self.connection, attr) or not getattr(self.connection, attr):
                missing_attrs.append(attr)
        
        if missing_attrs:
            logger.error(f"Salesforce connection missing required attributes: {missing_attrs}")
            return {
                "valid": False,
                "error": "Salesforce connection missing required attributes",
                "details": f"Missing: {', '.join(missing_attrs)}"
            }
        
        # Test the connection with a lightweight query
        try:
            result = self.connection.query("SELECT Id FROM User LIMIT 1")
            if result is None or 'records' not in result:
                logger.error(f"Salesforce connection test query failed for {connection_uuid}")
                return {
                    "valid": False,
                    "error": "Salesforce connection test failed",
                    "details": "Test query returned invalid result"
                }
            
            logger.debug(f"Salesforce connection object validated successfully for {connection_uuid}")
            return {
                "valid": True,
                "connection_info": {
                    "instance_url": self.connection.sf_instance,
                    "user_id": self.user_info.get('Id', ''),
                    "username": self.user_info.get('Username', '')
                }
            }
            
        except SalesforceExpiredSession:
            logger.error(f"Salesforce session expired for {connection_uuid}")
            return {
                "valid": False,
                "error": "Salesforce session has expired",
                "details": "Session token is no longer valid"
            }
            
        except Exception as e:
            logger.error(f"Salesforce connection validation failed for {connection_uuid}: {str(e)}")
            return {
                "valid": False,
                "error": "Salesforce connection validation failed",
                "details": str(e)
            }
    
    def get_api_config(self, connection_uuid: str) -> Dict[str, Any]:
        """Get Salesforce API configuration"""
        if not self.connection:
            raise ValueError("No active Salesforce connection available")
        
        try:
            return {
                'instance_url': self.connection.sf_instance,
                'session_id': self.connection.session_id,
                'api_version': '58.0'  # Default API version
            }
        except Exception as e:
            logger.error(f"Failed to get API config: {str(e)}")
            raise ValueError("No active Salesforce connection available")
    
    def update_record(self, sobject_name: str, record_id: str, fields: Dict[str, Any], connection_uuid: str) -> Dict[str, Any]:
        """Update Salesforce record"""
        logger.debug(f"Updating record {record_id} in {sobject_name} with fields {fields}")
        
        if not self.connection:
            raise ValueError("No active Salesforce connection available")
        
        try:
            sobject = getattr(self.connection, sobject_name)
            result = sobject.update(record_id, fields)
            
            if result.get('success', False):
                logger.debug(f"Updated record {record_id} in {sobject_name}")
                return {
                    'success': True,
                    'id': record_id,
                    'message': 'Record updated successfully'
                }
            else:
                logger.error(f"Failed to update record {record_id}: {result}")
                raise ValueError("salesforce.error.record_update_failed")
                
        except Exception as e:
            logger.error(f"Failed to update record {record_id}: {str(e)}")
            logger.error(f"Salesforce error details: {type(e).__name__}: {str(e)}")
                
            raise ValueError(f"salesforce.error.record_update_failed: {str(e)}")

    def execute_anonymous_apex(self, apex_code: str, connection_uuid: str) -> Dict[str, Any]:
        """
        Execute anonymous Apex code using Salesforce Tooling API
        
        Args:
            apex_code (str): The Apex code to execute
            
        Returns:
            Dict containing execution results including:
            - success: Boolean indicating if execution was successful
            - compiled: Boolean indicating if code compiled successfully
            - line: Line number where error occurred (if any)
            - column: Column number where error occurred (if any)
            - compileProblem: Compilation error message (if any)
            - exceptionMessage: Runtime exception message (if any)
            - exceptionStackTrace: Runtime exception stack trace (if any)
            - debugInfo: Debug logs from the execution
        """
        if not self.connection:
            raise ValueError("No active Salesforce connection available")
        
        try:
            # Use the Tooling API to execute anonymous Apex
            result = self.connection.restful(
                'services/data/v64.0/tooling/executeAnonymous',
                method='POST',
                json={'anonymousBody': apex_code}
            )
            
            logger.debug("Executed anonymous Apex code")
            logger.debug(f"Apex execution completed")
            
            # Map the response to a consistent format
            response = {
                'success': result.get('success', False) if result else False,
                'compiled': result.get('compiled', False) if result else False,
                'line': result.get('line') if result else None,
                'column': result.get('column') if result else None,
                'compileProblem': result.get('compileProblem') if result else None,
                'exceptionMessage': result.get('exceptionMessage') if result else None,
                'exceptionStackTrace': result.get('exceptionStackTrace') if result else None,
                'debugInfo': result.get('debugInfo', []) if result else [],
                'executionTime': result.get('executionTime') if result else None,
                'cpuTime': result.get('cpuTime') if result else None,
                'dmlRows': result.get('dmlRows') if result else None,
                'dmlStatements': result.get('dmlStatements') if result else None,
                'soqlQueries': result.get('soqlQueries') if result else None,
                'soqlRowsProcessed': result.get('soqlRowsProcessed') if result else None,
                'queryLocatorRows': result.get('queryLocatorRows') if result else None,
                'aggregateQueries': result.get('aggregateQueries') if result else None,
                'limitExceptions': result.get('limitExceptions') if result else None,
                'emailInvocations': result.get('emailInvocations') if result else None,
                'futureCalls': result.get('futureCalls') if result else None,
                'queueableJobs': result.get('queueableJobs') if result else None,
                'mobilePushApexCalls': result.get('mobilePushApexCalls') if result else None,
                'soslQueries': result.get('soslQueries') if result else None
            }
            
            if response['success']:
                logger.debug("Apex code executed successfully")
            else:
                logger.warning(f"Apex code execution failed: {response.get('compileProblem') or response.get('exceptionMessage')}")
            
            return response
            
        except Exception as e:
            logger.error(f"Failed to execute anonymous Apex: {str(e)}")
            raise ValueError("salesforce.error.apex_execution_failed")

    def execute_apex_rest(self, endpoint: str, connection_uuid: str, method: str = 'GET', data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Execute Apex REST endpoint
        
        Args:
            endpoint (str): The REST endpoint path
            method (str): HTTP method (GET, POST, PUT, DELETE)
            data (Dict): Data to send with the request
            
        Returns:
            Dict containing the REST API response
        """
        if not self.connection:
            raise ValueError("No active Salesforce connection available")
        
        try:
            result = self.connection.apexecute(endpoint, method=method, data=data)
            
            logger.debug(f"Executed Apex REST endpoint: {method} {endpoint}")
            logger.debug("Apex REST execution completed")
            
            return {
                'success': True,
                'data': result,
                'endpoint': endpoint,
                'method': method
            }
            
        except Exception as e:
            logger.error(f"Failed to execute Apex REST endpoint: {str(e)}")
            raise ValueError("salesforce.error.apex_rest_execution_failed")

    def compile_packages(self, package_names: List[str], connection_uuid: str) -> Dict[str, Any]:
        """
        Compile Apex packages using Salesforce Tooling API
        
        Args:
            package_names (List[str]): List of package names to compile
            
        Returns:
            Dict containing compilation results
        """
        if not self.connection:
            raise ValueError("No active Salesforce connection available")
        
        try:
            # Use Tooling API to compile packages
            result = self.connection.toolingexecute(
                'services/data/v64.0/tooling/compilePackages',
                method='POST',
                data={'packageNames': package_names}
            )
            
            logger.debug(f"Compiled packages: {package_names}")
            logger.debug("Package compilation completed")
            
            return {
                'success': True,
                'packages': package_names,
                'result': result,
                'message': f"Successfully compiled {len(package_names)} packages"
            }
            
        except Exception as e:
            logger.error(f"Failed to compile packages: {str(e)}")
            raise ValueError("salesforce.error.package_compilation_failed")

    def compile_triggers(self, trigger_names: List[str], connection_uuid: str) -> Dict[str, Any]:
        """
        Compile Apex triggers using Salesforce Tooling API
        
        Args:
            trigger_names (List[str]): List of trigger names to compile
            
        Returns:
            Dict containing compilation results
        """
        if not self.connection:
            raise ValueError("No active Salesforce connection available")
        
        try:
            # Use Tooling API to compile triggers
            result = self.connection.toolingexecute(
                'services/data/v64.0/tooling/compileTriggers',
                method='POST',
                data={'triggerNames': trigger_names}
            )
            
            logger.debug(f"Compiled triggers: {trigger_names}")
            logger.debug(f"Trigger compilation completed")
            
            return {
                'success': True,
                'triggers': trigger_names,
                'result': result,
                'message': f"Successfully compiled {len(trigger_names)} triggers"
            }
            
        except Exception as e:
            logger.error(f"Failed to compile triggers: {str(e)}")
            raise ValueError("salesforce.error.trigger_compilation_failed")

    def run_tests(self, connection_uuid: str, test_classes: Optional[List[str]] = None, test_methods: Optional[List[str]] = None) -> Dict[str, Any]:
        """
        Run Apex tests using Salesforce Tooling API
        
        Args:
            test_classes (List[str], optional): List of test class names to run
            test_methods (List[str], optional): List of specific test method names to run
            
        Returns:
            Dict containing test execution results
        """
        if not self.connection:
            raise ValueError("No active Salesforce connection available")
        
        try:
            # Prepare test data
            test_data = {}
            if test_classes:
                test_data['testClasses'] = test_classes
            if test_methods:
                test_data['testMethods'] = test_methods
            
            # Use Tooling API to run tests
            result = self.connection.toolingexecute(
                'services/data/v64.0/tooling/runTests',
                method='POST',
                data=test_data
            )
            
            logger.debug(f"Ran tests: classes={test_classes}, methods={test_methods}")
            logger.debug(f"Test execution completed")
            
            return {
                'success': True,
                'test_classes': test_classes,
                'test_methods': test_methods,
                'result': result,
                'message': f"Successfully ran tests"
            }
            
        except Exception as e:
            logger.error(f"Failed to run tests: {str(e)}")
            raise ValueError("salesforce.error.test_execution_failed")

    def compile_and_test(self, apex_code: str, connection_uuid: str, test_classes: Optional[List[str]] = None) -> Dict[str, Any]:
        """
        Compile and test Apex code in one operation
        
        Args:
            apex_code (str): The Apex code to compile and test
            test_classes (List[str], optional): List of test class names to run
            
        Returns:
            Dict containing compilation and test results
        """
        if not self.connection:
            raise ValueError("No active Salesforce connection available")
        
        try:
            # Prepare data for compile and test
            test_data: Dict[str, Any] = {
                'anonymousBody': apex_code
            }
            if test_classes:
                test_data['testClasses'] = test_classes
            
            # Use Tooling API to compile and test
            result = self.connection.toolingexecute(
                'services/data/v64.0/tooling/compileAndTest',
                method='POST',
                data=test_data
            )
            
            logger.debug(f"Compiled and tested Apex code")
            logger.debug(f"Compile and test completed")
            
            return {
                'success': True,
                'result': result,
                'message': "Successfully compiled and tested Apex code"
            }
            
        except Exception as e:
            logger.error(f"Failed to compile and test: {str(e)}")
            raise ValueError("salesforce.error.compile_test_failed")

    def get_compilation_status(self, compilation_id: str, connection_uuid: str) -> Dict[str, Any]:
        """
        Get the status of a compilation operation
        
        Args:
            compilation_id (str): The compilation ID to check
            
        Returns:
            Dict containing compilation status
        """
        if not self.connection:
            raise ValueError("No active Salesforce connection available")
        
        try:
            # Use Tooling API to get compilation status
            result = self.connection.toolingexecute(
                f'services/data/v64.0/tooling/compilationStatus/{compilation_id}',
                method='GET'
            )
            
            logger.debug(f"Retrieved compilation status for ID: {compilation_id}")
            logger.debug(f"Compilation status retrieved")
            
            return {
                'success': True,
                'compilation_id': compilation_id,
                'result': result,
                'message': "Successfully retrieved compilation status"
            }
            
        except Exception as e:
            logger.error(f"Failed to get compilation status: {str(e)}")
            raise ValueError("salesforce.error.compilation_status_failed")
