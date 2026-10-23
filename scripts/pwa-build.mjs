export function pwaManifest(brand) {
  const puraVida = brand.toUpperCase() === 'PURA VIDA';
  const id = puraVida ? 'pura-vida' : 'padel-center';
  const name = puraVida ? 'Pura Vida' : 'Padel Center';
  return {
    id: './', name: `${name} · Reservas`, short_name: name, description: `Reservas, movimientos y cuenta del jugador de ${name}.`,
    lang: 'es-AR', start_url: './', scope: './', display: 'standalone',
    background_color: '#f8fafc', theme_color: '#166534', prefer_related_applications: false,
    icons: [192, 512].map(size => ({ src: `./pwa/${id}-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any maskable' })),
  };
}

export function pwaWorker(brand) {
  const name = brand.toUpperCase() === 'PURA VIDA' ? 'Pura Vida' : 'Padel Center';
  const offline = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name} · Sin conexión</title><style>body{margin:0;padding:24px;min-height:85vh;display:grid;place-items:center;background:#f8fafc;color:#17251e;font:16px system-ui}main{max-width:420px;padding:24px;background:white;border:1px solid #d1d5db;border-radius:16px}h1{font-size:24px}p{line-height:1.6}a{display:inline-block;margin-top:12px;padding:12px 18px;border-radius:8px;background:#166534;color:white;text-decoration:none}</style></head><body><main><h1>Necesitás conexión a Internet</h1><p>Conectate para ver tus reservas y movimientos o realizar operaciones en ${name}.</p><a href="./">Volver a intentar</a></main></body></html>`;
  return `// Navigation is always requested from the network. No account or reservation data is cached.
self.addEventListener('install', event => { event.waitUntil(self.skipWaiting()); });
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request, { cache: 'no-store' }).catch(() => new Response(${JSON.stringify(offline)}, {
    status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
  })));
});
`;
}

export default function pwaBuild(brand) {
  const manifest = pwaManifest(brand);
  const id = brand.toUpperCase() === 'PURA VIDA' ? 'pura-vida' : 'padel-center';
  return {
    name: 'complex-installable-app', apply: 'build',
    transformIndexHtml() {
      return [
        { tag: 'link', attrs: { rel: 'manifest', href: './manifest.json' }, injectTo: 'head' },
        { tag: 'link', attrs: { rel: 'apple-touch-icon', href: `./pwa/${id}-180.png` }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'theme-color', content: manifest.theme_color }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'apple-mobile-web-app-capable', content: 'yes' }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'apple-mobile-web-app-title', content: manifest.short_name }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'apple-mobile-web-app-status-bar-style', content: 'default' }, injectTo: 'head' },
      ];
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.json', source: JSON.stringify(manifest, null, 2) + '\n' });
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: pwaWorker(brand) });
    },
  };
}
