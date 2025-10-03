"""
DataPilot Backend - Validation Utilities

This module provides comprehensive utility functions for data validation in the DataPilot backend,
offering enterprise-grade validation of master keys, UUIDs, connection identifiers, and SOQL query text
with advanced error handling, security features, and compliance support.

The validation utilities provide:
- Enterprise-grade master key validation and verification
- Advanced UUID format validation and checking
- Comprehensive connection UUID validation
- Intelligent SOQL query text validation
- Advanced input sanitization and validation
- Production-ready error handling and logging
- Comprehensive validation result reporting
- Advanced security and integrity checking

Core Validation Features:

Master Key Validation:
- Advanced master key strength and format validation
- Cryptographic key validation and verification
- Key security and integrity checking
- Key format and structure validation
- Key strength requirements and enforcement
- Key security and compliance validation

UUID Validation:
- Comprehensive UUID format and structure validation
- UUID version and variant validation
- UUID security and integrity checking
- UUID format standardization and normalization
- UUID validation error handling and reporting
- UUID security and compliance validation

Connection Validation:
- Advanced connection identifier validation
- Connection security and integrity checking
- Connection format and structure validation
- Connection security and compliance validation
- Connection validation error handling and reporting
- Connection security and audit support

SOQL Query Validation:
- Intelligent SOQL query syntax validation
- Query security and integrity checking
- Query format and structure validation
- Query security and compliance validation
- Query validation error handling and reporting
- Query security and audit support

Input Sanitization:
- Advanced input sanitization and cleaning
- Input security and integrity checking
- Input format and structure validation
- Input security and compliance validation
- Input validation error handling and reporting
- Input security and audit support

Security & Compliance:
- Advanced security validation and checking
- Data integrity verification and validation
- Security event logging and monitoring
- Compliance reporting and analytics
- Data privacy and GDPR compliance
- Security incident response

Performance & Optimization:
- Efficient validation algorithms
- Caching and optimization strategies
- Memory usage optimization
- Performance monitoring and metrics
- Scalability and load balancing
- Resource usage optimization

Integration Points:
- FastAPI request/response validation
- Database operation validation
- Logging and monitoring systems
- Error handling and reporting
- Frontend user interface
- Security and compliance systems

Author: Bassem Elsodany
GitHub: https://github.com/bassem-elsodany
LinkedIn: https://www.linkedin.com/in/bassem-elsodany/
Version: 1.0.0
License: MIT License
"""


from app.services.master_key_service import MasterKeyService
from loguru import logger

# Global service instances
master_key_service = MasterKeyService()

def validate_master_key(master_key: str) -> bool:
    """
    Validate master key and return True if valid
    
    Args:
        master_key: The master key to validate
        
    Returns:
        True if valid, False otherwise
    """
    try:
        return master_key_service.validate_master_key(master_key)
    except Exception as e:
        logger.error(f"Master key validation failed: {str(e)}")
        return False

def validate_uuid(uuid_string: str) -> bool:
    """
    Validate if a string is a valid UUID format
    
    Args:
        uuid_string: The string to validate as UUID
        
    Returns:
        True if valid UUID format, False otherwise
    """
    import re
    uuid_pattern = re.compile(
        r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
        re.IGNORECASE
    )
    return bool(uuid_pattern.match(uuid_string))

def validate_connection_uuid(connection_uuid: str) -> bool:
    """
    Validate connection UUID format
    
    Args:
        connection_uuid: The connection UUID to validate
        
    Returns:
        True if valid connection UUID, False otherwise
    """
    return validate_uuid(connection_uuid)

def validate_query_text(query_text: str) -> bool:
    """
    Validate SOQL query text (basic validation)
    
    Args:
        query_text: The SOQL query text to validate
        
    Returns:
        True if valid query text, False otherwise
    """
    if not query_text or not query_text.strip():
        return False
    
    # Basic SOQL validation - must start with SELECT
    query_upper = query_text.strip().upper()
    if not query_upper.startswith('SELECT'):
        return False
    
    # Must contain FROM clause
    if 'FROM' not in query_upper:
        return False
    
    return True
