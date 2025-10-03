// ========================================
// AUTHENTICATION PROVIDER DOMAIN MODEL
// ========================================

import { BaseEntity, BaseEntityModel } from './BaseEntity';

/**
 * AUTH_PROVIDER - Authentication Provider Configuration
 * Purpose: Support multiple authentication methods for sessions
 * Lifecycle: Configurable and extensible
 */
export interface AuthProvider extends BaseEntity {
  id: string; // Unique provider identifier
  name: string; // Human-readable name
  type: 'OAUTH2' | 'JWT' | 'API_KEY' | 'CUSTOM';
  description?: string;
  isActive: boolean;
  config: Record<string, any>; // Flexible configuration storage
  metadata?: Record<string, any>; // Additional provider metadata
}

/**
 * CONNECTION_AUTH_PROVIDER - Connection Authentication Provider Mapping
 * Purpose: Link connections to their authentication providers
 * Lifecycle: Created when connection is authenticated
 */
export interface ConnectionAuthProvider extends BaseEntity {
  connectionUuid: string; // Foreign key to connections table
  authProviderId: string; // Foreign key to auth_providers table
  credentials: Record<string, any>; // Encrypted credentials for this provider
  isActive: boolean;
  lastUsed?: Date;
  expiresAt?: Date;
}

export interface CreateAuthProviderRequest {
  id: string;
  name: string;
  type: 'OAUTH2' | 'JWT' | 'API_KEY' | 'CUSTOM';
  description?: string;
  config: Record<string, any>;
  metadata?: Record<string, any>;
  createdBy?: string;
}

export interface UpdateAuthProviderRequest {
  name?: string;
  description?: string;
  isActive?: boolean;
  config?: Record<string, any>;
  metadata?: Record<string, any>;
  updatedBy?: string;
}

export interface CreateConnectionAuthProviderRequest {
  connectionUuid: string;
  authProviderId: string;
  credentials: Record<string, any>;
  expiresAt?: Date;
  createdBy?: string;
}

export interface UpdateConnectionAuthProviderRequest {
  credentials?: Record<string, any>;
  isActive?: boolean;
  expiresAt?: Date;
  updatedBy?: string;
}

export interface AuthProviderConfig {
  // OAuth2 Configuration
  oauth2?: {
    clientId: string;
    clientSecret: string;
    authorizationUrl: string;
    tokenUrl: string;
    scope: string[];
    redirectUri: string;
  };
  
  // JWT Configuration
  jwt?: {
    secret: string;
    algorithm: 'HS256' | 'HS384' | 'HS512' | 'RS256' | 'RS384' | 'RS512';
    expiresIn: string;
    issuer?: string;
    audience?: string;
  };
  
  // API Key Configuration
  apiKey?: {
    keyName: string;
    keyLocation: 'header' | 'query' | 'body';
    keyPrefix?: string;
  };
  
  // Custom Configuration
  custom?: Record<string, any>;
}

export class AuthProviderModel extends BaseEntityModel<AuthProvider> {
  private _name: string;
  private _type: 'OAUTH2' | 'JWT' | 'API_KEY' | 'CUSTOM';
  private _description?: string;
  private _isActive: boolean;
  private _config: Record<string, any>;
  private _metadata?: Record<string, any>;

  constructor(authProvider: AuthProvider) {
    super(authProvider);
    this._id = authProvider.id as string;
    this._name = authProvider.name;
    this._type = authProvider.type;
    this._description = authProvider.description;
    this._isActive = authProvider.isActive;
    this._config = authProvider.config;
    this._metadata = authProvider.metadata;
  }

  // ========================================
  // GETTERS
  // ========================================

  get id(): string {
    return this._id as string;
  }

  get name(): string {
    return this._name;
  }

  get type(): 'OAUTH2' | 'JWT' | 'API_KEY' | 'CUSTOM' {
    return this._type;
  }

  get description(): string | undefined {
    return this._description;
  }

  get isProviderActive(): boolean {
    return this._isActive;
  }

  get config(): Record<string, any> {
    return this._config;
  }

