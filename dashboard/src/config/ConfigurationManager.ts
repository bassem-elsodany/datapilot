import { storageService } from '../services/StorageService';
import { defaultAppConfig, AppConfig } from './app.config';
import { databaseService } from '../services/DatabaseService';

// ========================================
// CONFIGURATION MANAGER
// ========================================

export class ConfigurationManager {
  private static instance: ConfigurationManager;
  private appConfig: AppConfig;
  private currentLocale: string = 'en';
  private supportedLocales: string[] = [];

  private constructor() {
    this.appConfig = { ...defaultAppConfig };
    this.loadConfiguration();
  }

  static getInstance(): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager();
    }
    return ConfigurationManager.instance;
  }

  // ========================================
  // CONFIGURATION LOADING & SAVING
  // ========================================

  private async loadConfiguration(): Promise<void> {
    try {
      // Load app configuration
      const savedConfig = await storageService.getAppConfig();
      if (savedConfig) {
        this.appConfig = { ...defaultAppConfig, ...savedConfig };
      }

      // Load supported locales from database
      await this.loadSupportedLocales();

      // Load locale preference
      const savedLocale = await storageService.getSetting('locale', 'en', { namespace: 'i18n' });
      if (savedLocale && this.supportedLocales.includes(savedLocale)) {
        this.currentLocale = savedLocale;
      }
    } catch (error) {
      // Note: Can't use logger here as it might cause circular dependency
    }
  }

  private async loadSupportedLocales(): Promise<void> {
    try {
      const sql = `
        SELECT language_code 
        FROM languages 
        WHERE is_active = 1 AND is_deleted = 0
        ORDER BY language_code
      `;
      const result = await databaseService.executeQuery(sql);
      this.supportedLocales = result.data.map(row => row.language_code);
      
      // Ensure we have at least English as fallback
      if (!this.supportedLocales.includes('en')) {
        this.supportedLocales.unshift('en');
      }
    } catch (error) {
      // Note: Can't use logger here as it might cause circular dependency
      // Fallback to basic locales if database fails
      this.supportedLocales = ['en', 'es', 'fr', 'de'];
    }
  }

  private async saveConfiguration(): Promise<void> {
    try {
      await storageService.setAppConfig(this.appConfig);
      await storageService.setSetting('locale', this.currentLocale, { namespace: 'i18n' });
    } catch (error) {
      // Note: Can't use logger here as it might cause circular dependency
    }
  }

  // ========================================
  // CONFIGURATION ACCESS
  // ========================================

  getAppConfig(): AppConfig {
    return { ...this.appConfig };
  }

  async updateAppConfig(newConfig: Partial<AppConfig>): Promise<void> {
    this.appConfig = { ...this.appConfig, ...newConfig };
    await this.saveConfiguration();
  }

  async updateConfigSection<T extends keyof AppConfig>(
    section: T,
    updates: Partial<AppConfig[T]>
  ): Promise<void> {
    this.appConfig[section] = { ...this.appConfig[section], ...updates };
    await this.saveConfiguration();
  }

  // ========================================
  // LOCALE MANAGEMENT
  // ========================================

  getCurrentLocale(): string {
    return this.currentLocale;
  }

  async getSupportedLocales(): Promise<string[]> {
    // If locales haven't been loaded yet, load them
    if (this.supportedLocales.length === 0) {
      await this.loadSupportedLocales();
    }
    return [...this.supportedLocales];
  }

  async setLocale(locale: string): Promise<void> {
    // Ensure locales are loaded
    if (this.supportedLocales.length === 0) {
      await this.loadSupportedLocales();
    }
    
    if (this.supportedLocales.includes(locale)) {
      this.currentLocale = locale;
      await this.saveConfiguration();
    }
  }

  // ========================================
  // CONFIGURATION RESET
  // ========================================

  async resetToDefaults(): Promise<void> {
    this.appConfig = { ...defaultAppConfig };
    this.currentLocale = 'en';
    await this.saveConfiguration();
  }

  async resetSection<T extends keyof AppConfig>(section: T): Promise<void> {
    this.appConfig[section] = { ...defaultAppConfig[section] };
    await this.saveConfiguration();
  }

  // ========================================
  // CONFIGURATION VALIDATION
  // ========================================

  validateConfiguration(config: Partial<AppConfig>): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate app section
    if (config.app) {
      if (config.app.name && typeof config.app.name !== 'string') {
        errors.push('App name must be a string');
      }
      if (config.app.version && typeof config.app.version !== 'string') {
        errors.push('App version must be a string');
      }
    }

    // Validate salesforce section
    if (config.salesforce) {
      if (config.salesforce.timeout && (typeof config.salesforce.timeout !== 'number' || config.salesforce.timeout < 1000)) {
        errors.push('Salesforce timeout must be a number >= 1000ms');
      }
      if (config.salesforce.maxRetries && (typeof config.salesforce.maxRetries !== 'number' || config.salesforce.maxRetries < 0)) {
        errors.push('Salesforce max retries must be a number >= 0');
      }
    }

    // Validate features section
    if (config.features) {
      if (config.features.maxSavedSessions && (typeof config.features.maxSavedSessions !== 'number' || config.features.maxSavedSessions < 1)) {
        errors.push('Max saved sessions must be a number >= 1');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // ========================================
  // CONFIGURATION EXPORT/IMPORT
  // ========================================

  async exportConfiguration(): Promise<AppConfig> {
    return { ...this.appConfig };
  }

  async importConfiguration(config: Partial<AppConfig>): Promise<{ success: boolean; errors: string[] }> {
    const validation = this.validateConfiguration(config);
    
    if (validation.isValid) {
      this.appConfig = { ...this.appConfig, ...config };
      await this.saveConfiguration();
      return { success: true, errors: [] };
    } else {
      return { success: false, errors: validation.errors };
    }
  }

  // ========================================
  // CONFIGURATION MIGRATION
  // ========================================



  // ========================================
  // CONFIGURATION STATISTICS
  // ========================================

  async getConfigurationStats(): Promise<{
    totalSettings: number;
    lastModified: number;
    storageType: string;
  }> {
    const stats = await storageService.getStorageStats();
    return {
      totalSettings: Object.keys(this.appConfig).length,
      lastModified: Date.now(), // You could store this in the config
      storageType: stats.storageType
    };
  }
}

// Export singleton instance
export const configManager = ConfigurationManager.getInstance();
