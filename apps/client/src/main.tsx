import './debug/trackReact.js';
import { CssBaseline, ThemeProvider } from '@mui/material';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { App } from './App';
import { glassFrontierTheme } from './theme';
import './styles/app.css';
import './styles/chipButton.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Failed to initialise client: root element not found.');
}

const root = createRoot(container);

root.render(
  <React.StrictMode>
    <ThemeProvider theme={glassFrontierTheme}>
      <CssBaseline />
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);
