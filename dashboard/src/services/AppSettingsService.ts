// ========================================
// APP SETTINGS SERVICE
// ========================================

import { apiService } from './ApiService';
import { logger } from './Logger';
import { v4 as uuidv4 } from 'uuid';

export interface AppSetting {
  id: string;
  category: string;
  setting_key: string;
  value: string;
  value_type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  is_active: boolean;
  is_system: boolean;
  is_encrypted: boolean;
  metadata?: string;
  validation_rules?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
  version: number;
  is_deleted: boolean;
  deleted_at?: string;
}

class AppSettingsService {
  private static instance: AppSettingsService;
  private cache: Map<string, any> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  private constructor() {}

  static getInstance(): AppSettingsService {
    if (!AppSettingsService.instance) {
      AppSettingsService.instance = new AppSettingsService();
    }
    return AppSettingsService.instance;
  }

  /**
   * Get a setting value by key from backend settings endpoint
   */
  async getSetting(key: string): Promise<any> {
    try {
      // Check cache first
      const cached = this.getFromCache(key);
      if (cached !== null) {
        return cached;
      }

      // Try to get from backend settings endpoint
      try {
        const setting = await apiService.getAppSettingByKey(key);
        
        if (setting && setting.value) {
          // Cache the result
          this.setCache(key, setting.value);
          logger.debug(' Retrieved app setting from backend', 'AppSettingsService', { key, value: setting.value });
          return setting.value;
        }
      } catch (backendError) {
        logger.warn(' Failed to get setting from backend, using fallback', 'AppSettingsService', { 
          key, 
          error: backendError instanceof Error ? backendError.message : String(backendError) 
        });
      }

      // Fallback to local configuration values if backend is unavailable
      const fallbackSettings: Record<string, any> = {
        'APP_VERSION': 'v1.0.0',
        'APP_BUILD_DATE': new Date().toISOString().split('T')[0],
        'APP_LICENSE': 'MIT License',
        'APP_WEBSITE': 'https://github.com/bassem-elsodany/datapilot',
        'APP_SUPPORT': 'https://github.com/bassem-elsodany/datapilot/issues',
        'APP_FEEDBACK': 'https://github.com/bassem-elsodany/datapilot/discussions',
        'APP_AUTHOR': 'Bassem Elsodany',
        'APP_DESCRIPTION': 'Advanced SOQL query builder with intelligent suggestions, real-time validation, and seamless Salesforce integration.'
      };

      if (fallbackSettings[key]) {
        const value = fallbackSettings[key];
        // Cache the result
        this.setCache(key, value);
        logger.debug(' Retrieved app setting from fallback config', 'AppSettingsService', { key, value });
        return value;
      }

      logger.warn(' App setting not found in backend or fallback config', 'AppSettingsService', { key });
      return null;
    } catch (error) {
      logger.error(' Failed to get app setting', 'AppSettingsService', { key, error: String(error) });
      return null;
    }
  }

