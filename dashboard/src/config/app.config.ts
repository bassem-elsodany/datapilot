// ========================================
// APPLICATION CONFIGURATION
// ========================================

export interface AppConfig {
  // Application metadata
  app: {
    name: string;
    version: string;
    description: string;
    author: string;
    homepage: string;
  };
  
  // Storage configuration
  storage: {
    connectionKey: string;
    masterKeyHashKey: string;
    testDataPrefixes: string[];
    fontSizeKey: string;
  };
  
  // Salesforce configuration
  salesforce: {
    defaultLoginUrl: string;
    sandboxLoginUrl: string;
    apiVersion: string;
    timeout: number;
    maxRetries: number;
  };
  
  // UI configuration
  ui: {
    defaultFontSize: string;
    fontSizes: Array<{
      label: string;
      value: string;
      nodeName: number;
      fieldType: number;
      badge: number;
    }>;
    theme: {
      primary: string;
      secondary: string;
      accent: string;
      background: string;
      surface: string;
      error: string;
      warning: string;
      success: string;
    };
    animations: {
      duration: number;
      easing: string;
    };
  };
  
  // Features configuration
  features: {
    enableSearch: boolean;
    enableAutoSave: boolean;
    enableSessionPersistence: boolean;
    enableSchemaCaching: boolean;
    maxSavedSessions: number;
  };
  
  // API configuration
  api: {
    baseUrl: string;
    timeout: number;
    retries: number;
    endpoints: {
      health: string;
      logging: string;
      salesforce: string;
      connections: string;
      database: string;
      masterKey: string;
      i18n: string;
      authProviders: string;
      appSettings: string;
      savedQueries: string;
      aiAgents: string;
      datapilotAgent: string;
    };
  };
  
  // Development configuration
  development: {
    enableDebugLogging: boolean;
    enableTestData: boolean;
    mockApiDelay: number;
  };
  
  // Internationalization configuration
  i18n: {
    dateFormat: 'short' | 'long';
    numberFormat: 'decimal' | 'currency';
  };
}

// ========================================
// INTERNATIONALIZATION CONFIGURATION
// ========================================

export interface I18nConfig {
  defaultLocale: string;
  supportedLocales: string[];
  fallbackLocale: string;
  dateTimeFormats: {
    [locale: string]: {
      short: Intl.DateTimeFormatOptions;
      long: Intl.DateTimeFormatOptions;
    };
  };
  numberFormats: {
    [locale: string]: {
      decimal: Intl.NumberFormatOptions;
      currency: Intl.NumberFormatOptions;
    };
  };
}

// ========================================
// ENVIRONMENT VARIABLE HELPERS
// ========================================

const getEnvVar = (key: string, defaultValue: string): string => {
  return (import.meta as any).env[key] || defaultValue;
};

const getEnvBoolean = (key: string, defaultValue: boolean): boolean => {
  const value = (import.meta as any).env[key];
  if (value === undefined) return defaultValue;
  return value === 'true' || value === '1';
};

const getEnvNumber = (key: string, defaultValue: number): number => {
  const value = (import.meta as any).env[key];
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
};

const getEnvArray = (key: string, defaultValue: string[]): string[] => {
  const value = (import.meta as any).env[key];
  if (value === undefined) return defaultValue;
  return value.split(',').map(item => item.trim());
};

// ========================================
// DEFAULT CONFIGURATION
// ========================================

