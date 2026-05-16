// ── John Service Worker v1.0 ──
// Handles: offline caching, push notifications, background sync

const CACHE_NAME = 'john-v1';
const OFFLINE_PAGE = 'john-mobile.html';

// Files to cache for offline use
const PRECACHE = [
  'john-mobile.html',
  'john-billing.html',
  'john-manifest.json',
];

// ── Install ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[John SW] Pre-caching app shell');
      return cache.addAll(PRECACHE);
    }).then(() => self.skipWaiting())
  );
});

// ── Activate ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch (offline-first for app shell, network-first for API) ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Never cache Anthropic API calls
  if (url.hostname === 'api.anthropic.com') {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({
          error: 'offline',
          message: "John is offline right now. Your message will be sent when you reconnect."
        }), { headers: { 'Content-Type': 'application/json' } })
      )
    );
    return;
  }

  // App shell: cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cache successful GET responses
        if (event.request.method === 'GET' && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback
        if (event.request.mode === 'navigate') {
          return caches.match(OFFLINE_PAGE);
        }
        return new Response('Offline', { status: 503 });
      });
    })
  );
});

// ── Push Notifications ──
self.addEventListener('push', event => {
  let data = { title: 'John', body: 'You have a new notification.', type: 'general' };

  if (event.data) {
    try { data = event.data.json(); } catch { data.body = event.data.text(); }
  }

  const options = {
    body: data.body,
    icon: 'john-icon-192.png',
    badge: 'john-badge-72.png',
    vibrate: data.type === 'emergency' ? [200, 100, 200, 100, 200] : [100, 50, 100],
    requireInteraction: data.type === 'emergency',
    tag: data.type || 'general',
    data: { url: data.url || '/john-mobile.html', type: data.type },
    actions: getActions(data.type),
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'John', options)
  );
});

function getActions(type) {
  switch (type) {
    case 'emergency':
      return [
        { action: 'prepare', title: 'Prepare Visit' },
        { action: 'dismiss', title: 'Dismiss' }
      ];
    case 'encouragement':
      return [
        { action: 'view', title: 'View' },
        { action: 'send', title: 'Send to Staff' }
      ];
    case 'prayer':
      return [
        { action: 'review', title: 'Review Requests' },
        { action: 'dismiss', title: 'Later' }
      ];
    case 'report':
      return [
        { action: 'open', title: 'Open Report' },
        { action: 'dismiss', title: 'Dismiss' }
      ];
    default:
      return [{ action: 'open', title: 'Open John' }];
  }
}

// ── Notification click ──
self.addEventListener('notificationclick', event => {
  event.notification.close();

  const { action } = event;
  const data = event.notification.data || {};

  let targetUrl = '/john-mobile.html';

  if (action === 'prepare' || data.type === 'emergency') {
    targetUrl = '/john-mobile.html?action=emergency';
  } else if (action === 'send' || action === 'view') {
    targetUrl = '/john-mobile.html?action=encouragement';
  } else if (action === 'review' || data.type === 'prayer') {
    targetUrl = '/john-mobile.html?action=prayer';
  } else if (data.url) {
    targetUrl = data.url;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Focus existing window if open
      for (const client of clientList) {
        if (client.url.includes('john-mobile') && 'focus' in client) {
          client.postMessage({ action: action, type: data.type });
          return client.focus();
        }
      }
      // Open new window
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

// ── Background Sync ──
self.addEventListener('sync', event => {
  if (event.tag === 'john-send-message') {
    event.waitUntil(syncPendingMessages());
  }
  if (event.tag === 'john-daily-encouragement') {
    event.waitUntil(triggerDailyEncouragement());
  }
});

async function syncPendingMessages() {
  // In production: check IndexedDB for pending messages and retry sending them
  console.log('[John SW] Syncing pending messages...');
  const cache = await caches.open(CACHE_NAME);
  // Flush any queued API calls stored during offline period
}

async function triggerDailyEncouragement() {
  // In production: this would be triggered by a server-sent push at 6:30 AM
  // and deliver the morning encouragement to all staff members
  console.log('[John SW] Triggering daily encouragement delivery...');
}

// ── Periodic background sync (Chrome) ──
self.addEventListener('periodicsync', event => {
  if (event.tag === 'john-morning-check') {
    event.waitUntil(morningCheck());
  }
});

async function morningCheck() {
  // Runs at ~6:30 AM if periodic sync is granted
  // In production: check for emergency prayer requests, prep encouragement
  const now = new Date();
  const hour = now.getHours();
  if (hour === 6 || hour === 7) {
    await self.registration.showNotification('Good morning, John is ready', {
      body: 'Your staff encouragement is drafted. 2 prayer requests need review.',
      icon: 'john-icon-192.png',
      tag: 'morning-brief',
      requireInteraction: false,
    });
  }
}

console.log('[John SW] Service worker loaded · Version 1.0');
