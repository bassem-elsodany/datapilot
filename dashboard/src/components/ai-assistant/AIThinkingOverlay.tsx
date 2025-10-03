import React, { useState, useEffect } from 'react';
import { Paper, Text, Group, ThemeIcon, Stack, Transition, Progress, Badge, ActionIcon } from '@mantine/core';
import { IconSparkles, IconLoader, IconBrain, IconCpu, IconDatabase, IconSearch, IconCode, IconBulb, IconX, IconTools, IconCheck, IconClock } from '@tabler/icons-react';
import { useTranslation } from '../../services/I18nService';

interface AIThinkingOverlayProps {
  isVisible: boolean;
  thinkingText: string;
  onComplete?: () => void;
  onClose?: () => void;
}

export const AIThinkingOverlay: React.FC<AIThinkingOverlayProps> = ({
  isVisible,
  thinkingText,
  onComplete,
  onClose
}) => {
  const { tSync } = useTranslation();
  const [displayedText, setDisplayedText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [pulseIntensity, setPulseIntensity] = useState(1);
  const [toolSelectionPhase, setToolSelectionPhase] = useState(0);
  const [availableTools] = useState([
    tSync('aiAssistant.thinkingOverlay.tools.searchObjects', 'Search Objects'),
    tSync('aiAssistant.thinkingOverlay.tools.getObjectDetails', 'Get Object Details'),
    tSync('aiAssistant.thinkingOverlay.tools.findRelationships', 'Find Relationships'),
    tSync('aiAssistant.thinkingOverlay.tools.queryData', 'Query Data')
  ]);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);

  // Thinking steps with icons and descriptions
  const thinkingSteps = [
    { icon: IconSearch, label: tSync('aiAssistant.thinkingOverlay.steps.analyzingRequest', 'Analyzing Request'), color: '#3b82f6' },
    { icon: IconTools, label: tSync('aiAssistant.thinkingOverlay.steps.selectingTools', 'Selecting Tools'), color: '#8b5cf6' },
    { icon: IconDatabase, label: tSync('aiAssistant.thinkingOverlay.steps.queryingData', 'Querying Data'), color: '#10b981' },
    { icon: IconCode, label: tSync('aiAssistant.thinkingOverlay.steps.processingLogic', 'Processing Logic'), color: '#f59e0b' },
    { icon: IconBulb, label: tSync('aiAssistant.thinkingOverlay.steps.generatingResponse', 'Generating Response'), color: '#ef4444' }
  ];

  // Tool selection phases with dynamic messages
  const toolSelectionPhases = [
    tSync('aiAssistant.thinkingOverlay.toolSelection.waiting', 'Analyzing your query...'),
    tSync('aiAssistant.thinkingOverlay.toolSelection.analyzing', 'Evaluating available tools...'),
    tSync('aiAssistant.thinkingOverlay.toolSelection.selecting', 'Selecting best approach...'),
    tSync('aiAssistant.thinkingOverlay.toolSelection.deciding', 'Deciding on tools to use...'),
    tSync('aiAssistant.thinkingOverlay.toolSelection.preparing', 'Preparing tool execution...')
  ];

  // Dynamic tool selection simulation
  useEffect(() => {
    if (!isVisible) {
      setToolSelectionPhase(0);
      setSelectedTools([]);
      return;
    }

    const toolSelectionInterval = setInterval(() => {
      setToolSelectionPhase(prev => {
        const nextPhase = prev + 1;
        if (nextPhase >= toolSelectionPhases.length) {
          // Simulate tool selection
          const randomTools = availableTools
            .sort(() => Math.random() - 0.5)
            .slice(0, Math.floor(Math.random() * 3) + 1);
          setSelectedTools(randomTools);
          return prev; // Keep at last phase
        }
        return nextPhase;
      });
    }, 2000); // Change phase every 2 seconds

    return () => clearInterval(toolSelectionInterval);
  }, [isVisible, toolSelectionPhases.length, availableTools]);

  // Typewriter effect for the thinking text
  useEffect(() => {
    if (!isVisible || !thinkingText) {
      setDisplayedText('');
      setCurrentIndex(0);
      setProgress(0);
      setCurrentStep(0);
      return;
    }

    const interval = setInterval(() => {
      if (currentIndex < thinkingText.length) {
        setDisplayedText(prev => prev + thinkingText[currentIndex]);
        setCurrentIndex(prev => prev + 1);
        
        // Update progress based on text completion
        const newProgress = Math.min((currentIndex + 1) / thinkingText.length * 100, 95);
        setProgress(newProgress);
        
        // Update current step based on progress
        const stepIndex = Math.floor(newProgress / 20);
        setCurrentStep(Math.min(stepIndex, thinkingSteps.length - 1));
        
      } else {
        clearInterval(interval);
        setProgress(100);
        // Call onComplete after a short delay to show the complete text
        setTimeout(() => {
          onComplete?.();
        }, 1500);
      }
    }, 25); // Slightly faster for better UX

    return () => clearInterval(interval);
  }, [isVisible, thinkingText, currentIndex, onComplete]);

  // Pulse effect for the main icon
  useEffect(() => {
    if (!isVisible) return;
    
    const pulseInterval = setInterval(() => {
      setPulseIntensity(prev => prev === 1 ? 1.2 : 1);
    }, 1000);

    return () => clearInterval(pulseInterval);
  }, [isVisible]);

  // Reset when thinking text changes
  useEffect(() => {
    if (thinkingText) {
      setDisplayedText('');
      setCurrentIndex(0);
      setProgress(0);
      setCurrentStep(0);
    }
  }, [thinkingText]);

  return (
    <Transition
      mounted={isVisible}
      transition="slide-up"
      duration={500}
      timingFunction="ease-out"
    >
      {(styles) => (
        <div
          style={{
            position: 'fixed',
            bottom: '50px', // 30px status bar + 20px margin
            left: '30%', // Moved more to the left
            transform: 'translateX(-50%)',
            zIndex: 1000,
            width: '95%',
            maxWidth: '800px',
            ...styles
          }}
        >
          <Paper
            shadow="md"
            radius="md"
            p="lg"
            style={{
              background: 'white',
              border: '1px solid #e5e7eb',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            <Stack gap="md">
              {/* Header with AI icon matching input section style */}
              <Group justify="space-between" align="center">
                <Group gap="sm">
                  <ThemeIcon
                    size="md"
                    radius="md"
                    color="blue"
                    variant="light"
                    style={{
                      transform: `scale(${pulseIntensity})`,
                      transition: 'transform 0.5s ease',
                      animation: 'brainPulse 2s ease-in-out infinite'
                    }}
                  >
                    <IconBrain size={20} />
                  </ThemeIcon>
                  
                  <div>
                    <Text
                      size="md"
                      fw={600}
                      c="#1e293b"
                    >
                      {tSync('aiAssistant.thinkingProcess', 'AI Thinking Process')}
                    </Text>
                    <Text
                      size="xs"
                      c="#64748b"
                    >
                      {tSync('aiAssistant.thinkingOverlay.processingRequest', 'Processing your request...')}
                    </Text>
                  </div>
                </Group>
                
                <Group gap="sm">
                  <div className="thinking-badge">
                    <IconLoader size={14} className="thinking-spinner" />
                    <span className="thinking-text">{tSync('aiAssistant.thinkingOverlay.thinking', 'Thinking')}</span>
                  </div>
                  
                  {onClose && (
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color="gray"
                      onClick={onClose}
                      style={{
                        opacity: 0.7,
                        transition: 'opacity 0.2s ease'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                      onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
                    >
                      <IconX size={16} />
                    </ActionIcon>
                  )}
                </Group>
              </Group>

              {/* Progress bar */}
              <div>
                <Group justify="space-between" mb="xs">
                  <Text size="sm" fw={500} c="#475569">
                    {tSync('aiAssistant.thinkingOverlay.progress', 'Progress')}
                  </Text>
                  <Text size="sm" fw={500} c="#3b82f6">
                    {Math.round(progress)}%
                  </Text>
                </Group>
                <Progress
                  value={progress}
                  size="md"
                  radius="md"
                  color="blue"
                />
              </div>

              {/* Thinking steps */}
              <div>
                <Text size="sm" fw={500} c="#475569" mb="sm">
                  {tSync('aiAssistant.thinkingOverlay.currentStep', 'Current Step')}
                </Text>
                <Group gap="sm">
                  {thinkingSteps.map((step, index) => {
                    const IconComponent = step.icon;
                    const isActive = index <= currentStep;
                    const isCurrent = index === currentStep;
                    
                    return (
                      <Group
                        key={index}
                        gap="xs"
                        style={{
                          opacity: isActive ? 1 : 0.5,
                          transform: isCurrent ? 'scale(1.02)' : 'scale(1)',
                          transition: 'all 0.3s ease'
                        }}
                      >
                        <ThemeIcon
                          size="sm"
                          radius="md"
                          color={isActive ? 'blue' : 'gray'}
                          variant={isActive ? 'light' : 'outline'}
                          style={{
                            animation: isCurrent ? 'stepPulse 1s ease-in-out infinite' : 'none'
                          }}
                        >
                          <IconComponent size={12} />
                        </ThemeIcon>
                        <Text
                          size="xs"
                          c={isActive ? '#1e293b' : '#94a3b8'}
                          fw={isCurrent ? 600 : 400}
                        >
                          {step.label}
                        </Text>
                      </Group>
                    );
                  })}
                </Group>
              </div>
              
              {/* Tool Selection Process */}
              {currentStep >= 1 && (
                <Paper
                  p="md"
                  radius="md"
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0'
                  }}
                >
                  <Group justify="space-between" mb="sm">
                    <Text size="sm" fw={600} c="#1e293b">
                      {tSync('aiAssistant.thinkingOverlay.steps.selectingTools', 'Selecting Tools')}
                    </Text>
                    <ThemeIcon size="sm" color="blue" variant="light">
                      <IconTools size={14} />
                    </ThemeIcon>
                  </Group>
                  
                  <Text size="sm" c="#64748b" mb="md">
                    {toolSelectionPhases[toolSelectionPhase]}
                  </Text>
                  
                  {/* Available Tools */}
                  <div style={{ marginBottom: '12px' }}>
                    <Text size="xs" fw={500} c="#64748b" mb="xs">
                      Available Tools:
                    </Text>
                    <Group gap="xs">
                      {availableTools.map((tool, index) => (
                        <Badge
                          key={tool}
                          size="sm"
                          variant="outline"
                          color="gray"
                          style={{
                            fontSize: '10px',
                            padding: '2px 6px'
                          }}
                        >
                          {tool}
                        </Badge>
                      ))}
                    </Group>
                  </div>
                  
                  {/* Selected Tools */}
                  {selectedTools.length > 0 && (
                    <div>
                      <Text size="xs" fw={500} c="#059669" mb="xs">
                        Selected Tools:
                      </Text>
                      <Group gap="xs">
                        {selectedTools.map((tool, index) => (
                          <Badge
                            key={tool}
                            size="sm"
                            color="green"
                            variant="light"
                            leftSection={<IconCheck size={10} />}
                            style={{
                              fontSize: '10px',
                              padding: '2px 6px',
                              animation: 'glow 1s ease-in-out'
                            }}
                          >
                            {tool}
                          </Badge>
                        ))}
                      </Group>
                    </div>
                  )}
                </Paper>
              )}

              {/* Thinking text with typewriter effect */}
              <Paper
                p="md"
                radius="md"
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  minHeight: '80px'
                }}
              >
                <Text
                  size="sm"
                  c="#475569"
                  style={{
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.6,
                    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                    minHeight: '60px'
                  }}
                >
                  {displayedText}
                  {currentIndex < thinkingText.length && (
                    <span
                      style={{
                        animation: 'blink 1s infinite',
                        color: '#3b82f6',
                        fontWeight: 'bold'
                      }}
                    >
                      |
                    </span>
                  )}
                </Text>
              </Paper>
            </Stack>
          </Paper>
        </div>
      )}
    </Transition>
  );
};

