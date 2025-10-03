"""
Utils Module

This module contains utility functions and helper classes for the DataPilot backend.
These utilities provide common functionality used across different parts of the application.

Available utilities:
- security_utils.py: Security utilities (input sanitization, validation, data masking)
- json_utils.py: JSON processing utilities (parsing, validation, fixing)
- i18n_utils.py: Internationalization and translation utilities
- validation_utils.py: Data validation and sanitization utilities
- translation_loader.py: Translation file loading utilities

These utilities provide:
- Security-focused input handling and validation
- JSON processing and manipulation
- Internationalization support
- Data validation and sanitization
- Reusable business logic
- Code organization and maintainability

Author: Bassem Elsodany
GitHub: https://github.com/bassem-elsodany
LinkedIn: https://www.linkedin.com/in/bassem-elsodany/
Version: 1.0.0
License: MIT License
"""

# Import all utility functions for easy access
from .security_utils import (
    sanitize_input,
    mask_sensitive_data,
    validate_input,
    validate_email,
    validate_uuid,
    sanitize_filename,
    clean_json_string,
    validate_json_structure,
    generate_safe_id,
    escape_sql_like_pattern,
    validate_connection_string,
    sanitize_log_message,
    validate_thread_id,
    create_secure_error_response
)

from .json_utils import (
    fix_truncated_json,
    extract_json_block,
    validate_structured_payload
)

from .i18n_utils import (
    translate_message,
    translate_error_message,
    translate_success_message,
    format_message_with_params
)

from .validation_utils import (
    validate_master_key,
    validate_uuid as validate_uuid_format,
    validate_connection_uuid,
    validate_query_text
)

from .translation_loader import (
    load_translation_file,
    parse_properties_content,
    convert_to_key_value_format,
    get_translation_files,
    get_translation_data_for_database
)

from .ai_utils import (
    extract_tool_info,
    generate_tool_thought,
    parse_structured_response,
    is_tool_result
)

__all__ = [
    # Security utilities
    "sanitize_input",
    "mask_sensitive_data", 
    "validate_input",
    "validate_email",
    "validate_uuid",
    "sanitize_filename",
    "clean_json_string",
    "validate_json_structure",
    "generate_safe_id",
    "escape_sql_like_pattern",
    "validate_connection_string",
    "sanitize_log_message",
    "validate_thread_id",
    "create_secure_error_response",
    
    # JSON utilities
    "fix_truncated_json",
    "extract_json_block",
    "validate_structured_payload",
    
    # I18n utilities
    "translate_message",
    "translate_error_message", 
    "translate_success_message",
    "format_message_with_params",
    
    # Validation utilities
    "validate_master_key",
    "validate_uuid_format",
    "validate_connection_uuid",
    "validate_query_text",
    
    # Translation loader utilities
    "load_translation_file",
    "parse_properties_content",
    "convert_to_key_value_format",
    "get_translation_files",
    "get_translation_data_for_database",
    
    # AI utilities
    "extract_tool_info",
    "generate_tool_thought",
    "parse_structured_response",
    "is_tool_result"
]
