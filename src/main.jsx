import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { isNative } from './services/platform';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

// Registered only in production builds — in dev this would fight Vite's own
// module server and cache stale modules across HMR reloads.
//
// And never in the native shell. There the assets are already on the device, so a worker
// that exists to make them available offline has nothing to add — it would only insert a
// cache between the app and files it already owns, which is a way to serve a stale bundle
// after an App Store update and nothing else.
if (import.meta.env.PROD && 'serviceWorker' in navigator && !isNative()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