  get metadata(): Record<string, any> | undefined {
    return this._metadata;
  }

  // ========================================
  // BUSINESS LOGIC
  // ========================================

  /**
   * Update auth provider
   */
  update(updates: UpdateAuthProviderRequest): void {
    if (updates.name !== undefined) {
      this._name = updates.name;
    }
    if (updates.description !== undefined) {
      this._description = updates.description;
    }
    if (updates.isActive !== undefined) {
      this._isActive = updates.isActive;
    }
    if (updates.config !== undefined) {
      this._config = { ...this._config, ...updates.config };
    }
    if (updates.metadata !== undefined) {
      this._metadata = { ...this._metadata, ...updates.metadata };
    }
    this.markUpdated(updates.updatedBy);
  }

  /**
   * Activate provider
   */
  activate(activatedBy?: string): void {
    this._isActive = true;
    this.markUpdated(activatedBy);
  }

  /**
   * Deactivate provider
   */
  deactivate(deactivatedBy?: string): void {
    this._isActive = false;
    this.markUpdated(deactivatedBy);
  }

  /**
   * Get OAuth2 configuration
   */
  getOAuth2Config(): AuthProviderConfig['oauth2'] | null {
    if (this._type !== 'OAUTH2') {
      return null;
    }
    return this._config.oauth2 || null;
  }

  /**
   * Get JWT configuration
   */
  getJWTConfig(): AuthProviderConfig['jwt'] | null {
    if (this._type !== 'JWT') {
      return null;
    }
    return this._config.jwt || null;
  }

  /**
   * Get API Key configuration
   */
  getAPIKeyConfig(): AuthProviderConfig['apiKey'] | null {
    if (this._type !== 'API_KEY') {
      return null;
    }
    return this._config.apiKey || null;
  }

  /**
   * Get custom configuration
   */
  getCustomConfig(): Record<string, any> | null {
    if (this._type !== 'CUSTOM') {
      return null;
    }
    return this._config.custom || null;
  }

  /**
   * Validate provider configuration
   */
  validate(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this._id || (typeof this._id === 'string' && this._id.trim().length === 0)) {
      errors.push('Provider ID is required');
    }

    if (!this._name || this._name.trim().length === 0) {
      errors.push('Provider name is required');
    }

    if (!this._type) {
      errors.push('Provider type is required');
    }

    // Type-specific validation
    switch (this._type) {
      case 'OAUTH2':
        const oauth2Config = this.getOAuth2Config();
        if (!oauth2Config) {
          errors.push('OAuth2 configuration is required');
        } else {
          if (!oauth2Config.clientId) errors.push('OAuth2 client ID is required');
          if (!oauth2Config.clientSecret) errors.push('OAuth2 client secret is required');
          if (!oauth2Config.authorizationUrl) errors.push('OAuth2 authorization URL is required');
          if (!oauth2Config.tokenUrl) errors.push('OAuth2 token URL is required');
        }
        break;

      case 'JWT':
        const jwtConfig = this.getJWTConfig();
        if (!jwtConfig) {
          errors.push('JWT configuration is required');
        } else {
          if (!jwtConfig.secret) errors.push('JWT secret is required');
          if (!jwtConfig.algorithm) errors.push('JWT algorithm is required');
        }
        break;

      case 'API_KEY':
        const apiKeyConfig = this.getAPIKeyConfig();
        if (!apiKeyConfig) {
          errors.push('API Key configuration is required');
        } else {
          if (!apiKeyConfig.keyName) errors.push('API Key name is required');
          if (!apiKeyConfig.keyLocation) errors.push('API Key location is required');
        }
        break;

      case 'CUSTOM':
        const customConfig = this.getCustomConfig();
        if (!customConfig || Object.keys(customConfig).length === 0) {
          errors.push('Custom configuration is required');
        }
        break;
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Convert to plain object
   */
  toJSON(): AuthProvider {
    return {
      ...this.getBaseEntityData(),
      id: this._id as string,
      name: this._name,
      type: this._type,
      description: this._description,
      isActive: this._isActive,
      config: this._config,
      metadata: this._metadata
    };
  }

  /**
   * Create a new auth provider instance
   */
  static create(data: CreateAuthProviderRequest): AuthProviderModel {
    const authProvider: AuthProvider = {
      id: data.id,
      name: data.name,
      type: data.type,
      description: data.description,
      isActive: true,
      config: data.config,
      metadata: data.metadata,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: data.createdBy
    };
    
    return new AuthProviderModel(authProvider);
  }
}

export class ConnectionAuthProviderModel extends BaseEntityModel<ConnectionAuthProvider> {
  private _connectionUuid: string;
  private _authProviderId: string;
  private _credentials: Record<string, any>;
  private _isActive: boolean;
  private _lastUsed?: Date;
  private _expiresAt?: Date;

