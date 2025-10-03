import { configManager } from '../config/app.config';
import { logger } from './Logger';

// ========================================
// STORAGE SERVICE
// ========================================

export interface StorageOptions {
  encrypted?: boolean;
  namespace?: string;
  validate?: boolean;
}

export interface StorageBackend {
  get<T>(key: string, defaultValue?: T): T | null;
  set<T>(key: string, value: T): void;
  delete(key: string): void;
  has(key: string): boolean;
  clear(): void;
  getAll(): Record<string, any>;
}

export class StorageService {
  private static instance: StorageService;
  private constructor() {
    this.initializeBackends();
  }

  static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  private async initializeBackends(): Promise<void> {
    // Use localStorage for web app
    this.fallbackToLocalStorage();
  }

  private fallbackToLocalStorage(): void {
    logger.debug('Using localStorage fallback for storage', 'StorageService');
  }

  // ========================================
  // GENERAL SETTINGS & CONFIGURATION
  // ========================================

  /**
   * Store general application settings
   */
  async setSetting<T>(key: string, value: T, options: StorageOptions = {}): Promise<void> {
    // Use localStorage for web app
    const fullKey = options.namespace ? `soql_developer_${options.namespace}_${key}` : `soql_developer_${key}`;
    localStorage.setItem(fullKey, JSON.stringify(value));
  }

  /**
   * Retrieve general application settings
   */
  async getSetting<T>(key: string, defaultValue?: T, options: StorageOptions = {}): Promise<T | null> {
    // Use localStorage for web app
    const fullKey = options.namespace ? `soql_developer_${options.namespace}_${key}` : `soql_developer_${key}`;
    const stored = localStorage.getItem(fullKey);
    return stored ? JSON.parse(stored) : defaultValue || null;
  }

  // ========================================
  // SENSITIVE DATA (Credentials, Keys, etc.)
  // ========================================

  /**
   * Store sensitive data using system keychain
   */
  async setSecureData(service: string, account: string, password: string): Promise<void> {
    // Use localStorage for web app with warning
    logger.warn('Storing sensitive data in localStorage - not recommended for production', 'StorageService');
    const key = `soql_developer_secure_${service}_${account}`;
    localStorage.setItem(key, password);
  }

  /**
   * Retrieve sensitive data from system keychain
   */
  async getSecureData(service: string, account: string): Promise<string | null> {
    // Use localStorage for web app
    const key = `soql_developer_secure_${service}_${account}`;
    return localStorage.getItem(key);
  }

  /**
   * Delete sensitive data from system keychain
   */
  async deleteSecureData(service: string, account: string): Promise<boolean> {
    // Use localStorage for web app
    const key = `soql_developer_secure_${service}_${account}`;
    localStorage.removeItem(key);
    return true;
  }

  // ========================================
  // SESSION MANAGEMENT
  // ========================================

  /**
   * Store session data
   */
  async setSessionData(sessionId: string, data: any): Promise<void> {
    await this.setSetting(`session_${sessionId}`, data, { namespace: 'sessions' });
  }

  /**
   * Retrieve session data
   */
  async getSessionData(sessionId: string): Promise<any> {
    return await this.getSetting(`session_${sessionId}`, null, { namespace: 'sessions' });
  }

  /**
   * Get all session IDs
   */
  async getAllSessionIds(): Promise<string[]> {
    // Use localStorage for web app
    const sessionKeys = Object.keys(localStorage)
      .filter(key => key.startsWith('soql_developer_sessions_session_'))
      .map(key => key.replace('soql_developer_sessions_session_', ''));
    return sessionKeys;
  }

  // ========================================
  // CONFIGURATION MANAGEMENT
  // ========================================

  /**
   * Store application configuration
   */
  async setAppConfig(config: any): Promise<void> {
    await this.setSetting('appConfig', config, { namespace: 'config' });
  }

  /**
   * Retrieve application configuration
   */
  async getAppConfig(): Promise<any> {
    return await this.getSetting('appConfig', configManager.getAppConfig(), { namespace: 'config' });
  }

  /**
   * Store user preferences
   */
  async setUserPreferences(preferences: any): Promise<void> {
    await this.setSetting('userPreferences', preferences, { namespace: 'preferences' });
  }

  /**
   * Retrieve user preferences
   */
  async getUserPreferences(): Promise<any> {
    return await this.getSetting('userPreferences', {}, { namespace: 'preferences' });
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  /**
   * Clear all stored data
   */
  async clearAll(): Promise<void> {
    // Clear localStorage items that belong to this app
    const keysToRemove = Object.keys(localStorage)
      .filter(key => key.startsWith('soql_developer_'));
    keysToRemove.forEach(key => localStorage.removeItem(key));
  }

  /**
   * Export all data for backup
   */
  async exportData(): Promise<any> {
    // Export localStorage data
    const data: Record<string, any> = {};
    Object.keys(localStorage)
      .filter(key => key.startsWith('soql_developer_'))
      .forEach(key => {
        data[key] = localStorage.getItem(key);
      });
    return data;
  }

  /**
   * Import data from backup
   */
  async importData(data: any): Promise<void> {
    // Import to localStorage
    Object.entries(data).forEach(([key, value]) => {
      if (typeof value === 'string') {
        localStorage.setItem(key, value);
      }
    });
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{
    totalItems: number;
    total_size: number;
    storageType: string;
  }> {
    const appKeys = Object.keys(localStorage)
      .filter(key => key.startsWith('soql_developer_'));
    const total_size = appKeys.reduce((size, key) => {
      return size + (localStorage.getItem(key)?.length || 0);
    }, 0);
    return {
      totalItems: appKeys.length,
      total_size,
      storageType: 'localStorage'
    };
  }
}

// Export singleton instance
export const storageService = StorageService.getInstance();
