from typing import Optional, Any, Dict
from pydantic import BaseModel
from datetime import datetime


class ErrorResponse(BaseModel):
    """Standardized error response schema"""
    error_code: str
    message: str
    details: Optional[str] = None
    timestamp: datetime
    path: Optional[str] = None
    method: Optional[str] = None
    status_code: int


class ValidationErrorResponse(BaseModel):
    """Validation error response schema"""
    error_code: str = "validation_error"
    message: str
    field_errors: Dict[str, Any]
    timestamp: datetime
    path: Optional[str] = None
    method: Optional[str] = None
    status_code: int = 422


class DatabaseErrorResponse(BaseModel):
    """Database error response schema"""
    error_code: str = "database_error"
    message: str
    operation: str
    table: Optional[str] = None
    constraint: Optional[str] = None
    details: Optional[str] = None
    timestamp: datetime
    path: Optional[str] = None
    method: Optional[str] = None
    status_code: int = 500


class AuthenticationErrorResponse(BaseModel):
    """Authentication error response schema"""
    error_code: str = "authentication_error"
    message: str
    auth_type: str
    details: Optional[str] = None
    timestamp: datetime
    path: Optional[str] = None
    method: Optional[str] = None
    status_code: int = 401


class AuthorizationErrorResponse(BaseModel):
    """Authorization error response schema"""
    error_code: str = "authorization_error"
    message: str
    required_permissions: Optional[list] = None
    details: Optional[str] = None
    timestamp: datetime
    path: Optional[str] = None
    method: Optional[str] = None
    status_code: int = 403


class NotFoundErrorResponse(BaseModel):
    """Not found error response schema"""
    error_code: str = "not_found"
    message: str
    resource_type: str
    resource_id: Optional[str] = None
    details: Optional[str] = None
    timestamp: datetime
    path: Optional[str] = None
    method: Optional[str] = None
    status_code: int = 404


class ConflictErrorResponse(BaseModel):
    """Conflict error response schema"""
    error_code: str = "conflict"
    message: str
    resource_type: str
    resource_id: Optional[str] = None
    conflicting_field: Optional[str] = None
    details: Optional[str] = None
    timestamp: datetime
    path: Optional[str] = None
    method: Optional[str] = None
    status_code: int = 409


class ExternalServiceErrorResponse(BaseModel):
    """External service error response schema"""
    error_code: str = "external_service_error"
    message: str
    service_name: str
    service_endpoint: Optional[str] = None
    service_status_code: Optional[int] = None
    details: Optional[str] = None
    timestamp: datetime
    path: Optional[str] = None
    method: Optional[str] = None
    status_code: int = 502


class RateLimitErrorResponse(BaseModel):
    """Rate limit error response schema"""
    error_code: str = "rate_limit_exceeded"
    message: str
    limit_type: str
    retry_after: Optional[int] = None
    details: Optional[str] = None
    timestamp: datetime
    path: Optional[str] = None
    method: Optional[str] = None
    status_code: int = 429


class InternalServerErrorResponse(BaseModel):
    """Internal server error response schema"""
    error_code: str = "internal_server_error"
    message: str
    error_id: Optional[str] = None
    details: Optional[str] = None
    timestamp: datetime
    path: Optional[str] = None
    method: Optional[str] = None
    status_code: int = 500
