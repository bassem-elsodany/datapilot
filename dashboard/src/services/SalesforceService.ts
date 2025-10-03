import { logger } from "./Logger";
import { apiService } from "./ApiService";

export interface SalesforceUserInfo {
  user_id: string;
  user_name: string;
  display_name: string;
  organization_id: string;
  organization_name?: string;
  instance_url?: string;
  session_id?: string;
  server_url?: string;
  metadata_server_url?: string;
  // Legacy properties for backward compatibility
  userId?: string;
  userName?: string;
  fullName?: string;
  organizationId?: string;
  organizationName?: string;
  instanceUrl?: string;
  sessionId?: string;
  serverUrl?: string;
  metadataServerUrl?: string;
}

export interface LoginResult {
  success: boolean;
  userInfo?: SalesforceUserInfo;
  error?: string;
}

export interface SoqlQueryResult {
  metadata: {
    total_size: number;
    done: boolean;
    nextRecordsUrl?: string;
  };
  records: any[];
}

export interface PicklistValue {
  value: string;
  label: string;
  active: boolean;
  defaultValue: boolean;
}

export interface SObjectField {
  name: string;
  label: string;
  type: string;
  custom: boolean;
  required: boolean;
  unique: boolean;
  externalId: boolean;
  referenceTo: string[];
  length?: number;
  precision?: number;
  scale?: number;
  defaultValue?: any;
  helpText?: string;
  picklistValues?: PicklistValue[];
}

export interface SObjectTreeItem {
  name: string;
  label: string;
  labelPlural: string;
  custom: boolean;
  queryable: boolean;
  createable: boolean;
  updateable: boolean;
  deletable: boolean;
  keyPrefix: string;
  fields: SObjectField[];
}

export class SalesforceService {

