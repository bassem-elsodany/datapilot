"""
DataPilot Backend - Main Application Entry Point

This module serves as the main entry point for the DataPilot Python Backend,
a comprehensive Salesforce data management platform with AI-powered query assistance.

The application provides:
- RESTful API endpoints for Salesforce operations
- AI-powered query generation and optimization
- Secure connection management with encryption
- Internationalization support for multiple languages
- Real-time WebSocket communication for AI agents
- Comprehensive logging and monitoring
- Database operations with MongoDB integration

Architecture:
- FastAPI framework for high-performance API server
- MongoDB for data persistence and caching
- LangGraph for AI workflow orchestration
- WebSocket support for real-time AI streaming
- JWT-based authentication and authorization
- Server-side encryption for sensitive data

Key Features:
- Salesforce API integration with full CRUD operations
- AI-powered SOQL query generation and optimization
- Secure connection storage with master key encryption
- Real-time AI agent communication via WebSocket
- Multi-language support with dynamic translation loading
- Comprehensive error handling and logging
- Health monitoring and performance metrics

API Endpoints:
- /api/v1/salesforce/* - Salesforce operations and queries
- /api/v1/connections/* - Connection management and lifecycle
- /api/v1/ai-agents/* - AI agent communication and workflows
- /api/v1/i18n/* - Internationalization services
- /api/v1/logging/* - Centralized logging management
- /api/v1/master-key/* - Security and encryption management

Security:
- Master key-based encryption for all sensitive data
- JWT token authentication for API access
- CORS configuration for cross-origin requests
- Input validation and sanitization

Performance:
- Async/await pattern for non-blocking operations
- Connection pooling for database operations
- Caching layer for frequently accessed data
- Optimized query execution with pagination
- Real-time streaming for AI responses

Author: Bassem Elsodany
GitHub: https://github.com/bassem-elsodany
LinkedIn: https://www.linkedin.com/in/bassem-elsodany/
Version: 1.0.0
License: MIT License
"""

import asyncio
import signal
import sys
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from datetime import datetime

from app.core.config import settings
from app.api.v1.api import api_router
# MongoDB database initialization handled by DatabaseService
from loguru import logger
from langgraph.checkpoint.mongodb.aio import AsyncMongoDBSaver  # pyright: ignore[reportMissingImports]
from motor.motor_asyncio import AsyncIOMotorClient


agent_mongo_uri = f"mongodb://{settings.MONGO_USER}:{settings.MONGO_PASS}@{settings.MONGO_HOST}:{settings.MONGO_PORT}/{settings.MONGO_STATE_CHECKPOINT_DB_NAME}?authSource=admin"

# Global shutdown flag for graceful shutdown
shutdown_requested = False


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[dict[str, AsyncMongoDBSaver], None]:
    """Application lifespan manager for startup and shutdown events"""
    global shutdown_requested
    
    # Startup
    logger.info("Starting DataPilot API...")
    
    try:
        # Initialize database with DDL and DML scripts
        from app.services.database_service import DatabaseService
        database_service = DatabaseService()
        database_service.initialize()
        logger.info("Database ready")
        
        # Check for shutdown requests during startup
        if shutdown_requested:
            logger.info("Shutdown requested during startup, aborting...")
            return

        async with AsyncMongoDBSaver.from_conn_string(
            conn_string=agent_mongo_uri,
            db_name=settings.MONGO_STATE_CHECKPOINT_DB_NAME,
            checkpoint_collection_name=settings.MONGO_STATE_CHECKPOINT_COLLECTION,
            writes_collection_name=settings.MONGO_STATE_WRITES_COLLECTION,
        ) as checkpointer:
            # Store checkpointer in app state and global variable
            app.state.checkpointer = checkpointer
            
            # Also set it in the global variable for the graph module
            from app.ai_agent.workflow.graph import set_checkpointer
            set_checkpointer(checkpointer)
            
            logger.info("DataPilot API ready and running")
            logger.info(f"Checkpointer stored in app.state and global: {checkpointer}")
            yield {"checkpointer": checkpointer}  # Application is running
        
    except Exception as e:
        logger.error(f"Startup failed: {str(e)}")
        raise
    finally:
        # Shutdown
        logger.info("Shutting down DataPilot API...")
        if shutdown_requested:
            logger.info("Graceful shutdown completed")
        else:
            logger.info("Normal shutdown completed")
    

