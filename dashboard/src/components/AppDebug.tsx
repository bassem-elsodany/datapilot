import React, { useState, useEffect } from 'react';
import { 
  Paper, 
  Text, 
  Stack, 
  Badge, 
  Button, 
  Group, 
  Collapse, 
  Divider,
  Code,
  ScrollArea,
  ActionIcon,
  Tooltip,
  Switch,
  Select,
  Textarea
} from '@mantine/core';
import {
  IconBug,
  IconChevronDown,
  IconChevronUp,
  IconX,
  IconRefresh,
  IconCopy,
  IconSettings,
  IconDatabase,
  IconGlobe,
  IconShield,
  IconUser,
  IconActivity
} from '@tabler/icons-react';
import { useTranslation } from '../services/I18nService';
import { ConnectionManager } from '../services/ConnectionManager';
import { logger } from '../services/Logger';
import '../assets/css/components/AppDebug.css';

interface DebugSection {
  id: string;
  title: string;
  icon: React.ReactNode;
  content: React.ReactNode;
  enabled: boolean;
}

export const AppDebug: React.FC = () => {
  const { tSync, getCurrentLocale, getAvailableLocales } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [debugMode, setDebugMode] = useState<'minimal' | 'detailed' | 'full'>('minimal');
  const [logs, setLogs] = useState<any[]>([]);
  const [sessionData, setSessionData] = useState<any>(null);
  const [performanceMetrics, setPerformanceMetrics] = useState<any>({});

        const connectionManager = ConnectionManager.getInstance();

  // Performance monitoring
  useEffect(() => {
    if (debugMode === 'full') {
      const interval = setInterval(() => {
        setPerformanceMetrics({
          memory: (performance as any).memory ? {
            used: Math.round((performance as any).memory.usedJSHeapSize / 1024 / 1024),
            total: Math.round((performance as any).memory.totalJSHeapSize / 1024 / 1024),
            limit: Math.round((performance as any).memory.jsHeapSizeLimit / 1024 / 1024)
          } : null,
          timestamp: Date.now(),
          url: window.location.href,
          userAgent: navigator.userAgent
        });
      }, 2000);

      return () => clearInterval(interval);
    }
  }, [debugMode]);

  // Load connection data
  useEffect(() => {
    if (isExpanded) {
      const loadConnections = async () => {
        try {
          const connections = await connectionManager.getAllConnections();
          setSessionData({
            totalConnections: connections.length,
            connections: connections.map(c => ({ id: c.id, username: c.username, lastUsed: c.lastUsed })),
            masterKeySet: !!localStorage.getItem('soql_developer_master_key_hash')
          });
        } catch (error) {
          setSessionData({ error: error.message });
        }
      };
      loadConnections();
    }
  }, [isExpanded]);

  // Load recent logs
  useEffect(() => {
    if (isExpanded && debugMode !== 'minimal') {
      const recentLogs = logger.getLogs(0, 10); // Get last 10 logs
      setLogs(recentLogs);
    }
  }, [isExpanded, debugMode]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const clearLogs = () => {
    logger.clearLogs();
    setLogs([]);
  };

  const debugSections: DebugSection[] = [
    {
      id: 'language',
      title: 'Language & i18n',
      icon: <IconGlobe size={16} />,
      enabled: true,
      content: (
        <Stack gap="xs">
          <Group gap="xs">
            <Badge color="blue" variant="light" size="sm">
              Current: {getCurrentLocale()}
            </Badge>
            <Badge color="green" variant="light" size="sm">
              Available: {getAvailableLocales().length}
            </Badge>
          </Group>
          <Code block>
            {`Translation Test: ${tSync('masterKey.title')}`}
          </Code>
          <Code block>
            {`Connections: ${tSync('connections.title')}`}
          </Code>
        </Stack>
      )
    },
    {
      id: 'sessions',
      title: tSync('debug.sessionManagement', 'Session Management'),
      icon: <IconShield size={16} />,
      enabled: debugMode !== 'minimal',
      content: (
        <Stack gap="xs">
          {sessionData ? (
            <>
              <Group gap="xs">
                <Badge color="blue" variant="light" size="sm">
                  Total: {sessionData.totalConnections || 0}
                </Badge>
                <Badge color={sessionData.masterKeySet ? 'green' : 'red'} variant="light" size="sm">
                  Master Key: {sessionData.masterKeySet ? tSync('debug.masterKey.set', 'Set') : tSync('debug.masterKey.notSet', 'Not Set')}
                </Badge>
              </Group>
              {sessionData.connections && (
                <ScrollArea h={100}>
                  <Stack gap="xs">
                    {sessionData.connections.map((connection: any) => (
                      <Text key={connection.id} size="xs" c="dimmed">
                        {connection.username} - {new Date(connection.lastUsed).toLocaleString()}
                      </Text>
                    ))}
                  </Stack>
                </ScrollArea>
              )}
            </>
          ) : (
            <Text size="xs" c="dimmed">{tSync('common.loading', 'common.loading.fallback')}</Text>
          )}
        </Stack>
      )
    },
    {
      id: 'performance',
      title: tSync('debug.performance', 'debug.performance.fallback'),
      icon: <IconActivity size={16} />,
      enabled: debugMode === 'full',
      content: (
        <Stack gap="xs">
          {performanceMetrics.memory ? (
            <>
              <Group gap="xs">
                <Badge color="blue" variant="light" size="sm">
                  Memory: {performanceMetrics.memory.used}MB / {performanceMetrics.memory.total}MB
                </Badge>
                <Badge color="green" variant="light" size="sm">
                  Limit: {performanceMetrics.memory.limit}MB
                </Badge>
              </Group>
              <Text size="xs" c="dimmed">
                URL: {performanceMetrics.url}
              </Text>
            </>
          ) : (
            <Text size="xs" c="dimmed">{tSync('debug.memoryApiNotAvailable', 'debug.memoryApiNotAvailable.fallback')}</Text>
          )}
        </Stack>
      )
    },
    {
      id: 'logs',
      title: tSync('debug.recentLogs', 'Recent Logs'),
      icon: <IconDatabase size={16} />,
      enabled: debugMode !== 'minimal',
      content: (
        <Stack gap="xs">
          <Group gap="xs">
            <Text size="xs" fw={500}>{tSync('debug.lastLogs', { count: logs.length }, 'debug.lastLogs.fallback')}</Text>
            <ActionIcon size="xs" variant="subtle" onClick={clearLogs}>
              <IconRefresh size={12} />
            </ActionIcon>
          </Group>
          <ScrollArea h={120}>
            <Stack gap="xs">
              {logs.map((log, index) => (
                <Paper key={index} p="xs" withBorder>
                  <Group gap="xs" align="flex-start">
                    <Badge 
                      color={
                        log.level === 0 ? 'red' : 
                        log.level === 1 ? 'orange' : 
                        log.level === 2 ? 'blue' : 'gray'
                      } 
                      variant="light" 
                      size="xs"
                    >
                      {log.levelName}
                    </Badge>
                    <Text size="xs" c="dimmed" style={{ flex: 1 }}>
                      {log.message}
                    </Text>
                    <ActionIcon 
                      size="xs" 
                      variant="subtle" 
                      onClick={() => copyToClipboard(JSON.stringify(log, null, 2))}
                    >
                      <IconCopy size={10} />
                    </ActionIcon>
                  </Group>
                  {log.context && (
                    <Text size="xs" c="dimmed" mt={4}>
                      Context: {log.context}
                    </Text>
                  )}
                </Paper>
              ))}
            </Stack>
          </ScrollArea>
        </Stack>
      )
    }
  ];

  const visibleSections = debugSections.filter(section => section.enabled);

  if (!isVisible) return null;

  return (
    <div className="app-debug">
      <div className="debug-header">
        <div className="debug-title">
          <IconBug size={16} color="#3b82f6" />
          <Text size="sm" fw={600}>App Debug</Text>
          <Badge color="blue" variant="light" size="xs">
            {debugMode}
          </Badge>
        </div>
        <div className="debug-controls">
          <Tooltip label="Debug Mode">
            <Select
              size="xs"
              value={debugMode}
              onChange={(value) => setDebugMode(value as any)}
              data={[
                { value: 'minimal', label: 'Minimal' },
                { value: 'detailed', label: 'Detailed' },
                { value: 'full', label: 'Full' }
              ]}
              className="debug-mode-selector"
            />
          </Tooltip>
          <ActionIcon 
            size="sm" 
            variant="subtle" 
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
          </ActionIcon>
          <ActionIcon 
            size="sm" 
            variant="subtle" 
            onClick={() => setIsVisible(false)}
          >
            <IconX size={14} />
          </ActionIcon>
        </div>
      </div>

      {/* Collapsible Content */}
      <Collapse in={isExpanded}>
        <div className="debug-content">
          {/* Sections */}
          {visibleSections.map((section) => (
            <div key={section.id} className="debug-section">
              <div 
                className="debug-section-header"
                onClick={() => setActiveSection(activeSection === section.id ? null : section.id)}
              >
                {section.icon}
                <div className="debug-section-title">
                  {section.title}
                </div>
                <ActionIcon size="xs" variant="subtle">
                  {activeSection === section.id ? <IconChevronUp size={12} /> : <IconChevronDown size={12} />}
                </ActionIcon>
              </div>
              
              <Collapse in={activeSection === section.id}>
                <div className="debug-section-content">
                  {section.content}
                </div>
              </Collapse>
            </div>
          ))}

          {/* Quick Actions */}
          <div className="debug-actions">
            <Button 
              size="xs" 
              variant="outline" 
              leftSection={<IconRefresh size={12} />}
              onClick={() => window.location.reload()}
              className="debug-button"
            >
              Reload
            </Button>
            <Button 
              size="xs" 
              variant="outline" 
              leftSection={<IconCopy size={12} />}
              onClick={() => copyToClipboard(JSON.stringify({
                locale: getCurrentLocale(),
                sessions: sessionData,
                performance: performanceMetrics,
                logs: logs
              }, null, 2))}
              className="debug-button"
            >
              Export
            </Button>
          </div>
        </div>
      </Collapse>
    </div>
  );
};
