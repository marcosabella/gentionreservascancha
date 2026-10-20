import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8080);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };
const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let path = resolve(root, '.' + pathname);
    const location = relative(root, path);
    if (location.startsWith('..') || location.includes(':')) { response.writeHead(403).end(); return; }
    let info = await stat(path).catch(() => null);
    if (info?.isDirectory()) { path = resolve(path, 'index.html'); info = await stat(path).catch(() => null); }
    if (!info?.isFile()) {
      if (extname(pathname)) { response.writeHead(404).end(); return; }
      path = resolve(root, 'index.html');
    }
    response.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    if (request.method === 'HEAD') { response.end(); return; }
    createReadStream(path).on('error', () => response.destroy()).pipe(response);
  } catch { response.writeHead(400).end(); }
});
server.on('error', error => { console.error('No se pudo iniciar: ' + error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => {
  console.log('PADEL CENTER - http://localhost:' + port);
  console.log('Abra esa direccion en el navegador. Mantenga esta ventana abierta.');
  console.log('Internet requerido: conectado a la base real de Padel Center.');
});
