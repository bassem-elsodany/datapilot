
// Database-driven translations only

import { apiService } from './ApiService';
import { appSettingsService } from './AppSettingsService';
import { logger } from './Logger';

// ========================================
// I18N SERVICE
// ========================================

class I18nService {
  private static instance: I18nService;
  private currentLocale: string;
  private fallbackLocale: string = 'en';
  private databaseInitialized: boolean = false;
  private translationCache: Map<string, string> = new Map(); // Cache for sync translations
  private reloadAttempts?: Set<string>; // Track reload attempts to prevent infinite loops
  private reloadTimeout?: NodeJS.Timeout; // Debounce reload attempts
  private lastReloadTime?: number; // Track when we last reloaded to prevent rapid reloads
  private initializationPromise?: Promise<void>; // Track ongoing initialization to prevent multiple concurrent calls
  private localeChangeTimeout?: NodeJS.Timeout; // Debounce locale changes to prevent infinite loops

  private constructor() {
    this.currentLocale = localStorage.getItem('datapilot_locale') || 'en';
    
    // Don't initialize immediately - wait for first use or explicit initialization
    logger.debug('I18nService created, will initialize on first use', 'I18nService');
  }

  static getInstance(): I18nService {
    if (!I18nService.instance) {
      I18nService.instance = new I18nService();
    }
    return I18nService.instance;
  }

  // ========================================
  // DATABASE INITIALIZATION
  // ========================================

  private async initializeDatabaseTranslations(): Promise<void> {
    // Prevent multiple concurrent initializations
    if (this.initializationPromise) {
      logger.debug('Initialization already in progress, waiting for completion', 'I18nService');
      return this.initializationPromise;
    }
    
    this.initializationPromise = this._doInitializeDatabaseTranslations();
    
    try {
      await this.initializationPromise;
    } finally {
      this.initializationPromise = undefined;
    }
  }
  
