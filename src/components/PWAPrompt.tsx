import React, { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { X, Download, Smartphone } from 'lucide-react';
import { useAuth } from '../lib/auth';

export function PWAPrompt() {
  const { user } = useAuth();
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered() {
      // Service worker registered
    },
    onRegisterError(error) {
      console.log('SW registration error', error);
    },
  });

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    // Check if iOS
    const isIosDevice = /ipad|iphone|ipod/.test(navigator.userAgent.toLowerCase()) && !(window as any).MSStream;
    setIsIOS(isIosDevice);

    // Check if standalone (already installed)
    const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone || document.referrer.includes('android-app://');
    setIsStandalone(isStandaloneMode);

    const handleBeforeInstallPrompt = (e: Event) => {
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [user]);

  // Keep installed PWAs current too. iOS Safari can keep a standalone PWA alive for a long time,
  // so waiting for a normal page refresh is not enough. Ask the active registration to check
  // for a new service worker when the app becomes visible and periodically while it is open.
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const checkForUpdate = async () => {
      if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
      try {
        const registration = await navigator.serviceWorker.ready;
        if (cancelled) return;
        await registration.update();
      } catch (error) {
        console.debug('Hub-Mind update check note:', error);
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void checkForUpdate();
    };

    void checkForUpdate();
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);
    timer = window.setInterval(checkForUpdate, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
      if (timer) window.clearInterval(timer);
    };
  }, []);

  // Once a new service worker is detected, activate it and reload automatically.
  // This means an installed iPhone PWA is not left running on an old build indefinitely.
  useEffect(() => {
    if (!needRefresh || updating) return;
    setUpdating(true);
    updateServiceWorker(true).catch((error) => {
      console.error('Hub-Mind automatic update failed:', error);
      setUpdating(false);
    });
  }, [needRefresh, updating, updateServiceWorker]);

  useEffect(() => {
    // Trigger prompt when user is logged in, not standalone, and we have the deferredPrompt or are on iOS
    if (user && !isStandalone) {
      if (isIOS || deferredPrompt) {
        setShowInstallPrompt(true);

        // Also trigger a browser notification as requested
        if ('Notification' in window) {
          Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
              const hasNotified = sessionStorage.getItem('pwaNotified');
              if (!hasNotified) {
                const notification = new Notification('Add Hub-Mind to Home Screen', {
                  body: 'Click here to easily access Hub-Mind directly from your device.',
                  icon: '/icon-192x192.png',
                  requireInteraction: true
                });
                
                notification.onclick = () => {
                  window.focus();
                  if (deferredPrompt) {
                    deferredPrompt.prompt();
                    deferredPrompt.userChoice.then((choiceResult: any) => {
                      if (choiceResult.outcome === 'accepted') {
                        setShowInstallPrompt(false);
                      }
                      setDeferredPrompt(null);
                    });
                  }
                  notification.close();
                };
                sessionStorage.setItem('pwaNotified', 'true');
              }
            }
          });
        }
      }
    } else {
      setShowInstallPrompt(false);
    }
  }, [user, deferredPrompt, isStandalone, isIOS]);

  const closePrompt = () => {
    setShowInstallPrompt(false);
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    setDeferredPrompt(null);
    setShowInstallPrompt(false);
  };

  if (isStandalone) return null;

  return (
    <>
      {/* Update Prompt */
      (offlineReady || needRefresh) && (
        <div className="fixed bottom-4 right-4 z-[100] bg-slate-800 border border-slate-700 rounded-xl p-4 shadow-2xl max-w-sm w-[calc(100%-2rem)] flex flex-col gap-3 animate-in slide-in-from-bottom-5">
          <div className="flex justify-between items-start gap-4">
            <div>
              <h3 className="font-semibold text-white">
                {offlineReady ? 'App ready to work offline' : 'New version available'}
              </h3>
              <p className="text-sm text-slate-300 mt-1">
                {offlineReady 
                  ? 'Hub-Mind is now cached for offline use.' 
                  : 'A new update is available. Reload to update.'}
              </p>
            </div>
            <button onClick={closePrompt} className="text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
          {needRefresh && (
            <button 
              onClick={() => updateServiceWorker(true)}
              className="w-full bg-accent hover:bg-accent/90 text-slate-950 font-semibold py-2 rounded-lg transition-colors"
            >
              Reload and Update
            </button>
          )}
        </div>
      )}

      {/* Prominent Modal for Install */
      showInstallPrompt && (deferredPrompt || isIOS) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
            <div className="relative h-32 bg-gradient-to-br from-accent/20 to-slate-800 flex items-center justify-center border-b border-slate-800">
              <div className="absolute top-4 right-4">
                <button onClick={closePrompt} className="bg-slate-900/50 hover:bg-slate-900 text-slate-400 hover:text-white rounded-full p-2 backdrop-blur transition-all">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center shadow-lg border border-slate-700">
                 {isIOS ? <Smartphone className="w-8 h-8 text-accent" /> : <Download className="w-8 h-8 text-accent" />}
              </div>
            </div>
            
            <div className="p-6">
              <h3 className="text-xl font-bold text-white mb-2 text-center">
                Install Hub-Mind
              </h3>
              <p className="text-slate-300 text-center mb-6">
                Add Hub-Mind to your home screen for a seamless full-screen experience, offline access, and quick launching.
              </p>

              {isIOS ? (
                <div className="bg-slate-950 rounded-xl p-4 text-sm text-slate-200 flex flex-col gap-3 border border-slate-800">
                  <p className="text-slate-400 font-medium mb-1">To install on iOS:</p>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-6 h-6 rounded bg-slate-800 text-xs font-bold text-slate-400 shrink-0">1</span>
                    <span>Tap the <b className="text-white">Share</b> icon at the bottom of Safari</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-6 h-6 rounded bg-slate-800 text-xs font-bold text-slate-400 shrink-0">2</span>
                    <span>Scroll down and tap <b className="text-white">Add to Home Screen</b></span>
                  </div>
                </div>
              ) : (
                <button 
                  onClick={handleInstallClick}
                  className="w-full bg-accent hover:bg-accent-hover text-slate-950 font-bold py-3 px-4 rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-accent/20"
                >
                  Add to Home Screen
                </button>
              )}
              
              <button 
                onClick={closePrompt}
                className="w-full mt-3 py-2 text-slate-400 hover:text-slate-300 font-medium transition-colors"
              >
                Not right now
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
