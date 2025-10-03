"""
API Endpoints Module - REST Compliant

This module contains all REST API endpoint implementations for the DataPilot backend.
Each endpoint file provides specific functionality for different aspects of the application
following REST architectural principles and proper resource hierarchy.

Available endpoints:
- salesforce.py: Salesforce API operations (SOQL, SObjects, Apex execution)
- connections.py: Connection management, lifecycle, and authentication
- sf_agent.py: DataPilot AI Agent (REST + WebSocket) with LangGraph integration
- auth_providers.py: Authentication provider management
- i18n.py: Internationalization and translation services
- logging.py: Logging and monitoring endpoints
- master_key.py: Master key management and encryption
- saved_queries.py: Saved query management and execution tracking
- saved_apex.py: Saved Apex code management with debug levels

REST Compliance Features:
- Resource-based URLs with proper hierarchy
- HTTP methods aligned with operations (GET, POST, PUT, DELETE)
- Consistent error handling and status codes
- Proper resource identification and relationships
- Connection lifecycle management in connections.py
- LangGraph-based conversation management in sf_agent.py

Author: Bassem Elsodany
GitHub: https://github.com/bassem-elsodany
LinkedIn: https://www.linkedin.com/in/bassem-elsodany/
Version: 1.0.0
License: MIT License
"""
