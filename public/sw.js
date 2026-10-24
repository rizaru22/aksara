self.addEventListener('install', (event) => {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

function openPushState() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('aksara-push-state', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('state');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getUnreadCount() {
    const db = await openPushState();
    return new Promise((resolve, reject) => {
        const request = db.transaction('state').objectStore('state').get('unread-count');
        request.onsuccess = () => resolve(Number(request.result || 0));
        request.onerror = () => reject(request.error);
    });
}

async function setUnreadCount(count) {
    const db = await openPushState();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('state', 'readwrite');
        transaction.objectStore('state').put(Math.max(0, Number(count) || 0), 'unread-count');
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
    });
}

async function broadcastUnreadCount() {
    const count = await getUnreadCount();
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    windows.forEach((client) => client.postMessage({ type: 'aksara:unread-count', count }));
    return count;
}

self.addEventListener('push', (event) => {
    
    let payload = {};
    try {
        payload = event.data ? event.data.json() : {};
    } catch (_) {
        payload = { body: event.data?.text() || '' };
    }

    console.log('[AKSARA Push] Payload:', payload);
    console.log('[AKSARA Push] Title:', payload.title);
    console.log('[AKSARA Push] Body:', payload.body);
    const title = payload.title || 'Pengingat AKSARA';
    const options = {
        body: payload.body || 'Anda memiliki pengingat baru.',
        icon: payload.icon || '/favicon.ico',
        badge: payload.badge || '/favicon.ico',
        tag: payload.tag || 'aksara-reminder',
        data: payload.data || { url: '/dashboard.html' },
        requireInteraction: true,
    };

    event.waitUntil((async () => {
        const count = await getUnreadCount() + 1;
        await setUnreadCount(count);
        console.log('[AKSARA Push] Options:', options);
        await self.registration.showNotification(title, options);
        const notifications = await self.registration.getNotifications();
        console.log(
            '[AKSARA Push] Notifikasi aktif:',
            notifications.map((n) => ({
                title: n.title,
                body: n.body,
                tag: n.tag,
            }))
        );
        console.log('[AKSARA Push] showNotification selesai');
        await broadcastUnreadCount();
    })());
});

self.addEventListener('message', (event) => {
    if (event.data?.type === 'aksara:get-unread-count') {
        event.waitUntil(broadcastUnreadCount());
    }
    if (event.data?.type === 'aksara:mark-notifications-read') {
        event.waitUntil(setUnreadCount(0).then(broadcastUnreadCount));
    }
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const target = new URL(event.notification.data?.url || '/dashboard.html', self.location.origin).href;
    event.waitUntil((async () => {
        await setUnreadCount(0);
        await broadcastUnreadCount();
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of windows) {
            if ('focus' in client) {
                if ('navigate' in client && client.url !== target) await client.navigate(target);
                return client.focus();
            }
        }
        return self.clients.openWindow(target);
    })());
});