  private async _doInitializeDatabaseTranslations(): Promise<void> {
    const maxRetries = 3;
    const retryDelay = 1000; // 1 second
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.debug('Attempting to initialize translations', 'I18nService', { attempt, maxRetries });
        
        // Check if backend is available before making the call
        if (!apiService.isAvailable) {
          logger.debug('Backend not available, skipping translations load', 'I18nService');
          throw new Error('Backend not available');
        }
        
        // Use Python backend API to get translations
        const translations = await apiService.getTranslationsByLocale(this.currentLocale);
        logger.debug(' Received translations from API', 'I18nService', { 
          count: translations.length,
          locale: this.currentLocale
        });
        
                  // Populate the translation cache
          for (const translation of translations) {
            try {
              // translations_data is already a parsed object from the Python backend
              const translationsData = translation.translations_data || {};
              logger.debug(' Processing translation page', 'I18nService', { 
                pageName: translation.page_name,
                keysCount: Object.keys(translationsData).length
              });
              
              for (const [key, value] of Object.entries(translationsData)) {
                const cacheKey = `${this.currentLocale}:${key}`;
                this.translationCache.set(cacheKey, value as string);
              }
          } catch (error) {
            logger.warn(' Failed to process translation data', 'I18nService', { 
              pageName: translation.page_name,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }
        
        this.databaseInitialized = true;
        return; // Success, exit the retry loop
        
      } catch (error) {
        logger.error(' Failed to initialize Python backend translations', 'I18nService', { 
          attempt, 
          maxRetries, 
          error: error instanceof Error ? error.message : String(error) 
        });
        
        if (attempt === maxRetries) {
          // Last attempt failed, throw the error
          throw error;
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }



  // ========================================
  // TRANSLATION METHODS
  // ========================================

  // Get translation for a key (async version)
  async t(key: string, params?: { [key: string]: string | number }): Promise<string> {
    // Initialize on first use if not already initialized
    if (!this.databaseInitialized) {
      try {
        await this.initializeDatabaseTranslations();
      } catch (error) {
        logger.error('Failed to initialize translations on first use', 'I18nService', { error: error instanceof Error ? error.message : String(error) });
        return key; // Return key as fallback
      }
    }

    try {
      // Try current locale first
      let value = this.translationCache.get(key);
      
      // Fallback to default locale if not found
      if (!value && this.currentLocale !== this.fallbackLocale) {
        // Try to get fallback translations if not already loaded
        if (this.translationCache.size === 0) {
          await this.loadFallbackTranslations();
        }
        value = this.translationCache.get(key);
      }
      
      // Return key if no translation found
      if (!value) {
        return key;
      }
      
      return this.replaceParams(value, params);
    } catch (error) {
      logger.warn('Translation lookup failed', 'I18nService', { key, error: error instanceof Error ? error.message : String(error) });
      return key;
    }
  }

  private async loadFallbackTranslations(): Promise<void> {
    try {
      // Check if backend is available before making the call
      if (!apiService.isAvailable) {
        logger.debug('Backend not available, skipping fallback translations load', 'I18nService');
        return;
      }
      
      const translations = await apiService.getTranslationsByLocale(this.fallbackLocale);
      for (const translation of translations) {
        try {
          // translations_data is already a parsed object from the Python backend
          const translationsData = translation.translations_data || {};
          for (const [key, value] of Object.entries(translationsData)) {
            const cacheKey = `${this.fallbackLocale}:${key}`;
            this.translationCache.set(cacheKey, value as string);
          }
        } catch (error) {
          logger.warn(' Failed to process fallback translation data', 'I18nService', { 
            pageName: translation.page_name,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    } catch (error) {
      logger.warn(' Failed to load fallback translations', 'I18nService', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  // Get translation for a key (sync version for React components)
  tSync(key: string, fallbackOrParams?: string | { [key: string]: string | number }, params?: { [key: string]: string | number }): string {
    // Intelligently detect if second parameter is fallback string or params object
    let fallback: string | undefined;
    let actualParams: { [key: string]: string | number } | undefined;
    
    if (typeof fallbackOrParams === 'string') {
      // Second parameter is a fallback string
      fallback = fallbackOrParams;
      actualParams = params;
    } else if (fallbackOrParams && typeof fallbackOrParams === 'object') {
      // Second parameter is params object (old signature)
      actualParams = fallbackOrParams;
    }
    
    // If database is not initialized yet, return fallback or key and trigger async initialization
    if (!this.databaseInitialized) {
      // Only trigger initialization if not already in progress
      if (!this.initializationPromise) {
        this.initializationPromise = this.initializeDatabaseTranslations().catch(error => {
          logger.warn(' Failed to initialize translations', 'I18nService', { key, error: error instanceof Error ? error.message : String(error) });
          // Clear the promise so it can be retried later
          this.initializationPromise = undefined;
        });
      }
      return fallback || key;
    }
    
    // Try current locale first using local cache
    let value = this.translationCache.get(`${this.currentLocale}:${key}`);
    
    // Try fallback locale if not found
    if (!value && this.currentLocale !== this.fallbackLocale) {
      // Try to get fallback translations if not already loaded
      if (this.translationCache.size === 0) {
        // Trigger async fallback loading in background
        this.loadFallbackTranslations().catch(error => {
          logger.warn(' Failed to load fallback translations', 'I18nService', { error: error instanceof Error ? error.message : String(error) });
        });
      }
      value = this.translationCache.get(`${this.fallbackLocale}:${key}`);
    }
    
    // If translation not found, return fallback string or key
    if (!value) {
      return fallback || key;
    }
    
    return this.replaceParams(value, actualParams);
  }

  // Replace parameters in translation string
  private replaceParams(text: string, params?: { [key: string]: string | number }): string {
    if (!params) return text;
    
    logger.debug('Replacing parameters in translation text', 'I18nService', { textLength: text.length, paramCount: Object.keys(params).length });
    
    const result = text.replace(/\{(\w+)\}/g, (match, key) => {
      const paramValue = params[key];
      const replacement = paramValue?.toString() || match;
      return replacement;
    });
    
    logger.debug('Parameter replacement completed', 'I18nService', { originalLength: text.length, resultLength: result.length });
    return result;
  }

  // ========================================
  // LOCALE MANAGEMENT
  // ========================================

  async setLocale(locale: string): Promise<void> {
    // Prevent rapid locale changes that could cause infinite loops
    if (this.localeChangeTimeout) {
      clearTimeout(this.localeChangeTimeout);
    }
    
    return new Promise((resolve) => {
      this.localeChangeTimeout = setTimeout(async () => {
        try {
          this.currentLocale = locale;
          localStorage.setItem('datapilot_locale', locale);
          
          // Clear translation cache to force reload with new locale
          this.translationCache.clear();
          
          // Re-initialize database translations for the new locale
          if (this.databaseInitialized) {
            await this.initializeDatabaseTranslations();
          }
          
          logger.debug('Locale changed and cache cleared', 'I18nService', { locale });
          resolve();
        } catch (error) {
          logger.error('Failed to set locale', 'I18nService', null, error as Error);
          resolve(); // Resolve anyway to prevent hanging
        }
      }, 500); // Debounce locale changes by 500ms
    });
  }

  getCurrentLocale(): string {
    return this.currentLocale;
  }

  getFallbackLocale(): string {
    return this.fallbackLocale;
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  isReady(): boolean {
    return this.databaseInitialized;
  }

  async waitForReady(): Promise<void> {
    if (this.databaseInitialized) {
      return;
    }
    
    logger.debug(' Initializing translations for waitForReady...', 'I18nService');
    
    try {
      // Actually trigger the initialization instead of just waiting
      await this.initializeDatabaseTranslations();
      logger.debug(' Database initialization completed, translations ready', 'I18nService');
    } catch (error) {
      logger.error(' Failed to initialize translations in waitForReady', 'I18nService', null, error as Error);
      throw new Error('Database initialization timeout - translations not available');
    }
  }

  async getAvailableLocales(): Promise<Array<{code: string, name: string}>> {
    try {
      // Check if backend is available before making the call
      if (!apiService.isAvailable) {
        logger.debug(' Backend not available, returning fallback locales', 'I18nService');
        return [{ code: 'en', name: 'English' }];
      }
      
      const localeObjects = await apiService.getAvailableLocales();
      return localeObjects;
    } catch (error) {
      logger.warn(' Failed to get available locales, returning fallback', 'I18nService', { error: error instanceof Error ? error.message : String(error) });
      return [{ code: 'en', name: 'English' }];
    }
  }

  async getAvailableLocaleObjects(): Promise<Array<{code: string, name: string}>> {
    try {
      // Check if backend is available before making the call
      if (!apiService.isAvailable) {
        logger.debug(' Backend not available, returning fallback locale objects', 'I18nService');
        return [{ code: 'en', name: 'English' }];
      }
      
      const localeObjects = await apiService.getAvailableLocaleObjects();
      
      const locales = localeObjects.map(locale => ({
        code: locale.language_code,
        name: locale.language_name
      }));
      
      logger.debug(' Mapped active locales from API:', 'I18nService', { locales });
      return locales;
    } catch (error) {
      logger.warn(' Failed to get available locale objects, returning fallback', 'I18nService', { error: error instanceof Error ? error.message : String(error) });
      return [{ code: 'en', name: 'English' }];
    }
  }

  async getAvailableLanguageObjects(): Promise<Array<{code: string, name: string, uuid: string}>> {
    try {
      // Check if backend is available before making the call
      if (!apiService.isAvailable) {
        logger.debug(' Backend not available, returning fallback language objects', 'I18nService');
        return [{ code: 'en', name: 'English', uuid: '550e8400-e29b-41d4-a716-446655440000' }];
      }
      
      // Call the correct endpoint that returns full language objects (only active languages)
      const languageObjects = await apiService.getAllLanguagesWithFilter(true);
      
      const languages = languageObjects.map((lang: any) => ({
        code: lang.language_code,
        name: lang.language_name,
        uuid: lang.language_uuid
      }));
      
      logger.debug(' Mapped active languages from API:', 'I18nService', { languages });
      return languages;
    } catch (error) {
      logger.warn(' Failed to get available language objects, returning fallback', 'I18nService', { error: error instanceof Error ? error.message : String(error) });
      return [{ code: 'en', name: 'English', uuid: '550e8400-e29b-41d4-a716-446655440000' }];
    }
  }

  async getLocaleData(): Promise<any[]> {
    if (!this.databaseInitialized) {
      return [];
    }

    try {
      // Check if backend is available before making the call
      if (!apiService.isAvailable) {
        logger.debug(' Backend not available, returning empty locale data', 'I18nService');
        return [];
      }
      
      const localeObjects = await apiService.getAvailableLocaleObjects();
      const localeData: any[] = [];
      
      for (const localeObj of localeObjects) {
        const locale = localeObj.language_code;
        const translations = await apiService.getTranslationsByLocale(locale);
        const pages: Record<string, Record<string, string>> = {};
        
        for (const translation of translations) {
          try {
            const translationsData = JSON.parse(translation.translations_data || '{}');
            pages[translation.page_name] = translationsData;
          } catch (error) {
            logger.warn('Failed to parse translation data for locale', 'I18nService', { 
              locale, 
              pageName: translation.page_name,
              error: error instanceof Error ? error.message : String(error) 
            });
          }
        }
        
        localeData.push({
          locale,
          name: localeObj.language_name,
          nativeName: localeObj.native_name,
          pages,
          lastUpdated: new Date()
        });
      }
      
      return localeData;
    } catch (error) {
      logger.warn('Failed to get locale data', 'I18nService', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  }

  // ========================================
  // CACHE UTILITIES
  // ========================================

  getTranslationFromCache(locale: string, key: string): string | null {
    const cacheKey = `${locale}:${key}`;
    return this.translationCache.get(cacheKey) || null;
  }

  isTranslationCached(locale: string, key: string): boolean {
    return this.getTranslationFromCache(locale, key) !== null;
  }

  // Force reload all translations
  async forceReloadTranslations(): Promise<void> {
    try {
      logger.debug(' Force reloading translations from Python backend...', 'I18nService');
      this.translationCache.clear();
      await this.initializeDatabaseTranslations();
    } catch (error) {
      logger.error('Failed to force reload translations', 'I18nService', null, error as Error);
      throw error;
    }
  }

  getCacheStats(): { totalKeys: number; totalLocales: number } {
    const locales = new Set<string>();
    let totalKeys = 0;
    
    for (const cacheKey of this.translationCache.keys()) {
      const [locale] = cacheKey.split(':');
      locales.add(locale);
      totalKeys++;
    }
    
    return {
      totalKeys,
      totalLocales: locales.size
    };
  }

  clearCache(): void {
    this.translationCache.clear();
  }

  async refreshCache(): Promise<void> {
    if (this.databaseInitialized) {
      // Clear local cache
      this.clearCache();
      
      // Force reload from Python backend
      await this.forceReloadTranslations();
      
      logger.debug(' Translation cache refreshed from database', 'I18nService');
    }
  }
  
  // Auto-reload translations if missing (with safeguards against infinite loops)
  private autoReloadIfMissing(key: string): void {
    // Use a simple in-memory set to track reload attempts
    if (!this.reloadAttempts) {
      this.reloadAttempts = new Set<string>();
    }
    
    // Only reload if we haven't tried this key recently and we haven't exceeded max attempts
    const maxReloadAttempts = 2; // Reduced from 3 to 2
    if (!this.reloadAttempts.has(key) && this.reloadAttempts.size < maxReloadAttempts) {
      this.reloadAttempts.add(key);
      
      // Debounce the reload to prevent multiple rapid reloads
      if (this.reloadTimeout) {
        clearTimeout(this.reloadTimeout);
      }
      
      this.reloadTimeout = setTimeout(async () => {
        try {
          logger.debug(' Auto-reloading translations due to missing key', 'I18nService', { key, attempts: this.reloadAttempts?.size });
          
          // Only reload if we haven't already reloaded recently
          const now = Date.now();
          if (!this.lastReloadTime || (now - this.lastReloadTime) > 5000) { // 5 second cooldown
            this.lastReloadTime = now;
            await this.forceReloadTranslations();
            
            // Clear reload attempts after successful reload
            this.reloadAttempts?.clear();
          } else {
            logger.debug(' Skipping reload due to recent reload', 'I18nService', { 
              timeSinceLastReload: now - this.lastReloadTime 
            });
          }
        } catch (error) {
          logger.warn(' Failed to auto-reload translations', 'I18nService', { error: error instanceof Error ? error.message : String(error) });
        }
      }, 3000); // Increased from 2 to 3 seconds to prevent rapid loops
    } else if (this.reloadAttempts.size >= maxReloadAttempts) {
      logger.warn(' Maximum auto-reload attempts reached, stopping to prevent infinite loop', 'I18nService', { 
        key, 
        attempts: this.reloadAttempts.size,
        maxAttempts: maxReloadAttempts 
      });
    }
  }
}

export const i18nService = I18nService.getInstance();

// ========================================
// REACT HOOK
// ========================================

export const useTranslation = () => {
  return {
    t: i18nService.t.bind(i18nService),
    tSync: i18nService.tSync.bind(i18nService),
    setLocale: i18nService.setLocale.bind(i18nService),
    getCurrentLocale: i18nService.getCurrentLocale.bind(i18nService),
    getAvailableLocales: i18nService.getAvailableLocales.bind(i18nService),
    getAvailableLocaleObjects: i18nService.getAvailableLocaleObjects.bind(i18nService),
    getAvailableLanguageObjects: i18nService.getAvailableLanguageObjects.bind(i18nService),
    getLocaleData: i18nService.getLocaleData.bind(i18nService),
    getTranslationFromCache: i18nService.getTranslationFromCache.bind(i18nService),
    isTranslationCached: i18nService.isTranslationCached.bind(i18nService),
    getCacheStats: i18nService.getCacheStats.bind(i18nService),
    clearCache: i18nService.clearCache.bind(i18nService),
    refreshCache: i18nService.refreshCache.bind(i18nService),
    forceReloadTranslations: i18nService.forceReloadTranslations.bind(i18nService),
    isReady: i18nService.isReady.bind(i18nService),
    waitForReady: i18nService.waitForReady.bind(i18nService)
  };
};
