"""
Summary Chains for LangGraph Custom ReAct Agent.

This module contains the chains for conversation summarization.
"""

from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from app.core.config import get_chat_model
from app.ai_agent.workflow.prompts.summary_prompts import SummaryPrompts
from app.core.config import settings

class SummaryChains:
    """
    Chains for conversation summarization.
    
    Contains chains that handle the LLM-based conversation summarization process.
    """
    
    @staticmethod
    def get_conversation_summary_chain(summary: str = ""):
        """
        Get the conversation summary chain with appropriate prompt.
        
        Args:
            summary: Existing summary to extend (if any)
            
        Returns:
            LangChain chain for conversation summarization
        """

        model = get_chat_model(temperature=settings.LLM_SUMMARY_TEMPERATURE)
        
        # Use the unified prompt (handles both new and update cases)
        summary_message = SummaryPrompts.get_summary_prompt(summary)
        
        prompt = ChatPromptTemplate.from_messages([
            MessagesPlaceholder(variable_name="messages"),
            ("human", summary_message),
        ])
        
        return prompt | model
