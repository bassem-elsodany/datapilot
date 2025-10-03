"""
Summary Node for LangGraph-style ReAct Agent.

This node creates a conversation summary for context-aware future interactions.
Runs after the conversation ends to capture key information and outcomes using LLM.
"""

from typing import Dict, Any
from loguru import logger
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

from app.ai_agent.workflow.state import WorkflowState
from app.ai_agent.workflow.chains.summary_chains import SummaryChains
from app.ai_agent.workflow.schemas.summary_schema import StructuredConversationSummary

# --- Summarization compaction settings ---
MAX_MESSAGES_FOR_SUMMARY = 40        # keep only most recent messages
MAX_MSG_CHARS = 1500                 # hard cap per message after compaction
HEAD_KEEP = 1000
TAIL_KEEP = 300

def _collapse_code_blocks(text: str) -> str:
    """
    Collapse very large fenced code blocks to placeholders to cut tokens.
    Example placeholder: ```[BLOCK ~2048 chars collapsed]```
    """
    if not text or "```" not in text:
        return text
    parts = text.split("```")
    out = []
    for i, seg in enumerate(parts):
        if i % 2 == 1:  # inside a code fence
            # optionally capture language hint in first line
            first_nl = seg.find("\n")
            lang = seg[:first_nl] if first_nl != -1 else ""
            body = seg[first_nl+1:] if first_nl != -1 else ""
            if len(body) > 800:
                out.append(f"```{lang}\n[BLOCK ~{len(body)} chars collapsed]```")
            else:
                out.append("```" + seg + "```")
        else:
            out.append(seg)
    return "".join(out)

def _truncate_head_tail(text: str, max_len: int = MAX_MSG_CHARS) -> str:
    if not text or len(text) <= max_len:
        return text
    head = text[:HEAD_KEEP]
    tail = text[-TAIL_KEEP:]
    return f"{head}\n… [truncated {len(text) - (HEAD_KEEP + TAIL_KEEP)} chars] …\n{tail}"


async def summary_node(state: WorkflowState) -> Dict[str, Any]:
    """
    Create a conversation summary for context-aware future interactions using LLM.
    
    This node runs after the conversation ends to capture:
    1. User's original request
    2. Key objects/fields discussed
    3. Main outcomes and findings
    4. Any clarifications or decisions made
    
    Args:
        state: Current workflow state
        
    Returns:
        Dict with updated conversation summary
    """
    logger.debug("Summary node started")
    
    try:
        # Get conversation context
        messages = state.get("messages", [])
        messages = messages[-MAX_MESSAGES_FOR_SUMMARY:]
        conversation = state.get("conversation", {})
        existing_summary = conversation.get("summary", "")
        
        # Convert dict summary to JSON string for LLM
        import json
        if isinstance(existing_summary, dict):
            existing_summary = json.dumps(existing_summary, indent=2)
        
        # Get the summary chain
        summary_chain = SummaryChains.get_conversation_summary_chain(existing_summary or "")
        
        # Filter and prepare messages for summary
        # Only use AI and human messages for summary (skip tool messages to avoid LLM errors)
        # Let the LLM handle out-of-scope detection naturally
        prepared_messages = []
        i = 0
        while i < len(messages):
            msg = messages[i]
            
            if isinstance(msg, dict):
                if msg.get('type') == 'human':
                    human_content = _truncate_head_tail(_collapse_code_blocks(msg.get('content', '')))
                    prepared_messages.append(HumanMessage(content=human_content))
                elif msg.get('type') == 'ai':
                    # Only include AI messages without tool calls
                    content = msg.get('content', '')
                    if content and not msg.get('tool_calls'):
                        compacted = _truncate_head_tail(_collapse_code_blocks(content))
                        prepared_messages.append(AIMessage(content=compacted))
            else:
                # For non-dict messages, only include AI and human messages without tool calls
                if hasattr(msg, 'type') and msg.type in ['ai', 'human']:
                    # Skip AI messages with tool calls
                    if msg.type == 'ai' and hasattr(msg, 'tool_calls') and msg.tool_calls:
                        i += 1
                        continue
                    raw = getattr(msg, 'content', '')
                    compacted = _truncate_head_tail(_collapse_code_blocks(raw))
                    if msg.type == 'ai':
                        prepared_messages.append(AIMessage(content=compacted))
                    elif msg.type == 'human':
                        prepared_messages.append(HumanMessage(content=compacted))
                    else:
                        # skip other types
                        pass
            
            i += 1
        
        # Create the input for the summary chain
        chain_input = {
            "messages": prepared_messages,
        }
        
        # Generate summary using LLM
        response = await summary_chain.ainvoke(chain_input)

        # Extract and parse the summary content as JSON if possible
        import json
        conversation_summary = None
        if hasattr(response, 'content'):
            content = response.content
        else:
            content = str(response)

        try:
            if isinstance(content, dict):
                conversation_summary = content
            elif isinstance(content, str):
                conversation_summary = json.loads(content)
            else:
                # Convert other types to string first
                conversation_summary = json.loads(str(content))

            # validate against schema
            try:
                validated = StructuredConversationSummary.parse_obj(conversation_summary)
                conversation_summary = validated.dict()
                logger.debug(f"Created LLM-based conversation summary (validated JSON): {str(conversation_summary)[:100]}...")
            except Exception as e:
                logger.warning(f"Summary JSON did not match schema: {e}; using unvalidated JSON")
                # Still use the JSON structure even if validation failed
                logger.debug(f"Unvalidated summary structure: {str(conversation_summary)[:100]}...")
        except json.JSONDecodeError as e:
            logger.error(f"Summary content was not valid JSON: {e}; cannot use summary")
            conversation_summary = None

        # Update the conversation summary in state
        result = {
            "conversation": {
                "summary": conversation_summary
            }
        }

        return result
        
    except Exception as e:
        logger.error(f"Error in summary node: {e}")
        # Return fallback summary on error
        user_input = state.get("request", {}).get("user_input", "")
        fallback_summary = f"User asked: {user_input}" if user_input else "Conversation summary error"
        
        return {
            "conversation": {
                "summary": fallback_summary
            }
        }
