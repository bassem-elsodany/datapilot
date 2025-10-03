#!/bin/bash

# DataPilot Backend Development Startup Script
# ===========================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if uv is installed
check_uv() {
    if ! command -v uv &> /dev/null; then
        print_error "uv is not installed. Please install uv first:"
        print_error "curl -LsSf https://astral.sh/uv/install.sh | sh"
        exit 1
    fi
}

# Check if virtual environment exists
check_venv() {
    if [ ! -d ".venv" ]; then
        print_warning "Virtual environment not found. Creating one..."
        uv venv
        print_success "Virtual environment created!"
    fi
}

# Check if dependencies are installed
check_deps() {
    if [ ! -f ".venv/pyvenv.cfg" ] || [ ! -d ".venv/lib" ]; then
        print_warning "Dependencies not installed. Installing..."
        uv sync
        print_success "Dependencies installed!"
    fi
}

# Export uv to PATH
export PATH="$HOME/.local/bin:$PATH"

# Check prerequisites
print_status "Checking prerequisites..."
check_uv
check_venv
check_deps

# Activate virtual environment
print_status "Activating virtual environment..."
source .venv/bin/activate

# Start the server with uv
print_success "🚀 Starting DataPilot Backend with uv..."
print_status "Backend will be available at: http://localhost:8000"
print_status "API Documentation: http://localhost:8000/docs"
print_status "Press Ctrl+C to stop the server"

uv run python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
