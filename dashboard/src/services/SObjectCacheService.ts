import { logger } from './Logger';
import { SalesforceService, SObjectField } from './SalesforceService';

interface CachedSObject {
  fields: SObjectField[];
  fullDescription?: any; // Full SObject description with relationships
  timestamp: number;
  lastAccessed: number;
}

interface CachedDescribeGlobal {
  sobjects: any[];
  timestamp: number;
  lastAccessed: number;
}

export class SObjectCacheService {
  private static instance: SObjectCacheService;
  private cache: Map<string, CachedSObject> = new Map();
  private describeGlobalCache: Map<string, CachedDescribeGlobal> = new Map();
  private cacheExpiryMs: number = 24 * 60 * 60 * 1000; // 24 hours
  private maxCacheSize: number = 100; // Maximum number of cached SObjects

  /**
   * Lazy Loading Cache Service for SObject Field Definitions
   * 
   * This service implements a lazy loading approach where:
   * - SObjects are only cached when user explicitly expands them in the tree
   * - No preloading occurs - cache is built on-demand
   * - Cache persists for 24 hours or until manually cleared
   * - LRU eviction when cache reaches maximum size (100 SObjects)
   */

  private constructor() {}

  public static getInstance(): SObjectCacheService {
    if (!SObjectCacheService.instance) {
      SObjectCacheService.instance = new SObjectCacheService();
    }
    return SObjectCacheService.instance;
  }

  /**
   * Get full SObject with caching (main method - includes relationships by default)
   * Cache key format: {connection_uuid}_{sobject_name}
   */
  public async getSObject(sobjectName: string, connectionUuid?: string, suppressErrors: boolean = false): Promise<any> {
    const connUuid = connectionUuid || sessionStorage.getItem('current-connection-uuid') || 'default';
    const cacheKey = `${connUuid}_${sobjectName.toLowerCase()}`;
    
    // Check if we have a valid cached entry
    const cached = this.cache.get(cacheKey);
    if (cached && this.isCacheValid(cached)) {
      // Update last accessed time
      cached.lastAccessed = Date.now();
      return cached.fullDescription || { fields: cached.fields };
    }

    // Cache miss or expired - fetch from Salesforce with relationships
    try {
      const fullDescription = await SalesforceService.describeSObject(sobjectName, connUuid, true);
      
      // Store in cache with full description
      this.setCachedSObjectWithRelationships(cacheKey, fullDescription);
      
      return fullDescription;
    } catch (error) {
      if (!suppressErrors) {
        logger.error(`Failed to fetch SObject for ${sobjectName}`, 'SObjectCacheService', null, error as Error);
      }
      throw error;
    }
  }

  /**
   * Get SObject fields with caching (deprecated - use getSObject instead)
   */
  public async getSObjectFields(sobjectName: string, connectionUuid?: string): Promise<SObjectField[]> {
    const fullSObject = await this.getSObject(sobjectName, connectionUuid);
    return fullSObject.fields || [];
  }



  /**
   * Check if cached entry is still valid
   */
  private isCacheValid(cached: CachedSObject): boolean {
    const now = Date.now();
    return (now - cached.timestamp) < this.cacheExpiryMs;
  }

  private isDescribeGlobalCacheValid(cached: CachedDescribeGlobal): boolean {
    const now = Date.now();
    return (now - cached.timestamp) < this.cacheExpiryMs;
  }

  /**
   * Store SObject in cache with size management
   */
  private setCachedSObject(cacheKey: string, fields: SObjectField[]): void {
    // If cache is full, remove least recently used entry
    if (this.cache.size >= this.maxCacheSize) {
      this.evictLeastRecentlyUsed();
    }

    this.cache.set(cacheKey, {
      fields,
      timestamp: Date.now(),
      lastAccessed: Date.now()
    });
  }

  /**
   * Store SObject with full description and relationships in cache
   */
  private setCachedSObjectWithRelationships(cacheKey: string, fullDescription: any): void {
    // If cache is full, remove least recently used entry
    if (this.cache.size >= this.maxCacheSize) {
      this.evictLeastRecentlyUsed();
    }

    // Get existing cached entry or create new one
    const existing = this.cache.get(cacheKey);
    this.cache.set(cacheKey, {
      fields: existing?.fields || fullDescription.fields || [],
      fullDescription,
      timestamp: Date.now(),
      lastAccessed: Date.now()
    });
  }

