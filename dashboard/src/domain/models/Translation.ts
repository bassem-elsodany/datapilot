// ========================================
// TRANSLATION DOMAIN MODEL
// ========================================

import { BaseEntity, BaseEntityModel } from './BaseEntity';

/**
 * TRANSLATION - Database-stored Translations
 * Purpose: Store application translations in database as JSON data per page/language
 * Lifecycle: Application-wide, managed by administrators
 */
export interface Translation extends BaseEntity {
  id: string; // Unique translation identifier (e.g., 'en_app', 'en_auth')
  locale: string; // Language code (e.g., 'en', 'es', 'fr', 'de')
  pageName: string; // Page name (e.g., 'app', 'auth', 'masterKey')
  translationsData: string; // JSON string containing all translations for this page/language
  description?: string; // Description of the translation context
  isActive: boolean; // Whether the translation is active
  isSystem: boolean; // Whether it's a system translation (cannot be deleted)
  metadata?: Record<string, any>; // Additional metadata
}

/**
 * TRANSLATION_GROUP - Grouped Translations
 * Purpose: Group translations by page and locale for easier management
 */
export interface TranslationGroup {
  locale: string;
  pageName: string;
  translations: Record<string, string>; // key -> value mapping
  lastUpdated: Date;
  completionPercentage: number;
}

/**
 * TRANSLATION_STATS - Translation Statistics
 * Purpose: Track translation completion and statistics
 */
export interface TranslationStats {
  totalKeys: number;
  totalTranslations: number;
  completedLocales: Record<string, number>; // locale -> completion percentage
  missingTranslations: Record<string, string[]>; // locale -> missing keys
  pageCounts: Record<string, number>; // page -> count
  totalLocales: number;
  totalPages: number;
}

/**
 * TRANSLATION_IMPORT - Import Structure
 * Purpose: Structure for importing translations from files
 */
export interface TranslationImport {
  locale: string;
  pageName: string;
  translations: Record<string, string>; // key -> value mapping
  metadata?: {
    version?: string;
    lastUpdated?: Date;
    translator?: string;
    notes?: string;
  };
}

export interface CreateTranslationRequest {
  id: string;
  locale: string;
  pageName: string;
  translationsData: string; // JSON string
  description?: string;
  isActive?: boolean;
  isSystem?: boolean;
  metadata?: Record<string, any>;
  createdBy?: string;
}

export interface UpdateTranslationRequest {
  translationsData?: string; // JSON string
  description?: string;
  isActive?: boolean;
  metadata?: Record<string, any>;
  updatedBy?: string;
}

export interface TranslationSearchFilters {
  locale?: string;
  pageName?: string;
  isActive?: boolean;
  isSystem?: boolean;
}

export interface TranslationListOptions {
  limit?: number;
  offset?: number;
  sortBy?: 'pageName' | 'locale' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
}

export class TranslationModel extends BaseEntityModel<Translation> {
  private _locale: string;
  private _pageName: string;
  private _translationsData: string;
  private _description?: string;
  private _isActive: boolean;
  private _isSystem: boolean;
  private _metadata?: Record<string, any>;

  constructor(translation: Translation) {
    super(translation);
    this._id = translation.id as string;
    this._locale = translation.locale;
    this._pageName = translation.pageName;
    this._translationsData = translation.translationsData;
    this._description = translation.description;
    this._isActive = translation.isActive;
    this._isSystem = translation.isSystem;
    this._metadata = translation.metadata;
  }

  // ========================================
  // GETTERS
  // ========================================

  get id(): string { return this._id as string; }
  get locale(): string { return this._locale; }
  get pageName(): string { return this._pageName; }
  get translationsData(): string { return this._translationsData; }
  get description(): string | undefined { return this._description; }
  get isTranslationActive(): boolean { return this._isActive; }
  get isSystem(): boolean { return this._isSystem; }
  get metadata(): Record<string, any> | undefined { return this._metadata; }

  // ========================================
  // BUSINESS LOGIC
  // ========================================

  /**
   * Update translation
   */
  update(updates: UpdateTranslationRequest): void {
    if (updates.translationsData !== undefined) {
      this._translationsData = updates.translationsData;
    }
    if (updates.description !== undefined) {
      this._description = updates.description;
    }
    if (updates.isActive !== undefined) {
      this._isActive = updates.isActive;
    }
    if (updates.metadata !== undefined) {
      this._metadata = { ...this._metadata, ...updates.metadata };
    }
    this.markUpdated(updates.updatedBy);
  }

