/**
 * API Service - HTTP calls to Python backend
 * This service handles all API communication with the backend
 */

// ========================================
// API SERVICE - Python Backend Integration
// ========================================

import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { logger } from './Logger';
import { connectionManager } from './ConnectionManager';
import { configManager, AppConfig } from '../config/app.config';
import { i18nService } from './I18nService';
import { notificationService } from './NotificationService';
import { setSessionContextProvider } from '../contexts/SessionContext';

// Session context provider for API calls
let sessionContextProvider: (() => { masterKey: string; connectionUuid: string | null; isConnected: boolean }) | null = null;

// Function to set up API service session context from SessionContext
export const setApiSessionContextProvider = (provider: (() => { masterKey: string; connectionUuid: string | null; isConnected: boolean }) | null) => {
  sessionContextProvider = provider;
};

const getMasterKeyFromSession = (): string => {
      logger.debug('Getting master key from session', 'ApiService', { 
        hasSessionContextProvider: !!sessionContextProvider 
      });
  
  if (sessionContextProvider) {
    try {
      const result = sessionContextProvider();
      logger.debug('Master key retrieved from session', 'ApiService', {
        masterKeyType: typeof result.masterKey,
        masterKeyLength: result.masterKey?.length
      });
      return result.masterKey;
    } catch (error) {
      logger.error('Error calling sessionContextProvider', 'ApiService', error);
      throw new Error('Session context provider error: ' + (error as Error).message);
    }
  }
  throw new Error('Session context provider not set');
};

const getConnectionUuidFromSession = (): string | null => {
  if (sessionContextProvider) {
    try {
      const result = sessionContextProvider();
      return result.connectionUuid;
    } catch (error) {
      logger.error('Error calling sessionContextProvider for connectionUuid', 'ApiService', error);
      throw new Error('Session context provider error: ' + (error as Error).message);
    }
  }
  throw new Error('Session context provider not set');
};

const getIsConnectedFromSession = (): boolean => {
  if (sessionContextProvider) {
    return sessionContextProvider().isConnected;
  }
  return false;
};

// ========================================
// TYPES
// ========================================

export interface SaveConnectionParams {
  displayName: string;
  authProviderUuid: string;
  username: string;
  password: string;
  environment: string;
  consumerKey?: string;
  consumerSecret?: string;
  securityToken?: string;
  clientId?: string;
  clientSecret?: string;
}

export interface ConnectionResponse {
  connection_uuid: string;
  display_name: string;
  auth_provider_id: string;
  connection_data: {
    username: string;
    password: string;
    environment: string;
    consumer_key?: string;
    consumer_secret?: string;
    security_token?: string;
    client_id?: string;
    client_secret?: string;
  };
  created_at: string;
  updated_at: string;
  created_by: string;
  is_connection_active: boolean;
  last_used: string;
}

// ========================================
// API SERVICE CLASS
// ========================================

