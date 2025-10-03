// ========================================
// APPLICATION SETTINGS DOMAIN MODEL
// ========================================

import { BaseEntity, BaseEntityModel } from './BaseEntity';

/**
 * APP_SETTINGS - Application-wide Settings
 * Purpose: Store application configuration, feature flags, and global settings
 * Lifecycle: Application-wide, configurable by administrators
 */
export interface AppSettings extends BaseEntity {
  id: string; // Unique setting identifier (overrides BaseEntity id type)
  category: 'LANGUAGE' | 'FEATURE' | 'UI' | 'SECURITY' | 'PERFORMANCE' | 'INTEGRATION' | 'CUSTOM';
  key: string; // Setting key
  value: any; // Setting value (can be any type)
  valueType: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string; // Human-readable description
  isActive: boolean; // Whether the setting is active
  isSystem: boolean; // Whether it's a system setting (cannot be deleted)
  isEncrypted: boolean; // Whether the value is encrypted
  metadata?: Record<string, any>; // Additional metadata
  validationRules?: ValidationRule[]; // Validation rules for the setting
}

/**
 * VALIDATION_RULE - Setting Validation Rules
 * Purpose: Define validation rules for setting values
 */
export interface ValidationRule {
  type: 'required' | 'min' | 'max' | 'pattern' | 'enum' | 'custom';
  value: any; // Validation value (min, max, pattern, etc.)
  message: string; // Error message
  severity: 'error' | 'warning' | 'info';
}

/**
 * LANGUAGE_SETTINGS - Language and Localization Settings
 * Purpose: Configure supported languages and localization features
 */
export interface LanguageSettings {
  defaultLanguage: string; // Default language code (e.g., 'en')
  supportedLanguages: SupportedLanguage[]; // List of supported languages
  fallbackLanguage: string; // Fallback language if translation missing
  dateFormat: string; // Default date format
  timeFormat: string; // Default time format
  timezone: string; // Default timezone
  currency: string; // Default currency
  numberFormat: string; // Default number format
}

/**
 * SUPPORTED_LANGUAGE - Language Configuration
 * Purpose: Define supported language details
 */
export interface SupportedLanguage {
  code: string; // Language code (e.g., 'en', 'es', 'fr')
  name: string; // Language name (e.g., 'English', 'Spanish')
  nativeName: string; // Native language name
  isActive: boolean; // Whether language is active
  isDefault: boolean; // Whether it's the default language
  isRTL: boolean; // Right-to-left language
  flag?: string; // Flag emoji or icon
  translationProgress: number; // Translation completion percentage
  lastUpdated?: Date; // Last translation update
}

/**
 * FEATURE_FLAGS - Feature Toggle Settings
 * Purpose: Enable/disable application features
 */
export interface FeatureFlags {
  aiAssistance: boolean; // AI query assistance
  queryOptimization: boolean; // Query optimization suggestions
  metadataAnalysis: boolean; // Schema analysis features

  queryArchiving: boolean; // Query history archiving
  multiLanguage: boolean; // Multi-language support
  darkMode: boolean; // Dark mode theme
  advancedSearch: boolean; // Advanced search features
  exportFeatures: boolean; // Data export capabilities
  importFeatures: boolean; // Data import capabilities
  collaboration: boolean; // Collaboration features
  notifications: boolean; // Push notifications
  analytics: boolean; // Usage analytics
  debugging: boolean; // Debug mode
  betaFeatures: boolean; // Beta feature access
}

/**
 * UI_SETTINGS - User Interface Settings
 * Purpose: Configure UI behavior and appearance
 */
export interface UISettings {
  theme: 'light' | 'dark' | 'auto'; // Application theme
  fontSize: 'small' | 'medium' | 'large'; // Font size
  compactMode: boolean; // Compact UI mode
  showLineNumbers: boolean; // Show line numbers in editor
  showMinimap: boolean; // Show minimap in editor
  wordWrap: boolean; // Word wrap in editor
  autoSave: boolean; // Auto-save queries
  autoComplete: boolean; // Auto-completion
  syntaxHighlighting: boolean; // Syntax highlighting
  bracketMatching: boolean; // Bracket matching
  showWhitespace: boolean; // Show whitespace characters
  tabSize: number; // Tab size in editor
  insertSpaces: boolean; // Insert spaces instead of tabs
  showStatusBar: boolean; // Show status bar
  showToolbar: boolean; // Show toolbar
  showSidebar: boolean; // Show sidebar
  sidebarPosition: 'left' | 'right'; // Sidebar position
  panelLayout: 'horizontal' | 'vertical'; // Panel layout
  animationSpeed: 'slow' | 'normal' | 'fast'; // Animation speed
  showWelcomeScreen: boolean; // Show welcome screen on startup
}

