// Logger should be independent of other services to avoid circular dependencies

import { configManager } from "../config/app.config";
import { v4 as uuidv4 } from 'uuid';

// ========================================
// LOGGING LEVELS
// ========================================

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4
}

export const LogLevelNames: Record<LogLevel, string> = {
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.TRACE]: 'TRACE'
};

// ========================================
// LOG ENTRY INTERFACE
// ========================================

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  levelName: string;
  message: string;
  context?: string;
  data?: any;
  error?: Error;
  userId?: string;
  sessionId?: string;
}

// ========================================
// LOGGER CONFIGURATION
// ========================================

export interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableFile: boolean;
  enableRemote: boolean;
  maxFileSize: number; // in MB
  maxFiles: number;
  logDirectory: string;
  remoteEndpoint?: string;
  includeTimestamp: boolean;
  includeContext: boolean;
  includeStackTraces: boolean;
  format: 'json' | 'text';
  // Page-specific logging control
  pageLevels: Record<string, LogLevel>; // Override levels for specific pages/components
  enablePageControl: boolean; // Enable/disable page-specific control
}

// ========================================
// LOGGER SERVICE
// ========================================

class LoggerService {
  private static instance: LoggerService;
  private config: LoggerConfig;
  private logBuffer: LogEntry[] = [];
  private isInitialized = false;

  private constructor() {
    this.config = this.getDefaultConfig();
  }

  public static getInstance(): LoggerService {
    if (!LoggerService.instance) {
      LoggerService.instance = new LoggerService();
    }
    return LoggerService.instance;
  }

  // ========================================
  // CONFIGURATION
  // ========================================

  private getDefaultConfig(): LoggerConfig {
    const isDev = process.env['NODE_ENV'] === 'development';
    
    // Get log level from environment variable, default to INFO
    const envLogLevel = process.env['LOG_LEVEL']?.toUpperCase() || 'INFO';
    let logLevel = LogLevel.INFO; // Default fallback
    
    switch (envLogLevel) {
      case 'ERROR':
        logLevel = LogLevel.ERROR;
        break;
      case 'WARN':
        logLevel = LogLevel.WARN;
        break;
      case 'INFO':
        logLevel = LogLevel.INFO;
        break;
      case 'DEBUG':
        logLevel = LogLevel.DEBUG;
        break;
      case 'TRACE':
        logLevel = LogLevel.TRACE;
        break;
      default:
        logLevel = LogLevel.INFO;
        break;
    }

    return {
      level: logLevel,
      enableConsole: true, // Always enable console output for web app
      enableFile: false, // File logging disabled in web app
      enableRemote: false, // Disable remote logging by default to prevent performance issues
      maxFileSize: 10, // 10MB
      maxFiles: 5,
      logDirectory: './logs',
      remoteEndpoint: undefined, // No remote endpoint by default
      includeTimestamp: true,
      includeContext: true,
      includeStackTraces: true,
      format: 'json',
      // Page-specific logging control
      pageLevels: {}, // No page-specific overrides by default
      enablePageControl: true // Enable page-specific control
    };
  }

  private getLogDirectory(): string {
    return './logs';
  }

