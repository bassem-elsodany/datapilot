
import React from 'react';
import { createRoot } from 'react-dom/client'

// 👇 Import the mantine-core layer CSS file;
import '@mantine/core/styles.layer.css';

// 👇 Import the mantine-datatable layer CSS file;
//    this will automatically place it in a `mantine-datatable` layer
import 'mantine-datatable/styles.layer.css';

// 👇 Import the mantine-contextmenu layer CSS file;
//    this will automatically place it in a `mantine-contextmenu` layer
import 'mantine-contextmenu/styles.layer.css';


import './assets/css/index.css'
import App from './App.tsx'

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

const root = createRoot(rootElement);

root.render(
  <App />
);
