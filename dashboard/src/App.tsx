import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MantineProvider, AppShell, Group, Title, Button, Text, Container, Modal, Stack, Badge, ActionIcon } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { ModalsProvider } from '@mantine/modals';
import { ContextMenuProvider } from 'mantine-contextmenu';
import { IconShield, IconBolt, IconStar, IconWorld, IconHelp, IconMessage, IconX, IconInfoCircle, IconChevronDown, IconChevronUp, IconDownload, IconChevronLeft, IconChevronRight, IconDatabase } from '@tabler/icons-react';
import { mantineTheme } from './config/mantine.config';
import { SalesforceService, SalesforceUserInfo } from './services/SalesforceService';
import { SObjectCacheService } from './services/SObjectCacheService';
import { StatusBar } from './components/StatusBar';
import { AppHeader } from './components/AppHeader';
import { SessionProvider, useSessionContext } from './contexts/SessionContext';
import MasterKeyManager from './components/MasterKeyManager';
import { LoginPanel } from './components/LoginPanel';

// Lazy-loaded components for code splitting
import {
  QueryEditorPageWrapper,
  ResultsViewPageWrapper,
  SavedConnectionsManagerWrapper,
  SchemaTreeWrapper,
  SmartAuthenticationFlowWrapper,
  AppDebugWrapper
} from './components/LazyComponents';

import { databaseService } from './services/DatabaseService';
import { appSettingsService } from './services/AppSettingsService';
import { useTranslation } from './services/I18nService';
import { connectionManager, ConnectionManager } from './services/ConnectionManager';
import { appConfigService } from './services/AppConfigService';
import { notificationService } from './services/NotificationService';
import { apiService } from './services/ApiService';
import './assets/css/App.css';
import './assets/css/index.css';
import './assets/css/components/AppHeader.css';
import { logger } from './services/Logger';

// Configuration constants - these will be fetched from settings endpoint
let MAX_RECORDS_LIMIT: number;
let MAX_RECORDS_WARNING_THRESHOLD: number;

// Removed duplicate interface declaration

// Using ElectronAPI from shared/types.ts instead of duplicate declaration

export interface QueryResult {
  metadata: {
    total_size: number;
    done: boolean;
    nextRecordsUrl?: string;
  };
  records: any[];
}

export interface ApiUsage {
  used: number;
  limit: number;
  remaining: number;
  resetTime: string | null;
  percentage: number;
}