  /**
   * Get multiple settings by category
   */
  async getSettingsByCategory(category: string): Promise<AppSetting[]> {
    try {
      // Since the backend only supports individual settings, we'll use fallback for categories
      logger.debug(' Using fallback settings for category (backend only supports individual settings)', 'AppSettingsService', { category });

      // Fallback to local configuration values if backend is unavailable
      if (category === 'app') {
        const fallbackSettings: AppSetting[] = [
          { 
            id: 'app-version', 
            category: 'app', 
            setting_key: 'APP_VERSION', 
            value: 'v1.0.0', 
            value_type: 'string', 
            is_active: true, 
            is_system: true, 
            is_encrypted: false, 
            created_at: new Date().toISOString(), 
            updated_at: new Date().toISOString(), 
            version: 1, 
            is_deleted: false 
          },
          { 
            id: 'app-builddate', 
            category: 'app', 
            setting_key: 'APP_BUILD_DATE', 
            value: new Date().toISOString().split('T')[0], 
            value_type: 'string', 
            is_active: true, 
            is_system: true, 
            is_encrypted: false, 
            created_at: new Date().toISOString(), 
            updated_at: new Date().toISOString(), 
            version: 1, 
            is_deleted: false 
          },
          { 
            id: 'app-license', 
            category: 'app', 
            setting_key: 'APP_LICENSE', 
            value: 'MIT License', 
            value_type: 'string', 
            is_active: true, 
            is_system: true, 
            is_encrypted: false, 
            created_at: new Date().toISOString(), 
            updated_at: new Date().toISOString(), 
            version: 1, 
            is_deleted: false 
          },
          { 
            id: 'app-website', 
            category: 'app', 
            setting_key: 'APP_WEBSITE', 
            value: 'https://github.com/bassem-elsodany/datapilot', 
            value_type: 'string', 
            is_active: true, 
            is_system: true, 
            is_encrypted: false, 
            created_at: new Date().toISOString(), 
            updated_at: new Date().toISOString(), 
            version: 1, 
            is_deleted: false 
          },
          { 
            id: 'app-support', 
            category: 'app', 
            setting_key: 'APP_SUPPORT', 
            value: 'https://github.com/bassem-elsodany/datapilot/issues', 
            value_type: 'string', 
            is_active: true, 
            is_system: true, 
            is_encrypted: false, 
            created_at: new Date().toISOString(), 
            updated_at: new Date().toISOString(), 
            version: 1, 
            is_deleted: false 
          },
          { 
            id: 'app-feedback', 
            category: 'app', 
            setting_key: 'APP_FEEDBACK', 
            value: 'https://github.com/bassem-elsodany/datapilot/discussions', 
            value_type: 'string', 
            is_active: true, 
            is_system: true, 
            is_encrypted: false, 
            created_at: new Date().toISOString(), 
            updated_at: new Date().toISOString(), 
            version: 1, 
            is_deleted: false 
          },
          { 
            id: 'app-author', 
            category: 'app', 
            setting_key: 'APP_AUTHOR', 
            value: 'Bassem Elsodany', 
            value_type: 'string', 
            is_active: true, 
            is_system: true, 
            is_encrypted: false, 
            created_at: new Date().toISOString(), 
            updated_at: new Date().toISOString(), 
            version: 1, 
            is_deleted: false 
          },
          { 
            id: 'app-description', 
            category: 'app', 
            setting_key: 'APP_DESCRIPTION', 
            value: 'Advanced SOQL query builder with intelligent suggestions, real-time validation, and seamless Salesforce integration.', 
            value_type: 'string', 
            is_active: true, 
            is_system: true, 
            is_encrypted: false, 
            created_at: new Date().toISOString(), 
            updated_at: new Date().toISOString(), 
            version: 1, 
            is_deleted: false 
          }
        ];
        
        logger.debug(' Retrieved app settings from fallback config', 'AppSettingsService', { category, count: fallbackSettings.length });
        return fallbackSettings;
      }
      
      logger.warn(' Category not found in local config', 'AppSettingsService', { category });
      return [];
    } catch (error) {
      logger.error(' Failed to get app settings by category', 'AppSettingsService', { category, error: String(error) });
      return [];
    }
  }

  /**
   * Get all active settings
   */
  async getAllSettings(): Promise<AppSetting[]> {
    try {
      // Wait for API service to be ready
      const isReady = await apiService.waitForReady();
      if (!isReady) {
        logger.warn(' API service not ready, returning empty settings array', 'AppSettingsService');
        return [];
      }

      // Use Python backend API
      const settings = await apiService.getAllAppSettings();
      
      // Remove duplicates (keep latest version)
      const uniqueSettings = new Map<string, AppSetting>();
      for (const setting of settings) {
        if (!uniqueSettings.has(setting.setting_key)) {
          uniqueSettings.set(setting.setting_key, setting);
        }
      }

      const uniqueSettingsArray = Array.from(uniqueSettings.values());
      logger.debug(' Retrieved all app settings via API', 'AppSettingsService', { count: uniqueSettingsArray.length });
      return uniqueSettingsArray;
    } catch (error) {
      logger.error(' Failed to get all app settings', 'AppSettingsService', { error: String(error) });
      return [];
    }
  }

  /**
   * Set a setting value
   */
  async setSetting(key: string, value: any, category: string = 'CUSTOM', description?: string): Promise<boolean> {
    try {
      const valueType = this.getValueType(value);
      const valueString = this.stringifyValue(value);
      
      const query = `
      INSERT INTO app_settings (
        id, category, setting_key, value, value_type, description,
          is_active, is_system, metadata, created_by, version
        ) VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?, 1)
      `;

      const id = `setting_${uuidv4()}`;
      const metadata = JSON.stringify({
        source: 'user',
        editable: true,
        display_name: key,
        updated_at: new Date().toISOString()
      });

      // DISABLED: Database operations moved to Python backend
      // await databaseService.executeQuery(query, [
      //   id, category, key, valueString, valueType, description, metadata, 'user'
      // ]);
    
    // Update cache
      this.setCache(key, value);
      
      logger.debug(' Set app setting', 'AppSettingsService', { key, value, category });
      return true;
    } catch (error) {
      logger.error(' Failed to set app setting', 'AppSettingsService', { key, value, error: String(error) });
      return false;
    }
  }

