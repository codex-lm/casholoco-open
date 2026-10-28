import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';
import { initConnection } from './api';
import { getState } from './store';
import { applyDocumentLang } from './i18n';
import { setUiLang } from './i18n';
import { loadLang } from './i18n/detect';

function boot() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('lang') !== 'fr' && params.get('lang') !== 'en' && !loadLang()) setUiLang('fr');
  applyDocumentLang(getState().lang);
  initConnection();
  const root = document.getElementById('root');
  if (root) {
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  }
}

boot();