// Main app content that uses session context
const AppContent: React.FC = () => {
  
  const { 
    isAuthenticated, 
    createSession, 
    clearSession, 
    destroySession, 
    isSessionValid, 
    currentConnectionUuid, 
    setCurrentConnectionUuid, 
    getMasterKeyForApi,
    getMasterKey,
    setIsConnected,
    getIsConnected,
    setUserInfo,
    getUserInfo,
    session
  } = useSessionContext();
  const [showSavedConnections, setShowSavedConnections] = useState(false);
  
  // Move availableLocales state up to AppContent level so both AppContent and MainApp can access it
  const [availableLocales, setAvailableLocales] = useState<Array<{code: string, name: string}>>([]);
  const [availableLanguages, setAvailableLanguages] = useState<Array<{code: string, name: string, uuid: string}>>([]);
  
  // About modal state for saved connections page
  const [showAboutModal, setShowAboutModal] = useState(false);
  
  // Translation service for AppContent
  const { tSync, setLocale, getCurrentLocale, getAvailableLocales, getAvailableLanguageObjects, waitForReady } = useTranslation();
  
  // Update document title when language changes
  useEffect(() => {
    const updateDocumentTitle = () => {
      const title = tSync('app.title', 'Data Pilot');
      document.title = title;
    };
    
    // Update title immediately
    updateDocumentTitle();
    
    // Also update when translations are ready
    waitForReady().then(() => {
      updateDocumentTitle();
    });
  }, [tSync, waitForReady]);
  
  // Ref to prevent multiple simultaneous login processing
  const isProcessingLoginRef = useRef(false);
  
  
  // Get connection state from session context - use session directly to trigger re-renders
  const userInfo = session?.userInfo || null;
  const isConnected = session?.isConnected || false;
  
  // Track state changes
  useEffect(() => {
    // State change tracking
  }, [userInfo, isConnected]);

  // Session context provider is automatically set up by SessionContext.tsx
  // No need to manually set it up here
  
  // Note: Removed automatic session clearing to prevent clearing valid sessions


  // Load available locales when AppContent mounts
  const loadAvailableLocales = async () => {
    try {
      logger.debug('Loading available locales and languages');
      const [locales, languages] = await Promise.all([
        getAvailableLocales(),
        getAvailableLanguageObjects()
      ]);
      logger.debug(`Loaded ${locales.length} available locales: ${locales.map(l => l.name).join(', ')}`);
      logger.debug(`Loaded ${languages.length} available languages with UUIDs`);
      logger.debug('Locales data:', locales);
      logger.debug('Languages data:', languages);
      setAvailableLocales(locales);
      setAvailableLanguages(languages);
      logger.debug('Available locales and languages state updated');
    } catch (error) {
      logger.warn('Failed to load available locales, using fallback:', error);
      // Set fallback to English
      setAvailableLocales([{ code: 'en', name: 'English' }]);
      setAvailableLanguages([{ code: 'en', name: 'English', uuid: '550e8400-e29b-41d4-a716-446655440000' }]);
    }
  };

  // Load available locales on component mount
  useEffect(() => {
    loadAvailableLocales();
  }, []);

  // Handle locale change - both frontend and backend
  const handleLocaleChange = async (languageUuid: string) => {
    try {
      // Find the language object for the selected UUID
      const selectedLanguage = availableLanguages.find(lang => lang.uuid === languageUuid);
      if (!selectedLanguage) {
        logger.warn(`Language not found for UUID: ${languageUuid}`, 'App');
        return;
      }
      
      // Set frontend locale using the language code
      await setLocale(selectedLanguage.code);
      
      // Call backend to set as default language
      const { apiService } = await import('./services/ApiService');
      await apiService.setDefaultLanguage(languageUuid);
      logger.debug(`Set default language to ${selectedLanguage.code} (UUID: ${languageUuid})`, 'App');
      
      // Force page reload to reflect the new language
      window.location.reload();
    } catch (error) {
      logger.error('Failed to change locale:', error);
      // Still set the frontend locale even if backend call fails
      const selectedLanguage = availableLanguages.find(lang => lang.uuid === languageUuid);
      if (selectedLanguage) {
        await setLocale(selectedLanguage.code);
        // Force page reload even on error to ensure UI reflects the change
        window.location.reload();
      }
    }
  };

  // Shared handleLogin function for connection management
  const handleLogin = async (userInfo: SalesforceUserInfo, connectionUuid?: string) => {
    // Prevent multiple simultaneous login processing
    if (isProcessingLoginRef.current) {
      logger.debug(' Login already in progress, skipping duplicate call', 'App');
      return;
    }
    
    isProcessingLoginRef.current = true;
    
    try {

      // Extract the actual userInfo data if it's wrapped in a response
      const actualUserInfo: SalesforceUserInfo = userInfo && typeof userInfo === 'object' && 'data' in userInfo 
        ? userInfo.data as SalesforceUserInfo
        : userInfo;

      // Strip quotes from connectionUuid if present
      const cleanConnectionUuid = connectionUuid?.replace(/^"(.*)"$/, '$1') || null;
      setCurrentConnectionUuid(cleanConnectionUuid);
      
      
      // Set user info and connection state immediately for better UX
      setUserInfo(actualUserInfo);
      setIsConnected(true);
      
      // Hide saved connections page and redirect to main app immediately
      setShowSavedConnections(false);
      
      // Verify connection status in the background (non-blocking)
      if (cleanConnectionUuid) {
        logger.debug(' Verifying connection status after login (background)', 'App');
        // Don't await this - let it run in background
        SalesforceService.isConnected(cleanConnectionUuid).then(connectionStatus => {
          if (connectionStatus) {
          } else {
            logger.warn('Connection verification failed in background', 'App');
            // Optionally show a warning notification but don't redirect back
          }
        }).catch(error => {
          logger.error('Error verifying connection status in background', 'App', error as Error);
          // Optionally show a warning notification but don't redirect back
        });
      }
      
    } finally {
      isProcessingLoginRef.current = false;
    }
  };

  // Track authentication state changes
  useEffect(() => {
    // Authentication state tracking
  }, [isAuthenticated, showSavedConnections]);
  
  // If not authenticated, show master key authentication
  if (!isAuthenticated) {
    return (
      <MantineProvider theme={mantineTheme} defaultColorScheme="light">
        <Notifications position="top-right" />
        <div className="authentication-flow">
          <LoginPanel>
            <MasterKeyManager 
              onMasterKeyValidated={() => {
                // Create session when master key is validated
                // We'll get the master key from the ConnectionManager
                const connectionManager = ConnectionManager.getInstance();
                const masterKey = connectionManager.getCurrentMasterKey();
                if (masterKey) {
                  createSession(masterKey, {
                    authenticatedAt: new Date().toISOString(),
                    userAgent: navigator.userAgent,
                    timestamp: Date.now()
                  });
                  
                    // Session context provider is automatically set up by SessionContext.tsx
                    
                    // Show saved connections page after session creation
                    // Since we just created the session with the master key, we can proceed
                    setShowSavedConnections(true);
                }
              }}
            />
          </LoginPanel>
        </div>
      </MantineProvider>
    );
  }
  
  // If authenticated and should show saved connections, show saved connections page
  if (showSavedConnections) {
    // Check if master key exists in session context using the same method as SavedConnectionsManager
    const masterKey = getMasterKey();
    
    logger.debug('Checking master key for saved connections', 'App', { 
      hasSession: !!session, 
      hasMasterKey: !!masterKey,
      masterKeyValue: masterKey,
      getMasterKeyResult: getMasterKey(),
      getMasterKeyType: typeof getMasterKey(),
      getMasterKeyLength: getMasterKey()?.length,
      isAuthenticated,
      showSavedConnections 
    });
    
    if (!masterKey || masterKey.trim().length === 0) {
      logger.warn('No master key found in session context, redirecting to master key page', 'App');
      setShowSavedConnections(false);
      return (
        <MantineProvider theme={mantineTheme} defaultColorScheme="light">
          <Notifications position="top-right" />
          <div className="app-container">
            <LoginPanel>
              <SmartAuthenticationFlowWrapper 
                onLogin={handleLogin}
                onMasterKeyValidated={() => {
                  logger.debug('Master key validated, checking if we should show saved connections', 'App');
                  // Only show saved connections if we actually have a master key
                  const currentMasterKey = getMasterKey();
                  if (currentMasterKey && currentMasterKey.trim().length > 0) {
                    setShowSavedConnections(true);
                  } else {
                    logger.warn('Master key validation callback called but no master key found', 'App');
                  }
                }}
              />
            </LoginPanel>
          </div>
        </MantineProvider>
      );
    }
    
    return (
      <MantineProvider theme={mantineTheme} defaultColorScheme="light">
        <Notifications position="top-right" />
        <div className="app-header" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000, height: '50px' }}>
          <AppHeader
            userInfo={null}
            isMasterKeyValidated={!!getMasterKey()}
            onLogout={async () => {
              destroySession();
              setShowSavedConnections(false);
            }}
            onShowAbout={() => {
              setShowAboutModal(true);
            }}
            onShowSavedConnections={() => setShowSavedConnections(true)}
            isOnSavedConnectionsPage={true}
            availableLanguages={availableLanguages}
            onLocaleChange={handleLocaleChange}
          />
        </div>
        <div style={{ marginTop: '50px', marginBottom: '40px' }}>
          <SavedConnectionsManagerWrapper 
            key="saved-connections-manager"
            onLogin={async (userInfo, connectionUuid) => {
              // Handle login and proceed to main app
              await handleLogin(userInfo, connectionUuid);
              // Note: handleLogin already calls setShowSavedConnections(false), so no need to call it again
            }} 
            isMasterKeyValidated={!!getMasterKey()}
            onRedirectToMasterKey={() => {
              logger.debug('Redirecting to master key page from saved connections', 'App');
              // Destroy the current session to force master key re-validation
              destroySession();
              setShowSavedConnections(false);
            }}
          />
        </div>
        
        {/* About Modal for saved connections page */}
        {showAboutModal && (
          <div className="about-modal-overlay" onClick={() => setShowAboutModal(false)}>
            <div className="about-modal" onClick={(e) => e.stopPropagation()}>
              <div className="about-modal-header">
                <div className="about-modal-title">
                  <IconInfoCircle size={20} />
                  <span>{tSync('settings.about')}</span>
                </div>
                <button
                  className="about-modal-close"
                  onClick={() => setShowAboutModal(false)}
                  aria-label="Close"
                >
                  <IconX size={16} />
                </button>
              </div>
              <div className="about-content">
                <div className="about-header">
                  <div className="about-logo">
                    <div className="about-logo-icon">
                      <IconShield size={48} />
                    </div>
                  </div>
                  <div className="about-brand">
                    <h2 className="about-title">Data Pilot</h2>
                    <p className="about-subtitle">{tSync('app.subtitle', 'Your AI pilot for Salesforce data navigation')}</p>
                  </div>
                </div>
                <div className="about-info">
                  <div className="about-version">
                    <strong>{tSync('settings.about.version')}: 1.0.0</strong>
                  </div>
                  <div className="about-build">
                    {tSync('settings.about.buildDate')}: {new Date().toLocaleDateString()}
                  </div>
                  <div className="about-license">
                    {tSync('settings.about.license')}: MIT License
                  </div>
                </div>
                <div className="about-description">
                  <p>{tSync('settings.about.description', 'Data Pilot is a powerful AI-driven tool designed to help Salesforce administrators and developers navigate, query, and analyze their Salesforce data with ease.')}</p>
                </div>
                <div className="about-features">
                  <div className="about-feature">
                    <IconBolt size={16} />
                    <span>{tSync('settings.about.feature1', 'AI-powered SOQL query generation')}</span>
                  </div>
                  <div className="about-feature">
                    <IconDatabase size={16} />
                    <span>{tSync('settings.about.feature2', 'Intelligent schema exploration')}</span>
                  </div>
                  <div className="about-feature">
                    <IconShield size={16} />
                    <span>{tSync('settings.about.feature3', 'Secure connection management')}</span>
                  </div>
                </div>
                <div className="about-links">
                  <a
                    href="https://www.linkedin.com/in/bassem-elsodany"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="about-link"
                  >
                    <IconWorld size={16} />
                    {tSync('settings.about.website','Website')}
                  </a>
                  <a
                    href="https://www.linkedin.com/in/bassem-elsodany"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="about-link"
                  >
                    <IconHelp size={16} />
                    {tSync('settings.about.support','Support')}
                  </a>
                  <a
                    href="https://www.linkedin.com/in/bassem-elsodany"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="about-link"
                  >
                    <IconMessage size={16} />
                    {tSync('settings.about.feedback','Feedback')}
                  </a>
                </div>
                <div className="about-footer">
                  <button
                    className="about-close-button"
                    onClick={() => setShowAboutModal(false)}
                  >
                    {tSync('common.close')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </MantineProvider>
    );
  }
  
  // If no userInfo (no authenticated Salesforce user), check if we have session context
  if (!userInfo) {
    // If no session context (no master key), redirect back to master key setup
    if (!isAuthenticated) {
      return (
        <MantineProvider theme={mantineTheme} defaultColorScheme="light">
          <Notifications position="top-right" />
          <div className="app-container">
            <LoginPanel>
              <MasterKeyManager 
                onMasterKeyValidated={() => {
                  // Create session when master key is validated
                  const masterKey = connectionManager.getCurrentMasterKey();
                  if (masterKey) {
                    createSession(masterKey, {
                      authenticatedAt: new Date().toISOString(),
                      userAgent: navigator.userAgent,
                      timestamp: Date.now()
                    });
                    
                    // Session context provider is automatically set up by SessionContext.tsx
                    
                    // Show saved connections page after session creation
                    // Since we just created the session with the master key, we can proceed
                    setShowSavedConnections(true);
                  }
                }}
              />
            </LoginPanel>
          </div>
        </MantineProvider>
      );
    }
    
    // If we have session context but no userInfo, show saved connections
    return (
      <MantineProvider theme={mantineTheme} defaultColorScheme="light">
        <Notifications position="top-right" />
        <div className="app-header" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000, height: '50px' }}>
          <AppHeader
            userInfo={null}
            isMasterKeyValidated={!!getMasterKey()}
            onLogout={async () => {
              destroySession();
            }}
            onShowAbout={() => {}}
            onShowSavedConnections={() => {}}
            isOnSavedConnectionsPage={true}
            availableLanguages={availableLanguages}
            onLocaleChange={handleLocaleChange}
          />
        </div>
        <div style={{ marginTop: '50px', marginBottom: '40px' }}>
          {(() => {
            const masterKeyValue = getMasterKey();
            logger.debug('Rendering SavedConnectionsManagerWrapper', 'App', { 
              masterKeyValue,
              masterKeyType: typeof masterKeyValue,
              masterKeyLength: masterKeyValue?.length,
              isMasterKeyValidated: !!masterKeyValue
            });
            return null;
          })()}
          <SavedConnectionsManagerWrapper 
            key="saved-connections-manager"
            onLogin={async (userInfo, connectionUuid) => {
              // Handle login and proceed to main app
              await handleLogin(userInfo, connectionUuid);
            }} 
            isMasterKeyValidated={!!getMasterKey()}
            onRedirectToMasterKey={() => {
              logger.debug('Redirecting to master key page from saved connections', 'App');
              setShowSavedConnections(false);
            }}
          />
        </div>
      </MantineProvider>
    );
  }
  
  // If authenticated and not showing saved connections, show the main app
  return <MainApp 
    userInfo={userInfo}
    isConnected={isConnected}
    onLogin={handleLogin}
    setUserInfo={setUserInfo}
    setIsConnected={setIsConnected}
    availableLocales={availableLocales}
    setAvailableLocales={setAvailableLocales}
    availableLanguages={availableLanguages}
    setAvailableLanguages={setAvailableLanguages}
  />;
};

