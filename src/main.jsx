import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';
import { registerServiceWorker } from './app/pwa.js';
import './styles/app.css';

registerServiceWorker();
document.addEventListener('gesturestart', (event) => event.preventDefault());

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
