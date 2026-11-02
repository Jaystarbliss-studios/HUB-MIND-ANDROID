import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw, CheckCircle2, Cloud, AlertCircle, Database } from 'lucide-react';
import { flushOfflineQueue, getOfflineActionQueue, retryFailedOfflineActions } from '../lib/offlineQueue';

export const SyncStatusIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSynced, setLastSynced] = useState<Date>(new Date());
  const [pendingCount, setPendingCount] = useState<number>(() => getOfflineActionQueue().length);
  const [failedCount, setFailedCount] = useState<number>(() => getOfflineActionQueue().filter(item => item.status === 'failed').length);
  const [showDetails, setShowDetails] = useState<boolean>(false);

  useEffect(() => {
    const refreshCounts = () => {
      const queue = getOfflineActionQueue();
      setPendingCount(queue.length);
      setFailedCount(queue.filter(item => item.status === 'failed').length);
    };
    refreshCounts();

    const handleOnline = () => {
      setIsOnline(true);
      void triggerSync();
    };
    const handleOffline = () => {
      setIsOnline(false);
      refreshCounts();
    };
    const handleQueueChanged = () => refreshCounts();
    const handleSyncStatus = (event: any) => {
      if (event.detail?.status === 'syncing') {
        setIsSyncing(true);
        refreshCounts();
        return;
      }
      setIsSyncing(false);
      refreshCounts();
      if (event.detail?.status === 'synced') setLastSynced(new Date());
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('hubmind:offline-queue-changed', handleQueueChanged);
    window.addEventListener('hubmind:sync-status', handleSyncStatus);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('hubmind:offline-queue-changed', handleQueueChanged);
      window.removeEventListener('hubmind:sync-status', handleSyncStatus);
    };
  }, []);

  const triggerSync = async () => {
    if (!navigator.onLine || isSyncing) return;
    setIsSyncing(true);
    try {
      if ('serviceWorker' in navigator && 'SyncManager' in window) {
        const registration = await navigator.serviceWorker.ready;
        await (registration as any).sync?.register?.('sync-workspace-queue');
      }
      const res = await flushOfflineQueue();
      setPendingCount(res.remaining);
      setFailedCount(getOfflineActionQueue().filter(item => item.status === 'failed').length);
      if (res.remaining === 0) setLastSynced(new Date());
    } catch (e) {
      console.warn('[SyncStatusIndicator] Sync trigger result:', e);
    } finally {
      setIsSyncing(false);
    }
  };

  const retryFailed = async () => {
    if (!navigator.onLine || isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await retryFailedOfflineActions();
      setPendingCount(res.remaining);
      setFailedCount(getOfflineActionQueue().filter(item => item.status === 'failed').length);
      if (res.remaining === 0) setLastSynced(new Date());
    } catch (e) {
      console.warn('[SyncStatusIndicator] Failed-action retry:', e);
    } finally {
      setIsSyncing(false);
    }
  };

  const formattedTime = lastSynced.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="relative inline-block text-left">
      <button
        onClick={() => setShowDetails(!showDetails)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
          !isOnline
            ? 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
            : isSyncing
            ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
            : failedCount > 0
            ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
            : pendingCount > 0
            ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/20'
            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
        }`}
        title="Network & Background Sync Status (Click for details)"
      >
        {!isOnline ? (
          <>
            <WifiOff className="w-3 h-3 text-amber-400" />
            <span>Offline {pendingCount > 0 && `(${pendingCount})`}</span>
          </>
        ) : isSyncing ? (
          <>
            <RefreshCw className="w-3 h-3 text-blue-400 animate-spin" />
            <span>Syncing ({pendingCount})...</span>
          </>
        ) : failedCount > 0 ? (
          <>
            <AlertCircle className="w-3 h-3 text-rose-400" />
            <span>{failedCount} Failed</span>
          </>
        ) : pendingCount > 0 ? (
          <>
            <Database className="w-3 h-3 text-cyan-400" />
            <span>{pendingCount} Queued</span>
          </>
        ) : (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Synced</span>
          </>
        )}
      </button>

      {showDetails && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowDetails(false)}
          />
          <div className="absolute right-0 mt-2 w-64 p-3 bg-slate-900 border border-slate-800 rounded-xl shadow-xl z-50 text-xs space-y-2.5 animate-in fade-in slide-in-from-top-1">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="font-semibold text-slate-200">Local Storage Sync Queue</span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                  isOnline ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                }`}
              >
                {isOnline ? 'Connected' : 'Offline Mode'}
              </span>
            </div>

            <div className="space-y-1.5 text-slate-400">
              <div className="flex justify-between">
                <span>Network state:</span>
                <span className="text-slate-200">{isOnline ? 'Online' : 'Disconnected'}</span>
              </div>
              <div className="flex justify-between">
                <span>Service worker queue:</span>
                <span className={pendingCount > 0 ? 'text-cyan-400 font-semibold' : 'text-slate-200'}>
                  {pendingCount} pending {pendingCount === 1 ? 'action' : 'actions'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Failed actions:</span>
                <span className={failedCount > 0 ? 'text-rose-300 font-semibold' : 'text-slate-200'}>{failedCount}</span>
              </div>
              <div className="flex justify-between">
                <span>Last full sync:</span>
                <span className="text-slate-200">{formattedTime}</span>
              </div>
            </div>

            {failedCount > 0 && (
              <button
                onClick={() => { void retryFailed(); setShowDetails(false); }}
                disabled={!isOnline || isSyncing}
                className="w-full mt-2 flex items-center justify-center gap-1.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-50 text-rose-200 rounded-lg font-medium transition-colors"
              >
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{isSyncing ? 'Retrying failed actions...' : 'Retry failed actions'}</span>
              </button>
            )}
            <button
              onClick={() => {
                void triggerSync();
                setShowDetails(false);
              }}
              disabled={!isOnline || isSyncing}
              className="w-full mt-2 flex items-center justify-center gap-1.5 py-1.5 bg-slate-800 hover:bg-slate-750 disabled:opacity-50 text-slate-200 rounded-lg font-medium transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing Queue...' : 'Force Sync to Firestore'}</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
};