export const defaultAppConfig: AppConfig = {
  app: {
    name: getEnvVar('VITE_APP_NAME', 'DataPilot'),
    version: getEnvVar('VITE_APP_VERSION', '1.0.0'),
    description: getEnvVar('VITE_APP_DESCRIPTION', 'Your AI pilot for Salesforce data navigation'),
    author: getEnvVar('VITE_APP_AUTHOR', 'DataPilot Team'),
    homepage: getEnvVar('VITE_APP_HOMEPAGE', 'https://github.com/datapilot')
  },
  
  storage: {
    connectionKey: getEnvVar('VITE_STORAGE_CONNECTION_KEY', 'datapilot_connections'),
    masterKeyHashKey: getEnvVar('VITE_STORAGE_MASTER_KEY_HASH', 'datapilot_master_key_hash'),
    testDataPrefixes: getEnvArray('VITE_STORAGE_TEST_DATA_PREFIXES', ['datapilot_test', 'datapilot_mock', 'datapilot_demo']),
    fontSizeKey: getEnvVar('VITE_STORAGE_FONT_SIZE_KEY', 'schemaTreeFontSize')
  },
  
  salesforce: {
    defaultLoginUrl: getEnvVar('VITE_SALESFORCE_LOGIN_URL', 'https://login.salesforce.com'),
    sandboxLoginUrl: getEnvVar('VITE_SALESFORCE_SANDBOX_URL', 'https://test.salesforce.com'),
    apiVersion: getEnvVar('VITE_SALESFORCE_API_VERSION', '58.0'),
    timeout: getEnvNumber('VITE_SALESFORCE_TIMEOUT', 30000),
    maxRetries: getEnvNumber('VITE_SALESFORCE_MAX_RETRIES', 3)
  },
  
  ui: {
    defaultFontSize: getEnvVar('VITE_DEFAULT_FONT_SIZE', 'medium'),
    fontSizes: [
      { label: 'Small', value: 'small', nodeName: 10, fieldType: 8, badge: 7 },
      { label: 'Medium', value: 'medium', nodeName: 11, fieldType: 9, badge: 8 },
      { label: 'Large', value: 'large', nodeName: 13, fieldType: 11, badge: 10 },
      { label: 'Extra Large', value: 'xlarge', nodeName: 15, fieldType: 13, badge: 12 }
    ],
    theme: {
      primary: getEnvVar('VITE_THEME_PRIMARY', '#667eea'),
      secondary: getEnvVar('VITE_THEME_SECONDARY', '#764ba2'),
      accent: getEnvVar('VITE_THEME_ACCENT', '#f093fb'),
      background: getEnvVar('VITE_THEME_BACKGROUND', '#ffffff'),
      surface: getEnvVar('VITE_THEME_SURFACE', '#f7fafc'),
      error: getEnvVar('VITE_THEME_ERROR', '#e53e3e'),
      warning: getEnvVar('VITE_THEME_WARNING', '#f59e0b'),
      success: getEnvVar('VITE_THEME_SUCCESS', '#38a169')
    },
    animations: {
      duration: 200,
      easing: 'ease-in-out'
    }
  },
  
  features: {
    enableSearch: getEnvBoolean('VITE_ENABLE_SEARCH', true),
    enableAutoSave: getEnvBoolean('VITE_ENABLE_AUTO_SAVE', true),
    enableSessionPersistence: getEnvBoolean('VITE_ENABLE_SESSION_PERSISTENCE', true),
    enableSchemaCaching: getEnvBoolean('VITE_ENABLE_SCHEMA_CACHING', true),
    maxSavedSessions: getEnvNumber('VITE_MAX_SAVED_SESSIONS', 50)
  },
  
  api: {
    baseUrl: getEnvVar('VITE_API_BASE_URL', 'http://localhost:8001'),
    timeout: getEnvNumber('VITE_API_TIMEOUT', 30000),
    retries: getEnvNumber('VITE_API_RETRIES', 3),
    endpoints: {
      health: '/api/v1/health',
      logging: '/api/v1/logging',
      salesforce: '/api/v1/salesforce',
      connections: '/api/v1/connections',
      database: '/api/v1/database',
      masterKey: '/api/v1/master-key',
      i18n: '/api/v1/i18n',
      authProviders: '/api/v1/auth-providers',
      appSettings: '/api/v1/settings',
      savedQueries: '/api/v1/saved-queries',
      aiAgents: '/api/v1/ai-agents',
      datapilotAgent: 'datapilot-agent'
    }
  },
  
  development: {
    enableDebugLogging: getEnvBoolean('VITE_ENABLE_DEBUG_LOGGING', false),
    enableTestData: getEnvBoolean('VITE_ENABLE_TEST_DATA', false),
    mockApiDelay: getEnvNumber('VITE_MOCK_API_DELAY', 1000)
  },
  
  i18n: {
    dateFormat: getEnvVar('VITE_DATE_FORMAT', 'short') as 'short' | 'long',
    numberFormat: getEnvVar('VITE_NUMBER_FORMAT', 'decimal') as 'decimal' | 'currency'
  }
};

