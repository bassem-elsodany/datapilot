"""
Salesforce Tree Transformer Service

This module provides data transformation functionality to convert raw Salesforce API responses
into clean, structured tree data suitable for complex multi-level master-detail table rendering.

The transformer removes Salesforce metadata (attributes), organizes data into a hierarchical
tree structure, and provides a clean interface for the frontend to consume.

Features:
- Removes Salesforce attributes and metadata
- Organizes data into hierarchical tree structure
- Handles nested relationships and sub-queries
- Extracts clean field data without Salesforce internals
- Provides consistent data structure for UI consumption
- Supports up to 4 levels of nesting (Master -> Detail -> Nested -> Sub-Nested)

Author: Bassem Elsodany
GitHub: https://github.com/bassem-elsodany
LinkedIn: https://www.linkedin.com/in/bassem-elsodany/
Version: 1.0.0
License: MIT License
"""

from typing import Dict, List, Any, Optional, Union
from loguru import logger
from app.models.query_response import QueryRecord, QueryMetadata, QueryResponse


def transform_query_result(raw_result: Dict[str, Any]) -> QueryResponse:
    """
    Transform raw Salesforce query result into clean query response structure
    
    Args:
        raw_result: Raw Salesforce API response
        
    Returns:
        QueryResponse with metadata and clean records
    """
    try:
        logger.debug("Starting Salesforce response transformation")
        
        # Extract metadata
        metadata = _extract_metadata(raw_result)
        
        # Transform records into query response structure
        records = _build_tree(raw_result.get("records", []))
        
        result = QueryResponse(
            metadata=metadata,
            records=records
        )
        
        logger.info(f"Transformation completed: {len(records)} records processed")
        return result
        
    except Exception as e:
        logger.error(f"Error transforming Salesforce response: {str(e)}")
        raise


def _extract_metadata(raw_result: Dict[str, Any]) -> QueryMetadata:
    """Extract metadata from raw Salesforce response"""
    return QueryMetadata(
        total_size=raw_result.get("totalSize", 0),
        done=raw_result.get("done", True),
        nextRecordsUrl=raw_result.get("nextRecordsUrl")
    )


def _build_tree(records: List[Dict[str, Any]]) -> List[QueryRecord]:
    """Build query response structure from Salesforce records"""
    # First, transform all records
    transformed_records = [_transform_record(record) for record in records]
    
    # Then, clean up relationship fields at all levels
    cleaned_records = _clean_relationship_fields_recursively(transformed_records)
    
    return cleaned_records


def _transform_record(record: Dict[str, Any]) -> QueryRecord:
    """
    Transform a single Salesforce record into clean query record
    
    Args:
        record: Raw Salesforce record
        
    Returns:
        QueryRecord with type, fields, and relationships
    """
    # Extract ID from various sources
    record_id = _extract_id(record)
    
    # Extract object type from attributes
    object_type = _extract_object_type(record)
    
    # Extract clean fields (excluding attributes and relationships)
    fields = _extract_clean_fields(record)
    
    # Extract relationships
    relationships = _extract_relationships(record)
    
    # Ensure Id is always the first field in fields object
    # Remove any existing Id from fields and add it as the first field
    if 'Id' in fields:
        del fields['Id']
    if 'id' in fields:
        del fields['id']
    
    # Create ordered fields with Id first
    ordered_fields = {"Id": record_id}
    ordered_fields.update(fields)
    
    return QueryRecord(
        type=object_type,
        fields=ordered_fields,
        relationships=relationships
    )


