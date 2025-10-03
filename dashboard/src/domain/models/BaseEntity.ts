// ========================================
// BASE ENTITY PATTERN
// ========================================

/**
 * Base entity interface that all domain entities extend
 * Provides consistent behavior and future extensibility
 */
export interface BaseEntity {
  id?: number | string;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string; // For future multi-user support
  updatedBy?: string; // For future multi-user support
  version: number; // For optimistic locking
  isDeleted?: boolean; // For soft deletes
  deletedAt?: Date; // For soft deletes
}

/**
 * Base entity model with common functionality
 */
export abstract class BaseEntityModel<T extends BaseEntity> {
  protected _id?: number | string;
  protected _createdAt: Date;
  protected _updatedAt: Date;
  protected _createdBy?: string;
  protected _updatedBy?: string;
  protected _version: number;
  protected _isDeleted: boolean;
  protected _deletedAt?: Date;

  constructor(entity: T) {
    this._id = entity.id;
    this._createdAt = entity.createdAt || new Date();
    this._updatedAt = entity.updatedAt || new Date();
    this._createdBy = entity.createdBy;
    this._updatedBy = entity.updatedBy;
    this._version = entity.version || 1;
    this._isDeleted = entity.isDeleted || false;
    this._deletedAt = entity.deletedAt;
  }

  // ========================================
  // GETTERS
  // ========================================

  get id(): number | string | undefined {
    return this._id;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  get createdBy(): string | undefined {
    return this._createdBy;
  }

  get updatedBy(): string | undefined {
    return this._updatedBy;
  }

  get version(): number {
    return this._version;
  }

  get isDeleted(): boolean {
    return this._isDeleted;
  }

  get deletedAt(): Date | undefined {
    return this._deletedAt;
  }

  // ========================================
  // BUSINESS LOGIC
  // ========================================

  /**
   * Mark entity as updated
   */
  protected markUpdated(updatedBy?: string): void {
    this._updatedAt = new Date();
    this._updatedBy = updatedBy;
    this._version++;
  }

  /**
   * Soft delete entity
   */
  softDelete(deletedBy?: string): void {
    this._isDeleted = true;
    this._deletedAt = new Date();
    this._updatedBy = deletedBy;
    this.markUpdated(deletedBy);
  }

  /**
   * Restore soft deleted entity
   */
  restore(restoredBy?: string): void {
    this._isDeleted = false;
    this._deletedAt = undefined;
    this._updatedBy = restoredBy;
    this.markUpdated(restoredBy);
  }

  /**
   * Check if entity is active (not deleted)
   */
  isActive(): boolean {
    return !this._isDeleted;
  }

  /**
   * Get age of entity in days
   */
  getAgeInDays(): number {
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - this._createdAt.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Check if entity was created recently (within specified days)
   */
  isRecentlyCreated(days: number = 7): boolean {
    return this.getAgeInDays() <= days;
  }

  /**
   * Check if entity was updated recently (within specified days)
   */
  isRecentlyUpdated(days: number = 7): boolean {
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - this._updatedAt.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= days;
  }

  /**
   * Get base entity data
   */
  protected getBaseEntityData(): BaseEntity {
    return {
      id: this._id,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
      createdBy: this._createdBy,
      updatedBy: this._updatedBy,
      version: this._version,
      isDeleted: this._isDeleted,
      deletedAt: this._deletedAt
    };
  }

  /**
   * Abstract method that subclasses must implement
   */
  abstract toJSON(): T;
}
