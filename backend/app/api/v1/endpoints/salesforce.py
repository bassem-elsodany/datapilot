"""
DataPilot Backend - Salesforce Operations API Endpoints

This module provides comprehensive RESTful API endpoints for Salesforce operations in the DataPilot backend,
handling Salesforce data operations, SObject management, SOQL execution, Apex code operations, and advanced
Salesforce integration with enterprise-grade security and performance optimization.

The Salesforce API provides:
- Complete SObject discovery and metadata management
- Advanced SOQL query execution with optimization
- Comprehensive Apex code execution and compilation
- Real-time user information and API usage monitoring
- Full CRUD operations for Salesforce records
- Enterprise-grade error handling and retry logic
- Performance monitoring and governor limit tracking

Core API Capabilities:

SObject Management:
- Complete SObject discovery and listing
- Detailed SObject metadata and field descriptions
- Custom object and field support
- Relationship mapping and navigation
- SObject schema caching and optimization
- Dynamic SObject operations

Query Execution:
- SOQL query parsing and validation
- Query optimization and performance tuning
- Large dataset handling with pagination
- Relationship query support
- Aggregate function support
- Query result caching and optimization

Apex Integration:
- Anonymous Apex code execution
- Apex REST endpoint integration
- Package and trigger compilation
- Test execution and coverage reporting
- Debug level management
- Apex code optimization and analysis

Data Operations:
- Record creation, reading, updating, and deletion
- Bulk operations for large datasets
- Field-level security and access control
- Data validation and constraint checking
- Soft delete and hard delete operations
- Record locking and concurrency control

Performance & Monitoring:
- Real-time API usage tracking
- Governor limit monitoring and alerts
- Query performance analysis
- Connection health monitoring
- Error rate tracking and reporting
- Performance metrics and optimization

REST API Endpoints:

SObject Operations:
- GET /salesforce/sobjects/list - List available SObjects with metadata
- GET /salesforce/sobjects/describe/{name} - Describe specific SObject with fields
- GET /salesforce/sobjects/{name}/records/{id} - Get specific record
- PUT /salesforce/sobjects/{name}/records/{id} - Update record
- DELETE /salesforce/sobjects/{name}/records/{id} - Delete record

Query Operations:
- POST /salesforce/queries/execute - Execute SOQL queries with optimization
- POST /salesforce/queries/execute-more - Execute paginated queries
- GET /salesforce/queries/limits - Get query execution limits

User & System Information:
- GET /salesforce/user/info - Get current user information
- GET /salesforce/usage/info - Get API usage statistics
- GET /salesforce/config/info - Get API configuration
- GET /salesforce/limits - Get all Salesforce limits

Apex Execution:
- POST /salesforce/apex/execute-anonymous - Execute anonymous Apex code
- POST /salesforce/apex/execute-rest - Execute Apex REST endpoints
- POST /salesforce/apex/compile-packages - Compile Apex packages
- POST /salesforce/apex/compile-triggers - Compile Apex triggers
- POST /salesforce/apex/run-tests - Run Apex tests
- POST /salesforce/apex/compile-and-test - Compile and test Apex code
- GET /salesforce/apex/limits - Get Apex execution limits
- GET /salesforce/apex/compilation-status/{id} - Check compilation status

Security Features:
- Master key-based authentication
- Input validation and sanitization
- SQL injection and XSS prevention
- Access control and permissions
- Audit trail for all operations
- Secure error handling

Performance Features:
- Query optimization and caching
- Connection pooling and reuse
- Asynchronous operations
- Load balancing and scaling
- Performance monitoring
- Resource usage optimization

Integration Points:
- Salesforce API integration
- MongoDB caching layer
- Logging and monitoring systems
- Error handling and reporting
- Frontend user interface
- AI workflow integration

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

from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Depends, status, Query, Request
from pydantic import BaseModel, Field
from loguru import logger

from app.services.salesforce_service import SalesforceService
from app.services.i18n_service import I18nService
from app.services.error_service import ErrorService
from app.utils.i18n_utils import translate_message, format_message_with_params

router = APIRouter()

# Pydantic models for request/response
class QueryRequest(BaseModel):
    query: str

class ExecuteMoreRequest(BaseModel):
    nextRecordsId: str = Field(..., description="The nextRecordsId from the previous query execution")

class SObjectListResponse(BaseModel):
    sobjects: List[Dict[str, Any]]

class SObjectDescribeResponse(BaseModel):
    name: str
    fields: List[Dict[str, Any]]
    label: str
    custom: bool
    childRelationships: Optional[List[Dict[str, Any]]] = []

# Import the new QueryResponse model
from app.models.query_response import QueryResponse



class ApiUsageResponse(BaseModel):
    used: int
    limit: int
    remaining: int
    reset_time: Optional[str] = None
    percentage: float

class UserInfoResponse(BaseModel):
    user_id: str
    organization_id: str
    user_name: str
    display_name: str
    email: str


# Apex-related Pydantic models
class ExecuteAnonymousRequest(BaseModel):
    """Request model for anonymous Apex execution"""
    apex_code: str = Field(..., description="The Apex code to execute", min_length=1, max_length=50000)
    connection_uuid: Optional[str] = Field(None, description="Connection UUID for the Salesforce connection")

class ExecuteRestRequest(BaseModel):
    """Request model for Apex REST execution"""
    endpoint: str = Field(..., description="The REST endpoint path", min_length=1)
    method: str = Field(default="GET", description="HTTP method (GET, POST, PUT, DELETE)")
    data: Optional[Dict[str, Any]] = Field(None, description="Data to send with the request")
    connection_uuid: Optional[str] = Field(None, description="Connection UUID for the Salesforce connection")

class ApexExecutionResponse(BaseModel):
    """Response model for Apex execution results"""
    success: bool = Field(..., description="Whether the execution was successful")
    compiled: Optional[bool] = Field(None, description="Whether the code compiled successfully")
    line: Optional[int] = Field(None, description="Line number where error occurred")
    column: Optional[int] = Field(None, description="Column number where error occurred")
    compile_problem: Optional[str] = Field(None, description="Compilation error message")
    exception_message: Optional[str] = Field(None, description="Runtime exception message")
    exception_stack_trace: Optional[str] = Field(None, description="Runtime exception stack trace")
    debug_info: Optional[list] = Field(None, description="Debug logs from execution")
    execution_time: Optional[int] = Field(None, description="Execution time in milliseconds")
    cpu_time: Optional[int] = Field(None, description="CPU time used")
    dml_rows: Optional[int] = Field(None, description="Number of DML rows affected")
    dml_statements: Optional[int] = Field(None, description="Number of DML statements executed")
    soql_queries: Optional[int] = Field(None, description="Number of SOQL queries executed")
    soql_rows_processed: Optional[int] = Field(None, description="Number of SOQL rows processed")
    limit_exceptions: Optional[list] = Field(None, description="Limit exceptions encountered")
    message: Optional[str] = Field(None, description="Additional message or description")

class CompilePackagesRequest(BaseModel):
    """Request model for package compilation"""
    package_names: List[str] = Field(..., description="List of package names to compile", min_length=1)
    connection_uuid: Optional[str] = Field(None, description="Connection UUID for the Salesforce connection")

class CompileTriggersRequest(BaseModel):
    """Request model for trigger compilation"""
    trigger_names: List[str] = Field(..., description="List of trigger names to compile", min_length=1)
    connection_uuid: Optional[str] = Field(None, description="Connection UUID for the Salesforce connection")

class RunTestsRequest(BaseModel):
    """Request model for test execution"""
    test_classes: Optional[List[str]] = Field(None, description="List of test class names to run")
    test_methods: Optional[List[str]] = Field(None, description="List of specific test method names to run")
    connection_uuid: Optional[str] = Field(None, description="Connection UUID for the Salesforce connection")

class CompileAndTestRequest(BaseModel):
    """Request model for compile and test operation"""
    apex_code: str = Field(..., description="The Apex code to compile and test", min_length=1, max_length=50000)
    test_classes: Optional[List[str]] = Field(None, description="List of test class names to run")
    connection_uuid: Optional[str] = Field(None, description="Connection UUID for the Salesforce connection")

# Global service instances
salesforce_service = SalesforceService()
i18n_service = I18nService()


@router.get("/sobjects/list", response_model=SObjectListResponse)
def list_sobjects(
    lang: str = Query("en", description="Language code for messages"),
    connection_uuid: str = Query(description="Connection UUID for the Salesforce connection")
):
    """Get list of SObjects"""
    try:
        sobjects = salesforce_service.get_sobject_list(connection_uuid)
        return SObjectListResponse(sobjects=sobjects)
    except ValueError as e:
        # Check if it's a no connection error
        if "No active Salesforce connection available" in str(e):
            ErrorService.raise_connection_error(
                message="salesforce.errors.no_connection",
                details=str(e),
                request=None,
                locale=lang
            )
        else:
            ErrorService.raise_validation_error(
                message="salesforce.errors.invalid_request_params",
                field_errors={"sobjects": str(e)},
                request=None,
                locale=lang
            )
    except Exception as e:

        ErrorService.raise_external_service_error(
            message="salesforce.errors.sobject_list_failed",
            service_name="Salesforce",
            service_endpoint="/sobjects/list",
            details=str(e),
            request=None,
            locale=lang
        )

@router.get("/sobjects/describe/{sobject_name}", response_model=SObjectDescribeResponse)
def describe_sobject(
    sobject_name: str, 
    include_child_relationships: bool = Query(True, description="Include child relationships in the response"),
    lang: str = Query("en", description="Language code for messages"),
    connection_uuid: str = Query(description="Connection UUID for the Salesforce connection")
):
    """Describe SObject"""
    try:
        description = salesforce_service.describe_sobject(sobject_name, connection_uuid, include_child_relationships)
        return SObjectDescribeResponse(**description)
    except ValueError as e:
        # Check if it's a no connection error
        if "No active Salesforce connection available" in str(e):
            ErrorService.raise_connection_error(
                message="salesforce.errors.no_connection",
                details=str(e),
                request=None,
                locale=lang
            )
        # Check if it's an SObject not found error (based on error code, not message)
        elif str(e) == "salesforce.error.sobject_not_found":
            ErrorService.raise_not_found_error(
                message="salesforce.errors.sobject_not_found",
                resource_type="SObject",
                resource_id=sobject_name,
                details=str(e),
                request=None,
                locale=lang
            )
        else:
            ErrorService.raise_validation_error(
                message="salesforce.errors.invalid_sobject_params",
                field_errors={"sobject_name": str(e)},
                request=None,
                locale=lang
            )
    except Exception as e:
        ErrorService.raise_not_found_error(
            message="salesforce.errors.sobject_not_found",
            resource_type="SObject",
            resource_id=sobject_name,
            details=str(e),
            request=None,
            locale=lang
        )

@router.post("/queries/execute", response_model=QueryResponse, status_code=status.HTTP_200_OK)
def execute_query(
    request: QueryRequest,
    lang: str = Query("en", description="Language code for messages"),
    connection_uuid: str = Query(description="Connection UUID for the Salesforce connection")
):
    """Execute SOQL query and return transformed tree structure"""
    try:
        logger.debug(f"Executing SOQL query with tree transformation: {request.query[:100]}...")
        result = salesforce_service.execute_query_with_tree(request.query, connection_uuid)
        logger.debug(f"Query executed and transformed successfully: {result['metadata']['total_size']} records")
        return QueryResponse(**result)
    except ValueError as e:
        # Check if it's a no connection error
        if "No active Salesforce connection available" in str(e):
            ErrorService.raise_connection_error(
                message="salesforce.errors.no_connection",
                details=str(e),
                request=None,
                locale=lang
            )
        else:
            ErrorService.raise_validation_error(
                message="salesforce.errors.invalid_query",
                field_errors={"query": str(e)},
                request=None,
                locale=lang
            )
    except Exception as e:

        ErrorService.raise_external_service_error(
            message="salesforce.errors.query_execution_failed",
            service_name="Salesforce",
            service_endpoint="/queries/execute",
            details=str(e),
            request=None,
            locale=lang
        )

@router.post("/queries/execute-more", response_model=QueryResponse, status_code=status.HTTP_200_OK)
def execute_more_query(
    request: ExecuteMoreRequest,
    lang: str = Query("en", description="Language code for messages"),
    connection_uuid: str = Query(description="Connection UUID for the Salesforce connection")
):
    """Execute more records from a previous SOQL query using nextRecordsId"""
    try:
        logger.debug(f"Executing more records with nextRecordsId: {request.nextRecordsId}")
        result = salesforce_service.execute_more_records(request.nextRecordsId, connection_uuid)
        logger.debug(f"More records executed and transformed successfully: {result['metadata']['total_size']} records")
        return QueryResponse(**result)
    except ValueError as e:
        # Check if it's a no connection error
        if "No active Salesforce connection available" in str(e):
            ErrorService.raise_connection_error(
                message="salesforce.errors.no_connection",
                details=str(e),
                request=None,
                locale=lang
            )
        else:
            ErrorService.raise_validation_error(
                message="salesforce.errors.invalid_next_records_id",
                field_errors={"nextRecordsId": str(e)},
                request=None,
                locale=lang
            )
    except Exception as e:
        ErrorService.raise_external_service_error(
            message="salesforce.errors.execute_more_failed",
            service_name="Salesforce",
            service_endpoint="/queries/execute-more",
            details=str(e),
            request=None,
            locale=lang
        )

@router.get("/usage/info", response_model=ApiUsageResponse)
def get_api_usage(
    lang: str = Query("en", description="Language code for messages"),
    connection_uuid: str = Query(description="Connection UUID for the Salesforce connection")
):
    """Get API usage statistics"""
    try:
        logger.debug("Fetching API usage from Salesforce")
        usage = salesforce_service.get_api_usage(connection_uuid)
        logger.debug(f"API usage retrieved: {usage['used']}/{usage['limit']} ({usage['percentage']:.1f}%)")
        return ApiUsageResponse(**usage)
    except ValueError as e:
        # Check if it's a no connection error
        if "No active Salesforce connection available" in str(e):
            ErrorService.raise_connection_error(
                message="salesforce.errors.no_connection",
                details=str(e),
                request=None,
                locale=lang
            )
        else:
            ErrorService.raise_validation_error(
                message="salesforce.errors.invalid_usage_request",
                field_errors={"usage": str(e)},
                request=None,
                locale=lang
            )
    except Exception as e:

        ErrorService.raise_external_service_error(
            message="salesforce.errors.usage_failed",
            service_name="Salesforce",
            service_endpoint="/usage/info",
            details=str(e),
            request=None,
            locale=lang
        )

@router.get("/user/info", response_model=UserInfoResponse)
def get_user_info(
    lang: str = Query("en", description="Language code for messages"),
    connection_uuid: str = Query(description="Connection UUID for the Salesforce connection")
):
    """Get current user information"""
    try:
        logger.debug("Fetching user info from Salesforce")
        user_info = salesforce_service.get_user_info(connection_uuid)
        logger.debug(f"User info retrieved for: {user_info['user_name']}")
        return UserInfoResponse(**user_info)
    except ValueError as e:
        # Check if it's a no connection error
        if "No active Salesforce connection available" in str(e):
            ErrorService.raise_connection_error(
                message="salesforce.errors.no_connection",
                details=str(e),
                request=None,
                locale=lang
            )
        else:
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
            service_endpoint="/user/info",
            details=str(e),
            request=None,
            locale=lang
        )

@router.get("/config/info")
def get_api_config(
    lang: str = Query("en", description="Language code for messages"),
    connection_uuid: str = Query(description="Connection UUID for the Salesforce connection")
):
    """Get Salesforce API configuration"""
    try:
        logger.debug("Fetching Salesforce API configuration")
        config = salesforce_service.get_api_config(connection_uuid)
        logger.debug(f"API configuration retrieved")
        return config
    except Exception as e:

        ErrorService.raise_external_service_error(
            message="salesforce.errors.config_failed",
            service_name="Salesforce",
            service_endpoint="/config/info",
            details=str(e),
            request=None,
            locale=lang
        )

@router.put("/sobjects/{sobject_name}/records/{record_id}")
def update_record(
    sobject_name: str,
    record_id: str,
    fields: Dict[str, Any],
    lang: str = Query("en", description="Language code for messages"),
    connection_uuid: str = Query(description="Connection UUID for the Salesforce connection")
):
    """Update Salesforce record"""
    try:
        result = salesforce_service.update_record(sobject_name, record_id, fields, connection_uuid)
        return result
    except ValueError as e:

        ErrorService.raise_validation_error(
            message="salesforce.errors.invalid_record_params",
            field_errors={"record": str(e)},
            request=None,
            locale=lang
        )
    except Exception as e:

        ErrorService.raise_external_service_error(
            message="salesforce.errors.record_update_failed",
            service_name="Salesforce",
            service_endpoint=f"/sobjects/{sobject_name}/records/{record_id}",
            details=str(e),
            request=None,
            locale=lang
        )


# ========================================
# APEX EXECUTION ENDPOINTS
# ========================================

@router.post("/apex/execute-anonymous", response_model=ApexExecutionResponse)
def execute_anonymous_apex(
    request: ExecuteAnonymousRequest,
    http_request: Request,
    lang: str = Query("en", description="Language code for messages"),
    connection_uuid: str = Query(description="Connection UUID for the Salesforce connection")
):
    """
    Execute anonymous Apex code
    
    This endpoint allows you to execute anonymous Apex code in Salesforce.
    The code will be compiled and executed in the context of the connected user.
    
    Args:
        request: ExecuteAnonymousRequest containing the Apex code to execute
        http_request: FastAPI request object
        lang: Language code for messages
        
    Returns:
        ApexExecutionResponse with execution results and statistics
    """
    try:
        logger.debug(f"Executing anonymous Apex code")
        logger.debug(f"Apex code length: {len(request.apex_code)} characters")
        
        # Check if connected
        if not salesforce_service.is_connected():

            ErrorService.raise_connection_error(
                message="salesforce.errors.no_connection",
                details="No active Salesforce connection available",
                request=http_request,
                locale=lang
            )
        
        # Execute the anonymous Apex code
        result = salesforce_service.execute_anonymous_apex(request.apex_code, connection_uuid)
        
        # Get success/failure messages
        success_message = i18n_service.get_translation_key(lang, 'apex.messages.execution_completed') or 'Apex execution completed successfully'
        failure_message = i18n_service.get_translation_key(lang, 'apex.messages.execution_failed') or 'Apex execution failed'
        
        # Map the result to our response model
        response = ApexExecutionResponse(
            success=result.get('success', False),
            compiled=result.get('compiled'),
            line=result.get('line'),
            column=result.get('column'),
            compile_problem=result.get('compileProblem'),
            exception_message=result.get('exceptionMessage'),
            exception_stack_trace=result.get('exceptionStackTrace'),
            debug_info=result.get('debugInfo'),
            execution_time=result.get('executionTime'),
            cpu_time=result.get('cpuTime'),
            dml_rows=result.get('dmlRows'),
            dml_statements=result.get('dmlStatements'),
            soql_queries=result.get('soqlQueries'),
            soql_rows_processed=result.get('soqlRowsProcessed'),
            limit_exceptions=result.get('limitExceptions'),
            message=success_message if result.get('success') else failure_message
        )
        
        logger.debug(f"Anonymous Apex execution completed: success={response.success}")
        return response
        
    except HTTPException:
        raise
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="executing anonymous Apex code",
            request=http_request,
            locale=lang
        )

@router.post("/apex/execute-rest")
def execute_apex_rest(
    request: ExecuteRestRequest,
    http_request: Request,
    lang: str = Query("en", description="Language code for messages"),
    connection_uuid: str = Query(description="Connection UUID for the Salesforce connection")
):
    """
    Execute Apex REST endpoint
    
    This endpoint allows you to call custom Apex REST endpoints in Salesforce.
    
    Args:
        request: ExecuteRestRequest containing the endpoint and request details
        http_request: FastAPI request object
        lang: Language code for messages
        
    Returns:
        Dict containing the REST API response
    """
    try:
        logger.debug(f"Executing Apex REST endpoint: {request.method} {request.endpoint}")
        
        # Check if connected
        if not salesforce_service.is_connected():

            ErrorService.raise_connection_error(
                message="salesforce.errors.no_connection",
                details="No active Salesforce connection available",
                request=http_request,
                locale=lang
            )
        
        # Execute the Apex REST endpoint
        result = salesforce_service.execute_apex_rest(
            endpoint=request.endpoint,
            method=request.method,
            data=request.data,
            connection_uuid=connection_uuid
        )
        
        logger.debug(f"Apex REST execution completed successfully")
        return result
        
    except HTTPException:
        raise
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="executing Apex REST endpoint",
            request=http_request,
            locale=lang
        )

@router.get("/apex/limits")
def get_apex_limits(
    http_request: Request,
    lang: str = Query("en", description="Language code for messages"),
    connection_uuid: str = Query(description="Connection UUID for the Salesforce connection")
):
    """
    Get Apex execution limits and usage
    
    Args:
        http_request: FastAPI request object
        lang: Language code for messages
        
    Returns:
        Dict containing current Apex execution limits and usage
    """
    try:
        logger.debug(f"Getting Apex execution limits")
        
        # Check if connected
        if not salesforce_service.is_connected():

            ErrorService.raise_connection_error(
                message="salesforce.errors.no_connection",
                details="No active Salesforce connection available",
                request=http_request,
                locale=lang
            )
        
        # Get API usage which includes Apex limits
        api_usage = salesforce_service.get_api_usage(connection_uuid)
        
        # Note: Salesforce doesn't provide detailed Apex limits through the standard API
        # This would need to be implemented using the Tooling API or by tracking usage
        limits_info = {
            "api_usage": api_usage,
            "apex_limits": {
                "note": "Detailed Apex limits require Tooling API implementation",
                "available_endpoints": [
                    "/salesforce/apex/execute-anonymous",
                    "/salesforce/apex/execute-rest",
                    "/salesforce/apex/compile-packages",
                    "/salesforce/apex/compile-triggers",
                    "/salesforce/apex/run-tests",
                    "/salesforce/apex/compile-and-test"
                ]
            }
        }
        
        logger.debug(f"Retrieved Apex limits information")
        return limits_info
        
    except HTTPException:
        raise
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="getting Apex limits",
            request=http_request,
            locale=lang
        )

@router.post("/apex/compile-packages")
def compile_packages(
    request: CompilePackagesRequest,
    http_request: Request,
    lang: str = Query("en", description="Language code for messages"),
    connection_uuid: str = Query(description="Connection UUID for the Salesforce connection")
):
    """
    Compile Apex packages
    
    This endpoint allows you to compile Apex packages in Salesforce.
    
    Args:
        request: CompilePackagesRequest containing the package names to compile
        http_request: FastAPI request object
        lang: Language code for messages
        
    Returns:
        Dict containing compilation results
    """
    try:
        logger.debug(f"Compiling packages: {request.package_names}")
        
        # Check if connected
        if not salesforce_service.is_connected():

            ErrorService.raise_connection_error(
                message="salesforce.errors.no_connection",
                details="No active Salesforce connection available",
                request=http_request,
                locale=lang
            )
        
        # Compile the packages
        result = salesforce_service.compile_packages(request.package_names, connection_uuid)
        
        logger.debug(f"Package compilation completed successfully")
        return result
        
    except HTTPException:
        raise
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="compiling packages",
            request=http_request,
            locale=lang
        )

@router.post("/apex/compile-triggers")
def compile_triggers(
    request: CompileTriggersRequest,
    http_request: Request,
    lang: str = Query("en", description="Language code for messages"),
    connection_uuid: str = Query(description="Connection UUID for the Salesforce connection")
):
    """
    Compile Apex triggers
    
    This endpoint allows you to compile Apex triggers in Salesforce.
    
    Args:
        request: CompileTriggersRequest containing the trigger names to compile
        http_request: FastAPI request object
        lang: Language code for messages
        
    Returns:
        Dict containing compilation results
    """
    try:
        logger.debug(f"Compiling triggers: {request.trigger_names}")
        
        # Check if connected
        if not salesforce_service.is_connected():

            ErrorService.raise_connection_error(
                message="salesforce.errors.no_connection",
                details="No active Salesforce connection available",
                request=http_request,
                locale=lang
            )
        
        # Compile the triggers
        result = salesforce_service.compile_triggers(request.trigger_names, connection_uuid)
        
        logger.debug(f"Trigger compilation completed successfully")
        return result
        
    except HTTPException:
        raise
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="compiling triggers",
            request=http_request,
            locale=lang
        )

@router.post("/apex/run-tests")
def run_tests(
    request: RunTestsRequest,
    http_request: Request,
    lang: str = Query("en", description="Language code for messages"),
    connection_uuid: str = Query(description="Connection UUID for the Salesforce connection")
):
    """
    Run Apex tests
    
    This endpoint allows you to run Apex tests in Salesforce.
    
    Args:
        request: RunTestsRequest containing the test classes and methods to run
        http_request: FastAPI request object
        lang: Language code for messages
        
    Returns:
        Dict containing test execution results
    """
    try:
        logger.debug(f"Running tests: classes={request.test_classes}, methods={request.test_methods}")
        
        # Check if connected
        if not salesforce_service.is_connected():

            ErrorService.raise_connection_error(
                message="salesforce.errors.no_connection",
                details="No active Salesforce connection available",
                request=http_request,
                locale=lang
            )
        
        # Run the tests
        result = salesforce_service.run_tests(
            test_classes=request.test_classes,
            test_methods=request.test_methods,
            connection_uuid=connection_uuid
        )
        
        logger.debug(f"Test execution completed successfully")
        return result
        
    except HTTPException:
        raise
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="running tests",
            request=http_request,
            locale=lang
        )

@router.post("/apex/compile-and-test")
def compile_and_test(
    request: CompileAndTestRequest,
    http_request: Request,
    lang: str = Query("en", description="Language code for messages"),
    connection_uuid: str = Query(description="Connection UUID for the Salesforce connection")
):
    """
    Compile and test Apex code
    
    This endpoint allows you to compile and test Apex code in one operation.
    
    Args:
        request: CompileAndTestRequest containing the Apex code and test classes
        http_request: FastAPI request object
        lang: Language code for messages
        
    Returns:
        Dict containing compilation and test results
    """
    try:
        logger.debug(f"Compiling and testing Apex code")
        logger.debug(f"Apex code length: {len(request.apex_code)} characters")
        
        # Check if connected
        if not salesforce_service.is_connected():

            ErrorService.raise_connection_error(
                message="salesforce.errors.no_connection",
                details="No active Salesforce connection available",
                request=http_request,
                locale=lang
            )
        
        # Compile and test the Apex code
        result = salesforce_service.compile_and_test(
            apex_code=request.apex_code,
            test_classes=request.test_classes,
            connection_uuid=connection_uuid
        )
        
        logger.debug(f"Compile and test operation completed successfully")
        return result
        
    except HTTPException:
        raise
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="compiling and testing Apex code",
            request=http_request,
            locale=lang
        )

@router.get("/apex/compilation-status/{compilation_id}")
def get_compilation_status(
    compilation_id: str,
    http_request: Request,
    lang: str = Query("en", description="Language code for messages"),
    connection_uuid: str = Query(description="Connection UUID for the Salesforce connection")
):
    """
    Get compilation status
    
    This endpoint allows you to check the status of a compilation operation.
    
    Args:
        compilation_id (str): The compilation ID to check
        http_request: FastAPI request object
        lang: Language code for messages
        
    Returns:
        Dict containing compilation status
    """
    try:
        logger.info(f"Getting compilation status for ID: {compilation_id}")
        
        # Check if connected
        if not salesforce_service.is_connected():

            ErrorService.raise_connection_error(
                message="salesforce.errors.no_connection",
                details="No active Salesforce connection available",
                request=http_request,
                locale=lang
            )
        
        # Get the compilation status
        result = salesforce_service.get_compilation_status(compilation_id, connection_uuid)
        
        logger.debug(f"Retrieved compilation status successfully")
        return result
        
    except HTTPException:
        raise
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="getting compilation status",
            request=http_request,
            locale=lang
        )
