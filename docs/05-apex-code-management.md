# Apex Code Management

## Table of Contents

- [Overview](#overview)
- [Key Capabilities](#key-capabilities)
  - [Apex Execution](#apex-execution)
  - [Saved Apex & Debug Levels](#saved-apex--debug-levels)
  - [Testing](#testing)
- [Implementation Status](#implementation-status)
  - [Backend API](#backend-api)
  - [Frontend UI](#frontend-ui)
- [Planned](#planned)

## Overview

DataPilot's Apex Code Management gives you a Monaco-powered Apex editor backed by a full set of execution, compilation, and testing endpoints against your connected Salesforce org.

## Key Capabilities

### Apex Execution
- **Anonymous Apex Execution**: Run Apex code against your org via the Salesforce Tooling API and view results/debug output
- **Apex REST Integration**: Execute custom Apex REST endpoints
- **Package & Trigger Compilation**: Compile Apex packages and triggers, and browse existing classes/triggers

### Saved Apex & Debug Levels
- **Saved Apex Snippets**: Create, update, delete, and favorite reusable Apex snippets
- **Debug Level Configuration**: Configure, validate, and inspect debug levels per saved snippet, with a dedicated debug-levels info endpoint

### Testing
- **Test Execution**: Run Apex tests and view results
- **Compile-and-Test Workflow**: Combined compile + test execution in a single call

## Implementation Status

### Backend API
```
Code Input → Salesforce Tooling API → Execution → Result Processing → Response
```
- Anonymous execution, REST integration, package/trigger compilation, test execution, and saved-Apex CRUD (including debug levels) are all implemented — see `backend/app/api/v1/endpoints/salesforce.py` and `backend/app/api/v1/endpoints/saved_apex.py`.

### Frontend UI
- **ApexTab**: Monaco Editor-based code editor, wired to execution/compile/test/saved-Apex endpoints (`dashboard/src/components/query-editor/ApexTab.tsx`)

## Planned
- **Apex Governor Limits Monitoring**: Surface governor limit usage during execution
- **Code Templates**: Pre-built Apex snippets library
- **Version History**: Track changes to saved Apex snippets over time
