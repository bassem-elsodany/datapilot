import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { ConnectionsList } from './connections/ConnectionsList';
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
  IconEdit,
  IconEye,
  IconEyeOff
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
  
  // Rename state (kept for isRenaming flag used by ConnectionRow)
  const [isRenaming, setIsRenaming] = useState(false);
  const [renamingConnectionId, setRenamingConnectionId] = useState<string | null>(null);
  const [newConnectionName, setNewConnectionName] = useState('');

  // Edit connection modal state
  const [editingConnection, setEditingConnection] = useState<SavedConnection | null>(null);
  const [isLoadingEditData, setIsLoadingEditData] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editShowPassword, setEditShowPassword] = useState(false);
  const [editEnvironment, setEditEnvironment] = useState<'production' | 'sandbox'>('production');
  const [editConsumerKey, setEditConsumerKey] = useState('');
  const [editConsumerSecret, setEditConsumerSecret] = useState('');
  const [editShowConsumerSecret, setEditShowConsumerSecret] = useState(false);
  const [editSecurityToken, setEditSecurityToken] = useState('');
  const [editClientId, setEditClientId] = useState('');
  const [editClientSecret, setEditClientSecret] = useState('');
  const [editShowClientSecret, setEditShowClientSecret] = useState(false);
  const [editOauthType, setEditOauthType] = useState<'salesforce_classic' | 'oauth_standard'>('oauth_standard');
  const [editAuthProviderUuid, setEditAuthProviderUuid] = useState('');
  const [isTestingEdit, setIsTestingEdit] = useState(false);
  const [editTestResult, setEditTestResult] = useState<{ success: boolean; message: string; user_info?: any } | null>(null);
  
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

  const handleQuickConnect = useCallback(
    async (connection: SavedConnection) => {
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

          // Clean up decrypted connection object from memory
          // This prevents sensitive data (passwords, tokens) from being held in memory
          const cleanedConnection = { ...decryptedConnection };
          cleanedConnection.password = '';
          cleanedConnection.clientSecret = '';
          cleanedConnection.consumerSecret = '';
          cleanedConnection.securityToken = '';

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
        // Don't set local error state - the notification service will handle displaying the error
        // This prevents duplicate error messages (one in notification, one in the alert box)
      } finally {
        setConnectingConnectionId(null);
        // Clear all sensitive local variables to free up memory
        // This ensures decrypted credentials are not held in memory after connection attempt
      }
    },
    [onLogin, tSync]
  );

  const handleRemoveConnection = useCallback(
    async (connectionId: string) => {
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
    },
    [tSync]
  );

  const handleRenameConnection = useCallback(
    async (connectionId: string, newName: string) => {
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
    },
    [tSync]
  );

  const handleOpenEditModal = useCallback(
    async (connection: SavedConnection) => {
      setEditingConnection(connection);
      setIsLoadingEditData(true);
      setEditDisplayName(connection.displayName || connection.username);
      setEditUsername('');
      setEditPassword('');
      setEditEnvironment('production');
      setEditConsumerKey('');
      setEditConsumerSecret('');
      setEditSecurityToken('');
      setEditClientId('');
      setEditClientSecret('');
      setEditShowPassword(false);
      setEditShowConsumerSecret(false);
      setEditShowClientSecret(false);

      try {
        const credentials = await apiService.getConnectionCredentials(connection.id);
        if (credentials) {
          setEditDisplayName((credentials as any).display_name || connection.displayName);
          setEditUsername((credentials as any).connection_data?.username || '');
          setEditPassword((credentials as any).connection_data?.password || '');
          setEditEnvironment(((credentials as any).connection_data?.environment as 'production' | 'sandbox') || 'production');
          setEditConsumerKey((credentials as any).connection_data?.consumer_key || '');
          setEditConsumerSecret((credentials as any).connection_data?.consumer_secret || '');
          setEditSecurityToken((credentials as any).connection_data?.security_token || '');
          setEditClientId((credentials as any).connection_data?.client_id || '');
          setEditClientSecret((credentials as any).connection_data?.client_secret || '');
          setEditAuthProviderUuid((credentials as any).auth_provider_uuid || '');

          // Determine oauth type from credentials
          const hasConsumerKey = !!(credentials as any).connection_data?.consumer_key;
          const matchedProvider = oauthTypes.find(t => t.value === (credentials as any).auth_provider_uuid);
          const isClassic = matchedProvider
            ? matchedProvider.requires_consumer_key
            : hasConsumerKey;
          setEditOauthType(isClassic ? 'salesforce_classic' : 'oauth_standard');
        }
      } catch (error) {
        logger.error('Failed to load connection credentials for edit', 'SavedConnectionsManager', null, error as Error);
        notifications.show({
          title: tSync('connections.edit.error.load_title', 'Load Failed'),
          message: tSync('connections.edit.error.load_message', 'Failed to load connection details. Please try again.'),
          color: 'red',
          autoClose: 3000,
        });
        setEditingConnection(null);
      } finally {
        setIsLoadingEditData(false);
      }
    },
    [oauthTypes, tSync]
  );

  const handleCloseEditModal = useCallback(() => {
    setEditingConnection(null);
    setEditDisplayName('');
    setEditUsername('');
    setEditPassword('');
    setEditEnvironment('production');
    setEditConsumerKey('');
    setEditConsumerSecret('');
    setEditSecurityToken('');
    setEditClientId('');
    setEditClientSecret('');
    setEditShowPassword(false);
    setEditShowConsumerSecret(false);
    setEditShowClientSecret(false);
    setEditTestResult(null);
  }, []);

  const handleTestEdit = useCallback(async () => {
    setIsTestingEdit(true);
    setEditTestResult(null);
    try {
      const result = await apiService.testConnectionCredentials({
        username: editUsername,
        password: editPassword,
        environment: editEnvironment,
        consumerKey: editConsumerKey || undefined,
        consumerSecret: editConsumerSecret || undefined,
        securityToken: editSecurityToken || undefined,
        clientId: editClientId || undefined,
        clientSecret: editClientSecret || undefined,
      });
      setEditTestResult(result);
    } catch (error) {
      setEditTestResult({ success: false, message: (error as Error).message || 'Connection test failed' });
    } finally {
      setIsTestingEdit(false);
    }
  }, [editUsername, editPassword, editEnvironment, editConsumerKey, editConsumerSecret, editSecurityToken, editClientId, editClientSecret]);

  const handleSaveEdit = useCallback(async () => {
    if (!editingConnection) return;

    setIsSavingEdit(true);
    try {
      await apiService.updateConnection(
        editingConnection.id,
        editDisplayName.trim(),
        {
          username: editUsername,
          password: editPassword,
          environment: editEnvironment,
          consumerKey: editConsumerKey || undefined,
          consumerSecret: editConsumerSecret || undefined,
          securityToken: editSecurityToken || undefined,
          clientId: editClientId || undefined,
          clientSecret: editClientSecret || undefined,
        }
      );

      await loadSavedConnections();
      handleCloseEditModal();

      notifications.show({
        title: tSync('connections.edit.success.title', 'Connection Updated'),
        message: tSync('connections.edit.success.message', 'Connection details have been updated successfully'),
        color: 'green',
        icon: <IconEdit size={16} />,
        autoClose: 3000,
      });
    } catch (error) {
      logger.error('Failed to save connection edit', 'SavedConnectionsManager', null, error as Error);
      notifications.show({
        title: tSync('connections.edit.error.save_title', 'Update Failed'),
        message: (error as Error).message || tSync('connections.edit.error.save_message', 'Failed to update connection. Please check your credentials.'),
        color: 'red',
        autoClose: 5000,
      });
    } finally {
      setIsSavingEdit(false);
    }
  }, [
    editingConnection, editDisplayName, editUsername, editPassword, editEnvironment,
    editConsumerKey, editConsumerSecret, editSecurityToken, editClientId, editClientSecret,
    tSync, handleCloseEditModal
  ]);

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

                {/* Virtualized connections list using react-window */}
                <ConnectionsList
                  connections={savedConnections}
                  connectingConnectionId={connectingConnectionId}
                  successfulConnectionId={successfulConnectionId}
                  isRenaming={isRenaming}
                  onConnect={handleQuickConnect}
                  onRename={(connection) => handleOpenEditModal(connection)}
                  onDelete={handleRemoveConnection}
                  tSync={tSync}
                  isLoading={isLoadingConnections}
                />
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

      {/* Edit Connection Modal */}
      {editingConnection && (
        <div className="modal-overlay" onClick={() => { if (!isSavingEdit) handleCloseEditModal(); }}>
          <div className="modal-content" style={{ maxWidth: '560px', width: '95%' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{tSync('connections.editConnection', 'Edit Connection')}</h2>
              <button
                className="modal-close"
                onClick={handleCloseEditModal}
                disabled={isSavingEdit}
              >
                <IconX size={20} />
              </button>
            </div>

            {isLoadingEditData ? (
              <div className="modal-body" style={{ textAlign: 'center', padding: '2rem' }}>
                <div className="loading-spinner" style={{ margin: '0 auto 0.75rem' }}></div>
                <p style={{ color: 'var(--text-secondary)' }}>{tSync('connections.loadingDetails', 'Loading connection details...')}</p>
              </div>
            ) : (
              <div className="modal-body">
                {/* Connection Name */}
                <div className="form-group">
                  <label className="form-label">{tSync('connections.connectionName', 'Connection Name')}</label>
                  <input
                    type="text"
                    className="form-input"
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                    placeholder={tSync('connections.enterConnectionName', 'Enter connection name')}
                    autoFocus
                    disabled={isSavingEdit}
                  />
                </div>

                {/* Username */}
                <div className="form-group">
                  <label className="form-label">{tSync('connections.username', 'Username')}</label>
                  <input
                    type="text"
                    className="form-input"
                    value={editUsername}
                    onChange={(e) => { setEditUsername(e.target.value); setEditTestResult(null); }}
                    placeholder={tSync('connections.enterUsername', 'Enter Salesforce username')}
                    disabled={isSavingEdit}
                  />
                </div>

                {/* Password */}
                <div className="form-group">
                  <label className="form-label">{tSync('connections.password', 'Password')}</label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      type={editShowPassword ? 'text' : 'password'}
                      className="form-input"
                      style={{ paddingRight: '2.5rem', flex: 1 }}
                      value={editPassword}
                      onChange={(e) => { setEditPassword(e.target.value); setEditTestResult(null); }}
                      placeholder={tSync('connections.enterPassword', 'Enter password')}
                      disabled={isSavingEdit}
                    />
                    <button
                      type="button"
                      className="btn btn-icon-only btn-secondary btn-sm"
                      style={{ position: 'absolute', right: '4px', border: 'none', background: 'transparent' }}
                      onClick={() => setEditShowPassword((v) => !v)}
                      tabIndex={-1}
                    >
                      {editShowPassword ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                    </button>
                  </div>
                </div>

                {/* Environment */}
                <div className="form-group">
                  <label className="form-label">{tSync('connections.environment', 'Environment')}</label>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    {(['production', 'sandbox'] as const).map((env) => (
                      <label key={env} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="edit-environment"
                          value={env}
                          checked={editEnvironment === env}
                          onChange={() => { setEditEnvironment(env); setEditTestResult(null); }}
                          disabled={isSavingEdit}
                        />
                        <span className={`environment-badge ${env}`}>
                          {env === 'sandbox' ? tSync('connections.sandbox', 'Sandbox') : tSync('connections.production', 'Production')}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* OAuth-specific fields */}
                {editOauthType === 'salesforce_classic' ? (
                  <>
                    <div className="form-group">
                      <label className="form-label">{tSync('connections.consumerKey', 'Consumer Key')}</label>
                      <input
                        type="text"
                        className="form-input"
                        value={editConsumerKey}
                        onChange={(e) => { setEditConsumerKey(e.target.value); setEditTestResult(null); }}
                        placeholder={tSync('connections.enterConsumerKey', 'Enter consumer key')}
                        disabled={isSavingEdit}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">{tSync('connections.consumerSecret', 'Consumer Secret')}</label>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <input
                          type={editShowConsumerSecret ? 'text' : 'password'}
                          className="form-input"
                          style={{ paddingRight: '2.5rem', flex: 1 }}
                          value={editConsumerSecret}
                          onChange={(e) => { setEditConsumerSecret(e.target.value); setEditTestResult(null); }}
                          placeholder={tSync('connections.enterConsumerSecret', 'Enter consumer secret')}
                          disabled={isSavingEdit}
                        />
                        <button
                          type="button"
                          className="btn btn-icon-only btn-secondary btn-sm"
                          style={{ position: 'absolute', right: '4px', border: 'none', background: 'transparent' }}
                          onClick={() => setEditShowConsumerSecret((v) => !v)}
                          tabIndex={-1}
                        >
                          {editShowConsumerSecret ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                        </button>
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">{tSync('connections.securityToken', 'Security Token')}</label>
                      <input
                        type="text"
                        className="form-input"
                        value={editSecurityToken}
                        onChange={(e) => { setEditSecurityToken(e.target.value); setEditTestResult(null); }}
                        placeholder={tSync('connections.enterSecurityToken', 'Enter security token (optional)')}
                        disabled={isSavingEdit}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="form-group">
                      <label className="form-label">{tSync('connections.clientId', 'Client ID')}</label>
                      <input
                        type="text"
                        className="form-input"
                        value={editClientId}
                        onChange={(e) => { setEditClientId(e.target.value); setEditTestResult(null); }}
                        placeholder={tSync('connections.enterClientId', 'Enter client ID')}
                        disabled={isSavingEdit}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">{tSync('connections.clientSecret', 'Client Secret')}</label>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <input
                          type={editShowClientSecret ? 'text' : 'password'}
                          className="form-input"
                          style={{ paddingRight: '2.5rem', flex: 1 }}
                          value={editClientSecret}
                          onChange={(e) => { setEditClientSecret(e.target.value); setEditTestResult(null); }}
                          placeholder={tSync('connections.enterClientSecret', 'Enter client secret')}
                          disabled={isSavingEdit}
                        />
                        <button
                          type="button"
                          className="btn btn-icon-only btn-secondary btn-sm"
                          style={{ position: 'absolute', right: '4px', border: 'none', background: 'transparent' }}
                          onClick={() => setEditShowClientSecret((v) => !v)}
                          tabIndex={-1}
                        >
                          {editShowClientSecret ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {/* Test result feedback */}
                {editTestResult && (
                  <div style={{
                    marginTop: '0.75rem',
                    padding: '0.6rem 0.875rem',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.5rem',
                    fontSize: '0.875rem',
                    background: editTestResult.success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                    border: `1px solid ${editTestResult.success ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`,
                    color: editTestResult.success ? '#16a34a' : '#dc2626',
                  }}>
                    {editTestResult.success
                      ? <IconCheck size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
                      : <IconAlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />}
                    <span>
                      {editTestResult.success
                        ? `${tSync('connections.testSuccess', 'Connection successful')}${editTestResult.user_info?.user_name ? ` — ${editTestResult.user_info.user_name}` : ''}`
                        : editTestResult.message}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
              <button
                className="btn btn-secondary"
                onClick={handleCloseEditModal}
                disabled={isSavingEdit || isLoadingEditData}
              >
                {tSync('common.cancel', 'Cancel')}
              </button>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className="btn btn-secondary"
                  onClick={handleTestEdit}
                  disabled={isTestingEdit || isSavingEdit || isLoadingEditData || !editUsername.trim() || !editPassword.trim()}
                  title={tSync('connections.testConnectionTitle', 'Test credentials without saving')}
                >
                  {isTestingEdit ? (
                    <>
                      <div className="loading-spinner"></div>
                      {tSync('connections.testing', 'Testing...')}
                    </>
                  ) : (
                    <>
                      <IconLink size={14} />
                      {tSync('connections.testConnection', 'Test Connection')}
                    </>
                  )}
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleSaveEdit}
                  disabled={isSavingEdit || isLoadingEditData || !editDisplayName.trim() || !editUsername.trim() || !editPassword.trim()}
                >
                  {isSavingEdit ? (
                    <>
                      <div className="loading-spinner"></div>
                      {tSync('connections.validatingAndSaving', 'Validating & Saving...')}
                    </>
                  ) : (
                    tSync('connections.saveChanges', 'Save Changes')
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