  /**
   * Remove least recently used cache entry
   */
  private evictLeastRecentlyUsed(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, cached] of this.cache.entries()) {
      if (cached.lastAccessed < oldestTime) {
        oldestTime = cached.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      logger.debug(`Evicted ${oldestKey} from cache (LRU)`, 'SObjectCacheService');
    }
  }

  /**
   * Clear all cached SObjects and describeGlobal
   */
  public clearCache(): void {
    const cacheSize = this.cache.size;
    const describeGlobalCacheSize = this.describeGlobalCache.size;
    this.cache.clear();
    this.describeGlobalCache.clear();
    logger.debug(`Cleared ${cacheSize} cached SObjects and ${describeGlobalCacheSize} describeGlobal entries`, 'SObjectCacheService');
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): {
    size: number;
    maxSize: number;
    describeGlobalCached: boolean;
    entries: Array<{ sobjectName: string; fieldCount: number; lastAccessed: Date }>;
  } {
    const entries = Array.from(this.cache.entries()).map(([key, cached]) => ({
      sobjectName: key,
      fieldCount: cached.fields.length,
      lastAccessed: new Date(cached.lastAccessed)
    }));

    // Check if describeGlobal is cached
    const connUuid = sessionStorage.getItem('current-connection-uuid') || 'default';
    const describeGlobalCacheKey = `${connUuid}_describeGlobalList`;
    const describeGlobalCached = this.describeGlobalCache.has(describeGlobalCacheKey) && 
      this.isDescribeGlobalCacheValid(this.describeGlobalCache.get(describeGlobalCacheKey)!);

    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      describeGlobalCached,
      entries
    };
  }





  /**
   * Check if SObject is cached
   */
  public isCached(sobjectName: string): boolean {
    const cacheKey = sobjectName.toLowerCase();
    const cached = this.cache.get(cacheKey);
    return cached !== undefined && this.isCacheValid(cached);
  }

  /**
   * Get cached SObject fields without fetching (returns null if not cached)
   */
  public getCachedFields(sobjectName: string): SObjectField[] | null {
    const cacheKey = sobjectName.toLowerCase();
    const cached = this.cache.get(cacheKey);
    
    if (cached && this.isCacheValid(cached)) {
      cached.lastAccessed = Date.now();
      return cached.fields;
    }
    
    return null;
  }

  /**
   * Get describeGlobal with caching
   * Cache key format: {connection_uuid}_describeGlobalList
   */
  public async getDescribeGlobal(connectionUuid?: string): Promise<any> {
    const connUuid = connectionUuid || sessionStorage.getItem('current-connection-uuid') || 'default';
    const cacheKey = `${connUuid}_describeGlobalList`;
    
    // Check if we have a valid cached entry
    const cached = this.describeGlobalCache.get(cacheKey);
    if (cached && this.isDescribeGlobalCacheValid(cached)) {
      // Update last accessed time
      cached.lastAccessed = Date.now();
      logger.debug('Using cached describeGlobal', 'SObjectCacheService', { cacheKey });
      return { sobjects: cached.sobjects };
    }

    // Cache miss - fetch from API
    logger.debug('Cache miss for describeGlobal, fetching from API', 'SObjectCacheService', { cacheKey });
    
    try {
      const sobjectNames = await SalesforceService.getSObjectList();
      
      // Convert to the expected format
      const sobjects = sobjectNames.map(name => ({ name }));
      
      // Cache the result
      this.describeGlobalCache.set(cacheKey, {
        sobjects: sobjects,
        timestamp: Date.now(),
        lastAccessed: Date.now()
      });

      logger.debug('Cached describeGlobal result', 'SObjectCacheService', { 
        cacheKey, 
        sobjectCount: sobjects.length 
      });

      return { sobjects: sobjects };
    } catch (error) {
      logger.error('Failed to fetch describeGlobal', 'SObjectCacheService', { cacheKey, error });
      throw error;
    }
  }
}
