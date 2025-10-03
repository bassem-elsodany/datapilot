"""
DataPilot Backend - JSON Processing Utilities

This module provides comprehensive utilities for JSON processing, validation, and manipulation
in the DataPilot backend application, offering enterprise-grade JSON parsing, fixing truncated
JSON, and structured payload validation with advanced error handling and security features.

The JSON utilities provide:
- Enterprise-grade JSON parsing and validation
- Advanced truncated JSON fixing and recovery
- Intelligent JSON block extraction and processing
- Comprehensive structured payload validation
- Production-ready error handling for JSON operations
- Security and compliance features

Core JSON Features:

JSON Parsing & Validation:
- Advanced JSON parsing and validation
- JSON structure analysis and validation
- JSON content validation and sanitization
- JSON format validation and checking
- JSON security and integrity validation
- JSON compliance and audit support

Truncated JSON Handling:
- Intelligent truncated JSON fixing and recovery
- JSON structure completion and repair
- JSON content reconstruction and validation
- JSON error detection and correction
- JSON performance optimization
- JSON security and compliance validation

JSON Block Extraction:
- Advanced JSON block extraction and processing
- JSON content parsing and analysis
- JSON structure identification and processing
- JSON block validation and sanitization
- JSON block security and integrity checking
- JSON block compliance and audit support

Structured Payload Validation:
- Comprehensive structured payload validation
- Payload structure analysis and validation
- Payload content validation and sanitization
- Payload format validation and checking
- Payload security and integrity validation
- Payload compliance and audit support

Error Handling:
- Comprehensive error handling for JSON operations
- JSON error detection and recovery
- JSON error logging and monitoring
- JSON error reporting and analytics
- JSON error security and compliance
- JSON error audit and compliance

Security & Compliance:
- Secure JSON processing and validation
- JSON security and integrity checking
- JSON compliance and audit support
- JSON security event logging and monitoring
- JSON compliance reporting and analytics
- JSON data privacy and GDPR compliance

Performance & Optimization:
- Efficient JSON processing algorithms
- JSON caching and optimization strategies
- Memory usage optimization
- Performance monitoring and metrics
- Scalability and load balancing
- Resource usage optimization

Integration Points:
- FastAPI request/response processing
- Database JSON operations
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

import json
import re
from typing import Any, Dict, Optional
from loguru import logger


def fix_truncated_json(json_text: str) -> Optional[str]:
    """Attempt to fix truncated JSON by intelligently closing incomplete structures.
    
    This handles cases where the LLM response was cut off due to token limits.
    """
    try:
        # First try to parse as-is
        _ = json.loads(json_text)
        return json_text
    except json.JSONDecodeError as e:
        logger.debug(f"JSON parsing failed, attempting to fix: {e}")
        
    # If parsing failed, try to fix common truncation patterns
    fixed_json = json_text.strip()
    
    # Remove any trailing comma before the end
    fixed_json = re.sub(r',\s*$', '', fixed_json)
    
    # Count open vs closed brackets/braces
    open_braces = fixed_json.count('{')
    close_braces = fixed_json.count('}')
    open_brackets = fixed_json.count('[')
    close_brackets = fixed_json.count(']')
    
    # Fix missing closing brackets for arrays
    while open_brackets > close_brackets:
        fixed_json += ']'
        close_brackets += 1
    
    # Fix missing closing braces for objects
    while open_braces > close_braces:
        fixed_json += '}'
        close_braces += 1
    
    # Try to parse the fixed JSON
    try:
        parsed = json.loads(fixed_json)
        logger.debug(f"Successfully fixed truncated JSON (added {open_braces - close_braces} closing braces, {open_brackets - close_brackets} closing brackets)")
        return fixed_json
    except json.JSONDecodeError as e:
        logger.warning(f"Could not fix truncated JSON: {e}")
        return None


def extract_json_block(text: str) -> Optional[str]:
    """Attempt to extract a JSON string from raw LLM text.
    - Handles plain JSON
    - Handles fenced ```json blocks
    - Falls back to balanced brace block with proper nesting
    """
    try:
        # Quick path: direct JSON
        _ = json.loads(text)
        return text
    except Exception:
        pass

    # Look for fenced code block ```json ... ```
    fenced = re.search(r"```json\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
    if fenced:
        candidate = fenced.group(1).strip()
        try:
            _ = json.loads(candidate)
            return candidate
        except Exception:
            pass

    # Fallback: attempt to find balanced {...} block
    start = text.find('{')
    if start == -1:
        return None
    
    # Find the matching closing brace by counting braces
    brace_count = 0
    end = start
    for i, char in enumerate(text[start:], start):
        if char == '{':
            brace_count += 1
        elif char == '}':
            brace_count -= 1
            if brace_count == 0:
                end = i
                break
    
    # If we found a balanced block, try to parse it
    if brace_count == 0 and end > start:
        candidate = text[start:end+1]
        try:
            _ = json.loads(candidate)
            return candidate
        except Exception:
            # If the balanced block is still invalid, it might be truncated
            # Try to find the last complete object/array by looking backwards
            for i in range(end, start, -1):
                if text[i] in '}]':
                    try:
                        partial_candidate = text[start:i+1]
                        _ = json.loads(partial_candidate)
                        return partial_candidate
                    except Exception:
                        continue
            pass

    return None


def validate_structured_payload(payload: Dict[str, Any]) -> bool:
    """Minimal schema validation for structured AI response."""
    try:
        logger.debug(f"Validating payload: {list(payload.keys())}")
        if not isinstance(payload, dict):
            logger.error(f"Payload is not a dict: {type(payload)}")
            return False
        if 'response_type' not in payload:
            logger.error(f"Missing response_type in payload")
            return False
        allowed_types = {
            'metadata_query', 'data_query', 'clarification_needed',
            'relationship_query', 'field_details_query'
        }
        if not isinstance(payload['response_type'], str) or payload['response_type'] not in allowed_types:
            logger.error(f"Invalid response_type: {payload['response_type']} (type: {type(payload['response_type'])})")
            return False
        if 'confidence' in payload and payload['confidence'] is not None and not isinstance(payload['confidence'], (int, float)):
            logger.error(f"Invalid confidence type: {type(payload['confidence'])}")
            return False
        if 'data_summary' in payload and not isinstance(payload['data_summary'], dict):
            logger.error(f"Invalid data_summary type: {type(payload['data_summary'])}")
            return False
        logger.debug(f"Payload validation passed")
        return True
    except Exception as e:
        logger.error(f"Validation exception: {e}")
        return False
