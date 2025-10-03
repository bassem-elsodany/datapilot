"""
DataPilot Backend - Main API Router

This module serves as the central API router for the DataPilot backend, providing
a unified entry point for all RESTful API endpoints and WebSocket connections.
It orchestrates all service endpoints into a cohesive API structure with proper
routing, tagging, and health monitoring.

The API router provides:
- Centralized endpoint registration and routing
- Comprehensive health monitoring and status reporting
- RESTful API structure with proper resource organization
- WebSocket support for real-time AI agent communication
- Service discovery and API documentation
- Version management and backward compatibility

Core API Structure:

Salesforce Operations:
- /salesforce/* - Complete Salesforce API integration
- SOQL query execution and optimization
- SObject metadata discovery and management
- Apex code execution and compilation
- Real-time API usage monitoring

Connection Management:
- /connections/* - Secure connection lifecycle management
- Master key-based encryption and authentication
- Connection health monitoring and status tracking
- Multi-tenant connection isolation
- Connection sharing and collaboration features

AI Agent Integration:
- /ai-agents/* - DataPilot AI Agent communication
- WebSocket real-time streaming responses
- LangGraph workflow orchestration
- Natural language to SOQL conversion
- Business intelligence and insights

Data Management:
- /saved-queries/* - SOQL query management and execution
- /saved-apex/* - Apex code management with debug levels
- /conversations/* - AI conversation history and context
- /favorites/* - SObject favorites and bookmarking

System Administration:
- /master-key/* - Security and encryption management
- /auth-providers/* - Authentication provider configuration
- /i18n/* - Internationalization and translation services
- /logging/* - Centralized logging and monitoring
- /settings/* - Application configuration management

Cache Management:
- /sobjects/* - SObject metadata caching and optimization
- /cache-management/* - Cache statistics and health monitoring
- Intelligent cache invalidation and refresh
- Performance optimization and monitoring

Health Monitoring:
- /health - Comprehensive system health checks
- Service status and availability monitoring
- Performance metrics and diagnostics
- Error tracking and reporting
- System resource monitoring

API Features:
- RESTful design with proper HTTP methods
- Comprehensive error handling and validation
- Request/response logging and monitoring
- Rate limiting and abuse prevention
- CORS configuration for cross-origin requests
- API versioning and backward compatibility

Security Features:
- Master key-based authentication
- Input validation and sanitization
- SQL injection and XSS prevention
- Secure credential storage and encryption
- Audit trail for all operations
- Access control and permissions

Performance Features:
- Asynchronous request handling
- Connection pooling and reuse
- Caching and optimization
- Load balancing and scaling
- Performance monitoring and metrics
- Resource usage optimization

Integration Points:
- FastAPI framework integration
- MongoDB database operations
- Salesforce API authentication
- WebSocket real-time communication
- Logging and monitoring systems
- Error handling and reporting

Author: Bassem Elsodany
GitHub: https://github.com/bassem-elsodany
LinkedIn: https://www.linkedin.com/in/bassem-elsodany/
Version: 1.0.0
License: MIT License
"""

from fastapi import APIRouter
from datetime import datetime

from app.api.v1.endpoints import (
    salesforce,
    connections,
    master_key,
    i18n,
    auth_providers,
    saved_queries,
    saved_apex,
    logging,
    datapilot_agent,
    cache_management,
    settings,
    conversations
)

api_router = APIRouter()

@api_router.get("/health")
async def health_check():
    """General health check endpoint"""
    return {
        "status": "healthy",
        "service": "datapilot-api",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "1.0.0"
    }

# Include all endpoint routers
api_router.include_router(salesforce.router, prefix="/salesforce", tags=["salesforce"])
api_router.include_router(connections.router, prefix="/connections", tags=["connections"])
api_router.include_router(master_key.router, prefix="/master-key", tags=["master-key"])
api_router.include_router(i18n.router, prefix="/i18n", tags=["i18n"])
api_router.include_router(auth_providers.router, prefix="/auth-providers", tags=["auth-providers"])
api_router.include_router(saved_queries.router, prefix="/saved-queries", tags=["saved-queries"])
api_router.include_router(conversations.router, prefix="/conversations", tags=["conversations"])

api_router.include_router(logging.router, prefix="/logging", tags=["logging"])
api_router.include_router(datapilot_agent.router, prefix="/ai-agents", tags=["ai-agents"])
api_router.include_router(saved_apex.router, prefix="/saved-apex", tags=["saved-apex"])
api_router.include_router(cache_management.router, prefix="", tags=["sobjects", "cache-management"])
api_router.include_router(settings.router, prefix="/settings", tags=["settings"])  # Settings endpoint

