// ========================================
// SAVED QUERY DOMAIN MODEL
// ========================================

import { BaseEntity, BaseEntityModel } from './BaseEntity';

/**
 * SAVED_QUERY - User Saved Queries
 * Purpose: Store user-saved queries with names, tags, and metadata
 * Lifecycle: Permanent until user deletes
 */
export interface SavedQuery extends BaseEntity {
  connectionUuid: string; // Foreign key to connections table
  name: string; // User-defined query name
  queryText: string; // The actual SOQL query
  description?: string; // User description
  tags?: string; // User tags (comma separated)
  isFavorite: boolean; // User favorite flag
  executionCount: number; // How many times this saved query was executed
  lastExecuted?: Date; // Last time this saved query was executed
}





// Align with existing QueryResult interface
export interface QueryResult {
  records: any[];
  total_size: number;
  done: boolean;
  // Extended fields for enhanced functionality
  executionTimeMs?: number;
  errorMessage?: string;
  metadata?: {
    sobjectType: string;
    fields: string[];
    queryType: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'UPSERT';
  };
}

export interface CreateSavedQueryRequest {
  connectionUuid: string;
  name: string;
  queryText: string;
  description?: string;
  tags?: string;
  isFavorite?: boolean;
  createdBy?: string;
}

export interface UpdateSavedQueryRequest {
  name?: string;
  queryText?: string;
  description?: string;
  tags?: string;
  isFavorite?: boolean;
  updatedBy?: string;
}

export interface SavedQuerySearchFilters {
  connectionUuid?: string;
  name?: string;
  tags?: string[];
  isFavorite?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
}



export interface SavedQueryStats {
  totalSavedQueries: number;
  favoriteQueries: number;
  totalExecutions: number;
  averageExecutionTime: number;
  mostUsedQueries: Array<{
    id: number;
    name: string;
    executionCount: number;
  }>;
  recentQueries: Array<{
    id: number;
    name: string;
    lastExecuted: Date;
  }>;
}



export class SavedQueryModel extends BaseEntityModel<SavedQuery> {
  private _connectionUuid: string;
  private _name: string;
  private _queryText: string;
  private _description?: string;
  private _tags?: string;
  private _isFavorite: boolean;
  private _executionCount: number;
  private _lastExecuted?: Date;

  constructor(savedQuery: SavedQuery) {
    super(savedQuery);
    this._connectionUuid = savedQuery.connectionUuid;
    this._name = savedQuery.name;
    this._queryText = savedQuery.queryText;
    this._description = savedQuery.description;
    this._tags = savedQuery.tags;
    this._isFavorite = savedQuery.isFavorite ?? false;
    this._executionCount = savedQuery.executionCount ?? 0;
    this._lastExecuted = savedQuery.lastExecuted;
  }

  // ========================================
  // GETTERS
  // ========================================

  get connectionUuid(): string {
    return this._connectionUuid;
  }

  get name(): string {
    return this._name;
  }

  get queryText(): string {
    return this._queryText;
  }

  get description(): string | undefined {
    return this._description;
  }

  get tags(): string | undefined {
    return this._tags;
  }

  get isFavorite(): boolean {
    return this._isFavorite;
  }

  get executionCount(): number {
    return this._executionCount;
  }

  get lastExecuted(): Date | undefined {
    return this._lastExecuted;
  }

  // ========================================
  // BUSINESS LOGIC
  // ========================================

  /**
   * Update saved query information
   */
  update(updates: UpdateSavedQueryRequest): void {
    if (updates.name !== undefined) {
      this._name = updates.name;
    }
    if (updates.queryText !== undefined) {
      this._queryText = updates.queryText;
    }
    if (updates.description !== undefined) {
      this._description = updates.description;
    }
    if (updates.tags !== undefined) {
      this._tags = updates.tags;
    }
    if (updates.isFavorite !== undefined) {
      this._isFavorite = updates.isFavorite;
    }
    this.markUpdated(updates.updatedBy);
  }

  /**
   * Record query execution
   */
  recordExecution(executionTimeMs?: number): void {
    this._executionCount++;
    this._lastExecuted = new Date();
    this.markUpdated();
  }

  /**
   * Toggle favorite status
   */
  toggleFavorite(): void {
    this._isFavorite = !this._isFavorite;
    this.markUpdated();
  }

  /**
   * Get query tags as array
   */
  getTagsArray(): string[] {
    if (!this._tags) {
      return [];
    }
    return this._tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
  }

