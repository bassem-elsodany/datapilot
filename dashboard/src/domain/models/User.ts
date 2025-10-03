// ========================================
// USER DOMAIN MODEL
// ========================================

export interface User {
  id?: number;
  username: string;
  email?: string;
  displayName?: string;
  createdAt?: Date;
  updatedAt?: Date;
  lastLogin?: Date;
  isActive: boolean;
}

export interface CreateUserRequest {
  username: string;
  email?: string;
  displayName?: string;
}

export interface UpdateUserRequest {
  email?: string;
  displayName?: string;
  isActive?: boolean;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto';
  fontSize: 'small' | 'medium' | 'large' | 'xlarge';
  language: string;
  timezone: string;
  dateFormat: string;
  numberFormat: string;
  enableNotifications: boolean;
  enableAutoSave: boolean;
  maxSavedSessions: number;
  queryTimeout: number;
}

export interface UserStats {
  totalSessions: number;
  totalQueries: number;
  totalExecutions: number;
  averageExecutionTime: number;
  lastActivity: Date;
  favoriteQueries: number;
}

export class UserModel {
  private _id?: number;
  private _username: string;
  private _email?: string;
  private _displayName?: string;
  private _createdAt: Date;
  private _updatedAt: Date;
  private _lastLogin?: Date;
  private _isActive: boolean;

  constructor(user: User) {
    this._id = user.id;
    this._username = user.username;
    this._email = user.email;
    this._displayName = user.displayName;
    this._createdAt = user.createdAt || new Date();
    this._updatedAt = user.updatedAt || new Date();
    this._lastLogin = user.lastLogin;
    this._isActive = user.isActive ?? true;
  }

  // ========================================
  // GETTERS
  // ========================================

  get id(): number | undefined {
    return this._id;
  }

  get username(): string {
    return this._username;
  }

  get email(): string | undefined {
    return this._email;
  }

  get displayName(): string | undefined {
    return this._displayName;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  get lastLogin(): Date | undefined {
    return this._lastLogin;
  }

  get isActive(): boolean {
    return this._isActive;
  }

  // ========================================
  // BUSINESS LOGIC
  // ========================================

  /**
   * Update user information
   */
  update(updates: UpdateUserRequest): void {
    if (updates.email !== undefined) {
      this._email = updates.email;
    }
    if (updates.displayName !== undefined) {
      this._displayName = updates.displayName;
    }
    if (updates.isActive !== undefined) {
      this._isActive = updates.isActive;
    }
    this._updatedAt = new Date();
  }

  /**
   * Record user login
   */
  recordLogin(): void {
    this._lastLogin = new Date();
    this._updatedAt = new Date();
  }

  /**
   * Deactivate user
   */
  deactivate(): void {
    this._isActive = false;
    this._updatedAt = new Date();
  }

  /**
   * Activate user
   */
  activate(): void {
    this._isActive = true;
    this._updatedAt = new Date();
  }

  /**
   * Get user's display name (falls back to username)
   */
  getDisplayName(): string {
    return this._displayName || this._username;
  }

  /**
   * Check if user is recently active (within last 30 days)
   */
  isRecentlyActive(): boolean {
    if (!this._lastLogin) {
      return false;
    }
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return this._lastLogin > thirtyDaysAgo;
  }

  /**
   * Validate user data
   */
  validate(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this._username || this._username.trim().length === 0) {
      errors.push('Username is required');
    }

    if (this._username && this._username.length < 3) {
      errors.push('Username must be at least 3 characters long');
    }

    if (this._email && !this.isValidEmail(this._email)) {
      errors.push('Invalid email format');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Convert to plain object
   */
  toJSON(): User {
    return {
      id: this._id,
      username: this._username,
      email: this._email,
      displayName: this._displayName,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
      lastLogin: this._lastLogin,
      isActive: this._isActive
    };
  }

  /**
   * Create a new user instance
   */
  static create(data: CreateUserRequest): UserModel {
    const user: User = {
      username: data.username,
      email: data.email,
      displayName: data.displayName,
      isActive: true
    };
    return new UserModel(user);
  }

  // ========================================
  // PRIVATE HELPER METHODS
  // ========================================

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}