export const defaultI18nConfig: I18nConfig = {
  defaultLocale: getEnvVar('VITE_DEFAULT_LOCALE', 'en'),
  supportedLocales: getEnvArray('VITE_SUPPORTED_LOCALES', ['en', 'es', 'fr', 'de', 'ja', 'zh']),
  fallbackLocale: getEnvVar('VITE_FALLBACK_LOCALE', 'en'),
  dateTimeFormats: {
    en: {
      short: { year: 'numeric', month: 'short', day: 'numeric' },
      long: { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }
    },
    es: {
      short: { year: 'numeric', month: 'short', day: 'numeric' },
      long: { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }
    },
    fr: {
      short: { year: 'numeric', month: 'short', day: 'numeric' },
      long: { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }
    },
    de: {
      short: { year: 'numeric', month: 'short', day: 'numeric' },
      long: { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }
    },
    ja: {
      short: { year: 'numeric', month: 'short', day: 'numeric' },
      long: { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }
    },
    zh: {
      short: { year: 'numeric', month: 'short', day: 'numeric' },
      long: { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }
    }
  },
  numberFormats: {
    en: {
      decimal: { minimumFractionDigits: 0, maximumFractionDigits: 2 },
      currency: { style: 'currency', currency: 'USD' }
    },
    es: {
      decimal: { minimumFractionDigits: 0, maximumFractionDigits: 2 },
      currency: { style: 'currency', currency: 'EUR' }
    },
    fr: {
      decimal: { minimumFractionDigits: 0, maximumFractionDigits: 2 },
      currency: { style: 'currency', currency: 'EUR' }
    },
    de: {
      decimal: { minimumFractionDigits: 0, maximumFractionDigits: 2 },
      currency: { style: 'currency', currency: 'EUR' }
    },
    ja: {
      decimal: { minimumFractionDigits: 0, maximumFractionDigits: 2 },
      currency: { style: 'currency', currency: 'JPY' }
    },
    zh: {
      decimal: { minimumFractionDigits: 0, maximumFractionDigits: 2 },
      currency: { style: 'currency', currency: 'CNY' }
    }
  }
};

// ========================================
// CONFIGURATION MANAGER
// ========================================

class ConfigurationManager {
  private static instance: ConfigurationManager;
  private appConfig: AppConfig;
  private i18nConfig: I18nConfig;
  private currentLocale: string;

  private constructor() {
    this.appConfig = { ...defaultAppConfig };
    this.i18nConfig = { ...defaultI18nConfig };
    this.currentLocale = this.i18nConfig.defaultLocale;
    this.loadConfiguration();
  }

  static getInstance(): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager();
    }
    return ConfigurationManager.instance;
  }

  // Load configuration from localStorage
  private loadConfiguration(): void {
    try {
      const savedConfig = localStorage.getItem('datapilot_config');
      const savedLocale = localStorage.getItem('datapilot_locale');
      
      if (savedConfig) {
        this.appConfig = { ...defaultAppConfig, ...JSON.parse(savedConfig) };
      }
      
      if (savedLocale && this.i18nConfig.supportedLocales.includes(savedLocale)) {
        this.currentLocale = savedLocale;
      }
    } catch (error) {
      // Note: Can't use logger here as it might cause circular dependency
    }
  }

  // Save configuration to localStorage
  private saveConfiguration(): void {
    try {
      localStorage.setItem('datapilot_config', JSON.stringify(this.appConfig));
      localStorage.setItem('datapilot_locale', this.currentLocale);
    } catch (error) {
      // Note: Can't use logger here as it might cause circular dependency
    }
  }

  // Get app configuration
  getAppConfig(): AppConfig {
    return { ...this.appConfig };
  }

  // Update app configuration
  updateAppConfig(updates: Partial<AppConfig>): void {
    this.appConfig = { ...this.appConfig, ...updates };
    this.saveConfiguration();
  }

  // Get specific config section
  getConfigSection<K extends keyof AppConfig>(section: K): AppConfig[K] {
    return this.appConfig[section];
  }

  // Get current locale
  getCurrentLocale(): string {
    return this.currentLocale;
  }

  // Set locale
  setLocale(locale: string): void {
    if (this.i18nConfig.supportedLocales.includes(locale)) {
      this.currentLocale = locale;
      this.saveConfiguration();
    } else {
      // Note: Can't use logger here as it might cause circular dependency
    }
  }

  // Get supported locales
  getSupportedLocales(): string[] {
    return [...this.i18nConfig.supportedLocales];
  }

  // Get i18n configuration
  getI18nConfig(): I18nConfig {
    return { ...this.i18nConfig };
  }

  // Get API base URL
  getApiBaseUrl(): string {
    return this.appConfig.api.baseUrl;
  }

  // Get full API URL for an endpoint
  getApiUrl(endpoint: keyof AppConfig['api']['endpoints']): string {
    const baseUrl = this.getApiBaseUrl();
    let endpointPath = this.appConfig.api.endpoints[endpoint];
    
    // Special handling for datapilotAgent to combine with aiAgents
    if (endpoint === 'datapilotAgent') {
      const aiAgentsPath = this.appConfig.api.endpoints.aiAgents;
      endpointPath = `${aiAgentsPath}/${endpointPath}`;
    }
    
    return `${baseUrl}${endpointPath}`;
  }

  // Get API configuration
  getApiConfig(): AppConfig['api'] {
    return { ...this.appConfig.api };
  }

  // Reset to default configuration
  resetToDefaults(): void {
    this.appConfig = { ...defaultAppConfig };
    this.currentLocale = this.i18nConfig.defaultLocale;
    this.saveConfiguration();
  }
}

export const configManager = ConfigurationManager.getInstance();
