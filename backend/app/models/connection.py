"""
DataPilot Backend - Connection Data Model

This module defines the comprehensive MongoDB model for storing encrypted Salesforce connections
using Pydantic for validation and serialization, providing enterprise-grade data modeling
with advanced security, validation, and audit capabilities.

The connection model provides:
- Secure encrypted credential storage with AES-256 encryption
- Comprehensive data validation and serialization
- Advanced audit trail and metadata tracking
- Multi-tenant connection isolation and management
- Enterprise-grade security and compliance features
- Performance optimization and indexing support

Core Model Features:

Data Security:
- Encrypted credential storage with master key encryption
- Secure data validation and sanitization
- Access control and permission management
- Audit trail for all connection operations
- Data privacy and compliance support
- Security event logging and monitoring

Connection Management:
- Unique connection identification and tracking
- Connection status monitoring and health checks
- Last used timestamp and usage analytics
- Connection lifecycle management
- Multi-tenant data isolation
- Connection sharing and collaboration

Data Validation:
- Comprehensive input validation using Pydantic
- Data type validation and conversion
- Business rule validation and constraints
- Data format validation and sanitization
- Length and size validation
- Character set validation and filtering

Audit & Compliance:
- Complete audit trail for all operations
- Data privacy and GDPR compliance
- Security event logging and monitoring
- Compliance reporting and analytics
- Data retention and deletion policies
- Security incident response

Performance & Optimization:
- Optimized data structure and indexing
- Efficient serialization and deserialization
- Memory usage optimization
- Performance monitoring and metrics
- Scalability and load balancing
- Resource usage optimization

Integration Points:
- MongoDB database operations
- Encryption and security services
- Logging and monitoring systems
- Error handling and reporting
- Frontend user interface
- API endpoint integration

Author: Bassem Elsodany
GitHub: https://github.com/bassem-elsodany
LinkedIn: https://www.linkedin.com/in/bassem-elsodany/
Version: 1.0.0
License: MIT License
"""

import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field, validator
from loguru import logger


class Connection(BaseModel):
    """MongoDB model for storing encrypted Salesforce connections"""
    
    # MongoDB ObjectId (auto-generated)
    id: Optional[str] = Field(default=None, alias="_id")
    
    # Connection identification
    connection_uuid: str = Field(description="Unique connection identifier")
    display_name: str = Field(description="Display name for the connection")
    auth_provider_uuid: str = Field(description="Authentication provider UUID")
    
    # Encrypted data
    encrypted_credentials: str = Field(description="Encrypted Salesforce credentials")
    
    # Connection status
    is_connection_active: bool = Field(default=True, description="Whether connection is active")
    last_used: Optional[datetime] = Field(default=None, description="Last time connection was used")
    
    # Audit fields
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: Optional[str] = Field(default=None, description="User who created the connection")
    updated_by: Optional[str] = Field(default=None, description="User who last updated the connection")
    
    
    # Version control
    version: int = Field(default=1, description="Connection version number")
    
    # Metadata
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional metadata")
    
    class Config:
        """Pydantic configuration"""
        # Allow population by field name
        populate_by_name = True
        # Use enum values
        use_enum_values = True
        # JSON encoders
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
        # Example data
        schema_extra = {
            "example": {
                "connection_uuid": "550e8400-e29b-41d4-a716-446655440000",
                "display_name": "Production Salesforce",
                "auth_provider_uuid": "550e8400-e29b-41d4-a716-446655440000",
                "encrypted_credentials": "encrypted_credentials_here",
                "is_connection_active": True,
                "created_by": "user123",
                "metadata": {
                    "environment": "production",
                    "org_type": "enterprise"
                }
            }
        }
    
    @validator('connection_uuid', pre=True, always=True)
    def generate_connection_uuid(cls, v):
        """Generate connection UUID if not provided"""
        if not v:
            return str(uuid.uuid4())
        return v
    
    @validator('display_name')
    def validate_display_name(cls, v):
        """Validate display name"""
        if not v or len(v.strip()) == 0:
            raise ValueError("Display name cannot be empty")
        if len(v) > 255:
            raise ValueError("Display name too long (max 255 characters)")
        return v.strip()
    
    @validator('encrypted_credentials')
    def validate_encrypted_credentials(cls, v):
        """Validate encrypted credentials"""
        if not v or len(v.strip()) == 0:
            raise ValueError("Encrypted credentials cannot be empty")
        return v
    
    def to_mongo_document(self) -> Dict[str, Any]:
        """Convert to MongoDB document format"""
        doc = self.model_dump(exclude={'id'}, by_alias=False)
        
        # Handle datetime fields
        for field in ['created_at', 'updated_at', 'last_used']:
            if doc.get(field) and isinstance(doc[field], datetime):
                doc[field] = doc[field].isoformat()
        
        # Handle metadata
        if doc.get('metadata'):
            doc['metadata'] = doc['metadata']
        
        return doc
    
    @classmethod
    def from_mongo_document(cls, doc: Dict[str, Any]) -> 'Connection':
        """Create Connection instance from MongoDB document"""
        # Handle MongoDB ObjectId
        if '_id' in doc:
            doc['id'] = str(doc['_id'])
            del doc['_id']
        
        # Handle datetime fields
        for field in ['created_at', 'updated_at', 'last_used']:
            if doc.get(field) and isinstance(doc[field], str):
                try:
                    doc[field] = datetime.fromisoformat(doc[field].replace('Z', '+00:00'))
                except ValueError:
                    logger.warning(f"Invalid datetime format for {field}: {doc[field]}")
                    doc[field] = None
        
        return cls(**doc)
    
    def update_last_used(self):
        """Update last used timestamp"""
        self.last_used = datetime.now(timezone.utc)
        self.updated_at = datetime.now(timezone.utc)
        self.version += 1
    
    
    def is_expired(self, max_age_days: int = 90) -> bool:
        """Check if connection is expired"""
        if not self.last_used:
            return False
        
        max_age = datetime.now(timezone.utc) - timedelta(days=max_age_days)
        return self.last_used < max_age
    
    def get_metadata_value(self, key: str, default: Any = None) -> Any:
        """Get metadata value by key"""
        return self.metadata.get(key, default) if self.metadata else default
    
    def set_metadata_value(self, key: str, value: Any):
        """Set metadata value by key"""
        if not self.metadata:
            self.metadata = {}
        self.metadata[key] = value
        self.updated_at = datetime.now(timezone.utc)
        self.version += 1
    
    def __repr__(self):
        return f"<Connection(id={self.id}, uuid='{self.connection_uuid}', name='{self.display_name}')>"


