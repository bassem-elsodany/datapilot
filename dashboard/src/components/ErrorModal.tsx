import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Text,
  Button,
  Group,
  Stack,
  Alert
} from '@mantine/core';
import { IconAlertTriangle, IconX } from '@tabler/icons-react';
import '../assets/css/components/ErrorModal.css';
import { useTranslation } from '../services/I18nService';

interface ErrorModalProps {
  isOpen: boolean;
  error: string | null;
  onClose: () => void;
  title?: string;
}

export const ErrorModal: React.FC<ErrorModalProps> = ({ 
  isOpen, 
  error, 
  onClose, 
  title 
}) => {
  const { t, tSync } = useTranslation();
  const [isMounted, setIsMounted] = useState(false);
  const modalTitle = title || tSync('error.queryExecution.title');

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  if (!isMounted || !isOpen || !error) {
    return null;
  }

  const modalContent = (
    <div className="error-modal" onClick={onClose}>
      <div className="error-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="error-modal-header">
          <Group align="center" gap="sm">
            <IconAlertTriangle size={20} color="#ef4444" />
            <Text fw={600} size="lg">{modalTitle}</Text>
          </Group>
        </div>
        
        <div className="error-modal-body">
          <Stack gap="lg">
            <Alert 
              icon={<IconAlertTriangle size={16} />} 
              color="red" 
              variant="light"
              title={tSync('error.details', 'error.details.fallback')}
            >
              <Text size="sm">{error}</Text>
            </Alert>
            
            <Group justify="flex-end" mt="md">
              <Button onClick={onClose} leftSection={<IconX size={16} />}>
                {tSync('common.close')}
              </Button>
            </Group>
          </Stack>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
