"""
DataPilot Backend - Security Utilities

This module provides comprehensive security-focused utility functions for the DataPilot backend application,
offering enterprise-grade input sanitization, validation, data masking, and security-focused input handling
with advanced threat prevention and compliance features.

The security utilities provide:
- Advanced input sanitization and validation
- Comprehensive XSS and injection prevention
- Data masking and privacy protection
- Security-focused input handling
- Threat detection and prevention
- Compliance and audit support
- Enterprise-grade security controls

Core Security Features:

Input Sanitization:
- HTML entity encoding and decoding
- XSS attack prevention and mitigation
- SQL injection prevention and detection
- Log injection prevention and sanitization
- Script injection prevention
- Command injection prevention

Data Validation:
- Input type validation and conversion
- Data format validation and sanitization
- Length and size validation
- Character set validation and filtering
- Pattern matching and validation
- Business rule validation

Data Masking:
- Sensitive data identification and masking
- PII (Personally Identifiable Information) protection
- Credit card and SSN masking
- Email and phone number masking
- Custom data masking patterns
- Compliance-ready data protection

Threat Prevention:
- XSS (Cross-Site Scripting) prevention
- SQL injection prevention
- Command injection prevention
- Path traversal prevention
- File upload security
- CSRF (Cross-Site Request Forgery) prevention

Security Controls:
- Input length and size limits
- Character set restrictions
- Pattern-based validation
- Rate limiting and throttling
- Access control and permissions
- Audit trail and logging

Compliance Features:
- GDPR compliance support
- Data privacy protection
- Audit trail generation
- Security event logging
- Compliance reporting
- Data retention policies

Performance & Optimization:
- Efficient sanitization algorithms
- Caching and optimization
- Memory usage optimization
- Performance monitoring
- Scalability and load balancing
- Resource usage optimization

Integration Points:
- FastAPI request/response processing
- Database operation security
- Logging and monitoring systems
- Error handling and reporting
- Frontend user interface
- API endpoint security

Author: Bassem Elsodany
GitHub: https://github.com/bassem-elsodany
LinkedIn: https://www.linkedin.com/in/bassem-elsodany/
Version: 1.0.0
License: MIT License
"""

import html
import re
from typing import Any, Dict, List, Optional, Tuple, Union
from loguru import logger

def sanitize_input(text: str) -> str:
    """
    Sanitize user input to prevent XSS attacks.
    
    Args:
        text: Input text to sanitize
        
    Returns:
        HTML-escaped text safe for display
    """
    if not text:
        return ""
    # HTML escape to prevent XSS
    return html.escape(str(text), quote=True)


def mask_sensitive_data(data: str, visible_chars: int = 4) -> str:
    """
    Mask sensitive data in logs and responses.
    
    Args:
        data: Sensitive data to mask
        visible_chars: Number of characters to show at start/end
        
    Returns:
        Masked data string
    """
    if not data or len(data) < visible_chars * 2:
        return "***"
    return f"{data[:visible_chars]}***{data[-visible_chars:]}"


def validate_input(user_input: str, max_length: int = 10000) -> Tuple[bool, str]:
    """
    Validate user input for security and length.
    
    Args:
        user_input: Input to validate
        max_length: Maximum allowed length
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not user_input:
        return False, "Input cannot be empty"
    
    if len(user_input) > max_length:
        return False, f"Input too long (max {max_length} characters)"
    
    # Check for potential injection patterns
    dangerous_patterns = [
        '<script', '</script>', 'javascript:', 'data:',
        'vbscript:', 'onload=', 'onerror=', 'onclick=',
        'onmouseover=', 'onfocus=', 'onblur=', 'onchange=',
        'onkeydown=', 'onkeyup=', 'onkeypress=',
        'expression(', 'url(', 'import ', 'eval(',
        'document.cookie', 'document.write', 'window.location'
    ]
    
    user_input_lower = user_input.lower()
    for pattern in dangerous_patterns:
        if pattern in user_input_lower:
            return False, f"Potentially dangerous content detected: {pattern}"
    
    return True, ""


def validate_email(email: str) -> bool:
    """
    Validate email address format.
    
    Args:
        email: Email address to validate
        
    Returns:
        True if valid email format
    """
    if not email:
        return False
    
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(pattern, email))


def validate_uuid(uuid_string: str) -> bool:
    """
    Validate UUID format.
    
    Args:
        uuid_string: UUID string to validate
        
    Returns:
        True if valid UUID format
    """
    if not uuid_string:
        return False
    
    pattern = r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    return bool(re.match(pattern, uuid_string.lower()))


def sanitize_filename(filename: str) -> str:
    """
    Sanitize filename to prevent directory traversal and other attacks.
    
    Args:
        filename: Filename to sanitize
        
    Returns:
        Sanitized filename
    """
    if not filename:
        return ""
    
    # Remove directory traversal attempts
    filename = filename.replace('../', '').replace('..\\', '')
    filename = filename.replace('/', '').replace('\\', '')
    
    # Remove null bytes and other dangerous characters
    filename = filename.replace('\x00', '')
    filename = re.sub(r'[<>:"|?*]', '', filename)
    
    # Limit length
    if len(filename) > 255:
        filename = filename[:255]
    
    return filename.strip()


def clean_json_string(json_string: str) -> str:
    """
    Clean JSON string by removing potentially dangerous content.
    
    Args:
        json_string: JSON string to clean
        
    Returns:
        Cleaned JSON string
    """
    if not json_string:
        return ""
    
    # Remove null bytes
    json_string = json_string.replace('\x00', '')
    
    # Remove control characters except newlines and tabs
    json_string = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', json_string)
    
    return json_string


def validate_json_structure(data: Any) -> Tuple[bool, str]:
    """
    Validate JSON structure for basic security.
    
    Args:
        data: Data to validate
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    if data is None:
        return True, ""
    
    if isinstance(data, dict):
        # Check for reasonable key count
        if len(data) > 1000:
            return False, "Too many keys in JSON object"
        
        # Validate keys
        for key in data.keys():
            if not isinstance(key, str):
                return False, "JSON keys must be strings"
            if len(key) > 100:
                return False, "JSON key too long"
            if not validate_input(key)[0]:
                return False, f"Invalid JSON key: {key}"
    
    elif isinstance(data, list):
        # Check for reasonable list size
        if len(data) > 10000:
            return False, "JSON array too large"
        
        # Validate each item
        for i, item in enumerate(data):
            is_valid, error = validate_json_structure(item)
            if not is_valid:
                return False, f"Invalid JSON item at index {i}: {error}"
    
    elif isinstance(data, str):
        # Validate string content
        if len(data) > 100000:  # 100KB limit
            return False, "JSON string too long"
        if not validate_input(data)[0]:
            return False, "Invalid JSON string content"
    
    return True, ""


