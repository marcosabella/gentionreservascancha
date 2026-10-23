import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import LocalUpdateNotice from './components/LocalUpdateNotice';
import './index.css';
import { complexName } from './config/complex';

document.title = `${complexName} - Sistema de Reservas`;
document.documentElement.lang = 'es';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocalUpdateNotice />
    <App />
  </StrictMode>
);
