import React, { useState, useEffect } from 'react';
import { IconShield, IconLock, IconEye, IconEyeOff, IconRotate, IconInfoCircle } from '@tabler/icons-react';
import { useTranslation } from '../services/I18nService';
import { ConnectionManager } from '../services/ConnectionManager';
import { logger } from '../services/Logger';
import '../assets/css/components/MasterKeyManager.css';

interface MasterKeyManagerProps {
  onMasterKeyValidated?: () => void;
}

const MasterKeyManager: React.FC<MasterKeyManagerProps> = ({ onMasterKeyValidated }) => {
  const [masterKey, setMasterKey] = useState('');
  const [isMasterKeySet, setIsMasterKeySet] = useState<boolean | null>(null);
  const [showInitialSetup, setShowInitialSetup] = useState(false);
  const [showMasterKeyPrompt, setShowMasterKeyPrompt] = useState(false);
  const [isResetScenario, setIsResetScenario] = useState(false);
  const [showResetOption, setShowResetOption] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [translationsReady, setTranslationsReady] = useState(false);
  const [missingTranslationsDetected, setMissingTranslationsDetected] = useState(false);
  const [translationReloadAttempts, setTranslationReloadAttempts] = useState(0);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const MAX_TRANSLATION_RELOAD_ATTEMPTS = 2; // Limit reload attempts to prevent infinite loops
  const MAX_FAILED_ATTEMPTS = 3; // Maximum failed attempts before allowing reset
  const { tSync, isReady, waitForReady, forceReloadTranslations } = useTranslation();

  useEffect(() => {
    const initializeComponent = async () => {
      try {
        await waitForReady(3000);
        logger.debug('MasterKeyManager: Translations ready');
        setTranslationsReady(true);
        
        const connectionManager = ConnectionManager.getInstance();
        const masterKeyInMemory = connectionManager.isMasterKeySet();
        const masterKeyHashExists = await connectionManager.isMasterKeyHashExists();
        
        // Load failed attempts from localStorage
        const storedFailedAttempts = localStorage.getItem('masterKey_failedAttempts');
        const currentFailedAttempts = storedFailedAttempts ? parseInt(storedFailedAttempts, 10) : 0;
        setFailedAttempts(currentFailedAttempts);
        
        setIsMasterKeySet(masterKeyInMemory);
        
        if (masterKeyInMemory) {
          // Master key is already in memory - this shouldn't happen after logout
          // Reset failed attempts since we have a valid master key
          setFailedAttempts(0);
          localStorage.removeItem('masterKey_failedAttempts');
          logger.debug('MasterKeyManager: Master key in memory, showing prompt', 'MasterKeyManager');
          setShowMasterKeyPrompt(true);
          setShowResetOption(false); // Don't show reset option when master key is in memory
        } else if (masterKeyHashExists) {
          // Master key hash exists but not in memory (after reload/logout)
          logger.debug('MasterKeyManager: Master key hash exists, showing prompt', 'MasterKeyManager');
          setShowMasterKeyPrompt(true);
          // Only show reset option if we've reached max failed attempts
          setShowResetOption(currentFailedAttempts >= MAX_FAILED_ATTEMPTS);
        } else {
          // No master key hash exists (first time setup)
          logger.debug('MasterKeyManager: No master key hash, showing initial setup', 'MasterKeyManager');
          setShowInitialSetup(true);
        }
      } catch (error) {
        logger.error('Failed to initialize MasterKeyManager:', error);
        setTranslationsReady(true);
        setShowInitialSetup(true);
      }
    };

    if (!translationsReady) {
      logger.debug('MasterKeyManager: Translations not ready, initializing...', 'MasterKeyManager');
      initializeComponent();
    } else {
      logger.debug('MasterKeyManager: Translations already ready, skipping initialization', 'MasterKeyManager');
    }
  }, [translationsReady, waitForReady]);

  // Detect missing translations and trigger reload (with safeguards against infinite loops)
  useEffect(() => {
    const checkForMissingTranslations = async () => {
      if (translationsReady && !missingTranslationsDetected && translationReloadAttempts < MAX_TRANSLATION_RELOAD_ATTEMPTS) {
        // Test key translations that should exist
        const testKeys = [
          'masterKey.prompt.title',
          'masterKey.prompt.subtitle', 
          'masterKey.prompt.placeholder',
          'masterKey.prompt.button',
          'masterKey.reset.button'
        ];
        
        const missingKeys = testKeys.filter(key => {
          const translation = tSync(key) || key;
          return translation === key; // If translation equals key, it means it wasn't found
        });
        
        if (missingKeys.length > 0) {
          logger.warn('Missing translations detected, triggering reload', 'MasterKeyManager', { 
            missingKeys,
            attempt: translationReloadAttempts + 1,
            maxAttempts: MAX_TRANSLATION_RELOAD_ATTEMPTS
          });
          
          setMissingTranslationsDetected(true);
          setTranslationReloadAttempts(prev => prev + 1);
          
          // Force reload translations from database
          try {
            await forceReloadTranslations();
            logger.debug('Translations reloaded successfully', 'MasterKeyManager');
            
            // Reset detection flag after successful reload to allow checking again
            setTimeout(() => {
              setMissingTranslationsDetected(false);
            }, 1000); // Wait 1 second before allowing another check
          } catch (error) {
            logger.error('Failed to reload translations', 'MasterKeyManager', error);
          }
        } else {
          // All translations found, reset attempts counter
          setTranslationReloadAttempts(0);
        }
      } else if (translationReloadAttempts >= MAX_TRANSLATION_RELOAD_ATTEMPTS) {
        logger.error('🌍 Maximum translation reload attempts reached, stopping to prevent infinite loop', 'MasterKeyManager', {
          attempts: translationReloadAttempts,
          maxAttempts: MAX_TRANSLATION_RELOAD_ATTEMPTS
        });
      }
    };
    
    checkForMissingTranslations();
  }, [translationsReady]); // Remove problematic dependencies to prevent infinite loop

  const handleSetMasterKey = async () => {
    logger.debug('handleSetMasterKey called', 'MasterKeyManager', { masterKey: masterKey ? '***' : 'empty', length: masterKey.length });
    if (!masterKey.trim()) {
      logger.debug('Master key is empty, returning', 'MasterKeyManager', { masterKey: masterKey ? '***' : 'empty', length: masterKey.length });
      return;
    }
    
    // Frontend validation to prevent API call for short keys
    if (masterKey.length < 8) {
      setError(tSync('masterKey.minLengthError', 'Master key must be at least 8 characters long'));
      return;
    }
    
    try {
      logger.debug('Setting master key...', 'MasterKeyManager', { masterKey: masterKey ? '***' : 'empty', length: masterKey.length, isReset: isResetScenario });
      const connectionManager = ConnectionManager.getInstance();
      await connectionManager.setMasterKey(masterKey, isResetScenario);
      logger.debug('Master key set successfully', 'MasterKeyManager', { masterKey: masterKey ? '***' : 'empty', length: masterKey.length });
      setIsMasterKeySet(true);
      setShowInitialSetup(false);
      setShowMasterKeyPrompt(false);
      setError('');
      setIsResetScenario(false); // Reset the flag after successful setup
      // Reset failed attempts on successful setup
      setFailedAttempts(0);
      localStorage.removeItem('masterKey_failedAttempts');
      // Notify parent that master key is validated
      if (onMasterKeyValidated) {
        logger.debug('Calling onMasterKeyValidated callback', 'MasterKeyManager', { masterKey: masterKey ? '***' : 'empty', length: masterKey.length });
        onMasterKeyValidated();
      }
    } catch (error) {
      logger.error('Error setting master key', 'MasterKeyManager', error);
      if (error instanceof Error) {
        // Check if the error message is an i18n key
        if (error.message.startsWith('master_key.error.') || error.message.startsWith('masterKey.error.')) {
          setError(tSync(error.message) || error.message);
        } else if (error.message.includes('at least 8 characters')) {
          setError(tSync('masterKey.minLengthError', 'Master key must be at least 8 characters long'));
        } else {
          setError(error.message || tSync('masterKey.invalidKey', 'Invalid master key'));
        }
      } else {
        setError(tSync('masterKey.invalidKey', 'Invalid master key'));
      }
    }
  };

  const handleValidateMasterKey = async () => {
    if (!masterKey.trim()) return;
    
    // Frontend validation to prevent API call for short keys
    if (masterKey.length < 8) {
      setError(tSync('masterKey.minLengthError', 'Master key must be at least 8 characters long'));
      return;
    }
    
    try {
      const connectionManager = ConnectionManager.getInstance();
      // Validate the master key against the stored hash
      await connectionManager.setMasterKey(masterKey);
      setIsMasterKeySet(true);
      setShowMasterKeyPrompt(false);
      setError('');
      // Reset failed attempts on successful validation
      setFailedAttempts(0);
      localStorage.removeItem('masterKey_failedAttempts');
      // Notify parent that master key is validated
      if (onMasterKeyValidated) {
        onMasterKeyValidated();
      }
    } catch (error) {
      // Increment failed attempts
      const newFailedAttempts = failedAttempts + 1;
      setFailedAttempts(newFailedAttempts);
      localStorage.setItem('masterKey_failedAttempts', newFailedAttempts.toString());
      
      // Show reset option if we've reached max failed attempts
      if (newFailedAttempts >= MAX_FAILED_ATTEMPTS) {
        setShowResetOption(true);
      }
      
      // Handle specific error types
      if (error instanceof Error) {
        // Check if the error message is an i18n key
        if (error.message.startsWith('master_key.error.') || error.message.startsWith('masterKey.error.')) {
          setError(tSync(error.message) || error.message);
        } else if (error.message.includes('at least 8 characters')) {
          setError(tSync('masterKey.minLengthError', 'Master key must be at least 8 characters long'));
        } else {
          setError(error.message || tSync('masterKey.invalidKey', 'Invalid master key'));
        }
      } else {
        setError(tSync('masterKey.invalidKey', 'Invalid master key'));
      }
    }
  };

  const handleResetMasterKeyFromPrompt = async () => {
    const confirmMessage = tSync('masterKey.reset.confirm', 'Are you sure you want to reset your master key? This will delete all saved connections.');
    const userConfirmed = window.confirm(confirmMessage);
    
    if (userConfirmed) {
      try {
        const connectionManager = ConnectionManager.getInstance();
        await connectionManager.clearMasterKey();
        setIsMasterKeySet(false);
        setShowMasterKeyPrompt(false);
        setShowInitialSetup(true);
        setMasterKey('');
        setError('');
        setIsResetScenario(true); // Mark this as a reset scenario
        // Reset failed attempts after reset
        setFailedAttempts(0);
        localStorage.removeItem('masterKey_failedAttempts');
      } catch (error) {
        setError(tSync('masterKey.resetError', 'Failed to reset master key'));
      }
    }
  };

  logger.debug('🔍 MasterKeyManager render state', 'MasterKeyManager', {
    translationsReady,
    showInitialSetup,
    showMasterKeyPrompt,
    isMasterKeySet,
    masterKeyLength: masterKey.length
  });

  if (!translationsReady) {
    logger.debug(' Showing loading state', 'MasterKeyManager', { translationsReady });
    return (
      <div className="master-key-manager">
        <div className="card-container">
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>{tSync('masterKey.initializing', 'Initializing master key...')}</p>
          </div>
        </div>
      </div>
    );
  }

  logger.debug('🔍 Rendering MasterKeyManager with states', 'MasterKeyManager', {
    showInitialSetup,
    showMasterKeyPrompt,
    isMasterKeySet,
    translationsReady
  });

  logger.debug('MasterKeyManager: About to render component', 'MasterKeyManager', { translationsReady, showInitialSetup, showMasterKeyPrompt, isMasterKeySet, masterKeyLength: masterKey.length });
  logger.debug('MasterKeyManager: Checking showInitialSetup:', 'MasterKeyManager', { showInitialSetup, showMasterKeyPrompt });
  logger.debug('MasterKeyManager: Checking master key prompt condition:', 'MasterKeyManager', { showMasterKeyPrompt, isMasterKeySet, showInitialSetup });
  return (
    <div className="master-key-manager">
      <div className="card-container">
        {/* Master Key Setup - Show when no master key exists */}
        {showInitialSetup && !showMasterKeyPrompt && (
          <>
            {/* Header with Icon */}
            <div className="icon-container">
              <div className="icon-wrapper">
                <IconShield size={48} color="white" strokeWidth={1.5} />
              </div>
            </div>
            
            {/* Title and Description */}
            <div className="title-section">
              <h2 className="card-title">
                {tSync('masterKey.setup.title', 'Setup Master Key')}
              </h2>
              <p className="card-subtitle">
                {tSync('masterKey.setup.subtitle', 'Create a secure master key to protect your connection data')}
              </p>
            </div>

            {/* Form */}
            <div className="form-section">
              <div className="password-input-container">
                <label className="password-input-label">
                  {tSync('masterKey.label', 'Master Key')} *
                </label>
                <div className="password-input-wrapper">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="password-input-field"
                    value={masterKey}
                    onChange={(e) => setMasterKey(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && masterKey.trim() && masterKey.length >= 8) {
                        handleSetMasterKey();
                      }
                    }}
                    placeholder={tSync('masterKey.setup.placeholder', 'Enter your master key (minimum 8 characters)')}
                    required
                    autoFocus
                  />
                  <IconLock 
                    size={16} 
                    className="password-input-left-icon"
                  />
                  <button
                    type="button"
                    className="password-input-right-icon"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <IconEye size={16} /> : <IconEyeOff size={16} />}
                  </button>
                </div>
              </div>

              <div className="master-key-info">
                <div className="length-indicator">
                  {tSync('masterKey.lengthIndicator', `Length: ${masterKey.length}/8 characters`, { length: masterKey.length, minLength: 8 })}
                  {masterKey.length >= 8 && <span className="valid-indicator"> {tSync('masterKey.validIndicator', '✓ Valid')}</span>}
                  {masterKey.length > 0 && masterKey.length < 8 && <span className="invalid-indicator"> {tSync('masterKey.invalidIndicator', '✗ Too short')}</span>}
                </div>
              </div>
              
              <button 
                className="custom-button primary"
                onClick={() => {
                  logger.debug(' Button clicked!', 'MasterKeyManager');
                  handleSetMasterKey();
                }}
                disabled={!masterKey.trim() || masterKey.length < 8}
              >
                <IconShield size={16} />
                {tSync('masterKey.setup.button', 'Create Master Key')}
              </button>
            </div>

            <hr className="divider" />

            {/* Info Alert */}
            <div className="info-section">
              <div className="info-alert">
                <IconInfoCircle size={20} className="info-alert-icon" />
                <div className="info-alert-content">
                  <p className="info-alert-text">
                    <span className="info-alert-note">
                      {tSync('common.note', 'Note')}:
                    </span>{' '}
                    {tSync('masterKey.setup.note', 'Your master key is used to encrypt and decrypt your connection data securely.')}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Master Key Validation - Show when master key exists but not validated */}
        {showMasterKeyPrompt && !showInitialSetup && (
          <>
            {/* Header with Icon */}
            <div className="icon-container">
              <div className="icon-wrapper">
                <IconShield size={48} color="white" strokeWidth={1.5} />
              </div>
            </div>
            
            {/* Title and Description */}
            <div className="title-section">
              <h2 className="card-title">
                {tSync('masterKey.prompt.title', 'Enter Master Key')}
              </h2>
              <p className="card-subtitle">
                {tSync('masterKey.prompt.subtitle', 'Please enter your master key to continue')}
              </p>
            </div>

            {/* Form */}
            <div className="form-section">
              <div className="password-input-container">
                <label className="password-input-label">
                  {tSync('masterKey.label', 'Master Key')} *
                </label>
                <div className="password-input-wrapper">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="password-input-field"
                    value={masterKey}
                    onChange={(e) => setMasterKey(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && masterKey.trim() && masterKey.length >= 8) {
                        handleValidateMasterKey();
                      }
                    }}
                    placeholder={tSync('masterKey.prompt.placeholder', 'Enter your master key')}
                    required
                    autoFocus
                  />
                  <IconLock 
                    size={16} 
                    className="password-input-left-icon"
                  />
                  <button
                    type="button"
                    className="password-input-right-icon"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <IconEye size={16} /> : <IconEyeOff size={16} />}
                  </button>
                </div>
                {error && <div className="password-input-error">{error}</div>}
              </div>

              <button 
                className="custom-button primary"
                onClick={handleValidateMasterKey}
                disabled={!masterKey.trim() || masterKey.length < 8}
              >
                <IconShield size={16} />
                {tSync('masterKey.prompt.button', 'Validate Master Key')}
              </button>

              {/* Show failed attempts count */}
              {failedAttempts > 0 && (
                <div className="failed-attempts-info">
                  <p className="failed-attempts-text">
                    {tSync('masterKey.failedAttempts', 'Failed attempts: {count}/{max}').replace('{count}', failedAttempts.toString()).replace('{max}', MAX_FAILED_ATTEMPTS.toString())}
                  </p>
                  {failedAttempts >= MAX_FAILED_ATTEMPTS && (
                    <p className="reset-available-text">
                      {tSync('masterKey.resetAvailable', 'Reset available after {max} failed attempts').replace('{max}', MAX_FAILED_ATTEMPTS.toString())}
                    </p>
                  )}
                </div>
              )}

              {showResetOption && (
                <button 
                  className="custom-button reset"
                  onClick={handleResetMasterKeyFromPrompt}
                >
                  <IconRotate size={16} />
                  {tSync('masterKey.reset.button', 'Reset Master Key')}
                </button>
              )}
            </div>

            <hr className="divider" />

            {/* Info Alert */}
            <div className="info-section">
              <div className="info-alert">
                <IconInfoCircle size={20} className="info-alert-icon" />
                <div className="info-alert-content">
                  <p className="info-alert-text">
                    <span className="info-alert-note">
                      {tSync('common.note', 'Note')}:
                    </span>{' '}
                    {tSync('masterKey.setup.note', 'Your master key is used to encrypt and decrypt your connection data securely.')}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Loading state when neither setup nor prompt should be shown */}
        {!showInitialSetup && !showMasterKeyPrompt && (
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>{tSync('masterKey.loading', 'Loading...')}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MasterKeyManager;
