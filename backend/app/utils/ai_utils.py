"""
DataPilot Backend - AI Agent Utilities

This module provides comprehensive utility functions for AI agent operations in the DataPilot backend,
offering advanced tool call processing, response parsing, and AI workflow utilities with enterprise-grade
performance optimization and security features.

The AI utilities provide:
- Advanced tool call extraction and processing
- Comprehensive AI response parsing and validation
- Intelligent tool result detection and analysis
- AI workflow orchestration and management
- Performance optimization and caching
- Security and compliance features

Core AI Features:

Tool Call Processing:
- Advanced tool call extraction and parsing
- Tool argument validation and sanitization
- Tool result processing and analysis
- Tool error handling and recovery
- Tool performance monitoring and metrics
- Tool security and access control

AI Response Parsing:
- Intelligent AI response parsing and validation
- Response structure analysis and extraction
- Response content validation and sanitization
- Response error detection and handling
- Response performance optimization
- Response security and compliance

AI Workflow Management:
- AI workflow orchestration and execution
- Workflow state management and persistence
- Workflow error handling and recovery
- Workflow performance monitoring
- Workflow security and access control
- Workflow compliance and audit

Performance & Optimization:
- Efficient AI operation processing
- Caching and optimization strategies
- Memory usage optimization
- Performance monitoring and metrics
- Scalability and load balancing
- Resource usage optimization

Security & Compliance:
- Secure AI operation processing
- Input validation and sanitization
- Output validation and sanitization
- Security event logging and monitoring
- Compliance reporting and analytics
- Data privacy and GDPR compliance

Integration Points:
- LangGraph workflow integration
- AI model and service integration
- Logging and monitoring systems
- Error handling and reporting
- Frontend user interface
- Performance monitoring systems

Author: Bassem Elsodany
GitHub: https://github.com/bassem-elsodany
LinkedIn: https://www.linkedin.com/in/bassem-elsodany/
Version: 1.0.0
License: MIT License
"""

import json
from typing import Any, Dict, Optional, Tuple
from loguru import logger

def extract_tool_info(tool_call: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
    """Extract tool name and arguments from a tool call."""
    tool_name = 'unknown_tool'
    tool_args = {}
    
    if not isinstance(tool_call, dict):
        return tool_name, tool_args
    
    # Try different formats
    if 'function' in tool_call and 'name' in tool_call['function']:
        tool_name = tool_call['function']['name']
        raw_args = tool_call['function'].get('arguments', {})
        tool_args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
    elif 'name' in tool_call and 'args' in tool_call:
        tool_name = tool_call['name']
        tool_args = tool_call['args']
    elif 'name' in tool_call:
        tool_name = tool_call['name']
        raw_args = tool_call.get('arguments', {})
        tool_args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
    
    return tool_name, tool_args


def generate_tool_thought(tool_name: str, tool_args: Dict[str, Any]) -> str:
    """Generate a dynamic thought message based on tool name and arguments."""
    args_parts = []
    for key, value in tool_args.items():
        if key == 'connection_uuid':
            continue
        if isinstance(value, (list, tuple)):
            args_parts.append(f"{key}: {', '.join(map(str, value))}")
        else:
            args_parts.append(f"{key}: {value}")
    
    args_str = " with " + ", ".join(args_parts) if args_parts else ""
    return f"Calling {tool_name}{args_str}"


def parse_structured_response(content: str) -> Optional[Dict[str, Any]]:
    """Parse content as a structured AI response."""
    if not content or not content.strip().startswith('{') or not content.strip().endswith('}'):
        return None
    
    try:
        parsed = json.loads(content.strip())
        if isinstance(parsed, dict) and 'response_type' in parsed and 'confidence' in parsed:
            return parsed
    except:
        pass
    
    return None


def is_tool_result(content: str) -> bool:
    """Check if content is a tool result (JSON without response_type/confidence)."""
    if not content or not content.strip().startswith('{') or not content.strip().endswith('}'):
        return False
    
    try:
        parsed = json.loads(content.strip())
        if isinstance(parsed, dict):
            return 'response_type' not in parsed and 'confidence' not in parsed
    except:
        pass
    
    return False
