import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { connectionManager } from '../services/ConnectionManager';
import { SavedConnection } from '../domain/models/Connection';
import { SalesforceService, SalesforceUserInfo } from '../services/SalesforceService';
import { useTranslation } from '../services/I18nService';
import { logger } from '../services/Logger';
import { ApiService } from '../services/ApiService';
import { useSessionContext } from '../contexts/SessionContext';
import '../assets/css/components/SavedConnectionsManager.css';
import '../assets/css/components/Modal.css';
import {
  IconArrowLeft,
  IconArrowRight,
  IconLink,
  IconSearch,
  IconDeviceFloppy,
  IconPlus,
  IconTrash,
  IconCheck,
  IconX,
  IconAlertCircle,
  IconInfoCircle,
  IconShield,
  IconUser,
  IconKey,
  IconRefresh,
  IconEdit
} from '@tabler/icons-react';
import { ActionIcon, Group } from '@mantine/core';

// OAuth Type Interface
interface OAuthType {
  value: string;
  label: string;
  description: string;
  requires_consumer_key: boolean;
  requires_client_id: boolean;
  requires_security_token: boolean;
  fields: string[];
}

interface SavedConnectionsManagerProps {
  onLogin: (userInfo: SalesforceUserInfo, connectionUuid?: string) => void;
  isMasterKeyValidated?: boolean;
  onRedirectToMasterKey?: () => void;
}

