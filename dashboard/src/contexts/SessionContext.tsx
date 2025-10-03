import React, { createContext, useContext, useEffect } from 'react';
import { useSession, SessionData } from '../hooks/useSession';

interface SessionContextType {
  session: SessionData | null;
  isAuthenticated: boolean;
  currentConnectionUuid: string | null;
  setCurrentConnectionUuid: (uuid: string | null) => void;
  createSession: (masterKey: string, connectionData?: any) => void;
  updateActivity: () => void;
  destroySession: () => void;
  isSessionValid: () => boolean;
  getSessionId: () => string | null;
  getMasterKey: () => string | null;
  getMasterKeyForApi: () => string;
  setIsConnected: (connected: boolean) => void;
  getIsConnected: () => boolean;
  setUserInfo: (userInfo: any) => void;
  getUserInfo: () => any;
  clearSession: () => void;
  getConversationUuid: () => string | null;
  setConversationUuid: (conversationUuid: string | null) => void;
}

const SessionContext = createContext<SessionContextType | null>(null);

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const session = useSession();

  // Set the session context provider for services to use
  useEffect(() => {
    setSessionContextProvider(session);
    return () => {
      setSessionContextProvider(null);
    };
  }, [session]);

  // Auto-logout on session timeout
  useEffect(() => {
    const checkSession = () => {
      if (session.session && !session.isSessionValid()) {
        session.destroySession();
      }
    };

    const interval = setInterval(checkSession, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [session.session, session.isSessionValid, session.destroySession]);

  // Update activity on user interaction
  useEffect(() => {
    const handleActivity = () => session.updateActivity();
    
    const events = ['click', 'keypress', 'scroll', 'mousemove', 'touchstart'];
    
    events.forEach(event => {
      window.addEventListener(event, handleActivity);
    });
    
    return () => {
      events.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [session.updateActivity]);

  return (
    <SessionContext.Provider value={session}>
      {children}
    </SessionContext.Provider>
  );
};

export const useSessionContext = (): SessionContextType => {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSessionContext must be used within SessionProvider');
  }
  return context;
};

// Export a session context provider for services to use
let sessionContextProvider: (() => { 
  masterKey: string; 
  connectionUuid: string | null; 
  isConnected: boolean;
  getConversationUuid: () => string | null;
  setConversationUuid: (conversationUuid: string | null) => void;
}) | null = null;

export const setSessionContextProvider = (provider: SessionContextType | null) => {
  sessionContextProvider = provider ? () => ({
    masterKey: provider.getMasterKey() || '',
    connectionUuid: provider.currentConnectionUuid,
    isConnected: provider.getIsConnected(),
    getConversationUuid: provider.getConversationUuid,
    setConversationUuid: provider.setConversationUuid
  }) : null;
  
  // Also set up the API service session context provider
  if (provider) {
    import('../services/ApiService').then(({ setApiSessionContextProvider }) => {
      setApiSessionContextProvider(() => ({
        masterKey: provider.getMasterKey() || '',
        connectionUuid: provider.currentConnectionUuid,
        isConnected: provider.getIsConnected()
      }));
    });
  } else {
    import('../services/ApiService').then(({ setApiSessionContextProvider }) => {
      setApiSessionContextProvider(null);
    });
  }
};

export const getSessionContextProvider = (): (() => { 
  masterKey: string; 
  connectionUuid: string | null; 
  isConnected: boolean;
  getConversationUuid: () => string | null;
  setConversationUuid: (conversationUuid: string | null) => void;
}) | null => {
  return sessionContextProvider;
};