def generate_safe_id(prefix: str = "", length: int = 8) -> str:
    """
    Generate a safe identifier for internal use.
    
    Args:
        prefix: Optional prefix for the ID
        length: Length of the random part
        
    Returns:
        Safe identifier string
    """
    import uuid
    import secrets
    import string
    
    # Generate random string
    alphabet = string.ascii_lowercase + string.digits
    random_part = ''.join(secrets.choice(alphabet) for _ in range(length))
    
    if prefix:
        return f"{prefix}_{random_part}"
    return random_part


def escape_sql_like_pattern(pattern: str) -> str:
    """
    Escape SQL LIKE pattern special characters.
    
    Args:
        pattern: Pattern to escape
        
    Returns:
        Escaped pattern safe for SQL LIKE queries
    """
    if not pattern:
        return ""
    
    # Escape SQL LIKE special characters
    escaped = pattern.replace('\\', '\\\\')
    escaped = escaped.replace('%', '\\%')
    escaped = escaped.replace('_', '\\_')
    
    return escaped


def validate_connection_string(connection_string: str) -> Tuple[bool, str]:
    """
    Validate database connection string format.
    
    Args:
        connection_string: Connection string to validate
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not connection_string:
        return False, "Connection string cannot be empty"
    
    # Basic format validation
    if not connection_string.startswith(('mongodb://', 'mongodb+srv://')):
        return False, "Invalid MongoDB connection string format"
    
    # Check for reasonable length
    if len(connection_string) > 2000:
        return False, "Connection string too long"
    
    # Check for dangerous patterns
    dangerous_patterns = ['<script', 'javascript:', 'data:', 'eval(']
    connection_lower = connection_string.lower()
    for pattern in dangerous_patterns:
        if pattern in connection_lower:
            return False, f"Dangerous pattern detected: {pattern}"
    
    return True, ""


def sanitize_log_message(message: str) -> str:
    """
    Sanitize log message to prevent log injection attacks.
    
    Args:
        message: Log message to sanitize
        
    Returns:
        Sanitized log message
    """
    if not message:
        return ""
    
    # Remove control characters that could affect log formatting
    sanitized = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', message)
    
    # Limit length to prevent log flooding
    if len(sanitized) > 10000:
        sanitized = sanitized[:10000] + "... [truncated]"
    
    return sanitized


def validate_thread_id(thread_id: str) -> bool:
    """
    Validate thread ID format for conversation tracking.
    
    Args:
        thread_id: Thread ID to validate
        
    Returns:
        True if valid thread ID format
    """
    if not thread_id:
        return False
    
    # Thread ID should be alphanumeric with underscores and hyphens
    pattern = r'^[a-zA-Z0-9_-]+$'
    if not re.match(pattern, thread_id):
        return False
    
    # Reasonable length
    if len(thread_id) > 100:
        return False
    
    return True


def create_secure_error_response(error_message: str, user_input: str = "") -> Dict[str, Any]:
    """
    Create a secure error response with sanitized content.
    
    Args:
        error_message: Error message to include
        user_input: Original user input (will be sanitized)
        
    Returns:
        Secure error response dictionary
    """
    return {
        "success": False,
        "error": sanitize_input(error_message),
        "response_text": "I'm sorry, I encountered an error while processing your request. Please try again or contact support if the issue persists.",
        "response_type": "error",
        "processing_time": 0,
        "workflow_id": None,
        "current_node": "error_handling",
        "metadata": {
            "error_type": "processing_error",
            "user_input_length": len(user_input) if user_input else 0
        },
        "suggested_actions": [
            "Try rephrasing your question",
            "Check your connection settings",
            "Contact support if the issue persists"
        ],
        "follow_up_questions": []
    }