  /**
   * Initialize connection using OAuth credentials
   * This method connects to Salesforce using an existing saved connection
   */
  static async initializeConnection(
    username: string,
    password: string,
    domainUrl: string,
    clientId: string,
    clientSecret: string
  ): Promise<LoginResult> {
    try {
      logger.debug('Initializing Salesforce connection', 'SalesforceService');
      
      // Note: This method is now called after the connection has been saved and tested
      // The actual connection testing happens during the save process in the backend
      // This method is kept for compatibility but the real work is done in the save flow
      
      logger.debug('Salesforce connection initialized successfully', 'SalesforceService');
      
      // Return a mock success result since the real connection was already tested during save
      // The actual connection will be established when the user connects to the saved connection
      return {
        success: true,
        userInfo: {
          user_id: 'temp',
          user_name: username,
          display_name: username,
          organization_id: 'temp',
          instance_url: domainUrl
        }
      };

    } catch (error) {
      logger.error('Failed to initialize Salesforce connection', 'SalesforceService', { 
        error: error instanceof Error ? error.message : String(error),
        details: error instanceof Error ? error.stack : 'No stack trace',
        params: { username, domainUrl, hasClientId: !!clientId }
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed'
      };
    }
  }

  /**
   * Get current user information
   */
  static async getUserInfo(connectionUuid: string): Promise<SalesforceUserInfo> {
    try {
      logger.debug('Getting Salesforce user information', 'SalesforceService');
      
      const userInfo = await apiService.getSalesforceUserInfo(connectionUuid);
      
      logger.debug('User info retrieved successfully', 'SalesforceService');
      return userInfo;
    } catch (error) {
      logger.error('Failed to get user info', 'SalesforceService', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Execute SOQL query
   */
  static async executeSoqlQuery(query: string, connectionUuid: string): Promise<SoqlQueryResult> {
    try {
      logger.debug('Executing SOQL query', 'SalesforceService');
      
      const result = await apiService.executeSalesforceQuery(query, connectionUuid);
      
      logger.debug('SOQL query executed successfully', 'SalesforceService');
      return result;
    } catch (error) {
      // Extract proper error message for logging
      let errorMessage = 'SOQL query execution failed';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error && typeof error === 'object') {
        errorMessage = error.message || JSON.stringify(error);
      }
      
      logger.error('SOQL query execution failed', 'SalesforceService', { error: errorMessage });
      throw error;
    }
  }

  /**
   * Execute SOQL query with more records (for pagination)
   */
  static async queryMore(nextRecordsId: string, connectionUuid: string): Promise<SoqlQueryResult> {
    try {
      logger.debug(` Calling queryMore with nextRecordsId: ${nextRecordsId.substring(0, 50)}...`, 'SalesforceService');
      
      const moreResults = await apiService.executeSalesforceQueryMore(nextRecordsId, connectionUuid);
      
      logger.debug(`queryMore completed successfully`, 'SalesforceService');
      return moreResults;

    } catch (error) {
      // Only log renderer-side errors, not Salesforce responses (handled by main process)
      logger.error('Renderer: Query more failed', 'SalesforceService', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Get object metadata (for schema explorer)
   */
  static async describeSObject(objectName: string, connectionUuid: string, includeChildRelationships: boolean = true): Promise<any> {
    try {
      logger.debug(` Calling describeSObject(${objectName}, includeChildRelationships: ${includeChildRelationships})`, 'SalesforceService');
      
      const sobjectData = await apiService.describeSObject(objectName, connectionUuid, includeChildRelationships);
      
      logger.debug(`describeSObject(${objectName}) completed successfully`, 'SalesforceService');
      return sobjectData;

    } catch (error) {
      // Only log renderer-side errors, not Salesforce responses (handled by main process)
      logger.error('Renderer: Failed to describe SObject', 'SalesforceService', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Get list of available SObjects using describeGlobal
   */
  static async getSObjectList(connectionUuid: string): Promise<string[]> {
    try {
      logger.debug('Calling getSObjectList()', 'SalesforceService');
      
      const response = await apiService.getSObjectList(connectionUuid);
      
      logger.debug('getSObjectList() completed successfully', 'SalesforceService');
      return response;
    } catch (error) {
      logger.error('Failed to get SObject list', 'SalesforceService', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Get SObject fields for a specific object
   */
  static async getSObjectFields(sobjectName: string, connectionUuid: string): Promise<SObjectField[]> {
    try {
      logger.debug(`Calling getSObjectFields(${sobjectName})`, 'SalesforceService');
      
      const response = await apiService.describeSObject(sobjectName, connectionUuid);
      
      logger.debug(`getSObjectFields(${sobjectName}) completed successfully`, 'SalesforceService');
      return response.fields;

    } catch (error) {
      logger.error(`Failed to get fields for ${sobjectName}`, 'SalesforceService', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Execute anonymous Apex
   */
  static async executeAnonymousApex(apexCode: string): Promise<any> {
    try {
      // This would need to be implemented in the main process
      throw new Error('Anonymous Apex execution not implemented yet');

    } catch (error) {
      // Only log renderer-side errors, not Salesforce responses (handled by main process)
      logger.error('Renderer: Failed to execute anonymous Apex', 'SalesforceService', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Update a Salesforce record
   */
  static async updateRecord(recordId: string, fields: Record<string, any>, sobjectName?: string): Promise<void> {
    try {
      logger.debug(`Calling updateRecord(${recordId})`, 'SalesforceService');
      
      await apiService.updateSalesforceRecord(recordId, fields, sobjectName);
      
      logger.debug(`updateRecord(${recordId}) completed successfully`, 'SalesforceService');
    } catch (error) {
      logger.error('Record update failed', 'SalesforceService', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Get connection status
   */
  static async isConnected(connectionUuid: string): Promise<boolean> {
    try {
      logger.debug(' Calling isConnected()', 'SalesforceService');
      
      const result = await apiService.isSalesforceConnected(connectionUuid);
      
      logger.debug(`isConnected() completed: ${result}`, 'SalesforceService');
      return result;
    } catch (error) {
      logger.error('Failed to check connection status', 'SalesforceService', { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  /**
   * Get API configuration
   */
  static async getApiConfig(connectionUuid: string): Promise<any> {
    try {
      logger.debug('Calling getApiConfig()', 'SalesforceService');
      
      const result = await apiService.getSalesforceApiConfig(connectionUuid);
      
      logger.debug('getApiConfig() completed successfully', 'SalesforceService');
      return result;
    } catch (error) {
      logger.error('Failed to get API config', 'SalesforceService', { error: error instanceof Error ? error.message : String(error) });
      // Fallback to default version if API fails
      return { version: '66.0' };
    }
  }

  /**
   * Logout and clear connection
   */
  static async logout(): Promise<void> {
    try {
      logger.debug(' Calling logout()', 'SalesforceService');
      
      await apiService.logoutFromSalesforce();
      
      logger.debug('logout() completed successfully', 'SalesforceService');
    } catch (error) {
      logger.error('Error during logout', 'SalesforceService', { error: error instanceof Error ? error.message : String(error) });
    }
  }
}

// Export a singleton instance
export const salesforceService = new SalesforceService();