  /**
   * Activate translation
   */
  activate(activatedBy?: string): void {
    this._isActive = true;
    this.markUpdated(activatedBy);
  }

  /**
   * Deactivate translation
   */
  deactivate(deactivatedBy?: string): void {
    this._isActive = false;
    this.markUpdated(deactivatedBy);
  }

  /**
   * Check if translation is for a specific locale
   */
  isForLocale(locale: string): boolean {
    return this._locale === locale;
  }

  /**
   * Check if translation is for a specific page
   */
  isForPage(pageName: string): boolean {
    return this._pageName === pageName;
  }

  /**
   * Check if translation is system translation
   */
  isSystemTranslation(): boolean {
    return this._isSystem;
  }

  /**
   * Get translation path (locale.pageName)
   */
  getPath(): string {
    return `${this._locale}.${this._pageName}`;
  }

  /**
   * Validate translation
   */
  validate(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this._id || (typeof this._id === 'string' && this._id.trim().length === 0)) {
      errors.push('Translation ID is required');
    }

    if (!this._locale || this._locale.trim().length === 0) {
      errors.push('Locale is required');
    }

    if (!this._pageName || this._pageName.trim().length === 0) {
      errors.push('Page name is required');
    }

    if (!this._translationsData || this._translationsData.trim().length === 0) {
      errors.push('Translations data is required');
    }

    // Validate locale format
    if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(this._locale)) {
      errors.push('Invalid locale format. Use format: en, en-US, es, etc.');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Convert to plain object
   */
  toJSON(): Translation {
    return {
      ...this.getBaseEntityData(),
      id: this._id as string,
      locale: this._locale,
      pageName: this._pageName,
      translationsData: this._translationsData,
      description: this._description,
      isActive: this._isActive,
      isSystem: this._isSystem,
      metadata: this._metadata
    };
  }

  /**
   * Create a new translation instance
   */
  static create(data: CreateTranslationRequest): TranslationModel {
    const translation: Translation = {
      id: data.id,
      locale: data.locale,
      pageName: data.pageName,
      translationsData: data.translationsData,
      description: data.description,
      isActive: data.isActive ?? true,
      isSystem: data.isSystem ?? false,
      metadata: data.metadata,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: data.createdBy
    };
    
    return new TranslationModel(translation);
  }

  /**
   * Create translation from nested object structure
   * This method now creates a single translation record with JSON data for a page
   */
  static createFromNestedObject(
    locale: string,
    pageName: string,
    nestedObject: Record<string, any>,
    parentKey: string = '',
    createdBy?: string
  ): TranslationModel {
    // Flatten the nested object into key-value pairs
    const flattenedTranslations: Record<string, string> = {};
    
    const flattenObject = (obj: Record<string, any>, prefix: string = '') => {
      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        
        if (typeof value === 'string') {
          flattenedTranslations[fullKey] = value;
        } else if (typeof value === 'object' && value !== null) {
          flattenObject(value, fullKey);
        }
      }
    };
    
    flattenObject(nestedObject);
    
    // Create a single translation record with JSON data
    const translation = TranslationModel.create({
      id: `${locale}_${pageName}`,
      locale,
      pageName,
      translationsData: JSON.stringify(flattenedTranslations),
      description: `Translations for ${pageName} page in ${locale}`,
      createdBy
    });
    
    return translation;
  }

  /**
   * Convert translation record back to nested object structure
   */
  static translationToNestedObject(translation: TranslationModel): Record<string, any> {
    try {
      const translationsData = JSON.parse(translation.translationsData);
      const result: Record<string, any> = {};

      for (const [key, value] of Object.entries(translationsData)) {
        const keys = key.split('.');
        let current = result;

        // Navigate to the nested location
        for (let i = 0; i < keys.length - 1; i++) {
          const keyPart = keys[i];
          if (!(keyPart in current)) {
            current[keyPart] = {};
          }
          current = current[keyPart];
        }

        // Set the final value
        const finalKey = keys[keys.length - 1];
        current[finalKey] = value;
      }

      return result;
    } catch (error) {
      // Note: Can't use logger here as it might cause circular dependency
      // This is a fallback error handling
      return {};
    }
  }
}
