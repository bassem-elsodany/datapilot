"""Salesforce tools for a LangGraph ReAct agent.

Minimal, single‑call‑per‑operation utilities used by the model via LangChain @tool.
"""

import json
from typing import Dict, Any, List, Optional
from loguru import logger
from langchain_core.tools import tool

# Global service instance for dependency injection
_salesforce_service = None

def set_salesforce_service(service):
    """Set the Salesforce service instance for dependency injection."""
    global _salesforce_service
    _salesforce_service = service

def get_salesforce_service():
    """Get the Salesforce service singleton instance."""
    global _salesforce_service
    if _salesforce_service is None:
        from app.services.salesforce_service import SalesforceService
        _salesforce_service = SalesforceService.get_instance()
    return _salesforce_service


def _search_for_sobjects_impl(search_terms: List[str], connection_uuid: str) -> Dict[str, Any]:
    """
    Internal implementation of search_for_sobjects with connection_uuid parameter.
    """
    try:
        logger.info(f"Searching for Salesforce objects containing: {search_terms}")
        
        # Use dependency injection for Salesforce service
        salesforce_service = get_salesforce_service()
        
        # Get all SObjects first
        all_sobjects = salesforce_service.get_sobject_list(connection_uuid=connection_uuid)
        
        # Search for all terms and merge results by SObject name
        all_matching_objects = {}  # Use dict instead of set to store name -> object mapping
        search_terms_used = []
        
        for search_term in search_terms:
            # Filter objects that contain the search term (case-insensitive)
            search_term_lower = search_term.lower()
            matching_objects = [
                obj for obj in all_sobjects 
                if search_term_lower in obj.get('name', '').lower() or 
                   search_term_lower in obj.get('label', '').lower()
            ]
            
            # Add to dict to avoid duplicates (using name as unique identifier)
            for obj in matching_objects:
                obj_name = obj.get('name', '')
                if obj_name:  # Only add if name exists
                    all_matching_objects[obj_name] = obj
            
            search_terms_used.append(search_term)
            logger.debug(f"Search term '{search_term}' found {len(matching_objects)} objects")
        
        # Convert dict to list and sort simply (exact matches first, then alphabetical)
        def simple_sort_key(item):
            name, obj = item
            obj_name = obj.get('name', '').lower()
            
            # Check if any search term is an exact match
            for term in search_terms:
                if obj_name == term.lower():
                    return (0, obj_name)  # Exact matches first
            
            return (1, obj_name)  # Then alphabetical
        
        unique_objects = [obj for name, obj in sorted(all_matching_objects.items(), key=simple_sort_key)]
        
        # Apply pagination to merged results
        total_count = len(unique_objects)
        start_idx = 0
        end_idx = min(200, total_count)
        paginated_objects = unique_objects[start_idx:end_idx]
        
        # Return only essential fields to reduce state size
        simplified_objects = []
        for obj in paginated_objects:
            simplified_objects.append({
                "name": obj.get("name", ""),
                "label": obj.get("label", "")
            })
        
        # Create pagination metadata
        pagination_info = {
            "total_count": total_count,
            "offset": 0,
            "limit": 200,
            "has_more": end_idx < total_count,
            "next_offset": end_idx if end_idx < total_count else None
        }
        
        # Return merged results with SObject names as keys
        result = {}
        for obj in simplified_objects:
            sobject_name = obj["name"]
            result[sobject_name] = {
                "name": obj["name"],
                "label": obj["label"]
            }
        
        # Add search metadata
        result["_search_metadata"] = {
            "search_terms_used": search_terms_used,
            "total_objects_found": total_count,
            "objects_returned": len(simplified_objects),
            "pagination": pagination_info
        }
        
        logger.debug(f"Merged search results: {len(search_terms_used)} terms found {total_count} unique objects, returning {len(simplified_objects)} (offset: 0)")
        
        return result
        
    except Exception as e:
        logger.error(f"Error searching SObjects: {e}")
        return {}


@tool
def search_for_sobjects(search_terms: List[str], connection_uuid: str) -> Dict[str, Any]:
    """Search Salesforce SObjects by name/label. Use **one call** for all object terms (including variants/typos). Returns a dict keyed by API name and `_search_metadata`.

    Args:
        search_terms: list of partial names/variants (e.g., ["meeting","meetng","member"]).
        connection_uuid: Salesforce connection.

    Best practices: combine all terms in one call; search only unknown objects; use results’ API names for later ops.
    """
    return _search_for_sobjects_impl(search_terms, connection_uuid)