// Main app logic (moved from App function)
interface MainAppProps {
  userInfo: SalesforceUserInfo | null;
  isConnected: boolean;
  onLogin: (userInfo: SalesforceUserInfo, connectionUuid?: string) => Promise<void>;
  setUserInfo: (userInfo: SalesforceUserInfo | null) => void;
  setIsConnected: (connected: boolean) => void;
  availableLocales: Array<{code: string, name: string}>;
  setAvailableLocales: (locales: Array<{code: string, name: string}>) => void;
  availableLanguages: Array<{code: string, name: string, uuid: string}>;
  setAvailableLanguages: (languages: Array<{code: string, name: string, uuid: string}>) => void;
}

function MainApp({ userInfo, isConnected, onLogin, setUserInfo, setIsConnected, availableLocales, setAvailableLocales, availableLanguages, setAvailableLanguages }: MainAppProps) {
  logger.debug('App component rendered', 'App');
  const { destroySession, currentConnectionUuid, setCurrentConnectionUuid, getMasterKey } = useSessionContext();
  const [sobjectCount, setSObjectCount] = useState<number>(0);
  const [apiUsage, setApiUsage] = useState<ApiUsage | null>(null);
  const [reloadTrigger, setReloadTrigger] = useState<number>(0);
  const [isSchemaTabActive, setIsSchemaTabActive] = useState(false);
  const [isSavedQueryTabActive, setIsSavedQueryTabActive] = useState(false);
  const [resultsState, setResultsState] = useState<'collapsed' | 'middle' | 'expanded'>('collapsed');

  // Function to cycle through the three states
  const toggleResultsState = () => {
    setResultsState(prev => {
      switch (prev) {
        case 'collapsed': return 'middle';
        case 'middle': return 'expanded';
        case 'expanded': return 'collapsed';
        default: return 'middle';
      }
    });
  };

  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isReloadingSchema, setIsReloadingSchema] = useState(false); // Separate state for schema reloading
  const [maxRecordsWarning, setMaxRecordsWarning] = useState<string | null>(null);
  const [maxRecordsReached, setMaxRecordsReached] = useState<string | null>(null);
  const [treeWidth, setTreeWidth] = useState(300); // Default width
  const [isSchemaTreeCollapsed, setIsSchemaTreeCollapsed] = useState(false);
  const [querySectionHeight, setQuerySectionHeight] = useState(40); // Default 40% height
  const [isResizing, setIsResizing] = useState(false);
  const [isPanelResizing, setIsPanelResizing] = useState(false);
  const [currentQuery, setCurrentQuery] = useState(`SELECT Id, Name FROM Account LIMIT 10`);

  const [fieldData, setFieldData] = useState<{ [sobjectName: string]: string[] }>({});
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showSavedConnections, setShowSavedConnections] = useState(false);
  const [appInfo, setAppInfo] = useState<{
    version: string;
    buildDate: string;
    license: string;
    website: string;
    support: string;
    feedback: string;
    author: string;
    description: string;
  } | null>(null);
  const [logoutKey, setLogoutKey] = useState(0); // Force re-render of auth flow on logout
  // Session management is handled by SessionProvider
  const [missingSettingsDetected, setMissingSettingsDetected] = useState(false);
  const [settingsReloadAttempts, setSettingsReloadAttempts] = useState(0);
  const MAX_SETTINGS_RELOAD_ATTEMPTS = 2; // Limit reload attempts to prevent infinite loops
  
  // App config state
  const [appTitle, setAppTitle] = useState('DataPilot');
  const [appInitializing, setAppInitializing] = useState('Initializing...');
  
  // Backend health state
  const [backendHealth, setBackendHealth] = useState<{
    status: 'healthy' | 'unhealthy' | 'checking';
    lastCheck?: string;
  }>({ status: 'checking' });
  
  // Backend health check function
  const checkBackendHealth = async () => {
    try {
      setBackendHealth(prev => ({ ...prev, status: 'checking' }));
      const health = await apiService.checkBackendHealth();
      setBackendHealth({
        status: health.status,
        lastCheck: health.timestamp
      });
    } catch (error) {
      setBackendHealth({
        status: 'unhealthy',
        lastCheck: new Date().toISOString()
      });
    }
  };

  // Load application settings
  const loadApplicationSettings = async () => {
    logger.debug('Loading application settings', 'App');
    
    // Load max records limit
    const maxRecordsSetting = await apiService.getSetting('UI_MAX_RECORDS_LIMIT');
    MAX_RECORDS_LIMIT = maxRecordsSetting.value;
    
    // Load warning threshold
    const warningThresholdSetting = await apiService.getSetting('UI_MAX_RECORDS_WARNING_THRESHOLD');
    MAX_RECORDS_WARNING_THRESHOLD = warningThresholdSetting.value;
    
    logger.debug('Application settings loaded', 'App', {
      maxRecordsLimit: MAX_RECORDS_LIMIT,
      warningThreshold: MAX_RECORDS_WARNING_THRESHOLD
    });
  };
  

  
  const { tSync, setLocale, getCurrentLocale, getAvailableLocales, waitForReady } = useTranslation();
  
  // Handle locale change - both frontend and backend
  const handleLocaleChange = async (languageUuid: string) => {
    try {
      // Find the language object for the selected UUID
      const selectedLanguage = availableLanguages.find(lang => lang.uuid === languageUuid);
      if (!selectedLanguage) {
        logger.warn(`Language not found for UUID: ${languageUuid}`, 'App');
        return;
      }
      
      // Set frontend locale using the language code
      await setLocale(selectedLanguage.code);
      
      // Call backend to set as default language
      const { apiService } = await import('./services/ApiService');
      await apiService.setDefaultLanguage(languageUuid);
      logger.debug(`Set default language to ${selectedLanguage.code} (UUID: ${languageUuid})`, 'App');
    } catch (error) {
      logger.error('Failed to change locale:', error);
      // Still set the frontend locale even if backend call fails
      const selectedLanguage = availableLanguages.find(lang => lang.uuid === languageUuid);
      if (selectedLanguage) {
        await setLocale(selectedLanguage.code);
      }
    }
  };
  
  // Ref to prevent multiple simultaneous query executions
  const isExecutingRef = useRef(false);
  
  // Ref to prevent multiple simultaneous connection status checks
  const isCheckingConnectionRef = useRef(false);



  useEffect(() => {
    logger.debug('useEffect triggered - setting up connection error callback', 'App');
    
    // Set up connection error callback to redirect to main screen
    // Set up connection error callback to redirect to saved connections or master key page
    apiService.setConnectionErrorCallback(async () => {
      logger.debug('Connection error detected, checking master key before redirect', 'App');
      
      try {
        // Check if master key exists in backend AND is validated in current session
        const masterKeyExists = await apiService.isMasterKeyExists();
        const currentMasterKey = getMasterKey();
        const hasValidatedMasterKey = currentMasterKey && currentMasterKey.trim().length > 0;
        
        logger.debug('Master key check results', 'App', {
          masterKeyExists,
          hasValidatedMasterKey,
          currentMasterKey: currentMasterKey ? '***' : null
        });
        
        if (masterKeyExists && hasValidatedMasterKey) {
          // Master key exists in backend AND is validated in session, redirect to saved connections
          setShowSavedConnections(true);
          setUserInfo(null);
          setIsConnected(false);
          setCurrentConnectionUuid(null);
        } else {
          // No master key or not validated, redirect to master key page
          logger.debug('No master key or not validated, redirecting to master key page', 'App');
          setShowSavedConnections(false);
          setUserInfo(null);
          setIsConnected(false);
          setCurrentConnectionUuid(null);
          // The master key page will be shown automatically when there's no master key
        }
      } catch (error) {
        // If we can't check master key status, default to master key page for security
        logger.warn('Failed to check master key status, defaulting to master key page', 'App', error);
        setShowSavedConnections(false);
        setUserInfo(null);
        setIsConnected(false);
        setCurrentConnectionUuid(null);
      }
    });
  }, []);

  // Handle connection status check when MainApp mounts
  useEffect(() => {
    logger.debug('MainApp useEffect - connection status check', 'App', { 
      hasUserInfo: !!userInfo,
      hasConnectionUuid: !!currentConnectionUuid,
      isConnected
    });
    
    // If we have a connection UUID but no verified connection state, check connection status
    if (currentConnectionUuid && (!isConnected || !userInfo)) {
      logger.debug(' Connection flow detected but connection state incomplete, checking connection status', 'App');
      checkConnectionStatus();
    }
  }, [userInfo, currentConnectionUuid, isConnected]);

  // Check connection status when session is restored but connection state is missing
  useEffect(() => {
    if (currentConnectionUuid && !isConnected && !userInfo) {
      logger.debug(' Session restored with connection UUID but missing connection state, checking connection status', 'App');
      checkConnectionStatus();
    }
  }, [currentConnectionUuid, isConnected, userInfo]);

  // Detect missing app settings and trigger reload (with safeguards against infinite loops)
  useEffect(() => {
    const checkForMissingSettings = async () => {
      if (!missingSettingsDetected && settingsReloadAttempts < MAX_SETTINGS_RELOAD_ATTEMPTS) {
        // Test app settings that should exist
        const testSettings = [
          'APP_VERSION',
          'APP_BUILD_DATE',
          'APP_LICENSE',
          'APP_WEBSITE',
          'APP_SUPPORT',
          'APP_FEEDBACK',
          'APP_AUTHOR',
          'APP_DESCRIPTION'
        ];
        
        const missingSettings = [];
        for (const settingKey of testSettings) {
          const value = await appSettingsService.getSetting(settingKey);
          if (value === null) {
            missingSettings.push(settingKey);
          }
        }
        
        if (missingSettings.length > 0) {
          logger.warn(' Missing app settings detected, triggering reload', 'App', { 
            missingSettings, 
            attempt: settingsReloadAttempts + 1,
            maxAttempts: MAX_SETTINGS_RELOAD_ATTEMPTS 
          });
          
          setMissingSettingsDetected(true);
          setSettingsReloadAttempts(prev => prev + 1);
          
          // Force reload settings from database
          try {
            await appSettingsService.forceReloadSettings();
            logger.debug(' App settings reloaded successfully', 'App');
            
            // Reset detection flag after successful reload to allow checking again
            setTimeout(() => {
              setMissingSettingsDetected(false);
            }, 1000); // Wait 1 second before allowing another check
          } catch (error) {
            logger.error(' Failed to reload app settings', 'App', error);
          }
        } else {
          // All settings found, reset attempts counter
          setSettingsReloadAttempts(0);
        }
      } else if (settingsReloadAttempts >= MAX_SETTINGS_RELOAD_ATTEMPTS) {
        logger.error(' Maximum settings reload attempts reached, stopping to prevent infinite loop', 'App', {
          attempts: settingsReloadAttempts,
          maxAttempts: MAX_SETTINGS_RELOAD_ATTEMPTS
        });
      }
    };
    
    checkForMissingSettings();
  }, []); // Remove dependencies to prevent infinite loop

  // Load application settings on mount
  useEffect(() => {
    loadApplicationSettings();
  }, []);

  // Backend health monitoring
  useEffect(() => {
    // Initial health check
    checkBackendHealth();
    
    // Set up periodic health checks every 30 seconds
    const healthInterval = setInterval(checkBackendHealth, 30000);
    
    return () => {
      clearInterval(healthInterval);
    };
  }, []);







    const loadAppInfo = async () => {
      try {
        const info = await appSettingsService.getAppInfo();
        setAppInfo(info);
      } catch (error) {
        logger.error(' Failed to load app info:', error);
      }
    };



  const checkConnectionStatus = async () => {
    // Prevent multiple simultaneous connection status checks
    if (isCheckingConnectionRef.current) {
      logger.debug(' Connection status check already in progress, skipping...', 'App');
      return;
    }
    
    isCheckingConnectionRef.current = true;
    
    try {
      // Check if there's an active Salesforce connection
      logger.debug('Checking for active Salesforce connection...');
      
      const connectionStatus = await SalesforceService.isConnected(currentConnectionUuid);
      
      if (connectionStatus) {
        logger.debug('Active Salesforce connection detected');
        setIsConnected(true);
        
        // Use currentConnectionUuid from session context only
        if (currentConnectionUuid) {
          logger.debug('Found currentConnectionUuid in session context', 'App', { currentConnectionUuid });
        } else {
          logger.warn('No connection UUID found in session context despite being connected', 'App');
        }
        
        // Reset schema tab state to match the default tab (schema is now first)
        setIsSchemaTabActive(true);
        
        // Try to get user info if connected
        try {
          if (currentConnectionUuid) {
            const userInfo = await SalesforceService.getUserInfo(currentConnectionUuid);
            logger.debug('User info retrieved for active connection', 'App', { userInfo });
            setUserInfo(userInfo);
          } else {
            logger.warn('No connection UUID available to get user info', 'App');
          }
        } catch (error) {
          logger.warn('Could not retrieve user info for active connection:', error);
          // Don't clear userInfo immediately - the connection might still be valid
          // Only clear if we get a specific error indicating the connection is truly invalid
          if (error instanceof Error && error.message.includes('no_connection')) {
            await SalesforceService.logout();
            setIsConnected(false);
            setUserInfo(null);
          }
        }
      } else {
        logger.debug('No active Salesforce connection detected');
        setIsConnected(false);
        setUserInfo(null);
        // Only clear currentConnectionUuid if we had one before (don't clear during initial load)
        if (currentConnectionUuid) {
          logger.debug('Clearing currentConnectionUuid as no active connection found', 'App');
          setCurrentConnectionUuid(null);
        }
      }
      
      // Clear other state regardless of connection status
      setSObjectCount(0);
      setQueryResult(null);
      setApiUsage(null);
      
      // Clear connection UUID from session context if not connected and we had one before
      if (!connectionStatus && currentConnectionUuid) {
        setCurrentConnectionUuid(null);
        setLogoutKey(prev => prev + 1);
      }
      
      logger.debug('Connection status check completed');
    } catch (error) {
      logger.error('Failed to check connection status:', error);
      // Don't clear userInfo on generic errors - the connection might still be valid
      setIsConnected(false);
    } finally {
      isCheckingConnectionRef.current = false;
    }
  };



  // handleLogin is now passed as a prop from AppContent



  const handleLogout = async () => {
    try {
      await SalesforceService.logout();
      setSObjectCount(0); // Reset SObject count on logout
      setQueryResult(null);
      setApiUsage(null); // Reset API usage on logout
      
      // Clear master key from memory only (keep hash for validation)
      const connectionManager = ConnectionManager.getInstance();
      connectionManager.clearMasterKeyFromMemory();
      
      // Clear the session completely
      destroySession();
      
      // Session management handles logout automatically
      
      // Force re-render of authentication flow
      setLogoutKey(prev => prev + 1);
    } catch (error) {
      logger.error('Logout failed:', error);
    }
  };

  const handleShowSavedConnections = () => {
    logger.debug('handleShowSavedConnections called - before setState', 'App', {
      showSavedConnections
    });
    setShowSavedConnections(true);
    logger.debug('handleShowSavedConnections called - after setState (async)', 'App');
  };




  // Debug effect to track queryResult changes


  const handleCloseSavedConnections = () => {
    setShowSavedConnections(false);
  };

  const handleExecuteQuery = async () => {
    if (!currentQuery.trim()) {
      notificationService.warning({
        title: tSync('query.pleaseEnterQuery'),
        message: tSync('query.pleaseEnterQueryMessage', 'Please enter a SOQL query before executing.'),
        autoClose: 4000
      });
      return;
    }

    // Prevent multiple executions using ref
    if (isExecutingRef.current) {
      return;
    }


    isExecutingRef.current = true;
    setIsLoading(true);
    // Don't clear queryResult immediately - let the new result replace it

    try {
      const result = await SalesforceService.executeSoqlQuery(currentQuery, currentConnectionUuid);
      
      
      setQueryResult(result);
      setMaxRecordsWarning(null); // Clear any previous max records warning
      setMaxRecordsReached(null); // Clear any previous max records reached message
      // Auto-expand results when query is executed
      setResultsState('expanded');
    } catch (error) {
      logger.error('❌ [App] Query execution failed', 'App', {
        error: error instanceof Error ? error.message : String(error),
        errorType: typeof error,
        errorString: String(error)
      });
      
      // Extract proper error message
      let errorMessage = tSync('query.executionFailed');
      
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error && typeof error === 'object') {
        // Handle case where error is an object
        if (error.message) {
          errorMessage = error.message;
        } else if (error.detail) {
          errorMessage = error.detail;
        } else {
          errorMessage = JSON.stringify(error);
        }
      } else {
        errorMessage = String(error);
      }
      
      // Show error notification instead of modal
      notificationService.error({
        title: tSync('query.executionFailed'),
        message: errorMessage,
        autoClose: 8000 // Longer auto-close for error messages
      });
    } finally {
      setIsLoading(false);
      isExecutingRef.current = false;
    }
  };

  const handleExecuteQueryAll = async () => {
    if (!currentQuery.trim()) {
      notificationService.warning({
        title: tSync('query.pleaseEnterQuery'),
        message: tSync('query.pleaseEnterQueryMessage', 'Please enter a SOQL query before executing.'),
        autoClose: 4000
      });
      return;
    }

    // Prevent multiple executions using ref
    if (isExecutingRef.current) {
      return;
    }


    isExecutingRef.current = true;
    setIsLoading(true);
    // Don't clear queryResult immediately - let the new result replace it

    try {
      // Log the query being executed

      // For now, execute the same query - in the future this could be modified to remove LIMIT
      const result = await SalesforceService.executeSoqlQuery(currentQuery, currentConnectionUuid);
      
      
      setQueryResult(result);
      setMaxRecordsWarning(null); // Clear any previous max records warning
      setMaxRecordsReached(null); // Clear any previous max records reached message
      // Auto-expand results when query is executed
      setResultsState('expanded');
    } catch (error) {
      logger.error('❌ [App] Query All execution failed', 'App', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      const errorMessage = error instanceof Error ? error.message : tSync('query.executionFailed');
      notificationService.error({
        title: tSync('query.executionFailed'),
        message: errorMessage,
        autoClose: 8000
      });
    } finally {
      setIsLoading(false);
      isExecutingRef.current = false;
    }
  };

  const handleQueryMore = async () => {
    if (!queryResult || !queryResult.metadata?.nextRecordsUrl) {
      return;
    }

    // Check if we've reached the maximum records limit
    const currentRecordCount = queryResult.records?.length || 0;
    if (currentRecordCount >= MAX_RECORDS_LIMIT) {
      setMaxRecordsWarning(tSync('query.maxRecordsReached', { maxRecords: MAX_RECORDS_LIMIT }) || `Cannot load more than ${MAX_RECORDS_LIMIT} records. Please refine your query to get more specific results.`);
      return;
    }

    // Prevent multiple executions using ref
    if (isExecutingRef.current) {
      return;
    }

    isExecutingRef.current = true;
    setIsLoading(true);
    setMaxRecordsWarning(null); // Clear any previous warning
    setMaxRecordsReached(null); // Clear any previous max records reached message
    try {
      const moreResults = await SalesforceService.queryMore(queryResult.metadata.nextRecordsUrl, currentConnectionUuid);
      
      // Calculate new record count after merging
      const newRecordCount = currentRecordCount + (moreResults.records?.length || 0);
      
      // Check if adding more records would exceed the limit
      if (newRecordCount > MAX_RECORDS_LIMIT) {
        setMaxRecordsWarning(tSync('query.maxRecordsReached', { maxRecords: MAX_RECORDS_LIMIT }) || `Cannot load more than ${MAX_RECORDS_LIMIT} records. Please refine your query to get more specific results.`);
        return;
      }
      
      // Merge the new results with existing results
        const newQueryResult = {
          metadata: {
            total_size: moreResults.metadata?.total_size || queryResult.metadata.total_size,
            done: moreResults.metadata?.done || true,
            nextRecordsUrl: moreResults.metadata?.nextRecordsUrl
          },
          records: [...(queryResult.records || []), ...(moreResults.records || [])]
        };
        
        setQueryResult(newQueryResult);
      
      // Check if we're approaching the limit and show warning
      if (newRecordCount >= MAX_RECORDS_WARNING_THRESHOLD && newRecordCount < MAX_RECORDS_LIMIT) {
        setMaxRecordsWarning(tSync('query.approachingMaxRecords', { current: newRecordCount, max: MAX_RECORDS_LIMIT }) || `Approaching maximum records limit (${newRecordCount}/${MAX_RECORDS_LIMIT}). Consider refining your query for better performance.`);
        setMaxRecordsReached(null); // Clear max reached message
      } else if (newRecordCount >= MAX_RECORDS_LIMIT) {
        // User has reached the maximum configured result set
        setMaxRecordsReached(tSync('query.maxRecordsReachedMessage', { maxRecords: MAX_RECORDS_LIMIT }) || `This is the maximum configured result set (${MAX_RECORDS_LIMIT} records) that can be returned.`);
        setMaxRecordsWarning(null); // Clear warning message
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : tSync('query.loadMoreFailed');
      notificationService.error({
        title: tSync('query.loadMoreFailed'),
        message: errorMessage,
        autoClose: 6000
      });
    } finally {
      setIsLoading(false);
      isExecutingRef.current = false;
    }
  };

  const handleToggleSchemaTree = () => {
    setIsSchemaTreeCollapsed(prev => !prev);
  };

  const handleReloadSchema = async () => {
    try {
      setIsReloadingSchema(true);
      
      // Clear the SObject count to trigger a reload
      setSObjectCount(0);
      
      // Trigger the SchemaTree component to reload with progress
      setReloadTrigger(prev => prev + 1);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : tSync('app.failedToReloadSchema', 'Failed to reload schema');
      notificationService.error({
        title: tSync('app.failedToReloadSchema', 'Schema Reload Failed'),
        message: errorMessage,
        autoClose: 6000
      });
      logger.error('Schema reload failed', 'App', error as Error);
    } finally {
      setIsReloadingSchema(false);
    }
  };

  const handleRecordUpdate = async (recordId: string, fieldName: string, newValue: any, record?: any) => {
    try {
      // Extract SObject name from record attributes if available
      const sobjectName = record?.attributes?.type;
      
      // Call Salesforce to update the record
      await SalesforceService.updateRecord(recordId, { [fieldName]: newValue }, sobjectName);
      
      // Update local results to reflect the change
      if (queryResult && queryResult.records) {
        const updatedRecords = queryResult.records.map(record => 
          record.Id === recordId 
            ? { ...record, [fieldName]: newValue }
            : record
        );
        setQueryResult({ ...queryResult, records: updatedRecords });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : tSync('query.recordUpdateFailed');
      notificationService.error({
        title: tSync('query.recordUpdateFailed'),
        message: errorMessage,
        autoClose: 6000
      });
      throw error; // Re-throw to let the ResultsView handle the error
    }
  };

  const handleQueryChange = useCallback((newQuery: string) => {
    setCurrentQuery(newQuery);
    // Reset results to collapsed when query changes
    setResultsState('collapsed');
  }, []);

  const handleSObjectCountChange = useCallback((count: number) => {
    setSObjectCount(count);
  }, []);

  const handleFieldClick = useCallback((fieldName: string, sobjectName: string) => {
    // Parse the current query to find the FROM clause
    const query = currentQuery.trim();
    const fromIndex = query.toUpperCase().indexOf(' FROM ');
    
    if (fromIndex === -1) {
      // No FROM clause found, create a new query
      const newQuery = `SELECT ${fieldName} FROM ${sobjectName} LIMIT 10`;
      setCurrentQuery(newQuery);
      return;
    }
    
    // Extract the SELECT part and FROM part
    const selectPart = query.substring(0, fromIndex).trim();
    const fromPart = query.substring(fromIndex).trim();
    
    // Check if the FROM clause already has the correct SObject
    const fromClause = fromPart.toUpperCase();
    if (!fromClause.includes(` FROM ${sobjectName.toUpperCase()}`)) {
      // Different SObject, replace the entire query
      const newQuery = `SELECT ${fieldName} FROM ${sobjectName} LIMIT 10`;
      setCurrentQuery(newQuery);
      return;
    }
    
    // Same SObject, add field to SELECT clause
    let newSelectPart: string;
    
    if (selectPart.toUpperCase().startsWith('SELECT ')) {
      // Remove 'SELECT ' prefix
      const fieldsPart = selectPart.substring(7).trim();
      
      if (fieldsPart === '*') {
        // If SELECT *, replace with the new field
        newSelectPart = `SELECT ${fieldName}`;
      } else {
        // Add field to existing list
        newSelectPart = `SELECT ${fieldsPart}, ${fieldName}`;
      }
    } else {
      // No SELECT clause, create one
      newSelectPart = `SELECT ${fieldName}`;
    }
    
    const newQuery = `${newSelectPart} ${fromPart}`;
    setCurrentQuery(newQuery);
  }, [currentQuery]);

  const handleFieldDataUpdate = useCallback((newFieldData: { [sobjectName: string]: string[] }) => {
    setFieldData(newFieldData);
  }, []);

  const handleSchemaTabChange = useCallback((isActive: boolean) => {
    setIsSchemaTabActive(isActive);
  }, []);

  const handleSavedQueryTabChange = useCallback((isActive: boolean) => {
    setIsSavedQueryTabActive(isActive);
  }, []);










  // Resize handlers
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  const handlePanelResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsPanelResizing(true);
  };

  const handleResizeMove = (e: MouseEvent) => {
    if (isResizing) {
      const newWidth = e.clientX;
      const minWidth = 200;
      const maxWidth = window.innerWidth * 0.8;
      
      if (newWidth >= minWidth && newWidth <= maxWidth) {
        setTreeWidth(newWidth);
      }
    }
    
    if (isPanelResizing) {
      const containerHeight = window.innerHeight - 120; // Account for header and status bar
      const newHeight = (e.clientY / containerHeight) * 100;
      const minHeight = 20; // Minimum 20% height
      const maxHeight = 90; // Maximum 90% height
      
      if (newHeight >= minHeight && newHeight <= maxHeight) {
        setQuerySectionHeight(newHeight);
      }
    }
  };

  const handleResizeEnd = () => {
    setIsResizing(false);
    setIsPanelResizing(false);
  };

  useEffect(() => {
    if (isResizing || isPanelResizing) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
      
      return () => {
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [isResizing, isPanelResizing]);




  // Add debug logging right at the start of main render
  logger.debug('MAIN RENDER - Current state', 'App', {
    showSavedConnections,
    isConnected,
    isLoading
  });

  return (
    <MantineProvider theme={mantineTheme} defaultColorScheme="light">
      <ContextMenuProvider>
        <ModalsProvider>
          <Notifications 
            position="top-right" 
            zIndex={9999}
          />
        


        {/* About Modal - available globally */}
        {showAboutModal && (
          <div className="about-modal-overlay" onClick={() => setShowAboutModal(false)}>
            <div className="about-modal" onClick={(e) => e.stopPropagation()}>
              <div className="about-modal-header">
                <div className="about-modal-title">
                  <IconInfoCircle size={20} />
                  <span>{tSync('settings.about','About')}</span>
                </div>
                <button 
                  className="about-modal-close"
                  onClick={() => setShowAboutModal(false)}
                >
                  <IconX size={20} />
                </button>
              </div>
              
              <div className="about-content">
                <div className="about-header">
                  <div className="about-logo">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <polygon
                        points="4.69 7.7 9.38 4.99 9.38 2.27 2.25 6.38 2.64 6.86 4.26 7.74 4.69 7.7"
                        fill="#4285f4"
                      />
                      <path
                        d="M9.38,17.36,2.25,13.25V10.66l7.13,4.12Zm0,1.77L2.25,15v2.6l7.13,4.12Zm0-8.71L4.69,7.7,2.25,6.38v2.5L9.38,13"
                        fill="#aecbfa"
                        fillRule="evenodd"
                      />
                      <path
                        d="M9.38,21.73l7-4V15.1l-7,4m0-4.35,7-4h2.08v2.33H16.78l-7.4,4.29Zm0-1.77L16.79,8.7h2.44v1.36l2.51-2.51-2.51-2.5V6.37H16.36l-1.23.72-1.06.61L11.35,9.27l-2,1.15Z"
                        fill="#669df6"
                        fillRule="evenodd"
                      />
                      <polygon
                        points="9.38 4.99 12.54 6.82 14.9 5.46 9.38 2.27 9.38 4.99"
                        fill="#669df6"
                        fillRule="evenodd"
                      />
                    </svg>
                  </div>
                  <div className="about-brand">
                    <h2 className="about-title">Data Pilot</h2>
                    <p className="about-subtitle">{tSync('app.subtitle', 'Your AI pilot for Salesforce data navigation')}</p>
                  </div>
                </div>
                
                <div className="about-info">
                  <div className="about-version">
                    <strong>{tSync('settings.about.version','Version')}: {appInfo?.version || '1.0.0'}</strong>
                  </div>
                  <div className="about-build">
                    {tSync('settings.about.buildDate','Build Date')}: {appInfo?.buildDate || new Date().toLocaleDateString()}
                  </div>
                  <div className="about-license">
                    {tSync('settings.about.license','License')}: {appInfo?.license || 'MIT License'}
                  </div>
                </div>
                
                <div className="about-description">
                  <p>{appInfo?.description || tSync('app.description', 'Advanced SOQL query editor with AI-powered intelligence, schema exploration, result analysis, and smart data navigation')}</p>
                </div>
                
                <div className="about-links">
                  <button 
                    className="about-link"
                    onClick={() => window.open(appInfo?.website || 'https://www.linkedin.com/in/bassem-elsodany', '_blank')}
                  >
                    <IconWorld size={16} />
                    {tSync('settings.about.website','Website')}
                  </button>
                  <button 
                    className="about-link"
                    onClick={() => window.open(appInfo?.support || 'https://www.linkedin.com/in/bassem-elsodany', '_blank')}
                  >
                    <IconHelp size={16} />
                    {tSync('settings.about.support','Support')}
                  </button>
                  <button 
                    className="about-link"
                    onClick={() => window.open(appInfo?.feedback || 'https://github.com/bassem-elsodany', '_blank')}
                  >
                    <IconMessage size={16} />
                    {tSync('settings.about.feedback','Feedback')}
                  </button>
                </div>
                
                <div className="about-footer">
                  <button 
                    className="about-close-button"
                    onClick={() => setShowAboutModal(false)}
                  >
                    {tSync('common.close','Close')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Authentication is now handled by SessionProvider */}



        {/* Saved Connections Manager - With Header */}
        {showSavedConnections && (
          <div>
            <div className="app-header" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000, height: '50px' }}>
              <AppHeader
                userInfo={userInfo}
                isMasterKeyValidated={!!getMasterKey()}
                availableLanguages={availableLanguages}
                onLogout={handleLogout}
                onLocaleChange={handleLocaleChange}
                onShowAbout={async () => {
                  await loadAppInfo();
                  setShowAboutModal(true);
                }}
                onShowSavedConnections={handleShowSavedConnections}
                isOnSavedConnectionsPage={showSavedConnections}
              />
            </div>
            <div style={{ marginTop: '50px', marginBottom: '40px' }}>
              <SavedConnectionsManagerWrapper 
                key="saved-connections-manager"
                onLogin={async (userInfo, connectionUuid) => {
                  // Handle login and proceed to main app
                  await onLogin(userInfo, connectionUuid);
                  // Close the saved connections page and return to main app
                  setShowSavedConnections(false);
                }} 
                isMasterKeyValidated={!!getMasterKey()}
                onRedirectToMasterKey={() => {
                  logger.debug('Redirecting to master key page from saved connections', 'App');
                  // Destroy the current session to force master key re-validation
                  destroySession();
                  setShowSavedConnections(false);
                }}
              />
            </div>
            <StatusBar 
              statusText={tSync('connections.title', 'Saved Connections')}
              userInfo={userInfo}
              connectionUuid={null}
              sobjectCount={undefined}
              apiUsage={null}
              onReload={undefined}
              isReloading={false}
              backendHealth={backendHealth}
            />
          </div>
        )}

        {/* Main App - With AppShell and Header */}
        
        {!showSavedConnections && (
          <AppShell
            header={{ height: 50 }}
            padding={0}
            bg="gray.0"
          >
            <AppShell.Header className="app-header">
              <AppHeader
                userInfo={userInfo}
                isMasterKeyValidated={!!getMasterKey()}
                availableLanguages={availableLanguages}
                onLogout={handleLogout}
                onLocaleChange={handleLocaleChange}
                onShowAbout={async () => {
                  await loadAppInfo();
                  setShowAboutModal(true);
                }}
                onShowSavedConnections={handleShowSavedConnections}
                isOnSavedConnectionsPage={showSavedConnections}
              />
            </AppShell.Header>

            <AppShell.Main style={{ padding: 0 }}>

              <div className="main-content">
                <div className={`sidebar ${isSchemaTreeCollapsed ? 'collapsed' : ''}`} style={{ width: isSchemaTreeCollapsed ? '40px' : `${treeWidth}px` }}>
                  {isSchemaTreeCollapsed ? (
                    <div className="sidebar-collapsed">
                      <ActionIcon
                        size="sm"
                        variant="light"
                        color="blue"
                        onClick={handleToggleSchemaTree}
                        title={tSync('app.expandSchemaTree', 'Expand SObjects Tree')}
                        style={{
                          backgroundColor: '#3b82f6',
                          color: 'white',
                          boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)'
                        }}
                      >
                        <IconChevronRight size={16} />
                      </ActionIcon>
                      <Text size="xs" c="dimmed">
                      {tSync('app.sobjectsTree', 'SObjects Tree')}
                      </Text>
                    </div>
                  ) : (
                    <>
                      <div className="sidebar-header">
                        <Text size="sm" fw={600} c="dimmed">
                        {tSync('app.sobjectsTree', 'SObjects Tree')}
                        </Text>
                        <ActionIcon
                          size="sm"
                          variant="light"
                          color="blue"
                          onClick={handleToggleSchemaTree}
                          title={tSync('app.collapseSchemaTree', 'Collapse SObjects Tree')}
                          style={{
                            backgroundColor: '#3b82f6',
                            color: 'white',
                            boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)'
                          }}
                        >
                          <IconChevronLeft size={16} />
                        </ActionIcon>
                      </div>
                      <SchemaTreeWrapper 
                        isConnected={isConnected} 
                        onSObjectCountChange={handleSObjectCountChange}
                        onFieldClick={handleFieldClick}
                        onFieldDataUpdate={handleFieldDataUpdate}
                        reloadTrigger={reloadTrigger}
                      />
                      <div 
                        className="resize-handle"
                        onMouseDown={handleResizeStart}
                        style={{ cursor: 'col-resize' }}
                      >
                        <div className="resize-indicator"></div>
                      </div>
                    </>
                  )}
                </div>
                
                <div className="content-area">
                  <div className="main-panel">
                    <div className="query-section" style={{ 
                      height: (isSchemaTabActive || isSavedQueryTabActive) ? '100%' : '100%'
                    }}>
                      <QueryEditorPageWrapper 
                        onExecuteQuery={handleExecuteQuery}
                        onQueryChange={handleQueryChange}
                        initialQuery={currentQuery}
                        isQuerying={isLoading}
                        currentConnectionUuid={currentConnectionUuid}
                        fieldData={fieldData}
                        onSchemaTabChange={handleSchemaTabChange}
                        onSavedQueryTabChange={handleSavedQueryTabChange}
                        queryResult={queryResult}
                              onRecordUpdate={handleRecordUpdate}
                              onQueryMore={handleQueryMore}
                        maxRecordsWarning={maxRecordsWarning}
                        maxRecordsReached={maxRecordsReached}
                        maxRecordsLimit={MAX_RECORDS_LIMIT || 2000}
                            />
                    </div>
                  </div>
                </div>

                <StatusBar 
                  statusText=""
                  userInfo={userInfo}
                  connectionUuid={currentConnectionUuid}
                  sobjectCount={sobjectCount}
                  apiUsage={apiUsage}
                  onReload={handleReloadSchema}
                  isReloading={isReloadingSchema}
                  backendHealth={backendHealth}
                />
              </div>
            </AppShell.Main>
          </AppShell>
        )}

        </ModalsProvider>
      </ContextMenuProvider>
    </MantineProvider>
  );
}

// Loading screen component that doesn't depend on session context
const LoadingScreenComponent: React.FC<{
  onInitializationComplete: () => void;
}> = ({ onInitializationComplete }) => {
  useEffect(() => {
        onInitializationComplete();
  }, [onInitializationComplete]);

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    }}>
      <div style={{ textAlign: 'center', color: 'white' }}>
        <h1>DataPilot</h1>
        <p>Loading...</p>
            </div>
            </div>
  );
};


// Main App Component
function App() {
  return (
    <SessionProvider>
      <AppContent />
    </SessionProvider>
  );
}

export default App;
