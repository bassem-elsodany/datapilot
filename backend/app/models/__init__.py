"""
Models Module

This module contains MongoDB models for the DataPilot backend database.
Each model represents a MongoDB collection and provides data access and validation using Pydantic.

Available models:
- connection.py: Salesforce connection storage and management
- saved_query.py: Saved SOQL queries with metadata
- saved_apex.py: Saved Apex code with debug levels
- master_key.py: Master encryption key management
- auth_provider.py: Authentication provider configurations
- language.py: Internationalization language definitions
- translation.py: Translation data and metadata
- sobject_favorite.py: User favorite SObject management

These models provide:
- MongoDB document schema definition
- Data validation and constraints using Pydantic
- MongoDB document conversion methods
- Audit trail support
- Soft delete functionality
- Version control and metadata

Author: Bassem Elsodany
GitHub: https://github.com/bassem-elsodany
LinkedIn: https://www.linkedin.com/in/bassem-elsodany/
Version: 1.0.0
License: MIT License
"""

# MongoDB Models - Import all models
from .connection import Connection, ConnectionCreate, ConnectionUpdate, ConnectionResponse
from .saved_query import SavedQuery, SavedQueryCreate, SavedQueryUpdate, SavedQueryResponse
from .saved_apex import SavedApex, SavedApexCreate, SavedApexUpdate, SavedApexResponse
from .language import Language, LanguageCreate, LanguageUpdate, LanguageResponse
from .translation import Translation, TranslationCreate, TranslationUpdate, TranslationResponse
from .auth_provider import AuthProvider, AuthProviderCreate, AuthProviderUpdate, AuthProviderResponse
from .master_key import MasterKey, MasterKeyCreate, MasterKeyUpdate, MasterKeyResponse
from .sobject_favorite import SObjectFavorite, SObjectFavoriteCreate, SObjectFavoriteUpdate, SObjectFavoriteResponse
from .sobject_cache import (
    SObjectField, SObjectInfo, SObjectMetadata,
    SObjectListCache, SObjectListCacheCreate, SObjectListCacheResponse,
    SObjectMetadataCache, SObjectMetadataCacheCreate, SObjectMetadataCacheResponse,
    CacheStatistics, ConnectionCacheInfo
)

# Export all models
__all__ = [
    # Connection models
    "Connection",
    "ConnectionCreate", 
    "ConnectionUpdate",
    "ConnectionResponse",
    
    # Saved Query models
    "SavedQuery",
    "SavedQueryCreate",
    "SavedQueryUpdate", 
    "SavedQueryResponse",
    
    # Saved Apex models
    "SavedApex",
    "SavedApexCreate",
    "SavedApexUpdate",
    "SavedApexResponse",
    
    # Language models
    "Language",
    "LanguageCreate",
    "LanguageUpdate",
    "LanguageResponse",
    
    # Translation models
    "Translation",
    "TranslationCreate",
    "TranslationUpdate",
    "TranslationResponse",
    
    # Auth Provider models
    "AuthProvider",
    "AuthProviderCreate",
    "AuthProviderUpdate",
    "AuthProviderResponse",
    
    # Master Key models
    "MasterKey",
    "MasterKeyCreate",
    "MasterKeyUpdate",
    "MasterKeyResponse",
    
    # SObject Favorite models
    "SObjectFavorite",
    "SObjectFavoriteCreate",
    "SObjectFavoriteUpdate",
    "SObjectFavoriteResponse",
    
    # SObject Cache models
    "SObjectField",
    "SObjectInfo", 
    "SObjectMetadata",
    "SObjectListCache",
    "SObjectListCacheCreate",
    "SObjectListCacheResponse",
    "SObjectMetadataCache",
    "SObjectMetadataCacheCreate",
    "SObjectMetadataCacheResponse",
    "CacheStatistics",
    "ConnectionCacheInfo",
]
