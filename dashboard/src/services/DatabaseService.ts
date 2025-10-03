import { configManager } from '../config/ConfigurationManager';
// DISABLED: Script loader import removed - database initialization moved to Python backend
// import { scriptLoader } from '../assets/script-loader';
import { logger } from './Logger';

// ========================================
// DATABASE SERVICE
// ========================================

export interface DatabaseConfig {
  databasePath: string;
  enableWAL: boolean;
  enableForeignKeys: boolean;
  maxConnections: number;
  timeout: number;
}

export class DatabaseService {
  private static instance: DatabaseService;
  private isInitialized: boolean = false;
  private _isInitializing: boolean = false;
  private readonly config: DatabaseConfig;

  private constructor() {
    this.config = {
      databasePath: this.getDatabasePath(),
      enableWAL: true,
      enableForeignKeys: true,
      maxConnections: 1,
      timeout: 30000
    };
  }

  static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  // ========================================
  // INITIALIZATION
  // ========================================

  async initialize(): Promise<void> {
    // DISABLED: Database initialization moved to Python backend
    logger.debug('[DATABASE] Database initialization disabled - using Python backend');
    this.isInitialized = true;
    return;
  }

  private async checkIfNeedsInitialization(): Promise<boolean> {
    try {
      const currentVersion = await this.getSchemaVersion();
      
      if (!currentVersion) {
        logger.debug('[DATABASE] Database is fresh, needs initialization');
        return true;
      }
      
      const expectedVersion = '2.0'; // Current schema version
      
      if (currentVersion !== expectedVersion) {
        logger.debug(`[DATABASE] Database schema version mismatch, needs update: ${currentVersion} !== ${expectedVersion}`);
        return true;
      }
      
      logger.debug(`[DATABASE] Database schema is up to date: ${currentVersion}`);
      return false;
    } catch (error) {
      logger.warn(`[DATABASE] Error checking database version, assuming needs initialization: ${error instanceof Error ? error.message : String(error)}`);
      return true;
    }
  }

  private async setDatabaseVersion(): Promise<void> {
    try {
      const version = '2.0'; // Current schema version
      const timestamp = new Date().toISOString();
      
      await this.executeQuery(
        "INSERT INTO schema_version (version, created_at) VALUES (?, ?)",
        [version, timestamp]
      );
      
      logger.debug(`[DATABASE] Database schema version set: ${version} at ${timestamp}`);
    } catch (error) {
      logger.error('[DATABASE] Failed to set database schema version:', error);
      throw error;
    }
  }

  async forceReinitialize(): Promise<void> {
    logger.debug('[DATABASE] Force re-initializing database');
    
    this.isInitialized = false;
    this._isInitializing = false;
    
    // Clear schema version to force re-initialization
    try {
      await this.executeQuery("DELETE FROM schema_version");
      logger.debug('[DATABASE] Schema version cleared, will re-initialize on next startup');
    } catch (error) {
      logger.warn('[DATABASE] Could not clear schema version', error);
    }
  }

  async getSchemaVersion(): Promise<string | null> {
    try {
      const result = await this.executeQuery("SELECT version FROM schema_version ORDER BY id DESC LIMIT 1");
      return result.data[0]?.version || null;
    } catch (error) {
      logger.warn('Could not get schema version', 'DatabaseService', error);
      return null;
    }
  }

  private async initializeDatabase(): Promise<void> {
    try {
      logger.debug(' [DATABASE] Initializing SQLite database', `databasePath: ${this.config.databasePath}`);
      
      // Database initialization is now handled by the Python backend
      // No need to initialize locally since we're using REST API
      
      logger.debug('[DATABASE] SQLite database connection established');
    } catch (error) {
      logger.error('[DATABASE] Failed to initialize SQLite database:', error);
      throw error;
    }
  }

  private getDatabasePath(): string {
    // Use default database path
    return 'soql-developer.db';
  }

  private async createTables(): Promise<void> {
    logger.debug('[DATABASE] Creating database tables');
    
    // Create tables using external DDL scripts
    await this.createTablesFromExternalScripts();
    
    logger.debug('[DATABASE] Database tables created using external DDL scripts');
  }

  private async createTablesFromExternalScripts(): Promise<void> {
    logger.debug(' [DATABASE] DISABLED: Database schema loading moved to Python backend');
    
    // DISABLED: DDL script execution moved to Python backend
    // The Python backend now handles all database initialization
    logger.debug('[DATABASE] Database initialization handled by Python backend');
  }

  async close(): Promise<void> {
    this.isInitialized = false;
    this._isInitializing = false;
    
    // Database connection is managed by the Python backend
    logger.debug('Database connection closed (managed by backend)', 'DatabaseService');
  }

  async executeQuery(sql: string, params: any[] = []): Promise<any> {
    if (!this.isInitialized && !this._isInitializing) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    logger.debug('Executing query', 'DatabaseService', { sql, params });
    
    try {
      // Execute query through REST API
      const { apiService } = await import('./ApiService');
      const result = await apiService.executeDatabaseQuery(sql, params);
      return result;
    } catch (error) {
      logger.error('Query execution failed', 'DatabaseService', { sql, params, error });
      throw error;
    }
  }

  async executeTransaction(queries: Array<{ sql: string; params?: any[] }>): Promise<void> {
    if (!this.isInitialized && !this._isInitializing) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    logger.debug('Executing transaction', 'DatabaseService', { queryCount: queries.length });
    
    try {
      // Execute transaction through individual queries (fallback)
      for (const query of queries) {
        await this.executeQuery(query.sql, query.params || []);
      }
      logger.debug('Transaction executed successfully', 'DatabaseService');
    } catch (error) {
      logger.error('Transaction failed', 'DatabaseService', error);
      throw error;
    }
  }

  async backupDatabase(backupPath: string): Promise<void> {
    logger.debug('Creating database backup', 'DatabaseService', { backupPath });
    // Backup functionality not implemented yet
  }

  async restoreDatabase(backupPath: string): Promise<void> {
    logger.debug('Restoring database from', 'DatabaseService', { backupPath });
    // Restore functionality not implemented yet
  }

  private async populateTranslationsFromFiles(): Promise<void> {
    logger.debug('Starting translation population', 'DatabaseService');
    
    try {
      // Populate translations using external DML scripts
      await this.populateTranslationsFromExternalScripts();
      
      logger.debug('Translations populated using external DML scripts', 'DatabaseService');
    } catch (error) {
      logger.error('Failed to populate translations from external scripts', 'DatabaseService', error);
      throw error;
    }
  }

  private async populateTranslationsFromExternalScripts(): Promise<void> {
    logger.debug('DISABLED: Initial data loading moved to Python backend', 'DatabaseService');
    
    // DISABLED: DML script execution moved to Python backend
    // The Python backend now handles all initial data population
    logger.debug('Initial data population handled by Python backend', 'DatabaseService');
  }
}

export const databaseService = DatabaseService.getInstance();
