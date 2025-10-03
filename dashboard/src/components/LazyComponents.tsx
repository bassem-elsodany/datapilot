import React, { Suspense } from 'react';
import { LoadingOverlay } from '@mantine/core';

// Lazy load heavy components
export const LazyQueryEditorPage = React.lazy(() => import('./query-editor').then(module => ({ default: module.QueryEditorPage })));
export const LazyResultsViewPage = React.lazy(() => import('./ResultsViewPage').then(module => ({ default: module.ResultsViewPage })));
export const LazySavedConnectionsManager = React.lazy(() => import('./SavedConnectionsManager').then(module => ({ default: module.SavedConnectionsManager })));
export const LazySchemaTree = React.lazy(() => import('./SchemaTree').then(module => ({ default: module.SchemaTree })));
export const LazySmartAuthenticationFlow = React.lazy(() => import('./SmartAuthenticationFlow').then(module => ({ default: module.SmartAuthenticationFlow })));
export const LazyAppDebug = React.lazy(() => import('./AppDebug').then(module => ({ default: module.AppDebug })));

// Loading component for Suspense fallback
export const ComponentLoader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Suspense fallback={<LoadingOverlay visible={true} />}>
    {children}
  </Suspense>
);

// Wrapper components for lazy-loaded components
export const QueryEditorPageWrapper: React.FC<any> = (props) => (
  <ComponentLoader>
    <LazyQueryEditorPage {...props} />
  </ComponentLoader>
);

export const ResultsViewPageWrapper: React.FC<any> = (props) => (
  <ComponentLoader>
    <LazyResultsViewPage {...props} />
  </ComponentLoader>
);

export const SavedConnectionsManagerWrapper: React.FC<any> = (props) => (
  <ComponentLoader>
    <LazySavedConnectionsManager {...props} />
  </ComponentLoader>
);

export const SchemaTreeWrapper: React.FC<any> = (props) => (
  <ComponentLoader>
    <LazySchemaTree {...props} />
  </ComponentLoader>
);

export const SmartAuthenticationFlowWrapper: React.FC<any> = (props) => (
  <ComponentLoader>
    <LazySmartAuthenticationFlow {...props} />
  </ComponentLoader>
);

export const AppDebugWrapper: React.FC<any> = (props) => (
  <ComponentLoader>
    <LazyAppDebug {...props} />
  </ComponentLoader>
);
