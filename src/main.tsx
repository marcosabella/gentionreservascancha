import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import LocalUpdateNotice from './components/LocalUpdateNotice';
import { ThemeProvider } from './config/ThemeContext';
import './index.css';
import { complexName } from './config/complex';

document.title = `${complexName} - Sistema de Reservas`;
document.documentElement.lang = 'es';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
    <LocalUpdateNotice />
    <App />
    </ThemeProvider>
  </StrictMode>
);