// Add clean CSS animations matching AI input section style
const style = document.createElement('style');
style.textContent = `
  @keyframes brainPulse {
    0%, 100% { 
      transform: scale(1);
      box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.2);
    }
    50% { 
      transform: scale(1.05);
      box-shadow: 0 0 0 6px rgba(59, 130, 246, 0);
    }
  }
  
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  
  @keyframes blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0; }
  }
  
  @keyframes glow {
    0% { 
      box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.2);
      transform: scale(1);
    }
    100% { 
      box-shadow: 0 0 0 4px rgba(59, 130, 246, 0);
      transform: scale(1.01);
    }
  }
  
  @keyframes stepPulse {
    0%, 100% { 
      transform: scale(1);
      box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.3);
    }
    50% { 
      transform: scale(1.05);
      box-shadow: 0 0 0 4px rgba(59, 130, 246, 0);
    }
  }
  
  /* Thinking badge styles */
  .thinking-badge {
    animation: glow 2s ease-in-out infinite alternate !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 6px !important;
    white-space: nowrap !important;
    padding: 4px 8px !important;
    background: rgba(59, 130, 246, 0.1) !important;
    border: 1px solid rgba(59, 130, 246, 0.2) !important;
    border-radius: 6px !important;
    font-size: 12px !important;
    color: #3b82f6 !important;
    font-weight: 500 !important;
  }
  
  .thinking-spinner {
    animation: spin 1s linear infinite !important;
    flex-shrink: 0 !important;
  }
  
  .thinking-text {
    margin-left: 0 !important;
    white-space: nowrap !important;
    flex-shrink: 0 !important;
  }
`;
document.head.appendChild(style);
