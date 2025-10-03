"""
Settings API Endpoints - REST Compliant

This module provides RESTful API endpoints for retrieving application settings and configuration values.
The UI sends the exact config key, and if it exists in config.py, we return the value; otherwise return 404.

Features:
- Get specific setting values by exact config key
- Direct access to config.py attributes
- Simple 404 for non-existent keys
- REST-compliant endpoint structure

REST-Compliant Endpoints:
- GET /settings/{config_key} - Get specific setting by exact config key

Author: Bassem Elsodany
GitHub: https://github.com/bassem-elsodany
LinkedIn: https://www.linkedin.com/in/bassem-elsodany/
Version: 1.0.0
License: MIT License
"""

from typing import Any
from fastapi import APIRouter, HTTPException, status, Query, Request
from pydantic import BaseModel, Field

from app.services.error_service import ErrorService
from app.core.config import settings

from loguru import logger

router = APIRouter()

# Pydantic models for request/response
class SettingResponse(BaseModel):
    key: str = Field(..., description="Config key")
    value: Any = Field(..., description="Config value")

@router.get("/{config_key}", response_model=SettingResponse, status_code=status.HTTP_200_OK)
def get_setting(
    config_key: str,
    lang: str = Query("en", description="Language code for messages"),
    request: Request = None
):
    """Get a specific setting value by exact config key"""
    try:        
        # Check if the config key exists
        if not hasattr(settings, config_key):
            logger.warning(f"Config key '{config_key}' not found")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Config key '{config_key}' not found"
            )
        
        value = getattr(settings, config_key)
        
        return SettingResponse(
            key=config_key,
            value=value
        )
        
    except HTTPException:
        # Re-raise HTTP exceptions (like 404)
        raise
    except Exception as e:
        logger.error(f"Error retrieving config key {config_key}: {str(e)}")
        ErrorService.raise_external_service_error(
            message="settings.errors.retrieval_failed",
            service_name="Settings",
            service_endpoint=f"/settings/{config_key}",
            details=str(e),
            request=request,
            locale=lang
        )