  public configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
    this.log(LogLevel.INFO, 'Logger configured', 'LoggerService', { config: this.config });
  }

  public setLevel(level: LogLevel): void {
    this.config.level = level;
    this.log(LogLevel.INFO, `Log level set to ${LogLevelNames[level]}`, 'LoggerService');
  }

  /**
   * Enable remote logging with a specific endpoint
   * Use with caution as it can impact performance
   */
  public enableRemoteLogging(endpoint: string): void {
    this.config.enableRemote = true;
    this.config.remoteEndpoint = endpoint;
    this.log(LogLevel.INFO, `Remote logging enabled with endpoint: ${endpoint}`, 'LoggerService');
  }

  /**
   * Disable remote logging
   */
  public disableRemoteLogging(): void {
    this.config.enableRemote = false;
    this.config.remoteEndpoint = undefined;
    this.log(LogLevel.INFO, 'Remote logging disabled', 'LoggerService');
  }

  public getLevel(): LogLevel {
    return this.config.level;
  }

  public isPageControlEnabled(): boolean {
    return this.config.enablePageControl;
  }

  /**
   * Set logging level for a specific page/component
   */
  public setPageLevel(page: string, level: LogLevel): void {
    this.config.pageLevels[page] = level;
    this.log(LogLevel.INFO, `Log level for page '${page}' set to ${LogLevelNames[level]}`, 'LoggerService');
  }

  /**
   * Get logging level for a specific page/component
   */
  public getPageLevel(page: string): LogLevel {
    return this.config.pageLevels[page] || this.config.level;
  }

  /**
   * Remove page-specific logging level (use global level)
   */
  public removePageLevel(page: string): void {
    delete this.config.pageLevels[page];
    this.log(LogLevel.INFO, `Removed page-specific log level for '${page}'`, 'LoggerService');
  }

  /**
   * Enable/disable page-specific logging control
   */
  public setPageControlEnabled(enabled: boolean): void {
    this.config.enablePageControl = enabled;
    this.log(LogLevel.INFO, `Page-specific logging control ${enabled ? 'enabled' : 'disabled'}`, 'LoggerService');
  }

  /**
   * Get all page-specific logging levels
   */
  public getPageLevels(): Record<string, LogLevel> {
    return { ...this.config.pageLevels };
  }

  /**
   * Clear all page-specific logging levels
   */
  public clearPageLevels(): void {
    this.config.pageLevels = {};
    this.log(LogLevel.INFO, 'Cleared all page-specific log levels', 'LoggerService');
  }

  // ========================================
  // LOGGING METHODS
  // ========================================

  public error(message: string, context?: string, data?: any, error?: Error): void {
    this.log(LogLevel.ERROR, message, context, data, error);
  }

  public warn(message: string, context?: string, data?: any): void {
    this.log(LogLevel.WARN, message, context, data);
  }

  public info(message: string, context?: string, data?: any): void {
    this.log(LogLevel.INFO, message, context, data);
  }

  public debug(message: string, context?: string, data?: any): void {
    this.log(LogLevel.DEBUG, message, context, data);
  }

  public trace(message: string, context?: string, data?: any): void {
    this.log(LogLevel.TRACE, message, context, data);
  }

  private log(level: LogLevel, message: string, context?: string, data?: any, error?: Error): void {
    // Determine the effective log level for this context
    let effectiveLevel = this.config.level;
    
    if (this.config.enablePageControl && context) {
      // Check if there's a page-specific level for this context
      const pageLevel = this.config.pageLevels[context];
      if (pageLevel !== undefined) {
        effectiveLevel = pageLevel;
      }
    }
    
    // Check if we should log this level
    if (level > effectiveLevel) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      levelName: LogLevelNames[level],
      message,
      ...(context && { context }),
      ...(data && { data }),
      ...(error && { error }),
      ...(this.getUserId() && { userId: this.getUserId() }),
      ...(this.getSessionId() && { sessionId: this.getSessionId() })
    };

    // Add to buffer
    this.logBuffer.push(entry);

    // Flush buffer if it's getting large
    if (this.logBuffer.length > 100) {
      this.flush();
    }

    // Output based on configuration
    if (this.config.enableConsole) {
      this.outputToConsole(entry);
    }

    if (this.config.enableFile) {
      this.outputToFile(entry);
    }

    if (this.config.enableRemote) {
      this.outputToRemote(entry);
    }
  }

  // ========================================
  // OUTPUT METHODS
  // ========================================

  private outputToConsole(entry: LogEntry): void {
    const { level, levelName, message, context, data, error } = entry;
    
    // Create console message
    let consoleMessage = `[${levelName}]`;
    if (this.config.includeTimestamp) {
      consoleMessage += ` [${entry.timestamp}]`;
    }
    if (this.config.includeContext && context) {
      consoleMessage += ` [${context}]`;
    }
    consoleMessage += ` ${message}`;

    // Add data if present
    if (data) {
      consoleMessage += ` | Data: ${JSON.stringify(data)}`;
    }

    // Output based on level
    switch (level) {
      case LogLevel.ERROR:
        console.error(consoleMessage);
        if (error && this.config.includeStackTraces) {
          console.error(error.stack);
        }
        break;
      case LogLevel.WARN:
        console.warn(consoleMessage);
        break;
      case LogLevel.INFO:
        console.info(consoleMessage);
        break;
      case LogLevel.DEBUG:
        // Use console.log for DEBUG to ensure visibility in browser console
        console.log(consoleMessage);
        break;
      case LogLevel.TRACE:
        console.trace(consoleMessage);
        break;
    }
  }

  private async outputToFile(entry: LogEntry): Promise<void> {
    try {
      // File logging is handled by remote logging in web app
      // This method is kept for compatibility but doesn't write to files
    } catch (error) {
      console.error('Failed to write log to file:', error);
    }
  }

  private async outputToRemote(entry: LogEntry): Promise<void> {
    if (!this.config.enableRemote || !this.config.remoteEndpoint) {
      return; // Silently return if remote logging is disabled
    }

    try {
      const response = await fetch(this.config.remoteEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(entry)
      });

      if (!response.ok) {
        // Use console.error for logger errors to avoid infinite loops
        console.error('Failed to send log to remote endpoint:', response.statusText);
      }
    } catch (error) {
      // Use console.error for logger errors to avoid infinite loops
      console.error('Failed to send log to remote endpoint:', error);
    }
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  private getUserId(): string | undefined {
    // Get user ID from session or config
    try {
      const sessions = localStorage.getItem('soql_developer_sessions');
      if (sessions) {
        const parsedSessions = JSON.parse(sessions);
        if (parsedSessions.length > 0) {
          return parsedSessions[0].username;
        }
      }
    } catch (error) {
      // Ignore errors
    }
    return undefined;
  }

  private getSessionId(): string | undefined {
    // Generate or retrieve session ID
    try {
      let sessionId = sessionStorage.getItem('soql_developer_session_id');
      if (!sessionId) {
        sessionId = `session_${uuidv4()}`;
        sessionStorage.setItem('soql_developer_session_id', sessionId);
      }
      return sessionId;
    } catch (error) {
      return undefined;
    }
  }

  public flush(): void {
    // Flush any buffered logs
    this.logBuffer = [];
  }

  public getLogs(level?: LogLevel, limit?: number): LogEntry[] {
    let logs = [...this.logBuffer];
    
    if (level !== undefined) {
      logs = logs.filter(log => log.level <= level);
    }
    
    if (limit !== undefined) {
      logs = logs.slice(-limit);
    }
    
    return logs;
  }

  public clearLogs(): void {
    this.logBuffer = [];
  }

  // ========================================
  // INITIALIZATION
  // ========================================

  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Create log directory if it doesn't exist
      if (this.config.enableFile) {
        // File logging initialization handled by remote logging in web app
      }

      this.isInitialized = true;
      this.info('Logger initialized successfully', 'LoggerService');
    } catch (error) {
      console.error('Failed to initialize logger:', error);
      // Fallback to console-only logging
      this.config.enableFile = false;
      this.config.enableRemote = false;
    }
  }
}

