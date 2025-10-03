"""
Summary Prompts for LangGraph Custom ReAct Agent.

This module contains the prompts for conversation summarization.
"""

from app.ai_agent.workflow.prompts.base import Prompt


class SummaryPrompts:
    """
    Prompts for conversation summarization.
    
    Contains prompts that guide the LLM to create intelligent conversation summaries
    for context-aware future interactions.
    """
    
    SUMMARY_PROMPT = Prompt(
        name="conversation_summary_prompt",
        prompt="""You are a Salesforce conversation memory agent. Output ONE compact JSON (≤1200 chars) that captures only Salesforce‑relevant context for future turns.

Return exactly these keys when non-empty:
{{
  "object_resolution": {{
    "api_names": [],
    "label_mappings": {{}},
    "child_relationships": [],
    "lookup_relationships": []
  }},
  "field_discoveries": [],
  "technical_context": {{
    "successful_queries": [],
    "common_field_combinations": [],
    "limitations": []
  }}
}}

Rules:
- Strict JSON only (no markdown/comments).
- Use true API names and relationship *query* names.
- Max items: api_names 3; label_mappings 5; child_relationships 3; lookup_relationships 3; field_discoveries 5; successful_queries 3; common_field_combinations 3; limitations 3.
- Prefer the most recent, reusable facts; omit guesses and prose.
""",
        labels=["summary", "conversation", "context"]
    )
    
    @classmethod
    def get_summary_prompt(cls, existing_summary: str = "") -> str:
        """Get the conversation summary prompt (handles both new and update cases)."""
        base_prompt = cls.SUMMARY_PROMPT.prompt

        # Truncate oversized existing summaries to reduce tokens
        MAX_EXISTING = 2000
        trimmed_summary = (existing_summary[-MAX_EXISTING:]).strip() if len(existing_summary) > MAX_EXISTING else existing_summary.strip()
        # Escape curly braces in the existing summary for LangChain's ChatPromptTemplate
        escaped_summary = trimmed_summary.replace("{", "{{").replace("}", "}}")

        if existing_summary:
            task_section = f"""
EXISTING SUMMARY:
{escaped_summary}

TASK: Update the JSON (merge in only new, higher-signal items; remove outdated facts). Respect all list caps.

"""
        else:
            task_section = """
TASK: Create the JSON from the conversation. Respect all list caps.

"""

        return base_prompt + task_section
