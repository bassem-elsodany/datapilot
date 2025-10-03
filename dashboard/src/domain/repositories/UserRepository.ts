import { databaseService } from '../../services/DatabaseService';
import { UserModel, User, CreateUserRequest, UpdateUserRequest, UserPreferences, UserStats } from '../models/User';

// ========================================
// USER REPOSITORY
// ========================================

export interface UserSearchFilters {
  username?: string;
  email?: string;
  isActive?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface UserListOptions {
  limit?: number;
  offset?: number;
  sortBy?: 'username' | 'createdAt' | 'lastLogin';
  sortOrder?: 'asc' | 'desc';
}

export class UserRepository {
  private static instance: UserRepository;

  private constructor() {}

  static getInstance(): UserRepository {
    if (!UserRepository.instance) {
      UserRepository.instance = new UserRepository();
    }
    return UserRepository.instance;
  }

  // ========================================
  // CRUD OPERATIONS
  // ========================================

  /**
   * Create a new user
   */
  async create(userData: CreateUserRequest): Promise<UserModel> {
    const user = UserModel.create(userData);
    const validation = user.validate();
    
    if (!validation.isValid) {
      throw new Error(`Invalid user data: ${validation.errors.join(', ')}`);
    }

    const sql = `
      INSERT INTO users (username, email, display_name, created_at, updated_at, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    const params = [
      user.username,
      user.email,
      user.displayName,
      user.createdAt.toISOString(),
      user.updatedAt.toISOString(),
      user.isActive ? 1 : 0
    ];

    const result = await databaseService.executeQuery(sql, params);
    
    // Set the generated ID
    const newUser = new UserModel({
      ...user.toJSON(),
      id: result.lastInsertRowId
    });

          // Note: Can't use logger here as it might cause circular dependency
    return newUser;
  }

  /**
   * Find user by ID
   */
  async findById(id: number): Promise<UserModel | null> {
    const sql = `
      SELECT * FROM users WHERE id = ?
    `;
    
    const result = await databaseService.executeQuery(sql, [id]);
    
    if (result.data && result.data.length > 0) {
      return new UserModel(this.mapDatabaseRowToUser(result.data[0]));
    }
    
    return null;
  }

  /**
   * Find user by username
   */
  async findByUsername(username: string): Promise<UserModel | null> {
    const sql = `
      SELECT * FROM users WHERE username = ?
    `;
    
    const result = await databaseService.executeQuery(sql, [username]);
    
    if (result.data && result.data.length > 0) {
      return new UserModel(this.mapDatabaseRowToUser(result.data[0]));
    }
    
    return null;
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<UserModel | null> {
    const sql = `
      SELECT * FROM users WHERE email = ?
    `;
    
    const result = await databaseService.executeQuery(sql, [email]);
    
    if (result.data && result.data.length > 0) {
      return new UserModel(this.mapDatabaseRowToUser(result.data[0]));
    }
    
    return null;
  }

  /**
   * Update user
   */
  async update(id: number, updates: UpdateUserRequest): Promise<UserModel | null> {
    const user = await this.findById(id);
    if (!user) {
      return null;
    }

    user.update(updates);
    const validation = user.validate();
    
    if (!validation.isValid) {
      throw new Error(`Invalid user data: ${validation.errors.join(', ')}`);
    }

    const sql = `
      UPDATE users 
      SET email = ?, display_name = ?, updated_at = ?, is_active = ?
      WHERE id = ?
    `;
    
    const params = [
      user.email,
      user.displayName,
      user.updatedAt.toISOString(),
      user.isActive ? 1 : 0,
      id
    ];

    await databaseService.executeQuery(sql, params);
    
          // Note: Can't use logger here as it might cause circular dependency
    return user;
  }

  /**
   * Delete user
   */
  async delete(id: number): Promise<boolean> {
    const sql = `
      DELETE FROM users WHERE id = ?
    `;
    
    const result = await databaseService.executeQuery(sql, [id]);
    
    if (result.changes > 0) {
      // Note: Can't use logger here as it might cause circular dependency
      return true;
    }
    
    return false;
  }

  // ========================================
  // SEARCH AND LIST OPERATIONS
  // ========================================

  /**
   * Find users with filters
   */
  async find(filters: UserSearchFilters = {}, options: UserListOptions = {}): Promise<UserModel[]> {
    let sql = 'SELECT * FROM users WHERE 1=1';
    const params: any[] = [];

    // Apply filters
    if (filters.username) {
      sql += ' AND username LIKE ?';
      params.push(`%${filters.username}%`);
    }

    if (filters.email) {
      sql += ' AND email LIKE ?';
      params.push(`%${filters.email}%`);
    }

    if (filters.isActive !== undefined) {
      sql += ' AND is_active = ?';
      params.push(filters.isActive ? 1 : 0);
    }

    if (filters.dateFrom) {
      sql += ' AND created_at >= ?';
      params.push(filters.dateFrom.toISOString());
    }

    if (filters.dateTo) {
      sql += ' AND created_at <= ?';
      params.push(filters.dateTo.toISOString());
    }

    // Apply sorting
    const sortBy = options.sortBy || 'username';
    const sortOrder = options.sortOrder || 'asc';
    sql += ` ORDER BY ${sortBy} ${sortOrder.toUpperCase()}`;

    // Apply pagination
    if (options.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options.offset) {
      sql += ' OFFSET ?';
      params.push(options.offset);
    }

    const result = await databaseService.executeQuery(sql, params);
    
    return result.data.map((row: any) => new UserModel(this.mapDatabaseRowToUser(row)));
  }

  /**
   * Get all users
   */
  async findAll(): Promise<UserModel[]> {
    return this.find();
  }

  /**
   * Count users
   */
  async count(filters: UserSearchFilters = {}): Promise<number> {
    let sql = 'SELECT COUNT(*) as count FROM users WHERE 1=1';
    const params: any[] = [];

    // Apply filters
    if (filters.username) {
      sql += ' AND username LIKE ?';
      params.push(`%${filters.username}%`);
    }

    if (filters.email) {
      sql += ' AND email LIKE ?';
      params.push(`%${filters.email}%`);
    }

    if (filters.isActive !== undefined) {
      sql += ' AND is_active = ?';
      params.push(filters.isActive ? 1 : 0);
    }

    const result = await databaseService.executeQuery(sql, params);
    return result.data[0]?.count || 0;
  }

  // ========================================
  // USER PREFERENCES
  // ========================================

  /**
   * Get user preferences
   */
  async getPreferences(userId: number): Promise<UserPreferences> {
    const sql = `
      SELECT preference_key, preference_value, preference_type 
      FROM preferences 
      WHERE user_id = ?
    `;
    
    const result = await databaseService.executeQuery(sql, [userId]);
    
    const preferences: UserPreferences = {
      theme: 'light',
      fontSize: 'medium',
      language: 'en',
      timezone: 'UTC',
      dateFormat: 'MM/dd/yyyy',
      numberFormat: 'decimal',
      enableNotifications: true,
      enableAutoSave: true,
      maxSavedSessions: 50,
      queryTimeout: 30000
    };

    result.data.forEach((row: any) => {
      const key = row.preference_key;
      const value = this.parsePreferenceValue(row.preference_value, row.preference_type);
      
      if (key in preferences) {
        (preferences as any)[key] = value;
      }
    });

    return preferences;
  }

  /**
   * Update user preferences
   */
  async updatePreferences(userId: number, preferences: Partial<UserPreferences>): Promise<void> {
    const queries = Object.entries(preferences).map(([key, value]) => ({
      sql: `
        INSERT OR REPLACE INTO preferences (user_id, preference_key, preference_value, preference_type, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `,
      params: [
        userId,
        key,
        this.serializePreferenceValue(value),
        this.getPreferenceType(value),
        new Date().toISOString()
      ]
    }));

    await databaseService.executeTransaction(queries);
          // Note: Can't use logger here as it might cause circular dependency
  }

  // ========================================
  // USER STATISTICS
  // ========================================

  /**
   * Get user statistics
   */
  async getStats(userId: number): Promise<UserStats> {
    const sql = `
      SELECT 
        (SELECT COUNT(*) FROM sessions WHERE user_id = ?) as total_sessions,
        (SELECT COUNT(*) FROM queries WHERE user_id = ?) as total_queries,
        (SELECT COUNT(*) FROM query_history WHERE user_id = ?) as total_executions,
        (SELECT AVG(execution_time_ms) FROM query_history WHERE user_id = ? AND execution_time_ms IS NOT NULL) as avg_execution_time,
        (SELECT COUNT(*) FROM queries WHERE user_id = ? AND is_favorite = 1) as favorite_queries,
        (SELECT MAX(executed_at) FROM query_history WHERE user_id = ?) as last_activity
    `;
    
    const result = await databaseService.executeQuery(sql, [userId, userId, userId, userId, userId, userId]);
    const row = result.data[0];

    return {
      totalSessions: row?.total_sessions || 0,
      totalQueries: row?.total_queries || 0,
      totalExecutions: row?.total_executions || 0,
      averageExecutionTime: row?.avg_execution_time || 0,
      lastActivity: row?.last_activity ? new Date(row.last_activity) : new Date(),
      favoriteQueries: row?.favorite_queries || 0
    };
  }

  /**
   * Record user login
   */
  async recordLogin(userId: number): Promise<void> {
    const sql = `
      UPDATE users 
      SET last_login = ?, updated_at = ?
      WHERE id = ?
    `;
    
    await databaseService.executeQuery(sql, [
      new Date().toISOString(),
      new Date().toISOString(),
      userId
    ]);
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  /**
   * Check if username exists
   */
  async usernameExists(username: string, excludeId?: number): Promise<boolean> {
    let sql = 'SELECT COUNT(*) as count FROM users WHERE username = ?';
    const params: any[] = [username];

    if (excludeId) {
      sql += ' AND id != ?';
      params.push(excludeId);
    }

    const result = await databaseService.executeQuery(sql, params);
    return (result.data[0]?.count || 0) > 0;
  }

  /**
   * Check if email exists
   */
  async emailExists(email: string, excludeId?: number): Promise<boolean> {
    let sql = 'SELECT COUNT(*) as count FROM users WHERE email = ?';
    const params: any[] = [email];

    if (excludeId) {
      sql += ' AND id != ?';
      params.push(excludeId);
    }

    const result = await databaseService.executeQuery(sql, params);
    return (result.data[0]?.count || 0) > 0;
  }

  /**
   * Get recently active users
   */
  async getRecentlyActiveUsers(days: number = 30): Promise<UserModel[]> {
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - days);

    const sql = `
      SELECT * FROM users 
      WHERE last_login >= ? 
      ORDER BY last_login DESC
    `;
    
    const result = await databaseService.executeQuery(sql, [dateThreshold.toISOString()]);
    
    return result.data.map((row: any) => new UserModel(this.mapDatabaseRowToUser(row)));
  }

  // ========================================
  // PRIVATE HELPER METHODS
  // ========================================

  private mapDatabaseRowToUser(row: any): User {
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      displayName: row.display_name,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      lastLogin: row.last_login ? new Date(row.last_login) : undefined,
      isActive: Boolean(row.is_active)
    };
  }

  private parsePreferenceValue(value: string, type: string): any {
    switch (type) {
      case 'boolean':
        return value === 'true';
      case 'number':
        return Number(value);
      case 'object':
        return JSON.parse(value);
      default:
        return value;
    }
  }

  private serializePreferenceValue(value: any): string {
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }

  private getPreferenceType(value: any): string {
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'object') return 'object';
    return 'string';
  }
}

// Export singleton instance
export const userRepository = UserRepository.getInstance();
