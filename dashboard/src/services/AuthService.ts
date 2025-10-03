import { logger } from "./Logger";
import { SalesforceService, SalesforceUserInfo } from "./SalesforceService";

export interface UserInfo extends SalesforceUserInfo {}

export interface LoginResult {
  success: boolean;
  userInfo?: UserInfo;
  error?: string;
}



export class AuthService {

  /**
   * Login using OAuth password flow
   */
  static async loginWithOAuth(
    username: string, 
    password: string, 
    domainUrl: string,
    clientId: string,
    clientSecret: string
  ): Promise<LoginResult> {
    logger.debug(' Starting OAuth login process...', 'AuthService');
    logger.debug('📝 Login details', 'AuthService', {
      username: username,
      domainUrl: domainUrl,
      clientId: clientId
    });

    try {
      // Use SalesforceService to handle authentication with jsforce SDK
      const result = await SalesforceService.initializeConnection(
        username,
        password,
        domainUrl,
        clientId,
        clientSecret
      );

      if (result.success) {
        logger.debug('OAuth login successful!', 'AuthService');
        return result;
      } else {
        logger.error('OAuth login failed', 'AuthService', { error: result.error });
        return result;
      }

    } catch (error) {
      logger.error('OAuth login error', 'AuthService', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Login failed'
      };
    }
  }













}

// Export a singleton instance
export const authService = new AuthService();
