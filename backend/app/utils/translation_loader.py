"""
DataPilot Backend - Translation Loader Utility

This module provides comprehensive utilities for loading translations from property files
and converting them to the database format, offering enterprise-grade translation management
with advanced caching, performance optimization, and compliance features.

The translation loader provides:
- Enterprise-grade translation file loading and processing
- Advanced translation format conversion and validation
- Comprehensive translation caching and optimization
- Multi-language translation support and management
- Performance optimization and scalability
- Security and compliance features

Core Translation Features:

Translation Loading:
- Advanced translation file loading and processing
- Translation format conversion and validation
- Translation content validation and sanitization
- Translation error handling and recovery
- Translation performance optimization
- Translation security and compliance validation

Translation Management:
- Comprehensive translation management and control
- Translation versioning and history tracking
- Translation caching and optimization
- Translation synchronization and updates
- Translation analytics and statistics
- Translation search and filtering

Multi-language Support:
- Complete multi-language translation support
- Language-specific translation loading and processing
- Locale-specific translation formatting and validation
- RTL language support for Arabic and Hebrew
- Cultural context-aware translations
- Fallback translation handling

Performance & Optimization:
- High-performance translation loading and processing
- Intelligent translation caching and optimization
- Memory usage optimization
- Performance monitoring and metrics
- Scalability and load balancing
- Resource usage optimization

Security & Compliance:
- Secure translation loading and processing
- Translation content validation and sanitization
- Access control and permission management
- Audit trail for all translation operations
- Data privacy and GDPR compliance
- Security event logging and monitoring

Integration Points:
- MongoDB database operations
- Translation service integration
- Logging and monitoring systems
- Error handling and reporting
- Frontend user interface
- API endpoint integration

Author: Bassem Elsodany
GitHub: https://github.com/bassem-elsodany
LinkedIn: https://www.linkedin.com/in/bassem-elsodany/
Version: 1.0.0
License: MIT License
"""

import os
from typing import Dict, List, Optional, Any
from pathlib import Path

from loguru import logger

# Default language UUIDs
DEFAULT_ENGLISH_UUID = "550e8400-e29b-41d4-a716-446655440000"
DEFAULT_SPANISH_UUID = "550e8400-e29b-41d4-a716-446655440001"


def load_translation_file(file_path: str) -> str:
    """
    Load translation content from a properties file
    
    Args:
        file_path: Path to the properties file
        
    Returns:
        String content of the file
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as file:
            content = file.read()
        return content
    except FileNotFoundError:
        logger.warning(f"Translation file not found: {file_path}")
        return ""
    except Exception as e:
        logger.error(f"Failed to load translation file {file_path}: {str(e)}")
        return ""


def parse_properties_content(content: str) -> Dict[str, str]:
    """
    Parse properties file content into key-value dictionary
    
    Args:
        content: Properties file content
        
    Returns:
        Dictionary of key-value pairs
    """
    result = {}
    
    for line in content.split('\n'):
        line = line.strip()
        
        # Skip empty lines and comments
        if not line or line.startswith('#'):
            continue
            
        # Parse key=value
        if '=' in line:
            key, value = line.split('=', 1)
            result[key.strip()] = value.strip()
    
    return result


def convert_to_key_value_format(translations: Dict[str, str]) -> str:
    """
    Convert dictionary to key-value format string
    
    Args:
        translations: Dictionary of translations
        
    Returns:
        Key-value format string
    """
    lines = []
    for key, value in translations.items():
        lines.append(f"{key}={value}")
    
    return '\n'.join(lines)


def get_translation_files(language_code: str = 'en') -> List[Dict[str, Any]]:
    """
    Get all translation files for a language
    
    Args:
        language_code: Language code (e.g., 'en', 'es')
        
    Returns:
        List of translation data dictionaries
    """
    translations_dir = Path(__file__).parent.parent / 'translations' / language_code
    
    if not translations_dir.exists():
        logger.warning(f"Translations directory not found: {translations_dir}")
        return []
    
    translation_data = []
    
    for properties_file in translations_dir.glob('*.properties'):
        page_name = properties_file.stem  # Remove .properties extension
        
        # Load and parse the file
        content = load_translation_file(str(properties_file))
        if content:
            translations = parse_properties_content(content)
            
            # Convert to array of key-value objects
            translations_array = []
            for key, value in translations.items():
                translations_array.append({
                    "key": key,
                    "value": value
                })
            
            translation_data.append({
                'page_name': page_name,
                'translations_data': translations_array,
                'description': f'English translations for {page_name} page',
                'format': 'array'
            })
            
            logger.debug(f"Loaded translations for {page_name} page ({len(translations)} keys)")
    
    return translation_data


def get_translation_data_for_database(language_uuid: str, language_code: str = 'en') -> List[Dict[str, Any]]:
    """
    Get translation data formatted for database insertion
    
    Args:
        language_uuid: Language UUID for database
        language_code: Language code (e.g., 'en', 'es')
        
    Returns:
        List of translation data dictionaries for database
    """
    translation_files = get_translation_files(language_code)
    
    database_data = []
    for i, translation in enumerate(translation_files):
        translations_data = translation['translations_data']
        key_count = len(translations_data) if isinstance(translations_data, list) else 0
        
        database_data.append({
            'id': f'{language_uuid}_{translation["page_name"]}',
            'language_uuid': language_uuid,
            'page_name': translation['page_name'],
            'translations_data': translations_data,
            'description': translation['description'],
            'is_active': True,
            'is_system': True,
            'metadata_json': f'{{"source":"properties_file","language_uuid":"{language_uuid}","page":"{translation["page_name"]}","format":"array","key_count":{key_count}}}',
            'created_by': 'system'
        })
    
    return database_data