def _get_sobject_metadata_impl(object_names: List[str], connection_uuid: str, 
                        include_picklist_values: bool = False, 
                        include_calculated_fields: bool = False, 
                        include_field_properties: bool = False, 
                        field_offset: int = 0, field_limit: int = 20,
                        filter_unique: bool = False,
                        filter_nillable: bool = False,
                        filter_updateable: bool = False,
                        filter_required: bool = False) -> Dict[str, Any]:
    """
    Get detailed metadata for Salesforce objects with field pagination support.
    
    Args:
        object_names: List of Salesforce object names
        connection_uuid: Connection UUID (required)
        include_picklist_values: Include picklist values (default: False)
        include_calculated_fields: Include calculated/formula fields (default: False)
        include_field_properties: Include field properties (default: False)
        field_offset: Starting position for field pagination (default: 0)
        field_limit: Maximum number of fields to return (default: 20, max: 100)
        
    Returns:
        Object metadata with paginated fields and field pagination metadata
    """
    try:
        logger.debug(f"Getting metadata for objects: {object_names}")
        
        # Use dependency injection for Salesforce service
        salesforce_service = get_salesforce_service()
        
        # Use individual describe calls for all objects
        result = {}
        for object_name in object_names:
            try:
                metadata = salesforce_service.describe_sobject(object_name, connection_uuid, include_child_relationships=False)
                
                # Create a summary instead of returning all field details to prevent token overflow
                fields = metadata.get('fields', [])
                
                # Sort fields by name for consistent pagination
                fields.sort(key=lambda x: x.get('name', '').lower())
                
                # Apply field filters
                if filter_unique or filter_nillable or filter_updateable or filter_required:
                    filtered_fields = []
                    for field in fields:
                        # Apply filters
                        if filter_unique and not field.get("unique", False):
                            continue
                        if filter_nillable and not field.get("nillable", True):
                            continue
                        if filter_updateable and not field.get("updateable", False):
                            continue
                        if filter_required and field.get("nillable", True):  # required = not nillable
                            continue
                        filtered_fields.append(field)
                    fields = filtered_fields
                
                # Apply field pagination
                total_field_count = len(fields)
                start_idx = field_offset
                end_idx = min(field_offset + field_limit, total_field_count)
                paginated_fields = fields[start_idx:end_idx]
                
                field_summary = []
                
                # Include field information based on requested parameters
                for field in paginated_fields:
                    field_info = {
                        "name": field.get("name"),
                        "label": field.get("label"),
                        "type": field.get("type"),
                        "required": not field.get("nillable", True),

                    }
                    
                    # Conditionally include additional metadata based on parameters
                    if include_picklist_values and field.get("picklistValues"):
                        field_info["picklistValues"] = field.get("picklistValues", [])
                    
                    if include_calculated_fields:
                        field_info["calculated"] = field.get("calculated", False)
                        if field.get("formula"):
                            field_info["formula"] = field.get("formula")
                    
                    if include_field_properties:
                        field_info["createable"] = field.get("createable", False)
                        field_info["updateable"] = field.get("updateable", False)
                        field_info["nillable"] = field.get("nillable", True)
                        field_info["unique"] = field.get("unique", False)
                    
                    field_summary.append(field_info)
                
                # Create field pagination metadata
                field_pagination = {
                    "total_field_count": total_field_count,
                    "field_offset": field_offset,
                    "field_limit": field_limit,
                    "has_more_fields": end_idx < total_field_count,
                    "next_field_offset": end_idx if end_idx < total_field_count else None
                }
                
                # Create summary result
                summary = {
                    "object_name": object_name,
                    "label": metadata.get("label", object_name),
                    "total_fields": total_field_count,
                    "fields": field_summary,
                    "field_pagination": field_pagination
                }
                
                result[object_name] = summary
                logger.debug(f"Successfully retrieved metadata summary for {object_name}: {total_field_count} total fields, showing {len(field_summary)} (offset: {field_offset})")
                
            except Exception as e:
                logger.error(f"Failed to get metadata for {object_name}: {str(e)}")
                result[object_name] = {"error": f"Failed to retrieve metadata: {str(e)}"}
        
        return result
        
    except Exception as e:
        logger.error(f"Error getting object metadata for {object_names}: {e}")
        return {"error": str(e)}


