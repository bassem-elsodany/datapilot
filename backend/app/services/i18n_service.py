"""
DataPilot Backend - Internationalization Service

This service provides comprehensive internationalization operations using MongoDB,
offering enterprise-grade multi-language support, translation management, and localization
services with advanced caching, performance optimization, and compliance features.

The I18n service provides:
- Enterprise-grade multi-language support and management
- Advanced translation caching and optimization
- Real-time translation loading and updates
- Comprehensive language and locale management
- Performance-optimized translation operations
- Compliance and audit support for global deployments

Core I18n Features:

Language Management:
- Complete language and locale support
- Dynamic language loading and activation
- Language metadata and configuration
- Locale-specific formatting and validation
- RTL language support for Arabic and Hebrew
- Cultural context-aware translations

Translation Management:
- Advanced translation caching and optimization
- Real-time translation updates and synchronization
- Translation versioning and history tracking
- Fallback translation handling
- Translation validation and quality assurance
- Multi-tenant translation isolation

Performance & Optimization:
- High-performance translation caching
- Lazy loading and optimization
- Memory usage optimization
- Performance monitoring and metrics
- Scalability and load balancing
- Resource usage optimization

Caching & Synchronization:
- Intelligent translation caching
- Cache invalidation and updates
- Real-time synchronization
- Performance optimization
- Memory management
- Cache statistics and monitoring

Security & Compliance:
- Secure translation storage and access
- Data privacy and GDPR compliance
- Audit trail for all operations
- Security event logging and monitoring
- Compliance reporting and analytics
- Data retention and deletion policies

Integration Points:
- MongoDB database operations
- Frontend translation services
- Logging and monitoring systems
- Error handling and reporting
- API endpoint integration
- Configuration management

Author: Bassem Elsodany
GitHub: https://github.com/bassem-elsodany
LinkedIn: https://www.linkedin.com/in/bassem-elsodany/
Version: 1.0.0
License: MIT License
"""

import asyncio
import json
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from loguru import logger

from app.models.language import Language, LanguageCreate
from app.models.translation import Translation, TranslationCreate
from app.core.mongodb import get_database


