import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import { setUpNativeChrome } from './platform/nativeChrome.js';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Inside the iOS and Android apps: status bar, splash screen and CSS hooks. Does nothing on the web.
setUpNativeChrome();