/**
 * SECURITY_SETTINGS - Security Configuration
 * Purpose: Configure security features and policies
 */
export interface SecuritySettings {
  sessionTimeout: number; // Session timeout in minutes
  maxLoginAttempts: number; // Maximum login attempts
  passwordPolicy: {
    minLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumbers: boolean;
    requireSpecialChars: boolean;
    maxAge: number; // Password max age in days
  };
  encryptionLevel: 'standard' | 'high' | 'maximum'; // Encryption level
  twoFactorAuth: boolean; // Two-factor authentication
  ipWhitelist: string[]; // IP whitelist
  auditLogging: boolean; // Audit logging
  dataRetention: {

    logs: number; // Days to keep logs
    backups: number; // Days to keep backups
  };
  autoLogout: boolean; // Auto logout on inactivity
  secureHeaders: boolean; // Secure HTTP headers
  csrfProtection: boolean; // CSRF protection
}

/**
 * PERFORMANCE_SETTINGS - Performance Configuration
 * Purpose: Configure performance-related settings
 */
export interface PerformanceSettings {
  queryTimeout: number; // Query execution timeout in seconds
  maxResults: number; // Maximum results per query
  cacheEnabled: boolean; // Enable caching
  cacheSize: number; // Cache size in MB
  cacheTTL: number; // Cache time-to-live in minutes
  connectionPoolSize: number; // Database connection pool size
  batchSize: number; // Batch processing size
  compressionEnabled: boolean; // Enable compression
  lazyLoading: boolean; // Enable lazy loading
  preloadData: boolean; // Preload frequently used data
  backgroundProcessing: boolean; // Enable background processing
  memoryLimit: number; // Memory limit in MB
  cpuLimit: number; // CPU limit percentage
}

/**
 * INTEGRATION_SETTINGS - External Integration Settings
 * Purpose: Configure external service integrations
 */
export interface IntegrationSettings {
  aiService: {
    enabled: boolean;
    endpoint: string;
    apiKey?: string;
    timeout: number;
    retryAttempts: number;
  };
  backupService: {
    enabled: boolean;
    provider: 'local' | 'cloud' | 'custom';
    endpoint?: string;
    credentials?: Record<string, any>;
    schedule: string; // Cron expression
  };
  notificationService: {
    enabled: boolean;
    provider: 'email' | 'slack' | 'webhook' | 'custom';
    endpoint?: string;
    credentials?: Record<string, any>;
  };
  analyticsService: {
    enabled: boolean;
    provider: 'google' | 'mixpanel' | 'custom';
    endpoint?: string;
    apiKey?: string;
    trackUserBehavior: boolean;
  };
  updateService: {
    enabled: boolean;
    autoCheck: boolean;
    autoDownload: boolean;
    channel: 'stable' | 'beta' | 'alpha';
  };
}

export interface CreateAppSettingsRequest {
  id: string;
  category: 'LANGUAGE' | 'FEATURE' | 'UI' | 'SECURITY' | 'PERFORMANCE' | 'INTEGRATION' | 'CUSTOM';
  key: string;
  value: any;
  valueType: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  isActive?: boolean;
  isSystem?: boolean;
  isEncrypted?: boolean;
  metadata?: Record<string, any>;
  validationRules?: ValidationRule[];
  createdBy?: string;
}

export interface UpdateAppSettingsRequest {
  value?: any;
  description?: string;
  isActive?: boolean;
  isEncrypted?: boolean;
  metadata?: Record<string, any>;
  validationRules?: ValidationRule[];
  updatedBy?: string;
}

export interface AppSettingsSearchFilters {
  category?: 'LANGUAGE' | 'FEATURE' | 'UI' | 'SECURITY' | 'PERFORMANCE' | 'INTEGRATION' | 'CUSTOM';
  key?: string;
  isActive?: boolean;
  isSystem?: boolean;
  valueType?: 'string' | 'number' | 'boolean' | 'object' | 'array';
}

export interface AppSettingsStats {
  totalSettings: number;
  activeSettings: number;
  systemSettings: number;
  encryptedSettings: number;
  categories: Record<string, number>;
  valueTypes: Record<string, number>;
}

