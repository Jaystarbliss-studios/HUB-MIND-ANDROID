// Hub-Mind Service Worker Offline Sync Companion
const SYNC_CHANNEL_NAME = 'hubmind_sw_offline_sync';
let syncBroadcastChannel = null;

try {
  if (typeof BroadcastChannel !== 'undefined') {
    syncBroadcastChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);
  }
} catch (e) {
  // Ignore BroadcastChannel errors in SW context
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'QUEUE_UPDATED') {
    // Record queue count in Service Worker cache or state
    console.log('[SW] Offline actions queue updated. Items pending:', event.data.count);
  }
  if (event.data && event.data.type === 'TRIGGER_SYNC') {
    broadcastSyncTrigger();
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-workspace-queue' || event.tag === 'task-sync-queue' || event.tag === 'document-sync-queue') {
    event.waitUntil(broadcastSyncTrigger());
  }
});

async function broadcastSyncTrigger() {
  if (syncBroadcastChannel) {
    syncBroadcastChannel.postMessage({ type: 'TRIGGER_SYNC', timestamp: Date.now() });
  }
  const allClients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  for (const client of allClients) {
    client.postMessage({ type: 'TRIGGER_SYNC', timestamp: Date.now() });
  }
}
