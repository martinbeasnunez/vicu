// Vicu Service Worker for Web Push Notifications
// This service worker handles push notifications and notification clicks

self.addEventListener('push', (event) => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    console.error('Error parsing push data:', e);
  }

  const title = data.title || 'Vicu';
  const body = data.body || 'Es un buen momento para avanzar en uno de tus objetivos.';
  const url = data.url || '/hoy';

  const options = {
    body,
    icon: '/vicu-logo.png',
    badge: '/vicu-logo.png',
    data: { url },
    vibrate: [100, 50, 100],
    requireInteraction: false,
    tag: 'vicu-reminder', // Prevents duplicate notifications
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/hoy';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Check if there's already a window open with this URL
      for (const client of windowClients) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      // If no window is open, open a new one
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// Handle service worker installation
self.addEventListener('install', (event) => {
  console.log('Vicu service worker installed');
  self.skipWaiting();
});

// Handle service worker activation
self.addEventListener('activate', (event) => {
  console.log('Vicu service worker activated');
  event.waitUntil(clients.claim());
});