def create_app() -> FastAPI:
    """Create and configure FastAPI application"""
    
    app = FastAPI(
        title="DataPilot API",
        description="Python backend for DataPilot application - Your AI pilot for Salesforce data navigation",
        version="1.0.0",
        debug=settings.DEBUG,
        docs_url="/docs" if settings.ENABLE_SWAGGER_UI else None,
        redoc_url="/redoc" if settings.ENABLE_SWAGGER_UI else None,
        lifespan=lifespan
    )
    
    # Signal handlers removed to allow uvicorn auto-reload to work properly
    logger.info("Signal handlers disabled - uvicorn will handle reloading")
    
    
    # CORS middleware - configured from settings
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ALLOW_ORIGINS,
        allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
        allow_methods=settings.CORS_ALLOW_METHODS,
        allow_headers=settings.CORS_ALLOW_HEADERS,
    )
    
    # No need for middleware - checkpointer is accessed directly from app.state
    
    # Include API routes
    
    app.include_router(api_router, prefix="/api/v1")
    
    # Pydantic validation error handler
    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        logger.warning(f"Validation error: {str(exc)}")
        
        # Extract locale from query parameters
        locale = request.query_params.get("lang", "en")
        
        # Create a standardized error response
        from app.services.error_service import ErrorService
        
        # Map Pydantic errors to our error structure
        field_errors = {}
        for error in exc.errors():
            field_name = ".".join(str(loc) for loc in error["loc"] if loc != "body")
            if not field_name:
                field_name = "request"
            
            # Create a user-friendly error message using translation keys
            if error["type"] == "string_too_short":
                field_errors[field_name] = f"validation.errors.min_length_{error['ctx']['min_length']}"
            elif error["type"] == "missing":
                field_errors[field_name] = "validation.errors.required"
            elif error["type"] == "value_error":
                field_errors[field_name] = "validation.errors.invalid_value"
            else:
                field_errors[field_name] = "validation.errors.generic"
        
        error_data = ErrorService.create_error_response(
            error_code="validation_error",
            message="Request validation failed",
            status_code=422,
            field_errors=field_errors,
            request=request,
            locale=locale
        )
        
        return JSONResponse(
            status_code=422,
            content={"detail": error_data}
        )
    
    # Global exception handler
    @app.exception_handler(Exception)
    async def global_exception_handler(request, exc):
        logger.error(f"Global exception: {str(exc)}")
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"}
        )
    
    

    
    # General health check endpoint (redirects to API health)
    @app.get("/health")
    async def general_health_check():
        return {
            "status": "healthy",
            "service": "datapilot-api",
            "version": "1.0.0",
            "message": "Use /api/v1/health for detailed API health information"
        }
    
    # API health check endpoint
    @app.get("/api/v1/health")
    async def api_health_check():
        return {
            "status": "healthy",
            "service": "datapilot-api",
            "version": "1.0.0",
            "endpoints": [
                "/api/v1/health",
                "/api/v1/salesforce",
                "/api/v1/connections", 
                "/api/v1/master-key",
                "/api/v1/i18n",
                "/api/v1/auth-providers",
                "/api/v1/saved-queries",
                "/api/v1/conversations",
                "/api/v1/logging",
                "/api/v1/ai-agents",
                "/api/v1/saved-apex",
                "/api/v1/settings",
                "/api/v1/sobjects"
            ],
            "timestamp": datetime.now().isoformat()
        }
    
    return app

# Create the app instance
app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app", 
        host=settings.HOST, 
        port=settings.PORT, 
        reload=settings.DEBUG
    )