def _extract_id(record: Dict[str, Any]) -> str:
    """
    Extract record ID from various sources with priority order:
    1. Direct ID fields (Id, id)
    2. attributes.url (most reliable for Salesforce records)
    3. Other ID-like fields
    4. Generate a fallback ID if none found
    
    Args:
        record: Raw Salesforce record
        
    Returns:
        Record ID as string
    """
    # Priority 1: Try direct ID fields first (most common)
    if record.get("Id"):
        return str(record["Id"])
    if record.get("id"):
        return str(record["id"])
    
    # Priority 2: Extract from attributes.url (most reliable for Salesforce)
    # This is crucial because Salesforce always includes attributes.url even when Id is not selected
    attributes = record.get("attributes", {})
    if attributes.get("url"):
        url = attributes["url"]
        # Extract ID from URL like "/services/data/v64.0/sobjects/Account/a4W7a000000PT5yEAG"
        url_parts = url.split("/")
        if url_parts and len(url_parts) > 0:
            # The ID is always the last part of the URL
            potential_id = url_parts[-1]
            # Validate that it looks like a Salesforce ID (15 or 18 characters, alphanumeric)
            if potential_id and len(potential_id) >= 15 and potential_id.replace('_', '').isalnum():
                return potential_id
    
    # Priority 3: Try other ID-like fields
    id_fields = ["ID", "recordId", "RecordId", "record_id", "objectId", "ObjectId"]
    for field in id_fields:
        if record.get(field):
            return str(record[field])
    
    # Priority 4: Try to extract from any field that looks like an ID
    for key, value in record.items():
        if key.lower().endswith('id') and isinstance(value, str) and len(value) >= 15:
            return str(value)
    
    # Last resort: Generate a fallback ID based on object type and hash
    object_type = attributes.get("type", "Unknown")
    import hashlib
    record_str = str(record)
    hash_suffix = hashlib.md5(record_str.encode()).hexdigest()[:8]
    return f"{object_type}_{hash_suffix}"


def _extract_object_type(record: Dict[str, Any]) -> str:
    """Extract Salesforce object type from attributes"""
    attributes = record.get("attributes", {})
    return attributes.get("type", "Unknown")


