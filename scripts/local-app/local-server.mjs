import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { extname, join } from 'node:path';
import { createUpdater } from './updater.mjs';
import { validPublicPath } from './release-manifest.mjs';

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webp': 'image/webp' };

export async function startLocalServer({ root, port = 8080, startupUpdate = true, ...updaterOptions }) {
  const updater = await createUpdater({ root, ...updaterOptions });
  const token = randomBytes(32).toString('hex');
  const publicStatus = () => ({ ...updater.status(), token });
  const json = (response, code, value) => {
    response.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(JSON.stringify(value));
  };
  if (startupUpdate) await updater.check({ autoApply: true, force: true });
  let actualPort = port;
  const server = createServer(async (request, response) => {
    const host = request.headers.host;
    if (![ `localhost:${actualPort}`, `127.0.0.1:${actualPort}` ].includes(host)) { response.writeHead(403).end(); return; }
    try {
      const url = new URL(request.url, `http://${host}`);
      if (url.pathname.startsWith('/__local-update/')) {
        if (url.pathname === '/__local-update/status' && request.method === 'GET') { json(response, 200, publicStatus()); return; }
        if (request.method !== 'POST') { json(response, 405, { error: 'Método no permitido.' }); return; }
        if (request.headers.origin !== `http://${host}` || request.headers['x-local-update-token'] !== token
          || request.headers['content-type'] !== 'application/json') { json(response, 403, { error: 'La actualización debe iniciarse desde la app local.' }); return; }
        let body = '';
        for await (const chunk of request) {
          body += chunk;
          if (body.length > 1024) { json(response, 413, { error: 'Solicitud demasiado grande.' }); return; }
        }
        const input = JSON.parse(body || '{}');
        if (url.pathname === '/__local-update/check') {
          await updater.check({ force: true }); json(response, 200, publicStatus()); return;
        }
        if (url.pathname === '/__local-update/apply') {
          const result = await updater.apply(input.version);
          json(response, result ? 200 : 409, publicStatus()); return;
        }
        json(response, 404, { error: 'Acción inexistente.' }); return;
      }
      if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
      const pathname = decodeURIComponent(url.pathname);
      const isDocument = pathname === '/' || !extname(pathname) || pathname.endsWith('/index.html');
      if (isDocument) await updater.check({ autoApply: true });
      const filePath = isDocument ? '/index.html' : pathname;
      if (!validPublicPath(filePath)) { response.writeHead(404).end(); return; }
      const releases = updater.releases();
      // Old hashed assets remain available to tabs opened before the update.
      const release = releases.find(item => item.manifest.files.some(file => file.path === filePath));
      if (!release) { response.writeHead(404).end(); return; }
      response.writeHead(200, { 'Content-Type': types[extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Local-App-Version': release.manifest.version });
      if (request.method === 'HEAD') { response.end(); return; }
      createReadStream(join(release.directory, filePath.slice(1))).on('error', () => response.destroy()).pipe(response);
    } catch {
      if (!response.headersSent) json(response, 400, { error: 'No se pudo procesar la solicitud.' });
      else response.destroy();
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => { actualPort = server.address().port; resolve(); });
  });
  return { server, updater, url: `http://127.0.0.1:${actualPort}`, close: () => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeIdleConnections();
  }) };
}
