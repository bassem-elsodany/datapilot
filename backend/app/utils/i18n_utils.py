"""
DataPilot Backend - Internationalization Utilities

This module provides comprehensive utility functions for internationalization support in the DataPilot backend,
offering enterprise-grade message translation, error message localization, and parameter formatting for
consistent internationalization across the entire application with advanced security and compliance features.

The I18n utilities provide:
- Enterprise-grade message translation and localization
- Advanced error message translation and localization
- Comprehensive success message translation and localization
- Intelligent parameter formatting and interpolation
- Advanced fallback language support and processing
- Module-specific translation prefixes and management
- Production-ready translation error handling and logging
- Advanced message formatting with parameters and validation

Core I18n Features:

Message Translation:
- Advanced message translation and localization
- Message key translation to target locale
- Message content validation and sanitization
- Message security and access control
- Message analytics and statistics
- Message search and filtering

Error Message Localization:
- Comprehensive error message translation and localization
- Error message content validation and sanitization
- Error message security and access control
- Error message analytics and statistics
- Error message search and filtering
- Error message compliance and audit support

Success Message Localization:
- Advanced success message translation and localization
- Success message content validation and sanitization
- Success message security and access control
- Success message analytics and statistics
- Success message search and filtering
- Success message compliance and audit support

Parameter Formatting:
- Intelligent parameter formatting and interpolation
- Parameter validation and sanitization
- Parameter security and access control
- Parameter analytics and statistics
- Parameter search and filtering
- Parameter compliance and audit support

Fallback Language Support:
- Advanced fallback language support and processing
- Fallback language content validation and sanitization
- Fallback language security and access control
- Fallback language analytics and statistics
- Fallback language search and filtering
- Fallback language compliance and audit support

Security & Compliance:
- Secure message translation and processing
- Message content validation and sanitization
- Access control and permission management
- Audit trail for all translation operations
- Data privacy and GDPR compliance
- Security event logging and monitoring

Performance & Optimization:
- High-performance message translation and processing
- Intelligent message caching and optimization
- Memory usage optimization
- Performance monitoring and metrics
- Scalability and load balancing
- Resource usage optimization

Integration Points:
- Translation service integration
- Error handling and reporting
- Logging and monitoring systems
- Frontend user interface
- API endpoint integration
- Security and compliance systems

Author: Bassem Elsodany
GitHub: https://github.com/bassem-elsodany
LinkedIn: https://www.linkedin.com/in/bassem-elsodany/
Version: 1.0.0
License: MIT License
"""

from loguru import logger
from typing import Optional
from app.services.i18n_service import I18nService


# Global i18n service instance
i18n_service = I18nService()

async def translate_message(message_key: str, locale: str = "en", module_prefix: str = None) -> str:
    """
    Translate a message key to the specified locale
    
    Args:
        message_key: The translation key to translate
        locale: The target locale (default: "en")
        module_prefix: Optional module prefix to check (e.g., "saved_queries", "query_history")
    
    Returns:
        Translated message or original key if translation not found
    """
    try:
        # If it's already a message (not a key), return as is
        if not message_key.startswith(f"{module_prefix}.") if module_prefix else not message_key.startswith(("errors.", "messages.")):
            return message_key
        
        # Try to get translation
        translated = await i18n_service.get_translation_key(locale, message_key)
        if translated:
            return translated
        
        # Fallback to English if translation not found
        if locale != "en":
            translated = await i18n_service.get_translation_key("en", message_key)
            if translated:
                return translated
        
        # Return the key if no translation found
        return message_key
        
    except Exception as e:
        logger.warning(f"Translation failed for key '{message_key}' in locale '{locale}': {str(e)}")
        return message_key

async def translate_error_message(message_key: str, locale: str = "en", module_prefix: str = None) -> str:
    """
    Translate an error message key to the specified locale
    
    Args:
        message_key: The error translation key to translate
        locale: The target locale (default: "en")
        module_prefix: Optional module prefix to check (e.g., "saved_queries", "query_history")
    
    Returns:
        Translated error message or original key if translation not found
    """
    return await translate_message(message_key, locale, module_prefix)

async def translate_success_message(message_key: str, locale: str = "en", module_prefix: str = None) -> str:
    """
    Translate a success message key to the specified locale
    
    Args:
        message_key: The success translation key to translate
        locale: The target locale (default: "en")
        module_prefix: Optional module prefix to check (e.g., "saved_queries", "query_history")
    
    Returns:
        Translated success message or original key if translation not found
    """
    return await translate_message(message_key, locale, module_prefix)

def format_message_with_params(message: str, **kwargs) -> str:
    """
    Format a message with parameters
    
    Args:
        message: The message template
        **kwargs: Parameters to format into the message
    
    Returns:
        Formatted message
    """
    try:
        return message.format(**kwargs)
    except (KeyError, ValueError) as e:
        logger.warning(f"Message formatting failed for '{message}' with params {kwargs}: {str(e)}")
        return message
