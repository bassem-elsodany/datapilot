/**
 * Notification Service - Centralized notification management
 * 
 * This service provides a centralized way to show notifications throughout the application.
 * It enhances the existing Mantine notifications system with consistent error handling,
 * user-friendly messages, and proper categorization.
 * 
 * Features:
 * - Error notifications for API failures
 * - Success notifications for operations
 * - Warning notifications for important information
 * - Info notifications for general updates
 * - Automatic error message translation and formatting
 * - Consistent styling and positioning
 * 
 * Author: Bassem Elsodany
 * GitHub: https://github.com/bassem-elsodany
 * LinkedIn: https://www.linkedin.com/in/bassem-elsodany/
 * Version: 1.0.0
 */

import { notifications } from '@mantine/notifications';
import { i18nService } from './I18nService';
import { logger } from './Logger';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface NotificationOptions {
  title?: string;
  message: string;
  type?: NotificationType;
  autoClose?: boolean | number;
  withCloseButton?: boolean;
  icon?: React.ReactNode;
  color?: string;
}

export class NotificationService {
  private static instance: NotificationService;

  private constructor() {}

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  /**
   * Show a success notification
   */
  public success(options: Omit<NotificationOptions, 'type'>): void {
    const { title, message, autoClose = 5000, withCloseButton = true, icon, color = 'green' } = options;
    const wrappedMessage = this.wrapMessage(message);
    const contentAttribute = this.getContentWidthAttribute(message);
    
    notifications.show({
      title: title || i18nService.tSync('error.notifications.success.title') || 'Success',
      message: wrappedMessage,
      color,
      icon: icon,
      autoClose,
      withCloseButton,
      classNames: {
        root: contentAttribute
      }
    });

  }

  /**
   * Show an error notification
   */
  public error(options: Omit<NotificationOptions, 'type'>): void {
    const { title, message, autoClose = 5000, withCloseButton = true, icon, color = 'red' } = options;
    const wrappedMessage = this.wrapMessage(message);
    const contentAttribute = this.getContentWidthAttribute(message);
    
    notifications.show({
      title: title || i18nService.tSync('error.notifications.error.title') || 'Error',
      message: wrappedMessage,
      color,
      icon: icon,
      autoClose,
      withCloseButton,
      classNames: {
        root: contentAttribute
      }
    });

    logger.error('Error notification shown', 'NotificationService', { title, message });
  }

  /**
   * Show a warning notification
   */
  public warning(options: Omit<NotificationOptions, 'type'>): void {
    const { title, message, autoClose = 5000, withCloseButton = true, icon, color = 'orange' } = options;
    
    notifications.show({
      title: title || i18nService.tSync('error.notifications.warning.title') || 'Warning',
      message: this.wrapMessage(message),
      color,
      icon: icon,
      autoClose,
      withCloseButton,
    });

    logger.warn('Warning notification shown', 'NotificationService', { title, message });
  }

  /**
   * Show an info notification
   */
  public info(options: Omit<NotificationOptions, 'type'>): void {
    const { title, message, autoClose = 6000, withCloseButton = true, icon, color = 'blue' } = options;
    
    notifications.show({
      title: title || i18nService.tSync('error.notifications.info.title') || 'Information',
      message: this.wrapMessage(message),
      color,
      icon: icon,
      autoClose,
      withCloseButton,
    });

  }

  /**
   * Show API error notification with automatic error parsing
   */
  public apiError(error: any, context?: string): void {
    let title = i18nService.tSync('error.notifications.apiError.title', 'API Error');
    let message = i18nService.tSync('error.notifications.apiError.generic', 'An error occurred while communicating with the server');

    // Parse different types of API errors
    if (error?.response?.data?.detail) {
      const detail = error.response.data.detail;
      
      if (typeof detail === 'object') {
        // Handle structured error response
        if (detail.message) {
          message = i18nService.tSync(detail.message) || detail.message;
        }
        
        // Handle field errors (these contain the actual error details)
        if (detail.field_errors && typeof detail.field_errors === 'object') {
          const fieldErrors = Object.values(detail.field_errors);
          if (fieldErrors.length > 0) {
            const fieldError = fieldErrors[0];
            if (typeof fieldError === 'string') {
              message = i18nService.tSync(fieldError) || fieldError;
            } else if (fieldError && typeof fieldError === 'object') {
              const fieldErrorObj = fieldError as any;
              if (fieldErrorObj.message) {
                message = fieldErrorObj.message;
              } else if (fieldErrorObj.error) {
                message = fieldErrorObj.error;
              }
            }
          }
        }
        
        // Set specific title based on error type
        if (detail.error_code) {
          switch (detail.error_code) {
            case 'authentication_error':
              title = i18nService.tSync('error.notifications.apiError.authentication', 'Authentication Error');
              break;
            case 'validation_error':
              title = i18nService.tSync('error.notifications.apiError.validation', 'Validation Error');
              break;
            case 'internal_server_error':
              title = i18nService.tSync('error.notifications.apiError.server', 'Server Error');
              break;
            case 'connection_error':
              title = i18nService.tSync('error.notifications.apiError.connection', 'Connection Error');
              break;
          }
        }
      } else if (typeof detail === 'string') {
        message = i18nService.tSync(detail, detail);
      }
    } else if (error?.response?.data?.message) {
      message = i18nService.tSync(error.response.data.message, error.response.data.message);
    } else if (error?.message) {
      message = error.message;
    } else if (typeof error === 'string') {
      message = error;
    }

    // Add context if provided
    if (context) {
      title = `${title} - ${context}`;
    }

    this.error({
      title,
      message: this.wrapMessage(message),
      autoClose: 6000, // Longer for errors
    });
  }

