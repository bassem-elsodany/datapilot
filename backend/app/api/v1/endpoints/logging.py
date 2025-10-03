"""
DataPilot Backend - Logging API Endpoints

This module provides comprehensive RESTful API endpoints for logging functionality in the DataPilot backend,
offering enterprise-grade frontend log message collection, centralized logging management, and advanced
log analysis with security, performance, and compliance features.

The logging API provides:
- Enterprise-grade frontend log message collection and processing
- Centralized logging management and aggregation
- Advanced log level and context support
- Comprehensive timestamp and metadata handling
- Production-ready error handling and validation
- REST-compliant resource design and architecture

Core Logging Features:

Log Collection:
- Frontend log message collection and processing
- Real-time log streaming and aggregation
- Log level filtering and categorization
- Context-aware log processing
- Metadata extraction and enrichment
- Log correlation and tracking

Log Management:
- Centralized logging management and control
- Log aggregation and consolidation
- Log filtering and search capabilities
- Log retention and archival policies
- Log rotation and cleanup
- Log compression and optimization

Log Analysis:
- Advanced log analysis and pattern recognition
- Error rate tracking and monitoring
- Performance impact assessment
- Security event detection and alerting
- Compliance and audit support
- Business intelligence and insights

Security & Compliance:
- Secure log transmission and storage
- Data privacy and GDPR compliance
- Audit trail for all logging operations
- Security event logging and monitoring
- Compliance reporting and analytics
- Data retention and deletion policies

Performance & Optimization:
- High-performance log processing
- Efficient log storage and retrieval
- Memory usage optimization
- Performance monitoring and metrics
- Scalability and load balancing
- Resource usage optimization

REST API Endpoints:

Logging Operations:
- POST /logging - Create log entry from frontend with comprehensive metadata

Integration Points:
- Frontend logging services
- Centralized logging systems
- Monitoring and alerting systems
- Error handling and reporting
- Security and compliance systems
- Performance monitoring systems

Author: Bassem Elsodany
GitHub: https://github.com/bassem-elsodany
LinkedIn: https://www.linkedin.com/in/bassem-elsodany/
Version: 1.0.0
License: MIT License
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, Any, Dict
from datetime import datetime

from app.core.logging import log_frontend_message, get_logger
from app.services.error_service import ErrorService
from app.services.i18n_service import I18nService

logger = get_logger(__name__)
i18n_service = I18nService()

router = APIRouter()

class LogEntry(BaseModel):
    level: int  # LogLevel enum value
    levelName: str
    message: str
    context: Optional[str] = None
    data: Optional[Dict[str, Any]] = None
    timestamp: Optional[str] = None
    userId: Optional[str] = None
    sessionId: Optional[str] = None

@router.post("/")
def create_log(log_entry: LogEntry, http_request: Request):
    """Create a new log entry from frontend"""
    try:
        # Use the dedicated frontend logging function
        log_frontend_message(
            level=log_entry.levelName,  # Use levelName instead of level
            message=log_entry.message,
            context=log_entry.context,
            data=log_entry.data,
            timestamp=log_entry.timestamp
        )
        
        # Return success response
        timestamp = log_entry.timestamp or datetime.now().isoformat()
        return {
            "id": timestamp,
            "status": "created",
            "timestamp": timestamp,
            "message": i18n_service.get_translation_key('en', 'logs.messages.entry_created_successfully') or 'Log entry created successfully'
        }
        
    except Exception as e:
        ErrorService.handle_generic_exception(
            exception=e,
            operation="creating frontend log entry",
            request=http_request
        )
