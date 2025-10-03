import React, { useState, useCallback } from 'react';
import './SmartResponseRenderer.css';
import { 
  Paper, 
  Title, 
  Text, 
  Badge, 
  Group, 
  Stack, 
  Button, 
  Card, 
  Table, 
  ScrollArea,
  ActionIcon,
  Tooltip,
  Divider,
  Alert,
  Progress,
  Collapse,
  Code,
  Box,
  Grid,
  ThemeIcon,
  Modal
} from '@mantine/core';
import { 
  IconDatabase, 
  IconTable, 
  IconHelp, 
  IconGitBranch, 
  IconCopy, 
  IconChevronDown, 
  IconChevronRight,
  IconCheck,
  IconX,
  IconInfoCircle,
  IconSparkles,
  IconArrowRight
} from '@tabler/icons-react';
import { useTranslation } from '../../services/I18nService';
import { logger } from '../../services/Logger';

interface StructuredAIResponse {
  response_type: 'metadata_query' | 'data_query' | 'clarification_needed' | 'relationship_query' | 'field_details_query';
  confidence?: number;
  confidence_label?: 'high' | 'medium' | 'low' | 'unknown';
  intent_understood?: string;
  thought?: string;
  actions_taken: string[];
  data_summary?: Record<string, any>;
  suggestions: string[];
  metadata: Record<string, any>;
  
  // Optional fields for clarification_needed responses (from prompt contract)
  candidate_objects?: Array<{
    api_name: string;
    label: string | null;
    confidence: number | null;
    match_reason: string | null;
  }>;
  multi_select_allowed?: boolean | null;
  instruction?: string | null;
  clarification?: {
    type: string;
    question: string;
    options: string[];
    detected_object: string | null;
    confidence: number | null;
  };
}

interface SmartResponseRendererProps {
  structuredResponse: StructuredAIResponse;
  onSuggestionClick?: (suggestion: string) => void;
  onObjectSelect?: (objectName: string) => void;
  onFieldClick?: (fieldName: string, objectName: string) => void;
  onShowMoreClick?: (objectName: string, currentOffset: number) => void;
}

