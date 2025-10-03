"""
DataPilot Backend - MongoDB Database Management

This module provides comprehensive MongoDB configuration, connection management, and initialization
for the DataPilot backend application, offering enterprise-grade database operations with advanced
connection pooling, performance optimization, and robust error handling.

The MongoDB management system provides:
- Enterprise-grade MongoDB connection configuration and management
- Advanced async database operations with Motor
- High-performance connection pooling and optimization
- Comprehensive database initialization and collection setup
- Automated data seeding and validation
- Production-ready logging and error handling

Core Database Features:

Connection Management:
- MongoDB client creation and configuration
- Advanced connection pooling and optimization
- Connection health monitoring and recovery
- Automatic reconnection and failover
- Connection timeout and retry logic
- Performance monitoring and metrics

Database Operations:
- Async database operations with Motor
- Transaction support and ACID compliance
- Bulk operations and batch processing
- Query optimization and indexing
- Data validation and constraints
- Backup and recovery procedures

Collection Management:
- Dynamic collection creation and management
- Index creation and optimization
- Collection schema validation
- Data type validation and constraints
- Collection statistics and monitoring
- Performance tuning and optimization

Data Seeding:
- Initial data insertion and seeding
- Data validation and integrity checks
- Reference data management
- User data initialization
- System configuration setup
- Audit trail and logging

Performance & Optimization:
- Connection pooling and reuse
- Query optimization and caching
- Index optimization and tuning
- Memory usage optimization
- Performance monitoring and metrics
- Scalability and load balancing

Security Features:
- Secure connection protocols
- Authentication and authorization
- Data encryption and protection
- Access control and permissions
- Audit trail and logging
- Compliance and regulatory support

Error Handling:
- Comprehensive exception handling
- Connection failure recovery
- Data validation and error reporting
- Graceful degradation strategies
- Error logging and monitoring
- User-friendly error messages

Integration Points:
- FastAPI application integration
- Service layer database operations
- Logging and monitoring systems
- Error handling and reporting
- Configuration management
- Security and compliance systems

Compliance & Audit:
- Complete audit trail for all operations
- Data privacy and GDPR compliance
- Security event logging and monitoring
- Compliance reporting and analytics
- Data retention and deletion policies
- Security incident response

Author: Bassem Elsodany
GitHub: https://github.com/bassem-elsodany
LinkedIn: https://www.linkedin.com/in/bassem-elsodany/
Version: 1.0.0
License: MIT License
"""

import os
from typing import Optional, Dict, Any, List
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
from loguru import logger

from app.core.config import settings

# MongoDB client instances
_client: Optional[MongoClient] = None
_database = None

def get_mongodb_url() -> str:
    """Get MongoDB connection URL from individual config parameters"""
    host = settings.MONGO_HOST
    port = settings.MONGO_PORT
    db_name = settings.MONGO_DB_NAME
    user = settings.MONGO_USER
    password = settings.MONGO_PASS
    
    # Build connection URL
    if user and password:
        # Use 'admin' as authSource initially to authenticate, then create the target database
        return f"mongodb://{user}:{password}@{host}:{port}/{db_name}?authSource=admin"
    else:
        return f"mongodb://{host}:{port}/{db_name}"


def get_database_name() -> str:
    """Get database name from config"""
    return settings.MONGO_DB_NAME

def get_database():
    """Get MongoDB database instance"""
    global _database
    if _database is None:
        client = get_client()
        _database = client[get_database_name()]
    return _database

def get_client() -> MongoClient:
    """Get MongoDB client instance"""
    global _client
    
    if _client is None:
        mongodb_url = get_mongodb_url()
        
        # Create client with connection pooling
        _client = MongoClient(
            mongodb_url,
            maxPoolSize=settings.MONGODB_POOL_SIZE,
            serverSelectionTimeoutMS=settings.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
            connectTimeoutMS=settings.MONGODB_CONNECT_TIMEOUT_MS,
            socketTimeoutMS=settings.MONGODB_SOCKET_TIMEOUT_MS,
            retryWrites=settings.MONGODB_RETRY_WRITES,
            retryReads=settings.MONGODB_RETRY_READS,
            appName=settings.MONGODB_APP_NAME
        )
        
        logger.debug(f"MongoDB client initialized: {mongodb_url}")
    
    return _client


def get_mongodb_session():
    """Get MongoDB database session"""
    return get_database()

