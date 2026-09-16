# Contributing to DataPilot

Thanks for your interest in contributing! This project has two main parts: a FastAPI backend (`backend/`) and a React/TypeScript dashboard (`dashboard/`).

## Getting Started

- **Backend setup**: see [backend/README.md](backend/README.md)
- **Frontend setup**: see [dashboard/README.md](dashboard/README.md)
- **Docker deployment** (fastest way to run the whole stack): see [docker/README.md](docker/README.md)

## Development Workflow

1. Fork the repository and create a branch from `master` for your change.
2. Make your change. Keep pull requests focused on a single fix or feature.
3. Before opening a PR, verify locally:
   - Backend: the app imports cleanly (`uv run python -c "import app.main"` from `backend/`)
   - Dashboard: `npm run build` passes in `dashboard/`
4. Open a pull request against `master`. CI (backend import smoke-test + dashboard build) runs automatically on every PR.

## Reporting Bugs

Please open an issue using the bug report template and include:
- Steps to reproduce
- What you expected vs. what happened
- Relevant logs (`docker compose logs` if running via Docker)

## Reporting Security Issues

Please do not open a public issue for security vulnerabilities. See [SECURITY.md](SECURITY.md) for how to report them privately.

## Code Style

- Backend: Python, formatted with `black`, linted with `flake8` (see `backend/package.json` scripts)
- Frontend: TypeScript/React, linted with `eslint` (`npm run lint` in `dashboard/`)

## License

By contributing, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).
