// ========================================
// TRANSLATION SERVICE - STUB FOR BUILD
// ========================================

// DISABLED: TranslationService temporarily disabled during migration
// This is a stub file to prevent build errors

export interface TranslationCache {
  [locale: string]: {
    [pageName: string]: {
      [key: string]: string;
    };
  };
}

export class TranslationService {
  private static instance: TranslationService;
  private translationCache: TranslationCache = {};
  private isInitialized = false;

  static getInstance(): TranslationService {
    if (!TranslationService.instance) {
      TranslationService.instance = new TranslationService();
    }
    return TranslationService.instance;
  }

  async initialize(): Promise<void> {
    // DISABLED: Initialization moved to Python backend
    this.isInitialized = true;
  }

  async loadTranslationCache(): Promise<void> {
    // DISABLED: Cache loading moved to Python backend
  }

  async getTranslation(locale: string, pageName: string, key: string): Promise<string | null> {
    // DISABLED: Translation lookup moved to Python backend
    return null;
  }

  async getAllTranslations(): Promise<any> {
    // DISABLED: All translations moved to Python backend
    return {};
  }

  async getTranslationsByLocale(locale: string): Promise<any> {
    // DISABLED: Locale translations moved to Python backend
    return {};
  }

  async getTranslationsByPage(locale: string, pageName: string): Promise<any> {
    // DISABLED: Page translations moved to Python backend
    return {};
  }

  async searchTranslations(query: string, locale?: string): Promise<any> {
    // DISABLED: Translation search moved to Python backend
    return [];
  }

  async getTranslationStats(): Promise<any> {
    // DISABLED: Translation stats moved to Python backend
    return {};
  }

  async clearCache(): Promise<void> {
    // DISABLED: Cache clearing moved to Python backend
  }

  async forceReloadCache(): Promise<void> {
    // DISABLED: Cache reload moved to Python backend
  }

  getTranslationFromCache(locale: string, pageName: string, key: string): string | null {
    // DISABLED: Cache lookup moved to Python backend
    return null;
  }
}

export const translationService = TranslationService.getInstance();
