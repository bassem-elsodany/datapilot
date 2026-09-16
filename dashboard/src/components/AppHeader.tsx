import React, { useState, useEffect } from 'react';
import { Group, Badge, Modal, Button, Stack, Text } from '@mantine/core';
import { IconLogout, IconLanguage, IconInfoCircle, IconMenu2, IconX, IconUser, IconWorld, IconHelp, IconMessage, IconDatabase, IconSettings } from '@tabler/icons-react';
import { SalesforceUserInfo } from '../services/SalesforceService';
import { useTranslation } from '../services/I18nService';
import { logger } from '../services/Logger';
import '../assets/css/components/AppHeader.css';

interface AppHeaderProps {
  userInfo: SalesforceUserInfo | null;
  isMasterKeyValidated: boolean;
  availableLanguages: Array<{code: string, name: string, uuid: string}>;
  onLogout: () => Promise<void>;
  onLocaleChange: (languageUuid: string) => void;
  onShowAbout: () => void;
  onShowSavedConnections: () => void;
  isOnSavedConnectionsPage?: boolean;
  isConnected?: boolean;
  currentConnectionUuid?: string | null;
  onDisconnect?: () => Promise<void>;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  userInfo,
  isMasterKeyValidated,
  availableLanguages,
  onLogout,
  onLocaleChange,
  onShowAbout,
  onShowSavedConnections,
  isOnSavedConnectionsPage = false,
  isConnected = false,
  currentConnectionUuid = null,
  onDisconnect
}) => {
  const { tSync, getCurrentLocale } = useTranslation();
  
  // Get current language UUID based on current locale
  const getCurrentLanguageUuid = () => {
    const currentLocale = getCurrentLocale();
    const currentLanguage = availableLanguages.find(lang => lang.code === currentLocale);
    return currentLanguage?.uuid || '';
  };
  

  

  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);


  // Close settings menu when clicking outside or resizing window
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (showSettingsMenu && !target.closest('.settings-menu-container')) {
        setShowSettingsMenu(false);
      }
    };

    const handleWindowResize = () => {
      if (showSettingsMenu) {
        // Recalculate menu position on resize
        const settingsButton = document.querySelector('.settings-menu-button') as HTMLElement;
        if (settingsButton) {
          const rect = settingsButton.getBoundingClientRect();
          const viewportWidth = window.innerWidth;
          const menuWidth = Math.min(280, viewportWidth - 40);
          
          let newStyle: React.CSSProperties = {
            width: `${menuWidth}px`,
            maxWidth: `calc(100vw - 40px)`,
            right: '0',
            left: 'auto'
          };
          
          setMenuStyle(newStyle);
        }
      }
    };

    if (showSettingsMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('resize', handleWindowResize);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [showSettingsMenu]);

  const handleSettingsMenuToggle = () => {
    const newShowMenu = !showSettingsMenu;
    setShowSettingsMenu(newShowMenu);
    
    if (newShowMenu) {
      // Calculate responsive menu position
      setTimeout(() => {
        const settingsButton = document.querySelector('.settings-menu-button') as HTMLElement;
        if (settingsButton) {
          const rect = settingsButton.getBoundingClientRect();
          const viewportWidth = window.innerWidth;
          const menuWidth = Math.min(280, viewportWidth - 40);
          
          let newStyle: React.CSSProperties = {
            width: `${menuWidth}px`,
            maxWidth: `calc(100vw - 40px)`,
            right: '0',
            left: 'auto'
          };
          
          setMenuStyle(newStyle);
        }
      }, 0);
    }
  };

  const handleLogout = async () => {
    await onLogout();
    setShowSettingsMenu(false);
  };

  const handleAboutClick = async () => {
    onShowAbout();
    setShowSettingsMenu(false);
  };

  const handleSavedConnectionsClick = () => {
    // Close settings menu first
    console.log('[handleSavedConnectionsClick] START - showDisconnectModal:', showDisconnectModal);
    setShowSettingsMenu(false);

    // If currently connected, show confirmation dialog
    console.log('[handleSavedConnectionsClick] isConnected:', isConnected, 'currentConnectionUuid:', currentConnectionUuid);
    if (isConnected && currentConnectionUuid) {
      console.log('[handleSavedConnectionsClick] SETTING showDisconnectModal TO TRUE');
      setShowDisconnectModal(true);
    } else {
      console.log('[handleSavedConnectionsClick] No connection, navigating directly');
      onShowSavedConnections();
    }
  };

  const handleConfirmDisconnect = async () => {
    try {
      setShowDisconnectModal(false);
      if (onDisconnect) {
        await onDisconnect();
      }
      onShowSavedConnections();
    } catch (error) {
      logger.error('Failed to disconnect', 'AppHeader', null, error as Error);
      setShowDisconnectModal(false);
    }
  };

  const handleCancelDisconnect = () => {
    setShowDisconnectModal(false);
  };

  return (
    <div className="app-header">
      <div className="header-content">
        <div className="header-brand">
          <div className="brand-logo">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
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
          <div className="brand-text">
            <div className="brand-title-row">
              <h1 className="app-title">Data Pilot</h1>
              <Badge 
                size="xs" 
                variant="light" 
                color="blue" 
                className="version-badge"
              >
                {tSync('app.version')}
              </Badge>
            </div>
            <div className="brand-subtitle-row">
              <p className="app-subtitle">{tSync('app.subtitle', 'Professional Salesforce Query Tool')}</p>
            </div>
          </div>
        </div>
        
        <div className="header-actions">
          <div className="status-center">
            <Group gap="xs">
              {/* User Info - Show when logged in */}
              {userInfo ? (
                <Badge 
                  color="gray" 
                  variant="light" 
                  size="xs" 
                  leftSection={<IconUser size={10} />}
                >
                  {userInfo.user_name || 'N/A'}
                </Badge>
              ) : (
                <Badge 
                  color="red" 
                  variant="light" 
                  size="xs" 
                  leftSection={<IconUser size={10} />}
                >
                  {tSync('common.notConnected', 'Not Connected')}
                </Badge>
              )}
            </Group>
          </div>
          
          {/* Settings Menu Button */}
          <div className="settings-menu-container">
            <button
              className="menu-button"
              onClick={handleSettingsMenuToggle}
            >
              <IconMenu2 className="menu-icon" size={16} />
            </button>
            
            {showSettingsMenu && (
              <div className="settings-menu" style={menuStyle}>
                <div className="settings-menu-header">
                  <h3>{tSync('settings.title', 'Settings')}</h3>
                </div>
                
                <div className="settings-menu-section">
                  <div className="settings-menu-item">
                    <IconLanguage className="menu-item-icon" />
                    <span>{tSync('settings.language', 'Language')}</span>
                    <select 
                      className="language-select"
                      value={getCurrentLanguageUuid()}
                      onChange={(e) => {
                        onLocaleChange(e.target.value);
                        setShowSettingsMenu(false);
                      }}
                      disabled={availableLanguages.length === 0}
                    >
                      {availableLanguages.length === 0 ? (
                        <option value="">{tSync('common.loading', 'Loading...')}</option>
                      ) : (
                        availableLanguages.map(language => (
                          <option key={language.uuid} value={language.uuid}>
                            {language.name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>


                  {/* Saved Connections option - show when connected but not on saved connections page */}
                  {isMasterKeyValidated && !isOnSavedConnectionsPage && (
                    <div className="settings-menu-item">
                      <IconDatabase className="menu-item-icon" />
                      <span>{tSync('settings.savedConnections', 'Saved Connections')}</span>
                      <button 
                        className="saved-connections-button"
                        onClick={handleSavedConnectionsClick}
                      >
                        {tSync('settings.manage', 'Manage')}
                      </button>
                    </div>
                  )}

                  {/* Logout option - show when master key is validated */}
                  {isMasterKeyValidated && (
                    <div className="settings-menu-item">
                      <IconLogout className="menu-item-icon" />
                      <span>{tSync('settings.logout', 'Logout')}</span>
                      <button 
                        className="logout-button"
                        onClick={handleLogout}
                      >
                        {tSync('settings.logout', 'Logout')}
                      </button>
                    </div>
                  )}
                </div>
                <div className="settings-menu-item">
                    <IconInfoCircle className="menu-item-icon" />
                    <span>{tSync('settings.about', 'About')}</span>
                    <button 
                      className="about-button"
                      onClick={handleAboutClick}
                    >
                      {tSync('settings.info', 'Info')}
                    </button>
                  </div>
                <div className="settings-menu-footer">
                  <button 
                    className="settings-menu-close"
                    onClick={() => setShowSettingsMenu(false)}
                  >
                    {tSync('common.close', 'Close')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Disconnect Confirmation Modal - Custom Overlay */}
      {showDisconnectModal && (
        <>
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'auto'
            }}
            onClick={handleCancelDisconnect}
          >
            <div
              style={{
                backgroundColor: 'white',
                borderRadius: '8px',
                padding: '24px',
                maxWidth: '500px',
                width: '90%',
                margin: 'auto',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                zIndex: 10000,
                position: 'relative'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 style={{ marginTop: 0, marginBottom: '16px', fontSize: '18px', fontWeight: 600 }}>
                {tSync('connections.disconnect.title', 'Close Connection')}
              </h2>
              <p style={{ marginBottom: '24px', color: '#666', lineHeight: 1.5 }}>
                {tSync(
                  'connections.disconnect.message',
                  'The current Salesforce connection will be closed. This will clear all decrypted credentials from memory. Do you want to continue?'
                )}
              </p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  onClick={handleCancelDisconnect}
                  style={{
                    padding: '8px 16px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    backgroundColor: '#fff',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  {tSync('connections.disconnect.cancel', 'Cancel')}
                </button>
                <button
                  onClick={handleConfirmDisconnect}
                  style={{
                    padding: '8px 16px',
                    border: 'none',
                    borderRadius: '4px',
                    backgroundColor: '#dc2626',
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  {tSync('connections.disconnect.confirm', 'Yes, Close Connection')}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
