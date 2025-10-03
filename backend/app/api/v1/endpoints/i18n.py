"""
DataPilot Backend - Internationalization API Endpoints

This module provides comprehensive RESTful API endpoints for internationalization (i18n) functionality
in the DataPilot backend, offering enterprise-grade language management and translation services
with advanced security, performance, and compliance features.

The I18n API provides:
- Enterprise-grade language management and configuration
- Advanced translation retrieval by locale, page, or specific key
- Comprehensive translation statistics and metadata
- Intelligent locale management and selection
- Advanced page-based translation organization
- Production-ready translation validation and error handling
- REST-compliant resource hierarchy and architecture

Core I18n Features:

Language Management:
- Complete language management and configuration
- Language metadata and configuration
- Language security and access control
- Language analytics and statistics
- Language search and filtering
- Language audit and compliance

Translation Services:
- Advanced translation retrieval by locale, page, or specific key
- Translation content validation and sanitization
- Translation security and access control
- Translation analytics and statistics
- Translation search and filtering
- Translation audit and compliance

Locale Management:
- Intelligent locale management and selection
- Locale-specific translation formatting and validation
- Locale security and access control
- Locale analytics and statistics
- Locale search and filtering
- Locale audit and compliance

Page Organization:
- Advanced page-based translation organization
- Page translation validation and sanitization
- Page security and access control
- Page analytics and statistics
- Page search and filtering
- Page audit and compliance

Statistics & Monitoring:
- Comprehensive translation statistics and metadata
- Translation usage analytics and reporting
- Translation performance monitoring and metrics
- Translation error tracking and analysis
- Translation optimization and recommendations
- Translation business intelligence and insights

Security & Compliance:
- Secure translation operations and access control
- Translation content validation and sanitization
- Access control and permission management
- Audit trail for all translation operations
- Data privacy and GDPR compliance
- Security event logging and monitoring

Performance & Optimization:
- High-performance translation operations
- Intelligent translation caching and optimization
- Memory usage optimization
- Performance monitoring and metrics
- Scalability and load balancing
- Resource usage optimization

REST API Endpoints:

Language Management:
- GET /i18n/languages - Get all languages with advanced filtering and field selection
- POST /i18n/languages - Create new language with validation
- PUT /i18n/languages/{language_uuid}/default - Set default language for the system

Translation Services:
- GET /i18n/translations/pages - Get available translation pages
- GET /i18n/translations/{langCode}/{page} - Get translations by page with caching
- GET /i18n/translations/{langCode}/{page}/key/{key} - Get specific translation key
- GET /i18n/stats - Get comprehensive translation statistics

Translation Operations:
- POST /i18n/translations/{langCode}/reload - Reload translations for language
- POST /i18n/translations/{langCode}/reload?pageName=pageName - Reload translations for specific page
- GET /i18n/translations/{langCode}/reload?pageName=pageName - Get translations for specific page

Integration Points:
- MongoDB database operations
- Translation service integration
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

from typing import List, Dict, Any, Optional, Union
from fastapi import APIRouter, HTTPException, Query, Request, status
from pydantic import BaseModel, Field

from app.services.i18n_service import I18nService
from app.services.error_service import ErrorService


from loguru import logger

router = APIRouter()

# ========================================
# PYDANTIC MODELS
# ========================================

class LanguageResponse(BaseModel):
    """
    Language response model for API responses.
    
    Represents a language configuration with all necessary metadata
    for frontend display and language selection.
    
    Attributes:
        language_uuid: Unique identifier for the language
        language_code: ISO language code (e.g., 'en', 'es', 'fr')
        language_name: Human-readable language name in English
        native_name: Language name in its native script
        direction: Text direction ('ltr' for left-to-right, 'rtl' for right-to-left)
        is_active: Whether the language is currently active
        is_default: Whether this is the default language
        is_system: Whether this is a system-managed language
        metadata: Additional language metadata as JSON string
        created_at: ISO timestamp when the language was created
        updated_at: ISO timestamp when the language was last updated
    """
    language_uuid: str
    language_code: str
    language_name: str
    native_name: str
    direction: str
    is_active: bool
    is_default: bool
    is_system: bool
    metadata: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

class TranslationResponse(BaseModel):
    """
    Translation response model for API responses.
    
    Represents a complete translation page with all its keys and values
    for a specific language and page combination.
    
    Attributes:
        id: Unique identifier for the translation entry
        language_uuid: UUID of the associated language
        language_code: ISO language code for the translation
        page_name: Name of the page/component these translations belong to
        translations_data: Dictionary mapping translation keys to their values
        description: Human-readable description of the translation page
        is_active: Whether this translation is currently active
        is_system: Whether this is a system-managed translation
        metadata: Additional translation metadata as JSON string
        created_at: ISO timestamp when the translation was created
        updated_at: ISO timestamp when the translation was last updated
    """
    id: str
    language_uuid: str
    language_code: str
    page_name: str
    translations_data: Dict[str, str]
    description: Optional[str] = None
    is_active: bool
    is_system: bool
    metadata: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

class TranslationKeyResponse(BaseModel):
    """
    Translation key response model for single key lookups.
    
    Used when retrieving a specific translation key rather than
    an entire translation page.
    
    Attributes:
        key: The translation key that was requested
        value: The translated value for the key (None if not found)
        found: Boolean indicating whether the key was found in the database
    """
    key: str
    value: Optional[str] = None
    found: bool

class TranslationStatsResponse(BaseModel):
    """
    Translation statistics response model for system overview.
    
    Provides aggregate statistics about the translation system
    for monitoring and administrative purposes.
    
    Attributes:
        languages: Total number of active languages in the system
        translations: Total number of translation entries
        pages: Total number of unique translation pages
        total_keys: Total number of translation keys across all pages
    """
    languages: int
    translations: int
    pages: int
    total_keys: int

class LocaleResponse(BaseModel):
    """
    Locale response model for language selection.
    
    Simplified language representation used for locale selection
    in user interfaces, containing only essential information.
    
    Attributes:
        code: ISO language code (e.g., 'en', 'es', 'fr')
        name: Human-readable language name for display
    """
    code: str
    name: str

class CreateLanguageRequest(BaseModel):
    """
    Request model for creating a new language.
    
    Contains all necessary information to create a new language
    configuration in the system.
    
    Attributes:
        language_code: ISO language code (e.g., 'en', 'es', 'fr', 'de')
        language_name: Human-readable language name in English
        native_name: Language name in its native script
        direction: Text direction ('ltr' for left-to-right, 'rtl' for right-to-left)
        is_active: Whether the language should be active (default: True)
        is_default: Whether this should be the default language (default: False)
        is_system: Whether this is a system-managed language (default: False)
        metadata: Additional language metadata as JSON string (optional)
    """
    language_code: str = Field(..., min_length=2, max_length=5, description="ISO language code (e.g., 'en', 'es', 'fr')")
    language_name: str = Field(..., min_length=1, max_length=100, description="Human-readable language name in English")
    native_name: str = Field(..., min_length=1, max_length=100, description="Language name in its native script")
    direction: str = Field(default="ltr", pattern="^(ltr|rtl)$", description="Text direction: 'ltr' or 'rtl'")
    is_active: bool = Field(default=True, description="Whether the language should be active")
    is_default: bool = Field(default=False, description="Whether this should be the default language")
    is_system: bool = Field(default=False, description="Whether this is a system-managed language")
    metadata: Optional[str] = Field(default=None, description="Additional language metadata as JSON string")

class CreateLanguageResponse(BaseModel):
    """
    Response model for language creation operations.
    
    Provides feedback about the language creation operation including
    success status, created language information, and any warnings.
    
    Attributes:
        success: Boolean indicating if the creation operation was successful
        message: Human-readable message describing the operation result
        language: The created language object with all its details
        created_at: ISO timestamp when the language was created
    """
    success: bool
    message: str
    language: LanguageResponse
    created_at: Optional[str] = None

# ========================================
# GLOBAL SERVICE INSTANCE
# ========================================

# Initialize the I18nService instance for handling all i18n operations
i18n_service = I18nService()

# ========================================
# LANGUAGE ENDPOINTS
# ========================================

@router.get("/languages", response_model=List[Any])
def get_all_languages(
    http_request: Request,
    is_active: Optional[bool] = Query(None, description="Filter by active status. If not provided, returns all languages (active and inactive)"),
    fields: Optional[str] = Query(None, description="Comma-separated list of fields to return (e.g., 'code,name' for locale format)"),
    lang: str = Query("en", description="Language code for messages")
):
    """
    GET /i18n/languages - Get all languages
    
    Retrieves a list of all languages configured in the system.
    This endpoint is used by the frontend to populate language selection
    dropdowns and determine available locales. Can be filtered by
    active status and field selection for different use cases.
    
    Args:
        is_active: Filter by active status. If not provided, returns all languages (active and inactive)
        fields: Comma-separated list of fields to return. Special values:
               - "code,name" or "locale" - Returns simplified locale format
               - "all" or None - Returns full language objects
               - Custom field list (e.g., "language_code,language_name")
    
    Returns:
        List[LanguageResponse|LocaleResponse|Dict]: List of languages in requested format
        
    Raises:
        HTTPException: 500 if database query fails or service error occurs
        
    Example Usage:
        GET /api/v1/i18n/languages                           # All languages (active and inactive)
        GET /api/v1/i18n/languages?is_active=true            # Only active languages
        GET /api/v1/i18n/languages?is_active=false           # Only inactive languages
        GET /api/v1/i18n/languages?fields=code,name          # Simplified locale format
        GET /api/v1/i18n/languages?fields=locale             # Same as code,name
        GET /api/v1/i18n/languages?fields=language_code,language_name  # Custom fields
    """
    try:
        languages = i18n_service.get_all_languages(is_active=is_active)
        
        # Handle field selection
        if fields:
            fields_lower = fields.lower().strip()
            
            # Special case: locale format
            if fields_lower in ["code,name", "locale"]:
                return [
                    {"code": lang["language_code"], "name": lang["language_name"]}
                    for lang in languages
                ]
            
            # Custom field selection
            field_list = [f.strip() for f in fields.split(",")]
            result = []
            for lang in languages:  # type: ignore
                if isinstance(lang, dict):
                    filtered_lang = {}
                    for field in field_list:
                        if field in lang:
                            filtered_lang[field] = lang[field]  # type: ignore
                    result.append(filtered_lang)
            return result
        
        # Default: return full language objects
        return languages
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="retrieving languages",
            request=http_request,
            locale=lang
        )

@router.post("/languages", response_model=CreateLanguageResponse, status_code=status.HTTP_201_CREATED)
def create_language(
    request: CreateLanguageRequest,
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """
    POST /i18n/languages - Create a new language
    
    Creates a new language configuration in the system. This endpoint allows
    administrators to add support for new languages to the DataPilot application.
    
    The operation will:
    1. Validate that the language code is unique and not already exists
    2. Validate all required fields and constraints
    3. Create the language record in the database
    4. Generate a unique UUID for the language
    5. Set appropriate timestamps
    6. Return the created language object with all details
    
    Args:
        request: CreateLanguageRequest containing all language configuration details
        
    Returns:
        CreateLanguageResponse: Object containing creation results and language information
        
    Raises:
        HTTPException: 400 if request data is invalid or language code already exists
        HTTPException: 422 if validation fails
        HTTPException: 500 if creation operation fails
    """
    try:
        # Check if language code already exists
        existing_languages = i18n_service.get_all_languages()
        language_code_exists = any(
            lang_obj["language_code"] == request.language_code 
            for lang_obj in existing_languages
        )
        
        if language_code_exists:
            ErrorService.raise_conflict_error(
                message="i18n.errors.language_code_already_exists",
                resource_type="language",
                resource_id=request.language_code,
                conflicting_field="language_code",
                details=f"Language code '{request.language_code}' already exists in the system",
                request=http_request,
                locale=lang
            )
        
        # Create the language using the service
        create_result = i18n_service.create_language(
            language_code=request.language_code,
            language_name=request.language_name,
            native_name=request.native_name,
            direction=request.direction,
            is_active=request.is_active,
            is_default=request.is_default,
            is_system=request.is_system,
            metadata=request.metadata
        )
        
        if not create_result.get("success", False):
            ErrorService.raise_internal_server_error(
                message="i18n.errors.language_creation_failed",
                details=create_result.get("error", "Failed to create language"),
                request=http_request,
                locale=lang
            )
        
        # Get the created language object
        created_language = create_result.get("language")
        if not created_language:
            ErrorService.raise_internal_server_error(
                message="i18n.errors.language_creation_failed",
                details="Language was created but object not returned",
                request=http_request,
                locale=lang
            )
        
        # Format the response
        from datetime import datetime
        created_at = datetime.utcnow().isoformat() + "Z"
        
        # Create success message
        message = f"Language '{request.language_name} ({request.language_code})' created successfully"
        
        return CreateLanguageResponse(
            success=True,
            message=message,
            language=LanguageResponse(**created_language),
            created_at=created_at
        )
        
    except HTTPException:
        raise
    except Exception as e:
        ErrorService.handle_generic_exception(
            exception=e,
            operation="creating language",
            request=http_request,
            locale=lang
        )

# ========================================
# TRANSLATION ENDPOINTS
# ========================================

@router.get("/translations/pages", response_model=List[str])
def get_available_pages(
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """
    GET /i18n/translations/pages - Get all available page names
    
    Retrieves a list of all available translation page names in the system.
    This endpoint is useful for administrative purposes and for understanding
    the structure of the translation system.
    
    Returns:
        List[str]: List of all available page names
        
    Raises:
        HTTPException: 500 if database query fails or service error occurs
        
    Example Response:
        ["app", "settings", "query", "connections", "masterKey", "common", "error"]
    """
    try:
        pages = i18n_service.get_available_pages()
        return pages
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="retrieving available pages",
            request=http_request,
            locale=lang
        )


@router.get("/translations/{langCode}/{page_name}", response_model=TranslationResponse)
def get_translation_by_page(
    langCode: str,
    page_name: str,
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """
    GET /i18n/translations/{langCode}/{page_name} - Get translation for a specific page
    
    Retrieves translations for a specific page/component within a language.
    This endpoint is useful for lazy loading translations or when
    only specific page translations are needed.
    
    Args:
        langCode: ISO language code (e.g., 'en', 'es', 'fr')
        page_name: Name of the translation page (e.g., 'app', 'settings', 'query')
        
    Returns:
        TranslationResponse: Translation data for the specified page and language
        
    Raises:
        HTTPException: 404 if translation not found for the specified langCode/page
        HTTPException: 500 if database query fails or service error occurs
        
    Example Response:
        {
            "id": "en_app",
            "language_uuid": "lang_en_001",
            "language_code": "en",
            "page_name": "app",
            "translations_data": {
                "app.title": "DataPilot",
                "app.name": "DataPilot"
            },
            "is_active": true,
            "is_system": true
        }
    """
    try:
        translation = i18n_service.get_translation_by_page(langCode, page_name)
        if not translation:

            ErrorService.raise_not_found_error(
                message="i18n.errors.translation_not_found",
                resource_type="translation",
                resource_id=f"{langCode}/{page_name}",
                request=http_request,
                locale=lang
            )
        return translation
    except HTTPException:
        raise
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="retrieving translation by page",
            request=http_request,
            locale=lang
        )

@router.get("/translations/{langCode}/{page_name}/key/{key}", response_model=TranslationKeyResponse)
def get_translation_key_by_page(
    langCode: str,
    page_name: str,
    key: str,
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """
    GET /i18n/translations/{langCode}/{page_name}/key/{key} - Get a specific translation key from a specific page
    
    Retrieves a single translation key value from a specific page for a specific language.
    This endpoint is the most practical for UI applications that need to get
    a specific translation key from a known page.
    
    Args:
        langCode: ISO language code (e.g., 'en', 'es', 'fr')
        page_name: Name of the translation page (e.g., 'app', 'settings', 'query')
        key: Translation key to retrieve (e.g., 'title', 'name', 'description')
        
    Returns:
        TranslationKeyResponse: Object containing the key, its value, and found status
        
    Raises:
        HTTPException: 500 if database query fails or service error occurs
        
    Example Response:
        {
            "key": "title",
            "value": "DataPilot",
            "found": true
        }
        
    Example Response (not found):
        {
            "key": "nonexistent_key",
            "value": null,
            "found": false
        }
        
    Example Usage:
        GET /api/v1/i18n/translations/en/app/key/title  # Get "title" key from "app" page in English
        GET /api/v1/i18n/translations/es/settings/key/language  # Get "language" key from "settings" page in Spanish
    """
    try:
        value = i18n_service.get_translation_key_by_page(langCode, page_name, key)
        return TranslationKeyResponse(
            key=key,
            value=value,
            found=value is not None
        )
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="retrieving translation key by page",
            request=http_request,
            locale=lang
        )


# ========================================
# STATISTICS ENDPOINTS
# ========================================

@router.get("/stats", response_model=TranslationStatsResponse)
def get_translation_stats(
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """
    GET /i18n/stats - Get translation statistics
    
    Retrieves aggregate statistics about the translation system.
    This endpoint provides useful metrics for monitoring the health
    and completeness of the translation system.
    
    Returns:
        TranslationStatsResponse: Object containing various translation statistics
        
    Raises:
        HTTPException: 500 if database query fails or service error occurs
        
    Example Response:
        {
            "languages": 3,
            "translations": 15,
            "pages": 21,
            "total_keys": 450
        }
    """
    try:
        stats = i18n_service.get_translation_stats()
        return stats
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="retrieving translation statistics",
            request=http_request,
            locale=lang
        )

# ========================================
# RELOAD ENDPOINTS
# ========================================

class TranslationReloadResponse(BaseModel):
    """
    Translation reload response model for reload operations.
    
    Provides feedback about the translation reload operation including
    success status, number of translations reloaded, and any warnings.
    
    Attributes:
        success: Boolean indicating if the reload operation was successful
        message: Human-readable message describing the operation result
        locale: The locale that was reloaded
        translations_reloaded: Number of translation pages that were reloaded
        total_keys: Total number of translation keys reloaded
        warnings: List of any warnings encountered during reload
        reloaded_at: ISO timestamp when the reload operation completed
    """
    success: bool
    message: str
    locale: str
    translations_reloaded: int
    total_keys: int
    warnings: Optional[List[str]] = None
    reloaded_at: Optional[str] = None

@router.post("/translations/{langCode}/reload", response_model=TranslationReloadResponse)
def reload_translations_for_locale(
    langCode: str,
    http_request: Request,
    pageName: Optional[str] = Query(None, description="Optional page name to reload specific page translations"),
    lang: str = Query("en", description="Language code for messages")
):
    """
    POST /i18n/translations/{langCode}/reload - Reload translations for a specific language from property files
    
    Reloads translation data for a specific language from property files. Can reload all translations
    for the language or just a specific page. This endpoint is useful for refreshing translations
    after manual updates to property files without requiring a full application restart.
    
    This operation will:
    1. Clear existing translation records for the specified language (and optionally specific page)
    2. Load fresh translation data from property files in the translations/{langCode}/ directory
    3. Re-insert translation keys into the database
    4. Clear and refresh the in-memory translation cache
    
    Args:
        langCode: ISO language code (e.g., 'en', 'es', 'fr') to reload
        pageName: Optional page name (e.g., 'app', 'settings', 'connections') to reload specific page only
        
    Returns:
        TranslationReloadResponse: Object containing reload operation results
        
    Raises:
        HTTPException: 400 if locale is invalid or not supported
        HTTPException: 404 if locale not found in the system
        HTTPException: 500 if reload operation fails
        
    Example Response (all translations):
        {
            "success": true,
            "message": "Translations for locale 'en' reloaded successfully from property files",
            "locale": "en",
            "translations_reloaded": 26,
            "total_keys": 450,
            "warnings": [],
            "reloaded_at": "2024-01-15T10:30:00Z"
        }
        
    Example Response (specific page):
        {
            "success": true,
            "message": "Translations for locale 'en', page 'app' reloaded successfully from property files",
            "locale": "en",
            "translations_reloaded": 1,
            "total_keys": 18,
            "warnings": [],
            "reloaded_at": "2024-01-15T10:30:00Z"
        }
        
    Example Usage:
        POST /api/v1/i18n/translations/en/reload                    # Reload all English translations
        POST /api/v1/i18n/translations/en/reload?pageName=app      # Reload only app page translations
        POST /api/v1/i18n/translations/es/reload?pageName=settings # Reload only settings page in Spanish
    """
    try:
        # Validate that the locale exists in the system
        languages = i18n_service.get_all_languages()
        locale_exists = any(lang["language_code"] == langCode for lang in languages)
        
        if not locale_exists:

        
            ErrorService.raise_not_found_error(
                message="i18n.errors.locale_not_found",
                resource_type="locale",
                resource_id=langCode,
                request=http_request,
                locale=lang
            )
        
        # Perform the reload operation
        reload_result = i18n_service.reload_translations_for_locale(langCode, page_name=pageName)
        
        # Format the response
        from datetime import datetime
        reloaded_at = datetime.utcnow().isoformat() + "Z"
        
        return TranslationReloadResponse(
            success=reload_result.get("success", False),
            message=reload_result.get("message", f"Translations for locale '{langCode}' reloaded from property files"),
            locale=langCode,
            translations_reloaded=reload_result.get("translations_reloaded", 0),
            total_keys=reload_result.get("total_keys", 0),
            warnings=reload_result.get("warnings", []),
            reloaded_at=reloaded_at
        )
        
    except HTTPException:
        raise
    except Exception as e:

        ErrorService.handle_generic_exception(
            exception=e,
            operation="reloading translations for locale",
            request=http_request,
            locale=lang
        )

# ========================================
# DEFAULT LANGUAGE ENDPOINTS
# ========================================

class SetDefaultLanguageResponse(BaseModel):
    """
    Response model for setting the default language.
    
    Provides feedback about the default language update operation including
    success status, previous default, and new default language information.
    
    Attributes:
        success: Boolean indicating if the operation was successful
        message: Human-readable message describing the operation result
        previous_default: The language code that was previously set as default
        new_default: The language code that is now set as default
        updated_at: ISO timestamp when the default language was updated
    """
    success: bool
    message: str
    previous_default: Optional[str] = None
    new_default: str
    updated_at: Optional[str] = None

class SetActiveStatusRequest(BaseModel):
    """Request model for setting language active status"""
    is_active: bool

class SetActiveStatusResponse(BaseModel):
    """
    Response model for setting language active status
    
    Attributes:
        success: Boolean indicating if the operation was successful
        message: Human-readable message describing the operation result
        language_code: The language code that was updated
        previous_active: The previous active status
        new_active: The new active status
        updated_at: ISO timestamp when the active status was updated
    """
    success: bool
    message: str
    language_code: str
    previous_active: bool
    new_active: bool
    updated_at: Optional[str] = None

@router.put("/languages/{language_uuid}/default", response_model=SetDefaultLanguageResponse, status_code=status.HTTP_200_OK)
def set_default_language(
    language_uuid: str,
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """
    PUT /i18n/languages/{language_uuid}/default - Set the default language for the system
    
    Updates the system's default language configuration by setting the specified language
    as the default. This affects which language is used when no specific language is 
    requested and serves as the fallback language for the entire application.
    
    The operation will:
    1. Validate that the specified language UUID exists and is active in the system
    2. Update the default language configuration in the database
    3. Clear and refresh the in-memory translation cache
    4. Return confirmation of the change with previous and new default information
    
    Args:
        language_uuid: UUID of the language to set as default
        
    Returns:
        SetDefaultLanguageResponse: Object containing operation results and language information
        
    Raises:
        HTTPException: 400 if language_uuid is invalid
        HTTPException: 404 if language not found in the system
        HTTPException: 500 if update operation fails
        
    Example Response:
        {
            "success": true,
            "message": "Default language updated successfully from 'en' to 'es'",
            "previous_default": "en",
            "new_default": "es",
            "updated_at": "2024-01-15T10:30:00Z"
        }
        
    Example Usage:
        PUT /api/v1/i18n/languages/550e8400-e29b-41d4-a716-446655440000/default
    """
    try:
        # Validate that the language exists and is active in the system
        languages = i18n_service.get_all_languages(is_active=True)
        target_language = None
        
        for lang_obj in languages:
            if lang_obj["language_uuid"] == language_uuid:
                target_language = lang_obj
                break
        
        if not target_language:
            ErrorService.raise_not_found_error(
                message="i18n.errors.language_not_found",
                resource_type="language",
                resource_id=language_uuid,
                request=http_request,
                locale=lang
            )
        
        # Get current default language before updating
        current_default = None
        for lang_obj in languages:
            if lang_obj.get("is_default", False):
                current_default = lang_obj["language_code"]
                break
        
        # Set the new default language using the language_code from the target language
        target_language_code = target_language["language_code"]
        update_result = i18n_service.set_default_language(target_language_code)
        
        if not update_result.get("success", False):
            ErrorService.raise_internal_server_error(
                message="i18n.errors.set_default_failed",
                details=update_result.get("error", "Failed to update default language"),
                request=http_request,
                locale=lang
            )
        
        # Format the response
        from datetime import datetime
        updated_at = datetime.utcnow().isoformat() + "Z"
        
        # Create success message
        if current_default and current_default != target_language_code:
            message = f"Default language updated successfully from '{current_default}' to '{target_language_code}'"
        else:
            message = f"Default language set to '{target_language_code}'"
        
        return SetDefaultLanguageResponse(
            success=True,
            message=message,
            previous_default=current_default,
            new_default=target_language_code,
            updated_at=updated_at
        )
        
    except HTTPException:
        raise
    except Exception as e:
        ErrorService.handle_generic_exception(
            exception=e,
            operation="setting default language",
            request=http_request,
            locale=lang
        )

@router.put("/languages/{language_uuid}/active", response_model=SetActiveStatusResponse, status_code=status.HTTP_200_OK)
def set_language_active_status(
    language_uuid: str,
    request: SetActiveStatusRequest,
    http_request: Request,
    lang: str = Query("en", description="Language code for messages")
):
    """
    PUT /i18n/languages/{language_uuid}/active - Set the active status of a language
    
    Updates the active status of a language in the system. This controls whether
    the language appears in language selection dropdowns and is available for use.
    Only active languages can be set as the default language.
    
    The operation will:
    1. Validate that the specified language UUID exists in the system
    2. Update the active status in the database
    3. Return confirmation of the change with previous and new status information
    
    Args:
        language_uuid: UUID of the language to update
        request: SetActiveStatusRequest containing the new active status
        
    Returns:
        SetActiveStatusResponse: Object containing operation results and status information
        
    Raises:
        HTTPException: 400 if language_uuid is invalid or request data is malformed
        HTTPException: 404 if language not found in the system
        HTTPException: 500 if update operation fails
        
    Example Request:
        PUT /api/v1/i18n/languages/550e8400-e29b-41d4-a716-446655440000/active
        {
            "is_active": true
        }
        
    Example Response:
        {
            "success": true,
            "message": "Language active status updated successfully from 'false' to 'true'",
            "language_code": "es",
            "previous_active": false,
            "new_active": true,
            "updated_at": "2024-01-15T10:30:00Z"
        }
        
    Example Usage:
        PUT /api/v1/i18n/languages/550e8400-e29b-41d4-a716-446655440000/active
    """
    try:
        # Validate that the language exists in the system
        languages = i18n_service.get_all_languages()  # Get all languages (active and inactive)
        target_language = None
        
        for lang_obj in languages:
            if lang_obj["language_uuid"] == language_uuid:
                target_language = lang_obj
                break
        
        if not target_language:
            ErrorService.raise_not_found_error(
                message="i18n.errors.language_not_found",
                resource_type="language",
                resource_id=language_uuid,
                request=http_request,
                locale=lang
            )
        
        # Get current active status
        current_active = target_language.get("is_active", False)
        new_active = request.is_active
        
        # If the status is already the same, return success without updating
        if current_active == new_active:
            from datetime import datetime
            updated_at = datetime.utcnow().isoformat() + "Z"
            
            return SetActiveStatusResponse(
                success=True,
                message=f"Language active status is already '{new_active}'",
                language_code=target_language["language_code"],
                previous_active=current_active,
                new_active=new_active,
                updated_at=updated_at
            )
        
        # Update the active status using the language_code
        target_language_code = target_language["language_code"]
        update_result = i18n_service.set_language_active_status(target_language_code, new_active)
        
        if not update_result.get("success", False):
            ErrorService.raise_internal_server_error(
                message="i18n.errors.set_active_status_failed",
                details=update_result.get("error", "Failed to update language active status"),
                request=http_request,
                locale=lang
            )
        
        # Format the response
        from datetime import datetime
        updated_at = datetime.utcnow().isoformat() + "Z"
        
        # Create success message
        message = f"Language active status updated successfully from '{current_active}' to '{new_active}'"
        
        return SetActiveStatusResponse(
            success=True,
            message=message,
            language_code=target_language_code,
            previous_active=current_active,
            new_active=new_active,
            updated_at=updated_at
        )
        
    except HTTPException:
        raise
    except Exception as e:
        ErrorService.handle_generic_exception(
            exception=e,
            operation="setting language active status",
            request=http_request,
            locale=lang
        )
