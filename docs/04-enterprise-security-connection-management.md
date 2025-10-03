# Enterprise Security & Connection Management

## Table of Contents

- [Overview](#overview)
- [Key Capabilities](#key-capabilities)
  - [Master Key Security System](#master-key-security-system)
  - [Connection Management](#connection-management)
  - [Authentication Flow](#authentication-flow)
- [Technical Architecture](#technical-architecture)
  - [Security Engine](#security-engine)
  - [Core Components](#core-components)
- [Feature Documentation](#feature-documentation)
  - [Master Key Management](#1-master-key-management)
  - [Connection Lifecycle Management](#2-connection-lifecycle-management)
  - [Authentication Flow](#3-authentication-flow)
  - [Security Implementation](#4-security-implementation)
  - [Internationalization (i18n)](#5-internationalization-i18n)
- [Performance Metrics](#performance-metrics)
- [Security and Permissions](#security-and-permissions)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

DataPilot's Enterprise Security & Connection Management system provides military-grade encryption and comprehensive connection lifecycle management. The system uses SHA-256 hashing with salt for master key security, AES-256 encryption for connection credentials, and MongoDB for secure data persistence. This unified system ensures that all sensitive data is protected while managing multiple Salesforce connections with advanced security controls.

## Demo Video

![Enterprise Security & Connection Management Demo](../imgs/security-connection/enterprise-security-connection-management-demo.gif)

## Key Capabilities

### Master Key Security System
- **SHA-256 Hashing**: Secure master key hashing with cryptographically secure salt
- **MongoDB Storage**: Server-side master key storage with single active key constraint
- **Session Management**: In-memory master key validation for current session
- **Key Validation**: Real-time master key validation with strength requirements (minimum 8 characters)
- **Zero-Knowledge Architecture**: Server never stores plaintext master keys

### Connection Management
- **AES-256 Encryption**: Military-grade encryption for all connection credentials
- **Credential Storage**: Secure storage of username, password, security tokens, and OAuth credentials
- **Connection Lifecycle**: Complete CRUD operations for connection management
- **Multi-Environment Support**: Production and sandbox environment support
- **Connection Testing**: Real-time credential validation before saving

### Authentication Flow
- **Smart Authentication**: Intelligent authentication flow with master key validation
- **Connection Selection**: Saved connections management with visual interface
- **Session Persistence**: Secure session management with master key validation
- **Authentication States**: Multiple authentication states (checking, masterKey, sessions, main)

### Internationalization (i18n)
- **Multi-Language Support**: English (EN) and French (FR) language support
- **Dynamic Translation**: Real-time language switching without page reload
- **Translation Management**: Easy addition of new languages and translations
- **Localized UI**: All user interface elements translated and localized
- **Error Messages**: Internationalized error messages and validation feedback

## Technical Architecture

### Security Engine
```
User Input → Master Key Validation → SHA-256 Hashing → MongoDB Storage → Session Management
```

### Core Components
- **MasterKeyService**: SHA-256 hashing with salt, MongoDB persistence
- **ConnectionService**: AES-256 encryption for credentials, connection lifecycle
- **SavedConnectionsManager**: Connection management UI with visual cards
- **MasterKeyManager**: Master key creation and validation UI
- **SmartAuthenticationFlow**: Authentication flow orchestration
- **I18nService**: Multi-language translation service with real-time switching

## Feature Documentation

### 1. Master Key Management

#### Overview
The Master Key system provides secure key creation, validation, and lifecycle management using SHA-256 hashing with cryptographically secure salt and MongoDB persistence.

#### Key Creation Process
1. **User Input**: User provides master key input (minimum 8 characters)
2. **Strength Validation**: Frontend validation for key length and requirements
3. **Salt Generation**: Cryptographically secure random salt (32 bytes)
4. **SHA-256 Hashing**: Hash master key with salt using SHA-256
5. **MongoDB Storage**: Store hashed key and salt in MongoDB with UUID
6. **Session Management**: Store plaintext key in memory for current session

#### Key Management Features
- **Single Active Key**: Only one master key can be active at a time
- **Key Validation**: Real-time validation against stored hash
- **Key Reset**: Complete key reset with data cleanup (connections become unrecoverable)
- **Key Deletion**: Hard delete master key and all related data (cascade delete)
- **Session Security**: Master key never persisted across browser reloads

#### UI Components (MasterKeyManager.tsx)
- **Key Input Field**: Real-time strength validation and feedback
- **Strength Indicators**: Visual feedback for key requirements
- **Error Handling**: Comprehensive error messages and validation
- **Reset Functionality**: Key reset with data cleanup warnings
- **Translation Support**: Internationalized error messages and UI text

### 2. Connection Lifecycle Management

#### Overview
The connection management system provides comprehensive connection CRUD operations with AES-256 encryption, credential storage, and connection testing.

#### Connection Creation Process
1. **Credential Input**: User enters Salesforce credentials and connection details
2. **Master Key Validation**: Validate master key for encryption operations
3. **Credential Testing**: Test Salesforce credentials before saving
4. **AES-256 Encryption**: Encrypt all sensitive credential data
5. **MongoDB Storage**: Store encrypted credentials with metadata
6. **Connection UUID**: Generate unique UUID for connection identification

#### Connection Management Features
- **Encrypted Storage**: All credentials encrypted with AES-256
- **Connection Testing**: Real-time credential validation
- **Multi-Environment**: Support for production and sandbox environments
- **OAuth Support**: Consumer key/secret and client ID/secret support
- **Security Tokens**: Salesforce security token handling
- **Connection Metadata**: Display name, creation date, last used tracking

#### UI Components (SavedConnectionsManager.tsx)
- **Connection Cards**: Visual connection cards with metadata display
- **Connection Actions**: Connect, test, rename, delete operations
- **Modal Interface**: Connection creation and editing modals
- **Status Indicators**: Connection status and health indicators
- **Error Handling**: Comprehensive error messages and validation

### 3. Authentication Flow

#### Overview
Intelligent authentication orchestration with master key validation, connection selection, and session management.

#### Key Features
- **Smart Authentication States**: Checking → MasterKey → Sessions → Main
- **Master Key Validation**: Secure master key validation and session management
- **Connection Selection**: Visual saved connections interface
- **Session Management**: Secure session creation and persistence
- **Error Handling**: Comprehensive authentication error handling and recovery

### 4. Security Implementation

#### Encryption Implementation
- **Master Key Hashing**: SHA-256 with cryptographically secure salt
- **Connection Encryption**: AES-256 encryption for all credential data
- **Key Derivation**: PBKDF2 key derivation from master key
- **Salt Generation**: 32-byte cryptographically secure random salt
- **IV Management**: Secure initialization vector generation

#### Security Features
- **Server-Side Encryption**: All encryption performed on backend
- **Master Key Authentication**: All operations require master key validation
- **Data Isolation**: Connection data isolated by master key
- **Audit Trail**: Complete operation logging and monitoring
- **Session Security**: Master key never persisted in browser storage

#### Backend API Endpoints
- **POST /master-key**: Create/validate master key
- **PUT /master-key**: Reset master key with data cleanup
- **DELETE /master-key**: Delete master key and all related data
- **POST /connections**: Create encrypted connection
- **GET /connections**: List all connections with metadata
- **GET /connections/{uuid}**: Get connection with decrypted credentials
- **DELETE /connections/{uuid}**: Delete connection with secure cleanup

### 5. Internationalization (i18n)

#### Overview
Multi-language support for the Enterprise Security & Connection Management feature with real-time translation switching.

#### Key Features
- **Multi-Language Support**: English (EN) and French (FR) with easy future language addition
- **Real-Time Translation**: Instant language switching without page reload
- **Complete Localization**: All UI elements, error messages, and validation feedback translated
- **Translation Management**: Easy addition of new languages through translation files
- **Performance Optimization**: Translation caching and lazy loading for fast access
- **Fallback System**: Automatic English fallback for missing translations

## Performance Metrics

### Key Performance Indicators
- **Security Operations**: < 200ms for encryption and validation
- **Connection Management**: < 3 seconds for connection operations
- **Translation System**: < 100ms for language switching
- **Database Operations**: < 500ms for MongoDB operations
- **System Efficiency**: Optimized memory, CPU, and network usage

## Security and Permissions

### Data Security
- **Master Key Protection**: SHA-256 hashing with secure salt
- **Credential Encryption**: AES-256 encryption for all sensitive data
- **Session Security**: Master key never persisted in browser
- **Database Security**: Encrypted storage in MongoDB
- **Access Control**: Master key-based authentication for all operations

### Permission Management
- **Master Key Validation**: All operations require master key validation
- **Connection Isolation**: Connection data isolated by master key
- **Session Management**: Secure session creation and validation
- **Data Cleanup**: Secure deletion of all related data
- **Audit Trail**: Complete operation logging and monitoring

## Best Practices

### Master Key Management
1. **Use Strong Keys**: Minimum 8 characters with mixed character types
2. **Never Share Keys**: Master keys should never be shared or stored in plaintext
3. **Regular Validation**: Validate master key on every session
4. **Secure Storage**: Master key never persisted in browser storage

### Connection Management
1. **Test Credentials**: Always test credentials before saving connections
2. **Use Descriptive Names**: Use meaningful display names for connections
3. **Regular Cleanup**: Remove unused connections to maintain security
4. **Monitor Usage**: Track connection usage and performance

### Security
1. **Master Key Security**: Protect master key as the root of all security
2. **Credential Protection**: All credentials encrypted with AES-256
3. **Session Management**: Secure session handling with master key validation
4. **Data Cleanup**: Secure deletion of all related data when needed

### Internationalization
1. **Language Selection**: Choose appropriate language for your user base
2. **Translation Quality**: Ensure high-quality translations for all supported languages
3. **Fallback Handling**: Always provide English fallback for missing translations
4. **Performance**: Use translation caching for optimal performance
5. **Testing**: Test all features in all supported languages

## Troubleshooting

### Common Security Issues
- **Master Key Validation Errors**: Check key strength and format
- **Encryption Failures**: Verify master key is set and valid
- **Session Timeouts**: Check master key validation and session state
- **Access Denied**: Verify master key authentication

### Connection Issues
- **Connection Failures**: Check Salesforce credentials and network connectivity
- **Encryption Errors**: Verify master key is set and valid
- **Storage Issues**: Check MongoDB connection and database state
- **Authentication Errors**: Verify master key validation and session state

### Performance Issues
- **Slow Encryption**: Monitor system resources and MongoDB performance
- **Key Validation Delays**: Check SHA-256 hashing performance
- **Database Operations**: Monitor MongoDB connection and query performance
- **Session Creation**: Check authentication flow and connection testing

### Security Incidents
- **Master Key Compromise**: Implement key reset and data cleanup
- **Unauthorized Access**: Review master key validation and session security
- **Data Breach**: Follow incident response procedures and data cleanup
- **Compliance Issues**: Review security controls and audit trails

---

*This documentation provides comprehensive guidance for using the Enterprise Security & Connection Management feature, including technical details, best practices, and troubleshooting information based on the actual implementation.*