export class ApiService {
  private static instance: ApiService;
  private client: AxiosInstance;
  public isAvailable: boolean = false;
  private baseUrl: string;
  private onConnectionError?: () => void;
  private lastConnectionErrorTime: number = 0;
  private connectionErrorDebounceMs: number = 2000; // 2 seconds // Callback for connection errors
  private translationsCache: Map<string, { data: any[], timestamp: number }> = new Map(); // Cache for translations
  private constructor() {
    // Get configuration from app config
    this.baseUrl = this.getBaseUrlFromConfig();

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.getTimeoutFromConfig(),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error('API request failed', 'ApiService', {
          url: error.config?.url,
          method: error.config?.method,
          status: error.response?.status,
          data: error.response?.data
        }, error);
        
        // Skip automatic notifications for query execution errors - they are handled specifically in App.tsx
        const isQueryExecution = error.config?.url?.includes('/queries/execute');
        if (isQueryExecution) {
          return Promise.reject(error);
        }
        
        // Check for connection errors FIRST and handle them without showing notifications
        const errorDetail = error.response?.data?.detail;
        const errorMessage = errorDetail?.message || error.message || '';
        const isConnectionError = 
          errorDetail?.error_code === 'no_connection' ||
          errorDetail?.error_code === 'invalid_connection' ||
          (typeof errorDetail === 'string' && (
            errorDetail.includes('No active Salesforce connection') ||
            errorDetail.includes('Master key not set') ||
            errorDetail.includes('authentication')
          )) ||
          errorMessage.includes('No active Salesforce connection') ||
          errorMessage.includes('Master key not set') ||
          errorMessage.includes('saved_query.error.invalid_connection') ||
          errorMessage.includes('authentication') ||
          // Check for specific connection-related field errors
          (errorDetail?.field_errors?.connection && 
           !errorDetail.field_errors.connection.includes('saved_query.error.duplicate_name'));
          
        if (isConnectionError) {
          const now = Date.now();
          const timeSinceLastError = now - this.lastConnectionErrorTime;
          
          // Only show notification and trigger callback if enough time has passed since last connection error
          if (timeSinceLastError >= this.connectionErrorDebounceMs) {
            logger.error('Salesforce connection error detected, redirecting to connections page', 'ApiService', {
              errorCode: errorDetail?.error_code,
              errorMessage: error.message,
              errorDetail: errorDetail
            });
            
            // Show ONE notification for connection errors
            notificationService.apiError(error, 'Request Error');
            
            if (this.onConnectionError) {
              this.onConnectionError();
            }
            
            // Update the last error time
            this.lastConnectionErrorTime = now;
          } else {
            logger.debug('Connection error debounced, skipping notification and redirect', 'ApiService', {
              timeSinceLastError,
              debounceMs: this.connectionErrorDebounceMs
            });
          }
          
          // Skip further processing after handling connection error
          return Promise.reject(error);
        }
        
        // Handle different types of errors with appropriate notifications (only for non-connection errors)
        if (error.code === 'NETWORK_ERROR' || error.code === 'ECONNABORTED' || !error.response) {
          // Network/connection errors
          notificationService.connectionError(error);
        } else if (error.response?.status === 401) {
          // Authentication errors
          notificationService.authenticationError(error);
        } else if (error.response?.status >= 500) {
          // Server errors
          notificationService.apiError(error, 'Server Error');
        } else if (error.response?.status >= 400) {
          // Client errors (validation, etc.)
          notificationService.apiError(error, 'Request Error');
        } else {
          // Other errors
          notificationService.apiError(error);
        }
        
        return Promise.reject(error);
      }
    );

    // Initialize availability check asynchronously
    this.initializeAvailability();
  }

  private async initializeAvailability(): Promise<void> {
    try {
      await this.checkAvailability();
    } catch (error) {
      logger.error('ApiService initialization failed', 'ApiService', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  static getInstance(): ApiService {
    if (!ApiService.instance) {
      ApiService.instance = new ApiService();
    }
    return ApiService.instance;
  }

  /**
   * Set callback for connection errors
   */
  setConnectionErrorCallback(callback: () => void): void {
    this.onConnectionError = callback;
  }

  /**
   * Get current locale for API requests
   */
  private getCurrentLang(): string {
    return i18nService.getCurrentLocale();
  }

  /**
   * Helper method to add lang parameter to requests
   */
  private addLangParam(params?: any): any {
    const lang = this.getCurrentLang();
    if (params) {
      return { ...params, lang };
    }
    return { lang };
  }

  /**
   * Helper method to add lang parameter to URL
   */
  private addLangToUrl(url: string): string {
    const lang = this.getCurrentLang();
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}lang=${lang}`;
  }

  /**
   * Check backend health status
   */
  async checkBackendHealth(): Promise<{ status: 'healthy' | 'unhealthy'; timestamp: string }> {
    try {
      const healthUrl = `${this.baseUrl}/api/v1/health`;
      const response = await axios.get(healthUrl, { timeout: 5000 });
      
      if (response.status === 200 && response.data?.status === 'healthy') {
        return {
          status: 'healthy',
          timestamp: new Date().toISOString()
        };
      } else {
        return {
          status: 'unhealthy',
          timestamp: new Date().toISOString()
        };
      }
    } catch (error) {
      logger.warn('Backend health check failed', 'ApiService', { error: error instanceof Error ? error.message : String(error) });
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString()
      };
    }
  }

  // ========================================
  // CONFIGURATION METHODS
  // ========================================

  private getBaseUrlFromConfig(): string {
    return configManager.getApiBaseUrl();
  }

  private getTimeoutFromConfig(): number {
    return configManager.getApiConfig().timeout;
  }

  // Helper method to get full URL for any endpoint
  private getEndpointUrl(endpoint: keyof AppConfig['api']['endpoints']): string {
    return configManager.getApiUrl(endpoint as keyof AppConfig['api']['endpoints']);
  }

  /**
   * Generic GET request method for external services
   */
  async get(url: string, config?: any): Promise<any> {
    return this.client.get(url, config);
  }

  /**
   * Generic POST request method for external services
   */
  async post(url: string, data?: any, config?: any): Promise<any> {
    return this.client.post(url, data, config);
  }

  /**
   * Generic PUT request method for external services
   */
  async put(url: string, data?: any, config?: any): Promise<any> {
    return this.client.put(url, data, config);
  }

  /**
   * Generic DELETE request method for external services
   */
  async delete(url: string, config?: any): Promise<any> {
    return this.client.delete(url, config);
  }

  /**
   * Clear translations cache
   */
  clearTranslationsCache(): void {
    this.translationsCache.clear();
    logger.debug(' Translations cache cleared', 'ApiService');
  }

  // ========================================
  // AVAILABILITY CHECK
  // ========================================

  private async checkAvailability(): Promise<void> {
    try {
      const healthUrl = configManager.getApiUrl('health');
      const response = await axios.get(healthUrl, { timeout: 5000 });
      this.isAvailable = response.status === 200 && response.data?.status === 'healthy';
      if (this.isAvailable) {
      } else {
        logger.error('Python backend health check failed', 'ApiService', { status: response.status, data: response.data });
        this.isAvailable = false;
      }
    } catch (error) {
      this.isAvailable = false;
      logger.error('Python backend not available', 'ApiService', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * Force check availability and return current status
   */
  async forceCheckAvailability(): Promise<boolean> {
    await this.checkAvailability();
    return this.isAvailable;
  }

  /**
   * Get current availability status
   */
  getAvailabilityStatus(): boolean {
    return this.isAvailable;
  }

  /**
   * Wait for API service to be ready
   */
  async waitForReady(): Promise<boolean> {
    const maxWaitTime = 10000; // 10 seconds
    const checkInterval = 100; // 100ms
    let waited = 0;

    while (!this.isAvailable && waited < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waited += checkInterval;
    }

    return this.isAvailable;
  }

  // ========================================
  // MASTER KEY ENDPOINTS
  // ========================================

  /**
   * Check if master key exists
   */
  async checkMasterKeyExists(): Promise<boolean> {
    try {
      const response = await this.client.get(`${this.addLangToUrl(`${this.getEndpointUrl('masterKey')}/`)}`);
      return response.data?.exists || false;
    } catch (error: any) {
      logger.warn('Failed to check master key status', 'ApiService', { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  /**
   * Set master key for encryption (REST compliant)
   * Handles both first-time setup (POST) and reset scenarios (PUT)
   */
  async setMasterKey(masterKey: string, isReset: boolean = false): Promise<boolean> {
    // Force check availability if not available
    if (!this.isAvailable) {
      await this.forceCheckAvailability();
      if (!this.isAvailable) {
        throw new Error('Python backend not available');
      }
    }

    try {
      let response;
      
      if (isReset) {
        // Reset scenario: Use POST to create new master key (after deletion, no master key exists to update)
        logger.debug('Creating new master key after reset (no existing master key to update)', 'ApiService');
        response = await this.client.post(`${this.addLangToUrl(`${this.getEndpointUrl('masterKey')}/`)}`, { master_key: masterKey });
      } else {
        // First-time setup or validation: Use POST
        logger.debug('Setting master key (first-time or validation)', 'ApiService');
        response = await this.client.post(`${this.addLangToUrl(`${this.getEndpointUrl('masterKey')}/`)}`, { master_key: masterKey });
      }
      
      return true; // If successful, the key is valid
    } catch (error: any) {
      // Extract and translate error messages from the API response
      let errorMessage = 'Failed to set master key';
      
      if (error.response?.data?.detail) {
        const detail = error.response.data.detail;
        
        // Handle structured error response
        if (typeof detail === 'object') {
          // Try to translate the main message
          if (detail.message && typeof detail.message === 'string') {
            const translatedMessage = i18nService.tSync(detail.message);
            errorMessage = translatedMessage;
          }
          
          // Handle field errors
          if (detail.field_errors && typeof detail.field_errors === 'object') {
            const fieldErrors = Object.values(detail.field_errors);
            if (fieldErrors.length > 0) {
              const fieldError = fieldErrors[0];
              if (typeof fieldError === 'string') {
                const translatedFieldError = i18nService.tSync(fieldError);
                errorMessage = translatedFieldError;
              }
            }
          }
        } else if (typeof detail === 'string') {
          // Handle simple string error
          const translatedDetail = i18nService.tSync(detail);
          errorMessage = translatedDetail;
        }
      }
      
      throw new Error(errorMessage);
    }
  }

  /**
   * Check if master key exists in database (REST compliant)
   */
  async isMasterKeyExists(): Promise<boolean> {
    // Force check availability if not available
    if (!this.isAvailable) {
      await this.forceCheckAvailability();
      if (!this.isAvailable) {
        throw new Error('Python backend not available');
      }
    }

    try {
      const response = await this.client.get(this.addLangToUrl(`${this.getEndpointUrl('masterKey')}/`));
      return response.data.exists;
    } catch (error: any) {
      logger.error('Failed to check master key existence', 'ApiService - Master Key Endpoint', {
        error: error.response?.data?.detail || 'Failed to check master key existence',
        status: error.response?.status,
        data: error.response?.data
      });
      throw new Error(error.response?.data?.detail || 'Failed to check master key existence');
    }
  }

  /**
   * Delete master key and all connections (REST compliant)
   */
  async deleteMasterKeyAndConnections(): Promise<boolean> {
    if (!this.isAvailable) {
      throw new Error('Python backend not available');
    }

    try {
      // Get master key for authentication
      const masterKey = getMasterKeyFromSession();

      await this.client.delete(this.addLangToUrl(`${this.getEndpointUrl('masterKey')}/`), {
        headers: {
          'X-Master-Key': masterKey
        }
      });
      return true;
    } catch (error: any) {
      logger.error('Failed to delete master key', 'ApiService - Master Key Endpoint', {
        error: error.response?.data?.detail || 'Failed to delete master key',
        status: error.response?.status,
        data: error.response?.data
      });
      throw new Error(error.response?.data?.detail || 'Failed to delete master key');
    }
  }

  // ========================================
  // OAUTH TYPES ENDPOINTS
  // ========================================



  // ========================================
  // CONNECTION ENDPOINTS
  // ========================================

  /**
   * Save connection (REST compliant)
   */
  async saveConnection(params: SaveConnectionParams): Promise<string> {
    if (!this.isAvailable) {
      throw new Error('Python backend not available');
    }

    try {
      // Get master key from session context
      const masterKey = getMasterKeyFromSession();

      const response = await this.client.post(this.addLangToUrl(`${this.getEndpointUrl('connections')}/`), {
        master_key: masterKey,
        display_name: params.displayName,
        auth_provider_uuid: params.authProviderUuid,
        connection_data: {
          username: params.username,
          password: params.password,
          environment: params.environment,
          consumer_key: params.consumerKey,
          consumer_secret: params.consumerSecret,
          security_token: params.securityToken,
          client_id: params.clientId,
          client_secret: params.clientSecret
        },
        created_by: "user"
      });
      
      // Show success notification
      notificationService.success({
        title: i18nService.tSync('connections.notifications.saved.title') || 'Connection Saved',
        message: i18nService.tSync('connections.notifications.saved.message') || 'Connection has been saved successfully',
      });
      
      return response.data.connection_uuid;
    } catch (error: any) {
      logger.error('Failed to save connection', 'ApiService', {
        status: error.response?.status,
        data: error.response?.data,
        detail: error.response?.data?.detail
      });
      // Extract proper error message from API response
      let errorMessage = 'Failed to save connection';
      
      if (error.response?.data?.detail) {
        const detail = error.response.data.detail;
        
        // Handle structured error response
        if (typeof detail === 'object') {
          // Try to get the message from the detail object
          if (detail.message && typeof detail.message === 'string') {
            errorMessage = detail.message;
          } else if (detail.error_code && typeof detail.error_code === 'string') {
            errorMessage = detail.error_code;
          } else {
            errorMessage = JSON.stringify(detail);
          }
        } else if (typeof detail === 'string') {
          errorMessage = detail;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      throw new Error(errorMessage);
    }
  }

  /**
   * Get all connections (REST compliant)
   */
  async getAllConnections(): Promise<ConnectionResponse[]> {
    if (!this.isAvailable) {
      throw new Error('Python backend not available');
    }

    try {
      // Get master key for authentication
      logger.debug('About to call getMasterKeyFromSession', 'ApiService');
      const masterKey = getMasterKeyFromSession();
      logger.debug('Got master key from session', 'ApiService', { masterKeyLength: masterKey?.length });

      const response = await this.client.get(this.addLangToUrl(`${this.getEndpointUrl('connections')}/`), {
        headers: {
          'X-Master-Key': masterKey
        }
      });
      return response.data.connections;
    } catch (error: any) {
      // Return the i18n key from the API response
      const errorDetail = error.response?.data?.detail || 'Failed to get connections';
      throw new Error(errorDetail);
    }
  }

  /**
   * Get connection with decrypted credentials (REST compliant)
   */
  async getConnectionWithCredentials(connectionUuid: string): Promise<ConnectionResponse | null> {
    if (!this.isAvailable) {
      throw new Error('Python backend not available');
    }

    try {
      // Get master key for authentication
      const masterKey = getMasterKeyFromSession();

      const response = await this.client.get(this.addLangToUrl(`${this.getEndpointUrl('connections')}/${connectionUuid}`), {
        headers: {
          'X-Master-Key': masterKey
        }
      });
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      // Return the i18n key from the API response
      const errorDetail = error.response?.data?.detail || 'Failed to get connection';
      throw new Error(errorDetail);
    }
  }

  /**
   * Delete connection (REST compliant)
   */
  async deleteConnection(connectionUuid: string): Promise<boolean> {
    if (!this.isAvailable) {
      throw new Error('Python backend not available');
    }

    try {
      // Get master key for authentication
      const masterKey = getMasterKeyFromSession();

      await this.client.delete(this.addLangToUrl(`${this.getEndpointUrl('connections')}/${connectionUuid}`), {
        headers: {
          'X-Master-Key': masterKey
        }
      });
      
      // Show success notification
      notificationService.success({
        title: i18nService.tSync('connections.notifications.deleted.title') || 'Connection Deleted',
        message: i18nService.tSync('connections.notifications.deleted.message') || 'Connection has been deleted successfully',
      });
      
      return true;
    } catch (error: any) {
      // Return the i18n key from the API response
      const errorDetail = error.response?.data?.detail || 'Failed to delete connection';
      throw new Error(errorDetail);
    }
  }

  /**
   * Delete all connections (REST compliant)
   */
  async deleteAllConnections(): Promise<boolean> {
    if (!this.isAvailable) {
      throw new Error('Python backend not available');
    }

    try {
      // Get master key for authentication
      const masterKey = getMasterKeyFromSession();

      await this.client.delete(this.addLangToUrl(`${this.getEndpointUrl('connections')}/`), {
        headers: {
          'X-Master-Key': masterKey
        }
      });
      return true;
    } catch (error: any) {
      // Return the i18n key from the API response
      const errorDetail = error.response?.data?.detail || 'Failed to delete all connections';
      throw new Error(errorDetail);
    }
  }

  /**
   * Update connection display name (REST compliant)
   */
  async updateConnection(connectionUuid: string, displayName: string): Promise<any> {
    if (!this.isAvailable) {
      throw new Error('Python backend not available');
    }

    try {
      // Get master key for authentication
      const masterKey = getMasterKeyFromSession();

      const response = await this.client.put(this.addLangToUrl(`${this.getEndpointUrl('connections')}/${connectionUuid}`), {
        display_name: displayName,
        master_key: masterKey
      });
      return response.data;
    } catch (error: any) {
      // Return the i18n key from the API response
      const errorDetail = error.response?.data?.detail || 'Failed to update connection';
      throw new Error(errorDetail);
    }
  }

  // ========================================
  // I18N ENDPOINTS
  // ========================================

  /**
   * Get all languages (REST compliant)
   */
  async getAllLanguages(): Promise<any[]> {
    if (!this.isAvailable) {
      throw new Error('Python backend not available');
    }

    try {
      const response = await this.client.get(this.addLangToUrl(`${this.getEndpointUrl('i18n')}/languages`));
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Failed to get languages');
    }
  }

  /**
   * Get all languages with optional filtering (REST compliant)
   */
  async getAllLanguagesWithFilter(isActive?: boolean): Promise<any[]> {
    if (!this.isAvailable) {
      throw new Error('Python backend not available');
    }

    try {
      let url = `${this.getEndpointUrl('i18n')}/languages`;
      if (isActive !== undefined) {
        url += `?is_active=${isActive}`;
      }
      
      const response = await this.client.get(this.addLangToUrl(url));
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Failed to get languages');
    }
  }

  /**
   * Get available locales (REST compliant) - only active languages
   */
  async getAvailableLocales(): Promise<Array<{code: string, name: string}>> {
    if (!this.isAvailable) {
      throw new Error('Python backend not available');
    }

    try {
      logger.debug('Loading available languages', 'ApiService');
      const response = await this.client.get(this.addLangToUrl(`${this.getEndpointUrl('i18n')}/languages?is_active=true&fields=code,name`));
      logger.debug('Languages response received', 'ApiService', { count: response.data?.length });
      return response.data;
    } catch (error: any) {
      logger.error('Error getting available locales', 'ApiService', error);
      throw new Error(error.response?.data?.detail || 'Failed to get available locales');
    }
  }

  /**
   * Get translations by locale (REST compliant)
   * This method gets all available pages first, then fetches translations for each page
   * Uses caching to prevent repeated API calls
   */
  async getTranslationsByLocale(locale: string): Promise<any[]> {
    // Force a fresh availability check instead of relying on cached flag
    await this.checkAvailability();
    if (!this.isAvailable) {
      throw new Error('Python backend not available');
    }

    // Check cache first (5 minute TTL)
    const cacheKey = locale;
    const cached = this.translationsCache.get(cacheKey);
    const now = Date.now();
    const cacheTTL = 5 * 60 * 1000; // 5 minutes

    if (cached && (now - cached.timestamp) < cacheTTL) {
      logger.debug(' Using cached translations', 'ApiService', { locale, cacheAge: now - cached.timestamp });
      return cached.data;
    }

    try {
      logger.debug(' Loading translations from API', 'ApiService', { locale });
      
      // First, get all available pages
      const pagesResponse = await this.client.get(this.addLangToUrl(`${this.getEndpointUrl('i18n')}/translations/pages`));
      const availablePages = pagesResponse.data;
      
      // Then, get translations for each page
      const allTranslations = [];
      for (const pageName of availablePages) {
        try {
          const pageResponse = await this.client.get(this.addLangToUrl(`${this.getEndpointUrl('i18n')}/translations/${locale}/${pageName}`));
          if (pageResponse.data) {
            allTranslations.push(pageResponse.data);
          }
        } catch (pageError: any) {
          // Log warning but continue with other pages
          logger.warn(`Failed to load translations for page ${pageName}`, 'ApiService', pageError);
        }
      }
      
      // Cache the result
      this.translationsCache.set(cacheKey, { data: allTranslations, timestamp: now });
      logger.debug(' Cached translations', 'ApiService', { locale, count: allTranslations.length });
      
      return allTranslations;
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Failed to get translations by locale');
    }
  }

  /**
   * Get translation by page (REST compliant)
   */
  async getTranslationByPage(locale: string, pageName: string): Promise<any> {
    if (!this.isAvailable) {
      throw new Error('Python backend not available');
    }

    try {
      const response = await this.client.get(this.addLangToUrl(`${this.getEndpointUrl('i18n')}/translations/${locale}/${pageName}`));
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      throw new Error(error.response?.data?.detail || 'Failed to get translation by page');
    }
  }

  /**
   * Get translation key (REST compliant)
   */
  async getTranslationKey(locale: string, key: string): Promise<string | null> {
    if (!this.isAvailable) {
      throw new Error('Python backend not available');
    }

    try {
      const response = await this.client.get(this.addLangToUrl(`${this.getEndpointUrl('i18n')}/translations/${locale}/key/${encodeURIComponent(key)}`));
      return response.data.value;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      throw new Error(error.response?.data?.detail || 'Failed to get translation key');
    }
  }

  /**
   * Get available locale objects (REST compliant) - only active languages
   */
  async getAvailableLocaleObjects(): Promise<any[]> {
    if (!this.isAvailable) {
      throw new Error('Python backend not available');
    }

    try {
      logger.debug('Loading locale objects', 'ApiService');
      const response = await this.client.get(this.addLangToUrl(`${this.getEndpointUrl('i18n')}/locales/objects?is_active=true`));
      logger.debug('Locale objects response received', 'ApiService', { count: response.data?.length });
      return response.data;
    } catch (error: any) {
      logger.error('Error getting available locale objects', 'ApiService', error);
      throw new Error(error.response?.data?.detail || 'Failed to get available locale objects');
    }
  }

  /**
   * Set default language (REST compliant)
   */
  async setDefaultLanguage(languageUuid: string): Promise<any> {
    if (!this.isAvailable) {
      throw new Error('Python backend not available');
    }

    try {
      logger.debug(`Calling PUT /i18n/languages/${languageUuid}/default`, 'ApiService');
      const response = await this.client.put(this.addLangToUrl(`${this.getEndpointUrl('i18n')}/languages/${languageUuid}/default`));
      logger.debug('Response received', 'ApiService', response.data);
      return response.data;
    } catch (error: any) {
      logger.error('Error setting default language', 'ApiService', error);
      throw new Error(error.response?.data?.detail || 'Failed to set default language');
    }
  }

  /**
   * Get translation stats (REST compliant)
   */
  async getTranslationStats(): Promise<any> {
    if (!this.isAvailable) {
      throw new Error('Python backend not available');
    }

    try {
      const response = await this.client.get(this.addLangToUrl(`${this.getEndpointUrl('i18n')}/translations/stats`));
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Failed to get translation stats');
    }
  }

  // ========================================
  // AUTH PROVIDERS ENDPOINTS
  // ========================================

  /**
   * Get all auth providers (REST compliant)
   */
  async getAllAuthProviders(): Promise<any[]> {
    if (!this.isAvailable) {
      throw new Error('Python backend not available');
    }

    try {
      const response = await this.client.get(this.addLangToUrl(`${this.getEndpointUrl('authProviders')}/`));
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Failed to get auth providers');
    }
  }

  /**
   * Get auth provider by ID (REST compliant)
   */
  async getAuthProviderById(providerId: string): Promise<any> {
    if (!this.isAvailable) {
      throw new Error('Python backend not available');
    }

    try {
      const response = await this.client.get(this.addLangToUrl(`/auth-providers/${providerId}`));
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      throw new Error(error.response?.data?.detail || 'Failed to get auth provider');
    }
  }

  /**
   * Create auth provider (REST compliant)
   */
  async createAuthProvider(providerData: any): Promise<any> {
    if (!this.isAvailable) {
      throw new Error('Python backend not available');
    }

    try {
      const response = await this.client.post(this.addLangToUrl(`${this.getEndpointUrl('authProviders')}/`), providerData);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Failed to create auth provider');
    }
  }

  /**
   * Update auth provider (REST compliant)
   */
  async updateAuthProvider(providerId: string, providerData: any): Promise<any> {
    if (!this.isAvailable) {
      throw new Error('Python backend not available');
    }

    try {
      const response = await this.client.put(this.addLangToUrl(`/auth-providers/${providerId}`), providerData);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Failed to update auth provider');
    }
  }

  /**
   * Delete auth provider (REST compliant)
   */
  async deleteAuthProvider(providerId: string): Promise<boolean> {
    if (!this.isAvailable) {
      throw new Error('Python backend not available');
    }

    try {
      await this.client.delete(this.addLangToUrl(`/auth-providers/${providerId}`));
      return true;
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Failed to delete auth provider');
    }
  }

  /**
   * Get auth providers by type (REST compliant)
   */
  async getAuthProvidersByType(providerType: string): Promise<any[]> {
    if (!this.isAvailable) {
      throw new Error('Python backend not available');
    }

    try {
      const response = await this.client.get(this.addLangToUrl(`/auth-providers/type/${providerType}`));
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Failed to get auth providers by type');
    }
  }

  /**
   * Get auth provider stats (REST compliant)
   */
  async getAuthProviderStats(): Promise<any> {
    if (!this.isAvailable) {
      throw new Error('Python backend not available');
    }

    try {
      const response = await this.client.get(this.addLangToUrl(`${this.getEndpointUrl('authProviders')}/stats`));
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Failed to get auth provider stats');
    }
  }

  // ========================================
  // APP SETTINGS ENDPOINTS
  // ========================================

  /**
   * Get all app settings (REST compliant)
   * Note: Backend only supports individual setting retrieval, so this returns empty array
   */
  async getAllAppSettings(): Promise<any[]> {
    // Force check availability if not available
    if (!this.isAvailable) {
      await this.forceCheckAvailability();
      if (!this.isAvailable) {
        throw new Error('Python backend not available');
      }
    }

    // Backend only supports individual setting retrieval via /settings/{config_key}
    // Return empty array since we can't get all settings at once
    logger.warn(' getAllAppSettings called but backend only supports individual setting retrieval', 'ApiService');
    return [];
  }

  /**
   * Get app setting by ID (REST compliant)
   */
  async getAppSettingById(settingId: string): Promise<any> {
    if (!this.isAvailable) {
      throw new Error('Python backend not available');
    }

    try {
      const response = await this.client.get(this.addLangToUrl(`${this.getEndpointUrl('appSettings')}/${settingId}`));
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      throw new Error(error.response?.data?.detail || 'Failed to get app setting');
    }
  }

  /**
   * Get app setting by key (REST compliant)
   */
  async getAppSettingByKey(settingKey: string): Promise<any> {
    // Force check availability if not available
    if (!this.isAvailable) {
      await this.forceCheckAvailability();
      if (!this.isAvailable) {
        throw new Error('Python backend not available');
      }
    }

    try {
      const response = await this.client.get(this.addLangToUrl(`${this.getEndpointUrl('appSettings')}/${encodeURIComponent(settingKey)}`));
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      throw new Error(error.response?.data?.detail || 'Failed to get app setting by key');
    }
  }

  /**
   * Create app setting (REST compliant)
   */
  async createAppSetting(settingData: any): Promise<any> {
    if (!this.isAvailable) {
      throw new Error('Python backend not available');
    }

    try {
      const response = await this.client.post(this.addLangToUrl(`${this.getEndpointUrl('appSettings')}/`), settingData);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Failed to create app setting');
    }
  }

  /**
   * Update app setting (REST compliant)
   */
  async updateAppSetting(settingId: string, settingData: any): Promise<any> {
    if (!this.isAvailable) {
      throw new Error('Python backend not available');
    }

    try {
      const response = await this.client.put(this.addLangToUrl(`${this.getEndpointUrl('appSettings')}/${settingId}`), settingData);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Failed to update app setting');
    }
  }

  /**
   * Delete app setting (REST compliant)
   */
  async deleteAppSetting(settingId: string): Promise<boolean> {
    if (!this.isAvailable) {
      throw new Error('Python backend not available');
    }

    try {
      await this.client.delete(this.addLangToUrl(`${this.getEndpointUrl('appSettings')}/${settingId}`));
      return true;
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Failed to delete app setting');
    }
  }

  /**
   * Get app settings by category (REST compliant)
   * Note: Backend only supports individual setting retrieval, so this returns empty array
   */
  async getAppSettingsByCategory(category: string): Promise<any[]> {
    if (!this.isAvailable) {
      throw new Error('Python backend not available');
    }

    // Backend only supports individual setting retrieval via /settings/{config_key}
    // Return empty array since we can't get settings by category
    logger.warn(' getAppSettingsByCategory called but backend only supports individual setting retrieval', 'ApiService', { category });
    return [];
  }

  /**
   * Get app setting stats (REST compliant)
   */
  async getAppSettingStats(): Promise<any> {
    if (!this.isAvailable) {
      throw new Error('Python backend not available');
    }

    try {
      const response = await this.client.get(this.addLangToUrl(`${this.getEndpointUrl('appSettings')}/stats`));
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Failed to get app setting stats');
    }
  }

  // ========================================
  // SALESFORCE ENDPOINTS (Keep IPC fallback for now)
  // ========================================

  /**
   * Connect to Salesforce using a saved connection
   */
  async connectToSalesforce(connectionUuid: string): Promise<any> {
    try {
      // Get master key for authentication
      const masterKey = getMasterKeyFromSession();

      logger.debug(' Calling /connections/{uuid}/connect endpoint', 'ApiService', { connectionUuid });
      const response = await this.client.post(this.addLangToUrl(`${this.getEndpointUrl('connections')}/${connectionUuid}/connect`), {}, {
        headers: {
          'X-Master-Key': masterKey
        }
      });
      logger.debug('/connections/{uuid}/connect endpoint successful', 'ApiService', { responseData: response.data });
      
      // Show success notification
      notificationService.success({
        title: i18nService.tSync('connections.notifications.connected.title') || 'Connected to Salesforce',
        message: i18nService.tSync('connections.notifications.connected.message') || 'Successfully connected to Salesforce',
      });
      
      return response.data;
    } catch (error: any) {
      logger.error('/connections/{uuid}/connect endpoint failed', 'ApiService', { 
        error: error.response?.data?.detail || error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      throw new Error(error.response?.data?.detail || 'Failed to connect to Salesforce');
    }
  }


  /**
   * Get Salesforce SObject list
   */
  async getSObjectList(connectionUuid: string): Promise<string[]> {
    try {
      if (!connectionUuid) {
        throw new Error('Connection UUID is required');
      }

      const response = await this.client.get(
        this.addLangToUrl(`${this.getEndpointUrl('salesforce')}/sobjects/list?connection_uuid=${connectionUuid}`)
      );
      // Extract just the names from the sobjects array
      return response.data.sobjects.map((sobject: any) => sobject.name);
    } catch (error: any) {
      logger.error('Failed to get SObject list', 'ApiService - Salesforce', {
        error: error.response?.data?.detail || 'Failed to get SObject list',
        status: error.response?.status,
        data: error.response?.data
      });
      throw new Error(error.response?.data?.detail || 'Failed to get SObject list');
    }
  }

  /**
   * Describe Salesforce SObject
   */
  async describeSObject(sobjectName: string, connectionUuid: string, includeChildRelationships: boolean = true): Promise<any> {
    try {
      if (!connectionUuid) {
        throw new Error('Connection UUID is required');
      }

      const params = {
        ...(includeChildRelationships ? { include_child_relationships: 'true' } : {}),
        connection_uuid: connectionUuid
      };
      const response = await this.client.get(this.addLangToUrl(`${this.getEndpointUrl('salesforce')}/sobjects/describe/${sobjectName}`), { params });
      return response.data;
    } catch (error: any) {
      logger.error('Failed to describe SObject', 'ApiService - Salesforce', {
        error: error.response?.data?.detail || 'Failed to describe SObject',
        status: error.response?.status,
        data: error.response?.data
      });
      throw new Error(error.response?.data?.detail || 'Failed to describe SObject');
    }
  }

  /**
   * Clear backend SObject cache for a connection
   */
  async clearBackendSObjectCache(connectionUuid: string): Promise<any> {
    try {
      if (!connectionUuid) {
        throw new Error('Connection UUID is required');
      }

      // Get master key for authentication
      const masterKey = getMasterKeyFromSession();

      const response = await this.client.delete(
        this.addLangToUrl(`/api/v1/sobjects?connection_uuid=${connectionUuid}`),
        {
          headers: {
            'X-Master-Key': masterKey
          }
        }
      );
      return response.data;
    } catch (error: any) {
      logger.error('Failed to clear backend SObject cache', 'ApiService - Cache Management', {
        error: error.response?.data?.detail || 'Failed to clear backend SObject cache',
        status: error.response?.status,
        data: error.response?.data
      });
      throw new Error(error.response?.data?.detail || 'Failed to clear backend SObject cache');
    }
  }

  /**
   * Execute Salesforce query
   */
  async executeSalesforceQuery(query: string, connectionUuid: string): Promise<any> {
    try {
      if (!connectionUuid) {
        throw new Error('Connection UUID is required');
      }

      const response = await this.client.post(
        this.addLangToUrl(`${this.getEndpointUrl('salesforce')}/queries/execute?connection_uuid=${connectionUuid}`), 
        { query }
      );
      return response.data;
    } catch (error: any) {
      logger.error('Failed to execute Salesforce query', 'ApiService - Salesforce', {
        error: error.response?.data?.detail || error.message || 'Failed to execute query',
        status: error.response?.status,
        data: error.response?.data,
        query: query.substring(0, 100) + (query.length > 100 ? '...' : '')
      });
      
      // Extract and translate error messages from the API response
      let errorMessage = 'Failed to execute query';
      
      if (error.response?.data?.detail) {
        const detail = error.response.data.detail;
        
        // Handle structured error response
        if (typeof detail === 'object') {
          // Try to translate the main message first
          if (detail.message && typeof detail.message === 'string') {
            const translatedMessage = i18nService.tSync(detail.message);
            errorMessage = translatedMessage;
          }
          
          // Handle field errors (these contain the actual Salesforce error)
          if (detail.field_errors && typeof detail.field_errors === 'object') {
            const fieldErrors = Object.values(detail.field_errors);
            if (fieldErrors.length > 0) {
              const fieldError = fieldErrors[0];
              // Handle different types of field errors
              if (typeof fieldError === 'string') {
                // Try to translate the field error
                const translatedFieldError = i18nService.tSync(fieldError);
                errorMessage = translatedFieldError;
              } else if (fieldError && typeof fieldError === 'object') {
                // If it's an object, try to extract meaningful information
                const fieldErrorObj = fieldError as any;
                if (fieldErrorObj.message) {
                  errorMessage = fieldErrorObj.message;
                } else if (fieldErrorObj.error) {
                  errorMessage = fieldErrorObj.error;
                } else {
                  errorMessage = JSON.stringify(fieldError);
                }
              } else {
                errorMessage = String(fieldError);
              }
            }
          }
        } else if (typeof detail === 'string') {
          // Handle simple string error - try to translate it
          const translatedDetail = i18nService.tSync(detail);
          errorMessage = translatedDetail;
        }
      } else if (error.response?.data?.message) {
        // Try to translate the message
        const translatedMessage = i18nService.tSync(error.response.data.message);
        errorMessage = translatedMessage;
      } else if (error.message) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error && typeof error === 'object') {
        // Handle case where error is an object but not properly formatted
        errorMessage = JSON.stringify(error);
      }
      
      throw new Error(errorMessage);
    }
  }

  /**
   * Execute more Salesforce records using nextRecordsId
   */
  async executeSalesforceQueryMore(nextRecordsId: string, connectionUuid: string): Promise<any> {
    try {
      if (!connectionUuid) {
        throw new Error('Connection UUID is required');
      }

      const response = await this.client.post(
        this.addLangToUrl(`${this.getEndpointUrl('salesforce')}/queries/execute-more?connection_uuid=${connectionUuid}`), 
        { nextRecordsId }
      );
      return response.data;
    } catch (error: any) {
      logger.error('Failed to execute more Salesforce records', 'ApiService - Salesforce', {
        error: error.response?.data?.detail || error.message || 'Failed to execute more records',
        status: error.response?.status,
        data: error.response?.data,
        nextRecordsId: nextRecordsId.substring(0, 50) + (nextRecordsId.length > 50 ? '...' : '')
      });
      
      // Extract and translate error messages from the API response
      let errorMessage = 'Failed to execute more records';
      
      if (error.response?.data?.detail) {
        const detail = error.response.data.detail;
        
        // Handle structured error response
        if (typeof detail === 'object') {
          // Try to translate the main message first
          if (detail.message && typeof detail.message === 'string') {
            const translatedMessage = i18nService.tSync(detail.message);
            errorMessage = translatedMessage;
          }
          
          // Handle field errors (these contain the actual Salesforce error)
          if (detail.field_errors && typeof detail.field_errors === 'object') {
            const fieldErrors = Object.values(detail.field_errors);
            if (fieldErrors.length > 0) {
              const fieldError = fieldErrors[0];
              // Handle different types of field errors
              if (typeof fieldError === 'string') {
                // Try to translate the field error
                const translatedFieldError = i18nService.tSync(fieldError);
                errorMessage = translatedFieldError;
              } else if (fieldError && typeof fieldError === 'object') {
                // If it's an object, try to extract meaningful information
                const fieldErrorObj = fieldError as any;
                if (fieldErrorObj.message) {
                  errorMessage = fieldErrorObj.message;
                } else if (fieldErrorObj.error) {
                  errorMessage = fieldErrorObj.error;
                } else {
                  errorMessage = JSON.stringify(fieldError);
                }
              } else {
                errorMessage = String(fieldError);
              }
            }
          }
        } else if (typeof detail === 'string') {
          // Handle simple string error - try to translate it
          const translatedDetail = i18nService.tSync(detail);
          errorMessage = translatedDetail;
        }
      } else if (error.response?.data?.message) {
        // Try to translate the message
        const translatedMessage = i18nService.tSync(error.response.data.message);
        errorMessage = translatedMessage;
      } else if (error.message) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error && typeof error === 'object') {
        // Handle case where error is an object but not properly formatted
        errorMessage = JSON.stringify(error);
      }
      
      throw new Error(errorMessage);
    }
  }

  /**
   * Get Salesforce user info
   */
  async getSalesforceUserInfo(connectionUuid: string): Promise<any> {
    try {
      if (!connectionUuid) {
        throw new Error('Connection UUID is required');
      }

      logger.debug('Getting Salesforce user info...', 'ApiService');
      const response = await this.client.get(this.addLangToUrl(`${this.getEndpointUrl('salesforce')}/user/info?connection_uuid=${connectionUuid}`));
      logger.debug('User info response received', 'ApiService', response.data);
      return response.data;
    } catch (error: any) {
      logger.error('Error getting user info', 'ApiService', error);
      throw new Error(error.response?.data?.detail || 'Failed to get user info');
    }
  }

  /**
   * Get Salesforce API usage
   */
  async getSalesforceApiUsage(connectionUuid: string): Promise<any> {
    try {
      if (!connectionUuid) {
        throw new Error('Connection UUID is required');
      }

      const response = await this.client.get(this.addLangToUrl(`${this.getEndpointUrl('salesforce')}/usage/info?connection_uuid=${connectionUuid}`));
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Failed to get API usage');
    }
  }

  /**
   * Check if connected to Salesforce
   */
  async isSalesforceConnected(connectionUuid: string): Promise<boolean> {
    try {
      // Get current connection UUID from sessionStorage
      if (!connectionUuid) {
        logger.debug('No current connection UUID found', 'ApiService');
        return false;
      }

      logger.debug('Checking Salesforce connection status...', 'ApiService', { connectionUuid: connectionUuid });
      const response = await this.client.get(this.addLangToUrl(`${this.getEndpointUrl('connections')}/${connectionUuid}/status`));
      logger.debug('Connection status response received', 'ApiService', response.data);
      const isConnected = response.data.connected;
      logger.debug(`Is connected: ${isConnected}`, 'ApiService');
      return isConnected;
    } catch (error: any) {
      logger.error('Error checking connection status', 'ApiService', error);
      // Return false instead of throwing error for connection status checks
      return false;
    }
  }

  /**
   * Get Salesforce API configuration
   */
  async getSalesforceApiConfig(connectionUuid: string): Promise<any> {
    try {
      if (!connectionUuid) {
        throw new Error('Connection UUID is required');
      }

      const response = await this.client.get(this.addLangToUrl(`${this.getEndpointUrl('salesforce')}/config/info?connection_uuid=${connectionUuid}`));
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Failed to get API config');
    }
  }

  /**
   * Update Salesforce record
   */
  async updateSalesforceRecord(recordId: string, fields: Record<string, any>, sobjectName?: string): Promise<void> {
    try {
      // Get current connection UUID
      const currentConnectionUuid = getConnectionUuidFromSession();
      if (!currentConnectionUuid) {
        throw new Error('No connection UUID found');
      }
      
      // Use provided SObject name or fall back to extracting from record ID
      const objectName = sobjectName || this.getSObjectNameFromRecordId(recordId);
      await this.client.put(this.addLangToUrl(`${this.getEndpointUrl('salesforce')}/sobjects/${objectName}/records/${recordId}?connection_uuid=${currentConnectionUuid}`), fields);
    } catch (error: any) {
      // Extract error message from backend response
      let errorMessage = 'Failed to update record';
      
      if (error.response?.data?.detail) {
        if (typeof error.response.data.detail === 'string') {
          errorMessage = error.response.data.detail;
        } else if (error.response.data.detail.message) {
          errorMessage = error.response.data.detail.message;
        } else if (error.response.data.detail.error_code) {
          errorMessage = error.response.data.detail.error_code;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      throw new Error(errorMessage);
    }
  }

  /**
   * Helper method to get SObject name from record ID
   */
  private getSObjectNameFromRecordId(recordId: string): string {
    // This is a simplified approach - in a real implementation,
    // you might want to maintain a mapping of record prefixes to SObject names
    // For now, we'll use a common pattern
    const prefix = recordId.substring(0, 3);
    
    // Common Salesforce record prefixes
    const prefixMap: { [key: string]: string } = {
      '001': 'Account',
      '003': 'Contact',
      '006': 'Opportunity',
      '00Q': 'Lead',
      '00O': 'Report',
      'a0': 'CustomObject' // Generic for custom objects
    };
    
    return prefixMap[prefix] || 'CustomObject';
  }

  /**
   * Logout from Salesforce (disconnect current connection)
   */
  async logoutFromSalesforce(): Promise<void> {
    try {
      // Get current connection UUID from session context
      const currentConnectionUuid = getConnectionUuidFromSession();
      
      if (!currentConnectionUuid) {
        logger.debug('No current connection UUID found for logout', 'ApiService');
        return;
      }

      // Disconnect the connection
      await this.client.delete(this.addLangToUrl(`${this.getEndpointUrl('connections')}/${currentConnectionUuid}/disconnect`));
      
      // Clear the connection UUID from sessionStorage
      sessionStorage.removeItem('current-connection-uuid');
    } catch (error: any) {
      logger.error('Failed to logout from Salesforce', 'ApiService', error);
      throw new Error(error.response?.data?.detail || 'Failed to logout from Salesforce');
    }
  }

  // ========================================
  // DATABASE ENDPOINTS (REMOVED - Backend handles database initialization)
  // ========================================

  // ========================================
  // SAVED QUERIES ENDPOINTS
  // ========================================

  /**
   * Create a saved query
   */
  async createSavedQuery(params: {
    connection_uuid: string;
    name: string;
    query_text: string;
    description?: string;
    tags?: string;
    is_favorite?: boolean;
    created_by: string;
  }): Promise<string> {
    if (!this.isAvailable) {
      throw new Error('Python backend not available');
    }

    try {
      const response = await this.client.post(this.addLangToUrl(`${this.getEndpointUrl('savedQueries')}/`), params);
      return response.data.saved_queries_uuid;
    } catch (error: any) {
      // Extract proper error message from API response
      let errorMessage = 'Failed to create saved query';
      
      if (error.response?.data?.detail) {
        const detail = error.response.data.detail;
        
        // Handle structured error response
        if (typeof detail === 'object') {
          // Try to get the message from the detail object
          if (detail.message && typeof detail.message === 'string') {
            errorMessage = detail.message;
          } else if (detail.error_code && typeof detail.error_code === 'string') {
            errorMessage = detail.error_code;
          } else {
            errorMessage = JSON.stringify(detail);
          }
        } else if (typeof detail === 'string') {
          errorMessage = detail;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      throw new Error(errorMessage);
    }
  }

  /**
   * Get all saved queries for a connection
   */
  async getSavedQueries(connectionUuid: string): Promise<any[]> {
    if (!this.isAvailable) {
      throw new Error('Python backend not available');
    }

    try {
      const response = await this.client.get(this.addLangToUrl(`${this.getEndpointUrl('savedQueries')}/?connection_uuid=${connectionUuid}`));
      return response.data.saved_queries;
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Failed to get saved queries');
    }
  }

  /**
   * Update a saved query
   */
  async updateSavedQuery(savedQueryUuid: string, params: {
    name?: string;
    query_text?: string;
    description?: string;
    tags?: string;
    is_favorite?: boolean;
    updated_by: string;
  }): Promise<any> {
    if (!this.isAvailable) {
      throw new Error('Python backend not available');
    }

    try {
      const response = await this.client.put(this.addLangToUrl(`${this.getEndpointUrl('savedQueries')}/${savedQueryUuid}`), params);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Failed to update saved query');
    }
  }

  /**
   * Delete a saved query
   */
  async deleteSavedQuery(savedQueryUuid: string): Promise<void> {
    if (!this.isAvailable) {
      throw new Error('Python backend not available');
    }

    try {
      await this.client.delete(this.addLangToUrl(`${this.getEndpointUrl('savedQueries')}/${savedQueryUuid}`));
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Failed to delete saved query');
    }
  }

  // ========================================
  // QUERY HISTORY ENDPOINTS
  // ========================================







  // ========================================
  // DATABASE ENDPOINTS (Keep IPC fallback for now)
  // ========================================

  /**
   * Initialize database
   */
  async initializeDatabase(): Promise<void> {
    try {
      await this.client.post(this.addLangToUrl(`${this.getEndpointUrl('database')}/initialize`));
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Failed to initialize database');
    }
  }

  /**
   * Execute database query
   */
  async executeDatabaseQuery(sql: string, params: any[] = []): Promise<any> {
    try {
      const response = await this.client.post(this.addLangToUrl(`${this.getEndpointUrl('database')}/query`), { sql, params });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Failed to execute database query');
    }
  }


  // ========================================
  // FAVORITES ENDPOINTS
  // ========================================

  /**
   * Add SObject to favorites
   */
  async addSObjectFavorite(connectionUuid: string, favorite: {
    sobject_name: string;
    sobject_label?: string;
    is_custom: boolean;
  }): Promise<any> {
    if (!this.isAvailable) {
      throw new Error('Python backend not available');
    }

    try {
      const response = await this.client.post(this.addLangToUrl(`/api/v1/connections/${connectionUuid}/favorites`), favorite);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Failed to add SObject to favorites');
    }
  }

  /**
   * Get favorites for a connection
   */
  async getSObjectFavorites(connectionUuid: string): Promise<any> {
    if (!this.isAvailable) {
      throw new Error('Python backend not available');
    }

    try {
      const response = await this.client.get(this.addLangToUrl(`/api/v1/connections/${connectionUuid}/favorites`));
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Failed to get favorites');
    }
  }

  /**
   * Delete a favorite
   */
  async deleteSObjectFavorite(connectionUuid: string, favoriteId: string): Promise<void> {
    if (!this.isAvailable) {
      throw new Error('Python backend not available');
    }

    try {
      await this.client.delete(this.addLangToUrl(`/api/v1/connections/${connectionUuid}/favorites/${favoriteId}`));
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Failed to delete favorite');
    }
  }

  /**
   * Check if SObject is in favorites
   */
  async checkSObjectFavorite(connectionUuid: string, sobjectName: string): Promise<any> {
    if (!this.isAvailable) {
      throw new Error('Python backend not available');
    }

    try {
      const response = await this.client.get(this.addLangToUrl(`/api/v1/connections/${connectionUuid}/favorites/${sobjectName}`));
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Failed to check favorite status');
    }
  }

  // ========================================
  // SETTINGS ENDPOINTS
  // ========================================

  /**
   * Get a specific setting value by key
   */
  async getSetting(settingKey: string): Promise<any> {
    try {
      const response = await this.client.get(this.addLangToUrl(`/api/v1/settings/${settingKey}`));
      return response.data;
    } catch (error: any) {
      logger.error('Failed to get setting', 'ApiService - Settings', {
        error: error.response?.data?.detail || error.message || 'Failed to get setting',
        status: error.response?.status,
        data: error.response?.data,
        settingKey
      });
      
      // Extract and translate error messages from the API response
      let errorMessage = 'Failed to get setting';
      
      if (error.response?.data?.detail) {
        const detail = error.response.data.detail;
        
        // Handle structured error response
        if (typeof detail === 'object') {
          // Try to translate the main message first
          if (detail.message && typeof detail.message === 'string') {
            const translatedMessage = i18nService.tSync(detail.message);
            errorMessage = translatedMessage;
          }
          
          // Handle field errors (these contain the actual error)
          if (detail.field_errors && typeof detail.field_errors === 'object') {
            const fieldErrors = Object.values(detail.field_errors);
            if (fieldErrors.length > 0) {
              const fieldError = fieldErrors[0];
              // Handle different types of field errors
              if (typeof fieldError === 'string') {
                // Try to translate the field error
                const translatedFieldError = i18nService.tSync(fieldError);
                errorMessage = translatedFieldError;
              } else if (fieldError && typeof fieldError === 'object') {
                // If it's an object, try to extract meaningful information
                const fieldErrorObj = fieldError as any;
                if (fieldErrorObj.message) {
                  errorMessage = fieldErrorObj.message;
                } else if (fieldErrorObj.error) {
                  errorMessage = fieldErrorObj.error;
                } else {
                  errorMessage = JSON.stringify(fieldError);
                }
              } else {
                errorMessage = String(fieldError);
              }
            }
          }
        } else if (typeof detail === 'string') {
          // Handle simple string error - try to translate it
          const translatedDetail = i18nService.tSync(detail);
          errorMessage = translatedDetail;
        }
      } else if (error.response?.data?.message) {
        // Try to translate the message
        const translatedMessage = i18nService.tSync(error.response.data.message);
        errorMessage = translatedMessage;
      } else if (error.message) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error && typeof error === 'object') {
        // Handle case where error is an object but not properly formatted
        errorMessage = JSON.stringify(error);
      }
      
      throw new Error(errorMessage);
    }
  }

  /**
   * Get the base URL for API requests
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Get all application settings
   */
  async getAllSettings(): Promise<any> {
    try {
      const response = await this.client.get(this.addLangToUrl('/api/v1/settings'));
      return response.data;
    } catch (error: any) {
      logger.error('Failed to get all settings', 'ApiService - Settings', {
        error: error.response?.data?.detail || error.message || 'Failed to get all settings',
        status: error.response?.status,
        data: error.response?.data
      });
      
      // Extract and translate error messages from the API response
      let errorMessage = 'Failed to get all settings';
      
      if (error.response?.data?.detail) {
        const detail = error.response.data.detail;
        
        // Handle structured error response
        if (typeof detail === 'object') {
          // Try to translate the main message first
          if (detail.message && typeof detail.message === 'string') {
            const translatedMessage = i18nService.tSync(detail.message);
            errorMessage = translatedMessage;
          }
          
          // Handle field errors (these contain the actual error)
          if (detail.field_errors && typeof detail.field_errors === 'object') {
            const fieldErrors = Object.values(detail.field_errors);
            if (fieldErrors.length > 0) {
              const fieldError = fieldErrors[0];
              // Handle different types of field errors
              if (typeof fieldError === 'string') {
                // Try to translate the field error
                const translatedFieldError = i18nService.tSync(fieldError);
                errorMessage = translatedFieldError;
              } else if (fieldError && typeof fieldError === 'object') {
                // If it's an object, try to extract meaningful information
                const fieldErrorObj = fieldError as any;
                if (fieldErrorObj.message) {
                  errorMessage = fieldErrorObj.message;
                } else if (fieldErrorObj.error) {
                  errorMessage = fieldErrorObj.error;
                } else {
                  errorMessage = JSON.stringify(fieldError);
                }
              } else {
                errorMessage = String(fieldError);
              }
            }
          }
        } else if (typeof detail === 'string') {
          // Handle simple string error - try to translate it
          const translatedDetail = i18nService.tSync(detail);
          errorMessage = translatedDetail;
        }
      } else if (error.response?.data?.message) {
        // Try to translate the message
        const translatedMessage = i18nService.tSync(error.response.data.message);
        errorMessage = translatedMessage;
      } else if (error.message) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error && typeof error === 'object') {
        // Handle case where error is an object but not properly formatted
        errorMessage = JSON.stringify(error);
      }
      
      throw new Error(errorMessage);
    }
  }
}

// ========================================
// EXPORT INSTANCE
// ========================================

export const apiService = ApiService.getInstance();

// Export session context functions
export { getConnectionUuidFromSession };