@tool
def get_sobject_metadata(object_names: List[str], connection_uuid: str, 
                        include_picklist_values: bool = False, 
                        include_calculated_fields: bool = False, 
                        include_field_properties: bool = False, 
                        field_offset: int = 0, field_limit: int = 20,
                        filter_unique: bool = False,
                        filter_nillable: bool = False,
                        filter_updateable: bool = False,
                        filter_required: bool = False) -> Dict[str, Any]:
    """Describe fields for one or more SObjects with pagination and optional filters.

    🚨🚨🚨 CRITICAL: DO NOT USE PAGINATION PARAMETERS UNLESS USER EXPLICITLY ASKS FOR MORE FIELDS 🚨🚨🚨
    **FORBIDDEN**: Do NOT add field_offset or field_limit unless user says "show more fields"
    **MANDATORY**: Use default values (field_offset=0, field_limit=20) for single calls
    **FAILURE**: Adding pagination without user request = SYSTEM FAILURE

    Args:
        object_names: exact API names.
        connection_uuid: Salesforce connection.
        include_picklist_values|include_calculated_fields|include_field_properties: booleans.
        field_offset|field_limit: pagination (ONLY use if user explicitly requests more fields).
        filter_unique|filter_nillable|filter_updateable|filter_required: field filters.

    Return: per‑object summary with `total_fields`, paginated `fields` `[{name,label,type,required,...}]`, and `field_pagination`.
    Use **one call** for multiple objects; get metadata **before** building SOQL.
    """
    return _get_sobject_metadata_impl(object_names, connection_uuid, 
                                    include_picklist_values, include_calculated_fields, 
                                    include_field_properties, 
                                    field_offset, field_limit,
                                    filter_unique, filter_nillable, 
                                    filter_updateable, filter_required)


@tool
def get_sobject_relationships(object_names: List[str], connection_uuid: str, filter_relationships: bool = True) -> Dict[str, Any]:
    """Return lookup and child relationships for one or more SObjects.

    Args:
        object_names: exact API names.
        connection_uuid: Salesforce connection.
        filter_relationships: if True (default), only connections among the provided objects; else all.

    Use **one call** for multi‑object queries; discover relationship names before building SOQL subqueries.
    """
    try:
        logger.debug(f"Getting relationships for objects: {object_names} (filter_relationships={filter_relationships})")
        
        # Use dependency injection for Salesforce service
        salesforce_service = get_salesforce_service()
        
        # Get relationships for all objects
        result = {}
        all_relationships = {}
        
        for object_name in object_names:
            try:
                # Get object metadata with relationships
                metadata = salesforce_service.describe_sobject(object_name, connection_uuid, include_child_relationships=True)
                
                # Extract relationship information
                relationships = {
                    "object_name": object_name,
                    "parent_relationships": [],
                    "child_relationships": [],
                    "lookup_relationships": []
                }
                
                # Process fields for relationships
                for field in metadata.get('fields', []):
                    if field.get('type') == 'reference':
                        relationships["lookup_relationships"].append({
                            "field_name": field['name'],
                            "reference_to_object_name": field.get('referenceTo', [])
                        })
                
                # Process child relationships
                for rel in metadata.get('childRelationships', []):
                    relationships["child_relationships"].append({
                        "relationship_query_name": rel.get('relationshipName', ''),
                        "child_object_name": rel.get('childSObject', '')
                    })
                
                all_relationships[object_name] = relationships
                logger.debug(f"Successfully retrieved relationships for {object_name}")
                
            except Exception as e:
                logger.error(f"Failed to get relationships for {object_name}: {str(e)}")
                all_relationships[object_name] = {"error": f"Failed to retrieve relationships: {str(e)}"}
        
        # If filter_relationships is True and we have multiple objects, filter to only connecting relationships
        if filter_relationships and len(object_names) > 1:
            logger.debug("Filtering relationships to show only connections between specified objects")
            
            # Create a set of target object names for quick lookup
            target_objects = set(object_names)
            
            for object_name, relationships in all_relationships.items():
                if "error" in relationships:
                    result[object_name] = relationships
                    continue
                
                # Filter relationships to only include those that connect to other target objects
                filtered_relationships = {
                    "object_name": object_name,
                    "child_relationships": [],
                    "lookup_relationships": []
                }
                
                # Filter child_relationships: check if child_object_name is in target_objects
                for rel in relationships.get("child_relationships", []):
                    child_object = rel.get("child_object_name", "")
                    if child_object in target_objects:
                        filtered_relationships["child_relationships"].append(rel)
                
                # Filter lookup_relationships: check if any reference_to_object_name is in target_objects
                for rel in relationships.get("lookup_relationships", []):
                    reference_to = rel.get("reference_to_object_name", [])
                    if any(ref_obj in target_objects for ref_obj in reference_to):
                        filtered_relationships["lookup_relationships"].append(rel)
                
                result[object_name] = filtered_relationships
        else:
            # Return all relationships without filtering
            result = all_relationships
        
        return result
        
    except Exception as e:
        logger.error(f"Error getting relationships for objects {object_names}: {e}")
        return {"error": str(e)}