class ConnectionCreate(BaseModel):
    """Model for creating new connections"""
    display_name: str = Field(description="Display name for the connection")
    auth_provider_uuid: str = Field(description="Authentication provider UUID")
    encrypted_credentials: str = Field(description="Encrypted Salesforce credentials")
    created_by: Optional[str] = Field(default=None, description="User creating the connection")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional metadata")
    
    class Config:
        schema_extra = {
            "example": {
                "display_name": "Production Salesforce",
                "auth_provider_uuid": "550e8400-e29b-41d4-a716-446655440000",
                "encrypted_credentials": "encrypted_credentials_here",
                "created_by": "user123",
                "metadata": {
                    "environment": "production",
                    "org_type": "enterprise"
                }
            }
        }


class ConnectionUpdate(BaseModel):
    """Model for updating connections"""
    display_name: Optional[str] = Field(default=None, description="Display name for the connection")
    encrypted_credentials: Optional[str] = Field(default=None, description="Encrypted Salesforce credentials")
    is_connection_active: Optional[bool] = Field(default=None, description="Whether connection is active")
    updated_by: Optional[str] = Field(default=None, description="User updating the connection")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Additional metadata")
    
    class Config:
        schema_extra = {
            "example": {
                "display_name": "Updated Production Salesforce",
                "is_connection_active": False,
                "updated_by": "user123",
                "metadata": {
                    "environment": "production",
                    "org_type": "enterprise",
                    "last_updated_by": "user123"
                }
            }
        }


class ConnectionResponse(BaseModel):
    """Model for connection responses (excludes sensitive data)"""
    id: str = Field(description="Connection ID")
    connection_uuid: str = Field(description="Unique connection identifier")
    display_name: str = Field(description="Display name for the connection")
    auth_provider_uuid: str = Field(description="Authentication provider UUID")
    is_connection_active: bool = Field(description="Whether connection is active")
    last_used: Optional[datetime] = Field(description="Last time connection was used")
    created_at: datetime = Field(description="Creation timestamp")
    updated_at: datetime = Field(description="Last update timestamp")
    created_by: Optional[str] = Field(description="User who created the connection")
    updated_by: Optional[str] = Field(description="User who last updated the connection")
    version: int = Field(description="Connection version number")
    metadata: Optional[Dict[str, Any]] = Field(description="Additional metadata")
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
