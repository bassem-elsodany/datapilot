import React, { useState, useEffect } from 'react';
import { SalesforceUserInfo } from '../services/SalesforceService';
import { ConnectionManager } from '../services/ConnectionManager';
import { LoginPanel } from './LoginPanel';
import MasterKeyManager from './MasterKeyManager';
import { logger } from '../services/Logger';
import { useTranslation } from '../services/I18nService';
import { OAuthType } from '../domain/models/Connection';
import '../assets/css/components/AuthenticationFlow.css';

interface SmartAuthenticationFlowProps {
  onLogin: (userInfo: SalesforceUserInfo, sessionUuid?: string) => void;
  onMasterKeyValidated?: () => void;
}

type AuthState = 'checking' | 'masterKey' | 'sessions' | 'main';

export const SmartAuthenticationFlow: React.FC<SmartAuthenticationFlowProps> = ({ onLogin, onMasterKeyValidated }) => {
  const { tSync } = useTranslation();
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    initializeSmartAuth();
  }, []);

  const initializeSmartAuth = async () => {
    try {
      logger.debug('Starting smart authentication flow...');
      setIsInitializing(true);

      // Step 1: Always check if master key hash exists in localStorage
      const connectionManager = ConnectionManager.getInstance();
      const masterKeyHashExists = await connectionManager.isMasterKeyHashExists();
      
      logger.debug(' Master key hash exists:', 'SmartAuthenticationFlow', { masterKeyHashExists });
      
      if (!masterKeyHashExists) {
        logger.debug('No master key hash found, showing initial master key setup', 'SmartAuthenticationFlow');
        setAuthState('masterKey');
        setIsInitializing(false);
        return;
      }

      // Step 2: Always show master key prompt on app reload
      // The master key is never persisted in memory across reloads for security
      logger.debug(' Master key hash exists, prompting for master key validation', 'SmartAuthenticationFlow');
      setAuthState('masterKey');
      setIsInitializing(false);
      return;

      // Note: All connection checking logic has been removed
      // The app now always requires master key validation on reload for security
      // After master key validation, the user will be shown saved connections
      
    } catch (error) {
      logger.error('Smart authentication initialization failed:', error);
      setAuthState('masterKey');
      setIsInitializing(false);
    }
  };

  const handleMasterKeyValidated = async () => {
    logger.debug(' Master key validated, notifying parent component...', 'SmartAuthenticationFlow');
    
    // Call the callback to notify parent component
    if (onMasterKeyValidated) {
      onMasterKeyValidated();
    }
    
    // Set state to 'main' to exit SmartAuthenticationFlow and let parent handle routing
    // The parent component will decide whether to show saved connections or main app
    setAuthState('main');
  };

  const handleLogin = (userInfo: SalesforceUserInfo, sessionUuid?: string) => {
    logger.debug('Login successful, proceeding to main view', 'SmartAuthenticationFlow');
    onLogin(userInfo, sessionUuid);
    setAuthState('main');
  };

  // Show loading while checking
  if (isInitializing) {
    return (
      <div className="authentication-flow">
        <LoginPanel>
          {/* Empty children to show the fancy loading screen */}
        </LoginPanel>
      </div>
    );
  }

  // Render appropriate component based on auth state
  logger.debug('Current auth state:', 'SmartAuthenticationFlow', { authState });
  
  switch (authState) {
    case 'masterKey':
      logger.debug(' Rendering MasterKeyManager', 'SmartAuthenticationFlow');
      return (
        <div className="authentication-flow">
          <LoginPanel>
            <MasterKeyManager onMasterKeyValidated={handleMasterKeyValidated} />
          </LoginPanel>
        </div>
      );
    
    case 'sessions':
      // Don't render SavedConnectionsManager here - let the main App handle routing
      // Just notify that master key is validated and let parent component handle the rest
      return null;
    
    case 'main':
      // Exit SmartAuthenticationFlow and let parent handle routing
      return null;
    
    default:
      return (
        <div className="authentication-flow">
          <LoginPanel>
            {/* Empty children to show the fancy loading screen */}
          </LoginPanel>
        </div>
      );
  }
};