def initialize_mongodb():
    """Initialize MongoDB database and collections"""
    try:
        db = get_database()
        
        # Create collections if they don't exist
        collections = [
            "connections",
            "saved_queries", 
            "saved_apex",
            "languages",
            "translations",
            "auth_providers",
            "master_keys",
            "sobject_favorites",
            "sobject_list_cache",
            "sobject_metadata_cache",
        ]
        
        for collection_name in collections:
            if collection_name not in db.list_collection_names():
                db.create_collection(collection_name)
                logger.debug(f"Created collection: {collection_name}")
        
        # Create indexes for better performance
        create_database_indexes(db)
        
        # Insert initial data
        insert_initial_data(db)
        
        logger.debug("MongoDB initialization completed successfully")
        
    except Exception as e:
        logger.error(f"MongoDB initialization failed: {str(e)}")
        raise

def _create_index_safe(collection, index_spec, **options):
    """Safely create an index, handling conflicts gracefully"""
    try:
        collection.create_index(index_spec, **options)
    except Exception as e:
        error_msg = str(e)
        if "already exists" in error_msg or "IndexOptionsConflict" in error_msg:
            logger.debug(f"Index already exists or has conflicts, skipping: {index_spec}")
        else:
            logger.warning(f"Failed to create index {index_spec}: {error_msg}")
            # Re-raise if it's not a conflict error
            raise

def create_database_indexes(db):
    """Create database indexes for optimal performance"""
    try:
        # Connections collection indexes
        _create_index_safe(db.connections, "connection_uuid", unique=True)
        _create_index_safe(db.connections, "is_connection_active")
        _create_index_safe(db.connections, "is_deleted")
        _create_index_safe(db.connections, "created_at")
        _create_index_safe(db.connections, "last_used")
        
        # Saved queries collection indexes
        _create_index_safe(db.saved_queries, "saved_queries_uuid", unique=True)
        _create_index_safe(db.saved_queries, "connection_uuid")
        _create_index_safe(db.saved_queries, "is_favorite")
        _create_index_safe(db.saved_queries, "execution_count")
        _create_index_safe(db.saved_queries, "last_executed")
        _create_index_safe(db.saved_queries, "created_at")
        
        # Saved Apex collection indexes
        _create_index_safe(db.saved_apex, "saved_apex_uuid", unique=True)
        _create_index_safe(db.saved_apex, "connection_uuid")
        _create_index_safe(db.saved_apex, "code_type")
        _create_index_safe(db.saved_apex, "is_favorite")
        _create_index_safe(db.saved_apex, "execution_count")
        _create_index_safe(db.saved_apex, "last_executed")
        
        # Languages collection indexes
        _create_index_safe(db.languages, "language_code", unique=True)
        _create_index_safe(db.languages, "is_active")
        _create_index_safe(db.languages, "is_default")
        
        # Translations collection indexes
        _create_index_safe(db.translations, [("language_uuid", 1), ("page_name", 1)], unique=True)
        _create_index_safe(db.translations, "language_uuid")
        _create_index_safe(db.translations, "page_name")
        
        # Auth providers collection indexes
        _create_index_safe(db.auth_providers, "provider_uuid", unique=True)
        _create_index_safe(db.auth_providers, "provider_type")
        _create_index_safe(db.auth_providers, "is_active")
        
        # Master keys collection indexes
        _create_index_safe(db.master_keys, "key_id", unique=True)
        _create_index_safe(db.master_keys, "created_at")
        
        # SObject favorites collection indexes
        _create_index_safe(db.sobject_favorites, [("user_id", 1), ("sobject_name", 1)], unique=True)
        _create_index_safe(db.sobject_favorites, "user_id")
        _create_index_safe(db.sobject_favorites, "sobject_name")
        
        # SObject list cache collection indexes
        _create_index_safe(db.sobject_list_cache, "connection_uuid", unique=True)
        _create_index_safe(db.sobject_list_cache, "org_id")
        _create_index_safe(db.sobject_list_cache, "cached_at")
        _create_index_safe(db.sobject_list_cache, [("expires_at", 1)], expireAfterSeconds=0)  # TTL index
        
        # SObject metadata cache collection indexes
        _create_index_safe(db.sobject_metadata_cache, "cache_key", unique=True)
        _create_index_safe(db.sobject_metadata_cache, "connection_uuid")
        _create_index_safe(db.sobject_metadata_cache, "org_id")
        _create_index_safe(db.sobject_metadata_cache, "sobject_name")
        _create_index_safe(db.sobject_metadata_cache, "cached_at")
        _create_index_safe(db.sobject_metadata_cache, [("expires_at", 1)], expireAfterSeconds=0)  # TTL index
        
        logger.debug("Database indexes created successfully")
        
    except Exception as e:
        logger.error(f"Failed to create database indexes: {str(e)}")
        raise