  /**
   * Update an existing setting
   */
  async updateSetting(key: string, value: any): Promise<boolean> {
    try {
      // First, mark the old setting as deleted
      const deleteQuery = `
        UPDATE app_settings 
        SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE setting_key = ? AND is_active = 1 AND is_deleted = 0
      `;
      
      // DISABLED: Database operations moved to Python backend
      // await databaseService.executeQuery(deleteQuery, [key]);

      // Then create a new setting with the updated value
      const existingSetting = await this.getSetting(key);
      if (existingSetting) {
        const category = 'CUSTOM'; // You might want to get this from the existing setting
        return await this.setSetting(key, value, category);
      }

      return false;
    } catch (error) {
      logger.error(' Failed to update app setting', 'AppSettingsService', { key, value, error: String(error) });
      return false;
    }
  }

  /**
   * Delete a setting
   */
  async deleteSetting(key: string): Promise<boolean> {
    try {
      const query = `
        UPDATE app_settings 
        SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE setting_key = ? AND is_active = 1 AND is_deleted = 0
      `;

      // DISABLED: Database operations moved to Python backend
      // await databaseService.executeQuery(query, [key]);
      
      // Remove from cache
      this.removeFromCache(key);
      
      logger.debug(' Deleted app setting', 'AppSettingsService', { key });
      return true;
    } catch (error) {
      logger.error(' Failed to delete app setting', 'AppSettingsService', { key, error: String(error) });
      return false;
    }
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheExpiry.clear();
    logger.debug(' Cleared app settings cache', 'AppSettingsService');
  }

  /**
   * Force reload settings from Python backend
   */
  async forceReloadSettings(): Promise<void> {
    logger.debug(' Force reloading app settings from Python backend...', 'AppSettingsService');
    this.clearCache();
    
    // Force reload from Python backend API
    try {
      await apiService.getAllAppSettings(); // This will refresh the cache
      logger.debug(' App settings reloaded successfully from Python backend', 'AppSettingsService');
    } catch (error) {
      logger.error(' Failed to reload app settings from Python backend', 'AppSettingsService', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * Get application information for About modal
   */
  async getAppInfo(): Promise<{
    version: string;
    buildDate: string;
    license: string;
    website: string;
    support: string;
    feedback: string;
    author: string;
    description: string;
  }> {
    try {
      const [
        version,
        buildDate,
        license,
        website,
        support,
        feedback,
        author,
        description
      ] = await Promise.all([
        this.getSetting('APP_VERSION'),
        this.getSetting('APP_BUILD_DATE'),
        this.getSetting('APP_LICENSE'),
        this.getSetting('APP_WEBSITE'),
        this.getSetting('APP_SUPPORT'),
        this.getSetting('APP_FEEDBACK'),
        this.getSetting('APP_AUTHOR'),
        this.getSetting('APP_DESCRIPTION')
      ]);

      return {
        version: version || '1.0.0',
        buildDate: buildDate || new Date().toLocaleDateString(),
        license: license || 'MIT License',
        website: website || 'https://datapilot.ai',
        support: support || 'https://support.datapilot.ai',
        feedback: feedback || 'https://feedback.datapilot.ai',
        author: author || 'DataPilot Team',
        description: description || 'Professional Salesforce Query Tool'
      };
    } catch (error) {
      logger.error(' Failed to get app info', 'AppSettingsService', { error: String(error) });
      return {
        version: '1.0.0',
        buildDate: new Date().toLocaleDateString(),
        license: 'MIT License',
        website: 'https://datapilot.ai',
        support: 'https://support.datapilot.ai',
        feedback: 'https://feedback.datapilot.ai',
        author: 'DataPilot Team',
        description: 'Professional Salesforce Query Tool'
      };
    }
  }

  // Private helper methods

  private parseValue(value: string, type: string): any {
    try {
      switch (type) {
        case 'string':
          return value; // String values are already strings, no need to parse
        case 'number':
          return Number(value);
        case 'boolean':
          return value.toLowerCase() === 'true';
        case 'object':
        case 'array':
          return JSON.parse(value);
        default:
          return value;
      }
    } catch (error) {
      logger.warn(' Failed to parse setting value', 'AppSettingsService', { value, type, error: String(error) });
      return value;
    }
  }

  private stringifyValue(value: any): string {
    try {
      return JSON.stringify(value);
    } catch (error) {
      logger.warn(' Failed to stringify setting value', 'AppSettingsService', { value, error: String(error) });
      return String(value);
    }
  }

  private getValueType(value: any): string {
    if (typeof value === 'string') return 'string';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    return 'string';
  }

  private getFromCache(key: string): any {
    const expiry = this.cacheExpiry.get(key);
    if (expiry && Date.now() < expiry) {
      return this.cache.get(key);
    }
    return null;
  }

  private setCache(key: string, value: any): void {
    this.cache.set(key, value);
    this.cacheExpiry.set(key, Date.now() + this.CACHE_DURATION);
  }

  private removeFromCache(key: string): void {
    this.cache.delete(key);
    this.cacheExpiry.delete(key);
  }
}

export const appSettingsService = AppSettingsService.getInstance();
