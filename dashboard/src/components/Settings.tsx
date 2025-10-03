import React, { useState, useEffect } from 'react';
import { logger } from '../services/Logger';
import {
  Modal,
  Tabs,
  TextInput,
  Textarea,
  Switch,
  NumberInput,
  Select,
  Button,
  Stack,
  Group,
  Title,
  Text,
  ColorInput,
  Divider
} from '@mantine/core';
import { IconSettings, IconPalette, IconGlobe, IconCode, IconRotate, IconX } from '@tabler/icons-react';
import '../assets/css/components/Settings.css';
import { configManager } from '../config/app.config';
import { useTranslation } from '../services/I18nService';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Settings: React.FC<SettingsProps> = ({ isOpen, onClose }) => {
  const { t, tSync, setLocale, getCurrentLocale, getAvailableLocaleObjects, getLocaleData } = useTranslation();
  const [locale, setLocaleState] = useState(getCurrentLocale());
  const [supportedLocales, setSupportedLocales] = useState<Array<{code: string, name: string}>>([]);
  const [localeData, setLocaleData] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'general' | 'appearance' | 'language' | 'advanced'>('general');
  const [config, setConfig] = useState(configManager.getAppConfig());
  const [localeDataState, setLocaleDataState] = useState<any[]>([]);

  // Load locale data and supported locales
  React.useEffect(() => {
    const loadData = async () => {
      try {
        const [locales, data] = await Promise.all([
          getAvailableLocaleObjects(),
          getLocaleData()
        ]);
        setSupportedLocales(locales);
        setLocaleDataState(data);
      } catch (error) {
        logger.error('Failed to load locale data', 'Settings', null, error as Error);
        setSupportedLocales([{ code: 'en', name: 'English' }]);
        setLocaleDataState([]);
      }
    };
    loadData();
  }, [getAvailableLocaleObjects, getLocaleData]);

  // Update locale state when it changes
  React.useEffect(() => {
    setLocaleState(getCurrentLocale());
  }, [getCurrentLocale]);

  if (!isOpen) return null;

  const handleConfigChange = (section: keyof typeof config, key: string, value: any) => {
    const newConfig = {
      ...config,
      [section]: {
        ...config[section],
        [key]: value
      }
    };
    setConfig(newConfig);
    configManager.updateAppConfig(newConfig);
  };

  const handleResetToDefaults = () => {
    configManager.resetToDefaults();
    setConfig(configManager.getAppConfig());
  };

  const handleLocaleChange = async (newLocale: string) => {
    await setLocale(newLocale);
    setLocaleState(newLocale);
  };

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title={
        <Group align="center" gap="sm">
          <IconSettings size={20} />
          <Text fw={600}>{tSync('common.settings')}</Text>
        </Group>
      }
      size="xl"
      centered
    >
      <Tabs value={activeTab} onChange={(value) => setActiveTab(value as any)}>
        <Tabs.List>
          <Tabs.Tab value="general" leftSection={<IconSettings size={16} />}>
            {tSync('common.general')}
          </Tabs.Tab>
          <Tabs.Tab value="appearance" leftSection={<IconPalette size={16} />}>
            {tSync('common.appearance')}
          </Tabs.Tab>
          <Tabs.Tab value="language" leftSection={<IconGlobe size={16} />}>
            {tSync('common.language')}
          </Tabs.Tab>
          <Tabs.Tab value="advanced" leftSection={<IconCode size={16} />}>
            {tSync('common.advanced')}
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="general" pt="md">
          <Stack gap="md">
            <Title order={4}>{tSync('common.general')}</Title>
            
            <TextInput
              label={tSync('app.name')}
              value={config.app.name}
              onChange={(e) => handleConfigChange('app', 'name', e.currentTarget.value)}
            />

            <TextInput
              label={tSync('app.version')}
              value={config.app.version}
              onChange={(e) => handleConfigChange('app', 'version', e.currentTarget.value)}
            />

            <Textarea
              label={tSync('app.description')}
              value={config.app.description}
              onChange={(e) => handleConfigChange('app', 'description', e.currentTarget.value)}
              rows={3}
            />

            <Switch
              label={tSync('features.enableAutoSave')}
              checked={config.features.enableAutoSave}
              onChange={(e) => handleConfigChange('features', 'enableAutoSave', e.currentTarget.checked)}
            />

            <Switch
              label={tSync('features.enableSessionPersistence')}
              checked={config.features.enableSessionPersistence}
              onChange={(e) => handleConfigChange('features', 'enableSessionPersistence', e.currentTarget.checked)}
            />

            <NumberInput
              label={tSync('features.maxSavedSessions')}
              value={config.features.maxSavedSessions}
              onChange={(value) => handleConfigChange('features', 'maxSavedSessions', value)}
              min={1}
              max={100}
            />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="appearance" pt="md">
          <Stack gap="md">
            <Title order={4}>{tSync('common.appearance')}</Title>
            
            <Select
              label={tSync('ui.defaultFontSize')}
              value={config.ui.defaultFontSize}
              onChange={(value) => handleConfigChange('ui', 'defaultFontSize', value)}
              data={config.ui.fontSizes.map(size => ({
                value: size.value,
                label: tSync(`schema.${size.label.toLowerCase()}`)
              }))}
            />

            <ColorInput
              label={tSync('ui.theme.primary')}
              value={config.ui.theme.primary}
              onChange={(value) => handleConfigChange('ui', 'theme', { ...config.ui.theme, primary: value })}
            />

            <ColorInput
              label={tSync('ui.theme.secondary')}
              value={config.ui.theme.secondary}
              onChange={(value) => handleConfigChange('ui', 'theme', { ...config.ui.theme, secondary: value })}
            />

            <NumberInput
              label={tSync('ui.animations.duration')}
              value={config.ui.animations.duration}
              onChange={(value) => handleConfigChange('ui', 'animations', { ...config.ui.animations, duration: value })}
              min={0}
              max={1000}
              step={50}
              suffix="ms"
            />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="language" pt="md">
          <Stack gap="md">
            <Title order={4}>{t('common.language')}</Title>
            
            <Select
              label={t('common.language')}
              value={locale}
              onChange={(value) => handleLocaleChange(value || 'en')}
              data={supportedLocales.map(localeInfo => ({
                value: localeInfo.code,
                label: localeInfo.name
              }))}
            />

            <Select
              label={t('common.dateFormat')}
              value={config.i18n?.dateFormat || 'short'}
              onChange={(value) => handleConfigChange('i18n', 'dateFormat', value)}
              data={[
                { value: 'short', label: t('common.short') },
                { value: 'long', label: t('common.long') }
              ]}
            />

            <Select
              label={t('common.numberFormat')}
              value={config.i18n?.numberFormat || 'decimal'}
              onChange={(value) => handleConfigChange('i18n', 'numberFormat', value)}
              data={[
                { value: 'decimal', label: t('common.decimal') },
                { value: 'currency', label: t('common.currency') }
              ]}
            />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="advanced" pt="md">
          <Stack gap="md">
            <Title order={4}>{t('common.advanced')}</Title>
            
            <Switch
              label={t('development.enableDebugLogging')}
              checked={config.development.enableDebugLogging}
              onChange={(e) => handleConfigChange('development', 'enableDebugLogging', e.currentTarget.checked)}
            />

            <Switch
              label={t('development.enableTestData')}
              checked={config.development.enableTestData}
              onChange={(e) => handleConfigChange('development', 'enableTestData', e.currentTarget.checked)}
            />

            <TextInput
              label={t('salesforce.apiVersion')}
              value={config.salesforce.apiVersion}
              onChange={(e) => handleConfigChange('salesforce', 'apiVersion', e.currentTarget.value)}
            />

            <NumberInput
              label={t('salesforce.timeout')}
              value={config.salesforce.timeout}
              onChange={(value) => handleConfigChange('salesforce', 'timeout', value)}
              min={1000}
              max={60000}
              step={1000}
              suffix="ms"
            />

            <NumberInput
              label={t('salesforce.maxRetries')}
              value={config.salesforce.maxRetries}
              onChange={(value) => handleConfigChange('salesforce', 'maxRetries', value)}
              min={0}
              max={10}
            />

            <Divider />

            <Button 
              color="red"
              leftSection={<IconRotate size={16} />}
              onClick={handleResetToDefaults}
            >
              {t('common.resetToDefaults')}
            </Button>
          </Stack>
        </Tabs.Panel>
      </Tabs>

      <Group justify="flex-end" mt="lg">
        <Button onClick={onClose} leftSection={<IconX size={16} />}>
          {t('common.close')}
        </Button>
      </Group>
    </Modal>
  );
};