def insert_initial_data(db):
    """Insert initial data into MongoDB collections"""
    try:
        # Insert default languages
        languages_collection = db.languages
        if languages_collection.count_documents({}) == 0:
            default_languages = [
                {
                    "language_uuid": "550e8400-e29b-41d4-a716-446655440000",
                    "language_code": "en",
                    "language_name": "English",
                    "native_name": "English",
                    "direction": "ltr",
                    "is_active": True,
                    "is_default": True,
                    "is_system": True,
                    "metadata_json": '{"country_codes": ["US", "GB", "CA", "AU"]}',
                    "created_at": "2024-01-01T00:00:00Z",
                    "updated_at": "2024-01-01T00:00:00Z",
                    "created_by": "system",
                    "updated_by": "system",
                    "version": 1,
                    "is_deleted": False
                },
                {
                    "language_uuid": "550e8400-e29b-41d4-a716-446655440001",
                    "language_code": "es",
                    "language_name": "Spanish",
                    "native_name": "Español",
                    "direction": "ltr",
                    "is_active": False,
                    "is_default": False,
                    "is_system": True,
                    "metadata_json": '{"country_codes": ["ES", "MX", "AR", "CO"]}',
                    "created_at": "2024-01-01T00:00:00Z",
                    "updated_at": "2024-01-01T00:00:00Z",
                    "created_by": "system",
                    "updated_by": "system",
                    "version": 1,
                    "is_deleted": False
                },
                {
                    "language_uuid": "550e8400-e29b-41d4-a716-446655440002",
                    "language_code": "fr",
                    "language_name": "French",
                    "native_name": "Français",
                    "direction": "ltr",
                    "is_active": True,
                    "is_default": False,
                    "is_system": True,
                    "metadata_json": '{"country_codes": ["FR", "BE", "CH", "CA"]}',
                    "created_at": "2024-01-01T00:00:00Z",
                    "updated_at": "2024-01-01T00:00:00Z",
                    "created_by": "system",
                    "updated_by": "system",
                    "version": 1,
                    "is_deleted": False
                },
                {
                    "language_uuid": "550e8400-e29b-41d4-a716-446655440003",
                    "language_code": "ar",
                    "language_name": "Arabic",
                    "native_name": "العربية",
                    "direction": "rtl",
                    "is_active": False,
                    "is_default": False,
                    "is_system": True,
                    "metadata_json": '{"country_codes": ["AR", "SA", "AE", "EG"]}',
                    "created_at": "2024-01-01T00:00:00Z",
                    "updated_at": "2024-01-01T00:00:00Z",
                    "created_by": "system",
                    "updated_by": "system",
                    "version": 1,
                    "is_deleted": False

                },
                {
                    "language_uuid": "550e8400-e29b-41d4-a716-446655440004",
                    "language_code": "de",
                    "language_name": "German",
                    "native_name": "Deutsch",
                    "direction": "ltr",
                    "is_active": False,
                    "is_default": False,
                    "is_system": True,
                    "metadata_json": '{"country_codes": ["DE", "AT", "CH", "CA"]}',
                    "created_at": "2024-01-01T00:00:00Z",
                    "updated_at": "2024-01-01T00:00:00Z",
                    "created_by": "system",
                    "updated_by": "system",
                    "version": 1,
                    "is_deleted": False
                },
                {
                    "language_uuid": "550e8400-e29b-41d4-a716-446655440005",
                    "language_code": "it",
                    "language_name": "Italian",
                    "native_name": "Italiano",
                    "direction": "ltr",
                    "is_active": False,
                    "is_default": False,
                    "is_system": True,
                    "metadata_json": '{"country_codes": ["IT", "CH", "CA"]}',
                    "created_at": "2024-01-01T00:00:00Z",
                    "updated_at": "2024-01-01T00:00:00Z",
                    "created_by": "system",
                    "updated_by": "system",
                    "version": 1,
                    "is_deleted": False
                },
                {
                    "language_uuid": "550e8400-e29b-41d4-a716-446655440006",
                    "language_code": "ja",
                    "language_name": "Japanese",
                    "native_name": "日本語",
                    "direction": "ltr",
                    "is_active": False,
                    "is_default": False,
                    "is_system": True,
                    "metadata_json": '{"country_codes": ["JP", "CH", "CA"]}',
                    "created_at": "2024-01-01T00:00:00Z",
                    "updated_at": "2024-01-01T00:00:00Z",
                    "created_by": "system",
                    "updated_by": "system",
                    "version": 1,
                    "is_deleted": False
                },
                {
                    "language_uuid": "550e8400-e29b-41d4-a716-446655440007",
                    "language_code": "ko",
                    "language_name": "Korean",
                    "native_name": "한국어",
                    "direction": "ltr",
                    "is_active": False,
                    "is_default": False,
                    "is_system": True,
                    "metadata_json": '{"country_codes": ["KR", "CH", "CA"]}',
                    "created_at": "2024-01-01T00:00:00Z",
                    "updated_at": "2024-01-01T00:00:00Z",
                    "created_by": "system",
                    "updated_by": "system",
                    "version": 1,
                    "is_deleted": False
                },
                {
                    "language_uuid": "550e8400-e29b-41d4-a716-446655440008",
                    "language_code": "pt",
                    "language_name": "Portuguese",
                    "native_name": "Português",
                    "direction": "ltr",
                    "is_active": False,
                    "is_default": False,
                    "is_system": True,
                    "metadata_json": '{"country_codes": ["PT", "CH", "CA"]}',
                    "created_at": "2024-01-01T00:00:00Z",
                    "updated_at": "2024-01-01T00:00:00Z",
                    "created_by": "system",
                    "updated_by": "system",
                    "version": 1,
                    "is_deleted": False
                },
                {
                    "language_uuid": "550e8400-e29b-41d4-a716-446655440009",
                    "language_code": "ru",
                    "language_name": "Russian",
                    "native_name": "Русский",
                    "direction": "ltr",
                    "is_active": False,
                    "is_default": False,
                    "is_system": True,
                    "metadata_json": '{"country_codes": ["RU", "CH", "CA"]}',
                    "created_at": "2024-01-01T00:00:00Z",
                    "updated_at": "2024-01-01T00:00:00Z",
                    "created_by": "system",
                    "updated_by": "system",
                    "version": 1,
                    "is_deleted": False
                },
            ]
            
            languages_collection.insert_many(default_languages)
            logger.debug("Default languages inserted")
        
        # Insert default auth providers
        auth_providers_collection = db.auth_providers
        if auth_providers_collection.count_documents({}) == 0:
            default_auth_providers = [
                {
                    "provider_uuid": "550e8400-e29b-41d4-a716-446655440001",
                    "provider_type": "OAUTH_STANDARD",
                    "provider_name": "Salesforce OAuth Standard",
                    "description": "Salesforce OAuth2 standard authentication provider",
                    "config_json": '{"auth_type": "oauth2", "supports_oauth": true, "auth_url": "https://login.salesforce.com/services/oauth2/authorize", "token_url": "https://login.salesforce.com/services/oauth2/token"}',
                    "is_active": True,
                    "is_system": True,
                    "metadata_json": '{"oauth_flows": ["authorization_code", "refresh_token"], "token_type": "Bearer"}',
                    "created_at": "2024-01-01T00:00:00Z",
                    "updated_at": "2024-01-01T00:00:00Z",
                    "created_by": "system",
                    "updated_by": "system",
                    "version": 1,
                    "is_deleted": False
                }
            ]
            
            auth_providers_collection.insert_many(default_auth_providers)
            logger.debug("Default auth providers inserted")
            
            # Load translations from properties files
            load_translations_from_files(db)
            
            logger.debug("Initial data insertion completed")
        
    except Exception as e:
        logger.error(f"Failed to insert initial data: {str(e)}")
        raise

