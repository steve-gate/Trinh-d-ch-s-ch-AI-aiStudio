// Protect window.fetch from reassignment by third-party libraries
if (typeof window !== 'undefined') {
  try {
    const originalFetch = window.fetch;
    if (originalFetch) {
      Object.defineProperty(window, 'fetch', {
        get: () => originalFetch,
        set: () => {
          console.warn('Blocking attempt to overwrite window.fetch');
        },
        configurable: true
      });
    }
  } catch (e) {
    // Already protected or environment doesn't allow re-definition
  }
}

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
