import { useSessionContext } from '../contexts/SessionContext';

/**
 * Hook to get the current connection UUID from the session context
 * This ensures that currentConnectionUuid is only available from the session
 */
export const useCurrentConnection = () => {
  const { currentConnectionUuid } = useSessionContext();
  return currentConnectionUuid;
};
