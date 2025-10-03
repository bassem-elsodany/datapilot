import { useLocalStorage } from '@mantine/hooks';
import { useEffect } from 'react';
import { useSessionContext } from '../contexts/SessionContext';

/**
 * Session-aware storage hook that automatically scopes data to the current session
 * and clears data when the session is invalid or destroyed
 */
export const useSessionStorage = <T>(key: string, defaultValue: T) => {
  const { session, isAuthenticated, getSessionId } = useSessionContext();
  
  // Create session-scoped key
  const sessionId = getSessionId();
  const sessionKey = sessionId ? `${key}-${sessionId}` : key;
  
  const [value, setValue] = useLocalStorage<T>({ key: sessionKey, defaultValue });
  
  // Clear data if session is invalid
  useEffect(() => {
    if (!isAuthenticated && value !== defaultValue) {
      setValue(defaultValue);
    }
  }, [isAuthenticated, value, defaultValue, setValue]);
  
  return [value, setValue] as const;
};

/**
 * Session-aware storage hook for connection-specific data
 * Combines session ID with connection UUID for proper scoping
 */
export const useConnectionSessionStorage = <T>(
  key: string, 
  connectionUuid: string | null, 
  defaultValue: T
) => {
  const { session, isAuthenticated, getSessionId } = useSessionContext();
  
  // Create session + connection scoped key
  const sessionId = getSessionId();
  const scopedKey = sessionId && connectionUuid 
    ? `${key}-${sessionId}-${connectionUuid}` 
    : key;
  
  const [value, setValue] = useLocalStorage<T>({ key: scopedKey, defaultValue });
  
  // Clear data if session is invalid or connection changes
  useEffect(() => {
    if (!isAuthenticated && value !== defaultValue) {
      setValue(defaultValue);
    }
  }, [isAuthenticated, value, defaultValue, setValue]);
  
  return [value, setValue] as const;
};
