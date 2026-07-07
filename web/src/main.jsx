// D3WEBGPU Phase 2 — React entry. Importing the polyfills module installs the
// TextDecoder resizable-heap polyfill as a side effect (must run before the
// Emscripten engine touches the heap).
import './d3/polyfills.js';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);