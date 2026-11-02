import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initializeFirebaseConfig } from './firebaseConfig';
import './index.css';

// Handle dynamic import / vite chunk preload errors gracefully
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    if (!sessionStorage.getItem('hubmind_chunk_preload_reload')) {
      sessionStorage.setItem('hubmind_chunk_preload_reload', 'true');
      window.location.reload();
    }
  });
}

const removeSplash = () => {
  const splash = document.getElementById('pwa-splash');
  if (splash) {
    splash.style.opacity = '0';
    setTimeout(() => {
      if (splash.parentNode) splash.parentNode.removeChild(splash);
    }, 500);
  }
};

const rootElement = document.getElementById('root')!;
const root = createRoot(rootElement);

async function bootstrap() {
  try {
    // Load browser configuration before importing App. This keeps all Firebase
    // configuration out of Vite's static module graph and deployed JS bundles.
    await initializeFirebaseConfig();

    const { default: App } = await import('./App.tsx');

    root.render(
      <StrictMode>
        <App />
      </StrictMode>
    );

    setTimeout(removeSplash, 100);
  } catch (error) {
    console.error('[HubMind] Bootstrap failed:', error);
    root.render(
      <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 text-slate-200 p-6">
        <div className="max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-7 text-center">
          <h1 className="text-lg font-bold text-white mb-2">Hub-Mind could not start</h1>
          <p className="text-sm text-slate-400">
            Runtime configuration could not be loaded. Refresh the page and try again.
          </p>
        </div>
      </div>
    );
  }
}

void bootstrap();