export class AppSettingsModel extends BaseEntityModel<AppSettings> {
  private _category: 'LANGUAGE' | 'FEATURE' | 'UI' | 'SECURITY' | 'PERFORMANCE' | 'INTEGRATION' | 'CUSTOM';
  private _key: string;
  private _value: any;
  private _valueType: 'string' | 'number' | 'boolean' | 'object' | 'array';
  private _description?: string;
  private _isActive: boolean;
  private _isSystem: boolean;
  private _isEncrypted: boolean;
  private _metadata?: Record<string, any>;
  private _validationRules?: ValidationRule[];

  constructor(appSettings: AppSettings) {
    super(appSettings);
    this._id = appSettings.id as string;
    this._category = appSettings.category;
    this._key = appSettings.key;
    this._value = appSettings.value;
    this._valueType = appSettings.valueType;
    this._description = appSettings.description;
    this._isActive = appSettings.isActive;
    this._isSystem = appSettings.isSystem;
    this._isEncrypted = appSettings.isEncrypted;
    this._metadata = appSettings.metadata;
    this._validationRules = appSettings.validationRules;
  }

  // ========================================
  // GETTERS
  // ========================================

  get id(): string { return this._id as string; }
  get category() { return this._category; }
  get key(): string { return this._key; }
  get value(): any { return this._value; }
  get valueType() { return this._valueType; }
  get description(): string | undefined { return this._description; }
  get isSettingActive(): boolean { return this._isActive; }
  get isSystem(): boolean { return this._isSystem; }
  get isEncrypted(): boolean { return this._isEncrypted; }
  get metadata(): Record<string, any> | undefined { return this._metadata; }
  get validationRules(): ValidationRule[] | undefined { return this._validationRules; }

  // ========================================
  // BUSINESS LOGIC
  // ========================================

  /**
   * Update setting
   */
  update(updates: UpdateAppSettingsRequest): void {
    if (updates.value !== undefined) {
      this._value = updates.value;
    }
    if (updates.description !== undefined) {
      this._description = updates.description;
    }
    if (updates.isActive !== undefined) {
      this._isActive = updates.isActive;
    }
    if (updates.isEncrypted !== undefined) {
      this._isEncrypted = updates.isEncrypted;
    }
    if (updates.metadata !== undefined) {
      this._metadata = { ...this._metadata, ...updates.metadata };
    }
    if (updates.validationRules !== undefined) {
      this._validationRules = updates.validationRules;
    }
    this.markUpdated(updates.updatedBy);
  }

  /**
   * Activate setting
   */
  activate(activatedBy?: string): void {
    this._isActive = true;
    this.markUpdated(activatedBy);
  }

  /**
   * Deactivate setting
   */
  deactivate(deactivatedBy?: string): void {
    this._isActive = false;
    this.markUpdated(deactivatedBy);
  }

  /**
   * Get typed value
   */
  getTypedValue<T>(): T {
    return this._value as T;
  }

  /**
   * Get string value
   */
  getStringValue(): string {
    if (this._valueType === 'string') {
      return this._value as string;
    }
    return String(this._value);
  }

  /**
   * Get number value
   */
  getNumberValue(): number {
    if (this._valueType === 'number') {
      return this._value as number;
    }
    return Number(this._value);
  }

  /**
   * Get boolean value
   */
  getBooleanValue(): boolean {
    if (this._valueType === 'boolean') {
      return this._value as boolean;
    }
    return Boolean(this._value);
  }

  /**
   * Get object value
   */
  getObjectValue<T = Record<string, any>>(): T {
    if (this._valueType === 'object') {
      return this._value as T;
    }
    return JSON.parse(String(this._value)) as T;
  }

  /**
   * Get array value
   */
  getArrayValue<T = any[]>(): T {
    if (this._valueType === 'array') {
      return this._value as T;
    }
    return JSON.parse(String(this._value)) as T;
  }

  /**
   * Validate setting value
   */
  validate(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this._id || (typeof this._id === 'string' && this._id.trim().length === 0)) {
      errors.push('Setting ID is required');
    }

    if (!this._key || this._key.trim().length === 0) {
      errors.push('Setting key is required');
    }

    if (!this._category) {
      errors.push('Setting category is required');
    }

    if (!this._valueType) {
      errors.push('Value type is required');
    }

    // Type-specific validation
    if (this._value !== null && this._value !== undefined) {
      switch (this._valueType) {
        case 'string':
          if (typeof this._value !== 'string') {
            errors.push('Value must be a string');
          }
          break;
        case 'number':
          if (typeof this._value !== 'number' || isNaN(this._value)) {
            errors.push('Value must be a valid number');
          }
          break;
        case 'boolean':
          if (typeof this._value !== 'boolean') {
            errors.push('Value must be a boolean');
          }
          break;
        case 'object':
          if (typeof this._value !== 'object' || Array.isArray(this._value)) {
            errors.push('Value must be an object');
          }
          break;
        case 'array':
          if (!Array.isArray(this._value)) {
            errors.push('Value must be an array');
          }
          break;
      }
    }

