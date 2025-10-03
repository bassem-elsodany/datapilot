"""
Tools package for the LangGraph Custom ReAct Agent.

This package provides simple @tool decorated functions for Salesforce operations:
- search_for_sobjects: Search for Salesforce objects by partial name matching
- get_sobject_metadata: Retrieve object metadata including fields and descriptions
- get_sobject_relationships: Get object relationships including parent and child relationships
- get_field_details: Get detailed information about a specific field from an SObject
- execute_soql_query: Execute SOQL queries against Salesforce

Each tool uses the @tool decorator from langchain_core.tools.
The Salesforce service must be pre-initialized before using these tools.
"""

from app.ai_agent.workflow.tools.salesforce_tools import (
    search_for_sobjects,
    get_sobject_metadata,
    get_sobject_relationships,
    get_field_details,
    execute_soql_query,
    set_salesforce_service,
    get_salesforce_service
)

__all__ = [
    "search_for_sobjects",
    "get_sobject_metadata",
    "get_sobject_relationships",
    "get_field_details",
    "execute_soql_query",
    "set_salesforce_service",
    "get_salesforce_service"
]