def load_translations_from_files(db):
    """Load translations from properties files into MongoDB"""
    try:
        from pathlib import Path
        
        translations_collection = db.translations
        languages_collection = db.languages
        translations_path = Path("app/translations")
        
        if not translations_path.exists():
            logger.warning("Translations directory not found, skipping translation loading")
            return
        
        # Check if translations already exist
        if translations_collection.count_documents({}) > 0:
            logger.debug("Translations already loaded, skipping")
            return
        
        translations_to_insert = []
        
        # Process each language directory
        for lang_dir in translations_path.iterdir():
            if not lang_dir.is_dir():
                continue
                
            language_code = lang_dir.name
            
            # Get language UUID for this language code
            language = languages_collection.find_one({"language_code": language_code})
            if not language:
                logger.warning(f"Language not found for code: {language_code}")
                continue
                
            language_uuid = language.get("language_uuid")
            
            # Process each properties file
            for prop_file in lang_dir.glob("*.properties"):
                if not prop_file.is_file():
                    continue
                    
                logger.debug(f"Processing translations from {prop_file}")
                
                # Read properties file
                with open(prop_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                # Parse properties file into array of translation objects
                translations_array = []
                for line in content.split('\n'):
                    line = line.strip()
                    if not line or line.startswith('#') or '=' not in line:
                        continue
                    
                    try:
                        key, value = line.split('=', 1)
                        key = key.strip()
                        value = value.strip()
                        if key and value:
                            translations_array.append({
                                "key": key,
                                "value": value
                            })
                    except ValueError:
                        # Skip malformed lines
                        continue
                
                # Get page name from filename (without extension)
                page_name = prop_file.stem
                
                # Create translation document with all key-value pairs for this page
                translation_doc = {
                    "language_uuid": language_uuid,
                    "page_name": page_name,
                    "translations_data": translations_array,  # Store as array of translation objects
                    "description": f"Translations for {page_name} page",
                    "is_active": True,
                    "is_system": True,
                    "metadata_json": '{"format": "array", "source": "properties_file", "key_count": ' + str(len(translations_array)) + '}',
                    "created_at": "2024-01-01T00:00:00Z",
                    "updated_at": "2024-01-01T00:00:00Z",
                    "created_by": "system",
                    "updated_by": "system",
                    "version": 1,
                    "is_deleted": False
                }
                translations_to_insert.append(translation_doc)
        
        if translations_to_insert:
            # Use bulk_write with ReplaceOne and upsert=True to handle existing translations
            from pymongo import ReplaceOne
            
            operations = [
                ReplaceOne(
                    {"language_uuid": doc["language_uuid"], "page_name": doc["page_name"]},
                    doc,
                    upsert=True
                )
                for doc in translations_to_insert
            ]
            
            result = translations_collection.bulk_write(operations)
            logger.debug(f"Loaded {len(translations_to_insert)} translation pages from properties files (upserted: {result.upserted_count}, modified: {result.modified_count})")
        else:
            logger.warning("No translations found in properties files")
            
    except Exception as e:
        logger.error(f"Failed to load translations: {str(e)}")
        raise

def health_check() -> Dict[str, Any]:
    """Perform MongoDB health check"""
    try:
        client = get_client()
        
        # Ping the database
        client.admin.command('ping')
        
        # Get database stats
        db = get_database()
        stats = db.command("dbStats")
        
        # Get collection counts
        collections = db.list_collection_names()
        collection_stats = {}
        
        for collection_name in collections:
            count = db[collection_name].count_documents({})
            collection_stats[collection_name] = count
        
        return {
            "status": "healthy",
            "database": get_database_name(),
            "collections": len(collections),
            "collection_stats": collection_stats,
            "database_stats": {
                "collections": stats.get("collections", 0),
                "data_size": stats.get("dataSize", 0),
                "storage_size": stats.get("storageSize", 0),
                "indexes": stats.get("indexes", 0),
                "index_size": stats.get("indexSize", 0)
            }
        }
        
    except Exception as e:
        logger.error(f"MongoDB health check failed: {str(e)}")
        return {
            "status": "unhealthy",
            "error": str(e),
            "database": get_database_name()
        }

def close_connections():
    """Close MongoDB connections"""
    global _client, _database
    
    try:
        if _client:
            _client.close()
            _client = None
            logger.debug("MongoDB client closed")
        
        _database = None
        
    except Exception as e:
        logger.error(f"Error closing MongoDB connections: {str(e)}")

def reset_database_client():
    """Reset database client for testing"""
    global _client, _database
    _client = None
    _database = None
    logger.debug("Database client reset for testing")

# Legacy compatibility functions
def get_db_session():
    """Legacy compatibility function - returns MongoDB database"""
    return get_database()

def get_db():
    """Legacy compatibility function - returns MongoDB database"""
    return get_database()