export const SmartResponseRenderer: React.FC<SmartResponseRendererProps> = ({
  structuredResponse,
  onSuggestionClick,
  onObjectSelect,
  onFieldClick,
  onShowMoreClick
}) => {
  const { tSync } = useTranslation();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['main']));
  const [selectedObject, setSelectedObject] = useState<string | null>(null);
  const [picklistModalOpen, setPicklistModalOpen] = useState(false);
  const [picklistData, setPicklistData] = useState<any[]>([]);
  
  // Progressive rendering state
  const [visibleSections, setVisibleSections] = useState<Set<string>>(new Set());
  const [visibleRows, setVisibleRows] = useState<number>(0);
  const [isStreaming, setIsStreaming] = useState(true);

  // Progressive rendering effect
  React.useEffect(() => {
    // Reset when structuredResponse changes
    setVisibleSections(new Set());
    setVisibleRows(0);
    setIsStreaming(true);
    
    // Show sections progressively
    const sectionTimers: NodeJS.Timeout[] = [];
    
    // Show header first
    sectionTimers.push(setTimeout(() => {
      setVisibleSections(prev => new Set([...prev, 'header']));
    }, 100));
    
    // Show main content
    sectionTimers.push(setTimeout(() => {
      setVisibleSections(prev => new Set([...prev, 'content']));
    }, 400));
    
    // Progressive table row rendering
    const data_summary = structuredResponse.data_summary;
    const records = data_summary?.records || data_summary?.sample_records || [];
    const fields = data_summary?.fields || [];
    const totalRows = Math.max(records.length, fields.length);
    
    if (totalRows > 0) {
      // Show rows progressively - ONE ROW AT A TIME for dramatic effect
      let currentRow = 0;
      
      const showNextRow = () => {
        if (currentRow < totalRows) {
          currentRow++;
          setVisibleRows(currentRow);
          
          if (currentRow < totalRows) {
            // Slow down for first few rows, then speed up
            const delay = currentRow < 5 ? 150 : currentRow < 10 ? 100 : 50;
            sectionTimers.push(setTimeout(showNextRow, delay));
          } else {
            // All rows shown, now show suggestions
            sectionTimers.push(setTimeout(() => {
              setVisibleSections(prev => new Set([...prev, 'suggestions']));
              setIsStreaming(false);
            }, 300));
          }
        }
      };
      
      sectionTimers.push(setTimeout(showNextRow, 600));
    } else {
      setVisibleRows(Infinity); // Show all if no rows
      // Show suggestions after a short delay
      sectionTimers.push(setTimeout(() => {
        setVisibleSections(prev => new Set([...prev, 'suggestions']));
        setIsStreaming(false);
      }, 800));
    }
    
    return () => {
      sectionTimers.forEach(timer => clearTimeout(timer));
    };
  }, [structuredResponse]);


  const toggleSection = (sectionId: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionId)) {
      newExpanded.delete(sectionId);
    } else {
      newExpanded.add(sectionId);
    }
    setExpandedSections(newExpanded);
  };

  const openPicklistModal = useCallback((values: any[]) => {
    setPicklistData(values);
    setPicklistModalOpen(true);
  }, []);

  const getConfidenceColor = (confidence?: number) => {
    if (!confidence) return 'gray';
    if (confidence >= 0.8) return 'green';
    if (confidence >= 0.6) return 'yellow';
    return 'red';
  };

  const getConfidenceLabel = (confidenceLabel?: string) => {
    if (!confidenceLabel) return tSync('aiAssistant.smartResponse.confidence.unknown', 'Unknown');
    return tSync(`aiAssistant.smartResponse.confidence.${confidenceLabel}`, confidenceLabel || 'Unknown');
  };

  const renderMetadataQuery = () => {
    const { data_summary } = structuredResponse;
    if (!data_summary) return null;

    // Single object metadata
    if (data_summary.object_name) {
      return (
        <Card shadow="sm" radius="md" withBorder>
          <Card.Section withBorder inheritPadding py="xs">
            <Group justify="space-between">
              <Group>
                <ThemeIcon color="blue" variant="light">
                  <IconDatabase size={16} />
                </ThemeIcon>
                <Title order={4}>{data_summary.object_name}</Title>
                <Badge color="blue" variant="light">
                  {data_summary.object_label || data_summary.object_name}
                </Badge>
              </Group>
              <Group>
                {structuredResponse.confidence !== null && structuredResponse.confidence_label !== 'unknown' && (
                  <Badge color={getConfidenceColor(structuredResponse.confidence)}>
                    {getConfidenceLabel(structuredResponse.confidence_label)} {tSync('aiAssistant.smartResponse.confidence.label', 'Confidence')}
                  </Badge>
                )}
                <Text size="sm" c="dimmed">
                  {data_summary.total_fields || 0} fields
                </Text>
              </Group>
            </Group>
          </Card.Section>

          {data_summary.fields && data_summary.fields.length > 0 && (
            <Card.Section inheritPadding py="md">
              <Stack gap="sm">
                <Group justify="space-between">
                  <Text fw={500}>{tSync('aiAssistant.smartResponse.fields', 'Fields')}</Text>
                  {(() => {
                    // Get pagination info from the new response structure
                    const pagination = data_summary.pagination || data_summary.field_pagination;
                    const currentOffset = pagination?.field_offset || 0;
                    const fieldLimit = pagination?.field_limit || 10;
                    const totalFields = data_summary.total_fields || 0;
                    
                    // Calculate total fields shown so far: current offset + current batch size
                    const fieldsShownSoFar = currentOffset + (data_summary.fields?.length || 0);
                    
                    // Calculate remaining fields
                    const remaining = totalFields - fieldsShownSoFar;
                    
                    // Check if there are more fields to show
                    const hasMore = remaining > 0 && (pagination?.has_more || pagination?.has_more_fields);
                    
                    return hasMore && (
                      <Button 
                        size="sm" 
                        variant="light"
                        onClick={() => {
                          const objectName = data_summary.object_name;
                          // Calculate next offset: current offset + field limit
                          const nextOffset = currentOffset + fieldLimit;
                          onShowMoreClick?.(objectName, nextOffset);
                        }}
                        style={{ 
                          fontSize: '12px',
                          lineHeight: '1.2',
                          padding: '4px 8px',
                          minHeight: 'auto'
                        }}
                      >
                        {tSync('aiAssistant.smartResponse.showMore', 'Show More')} ({remaining})
                      </Button>
                    );
                  })()}
                </Group>
                
                {(() => {
                  // Dynamic column detection for field metadata
                  const getFieldColumns = (fields: any[]) => {
                    if (!fields || fields.length === 0) return [];
                    
                    const allColumns = new Set<string>();
                    fields.forEach(field => {
                      if (field && typeof field === 'object') {
                        Object.keys(field).forEach(key => allColumns.add(key));
                      }
                    });
                    
                    // Sort columns for consistent ordering (name first, then alphabetically)
                    return Array.from(allColumns).sort((a, b) => {
                      if (a.toLowerCase() === 'name') return -1;
                      if (b.toLowerCase() === 'name') return 1;
                      if (a.toLowerCase() === 'type') return -1;
                      if (b.toLowerCase() === 'type') return 1;
                      if (a.toLowerCase() === 'required') return -1;
                      if (b.toLowerCase() === 'required') return 1;
                      return a.localeCompare(b);
                    });
                  };

                  const fieldColumns = getFieldColumns(data_summary.fields);

                  return fieldColumns.length > 0 ? (
                    <ScrollArea.Autosize mah={400}>
                      <Table striped highlightOnHover>
                        <Table.Thead>
                          <Table.Tr>
                            {fieldColumns.map((column) => (
                              <Table.Th key={column}>
                                <Group gap="xs">
                                  <Text fw={500}>
                                    {column === 'name' ? tSync('aiAssistant.smartResponse.fieldName', 'Field Name') :
                                     column === 'type' ? tSync('aiAssistant.smartResponse.type', 'Type') :
                                     column === 'required' ? tSync('aiAssistant.smartResponse.required', 'Required') :
                                     column === 'description' ? tSync('aiAssistant.smartResponse.description', 'Description') :
                                     column === 'label' ? tSync('aiAssistant.smartResponse.label', 'Label') :
                                     column.charAt(0).toUpperCase() + column.slice(1)}
                                  </Text>
                                  <Badge size="xs" variant="light" color="gray">
                                    {typeof data_summary.fields[0]?.[column]}
                                  </Badge>
                                </Group>
                              </Table.Th>
                            ))}
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {data_summary.fields.slice(0, visibleRows).map((field: any, index: number) => (
                            <Table.Tr 
                              key={index}
                              style={{ cursor: onFieldClick ? 'pointer' : 'default' }}
                              onClick={() => onFieldClick?.(field.name || field.api_name, data_summary.object_name)}
                            >
                              {fieldColumns.map((column) => (
                                <Table.Td key={column}>
                                  {column === 'name' || column === 'api_name' ? (
                                    <Group gap="xs">
                                      <Code>{field[column]}</Code>
                                      {field.label && field.label !== field[column] && (
                                        <Text size="xs" c="dimmed">({field.label})</Text>
                                      )}
                                    </Group>
                                  ) : column === 'type' ? (
                                    <Badge size="sm" variant="light">
                                      {field[column]}
                                    </Badge>
                                  ) : column === 'required' ? (
                                    field[column] ? (
                                      <ThemeIcon size="sm" color="red" variant="light">
                                        <IconCheck size={12} />
                                      </ThemeIcon>
                                    ) : (
                                      <ThemeIcon size="sm" color="gray" variant="light">
                                        <IconX size={12} />
                                      </ThemeIcon>
                                    )
                                  ) : column === 'description' ? (
                                    <Text size="sm">{field[column] || tSync('aiAssistant.smartResponse.noDescription', 'No description')}</Text>
                                  ) : (
                                    <Text size="sm">
                                      {field[column] !== undefined 
                                        ? String(field[column] || '') 
                                        : <Text c="dimmed" fs="italic">—</Text>
                                      }
                                    </Text>
                                  )}
                                </Table.Td>
                              ))}
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    </ScrollArea.Autosize>
                  ) : (
                    <Alert color="yellow" variant="light">
                      <Text size="sm">{tSync('aiAssistant.smartResponse.noDataToDisplay', 'No data available to display')}</Text>
                    </Alert>
                  );
                })()}
              </Stack>
            </Card.Section>
          )}
        </Card>
      );
    }

    // Multiple objects metadata
    if (data_summary.objects && Array.isArray(data_summary.objects)) {
      return (
        <Stack gap="md">
          <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
            {tSync('aiAssistant.smartResponse.foundObjects', 'Found {count} related objects. Select one to view details.').replace('{count}', data_summary.objects.length.toString())}
          </Alert>
          
          <Grid>
            {data_summary.objects.map((obj: any, index: number) => (
              <Grid.Col key={index} span={{ base: 12, sm: 6, md: 4 }}>
                <Card 
                  shadow="sm" 
                  radius="md" 
                  withBorder
                  style={{ 
                    cursor: 'pointer',
                    borderColor: selectedObject === obj.name ? 'var(--mantine-color-blue-6)' : undefined
                  }}
                  onClick={() => {
                    setSelectedObject(obj.name);
                    onObjectSelect?.(obj.name);
                  }}
                >
                  <Group justify="space-between" mb="xs">
                    <Group>
                      <ThemeIcon color="blue" variant="light">
                        <IconDatabase size={16} />
                      </ThemeIcon>
                      <Text fw={500}>{obj.name}</Text>
                    </Group>
                    <Badge size="sm" variant="light">
                      {obj.total_fields} fields
                    </Badge>
                  </Group>
                  
                  <Text size="sm" c="dimmed" mb="xs">
                    {obj.label || obj.name}
                  </Text>
                  
                  {obj.fields && obj.fields.length > 0 && (
                    <Stack gap="xs">
                      <Text size="xs" fw={500}>{tSync('aiAssistant.smartResponse.sampleFields', 'Sample Fields:')}</Text>
                      {obj.fields.slice(0, 3).map((field: any, fieldIndex: number) => (
                        <Group key={fieldIndex} gap="xs">
                            <Code>{field.name}</Code>
                          <Badge size="xs" variant="light">{field.type}</Badge>
                        </Group>
                      ))}
                      {obj.fields.length > 3 && (
                        <Text size="xs" c="dimmed">
                          {tSync('aiAssistant.smartResponse.moreFields', '+{count} more fields').replace('{count}', (obj.fields.length - 3).toString())}
                        </Text>
                      )}
                    </Stack>
                  )}
                </Card>
              </Grid.Col>
            ))}
          </Grid>
        </Stack>
      );
    }

    return null;
  };

  const renderDataQuery = () => {
    const { data_summary } = structuredResponse;
    if (!data_summary) return null;

    // Get records from the new LLM-friendly structure
    const records = data_summary.records || data_summary.sample_records || [];
    
    // Dynamic column detection - collect all unique columns from all records
    const getDynamicColumns = (records: any[]) => {
      if (!records || records.length === 0) return [];
      
      const allColumns = new Set<string>();
      records.forEach(record => {
        if (record && typeof record === 'object') {
          Object.keys(record).forEach(key => {
            // Handle new flattened structure - related records are now arrays
            if (Array.isArray(record[key])) {
              // This is a related records array (e.g., OCE__MeetingMember__r)
              allColumns.add(key);
            } else if (typeof record[key] !== 'object' || record[key] === null) {
              // Regular field
              allColumns.add(key);
            }
          });
        }
      });
      
      // Sort columns for consistent ordering (Id first, then alphabetically)
      return Array.from(allColumns).sort((a, b) => {
        if (a.toLowerCase() === 'id') return -1;
        if (b.toLowerCase() === 'id') return 1;
        return a.localeCompare(b);
      });
    };

    const dynamicColumns = getDynamicColumns(records);

    // Helper function to render flattened relationship data (now arrays)
    const renderFlattenedRelationship = (relationshipArray: any[], relationshipName: string) => {
      if (!relationshipArray || relationshipArray.length === 0) {
        return <Text size="sm" c="dimmed">{tSync('aiAssistant.smartResponse.noRelationshipFound', 'No {relationshipName} found').replace('{relationshipName}', relationshipName)}</Text>;
      }

      return (
        <Stack gap="xs">
          <Text size="xs" fw={500} c="blue">
            {relationshipName} ({relationshipArray.length})
          </Text>
          <Stack gap="xs">
            {relationshipArray.map((relRecord: any, relIndex: number) => (
              <Group key={relIndex} gap="xs" p="xs" style={{ backgroundColor: 'var(--mantine-color-gray-0)', borderRadius: '4px' }}>
                {Object.entries(relRecord).map(([key, value]) => (
                  <Group key={key} gap="xs">
                    <Text size="xs" fw={500} c="dimmed">{key}:</Text>
                    <Code>{String(value)}</Code>
                  </Group>
                ))}
              </Group>
            ))}
          </Stack>
        </Stack>
      );
    };

    return (
      <Card shadow="sm" radius="md" withBorder>
        <Card.Section withBorder inheritPadding py="xs">
          <Group justify="space-between">
            <Group>
              <ThemeIcon color="green" variant="light">
                <IconTable size={16} />
              </ThemeIcon>
              <Title order={4}>{tSync('aiAssistant.smartResponse.queryResults', 'Query Results')}</Title>
            </Group>
            <Group>
              {structuredResponse.confidence !== null && structuredResponse.confidence_label !== 'unknown' && (
                <Badge color={getConfidenceColor(structuredResponse.confidence)}>
                  {getConfidenceLabel(structuredResponse.confidence_label)} {tSync('aiAssistant.smartResponse.confidence.label', 'Confidence')}
                </Badge>
              )}
              <Text size="sm" c="dimmed">
                {records.length} {tSync('aiAssistant.smartResponse.records', 'records')}
                {data_summary.metadata?.total_size > 0 && data_summary.metadata.total_size > records.length && (
                  <Text component="span" c="dimmed"> of {data_summary.metadata.total_size}</Text>
                )}
              </Text>
            </Group>
          </Group>
        </Card.Section>

        {data_summary.query_executed && (
          <Card.Section inheritPadding py="md">
            <Stack gap="sm">
              <Text fw={500}>{tSync('aiAssistant.smartResponse.generatedSoql', 'Generated SOQL Query:')}</Text>
              <Code block>{data_summary.query_executed}</Code>
            </Stack>
          </Card.Section>
        )}

        {records.length > 0 && (
          <Card.Section inheritPadding py="md">
            <Stack gap="sm">
              <Group justify="space-between">
                <Text fw={500}>{tSync('aiAssistant.smartResponse.sampleRecords', 'Sample Records')}</Text>
                {data_summary.metadata?.done === false && data_summary.metadata?.nextRecordsUrl && (
                  <Button 
                    size="sm" 
                    variant="light"
                    style={{ 
                      fontSize: '12px',
                      lineHeight: '1.2',
                      padding: '4px 8px',
                      minHeight: 'auto'
                    }}
                  >
                    {tSync('aiAssistant.smartResponse.loadMore', 'Load More')} ({data_summary.metadata.total_size - records.length})
                  </Button>
                )}
              </Group>
              
              {dynamicColumns.length > 0 ? (
                <ScrollArea.Autosize mah={600}>
                  <Table striped highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        {dynamicColumns.map((column) => (
                          <Table.Th key={column}>
                            <Group gap="xs">
                              <Text fw={500}>{column}</Text>
                              <Badge size="xs" variant="light" color="gray">
                                {typeof records[0]?.[column]}
                              </Badge>
                            </Group>
                          </Table.Th>
                        ))}
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {records.slice(0, visibleRows).map((record: any, index: number) => (
                        <Table.Tr key={index}>
                          {dynamicColumns.map((column) => (
                            <Table.Td key={column}>
                              {(() => {
                                const cellValue = record[column];
                                
                                // Check if this is a flattened relationship array
                                if (Array.isArray(cellValue)) {
                                  return renderFlattenedRelationship(cellValue, column);
                                }
                                
                                // Regular field value
                                return (
                                  <Text size="sm">
                                    {cellValue !== undefined 
                                      ? String(cellValue || '') 
                                      : <Text c="dimmed" fs="italic">—</Text>
                                    }
                                  </Text>
                                );
                              })()}
                            </Table.Td>
                          ))}
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </ScrollArea.Autosize>
              ) : (
                <Alert color="yellow" variant="light">
                  <Text size="sm">{tSync('aiAssistant.smartResponse.noDataToDisplay', 'No data available to display')}</Text>
                </Alert>
              )}
            </Stack>
          </Card.Section>
        )}
      </Card>
    );
  };

  const renderClarification = () => {
    const { data_summary, candidate_objects, instruction, clarification, intent_understood } = structuredResponse;
    
    // Use clarification object if available, otherwise fall back to old structure
    const clarificationQuestion = clarification?.question || instruction || data_summary?.clarification_reason || tSync('aiAssistant.smartResponse.clarificationReason', 'Please select which object you want to explore.');
    const clarificationOptions = clarification?.options || [];
    const detectedObject = clarification?.detected_object;

    return (
      <Alert icon={<IconHelp size={16} />} color="yellow" variant="light">
        <Stack gap="md">
          <div>
            <Text fw={500} mb="xs">{tSync('aiAssistant.smartResponse.clarificationTitle', 'Clarification Needed')}</Text>
            
            {intent_understood && (
              <Text size="sm" c="blue" mb="sm">
                <Text fw={500} component="span">{tSync('aiAssistant.smartResponse.intentUnderstood', 'Intent understood:')} </Text>
                {intent_understood}
              </Text>
            )}
            
            {clarificationQuestion && (
              <Text size="sm" c="blue" mb="sm">
                <Text fw={500} component="span">{tSync('aiAssistant.smartResponse.clarificationQuestion', 'Clarification question:')} </Text>
                {clarificationQuestion}
              </Text>
            )}
            
            {detectedObject && (
              <Text size="sm" c="blue" mb="sm">
                {tSync('aiAssistant.smartResponse.detectedObject', 'Detected object:')} <Code>{detectedObject}</Code>
              </Text>
            )}
            
            {clarificationOptions.length > 0 && (
              <div>
                <Text size="sm" fw={500} mb="xs">{tSync('aiAssistant.smartResponse.pleaseChooseOptions', 'Please choose one of the following options:')}</Text>
                <Stack gap="xs">
                  {clarificationOptions.map((option, index) => (
                    <Text key={index} size="sm" c="dimmed">
                      • {option}
                    </Text>
                  ))}
                </Stack>
              </div>
            )}
          </div>

          {candidate_objects && candidate_objects.length > 0 && (
            <Grid>
              {candidate_objects.map((obj: any, index: number) => (
                <Grid.Col key={index} span={{ base: 12, sm: 6 }}>
                  <Card 
                    shadow="sm" 
                    radius="md" 
                    withBorder
                    style={{ cursor: 'pointer' }}
                    onClick={() => onObjectSelect?.(obj.api_name)}
                  >
                    <Group justify="space-between" mb="xs">
                      <Group>
                        <ThemeIcon color="blue" variant="light">
                          <IconDatabase size={16} />
                        </ThemeIcon>
                        <Text fw={500}>{obj.api_name}</Text>
                        {obj.label && obj.label !== obj.api_name && (
                          <Text size="xs" c="dimmed">({obj.label})</Text>
                        )}
                      </Group>
                      <Group>
                        {obj.confidence && (
                          <Progress 
                            value={obj.confidence * 100} 
                            size="sm" 
                            w={60}
                            color="blue"
                          />
                        )}
                      </Group>
                    </Group>
                    
                    <Text size="sm" c="dimmed" mb="xs">
                      {obj.match_reason || tSync('aiAssistant.smartResponse.noDescription', 'No description')}
                    </Text>
                    
                    <Group justify="space-between">
                      <Text size="xs" c="dimmed">
                        {obj.confidence ? `${Math.round(obj.confidence * 100)}% match` : tSync('aiAssistant.smartResponse.fieldsAvailable', 'fields available')}
                      </Text>
                      <Button 
                        size="sm" 
                        variant="light" 
                        rightSection={<IconArrowRight size={12} />}
                        style={{ 
                          fontSize: '12px',
                          lineHeight: '1.2',
                          padding: '4px 8px',
                          minHeight: 'auto'
                        }}
                      >
                        {tSync('aiAssistant.smartResponse.explore', 'Explore')}
                      </Button>
                    </Group>
                  </Card>
                </Grid.Col>
              ))}
            </Grid>
          )}
        </Stack>
      </Alert>
    );
  };

  const renderDynamicRelationshipTable = (relationships: any[]) => {
    if (!relationships || relationships.length === 0) return null;

    // Get all unique keys from all relationship objects
    const allKeys = new Set<string>();
    relationships.forEach(rel => {
      Object.keys(rel).forEach(key => allKeys.add(key));
    });

    const columns = Array.from(allKeys).filter(key => key !== 'error');

    if (columns.length === 0) return null;

    return (
      <ScrollArea>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              {columns.map(column => (
                <Table.Th key={column}>
                  {column === 'field_name' ? tSync('aiAssistant.smartResponse.fieldName', 'Field Name') :
                   column === 'relationship_name' ? tSync('aiAssistant.smartResponse.relationshipName', 'Relationship Name') :
                   column === 'child_object' ? tSync('aiAssistant.smartResponse.childObject', 'Child Object') :
                   column === 'reference_to' ? tSync('aiAssistant.smartResponse.referenceTo', 'Reference To') :
                   column === 'label' ? tSync('aiAssistant.smartResponse.label', 'Label') :
                   column.charAt(0).toUpperCase() + column.slice(1).replace(/_/g, ' ')}
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {relationships.map((rel, index) => (
              <Table.Tr key={index}>
                {columns.map(column => (
                  <Table.Td key={column}>
                    {column === 'reference_to' && Array.isArray(rel[column]) ? 
                      rel[column].join(', ') :
                      rel[column] || '-'
                    }
                  </Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    );
  };

  const renderFieldDetailsQuery = () => {
    const { data_summary } = structuredResponse;
    if (!data_summary) return null;

    // Check if this is a single field details or multiple fields
    const isMultipleFields = data_summary.fields && Array.isArray(data_summary.fields);
    
    if (isMultipleFields) {
      // Multiple fields - render as a table
      return (
        <Card shadow="sm" radius="md" withBorder>
          <Card.Section withBorder inheritPadding py="xs">
            <Group justify="space-between">
              <Group>
                <ThemeIcon color="orange" variant="light">
                  <IconInfoCircle size={16} />
                </ThemeIcon>
                <Title order={4}>{tSync('aiAssistant.smartResponse.fieldDetails', 'Field Details')}</Title>
                <Badge color="orange" variant="light">
                  {data_summary.object_name}
                </Badge>
              </Group>
              <Group>
                <Text size="sm" c="dimmed">
                  {data_summary.fields.length} fields
                  {data_summary.total_fields && data_summary.total_fields > data_summary.fields.length && (
                    <Text component="span" c="dimmed"> of {data_summary.total_fields}</Text>
                  )}
                </Text>
                {(() => {
                  // Show pagination button if there are more fields
                  const pagination = data_summary.pagination;
                  const currentOffset = pagination?.field_offset || 0;
                  const fieldLimit = pagination?.field_limit || 20;
                  const totalFields = data_summary.total_fields || 0;
                  
                  if (totalFields > 0 && totalFields > data_summary.fields.length) {
                    const remaining = totalFields - data_summary.fields.length;
                    return (
                      <Button 
                        size="sm" 
                        variant="light"
                        onClick={() => {
                          const objectName = data_summary.object_name;
                          const nextOffset = currentOffset + fieldLimit;
                          onShowMoreClick?.(objectName, nextOffset);
                        }}
                        style={{ 
                          fontSize: '12px',
                          lineHeight: '1.2',
                          padding: '4px 8px',
                          minHeight: 'auto'
                        }}
                      >
                        {tSync('aiAssistant.smartResponse.showMore', 'Show More')} ({remaining})
                      </Button>
                    );
                  }
                  return null;
                })()}
              </Group>
            </Group>
          </Card.Section>

          <Card.Section inheritPadding py="md">
            <Stack gap="sm">
              <Text fw={500}>{tSync('aiAssistant.smartResponse.fields', 'Fields')}</Text>
              
              {(() => {
                // Dynamic column detection for field details
                const getFieldColumns = (fields: any[]) => {
                  if (!fields || fields.length === 0) return [];
                  
                  const allColumns = new Set<string>();
                  fields.forEach(field => {
                    if (field && typeof field === 'object') {
                      Object.keys(field).forEach(key => allColumns.add(key));
                    }
                  });
                  
                  // Sort columns for consistent ordering (name first, then alphabetically)
                  return Array.from(allColumns).sort((a, b) => {
                    if (a.toLowerCase() === 'name') return -1;
                    if (b.toLowerCase() === 'name') return 1;
                    if (a.toLowerCase() === 'type') return -1;
                    if (b.toLowerCase() === 'type') return 1;
                    if (a.toLowerCase() === 'required') return -1;
                    if (b.toLowerCase() === 'required') return 1;
                    return a.localeCompare(b);
                  });
                };

                const fieldColumns = getFieldColumns(data_summary.fields);

                return fieldColumns.length > 0 ? (
                  <ScrollArea.Autosize mah={400}>
                    <Table striped highlightOnHover>
                      <Table.Thead>
                        <Table.Tr>
                          {fieldColumns.map((column) => (
                            <Table.Th key={column}>
                              <Group gap="xs">
                                <Text fw={500}>
                                  {column === 'name' ? tSync('aiAssistant.smartResponse.fieldName', 'Field Name') :
                                   column === 'type' ? tSync('aiAssistant.smartResponse.type', 'Type') :
                                   column === 'required' ? tSync('aiAssistant.smartResponse.required', 'Required') :
                                   column === 'description' ? tSync('aiAssistant.smartResponse.description', 'Description') :
                                   column === 'label' ? tSync('aiAssistant.smartResponse.label', 'Label') :
                                   column.charAt(0).toUpperCase() + column.slice(1)}
                                </Text>
                                <Badge size="xs" variant="light" color="gray">
                                  {typeof data_summary.fields[0]?.[column]}
                                </Badge>
                              </Group>
                            </Table.Th>
                          ))}
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {data_summary.fields.slice(0, visibleRows).map((field: any, index: number) => (
                          <Table.Tr 
                            key={index}
                            style={{ cursor: onFieldClick ? 'pointer' : 'default' }}
                            onClick={() => onFieldClick?.(field.name || field.api_name, data_summary.object_name)}
                          >
                            {fieldColumns.map((column) => (
                              <Table.Td key={column}>
                                {column === 'name' || column === 'api_name' ? (
                                  <Group gap="xs">
                                    <Code>{field[column]}</Code>
                                    {field.label && field.label !== field[column] && (
                                      <Text size="xs" c="dimmed">({field.label})</Text>
                                    )}
                                  </Group>
                                ) : column === 'type' ? (
                                  <Badge size="sm" variant="light">
                                    {field[column]}
                                  </Badge>
                                ) : column === 'required' ? (
                                  field[column] ? (
                                    <ThemeIcon size="sm" color="red" variant="light">
                                      <IconCheck size={12} />
                                    </ThemeIcon>
                                  ) : (
                                    <ThemeIcon size="sm" color="gray" variant="light">
                                      <IconX size={12} />
                                    </ThemeIcon>
                                  )
                                ) : column === 'description' ? (
                                  <Text size="sm">{field[column] || tSync('aiAssistant.smartResponse.noDescription', 'No description')}</Text>
                                ) : (
                                  <Text size="sm">
                                    {field[column] !== undefined 
                                      ? String(field[column] || '') 
                                      : <Text c="dimmed" fs="italic">—</Text>
                                    }
                                  </Text>
                                )}
                              </Table.Td>
                            ))}
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </ScrollArea.Autosize>
                ) : (
                  <Alert color="yellow" variant="light">
                    <Text size="sm">{tSync('aiAssistant.smartResponse.noDataToDisplay', 'No data available to display')}</Text>
                  </Alert>
                );
              })()}
            </Stack>
          </Card.Section>
        </Card>
      );
    } else {
      // Single field details - render detailed view
      const fieldDetails = data_summary;

      return (
        <Card shadow="sm" radius="md" withBorder>
          <Card.Section withBorder inheritPadding py="xs">
            <Group>
              <ThemeIcon color="orange" variant="light">
                <IconInfoCircle size={16} />
              </ThemeIcon>
              <Title order={4}>{tSync('aiAssistant.smartResponse.fieldDetails', 'Field Details')}</Title>
              <Badge color="orange" variant="light">
                {fieldDetails.object_name}.{fieldDetails.field_name}
              </Badge>
            </Group>
          </Card.Section>

          <Card.Section inheritPadding py="md">
            <Stack gap="md">
              {/* Basic Field Information */}
              <div>
                <Text fw={500} mb="sm">{tSync('aiAssistant.smartResponse.basicInformation', 'Basic Information')}</Text>
                <Table striped highlightOnHover>
                  <Table.Tbody>
                    <Table.Tr>
                      <Table.Td fw={500}>{tSync('aiAssistant.smartResponse.fieldName', 'Field Name')}</Table.Td>
                      <Table.Td><Code>{fieldDetails.field_name}</Code></Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Td fw={500}>{tSync('aiAssistant.smartResponse.label', 'Label')}</Table.Td>
                      <Table.Td>{fieldDetails.label || '-'}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Td fw={500}>{tSync('aiAssistant.smartResponse.type', 'Type')}</Table.Td>
                      <Table.Td><Badge variant="light">{fieldDetails.type}</Badge></Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Td fw={500}>{tSync('aiAssistant.smartResponse.required', 'Required')}</Table.Td>
                      <Table.Td>
                        {fieldDetails.required ? (
                          <ThemeIcon size="sm" color="red" variant="light">
                            <IconCheck size={12} />
                          </ThemeIcon>
                        ) : (
                          <ThemeIcon size="sm" color="gray" variant="light">
                            <IconX size={12} />
                          </ThemeIcon>
                        )}
                      </Table.Td>
                    </Table.Tr>
                    {fieldDetails.length !== undefined && fieldDetails.length !== null && (
                      <Table.Tr>
                        <Table.Td fw={500}>{tSync('aiAssistant.smartResponse.length', 'Length')}</Table.Td>
                        <Table.Td>{fieldDetails.length}</Table.Td>
                      </Table.Tr>
                    )}
                    {fieldDetails.precision !== undefined && fieldDetails.precision !== null && (
                      <Table.Tr>
                        <Table.Td fw={500}>{tSync('aiAssistant.smartResponse.precision', 'Precision')}</Table.Td>
                        <Table.Td>{fieldDetails.precision}</Table.Td>
                      </Table.Tr>
                    )}
                    {fieldDetails.scale !== undefined && fieldDetails.scale !== null && (
                      <Table.Tr>
                        <Table.Td fw={500}>{tSync('aiAssistant.smartResponse.scale', 'Scale')}</Table.Td>
                        <Table.Td>{fieldDetails.scale}</Table.Td>
                      </Table.Tr>
                    )}
                  </Table.Tbody>
                </Table>
              </div>

              {/* Field Properties */}
              {((fieldDetails.unique === true) || (fieldDetails.calculated === true) || (fieldDetails.createable !== undefined) || (fieldDetails.updateable !== undefined)) && (
                <div>
                  <Text fw={500} mb="sm">{tSync('aiAssistant.smartResponse.fieldProperties', 'Field Properties')}</Text>
                  <Table striped highlightOnHover>
                    <Table.Tbody>
                      {fieldDetails.unique === true && (
                        <Table.Tr>
                          <Table.Td fw={500}>{tSync('aiAssistant.smartResponse.unique', 'Unique')}</Table.Td>
                          <Table.Td>
                            <ThemeIcon size="sm" color="green" variant="light">
                              <IconCheck size={12} />
                            </ThemeIcon>
                          </Table.Td>
                        </Table.Tr>
                      )}
                      {fieldDetails.calculated === true && (
                        <Table.Tr>
                          <Table.Td fw={500}>{tSync('aiAssistant.smartResponse.calculated', 'Calculated')}</Table.Td>
                          <Table.Td>
                            <ThemeIcon size="sm" color="blue" variant="light">
                              <IconCheck size={12} />
                            </ThemeIcon>
                          </Table.Td>
                        </Table.Tr>
                      )}
                      {fieldDetails.createable !== undefined && (
                        <Table.Tr>
                          <Table.Td fw={500}>{tSync('aiAssistant.smartResponse.createable', 'Createable')}</Table.Td>
                          <Table.Td>
                            {fieldDetails.createable ? (
                              <ThemeIcon size="sm" color="green" variant="light">
                                <IconCheck size={12} />
                              </ThemeIcon>
                            ) : (
                              <ThemeIcon size="sm" color="gray" variant="light">
                                <IconX size={12} />
                              </ThemeIcon>
                            )}
                          </Table.Td>
                        </Table.Tr>
                      )}
                      {fieldDetails.updateable !== undefined && (
                        <Table.Tr>
                          <Table.Td fw={500}>{tSync('aiAssistant.smartResponse.updateable', 'Updateable')}</Table.Td>
                          <Table.Td>
                            {fieldDetails.updateable ? (
                              <ThemeIcon size="sm" color="green" variant="light">
                                <IconCheck size={12} />
                              </ThemeIcon>
                            ) : (
                              <ThemeIcon size="sm" color="gray" variant="light">
                                <IconX size={12} />
                              </ThemeIcon>
                            )}
                          </Table.Td>
                        </Table.Tr>
                      )}
                    </Table.Tbody>
                  </Table>
                </div>
              )}

              {/* Reference Information */}
              {fieldDetails.reference_to && fieldDetails.reference_to.length > 0 && (
                <div>
                  <Text fw={500} mb="sm">{tSync('aiAssistant.smartResponse.referenceTo', 'Reference To')}</Text>
                  <Group gap="xs">
                    {fieldDetails.reference_to.map((ref: string, index: number) => (
                      <Badge key={index} variant="light" color="blue">
                        {ref}
                      </Badge>
                    ))}
                  </Group>
                </div>
              )}

              {/* Formula */}
              {fieldDetails.formula && (
                <div>
                  <Text fw={500} mb="sm">{tSync('aiAssistant.smartResponse.formula', 'Formula')}</Text>
                  <Code block>{fieldDetails.formula}</Code>
                </div>
              )}

              {/* Picklist Values */}
              {fieldDetails.picklist_values && fieldDetails.picklist_values.length > 0 && (
                <div>
                  <Group justify="space-between" mb="sm">
                    <Text fw={500}>{tSync('aiAssistant.smartResponse.picklistValues', 'Picklist Values')}</Text>
                    <Button 
                      size="sm" 
                      variant="light"
                      onClick={() => openPicklistModal(fieldDetails.picklist_values)}
                    >
                      {tSync('aiAssistant.smartResponse.viewAllValues', 'View All Values')} ({fieldDetails.picklist_values.length})
                    </Button>
                  </Group>
                  
                  {/* Show first 3 values as preview */}
                  <Stack gap="xs">
                    {fieldDetails.picklist_values.slice(0, 3).map((value: any, index: number) => (
                      <Group key={index} justify="space-between">
                        <Group gap="xs">
                          <Code>{value.value}</Code>
                          <Text size="sm">{value.label}</Text>
                        </Group>
                        <Group gap="xs">
                          {value.active && (
                            <Badge size="xs" color="green" variant="light">
                              {tSync('aiAssistant.smartResponse.active', 'Active')}
                            </Badge>
                          )}
                          {value.default_value && (
                            <Badge size="xs" color="blue" variant="light">
                              {tSync('aiAssistant.smartResponse.default', 'Default')}
                            </Badge>
                          )}
                        </Group>
                      </Group>
                    ))}
                    {fieldDetails.picklist_values.length > 3 && (
                      <Text size="xs" c="dimmed" ta="center">
                        {tSync('aiAssistant.smartResponse.andMoreValues', '... and {count} more values').replace('{count}', (fieldDetails.picklist_values.length - 3).toString())}
                      </Text>
                    )}
                  </Stack>
                </div>
              )}
            </Stack>
          </Card.Section>
        </Card>
      );
    }
  };

  const renderRelationshipQuery = () => {
    const { data_summary } = structuredResponse;
    if (!data_summary || !data_summary.object_name) return null;

    // Backend returns: { "object_name": "OCE__Meeting__c", "parent_relationships": [...], "child_relationships": [...], "lookup_relationships": [...] }
    const objectName = data_summary.object_name;

    return (
      <Card shadow="sm" radius="md" withBorder>
        <Card.Section withBorder inheritPadding py="xs">
          <Group>
            <ThemeIcon color="purple" variant="light">
              <IconGitBranch size={16} />
            </ThemeIcon>
            <Title order={4}>{tSync('aiAssistant.smartResponse.objectRelationships', 'Object Relationships')}</Title>
            <Badge color="purple" variant="light">
              {objectName}
            </Badge>
          </Group>
        </Card.Section>

        <Card.Section inheritPadding py="md">
          <Stack gap="md">
            {data_summary.parent_relationships && 
             data_summary.parent_relationships.length > 0 && (
              <div>
                <Text fw={500} mb="sm">{tSync('aiAssistant.smartResponse.parentRelationships', 'Parent Relationships')}</Text>
                {renderDynamicRelationshipTable(data_summary.parent_relationships)}
              </div>
            )}

            {data_summary.child_relationships && 
             data_summary.child_relationships.length > 0 && (
              <div>
                <Text fw={500} mb="sm">{tSync('aiAssistant.smartResponse.childRelationships', 'Child Relationships')}</Text>
                {renderDynamicRelationshipTable(data_summary.child_relationships)}
              </div>
            )}

            {data_summary.lookup_relationships && 
             data_summary.lookup_relationships.length > 0 && (
              <div>
                <Text fw={500} mb="sm">{tSync('aiAssistant.smartResponse.lookupRelationships', 'Lookup Relationships')}</Text>
                {renderDynamicRelationshipTable(data_summary.lookup_relationships)}
              </div>
            )}

            {/* Show message if no relationships found */}
            {(!data_summary.parent_relationships || data_summary.parent_relationships.length === 0) &&
             (!data_summary.child_relationships || data_summary.child_relationships.length === 0) &&
             (!data_summary.lookup_relationships || data_summary.lookup_relationships.length === 0) && (
              <Alert color="blue" variant="light">
                <Text size="sm">{tSync('aiAssistant.smartResponse.noRelationshipsFound', 'No relationships found for this object.')}</Text>
              </Alert>
            )}
          </Stack>
        </Card.Section>
      </Card>
    );
  };


  const renderSuggestions = () => {
    if (!structuredResponse.suggestions || structuredResponse.suggestions.length === 0) {
      return null;
    }

    return (
      <Card shadow="sm" radius="md" withBorder>
        <Card.Section withBorder inheritPadding py="xs">
          <Group>
            <ThemeIcon color="green" variant="light">
              <IconSparkles size={16} />
            </ThemeIcon>
            <Title order={5}>{tSync('aiAssistant.smartResponse.suggestions', 'Suggestions')}</Title>
          </Group>
        </Card.Section>
        
        <Card.Section inheritPadding py="md">
          <Group gap="sm">
            {structuredResponse.suggestions.map((suggestion, index) => (
              <Button
                key={index}
                size="sm"
                variant="light"
                onClick={() => onSuggestionClick?.(suggestion)}
                style={{ 
                  fontSize: '13px',
                  lineHeight: '1.3',
                  padding: '6px 12px',
                  minHeight: 'auto',
                  whiteSpace: 'normal',
                  wordBreak: 'break-word'
                }}
              >
                {suggestion}
              </Button>
            ))}
          </Group>
        </Card.Section>
      </Card>
    );
  };

  const renderResponseContent = () => {
    switch (structuredResponse.response_type) {
      case 'metadata_query':
        return renderMetadataQuery();
      case 'data_query':
        return renderDataQuery();
      case 'clarification_needed':
        return renderClarification();
      case 'relationship_query':
        return renderRelationshipQuery();
      case 'field_details_query':
        return renderFieldDetailsQuery();
      default:
        return (
          <Alert color="gray" variant="light">
            <Text>{tSync('aiAssistant.smartResponse.unknownResponseType', 'Unknown response type: {type}').replace('{type}', structuredResponse.response_type)}</Text>
          </Alert>
        );
    }
  };

  return (
    <Stack gap="md" className="smart-response-streaming">
      {/* Intent and Confidence Header */}
      {visibleSections.has('header') && (
        <Paper p="md" radius="md" withBorder>
          <Group justify="space-between" mb="sm">
            <Group>
              <ThemeIcon color="blue" variant="light">
                <IconInfoCircle size={16} />
              </ThemeIcon>
              <Text fw={500}>{tSync('aiAssistant.smartResponse.intentUnderstanding', 'Intent Understanding')}</Text>
            </Group>
            {structuredResponse.confidence !== null && structuredResponse.confidence_label !== 'unknown' && (
              <Badge color={getConfidenceColor(structuredResponse.confidence)}>
                {getConfidenceLabel(structuredResponse.confidence_label)} {tSync('aiAssistant.smartResponse.confidence.label', 'Confidence')}
              </Badge>
            )}
          </Group>
          
          <Text size="sm" c="dimmed" mb="sm">
            {structuredResponse.intent_understood || tSync('aiAssistant.smartResponse.intentNotAvailable', 'Intent analysis not available')}
          </Text>
        </Paper>
      )}

      {/* Main Response Content */}
      {visibleSections.has('content') && renderResponseContent()}

      {/* Suggestions */}
      {visibleSections.has('suggestions') && renderSuggestions()}

      {/* Picklist Values Modal */}
      {picklistModalOpen && (
        <div 
          className="ai-assistant-picklist-modal-overlay" 
          onClick={() => setPicklistModalOpen(false)}
        >
          <div 
            className="ai-assistant-picklist-modal" 
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ai-assistant-picklist-modal-header">
              <h3>{tSync('aiAssistant.smartResponse.picklistValues', 'Picklist Values')}</h3>
              <button 
                className="ai-assistant-picklist-modal-close"
                onClick={() => setPicklistModalOpen(false)}
              >
                {tSync('aiAssistant.smartResponse.closeModal', '×')}
              </button>
            </div>
            
            <div className="ai-assistant-picklist-modal-content">
              <Text size="sm" c="dimmed" mb="md">
                {tSync('aiAssistant.smartResponse.picklistValuesDescription', 'All available picklist values for this field')}
              </Text>
          
          <ScrollArea.Autosize mah={400}>
            {picklistData.length > 0 ? (
              (() => {
                // Get all unique keys from the picklist data
                const allKeys = new Set<string>();
                picklistData.forEach(item => {
                  Object.keys(item).forEach(key => allKeys.add(key));
                });
                
                // Convert to array and sort for consistent ordering
                const columns = Array.from(allKeys).sort();
                
                return (
                  <Table 
                    striped 
                    highlightOnHover
                    className="ai-assistant-picklist-values-table"
                  >
                    <Table.Thead>
                      <Table.Tr>
                        {columns.map(column => (
                          <Table.Th key={column}>
                            {tSync(`aiAssistant.smartResponse.${column}`, column) || column}
                          </Table.Th>
                        ))}
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {picklistData.map((value: any, index: number) => (
                        <Table.Tr key={index}>
                          {columns.map(column => (
                            <Table.Td key={column}>
                              {(() => {
                                const cellValue = value[column];
                                
                                // Handle boolean values with icons
                                if (typeof cellValue === 'boolean') {
                                  return (
                                    <ThemeIcon 
                                      size="sm" 
                                      color={cellValue ? "green" : "gray"} 
                                      variant="light"
                                    >
                                      {cellValue ? <IconCheck size={12} /> : <IconX size={12} />}
                                    </ThemeIcon>
                                  );
                                }
                                
                                // Handle string values
                                if (typeof cellValue === 'string') {
                                  // If it's a value field, show as code
                                  if (column === 'value') {
                                    return <Code>{cellValue}</Code>;
                                  }
                                  return cellValue;
                                }
                                
                                // Handle other types
                                return String(cellValue);
                              })()}
                            </Table.Td>
                          ))}
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                );
              })()
            ) : (
              <Text size="sm" c="dimmed" ta="center" py="xl">
                {tSync('aiAssistant.smartResponse.noDataToDisplay')}
              </Text>
            )}
              </ScrollArea.Autosize>
            </div>
          </div>
        </div>
      )}
    </Stack>
  );
};