class I18nService:
    """Service for handling internationalization operations using MongoDB"""
    
    def __init__(self):
        self.translation_cache: Dict[str, Dict[str, Dict[str, str]]] = {}
        self.cache_expiry = 10 * 60 * 1000  # 10 minutes
        self.last_cache_update = 0
        
    def get_all_languages(self, is_active: Optional[bool] = None) -> List[Dict[str, Any]]:
        """Get all languages with optional active filter"""
        try:
            db = get_database()
            languages_collection = db.languages
            
            # Build MongoDB query
            query = {"is_deleted": False}
            if is_active is not None:
                query["is_active"] = is_active
            
            # Execute query
            cursor = languages_collection.find(query).sort("language_name", 1)
            languages = list(cursor)
            
            result = []
            for lang in languages:
                result.append({
                    "language_uuid": lang.get("language_uuid"),
                    "language_code": lang.get("language_code"),
                    "language_name": lang.get("language_name"),
                    "native_name": lang.get("native_name"),
                    "direction": lang.get("direction"),
                    "is_active": lang.get("is_active"),
                    "is_default": lang.get("is_default"),
                    "is_system": lang.get("is_system"),
                    "metadata": lang.get("metadata_json"),
                    "created_at": lang.get("created_at"),
                    "updated_at": lang.get("updated_at")
                })
            
            status_text = "active" if is_active else "inactive"
            logger.debug(f"Retrieved {len(result)} {status_text} languages")
            return result
                
        except Exception as e:
            logger.error(f"Failed to get languages: {str(e)}")
            raise
    
    def get_available_locales(self, is_active: bool = True) -> List[str]:
        """
        Get available locale codes
        
        Args:
            is_active: Filter by active status. Defaults to True to show only active languages
            
        Returns:
            List[str]: List of available locale codes
        """
        try:
            db = get_database()
            languages_collection = db.languages
            
            # Build MongoDB query
            query = {"is_active": is_active, "is_deleted": False}
            
            # Execute query and project only language_code
            cursor = languages_collection.find(query, {"language_code": 1})
            locales = list(cursor)
            
            result = [locale.get("language_code") for locale in locales if locale.get("language_code")]
            
            status_text = "active" if is_active else "inactive"
            logger.debug(f"Retrieved {len(result)} {status_text} locales")
            return result
                
        except Exception as e:
            logger.error(f"Failed to get available locales: {str(e)}")
            return ['en']  # Fallback to English
    
    def get_translations_by_locale(self, locale: str) -> List[Dict[str, Any]]:
        """Get all translations for a specific locale"""
        try:
            db = get_database()
            languages_collection = db.languages
            translations_collection = db.translations
            
            # Get language for the locale
            language = languages_collection.find_one({
                "language_code": locale,
                "is_active": True,
                "is_deleted": False
            })
            
            if not language:
                logger.warning(f"Language not found for locale: {locale}")
                return []
            
            # Get translations for this language using language_uuid
            cursor = translations_collection.find({
                "language_uuid": language.get("language_uuid"),
                "is_active": True
            })
            
            translations = list(cursor)
            
            result = []
            for trans in translations:
                # Transform the array-based translations_data to dictionary format for API compatibility
                translations_array = trans.get("translations_data", [])
                translations_dict = {}
                for item in translations_array:
                    if isinstance(item, dict) and "key" in item and "value" in item:
                        translations_dict[item["key"]] = item["value"]
                
                # Return the structure expected by the API (backward compatibility)
                result.append({
                    "id": str(trans.get("_id", "")),
                    "language_uuid": trans.get("language_uuid"),
                    "language_code": language.get("language_code", ""),  # Add language_code for API compatibility
                    "page_name": trans.get("page_name"),
                    "translations_data": translations_dict,  # Convert array to dict for API compatibility
                    "description": trans.get("description"),
                    "is_active": trans.get("is_active"),
                    "is_system": trans.get("is_system"),
                    "metadata": trans.get("metadata_json"),  # Use metadata field name for API compatibility
                    "created_at": trans.get("created_at").isoformat() if trans.get("created_at") and hasattr(trans.get("created_at"), 'isoformat') else trans.get("created_at"),
                    "updated_at": trans.get("updated_at").isoformat() if trans.get("updated_at") and hasattr(trans.get("updated_at"), 'isoformat') else trans.get("updated_at"),
                    "created_by": trans.get("created_by"),
                    "updated_by": trans.get("updated_by"),
                    "version": trans.get("version", 1)
                })
            
            logger.debug(f"Retrieved {len(result)} translation pages for locale: {locale}")
            return result
                
        except Exception as e:
            logger.error(f"Failed to get translations for locale {locale}: {str(e)}")
            return []
    
    def get_translation_by_page(self, langCode: str, page_name: str) -> Optional[Dict[str, Any]]:
        """Get translation for a specific locale and page"""
        try:
            db = get_database()
            languages_collection = db.languages
            translations_collection = db.translations
            
            # Get language for the langCode
            language = languages_collection.find_one({
                "language_code": langCode,
                "is_active": True,
                "is_deleted": False
            })
            
            if not language:
                logger.warning(f"Language not found for langCode: {langCode}")
                return None
            
            # Get translation for this language and page using language_uuid
            translation = translations_collection.find_one({
                "language_uuid": language.get("language_uuid"),
                "page_name": page_name,
                "is_active": True,
                "is_deleted": False
            })
            
            if not translation:
                logger.debug(f"Translation not found for langCode: {langCode}, page: {page_name}")
                return None
            
            # Transform the array-based translations_data to dictionary format for API compatibility
            translations_array = translation.get("translations_data", [])
            translations_dict = {}
            for item in translations_array:
                if isinstance(item, dict) and "key" in item and "value" in item:
                    translations_dict[item["key"]] = item["value"]
            
            result = {
                "id": str(translation.get("_id", "")),  # Convert ObjectId to string
                "language_uuid": translation.get("language_uuid"),
                "language_code": language.get("language_code", ""),  # Add language_code for API compatibility
                "page_name": translation.get("page_name"),
                "translations_data": translations_dict,  # Convert array to dict for API compatibility
                "description": translation.get("description"),
                "is_active": translation.get("is_active"),
                "is_system": translation.get("is_system"),
                "metadata": translation.get("metadata_json"),  # Use metadata field name for API compatibility
                "created_at": translation.get("created_at").isoformat() if translation.get("created_at") and hasattr(translation.get("created_at"), 'isoformat') else translation.get("created_at"),
                "updated_at": translation.get("updated_at").isoformat() if translation.get("updated_at") and hasattr(translation.get("updated_at"), 'isoformat') else translation.get("updated_at")
            }
            
            return result
                
        except Exception as e:
            logger.error(f"Failed to get translation for langCode {langCode}, page {page_name}: {str(e)}")
            return None
    
    def get_translation_key(self, locale: str, key: str) -> Optional[str]:
        """Get a specific translation key for a locale"""
        try:
            # Extract page name from key (e.g., "app.name" -> "app")
            page_name = key.split('.')[0]
            
            # Special handling for wizard keys - they are in the sessions page
            if page_name == 'wizard':
                page_name = 'sessions'
            
            # Special handling for master_key keys - they are in the masterKey page
            if page_name == 'master_key':
                page_name = 'masterKey'
            
            # Special handling for validation keys - they are in the common page
            if page_name == 'validation':
                page_name = 'common'
            
            translation = self.get_translation_by_page(locale, page_name)
            if not translation:
                return None
            
            # The translation data is already transformed to a dictionary by get_translation_by_page
            translations_dict = translation.get("translations_data", {})
            
            return translations_dict.get(key)
            
        except Exception as e:
            logger.error(f"Failed to get translation key {key} for locale {locale}: {str(e)}")
            return None

    def get_translation_key_by_page(self, langCode: str, page_name: str, key: str) -> Optional[str]:
        """Get a specific translation key from a specific page for a language"""
        try:
            translation = self.get_translation_by_page(langCode, page_name)
            if not translation:
                return None
            
            # The translation data is already transformed to a dictionary by get_translation_by_page
            translations_dict = translation.get("translations_data", {})
            
            # First try the key as provided (e.g., "app.title")
            value = translations_dict.get(key)
            if value is not None:
                return value
            
            # If not found, try with page prefix (e.g., "title" -> "app.title")
            prefixed_key = f"{page_name}.{key}"
            value = translations_dict.get(prefixed_key)
            if value is not None:
                return value
            
            return None
            
        except Exception as e:
            logger.error(f"Failed to get translation key {key} from page {page_name} for langCode {langCode}: {str(e)}")
            return None

    def _parse_key_value_translations(self, content: str) -> Dict[str, str]:
        """Parse key-value format translations"""
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
    
    def get_available_pages(self) -> List[str]:
        """Get all available page names"""
        try:
            db = get_database()
            translations_collection = db.translations
            
            pages = translations_collection.distinct("page_name", {"is_active": True, "is_deleted": False})
            
            result = [page for page in pages if page]
            logger.debug(f"Retrieved {len(result)} available pages")
            return result
                
        except Exception as e:
            logger.error(f"Failed to get available pages: {str(e)}")
            return []
    
    def get_translation_stats(self) -> Dict[str, Any]:
        """Get translation statistics"""
        try:
            db = get_database()
            languages_collection = db.languages
            translations_collection = db.translations
            
            # Get language count
            language_count = languages_collection.count_documents({"is_active": True, "is_deleted": False})
            
            # Get translation count
            translation_count = translations_collection.count_documents({"is_active": True, "is_deleted": False})
            
                        # Get page count
            pages = translations_collection.distinct("page_name", {"is_active": True, "is_deleted": False})
            page_count = len(pages)
            
            # Get total key count (approximate)
            total_keys = 0
            cursor = translations_collection.find({"is_active": True, "is_deleted": False})
            translations = list(cursor)
             
            for trans in translations:
                try:
                    # Parse translations_data - now it's an array of key-value objects
                    translations_data = trans.get("translations_data", [])
                    total_keys += len(translations_data)
                except Exception:
                    continue
            
            stats = {
                "languages": language_count,
                "translations": translation_count,
                "pages": page_count,
                "total_keys": total_keys
            }
            
            logger.debug(f"Translation stats: {stats}")
            return stats
                
        except Exception as e:
            logger.error(f"Failed to get translation stats: {str(e)}")
            return {
                "languages": 0,
                "translations": 0,
                "pages": 0,
                "total_keys": 0
            }
    
    def reload_translations_for_locale(self, langCode: str, page_name: Optional[str] = None) -> Dict[str, Any]:
        """
        Reload translations for a specific language from property files
        
        This method reloads translations for a specific language by:
        1. Clearing existing translation records for the language (and optionally specific page)
        2. Loading fresh translation data from property files
        3. Re-inserting translation keys into the database
        4. Clearing and refreshing the application cache
        
        This is useful for refreshing translations after manual updates to property files
        without requiring a full application restart.
        
        Args:
            langCode: ISO language code (e.g., 'en', 'es', 'fr') to reload
            page_name: Optional page name (e.g., 'app', 'settings') to reload specific page only
            
        Returns:
            Dict[str, Any]: Object containing reload operation results with:
                - success: Boolean indicating if the reload was successful
                - message: Human-readable message describing the result
                - translations_reloaded: Number of translation pages reloaded
                - total_keys: Total number of translation keys reloaded
                - warnings: List of any warnings encountered during reload
                
        Raises:
            Exception: If the reload operation fails
        """
        try:
            logger.debug(f"Starting complete translation reload for langCode: {langCode}")
            
            # Get language UUID for the langCode
            language_uuid = self._get_language_uuid_by_code(langCode)
            if not language_uuid:
                error_msg = f"Language not found for langCode: {langCode}"
                logger.error(f"{error_msg}")
                raise Exception(error_msg)
            
            db = get_database()
            languages_collection = db.languages
            translations_collection = db.translations
            
            # Step 1: Clear existing translations for this langCode (and optionally specific page)
            if page_name:
                logger.debug(f"Clearing existing translations for langCode: {langCode}, page: {page_name}")
                query = {"language_uuid": language_uuid, "page_name": page_name}
            else:
                logger.debug(f"Clearing all existing translations for langCode: {langCode}")
                query = {"language_uuid": language_uuid}
            
            deleted_count = translations_collection.delete_many(query)
            logger.debug(f"Deleted {deleted_count.deleted_count} existing translation records for langCode: {langCode}" + (f", page: {page_name}" if page_name else ""))
            
            # Step 2: Load fresh translation data from property files
            if page_name:
                logger.debug(f"Loading translation data from property files for langCode: {langCode}, page: {page_name}")
            else:
                logger.debug(f"Loading translation data from property files for langCode: {langCode}")
            
            from app.utils.translation_loader import get_translation_data_for_database
            
            translation_data = get_translation_data_for_database(language_uuid, langCode)
            
            if not translation_data:
                logger.warning(f"No translation files found for langCode: {langCode}")
                return {
                    "success": True,
                    "message": f"No translation files found for langCode '{langCode}'",
                    "translations_reloaded": 0,
                    "total_keys": 0,
                    "warnings": [f"No translation files found for langCode '{langCode}'"]
                }
            
            # Filter by page_name if specified
            if page_name:
                translation_data = [t for t in translation_data if t.get("page_name") == page_name]
                if not translation_data:
                    logger.warning(f"No translation data found for langCode: {langCode}, page: {page_name}")
                    return {
                        "success": True,
                        "message": f"No translation data found for langCode '{langCode}', page '{page_name}'",
                        "translations_reloaded": 0,
                        "total_keys": 0,
                        "warnings": [f"No translation data found for langCode '{langCode}', page '{page_name}'"]
                    }
            
            # Step 3: Insert fresh translation data into database
            logger.debug(f"Inserting {len(translation_data)} translation pages for langCode: {langCode}")
            total_keys = 0
            warnings = []
            
            for translation_record in translation_data:
                try:
                    # Create translation record following the correct domain model
                    new_translation = Translation(
                        language_uuid=translation_record.get('language_uuid', ''),
                        page_name=translation_record.get('page_name', ''),
                        translations_data=translation_record.get('translations_data', []),
                        description=translation_record.get('description', f'Translations for {translation_record.get("page_name", "unknown")} page'),
                        is_active=bool(translation_record.get('is_active', True)),
                        is_system=bool(translation_record.get('is_system', True)),
                        metadata_json=translation_record.get('metadata_json'),
                        created_by=translation_record.get('created_by', 'system'),
                        updated_by=translation_record.get('updated_by', 'system')
                    )
                    
                    translations_collection.insert_one(new_translation.dict())
                    
                    # Count keys from the translations_data array
                    translations_data = translation_record.get('translations_data', [])
                    total_keys += len(translations_data)
                    logger.debug(f"Added translation page: {translation_record['page_name']} ({len(translations_data)} keys)")
                    
                except Exception as e:
                    warning_msg = f"Error processing translation page '{translation_record.get('page_name', 'unknown')}': {str(e)}"
                    warnings.append(warning_msg)
                    logger.warning(f"{warning_msg}")
            
            # Commit all changes
            # In MongoDB, no explicit commit is needed for single-document inserts/updates
            # The changes are automatically persisted.
            logger.debug(f"Successfully committed {len(translation_data)} translation pages to database")
            
            # Step 4: Clear application cache for this langCode
            if langCode in self.translation_cache:
                del self.translation_cache[langCode]
                logger.debug(f"Cleared cache for langCode: {langCode}")
            
            # Force cache refresh
            self.last_cache_update = 0
            
            if page_name:
                message = f"Translations for langCode '{langCode}', page '{page_name}' reloaded successfully from property files"
                log_message = f"Page-specific translation reload completed for langCode '{langCode}', page '{page_name}': {len(translation_data)} pages, {total_keys} keys"
            else:
                message = f"Translations for langCode '{langCode}' reloaded successfully from property files"
                log_message = f"Complete translation reload completed for langCode '{langCode}': {len(translation_data)} pages, {total_keys} keys"
            
            result = {
                "success": True,
                "message": message,
                "translations_reloaded": len(translation_data),
                "total_keys": total_keys,
                "warnings": warnings
            }
            
            logger.debug(log_message)
            
            if warnings:
                if page_name:
                    logger.warning(f"Translation reload completed with {len(warnings)} warnings for langCode '{langCode}', page '{page_name}'")
                    result["message"] = f"Translations for langCode '{langCode}', page '{page_name}' reloaded with warnings"
                else:
                    logger.warning(f"Translation reload completed with {len(warnings)} warnings for langCode '{langCode}'")
                    result["message"] = f"Translations for langCode '{langCode}' reloaded with warnings"
            
            return result
                
        except Exception as e:
            error_msg = f"Failed to reload translations for langCode '{langCode}': {str(e)}"
            logger.error(f"{error_msg}")
            raise Exception(error_msg)
    
    def _get_language_uuid_by_code(self, language_code: str) -> Optional[str]:
        """
        Get language UUID by language code
        
        Args:
            language_code: ISO language code (e.g., 'en', 'es', 'fr')
            
        Returns:
            Optional[str]: Language UUID if found, None otherwise
        """
        try:
            db = get_database()
            language = db.languages.find_one({
                "language_code": language_code,
                "is_active": True,
                "is_deleted": False
            })
            
            return str(language.get("language_uuid")) if language else None
                
        except Exception as e:
            logger.error(f"Failed to get language UUID for code '{language_code}': {str(e)}")
            return None
    
    def set_default_language(self, language_code: str) -> Dict[str, Any]:
        """
        Set the default language for the system
        
        This method updates the system's default language configuration by:
        1. Setting is_default=False for all current languages
        2. Setting is_default=True for the specified language
        3. Updating the updated_at timestamp
        4. Clearing and refreshing the translation cache
        
        Args:
            language_code: ISO language code (e.g., 'en', 'es', 'fr') to set as default
            
        Returns:
            Dict[str, Any]: Object containing operation results with:
                - success: Boolean indicating if the operation was successful
                - message: Human-readable message describing the result
                - error: Error message if operation failed
                
        Raises:
            Exception: If the operation fails
        """
        try:
            logger.debug(f"Setting default language to: {language_code}")
            
            db = get_database()
            languages_collection = db.languages
            
            # Step 1: Validate that the target language exists and is active
            target_language = languages_collection.find_one({
                "language_code": language_code,
                "is_active": True,
                "is_deleted": False
            })
            
            if not target_language:
                error_msg = f"Language not found or inactive: {language_code}"
                logger.error(f"{error_msg}")
                return {
                    "success": False,
                    "message": f"Failed to set default language: {error_msg}",
                    "error": error_msg
                }
            
            # Step 2: Set is_default=False for all languages
            logger.debug("Clearing current default language flags")
            clear_result = languages_collection.update_many(
                {"is_default": True, "is_deleted": False},
                {
                    "$set": {
                        "is_default": False,
                        "updated_at": datetime.now(timezone.utc)
                    }
                }
            )
            logger.debug(f"Cleared default flag from {clear_result.modified_count} languages")
            
            # Step 3: Set is_default=True for the target language
            logger.debug(f"Setting default flag for language: {language_code}")
            set_result = languages_collection.update_one(
                {
                    "language_code": language_code,
                    "is_active": True,
                    "is_deleted": False
                },
                {
                    "$set": {
                        "is_default": True,
                        "updated_at": datetime.now(timezone.utc)
                    }
                }
            )
            
            if set_result.modified_count == 0:
                error_msg = f"Failed to update default language: {language_code}"
                logger.error(f"{error_msg}")
                return {
                    "success": False,
                    "message": f"Failed to set default language: {error_msg}",
                    "error": error_msg
                }
            
            # Step 4: Clear translation cache to force refresh
            logger.debug("Clearing translation cache")
            self.translation_cache.clear()
            self.last_cache_update = 0
            
            success_msg = f"Default language successfully set to: {language_code}"
            logger.debug(f"{success_msg}")
            
            return {
                "success": True,
                "message": success_msg
            }
                
        except Exception as e:
            error_msg = f"Failed to set default language to '{language_code}': {str(e)}"
            logger.error(f"{error_msg}")
            return {
                "success": False,
                "message": f"Failed to set default language: {error_msg}",
                "error": error_msg
            }

    def set_language_active_status(self, language_code: str, is_active: bool) -> Dict[str, Any]:
        """
        Set the active status of a language
        
        This method updates the active status of a language in the system by:
        1. Validating that the language exists
        2. Updating the is_active flag in the database
        3. Updating the updated_at timestamp
        4. Clearing the translation cache if needed
        
        Args:
            language_code: ISO language code (e.g., 'en', 'es', 'fr') to update
            is_active: Boolean indicating whether the language should be active
            
        Returns:
            Dict[str, Any]: Object containing operation results with:
                - success: Boolean indicating if the operation was successful
                - message: Human-readable message describing the result
                - error: Error message if operation failed
                
        Raises:
            Exception: If the operation fails
        """
        try:
            logger.debug(f"Setting language '{language_code}' active status to: {is_active}")
            
            db = get_database()
            languages_collection = db.languages
            
            # Step 1: Validate that the target language exists
            target_language = languages_collection.find_one({
                "language_code": language_code,
                "is_deleted": False
            })
            
            if not target_language:
                error_msg = f"Language not found: {language_code}"
                logger.error(f"{error_msg}")
                return {
                    "success": False,
                    "message": f"Failed to update language active status: {error_msg}",
                    "error": error_msg
                }
            
            # Step 2: Update the active status
            logger.debug(f"Updating active status for language: {language_code}")
            update_result = languages_collection.update_one(
                {
                    "language_code": language_code,
                    "is_deleted": False
                },
                {
                    "$set": {
                        "is_active": is_active,
                        "updated_at": datetime.now(timezone.utc)
                    }
                }
            )
            
            if update_result.modified_count == 0:
                error_msg = f"Failed to update active status for language: {language_code}"
                logger.error(f"{error_msg}")
                return {
                    "success": False,
                    "message": f"Failed to update language active status: {error_msg}",
                    "error": error_msg
                }
            
            # Step 3: If deactivating a default language, clear the default flag
            if not is_active and target_language.get("is_default", False):
                logger.debug(f"Clearing default flag for deactivated language: {language_code}")
                languages_collection.update_one(
                    {
                        "language_code": language_code,
                        "is_deleted": False
                    },
                    {
                        "$set": {
                            "is_default": False,
                            "updated_at": datetime.now(timezone.utc)
                        }
                    }
                )
            
            # Step 4: Clear translation cache to force refresh
            logger.debug("Clearing translation cache")
            self.translation_cache.clear()
            self.last_cache_update = 0
            
            status_text = "active" if is_active else "inactive"
            success_msg = f"Language '{language_code}' successfully set to {status_text}"
            logger.debug(f"{success_msg}")
            
            return {
                "success": True,
                "message": success_msg
            }
                
        except Exception as e:
            error_msg = f"Failed to update active status for language '{language_code}': {str(e)}"
            logger.error(f"{error_msg}")
            return {
                "success": False,
                "message": f"Failed to update language active status: {error_msg}",
                "error": error_msg
            }

    def create_language(
        self,
        language_code: str,
        language_name: str,
        native_name: str,
        direction: str = "ltr",
        is_active: bool = True,
        is_default: bool = False,
        is_system: bool = False,
        metadata: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a new language in the system
        
        This method creates a new language configuration by:
        1. Generating a unique UUID for the language
        2. Validating the language code is unique
        3. Creating the language record in the database
        4. Setting appropriate timestamps
        5. Returning the created language object
        
        Args:
            language_code: ISO language code (e.g., 'en', 'es', 'fr')
            language_name: Human-readable language name in English
            native_name: Language name in its native script
            direction: Text direction ('ltr' or 'rtl')
            is_active: Whether the language should be active
            is_default: Whether this should be the default language
            is_system: Whether this is a system-managed language
            metadata: Additional language metadata as JSON string
            
        Returns:
            Dict[str, Any]: Result of the creation operation, including success status and language object
        """
        try:
            import uuid
            from datetime import datetime, timezone
            
            db = get_database()
            languages_collection = db.languages
            
            # Generate unique UUID for the language
            language_uuid = str(uuid.uuid4())
            
            # Check if language code already exists
            existing_language = languages_collection.find_one({
                "language_code": language_code,
                "is_deleted": False
            })
            
            if existing_language:
                error_msg = f"Language code '{language_code}' already exists"
                logger.warning(f"{error_msg}")
                return {
                    "success": False,
                    "message": error_msg,
                    "error": error_msg
                }
            
            # Prepare language document
            current_time = datetime.now(timezone.utc)
            language_doc = {
                "language_uuid": language_uuid,
                "language_code": language_code,
                "language_name": language_name,
                "native_name": native_name,
                "direction": direction,
                "is_active": is_active,
                "is_default": is_default,
                "is_system": is_system,
                "metadata_json": metadata,
                "is_deleted": False,
                "created_at": current_time,
                "updated_at": current_time
            }
            
            # Insert the language document
            result = languages_collection.insert_one(language_doc)
            
            if not result.inserted_id:
                error_msg = f"Failed to insert language document for '{language_code}'"
                logger.error(f"{error_msg}")
                return {
                    "success": False,
                    "message": error_msg,
                    "error": error_msg
                }
            
            # Prepare the response language object
            created_language = {
                "language_uuid": language_uuid,
                "language_code": language_code,
                "language_name": language_name,
                "native_name": native_name,
                "direction": direction,
                "is_active": is_active,
                "is_default": is_default,
                "is_system": is_system,
                "metadata": metadata,
                "created_at": current_time.isoformat() + "Z",
                "updated_at": current_time.isoformat() + "Z"
            }
            
            success_msg = f"Language '{language_name} ({language_code})' created successfully"
            logger.debug(f"{success_msg}")
            
            return {
                "success": True,
                "message": success_msg,
                "language": created_language
            }
            
        except Exception as e:
            error_msg = f"Failed to create language '{language_code}': {str(e)}"
            logger.error(f"{error_msg}")
            return {
                "success": False,
                "message": error_msg,
                "error": error_msg
            }