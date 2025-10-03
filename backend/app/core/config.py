"""
DataPilot Backend - Configuration Management System

This module provides comprehensive configuration management for the DataPilot Python Backend,
handling all application settings, environment variables, and configuration validation
using Pydantic's robust settings management framework.

The configuration system provides:
- Type-safe configuration validation with automatic type conversion
- Environment-based configuration with fallback defaults
- Development, staging, and production environment support
- Security-focused configuration with encrypted settings
- Database connection management with pooling and optimization
- API rate limiting and security configurations
- Logging and monitoring configuration
- Internationalization and localization settings

Configuration Categories:

Server Configuration:
- FastAPI server settings (host, port, workers, reload)
- CORS configuration for cross-origin requests
- SSL/TLS settings for secure connections
- Request/response timeout configurations
- WebSocket settings for real-time communication

Database Configuration:
- MongoDB connection strings and authentication
- Connection pooling and timeout settings
- Database name and collection configurations
- Index optimization and query performance settings
- Backup and recovery configurations

Security Configuration:
- Master key encryption settings
- JWT token configuration and expiration
- API key management and validation
- Input sanitization and validation rules
- Rate limiting and abuse prevention
- CORS and security headers

Application Configuration:
- Logging levels and output destinations
- Performance monitoring and metrics
- Cache configuration and TTL settings
- File upload limits and validation
- Session management and timeout settings
- Error handling and reporting

AI/ML Configuration:
- LangGraph workflow settings
- AI model configurations and endpoints
- Streaming and real-time processing settings
- Conversation management and persistence
- Prompt engineering and optimization

Internationalization:
- Supported languages and locales
- Translation file paths and loading
- Date/time format configurations
- Number and currency formatting
- RTL language support

Environment Support:
- Development: Debug mode, hot reload, verbose logging
- Staging: Production-like with debug features
- Production: Optimized performance, security hardening
- Testing: Isolated configuration for automated tests

Validation and Error Handling:
- Automatic type conversion and validation
- Environment variable validation
- Configuration conflict detection
- Missing configuration warnings
- Security configuration validation

Author: Bassem Elsodany
GitHub: https://github.com/bassem-elsodany
LinkedIn: https://www.linkedin.com/in/bassem-elsodany/
Version: 1.0.0
License: MIT License
"""

from functools import lru_cache
from pathlib import Path
from typing import List, Optional
from pydantic_settings import BaseSettings
from pydantic import Field
from loguru import logger

