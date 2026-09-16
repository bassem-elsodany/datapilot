.PHONY: install install-dev run test clean lock sync dev format lint check deps update langgraph

# DataPilot Backend Development Commands
# =====================================

# Install production dependencies
install:
	@echo "🚀 Installing DataPilot Backend dependencies..."
	uv sync --no-dev

# Install all dependencies (including dev)
install-dev:
	@echo "🚀 Installing DataPilot Backend with dev dependencies..."
	uv sync

# Install from pyproject.toml (editable install)
install-pyproject:
	@echo "🚀 Installing DataPilot Backend in editable mode..."
	uv pip install -e .

# Install from lock file
sync:
	@echo "🔄 Syncing dependencies from lock file..."
	uv sync

# Generate/update lock file
lock:
	@echo "🔒 Updating lock file..."
	uv lock

# Run the application (development mode)
run:
	@echo "🚀 Starting DataPilot Backend..."
	uv run python run_server.py --dev --reload

# Run the application (production mode)
run-prod:
	@echo "🚀 Starting DataPilot Backend (Production)..."
	uv run python run_server.py --prod --workers 4

# Run tests
test:
	@echo "🧪 Running DataPilot Backend tests..."
	uv run pytest

# Run tests with coverage
test-cov:
	@echo "🧪 Running tests with coverage..."
	uv run pytest --cov=app --cov-report=html --cov-report=term

# Format code with Black
format:
	@echo "🎨 Formatting code with Black..."
	uv run black .

# Lint code with Ruff
lint:
	@echo "🔍 Linting code with Ruff..."
	uv run ruff check .

# Lint and fix code
lint-fix:
	@echo "🔧 Linting and fixing code..."
	uv run ruff check --fix .

# Run all checks (format, lint, test)
check: format lint test
	@echo "✅ All checks passed!"

# Clean virtual environment
clean:
	@echo "🧹 Cleaning virtual environment..."
	rm -rf .venv

# Create new virtual environment
venv:
	@echo "🐍 Creating new virtual environment..."
	uv venv

# Show dependency tree
deps:
	@echo "📦 Dependency tree:"
	uv tree

# Update dependencies
update:
	@echo "⬆️ Updating dependencies..."
	uv lock --upgrade
	uv sync

# LangGraph specific commands
langgraph-dev:
	@echo "🧠 Starting LangGraph development server..."
	uv run langgraph dev

# LangGraph deploy
langgraph-deploy:
	@echo "🚀 Deploying LangGraph workflow..."
	uv run langgraph deploy

# Show help
help:
	@echo "DataPilot Backend Development Commands"
	@echo "====================================="
	@echo ""
	@echo "Installation:"
	@echo "  install        Install production dependencies"
	@echo "  install-dev    Install with development dependencies"
	@echo "  sync           Sync from lock file"
	@echo ""
	@echo "Development:"
	@echo "  run            Start development server"
	@echo "  run-prod       Start production server"
	@echo "  dev            Alias for run"
	@echo ""
	@echo "Testing:"
	@echo "  test           Run tests"
	@echo "  test-cov       Run tests with coverage"
	@echo ""
	@echo "Code Quality:"
	@echo "  format         Format code with Black"
	@echo "  lint           Lint code with Ruff"
	@echo "  lint-fix       Lint and fix code"
	@echo "  check          Run all checks (format, lint, test)"
	@echo ""
	@echo "AI/ML:"
	@echo "  langgraph-dev  Start LangGraph development server"
	@echo "  langgraph-deploy Deploy LangGraph workflow"
	@echo ""
	@echo "Utilities:"
	@echo "  deps           Show dependency tree"
	@echo "  update         Update dependencies"
	@echo "  clean          Clean virtual environment"
	@echo "  venv           Create new virtual environment"
	@echo "  help           Show this help"

# Alias for run
dev: run