  /**
   * Show connection error notification
   */
  public connectionError(error?: any): void {
    this.error({
      title: i18nService.tSync('connections.notifications.connectionError.title') || 'Connection Error',
      message: this.wrapMessage(i18nService.tSync('connections.notifications.connectionError.message') || 'Unable to connect to the server. Please check your internet connection and try again.'),
      autoClose: 8000,
    });
  }

  /**
   * Show authentication error notification
   */
  public authenticationError(error?: any): void {
    this.error({
      title: i18nService.tSync('auth_providers.notifications.authError.title') || 'Authentication Error',
      message: this.wrapMessage(i18nService.tSync('auth_providers.notifications.authError.message') || 'Authentication failed. Please check your credentials and try again.'),
      autoClose: 6000,
    });
  }

  /**
   * Show operation success notification
   */
  public operationSuccess(operation: string, details?: string): void {
    this.success({
      title: i18nService.tSync('notifications.operationSuccess.title') || 'Operation Successful',
      message: this.wrapMessage(details || i18nService.tSync('notifications.operationSuccess.message') || `${operation} completed successfully`),
    });
  }

  /**
   * Show loading notification (for long operations)
   */
  public loading(title: string, message: string): string {
    const id = notifications.show({
      title,
      message: this.wrapMessage(message),
      color: 'blue',
      autoClose: false,
      withCloseButton: false,
      loading: true,
    });

    return id;
  }

  /**
   * Update a loading notification
   */
  public updateLoading(id: string, title: string, message: string, type: 'success' | 'error' = 'success'): void {
    notifications.update({
      id,
      title,
      message: this.wrapMessage(message),
      color: type === 'success' ? 'green' : 'red',
      autoClose: 5000,
      withCloseButton: true,
      loading: false,
    });
  }

  /**
   * Wrap notification message to prevent it from spreading across the entire width
   */
  private wrapMessage(message: string): string {
    // If message is short, return as is
    if (message.length <= 60) {
      return message;
    }

    // For longer messages, add word wrapping by inserting line breaks
    const words = message.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      // If adding this word would make the line too long, start a new line
      if (currentLine.length + word.length + 1 > 60) {
        if (currentLine.length > 0) {
          lines.push(currentLine.trim());
          currentLine = word;
        } else {
          // If a single word is longer than 60 characters, break it
          if (word.length > 60) {
            lines.push(word.substring(0, 60));
            currentLine = word.substring(60);
          } else {
            currentLine = word;
          }
        }
      } else {
        currentLine += (currentLine.length > 0 ? ' ' : '') + word;
      }
    }

    // Add the last line if it's not empty
    if (currentLine.length > 0) {
      lines.push(currentLine.trim());
    }

    // Use newlines and let CSS handle the wrapping
    return lines.join('\n');
  }

  /**
   * Get content-aware data attribute for notification width
   */
  private getContentWidthAttribute(message: string): string {
    const length = message.length;
    if (length <= 100) {
      return 'data-short-content';
    } else if (length <= 300) {
      return 'data-medium-content';
    } else {
      return 'data-long-content';
    }
  }

  /**
   * Clear all notifications
   */
  public clearAll(): void {
    notifications.clean();
  }

  /**
   * Clear specific notification
   */
  public clear(id: string): void {
    notifications.hide(id);
  }
}

// Export singleton instance
export const notificationService = NotificationService.getInstance();