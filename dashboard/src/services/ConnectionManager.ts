// ========================================
// CONNECTION MANAGER SERVICE
// ========================================

import { logger } from './Logger';
import { apiService } from './ApiService';
import { 
  SavedConnection, 
  SavedConnectionWithCredentials,
  OAuthType 
} from '../domain/models/Connection';

export class ConnectionManager {
  private static instance: ConnectionManager;
  private masterKey: string | null = null;

  private constructor() {
    // No initialization needed - all operations go through Python backend
  }

  static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager();
    }
    return ConnectionManager.instance;
  }

  /**
   * Set the master key for encryption/decryption - now uses database instead of localStorage
   */
  async setMasterKey(key: string, isReset: boolean = false): Promise<void> {
    if (key.length < 8) {
      throw new Error('Master key must be at least 8 characters long');
    }
    
    try {
      // Use API service to set master key in database
      const success = await apiService.setMasterKey(key, isReset);
      
      if (!success) {
        throw new Error('Invalid master key');
      }
      
      this.masterKey = key;
      
    } catch (error) {
      logger.error('Failed to set master key via API', 'ConnectionManager', error);
      throw error;
    }
  }

  /**
   * Check if master key is set
   */
  isMasterKeySet(): boolean {
    return this.masterKey !== null;
  }

  /**
   * Get current master key (for API calls)
   */
  getCurrentMasterKey(): string | null {
    return this.masterKey;
  }


  /**
   * Check if master key hash exists in database (for validation)
   */
  async isMasterKeyHashExists(): Promise<boolean> {
    try {
      // Use API service to check if master key exists in database
      const exists = await apiService.isMasterKeyExists();
      
      return exists;
      
    } catch (error) {
      logger.error('Failed to check master key existence via API', 'ConnectionManager', error);
      return false;
    }
  }

  /**
   * Save a new connection with encrypted credentials (using Python backend)
   */
  async saveConnection(
    authProviderUuid: string,
    username: string,
    password: string,
    environment: 'production' | 'sandbox',
    displayName?: string,
    consumerKey?: string,
    consumerSecret?: string,
    securityToken?: string,
    clientId?: string,
    clientSecret?: string
  ): Promise<string> {
    try {
      if (!this.masterKey) {
        throw new Error('Master key must be set before saving connections');
      }

      // Use API service to save connection (server-side encryption)
      const connectionUuid = await apiService.saveConnection({
        authProviderUuid,
        username,
        password,
        environment,
        displayName: displayName || username,
        consumerKey,
        consumerSecret,
        securityToken,
        clientId,
        clientSecret
      });


      return connectionUuid;

    } catch (error) {
      logger.error('Failed to save connection via API', 'ConnectionManager', null, error as Error);
      throw error;
    }
  }

  /**
   * Get all saved connections from Python backend
   */
  async getAllConnections(): Promise<SavedConnection[]> {
    try {
      logger.debug(' Loading all connections from Python backend', 'ConnectionManager');
      
      const apiConnections = await apiService.getAllConnections();
      const savedConnections: SavedConnection[] = [];
      
      for (const apiConnection of apiConnections) {
        try {
          // Transform API response to SavedConnection format
          const savedConnection: SavedConnection = {
            id: apiConnection.connection_uuid?.replace(/^"(.*)"$/, '$1'), // Strip quotes if present
            oauthType: apiConnection.auth_provider_id === 'auth-provider-sf-classic-001' ? OAuthType.SALESFORCE_CLASSIC : OAuthType.OAUTH_STANDARD,
            username: apiConnection.connection_data.username,
            environment: apiConnection.connection_data.environment as 'production' | 'sandbox',
            displayName: apiConnection.display_name,
            lastUsed: new Date(apiConnection.updated_at).getTime(),
            isActive: true, // All connections from API are active
            consumerKey: apiConnection.connection_data.consumer_key,
            consumerSecret: apiConnection.connection_data.consumer_secret,
            securityToken: apiConnection.connection_data.security_token,
            clientId: apiConnection.connection_data.client_id,
            clientSecret: apiConnection.connection_data.client_secret
          };
          
          savedConnections.push(savedConnection);
        } catch (error) {
          logger.error('Failed to transform connection data', 'ConnectionManager', { connectionUuid: apiConnection.connection_uuid }, error as Error);
        }
      }
      
      return savedConnections;
      
    } catch (error) {
      logger.error('Failed to load connections from API', 'ConnectionManager', null, error as Error);
      throw error;
    }
  }

  /**
   * Get a specific connection by ID with decrypted credentials from Python backend
   */
  async getConnection(connectionId: string): Promise<SavedConnectionWithCredentials | null> {
    try {
      const apiConnection = await apiService.getConnectionWithCredentials(connectionId);
      if (!apiConnection) {
        return null;
      }

      // Transform API response to SavedConnectionWithCredentials format
      const savedConnection: SavedConnectionWithCredentials = {
        id: apiConnection.connection_uuid,
        oauthType: apiConnection.auth_provider_id === 'auth-provider-sf-classic-001' ? OAuthType.SALESFORCE_CLASSIC : OAuthType.OAUTH_STANDARD,
        username: apiConnection.connection_data.username,
        environment: apiConnection.connection_data.environment as 'production' | 'sandbox',
        displayName: apiConnection.display_name,
        lastUsed: new Date(apiConnection.updated_at).getTime(),
        isActive: true, // All connections from API are active
        consumerKey: apiConnection.connection_data.consumer_key,
        consumerSecret: apiConnection.connection_data.consumer_secret,
        securityToken: apiConnection.connection_data.security_token,
        clientId: apiConnection.connection_data.client_id,
        clientSecret: apiConnection.connection_data.client_secret,
        password: apiConnection.connection_data.password
      };
      
      return savedConnection;
      
    } catch (error) {
      logger.error('Failed to get connection from API', 'ConnectionManager', { connectionId }, error as Error);
      return null;
    }
  }



  /**
   * Delete a connection via Python backend
   */
  async deleteConnection(connectionId: string): Promise<void> {
    try {
      const success = await apiService.deleteConnection(connectionId);
      if (!success) {
        throw new Error('Failed to delete connection');
      }
      logger.debug('Connection deleted via Python backend', 'ConnectionManager', { connectionId });
    } catch (error) {
      logger.error('Failed to delete connection via API', 'ConnectionManager', { connectionId }, error as Error);
      throw error;
    }
  }

  /**
   * Clear all connections via Python backend
   */
  async clearAllConnections(): Promise<void> {
    try {
      // Use bulk delete endpoint for efficiency
      const success = await apiService.deleteAllConnections();
      if (!success) {
        throw new Error('Failed to clear all connections');
      }
      logger.debug('All connections cleared via Python backend', 'ConnectionManager');
    } catch (error) {
      logger.error('Failed to clear all connections via API', 'ConnectionManager', null, error as Error);
      throw error;
    }
  }

  /**
   * Clear master key from memory only (for logout)
   */
  clearMasterKeyFromMemory(): void {
    this.masterKey = null;
    logger.debug(' Master key cleared from memory only (hash preserved)', 'ConnectionManager');
  }

  /**
   * Clear master key from memory and remove hash (for reset)
   */
  async clearMasterKey(): Promise<void> {
    this.masterKey = null;
    try {
      // Use the proper delete endpoint that deletes master key and ALL related data
      await this.deleteMasterKeyAndConnections();
    } catch (error) {
      logger.warn('Could not clear encrypted data', 'ConnectionManager', error);
    }
    logger.debug(' Master key cleared from memory, all encrypted data cleared', 'ConnectionManager');
  }

  /**
   * Delete master key and all connections via Python backend (PERMANENT)
   */
  async deleteMasterKeyAndConnections(): Promise<boolean> {
    try {
      // Use API service to delete master key and all connections
      const success = await apiService.deleteMasterKeyAndConnections();
      
      if (success) {
        // Clear from memory
        this.masterKey = null;
        logger.warn('Master key and all connections permanently deleted via Python backend', 'ConnectionManager');
      }
      
      return success;
    } catch (error) {
      logger.error('Failed to delete master key and connections via API', 'ConnectionManager', null, error as Error);
      return false;
    }
  }


}

export const connectionManager = ConnectionManager.getInstance();
