import React from 'react';
import { Group, Text, Badge, ActionIcon, Tooltip, Button } from '@mantine/core';
import { IconUser, IconKey, IconDatabase, IconApi, IconRefresh } from '@tabler/icons-react';
import { UserInfo } from '../services/AuthService';
import { useTranslation } from '../services/I18nService';
import '../assets/css/components/StatusBar.css';
import { logger } from '../services/Logger';

interface ApiUsage {
  used: number;
  limit: number;
  remaining: number;
  resetTime: string | null;
  percentage: number;
}

interface StatusBarProps {
  statusText: string;
  userInfo?: UserInfo;
  connectionUuid?: string | null;
  sobjectCount?: number;
  apiUsage?: ApiUsage | null;
  onReload?: () => void;
  isReloading?: boolean;
  backendHealth?: {
    status: 'healthy' | 'unhealthy' | 'checking';
    lastCheck?: string;
  };
}

export const StatusBar: React.FC<StatusBarProps> = ({ 
  statusText, 
  userInfo, 
  connectionUuid,
  sobjectCount,
  apiUsage,
  onReload,
  isReloading = false,
  backendHealth
}) => {
  const { tSync } = useTranslation();
  
  // StatusBar component rendering

  
  return (
    <div className="status-bar">
      <div className="status-left">
        <Group gap="xs">
          {statusText && (
            <Text size="xs" c="dimmed">
              {statusText}
            </Text>
          )}
          
          
          {sobjectCount !== undefined && (
            <Badge 
              color="blue" 
              variant="light" 
              size="xs"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <IconDatabase size={12} />
                <span>
                  {tSync('statusBar.sobjectsCount', { count: sobjectCount }) || `Described ${sobjectCount} SObjects`}
                </span>
              </div>
            </Badge>
          )}
          
          {onReload && (
                          <Button
                size="xs"
                variant="light"
                color="blue"
                onClick={onReload}
                disabled={isReloading}
                loading={isReloading}
                leftSection={<IconRefresh size={12} />}
                style={{ padding: '4px 8px', minHeight: '24px' }}
              >
                {tSync('statusBar.reload', 'statusBar.reload.fallback')}
              </Button>
          )}
        </Group>
      </div>
      
      <div className="status-center">
        <Group gap="xs">
          {connectionUuid && (
            <Badge 
              color="green" 
              variant="light" 
              size="xs"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <IconKey size={12} />
                <span>{tSync('statusBar.connectionId', { id: connectionUuid }) || `Connection ID (${connectionUuid})`}</span>
              </div>
            </Badge>
          )}
        </Group>
      </div>
      
      <div className="status-right">
        <Group gap="xs">
          {apiUsage && (
            <Badge 
              color={apiUsage.percentage > 80 ? 'red' : apiUsage.percentage > 60 ? 'yellow' : 'blue'} 
              variant="light" 
              size="xs"
            >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <IconApi size={12} />
                <span>{tSync('statusBar.apiUsage', { 
                  used: apiUsage.used.toLocaleString(), 
                  limit: apiUsage.limit.toLocaleString(), 
                  percentage: apiUsage.percentage 
                }) || `API: ${apiUsage.used.toLocaleString()}/${apiUsage.limit.toLocaleString()} (${apiUsage.percentage}%)`}</span>
              </div>
            </Badge>
          )}
          
          {backendHealth && (
            <Badge 
              color={backendHealth.status === 'healthy' ? 'green' : backendHealth.status === 'checking' ? 'yellow' : 'red'} 
              variant="light" 
              size="xs"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <IconApi size={12} />
                <span>
                  {backendHealth.status === 'healthy' ? tSync('status.backend.ok', 'Backend OK') : 
                   backendHealth.status === 'checking' ? tSync('status.backend.checking', 'Checking...') : tSync('status.backend.error', 'Backend Error')}
                </span>
              </div>
            </Badge>
          )}
        </Group>
      </div>
    </div>
  );
};
