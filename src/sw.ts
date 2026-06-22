const sw = self as unknown as ServiceWorkerGlobalScope;

sw.addEventListener('install', (event: ExtendableEvent) => {
    event.waitUntil(sw.skipWaiting());
});

sw.addEventListener('activate', (event: ExtendableEvent) => {
    event.waitUntil((async () => {
        await sw.clients.claim();

        const names = await caches.keys();
        await Promise.all(names.map(name => caches.delete(name)));
        await sw.registration.unregister();

        const clients = await sw.clients.matchAll({ type: 'window' });
        await Promise.all(clients.map(client => client.navigate(client.url)));
    })());
});

sw.addEventListener('fetch', (event: FetchEvent) => {
    event.respondWith(fetch(event.request));
});