  constructor(connectionAuthProvider: ConnectionAuthProvider) {
    super(connectionAuthProvider);
    this._connectionUuid = connectionAuthProvider.connectionUuid;
    this._authProviderId = connectionAuthProvider.authProviderId;
    this._credentials = connectionAuthProvider.credentials;
    this._isActive = connectionAuthProvider.isActive;
    this._lastUsed = connectionAuthProvider.lastUsed;
    this._expiresAt = connectionAuthProvider.expiresAt;
  }

  // ========================================
  // GETTERS
  // ========================================

  get connectionUuid(): string {
    return this._connectionUuid;
  }

  get authProviderId(): string {
    return this._authProviderId;
  }

  get credentials(): Record<string, any> {
    return this._credentials;
  }

  get isConnectionProviderActive(): boolean {
    return this._isActive;
  }

  get lastUsed(): Date | undefined {
    return this._lastUsed;
  }

  get expiresAt(): Date | undefined {
    return this._expiresAt;
  }

  // ========================================
  // BUSINESS LOGIC
  // ========================================

  /**
   * Update connection auth provider
   */
  update(updates: UpdateConnectionAuthProviderRequest): void {
    if (updates.credentials !== undefined) {
      this._credentials = { ...this._credentials, ...updates.credentials };
    }
    if (updates.isActive !== undefined) {
      this._isActive = updates.isActive;
    }
    if (updates.expiresAt !== undefined) {
      this._expiresAt = updates.expiresAt;
    }
    this.markUpdated(updates.updatedBy);
  }

  /**
   * Record usage
   */
  recordUsage(): void {
    this._lastUsed = new Date();
    this.markUpdated();
  }

  /**
   * Check if credentials are expired
   */
  isExpired(): boolean {
    if (!this._expiresAt) {
      return false;
    }
    return new Date() > this._expiresAt;
  }

  /**
   * Check if credentials will expire soon (within specified hours)
   */
  willExpireSoon(hours: number = 24): boolean {
    if (!this._expiresAt) {
      return false;
    }
    const soon = new Date();
    soon.setHours(soon.getHours() + hours);
    return this._expiresAt <= soon;
  }

  /**
   * Activate provider
   */
  activate(activatedBy?: string): void {
    this._isActive = true;
    this.markUpdated(activatedBy);
  }

  /**
   * Deactivate provider
   */
  deactivate(deactivatedBy?: string): void {
    this._isActive = false;
    this.markUpdated(deactivatedBy);
  }

  /**
   * Convert to plain object
   */
  toJSON(): ConnectionAuthProvider {
    return {
      ...this.getBaseEntityData(),
      connectionUuid: this._connectionUuid,
      authProviderId: this._authProviderId,
      credentials: this._credentials,
      isActive: this._isActive,
      lastUsed: this._lastUsed,
      expiresAt: this._expiresAt
    };
  }

  /**
   * Create a new connection auth provider instance
   */
  static create(data: CreateConnectionAuthProviderRequest): ConnectionAuthProviderModel {
    const connectionAuthProvider: ConnectionAuthProvider = {
      connectionUuid: data.connectionUuid,
      authProviderId: data.authProviderId,
      credentials: data.credentials,
      isActive: true,
      expiresAt: data.expiresAt,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: data.createdBy
    };
    
    return new ConnectionAuthProviderModel(connectionAuthProvider);
  }
}
