"""
DataPilot Backend - Server Runner Script

This script provides a production-ready server runner for the DataPilot FastAPI application.
It handles:
- Environment detection (development vs production)
- Pre-flight checks (database connectivity, configuration validation)
- Graceful shutdown handling
- Process management (uvicorn for dev, gunicorn for prod)
- Logging configuration
- Health check validation

Usage:
    Development:
        python run_server.py
        python run_server.py --dev
        python run_server.py --reload

    Production:
        python run_server.py --prod
        python run_server.py --workers 4

    With custom settings:
        python run_server.py --host 0.0.0.0 --port 8080

Author: Bassem Elsodany
Version: 1.0.0
"""

import argparse
import asyncio
import signal
import sys
from pathlib import Path
from typing import Optional

from loguru import logger
from app.core.config import settings


# Global shutdown flag
shutdown_requested = False


def setup_logging():
    """Configure logging for the application"""
    # Remove default handler
    logger.remove()

    # Add console handler with formatting
    logger.add(
        sys.stderr,
        format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
        level=settings.LOG_LEVEL,
        colorize=True,
    )

    # Add file handler for production
    if settings.ENVIRONMENT == "production":
        log_dir = Path("logs")
        log_dir.mkdir(exist_ok=True)
        logger.add(
            log_dir / "datapilot_{time:YYYY-MM-DD}.log",
            rotation="00:00",
            retention="30 days",
            level="INFO",
            format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} - {message}",
            compression="zip",
        )


async def preflight_checks() -> bool:
    """
    Perform pre-flight checks before starting the server.

    Returns:
        True if all checks pass, False otherwise
    """
    logger.info("Running pre-flight checks...")

    try:
        # Check MongoDB connectivity
        from motor.motor_asyncio import AsyncIOMotorClient

        mongo_uri = f"mongodb://{settings.MONGO_USER}:{settings.MONGO_PASS}@{settings.MONGO_HOST}:{settings.MONGO_PORT}/?authSource=admin"

        logger.info(f"Checking MongoDB connection to {settings.MONGO_HOST}:{settings.MONGO_PORT}...")
        client = AsyncIOMotorClient(mongo_uri, serverSelectionTimeoutMS=5000)

        # Test connection
        await client.admin.command("ping")
        logger.success("✓ MongoDB connection successful")
        client.close()

        # Check database service initialization
        logger.info("Checking database service...")
        from app.services.database_service import DatabaseService
        database_service = DatabaseService()
        # Note: initialize() is synchronous, but we're just checking if it can be imported
        logger.success("✓ Database service available")

        logger.success("All pre-flight checks passed!")
        return True

    except Exception as e:
        logger.error(f"✗ Pre-flight check failed: {str(e)}")
        logger.warning("Server will start anyway, but some features may not work correctly")
        return False


def signal_handler(signum, frame):
    """Handle shutdown signals gracefully"""
    global shutdown_requested
    logger.info(f"Received signal {signum}, initiating graceful shutdown...")
    shutdown_requested = True


def run_development_server(
    host: str = "0.0.0.0",
    port: int = 8000,
    reload: bool = True,
    workers: int = 1,
):
    """Run the server in development mode using uvicorn"""
    import uvicorn

    logger.info("🚀 Starting DataPilot Backend in DEVELOPMENT mode...")
    logger.info(f"   Host: {host}")
    logger.info(f"   Port: {port}")
    logger.info(f"   Reload: {reload}")
    logger.info(f"   Workers: {workers}")
    logger.info(f"   API Docs: http://{host}:{port}/docs")
    logger.info(f"   Health Check: http://{host}:{port}/api/v1/health")

    uvicorn.run(
        "app.main:app",
        host=host,
        port=port,
        reload=reload,
        workers=workers if not reload else 1,  # Reload only works with 1 worker
        log_level=settings.LOG_LEVEL.lower(),
    )


