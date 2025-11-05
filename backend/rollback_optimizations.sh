#!/bin/bash
# Rollback Script - Restore Original Files

echo "🔄 Rolling back to original files..."

cd /home/user/datapilot/backend

# Check if backups exist
if [ -f "app/ai_agent/workflow/nodes/call_model_node.py.backup" ]; then
    cp app/ai_agent/workflow/nodes/call_model_node.py.backup app/ai_agent/workflow/nodes/call_model_node.py
    echo "✅ Restored call_model_node.py"
else
    echo "⚠️  No backup found for call_model_node.py"
fi

if [ -f "app/ai_agent/workflow/nodes/tool_node.py.backup" ]; then
    cp app/ai_agent/workflow/nodes/tool_node.py.backup app/ai_agent/workflow/nodes/tool_node.py
    echo "✅ Restored tool_node.py"
else
    echo "⚠️  No backup found for tool_node.py"
fi

echo ""
echo "✅ Rollback complete!"
echo "   Restart backend to use original files"
