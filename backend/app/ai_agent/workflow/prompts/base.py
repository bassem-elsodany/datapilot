"""
Base Prompt Class

This module defines the base Prompt class used by all prompt modules
in the LLM prompts subpackage.
"""

from langfuse import Langfuse
from loguru import logger
from app.core.config import settings
from typing import Optional, Dict, Any, List, Literal


class Prompt:
    """
    Wrapper class for managing prompts with Langfuse versioning and management.
    
    This class provides a unified interface for prompt management, supporting
    Langfuse prompt versioning, labels, and configuration management.
    
    Attributes:
        name: Name identifier for the prompt
        prompt: The actual prompt text content
        prompt_id: Langfuse prompt ID for versioning
    """
    def __init__(self, name: str, prompt: str, prompt_type: Literal["text"] = "text", 
                 labels: Optional[List[str]] = None, config: Optional[Dict[str, Any]] = None) -> None:
        self.name = name
        self.prompt_text = prompt
        self.prompt_type = prompt_type
        self.labels = labels or ["development"]
        self.config = config or {}
        self.prompt_id = None

        try:
            # Initialize Langfuse client for prompt management
            self.langfuse = Langfuse(
                public_key=settings.LANGFUSE_PUBLIC_API_KEY,
                secret_key=settings.LANGFUSE_SECRET_API_KEY,
                host=settings.LANGFUSE_SERVER_URL,
                environment=settings.LANGFUSE_DEFAULT_ENVIRONMENT
            )
            
            # Create or update prompt in Langfuse
            if settings.LANGFUSE_ENABLE_TRACING:
                try:
                    # Create the prompt in Langfuse
                    langfuse_prompt = self.langfuse.create_prompt(
                        name=name,
                        prompt=prompt,
                        type=prompt_type,
                        labels=self.labels,
                        config=self.config
                    )
                    # Store the prompt object for future updates
                    self._langfuse_prompt = langfuse_prompt
                    logger.debug(f"Prompt '{name}' created in Langfuse successfully")
                except Exception as e:
                    logger.warning(f"Failed to create prompt '{name}' in Langfuse: {e}")
                    # Fallback to basic tracking
                    self.langfuse.start_span(
                        name=f"Prompt: {name}",
                        metadata={
                            "prompt_name": name,
                            "prompt_length": len(prompt),
                            "prompt_type": prompt_type,
                            "fallback_mode": True
                        }
                    )
            else:
                logger.debug(f"Prompt '{name}' initialized without Langfuse tracking")
                
        except Exception as e:
            logger.warning(
                f"Can't use Langfuse to manage the prompt '{name}' (probably due to missing or invalid credentials). "
                f"Falling back to local prompt. The prompt is not versioned, but it's still usable. Error: {e}"
            )
            self.langfuse = None

    @property
    def prompt(self) -> str:
        """Get the prompt text content"""
        return self.prompt_text

    def update_prompt(self, new_prompt: str, labels: Optional[List[str]] = None, 
                     config: Optional[Dict[str, Any]] = None) -> bool:
        """Update the prompt content and optionally labels/config"""
        if self.langfuse and settings.LANGFUSE_ENABLE_TRACING and hasattr(self, '_langfuse_prompt'):
            try:
                # For now, we can't update the prompt content in Langfuse, only labels
                # So we'll create a new prompt version
                new_langfuse_prompt = self.langfuse.create_prompt(
                    name=self.name,
                    prompt=new_prompt,
                    type="text",
                    labels=labels or self.labels,
                    config=config or self.config
                )
                self._langfuse_prompt = new_langfuse_prompt
                self.prompt_text = new_prompt
                if labels:
                    self.labels = labels
                if config:
                    self.config = config
                logger.debug(f"Prompt '{self.name}' updated successfully in Langfuse")
                return True
            except Exception as e:
                logger.error(f"Failed to update prompt '{self.name}' in Langfuse: {e}")
                return False
        else:
            # Local update only
            self.prompt_text = new_prompt
            if labels:
                self.labels = labels
            if config:
                self.config = config
            logger.debug(f"Prompt '{self.name}' updated locally")
            return True

    def promote_to_production(self) -> bool:
        """Promote the prompt to production"""
        if self.langfuse and settings.LANGFUSE_ENABLE_TRACING and hasattr(self, '_langfuse_prompt'):
            try:
                # Update labels to include production
                if "production" not in self.labels:
                    self.labels.append("production")
                    # Create a new version with production label
                    new_langfuse_prompt = self.langfuse.create_prompt(
                        name=self.name,
                        prompt=self.prompt_text,
                        type="text",
                        labels=self.labels,
                        config=self.config
                    )
                    self._langfuse_prompt = new_langfuse_prompt
                    logger.debug(f"Prompt '{self.name}' promoted to production")
                    return True
            except Exception as e:
                logger.error(f"Failed to promote prompt '{self.name}' to production: {e}")
                return False
        return False

    def track_usage(self, metadata: Dict[str, Any] | None = None) -> None:
        """Track prompt usage with additional metadata"""
        if self.langfuse and settings.LANGFUSE_ENABLE_TRACING:
            try:
                # Create a span for usage tracking
                self.langfuse.start_span(
                    name=f"Prompt Usage: {self.name}",
                    metadata={
                        "prompt_name": self.name,
                        "prompt_length": len(self.prompt_text),
                        "prompt_type": self.prompt_type,
                        "labels": self.labels,
                        **(metadata if metadata else {})
                    }
                )
            except Exception as e:
                logger.warning(f"Failed to track prompt usage: {e}")

    def get_version_info(self) -> Dict[str, Any]:
        """Get prompt version information"""
        return {
            "name": self.name,
            "prompt_id": self.prompt_id,
            "type": self.prompt_type,
            "labels": self.labels,
            "config": self.config,
            "langfuse_enabled": self.langfuse is not None,
            "length": len(self.prompt_text)
        }

    def __str__(self) -> str:
        return self.prompt

    def __repr__(self) -> str:
        return f"Prompt(name='{self.name}', id='{self.prompt_id}', type='{self.prompt_type}', langfuse_enabled={self.langfuse is not None})"