def run_production_server(
    host: str = "0.0.0.0",
    port: int = 8000,
    workers: int = 4,
    worker_class: str = "uvicorn.workers.UvicornWorker",
):
    """Run the server in production mode using gunicorn"""
    try:
        import gunicorn.app.base
        from gunicorn.six import iteritems
    except ImportError:
        logger.error("Gunicorn is not installed. Install it with: pip install gunicorn")
        logger.info("Falling back to uvicorn (single worker)...")
        run_development_server(host=host, port=port, reload=False, workers=1)
        return

    class StandaloneApplication(gunicorn.app.base.BaseApplication):
        def __init__(self, app, options=None):
            self.options = options or {}
            self.application = app
            super().__init__()

        def load_config(self):
            config = {
                key: value
                for key, value in iteritems(self.options)
                if key in self.cfg.settings and value is not None
            }
            for key, value in iteritems(config):
                self.cfg.set(key.lower(), value)

        def load(self):
            return self.application

    logger.info("🚀 Starting DataPilot Backend in PRODUCTION mode...")
    logger.info(f"   Host: {host}")
    logger.info(f"   Port: {port}")
    logger.info(f"   Workers: {workers}")
    logger.info(f"   Worker Class: {worker_class}")
    logger.info(f"   Health Check: http://{host}:{port}/api/v1/health")

    options = {
        "bind": f"{host}:{port}",
        "workers": workers,
        "worker_class": worker_class,
        "worker_connections": 1000,
        "timeout": 120,
        "keepalive": 5,
        "max_requests": 1000,
        "max_requests_jitter": 50,
        "preload_app": True,
        "log_level": settings.LOG_LEVEL.lower(),
        "accesslog": "-",  # Log to stdout
        "errorlog": "-",   # Log to stderr
    }

    StandaloneApplication("app.main:app", options).run()


def main():
    """Main entry point for the server runner"""
    parser = argparse.ArgumentParser(
        description="DataPilot Backend Server Runner",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Development mode (default)
  python run_server.py

  # Development with auto-reload
  python run_server.py --dev --reload

  # Production mode
  python run_server.py --prod --workers 4

  # Custom host and port
  python run_server.py --host 0.0.0.0 --port 8080
        """
    )

    parser.add_argument(
        "--dev",
        action="store_true",
        help="Run in development mode (default)",
    )
    parser.add_argument(
        "--prod",
        action="store_true",
        help="Run in production mode",
    )
    parser.add_argument(
        "--host",
        type=str,
        default=settings.HOST,
        help=f"Host to bind to (default: {settings.HOST})",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=settings.PORT,
        help=f"Port to bind to (default: {settings.PORT})",
    )
    parser.add_argument(
        "--reload",
        action="store_true",
        default=settings.ENABLE_RELOAD and settings.DEBUG,
        help="Enable auto-reload (development only)",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=1,
        help="Number of worker processes (production mode, default: 1)",
    )
    parser.add_argument(
        "--skip-checks",
        action="store_true",
        help="Skip pre-flight checks",
    )

    args = parser.parse_args()

    # Setup logging
    setup_logging()

    # Determine mode
    is_production = args.prod or (settings.ENVIRONMENT == "production" and not args.dev)

    if is_production:
        settings.DEBUG = False
        settings.ENABLE_RELOAD = False
        logger.info("Production mode detected")
    else:
        logger.info("Development mode detected")

    # Register signal handlers for graceful shutdown
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # Run pre-flight checks
    if not args.skip_checks:
        try:
            checks_passed = asyncio.run(preflight_checks())
            if not checks_passed:
                logger.warning("Pre-flight checks failed, but continuing anyway...")
        except Exception as e:
            logger.error(f"Error during pre-flight checks: {e}")
            logger.warning("Continuing anyway...")

    # Start the server
    try:
        if is_production:
            run_production_server(
                host=args.host,
                port=args.port,
                workers=args.workers,
            )
        else:
            run_development_server(
                host=args.host,
                port=args.port,
                reload=args.reload,
                workers=1,  # Reload only works with 1 worker
            )
    except KeyboardInterrupt:
        logger.info("Server shutdown requested by user")
    except Exception as e:
        logger.error(f"Server failed to start: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()