// ========================================
// EXPORTS
// ========================================

export const logger = LoggerService.getInstance();

// Convenience functions for quick logging
export const logError = (message: string, context?: string, data?: any, error?: Error) => 
  logger.error(message, context, data, error);

export const logWarn = (message: string, context?: string, data?: any) => 
  logger.warn(message, context, data);

export const logInfo = (message: string, context?: string, data?: any) => 
  logger.info(message, context, data);

export const logDebug = (message: string, context?: string, data?: any) => 
  logger.debug(message, context, data);

export const logTrace = (message: string, context?: string, data?: any) => 
  logger.trace(message, context, data);

// Page-specific logging control convenience functions
export const setPageLogLevel = (page: string, level: LogLevel) => 
  logger.setPageLevel(page, level);

export const getPageLogLevel = (page: string): LogLevel => 
  logger.getPageLevel(page);

export const removePageLogLevel = (page: string) => 
  logger.removePageLevel(page);

export const setPageControlEnabled = (enabled: boolean) => 
  logger.setPageControlEnabled(enabled);

export const getPageLogLevels = (): Record<string, LogLevel> => 
  logger.getPageLevels();

export const clearPageLogLevels = () => 
  logger.clearPageLevels();

// Remote logging control convenience functions
export const enableRemoteLogging = (endpoint: string) => 
  logger.enableRemoteLogging(endpoint);

export const disableRemoteLogging = () => 
  logger.disableRemoteLogging();
