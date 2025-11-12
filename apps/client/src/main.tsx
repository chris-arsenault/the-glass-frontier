import './debug/trackReact.js';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/app.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Failed to initialise client: root element not found.');
}

const root = createRoot(container);

root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
