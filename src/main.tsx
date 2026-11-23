import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import 'katex/dist/katex.min.css';
import { initAnalytics, initPerformance } from './services/analyticsService';

// Inicializace Firebase Analytics a Performance Monitoring při startu aplikace
initAnalytics().catch(console.warn);
initPerformance();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