def _extract_clean_fields(record: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extract clean field data, excluding attributes and relationship objects
    Always ensures ID field is present for UI consistency
    Flattens single relationships into fields with dot notation

    Args:
        record: Raw Salesforce record

    Returns:
        Dictionary of clean field values with flattened single relationships
    """
    fields = {}
    extracted_id = None

    for key, value in record.items():
        # Skip attributes (Salesforce metadata)
        if key == "attributes":
            continue

        # Handle one-to-one relationships (no 'records' array) - flatten into fields
        if _is_single_relationship_object(value):
            # Flatten single relationship into fields with dot notation
            flattened_fields = _flatten_single_relationship(key, value)
            fields.update(flattened_fields)
            continue

        # Skip one-to-many relationships (has 'records' array) - they'll be handled in relationships
        if _is_detail_relationship_object(value):
            continue

        # Handle null values - check if this might be a subquery
        if value is None:
            # Check if this field name suggests it's a subquery (ends with __r or is a known relationship)
            if _is_likely_relationship_field(key):
                # This is likely a subquery that returned null - skip it, it will be handled in relationships
                continue
            else:
                # Include null fields as empty values in fields (not relationships)
                fields[key] = None
                continue

        # Handle nested objects that are not relationships
        if isinstance(value, dict) and not _is_relationship_object(value):
            # This is a nested field object (like RecordType, Owner, etc.)
            fields[key] = _extract_nested_field_value(value)
        else:
            # Regular field value
            fields[key] = value

            # Track if we found an ID field
            if key.lower() in ['id', 'recordid'] and value:
                extracted_id = str(value)

    # Ensure ID field is always present for UI consistency
    # This is crucial for row identification, expansion, and selection
    # Only add Id to fields if it's not already present (to avoid duplication with top-level 'id')
    if 'Id' not in fields and 'id' not in fields:
        # Use the extracted ID from the record
        if extracted_id:
            fields['Id'] = extracted_id
        else:
            # Fallback to the ID we extracted in _extract_id method
            fields['Id'] = _extract_id(record)

    return fields


def _flatten_single_relationship(relationship_name: str, relationship_obj: Dict[str, Any]) -> Dict[str, Any]:
    """
    Flatten a single relationship object into fields with dot notation
    
    Args:
        relationship_name: Name of the relationship (e.g., "Owner")
        relationship_obj: The relationship object from Salesforce
        
    Returns:
        Dictionary of flattened fields with dot notation
    """
    flattened = {}
    
    # Extract the single record from the relationship
    if isinstance(relationship_obj, dict):
        # Handle direct relationship object (like Owner, RecordType)
        for field_key, field_value in relationship_obj.items():
            if field_key == "attributes":
                continue
                
            # Create dot notation field name
            dot_field_name = f"{relationship_name}.{field_key}"
            
            # Handle nested objects
            if isinstance(field_value, dict) and not _is_relationship_object(field_value):
                flattened[dot_field_name] = _extract_nested_field_value(field_value)
            else:
                flattened[dot_field_name] = field_value
                
            # Ensure ID field is present for the relationship
            if field_key.lower() in ['id', 'recordid'] and field_value:
                flattened[f"{relationship_name}.Id"] = str(field_value)
    
    return flattened


def _is_single_relationship_object(value: Any) -> bool:
    """
    Determines if a given value represents a single relationship object.
    Single relationships have attributes but no 'records' array.
    """
    if not isinstance(value, dict):
        return False
    
    # Check for attributes, which are always present in Salesforce relationship objects
    has_attributes = "attributes" in value and isinstance(value["attributes"], dict)
    
    # Check that it's NOT a detail relationship (no 'records' array)
    has_no_records = "records" not in value
    
    # For single relationships, we should have attributes and no records
    # The presence of other fields (like Name, Email) indicates it's a relationship object
    has_other_fields = any(key != "attributes" for key in value.keys())
    
    return has_attributes and has_no_records and has_other_fields


def _is_detail_relationship_object(value: Any) -> bool:
    """
    Determines if a given value represents a detail relationship object.
    Detail relationships have a 'records' array.
    """
    if not isinstance(value, dict):
        return False
    
    # Check for 'records' array (for master-detail relationships)
    has_records_array = "records" in value and isinstance(value["records"], list)
    
    return has_records_array


def _extract_nested_field_value(nested_obj: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extract clean values from nested field objects (like RecordType, Owner)
    Always ensures ID field is present for UI consistency
    
    Args:
        nested_obj: Nested object from Salesforce
        
    Returns:
        Clean nested field values
    """
    clean_obj = {}
    extracted_id = None
    
    for key, value in nested_obj.items():
        # Skip attributes
        if key == "attributes":
            continue
        
        # Handle further nesting
        if isinstance(value, dict) and not _is_relationship_object(value):
            clean_obj[key] = _extract_nested_field_value(value)
        else:
            clean_obj[key] = value
            
            # Track if we found an ID field
            if key.lower() in ['id', 'recordid'] and value:
                extracted_id = str(value)
    
    # Ensure ID field is always present for nested objects too
    if 'Id' not in clean_obj and 'id' not in clean_obj:
        if extracted_id:
            clean_obj['Id'] = extracted_id
        else:
            # Extract ID from nested object's attributes if available
            attributes = nested_obj.get("attributes", {})
            if attributes.get("url"):
                url_parts = attributes["url"].split("/")
                if url_parts and len(url_parts) > 0:
                    potential_id = url_parts[-1]
                    if potential_id and len(potential_id) >= 15:
                        clean_obj['Id'] = potential_id
    
    return clean_obj


def _extract_relationships(record: Dict[str, Any]) -> Dict[str, List[QueryRecord]]:
    """
    Extract relationship data from record, transforming them into a dictionary.
    Key is the relationship name, value is an array of transformed records.
    Only detail relationships (those with 'records' array) are included.
    
    Args:
        record: Raw Salesforce record
        
    Returns:
        Dictionary with relationship names as keys and arrays of QueryRecord as values
    """
    relationships = {}
    
    for key, value in record.items():
        # Process one-to-many relationships (those with 'records' array)
        if _is_detail_relationship_object(value):
            # Transform each record in the relationship
            if "records" in value and isinstance(value["records"], list):
                transformed_records = []
                for rel_record in value["records"]:
                    transformed_record = _transform_record(rel_record)
                    transformed_records.append(transformed_record)
                relationships[key] = transformed_records
        # Handle null subqueries - create empty relationships for UI badges
        elif value is None and _is_likely_relationship_field(key):
            # This is a subquery that returned null (no related records)
            # Create an empty relationship so the UI can show a badge with count 0
            relationships[key] = []
        
        # Skip one-to-one relationships - they are now flattened into fields
    
    return relationships






def _is_relationship_object(value: Any) -> bool:
    """
    Determine if a value is a relationship object
    
    Args:
        value: Value to check
        
    Returns:
        True if the value represents a relationship
    """
    if not isinstance(value, dict):
        return False
    
    # Check for detail records structure
    if "records" in value and isinstance(value["records"], list):
        return True
    
    # Check for single relationship object
    if "attributes" in value and isinstance(value["attributes"], dict):
        return True
    
    return False


def _is_likely_relationship_field(field_name: str) -> bool:
    """
    Determine if a field name is likely a relationship field based on naming patterns.
    This helps identify null subqueries that should be treated as empty relationships.
    
    Args:
        field_name: Name of the field
        
    Returns:
        True if the field is likely a relationship
    """
    # NO HARDCODED LOGIC - Only work with actual response structure
    # This method should not make assumptions about field names
    # Instead, we should rely on the actual data structure to determine relationships
    return False


def _clean_relationship_fields_recursively(records: List[QueryRecord]) -> List[QueryRecord]:
    """
    Clean up relationship fields at all levels by moving them from fields to relationships.
    This ensures consistent data structure where fields only contains data fields
    and relationships only contains relationship fields.
    
    Args:
        records: List of QueryRecord objects
        
    Returns:
        List of cleaned QueryRecord objects
    """
    if not records:
        return records
    
    # Step 1: Identify relationship field names at this level
    relationship_field_names = _identify_relationship_field_names(records)
    
    # Step 2: Clean up each record at this level
    cleaned_records = []
    for record in records:
        cleaned_record = _clean_record_relationship_fields(record, relationship_field_names)
        cleaned_records.append(cleaned_record)
    
    return cleaned_records


def _identify_relationship_field_names(records: List[QueryRecord]) -> set:
    """
    Scan all records at a given level to identify which field names appear as relationships.
    
    Args:
        records: List of QueryRecord objects at the current level
        
    Returns:
        Set of field names that are relationships
    """
    relationship_field_names = set()
    
    for record in records:
        # Add all relationship field names from this record
        if record.relationships:
            relationship_field_names.update(record.relationships.keys())
    
    return relationship_field_names


def _clean_record_relationship_fields(record: QueryRecord, relationship_field_names: set) -> QueryRecord:
    """
    Clean up a single record by moving relationship fields from fields to relationships.
    
    Args:
        record: QueryRecord to clean
        relationship_field_names: Set of field names that are relationships
        
    Returns:
        Cleaned QueryRecord
    """
    # Separate fields into data fields and relationship fields
    data_fields = {}
    relationship_fields = dict(record.relationships)  # Start with existing relationships
    
    for field_name, field_value in record.fields.items():
        if field_name in relationship_field_names:
            # This is a relationship field - move it to relationships
            if field_value is None:
                # Create empty relationship array for null values
                relationship_fields[field_name] = []
            else:
                # This shouldn't happen in normal cases, but handle it
                relationship_fields[field_name] = []
        else:
            # This is a data field - keep it in fields
            data_fields[field_name] = field_value
    
    # Recursively clean up nested relationships
    cleaned_relationships = {}
    for rel_name, rel_records in relationship_fields.items():
        if rel_records:  # Only process if there are actual records
            cleaned_relationships[rel_name] = _clean_relationship_fields_recursively(rel_records)
        else:
            cleaned_relationships[rel_name] = []
    
    # Create new QueryRecord with cleaned data
    return QueryRecord(
        type=record.type,
        fields=data_fields,
        relationships=cleaned_relationships
    )