export const SavedConnectionsManager: React.FC<SavedConnectionsManagerProps> = ({ onLogin, isMasterKeyValidated = false, onRedirectToMasterKey }) => {
  const { t, tSync } = useTranslation();
  const apiService = ApiService.getInstance();
  const { getMasterKey } = useSessionContext();
  
  // Check master key directly in the component
  const masterKey = getMasterKey();
  const hasMasterKey = masterKey && masterKey.trim().length > 0;
  
  // Debug logging
  logger.debug('SavedConnectionsManager rendered', 'SavedConnectionsManager', { 
    isMasterKeyValidated,
    hasMasterKey,
    masterKeyValue: masterKey,
    masterKeyType: typeof masterKey,
    masterKeyLength: masterKey?.length,
    onRedirectToMasterKey: !!onRedirectToMasterKey
  });
  
  // If no master key, redirect to master key page and return null
  if (!hasMasterKey) {
    if (onRedirectToMasterKey) {
      logger.warn('No master key found in SavedConnectionsManager, redirecting to master key page', 'SavedConnectionsManager');
      onRedirectToMasterKey();
    }
    return null;
  }
  
  // Debug log to verify SavedConnectionsManager is rendering
  logger.debug('SavedConnectionsManager render - ActionIcon buttons should be visible', 'SavedConnectionsManager');
  const [savedConnections, setSavedConnections] = useState<SavedConnection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectingConnectionId, setConnectingConnectionId] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isLoadingConnections, setIsLoadingConnections] = useState(false);
  const [opened, { open, close }] = useDisclosure(false);
  const [isMounted, setIsMounted] = useState(false);
  const [successfulConnectionId, setSuccessfulConnectionId] = useState<string | null>(null);
  
  // Rename state
  const [isRenaming, setIsRenaming] = useState(false);
  const [renamingConnectionId, setRenamingConnectionId] = useState<string | null>(null);
  const [newConnectionName, setNewConnectionName] = useState('');
  
  // Wizard state
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 3;
  
  // Form states for new connection
  const [oauthTypes, setOAuthTypes] = useState<OAuthType[]>([]);
  const [oauthType, setOAuthType] = useState<string>('salesforce_classic');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [environment, setEnvironment] = useState<'production' | 'sandbox'>('production');
  const [connectionName, setConnectionName] = useState('');
  
  // Salesforce Classic OAuth fields
  const [consumerKey, setConsumerKey] = useState('');
  const [consumerSecret, setConsumerSecret] = useState('');
  const [securityToken, setSecurityToken] = useState('');
  
  // Standard OAuth fields
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (hasMasterKey) {
      // Add a small delay to ensure session context provider is ready
      const timer = setTimeout(() => {
        loadSavedConnections();
        loadOAuthTypes();
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [hasMasterKey]);

  const loadOAuthTypes = async () => {
    try {
      // Get auth providers instead of OAuth types
      const providers = await apiService.getAllAuthProviders();
      
      const oauthProviders = providers.filter(provider => 
        provider.is_active && (provider.type === 'OAUTH_STANDARD' || provider.type === 'SALESFORCE_CLASSIC')
      );
      
      // Convert auth providers to OAuth type format for UI compatibility
      const types = oauthProviders.map(provider => ({
        value: provider.id,
        label: provider.name,
        description: provider.description,
        requires_consumer_key: provider.type === 'SALESFORCE_CLASSIC',
        requires_client_id: provider.type === 'OAUTH_STANDARD',
        requires_security_token: provider.type === 'SALESFORCE_CLASSIC',
        fields: provider.type === 'SALESFORCE_CLASSIC' 
          ? ['username', 'password', 'environment', 'consumer_key', 'consumer_secret', 'security_token']
          : ['username', 'password', 'environment', 'client_id', 'client_secret']
      }));
      
      setOAuthTypes(types);
      if (types.length > 0) {
        setOAuthType(types[0].value);
      }
    } catch (error) {
      logger.error('Failed to load auth providers', 'SavedConnectionsManager', error);
    }
  };

  const loadSavedConnections = async () => {
    if (isLoadingConnections) return;

    try {
      setIsLoadingConnections(true);
      const connections = await connectionManager.getAllConnections();
      setSavedConnections(connections);
    } catch (error) {
      // Handle backend unavailability gracefully
      if (error instanceof Error && error.message.includes('Failed to get connections')) {
        logger.warn('Backend unavailable - connections cannot be loaded', 'SavedConnectionsManager');
        setError('Backend service is currently unavailable. Please try again later.');
      } else {
        logger.error('Failed to load saved connections', 'SavedConnectionsManager', null, error as Error);
        setError('Failed to load saved connections. Please try again.');
      }
    } finally {
      setIsLoadingConnections(false);
    }
  };

  const handleRefreshConnections = async () => {
    logger.debug('handleRefreshConnections called', 'SavedConnectionsManager');
    try {
      await loadSavedConnections();
      
      // Show success notification
      notifications.show({
        title: tSync('connections.refresh.success.title', 'Connections Refreshed'),
        message: tSync('connections.refresh.success.message', 'Connections list has been refreshed successfully'),
        color: 'green',
        icon: <IconRefresh size={16} />,
        autoClose: 3000,
      });
      
    } catch (error) {
      logger.error('Failed to refresh connections', 'SavedConnectionsManager', null, error as Error);
      
      // Show error notification
      notifications.show({
        title: tSync('connections.refresh.error.title', 'Refresh Failed'),
        message: tSync('connections.refresh.error.message', 'Failed to refresh connections. Please try again.'),
        color: 'red',
        autoClose: 3000,
      });
    }
  };

  const handleQuickConnect = async (connection: SavedConnection) => {
    logger.debug('handleQuickConnect called with connection', 'SavedConnectionsManager', { connection });
    try {
      setConnectingConnectionId(connection.id);
      setError(null);
      
      const decryptedConnection = await connectionManager.getConnection(connection.id);
      
      if (!decryptedConnection) {
        setError(tSync('connections.error.decryptFailed', 'Failed to decrypt connection. Please check your master key.'));
        return;
      }

      const domainUrl = decryptedConnection.environment === 'sandbox' ? 'https://test.salesforce.com' : 'https://login.salesforce.com';
      
      let finalUsername = decryptedConnection.username;
      let finalPassword = decryptedConnection.password || '';
      let finalClientId = decryptedConnection.clientId || '';
      let finalClientSecret = decryptedConnection.clientSecret || '';

      if (decryptedConnection.oauthType === 'salesforce_classic') {
        finalClientId = decryptedConnection.consumerKey || '';
        finalClientSecret = decryptedConnection.consumerSecret || '';
        finalPassword = decryptedConnection.securityToken ? `${finalPassword}${decryptedConnection.securityToken}` : finalPassword;
      }

      // Connect using the existing saved connection UUID
      const result = await apiService.connectToSalesforce(connection.id);

      if (result && result.user_info) {
        logger.debug('Connection successful, calling onLogin', 'SavedConnectionsManager', { userInfo: result.user_info, connectionId: connection.id });
        
        // Show brief success state
        setSuccessfulConnectionId(connection.id);
        setTimeout(() => {
          onLogin(result.user_info, connection.id);
        }, 500); // Brief delay to show success state
      } else {
        throw new Error(result?.error || tSync('connections.error.connectionFailed', 'Connection failed'));
      }
    } catch (error) {
      logger.error('handleQuickConnect error', 'SavedConnectionsManager', null, error as Error);
      setError(error instanceof Error ? error.message : tSync('connections.error.connectionFailed', 'Connection failed'));
    } finally {
      setConnectingConnectionId(null);
    }
  };

  const handleRemoveConnection = async (connectionId: string) => {
    try {
      await connectionManager.deleteConnection(connectionId);
      await loadSavedConnections();
      
      // Show success notification
      notifications.show({
        title: tSync('connections.delete.success.title', 'Connection Deleted'),
        message: tSync('connections.delete.success.message', 'Connection has been deleted successfully'),
        color: 'green',
        icon: <IconTrash size={16} />,
        autoClose: 3000,
      });
      
    } catch (error) {
      logger.error('Failed to remove connection', 'SavedConnectionsManager', null, error as Error);
      
      // Show error notification
      notifications.show({
        title: tSync('connections.delete.error.title', 'Delete Failed'),
        message: tSync('connections.delete.error.message', 'Failed to delete connection. Please try again.'),
        color: 'red',
        autoClose: 3000,
      });
    }
  };

  const handleRenameConnection = async (connectionId: string, newName: string) => {
    if (!newName.trim()) {
      notifications.show({
        title: tSync('connections.rename.error.invalid_name', 'Invalid Name'),
        message: tSync('connections.rename.error.invalid_name_message', 'Please provide a valid connection name'),
        color: 'red',
        autoClose: 3000,
      });
      return;
    }

    try {
      setIsRenaming(true);
      setRenamingConnectionId(connectionId);
      
      await apiService.updateConnection(connectionId, newName.trim());
      await loadSavedConnections();
      
      notifications.show({
        title: tSync('connections.rename.success.title', 'Connection Renamed'),
        message: tSync('connections.rename.success.message', 'Connection has been renamed successfully'),
        color: 'green',
        icon: <IconEdit size={16} />,
        autoClose: 3000,
      });
    } catch (error) {
      logger.error('Failed to rename connection', 'SavedConnectionsManager', null, error as Error);
      notifications.show({
        title: tSync('connections.rename.error.title', 'Rename Failed'),
        message: tSync('connections.rename.error.message', 'Failed to rename connection. Please try again.'),
        color: 'red',
        autoClose: 3000,
      });
    } finally {
      setIsRenaming(false);
      setRenamingConnectionId(null);
      setNewConnectionName('');
    }
  };

  const handleClearAllConnections = async () => {
    try {
      await connectionManager.clearAllConnections();
      await loadSavedConnections();
      
      // Show success notification
      notifications.show({
        title: tSync('connections.clear_all.success.title', 'All Connections Deleted'),
        message: tSync('connections.clear_all.success.message', 'All connections have been deleted successfully'),
        color: 'green',
        icon: <IconTrash size={16} />,
        autoClose: 3000,
      });
      
    } catch (error) {
      logger.error('Failed to clear all connections', 'SavedConnectionsManager', null, error as Error);
      
      // Show error notification
      notifications.show({
        title: tSync('connections.clear_all.error.title', 'Delete Failed'),
        message: tSync('connections.clear_all.error.message', 'Failed to delete all connections. Please try again.'),
        color: 'red',
        autoClose: 3000,
      });
    }
  };

  const handleCloseModal = () => {
    close();
    setCurrentStep(1);
    setError(null);
            setOAuthType('salesforce_classic');
    setUsername('');
    setPassword('');
    setEnvironment('production');
    setConnectionName('');
    setConsumerKey('');
    setConsumerSecret('');
    setSecurityToken('');
    setClientId('');
    setClientSecret('');
  };

  const handleOpenModal = () => {
    setCurrentStep(1);
    setError(null);
    open();
  };

  const handleNextStep = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
      setError(null);
    }
  };

  const handlePreviousStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      setError(null);
    }
  };

  const canProceedToNextStep = () => {
    switch (currentStep) {
      case 1:
        return oauthType !== undefined;
      case 2:
        return username.trim() !== '' && password.trim() !== '';
      case 3:
        if (oauthType === 'salesforce_classic') {
          return consumerKey.trim() !== '' && consumerSecret.trim() !== '';
        } else {
          return clientId.trim() !== '' && clientSecret.trim() !== '';
        }
      default:
        return false;
    }
  };

  const connectWithCredentials = async (
    username: string,
    password: string,
    domainUrl: string,
    clientId: string,
    clientSecret: string,
    oauthType: string,
    consumerKey: string,
    consumerSecret: string,
    securityToken: string,
    connectionName?: string
  ) => {
    setIsConnecting(true);
    setError(null);

    try {
      let finalUsername = username;
      let finalPassword = password;
      let finalClientId = clientId;
      let finalClientSecret = clientSecret;

      if (oauthType === 'auth-provider-sf-classic-001') {
        finalClientId = consumerKey || '';
        finalClientSecret = consumerSecret || '';
        finalPassword = securityToken ? `${password}${securityToken}` : password;
      }

      const result = await SalesforceService.initializeConnection(
        finalUsername,
        finalPassword,
        domainUrl,
        finalClientId,
        finalClientSecret
      );

      if (result.success && result.userInfo) {
        // Set master key in ConnectionManager before saving
        const currentMasterKey = getMasterKey();
        if (!currentMasterKey) {
          throw new Error('Master key not available in session');
        }
        
        // Set master key in ConnectionManager instance
        await connectionManager.setMasterKey(currentMasterKey);
        
        const connectionId = await connectionManager.saveConnection(
          oauthType, // Use the selected auth provider from dropdown
          username,
          password,
          environment,
          connectionName || username, // Use connection name if provided, otherwise use username
          consumerKey,
          consumerSecret,
          securityToken,
          clientId,
          clientSecret
        );
        
        handleCloseModal();
        await loadSavedConnections();
        onLogin(result.userInfo, connectionId);
      } else {
        throw new Error(result.error || tSync('connections.error.connectionFailed', 'Connection failed'));
      }
    } catch (error) {
      throw error;
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const domainUrl = environment === 'sandbox' ? 'https://test.salesforce.com' : 'https://login.salesforce.com';
      
      await connectWithCredentials(
        username, 
        password, 
        domainUrl, 
        clientId, 
        clientSecret,
        oauthType,
        consumerKey,
        consumerSecret,
        securityToken,
        connectionName
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : tSync('connections.error.connectionFailed', 'Connection failed'));
    }
  };

  return (
    <>
      {/* New Connection Modal */}
      {opened && isMounted && createPortal(
        <div className="saved-connections-manager">
          <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <IconLink size={20} />
                <h2>{tSync('connections.newConnection')}</h2>
              </div>
              <button className="modal-close" onClick={handleCloseModal}>
                <IconX size={20} />
              </button>
            </div>
            
            <div className="modal-body">
              <div className="modal-wizard">
                {/* Wizard Navigation Sidebar */}
                <div className="modal-wizard-sidebar">
                  <ul className="modal-wizard-steps">
                    <li className={`modal-wizard-step ${currentStep === 1 ? 'active' : ''}`}>
                      <div className="modal-wizard-step-icon">
                        <IconShield size={16} />
                      </div>
                      <div className="modal-wizard-step-content">
                                                    <div className="modal-wizard-step-label">{tSync('connections.wizard.step1.label')}</div>
                            <div className="modal-wizard-step-description">{tSync('connections.wizard.step1.title')}</div>
                      </div>
                    </li>
                    <li className={`modal-wizard-step ${currentStep === 2 ? 'active' : ''}`}>
                      <div className="modal-wizard-step-icon">
                        <IconUser size={16} />
                      </div>
                      <div className="modal-wizard-step-content">
                                                    <div className="modal-wizard-step-label">{tSync('connections.wizard.step2.label')}</div>
                            <div className="modal-wizard-step-description">{tSync('connections.wizard.step2.title')}</div>
                      </div>
                    </li>
                    <li className={`modal-wizard-step ${currentStep === 3 ? 'active' : ''}`}>
                      <div className="modal-wizard-step-icon">
                        <IconKey size={16} />
                      </div>
                      <div className="modal-wizard-step-content">
                                                    <div className="modal-wizard-step-label">{tSync('connections.wizard.step3.label')}</div>
                            <div className="modal-wizard-step-description">{tSync('connections.wizard.step3.title')}</div>
                      </div>
                    </li>
                  </ul>
                </div>

                {/* Wizard Content Area */}
                <div className="modal-wizard-content">
                  <form onSubmit={handleSubmit}>
                    {/* Step 1: OAuth Type Selection */}
                    {currentStep === 1 && (
                      <div>
                                                      <h3>{tSync('connections.wizard.step1.label')}</h3>
                              <p>{tSync('connections.wizard.step1.description')}</p>
                        
                                                <div className="modal-form-group">
                          <label className="modal-form-label">{tSync('connections.oauthType')}</label>
                          <select 
                            className="modal-form-select"
                            value={oauthType}
                            onChange={(e) => setOAuthType(e.target.value)}
                          >
                            {oauthTypes.map((type) => (
                              <option key={type.value} value={type.value}>
                                {type.label}
                              </option>
                            ))}
                          </select>
                          <p className="modal-form-description">
                            {oauthTypes.find(t => t.value === oauthType)?.description || ''}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Step 2: Credentials */}
                    {currentStep === 2 && (
                      <div>
                                                      <h3>{tSync('connections.wizard.step2.label')}</h3>
                              <p>{tSync('connections.wizard.step2.description')}</p>
                        
                        <div className="modal-form-group">
                                                          <label className="modal-form-label">{tSync('connections.username')}</label>
                          <input
                            type="text"
                            className="modal-form-input"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                                                              placeholder={tSync('connections.usernamePlaceholder')}
                          />
                        </div>
                        
                        <div className="modal-form-group">
                                                          <label className="modal-form-label">{tSync('connections.password')}</label>
                          <input
                            type="password"
                            className="modal-form-input"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                                                              placeholder={tSync('connections.passwordPlaceholder')}
                          />
                        </div>
                        
                        <div className="modal-form-group">
                                                          <label className="modal-form-label">{tSync('connections.environment')}</label>
                          <select
                            className="modal-form-select"
                            value={environment}
                            onChange={(e) => setEnvironment(e.target.value as 'production' | 'sandbox')}
                          >
                                                              <option value="production">{tSync('connections.environmentProduction')}</option>
                                  <option value="sandbox">{tSync('connections.environmentSandbox')}</option>
                          </select>
                                                          <p className="modal-form-description">{tSync('connections.environmentDescription')}</p>
                        </div>
                      </div>
                    )}

                    {/* Step 3: OAuth Details */}
                    {currentStep === 3 && (
                      <div>
                                                      <h3>{tSync('connections.wizard.step3.label')}</h3>
                              <p>{tSync('connections.wizard.step3.description')}</p>
                        
                        {/* Connection Name Field */}
                        <div className="modal-form-group">
                          <label className="modal-form-label">
                            {tSync('connections.connectionName', 'Connection Name')}
                            <span style={{ color: '#6b7280', fontSize: '12px', fontWeight: 'normal' }}> (Optional)</span>
                          </label>
                          <input
                            type="text"
                            className="modal-form-input"
                            value={connectionName}
                            onChange={(e) => setConnectionName(e.target.value)}
                            placeholder={tSync('connections.connectionNamePlaceholder', username || 'Enter a name for this connection')}
                          />
                          <p className="modal-form-description">
                            {tSync('connections.connectionNameDescription', 'Leave empty to use username as the connection name')}
                          </p>
                        </div>
                        
                        {oauthType === 'salesforce_classic' ? (
                          <>
                                                              <div className="modal-form-group">
                                    <label className="modal-form-label">{tSync('connections.consumerKey')}</label>
                              <input
                                type="text"
                                className="modal-form-input"
                                value={consumerKey}
                                onChange={(e) => setConsumerKey(e.target.value)}
                                                                      placeholder={tSync('connections.consumerKeyPlaceholder')}
                              />
                            </div>
                            
                                                              <div className="modal-form-group">
                                    <label className="modal-form-label">{tSync('connections.consumerSecret')}</label>
                              <input
                                type="password"
                                className="modal-form-input"
                                value={consumerSecret}
                                onChange={(e) => setConsumerSecret(e.target.value)}
                                                                      placeholder={tSync('connections.consumerSecretPlaceholder')}
                              />
                            </div>
                            
                                                              <div className="modal-form-group">
                                    <label className="modal-form-label">{tSync('connections.securityToken')}</label>
                              <input
                                type="text"
                                className="modal-form-input"
                                value={securityToken}
                                onChange={(e) => setSecurityToken(e.target.value)}
                                                                      placeholder={tSync('connections.securityTokenPlaceholder')}
                              />
                            </div>
                          </>
                        ) : (
                          <>
                                                              <div className="modal-form-group">
                                    <label className="modal-form-label">{tSync('connections.clientId')}</label>
                              <input
                                type="text"
                                className="modal-form-input"
                                value={clientId}
                                onChange={(e) => setClientId(e.target.value)}
                                                                      placeholder={tSync('connections.clientIdPlaceholder')}
                              />
                            </div>
                            
                                                              <div className="modal-form-group">
                                    <label className="modal-form-label">{tSync('connections.clientSecret')}</label>
                              <input
                                type="password"
                                className="modal-form-input"
                                value={clientSecret}
                                onChange={(e) => setClientSecret(e.target.value)}
                                                                      placeholder={tSync('connections.clientSecretPlaceholder')}
                              />
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Error Display */}
                    {error && (
                      <div className="error-message">
                        <IconAlertCircle size={16} />
                        {error}
                      </div>
                    )}

                    {/* Navigation Buttons */}
                    <div className="modal-actions">
                      {currentStep > 1 && (
                        <button
                          type="button"
                          className="modal-btn modal-btn-secondary"
                          onClick={handlePreviousStep}
                        >
                          <IconArrowLeft size={16} />
                                                          {tSync('connections.wizard.previous')}
                        </button>
                      )}
                      
                      {currentStep < totalSteps ? (
                        <button
                          type="button"
                          className="modal-btn modal-btn-primary"
                          onClick={handleNextStep}
                          disabled={!canProceedToNextStep()}
                        >
                                                          {tSync('connections.wizard.next')}
                          <IconArrowRight size={16} />
                        </button>
                      ) : (
                        <button
                          type="submit"
                          className="modal-btn modal-btn-primary"
                          disabled={!canProceedToNextStep() || isConnecting}
                        >
                          {isConnecting ? (
                            <>
                              <div className="loading-spinner"></div>
                                                                  {tSync('connections.connecting')}
                            </>
                          ) : (
                            <>
                              <IconDeviceFloppy size={16} />
                                                                  {tSync('connections.saveAndConnect')}
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>,
        document.body
      )}

      {/* Main Content */}
      <div className="saved-connections-manager">
        <div className="main-interface">
          {/* Error Display */}
          {error && (
            <div className="error-message" style={{ marginBottom: '16px' }}>
              <IconAlertCircle size={16} />
              {error}
            </div>
          )}
          
          {/* Loading State */}
          {isLoadingConnections && (
            <div className="loading-state" style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center', 
              padding: '40px',
              textAlign: 'center'
            }}>
              <div className="loading-spinner" style={{ marginBottom: '16px' }}></div>
              <p>{tSync('connections.loading', 'Loading connections...')}</p>
            </div>
          )}


          {/* Saved Connections List */}
          {!isLoadingConnections && savedConnections.length > 0 && (
            <div className="saved-connections-list">
              <div className="connections-header">
                <div className="connections-header-content">
                  <div className="connections-title-section">
                    <div className="connections-icon">
                      <IconShield size={24} />
                    </div>
                    <div className="connections-title">
                      <h3>{tSync('connections.title')}</h3>
                      <span className="connections-subtitle">
                        {savedConnections.length} {savedConnections.length === 1 ? tSync('connections.connectionsAvailableOne') : tSync('connections.connectionsAvailableMany')}
                      </span>
                    </div>
                  </div>
                  <div className="connections-actions">
                    <Group>
                      <ActionIcon 
                        aria-label={tSync('connections.aria.addNewConnection')} 
                        size="md"
                        color="blue"
                        variant="filled"
                        style={{ 
                          backgroundColor: '#3b82f6', 
                          color: 'white',
                          width: '36px',
                          height: '36px',
                          borderRadius: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: 'none',
                          cursor: 'pointer'
                        }}
                        onClick={() => {
                          logger.debug('Add new connection button clicked', 'SavedConnectionsManager');
                          handleOpenModal();
                        }}
                        title={tSync('connections.addNew')}
                      >
                        <IconPlus size={16} />
                      </ActionIcon>
                      <ActionIcon 
                        aria-label={tSync('connections.aria.refreshConnections')} 
                        size="md"
                        color="green"
                        variant="filled"
                        style={{ 
                          backgroundColor: '#10b981', 
                          color: 'white',
                          width: '36px',
                          height: '36px',
                          borderRadius: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: 'none',
                          cursor: 'pointer',
                          transform: isLoadingConnections ? 'rotate(360deg)' : 'rotate(0deg)',
                          transition: 'transform 0.5s ease-in-out'
                        }}
                        onClick={() => {
                          logger.debug('Refresh connections button clicked', 'SavedConnectionsManager');
                          handleRefreshConnections();
                        }}
                        title={tSync('connections.refresh', 'Refresh Connections')}
                        disabled={isLoadingConnections}
                      >
                        <IconRefresh size={16} />
                      </ActionIcon>
                      <ActionIcon 
                        aria-label={tSync('connections.aria.clearAllConnections')} 
                        size="md"
                        color="red"
                        variant="filled"
                        style={{ 
                          backgroundColor: '#ef4444', 
                          color: 'white',
                          width: '36px',
                          height: '36px',
                          borderRadius: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: 'none',
                          cursor: 'pointer'
                        }}
                        onClick={() => {
                          logger.debug('Clear all connections button clicked', 'SavedConnectionsManager');
                          handleClearAllConnections();
                        }}
                        title={tSync('connections.clearAll')}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>
                  </div>
                </div>
              </div>
              
                             <div className="connections-table">
                 <div className="connections-table-header">
                   <div className="connection-name-header">{tSync('connections.name')}</div>
                   <div className="connection-username-header">{tSync('connections.username')}</div>
                   <div className="connection-environment-header">{tSync('connections.environment')}</div>
                   <div className="connection-last-used-header">{tSync('connections.lastUsed')}</div>
                   <div className="connection-actions-header">{tSync('connections.actions')}</div>
                 </div>
                 
                 <div className="connections-table-body">
                   {savedConnections.map((connection) => (
                     <div key={connection.id} className="connection-row">
                       <div className="connection-name">
                         <div className="connection-name-text">
                           {connection.displayName || connection.username}
                         </div>
                       </div>
                       
                       <div className="connection-username">
                         {connection.username}
                       </div>
                       
                       <div className="connection-environment">
                         <span className={`environment-badge ${connection.environment}`}>
                           {connection.environment === 'sandbox' ? 'Sandbox' : 'Production'}
                         </span>
                       </div>
                       
                       <div className="connection-last-used">
                         {new Date(connection.lastUsed).toLocaleDateString()}
                       </div>
                       
                       <div className="connection-actions">
                         <button 
                           className={`btn btn-primary btn-sm ${
                             connectingConnectionId === connection.id ? 'loading' : 
                             successfulConnectionId === connection.id ? 'success' : ''
                           }`}
                           onClick={() => {
                             logger.debug('Connect button clicked for connection', 'SavedConnectionsManager', { connectionId: connection.id });
                             handleQuickConnect(connection);
                           }}
                           disabled={connectingConnectionId === connection.id || successfulConnectionId === connection.id}
                           title={tSync('connections.quickConnect')}
                         >
                           {connectingConnectionId === connection.id ? (
                             <>
                               <div className="loading-spinner"></div>
                               {tSync('connections.connecting')}
                             </>
                           ) : successfulConnectionId === connection.id ? (
                             <>
                               <IconCheck size={14} />
                               {tSync('connections.connected')}
                             </>
                           ) : (
                             <>
                               <IconLink size={14} />
                               {tSync('connections.quickConnect')}
                             </>
                           )}
                         </button>
                         
                         <button 
                           className="btn btn-icon-only btn-secondary btn-sm"
                           onClick={() => {
                             setNewConnectionName(connection.displayName || connection.username);
                             setRenamingConnectionId(connection.id);
                           }}
                           title={tSync('connections.renameConnection', 'Rename Connection')}
                           disabled={connectingConnectionId === connection.id || successfulConnectionId === connection.id || isRenaming}
                         >
                           <IconEdit size={14} />
                         </button>
                         
                         <button 
                           className="btn btn-icon-only btn-danger btn-sm"
                           onClick={() => handleRemoveConnection(connection.id)}
                           title={tSync('connections.removeConnection')}
                           disabled={connectingConnectionId === connection.id || successfulConnectionId === connection.id || isRenaming}
                         >
                           <IconTrash size={14} />
                         </button>
                       </div>
                     </div>
                   ))}
                 </div>
               </div>
            </div>
          )}

          {/* Empty State */}
          {savedConnections.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-content">
                <div className="empty-state-icon">
                  <IconShield size={64} />
                </div>
                <h2 className="empty-state-title">{tSync('connections.noConnections')}</h2>
                <p className="empty-state-description">
                  {tSync('connections.createFirstConnectionSubtitle')}
                </p>
                <button 
                  className="btn btn-primary btn-large"
                  onClick={handleOpenModal}
                >
                  <IconPlus size={16} />
                  {tSync('connections.createFirstConnection')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Rename Connection Modal */}
      {renamingConnectionId && (
        <div className="modal-overlay" onClick={() => {
          setRenamingConnectionId(null);
          setNewConnectionName('');
        }}>
          <div className="modal-content" style={{ maxWidth: '500px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{tSync('connections.renameConnection', 'Rename Connection')}</h2>
              <button 
                className="modal-close"
                onClick={() => {
                  setRenamingConnectionId(null);
                  setNewConnectionName('');
                }}
              >
                <IconX size={20} />
              </button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">{tSync('connections.newName', 'New Name')}</label>
                <input
                  type="text"
                  className="form-input"
                  value={newConnectionName}
                  onChange={(e) => setNewConnectionName(e.target.value)}
                  placeholder={tSync('connections.enterNewName', 'Enter new connection name')}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newConnectionName.trim() && !isRenaming) {
                      handleRenameConnection(renamingConnectionId, newConnectionName);
                    } else if (e.key === 'Escape') {
                      setRenamingConnectionId(null);
                      setNewConnectionName('');
                    }
                  }}
                />
              </div>
            </div>
            
            <div className="modal-footer">
              <button 
                className="btn btn-secondary"
                onClick={() => {
                  setRenamingConnectionId(null);
                  setNewConnectionName('');
                }}
                disabled={isRenaming}
              >
                {tSync('common.cancel', 'Cancel')}
              </button>
              <button 
                className="btn btn-primary"
                onClick={() => handleRenameConnection(renamingConnectionId, newConnectionName)}
                disabled={isRenaming || !newConnectionName.trim()}
              >
                {isRenaming ? (
                  <>
                    <div className="loading-spinner"></div>
                    {tSync('connections.renaming', 'Renaming...')}
                  </>
                ) : (
                  tSync('connections.save', 'Save')
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