class Settings(BaseSettings):
    """Application settings for DataPilot Backend"""
    
    # ============================================================================
    # SERVER SETTINGS
    # ============================================================================
    
    HOST: str = Field(
        default="127.0.0.1",
        description="Host to bind the server"
    )
    PORT: int = Field(
        default=8000,
        description="Port to bind the server"
    )
    DEBUG: bool = Field(
        default=True,
        description="Debug mode (should be False in production)"
    )
    LOG_LEVEL: str = Field(
        default="INFO",
        description="Log level (DEBUG, INFO, WARNING, ERROR)"
    )
    ENVIRONMENT: str = Field(
        default="development",
        description="Environment (development, production, staging)"
    )
    
    # ============================================================================
    # CORS SETTINGS
    # ============================================================================
    
    CORS_ALLOW_ORIGINS: List[str] = Field(
        default=["*"], 
        description="Allowed CORS origins (use specific domains in production)"
    )
    CORS_ALLOW_CREDENTIALS: bool = Field(
        default=True, 
        description="Allow CORS credentials"
    )
    CORS_ALLOW_METHODS: List[str] = Field(
        default=["*"], 
        description="Allowed HTTP methods for CORS"
    )
    CORS_ALLOW_HEADERS: List[str] = Field(
        default=["*"], 
        description="Allowed HTTP headers for CORS"
    )
    
    # ============================================================================
    # DATABASE SETTINGS (MongoDB)
    # ============================================================================
    
    # MongoDB connection parameters (individual for better UX)
    MONGO_HOST: str = Field(
        default="localhost",
        description="MongoDB host address (use 'localhost' for local development, 'mongo' for Docker)"
    )
    MONGO_PORT: int = Field(
        default=27017,
        description="MongoDB port number"
    )
    MONGO_DB_NAME: str = Field(
        default="datapilot",
        description="MongoDB database name"
    )
    MONGO_USER: str = Field(
        default="admin",
        description="MongoDB username"
    )
    MONGO_PASS: str = Field(
        default="admin123",
        description="MongoDB password"
    )
    
    # MongoDB connection settings
    MONGODB_POOL_SIZE: int = Field(
        default=20, 
        description="MongoDB connection pool size"
    )
    MONGODB_MAX_IDLE_TIME_MS: int = Field(
        default=30000, 
        description="MongoDB max idle time in milliseconds"
    )
    MONGODB_SERVER_SELECTION_TIMEOUT_MS: int = Field(
        default=5000, 
        description="MongoDB server selection timeout in milliseconds"
    )
    MONGODB_CONNECT_TIMEOUT_MS: int = Field(
        default=10000, 
        description="MongoDB connection timeout in milliseconds"
    )
    MONGODB_SOCKET_TIMEOUT_MS: int = Field(
        default=30000, 
        description="MongoDB socket timeout in milliseconds"
    )
    MONGODB_RETRY_WRITES: bool = Field(
        default=True, 
        description="Enable MongoDB retry writes"
    )
    MONGODB_RETRY_READS: bool = Field(
        default=True, 
        description="Enable MongoDB retry reads"
    )
    
    MONGODB_APP_NAME: str = Field(
        default="datapilot",
        description="MongoDB application name for monitoring"
    )
    
    MONGODB_ENABLE_COMPRESSION: bool = Field(
        default=True,
        description="Enable MongoDB wire protocol compression"
    )
    
    MONGODB_MAX_CONNECTING: int = Field(
        default=2,
        description="Maximum number of connections being established"
    )

    MONGO_STATE_CHECKPOINT_DB_NAME: str = Field(
        default="datapilot_agent",
        description="MongoDB state checkpoint collection name"
    )

    MONGO_STATE_CHECKPOINT_COLLECTION: str = Field(
        default="workflow_state_checkpoint",
        description="MongoDB state checkpoint collection name"
    )

    MONGO_STATE_WRITES_COLLECTION: str = Field(
        default="workflow_state_writes",
        description="MongoDB state write collection name"
    )
    
    # SObject Cache Settings
    SOBJECT_CACHE_TTL_HOURS: int = Field(
        default=24,
        description="SObject list cache TTL in hours"
    )
    
    METADATA_CACHE_TTL_HOURS: int = Field(
        default=12,
        description="SObject metadata cache TTL in hours"
    )
    
    # ============================================================================
    # APPLICATION SETTINGS
    # ============================================================================
    
    # Query execution settings
    QUERY_TIMEOUT_SECONDS: int = Field(
        default=300, 
        description="Default timeout for SOQL query execution (5 minutes)"
    )
    QUERY_MAX_ROWS: int = Field(
        default=6000, 
        description="Maximum rows to return from SOQL queries"
    )
    QUERY_DEFAULT_LIMIT: int = Field(
        default=10, 
        description="Default limit for SOQL queries when user doesn't specify a limit"
    )
    
    # UI Settings
    UI_MAX_RECORDS_LIMIT: int = Field(
        default=6000,
        description="Maximum number of records that can be loaded in the UI"
    )
    UI_MAX_RECORDS_WARNING_THRESHOLD: int = Field(
        default=4000,
        description="Show warning when approaching max records limit"
    )
    
    # Pagination settings
    PAGINATION_MAX_EXECUTE_MORE_CALLS: int = Field(
        default=10, 
        description="Maximum number of execute-more calls allowed per query session"
    )
    PAGINATION_MAX_RECORDS_PER_CALL: int = Field(
        default=2000, 
        description="Maximum records returned per execute-more call (Salesforce limit)"
    )
    PAGINATION_DEFAULT_RECORDS_PER_CALL: int = Field(
        default=200, 
        description="Default number of records to fetch per execute-more call"
    )
    
    # Metadata settings
    METADATA_MAX_OBJECTS: int = Field(
        default=20, 
        description="Maximum number of objects to return in metadata requests"
    )
    METADATA_MAX_FIELDS_PER_OBJECT: int = Field(
        default=20, 
        description="Maximum number of fields to return per object in metadata requests"
    )
    
    # Apex execution settings
    APEX_TIMEOUT_SECONDS: int = Field(
        default=120, 
        description="Default timeout for Apex code execution (2 minutes)"
    )
    APEX_MAX_DEBUG_LEVELS: int = Field(
        default=10, 
        description="Maximum number of debug levels per Apex execution"
    )
    
    # WebSocket settings
    WEBSOCKET_MAX_CONNECTIONS: int = Field(
        default=100, 
        description="Maximum number of concurrent WebSocket connections"
    )
    WEBSOCKET_HEARTBEAT_INTERVAL: int = Field(
        default=30, 
        description="WebSocket heartbeat interval in seconds"
    )
    
    # Rate limiting settings
    RATE_LIMIT_REQUESTS_PER_MINUTE: int = Field(
        default=1000, 
        description="Rate limit: requests per minute per client"
    )
    RATE_LIMIT_BURST_SIZE: int = Field(
        default=100, 
        description="Rate limit: burst size for request spikes"
    )
    
    # ============================================================================
    # FILE PATHS AND DIRECTORIES
    # ============================================================================
    
    # ============================================================================
    # SECURITY SETTINGS
    # ============================================================================
    
    # Note: Master key encryption is handled by user-specific connections
    # No global secret keys needed - each user manages their own credentials
    
    # ============================================================================
    # MONITORING AND METRICS
    # ============================================================================
    
    ENABLE_METRICS: bool = Field(
        default=False, 
        description="Enable application metrics collection"
    )
    METRICS_PORT: int = Field(
        default=9090, 
        description="Port for metrics endpoint (if enabled)"
    )
    
    # ============================================================================
    # APP INFORMATION SETTINGS
    # ============================================================================
    
    APP_VERSION: str = Field(
        default="v1.0.0",
        description="Application version number"
    )
    
    APP_BUILD_DATE: str = Field(
        default="2025-09-22",
        description="Application build date"
    )
    
    APP_LICENSE: str = Field(
        default="MIT License",
        description="Application license information"
    )
    
    APP_WEBSITE: str = Field(
        default="https://www.linkedin.com/in/bassem-elsodany",
        description="Application website URL"
    )
    
    APP_SUPPORT: str = Field(
        default="https://github.com/bassem-elsodany/datapilot/issues",
        description="Application support URL"
    )
    
    APP_FEEDBACK: str = Field(
        default="https://github.com/bassem-elsodany/datapilot/discussions",
        description="Application feedback URL"
    )
    
    APP_AUTHOR: str = Field(
        default="Bassem Elsodany",
        description="Application author information"
    )
    
    APP_DESCRIPTION: str = Field(
        default="Your AI pilot for Salesforce data navigation - Advanced SOQL query builder with intelligent suggestions, real-time validation, and seamless Salesforce integration.",
        description="Application description"
    )
    
    # ============================================================================
    # DEVELOPMENT SETTINGS
    # ============================================================================
    
    ENABLE_SWAGGER_UI: bool = Field(
        default=True, 
        description="Enable Swagger UI for API documentation"
    )
    ENABLE_RELOAD: bool = Field(
        default=True, 
        description="Enable auto-reload for development"
    )
    
    # ============================================================================
    # LLM SETTINGS
    # ============================================================================
    
    LLM_PROVIDER: str = Field(
        default="openai",
        description="LLM provider (openai, anthropic, azure, etc.)"
    )
    
    LLM_MODEL_NAME: str = Field(
        default="gpt-4o-mini",
        description="LLM model name (e.g., gpt-4o-mini, gpt-4, claude-3-sonnet)"
    )
    
    LLM_API_KEY: str = Field(
        default="",
        description="LLM API key for authentication"
    )
    
    LLM_TEMPERATURE: float = Field(
        default=0.7,
        description="LLM temperature for response creativity (0.0-2.0)"
    )
    
    LLM_SUMMARY_TEMPERATURE: float = Field(
        default=0.4,
        description="LLM temperature for summary responses (0.0-2.0)"
    )
    LLM_MAX_TOKENS: int = Field(
        default=10000,
        description="Maximum tokens for LLM responses"
    )
    
    LLM_TIMEOUT_SECONDS: int = Field(
        default=60,
        description="LLM request timeout in seconds"
    )
    
    LLM_MAX_OBJECTS_PER_QUERY: int = Field(
        default=3,
        description="Maximum number of Salesforce objects that can be processed in a single query"
    )
    
    CONVERSATION_MAX_SUMMARIZED_INTERACTIONS: int = Field(
        default=5,
        description="Maximum number of summarized interactions to keep in conversation context"
    )
    
    # ============================================================================
    # CLEANUP AND RESOURCE MANAGEMENT SETTINGS
    # ============================================================================
    
    CLEANUP_INTERVAL_SECONDS: int = Field(
        default=300,
        description="Interval for periodic cleanup task in seconds"
    )
    
    MAX_CONCURRENT_TASKS: int = Field(
        default=100,
        description="Maximum number of concurrent asyncio tasks"
    )
    
    CONNECTION_POOL_SIZE: int = Field(
        default=20,
        description="Maximum size of connection pools (MongoDB, LLM clients)"
    )
    
    TASK_TIMEOUT_SECONDS: int = Field(
        default=300,
        description="Default timeout for async tasks in seconds"
    )
    
    LLM_BASE_URL: str = Field(
        default="",
        description="Custom LLM base URL (for self-hosted or custom endpoints)"
    )
    
    # ============================================================================
    # LANGFUSE SETTINGS
    # ============================================================================
    
    LANGFUSE_SECRET_API_KEY: str = Field(
        default="", 
        description="Langfuse secret API key for tracing and monitoring"
    )
    
    LANGFUSE_PUBLIC_API_KEY: str = Field(
        default="", 
        description="Langfuse public API key for client-side tracking"
    )
    
    LANGFUSE_SERVER_URL: str = Field(
        default="http://localhost:3000", 
        description="Langfuse server URL (self-hosted or cloud)"
    )
    
    LANGFUSE_ENABLE_TRACING: bool = Field(
        default=True, 
        description="Enable Langfuse tracing"
    )
    
    LANGFUSE_DEFAULT_PROJECT: str = Field(
        default="datapilot_agent", 
        description="Default Langfuse project name"
    )
    
    LANGFUSE_DEFAULT_ENVIRONMENT: str = Field(
        default="development", 
        description="Default Langfuse environment"
    )
    
    # ============================================================================
    # AI AGENT CONFIDENCE SETTINGS
    # ============================================================================
    
    AI_OBJECT_SELECTION_CONFIDENCE_THRESHOLD: float = Field(
        default=0.85,
        description="Confidence threshold for auto-selecting objects (0.0-1.0). If LLM confidence >= this value, object selection interrupt is bypassed."
    )
    
    AI_FIELD_SELECTION_CONFIDENCE_THRESHOLD: float = Field(
        default=0.85,
        description="Confidence threshold for auto-selecting fields (0.0-1.0). If LLM confidence >= this value, field selection interrupt is bypassed."
    )
    
    AI_ENABLE_CONFIDENCE_AUTO_SELECTION: bool = Field(
        default=True,
        description="Enable confidence-based auto-selection for object and field selection"
    )
    
    # ReAct Executor Confidence Settings
    AI_REACT_HIGH_CONFIDENCE_THRESHOLD: float = Field(
        default=0.8,
        description="High confidence threshold for ReAct executor (0.0-1.0). Above this, proceed with clear decisions."
    )
    
    AI_REACT_MEDIUM_CONFIDENCE_THRESHOLD: float = Field(
        default=0.5,
        description="Medium confidence threshold for ReAct executor (0.0-1.0). Between this and high threshold, make reasonable choices."
    )
    
    AI_REACT_MAX_STEPS: int = Field(
        default=10,
        description="Maximum number of steps for ReAct agent execution before timeout"
    )
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False
        extra = "ignore"  # Ignore extra environment variables

