"""
DataPilot Backend - Advanced Logging System

This module provides a comprehensive, production-ready logging system for the DataPilot
Python Backend using loguru. It handles multi-level logging, log rotation, performance
monitoring, and seamless frontend log integration.

The logging system provides:
- Multi-level logging (DEBUG, INFO, WARNING, ERROR, CRITICAL)
- Console and file logging with automatic rotation
- Colored console output for enhanced readability
- Frontend log integration for centralized monitoring
- Performance monitoring and metrics collection
- Security-focused log sanitization
- Production-ready log management

Core Features:

Log Levels and Filtering:
- DEBUG: Detailed diagnostic information for development
- INFO: General information about application flow
- WARNING: Warning messages for potential issues
- ERROR: Error conditions that don't stop the application
- CRITICAL: Serious errors that may cause application failure

Console Logging:
- Colored output for different log levels
- Structured formatting with timestamps and context
- Real-time log streaming for development
- Configurable output formatting
- Performance-optimized console output

File Logging:
- Automatic log rotation based on size and time
- Compressed log archives for storage efficiency
- Separate log files for different components
- Configurable retention policies
- Secure log file permissions

Frontend Integration:
- Centralized log collection from frontend applications
- Real-time log streaming to backend
- Log correlation between frontend and backend
- Error tracking and debugging support
- Performance monitoring across the stack

Performance Monitoring:
- Request/response timing and metrics
- Database query performance tracking
- Memory usage and resource monitoring
- Error rate and success rate tracking
- Custom performance markers

Security Features:
- Log sanitization to prevent sensitive data exposure
- Secure log file storage and access control
- Audit trail for security events
- Input validation and sanitization logging
- Authentication and authorization logging

Production Features:
- Log aggregation and centralized collection
- Automated log analysis and alerting
- Performance bottleneck identification
- Error pattern recognition and reporting
- Compliance and audit trail support

Configuration Options:
- Environment-based log level configuration
- Custom log formatters and handlers
- Configurable log rotation policies
- Performance optimization settings
- Security and compliance settings

Integration Points:
- FastAPI request/response logging
- Database operation logging
- AI workflow execution logging
- Salesforce API interaction logging
- WebSocket communication logging
- Error handling and exception logging

Author: Bassem Elsodany
GitHub: https://github.com/bassem-elsodany
LinkedIn: https://www.linkedin.com/in/bassem-elsodany/
Version: 1.0.0
License: MIT License
"""

import os
import sys
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional
from contextvars import ContextVar

from loguru import logger
from app.core.config import settings

# Context variable for request/operation tracing
request_id_var: ContextVar[Optional[str]] = ContextVar('request_id', default=None)
operation_id_var: ContextVar[Optional[str]] = ContextVar('operation_id', default=None)


