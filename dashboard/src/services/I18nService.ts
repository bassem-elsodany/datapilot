// Local-file-driven translations — no backend calls needed

import en from '../i18n/en.json';
import fr from '../i18n/fr.json';

type Translations = Record<string, string>;

const LOCALES: Record<string, Translations> = { en, fr };

// Metadata for the locale switcher UI
const LOCALE_META: Array<{ code: string; name: string }> = [
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'French' },
];

class I18nService {
  private static instance: I18nService;
  private currentLocale: string;
  private readonly fallbackLocale: string = 'en';

  private constructor() {
    const saved = localStorage.getItem('datapilot_locale') || 'en';
    this.currentLocale = LOCALES[saved] ? saved : 'en';
  }

  static getInstance(): I18nService {
    if (!I18nService.instance) {
      I18nService.instance = new I18nService();
    }
    return I18nService.instance;
  }

  // ── Core lookup ──────────────────────────────────────────────────────────

  private lookup(key: string): string | undefined {
    const dict = LOCALES[this.currentLocale];
    if (dict?.[key]) return dict[key];
    // Fallback to English
    return LOCALES[this.fallbackLocale]?.[key];
  }

  private replaceParams(text: string, params?: Record<string, string | number>): string {
    if (!params) return text;
    return text.replace(/\{(\w+)\}/g, (match, k) => params[k]?.toString() ?? match);
  }

  // ── Public translation API (same signatures as before) ───────────────────

  tSync(key: string, fallbackOrParams?: string | Record<string, string | number>, params?: Record<string, string | number>): string {
    let fallback: string | undefined;
    let actualParams: Record<string, string | number> | undefined;

    if (typeof fallbackOrParams === 'string') {
      fallback = fallbackOrParams;
      actualParams = params;
    } else {
      actualParams = fallbackOrParams;
    }

    const value = this.lookup(key);
    if (!value) return fallback ?? key;
    return this.replaceParams(value, actualParams);
  }

  async t(key: string, params?: Record<string, string | number>): Promise<string> {
    return this.tSync(key, undefined, params);
  }

  // ── Locale management ────────────────────────────────────────────────────

  async setLocale(locale: string): Promise<void> {
    const resolved = LOCALES[locale] ? locale : this.fallbackLocale;
    this.currentLocale = resolved;
    localStorage.setItem('datapilot_locale', resolved);
  }

  getCurrentLocale(): string {
    return this.currentLocale;
  }

  getFallbackLocale(): string {
    return this.fallbackLocale;
  }

  // ── Locale discovery (used by Settings UI) ───────────────────────────────

  async getAvailableLocales(): Promise<Array<{ code: string; name: string }>> {
    return LOCALE_META;
  }

  async getAvailableLocaleObjects(): Promise<Array<{ code: string; name: string }>> {
    return LOCALE_META;
  }

  async getAvailableLanguageObjects(): Promise<Array<{ code: string; name: string; uuid: string }>> {
    return LOCALE_META.map((l, i) => ({ ...l, uuid: `local-${i}` }));
  }

  // ── Compatibility stubs (callers exist but no-op is fine now) ────────────

  isReady(): boolean { return true; }
  async waitForReady(): Promise<void> {}
  async forceReloadTranslations(): Promise<void> {}
  async refreshCache(): Promise<void> {}
  clearCache(): void {}
  getCacheStats(): { totalKeys: number; totalLocales: number } {
    return { totalKeys: Object.keys(LOCALES[this.currentLocale] ?? {}).length, totalLocales: Object.keys(LOCALES).length };
  }
  getTranslationFromCache(locale: string, key: string): string | null {
    return LOCALES[locale]?.[key] ?? null;
  }
  isTranslationCached(locale: string, key: string): boolean {
    return key in (LOCALES[locale] ?? {});
  }
  async getLocaleData(): Promise<any[]> { return []; }
}

export const i18nService = I18nService.getInstance();

// ── React hook (identical surface area) ──────────────────────────────────────

export const useTranslation = () => ({
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
  waitForReady: i18nService.waitForReady.bind(i18nService),
});
