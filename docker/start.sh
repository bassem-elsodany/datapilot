#!/bin/bash

# DataPilot Docker Startup Script
# This script provides easy commands to manage the DataPilot application

set -e

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

# Function to check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
}

# Function to check if ports are available
check_ports() {
    local ports=("3001" "8001" "27018")
    for port in "${ports[@]}"; do
        if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
            print_warning "Port $port is already in use. This may cause conflicts."
        fi
    done
}

# Function to start the application
start_app() {
    print_status "Starting DataPilot application..."
    check_docker
    check_ports
    
    # Stop and remove old containers (preserve volumes)
    print_status "Stopping existing containers..."
    docker-compose down
    
    # Build and start services
    docker-compose up --build -d
    
    print_success "DataPilot application started successfully!"
    print_status "Services available at:"
    print_status "  Frontend: http://localhost:3001"
    print_status "  Backend:  http://localhost:8001"
    print_status "  API Docs: http://localhost:8001/docs"
}

# Function to start in development mode
start_dev() {
    print_status "Starting DataPilot in development mode..."
    check_docker
    check_ports
    
    # Stop and remove old containers (preserve volumes)
    print_status "Stopping existing containers..."
    docker-compose -f docker-compose.yml -f docker-compose.dev.yml down
    
    # Build and start services with development overrides
    docker-compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d
    
    print_success "DataPilot development environment started!"
    print_status "Services available at:"
    print_status "  Frontend: http://localhost:3001 (with hot reload)"
    print_status "  Backend:  http://localhost:8001 (with auto-reload)"
    print_status "  API Docs: http://localhost:8001/docs"
}

# Function to stop the application
stop_app() {
    print_status "Stopping DataPilot application..."
    docker-compose down
    print_success "DataPilot application stopped."
}

# Function to restart the application
restart_app() {
    print_status "Restarting DataPilot application..."
    stop_app
    start_app
}

# Function to show logs
show_logs() {
    local service=${1:-""}
    if [ -n "$service" ]; then
        print_status "Showing logs for $service..."
        docker-compose logs -f "$service"
    else
        print_status "Showing logs for all services..."
        docker-compose logs -f
    fi
}

# Function to show status
show_status() {
    print_status "DataPilot application status:"
    docker-compose ps
}

# Function to clean up
cleanup() {
    print_status "Cleaning up DataPilot resources..."
    docker-compose down -v
    docker system prune -f
    print_success "Cleanup completed."
}

# Function to reset data (wipe volumes)
reset_data() {
    print_warning "This will DELETE ALL DATA (connections, master keys, etc.)"
    read -p "Are you sure you want to continue? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_status "Wiping all data and restarting..."
        docker-compose down -v
        docker-compose up --build -d
        print_success "Data reset completed. All data has been wiped."
    else
        print_status "Reset cancelled."
    fi
}

# Function to show help
show_help() {
    echo "DataPilot Docker Management Script"
    echo ""
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  start       Start the application in production mode"
    echo "  dev         Start the application in development mode"
    echo "  stop        Stop the application"
    echo "  restart     Restart the application"
    echo "  logs        Show logs (optionally specify service: backend, dashboard, mongodb)"
    echo "  status      Show application status"
    echo "  cleanup     Stop application and clean up resources"
    echo "  reset       WIPE ALL DATA and restart (DANGEROUS!)"
    echo "  help        Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 start                    # Start in production mode"
    echo "  $0 dev                      # Start in development mode"
    echo "  $0 logs backend             # Show backend logs"
    echo "  $0 status                   # Show all services status"
}

# Main script logic
case "${1:-help}" in
    start)
        start_app
        ;;
    dev)
        start_dev
        ;;
    stop)
        stop_app
        ;;
    restart)
        restart_app
        ;;
    logs)
        show_logs "$2"
        ;;
    status)
        show_status
        ;;
    cleanup)
        cleanup
        ;;
    reset)
        reset_data
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        print_error "Unknown command: $1"
        show_help
        exit 1
        ;;
esac