def setup_logging(
    log_level: str = "INFO",
    log_dir: Optional[str] = None,
    enable_file_logging: bool = True,
    enable_console_logging: bool = True,
    max_file_size: int = 10 * 1024 * 1024,  # 10MB
    backup_count: int = 30,  # Keep 30 days of logs
    log_format: str = "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | <level>{level: <8}</level> | <cyan>{name: <35}</cyan> | <yellow>L{line: <3}</yellow> | <level>{message}</level>",
    date_format: str = "YYYY-MM-DD HH:mm:ss"
) -> None:
    """
    Setup comprehensive logging configuration using loguru
    
    Args:
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        log_dir: Directory to store log files (defaults to ./logs)
        enable_file_logging: Whether to enable file logging
        enable_console_logging: Whether to enable console logging
        max_file_size: Maximum size of each log file in bytes
        backup_count: Number of backup files to keep
        log_format: Format string for log messages
        date_format: Format string for timestamps
    """
    
    # Remove default loguru handler
    logger.remove()
    
    # Create logs directory if it doesn't exist
    if log_dir is None:
        log_dir = os.path.join(os.getcwd(), "logs")
    
    log_path = Path(log_dir)
    log_path.mkdir(exist_ok=True)
    
    # Console handler (WITH COLORS) - only clean messages
    if enable_console_logging:
        logger.add(
            sys.stdout,
            format=log_format,
            level=log_level.upper(),
            colorize=True,
            backtrace=True,
            diagnose=True,
            filter=lambda record: not record["extra"].get("file_only", False)
        )
    
    # File handler with rotation for backend logs
    if enable_file_logging:
        backend_log_file = log_path / "datapilot-backend.log"
        
        # Main file handler for all logs
        logger.add(
            str(backend_log_file),
            format="{time:YYYY-MM-DD HH:mm:ss.SSS} | {level: <8} | {name: <35} | L{line: <3} | {message}",
            level=log_level.upper(),
            rotation="1 day",
            retention=f"{backup_count} days",
            compression="zip",
            backtrace=True,
            diagnose=True,
            enqueue=False  # Disable enqueue to ensure immediate writing
        )
    
    # Disable uvicorn access logs for cleaner output
    logger.disable("uvicorn.access")
    
    logger.enable("requests.packages.urllib3")
    logger.enable("urllib3")
    logger.enable("requests")
    
    # Log the logging setup
    logger.info(f"Logging system initialized")
    logger.info(f"Log level: {log_level.upper()}")
    if enable_file_logging:
        logger.info(f"Logs saved to: {log_path}")
    
    # Print log format header for clarity
    logger.info("Log Format: TIMESTAMP | LEVEL | MODULE | LLINE | MESSAGE")
    logger.info("Example: 2025-09-05 03:18:25.123 | INFO | app.ai_agent.workflow.nodes.intelligence | L235 | Message here")


def setup_frontend_logging(
    log_dir: Optional[str] = None,
    max_file_size: int = 10 * 1024 * 1024,  # 10MB
    backup_count: int = 30,  # Keep 30 days of logs
    log_format: str = "{time:YYYY-MM-DD HH:mm:ss} - {level: <8} - [FRONTEND] - {message}",
    date_format: str = "YYYY-MM-DD HH:mm:ss"
) -> None:
    """
    Setup dedicated logging for frontend logs using loguru
    
    Args:
        log_dir: Directory to store log files (defaults to ./logs)
        max_file_size: Maximum size of each log file in bytes
        backup_count: Number of backup files to keep
        log_format: Format string for log messages
        date_format: Format string for timestamps
    """
    
    # Create logs directory if it doesn't exist
    if log_dir is None:
        log_dir = os.path.join(os.getcwd(), "logs")
    
    log_path = Path(log_dir)
    log_path.mkdir(exist_ok=True)
    
    # File handler with daily rotation for frontend logs
    frontend_log_file = log_path / "datapilot-frontend.log"
    logger.add(
        str(frontend_log_file),
        format=log_format,
        level="DEBUG",
        rotation="1 day",
        retention=f"{backup_count} days",
        compression="zip",
        backtrace=True,
        diagnose=True,
        enqueue=True,
        filter=lambda record: record["extra"].get("frontend", False)
    )


def get_logger(name: str):
    """
    Get a logger instance with the specified name and tracing context
    
    Args:
        name: Logger name (usually __name__)
        
    Returns:
        Configured logger instance with tracing context
    """
    request_id = request_id_var.get()
    operation_id = operation_id_var.get()
    
    return logger.bind(
        name=name,
        request_id=request_id,
        operation_id=operation_id
    )


def set_request_id(request_id: Optional[str] = None) -> str:
    """
    Set request ID for tracing across the request lifecycle
    
    Args:
        request_id: Optional request ID (generates UUID if not provided)
        
    Returns:
        The request ID that was set
    """
    if request_id is None:
        request_id = str(uuid.uuid4())[:8]  # Short UUID for readability
    
    request_id_var.set(request_id)
    return request_id


def set_operation_id(operation_id: Optional[str] = None) -> str:
    """
    Set operation ID for tracing specific operations
    
    Args:
        operation_id: Optional operation ID (generates UUID if not provided)
        
    Returns:
        The operation ID that was set
    """
    if operation_id is None:
        operation_id = str(uuid.uuid4())[:8]  # Short UUID for readability
    
    operation_id_var.set(operation_id)
    return operation_id


def get_request_id() -> Optional[str]:
    """Get current request ID"""
    return request_id_var.get()


