// ========================================
// CONNECTION REPOSITORY
// ========================================

import { databaseService } from '../../services/DatabaseService';
import { logger } from '../../services/Logger';
import { v4 as uuidv4 } from 'uuid';
import { 
  Connection, 
  CreateConnectionRequest, 
  UpdateConnectionRequest, 
  ConnectionQuery 
} from '../models/Connection';

export class ConnectionRepository {
  private readonly tableName = 'connections';

  /**
   * Create a new connection
   */
  async create(connectionData: CreateConnectionRequest, encryptedCredentials: string): Promise<Connection> {
    try {
      const connectionUuid = this.generateUuid();
      const now = new Date();

      const query = `
        INSERT INTO ${this.tableName} (
          connection_uuid,
          display_name,
          auth_provider_id,
          encrypted_credentials,
          is_connection_active,
          last_used,
          created_at,
          updated_at,
          created_by,
          version,
          is_deleted
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        connectionUuid,
        connectionData.displayName,
        connectionData.authProviderId,
        encryptedCredentials,
        true, // isConnectionActive
        now.toISOString(),
        now.toISOString(),
        now.toISOString(),
        connectionData.createdBy,
        1, // version
        false // isDeleted
      ];

      await databaseService.executeQuery(query, params);

      const createdConnection: Connection = {
        connectionUuid,
        displayName: connectionData.displayName,
        authProviderId: connectionData.authProviderId,
        encryptedCredentials,
        isConnectionActive: true,
        lastUsed: now,
        createdAt: now,
        updatedAt: now,
        createdBy: connectionData.createdBy,
        version: 1,
        isDeleted: false
      };

      logger.debug('Connection created successfully', 'ConnectionRepository', { connectionUuid });
      return createdConnection;

    } catch (error) {
      logger.error('Failed to create connection', 'ConnectionRepository', null, error as Error);
      throw error;
    }
  }

  /**
   * Find connections by query
   */
  async find(query?: ConnectionQuery): Promise<Connection[]> {
    try {
      let sql = `SELECT * FROM ${this.tableName}`;
      const params: any[] = [];
      const conditions: string[] = [];

      if (query) {
        if (query.connectionUuid) {
          conditions.push('connection_uuid = ?');
          params.push(query.connectionUuid);
        }
        if (query.displayName) {
          conditions.push('display_name LIKE ?');
          params.push(`%${query.displayName}%`);
        }
        if (query.authProviderId) {
          conditions.push('auth_provider_id = ?');
          params.push(query.authProviderId);
        }
        if (query.isConnectionActive !== undefined) {
          conditions.push('is_connection_active = ?');
          params.push(query.isConnectionActive);
        }
        if (query.createdBy) {
          conditions.push('created_by = ?');
          params.push(query.createdBy);
        }
        if (query.isDeleted !== undefined) {
          conditions.push('is_deleted = ?');
          params.push(query.isDeleted);
        }
      }

      // Always filter out deleted connections unless explicitly requested
      if (!query?.isDeleted) {
        conditions.push('is_deleted = 0');
      }

      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }

      sql += ' ORDER BY last_used DESC';

      const result = await databaseService.executeQuery(sql, params);
      
      const connections: Connection[] = result.data.map((row: any) => ({
        connectionUuid: row.connection_uuid,
        displayName: row.display_name,
        authProviderId: row.auth_provider_id,
        encryptedCredentials: row.encrypted_credentials,
        isConnectionActive: Boolean(row.is_connection_active),
        lastUsed: new Date(row.last_used),
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        createdBy: row.created_by,
        updatedBy: row.updated_by,
        version: row.version,
        isDeleted: Boolean(row.is_deleted),
        deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined
      }));

      logger.debug('Connections retrieved successfully', 'ConnectionRepository', { count: connections.length });
      return connections;

    } catch (error) {
      logger.error('Failed to retrieve connections', 'ConnectionRepository', null, error as Error);
      throw error;
    }
  }

  /**
   * Find connection by UUID
   */
  async findByUuid(connectionUuid: string): Promise<Connection | null> {
    try {
      const connections = await this.find({ connectionUuid });
      return connections.length > 0 ? connections[0] : null;
    } catch (error) {
      logger.error('Failed to find connection by UUID', 'ConnectionRepository', { connectionUuid }, error as Error);
      throw error;
    }
  }

  /**
   * Update connection
   */
  async update(connectionUuid: string, updateData: UpdateConnectionRequest): Promise<void> {
    try {
      const now = new Date();
      const updates: string[] = [];
      const params: any[] = [];

      if (updateData.displayName !== undefined) {
        updates.push('display_name = ?');
        params.push(updateData.displayName);
      }
      if (updateData.authProviderId !== undefined) {
        updates.push('auth_provider_id = ?');
        params.push(updateData.authProviderId);
      }
      if (updateData.isConnectionActive !== undefined) {
        updates.push('is_connection_active = ?');
        params.push(updateData.isConnectionActive);
      }
      if (updateData.updatedBy !== undefined) {
        updates.push('updated_by = ?');
        params.push(updateData.updatedBy);
      }

      updates.push('updated_at = ?');
      params.push(now.toISOString());

      params.push(connectionUuid);

      const query = `
        UPDATE ${this.tableName} 
        SET ${updates.join(', ')}
        WHERE connection_uuid = ?
      `;

      await databaseService.executeQuery(query, params);

      logger.debug('Connection updated successfully', 'ConnectionRepository', { connectionUuid });

    } catch (error) {
      logger.error('Failed to update connection', 'ConnectionRepository', { connectionUuid }, error as Error);
      throw error;
    }
  }

  /**
   * Update last used timestamp
   */
  async updateLastUsed(connectionUuid: string): Promise<void> {
    try {
      const query = `
        UPDATE ${this.tableName} 
        SET last_used = ?, updated_at = ?
        WHERE connection_uuid = ?
      `;

      const now = new Date();
      await databaseService.executeQuery(query, [now.toISOString(), now.toISOString(), connectionUuid]);

      logger.debug('Connection last used updated', 'ConnectionRepository', { connectionUuid });

    } catch (error) {
      logger.error('Failed to update connection last used', 'ConnectionRepository', { connectionUuid }, error as Error);
      throw error;
    }
  }

  /**
   * Delete connection (soft delete)
   */
  async delete(connectionUuid: string): Promise<void> {
    try {
      const query = `
        UPDATE ${this.tableName} 
        SET is_deleted = 1, deleted_at = ?, updated_at = ?
        WHERE connection_uuid = ?
      `;

      const now = new Date();
      await databaseService.executeQuery(query, [now.toISOString(), now.toISOString(), connectionUuid]);

      logger.debug('Connection deleted successfully', 'ConnectionRepository', { connectionUuid });

    } catch (error) {
      logger.error('Failed to delete connection', 'ConnectionRepository', { connectionUuid }, error as Error);
      throw error;
    }
  }

  /**
   * Delete all connections (soft delete)
   */
  async deleteAll(): Promise<void> {
    try {
      const query = `
        UPDATE ${this.tableName} 
        SET is_deleted = 1, deleted_at = ?, updated_at = ?
        WHERE is_deleted = 0
      `;

      const now = new Date();
      await databaseService.executeQuery(query, [now.toISOString(), now.toISOString()]);

      logger.debug('All connections deleted successfully', 'ConnectionRepository');

    } catch (error) {
      logger.error('Failed to delete all connections', 'ConnectionRepository', null, error as Error);
      throw error;
    }
  }

  /**
   * Generate proper UUID v4 for connection
   */
  private generateUuid(): string {
    return `conn_${uuidv4()}`;
  }
}