# Global settings instance
settings = Settings()

# Conditional imports for different LLM providers
try:
    from langchain_openai import ChatOpenAI
except ImportError:
    ChatOpenAI = None

try:
    from langchain_groq import ChatGroq
except ImportError:
    ChatGroq = None

try:
    from langchain_community.llms import Ollama
except ImportError:
    Ollama = None

def get_chat_model(temperature: Optional[float] = None, model_name: Optional[str] = None):
    """
    Get chat model based on configuration.
    
    Args:
        temperature: Override temperature setting (optional)
        model_name: Override model name (optional)
        
    Returns:
        Configured chat model instance
        
    Raises:
        ValueError: If provider is not supported or configuration is invalid
    """
    # Use config defaults if not provided
    if temperature is None:
        temperature = settings.LLM_TEMPERATURE
    if model_name is None:
        model_name = settings.LLM_MODEL_NAME
    
    provider = settings.LLM_PROVIDER.lower()
    
    try:
        if provider == "openai":
            if ChatOpenAI is None:
                raise ValueError("OpenAI provider not available. Install langchain-openai package.")
            return ChatOpenAI(
                api_key=settings.LLM_API_KEY,
                model=model_name,
                temperature=temperature,
                max_tokens=settings.LLM_MAX_TOKENS,  # type: ignore
                timeout=settings.LLM_TIMEOUT_SECONDS,  # type: ignore
                #base_url=settings.LLM_BASE_URL if settings.LLM_BASE_URL else None  # type: ignore
            )
        
        elif provider == "groq":
            if ChatGroq is None:
                raise ValueError("Groq provider not available. Install langchain-groq package.")
            from pydantic import SecretStr
            return ChatGroq(
                api_key=SecretStr(settings.LLM_API_KEY),
                model=model_name,
                temperature=temperature,
                max_tokens=settings.LLM_MAX_TOKENS,
                timeout=settings.LLM_TIMEOUT_SECONDS
            )
        
        elif provider == "ollama":
            if Ollama is None:
                raise ValueError("Ollama provider not available. Install langchain-community package.")
            return Ollama(
                model=model_name,
                temperature=temperature,
                base_url=settings.LLM_BASE_URL if settings.LLM_BASE_URL else "http://localhost:11434"
            )
        
        else:
            raise ValueError(f"Unsupported LLM provider: {provider}. Supported providers: openai, groq, ollama")
    
    except Exception as e:
        logger.error(f"Failed to initialize {provider} chat model: {e}")
        raise ValueError(f"Failed to initialize {provider} chat model: {e}")