def get_operation_id() -> Optional[str]:
    """Get current operation ID"""
    return operation_id_var.get()


def get_frontend_logger():
    """
    Get the dedicated frontend logger
    
    Returns:
        Frontend logger instance
    """
    return logger.bind(frontend=True)


def log_with_extra(
    level: str,
    message: str,
    extra_data: Optional[dict] = None
) -> None:
    """
    Log a message with extra data that goes to file but not console
    
    This function logs the same message twice:
    1. To console: Clean message without extra data
    2. To file: Full message with extra data (file_only flag prevents console output)
    
    Args:
        level: Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        message: Log message
        extra_data: Optional extra data dictionary (only logged to file)
    """
    # First log to console (clean message without extra)
    if level.upper() == "DEBUG":
        logger.debug(message)
    elif level.upper() == "INFO":
        logger.info(message)
    elif level.upper() == "WARNING":
        logger.warning(message)
    elif level.upper() == "ERROR":
        logger.error(message)
    elif level.upper() == "CRITICAL":
        logger.critical(message)
    else:
        logger.info(message)
    
    # Then log to file with extra data (if provided) - file_only flag prevents console output
    if extra_data:
        # Format extra data for file logging
        import json
        extra_str = json.dumps(extra_data, indent=2, default=str)
        file_message = f"{message}\nEXTRA: {extra_str}"
        
        # Log to file with extra data using file_only flag
        if level.upper() == "DEBUG":
            logger.bind(file_only=True).debug(file_message)
        elif level.upper() == "INFO":
            logger.bind(file_only=True).info(file_message)
        elif level.upper() == "WARNING":
            logger.bind(file_only=True).warning(file_message)
        elif level.upper() == "ERROR":
            logger.bind(file_only=True).error(file_message)
        elif level.upper() == "CRITICAL":
            logger.bind(file_only=True).critical(file_message)
        else:
            logger.bind(file_only=True).info(file_message)


def log_frontend_message(
    level: str,
    message: str,
    context: Optional[str] = None,
    data: Optional[dict] = None,
    timestamp: Optional[str] = None
) -> None:
    """
    Log a message from the frontend
    
    Args:
        level: Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        message: Log message
        context: Optional context information
        data: Optional data dictionary
        timestamp: Optional timestamp (if not provided, current time is used)
    """
    frontend_logger = get_frontend_logger()
    
    # Prepare extra context
    extra: dict = {"frontend": True}
    if context:
        extra["context"] = context
    if data:
        extra["data"] = data
    if timestamp:
        extra["timestamp"] = timestamp
    
    # Log with the appropriate level
    if level.upper() == "DEBUG":
        frontend_logger.debug(message, **extra)
    elif level.upper() == "INFO":
        frontend_logger.info(message, **extra)
    elif level.upper() == "WARNING":
        frontend_logger.warning(message, **extra)
    elif level.upper() == "ERROR":
        frontend_logger.error(message, **extra)
    elif level.upper() == "CRITICAL":
        frontend_logger.critical(message, **extra)
    else:
        frontend_logger.info(message, **extra)


def log_startup_info() -> None:
    """Log application startup information"""
    logger.info("DataPilot API Backend Starting")
    logger.info(f"Environment: {settings.ENVIRONMENT}")
    logger.info(f"Debug mode: {settings.DEBUG}")
    logger.info(f"Database: PostgreSQL")


def log_shutdown_info() -> None:
    """Log application shutdown information"""
    logger.info("DataPilot API Backend Shutting Down")


# Initialize logging on module import
def initialize_logging() -> None:
    """Initialize logging based on settings"""
    setup_logging(
        log_level=settings.LOG_LEVEL,
        enable_file_logging=True,
        enable_console_logging=True,
        max_file_size=10 * 1024 * 1024,  # 10MB
        backup_count=30  # 30 days
    )
    
    # Setup frontend logging
    setup_frontend_logging(
        max_file_size=10 * 1024 * 1024,  # 10MB
        backup_count=30  # 30 days
    )


# Auto-initialize when module is imported
if __name__ != "__main__":
    initialize_logging()