def _execute_soql_query_impl(query: str, connection_uuid: str) -> Dict[str, Any]:
    """
    Internal implementation of execute_soql_query with connection_uuid parameter.
    """
    try:
        logger.debug(f"Executing SOQL query: {query[:100]}...")
        # Use dependency injection for Salesforce service
        salesforce_service = get_salesforce_service()
        result = salesforce_service.execute_query_llm_friendly(query, connection_uuid=connection_uuid)
        logger.debug(f"SOQL query executed successfully: {len(result.get('records', []))} records")
        return result
        
    except Exception as e:
        logger.error(f"Error executing SOQL query: {e}")
        return {"error": str(e)}


@tool
def execute_soql_query(query: str, connection_uuid: str) -> Dict[str, Any]:
    """Execute a SOQL query. Use only after resolving objects/fields/relationships. For multi‑object data, build **one** SOQL with correct relationship names and a LIMIT (default 5, max 10).

    Args:
        query: SOQL string.
        connection_uuid: Salesforce connection.

    Returns: Dictionary containing query results with records, total count, and metadata.
    
    Note: Downstream workflow may withhold 'records' from the LLM and expose full results via state['client_results'] to reduce token usage while keeping user-visible data intact.
    """
    return _execute_soql_query_impl(query, connection_uuid)


def _get_field_details_impl(object_name: str, field_name: str, connection_uuid: str, 
                           include_picklist_values: bool = False, 
                           include_field_properties: bool = False) -> Dict[str, Any]:
    """
    Internal implementation to get detailed information about a specific field from an SObject.
    
    Args:
        object_name: Name of the Salesforce object
        field_name: Name of the field to get details for
        connection_uuid: Connection UUID (required)
        include_picklist_values: Include picklist values if applicable (default: False)
        include_field_properties: Include field properties like createable, updateable (default: False)
        
    Returns:
        Dictionary containing detailed field information
    """
    try:
        logger.debug(f"Getting field details for {object_name}.{field_name}")
        
        # Use dependency injection for Salesforce service
        salesforce_service = get_salesforce_service()
        
        # Get object metadata
        metadata = salesforce_service.describe_sobject(object_name, connection_uuid, include_child_relationships=False)
        
        # Find the specific field
        field_found = None
        for field in metadata.get('fields', []):
            if field.get('name') == field_name:
                field_found = field
                break
        
        if not field_found:
            return {
                "error": f"Field '{field_name}' not found in object '{object_name}'",
                "object_name": object_name,
                "field_name": field_name
            }
        
        # Build detailed field information using only properties available in simple-salesforce SDK
        field_details = {
            "object_name": object_name,
            "field_name": field_found.get("name"),
            "label": field_found.get("label"),
            "type": field_found.get("type"),
            "required": not field_found.get("nillable", True),
            "unique": field_found.get("unique", False),
            "calculated": field_found.get("calculated", False),
            "length": field_found.get("length"),
            "precision": field_found.get("precision"),
            "scale": field_found.get("scale"),
            "reference_to": field_found.get("referenceTo", []),
            "relationship_name": field_found.get("relationshipName"),
            "formula": field_found.get("formula", ""),
        }
        
        # Include field properties if requested (only properties available in simple-salesforce SDK)
        if include_field_properties:
            field_details.update({
                "createable": field_found.get("createable", False),
                "updateable": field_found.get("updateable", False),
                "nillable": field_found.get("nillable", True)
            })
        
        
        # Include picklist values if requested and applicable
        if include_picklist_values and field_found.get("picklistValues"):
            picklist_values = []
            for picklist_value in field_found.get("picklistValues", []):
                picklist_info = {
                    "value": picklist_value.get("value"),
                    "label": picklist_value.get("label")
                }
                
                # Include dependent picklist info if available
                if picklist_value.get("validFor"):
                    picklist_info["valid_for"] = picklist_value.get("validFor")
                
                picklist_values.append(picklist_info)
            
            field_details["picklist_values"] = picklist_values
        
        logger.debug(f"Successfully retrieved field details for {object_name}.{field_name}")
        return field_details
        
    except Exception as e:
        logger.error(f"Error getting field details for {object_name}.{field_name}: {e}")
        return {
            "error": str(e),
            "object_name": object_name,
            "field_name": field_name
        }


@tool
def get_field_details(object_name: str, field_name: str, connection_uuid: str) -> Dict[str, Any]:
    """Return details for a specific field on an SObject, including type, constraints, properties, and picklist values.

    Args:
        object_name: API name.
        field_name: field API name.
        connection_uuid: Salesforce connection.

    Use for field‑specific requests; for general lists use `get_sobject_metadata`.
    """
    return _get_field_details_impl(object_name, field_name, connection_uuid, 
                                  include_picklist_values=True, include_field_properties=True)


# Tools list for LangGraph - exactly like the reference
tools = [search_for_sobjects, get_sobject_metadata, get_sobject_relationships, execute_soql_query, get_field_details]
tools_by_name = {tool.name: tool for tool in tools}