    // Custom validation rules
    if (this._validationRules) {
      for (const rule of this._validationRules) {
        const validationError = this.validateRule(rule);
        if (validationError) {
          errors.push(validationError);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate a specific rule
   */
  private validateRule(rule: ValidationRule): string | null {
    switch (rule.type) {
      case 'required':
        if (this._value === null || this._value === undefined || this._value === '') {
          return rule.message;
        }
        break;

      case 'min':
        if (this._valueType === 'number' && this._value < rule.value) {
          return rule.message;
        }
        if (this._valueType === 'string' && this._value.length < rule.value) {
          return rule.message;
        }
        break;

      case 'max':
        if (this._valueType === 'number' && this._value > rule.value) {
          return rule.message;
        }
        if (this._valueType === 'string' && this._value.length > rule.value) {
          return rule.message;
        }
        break;

      case 'pattern':
        if (this._valueType === 'string' && !new RegExp(rule.value).test(this._value)) {
          return rule.message;
        }
        break;

      case 'enum':
        if (!rule.value.includes(this._value)) {
          return rule.message;
        }
        break;

      case 'custom':
        // Custom validation logic would be implemented here
        break;
    }

    return null;
  }

  /**
   * Check if setting is for a specific category
   */
  isCategory(category: string): boolean {
    return this._category === category;
  }

  /**
   * Check if setting is a system setting
   */
  isSystemSetting(): boolean {
    return this._isSystem;
  }

  /**
   * Check if setting is encrypted
   */
  isEncryptedSetting(): boolean {
    return this._isEncrypted;
  }

  /**
   * Get setting path (category.key)
   */
  getPath(): string {
    return `${this._category}.${this._key}`;
  }

  /**
   * Convert to plain object
   */
  toJSON(): AppSettings {
    return {
      ...this.getBaseEntityData(),
      id: this._id as string,
      category: this._category,
      key: this._key,
      value: this._value,
      valueType: this._valueType,
      description: this._description,
      isActive: this._isActive,
      isSystem: this._isSystem,
      isEncrypted: this._isEncrypted,
      metadata: this._metadata,
      validationRules: this._validationRules
    };
  }

  /**
   * Create a new app settings instance
   */
  static create(data: CreateAppSettingsRequest): AppSettingsModel {
    const appSettings: AppSettings = {
      id: data.id,
      category: data.category,
      key: data.key,
      value: data.value,
      valueType: data.valueType,
      description: data.description,
      isActive: data.isActive ?? true,
      isSystem: data.isSystem ?? false,
      isEncrypted: data.isEncrypted ?? false,
      metadata: data.metadata,
      validationRules: data.validationRules,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: data.createdBy
    };
    
    return new AppSettingsModel(appSettings);
  }

  /**
   * Create default language settings
   */
  static createDefaultLanguageSettings(): AppSettingsModel {
    const defaultLanguageSettings: LanguageSettings = {
      defaultLanguage: 'en',
      supportedLanguages: [
        { code: 'en', name: 'English', nativeName: 'English', isActive: true, isDefault: true, isRTL: false, flag: '🇺🇸', translationProgress: 100 },
        { code: 'es', name: 'Spanish', nativeName: 'Español', isActive: true, isDefault: false, isRTL: false, flag: '🇪🇸', translationProgress: 85 },
        { code: 'fr', name: 'French', nativeName: 'Français', isActive: true, isDefault: false, isRTL: false, flag: '🇫🇷', translationProgress: 75 },
        { code: 'de', name: 'German', nativeName: 'Deutsch', isActive: true, isDefault: false, isRTL: false, flag: '🇩🇪', translationProgress: 70 },
        { code: 'ar', name: 'Arabic', nativeName: 'العربية', isActive: true, isDefault: false, isRTL: true, flag: '🇸🇦', translationProgress: 60 }
      ],
      fallbackLanguage: 'en',
      dateFormat: 'MM/DD/YYYY',
      timeFormat: 'HH:mm:ss',
      timezone: 'UTC',
      currency: 'USD',
      numberFormat: 'en-US'
    };

    return AppSettingsModel.create({
      id: 'language-settings',
      category: 'LANGUAGE',
      key: 'language',
      value: defaultLanguageSettings,
      valueType: 'object',
      description: 'Language and localization settings',
      isSystem: true,
      createdBy: 'system'
    });
  }

  /**
   * Create default feature flags
   */
  static createDefaultFeatureFlags(): AppSettingsModel {
    const defaultFeatureFlags: FeatureFlags = {
      aiAssistance: true,
      queryOptimization: true,
      metadataAnalysis: true,

      queryArchiving: true,
      multiLanguage: true,
      darkMode: true,
      advancedSearch: true,
      exportFeatures: true,
      importFeatures: true,
      collaboration: false,
      notifications: true,
      analytics: true,
      debugging: false,
      betaFeatures: false
    };

    return AppSettingsModel.create({
      id: 'feature-flags',
      category: 'FEATURE',
      key: 'flags',
      value: defaultFeatureFlags,
      valueType: 'object',
      description: 'Feature flags and toggles',
      isSystem: true,
      createdBy: 'system'
    });
  }

  /**
   * Create default UI settings
   */
  static createDefaultUISettings(): AppSettingsModel {
    const defaultUISettings: UISettings = {
      theme: 'light',
      fontSize: 'medium',
      compactMode: false,
      showLineNumbers: true,
      showMinimap: true,
      wordWrap: false,
      autoSave: true,
      autoComplete: true,
      syntaxHighlighting: true,
      bracketMatching: true,
      showWhitespace: false,
      tabSize: 2,
      insertSpaces: true,
      showStatusBar: true,
      showToolbar: true,
      showSidebar: true,
      sidebarPosition: 'left',
      panelLayout: 'horizontal',
      animationSpeed: 'normal',
      showWelcomeScreen: true
    };

    return AppSettingsModel.create({
      id: 'ui-settings',
      category: 'UI',
      key: 'ui',
      value: defaultUISettings,
      valueType: 'object',
      description: 'User interface settings',
      isSystem: true,
      createdBy: 'system'
    });
  }

  /**
   * Create default security settings
   */
  static createDefaultSecuritySettings(): AppSettingsModel {
    const defaultSecuritySettings: SecuritySettings = {
      sessionTimeout: 30,
      maxLoginAttempts: 5,
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: false,
        maxAge: 90
      },
      encryptionLevel: 'standard',
      twoFactorAuth: false,
      ipWhitelist: [],
      auditLogging: true,
      dataRetention: {

        logs: 90,
        backups: 30
      },
      autoLogout: true,
      secureHeaders: true,
      csrfProtection: true
    };

    return AppSettingsModel.create({
      id: 'security-settings',
      category: 'SECURITY',
      key: 'security',
      value: defaultSecuritySettings,
      valueType: 'object',
      description: 'Security configuration',
      isSystem: true,
      createdBy: 'system'
    });
  }

  /**
   * Create default performance settings
   */
  static createDefaultPerformanceSettings(): AppSettingsModel {
    const defaultPerformanceSettings: PerformanceSettings = {
      queryTimeout: 300,
      maxResults: 10000,
      cacheEnabled: true,
      cacheSize: 100,
      cacheTTL: 60,
      connectionPoolSize: 10,
      batchSize: 1000,
      compressionEnabled: true,
      lazyLoading: true,
      preloadData: false,
      backgroundProcessing: true,
      memoryLimit: 512,
      cpuLimit: 80
    };

    return AppSettingsModel.create({
      id: 'performance-settings',
      category: 'PERFORMANCE',
      key: 'performance',
      value: defaultPerformanceSettings,
      valueType: 'object',
      description: 'Performance configuration',
      isSystem: true,
      createdBy: 'system'
    });
  }

  /**
   * Create default integration settings
   */
  static createDefaultIntegrationSettings(): AppSettingsModel {
    const defaultIntegrationSettings: IntegrationSettings = {
      aiService: {
        enabled: true,
        endpoint: 'https://api.your-ai-service.com',
        timeout: 30000,
        retryAttempts: 3
      },
      backupService: {
        enabled: false,
        provider: 'local',
        schedule: '0 2 * * *' // Daily at 2 AM
      },
      notificationService: {
        enabled: false,
        provider: 'email'
      },
      analyticsService: {
        enabled: false,
        provider: 'google',
        trackUserBehavior: false
      },
      updateService: {
        enabled: true,
        autoCheck: true,
        autoDownload: false,
        channel: 'stable'
      }
    };

    return AppSettingsModel.create({
      id: 'integration-settings',
      category: 'INTEGRATION',
      key: 'integration',
      value: defaultIntegrationSettings,
      valueType: 'object',
      description: 'External integration settings',
      isSystem: true,
      createdBy: 'system'
    });
  }
}
