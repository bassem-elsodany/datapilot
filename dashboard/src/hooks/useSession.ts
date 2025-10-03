import { useLocalStorage, useSessionStorage } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useMemo, useState, useEffect } from 'react';
import { ConnectionManager } from '../services/ConnectionManager';
import { useTranslation } from '../services/I18nService';

const SESSION_TIMEOUT = 8 * 60 * 60 * 1000; // 8 hours
const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes

// Custom hook for storing connection UUID without JSON serialization
const useConnectionUuid = () => {
  const [value, setValue] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem('current-connection-uuid');
  });

  const setConnectionUuid = (newValue: string | null) => {
    setValue(newValue);
    if (typeof window !== 'undefined') {
      if (newValue === null) {
        sessionStorage.removeItem('current-connection-uuid');
      } else {
        sessionStorage.setItem('current-connection-uuid', newValue);
      }
    }
  };

  return [value, setConnectionUuid] as const;
};

export interface SessionData {
  masterKey: string;
  connectionData?: any;
  timestamp: number;
  sessionId: string;
  isConnected?: boolean;
  userInfo?: any;
  conversationUuid?: string;
}

export const useSession = () => {
  const { tSync } = useTranslation();
  const [session, setSession] = useLocalStorage<SessionData | null>({ key: 'datapilot-session', defaultValue: null });
  const [lastActivity, setLastActivity] = useSessionStorage<number | null>({ key: 'last-activity', defaultValue: null });
  const [currentConnectionUuid, setCurrentConnectionUuid] = useConnectionUuid();

  const isSessionValid = (): boolean => {
    // Always require a valid session object first
    if (!session?.masterKey || !session?.timestamp || !session?.sessionId) {
      return false;
    }
    
    const now = Date.now();
    const sessionAge = now - session.timestamp;
    const timeSinceActivity = lastActivity ? now - lastActivity : 0;
    
    // Check total session time and inactivity
    const isValid = sessionAge < SESSION_TIMEOUT && timeSinceActivity < INACTIVITY_TIMEOUT;
    
    return isValid;
  };

  const createSession = (masterKey: string, connectionData?: any): void => {
    const newSession: SessionData = {
      masterKey,
      connectionData,
      timestamp: Date.now(),
      sessionId: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    
    
    setSession(newSession);
    setLastActivity(Date.now());
    
    
    notifications.show({
      title: tSync('session.created.title', 'Session Created'),
      message: tSync('session.created.message', 'You are now authenticated'),
      color: 'green'
    });
  };

  const updateActivity = (): void => {
    setLastActivity(Date.now());
  };

  const destroySession = (): void => {
    // Clear master key from ConnectionManager
    const connectionManager = ConnectionManager.getInstance();
    connectionManager.clearMasterKeyFromMemory();
    
    // Clear all session-related data
    setSession(null);
    setLastActivity(null);
    setCurrentConnectionUuid(null);
    
    // Clear all app data
    clearAllAppData();
    
    notifications.show({
      title: tSync('session.ended.title', 'Session Ended'),
      message: tSync('session.ended.message', 'You have been logged out'),
      color: 'orange'
    });
  };

  const clearAllAppData = (): void => {
    // Clear all localStorage keys related to the app
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('datapilot-')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
  };

  const getSessionId = (): string | null => {
    return session?.sessionId || null;
  };

  const getMasterKey = (): string | null => {
    return session?.masterKey || null;
  };

  const getMasterKeyForApi = (): string => {
    if (!session?.masterKey) {
      throw new Error('Master key not available in session context');
    }
    return session.masterKey;
  };

  const setIsConnected = (connected: boolean): void => {
    if (session && session.isConnected !== connected) {
      setSession(prevSession => {
        if (!prevSession) return prevSession;
        return { ...prevSession, isConnected: connected };
      });
    }
  };

  const getIsConnected = (): boolean => {
    return session?.isConnected || false;
  };

  const setUserInfo = (userInfo: any): void => {
    if (session && session.userInfo !== userInfo) {
      setSession(prevSession => {
        if (!prevSession) return prevSession;
        return { ...prevSession, userInfo };
      });
    }
  };

  const getUserInfo = (): any => {
    return session?.userInfo || null;
  };

  const clearSession = (): void => {
    setSession(null);
    setLastActivity(null);
  };

  const getConversationUuid = (): string | null => {
    return session?.conversationUuid || null;
  };

  const setConversationUuid = (conversationUuid: string | null): void => {
    if (session && session.conversationUuid !== conversationUuid) {
      setSession(prevSession => {
        if (!prevSession) return prevSession;
        return { ...prevSession, conversationUuid: conversationUuid || undefined };
      });
    }
  };


  // Memoize isAuthenticated to prevent infinite loops
  const isAuthenticated = useMemo(() => {
    return isSessionValid();
  }, [session, lastActivity]);

  return {
    session,
    isAuthenticated,
    currentConnectionUuid,
    setCurrentConnectionUuid,
    createSession,
    updateActivity,
    destroySession,
    isSessionValid,
    getSessionId,
    getMasterKey,
    getMasterKeyForApi,
    setIsConnected,
    getIsConnected,
    setUserInfo,
    getUserInfo,
    clearSession,
    getConversationUuid,
    setConversationUuid
  };
};