  /**
   * Add tag to query
   */
  addTag(tag: string): void {
    const tags = this.getTagsArray();
    if (!tags.includes(tag)) {
      tags.push(tag);
      this._tags = tags.join(', ');
      this.markUpdated();
    }
  }

  /**
   * Remove tag from query
   */
  removeTag(tag: string): void {
    const tags = this.getTagsArray();
    const filteredTags = tags.filter(t => t !== tag);
    this._tags = filteredTags.join(', ');
    this.markUpdated();
  }

  /**
   * Check if query has specific tag
   */
  hasTag(tag: string): boolean {
    return this.getTagsArray().includes(tag);
  }

  /**
   * Get query type (SELECT, INSERT, UPDATE, DELETE, UPSERT)
   */
  getQueryType(): 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'UPSERT' {
    const trimmedQuery = this._queryText.trim().toUpperCase();
    if (trimmedQuery.startsWith('SELECT')) return 'SELECT';
    if (trimmedQuery.startsWith('INSERT')) return 'INSERT';
    if (trimmedQuery.startsWith('UPDATE')) return 'UPDATE';
    if (trimmedQuery.startsWith('DELETE')) return 'DELETE';
    if (trimmedQuery.startsWith('UPSERT')) return 'UPSERT';
    return 'SELECT'; // Default fallback
  }

  /**
   * Get main SObject from query
   */
  getMainSObject(): string | null {
    const selectMatch = this._queryText.match(/FROM\s+(\w+)/i);
    if (selectMatch) {
      return selectMatch[1];
    }
    return null;
  }

  /**
   * Get selected fields from query
   */
  getSelectedFields(): string[] {
    const selectMatch = this._queryText.match(/SELECT\s+(.+?)\s+FROM/i);
    if (selectMatch) {
      const fields = selectMatch[1].split(',').map(field => field.trim());
      return fields.filter(field => field.length > 0);
    }
    return [];
  }

  /**
   * Check if query is recently executed (within last 24 hours)
   */
  isRecentlyExecuted(): boolean {
    if (!this._lastExecuted) {
      return false;
    }
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
    return this._lastExecuted > twentyFourHoursAgo;
  }

  /**
   * Check if query is valid SOQL
   */
  isValidSOQL(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this._queryText || this._queryText.trim().length === 0) {
      errors.push('Query text is required');
      return { isValid: false, errors };
    }

    const query = this._queryText.trim().toUpperCase();

    // Basic SOQL validation
    if (!query.startsWith('SELECT') && 
        !query.startsWith('INSERT') && 
        !query.startsWith('UPDATE') && 
        !query.startsWith('DELETE') && 
        !query.startsWith('UPSERT')) {
      errors.push('Query must start with SELECT, INSERT, UPDATE, DELETE, or UPSERT');
    }

    // Check for required FROM clause in SELECT queries
    if (query.startsWith('SELECT') && !query.includes('FROM')) {
      errors.push('SELECT queries must include a FROM clause');
    }

    // Check for balanced parentheses
    const openParens = (query.match(/\(/g) || []).length;
    const closeParens = (query.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      errors.push('Unbalanced parentheses in query');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate saved query data
   */
  validate(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this._connectionUuid || this._connectionUuid.trim().length === 0) {
      errors.push('Connection UUID is required');
    }

    if (!this._name || this._name.trim().length === 0) {
      errors.push('Query name is required');
    }

    if (this._name && this._name.length < 3) {
      errors.push('Query name must be at least 3 characters long');
    }

    // Validate SOQL syntax
    const soqlValidation = this.isValidSOQL();
    if (!soqlValidation.isValid) {
      errors.push(...soqlValidation.errors);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Convert to plain object
   */
  toJSON(): SavedQuery {
    return {
      ...this.getBaseEntityData(),
      connectionUuid: this._connectionUuid,
      name: this._name,
      queryText: this._queryText,
      description: this._description,
      tags: this._tags,
      isFavorite: this._isFavorite,
      executionCount: this._executionCount,
      lastExecuted: this._lastExecuted
    };
  }

  /**
   * Create a new saved query instance
   */
  static create(data: CreateSavedQueryRequest): SavedQueryModel {
    const savedQuery: SavedQuery = {
      connectionUuid: data.connectionUuid,
      name: data.name,
      queryText: data.queryText,
      description: data.description,
      tags: data.tags,
      isFavorite: data.isFavorite ?? false,
      executionCount: 0,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: data.createdBy
    };
    return new SavedQueryModel(savedQuery);
  }
}


